import os
import uuid
from datetime import datetime
from pathlib import Path

import yaml

from models import Entity, EntityType


class FileStore:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.entities: dict[str, Entity] = {}
        self._index()

    def _index(self):
        """Walk the vault and parse all files into memory."""
        self.entities.clear()
        for path in self.root.rglob("*.md"):
            entity = self._parse_file(path)
            if entity:
                self.entities[entity.id] = entity

    def _parse_file(self, path: Path) -> Entity | None:
        try:
            content = path.read_text()
        except Exception:
            return None

        if not content.startswith("---\n"):
            return None

        parts = content[4:].split("\n---\n", 1)
        if len(parts) != 2:
            return None

        try:
            meta = yaml.safe_load(parts[0])
        except yaml.YAMLError:
            return None

        if not isinstance(meta, dict):
            return None

        entity_id = meta.get("id", str(path.relative_to(self.root)).removesuffix(".md"))

        due = None
        if meta.get("due"):
            try:
                due = datetime.fromisoformat(meta["due"])
            except (ValueError, TypeError):
                pass

        created = datetime.now()
        if meta.get("created"):
            try:
                created = datetime.fromisoformat(meta["created"])
            except (ValueError, TypeError):
                pass

        updated = datetime.now()
        if meta.get("updated"):
            try:
                updated = datetime.fromisoformat(meta["updated"])
            except (ValueError, TypeError):
                pass

        return Entity(
            id=entity_id,
            type=EntityType(meta.get("type", "thought")),
            title=meta.get("title", ""),
            body=parts[1].strip(),
            tags=meta.get("tags", []),
            links=meta.get("links", []),
            status=meta.get("status", "inbox"),
            priority=meta.get("priority"),
            due=due,
            created_at=created,
            updated_at=updated,
            file_path=str(path),
        )

    def create(self, entity: Entity) -> Entity:
        if not entity.id:
            entity.id = uuid.uuid4().hex[:8]
        entity.created_at = datetime.now()
        entity.updated_at = datetime.now()
        if not entity.file_path:
            entity.file_path = str(self.root / f"{entity.id}.md")
        self._write_file(entity)
        self.entities[entity.id] = entity
        return entity

    def get(self, entity_id: str) -> Entity | None:
        return self.entities.get(entity_id)

    def update(self, entity: Entity) -> Entity:
        entity.updated_at = datetime.now()
        self._write_file(entity)
        self.entities[entity.id] = entity
        return entity

    def delete(self, entity_id: str) -> bool:
        entity = self.entities.get(entity_id)
        if not entity:
            return False
        try:
            os.remove(entity.file_path)
        except FileNotFoundError:
            pass
        del self.entities[entity_id]
        return True

    def query(
        self,
        entity_type: EntityType | None = None,
        status: str | None = None,
        priority: str | None = None,
        tags: list[str] | None = None,
        search: str | None = None,
    ) -> list[Entity]:
        results = []
        for e in self.entities.values():
            if entity_type and e.type != entity_type:
                continue
            if status and e.status != status:
                continue
            if priority and e.priority != priority:
                continue
            if tags and not any(t in e.tags for t in tags):
                continue
            if search:
                q = search.lower()
                if q not in e.title.lower() and q not in e.body.lower():
                    continue
            results.append(e)
        return results

    def inbox(self) -> list[Entity]:
        return self.query(status="inbox")

    def _write_file(self, entity: Entity):
        path = Path(entity.file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        meta: dict = {
            "id": entity.id,
            "type": entity.type.value,
            "title": entity.title,
            "status": entity.status,
            "created": entity.created_at.isoformat(),
            "updated": entity.updated_at.isoformat(),
        }
        if entity.tags:
            meta["tags"] = entity.tags
        if entity.links:
            meta["links"] = entity.links
        if entity.priority:
            meta["priority"] = entity.priority
        if entity.due:
            meta["due"] = entity.due.isoformat()

        frontmatter = yaml.dump(meta, default_flow_style=False, sort_keys=False)
        content = f"---\n{frontmatter}---\n\n{entity.body}\n"
        path.write_text(content)
