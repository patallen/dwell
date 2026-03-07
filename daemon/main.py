import os
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import ContextEntry, Task
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


class CreateTaskRequest(BaseModel):
    title: str
    body: str = ""
    status: str = "open"
    loe: str | None = None
    deadline: str | None = None
    parent: str | None = None


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    status: str | None = None
    loe: str | None = None
    deadline: str | None = None
    parent: str | None = None


class ContextPushRequest(BaseModel):
    type: str = "task"
    ref_id: str
    reason: str = ""


# --- Focus ---


@app.get("/focus")
def get_focus():
    """Returns context-aware focus state: current focus or suggestion."""
    top = store.context_peek()
    if top:
        task = store.get(top.ref_id, track_view=True) if top.type == "task" else None
        # If the referenced task is no longer open, pop it and recurse
        if top.type == "task" and (not task or task.status != "open"):
            store.context_pop()
            return get_focus()
        return {
            "state": "focused",
            "context": {
                "type": top.type,
                "ref_id": top.ref_id,
                "reason": top.reason,
                "pushed_at": top.pushed_at.isoformat(),
            },
            "task": asdict(task) if task else None,
            "stack_depth": len(store.context_stack),
        }

    # No current focus — suggest options
    suggestions = store.suggest()
    if not suggestions:
        return {"state": "empty", "suggestions": []}

    return {
        "state": "suggesting",
        "suggestions": [
            {"task": asdict(s["task"]), "reason": s["reason"]}
            for s in suggestions
        ],
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
            "pushed_at": entry.pushed_at.isoformat(),
        }
        if entry.type == "task":
            task = store.get(entry.ref_id)
            item["task"] = asdict(task) if task else None
        result.append(item)
    return result


@app.post("/context/push")
def push_context(req: ContextPushRequest):
    entry = ContextEntry(
        type=req.type,
        ref_id=req.ref_id,
        reason=req.reason,
        pushed_at=datetime.now(),
    )
    store.context_push(entry)
    return get_focus()


@app.post("/context/pop")
def pop_context():
    store.context_pop()
    return get_focus()


# --- Tasks ---


@app.get("/tasks")
def list_tasks(
    status: str | None = None,
    loe: str | None = None,
    search: str | None = None,
):
    results = store.query(status=status, loe=loe, search=search)
    return [asdict(t) for t in results]


@app.get("/tasks/{task_id}")
def get_task(task_id: str):
    task = store.get(task_id, track_view=True)
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
        parent=req.parent,
    )
    created = store.create(task)
    return asdict(created)


@app.patch("/tasks/{task_id}")
def update_task(task_id: str, req: UpdateTaskRequest):
    task = store.get(task_id)
    if not task:
        raise HTTPException(404, "not found")
    if req.title is not None:
        task.title = req.title
    if req.body is not None:
        task.body = req.body
    if req.status is not None:
        task.status = req.status
    if req.loe is not None:
        task.loe = req.loe
    if req.deadline is not None:
        try:
            task.deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    if req.parent is not None:
        task.parent = req.parent
    updated = store.update(task)
    return asdict(updated)


@app.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    if not store.delete(task_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=7777)
