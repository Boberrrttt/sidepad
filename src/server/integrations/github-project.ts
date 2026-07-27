import {
  GITHUB_ACCESS_ERROR,
  githubGraphql,
  isAssignedToViewer,
  type ProjectItem,
  slug,
  stripGithubTitlePrefix,
} from '@/server/integrations/helpers/github';
import type { BoardData, GithubCardContentType } from '@/shared/types';

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

  // ponytail: page all items; first:100 alone drops new cards on big boards
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
