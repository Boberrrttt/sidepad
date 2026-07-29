STATUS_BY_MESSAGE = {
    "unauthorized": 401,
    "bad login": 401,
    "username taken": 400,
    "bad username": 400,
    "password too short": 400,
    "bad request": 400,
    "note exists": 409,
    "note missing": 404,
    "bad note name": 400,
}


class DomainError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def error_message(caught_error: object) -> str:
    if isinstance(caught_error, DomainError):
        return caught_error.message
    if isinstance(caught_error, Exception):
        return str(caught_error)
    return str(caught_error)


def status_for_message(message: str) -> int:
    return STATUS_BY_MESSAGE.get(message, 500)
