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
    file_path: str = ""


@dataclass
class ContextEntry:
    type: str  # task | project | nudge
    ref_id: str
    reason: str = ""
    pushed_at: datetime = field(default_factory=datetime.now)
