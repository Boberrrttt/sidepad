import { postJson } from '@/app/shared/http';
import type { BoardData, GithubCardContentType } from '@/shared/types';

export async function syncGithubProject(
  token: string,
  org: string,
  project: number
): Promise<BoardData> {
  const board = await postJson<BoardData>(
    '/api/integrations/github/project',
    { token, org, project }
  );

  if (board.v !== 1 || !Array.isArray(board.columns)) {
    throw new Error('Bad board payload from GitHub sync');
  }

  return board;
}

export type GithubAddCardResult = {
  itemId: string;
  contentId: string;
  contentType: GithubCardContentType;
  title: string;
};

export async function renameGithubCard(
  token: string,
  contentId: string,
  contentType: GithubCardContentType,
  title: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    token,
    action: 'rename',
    contentId,
    contentType,
    title,
  });
}

export async function deleteGithubCard(
  token: string,
  projectId: string,
  itemId: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    token,
    action: 'delete',
    projectId,
    itemId,
  });
}

export async function moveGithubCard(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  await postJson('/api/integrations/github/card', {
    token,
    action: 'move',
    projectId,
    itemId,
    fieldId,
    optionId,
  });
}

export async function addGithubCard(
  token: string,
  projectId: string,
  title: string,
  viewerId?: string,
  statusFieldId?: string,
  statusOptionId?: string
): Promise<GithubAddCardResult> {
  const created = await postJson<Partial<GithubAddCardResult>>(
    '/api/integrations/github/card',
    {
      token,
      action: 'add',
      projectId,
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
