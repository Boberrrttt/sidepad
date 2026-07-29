from app.chat import service as chat_service
from app.notes import service as notes_service


def pull_sync(user_id: str) -> dict:
    return {
        "notes": notes_service.list_notes(user_id),
        "chats": chat_service.list_chats(user_id),
    }
