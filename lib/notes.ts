import { ensureSchema, getDb } from './db';
import type { Note } from './types';

export function safeName(name: string): string {
  const base = String(name).replace(/[/\\]/g, '').replace(/\.md$/i, '').trim();
  if (!base || base === '.' || base === '..') throw new Error('bad note name');
  return base;
}

export async function listNotes(userId: string): Promise<Note[]> {
  await ensureSchema();
  const rs = await getDb().execute({
    sql: 'SELECT name, body, mtime FROM notes WHERE user_id = ? ORDER BY mtime DESC',
    args: [userId],
  });
  return rs.rows.map((r) => ({
    name: String(r.name),
    body: String(r.body ?? ''),
    mtime: Number(r.mtime),
  }));
}

export async function readNote(userId: string, name: string): Promise<Note | null> {
  await ensureSchema();
  const rs = await getDb().execute({
    sql: 'SELECT name, body, mtime FROM notes WHERE user_id = ? AND name = ?',
    args: [userId, safeName(name)],
  });
  const row = rs.rows[0];
  if (!row) return null;
  return {
    name: String(row.name),
    body: String(row.body ?? ''),
    mtime: Number(row.mtime),
  };
}

export async function writeNote(
  userId: string,
  name: string,
  body: string,
  mtime: number
): Promise<Note> {
  await ensureSchema();
  const n = safeName(name);
  const existing = await readNote(userId, n);

  if (existing && existing.mtime > mtime) return existing;

  await getDb().execute({
    sql: `INSERT INTO notes (user_id, name, body, mtime) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, name) DO UPDATE SET
            body = excluded.body,
            mtime = excluded.mtime
          WHERE notes.mtime <= excluded.mtime`,
    args: [userId, n, String(body ?? ''), mtime],
  });

  return (await readNote(userId, n))!;
}

export async function renameNote(
  userId: string,
  from: string,
  to: string,
  mtime: number
): Promise<string> {
  await ensureSchema();
  const src = safeName(from);
  const dest = safeName(to);
  if (src === dest) return dest;

  const destRow = await readNote(userId, dest);
  if (destRow) throw new Error('note exists');

  const srcRow = await readNote(userId, src);
  if (!srcRow) throw new Error('note missing');

  await getDb().batch(
    [
      {
        sql: 'UPDATE notes SET name = ?, mtime = ? WHERE user_id = ? AND name = ?',
        args: [dest, Math.max(mtime, srcRow.mtime), userId, src],
      },
      {
        sql: 'UPDATE chats SET name = ?, mtime = ? WHERE user_id = ? AND name = ?',
        args: [dest, Math.max(mtime, srcRow.mtime), userId, src],
      },
    ],
    'write'
  );

  return dest;
}

export async function deleteNote(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await ensureSchema();
  const n = safeName(name);
  await getDb().batch(
    [
      {
        sql: 'DELETE FROM notes WHERE user_id = ? AND name = ? AND mtime <= ?',
        args: [userId, n, mtime],
      },
      {
        sql: 'DELETE FROM chats WHERE user_id = ? AND name = ?',
        args: [userId, n],
      },
    ],
    'write'
  );
}
