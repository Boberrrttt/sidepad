from fastapi import Cookie, HTTPException

from app.shared.session import COOKIE, read_session


async def require_user(
    sidepad_session: str | None = Cookie(default=None, alias=COOKIE),
) -> str:
    user_id = read_session(sidepad_session)

    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    return user_id
