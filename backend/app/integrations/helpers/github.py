import re
from typing import Any

import httpx

GITHUB_ACCESS_ERROR = (
    "GitHub token lacks access. Use a classic PAT with repo + project "
    "(read:project for pull)."
)


def project_item_fields(item: dict[str, Any]) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []

    for value in (item.get("fieldValues") or {}).get("nodes") or []:
        if not value:
            continue

        field_name = ((value.get("field") or {}).get("name") or "").strip()
        if not field_name:
            continue

        key = field_name.lower()
        if key in ("status", "assignees"):
            continue

        if value.get("users"):
            continue

        if value.get("text") is not None and value.get("text") != "":
            fields.append({"name": field_name, "value": value["text"]})
            continue

        if value.get("number") is not None:
            fields.append({"name": field_name, "value": str(value["number"])})
            continue

        if value.get("date"):
            fields.append({"name": field_name, "value": value["date"]})
            continue

        if value.get("title"):
            fields.append({"name": field_name, "value": value["title"]})
            continue

        if value.get("name"):
            fields.append({"name": field_name, "value": value["name"]})

    return fields


def is_github_access_error(message: str) -> bool:
    return message == GITHUB_ACCESS_ERROR or bool(
        re.search(
            r"lacks access|bad credentials|forbidden|not authorized",
            message,
            re.I,
        )
    )


def is_github_not_connected(message: str) -> bool:
    return "GitHub not connected" in message


def _assert_github_access(status: int, errors: list[dict] | None = None) -> None:
    if status in (401, 403):
        raise RuntimeError(GITHUB_ACCESS_ERROR)

    if not errors:
        return

    joined = " ".join(error.get("message") or "" for error in errors)
    if re.search(r"forbidden|unauthorized|scope|credentials", joined, re.I):
        raise RuntimeError(GITHUB_ACCESS_ERROR)


def _has_login(users: dict | None, login: str) -> bool:
    nodes = (users or {}).get("nodes") or []
    return any(
        (user or {}).get("login", "").lower() == login.lower() for user in nodes
    )


def is_assigned_to_viewer(item: dict[str, Any], login: str) -> bool:
    content = item.get("content") or {}
    if _has_login(content.get("assignees"), login):
        return True

    for value in (item.get("fieldValues") or {}).get("nodes") or []:
        if not value:
            continue
        field_name = ((value.get("field") or {}).get("name") or "").lower()
        if (
            value.get("users")
            and field_name == "assignees"
            and _has_login(value.get("users"), login)
        ):
            return True

    return False


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "col"


def strip_github_title_prefix(title: str) -> str:
    return re.sub(r"^#\d+\s+", "", title).strip()


def github_graphql(
    token: str,
    query: str,
    variables: dict[str, Any],
    *,
    allow_errors: bool = False,
) -> Any:
    response = httpx.post(
        "https://api.github.com/graphql",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={"query": query, "variables": variables},
        timeout=60.0,
    )

    if not response.is_success:
        _assert_github_access(response.status_code)
        raise RuntimeError(f"GitHub HTTP {response.status_code}")

    payload = response.json()
    errors = payload.get("errors")

    if not allow_errors:
        _assert_github_access(response.status_code, errors)
    else:
        _assert_github_access(response.status_code)

    if errors and not allow_errors:
        raise RuntimeError(errors[0].get("message") or "GitHub GraphQL error")

    data = payload.get("data")
    if data is None:
        raise RuntimeError(
            (errors[0].get("message") if errors else None)
            or "GitHub GraphQL empty response"
        )

    return data
