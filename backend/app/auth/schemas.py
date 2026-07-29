from pydantic import BaseModel


class AuthBody(BaseModel):
    username: str = ""
    password: str = ""
