import secrets
import time

from app.auth import users_repository
from app.auth.helpers.passwords import check_password, hash_password
from app.shared.exceptions import DomainError


def create_user(username: str, password: str) -> str:
    cleaned_username = username.strip().lower()

    if (
        not cleaned_username
        or len(cleaned_username) < 2
        or any(char.isspace() for char in cleaned_username)
    ):
        raise DomainError("bad username")

    if len(password) < 6:
        raise DomainError("password too short")

    user_id = secrets.token_hex(16)

    try:
        users_repository.insert_user(
            user_id,
            cleaned_username,
            hash_password(password),
            int(time.time() * 1000),
        )
    except Exception:
        raise DomainError("username taken") from None

    return user_id


def login_user(username: str, password: str) -> str:
    cleaned_username = username.strip().lower()
    row = users_repository.find_user_by_username(cleaned_username)

    if not row:
        raise DomainError("bad login")
    if not check_password(password, row["password_hash"]):
        raise DomainError("bad login")

    return row["id"]
