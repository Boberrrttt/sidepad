import time

from fastapi import APIRouter, Depends, Query

from app.chat import service
from app.chat.schemas import ChatWriteBody
from app.deps import require_user
from app.shared.exceptions import DomainError

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.put("")
def write_chat(body: ChatWriteBody, user_id: str = Depends(require_user)):
    if not body.name or body.mtime is None:
        raise DomainError("bad request")

    messages = body.messages if isinstance(body.messages, list) else []
    return service.write_chat(user_id, body.name, messages, body.mtime)


@router.delete("")
def delete_chat(
    user_id: str = Depends(require_user),
    name: str | None = Query(default=None),
    mtime: str | None = Query(default=None),
):
    if not name:
        raise DomainError("bad request")

    service.delete_chat(
        user_id, name, int(mtime) if mtime else int(time.time() * 1000)
    )
    return {"ok": True}
