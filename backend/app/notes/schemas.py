from pydantic import BaseModel, ConfigDict, Field


class NoteWriteBody(BaseModel):
    name: str | None = None
    body: str = ""
    board: str | None = None
    mtime: int | None = None


class NoteRenameBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_name: str | None = Field(default=None, alias="from")
    to_name: str | None = Field(default=None, alias="to")
    mtime: int | None = None
