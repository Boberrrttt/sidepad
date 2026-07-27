type GraphqlError = {
  message: string;
};

type UserNodes = { nodes: Array<{ login: string } | null> | null };

export type ProjectItem = {
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
};

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

  if (/forbidden|unauthorized|scope|credentials/i.test(joined)) {
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

export function isAssignedToViewer(item: ProjectItem, login: string) {
  if (hasLogin(item.content?.assignees, login)) return true;

  return item.fieldValues.nodes.some(
    (value) =>
      value?.users &&
      value.field?.name?.toLowerCase() === 'assignees' &&
      hasLogin(value.users, login)
  );
}

export function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'col'
  );
}

export function stripGithubTitlePrefix(title: string) {
  return title.replace(/^#\d+\s+/, '').trim();
}

export async function githubGraphql<ResponseBody>(
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
