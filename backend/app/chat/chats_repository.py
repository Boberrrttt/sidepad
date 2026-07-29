import json
from typing import Any

from app.shared import database


def _parse_messages(raw: Any) -> list[Any]:
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        return data if isinstance(data, list) else []
    except Exception:
        return []


def read_chat(user_id: str, name: str) -> dict[str, Any]:
    database.ensure_schema()
    result = database.get_client().execute(
        "SELECT name, messages, mtime FROM chats WHERE user_id = ? AND name = ?",
        [user_id, name],
    )
    row = result.rows[0] if result.rows else None

    if not row:
        return {"name": name, "messages": [], "mtime": 0}

    return {
        "name": str(row["name"]),
        "messages": _parse_messages(row["messages"]),
        "mtime": int(row["mtime"]),
    }


def upsert_chat(
    user_id: str, name: str, messages: list[Any], mtime: int
) -> None:
    database.ensure_schema()
    database.get_client().execute(
        """INSERT INTO chats (user_id, name, messages, mtime) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, name) DO UPDATE SET
              messages = excluded.messages,
              mtime = excluded.mtime
            WHERE chats.mtime <= excluded.mtime""",
        [user_id, name, json.dumps(messages or []), mtime],
    )


def delete_chat(user_id: str, name: str, mtime: int) -> None:
    database.ensure_schema()
    database.get_client().execute(
        "DELETE FROM chats WHERE user_id = ? AND name = ? AND mtime <= ?",
        [user_id, name, mtime],
    )


def list_chats(user_id: str) -> list[dict[str, Any]]:
    database.ensure_schema()
    result = database.get_client().execute(
        "SELECT name, messages, mtime FROM chats WHERE user_id = ?",
        [user_id],
    )
    return [
        {
            "name": str(row["name"]),
            "messages": _parse_messages(row["messages"]),
            "mtime": int(row["mtime"]),
        }
        for row in result.rows
    ]
