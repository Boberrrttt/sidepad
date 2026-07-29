import json
import queue
import threading
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.ask import service
from app.ask.schemas import AskBody
from app.deps import require_user
from app.shared.exceptions import error_message

router = APIRouter(prefix="/api/ask", tags=["ask"])


@router.post("")
def ask(body: AskBody, user_id: str = Depends(require_user)):
    if not body.name or not (body.message or "").strip():

        def bad_request() -> Iterator[str]:
            yield json.dumps({"type": "error", "message": "bad request"}) + "\n"

        return StreamingResponse(
            bad_request(),
            media_type="application/x-ndjson",
            status_code=400,
        )

    note_name = body.name
    message = body.message or ""

    def generate() -> Iterator[str]:
        event_queue: queue.Queue[str | None] = queue.Queue()

        def emit(ask_event: dict) -> None:
            event_queue.put(json.dumps(ask_event) + "\n")

        def worker() -> None:
            try:
                service.run_ask(user_id, note_name, message, emit)
            except Exception as caught_error:
                emit({"type": "error", "message": error_message(caught_error)})
            finally:
                event_queue.put(None)

        threading.Thread(target=worker, daemon=True).start()

        while True:
            item = event_queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"},
    )
