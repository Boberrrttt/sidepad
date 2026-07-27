'use client';

import { useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  addGithubCard,
  deleteGithubCard,
  moveGithubCard,
  renameGithubCard,
} from '@/app/notes/github/api';
import { getGithubSession } from '@/app/notes/github/session';
import type { BoardData } from '@/shared/types';

type BoardCard = BoardData['columns'][number]['cards'][number];

function newId() {
  return crypto.randomUUID();
}

export function parseBoard(raw: string): BoardData | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed) as BoardData;
    if (parsed?.v !== 1 || !Array.isArray(parsed.columns)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeBoard(board: BoardData) {
  return `${JSON.stringify(board, null, 2)}\n`;
}

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
  const [dragCardId, setDragCardId] = useState<string | null>(null);

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

    const token = getGithubSession();
    if (!token) return;

    try {
      await renameGithubCard(
        token,
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
    const meta = board.github;
    const token = getGithubSession();

    if (meta?.projectId && token) {
      void (async () => {
        try {
          const created = await addGithubCard(
            token,
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

    const token = getGithubSession();

    if (!board.github?.projectId || !card?.contentId || !token) return;

    void deleteGithubCard(token, board.github.projectId, cardId).catch(
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
    const token = getGithubSession();

    if (
      fromColumn?.id === toColumnId ||
      !moving.contentId ||
      !meta?.projectId ||
      !meta.statusFieldId ||
      !optionId ||
      !token
    ) {
      return;
    }

    void moveGithubCard(
      token,
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

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 md:flex-row md:overflow-x-auto md:overflow-y-hidden">
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
            <span className="mt-0.5 px-1 text-xs tabular-nums text-[var(--mute)]">
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
                className={`group rounded-[10px] border border-[var(--line-soft)] bg-[var(--panel)] px-2.5 py-2 shadow-[0_1px_0_color-mix(in_oklab,var(--ink)_4%,transparent)] ${
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
                    onClick={() => setEditingCardId(card.id)}
                    className="w-full text-left"
                  >
                    <p className="m-0 text-[13px] leading-snug text-[var(--ink)]">
                      {card.title || 'Untitled card'}
                    </p>
                    <p className="m-0 mt-1.5 text-[11px] text-[var(--mute)]">
                      {label} · {card.id.slice(0, 8)}
                    </p>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete card"
                  onClick={() => deleteCard(column.id, card.id)}
                  className="mt-1 hidden text-[11px] text-[var(--mute)] hover:text-[var(--danger)] group-hover:inline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => addCard(column.id)}
            className="mx-2 mb-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-[var(--mute)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)]"
          >
            + Add a card
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
    </div>
  );
}
