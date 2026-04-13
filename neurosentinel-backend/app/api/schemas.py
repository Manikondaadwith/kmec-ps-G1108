from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ScoutChatContext(BaseModel):
    page: str = "general"
    role: str | None = None
    report_id: str | None = None
    current_report: dict[str, Any] | None = None


class ScoutChatHistoryItem(BaseModel):
    role: str
    content: str


class ScoutChatRequest(BaseModel):
    message: str = Field(min_length=1)
    context: ScoutChatContext = Field(default_factory=ScoutChatContext)
    history: list[ScoutChatHistoryItem] = Field(default_factory=list)
