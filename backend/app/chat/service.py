from typing import Any

from app.chat import chats_repository
from app.notes.helpers.safe_name import safe_name


def read_chat(user_id: str, name: str) -> dict[str, Any]:
    return chats_repository.read_chat(user_id, safe_name(name))


def write_chat(
    user_id: str, name: str, messages: list[Any], mtime: int
) -> dict[str, Any]:
    note_name = safe_name(name)
    existing = chats_repository.read_chat(user_id, note_name)

    if existing["mtime"] > mtime:
        return existing

    chats_repository.upsert_chat(user_id, note_name, messages, mtime)
    return chats_repository.read_chat(user_id, note_name)


def delete_chat(user_id: str, name: str, mtime: int) -> None:
    chats_repository.delete_chat(user_id, safe_name(name), mtime)


def list_chats(user_id: str) -> list[dict[str, Any]]:
    return chats_repository.list_chats(user_id)
