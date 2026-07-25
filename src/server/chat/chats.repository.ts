import type { Chat, ChatMessage } from '@/shared/types';
import { ensureSchema, getDb } from '@/server/shared/db/client';

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
  const result = await getDb().execute({
    sql: 'SELECT name, messages, mtime FROM chats WHERE user_id = ? AND name = ?',
    args: [userId, name],
  });
  const row = result.rows[0];

  if (!row) return { name, messages: [], mtime: 0 };

  return {
    name: String(row.name),
    messages: parseMessages(row.messages),
    mtime: Number(row.mtime),
  };
}

export async function upsertChat(
  userId: string,
  name: string,
  messages: ChatMessage[],
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: `INSERT INTO chats (user_id, name, messages, mtime) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET
            messages = excluded.messages,
            mtime = excluded.mtime
          WHERE chats.mtime <= excluded.mtime`,
    args: [userId, name, JSON.stringify(messages ?? []), mtime],
  });
}

export async function deleteChat(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: 'DELETE FROM chats WHERE user_id = ? AND name = ? AND mtime <= ?',
    args: [userId, name, mtime],
  });
}

export async function listChats(userId: string): Promise<Chat[]> {
  await ensureSchema();
  const result = await getDb().execute({
    sql: 'SELECT name, messages, mtime FROM chats WHERE user_id = ?',
    args: [userId],
  });

  return result.rows.map((row) => ({
    name: String(row.name),
    messages: parseMessages(row.messages),
    mtime: Number(row.mtime),
  }));
}
