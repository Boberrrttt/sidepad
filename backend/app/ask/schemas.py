from pydantic import BaseModel


class AskBody(BaseModel):
    name: str | None = None
    message: str | None = None
