import {
  GITHUB_ACCESS_ERROR,
  githubGraphql,
  isAssignedToViewer,
  projectItemFields,
  type ProjectItem,
  slug,
  stripGithubTitlePrefix,
} from '@/server/integrations/helpers/github';
import type {
  BoardData,
  GithubCardComment,
  GithubCardContentType,
  GithubCardDetail,
  GithubCardTimelineItem,
  GithubLinkedPullRequest,
} from '@/shared/types';

type FieldOption = { id: string; name: string };

type ProjectNode = {
  id: string;
  fields: {
    nodes: Array<{
      id?: string;
      name?: string;
      options?: FieldOption[];
    } | null>;
  };
  items: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<ProjectItem | null>;
  };
};

type GraphqlData = {
  viewer?: { id?: string; login?: string } | null;
  organization?: {
    projectV2?: ProjectNode | null;
  } | null;
};

const QUERY = `
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
`;

export async function fetchGithubProjectBoard(
  token: string,
  org: string,
  projectNumber: number
): Promise<BoardData> {
  let cursor: string | null = null;
  let viewerLogin = '';
  let viewerId: string | undefined;
  let projectId = '';
  let fields: ProjectNode['fields']['nodes'] = [];
  const items: ProjectItem[] = [];

  do {
    const data: GraphqlData = await githubGraphql<GraphqlData>(token, QUERY, {
      org,
      number: projectNumber,
      cursor,
    });

    const nextLogin = data.viewer?.login?.trim();
    if (!nextLogin) {
      throw new Error(GITHUB_ACCESS_ERROR);
    }

    viewerLogin = nextLogin;
    viewerId = data.viewer?.id;

    const project: ProjectNode | null | undefined =
      data.organization?.projectV2;
    if (!project) {
      throw new Error(
        'Project not found, or token lacks access to that org/project'
      );
    }

    projectId = project.id;
    fields = project.fields.nodes;

    for (const item of project.items.nodes) {
      if (item) items.push(item);
    }

    const nextCursor = project.items.pageInfo.hasNextPage
      ? project.items.pageInfo.endCursor
      : null;
    cursor = nextCursor;
  } while (cursor);

  const statusField =
    fields.find(
      (field) => field?.options && field.name?.toLowerCase() === 'status'
    ) || fields.find((field) => field?.options?.length);

  const options = statusField?.options?.length
    ? statusField.options
    : [{ id: 'none', name: 'No status' }];

  const columns = options.map((option) => ({
    id: `gh-${slug(option.name)}`,
    name: option.name,
    cards: [] as BoardData['columns'][number]['cards'],
  }));

  const statusOptions: Record<string, string> = {};
  if (statusField?.options) {
    for (const option of statusField.options) {
      statusOptions[`gh-${slug(option.name)}`] = option.id;
    }
  }

  const columnByName = new Map(
    columns.map((column) => [column.name.toLowerCase(), column])
  );

  const fallback =
    columnByName.get('no status') ||
    columns[0] ||
    ({
      id: 'gh-no-status',
      name: 'No status',
      cards: [],
    } satisfies BoardData['columns'][number]);

  if (!columnByName.has(fallback.name.toLowerCase())) {
    columns.push(fallback);
    columnByName.set(fallback.name.toLowerCase(), fallback);
  }

  for (const item of items) {
    if (!isAssignedToViewer(item, viewerLogin)) continue;

    const titleBase = item.content?.title?.trim() || 'Untitled';
    const title =
      item.content?.number != null
        ? `#${item.content.number} ${titleBase}`
        : titleBase;

    const statusValue = item.fieldValues.nodes.find(
      (value) =>
        value?.name &&
        (!statusField?.name ||
          value.field?.name?.toLowerCase() === statusField.name.toLowerCase())
    );

    const column =
      columnByName.get((statusValue?.name || '').toLowerCase()) || fallback;

    const typename = item.content?.__typename;
    const contentType =
      typename === 'Issue' ||
      typename === 'PullRequest' ||
      typename === 'DraftIssue'
        ? typename
        : undefined;

    const labels =
      item.content?.labels?.nodes
        ?.map((label) => label?.name?.trim())
        .filter((name): name is string => Boolean(name)) ?? [];

    const assignees =
      item.content?.assignees?.nodes
        ?.map((user) => user?.login?.trim())
        .filter((login): login is string => Boolean(login)) ?? [];

    const rawState = item.content?.state?.toUpperCase();
    const state =
      rawState === 'OPEN' || rawState === 'CLOSED' ? rawState : undefined;

    const url = item.content?.url?.trim() || undefined;
    const fields = projectItemFields(item);

    column.cards.push({
      id: item.id,
      title,
      contentId: item.content?.id,
      contentType,
      url,
      state,
      labels: labels.length ? labels : undefined,
      assignees: assignees.length ? assignees : undefined,
      fields: fields.length ? fields : undefined,
    });
  }

  return {
    v: 1,
    github: {
      projectId,
      org,
      projectNumber,
      viewerId,
      statusFieldId: statusField?.id,
      statusOptions:
        Object.keys(statusOptions).length > 0 ? statusOptions : undefined,
    },
    columns,
  };
}

export async function updateGithubCardTitle(
  token: string,
  contentId: string,
  contentType: GithubCardContentType,
  title: string
) {
  const cleanTitle = stripGithubTitlePrefix(title);
  if (!cleanTitle) throw new Error('Title required');

  if (contentType === 'Issue') {
    await githubGraphql(token, `
      mutation($id: ID!, $title: String!) {
        updateIssue(input: { id: $id, title: $title }) { issue { id } }
      }
    `, { id: contentId, title: cleanTitle });
    return;
  }

  if (contentType === 'PullRequest') {
    await githubGraphql(token, `
      mutation($id: ID!, $title: String!) {
        updatePullRequest(input: { pullRequestId: $id, title: $title }) {
          pullRequest { id }
        }
      }
    `, { id: contentId, title: cleanTitle });
    return;
  }

  await githubGraphql(token, `
    mutation($id: ID!, $title: String!) {
      updateProjectV2DraftIssue(input: { draftIssueId: $id, title: $title }) {
        draftIssue { id }
      }
    }
  `, { id: contentId, title: cleanTitle });
}

export async function deleteGithubProjectItem(
  token: string,
  projectId: string,
  itemId: string
) {
  await githubGraphql(token, `
    mutation($projectId: ID!, $itemId: ID!) {
      deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
        deletedItemId
      }
    }
  `, { projectId, itemId });
}

export async function moveGithubProjectItemStatus(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
) {
  await githubGraphql(token, `
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
  `, { projectId, itemId, fieldId, optionId });
}

export async function addGithubDraftCard(
  token: string,
  projectId: string,
  title: string,
  viewerId?: string,
  statusFieldId?: string,
  statusOptionId?: string
) {
  const cleanTitle = stripGithubTitlePrefix(title) || 'Untitled';
  const data = await githubGraphql<{
    addProjectV2DraftIssue?: {
      projectItem?: {
        id?: string;
        content?: { id?: string; __typename?: string } | null;
      } | null;
    } | null;
  }>(
    token,
    `
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
  `,
    {
      projectId,
      title: cleanTitle,
      assigneeIds: viewerId ? [viewerId] : [],
    }
  );

  const item = data.addProjectV2DraftIssue?.projectItem;
  const itemId = item?.id;
  const contentId = item?.content?.id;

  if (!itemId || !contentId) {
    throw new Error('GitHub draft create failed');
  }

  if (statusFieldId && statusOptionId) {
    await moveGithubProjectItemStatus(
      token,
      projectId,
      itemId,
      statusFieldId,
      statusOptionId
    );
  }

  return {
    itemId,
    contentId,
    contentType: 'DraftIssue' as const,
    title: cleanTitle,
  };
}

type ActorLogin = { login?: string } | null;

type PullRef = {
  number?: number;
  title?: string;
  url?: string;
  state?: string;
} | null;

type DetailNode = {
  body?: string | null;
  comments?: {
    nodes: Array<{
      id?: string;
      body?: string;
      createdAt?: string;
      author?: ActorLogin;
    } | null> | null;
  } | null;
  closedByPullRequestsReferences?: {
    nodes: Array<PullRef> | null;
  } | null;
  timelineItems?: {
    nodes: Array<{
      __typename?: string;
      id?: string;
      createdAt?: string;
      actor?: ActorLogin;
      label?: { name?: string } | null;
      assignee?: ActorLogin;
      previousTitle?: string;
      currentTitle?: string;
      previousStatus?: string | null;
      status?: string | null;
      closer?: PullRef;
      subject?: PullRef;
    } | null> | null;
  } | null;
};

const COMMENT_FIELDS = `
  body
  comments(first: 50) {
    nodes {
      id
      body
      createdAt
      author { login }
    }
  }
`;

const TIMELINE_FIELDS = `
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
`;

function pushPull(
  list: GithubLinkedPullRequest[],
  seen: Set<number>,
  pull: PullRef
) {
  if (!pull?.number || !pull.url || !pull.title) return;
  if (seen.has(pull.number)) return;

  seen.add(pull.number);
  list.push({
    number: pull.number,
    title: pull.title,
    url: pull.url,
    state: pull.state || undefined,
  });
}

function formatTimeline(
  node: NonNullable<NonNullable<DetailNode['timelineItems']>['nodes']>[number]
): GithubCardTimelineItem | null {
  if (!node?.__typename || !node.createdAt) return null;

  const actor = node.actor?.login || 'someone';
  const id = node.id || `${node.__typename}-${node.createdAt}`;
  const at = node.createdAt;

  if (node.__typename === 'LabeledEvent' && node.label?.name) {
    return { id, at, text: `${actor} added label ${node.label.name}` };
  }

  if (node.__typename === 'UnlabeledEvent' && node.label?.name) {
    return { id, at, text: `${actor} removed label ${node.label.name}` };
  }

  if (node.__typename === 'AssignedEvent' && node.assignee?.login) {
    return { id, at, text: `${actor} assigned ${node.assignee.login}` };
  }

  if (node.__typename === 'UnassignedEvent' && node.assignee?.login) {
    return { id, at, text: `${actor} unassigned ${node.assignee.login}` };
  }

  if (node.__typename === 'ClosedEvent') {
    if (node.closer?.number) {
      return {
        id,
        at,
        text: `${actor} closed via PR #${node.closer.number}`,
      };
    }

    return { id, at, text: `${actor} closed this` };
  }

  if (node.__typename === 'ReopenedEvent') {
    return { id, at, text: `${actor} reopened this` };
  }

  if (node.__typename === 'RenamedTitleEvent') {
    return {
      id,
      at,
      text: `${actor} renamed "${node.previousTitle || ''}" to "${node.currentTitle || ''}"`,
    };
  }

  if (node.__typename === 'ConnectedEvent' && node.subject?.number) {
    return {
      id,
      at,
      text: `Linked PR #${node.subject.number} ${node.subject.title || ''}`.trim(),
    };
  }

  if (node.__typename === 'ProjectV2ItemStatusChangedEvent') {
    const from = node.previousStatus || '?';
    const toStatus = node.status || '?';
    return { id, at, text: `${actor} moved ${from} to ${toStatus}` };
  }

  return null;
}

function parseDetailNode(node: DetailNode | null | undefined): GithubCardDetail {
  const comments: GithubCardComment[] = [];
  const timeline: GithubCardTimelineItem[] = [];
  const linkedPullRequests: GithubLinkedPullRequest[] = [];
  const seenPulls = new Set<number>();

  for (const comment of node?.comments?.nodes ?? []) {
    if (!comment?.id) continue;

    comments.push({
      id: comment.id,
      body: comment.body || '',
      createdAt: comment.createdAt || '',
      author: comment.author?.login || 'unknown',
    });
  }

  for (const pull of node?.closedByPullRequestsReferences?.nodes ?? []) {
    pushPull(linkedPullRequests, seenPulls, pull);
  }

  for (const event of node?.timelineItems?.nodes ?? []) {
    const item = formatTimeline(event);
    if (item) timeline.push(item);

    if (!event) continue;

    if (event.__typename === 'ConnectedEvent') {
      pushPull(linkedPullRequests, seenPulls, event.subject ?? null);
    }

    if (event.__typename === 'ClosedEvent') {
      pushPull(linkedPullRequests, seenPulls, event.closer ?? null);
    }
  }

  timeline.sort((left, right) => left.at.localeCompare(right.at));

  return {
    body: node?.body?.trim() || undefined,
    comments,
    timeline,
    linkedPullRequests,
  };
}

export async function fetchGithubCardDetail(
  token: string,
  contentId: string,
  contentType: GithubCardContentType
): Promise<GithubCardDetail> {
  if (contentType === 'DraftIssue') {
    const data = await githubGraphql<{ node?: DetailNode | null }>(
      token,
      `
      query($id: ID!) {
        node(id: $id) {
          ... on DraftIssue { body }
        }
      }
    `,
      { id: contentId },
      { allowErrors: true }
    );

    return {
      body: data.node?.body?.trim() || undefined,
      comments: [],
      timeline: [],
      linkedPullRequests: [],
    };
  }

  const typeSpread =
    contentType === 'Issue' ? '... on Issue' : '... on PullRequest';
  const issueExtras =
    contentType === 'Issue'
      ? `closedByPullRequestsReferences(first: 10) {
          nodes { number title url state }
        }`
      : '';

  const data = await githubGraphql<{ node?: DetailNode | null }>(
    token,
    `
    query($id: ID!) {
      node(id: $id) {
        ${typeSpread} {
          ${COMMENT_FIELDS}
          ${issueExtras}
          ${TIMELINE_FIELDS}
        }
      }
    }
  `,
    { id: contentId },
    { allowErrors: true }
  );

  return parseDetailNode(data.node);
}

export async function addGithubIssueComment(
  token: string,
  contentId: string,
  body: string
): Promise<GithubCardComment> {
  const text = body.trim();
  if (!text) throw new Error('Comment required');

  const data = await githubGraphql<{
    addComment?: {
      commentEdge?: {
        node?: {
          id?: string;
          body?: string;
          createdAt?: string;
          author?: ActorLogin;
        } | null;
      } | null;
    } | null;
  }>(
    token,
    `
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
  `,
    { id: contentId, body: text }
  );

  const node = data.addComment?.commentEdge?.node;
  if (!node?.id || !node.body) {
    throw new Error('GitHub comment create failed');
  }

  return {
    id: node.id,
    body: node.body,
    createdAt: node.createdAt || '',
    author: node.author?.login || 'unknown',
  };
}
