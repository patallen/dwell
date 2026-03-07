import json
import os
import uuid
from datetime import datetime
from pathlib import Path

import yaml

from models import ContextEntry, Project, Question, Task


class FileStore:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.tasks: dict[str, Task] = {}
        self.projects: dict[str, Project] = {}
        self.questions: dict[str, Question] = {}
        self.context_stack: list[ContextEntry] = []
        self._index()
        self._load_context()
        self._load_questions()

    def _index(self):
        """Walk the vault and parse all files into memory."""
        self.tasks.clear()
        self.projects.clear()
        for path in self.root.rglob("*.md"):
            meta, body = self._parse_frontmatter(path)
            if meta is None:
                continue
            if meta.get("type") == "project":
                project = self._meta_to_project(meta, body, path)
                if project:
                    self.projects[project.id] = project
            else:
                task = self._meta_to_task(meta, body, path)
                if task:
                    self.tasks[task.id] = task

    def _parse_datetime(self, meta: dict, key: str) -> datetime | None:
        val = meta.get(key)
        if not val:
            return None
        try:
            return datetime.fromisoformat(str(val))
        except (ValueError, TypeError):
            return None

    def _parse_frontmatter(self, path: Path) -> tuple[dict | None, str]:
        try:
            content = path.read_text()
        except Exception:
            return None, ""
        if not content.startswith("---\n"):
            return None, ""
        parts = content[4:].split("\n---\n", 1)
        if len(parts) != 2:
            return None, ""
        try:
            meta = yaml.safe_load(parts[0])
        except yaml.YAMLError:
            return None, ""
        if not isinstance(meta, dict):
            return None, ""
        return meta, parts[1].strip()

    def _meta_to_task(self, meta: dict, body: str, path: Path) -> Task | None:
        task_id = meta.get("id", str(path.relative_to(self.root)).removesuffix(".md"))
        return Task(
            id=task_id,
            title=meta.get("title", ""),
            body=body,
            status=meta.get("status", "open"),
            loe=meta.get("loe"),
            deadline=self._parse_datetime(meta, "deadline"),
            parent=meta.get("parent"),
            created_at=self._parse_datetime(meta, "created") or datetime.now(),
            updated_at=self._parse_datetime(meta, "updated") or datetime.now(),
            last_viewed=self._parse_datetime(meta, "last_viewed"),
            file_path=str(path),
        )

    def _meta_to_project(self, meta: dict, body: str, path: Path) -> Project | None:
        proj_id = meta.get("id", str(path.relative_to(self.root)).removesuffix(".md"))
        return Project(
            id=proj_id,
            title=meta.get("title", ""),
            body=body,
            status=meta.get("status", "active"),
            deadline=self._parse_datetime(meta, "deadline"),
            created_at=self._parse_datetime(meta, "created") or datetime.now(),
            updated_at=self._parse_datetime(meta, "updated") or datetime.now(),
            file_path=str(path),
        )

    def create(self, task: Task) -> Task:
        if not task.id:
            task.id = uuid.uuid4().hex[:8]
        task.created_at = datetime.now()
        task.updated_at = datetime.now()
        if not task.file_path:
            task.file_path = str(self.root / f"{task.id}.md")
        self._write_file(task)
        self.tasks[task.id] = task
        return task

    def get(self, task_id: str, track_view: bool = False) -> Task | None:
        task = self.tasks.get(task_id)
        if task and track_view:
            task.last_viewed = datetime.now()
            self._write_file(task)
        return task

    def update(self, task: Task) -> Task:
        task.updated_at = datetime.now()
        self._write_file(task)
        self.tasks[task.id] = task
        return task

    def delete(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if not task:
            return False
        try:
            os.remove(task.file_path)
        except FileNotFoundError:
            pass
        del self.tasks[task_id]
        return True

    def query(
        self,
        status: str | None = None,
        loe: str | None = None,
        search: str | None = None,
    ) -> list[Task]:
        results = []
        for t in self.tasks.values():
            if status and t.status != status:
                continue
            if loe and t.loe != loe:
                continue
            if search:
                q = search.lower()
                if q not in t.title.lower() and q not in t.body.lower():
                    continue
            results.append(t)
        return results

    def focus(self) -> list[Task]:
        """Return open tasks ranked for the focus view."""
        open_tasks = [t for t in self.tasks.values() if t.status == "open"]
        open_tasks.sort(key=lambda t: self._score(t), reverse=True)
        return open_tasks

    def _score(self, task: Task) -> float:
        now = datetime.now()
        s = 0.0

        if task.deadline:
            hours_until = (task.deadline - now).total_seconds() / 3600
            if hours_until < 0:
                s += 100
            elif hours_until < 24:
                s += 50
            elif hours_until < 72:
                s += 30
            elif hours_until < 168:
                s += 15

        if task.loe == "hot":
            s += 20
        elif task.loe == "warm":
            s += 10

        return s

    def _score_reason(self, task: Task) -> str:
        """Human-readable reason why this task was suggested."""
        now = datetime.now()
        reasons = []

        if task.deadline:
            hours_until = (task.deadline - now).total_seconds() / 3600
            if hours_until < 0:
                reasons.append("overdue")
            elif hours_until < 24:
                reasons.append("due today")
            elif hours_until < 48:
                reasons.append("due tomorrow")
            elif hours_until < 168:
                reasons.append("due this week")

        if task.loe == "hot":
            reasons.append("quick win")

        return " · ".join(reasons) if reasons else "highest priority"

    def suggest(self, skip_ids: list[str] | None = None, limit: int = 5) -> list[dict]:
        """Return top task suggestions with reasoning."""
        open_tasks = [t for t in self.tasks.values() if t.status == "open"]
        if skip_ids:
            open_tasks = [t for t in open_tasks if t.id not in skip_ids]
        open_tasks.sort(key=lambda t: self._score(t), reverse=True)
        return [
            {"task": t, "reason": self._score_reason(t)}
            for t in open_tasks[:limit]
        ]

    # --- Projects ---

    def create_project(self, project: Project) -> Project:
        if not project.id:
            project.id = uuid.uuid4().hex[:8]
        project.created_at = datetime.now()
        project.updated_at = datetime.now()
        if not project.file_path:
            projects_dir = self.root / "projects"
            projects_dir.mkdir(exist_ok=True)
            project.file_path = str(projects_dir / f"{project.id}.md")
        self._write_project_file(project)
        self.projects[project.id] = project
        return project

    def get_project(self, project_id: str) -> Project | None:
        return self.projects.get(project_id)

    def update_project(self, project: Project) -> Project:
        project.updated_at = datetime.now()
        self._write_project_file(project)
        self.projects[project.id] = project
        return project

    def delete_project(self, project_id: str) -> bool:
        project = self.projects.get(project_id)
        if not project:
            return False
        try:
            os.remove(project.file_path)
        except FileNotFoundError:
            pass
        del self.projects[project_id]
        return True

    def query_projects(self, status: str | None = None, search: str | None = None) -> list[Project]:
        results = []
        for p in self.projects.values():
            if status and p.status != status:
                continue
            if search:
                q = search.lower()
                if q not in p.title.lower() and q not in p.body.lower():
                    continue
            results.append(p)
        return results

    def project_tasks(self, project_id: str) -> list[Task]:
        return [t for t in self.tasks.values() if t.parent == project_id]

    def _write_project_file(self, project: Project):
        path = Path(project.file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        meta: dict = {
            "type": "project",
            "id": project.id,
            "title": project.title,
            "status": project.status,
            "created": project.created_at.isoformat(),
            "updated": project.updated_at.isoformat(),
        }
        if project.deadline:
            meta["deadline"] = project.deadline.isoformat()
        frontmatter = yaml.dump(meta, default_flow_style=False, sort_keys=False)
        content = f"---\n{frontmatter}---\n\n{project.body}\n"
        path.write_text(content)

    # --- Questions ---

    def _questions_path(self) -> Path:
        return self.root / ".questions.json"

    def _load_questions(self):
        path = self._questions_path()
        if not path.exists():
            self.questions = {}
            return
        try:
            data = json.loads(path.read_text())
            self.questions = {
                q["id"]: Question(
                    id=q["id"], question=q["question"], answer=q.get("answer", ""),
                    status=q.get("status", "open"), project_id=q.get("project_id"),
                    created_at=datetime.fromisoformat(q["created_at"]),
                    updated_at=datetime.fromisoformat(q["updated_at"]),
                ) for q in data
            }
        except (json.JSONDecodeError, KeyError):
            self.questions = {}

    def _save_questions(self):
        data = [{
            "id": q.id, "question": q.question, "answer": q.answer,
            "status": q.status, "project_id": q.project_id,
            "created_at": q.created_at.isoformat(), "updated_at": q.updated_at.isoformat(),
        } for q in self.questions.values()]
        self._questions_path().write_text(json.dumps(data, indent=2))

    def create_question(self, q: Question) -> Question:
        if not q.id:
            q.id = uuid.uuid4().hex[:8]
        q.created_at = datetime.now()
        q.updated_at = datetime.now()
        self.questions[q.id] = q
        self._save_questions()
        return q

    def get_question(self, qid: str) -> Question | None:
        return self.questions.get(qid)

    def update_question(self, q: Question) -> Question:
        q.updated_at = datetime.now()
        self.questions[q.id] = q
        self._save_questions()
        return q

    def delete_question(self, qid: str) -> bool:
        if qid not in self.questions:
            return False
        del self.questions[qid]
        self._save_questions()
        return True

    def project_questions(self, project_id: str) -> list[Question]:
        return [q for q in self.questions.values() if q.project_id == project_id]

    # --- Context Stack ---

    def _context_path(self) -> Path:
        return self.root / ".context_stack.json"

    def _load_context(self):
        path = self._context_path()
        if not path.exists():
            self.context_stack = []
            return
        try:
            data = json.loads(path.read_text())
            self.context_stack = [
                ContextEntry(
                    type=e["type"],
                    ref_id=e["ref_id"],
                    reason=e.get("reason", ""),
                    pushed_at=datetime.fromisoformat(e["pushed_at"]),
                )
                for e in data
            ]
        except (json.JSONDecodeError, KeyError):
            self.context_stack = []

    def _save_context(self):
        data = [
            {
                "type": e.type,
                "ref_id": e.ref_id,
                "reason": e.reason,
                "pushed_at": e.pushed_at.isoformat(),
            }
            for e in self.context_stack
        ]
        self._context_path().write_text(json.dumps(data, indent=2))

    def context_push(self, entry: ContextEntry) -> list[ContextEntry]:
        # Remove if already in stack (will re-push to top)
        self.context_stack = [e for e in self.context_stack if e.ref_id != entry.ref_id]
        self.context_stack.insert(0, entry)
        self._save_context()
        return self.context_stack

    def context_pop(self) -> ContextEntry | None:
        if not self.context_stack:
            return None
        entry = self.context_stack.pop(0)
        self._save_context()
        return entry

    def context_peek(self) -> ContextEntry | None:
        return self.context_stack[0] if self.context_stack else None

    def context_get(self) -> list[ContextEntry]:
        return self.context_stack

    def context_remove(self, ref_id: str) -> bool:
        before = len(self.context_stack)
        self.context_stack = [e for e in self.context_stack if e.ref_id != ref_id]
        if len(self.context_stack) < before:
            self._save_context()
            return True
        return False

    def _write_file(self, task: Task):
        path = Path(task.file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        meta: dict = {
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "created": task.created_at.isoformat(),
            "updated": task.updated_at.isoformat(),
        }
        if task.loe:
            meta["loe"] = task.loe
        if task.deadline:
            meta["deadline"] = task.deadline.isoformat()
        if task.parent:
            meta["parent"] = task.parent
        if task.last_viewed:
            meta["last_viewed"] = task.last_viewed.isoformat()

        frontmatter = yaml.dump(meta, default_flow_style=False, sort_keys=False)
        content = f"---\n{frontmatter}---\n\n{task.body}\n"
        path.write_text(content)
