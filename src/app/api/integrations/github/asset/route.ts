import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import {
  isGithubAccessError,
  isGithubNotConnected,
} from '@/server/integrations/helpers/github';
import { requireStoredGithubToken } from '@/server/integrations/github-tokens.repository';
import { jsonError } from '@/server/shared/http/errors';
import { errorMessage } from '@/shared/errors';
import { isGithubAssetUrl } from '@/shared/github-assets';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = (await request.json()) as {
      projectId?: string;
      url?: string;
    };

    const projectId = String(payload.projectId ?? '').trim();
    const assetUrl = String(payload.url ?? '').trim();

    if (!projectId || !assetUrl || !isGithubAssetUrl(assetUrl)) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const token = await requireStoredGithubToken(userId, projectId);

    const response = await fetch(assetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/octet-stream',
      },
      redirect: 'follow',
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: 'GitHub asset access denied' },
        { status: 403 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub asset HTTP ${response.status}` },
        { status: 502 }
      );
    }

    const bytes = await response.arrayBuffer();
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
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
