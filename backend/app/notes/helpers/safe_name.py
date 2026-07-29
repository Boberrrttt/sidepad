from app.shared.exceptions import DomainError


def safe_name(name: str) -> str:
    base = str(name).replace("/", "").replace("\\", "")
    if base.lower().endswith(".md"):
        base = base[:-3]
    base = base.strip()

    if not base or base == "." or base == "..":
        raise DomainError("bad note name")

    return base
