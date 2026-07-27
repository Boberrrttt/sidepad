import type { BoardData, GithubCardContentType } from '@/shared/types';

type GraphqlError = {
  message: string;
  type?: string;
};

type FieldOption = { id: string; name: string };

type UserNodes = { nodes: Array<{ login: string } | null> | null };

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
    nodes: Array<{
      id: string;
      fieldValues: {
        nodes: Array<{
          name?: string;
          field?: { name?: string } | null;
          users?: UserNodes | null;
        } | null>;
      };
      content: {
        __typename?: string;
        id?: string;
        title?: string;
        number?: number;
        assignees?: UserNodes | null;
      } | null;
    } | null>;
  };
};

type GraphqlData = {
  viewer?: { id?: string; login?: string } | null;
  organization?: {
    projectV2?: ProjectNode | null;
  } | null;
};

const QUERY = `
query($org: String!, $number: Int!) {
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
      items(first: 100) {
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
            }
          }
          content {
            ... on Issue {
              __typename
              id
              title
              number
              assignees(first: 10) { nodes { login } }
            }
            ... on PullRequest {
              __typename
              id
              title
              number
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

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'col';
}

export const GITHUB_ACCESS_ERROR =
  'GitHub token lacks access. Use a classic PAT with repo + project (read:project for pull).';

export function isGithubAccessError(message: string) {
  return (
    message === GITHUB_ACCESS_ERROR ||
    /lacks access|bad credentials|forbidden|not authorized/i.test(message)
  );
}

function assertGithubAccess(status: number, errors?: GraphqlError[]) {
  if (status === 401 || status === 403) {
    throw new Error(GITHUB_ACCESS_ERROR);
  }

  if (!errors?.length) return;

  const joined = errors.map((error) => error.message).join(' ');
  const denied = errors.some(
    (error) =>
      error.type === 'FORBIDDEN' ||
      error.type === 'UNAUTHORIZED' ||
      error.type === 'INSUFFICIENT_SCOPES'
  );

  if (
    denied ||
    /insufficient|forbidden|not authorized|resource not accessible|bad credentials|requires authentication|scope/i.test(
      joined
    )
  ) {
    throw new Error(GITHUB_ACCESS_ERROR);
  }
}

function hasLogin(users: UserNodes | null | undefined, login: string) {
  return Boolean(
    users?.nodes?.some(
      (user) => user?.login?.toLowerCase() === login.toLowerCase()
    )
  );
}

function isAssignedToViewer(
  item: NonNullable<ProjectNode['items']['nodes'][number]>,
  login: string
) {
  if (hasLogin(item.content?.assignees, login)) return true;

  return item.fieldValues.nodes.some(
    (value) =>
      value?.users &&
      value.field?.name?.toLowerCase() === 'assignees' &&
      hasLogin(value.users, login)
  );
}

async function githubGraphql<ResponseBody>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<ResponseBody> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    assertGithubAccess(response.status);
    throw new Error(`GitHub HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: ResponseBody;
    errors?: GraphqlError[];
  };

  assertGithubAccess(response.status, payload.errors);

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'GitHub GraphQL error');
  }

  if (!payload.data) {
    throw new Error('GitHub GraphQL empty response');
  }

  return payload.data;
}

export function stripGithubTitlePrefix(title: string) {
  return title.replace(/^#\d+\s+/, '').trim();
}

export async function fetchGithubProjectBoard(
  token: string,
  org: string,
  projectNumber: number
): Promise<BoardData> {
  const data = await githubGraphql<GraphqlData>(token, QUERY, {
    org,
    number: projectNumber,
  });

  const viewerLogin = data.viewer?.login?.trim();
  if (!viewerLogin) {
    throw new Error(GITHUB_ACCESS_ERROR);
  }

  const project = data.organization?.projectV2;
  if (!project) {
    throw new Error(
      'Project not found, or token lacks access to that org/project'
    );
  }

  const statusField =
    project.fields.nodes.find(
      (field) => field?.options && field.name?.toLowerCase() === 'status'
    ) ||
    project.fields.nodes.find((field) => field?.options?.length);

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

  for (const item of project.items.nodes) {
    if (!item || !isAssignedToViewer(item, viewerLogin)) continue;

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

    column.cards.push({
      id: item.id,
      title,
      contentId: item.content?.id,
      contentType,
    });
  }

  return {
    v: 1,
    github: {
      projectId: project.id,
      viewerId: data.viewer?.id,
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
