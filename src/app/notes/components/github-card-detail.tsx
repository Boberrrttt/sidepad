'use client';

import { useEffect, useState } from 'react';
import {
  addGithubCardComment,
  fetchGithubCardDetail,
} from '@/app/notes/github/api';
import { GithubCardMeta } from '@/app/notes/components/github-card-meta';
import { toGithubHtml, toHtml } from '@/app/notes/helpers/markdown';
import type { BoardData, GithubCardDetail } from '@/shared/types';

type BoardCard = BoardData['columns'][number]['cards'][number];

type GithubCardDetailPanelProps = {
  card: BoardCard;
  projectId: string | null;
  columnId: string | null;
  onClose: () => void;
  onEditTitle: () => void;
  onDelete: () => void;
};

function formatWhen(value: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function GithubHtml({
  markdown,
  projectId,
  className,
}: {
  markdown: string;
  projectId: string | null;
  className?: string;
}) {
  const [html, setHtml] = useState(() => toHtml(markdown));

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    setHtml(toHtml(markdown));

    void toGithubHtml(markdown, projectId).then((next) => {
      if (cancelled) return;

      for (const match of next.matchAll(/blob:[^"'\s]+/g)) {
        objectUrls.push(match[0]);
      }

      setHtml(next);
    });

    return () => {
      cancelled = true;
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [markdown, projectId]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function GithubCardDetailPanel({
  card,
  projectId,
  columnId,
  onClose,
  onEditTitle,
  onDelete,
}: GithubCardDetailPanelProps) {
  const [detail, setDetail] = useState<GithubCardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!card.contentId || !card.contentType) {
      setDetail(null);
      setLoading(false);
      setError('');
      return;
    }

    if (!projectId) {
      setDetail(null);
      setLoading(false);
      setError('Connect GitHub to load comments and timeline.');
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError('');
    setDetail(null);

    void fetchGithubCardDetail(projectId, card.contentId, card.contentType)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Failed to load detail'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, card.contentId, card.contentType]);

  const body = detail?.body;
  const comments = detail?.comments ?? [];
  const timeline = detail?.timeline ?? [];
  const linkedPullRequests = detail?.linkedPullRequests ?? [];
  const canComment =
    Boolean(projectId && card.contentId) &&
    (card.contentType === 'Issue' || card.contentType === 'PullRequest');

  async function submitComment() {
    if (!projectId || !card.contentId || posting) return;

    const text = commentDraft.trim();
    if (!text) return;

    setPosting(true);

    try {
      const created = await addGithubCardComment(
        projectId,
        card.contentId,
        text
      );
      setDetail((prev) =>
        prev
          ? { ...prev, comments: [...prev.comments, created] }
          : {
              body,
              comments: [created],
              timeline: [],
              linkedPullRequests: [],
            }
      );
      setCommentDraft('');
    } catch (caughtError) {
      window.alert(
        caughtError instanceof Error
          ? caughtError.message
          : 'Comment failed'
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close card detail"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={card.title || 'Card detail'}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--panel)] shadow-[-8px_0_32px_rgba(0,0,0,0.22)]"
      >
        <header className="flex items-start gap-2 border-b border-[var(--line-soft)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-base font-semibold leading-snug text-[var(--ink)]">
              {card.title || 'Untitled card'}
            </p>
            <GithubCardMeta
              state={card.state}
              labels={card.labels}
              assignees={card.assignees}
            />
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-[var(--mute)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="m-0 rounded-[10px] bg-[var(--line-soft)] px-3 py-2 text-[12px] text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          {card.fields?.length ? (
            <section>
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--mute)]">
                Fields
              </h3>
              <dl className="mt-2 m-0 grid gap-2">
                {card.fields.map((field) => (
                  <div
                    key={`${field.name}:${field.value}`}
                    className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-[13px]"
                  >
                    <dt className="m-0 text-[var(--ink-soft)]">{field.name}</dt>
                    <dd className="m-0 text-[var(--ink)]">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--mute)]">
              Description
            </h3>
            {body ? (
              <GithubHtml
                markdown={body}
                projectId={projectId}
                className="note-preview mt-2 text-[14px] leading-relaxed text-[var(--ink)]"
              />
            ) : (
              <p className="mt-2 m-0 text-[13px] text-[var(--mute)]">
                No description.
              </p>
            )}
          </section>

          {linkedPullRequests.length > 0 ? (
            <section>
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--mute)]">
                Linked PRs
              </h3>
              <ul className="mt-2 m-0 list-none space-y-2 p-0">
                {linkedPullRequests.map((pull) => (
                  <li key={pull.number}>
                    <a
                      href={pull.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-[10px] border border-[var(--line-soft)] px-3 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--line-soft)]"
                    >
                      <span className="font-medium">#{pull.number}</span>{' '}
                      {pull.title}
                      {pull.state ? (
                        <span className="ml-2 text-[11px] text-[var(--mute)]">
                          {pull.state.toLowerCase()}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--mute)]">
              Timeline
            </h3>
            {loading && !timeline.length ? (
              <p className="mt-2 m-0 text-[13px] text-[var(--mute)]">Loading…</p>
            ) : timeline.length ? (
              <ol className="mt-2 m-0 list-none space-y-2 border-l border-[var(--line)] p-0 pl-3">
                {timeline.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[0.91rem] top-1.5 h-2 w-2 rounded-full bg-[var(--line)]" />
                    <p className="m-0 text-[14px] text-[var(--ink)]">
                      {item.text}
                    </p>
                    <p className="m-0 mt-0.5 text-[12px] text-[var(--ink-soft)]">
                      {formatWhen(item.at)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 m-0 text-[13px] text-[var(--mute)]">
                No timeline events.
              </p>
            )}
          </section>

          <section>
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--mute)]">
              Comments
            </h3>
            {loading && !comments.length ? (
              <p className="mt-2 m-0 text-[13px] text-[var(--mute)]">Loading…</p>
            ) : comments.length ? (
              <ul className="mt-2 m-0 list-none space-y-3 p-0">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-[10px] border border-[var(--line-soft)] px-3 py-2"
                  >
                    <p className="m-0 text-[12px] text-[var(--ink-soft)]">
                      <span className="font-medium text-[var(--ink)]">
                        @{comment.author}
                      </span>{' '}
                      · {formatWhen(comment.createdAt)}
                    </p>
                    {comment.body ? (
                      <GithubHtml
                        markdown={comment.body}
                        projectId={projectId}
                        className="note-preview mt-1.5 text-[14px] leading-relaxed text-[var(--ink)]"
                      />
                    ) : (
                      <p className="mt-1.5 m-0 text-[13px] text-[var(--mute)]">
                        Empty comment.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 m-0 text-[13px] text-[var(--mute)]">
                No comments yet.
              </p>
            )}

            {canComment ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  rows={3}
                  placeholder="Leave a comment"
                  className="w-full resize-y rounded-[10px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  disabled={posting || !commentDraft.trim()}
                  onClick={() => void submitComment()}
                  className="rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] disabled:opacity-50 active:scale-[0.98]"
                >
                  {posting ? 'Posting…' : 'Comment'}
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-[var(--line-soft)] px-4 py-3">
          {card.url ? (
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98]"
            >
              Open on GitHub
            </a>
          ) : null}
          <button
            type="button"
            onClick={onEditTitle}
            className="rounded-[var(--radius)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98]"
          >
            Edit title
          </button>
          {columnId ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-[var(--radius)] px-3 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98]"
            >
              Delete
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
