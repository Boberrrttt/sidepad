import { postJson } from '@/app/shared/http';
import type {
  BoardData,
  GithubCardComment,
  GithubCardContentType,
  GithubCardDetail,
} from '@/app/shared/types';

export async function syncGithubProject(input: {
  org: string;
  project: number;
  token?: string;
  projectId?: string;
}): Promise<BoardData> {
  const board = await postJson<BoardData>(
    '/api/integrations/github/project',
    input
  );

  if (board.v !== 1 || !Array.isArray(board.columns)) {
    throw new Error('Bad board payload from GitHub sync');
  }

  return board;
}

export async function disconnectGithubProject(projectId: string) {
  await postJson('/api/integrations/github/project', {
    action: 'disconnect',
    projectId,
  });
}

export type GithubAddCardResult = {
  itemId: string;
  contentId: string;
  contentType: GithubCardContentType;
  title: string;
};

export async function fetchGithubCardDetail(
  projectId: string,
  contentId: string,
  contentType: GithubCardContentType
): Promise<GithubCardDetail> {
  return postJson<GithubCardDetail>('/api/integrations/github/card', {
    projectId,
    action: 'detail',
    contentId,
    contentType,
  });
}

export async function addGithubCardComment(
  projectId: string,
  contentId: string,
  body: string
): Promise<GithubCardComment> {
  return postJson<GithubCardComment>('/api/integrations/github/card', {
    projectId,
    action: 'comment',
    contentId,
    body,
  });
}

export async function renameGithubCard(
  projectId: string,
  contentId: string,
  contentType: GithubCardContentType,
  title: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    projectId,
    action: 'rename',
    contentId,
    contentType,
    title,
  });
}

export async function deleteGithubCard(
  projectId: string,
  itemId: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    projectId,
    action: 'delete',
    itemId,
  });
}

export async function moveGithubCard(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    projectId,
    action: 'move',
    itemId,
    fieldId,
    optionId,
  });
}

export async function addGithubCard(
  projectId: string,
  title: string,
  viewerId?: string,
  statusFieldId?: string,
  statusOptionId?: string
): Promise<GithubAddCardResult> {
  const created = await postJson<Partial<GithubAddCardResult>>(
    '/api/integrations/github/card',
    {
      projectId,
      action: 'add',
      title,
      viewerId,
      statusFieldId,
      statusOptionId,
    }
  );

  if (!created.itemId || !created.contentId || !created.contentType) {
    throw new Error('GitHub add returned bad payload');
  }

  return {
    itemId: created.itemId,
    contentId: created.contentId,
    contentType: created.contentType,
    title: created.title || 'Untitled',
  };
}
