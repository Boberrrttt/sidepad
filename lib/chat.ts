import { ensureSchema, getDb } from './db';
import { safeName } from './notes';
import type { Chat, ChatMessage } from './types';

function parseMessages(raw: unknown): ChatMessage[] {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function readChat(userId: string, name: string): Promise<Chat> {
  await ensureSchema();
  const n = safeName(name);
  const rs = await getDb().execute({
    sql: 'SELECT name, messages, mtime FROM chats WHERE user_id = ? AND name = ?',
    args: [userId, n],
  });
  const row = rs.rows[0];
  if (!row) return { name: n, messages: [], mtime: 0 };
  return {
    name: String(row.name),
    messages: parseMessages(row.messages),
    mtime: Number(row.mtime),
  };
}

export async function writeChat(
  userId: string,
  name: string,
  messages: ChatMessage[],
  mtime: number
): Promise<Chat> {
  await ensureSchema();
  const n = safeName(name);
  const existing = await readChat(userId, n);

  if (existing.mtime > mtime) return existing;

  await getDb().execute({
    sql: `INSERT INTO chats (user_id, name, messages, mtime) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET
            messages = excluded.messages,
            mtime = excluded.mtime
          WHERE chats.mtime <= excluded.mtime`,
    args: [userId, n, JSON.stringify(messages ?? []), mtime],
  });

  return readChat(userId, n);
}

export async function deleteChat(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: 'DELETE FROM chats WHERE user_id = ? AND name = ? AND mtime <= ?',
    args: [userId, safeName(name), mtime],
  });
}

export async function listChats(userId: string): Promise<Chat[]> {
  await ensureSchema();
  const rs = await getDb().execute({
    sql: 'SELECT name, messages, mtime FROM chats WHERE user_id = ?',
    args: [userId],
  });
  return rs.rows.map((r) => ({
    name: String(r.name),
    messages: parseMessages(r.messages),
    mtime: Number(r.mtime),
  }));
}
