from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Task:
    id: str
    title: str
    body: str = ""
    status: str = "open"  # open | done | dropped
    loe: Optional[str] = None  # hot | warm | cool
    deadline: Optional[datetime] = None
    parent: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_viewed: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    file_path: str = ""


@dataclass
class Project:
    id: str
    title: str
    body: str = ""  # rich text / markdown
    status: str = "active"  # active | paused | done | dropped
    deadline: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    file_path: str = ""


@dataclass
class Question:
    id: str
    question: str
    answer: str = ""
    status: str = "open"  # open | answered
    project_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class ContextEntry:
    type: str  # task | project | nudge
    ref_id: str
    reason: str = ""
    note: Optional[str] = None  # "note to self" for context restoration
    pushed_at: datetime = field(default_factory=datetime.now)
