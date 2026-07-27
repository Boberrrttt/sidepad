import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import {
  addGithubDraftCard,
  deleteGithubProjectItem,
  isGithubAccessError,
  moveGithubProjectItemStatus,
  updateGithubCardTitle,
} from '@/server/integrations/github-project';
import { jsonError } from '@/server/shared/http/errors';
import { errorMessage } from '@/shared/errors';
import type { GithubCardContentType } from '@/shared/types';

export async function POST(request: Request) {
  try {
    await requireUserId();
    const payload = (await request.json()) as {
      token?: string;
      action?: string;
      contentId?: string;
      contentType?: GithubCardContentType;
      title?: string;
      projectId?: string;
      itemId?: string;
      fieldId?: string;
      optionId?: string;
      viewerId?: string;
      statusFieldId?: string;
      statusOptionId?: string;
    };

    const token = String(payload.token ?? '').trim();
    const action = String(payload.action ?? '').trim();

    if (!token || !action) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    if (action === 'rename') {
      const contentId = String(payload.contentId ?? '').trim();
      const contentType = payload.contentType;
      const title = String(payload.title ?? '');

      if (
        !contentId ||
        (contentType !== 'Issue' &&
          contentType !== 'PullRequest' &&
          contentType !== 'DraftIssue')
      ) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      await updateGithubCardTitle(token, contentId, contentType, title);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      const projectId = String(payload.projectId ?? '').trim();
      const itemId = String(payload.itemId ?? '').trim();

      if (!projectId || !itemId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      await deleteGithubProjectItem(token, projectId, itemId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'move') {
      const projectId = String(payload.projectId ?? '').trim();
      const itemId = String(payload.itemId ?? '').trim();
      const fieldId = String(payload.fieldId ?? '').trim();
      const optionId = String(payload.optionId ?? '').trim();

      if (!projectId || !itemId || !fieldId || !optionId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      await moveGithubProjectItemStatus(
        token,
        projectId,
        itemId,
        fieldId,
        optionId
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'add') {
      const projectId = String(payload.projectId ?? '').trim();
      const title = String(payload.title ?? 'Untitled');
      const viewerId = String(payload.viewerId ?? '').trim() || undefined;
      const statusFieldId =
        String(payload.statusFieldId ?? '').trim() || undefined;
      const statusOptionId =
        String(payload.statusOptionId ?? '').trim() || undefined;

      if (!projectId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      const created = await addGithubDraftCard(
        token,
        projectId,
        title,
        viewerId,
        statusFieldId,
        statusOptionId
      );
      return NextResponse.json(created);
    }

    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  } catch (caughtError) {
    const message = errorMessage(caughtError);

    if (isGithubAccessError(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return jsonError(caughtError);
  }
}
