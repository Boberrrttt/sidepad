'use client';

import { marked } from 'marked';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ConnectAppsModal } from '@/app/notes/components/connect-apps-modal';
import {
  KanbanBoard,
  parseBoard,
} from '@/app/notes/components/kanban-board';
import { htmlToMd } from '@/app/notes/helpers/markdown';
import { wordCount } from '@/app/notes/helpers/word-count';

export type NoteEditorHandle = {
  fill: (markdown: string) => Promise<void>;
};

type NoteEditorProps = {
  isEmpty: boolean;
  current: string | null;
  title: string;
  body: string;
  board: string;
  status: string;
  statusKind: 'neutral' | 'ok' | 'error';
  isChatCollapsed: boolean;
  isSidebarCollapsed: boolean;
  onTitleChange: (title: string) => void;
  onCommitTitle: () => Promise<void>;
  onBodyChange: (body: string) => void;
  onBoardChange: (board: string) => void;
  onScheduleSave: () => void;
  onOpenAsk: () => void;
  onOpenSidebar: () => void;
  onRequestDelete: () => void;
  onCreateNote: () => void;
};

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(props, ref) {
    const {
      isEmpty,
      current,
      title,
      body,
      board,
      status,
      statusKind,
      isChatCollapsed,
      isSidebarCollapsed,
      onTitleChange,
      onCommitTitle,
      onBodyChange,
      onBoardChange,
      onScheduleSave,
      onOpenAsk,
      onOpenSidebar,
      onRequestDelete,
      onCreateNote,
    } = props;

    const bodyRef = useRef<HTMLDivElement>(null);
    const editorGeneration = useRef(0);
    const [viewMode, setViewMode] = useState<'note' | 'board'>('note');
    const [connectOpen, setConnectOpen] = useState(false);
    const [boardSyncKey, setBoardSyncKey] = useState(0);

    const fill = useCallback(async (markdown: string) => {
      const element = bodyRef.current;
      if (!element) return;

      const generation = ++editorGeneration.current;
      const html = String(await marked.parse(markdown || '', { async: true }));

      if (generation !== editorGeneration.current) return;

      element.innerHTML = html;
    }, []);

    useImperativeHandle(ref, () => ({ fill }), [fill]);

    useEffect(() => {
      if (!current) return;
      setViewMode(parseBoard(board) ? 'board' : 'note');
    }, [current]);

    useEffect(() => {
      if (!current || viewMode !== 'note') return;
      void fill(body);
    }, [viewMode, current, fill]);

    function onEditorInput() {
      const element = bodyRef.current;
      if (!element || !current) return;
      onBodyChange(htmlToMd(element));
      onScheduleSave();
    }

    function format(command: string) {
      document.execCommand(command);
      bodyRef.current?.focus();
      onEditorInput();
    }

    const words = wordCount(body);

    return (
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--paper)]" aria-label="Note editor">
        {isEmpty ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <h1 className="m-0 text-3xl font-bold tracking-tight text-[var(--forest)]">
              Your pad is empty
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--mute)]">
              Create a note or open one from the list. Writing saves as you go.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {isSidebarCollapsed ? (
                <button
                  type="button"
                  onClick={onOpenSidebar}
                  className="rounded-[var(--radius)] px-3.5 py-2.5 text-sm font-medium text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
                >
                  ‹ Notes
                </button>
              ) : null}
              <button
                type="button"
                onClick={onCreateNote}
                className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-press)] active:scale-[0.98]"
              >
                New note
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`mx-auto flex min-h-0 w-full flex-1 flex-col px-6 py-5 ${
              viewMode === 'board' ? 'max-w-none' : 'max-w-3xl'
            }`}
          >
            {isSidebarCollapsed || isChatCollapsed ? (
              <div className="mb-3 flex items-center gap-2">
                {isSidebarCollapsed ? (
                  <button
                    type="button"
                    aria-label="Show notes"
                    onClick={onOpenSidebar}
                    className="shrink-0 rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
                  >
                    ‹ Notes
                  </button>
                ) : null}
                {isChatCollapsed ? (
                  <button
                    type="button"
                    aria-label="Show ask"
                    onClick={onOpenAsk}
                    className="ml-auto shrink-0 rounded-[var(--radius)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_22%,var(--accent-soft))] active:scale-[0.98]"
                  >
                    Ask ›
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="flex min-w-0 items-start gap-3">
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                onBlur={() => {
                  void onCommitTitle();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void onCommitTitle().then(() => bodyRef.current?.focus());
                }}
                placeholder="Untitled"
                aria-label="Note title"
                className="min-w-0 flex-1 border-0 bg-transparent text-[28px] font-semibold leading-tight tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
              />
              <div className="mt-1 flex shrink-0 items-center gap-2">
                {viewMode === 'board' ? (
                  <button
                    type="button"
                    onClick={() => setConnectOpen(true)}
                    className="rounded-md px-2.5 py-1 text-[13px] font-medium text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
                  >
                    Connect
                  </button>
                ) : null}
                <div
                  className="flex rounded-lg border border-[var(--line-soft)] p-0.5"
                  role="group"
                  aria-label="View mode"
                >
                  {(
                    [
                      ['note', 'Note'],
                      ['board', 'Board'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors active:scale-[0.98] ${
                        viewMode === mode
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'text-[var(--mute)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {viewMode === 'note' ? (
              <>
                <div className="mt-4 flex items-center justify-between border-b border-[var(--line-soft)] pb-2">
                  <div className="flex gap-0.5" role="toolbar" aria-label="Format">
                    {(
                      [
                        ['bold', 'B'],
                        ['italic', 'I'],
                        ['underline', 'U'],
                        ['strikeThrough', 'S'],
                        ['insertUnorderedList', '•'],
                      ] as const
                    ).map(([command, label]) => (
                      <button
                        key={command}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => format(command)}
                        className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98]${command === 'strikeThrough' ? ' line-through' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  ref={bodyRef}
                  contentEditable
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Note body"
                  data-placeholder="Start writing"
                  className="note-preview note-editor mt-3 min-h-0 flex-1 overflow-auto bg-transparent py-1 text-[15px] leading-relaxed outline-none"
                  onInput={onEditorInput}
                />
              </>
            ) : (
              <KanbanBoard
                key={`${current}-${boardSyncKey}`}
                projectLabel={title}
                boardJson={board}
                onBoardChange={onBoardChange}
                onScheduleSave={onScheduleSave}
              />
            )}

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-3">
              <p
                className={`m-0 text-sm ${
                  statusKind === 'error'
                    ? 'text-[var(--danger)]'
                    : statusKind === 'ok'
                      ? 'text-[var(--ok)]'
                      : 'text-[var(--mute)]'
                }`}
              >
                {status}
              </p>
              <div className="flex items-center gap-1">
                {viewMode === 'note' ? (
                  <p className="m-0 mr-2 text-sm tabular-nums text-[var(--mute)]">
                    {words === 1 ? '1 word' : `${words} words`}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={onRequestDelete}
                  className="rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <ConnectAppsModal
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onBoardSynced={(boardJson) => {
            onBoardChange(boardJson);
            onScheduleSave();
            setBoardSyncKey((value) => value + 1);
            setViewMode('board');
            setConnectOpen(false);
          }}
        />
      </main>
    );
  }
);

