import hashlib
import hmac
import os

COOKIE = "sidepad_session"


def _secret() -> str:
    value = str(os.environ.get("SESSION_SECRET") or "").strip()
    if not value:
        raise RuntimeError("Set SESSION_SECRET")
    return value


def _hmac_hex(message: str) -> str:
    return hmac.new(
        _secret().encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _safe_equal(left: str, right: str) -> bool:
    if len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def sign_session(user_id: str) -> str:
    return f"{user_id}.{_hmac_hex(user_id)}"


def read_session(token: str | None) -> str | None:
    if not token or "." not in token:
        return None

    separator_index = token.index(".")
    user_id = token[:separator_index]
    signature = token[separator_index + 1 :]

    if not user_id or not signature:
        return None

    try:
        expected = _hmac_hex(user_id)
        if not _safe_equal(signature, expected):
            return None
        return user_id
    except Exception:
        return None
