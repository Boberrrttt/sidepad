'use client';

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  addGithubCard,
  deleteGithubCard,
  moveGithubCard,
  renameGithubCard,
  syncGithubProject,
} from '@/app/notes/github/api';
import { GithubCardDetailPanel } from '@/app/notes/components/github-card-detail';
import { GithubCardMeta } from '@/app/notes/components/github-card-meta';
import { parseBoard, serializeBoard } from '@/app/notes/helpers/board';
import { newId } from '@/app/notes/sync/local';
import type { BoardData } from '@/shared/types';

type BoardCard = BoardData['columns'][number]['cards'][number];

const GITHUB_POLL_MS = 30_000;

type KanbanBoardProps = {
  projectLabel: string;
  boardJson: string;
  onBoardChange: (boardJson: string) => void;
  onScheduleSave: () => void;
};

export function KanbanBoard({
  projectLabel,
  boardJson,
  onBoardChange,
  onScheduleSave,
}: KanbanBoardProps) {
  const label = projectLabel.trim() || 'Board';
  const [board, setBoard] = useState<BoardData>(
    () => parseBoard(boardJson) ?? { v: 1, columns: [] }
  );
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [addingColumnId, setAddingColumnId] = useState<string | null>(null);
  const boardRef = useRef(board);
  const editingCardIdRef = useRef(editingCardId);
  const detailCardIdRef = useRef(detailCardId);
  const dragCardIdRef = useRef(dragCardId);
  const onBoardChangeRef = useRef(onBoardChange);
  const onScheduleSaveRef = useRef(onScheduleSave);
  const linked = Boolean(
    board.github?.projectId &&
      board.github.org &&
      board.github.projectNumber
  );

  boardRef.current = board;
  editingCardIdRef.current = editingCardId;
  detailCardIdRef.current = detailCardId;
  dragCardIdRef.current = dragCardId;
  onBoardChangeRef.current = onBoardChange;
  onScheduleSaveRef.current = onScheduleSave;

  useEffect(() => {
    if (!linked) return;

    let busy = false;

    async function pull() {
      if (
        busy ||
        editingCardIdRef.current ||
        detailCardIdRef.current ||
        dragCardIdRef.current
      ) {
        return;
      }

      const meta = boardRef.current.github;
      if (!meta?.projectId || !meta.org || !meta.projectNumber) return;

      busy = true;

      try {
        const next = await syncGithubProject({
          org: meta.org,
          project: meta.projectNumber,
          projectId: meta.projectId,
        });
        const merged = {
          ...next,
          github: next.github ?? meta,
        };
        const nextJson = serializeBoard(merged);

        if (serializeBoard(boardRef.current) === nextJson) return;

        setBoard(merged);
        boardRef.current = merged;
        onBoardChangeRef.current(nextJson);
        onScheduleSaveRef.current();
      } catch {
      } finally {
        busy = false;
      }
    }

    void pull();
    const timerId = window.setInterval(() => void pull(), GITHUB_POLL_MS);

    function onVisible() {
      if (document.visibilityState === 'visible') void pull();
    }

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [linked]);

  function commit(next: BoardData) {
    setBoard(next);
    onBoardChange(serializeBoard(next));
    onScheduleSave();
  }

  function updateColumnName(columnId: string, name: string) {
    commit({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, name } : column
      ),
    });
  }

  function updateCardTitle(columnId: string, cardId: string, title: string) {
    commit({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.map((card) =>
                card.id === cardId ? { ...card, title } : card
              ),
            }
          : column
      ),
    });
  }

  async function syncCardTitle(card: BoardCard) {
    if (!card.contentId || !card.contentType) return;

    const projectId = board.github?.projectId;
    if (!projectId) return;

    try {
      await renameGithubCard(
        projectId,
        card.contentId,
        card.contentType,
        card.title
      );
    } catch (caughtError) {
      window.alert(
        caughtError instanceof Error
          ? caughtError.message
          : 'GitHub rename failed'
      );
    }
  }

  function addCard(columnId: string) {
    if (addingColumnId) return;

    const meta = board.github;

    if (meta?.projectId) {
      setAddingColumnId(columnId);

      void (async () => {
        try {
          const created = await addGithubCard(
            meta.projectId,
            'Untitled',
            meta.viewerId,
            meta.statusFieldId,
            meta.statusOptions?.[columnId]
          );

          const card: BoardCard = {
            id: created.itemId,
            title: created.title,
            contentId: created.contentId,
            contentType: created.contentType,
          };

          setBoard((prev) => {
            const next = {
              ...prev,
              columns: prev.columns.map((column) =>
                column.id === columnId
                  ? { ...column, cards: [...column.cards, card] }
                  : column
              ),
            };
            onBoardChange(serializeBoard(next));
            onScheduleSave();
            return next;
          });
          setEditingCardId(card.id);
        } catch (caughtError) {
          window.alert(
            caughtError instanceof Error
              ? caughtError.message
              : 'GitHub add failed'
          );
        } finally {
          setAddingColumnId(null);
        }
      })();
      return;
    }

    const cardId = newId();

    commit({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [...column.cards, { id: cardId, title: '' }],
            }
          : column
      ),
    });
    setEditingCardId(cardId);
  }

  function deleteCard(columnId: string, cardId: string) {
    const card = board.columns
      .flatMap((column) => column.cards)
      .find((entry) => entry.id === cardId);

    commit({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((entry) => entry.id !== cardId),
            }
          : column
      ),
    });

    if (!board.github?.projectId || !card?.contentId) return;

    void deleteGithubCard(board.github.projectId, cardId).catch(
      (caughtError: unknown) => {
        window.alert(
          caughtError instanceof Error
            ? caughtError.message
            : 'GitHub delete failed'
        );
      }
    );
  }

  function addColumn() {
    commit({
      ...board,
      columns: [
        ...board.columns,
        { id: newId(), name: 'New list', cards: [] },
      ],
    });
  }

  function deleteColumn(columnId: string) {
    commit({
      ...board,
      columns: board.columns.filter((column) => column.id !== columnId),
    });
  }

  function moveCard(cardId: string, toColumnId: string, beforeCardId?: string) {
    const fromColumn = board.columns.find((column) =>
      column.cards.some((card) => card.id === cardId)
    );
    const moving = fromColumn?.cards.find((card) => card.id === cardId);

    if (!moving) return;

    const without = board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId),
    }));

    commit({
      ...board,
      columns: without.map((column) => {
        if (column.id !== toColumnId) return column;

        const cards = [...column.cards];
        const insertAt = beforeCardId
          ? cards.findIndex((card) => card.id === beforeCardId)
          : -1;

        if (insertAt === -1) cards.push(moving);
        else cards.splice(insertAt, 0, moving);

        return { ...column, cards };
      }),
    });

    const meta = board.github;
    const optionId = meta?.statusOptions?.[toColumnId];

    if (
      fromColumn?.id === toColumnId ||
      !moving.contentId ||
      !meta?.projectId ||
      !meta.statusFieldId ||
      !optionId
    ) {
      return;
    }

    void moveGithubCard(
      meta.projectId,
      cardId,
      meta.statusFieldId,
      optionId
    ).catch((caughtError: unknown) => {
      window.alert(
        caughtError instanceof Error
          ? caughtError.message
          : 'GitHub move failed'
      );
    });
  }

  function onCardKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    columnId: string,
    card: BoardCard
  ) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      setEditingCardId(null);
      void syncCardTitle({ ...card, title: event.currentTarget.value });
      return;
    }

    if (event.key === 'Escape') {
      setEditingCardId(null);
      return;
    }

    if (event.key === 'Backspace' && event.currentTarget.value === '') {
      event.preventDefault();
      deleteCard(columnId, card.id);
      setEditingCardId(null);
    }
  }

  function openCard(card: BoardCard) {
    if (card.contentId) {
      setDetailCardId(card.id);
      return;
    }

    setEditingCardId(card.id);
  }

  const detailCard =
    detailCardId == null
      ? null
      : board.columns
          .flatMap((column) => column.cards)
          .find((card) => card.id === detailCardId) ?? null;

  const detailColumnId =
    detailCard == null
      ? null
      : board.columns.find((column) =>
          column.cards.some((card) => card.id === detailCard.id)
        )?.id ?? null;

  return (
    <div className="relative mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 md:flex-row md:overflow-x-auto md:overflow-y-hidden">
      {board.columns.map((column) => (
        <section
          key={column.id}
          className="flex w-full shrink-0 flex-col rounded-[var(--radius)] bg-[var(--bone)]/55 md:w-64 md:min-h-0"
          onDragOver={(event: DragEvent) => {
            event.preventDefault();
          }}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            const cardId = event.dataTransfer.getData('text/plain') || dragCardId;
            if (!cardId) return;
            moveCard(cardId, column.id);
            setDragCardId(null);
          }}
        >
          <header className="flex items-start gap-1 px-2 pt-2 pb-1">
            <input
              value={column.name}
              aria-label="Column name"
              onChange={(event) =>
                updateColumnName(column.id, event.target.value)
              }
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold text-[var(--ink)] outline-none"
            />
            <span className="mt-0.5 px-1 text-xs tabular-nums text-[var(--ink-soft)]">
              {column.cards.length}
            </span>
            <button
              type="button"
              aria-label={`Delete ${column.name}`}
              onClick={() => deleteColumn(column.id)}
              className="rounded-md px-1.5 text-sm text-[var(--mute)] hover:bg-[var(--line-soft)] hover:text-[var(--danger)]"
            >
              ×
            </button>
          </header>

          <ul className="m-0 flex list-none flex-col gap-2 px-2 pb-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {column.cards.map((card) => (
              <li
                key={card.id}
                draggable={editingCardId !== card.id}
                onDragStart={(event: DragEvent) => {
                  setDragCardId(card.id);
                  event.dataTransfer.setData('text/plain', card.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragCardId(null)}
                onDragOver={(event: DragEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDrop={(event: DragEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const cardId =
                    event.dataTransfer.getData('text/plain') || dragCardId;
                  if (!cardId || cardId === card.id) return;
                  moveCard(cardId, column.id, card.id);
                  setDragCardId(null);
                }}
                className={`cursor-pointer rounded-[10px] border border-[var(--line-soft)] bg-[var(--panel)] px-2.5 py-2 shadow-[0_1px_0_color-mix(in_oklab,var(--ink)_4%,transparent)] transition-[transform,border-color,background-color] duration-200 ease-out hover:-translate-y-px hover:border-[var(--line)] hover:bg-[color-mix(in_oklab,var(--accent-soft)_35%,var(--panel))] ${
                  dragCardId === card.id ? 'opacity-50' : ''
                }`}
              >
                {editingCardId === card.id ? (
                  <textarea
                    autoFocus
                    value={card.title}
                    rows={2}
                    aria-label="Card title"
                    onChange={(event) =>
                      updateCardTitle(column.id, card.id, event.target.value)
                    }
                    onBlur={(event) => {
                      setEditingCardId(null);
                      void syncCardTitle({
                        ...card,
                        title: event.currentTarget.value,
                      });
                    }}
                    onKeyDown={(event) =>
                      onCardKeyDown(event, column.id, card)
                    }
                    className="w-full resize-none border-0 bg-transparent text-[13px] leading-snug text-[var(--ink)] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => openCard(card)}
                    className="w-full cursor-pointer text-left"
                  >
                    <p className="m-0 text-[13px] leading-snug text-[var(--ink)]">
                      {card.title || 'Untitled card'}
                    </p>
                    <GithubCardMeta
                      state={card.state}
                      labels={card.labels}
                      assignees={card.assignees}
                      dense
                    />
                    <p className="m-0 mt-1.5 text-[12px] text-[var(--ink-soft)]">
                      {label} · {card.id.slice(0, 8)}
                    </p>
                  </button>
                )}
              </li>
            ))}
            {addingColumnId === column.id ? (
              <li
                aria-busy="true"
                aria-label="Adding card"
                className="rounded-[10px] border border-[var(--line-soft)] bg-[var(--panel)] px-2.5 py-2"
              >
                <div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-[var(--line-soft)]" />
                <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded-sm bg-[var(--line-soft)] [animation-delay:120ms]" />
              </li>
            ) : null}
          </ul>

          <button
            type="button"
            disabled={addingColumnId === column.id}
            onClick={() => addCard(column.id)}
            className="mx-2 mb-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-[var(--mute)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:pointer-events-none disabled:opacity-60"
          >
            {addingColumnId === column.id ? 'Adding…' : '+ Add a card'}
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={addColumn}
        className="flex h-fit w-full shrink-0 items-center rounded-[var(--radius)] bg-[var(--bone)]/40 px-3 py-3 text-left text-sm font-medium text-[var(--mute)] hover:bg-[var(--bone)]/70 hover:text-[var(--ink)] md:w-64"
      >
        + Add another list
      </button>

      {detailCard ? (
        <GithubCardDetailPanel
          card={detailCard}
          projectId={board.github?.projectId ?? null}
          columnId={detailColumnId}
          onClose={() => setDetailCardId(null)}
          onEditTitle={() => {
            setDetailCardId(null);
            setEditingCardId(detailCard.id);
          }}
          onDelete={() => {
            if (!detailColumnId) return;
            deleteCard(detailColumnId, detailCard.id);
            setDetailCardId(null);
          }}
        />
      ) : null}
    </div>
  );
}
