import asyncio
import json
import os
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ai import build_context_messages, stream_completion
from ai_config import is_ai_configured, load_ai_config
from models import AiThread, ContextEntry, Note, Question, Task
from store import FileStore

VAULT_PATH = os.environ.get("ADHDEEZ_VAULT", str(Path.home() / ".adhdeez"))
store = FileStore(VAULT_PATH)

app = FastAPI(title="adhdeez")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "tauri://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- SSE ---

sse_clients: set[asyncio.Queue] = set()
active_ai_tasks: dict[str, asyncio.Task] = {}


async def broadcast(event_type: str, data: dict):
    payload = f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"
    disconnected = []
    for q in sse_clients:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            disconnected.append(q)
    for q in disconnected:
        sse_clients.discard(q)


async def _sse_generator(queue: asyncio.Queue, request: Request):
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield msg
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        sse_clients.discard(queue)


@app.get("/events")
def sse_events(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)
    sse_clients.add(queue)
    return StreamingResponse(
        _sse_generator(queue, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- Request Models ---


class CreateNoteRequest(BaseModel):
    title: str
    body: str = ""
    note_type: str | None = None
    status: str = "active"
    parent: str | None = None
    deadline: str | None = None


class UpdateNoteRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    note_type: str | None = None
    status: str | None = None
    parent: str | None = None
    deadline: str | None = None


class CreateTaskRequest(BaseModel):
    title: str
    body: str = ""
    status: str = "open"
    loe: str | None = None
    deadline: str | None = None
    note_id: str | None = None


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    status: str | None = None
    loe: str | None = None
    deadline: str | None = None
    note_id: str | None = None


class CreateQuestionRequest(BaseModel):
    question: str
    note_id: str | None = None


class UpdateQuestionRequest(BaseModel):
    question: str | None = None
    answer: str | None = None
    notes: str | None = None
    status: str | None = None


class ContextPushRequest(BaseModel):
    type: str = "task"  # note | task | question
    ref_id: str
    reason: str = ""
    memo_for_current: str | None = None


class ContextMemoRequest(BaseModel):
    memo: str


class CreateAiThreadRequest(BaseModel):
    note_id: str
    action: str = "elaborate"
    prompt: str = ""
    selection_text: str = ""
    anchor_from: int = 0
    anchor_to: int = 0


class UpdateAiThreadRequest(BaseModel):
    status: str | None = None
    response: str | None = None


class AiStreamRequest(BaseModel):
    action: str = "freeform"  # research | brainstorm | breakdown | freeform
    prompt: str
    note_id: str | None = None
    selection: str | None = None
    cursor_context: str | None = None


# --- Focus ---


def _serialize_suggestions(suggestions: list[dict]) -> list[dict]:
    result = []
    for s in suggestions:
        item: dict = {"type": s["type"], "reason": s["reason"]}
        if s["type"] == "task":
            item["task"] = asdict(s["task"])
        elif s["type"] == "note":
            item["note"] = asdict(s["note"])
        result.append(item)
    return result


@app.get("/focus")
def get_focus(energy: str | None = None):
    top = store.context_peek()
    if top:
        task = None
        note = None
        question = None

        if top.type == "task":
            task = store.get_task(top.ref_id, track_view=True)
            if not task or task.status != "open":
                store.context_pop()
                return get_focus(energy)
        elif top.type == "note":
            note = store.get_note(top.ref_id, track_view=True)
            if not note or note.status not in ("active", "paused"):
                store.context_pop()
                return get_focus(energy)
        elif top.type == "question":
            question = store.get_question(top.ref_id)
            if not question or question.status != "open":
                store.context_pop()
                return get_focus(energy)

        suggestions = store.suggest(skip_ids=[top.ref_id], energy=energy)
        return {
            "state": "focused",
            "context": {
                "type": top.type,
                "ref_id": top.ref_id,
                "reason": top.reason,
                "memo": top.memo,
                "pushed_at": top.pushed_at.isoformat(),
            },
            "task": asdict(task) if task else None,
            "note": asdict(note) if note else None,
            "question": asdict(question) if question else None,
            "stack_depth": len(store.context_stack),
            "suggestions": _serialize_suggestions(suggestions),
        }

    suggestions = store.suggest(energy=energy)
    if not suggestions:
        return {"state": "empty", "suggestions": []}

    return {
        "state": "suggesting",
        "suggestions": _serialize_suggestions(suggestions),
    }


# --- Context Stack ---


@app.get("/context")
def get_context():
    stack = store.context_get()
    result = []
    for entry in stack:
        item = {
            "type": entry.type,
            "ref_id": entry.ref_id,
            "reason": entry.reason,
            "memo": entry.memo,
            "pushed_at": entry.pushed_at.isoformat(),
        }
        if entry.type == "task":
            task = store.get_task(entry.ref_id)
            item["task"] = asdict(task) if task else None
        elif entry.type == "note":
            note = store.get_note(entry.ref_id)
            item["note"] = asdict(note) if note else None
        elif entry.type == "question":
            question = store.get_question(entry.ref_id)
            item["question"] = asdict(question) if question else None
        result.append(item)
    return result


@app.post("/context/push")
def push_context(req: ContextPushRequest, background_tasks: BackgroundTasks):
    if req.memo_for_current:
        store.context_set_memo(req.memo_for_current)
    entry = ContextEntry(
        type=req.type,
        ref_id=req.ref_id,
        reason=req.reason,
        pushed_at=datetime.now(),
    )
    store.context_push(entry)
    focus = get_focus()
    background_tasks.add_task(broadcast, "focus.updated", focus)
    return focus


@app.post("/context/memo")
def set_context_memo(req: ContextMemoRequest, background_tasks: BackgroundTasks):
    store.context_set_memo(req.memo)
    focus = get_focus()
    background_tasks.add_task(broadcast, "focus.updated", focus)
    return focus


@app.post("/context/pop")
def pop_context(background_tasks: BackgroundTasks):
    popped = store.context_pop()
    focus = get_focus()
    if popped:
        focus["popped"] = {
            "type": popped.type,
            "ref_id": popped.ref_id,
            "reason": popped.reason,
            "memo": popped.memo,
        }
    background_tasks.add_task(broadcast, "focus.updated", focus)
    return focus


@app.delete("/context/{ref_id}")
def remove_context(ref_id: str, background_tasks: BackgroundTasks):
    store.context_remove(ref_id)
    focus = get_focus()
    background_tasks.add_task(broadcast, "focus.updated", focus)
    return focus


# --- Notes ---


@app.get("/notes")
def list_notes(
    note_type: str | None = None,
    status: str | None = None,
    parent: str | None = None,
    search: str | None = None,
):
    results = store.query_notes(note_type=note_type, status=status, parent=parent, search=search)
    return [asdict(n) for n in results]


@app.get("/notes/{note_id}")
def get_note(note_id: str):
    note = store.get_note(note_id, track_view=True)
    if not note:
        raise HTTPException(404, "not found")
    return asdict(note)


@app.get("/notes/{note_id}/children")
def get_note_children(note_id: str):
    if not store.get_note(note_id):
        raise HTTPException(404, "note not found")
    return [asdict(n) for n in store.note_children(note_id)]


@app.get("/notes/{note_id}/tasks")
def get_note_tasks(note_id: str):
    if not store.get_note(note_id):
        raise HTTPException(404, "note not found")
    return [asdict(t) for t in store.note_tasks(note_id)]


@app.get("/notes/{note_id}/questions")
def get_note_questions(note_id: str):
    if not store.get_note(note_id):
        raise HTTPException(404, "note not found")
    return [asdict(q) for q in store.note_questions(note_id)]


@app.post("/notes")
def create_note(req: CreateNoteRequest, background_tasks: BackgroundTasks):
    deadline = None
    if req.deadline:
        try:
            deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    note = Note(
        id="",
        title=req.title,
        body=req.body,
        note_type=req.note_type,
        status=req.status,
        parent=req.parent,
        deadline=deadline,
    )
    created = store.create_note(note)
    background_tasks.add_task(broadcast, "note.created", asdict(created))
    background_tasks.add_task(broadcast, "focus.updated", get_focus())
    return asdict(created)


@app.patch("/notes/{note_id}")
def update_note(note_id: str, req: UpdateNoteRequest, background_tasks: BackgroundTasks):
    note = store.get_note(note_id)
    if not note:
        raise HTTPException(404, "not found")
    if req.title is not None:
        note.title = req.title
    if req.body is not None:
        note.body = req.body
    if req.note_type is not None:
        note.note_type = req.note_type
    if req.status is not None:
        note.status = req.status
    if req.parent is not None:
        note.parent = req.parent
    if req.deadline is not None:
        try:
            note.deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    updated = store.update_note(note)
    background_tasks.add_task(broadcast, "note.updated", asdict(updated))
    background_tasks.add_task(broadcast, "focus.updated", get_focus())
    return asdict(updated)


@app.delete("/notes/{note_id}")
def delete_note(note_id: str, background_tasks: BackgroundTasks):
    if not store.delete_note(note_id):
        raise HTTPException(404, "not found")
    background_tasks.add_task(broadcast, "note.deleted", {"id": note_id})
    return {"ok": True}


# --- Tasks ---


@app.get("/tasks")
def list_tasks(
    status: str | None = None,
    loe: str | None = None,
    note_id: str | None = None,
    search: str | None = None,
):
    results = store.query_tasks(status=status, loe=loe, note_id=note_id, search=search)
    return [asdict(t) for t in results]


@app.get("/tasks/{task_id}")
def get_task(task_id: str):
    task = store.get_task(task_id, track_view=True)
    if not task:
        raise HTTPException(404, "not found")
    return asdict(task)


@app.post("/tasks")
def create_task(req: CreateTaskRequest, background_tasks: BackgroundTasks):
    deadline = None
    if req.deadline:
        try:
            deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    task = Task(
        id="",
        title=req.title,
        body=req.body,
        status=req.status,
        loe=req.loe,
        deadline=deadline,
        note_id=req.note_id,
    )
    created = store.create_task(task)
    background_tasks.add_task(broadcast, "task.created", asdict(created))
    return asdict(created)


@app.patch("/tasks/{task_id}")
def update_task(task_id: str, req: UpdateTaskRequest, background_tasks: BackgroundTasks):
    task = store.get_task(task_id)
    if not task:
        raise HTTPException(404, "not found")
    if req.title is not None:
        task.title = req.title
    if req.body is not None:
        task.body = req.body
    if req.status is not None:
        task.status = req.status
        if req.status == "done":
            task.completed_at = datetime.now()
        elif req.status == "open":
            task.completed_at = None
    if req.loe is not None:
        task.loe = req.loe
    if req.deadline is not None:
        try:
            task.deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    if req.note_id is not None:
        task.note_id = req.note_id
    updated = store.update_task(task)
    background_tasks.add_task(broadcast, "task.updated", asdict(updated))
    return asdict(updated)


@app.delete("/tasks/{task_id}")
def delete_task(task_id: str, background_tasks: BackgroundTasks):
    if not store.delete_task(task_id):
        raise HTTPException(404, "not found")
    background_tasks.add_task(broadcast, "task.deleted", {"id": task_id})
    return {"ok": True}


# --- Questions ---


@app.get("/questions")
def list_questions(note_id: str | None = None, status: str | None = None, search: str | None = None):
    if note_id:
        results = store.note_questions(note_id)
    else:
        results = list(store.questions.values())
    if status:
        results = [q for q in results if q.status == status]
    if search:
        needle = search.lower()
        results = [q for q in results if needle in q.question.lower() or needle in (q.notes or "").lower()]
    return [asdict(q) for q in results]


@app.get("/questions/{question_id}")
def get_question(question_id: str):
    q = store.get_question(question_id)
    if not q:
        raise HTTPException(404, "not found")
    return asdict(q)


@app.post("/questions")
def create_question(req: CreateQuestionRequest, background_tasks: BackgroundTasks):
    q = Question(id="", question=req.question, note_id=req.note_id)
    created = store.create_question(q)
    background_tasks.add_task(broadcast, "question.created", asdict(created))
    return asdict(created)


@app.patch("/questions/{question_id}")
def update_question(question_id: str, req: UpdateQuestionRequest, background_tasks: BackgroundTasks):
    q = store.get_question(question_id)
    if not q:
        raise HTTPException(404, "not found")
    if req.question is not None:
        q.question = req.question
    if req.answer is not None:
        q.answer = req.answer
    if req.notes is not None:
        q.notes = req.notes
    if req.status is not None:
        q.status = req.status
    updated = store.update_question(q)
    background_tasks.add_task(broadcast, "question.updated", asdict(updated))
    return asdict(updated)


@app.delete("/questions/{question_id}")
def delete_question(question_id: str, background_tasks: BackgroundTasks):
    if not store.delete_question(question_id):
        raise HTTPException(404, "not found")
    background_tasks.add_task(broadcast, "question.deleted", {"id": question_id})
    return {"ok": True}


# --- AI Threads ---


@app.get("/notes/{note_id}/ai-threads")
def list_note_threads(note_id: str):
    if not store.get_note(note_id):
        raise HTTPException(404, "note not found")
    return [asdict(t) for t in store.note_threads(note_id)]


@app.post("/ai-threads")
def create_ai_thread(req: CreateAiThreadRequest, background_tasks: BackgroundTasks):
    thread = AiThread(
        id="",
        note_id=req.note_id,
        action=req.action,
        prompt=req.prompt,
        selection_text=req.selection_text,
        anchor_from=req.anchor_from,
        anchor_to=req.anchor_to,
        status="streaming",
    )
    created = store.create_thread(thread)

    config = load_ai_config()
    if is_ai_configured():
        # Use BackgroundTasks to start the AI stream
        background_tasks.add_task(_run_ai_stream, created.id, config)
    else:
        created.status = "error"
        created.response = "AI not configured"
        store.update_thread(created)
        background_tasks.add_task(broadcast, "thread.updated", asdict(created))

    return asdict(created)


async def _run_ai_stream(thread_id: str, config: dict):
    active_ai_tasks[thread_id] = asyncio.current_task()
    thread = store.get_thread(thread_id)
    if not thread:
        return
    try:
        messages = build_context_messages(
            store, thread.note_id, thread.action, thread.prompt,
            thread.selection_text or None, None,
        )
        accumulated = ""
        last_broadcast = 0.0

        async for chunk_str in stream_completion(config, messages):
            if not chunk_str.startswith("data: "):
                continue
            raw = chunk_str[6:].strip()
            if not raw:
                continue
            try:
                chunk = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if chunk.get("type") == "delta":
                accumulated += chunk["content"]
                now = time.monotonic()
                if now - last_broadcast >= 0.1:
                    thread.response = accumulated
                    store.update_thread(thread)
                    await broadcast("thread.updated", asdict(thread))
                    last_broadcast = now
            elif chunk.get("type") == "error":
                thread.status = "error"
                thread.response = chunk.get("message", "Unknown error")
                store.update_thread(thread)
                await broadcast("thread.updated", asdict(thread))
                return

        thread.response = accumulated
        thread.status = "ready"
        store.update_thread(thread)
        await broadcast("thread.updated", asdict(thread))

    except asyncio.CancelledError:
        thread.response = accumulated
        thread.status = "ready"
        store.update_thread(thread)
        await broadcast("thread.updated", asdict(thread))
    except Exception as e:
        thread = store.get_thread(thread_id)
        if thread:
            thread.status = "error"
            thread.response = str(e)
            store.update_thread(thread)
            await broadcast("thread.updated", asdict(thread))
    finally:
        active_ai_tasks.pop(thread_id, None)


@app.post("/ai-threads/{thread_id}/stop")
def stop_ai_thread(thread_id: str):
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "thread not found")
    task = active_ai_tasks.get(thread_id)
    if task and not task.done():
        task.cancel()
    return asdict(thread)


@app.patch("/ai-threads/{thread_id}")
def update_ai_thread(thread_id: str, req: UpdateAiThreadRequest, background_tasks: BackgroundTasks):
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "not found")
    if req.status is not None:
        thread.status = req.status
    if req.response is not None:
        thread.response = req.response
    updated = store.update_thread(thread)
    background_tasks.add_task(broadcast, "thread.updated", asdict(updated))
    return asdict(updated)


@app.delete("/ai-threads/{thread_id}")
def delete_ai_thread(thread_id: str, background_tasks: BackgroundTasks):
    if not store.delete_thread(thread_id):
        raise HTTPException(404, "not found")
    background_tasks.add_task(broadcast, "thread.deleted", {"id": thread_id})
    return {"ok": True}


# --- AI ---


@app.post("/ai/stream")
def ai_stream(req: AiStreamRequest):
    config = load_ai_config()
    if not is_ai_configured():
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'AI not configured'})}\n\n"]),
            media_type="text/event-stream",
        )
    messages = build_context_messages(store, req.note_id, req.action, req.prompt, req.selection, req.cursor_context)
    return StreamingResponse(
        stream_completion(config, messages),
        media_type="text/event-stream",
    )


@app.get("/ai/status")
def ai_status():
    config = load_ai_config()
    return {
        "configured": is_ai_configured(),
        "model": config.get("model") if is_ai_configured() else None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=7777, reload=True)
