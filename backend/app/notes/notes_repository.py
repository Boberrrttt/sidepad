from typing import Any

from app.shared import database


def _row_to_note(row: Any) -> dict[str, Any]:
    return {
        "name": str(row["name"]),
        "body": str(row["body"] or ""),
        "board": str(row["board"] or ""),
        "mtime": int(row["mtime"]),
    }


def list_notes(user_id: str) -> list[dict[str, Any]]:
    database.ensure_schema()
    result = database.get_client().execute(
        "SELECT name, body, board, mtime FROM notes WHERE user_id = ? ORDER BY mtime DESC",
        [user_id],
    )
    return [_row_to_note(row) for row in result.rows]


def read_note(user_id: str, name: str) -> dict[str, Any] | None:
    database.ensure_schema()
    result = database.get_client().execute(
        "SELECT name, body, board, mtime FROM notes WHERE user_id = ? AND name = ?",
        [user_id, name],
    )
    row = result.rows[0] if result.rows else None

    if not row:
        return None

    return _row_to_note(row)


def upsert_note(
    user_id: str, name: str, body: str, board: str, mtime: int
) -> None:
    database.ensure_schema()
    database.get_client().execute(
        """INSERT INTO notes (user_id, name, body, board, mtime) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, name) DO UPDATE SET
              body = excluded.body,
              board = excluded.board,
              mtime = excluded.mtime
            WHERE notes.mtime <= excluded.mtime""",
        [user_id, name, body, board, mtime],
    )


def rename_note_and_chat(
    user_id: str, from_name: str, to_name: str, mtime: int
) -> None:
    database.ensure_schema()
    database.get_client().batch(
        [
            (
                "UPDATE notes SET name = ?, mtime = ? WHERE user_id = ? AND name = ?",
                [to_name, mtime, user_id, from_name],
            ),
            (
                "UPDATE chats SET name = ?, mtime = ? WHERE user_id = ? AND name = ?",
                [to_name, mtime, user_id, from_name],
            ),
        ]
    )


def delete_note_and_chat(user_id: str, name: str, mtime: int) -> None:
    database.ensure_schema()
    database.get_client().batch(
        [
            (
                "DELETE FROM notes WHERE user_id = ? AND name = ? AND mtime <= ?",
                [user_id, name, mtime],
            ),
            (
                "DELETE FROM chats WHERE user_id = ? AND name = ?",
                [user_id, name],
            ),
        ]
    )
