from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class EntityType(str, Enum):
    TASK = "task"
    PROJECT = "project"
    AREA = "area"
    THOUGHT = "thought"


@dataclass
class Entity:
    id: str
    type: EntityType
    title: str
    body: str = ""
    tags: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    status: str = "inbox"
    priority: Optional[str] = None
    due: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    file_path: str = ""
