from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response

import httpx

from app.deps import require_user
from app.integrations import github_service, github_tokens_repository
from app.integrations.helpers.github import (
    is_github_access_error,
    is_github_not_connected,
)
from app.integrations.schemas import (
    GithubAssetBody,
    GithubCardBody,
    GithubProjectBody,
)
from app.shared.exceptions import DomainError, error_message
from app.shared.github_assets import is_github_asset_url

router = APIRouter(prefix="/api/integrations/github", tags=["integrations"])


def _rethrow_github(caught_error: Exception) -> None:
    message = error_message(caught_error)

    if is_github_access_error(message) or is_github_not_connected(message):
        raise HTTPException(status_code=403, detail=message)

    raise caught_error


@router.post("/asset")
def github_asset(body: GithubAssetBody, user_id: str = Depends(require_user)):
    try:
        project_id = str(body.projectId or "").strip()
        asset_url = str(body.url or "").strip()

        if not project_id or not asset_url or not is_github_asset_url(asset_url):
            raise DomainError("bad request")

        token = github_tokens_repository.require_stored_github_token(
            user_id, project_id
        )

        upstream = httpx.get(
            asset_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/octet-stream",
            },
            follow_redirects=True,
            timeout=60.0,
        )

        if upstream.status_code in (401, 403):
            raise HTTPException(
                status_code=403, detail="GitHub asset access denied"
            )

        if not upstream.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub asset HTTP {upstream.status_code}",
            )

        content_type = (
            upstream.headers.get("content-type") or "application/octet-stream"
        )
        return Response(
            content=upstream.content,
            media_type=content_type,
            headers={"Cache-Control": "private, max-age=3600"},
        )
    except Exception as caught_error:
        message = error_message(caught_error)

        if is_github_access_error(message) or is_github_not_connected(message):
            return JSONResponse(
                status_code=403, content={"error": message}
            )

        if isinstance(caught_error, HTTPException):
            return JSONResponse(
                status_code=caught_error.status_code,
                content={"error": str(caught_error.detail)},
            )

        if isinstance(caught_error, DomainError):
            status = 400 if message == "bad request" else 500
            return JSONResponse(status_code=status, content={"error": message})

        status = 400 if message == "bad request" else 500
        return JSONResponse(status_code=status, content={"error": message})


@router.post("/card")
def github_card(body: GithubCardBody, user_id: str = Depends(require_user)):
    try:
        project_id = str(body.projectId or "").strip()
        action = str(body.action or "").strip()

        if not project_id or not action:
            raise DomainError("bad request")

        token = github_tokens_repository.require_stored_github_token(
            user_id, project_id
        )

        if action == "detail":
            content_id = str(body.contentId or "").strip()
            content_type = body.contentType

            if not content_id or content_type not in (
                "Issue",
                "PullRequest",
                "DraftIssue",
            ):
                raise DomainError("bad request")

            return github_service.fetch_card_detail(
                token, content_id, content_type
            )

        if action == "comment":
            content_id = str(body.contentId or "").strip()
            comment_body = str(body.body or "")

            if not content_id or not comment_body.strip():
                raise DomainError("bad request")

            return github_service.add_issue_comment(
                token, content_id, comment_body
            )

        if action == "rename":
            content_id = str(body.contentId or "").strip()
            content_type = body.contentType
            title = str(body.title or "")

            if not content_id or content_type not in (
                "Issue",
                "PullRequest",
                "DraftIssue",
            ):
                raise DomainError("bad request")

            github_service.update_card_title(
                token, content_id, content_type, title
            )
            return {"ok": True}

        if action == "delete":
            item_id = str(body.itemId or "").strip()
            if not item_id:
                raise DomainError("bad request")

            github_service.delete_project_item(token, project_id, item_id)
            return {"ok": True}

        if action == "move":
            item_id = str(body.itemId or "").strip()
            field_id = str(body.fieldId or "").strip()
            option_id = str(body.optionId or "").strip()

            if not item_id or not field_id or not option_id:
                raise DomainError("bad request")

            github_service.move_project_item_status(
                token, project_id, item_id, field_id, option_id
            )
            return {"ok": True}

        if action == "add":
            title = str(body.title or "Untitled")
            viewer_id = str(body.viewerId or "").strip() or None
            status_field_id = str(body.statusFieldId or "").strip() or None
            status_option_id = str(body.statusOptionId or "").strip() or None

            return github_service.add_draft_card(
                token,
                project_id,
                title,
                viewer_id,
                status_field_id,
                status_option_id,
            )

        raise DomainError("bad request")
    except Exception as caught_error:
        _rethrow_github(caught_error)


@router.post("/project")
def github_project_route(
    body: GithubProjectBody, user_id: str = Depends(require_user)
):
    try:
        action = str(body.action or "sync").strip()
        project_id = str(body.projectId or "").strip()

        if action == "disconnect":
            if not project_id:
                raise DomainError("bad request")

            github_tokens_repository.delete_github_token(user_id, project_id)
            return {"ok": True}

        org = str(body.org or "").strip()
        token_input = str(body.token or "").strip()

        try:
            project_number_int = int(body.project)
        except (TypeError, ValueError):
            raise DomainError("bad request") from None

        if not org or project_number_int < 1:
            raise DomainError("bad request")

        token = token_input

        if not token:
            if not project_id:
                raise DomainError("bad request")
            token = github_tokens_repository.require_stored_github_token(
                user_id, project_id
            )

        board = github_service.fetch_project_board(
            token, org, project_number_int
        )

        if not (board.get("github") or {}).get("projectId"):
            raise HTTPException(
                status_code=502, detail="GitHub sync returned no project id"
            )

        if token_input:
            github_tokens_repository.upsert_github_token(
                user_id, board["github"]["projectId"], token_input
            )

        return board
    except Exception as caught_error:
        _rethrow_github(caught_error)
