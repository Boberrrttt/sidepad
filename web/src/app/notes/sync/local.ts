import { getLocalUserId } from '@/app/shared/local-user';
import type { Chat, Note, OutboxOp } from '@sidepad/shared';

const DB_VERSION = 1;

function dbName(): string {
  const userId = getLocalUserId();
  if (!userId) throw new Error('not logged in');
  return `sidepad-${userId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(), DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'name' });
      }

      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'name' });
      }

      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function normalizeNote(note: Note): Note {
  return {
    name: note.name,
    body: note.body ?? '',
    board: note.board ?? '',
    mtime: note.mtime,
  };
}

export async function localListNotes(): Promise<Note[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('notes', 'readonly');
    const request = transaction.objectStore('notes').getAll();

    request.onsuccess = () => {
      const rows = (request.result as Note[])
        .map(normalizeNote)
        .sort((left, right) => right.mtime - left.mtime);
      resolve(rows);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function localPutNote(note: Note): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction('notes', 'readwrite');
  transaction.objectStore('notes').put(normalizeNote(note));
  await txDone(transaction);
}

export async function localDeleteNote(name: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(['notes', 'chats'], 'readwrite');
  transaction.objectStore('notes').delete(name);
  transaction.objectStore('chats').delete(name);
  await txDone(transaction);
}

export async function localRenameNote(
  from: string,
  to: string,
  mtime: number
): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(['notes', 'chats'], 'readwrite');
  const notes = transaction.objectStore('notes');
  const chats = transaction.objectStore('chats');

  const note = await new Promise<Note | undefined>((resolve, reject) => {
    const request = notes.get(from);
    request.onsuccess = () => resolve(request.result as Note | undefined);
    request.onerror = () => reject(request.error);
  });

  if (!note) throw new Error('note missing');

  notes.delete(from);
  notes.put({ ...note, name: to, mtime });

  const chat = await new Promise<Chat | undefined>((resolve, reject) => {
    const request = chats.get(from);
    request.onsuccess = () => resolve(request.result as Chat | undefined);
    request.onerror = () => reject(request.error);
  });

  if (chat) {
    chats.delete(from);
    chats.put({ ...chat, name: to, mtime });
  }

  await txDone(transaction);
}

export async function localReadChat(name: string): Promise<Chat> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const request = transaction.objectStore('chats').get(name);

    request.onsuccess = () => {
      const row = request.result as Chat | undefined;
      resolve(row || { name, messages: [], mtime: 0 });
    };

    request.onerror = () => reject(request.error);
  });
}

export async function localDeleteChat(name: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction('chats', 'readwrite');
  transaction.objectStore('chats').delete(name);
  await txDone(transaction);
}

export async function enqueue(operation: OutboxOp): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction('outbox', 'readwrite');
  transaction.objectStore('outbox').put(operation);
  await txDone(transaction);
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('outbox', 'readonly');
    const request = transaction.objectStore('outbox').getAll();
    request.onsuccess = () => resolve(request.result as OutboxOp[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removeOutbox(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction('outbox', 'readwrite');
  transaction.objectStore('outbox').delete(id);
  await txDone(transaction);
}

export async function rewriteOutboxForRename(from: string, to: string): Promise<void> {
  const operations = await listOutbox();
  const db = await openDb();
  const transaction = db.transaction('outbox', 'readwrite');
  const store = transaction.objectStore('outbox');

  for (const operation of operations) {
    if (operation.kind === 'note_write' && operation.name === from) {
      store.put({ ...operation, name: to });
    } else if (operation.kind === 'note_delete' && operation.name === from) {
      store.put({ ...operation, name: to });
    } else if (operation.kind === 'note_rename' && operation.to === from) {
      store.put({ ...operation, to });
    } else if (operation.kind === 'note_rename' && operation.from === from) {
      store.delete(operation.id);
    } else if (operation.kind === 'chat_write' && operation.name === from) {
      store.put({ ...operation, name: to });
    } else if (operation.kind === 'chat_delete' && operation.name === from) {
      store.put({ ...operation, name: to });
    }
  }

  await txDone(transaction);
}

export async function replaceAllLocal(notes: Note[], chats: Chat[]): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(['notes', 'chats'], 'readwrite');
  const noteStore = transaction.objectStore('notes');
  const chatStore = transaction.objectStore('chats');

  const existingNotes = await new Promise<Note[]>((resolve, reject) => {
    const request = noteStore.getAll();
    request.onsuccess = () => resolve(request.result as Note[]);
    request.onerror = () => reject(request.error);
  });

  const remoteNames = new Set(notes.map((note) => note.name));

  for (const local of existingNotes) {
    if (!remoteNames.has(local.name)) noteStore.delete(local.name);
  }

  for (const remote of notes) noteStore.put(normalizeNote(remote));

  const existingChats = await new Promise<Chat[]>((resolve, reject) => {
    const request = chatStore.getAll();
    request.onsuccess = () => resolve(request.result as Chat[]);
    request.onerror = () => reject(request.error);
  });

  const remoteChatNames = new Set(chats.map((chat) => chat.name));

  for (const local of existingChats) {
    if (!remoteChatNames.has(local.name)) chatStore.delete(local.name);
  }

  for (const remote of chats) chatStore.put(remote);

  await txDone(transaction);
}

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
