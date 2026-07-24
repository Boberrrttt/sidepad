import type { Chat, ChatMessage, Note, OutboxOp } from './types';

const DB_VERSION = 1;
const USER_KEY = 'sidepad-user';

export function setLocalUserId(userId: string) {
  localStorage.setItem(USER_KEY, userId);
}

export function clearLocalUserId() {
  localStorage.removeItem(USER_KEY);
}

export function getLocalUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

function dbName(): string {
  const id = getLocalUserId();
  if (!id) throw new Error('not logged in');
  return `sidepad-${id}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function localListNotes(): Promise<Note[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const req = tx.objectStore('notes').getAll();
    req.onsuccess = () => {
      const rows = (req.result as Note[]).sort((a, b) => b.mtime - a.mtime);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function localReadNote(name: string): Promise<Note | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const req = tx.objectStore('notes').get(name);
    req.onsuccess = () => resolve((req.result as Note) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function localPutNote(note: Note): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('notes', 'readwrite');
  tx.objectStore('notes').put(note);
  await txDone(tx);
}

export async function localDeleteNote(name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['notes', 'chats'], 'readwrite');
  tx.objectStore('notes').delete(name);
  tx.objectStore('chats').delete(name);
  await txDone(tx);
}

export async function localRenameNote(from: string, to: string, mtime: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['notes', 'chats'], 'readwrite');
  const notes = tx.objectStore('notes');
  const chats = tx.objectStore('chats');

  const note = await new Promise<Note | undefined>((resolve, reject) => {
    const req = notes.get(from);
    req.onsuccess = () => resolve(req.result as Note | undefined);
    req.onerror = () => reject(req.error);
  });

  if (!note) throw new Error('note missing');

  notes.delete(from);
  notes.put({ ...note, name: to, mtime });

  const chat = await new Promise<Chat | undefined>((resolve, reject) => {
    const req = chats.get(from);
    req.onsuccess = () => resolve(req.result as Chat | undefined);
    req.onerror = () => reject(req.error);
  });

  if (chat) {
    chats.delete(from);
    chats.put({ ...chat, name: to, mtime });
  }

  await txDone(tx);
}

export async function localReadChat(name: string): Promise<Chat> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const req = tx.objectStore('chats').get(name);
    req.onsuccess = () => {
      const row = req.result as Chat | undefined;
      resolve(row || { name, messages: [], mtime: 0 });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function localPutChat(chat: Chat): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('chats', 'readwrite');
  tx.objectStore('chats').put(chat);
  await txDone(tx);
}

export async function localDeleteChat(name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('chats', 'readwrite');
  tx.objectStore('chats').delete(name);
  await txDone(tx);
}

export async function localListChats(): Promise<Chat[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const req = tx.objectStore('chats').getAll();
    req.onsuccess = () => resolve(req.result as Chat[]);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(op: OutboxOp): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').put(op);
  await txDone(tx);
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const req = tx.objectStore('outbox').getAll();
    req.onsuccess = () => resolve(req.result as OutboxOp[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOutbox(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').delete(id);
  await txDone(tx);
}

export async function rewriteOutboxForRename(from: string, to: string): Promise<void> {
  const ops = await listOutbox();
  const db = await openDb();
  const tx = db.transaction('outbox', 'readwrite');
  const store = tx.objectStore('outbox');

  for (const op of ops) {
    if (op.kind === 'note_write' && op.name === from) {
      store.put({ ...op, name: to });
    } else if (op.kind === 'note_delete' && op.name === from) {
      store.put({ ...op, name: to });
    } else if (op.kind === 'note_rename' && op.to === from) {
      store.put({ ...op, to });
    } else if (op.kind === 'note_rename' && op.from === from) {
      store.delete(op.id);
    } else if (op.kind === 'chat_write' && op.name === from) {
      store.put({ ...op, name: to });
    } else if (op.kind === 'chat_delete' && op.name === from) {
      store.put({ ...op, name: to });
    }
  }

  await txDone(tx);
}

export async function replaceAllLocal(notes: Note[], chats: Chat[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['notes', 'chats'], 'readwrite');
  const noteStore = tx.objectStore('notes');
  const chatStore = tx.objectStore('chats');

  const existingNotes = await new Promise<Note[]>((resolve, reject) => {
    const req = noteStore.getAll();
    req.onsuccess = () => resolve(req.result as Note[]);
    req.onerror = () => reject(req.error);
  });

  const remoteNames = new Set(notes.map((n) => n.name));
  for (const local of existingNotes) {
    if (!remoteNames.has(local.name)) noteStore.delete(local.name);
  }
  for (const remote of notes) noteStore.put(remote);

  const existingChats = await new Promise<Chat[]>((resolve, reject) => {
    const req = chatStore.getAll();
    req.onsuccess = () => resolve(req.result as Chat[]);
    req.onerror = () => reject(req.error);
  });

  const remoteChatNames = new Set(chats.map((c) => c.name));
  for (const local of existingChats) {
    if (!remoteChatNames.has(local.name)) chatStore.delete(local.name);
  }
  for (const remote of chats) chatStore.put(remote);

  await txDone(tx);
}

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type { ChatMessage };
