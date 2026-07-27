import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import {
  fetchGithubProjectBoard,
  isGithubAccessError,
} from '@/server/integrations/github-project';
import { jsonError } from '@/server/shared/http/errors';
import { errorMessage } from '@/shared/errors';

export async function POST(request: Request) {
  try {
    await requireUserId();
    const payload = (await request.json()) as {
      token?: string;
      org?: string;
      project?: string | number;
    };

    const token = String(payload.token ?? '').trim();
    const org = String(payload.org ?? '').trim();
    const projectNumber = Number(payload.project);

    if (!token || !org || !Number.isFinite(projectNumber) || projectNumber < 1) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const board = await fetchGithubProjectBoard(token, org, projectNumber);
    return NextResponse.json(board);
  } catch (caughtError) {
    const message = errorMessage(caughtError);

    if (isGithubAccessError(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return jsonError(caughtError);
  }
}
