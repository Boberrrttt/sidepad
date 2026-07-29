from typing import Any

from pydantic import BaseModel


class ChatWriteBody(BaseModel):
    name: str | None = None
    messages: list[Any] | None = None
    mtime: int | None = None
