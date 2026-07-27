import type { Note } from '@/shared/types';
import { ensureSchema, getDb } from '@/server/shared/db/client';

function rowToNote(row: Record<string, unknown>): Note {
  return {
    name: String(row.name),
    body: String(row.body ?? ''),
    board: String(row.board ?? ''),
    mtime: Number(row.mtime),
  };
}

export async function listNotes(userId: string): Promise<Note[]> {
  await ensureSchema();
  const result = await getDb().execute({
    sql: 'SELECT name, body, board, mtime FROM notes WHERE user_id = ? ORDER BY mtime DESC',
    args: [userId],
  });

  return result.rows.map((row) => rowToNote(row as Record<string, unknown>));
}

export async function readNote(
  userId: string,
  name: string
): Promise<Note | null> {
  await ensureSchema();
  const result = await getDb().execute({
    sql: 'SELECT name, body, board, mtime FROM notes WHERE user_id = ? AND name = ?',
    args: [userId, name],
  });
  const row = result.rows[0];

  if (!row) return null;

  return rowToNote(row as Record<string, unknown>);
}

export async function upsertNote(
  userId: string,
  name: string,
  body: string,
  board: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: `INSERT INTO notes (user_id, name, body, board, mtime) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET
            body = excluded.body,
            board = excluded.board,
            mtime = excluded.mtime
          WHERE notes.mtime <= excluded.mtime`,
    args: [userId, name, body, board, mtime],
  });
}

export async function renameNoteAndChat(
  userId: string,
  from: string,
  to: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().batch(
    [
      {
        sql: 'UPDATE notes SET name = ?, mtime = ? WHERE user_id = ? AND name = ?',
        args: [to, mtime, userId, from],
      },
      {
        sql: 'UPDATE chats SET name = ?, mtime = ? WHERE user_id = ? AND name = ?',
        args: [to, mtime, userId, from],
      },
    ],
    'write'
  );
}

export async function deleteNoteAndChat(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  await getDb().batch(
    [
      {
        sql: 'DELETE FROM notes WHERE user_id = ? AND name = ? AND mtime <= ?',
        args: [userId, name, mtime],
      },
      {
        sql: 'DELETE FROM chats WHERE user_id = ? AND name = ?',
        args: [userId, name],
      },
    ],
    'write'
  );
}
