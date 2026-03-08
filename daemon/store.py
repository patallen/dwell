import json
import os
import uuid
from datetime import datetime
from pathlib import Path

import yaml

from models import ContextEntry, Note, Question, Task


class FileStore:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.notes: dict[str, Note] = {}
        self.tasks: dict[str, Task] = {}
        self.questions: dict[str, Question] = {}
        self.context_stack: list[ContextEntry] = []
        self._index()
        self._load_context()
        self._load_questions()

    # --- Indexing / Parsing ---

    def _index(self):
        """Walk the vault and parse all .md files into memory."""
        self.notes.clear()
        self.tasks.clear()
        notes_dir = self.root / "notes"
        tasks_dir = self.root / "tasks"
        for d in [notes_dir, tasks_dir]:
            if not d.exists():
                continue
            for path in d.rglob("*.md"):
                meta, body = self._parse_frontmatter(path)
                if meta is None:
                    continue
                entity_type = meta.get("entity")
                if entity_type == "task":
                    task = self._meta_to_task(meta, body, path)
                    if task:
                        self.tasks[task.id] = task
                else:
                    note = self._meta_to_note(meta, body, path)
                    if note:
                        self.notes[note.id] = note

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

    def _meta_to_note(self, meta: dict, body: str, path: Path) -> Note | None:
        note_id = meta.get("id")
        if not note_id:
            return None
        return Note(
            id=note_id,
            title=meta.get("title", ""),
            body=body,
            note_type=meta.get("note_type"),
            status=meta.get("status", "active"),
            parent=meta.get("parent"),
            deadline=self._parse_datetime(meta, "deadline"),
            created_at=self._parse_datetime(meta, "created") or datetime.now(),
            updated_at=self._parse_datetime(meta, "updated") or datetime.now(),
            last_viewed=self._parse_datetime(meta, "last_viewed"),
            file_path=str(path),
        )

    def _meta_to_task(self, meta: dict, body: str, path: Path) -> Task | None:
        task_id = meta.get("id")
        if not task_id:
            return None
        return Task(
            id=task_id,
            title=meta.get("title", ""),
            body=body,
            status=meta.get("status", "open"),
            loe=meta.get("loe"),
            deadline=self._parse_datetime(meta, "deadline"),
            note_id=meta.get("note_id"),
            created_at=self._parse_datetime(meta, "created") or datetime.now(),
            updated_at=self._parse_datetime(meta, "updated") or datetime.now(),
            last_viewed=self._parse_datetime(meta, "last_viewed"),
            completed_at=self._parse_datetime(meta, "completed_at"),
            file_path=str(path),
        )

    # --- Notes ---

    def create_note(self, note: Note) -> Note:
        if not note.id:
            note.id = uuid.uuid4().hex[:8]
        note.created_at = datetime.now()
        note.updated_at = datetime.now()
        if not note.file_path:
            notes_dir = self.root / "notes"
            notes_dir.mkdir(exist_ok=True)
            note.file_path = str(notes_dir / f"{note.id}.md")
        self._write_note_file(note)
        self.notes[note.id] = note
        return note

    def get_note(self, note_id: str, track_view: bool = False) -> Note | None:
        note = self.notes.get(note_id)
        if note and track_view:
            note.last_viewed = datetime.now()
            self._write_note_file(note)
        return note

    def update_note(self, note: Note) -> Note:
        note.updated_at = datetime.now()
        self._write_note_file(note)
        self.notes[note.id] = note
        return note

    def delete_note(self, note_id: str) -> bool:
        note = self.notes.get(note_id)
        if not note:
            return False
        try:
            os.remove(note.file_path)
        except FileNotFoundError:
            pass
        del self.notes[note_id]
        return True

    def query_notes(
        self,
        note_type: str | None = None,
        status: str | None = None,
        parent: str | None = None,
        search: str | None = None,
    ) -> list[Note]:
        results = []
        for n in self.notes.values():
            if note_type and n.note_type != note_type:
                continue
            if status and n.status != status:
                continue
            if parent is not None and n.parent != parent:
                continue
            if search:
                q = search.lower()
                if q not in n.title.lower() and q not in n.body.lower():
                    continue
            results.append(n)
        return results

    def note_children(self, note_id: str) -> list[Note]:
        return [n for n in self.notes.values() if n.parent == note_id]

    def note_tasks(self, note_id: str) -> list[Task]:
        return [t for t in self.tasks.values() if t.note_id == note_id]

    def note_questions(self, note_id: str) -> list[Question]:
        return [q for q in self.questions.values() if q.note_id == note_id]

    def _write_note_file(self, note: Note):
        path = Path(note.file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        meta: dict = {
            "entity": "note",
            "id": note.id,
            "title": note.title,
            "status": note.status,
            "created": note.created_at.isoformat(),
            "updated": note.updated_at.isoformat(),
        }
        if note.note_type:
            meta["note_type"] = note.note_type
        if note.parent:
            meta["parent"] = note.parent
        if note.deadline:
            meta["deadline"] = note.deadline.isoformat()
        if note.last_viewed:
            meta["last_viewed"] = note.last_viewed.isoformat()
        frontmatter = yaml.dump(meta, default_flow_style=False, sort_keys=False)
        content = f"---\n{frontmatter}---\n\n{note.body}\n"
        path.write_text(content)

    # --- Tasks ---

    def create_task(self, task: Task) -> Task:
        if not task.id:
            task.id = uuid.uuid4().hex[:8]
        task.created_at = datetime.now()
        task.updated_at = datetime.now()
        if not task.file_path:
            tasks_dir = self.root / "tasks"
            tasks_dir.mkdir(exist_ok=True)
            task.file_path = str(tasks_dir / f"{task.id}.md")
        self._write_task_file(task)
        self.tasks[task.id] = task
        return task

    def get_task(self, task_id: str, track_view: bool = False) -> Task | None:
        task = self.tasks.get(task_id)
        if task and track_view:
            task.last_viewed = datetime.now()
            self._write_task_file(task)
        return task

    def update_task(self, task: Task) -> Task:
        task.updated_at = datetime.now()
        self._write_task_file(task)
        self.tasks[task.id] = task
        return task

    def delete_task(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if not task:
            return False
        try:
            os.remove(task.file_path)
        except FileNotFoundError:
            pass
        del self.tasks[task_id]
        return True

    def query_tasks(
        self,
        status: str | None = None,
        loe: str | None = None,
        note_id: str | None = None,
        search: str | None = None,
    ) -> list[Task]:
        results = []
        for t in self.tasks.values():
            if status and t.status != status:
                continue
            if loe and t.loe != loe:
                continue
            if note_id is not None and t.note_id != note_id:
                continue
            if search:
                q = search.lower()
                if q not in t.title.lower() and q not in t.body.lower():
                    continue
            results.append(t)
        return results

    def _write_task_file(self, task: Task):
        path = Path(task.file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        meta: dict = {
            "entity": "task",
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
        if task.note_id:
            meta["note_id"] = task.note_id
        if task.last_viewed:
            meta["last_viewed"] = task.last_viewed.isoformat()
        if task.completed_at:
            meta["completed_at"] = task.completed_at.isoformat()
        frontmatter = yaml.dump(meta, default_flow_style=False, sort_keys=False)
        content = f"---\n{frontmatter}---\n\n{task.body}\n"
        path.write_text(content)

    # --- Suggestion Engine ---

    def _deadline_score(self, deadline: datetime | None, energy: str | None = None) -> float:
        if not deadline:
            return 0.0
        now = datetime.now()
        hours_until = (deadline - now).total_seconds() / 3600
        s = 0.0
        if hours_until < 0:
            s = 100
        elif hours_until < 24:
            s = 50
        elif hours_until < 72:
            s = 30
        elif hours_until < 168:
            s = 15
        if energy == "rough":
            if hours_until < 0:
                s -= 80
            elif hours_until < 24:
                s -= 40
        elif energy == "calm":
            if hours_until < 0:
                s += 20
            elif hours_until < 24:
                s += 10
        return s

    def _deadline_reason(self, deadline: datetime | None) -> str | None:
        if not deadline:
            return None
        hours_until = (deadline - datetime.now()).total_seconds() / 3600
        if hours_until < 0:
            return "overdue"
        if hours_until < 24:
            return "due today"
        if hours_until < 48:
            return "due tomorrow"
        if hours_until < 168:
            return "due this week"
        return None

    def _time_of_day_boost(self, task: Task) -> float:
        completed = [t for t in self.tasks.values() if t.completed_at]
        if len(completed) < 10:
            return 0.0
        current_window = datetime.now().hour // 4
        window_counts: dict[str | None, int] = {}
        total_in_window = 0
        for t in completed:
            if t.completed_at.hour // 4 == current_window:
                window_counts[t.loe] = window_counts.get(t.loe, 0) + 1
                total_in_window += 1
        if total_in_window < 3:
            return 0.0
        total_counts: dict[str | None, int] = {}
        for t in completed:
            total_counts[t.loe] = total_counts.get(t.loe, 0) + 1
        task_loe = task.loe
        window_share = window_counts.get(task_loe, 0) / total_in_window
        overall_share = total_counts.get(task_loe, 0) / len(completed)
        if overall_share > 0 and window_share > overall_share:
            return min(15.0, (window_share / overall_share - 1) * 10)
        return 0.0

    def _score_task(self, task: Task, energy: str | None = None) -> float:
        s = self._deadline_score(task.deadline, energy)
        if task.loe == "hot":
            s += 20
        elif task.loe == "warm":
            s += 10
        s += self._time_of_day_boost(task)
        if energy == "rough":
            if task.loe == "hot":
                s += 15
            if not task.note_id:
                s += 10
            age_hours = (datetime.now() - task.created_at).total_seconds() / 3600
            if age_hours < 48:
                s += 15
        elif energy == "calm":
            if task.loe == "warm":
                s += 10
            elif task.loe == "cool":
                s += 5
        return s

    def _score_task_reason(self, task: Task, energy: str | None = None) -> str:
        reasons = []
        dr = self._deadline_reason(task.deadline)
        if dr:
            reasons.append(dr)
        if task.loe == "hot":
            reasons.append("quick win")
        if energy == "rough":
            age_hours = (datetime.now() - task.created_at).total_seconds() / 3600
            if age_hours < 48:
                reasons.append("fresh")
            if not task.note_id:
                reasons.append("low-stakes")
        return " · ".join(reasons) if reasons else "highest priority"

    def _score_note(self, note: Note, energy: str | None = None) -> float:
        s = self._deadline_score(note.deadline, energy)
        # Open questions are the urgency signal for notes
        open_qs = len([q for q in self.questions.values() if q.note_id == note.id and q.status == "open"])
        if open_qs > 0:
            s += min(40, open_qs * 15)  # up to 40 pts for open questions
        # Open tasks inside the note give it some weight too
        open_tasks = len([t for t in self.tasks.values() if t.note_id == note.id and t.status == "open"])
        if open_tasks > 0:
            s += min(20, open_tasks * 5)
        if energy == "rough":
            # Suppress notes with lots of open questions — that's overwhelming
            if open_qs > 3:
                s -= 30
            # Boost fresh notes
            age_hours = (datetime.now() - note.created_at).total_seconds() / 3600
            if age_hours < 48:
                s += 15
        return s

    def _score_note_reason(self, note: Note) -> str:
        reasons = []
        dr = self._deadline_reason(note.deadline)
        if dr:
            reasons.append(dr)
        open_qs = len([q for q in self.questions.values() if q.note_id == note.id and q.status == "open"])
        if open_qs > 0:
            reasons.append(f"{open_qs} open question{'s' if open_qs > 1 else ''}")
        return " · ".join(reasons) if reasons else "needs attention"

    def suggest(self, skip_ids: list[str] | None = None, limit: int = 5, energy: str | None = None) -> list[dict]:
        skip = set(skip_ids or [])
        items: list[tuple[float, dict]] = []

        # Score open tasks
        for t in self.tasks.values():
            if t.status != "open" or t.id in skip:
                continue
            score = self._score_task(t, energy)
            items.append((score, {
                "type": "task",
                "task": t,
                "reason": self._score_task_reason(t, energy),
            }))

        # Score active notes
        for n in self.notes.values():
            if n.status not in ("active", "paused") or n.id in skip:
                continue
            score = self._score_note(n, energy)
            if score > 0:  # only surface notes that have some signal
                items.append((score, {
                    "type": "note",
                    "note": n,
                    "reason": self._score_note_reason(n),
                }))

        items.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in items[:limit]]

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
                    notes=q.get("notes", ""),
                    status=q.get("status", "open"), note_id=q.get("note_id"),
                    created_at=datetime.fromisoformat(q["created_at"]),
                    updated_at=datetime.fromisoformat(q["updated_at"]),
                ) for q in data
            }
        except (json.JSONDecodeError, KeyError):
            self.questions = {}

    def _save_questions(self):
        data = [{
            "id": q.id, "question": q.question, "answer": q.answer,
            "notes": q.notes, "status": q.status, "note_id": q.note_id,
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
                    memo=e.get("memo"),
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
                "memo": e.memo,
                "pushed_at": e.pushed_at.isoformat(),
            }
            for e in self.context_stack
        ]
        self._context_path().write_text(json.dumps(data, indent=2))

    def context_push(self, entry: ContextEntry) -> list[ContextEntry]:
        for e in self.context_stack:
            if e.ref_id == entry.ref_id and e.memo and not entry.memo:
                entry.memo = e.memo
                break
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

    def context_set_memo(self, memo: str) -> bool:
        if not self.context_stack:
            return False
        self.context_stack[0].memo = memo or None
        self._save_context()
        return True

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
