import os
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response

from app.auth import service
from app.auth.schemas import AuthBody
from app.deps import require_user
from app.shared.session import COOKIE, sign_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session(response: Response, user_id: str) -> None:
    token = quote(sign_session(user_id), safe="")
    secure = "; Secure" if os.environ.get("NODE_ENV") == "production" else ""
    max_age = 60 * 60 * 24 * 365
    response.headers["set-cookie"] = (
        f"{COOKIE}={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={max_age}{secure}"
    )


@router.post("/login")
def login(body: AuthBody, response: Response):
    user_id = service.login_user(body.username, body.password)
    _set_session(response, user_id)
    return {"ok": True, "userId": user_id}


@router.post("/register")
def register(body: AuthBody, response: Response):
    user_id = service.create_user(body.username, body.password)
    _set_session(response, user_id)
    return {"ok": True, "userId": user_id}


@router.post("/logout")
def logout(response: Response):
    response.headers["set-cookie"] = (
        f"{COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    )
    return {"ok": True}


@router.get("/me")
def me(user_id: str = Depends(require_user)):
    return {"userId": user_id}
