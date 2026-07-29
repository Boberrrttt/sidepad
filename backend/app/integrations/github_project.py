from typing import Any

from app.integrations.helpers.github import (
    GITHUB_ACCESS_ERROR,
    github_graphql,
    is_assigned_to_viewer,
    project_item_fields,
    slug,
    strip_github_title_prefix,
)

QUERY = """
query($org: String!, $number: Int!, $cursor: String) {
  viewer { id login }
  organization(login: $org) {
    projectV2(number: $number) {
      id
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options { id name }
          }
        }
      }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField { name }
                }
              }
              ... on ProjectV2ItemFieldUserValue {
                field {
                  ... on ProjectV2FieldCommon { name }
                }
                users(first: 10) {
                  nodes { login }
                }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2FieldCommon { name }
                }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field {
                  ... on ProjectV2FieldCommon { name }
                }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field {
                  ... on ProjectV2FieldCommon { name }
                }
              }
              ... on ProjectV2ItemFieldIterationValue {
                title
                field {
                  ... on ProjectV2IterationField { name }
                }
              }
            }
          }
          content {
            ... on Issue {
              __typename
              id
              title
              number
              state
              url
              labels(first: 10) { nodes { name } }
              assignees(first: 10) { nodes { login } }
            }
            ... on PullRequest {
              __typename
              id
              title
              number
              state
              url
              labels(first: 10) { nodes { name } }
              assignees(first: 10) { nodes { login } }
            }
            ... on DraftIssue {
              __typename
              id
              title
              assignees(first: 10) { nodes { login } }
            }
          }
        }
      }
    }
  }
}
"""

COMMENT_FIELDS = """
  body
  comments(first: 50) {
    nodes {
      id
      body
      createdAt
      author { login }
    }
  }
"""

TIMELINE_FIELDS = """
  timelineItems(
    first: 50
    itemTypes: [
      LABELED_EVENT
      UNLABELED_EVENT
      ASSIGNED_EVENT
      UNASSIGNED_EVENT
      CLOSED_EVENT
      REOPENED_EVENT
      RENAMED_TITLE_EVENT
      CONNECTED_EVENT
      PROJECT_V2_ITEM_STATUS_CHANGED_EVENT
    ]
  ) {
    nodes {
      __typename
      ... on LabeledEvent {
        id
        createdAt
        actor { login }
        label { name }
      }
      ... on UnlabeledEvent {
        id
        createdAt
        actor { login }
        label { name }
      }
      ... on AssignedEvent {
        id
        createdAt
        actor { login }
        assignee {
          ... on User { login }
          ... on Bot { login }
          ... on Mannequin { login }
          ... on Organization { login }
        }
      }
      ... on UnassignedEvent {
        id
        createdAt
        actor { login }
        assignee {
          ... on User { login }
          ... on Bot { login }
          ... on Mannequin { login }
          ... on Organization { login }
        }
      }
      ... on ClosedEvent {
        id
        createdAt
        actor { login }
        closer {
          ... on PullRequest { number title url state }
        }
      }
      ... on ReopenedEvent {
        id
        createdAt
        actor { login }
      }
      ... on RenamedTitleEvent {
        id
        createdAt
        actor { login }
        previousTitle
        currentTitle
      }
      ... on ConnectedEvent {
        id
        createdAt
        subject {
          ... on PullRequest { number title url state }
        }
      }
      ... on ProjectV2ItemStatusChangedEvent {
        id
        createdAt
        actor { login }
        previousStatus
        status
      }
    }
  }
"""


def fetch_github_project_board(
    token: str, org: str, project_number: int
) -> dict[str, Any]:
    cursor: str | None = None
    viewer_login = ""
    viewer_id: str | None = None
    project_id = ""
    field_nodes: list[dict[str, Any] | None] = []
    items: list[dict[str, Any]] = []

    while True:
        data = github_graphql(
            token,
            QUERY,
            {"org": org, "number": project_number, "cursor": cursor},
        )

        next_login = ((data.get("viewer") or {}).get("login") or "").strip()
        if not next_login:
            raise RuntimeError(GITHUB_ACCESS_ERROR)

        viewer_login = next_login
        viewer_id = (data.get("viewer") or {}).get("id")

        project = (data.get("organization") or {}).get("projectV2")
        if not project:
            raise RuntimeError(
                "Project not found, or token lacks access to that org/project"
            )

        project_id = project["id"]
        field_nodes = (project.get("fields") or {}).get("nodes") or []

        for item in (project.get("items") or {}).get("nodes") or []:
            if item:
                items.append(item)

        page_info = (project.get("items") or {}).get("pageInfo") or {}
        next_cursor = (
            page_info.get("endCursor") if page_info.get("hasNextPage") else None
        )
        cursor = next_cursor

        if not cursor:
            break

    status_field = next(
        (
            field
            for field in field_nodes
            if field
            and field.get("options")
            and (field.get("name") or "").lower() == "status"
        ),
        None,
    )
    if not status_field:
        status_field = next(
            (
                field
                for field in field_nodes
                if field and field.get("options")
            ),
            None,
        )

    options = (
        status_field["options"]
        if status_field and status_field.get("options")
        else [{"id": "none", "name": "No status"}]
    )

    columns = [
        {
            "id": f"gh-{slug(option['name'])}",
            "name": option["name"],
            "cards": [],
        }
        for option in options
    ]

    status_options: dict[str, str] = {}
    if status_field and status_field.get("options"):
        for option in status_field["options"]:
            status_options[f"gh-{slug(option['name'])}"] = option["id"]

    column_by_name = {
        column["name"].lower(): column for column in columns
    }

    fallback = (
        column_by_name.get("no status")
        or (columns[0] if columns else None)
        or {"id": "gh-no-status", "name": "No status", "cards": []}
    )

    if fallback["name"].lower() not in column_by_name:
        columns.append(fallback)
        column_by_name[fallback["name"].lower()] = fallback

    for item in items:
        if not is_assigned_to_viewer(item, viewer_login):
            continue

        content = item.get("content") or {}
        title_base = (content.get("title") or "").strip() or "Untitled"
        title = (
            f"#{content['number']} {title_base}"
            if content.get("number") is not None
            else title_base
        )

        status_field_name = (
            (status_field.get("name") or "").lower() if status_field else ""
        )
        status_value = next(
            (
                value
                for value in (item.get("fieldValues") or {}).get("nodes") or []
                if value
                and value.get("name")
                and (
                    not status_field_name
                    or ((value.get("field") or {}).get("name") or "").lower()
                    == status_field_name
                )
            ),
            None,
        )

        column = (
            column_by_name.get((status_value or {}).get("name", "").lower())
            or fallback
        )

        typename = content.get("__typename")
        content_type = (
            typename
            if typename in ("Issue", "PullRequest", "DraftIssue")
            else None
        )

        labels = [
            name
            for name in [
                (label or {}).get("name", "").strip()
                for label in ((content.get("labels") or {}).get("nodes") or [])
            ]
            if name
        ]

        assignees = [
            login
            for login in [
                (user or {}).get("login", "").strip()
                for user in ((content.get("assignees") or {}).get("nodes") or [])
            ]
            if login
        ]

        raw_state = (content.get("state") or "").upper()
        state = raw_state if raw_state in ("OPEN", "CLOSED") else None

        url = (content.get("url") or "").strip() or None
        item_fields = project_item_fields(item)

        card: dict[str, Any] = {
            "id": item["id"],
            "title": title,
            "contentId": content.get("id"),
            "contentType": content_type,
            "url": url,
            "state": state,
            "labels": labels if labels else None,
            "assignees": assignees if assignees else None,
            "fields": item_fields if item_fields else None,
        }
        column["cards"].append(card)

    github_meta: dict[str, Any] = {
        "projectId": project_id,
        "org": org,
        "projectNumber": project_number,
        "viewerId": viewer_id,
        "statusFieldId": status_field.get("id") if status_field else None,
        "statusOptions": status_options if status_options else None,
    }

    return {
        "v": 1,
        "github": github_meta,
        "columns": columns,
    }


def update_github_card_title(
    token: str, content_id: str, content_type: str, title: str
) -> None:
    clean_title = strip_github_title_prefix(title)
    if not clean_title:
        raise RuntimeError("Title required")

    if content_type == "Issue":
        github_graphql(
            token,
            """
      mutation($id: ID!, $title: String!) {
        updateIssue(input: { id: $id, title: $title }) { issue { id } }
      }
    """,
            {"id": content_id, "title": clean_title},
        )
        return

    if content_type == "PullRequest":
        github_graphql(
            token,
            """
      mutation($id: ID!, $title: String!) {
        updatePullRequest(input: { pullRequestId: $id, title: $title }) {
          pullRequest { id }
        }
      }
    """,
            {"id": content_id, "title": clean_title},
        )
        return

    github_graphql(
        token,
        """
    mutation($id: ID!, $title: String!) {
      updateProjectV2DraftIssue(input: { draftIssueId: $id, title: $title }) {
        draftIssue { id }
      }
    }
  """,
        {"id": content_id, "title": clean_title},
    )


def delete_github_project_item(
    token: str, project_id: str, item_id: str
) -> None:
    github_graphql(
        token,
        """
    mutation($projectId: ID!, $itemId: ID!) {
      deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
        deletedItemId
      }
    }
  """,
        {"projectId": project_id, "itemId": item_id},
    )


def move_github_project_item_status(
    token: str,
    project_id: str,
    item_id: str,
    field_id: str,
    option_id: str,
) -> None:
    github_graphql(
        token,
        """
    mutation(
      $projectId: ID!
      $itemId: ID!
      $fieldId: ID!
      $optionId: String!
    ) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item { id }
      }
    }
  """,
        {
            "projectId": project_id,
            "itemId": item_id,
            "fieldId": field_id,
            "optionId": option_id,
        },
    )


def add_github_draft_card(
    token: str,
    project_id: str,
    title: str,
    viewer_id: str | None = None,
    status_field_id: str | None = None,
    status_option_id: str | None = None,
) -> dict[str, Any]:
    clean_title = strip_github_title_prefix(title) or "Untitled"

    data = github_graphql(
        token,
        """
    mutation($projectId: ID!, $title: String!, $assigneeIds: [ID!]) {
      addProjectV2DraftIssue(
        input: {
          projectId: $projectId
          title: $title
          assigneeIds: $assigneeIds
        }
      ) {
        projectItem {
          id
          content {
            ... on DraftIssue { id __typename }
          }
        }
      }
    }
  """,
        {
            "projectId": project_id,
            "title": clean_title,
            "assigneeIds": [viewer_id] if viewer_id else [],
        },
    )

    item = ((data.get("addProjectV2DraftIssue") or {}).get("projectItem")) or {}
    item_id = item.get("id")
    content_id = (item.get("content") or {}).get("id")

    if not item_id or not content_id:
        raise RuntimeError("GitHub draft create failed")

    if status_field_id and status_option_id:
        move_github_project_item_status(
            token,
            project_id,
            item_id,
            status_field_id,
            status_option_id,
        )

    return {
        "itemId": item_id,
        "contentId": content_id,
        "contentType": "DraftIssue",
        "title": clean_title,
    }


def _push_pull(
    pull_list: list[dict[str, Any]],
    seen: set[int],
    pull: dict[str, Any] | None,
) -> None:
    if not pull or not pull.get("number") or not pull.get("url") or not pull.get("title"):
        return

    if pull["number"] in seen:
        return

    seen.add(pull["number"])
    pull_list.append(
        {
            "number": pull["number"],
            "title": pull["title"],
            "url": pull["url"],
            "state": pull.get("state") or None,
        }
    )


def _format_timeline(
    node: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not node or not node.get("__typename") or not node.get("createdAt"):
        return None

    actor = (node.get("actor") or {}).get("login") or "someone"
    event_id = node.get("id") or f"{node['__typename']}-{node['createdAt']}"
    at = node["createdAt"]
    typename = node["__typename"]

    if typename == "LabeledEvent" and (node.get("label") or {}).get("name"):
        return {
            "id": event_id,
            "at": at,
            "text": f"{actor} added label {node['label']['name']}",
        }

    if typename == "UnlabeledEvent" and (node.get("label") or {}).get("name"):
        return {
            "id": event_id,
            "at": at,
            "text": f"{actor} removed label {node['label']['name']}",
        }

    if typename == "AssignedEvent" and (node.get("assignee") or {}).get("login"):
        return {
            "id": event_id,
            "at": at,
            "text": f"{actor} assigned {node['assignee']['login']}",
        }

    if typename == "UnassignedEvent" and (node.get("assignee") or {}).get("login"):
        return {
            "id": event_id,
            "at": at,
            "text": f"{actor} unassigned {node['assignee']['login']}",
        }

    if typename == "ClosedEvent":
        closer = node.get("closer") or {}
        if closer.get("number"):
            return {
                "id": event_id,
                "at": at,
                "text": f"{actor} closed via PR #{closer['number']}",
            }

        return {"id": event_id, "at": at, "text": f"{actor} closed this"}

    if typename == "ReopenedEvent":
        return {"id": event_id, "at": at, "text": f"{actor} reopened this"}

    if typename == "RenamedTitleEvent":
        return {
            "id": event_id,
            "at": at,
            "text": (
                f'{actor} renamed "{node.get("previousTitle") or ""}" '
                f'to "{node.get("currentTitle") or ""}"'
            ),
        }

    if typename == "ConnectedEvent" and (node.get("subject") or {}).get("number"):
        subject = node["subject"]
        return {
            "id": event_id,
            "at": at,
            "text": f"Linked PR #{subject['number']} {subject.get('title') or ''}".strip(),
        }

    if typename == "ProjectV2ItemStatusChangedEvent":
        from_status = node.get("previousStatus") or "?"
        to_status = node.get("status") or "?"
        return {
            "id": event_id,
            "at": at,
            "text": f"{actor} moved {from_status} to {to_status}",
        }

    return None


def _parse_detail_node(node: dict[str, Any] | None) -> dict[str, Any]:
    comments: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    linked_pull_requests: list[dict[str, Any]] = []
    seen_pulls: set[int] = set()

    for comment in ((node or {}).get("comments") or {}).get("nodes") or []:
        if not comment or not comment.get("id"):
            continue

        comments.append(
            {
                "id": comment["id"],
                "body": comment.get("body") or "",
                "createdAt": comment.get("createdAt") or "",
                "author": (comment.get("author") or {}).get("login") or "unknown",
            }
        )

    for pull in (
        ((node or {}).get("closedByPullRequestsReferences") or {}).get("nodes") or []
    ):
        _push_pull(linked_pull_requests, seen_pulls, pull)

    for event in ((node or {}).get("timelineItems") or {}).get("nodes") or []:
        item = _format_timeline(event)
        if item:
            timeline.append(item)

        if not event:
            continue

        if event.get("__typename") == "ConnectedEvent":
            _push_pull(linked_pull_requests, seen_pulls, event.get("subject"))

        if event.get("__typename") == "ClosedEvent":
            _push_pull(linked_pull_requests, seen_pulls, event.get("closer"))

    timeline.sort(key=lambda entry: entry["at"])

    body = ((node or {}).get("body") or "").strip() or None

    return {
        "body": body,
        "comments": comments,
        "timeline": timeline,
        "linkedPullRequests": linked_pull_requests,
    }


def fetch_github_card_detail(
    token: str, content_id: str, content_type: str
) -> dict[str, Any]:
    if content_type == "DraftIssue":
        data = github_graphql(
            token,
            """
      query($id: ID!) {
        node(id: $id) {
          ... on DraftIssue { body }
        }
      }
    """,
            {"id": content_id},
            allow_errors=True,
        )

        body = ((data.get("node") or {}).get("body") or "").strip() or None

        return {
            "body": body,
            "comments": [],
            "timeline": [],
            "linkedPullRequests": [],
        }

    type_spread = (
        "... on Issue" if content_type == "Issue" else "... on PullRequest"
    )
    issue_extras = (
        """closedByPullRequestsReferences(first: 10) {
          nodes { number title url state }
        }"""
        if content_type == "Issue"
        else ""
    )

    data = github_graphql(
        token,
        f"""
    query($id: ID!) {{
      node(id: $id) {{
        {type_spread} {{
          {COMMENT_FIELDS}
          {issue_extras}
          {TIMELINE_FIELDS}
        }}
      }}
    }}
  """,
        {"id": content_id},
        allow_errors=True,
    )

    return _parse_detail_node(data.get("node"))


def add_github_issue_comment(
    token: str, content_id: str, body: str
) -> dict[str, Any]:
    text = body.strip()
    if not text:
        raise RuntimeError("Comment required")

    data = github_graphql(
        token,
        """
    mutation($id: ID!, $body: String!) {
      addComment(input: { subjectId: $id, body: $body }) {
        commentEdge {
          node {
            id
            body
            createdAt
            author { login }
          }
        }
      }
    }
  """,
        {"id": content_id, "body": text},
    )

    node = (
        ((data.get("addComment") or {}).get("commentEdge") or {}).get("node")
    )
    if not node or not node.get("id") or not node.get("body"):
        raise RuntimeError("GitHub comment create failed")

    return {
        "id": node["id"],
        "body": node["body"],
        "createdAt": node.get("createdAt") or "",
        "author": (node.get("author") or {}).get("login") or "unknown",
    }
