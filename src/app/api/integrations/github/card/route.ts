import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import {
  isGithubAccessError,
  isGithubNotConnected,
} from '@/server/integrations/helpers/github';
import {
  addGithubDraftCard,
  addGithubIssueComment,
  deleteGithubProjectItem,
  fetchGithubCardDetail,
  moveGithubProjectItemStatus,
  updateGithubCardTitle,
} from '@/server/integrations/github-project';
import { requireStoredGithubToken } from '@/server/integrations/github-tokens.repository';
import { jsonError } from '@/server/shared/http/errors';
import { errorMessage } from '@/shared/errors';
import type { GithubCardContentType } from '@/shared/types';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = (await request.json()) as {
      projectId?: string;
      action?: string;
      contentId?: string;
      contentType?: GithubCardContentType;
      title?: string;
      body?: string;
      itemId?: string;
      fieldId?: string;
      optionId?: string;
      viewerId?: string;
      statusFieldId?: string;
      statusOptionId?: string;
    };

    const projectId = String(payload.projectId ?? '').trim();
    const action = String(payload.action ?? '').trim();

    if (!projectId || !action) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const token = await requireStoredGithubToken(userId, projectId);

    if (action === 'detail') {
      const contentId = String(payload.contentId ?? '').trim();
      const contentType = payload.contentType;

      if (
        !contentId ||
        (contentType !== 'Issue' &&
          contentType !== 'PullRequest' &&
          contentType !== 'DraftIssue')
      ) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      const detail = await fetchGithubCardDetail(token, contentId, contentType);
      return NextResponse.json(detail);
    }

    if (action === 'comment') {
      const contentId = String(payload.contentId ?? '').trim();
      const body = String(payload.body ?? '');

      if (!contentId || !body.trim()) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      const comment = await addGithubIssueComment(token, contentId, body);
      return NextResponse.json(comment);
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
      const itemId = String(payload.itemId ?? '').trim();

      if (!itemId) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
      }

      await deleteGithubProjectItem(token, projectId, itemId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'move') {
      const itemId = String(payload.itemId ?? '').trim();
      const fieldId = String(payload.fieldId ?? '').trim();
      const optionId = String(payload.optionId ?? '').trim();

      if (!itemId || !fieldId || !optionId) {
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
      const title = String(payload.title ?? 'Untitled');
      const viewerId = String(payload.viewerId ?? '').trim() || undefined;
      const statusFieldId =
        String(payload.statusFieldId ?? '').trim() || undefined;
      const statusOptionId =
        String(payload.statusOptionId ?? '').trim() || undefined;

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

    if (isGithubNotConnected(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return jsonError(caughtError);
  }
}
