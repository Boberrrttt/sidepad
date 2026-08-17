import json
import time
from typing import Any, Callable

from app.notes import service as notes_service

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "edit_note",
            "description": (
                "Replace one exact text span in the note body. "
                "Prefer this over write_note for small edits."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "find": {
                        "type": "string",
                        "description": "Exact text to find (must appear once)",
                    },
                    "replace": {
                        "type": "string",
                        "description": "Replacement text",
                    },
                },
                "required": ["find", "replace"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_note",
            "description": "Replace the entire note body. Only for full rewrites.",
            "parameters": {
                "type": "object",
                "properties": {
                    "body": {
                        "type": "string",
                        "description": "Full new note body",
                    },
                },
                "required": ["body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_board",
            "description": (
                "Replace one exact text span in the board JSON. "
                "Prefer this over write_board for small edits."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "find": {
                        "type": "string",
                        "description": "Exact text to find (must appear once)",
                    },
                    "replace": {
                        "type": "string",
                        "description": "Replacement text",
                    },
                },
                "required": ["find", "replace"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_board",
            "description": (
                "Replace the entire board JSON. Only for full board rewrites. "
                'Shape: {"v":1,"columns":[{"id":"...","name":"...","cards":[{"id":"...","title":"..."}]}]}'
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "board": {
                        "type": "string",
                        "description": "Full board JSON string",
                    },
                },
                "required": ["board"],
            },
        },
    },
]


def find_replace(body: str, find: str, replace: str) -> tuple[str | None, str]:
    if not find:
        return None, "find is empty"

    count = body.count(find)
    if count == 0:
        return None, "find not found"
    if count > 1:
        return None, f"find matched {count} times; make find unique"

    return body.replace(find, replace, 1), "ok"


def validate_board(raw: str) -> str | None:
    try:
        parsed = json.loads(raw)
    except Exception:
        return "board must be valid JSON"

    if (
        not isinstance(parsed, dict)
        or parsed.get("v") != 1
        or not isinstance(parsed.get("columns"), list)
    ):
        return 'board must be {"v":1,"columns":[...]}'

    return None


def apply_tool_call(
    tool_call: dict[str, Any],
    user_id: str,
    note_name: str,
    emit: Callable[[dict[str, Any]], None],
) -> dict[str, Any]:
    name = tool_call["function"]["name"]
    tool_call_id = tool_call["id"]

    try:
        args = json.loads(tool_call["function"]["arguments"] or "{}")
    except Exception:
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": "bad args",
        }

    note = notes_service.read_note(user_id, note_name) or {}
    body = str(note.get("body") or "")
    board = str(note.get("board") or "")

    if name == "edit_note":
        next_body, status = find_replace(
            body,
            str(args.get("find") or ""),
            str(args.get("replace") or ""),
        )
        if next_body is None:
            return {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": status,
            }

        mtime = int(time.time() * 1000)
        notes_service.write_note(user_id, note_name, next_body, mtime)
        emit({"type": "note_write", "body": next_body, "mtime": mtime})

        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": "ok",
        }

    if name == "write_note":
        next_body = str(args.get("body") or "")
        mtime = int(time.time() * 1000)
        notes_service.write_note(user_id, note_name, next_body, mtime)
        emit({"type": "note_write", "body": next_body, "mtime": mtime})

        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": "ok",
        }

    if name == "edit_board":
        next_board, status = find_replace(
            board,
            str(args.get("find") or ""),
            str(args.get("replace") or ""),
        )
        if next_board is None:
            return {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": status,
            }

        board_error = validate_board(next_board)
        if board_error:
            return {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": board_error,
            }

        mtime = int(time.time() * 1000)
        notes_service.write_note(user_id, note_name, body, mtime, board=next_board)
        emit({"type": "board_write", "board": next_board, "mtime": mtime})

        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": "ok",
        }

    if name == "write_board":
        next_board = str(args.get("board") or "")
        board_error = validate_board(next_board)
        if board_error:
            return {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": board_error,
            }

        mtime = int(time.time() * 1000)
        notes_service.write_note(user_id, note_name, body, mtime, board=next_board)
        emit({"type": "board_write", "board": next_board, "mtime": mtime})

        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": "ok",
        }

    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": "unknown tool",
    }
