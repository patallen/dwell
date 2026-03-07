import os
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import EntityType
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


class CreateEntityRequest(BaseModel):
    type: str = "thought"
    title: str
    body: str = ""
    tags: list[str] = []
    status: str = "inbox"
    priority: str | None = None
    due: str | None = None


class UpdateEntityRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    status: str | None = None
    priority: str | None = None
    due: str | None = None


@app.get("/entities")
def list_entities(
    type: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    search: str | None = None,
):
    entity_type = EntityType(type) if type else None
    results = store.query(entity_type=entity_type, status=status, priority=priority, search=search)
    return [asdict(e) for e in results]


@app.get("/inbox")
def get_inbox():
    return [asdict(e) for e in store.inbox()]


@app.get("/entities/{entity_id}")
def get_entity(entity_id: str):
    entity = store.get(entity_id)
    if not entity:
        raise HTTPException(404, "not found")
    return asdict(entity)


@app.post("/entities")
def create_entity(req: CreateEntityRequest):
    from models import Entity

    entity = Entity(
        id="",
        type=EntityType(req.type),
        title=req.title,
        body=req.body,
        tags=req.tags,
        status=req.status,
        priority=req.priority,
    )
    created = store.create(entity)
    return asdict(created)


@app.patch("/entities/{entity_id}")
def update_entity(entity_id: str, req: UpdateEntityRequest):
    entity = store.get(entity_id)
    if not entity:
        raise HTTPException(404, "not found")
    if req.title is not None:
        entity.title = req.title
    if req.body is not None:
        entity.body = req.body
    if req.tags is not None:
        entity.tags = req.tags
    if req.status is not None:
        entity.status = req.status
    if req.priority is not None:
        entity.priority = req.priority
    updated = store.update(entity)
    return asdict(updated)


@app.delete("/entities/{entity_id}")
def delete_entity(entity_id: str):
    if not store.delete(entity_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=7777)
