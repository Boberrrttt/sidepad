import json
from typing import Any, Callable

import httpx

from app.ai.tools import TOOLS
from app.shared.exceptions import DomainError

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def stream_chat(
    config: dict[str, str],
    messages: list[dict[str, Any]],
    on_chunk: Callable[[str], None],
    with_tools: bool,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": config["model"],
        "stream": True,
        "messages": messages,
        "temperature": 0 if with_tools else 0.2,
    }
    if with_tools:
        payload["tools"] = TOOLS

    with httpx.Client(timeout=120.0) as client:
        with client.stream(
            "POST",
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code >= 400:
                error_text = response.read().decode("utf-8", errors="replace")
                raise DomainError(
                    f"Groq {response.status_code}: {error_text[:200]}"
                )

            content = ""
            tool_calls: list[dict[str, Any]] = []
            buffer = ""

            for chunk in response.iter_text():
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop() or ""

                for line in lines:
                    trimmed = line.strip()
                    if not trimmed.startswith("data:"):
                        continue

                    data = trimmed[5:].strip()
                    if not data or data == "[DONE]":
                        continue

                    try:
                        parsed = json.loads(data)
                    except Exception:
                        continue

                    delta = (parsed.get("choices") or [{}])[0].get("delta") or {}
                    if not delta:
                        continue

                    if delta.get("content"):
                        content += delta["content"]
                        on_chunk(delta["content"])

                    for part in delta.get("tool_calls") or []:
                        call_index = part.get("index") or 0
                        while len(tool_calls) <= call_index:
                            tool_calls.append(
                                {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                }
                            )

                        if part.get("id"):
                            tool_calls[call_index]["id"] = part["id"]

                        function = part.get("function") or {}
                        if function.get("name"):
                            tool_calls[call_index]["function"]["name"] += function[
                                "name"
                            ]
                        if function.get("arguments"):
                            tool_calls[call_index]["function"][
                                "arguments"
                            ] += function["arguments"]

    return {
        "content": content,
        "tool_calls": [call for call in tool_calls if call],
    }
