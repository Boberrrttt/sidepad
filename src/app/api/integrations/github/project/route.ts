import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import {
  isGithubAccessError,
  isGithubNotConnected,
} from '@/server/integrations/helpers/github';
import { fetchGithubProjectBoard } from '@/server/integrations/github-project';
import {
  deleteGithubToken,
  requireStoredGithubToken,
  upsertGithubToken,
} from '@/server/integrations/github-tokens.repository';
import { jsonError } from '@/server/shared/http/errors';
import { errorMessage } from '@/shared/errors';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = (await request.json()) as {
      action?: string;
      token?: string;
      org?: string;
      project?: string | number;
      projectId?: string;
    };

    const action = String(payload.action ?? 'sync').trim();
    const projectId = String(payload.projectId ?? '').trim();

    if (action === 'disconnect') {
      if (!projectId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      await deleteGithubToken(userId, projectId);
      return NextResponse.json({ ok: true });
    }

    const org = String(payload.org ?? '').trim();
    const projectNumber = Number(payload.project);
    const tokenInput = String(payload.token ?? '').trim();

    if (!org || !Number.isFinite(projectNumber) || projectNumber < 1) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    let token = tokenInput;

    if (!token) {
      if (!projectId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      token = await requireStoredGithubToken(userId, projectId);
    }

    const board = await fetchGithubProjectBoard(token, org, projectNumber);

    if (!board.github?.projectId) {
      return NextResponse.json(
        { error: 'GitHub sync returned no project id' },
        { status: 502 }
      );
    }

    if (tokenInput) {
      await upsertGithubToken(userId, board.github.projectId, tokenInput);
    }

    return NextResponse.json(board);
  } catch (caughtError) {
    const message = errorMessage(caughtError);

    if (isGithubAccessError(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (isGithubNotConnected(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return jsonError(caughtError);
  }
}
