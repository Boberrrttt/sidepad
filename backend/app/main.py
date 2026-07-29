import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.ask.router import router as ask_router
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.integrations.router import router as integrations_router
from app.notes.router import router as notes_router
from app.shared import database
from app.shared.exceptions import DomainError, error_message, status_for_message
from app.sync.router import router as sync_router

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    database.close_client()


app = FastAPI(title="SidePad", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(notes_router)
app.include_router(chat_router)
app.include_router(sync_router)
app.include_router(ask_router)
app.include_router(integrations_router)


@app.exception_handler(DomainError)
async def domain_error_handler(_request: Request, caught_error: DomainError):
    message = caught_error.message
    return JSONResponse(
        status_code=status_for_message(message),
        content={"error": message},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, caught_error: HTTPException):
    detail = caught_error.detail
    message = detail if isinstance(detail, str) else str(detail)
    return JSONResponse(
        status_code=caught_error.status_code,
        content={"error": message},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, caught_error: Exception):
    message = error_message(caught_error)
    status = status_for_message(message)
    if message == "unauthorized":
        status = 401
    return JSONResponse(status_code=status, content={"error": message})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT") or 3001)
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
