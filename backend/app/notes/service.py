from typing import Any

from app.notes import notes_repository
from app.notes.helpers.safe_name import safe_name
from app.shared.exceptions import DomainError


def list_notes(user_id: str) -> list[dict[str, Any]]:
    return notes_repository.list_notes(user_id)


def read_note(user_id: str, name: str) -> dict[str, Any] | None:
    return notes_repository.read_note(user_id, safe_name(name))


def write_note(
    user_id: str,
    name: str,
    body: str,
    mtime: int,
    board: str | None = None,
) -> dict[str, Any]:
    note_name = safe_name(name)
    existing = notes_repository.read_note(user_id, note_name)

    if existing and existing["mtime"] > mtime:
        return existing

    next_board = (
        str(board) if board is not None else str((existing or {}).get("board") or "")
    )

    notes_repository.upsert_note(
        user_id, note_name, str(body or ""), next_board, mtime
    )

    return notes_repository.read_note(user_id, note_name)  # type: ignore[return-value]


def rename_note(user_id: str, from_name: str, to_name: str, mtime: int) -> str:
    source_name = safe_name(from_name)
    dest_name = safe_name(to_name)

    if source_name == dest_name:
        return dest_name

    dest_row = notes_repository.read_note(user_id, dest_name)
    if dest_row:
        raise DomainError("note exists")

    source_row = notes_repository.read_note(user_id, source_name)
    if not source_row:
        raise DomainError("note missing")

    next_mtime = max(mtime, source_row["mtime"])
    notes_repository.rename_note_and_chat(
        user_id, source_name, dest_name, next_mtime
    )
    return dest_name


def delete_note(user_id: str, name: str, mtime: int) -> None:
    notes_repository.delete_note_and_chat(user_id, safe_name(name), mtime)
