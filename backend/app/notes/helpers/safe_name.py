from app.shared.exceptions import DomainError


def safe_name(name: str) -> str:
    base = str(name).replace("\\", "/").strip()
    if base.lower().endswith(".md"):
        base = base[:-3].rstrip()

    if not base or base.startswith("/") or base.endswith("/"):
        raise DomainError("bad note name")

    segments = base.split("/")
    cleaned: list[str] = []

    for segment in segments:
        piece = segment.strip()
        if not piece or piece == "." or piece == "..":
            raise DomainError("bad note name")
        cleaned.append(piece)

    return "/".join(cleaned)
