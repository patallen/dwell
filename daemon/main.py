import os
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import ContextEntry, Project, Question, Task
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


class CreateProjectRequest(BaseModel):
    title: str
    body: str = ""
    status: str = "active"
    deadline: str | None = None


class UpdateProjectRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    status: str | None = None
    deadline: str | None = None


class CreateQuestionRequest(BaseModel):
    question: str
    project_id: str | None = None


class UpdateQuestionRequest(BaseModel):
    question: str | None = None
    answer: str | None = None
    status: str | None = None


class ContextPushRequest(BaseModel):
    type: str = "task"
    ref_id: str
    reason: str = ""
    note_for_current: str | None = None  # note to attach to the current top-of-stack before pushing


# --- Focus ---


@app.get("/focus")
def get_focus(energy: str | None = None):
    """Returns context-aware focus state: current focus or suggestion."""
    top = store.context_peek()
    if top:
        task = None
        project = None
        if top.type == "task":
            task = store.get(top.ref_id, track_view=True)
            if not task or task.status != "open":
                store.context_pop()
                return get_focus(energy)
        elif top.type == "project":
            project = store.get_project(top.ref_id)
            if not project:
                store.context_pop()
                return get_focus(energy)
        suggestions = store.suggest(skip_ids=[top.ref_id], energy=energy)
        return {
            "state": "focused",
            "context": {
                "type": top.type,
                "ref_id": top.ref_id,
                "reason": top.reason,
                "note": top.note,
                "pushed_at": top.pushed_at.isoformat(),
            },
            "task": asdict(task) if task else None,
            "project": asdict(project) if project else None,
            "stack_depth": len(store.context_stack),
            "suggestions": [
                {"task": asdict(s["task"]), "reason": s["reason"]}
                for s in suggestions
            ],
        }

    # No current focus — suggest options
    suggestions = store.suggest(energy=energy)
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
            "note": entry.note,
            "pushed_at": entry.pushed_at.isoformat(),
        }
        if entry.type == "task":
            task = store.get(entry.ref_id)
            item["task"] = asdict(task) if task else None
        elif entry.type == "project":
            project = store.get_project(entry.ref_id)
            item["project"] = asdict(project) if project else None
        result.append(item)
    return result


@app.post("/context/push")
def push_context(req: ContextPushRequest):
    # Attach note to current top-of-stack before pushing (the "note to self" for when you come back)
    if req.note_for_current:
        store.context_set_note(req.note_for_current)
    entry = ContextEntry(
        type=req.type,
        ref_id=req.ref_id,
        reason=req.reason,
        pushed_at=datetime.now(),
    )
    store.context_push(entry)
    return get_focus()


class ContextNoteRequest(BaseModel):
    note: str


@app.post("/context/note")
def set_context_note(req: ContextNoteRequest):
    """Set a note on the current top-of-stack entry (for context restoration on return)."""
    store.context_set_note(req.note)
    return get_focus()


@app.post("/context/pop")
def pop_context():
    popped = store.context_pop()
    focus = get_focus()
    # Include popped entry info so frontend can show transition
    if popped:
        focus["popped"] = {
            "type": popped.type,
            "ref_id": popped.ref_id,
            "reason": popped.reason,
            "note": popped.note,
        }
    return focus


@app.delete("/context/{ref_id}")
def remove_context(ref_id: str):
    store.context_remove(ref_id)
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
    if req.parent is not None:
        task.parent = req.parent
    updated = store.update(task)
    return asdict(updated)


@app.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    if not store.delete(task_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


# --- Projects ---


@app.get("/projects")
def list_projects(status: str | None = None, search: str | None = None):
    results = store.query_projects(status=status, search=search)
    return [asdict(p) for p in results]


@app.get("/projects/{project_id}")
def get_project(project_id: str):
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "not found")
    return asdict(project)


@app.get("/projects/{project_id}/tasks")
def get_project_tasks(project_id: str):
    if not store.get_project(project_id):
        raise HTTPException(404, "project not found")
    return [asdict(t) for t in store.project_tasks(project_id)]


@app.post("/projects")
def create_project(req: CreateProjectRequest):
    deadline = None
    if req.deadline:
        try:
            deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    project = Project(
        id="",
        title=req.title,
        body=req.body,
        status=req.status,
        deadline=deadline,
    )
    created = store.create_project(project)
    return asdict(created)


@app.patch("/projects/{project_id}")
def update_project(project_id: str, req: UpdateProjectRequest):
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "not found")
    if req.title is not None:
        project.title = req.title
    if req.body is not None:
        project.body = req.body
    if req.status is not None:
        project.status = req.status
    if req.deadline is not None:
        try:
            project.deadline = datetime.fromisoformat(req.deadline)
        except ValueError:
            raise HTTPException(400, "invalid deadline format")
    updated = store.update_project(project)
    return asdict(updated)


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    if not store.delete_project(project_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


# --- Questions ---


@app.get("/questions")
def list_questions(project_id: str | None = None, status: str | None = None):
    if project_id:
        results = store.project_questions(project_id)
    else:
        results = list(store.questions.values())
    if status:
        results = [q for q in results if q.status == status]
    return [asdict(q) for q in results]


@app.post("/questions")
def create_question(req: CreateQuestionRequest):
    q = Question(id="", question=req.question, project_id=req.project_id)
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
