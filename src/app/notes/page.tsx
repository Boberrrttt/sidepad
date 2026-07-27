'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { AskPanel } from '@/app/notes/components/ask-panel';
import { NoteEditor, type NoteEditorHandle } from '@/app/notes/components/note-editor';
import { parseBoard } from '@/app/notes/helpers/board';
import { getMe, logout as logoutSession } from '@/app/auth/api';
import {
  deleteNoteLocal,
  listNotesLocal,
  renameNoteLocal,
  syncAll,
  writeNoteLocal,
} from '@/app/notes/sync/api';
import {
  clearLocalUserId,
  setLocalUserId,
} from '@/app/shared/local-user';
import { errorMessage } from '@/shared/errors';
import type { Note } from '@/shared/types';

export default function SidePad() {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [board, setBoard] = useState('');
  const [status, setStatus] = useState('Ready');
  const [statusKind, setStatusKind] = useState<'neutral' | 'ok' | 'error'>('neutral');
  const [search, setSearch] = useState('');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<string | null>(null);
  const bodyValueRef = useRef('');
  const boardValueRef = useRef('');
  const editorRef = useRef<NoteEditorHandle>(null);
  const noteOpRef = useRef(Promise.resolve());
  const committingTitleRef = useRef(false);

  currentRef.current = current;
  bodyValueRef.current = body;
  boardValueRef.current = board;

  function runNoteOp(work: () => Promise<void>) {
    const next = noteOpRef.current.then(work, work);
    noteOpRef.current = next.catch(() => {});
    return next;
  }

  const flash = useCallback(
    (message: string, kind: 'neutral' | 'ok' | 'error' = 'neutral') => {
      setStatus(message);
      setStatusKind(kind);
    },
    []
  );

  const refreshList = useCallback(async () => {
    setAllNotes(await listNotesLocal());
  }, []);

  const openNote = useCallback(
    async (name: string) => {
      const notes = await listNotesLocal();
      const note = notes.find((entry) => entry.name === name);
      let nextBody = note?.body ?? '';
      let nextBoard = note?.board ?? '';

      if (!nextBoard && parseBoard(nextBody)) {
        nextBoard = nextBody;
        nextBody = '';
        await writeNoteLocal(name, nextBody, nextBoard);
      }

      setCurrent(name);
      setTitle(name);
      setBody(nextBody);
      setBoard(nextBoard);
      flash('Editing');
      setAllNotes(await listNotesLocal());
      await editorRef.current?.fill(nextBody);
    },
    [flash]
  );

  const saveCurrent = useCallback(async () => {
    const name = currentRef.current;
    if (!name) return;

    const bodySnapshot = bodyValueRef.current;
    const boardSnapshot = boardValueRef.current;

    await runNoteOp(async () => {
      flash('Saving...');
      await writeNoteLocal(name, bodySnapshot, boardSnapshot);
      await refreshList();
      flash('Saved', 'ok');
    });
  }, [flash, refreshList]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    flash('Saving...');
    saveTimer.current = setTimeout(() => {
      saveCurrent().catch((caughtError) =>
        flash(errorMessage(caughtError), 'error')
      );
    }, 400);
  }, [flash, saveCurrent]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const syncMobile = () => setIsMobile(mediaQuery.matches);

    syncMobile();
    mediaQuery.addEventListener('change', syncMobile);

    return () => mediaQuery.removeEventListener('change', syncMobile);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const chatStored = localStorage.getItem('sidepad-chat-collapsed');
    const sidebarStored = localStorage.getItem('sidepad-sidebar-collapsed');

    setIsChatCollapsed(chatStored === '1' || (chatStored === null && mobile));
    setIsSidebarCollapsed(
      sidebarStored === '1' || (sidebarStored === null && mobile)
    );

    (async () => {
      try {
        const auth = await getMe();
        setLocalUserId(auth.userId);

        if (navigator.onLine) await syncAll();

        const notes = await listNotesLocal();
        setAllNotes(notes);

        if (notes.length) await openNote(notes[0].name);

        setIsReady(true);
      } catch (caughtError) {
        flash(errorMessage(caughtError), 'error');
        setIsReady(true);
      }
    })();

    const onOnline = () => {
      setIsOnline(true);
      flash('Syncing…');
      syncAll()
        .then(refreshList)
        .then(() => flash('Synced', 'ok'))
        .catch((caughtError) => flash(errorMessage(caughtError), 'error'));
    };

    const onOffline = () => {
      setIsOnline(false);
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

  function toggleChat(collapsed: boolean) {
    setIsChatCollapsed(collapsed);
    localStorage.setItem('sidepad-chat-collapsed', collapsed ? '1' : '0');

    if (!collapsed && isMobile) {
      setIsSidebarCollapsed(true);
      localStorage.setItem('sidepad-sidebar-collapsed', '1');
    }
  }

  function toggleSidebar(collapsed: boolean) {
    setIsSidebarCollapsed(collapsed);
    localStorage.setItem('sidepad-sidebar-collapsed', collapsed ? '1' : '0');

    if (!collapsed && isMobile) {
      setIsChatCollapsed(true);
      localStorage.setItem('sidepad-chat-collapsed', '1');
    }
  }

  const gridCols = isMobile
    ? 'grid-cols-[0px_1fr_0px]'
    : isSidebarCollapsed
      ? isChatCollapsed
        ? 'grid-cols-[0px_1fr_0px]'
        : 'grid-cols-[0px_1fr_320px]'
      : isChatCollapsed
        ? 'grid-cols-[240px_1fr_0px]'
        : 'grid-cols-[240px_1fr_320px]';

  const isDrawerOpen = isMobile && (!isSidebarCollapsed || !isChatCollapsed);

  async function createNote() {
    const taken = new Set(allNotes.map((note) => note.name));
    let name = 'New Note';

    for (let suffix = 2; taken.has(name); suffix++) {
      name = `New Note ${suffix}`;
    }

    await runNoteOp(async () => {
      await writeNoteLocal(name, '', '');
      setCurrent(name);
      setTitle(name);
      setBody('');
      setBoard('');
      flash('Created', 'ok');
      await refreshList();
      await editorRef.current?.fill('');
    });
  }

  async function commitTitle() {
    if (committingTitleRef.current) return;
    committingTitleRef.current = true;

    try {
      const name = title.trim().replace(/\.md$/i, '');

      if (!name) {
        setTitle(current || '');
        return;
      }

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      await runNoteOp(async () => {
        const from = currentRef.current;

        if (!from) {
          flash('Saving...');
          await writeNoteLocal(
            name,
            bodyValueRef.current,
            boardValueRef.current
          );
          setCurrent(name);
          flash('Created', 'ok');
        } else if (name !== from) {
          flash('Saving...');
          await writeNoteLocal(
            from,
            bodyValueRef.current,
            boardValueRef.current
          );
          const next = await renameNoteLocal(from, name);
          setCurrent(next);
          setTitle(next);
          flash('Renamed', 'ok');
        }

        await refreshList();
      });
    } finally {
      committingTitleRef.current = false;
    }
  }

  async function deleteNoteByName(name: string) {
    setConfirmName(null);
    await deleteNoteLocal(name);

    if (current === name) {
      setCurrent(null);
      setTitle('');
      setBody('');
      setBoard('');
    }

    flash('Deleted', 'ok');
    const notes = await listNotesLocal();
    setAllNotes(notes);

    if (current === name || !current) {
      if (notes.length) await openNote(notes[0].name);
    }
  }

  async function logout() {
    clearLocalUserId();
    await logoutSession();
    window.location.href = '/auth/login';
  }

  const filtered = allNotes.filter((note) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return (
      note.name.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query)
    );
  });

  const isEmpty = !current;

  function onGlobalKey(event: KeyboardEvent | globalThis.KeyboardEvent) {
    if (confirmName) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmName(null);
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      createNote().catch((caughtError) =>
        flash(errorMessage(caughtError), 'error')
      );
    }
  }

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => onGlobalKey(event);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  if (!isReady) {
    return (
      <main className="flex h-full items-center justify-center text-[var(--mute)]">
        Loading pad…
      </main>
    );
  }

  return (
    <div
      className={`grid h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] ${gridCols}`}
    >
      {isDrawerOpen ? (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => {
            toggleSidebar(true);
            toggleChat(true);
          }}
        />
      ) : null}

      <aside
        className={`scroll-on-dark flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--sidebar)] px-3 pb-3 text-[var(--sidebar-fg)] transition-[opacity,transform] duration-200 ${
          isSidebarCollapsed
            ? 'pointer-events-none opacity-0'
            : isMobile
              ? 'fixed inset-y-0 left-0 z-40 w-[min(240px,85vw)] opacity-100 shadow-[8px_0_32px_rgba(0,0,0,0.28)]'
              : 'opacity-100'
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-2 pb-4 pt-7">
          <div>
            <p className="m-0 text-[26px] font-bold leading-none tracking-tight">SidePad</p>
            <p className="mt-2 max-w-[16ch] text-[13px] leading-snug text-[var(--sidebar-fg)]/55">
              Notes that stay with you
            </p>
          </div>
          <button
            type="button"
            aria-label="Hide notes"
            onClick={() => toggleSidebar(true)}
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--sidebar-fg)]/55 transition-colors hover:bg-white/10 hover:text-[var(--sidebar-fg)] active:scale-[0.98]"
          >
            ‹
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            createNote().catch((caughtError) =>
              flash(errorMessage(caughtError), 'error')
            )
          }
          className="mx-1 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-press)] active:scale-[0.98]"
        >
          New note
        </button>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
                  onClick={() =>
                    openNote(note.name)
                      .then(() => {
                        if (isMobile) toggleSidebar(true);
                      })
                      .catch((caughtError) =>
                        flash(errorMessage(caughtError), 'error')
                      )
                  }
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
                  onClick={(event: MouseEvent) => {
                    event.stopPropagation();
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
          <span>{isOnline ? 'Online' : 'Offline'}</span>
          <button
            type="button"
            onClick={() =>
              logout().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              )
            }
            className="rounded-lg px-2 py-1 hover:bg-white/10 hover:text-[var(--sidebar-fg)]"
          >
            Log out
          </button>
        </div>
      </aside>

      <NoteEditor
        ref={editorRef}
        isEmpty={isEmpty}
        current={current}
        title={title}
        body={body}
        board={board}
        status={status}
        statusKind={statusKind}
        isChatCollapsed={isChatCollapsed}
        isSidebarCollapsed={isSidebarCollapsed}
        onTitleChange={setTitle}
        onCommitTitle={async () => {
          try {
            await commitTitle();
          } catch (caughtError) {
            flash(errorMessage(caughtError), 'error');
          }
        }}
        onBodyChange={setBody}
        onBoardChange={setBoard}
        onScheduleSave={scheduleSave}
        onOpenAsk={() => toggleChat(false)}
        onOpenSidebar={() => toggleSidebar(false)}
        onRequestDelete={() => current && setConfirmName(current)}
        onCreateNote={() =>
          createNote().catch((caughtError) =>
            flash(errorMessage(caughtError), 'error')
          )
        }
      />

      <AskPanel
        current={current}
        isEmpty={isEmpty}
        isOnline={isOnline}
        isCollapsed={isChatCollapsed}
        isOverlay={isMobile}
        onCollapse={toggleChat}
        flash={flash}
        saveCurrent={saveCurrent}
        refreshList={refreshList}
        onNoteWrite={async (nextBody) => {
          setBody(nextBody);
          await editorRef.current?.fill(nextBody);
        }}
      />

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
                  deleteNoteByName(confirmName).catch((caughtError) =>
                    flash(errorMessage(caughtError), 'error')
                  )
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
