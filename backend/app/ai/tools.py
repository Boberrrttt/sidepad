import json
import time
from typing import Any, Callable

from app.notes import service as notes_service

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "write_note",
            "description": "Replace the current note body with new markdown text",
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
]


def apply_tool_call(
    tool_call: dict[str, Any],
    user_id: str,
    note_name: str,
    emit: Callable[[dict[str, Any]], None],
) -> dict[str, Any]:
    if tool_call["function"]["name"] != "write_note":
        return {
            "role": "tool",
            "tool_call_id": tool_call["id"],
            "content": "unknown tool",
        }

    try:
        args = json.loads(tool_call["function"]["arguments"] or "{}")
    except Exception:
        return {
            "role": "tool",
            "tool_call_id": tool_call["id"],
            "content": "bad args",
        }

    next_body = str(args.get("body") or "")
    mtime = int(time.time() * 1000)
    notes_service.write_note(user_id, note_name, next_body, mtime)
    emit({"type": "note_write", "body": next_body, "mtime": mtime})

    return {
        "role": "tool",
        "tool_call_id": tool_call["id"],
        "content": "ok",
    }
