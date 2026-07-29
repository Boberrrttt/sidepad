from fastapi import APIRouter, Depends, Query

from app.deps import require_user
from app.notes import service
from app.notes.schemas import NoteRenameBody, NoteWriteBody
from app.shared.exceptions import DomainError

router = APIRouter(tags=["notes"])


@router.get("/api/notes")
def list_notes(user_id: str = Depends(require_user)):
    return service.list_notes(user_id)


@router.put("/api/notes")
def write_note(body: NoteWriteBody, user_id: str = Depends(require_user)):
    if not body.name or body.mtime is None:
        raise DomainError("bad request")

    return service.write_note(
        user_id,
        body.name,
        body.body,
        body.mtime,
        body.board if body.board is not None else None,
    )


@router.delete("/api/notes")
def delete_note(
    user_id: str = Depends(require_user),
    name: str | None = Query(default=None),
    mtime: str | None = Query(default=None),
):
    if not name:
        raise DomainError("bad request")

    service.delete_note(user_id, name, int(mtime or 0))
    return {"ok": True}


@router.post("/api/notes/rename")
def rename_note(body: NoteRenameBody, user_id: str = Depends(require_user)):
    if not body.from_name or not body.to_name or body.mtime is None:
        raise DomainError("bad request")

    note_name = service.rename_note(
        user_id, body.from_name, body.to_name, body.mtime
    )
    return {"name": note_name}
