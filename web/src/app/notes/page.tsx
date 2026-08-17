'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  FolderPlus,
  NotePencil,
} from '@phosphor-icons/react';
import { IncognitoIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { AskPanel } from '@/app/notes/components/ask-panel';
import { ConfirmModal } from '@/app/notes/components/confirm-modal';
import { Mascot } from '@/app/notes/components/mascot';
import { NoteEditor, type NoteEditorHandle } from '@/app/notes/components/note-editor';
import { PromptModal } from '@/app/notes/components/prompt-modal';
import { parseBoard } from '@/app/notes/helpers/board';
import {
  decryptNote,
  decryptWithKey,
  encryptNote,
  encryptWithKey,
  isEncryptedNote,
} from '@/app/notes/helpers/note-crypto';
import {
  basename,
  buildNoteTree,
  dirname,
  type NoteTreeNode,
} from '@/app/notes/helpers/note-path';
import {
  clearUnlockEntry,
  getDevicePassphrase,
  getUnlockEntry,
  renameUnlockEntry,
  setUnlockEntry,
  type UnlockEntry,
} from '@/app/notes/helpers/unlock-session';
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
import { errorMessage } from '@/app/shared/errors';
import type { Note } from '@/app/shared/types';

const COLLAPSED_FOLDERS_KEY = 'sidepad-collapsed-folders';

function loadCollapsedFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_FOLDERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry) => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

function uniqueNoteName(taken: Set<string>, folderPath: string): string {
  const base = folderPath ? `${folderPath}/New Note` : 'New Note';
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix++) {
    const candidate = folderPath
      ? `${folderPath}/New Note ${suffix}`
      : `New Note ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

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
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set()
  );
  const [isNoteEncrypted, setIsNoteEncrypted] = useState(false);
  const [isNoteLocked, setIsNoteLocked] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<'unlock' | null>(
    null
  );
  const [isIncognito, setIsIncognito] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<string | null>(null);
  const bodyValueRef = useRef('');
  const boardValueRef = useRef('');
  const isNoteEncryptedRef = useRef(false);
  const envelopeRef = useRef('');
  const editorRef = useRef<NoteEditorHandle>(null);
  const noteOpRef = useRef(Promise.resolve());
  const committingTitleRef = useRef(false);

  currentRef.current = current;
  bodyValueRef.current = body;
  boardValueRef.current = board;
  isNoteEncryptedRef.current = isNoteEncrypted;

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

      if (
        !isEncryptedNote(nextBody) &&
        !nextBoard &&
        parseBoard(nextBody)
      ) {
        nextBoard = nextBody;
        nextBody = '';
        await writeNoteLocal(name, nextBody, nextBoard);
      }

      setCurrent(name);
      setTitle(basename(name));

      if (isEncryptedNote(nextBody)) {
        envelopeRef.current = nextBody;
        setIsNoteEncrypted(true);

        const unlock = getUnlockEntry(name);

        if (unlock) {
          const payload = await decryptWithKey(unlock.key, nextBody);
          setIsNoteLocked(false);
          setBody(payload.body);
          setBoard(payload.board);
          flash('Editing');
          setAllNotes(await listNotesLocal());
          await editorRef.current?.fill(payload.body);
          return;
        }

        try {
          const unlocked = await decryptNote(getDevicePassphrase(), nextBody);
          setUnlockEntry(name, { key: unlocked.key, salt: unlocked.salt });
          setIsNoteLocked(false);
          setBody(unlocked.body);
          setBoard(unlocked.board);
          flash('Editing');
          setAllNotes(await listNotesLocal());
          await editorRef.current?.fill(unlocked.body);
          return;
        } catch {
          setIsNoteLocked(true);
          setBody('');
          setBoard('');
          flash('Locked');
          setAllNotes(await listNotesLocal());
          await editorRef.current?.fill('');
          return;
        }
      }

      envelopeRef.current = '';
      setIsNoteEncrypted(false);
      setIsNoteLocked(false);
      setBody(nextBody);
      setBoard(nextBoard);
      flash('Editing');
      setAllNotes(await listNotesLocal());
      await editorRef.current?.fill(nextBody);
    },
    [flash]
  );

  async function persistEncrypted(name: string): Promise<UnlockEntry | null> {
    const unlock = getUnlockEntry(name);
    if (!unlock) return null;

    const envelope = await encryptWithKey(unlock.key, unlock.salt, {
      body: bodyValueRef.current,
      board: boardValueRef.current,
    });
    envelopeRef.current = envelope;
    await writeNoteLocal(name, envelope, '');

    return unlock;
  }

  const saveCurrent = useCallback(async () => {
    await runNoteOp(async () => {
      const name = currentRef.current;
      if (!name || isNoteLocked) return;

      flash('Saving...');

      if (isNoteEncryptedRef.current) {
        if (!(await persistEncrypted(name))) return;
      } else {
        await writeNoteLocal(
          name,
          bodyValueRef.current,
          boardValueRef.current
        );
      }

      await refreshList();
      flash('Saved', 'ok');
    });
  }, [flash, isNoteLocked, refreshList]);

  const scheduleSave = useCallback(() => {
    if (isNoteLocked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    flash('Saving...');
    saveTimer.current = setTimeout(() => {
      saveCurrent().catch((caughtError) =>
        flash(errorMessage(caughtError), 'error')
      );
    }, 400);
  }, [flash, isNoteLocked, saveCurrent]);

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
    setCollapsedFolders(loadCollapsedFolders());

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
    if (!collapsed && isIncognito) return;

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

  function toggleFolder(path: string) {
    setCollapsedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  async function clearOpenNote() {
    setCurrent(null);
    setTitle('');
    setBody('');
    setBoard('');
    envelopeRef.current = '';
    setIsNoteEncrypted(false);
    setIsNoteLocked(false);
    await editorRef.current?.fill('');
  }

  async function enterIncognito() {
    setIsIncognito(true);
    toggleChat(true);

    if (currentRef.current && !isNoteEncryptedRef.current) {
      await clearOpenNote();
    }

    flash('Incognito on', 'ok');
  }

  async function exitIncognito() {
    setIsIncognito(false);

    if (currentRef.current && isNoteEncryptedRef.current) {
      await clearOpenNote();
    }

    flash('Incognito off');
  }

  async function writeNewNote(name: string) {
    if (isIncognito) {
      const { envelope, key, salt } = await encryptNote(
        getDevicePassphrase(),
        { body: '', board: '' }
      );

      await writeNoteLocal(name, envelope, '');
      envelopeRef.current = envelope;
      setUnlockEntry(name, { key, salt });
      setIsNoteEncrypted(true);
      setIsNoteLocked(false);
      return;
    }

    await writeNoteLocal(name, '', '');
    envelopeRef.current = '';
    setIsNoteEncrypted(false);
    setIsNoteLocked(false);
  }

  async function createNote() {
    const taken = new Set(allNotes.map((note) => note.name));
    const name = uniqueNoteName(taken, '');

    await runNoteOp(async () => {
      await writeNewNote(name);
      setCurrent(name);
      setTitle(basename(name));
      setBody('');
      setBoard('');
      flash('Created', 'ok');
      await refreshList();
      await editorRef.current?.fill('');
    });
  }

  async function createFolder(folderName: string) {
    const folderPath = folderName
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .map((segment) => segment.trim())
      .join('/');

    if (
      !folderPath ||
      folderPath.split('/').some(
        (segment) => !segment || segment === '.' || segment === '..'
      )
    ) {
      throw new Error('Use a name, or nest with / like Work/Q1');
    }

    const taken = new Set(allNotes.map((note) => note.name));
    const name = uniqueNoteName(taken, folderPath);

    await runNoteOp(async () => {
      await writeNewNote(name);
      setCollapsedFolders((previous) => {
        const next = new Set(previous);
        next.delete(folderPath);
        localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]));
        return next;
      });
      setCurrent(name);
      setTitle(basename(name));
      setBody('');
      setBoard('');
      flash('Created', 'ok');
      await refreshList();
      await editorRef.current?.fill('');
    });

    setIsFolderModalOpen(false);
  }

  async function commitTitle() {
    if (committingTitleRef.current) return;
    committingTitleRef.current = true;

    try {
      const leaf = title
        .trim()
        .replace(/\.md$/i, '')
        .replace(/[\\/]+/g, '');

      if (!leaf || leaf === '.' || leaf === '..') {
        setTitle(current ? basename(current) : '');
        return;
      }

      const folder = current ? dirname(current) : '';
      const name = folder ? `${folder}/${leaf}` : leaf;

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      await runNoteOp(async () => {
        const from = currentRef.current;

        if (!from) {
          flash('Saving...');

          if (isNoteEncryptedRef.current) {
            const unlock = await persistEncrypted(name);
            if (!unlock) return;

            setUnlockEntry(name, unlock);
          } else {
            await writeNoteLocal(
              name,
              bodyValueRef.current,
              boardValueRef.current
            );
          }

          setCurrent(name);
          setTitle(basename(name));
          flash('Created', 'ok');
        } else if (name !== from) {
          flash('Saving...');

          if (isNoteEncryptedRef.current) {
            if (!(await persistEncrypted(from))) return;
          } else {
            await writeNoteLocal(
              from,
              bodyValueRef.current,
              boardValueRef.current
            );
          }

          const next = await renameNoteLocal(from, name);
          renameUnlockEntry(from, next);
          setCurrent(next);
          setTitle(basename(next));
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
    clearUnlockEntry(name);

    if (current === name) {
      setCurrent(null);
      setTitle('');
      setBody('');
      setBoard('');
      envelopeRef.current = '';
      setIsNoteEncrypted(false);
      setIsNoteLocked(false);
    }

    flash('Deleted', 'ok');
    const notes = await listNotesLocal();
    setAllNotes(notes);

    if (current === name || !current) {
      const nextNote = notes.find(
        (note) => isEncryptedNote(note.body) === isIncognito
      );

      if (nextNote) await openNote(nextNote.name);
      else await clearOpenNote();
    }
  }

  async function unlockCurrent(passphrase: string) {
    const name = currentRef.current;
    if (!name || !envelopeRef.current) return;

    const unlocked = await decryptNote(passphrase, envelopeRef.current);

    setUnlockEntry(name, { key: unlocked.key, salt: unlocked.salt });
    setIsNoteLocked(false);
    setIsNoteEncrypted(true);
    setBody(unlocked.body);
    setBoard(unlocked.board);
    setPasswordModalMode(null);
    flash('Unlocked', 'ok');
    await editorRef.current?.fill(unlocked.body);
  }

  async function logout() {
    clearLocalUserId();
    await logoutSession();
    window.location.href = '/auth/login';
  }

  const filtered = allNotes.filter((note) => {
    if (isEncryptedNote(note.body) !== isIncognito) return false;

    const query = search.trim().toLowerCase();
    if (!query) return true;

    if (note.name.toLowerCase().includes(query)) return true;
    if (isEncryptedNote(note.body)) return false;

    return note.body.toLowerCase().includes(query);
  });

  const noteTree = buildNoteTree(filtered);
  const isSearching = Boolean(search.trim());
  const isEmpty = !current;

  function renderTreeNodes(nodes: NoteTreeNode[]) {
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        const isCollapsed = !isSearching && collapsedFolders.has(node.path);

        return (
          <li key={`folder:${node.path}`} className="relative">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => toggleFolder(node.path)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius)] py-1.5 pl-1.5 pr-2 text-left text-[13px] font-medium text-[var(--sidebar-fg)]/65 transition-colors hover:bg-white/7 hover:text-[var(--sidebar-fg)]/90 active:scale-[0.99]"
            >
              <span
                aria-hidden="true"
                className={`inline-block w-3 shrink-0 text-center text-[10px] leading-none opacity-50 transition-transform duration-150 ${
                  isCollapsed ? '' : 'rotate-90'
                }`}
              >
                ▸
              </span>
              <span className="truncate">{node.name}</span>
            </button>
            {isCollapsed ? null : (
              <ul className="m-0 ml-[11px] list-none border-l border-[color-mix(in_oklab,var(--sidebar-fg)_14%,transparent)] py-0.5 pl-2">
                {renderTreeNodes(node.children)}
              </ul>
            )}
          </li>
        );
      }

      return (
        <li key={node.name} className="group relative">
          <button
            type="button"
            onClick={() =>
              openNote(node.name)
                .then(() => {
                  if (isMobile) toggleSidebar(true);
                })
                .catch((caughtError) =>
                  flash(errorMessage(caughtError), 'error')
                )
            }
            className={`flex w-full items-center gap-1.5 rounded-[var(--radius)] py-1.5 pl-1.5 pr-9 text-left text-sm transition-colors active:scale-[0.99] ${
              node.name === current
                ? 'bg-white/14 font-semibold text-[var(--sidebar-fg)]'
                : 'text-[var(--sidebar-fg)]/90 hover:bg-white/7'
            }`}
          >
            <span className="truncate">{node.label}</span>
          </button>
          <button
            type="button"
            aria-label={`Delete ${node.name}`}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              setConfirmName(node.name);
            }}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] text-base text-[var(--sidebar-fg)]/40 opacity-0 transition-[opacity,transform,background-color,color] hover:bg-white/10 hover:text-[var(--sidebar-fg)] group-hover:opacity-100 group-focus-within:opacity-100 active:scale-[0.98] focus-visible:opacity-100"
          >
            ×
          </button>
        </li>
      );
    });
  }

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
    if (isIncognito) {
      document.documentElement.dataset.incognito = '';
    } else {
      delete document.documentElement.dataset.incognito;
    }

    return () => {
      delete document.documentElement.dataset.incognito;
    };
  }, [isIncognito]);

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
      className={`grid h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${gridCols}`}
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
        className={`scroll-on-dark flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--sidebar)] px-3 pb-3 text-[var(--sidebar-fg)] transition-[opacity,transform,background-color,color] duration-300 ${
          isSidebarCollapsed
            ? 'pointer-events-none opacity-0'
            : isMobile
              ? 'fixed inset-y-0 left-0 z-40 w-[min(240px,85vw)] opacity-100 shadow-[8px_0_32px_rgba(0,0,0,0.28)]'
              : 'opacity-100'
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-2 pb-4 pt-7">
          <div className="flex min-w-0 items-start gap-2.5">
            <Mascot
              key={`${statusKind}:${status}`}
              mood={
                statusKind === 'error'
                  ? 'worried'
                  : statusKind === 'ok'
                    ? 'happy'
                    : 'idle'
              }
              size="md"
              tone="sidebar"
            />
            <div className="min-w-0 pt-1">
              <p className="m-0 text-[26px] font-bold leading-none tracking-tight">
                SidePad
              </p>
              <p className="mt-2 max-w-[14ch] text-[13px] leading-snug text-[var(--sidebar-fg)]/55">
                {isIncognito
                  ? 'Encrypted notes only'
                  : 'Notes that stay with you'}
              </p>
            </div>
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

        <div className="mx-1 grid grid-cols-3 gap-2">
          <button
            type="button"
            aria-label="New note"
            title="New note"
            onClick={() =>
              createNote().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              )
            }
            className="flex h-10 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] text-white transition-[background-color,transform] hover:bg-[var(--accent-press)] active:scale-[0.98]"
          >
            <NotePencil size={18} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={() => setIsFolderModalOpen(true)}
            className="flex h-10 items-center justify-center rounded-[var(--radius)] border border-white/14 bg-transparent text-[var(--sidebar-fg)]/80 transition-[background-color,border-color,color,transform] hover:border-white/22 hover:bg-white/6 hover:text-[var(--sidebar-fg)] active:scale-[0.98]"
          >
            <FolderPlus size={18} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={isIncognito}
            aria-label={isIncognito ? 'Exit Incognito' : 'Enter Incognito'}
            title={isIncognito ? 'Exit Incognito' : 'Incognito'}
            onClick={() => {
              if (isIncognito) {
                exitIncognito().catch((caughtError) =>
                  flash(errorMessage(caughtError), 'error')
                );
                return;
              }

              enterIncognito().catch((caughtError) =>
                flash(errorMessage(caughtError), 'error')
              );
            }}
            className={`flex h-10 items-center justify-center rounded-[var(--radius)] border transition-[background-color,border-color,color,transform] active:scale-[0.98] ${
              isIncognito
                ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-[var(--sidebar-fg)] hover:bg-[color-mix(in_oklab,var(--accent)_30%,transparent)]'
                : 'border-white/14 bg-transparent text-[var(--sidebar-fg)]/70 hover:border-white/22 hover:bg-white/6 hover:text-[var(--sidebar-fg)]'
            }`}
          >
            <HugeiconsIcon
              icon={IncognitoIcon}
              size={18}
              color="currentColor"
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="mx-1 mt-3 rounded-[var(--radius)] border-0 bg-white/10 px-3 py-2 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-fg)]/35 focus:bg-white/14"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-auto px-1">
          {noteTree.length ? (
            <ul className="m-0 flex list-none flex-col gap-px p-0">
              {renderTreeNodes(noteTree)}
            </ul>
          ) : (
            <p className="m-0 px-2 py-6 text-center text-[13px] leading-relaxed text-[var(--sidebar-fg)]/40">
              {isSearching
                ? 'No notes match.'
                : isIncognito
                  ? 'No encrypted notes yet.'
                  : 'No notes yet.'}
            </p>
          )}
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
        isEncrypted={isNoteEncrypted}
        isLocked={isNoteLocked}
        onTitleChange={(next) => setTitle(next.replace(/[\\/]/g, ''))}
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
        onRequestUnlock={() => setPasswordModalMode('unlock')}
      />

      <AskPanel
        current={current}
        isEmpty={isEmpty}
        isOnline={isOnline}
        isCollapsed={isChatCollapsed}
        isOverlay={isMobile}
        isEncrypted={isNoteEncrypted}
        onCollapse={toggleChat}
        flash={flash}
        saveCurrent={saveCurrent}
        refreshList={refreshList}
        onNoteWrite={async (nextBody) => {
          setBody(nextBody);
          await editorRef.current?.fill(nextBody);
        }}
        onBoardWrite={async (nextBoard) => {
          setBoard(nextBoard);
        }}
      />

      <PromptModal
        open={isFolderModalOpen}
        title="New folder"
        body="Notes inside use path names like Work/Ideas."
        label="Folder name"
        placeholder="Work"
        confirmLabel="Create"
        onClose={() => setIsFolderModalOpen(false)}
        onConfirm={createFolder}
      />

      <PromptModal
        open={passwordModalMode === 'unlock'}
        title="Unlock note"
        body="Enter the passphrase for this note."
        label="Passphrase"
        confirmLabel="Unlock"
        inputType="password"
        onClose={() => setPasswordModalMode(null)}
        onConfirm={unlockCurrent}
      />

      <ConfirmModal
        open={Boolean(confirmName)}
        title="Delete note"
        body={
          confirmName
            ? `Delete ${confirmName}? This cannot be undone.`
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        onClose={() => setConfirmName(null)}
        onConfirm={() => {
          if (!confirmName) return;
          deleteNoteByName(confirmName).catch((caughtError) =>
            flash(errorMessage(caughtError), 'error')
          );
        }}
      />
    </div>
  );
}
