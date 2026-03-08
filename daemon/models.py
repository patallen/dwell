from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Note:
    id: str
    title: str
    body: str = ""
    note_type: Optional[str] = None  # project | meeting | one_on_one | research | None (generic)
    status: str = "active"  # active | paused | done | dropped
    parent: Optional[str] = None  # parent note id — nesting
    deadline: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_viewed: Optional[datetime] = None
    file_path: str = ""


@dataclass
class Task:
    id: str
    title: str
    body: str = ""
    status: str = "open"  # open | done | dropped
    loe: Optional[str] = None  # hot | warm | cool
    deadline: Optional[datetime] = None
    note_id: Optional[str] = None  # parent note
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_viewed: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    file_path: str = ""


@dataclass
class Question:
    id: str
    question: str
    answer: str = ""
    notes: str = ""  # research notes (rich text)
    status: str = "open"  # open | answered
    note_id: Optional[str] = None  # parent note
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class ContextEntry:
    type: str  # note | task | question
    ref_id: str
    reason: str = ""
    memo: Optional[str] = None  # "note to self" for context restoration
    pushed_at: datetime = field(default_factory=datetime.now)
