'use client';

import { marked } from 'marked';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  clearChatLocal,
  deleteNoteLocal,
  getChatLocal,
  listNotesLocal,
  mirrorNoteFromServer,
  renameNoteLocal,
  syncAll,
  writeNoteLocal,
} from '@/lib/sync';
import { clearLocalUserId, setLocalUserId } from '@/lib/local';
import type { AskEvent, ChatMessage, Note } from '@/lib/types';

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

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const kids = () => Array.from(el.childNodes).map(walk).join('');

    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${kids()}**`;
    if (tag === 'em' || tag === 'i') return `*${kids()}*`;
    if (tag === 'u') return `<u>${kids()}</u>`;
    if (tag === 'code') {
      return el.parentElement?.tagName.toLowerCase() === 'pre' ? kids() : `\`${kids()}\``;
    }
    if (tag === 'pre') return `\`\`\`\n${kids()}\n\`\`\`\n\n`;
    if (tag === 'h1') return `# ${kids().trim()}\n\n`;
    if (tag === 'h2') return `## ${kids().trim()}\n\n`;
    if (tag === 'h3') return `### ${kids().trim()}\n\n`;
    if (tag === 'p' || tag === 'div') {
      const t = kids();
      return t ? `${t.replace(/\n$/, '')}\n\n` : '';
    }
    if (tag === 'li') return `- ${kids().trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `${kids()}\n`;
    if (tag === 'a') return `[${kids()}](${el.getAttribute('href') || ''})`;

    return kids();
  }

  return Array.from(root.childNodes).map(walk).join('').replace(/\n{3,}/g, '\n\n').trim();
}

export default function SidePad() {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('Ready');
  const [statusKind, setStatusKind] = useState<'neutral' | 'ok' | 'error'>('neutral');
  const [search, setSearch] = useState('');
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [askInput, setAskInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [online, setOnline] = useState(true);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<string | null>(null);
  const bodyValueRef = useRef('');
  const editorGen = useRef(0);

  currentRef.current = current;
  bodyValueRef.current = body;

  const flash = useCallback((msg: string, kind: 'neutral' | 'ok' | 'error' = 'neutral') => {
    setStatus(msg);
    setStatusKind(kind);
  }, []);

  const refreshList = useCallback(async () => {
    setAllNotes(await listNotesLocal());
  }, []);

  const loadChat = useCallback(async (name: string | null) => {
    if (!name) {
      setChatMessages([]);
      return;
    }
    const chat = await getChatLocal(name);
    setChatMessages(
      chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    );
  }, []);

  const fillEditor = useCallback(async (md: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const g = ++editorGen.current;
    const html = String(await marked.parse(md || '', { async: true }));
    if (g !== editorGen.current) return;
    el.innerHTML = html;
  }, []);

  const openNote = useCallback(
    async (name: string) => {
      const notes = await listNotesLocal();
      const note = notes.find((n) => n.name === name);
      const nextBody = note?.body ?? '';
      setCurrent(name);
      setTitle(name);
      setBody(nextBody);
      await loadChat(name);
      flash('Editing');
      setAllNotes(notes);
      await fillEditor(nextBody);
    },
    [flash, loadChat, fillEditor]
  );

  const saveCurrent = useCallback(async () => {
    const name = currentRef.current;
    if (!name) return;
    await writeNoteLocal(name, bodyValueRef.current);
    await refreshList();
    flash('Saved', 'ok');
  }, [flash, refreshList]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    flash('Saving…');
    saveTimer.current = setTimeout(() => {
      saveCurrent().catch((err) => flash(String(err), 'error'));
    }, 400);
  }, [flash, saveCurrent]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setChatCollapsed(localStorage.getItem('sidepad-chat-collapsed') === '1');

    (async () => {
      try {
        const me = await fetch('/api/me');
        if (!me.ok) throw new Error('unauthorized');
        const data = (await me.json()) as { userId: string };
        setLocalUserId(data.userId);

        if (navigator.onLine) await syncAll();
        const notes = await listNotesLocal();
        setAllNotes(notes);
        if (notes.length) await openNote(notes[0].name);
        setReady(true);
      } catch (err) {
        flash(String(err), 'error');
        setReady(true);
      }
    })();

    const onOnline = () => {
      setOnline(true);
      flash('Syncing…');
      syncAll()
        .then(refreshList)
        .then(() => flash('Synced', 'ok'))
        .catch((err) => flash(String(err), 'error'));
    };
    const onOffline = () => {
      setOnline(false);
      flash('Offline', 'neutral');
    };
    const onFocus = () => {
      if (navigator.onLine) syncAll().then(refreshList).catch(() => {});
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
    };
  }, [flash, openNote, refreshList]);

  useEffect(() => {
    if (!current) return;
    void fillEditor(body);
  }, [current, fillEditor]);

  function toggleChat(collapsed: boolean) {
    setChatCollapsed(collapsed);
    localStorage.setItem('sidepad-chat-collapsed', collapsed ? '1' : '0');
  }

  async function createNote() {
    const taken = new Set(allNotes.map((n) => n.name));
    let name = 'New Note';
    for (let i = 2; taken.has(name); i++) name = `New Note ${i}`;

    await writeNoteLocal(name, '');
    setCurrent(name);
    setTitle(name);
    setBody('');
    await loadChat(name);
    flash('Created', 'ok');
    await refreshList();
  }

  async function commitTitle() {
    const name = title.trim().replace(/\.md$/i, '');
    if (!name) {
      setTitle(current || '');
      return;
    }

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    if (!current) {
      await writeNoteLocal(name, body);
      setCurrent(name);
      flash('Created', 'ok');
    } else if (name !== current) {
      const next = await renameNoteLocal(current, name);
      setCurrent(next);
      setTitle(next);
      flash('Renamed', 'ok');
    }

    await refreshList();
  }

  async function deleteNoteByName(name: string) {
    setConfirmName(null);
    await deleteNoteLocal(name);

    if (current === name) {
      setCurrent(null);
      setTitle('');
      setBody('');
      setChatMessages([]);
    }

    flash('Deleted', 'ok');
    const notes = await listNotesLocal();
    setAllNotes(notes);

    if (current === name || !current) {
      if (notes.length) await openNote(notes[0].name);
    }
  }

  async function clearChat() {
    if (!current || asking) return;
    await clearChatLocal(current);
    setChatMessages([]);
    flash('Chat cleared', 'ok');
  }

  function onEditorInput() {
    const el = bodyRef.current;
    if (!el || !current) return;
    setBody(htmlToMd(el));
    scheduleSave();
  }

  function format(cmd: string) {
    document.execCommand(cmd);
    bodyRef.current?.focus();
    onEditorInput();
  }

  async function askCurrent() {
    if (!current || asking) return;
    if (!navigator.onLine) {
      flash('Ask needs network', 'error');
      return;
    }

    const message = askInput.trim();
    if (!message) {
      flash('Enter a question', 'error');
      return;
    }

    setAsking(true);
    setAskInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: message }]);
    setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Thinking…' }]);
    flash('Asking…');

    let started = false;

    try {
      await saveCurrent();
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: current, message }),
      });

      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AskEvent;

          if (ev.type === 'chunk') {
            setChatMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!started) {
                started = true;
                next[next.length - 1] = { role: 'assistant', content: ev.text };
              } else if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  role: 'assistant',
                  content: String(last.content || '') + ev.text,
                };
              }
              return next;
            });
            requestAnimationFrame(() => {
              if (chatLogRef.current) {
                chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
              }
            });
          } else if (ev.type === 'note_write') {
            setBody(ev.body);
            await fillEditor(ev.body);
            await mirrorNoteFromServer(current, ev.body, ev.mtime);
            await refreshList();
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        }
      }

      await syncAll();
      await loadChat(current);
      flash('Reply ready', 'ok');
    } catch (err) {
      if (!started) {
        setChatMessages((prev) => prev.slice(0, -1));
      }
      flash(String(err instanceof Error ? err.message : err), 'error');
    } finally {
      setAsking(false);
    }
  }

  async function logout() {
    clearLocalUserId();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const filtered = allNotes.filter(
    (n) =>
      !search.trim() ||
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.body.toLowerCase().includes(search.toLowerCase())
  );

  const empty = !current;
  const words = wordCount(body);

  function onGlobalKey(e: KeyboardEvent | globalThis.KeyboardEvent) {
    if (confirmName) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmName(null);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createNote().catch((err) => flash(String(err), 'error'));
    }
  }

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => onGlobalKey(e);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  if (!ready) {
    return (
      <main className="flex h-full items-center justify-center text-[var(--mute)]">
        Loading pad…
      </main>
    );
  }

  return (
    <div
      className={`grid h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        chatCollapsed
          ? 'grid-cols-[240px_1fr_0px]'
          : 'grid-cols-[240px_1fr_320px]'
      }`}
    >
      <aside className="scroll-on-dark flex min-h-0 flex-col bg-[var(--sidebar)] px-3 pb-3 text-[var(--sidebar-fg)]">
        <div className="px-2 pb-4 pt-7">
          <p className="m-0 text-[26px] font-bold leading-none tracking-tight">SidePad</p>
          <p className="mt-2 max-w-[16ch] text-[13px] leading-snug text-[var(--sidebar-fg)]/55">
            Notes that stay with you
          </p>
        </div>

        <button
          type="button"
          onClick={() => createNote().catch((err) => flash(String(err), 'error'))}
          className="mx-1 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98]"
        >
          New note
        </button>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="mx-1 mt-3 rounded-[var(--radius)] border-0 bg-white/10 px-3 py-2 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-fg)]/35 focus:bg-white/14"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-auto px-1">
          <ul className="m-0 list-none p-0">
            {filtered.map((note) => (
              <li key={note.name} className="group relative mb-0.5">
                <button
                  type="button"
                  onClick={() => openNote(note.name).catch((err) => flash(String(err), 'error'))}
                  className={`w-full rounded-[var(--radius)] px-3 py-2 pr-9 text-left text-sm transition-colors ${
                    note.name === current
                      ? 'bg-white/14 font-semibold'
                      : 'hover:bg-white/7'
                  }`}
                >
                  {note.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${note.name}`}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    setConfirmName(note.name);
                  }}
                  className="absolute right-1 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-lg text-[var(--sidebar-fg)]/45 hover:bg-white/10 hover:text-[var(--sidebar-fg)] group-hover:flex"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 px-2 text-xs text-[var(--sidebar-fg)]/50">
          <span>{online ? 'Online' : 'Offline'}</span>
          <button
            type="button"
            onClick={() => logout().catch((err) => flash(String(err), 'error'))}
            className="rounded-lg px-2 py-1 hover:bg-white/10 hover:text-[var(--sidebar-fg)]"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--paper)]" aria-label="Note editor">
        {empty ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <h1 className="m-0 text-3xl font-bold tracking-tight text-[var(--forest)]">
              Your pad is empty
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--mute)]">
              Create a note or open one from the list. Writing saves as you go.
            </p>
            <button
              type="button"
              onClick={() => createNote().catch((err) => flash(String(err), 'error'))}
              className="mt-5 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-press)] active:scale-[0.98]"
            >
              New note
            </button>
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 py-5">
            <div className="flex items-start gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => commitTitle().catch((err) => flash(String(err), 'error'))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  commitTitle()
                    .then(() => bodyRef.current?.focus())
                    .catch((err) => flash(String(err), 'error'));
                }}
                placeholder="Untitled"
                aria-label="Note title"
                className="min-w-0 flex-1 border-0 bg-transparent text-[28px] font-semibold leading-tight tracking-tight text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
              />
              {chatCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleChat(false)}
                  className="shrink-0 rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98]"
                >
                  Ask
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between border-b border-[var(--line-soft)] pb-2">
              <div className="flex gap-0.5" role="toolbar" aria-label="Format">
                {(
                  [
                    ['bold', 'B'],
                    ['italic', 'I'],
                    ['underline', 'U'],
                  ] as const
                ).map(([cmd, label]) => (
                  <button
                    key={cmd}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => format(cmd)}
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
                  onClick={() => current && setConfirmName(current)}
                  className="rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <aside
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--panel)] transition-opacity duration-200 ${
          chatCollapsed ? 'pointer-events-none border-0 opacity-0' : 'opacity-100'
        }`}
        aria-label="Note chat"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <p className="m-0 text-[15px] font-semibold tracking-tight text-[var(--ink)]">Ask</p>
          <div className="flex items-center gap-1">
            {chatMessages.length > 0 ? (
              <button
                type="button"
                onClick={() => clearChat().catch((err) => flash(String(err), 'error'))}
                className="rounded-[var(--radius)] px-2.5 py-1 text-[13px] text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Hide ask"
              onClick={() => toggleChat(true)}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-[var(--mute)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--ink)] active:scale-[0.98]"
            >
              ›
            </button>
          </div>
        </div>

        <div ref={chatLogRef} className="min-h-0 flex-1 overflow-auto px-4">
          {empty ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-2 text-center">
              <p className="m-0 max-w-[18ch] text-sm leading-relaxed text-[var(--mute)]">
                Open a note to ask about it.
              </p>
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-2 text-center">
              <p className="m-0 text-[15px] font-medium tracking-tight text-[var(--ink-soft)]">
                Ready when you are
              </p>
              <p className="mt-2 m-0 max-w-[22ch] text-[13px] leading-relaxed text-[var(--mute)]">
                Ask to rewrite, summarize, or fill gaps in this note.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 py-3">
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto rounded-[var(--radius)] rounded-br-sm bg-[var(--accent-soft)] text-[var(--forest)]'
                      : 'mr-auto rounded-[var(--radius)] rounded-bl-sm bg-[var(--paper)] text-[var(--ink)]'
                  } ${m.content === 'Thinking…' ? 'italic text-[var(--mute)]' : ''}`}
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--line-soft)] p-3">
          <div className="flex gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-1.5 focus-within:border-[var(--accent)]">
            <input
              value={askInput}
              disabled={asking || empty || !online}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                askCurrent().catch((err) => flash(String(err), 'error'));
              }}
              placeholder={online ? 'Ask about this note' : 'Needs network'}
              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-60"
            />
            <button
              type="button"
              disabled={asking || empty || !online}
              onClick={() => askCurrent().catch((err) => flash(String(err), 'error'))}
              className="shrink-0 rounded-[calc(var(--radius)-2px)] bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98] disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </div>
      </aside>

      {confirmName ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmName(null)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-sm rounded-[var(--radius)] bg-[var(--panel)] p-6 shadow-[0_24px_48px_rgba(14,20,17,0.22)]"
          >
            <p className="m-0 text-lg font-semibold">Delete note</p>
            <p className="mt-2 text-sm text-[var(--mute)]">This cannot be undone.</p>
            <p className="mt-3 font-medium">{confirmName}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmName(null)}
                className="rounded-[var(--radius)] px-4 py-2 text-sm hover:bg-[var(--line-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  deleteNoteByName(confirmName).catch((err) => flash(String(err), 'error'))
                }
                className="rounded-[var(--radius)] bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
