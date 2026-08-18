import time
from typing import Any, Callable

from app.ai import config as ai_config
from app.ai import prompts
from app.ai import provider
from app.ai import tools
from app.chat import service as chat_service
from app.notes import service as notes_service
from app.shared.exceptions import DomainError

MAX_HISTORY = 6
MAX_TOOL_ROUNDS = 3


def run_ask(
    user_id: str,
    name: str,
    message: str,
    emit: Callable[[dict[str, Any]], None],
) -> None:
    config = ai_config.get_config()
    if not config["api_key"]:
        raise DomainError("Set GROQ_API_KEY in .env")

    question = str(message or "").strip()
    if not question:
        raise DomainError("Enter a question")

    note = notes_service.read_note(user_id, name)
    body = (note or {}).get("body") or ""
    chat = chat_service.read_chat(user_id, name)
    history = [
        chat_message
        for chat_message in chat["messages"]
        if chat_message.get("role") in ("user", "assistant")
    ]

    user_message = {"role": "user", "content": question}
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": prompts.system_prompt(name, body),
        },
        *history[-MAX_HISTORY:],
        user_message,
    ]

    streamed = provider.stream_chat(
        config, messages, lambda text: emit({"type": "chunk", "text": text}), True
    )
    content = streamed["content"] or ""
    tool_calls = streamed["tool_calls"]
    rounds = 0

    while tool_calls and rounds < MAX_TOOL_ROUNDS:
        rounds += 1
        messages.append(
            {
                "role": "assistant",
                "content": streamed["content"] or None,
                "tool_calls": tool_calls,
            }
        )

        any_ok = False
        for tool_call in tool_calls:
            result = tools.apply_tool_call(tool_call, user_id, name, emit)
            messages.append(result)
            if result["content"] == "ok":
                any_ok = True

        if any_ok:
            note = notes_service.read_note(user_id, name) or {}
            body = str(note.get("body") or "")
            messages[0] = {
                "role": "system",
                "content": prompts.system_prompt(name, body),
            }

        if rounds >= MAX_TOOL_ROUNDS:
            break

        streamed = provider.stream_chat(
            config,
            messages,
            lambda text: emit({"type": "chunk", "text": text}),
            True,
        )
        content += streamed["content"] or ""
        tool_calls = streamed["tool_calls"]

    if rounds and not content:
        follow = provider.stream_chat(
            config,
            messages,
            lambda text: emit({"type": "chunk", "text": text}),
            False,
        )
        content += follow["content"] or ""

    if not content:
        raise DomainError("Empty reply from Groq")

    history.append(user_message)
    history.append({"role": "assistant", "content": content})
    chat_service.write_chat(user_id, name, history, int(time.time() * 1000))
    emit({"type": "done"})
