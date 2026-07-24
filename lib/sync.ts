import {
  enqueue,
  listOutbox,
  localDeleteChat,
  localDeleteNote,
  localListChats,
  localListNotes,
  localPutChat,
  localPutNote,
  localReadChat,
  localRenameNote,
  newId,
  now,
  removeOutbox,
  replaceAllLocal,
  rewriteOutboxForRename,
} from './local';
import type { ChatMessage, Note } from './types';

async function pull(): Promise<void> {
  const res = await fetch('/api/sync');
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as {
    notes: Note[];
    chats: { name: string; messages: ChatMessage[]; mtime: number }[];
  };
  await replaceAllLocal(data.notes, data.chats);
}

async function flush(): Promise<void> {
  const ops = await listOutbox();

  for (const op of ops) {
    let res: Response;

    if (op.kind === 'note_write') {
      res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: op.name, body: op.body, mtime: op.mtime }),
      });
    } else if (op.kind === 'note_rename') {
      res = await fetch('/api/notes/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: op.from, to: op.to, mtime: op.mtime }),
      });
    } else if (op.kind === 'note_delete') {
      res = await fetch(
        `/api/notes?name=${encodeURIComponent(op.name)}&mtime=${op.mtime}`,
        { method: 'DELETE' }
      );
    } else if (op.kind === 'chat_write') {
      res = await fetch('/api/chats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: op.name,
          messages: op.messages,
          mtime: op.mtime,
        }),
      });
    } else {
      res = await fetch(
        `/api/chats?name=${encodeURIComponent(op.name)}&mtime=${op.mtime}`,
        { method: 'DELETE' }
      );
    }

    if (!res.ok && res.status !== 409) {
      throw new Error(await res.text());
    }

    await removeOutbox(op.id);
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

export async function writeNoteLocal(name: string, body: string): Promise<Note> {
  const mtime = now();
  const note = { name, body, mtime };
  await localPutNote(note);
  await enqueue({ id: newId(), kind: 'note_write', name, body, mtime });
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

export async function writeChatLocal(name: string, messages: ChatMessage[]): Promise<void> {
  const mtime = now();
  await localPutChat({ name, messages, mtime });
  await enqueue({ id: newId(), kind: 'chat_write', name, messages, mtime });
  if (navigator.onLine) await syncAll().catch(() => {});
}

export async function mirrorNoteFromServer(name: string, body: string, mtime: number): Promise<void> {
  const local = (await localListNotes()).find((n) => n.name === name);
  if (local && local.mtime > mtime) return;
  await localPutNote({ name, body, mtime });
}

export { localListChats };
