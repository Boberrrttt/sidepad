'use client';

import { marked } from 'marked';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

function wordCount(text: string) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function htmlToMd(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const childMarkdown = () =>
      Array.from(element.childNodes).map(walk).join('');

    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${childMarkdown()}**`;
    if (tag === 'em' || tag === 'i') return `*${childMarkdown()}*`;
    if (tag === 'u') return `<u>${childMarkdown()}</u>`;
    if (tag === 'code') {
      return element.parentElement?.tagName.toLowerCase() === 'pre'
        ? childMarkdown()
        : `\`${childMarkdown()}\``;
    }
    if (tag === 'pre') return `\`\`\`\n${childMarkdown()}\n\`\`\`\n\n`;
    if (tag === 'h1') return `# ${childMarkdown().trim()}\n\n`;
    if (tag === 'h2') return `## ${childMarkdown().trim()}\n\n`;
    if (tag === 'h3') return `### ${childMarkdown().trim()}\n\n`;
    if (tag === 'p' || tag === 'div') {
      const text = childMarkdown();
      return text ? `${text.replace(/\n$/, '')}\n\n` : '';
    }
    if (tag === 'li') return `- ${childMarkdown().trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `${childMarkdown()}\n`;
    if (tag === 'a') {
      return `[${childMarkdown()}](${element.getAttribute('href') || ''})`;
    }

    return childMarkdown();
  }

  return Array.from(root.childNodes)
    .map(walk)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type NoteEditorHandle = {
  fill: (markdown: string) => Promise<void>;
};

type NoteEditorProps = {
  isEmpty: boolean;
  current: string | null;
  title: string;
  body: string;
  status: string;
  statusKind: 'neutral' | 'ok' | 'error';
  isChatCollapsed: boolean;
  isSidebarCollapsed: boolean;
  onTitleChange: (title: string) => void;
  onCommitTitle: () => Promise<void>;
  onBodyChange: (body: string) => void;
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
      status,
      statusKind,
      isChatCollapsed,
      isSidebarCollapsed,
      onTitleChange,
      onCommitTitle,
      onBodyChange,
      onScheduleSave,
      onOpenAsk,
      onOpenSidebar,
      onRequestDelete,
      onCreateNote,
    } = props;

    const bodyRef = useRef<HTMLDivElement>(null);
    const editorGeneration = useRef(0);

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
      void fill(body);
    }, [current, fill]);

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
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 py-5">
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
              className="min-w-0 w-full border-0 bg-transparent text-[28px] font-semibold leading-tight tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
            />

            <div className="mt-4 flex items-center justify-between border-b border-[var(--line-soft)] pb-2">
              <div className="flex gap-0.5" role="toolbar" aria-label="Format">
                {(
                  [
                    ['bold', 'B'],
                    ['italic', 'I'],
                    ['underline', 'U'],
                  ] as const
                ).map(([command, label]) => (
                  <button
                    key={command}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => format(command)}
                    className="h-8 min-w-8 rounded-lg px-2 text-sm font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--line-soft)] active:scale-[0.98]"
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
                <p className="m-0 mr-2 text-sm tabular-nums text-[var(--mute)]">
                  {words === 1 ? '1 word' : `${words} words`}
                </p>
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
      </main>
    );
  }
);
