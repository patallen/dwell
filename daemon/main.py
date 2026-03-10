import os
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import ContextEntry, Note, Question, Task
from store import FileStore

VAULT_PATH = os.environ.get("ADHDEEZ_VAULT", str(Path.home() / ".adhdeez"))
store = FileStore(VAULT_PATH)

app = FastAPI(title="adhdeez")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "tauri://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
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
def push_context(req: ContextPushRequest):
    if req.memo_for_current:
        store.context_set_memo(req.memo_for_current)
    entry = ContextEntry(
        type=req.type,
        ref_id=req.ref_id,
        reason=req.reason,
        pushed_at=datetime.now(),
    )
    store.context_push(entry)
    return get_focus()


@app.post("/context/memo")
def set_context_memo(req: ContextMemoRequest):
    store.context_set_memo(req.memo)
    return get_focus()


@app.post("/context/pop")
def pop_context():
    popped = store.context_pop()
    focus = get_focus()
    if popped:
        focus["popped"] = {
            "type": popped.type,
            "ref_id": popped.ref_id,
            "reason": popped.reason,
            "memo": popped.memo,
        }
    return focus


@app.delete("/context/{ref_id}")
def remove_context(ref_id: str):
    store.context_remove(ref_id)
    return get_focus()


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
def create_note(req: CreateNoteRequest):
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
    return asdict(created)


@app.patch("/notes/{note_id}")
def update_note(note_id: str, req: UpdateNoteRequest):
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
    return asdict(updated)


@app.delete("/notes/{note_id}")
def delete_note(note_id: str):
    if not store.delete_note(note_id):
        raise HTTPException(404, "not found")
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
def create_task(req: CreateTaskRequest):
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
    return asdict(created)


@app.patch("/tasks/{task_id}")
def update_task(task_id: str, req: UpdateTaskRequest):
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
    return asdict(updated)


@app.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    if not store.delete_task(task_id):
        raise HTTPException(404, "not found")
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
def create_question(req: CreateQuestionRequest):
    q = Question(id="", question=req.question, note_id=req.note_id)
    created = store.create_question(q)
    return asdict(created)


@app.patch("/questions/{question_id}")
def update_question(question_id: str, req: UpdateQuestionRequest):
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
    return asdict(updated)


@app.delete("/questions/{question_id}")
def delete_question(question_id: str):
    if not store.delete_question(question_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=7777, reload=True)
