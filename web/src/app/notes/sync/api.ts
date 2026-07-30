import {
  enqueue,
  listOutbox,
  localDeleteChat,
  localDeleteNote,
  localListNotes,
  localPutNote,
  localReadChat,
  localRenameNote,
  newId,
  now,
  removeOutbox,
  replaceAllLocal,
  rewriteOutboxForRename,
} from '@/app/notes/sync/local';
import type { ChatMessage, Note } from '@/app/shared/types';

async function pull(): Promise<void> {
  const response = await fetch('/api/sync');
  if (!response.ok) throw new Error(await response.text());

  const data = (await response.json()) as {
    notes: Note[];
    chats: { name: string; messages: ChatMessage[]; mtime: number }[];
  };

  await replaceAllLocal(data.notes, data.chats);
}

async function flush(): Promise<void> {
  const operations = await listOutbox();

  for (const operation of operations) {
    let response: Response;

    if (operation.kind === 'note_write') {
      response = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: operation.name,
          body: operation.body,
          board: operation.board ?? '',
          mtime: operation.mtime,
        }),
      });
    } else if (operation.kind === 'note_rename') {
      response = await fetch('/api/notes/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: operation.from,
          to: operation.to,
          mtime: operation.mtime,
        }),
      });
    } else if (operation.kind === 'note_delete') {
      response = await fetch(
        `/api/notes?name=${encodeURIComponent(operation.name)}&mtime=${operation.mtime}`,
        { method: 'DELETE' }
      );
    } else if (operation.kind === 'chat_write') {
      response = await fetch('/api/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: operation.name,
          messages: operation.messages,
          mtime: operation.mtime,
        }),
      });
    } else {
      response = await fetch(
        `/api/chat?name=${encodeURIComponent(operation.name)}&mtime=${operation.mtime}`,
        { method: 'DELETE' }
      );
    }

    if (!response.ok && response.status !== 409) {
      throw new Error(await response.text());
    }

    await removeOutbox(operation.id);
  }
}

export async function syncAll(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await flush();
  await pull();
}

export async function listNotesLocal(): Promise<Note[]> {
  return localListNotes();
}

export async function writeNoteLocal(
  name: string,
  body: string,
  board?: string
): Promise<Note> {
  const mtime = now();
  const existing = (await localListNotes()).find((note) => note.name === name);
  const nextBoard = board !== undefined ? board : (existing?.board ?? '');
  const note = { name, body, board: nextBoard, mtime };
  await localPutNote(note);
  await enqueue({
    id: newId(),
    kind: 'note_write',
    name,
    body,
    board: nextBoard,
    mtime,
  });
  if (navigator.onLine) await syncAll().catch(() => {});
  return note;
}

export async function renameNoteLocal(from: string, to: string): Promise<string> {
  const mtime = now();
  await rewriteOutboxForRename(from, to);
  await localRenameNote(from, to, mtime);
  await enqueue({ id: newId(), kind: 'note_rename', from, to, mtime });
  if (navigator.onLine) await syncAll().catch(() => {});
  return to;
}

export async function deleteNoteLocal(name: string): Promise<void> {
  const mtime = now();
  await localDeleteNote(name);
  await enqueue({ id: newId(), kind: 'note_delete', name, mtime });
  if (navigator.onLine) await syncAll().catch(() => {});
}

export async function getChatLocal(name: string) {
  return localReadChat(name);
}

export async function clearChatLocal(name: string): Promise<void> {
  const mtime = now();
  await localDeleteChat(name);
  await enqueue({ id: newId(), kind: 'chat_delete', name, mtime });
  if (navigator.onLine) await syncAll().catch(() => {});
}

export async function mirrorNoteFromServer(
  name: string,
  body: string,
  mtime: number
): Promise<void> {
  const local = (await localListNotes()).find((note) => note.name === name);
  if (local && local.mtime > mtime) return;
  await localPutNote({
    name,
    body,
    board: local?.board ?? '',
    mtime,
  });
}
