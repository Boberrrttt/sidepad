from typing import Any, Literal

from pydantic import BaseModel

GithubCardContentType = Literal["Issue", "PullRequest", "DraftIssue"]


class GithubAssetBody(BaseModel):
    projectId: str | None = None
    url: str | None = None


class GithubCardBody(BaseModel):
    projectId: str | None = None
    action: str | None = None
    contentId: str | None = None
    contentType: GithubCardContentType | None = None
    title: str | None = None
    body: str | None = None
    itemId: str | None = None
    fieldId: str | None = None
    optionId: str | None = None
    viewerId: str | None = None
    statusFieldId: str | None = None
    statusOptionId: str | None = None


class GithubProjectBody(BaseModel):
    action: str | None = None
    token: str | None = None
    org: str | None = None
    project: Any = None
    projectId: str | None = None
