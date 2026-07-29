from app.integrations import github_project


def fetch_project_board(token: str, org: str, project_number: int):
    return github_project.fetch_github_project_board(token, org, project_number)


def fetch_card_detail(token: str, content_id: str, content_type: str):
    return github_project.fetch_github_card_detail(token, content_id, content_type)


def add_issue_comment(token: str, content_id: str, body: str):
    return github_project.add_github_issue_comment(token, content_id, body)


def update_card_title(
    token: str, content_id: str, content_type: str, title: str
):
    return github_project.update_github_card_title(
        token, content_id, content_type, title
    )


def delete_project_item(token: str, project_id: str, item_id: str):
    return github_project.delete_github_project_item(token, project_id, item_id)


def move_project_item_status(
    token: str,
    project_id: str,
    item_id: str,
    field_id: str,
    option_id: str,
):
    return github_project.move_github_project_item_status(
        token, project_id, item_id, field_id, option_id
    )


def add_draft_card(
    token: str,
    project_id: str,
    title: str,
    viewer_id: str | None = None,
    status_field_id: str | None = None,
    status_option_id: str | None = None,
):
    return github_project.add_github_draft_card(
        token,
        project_id,
        title,
        viewer_id,
        status_field_id,
        status_option_id,
    )
