import { ensureSchema, getDb } from '@/server/shared/db/client';

export async function insertUser(
  userId: string,
  username: string,
  passwordHash: string,
  createdAt: number
): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: 'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [userId, username, passwordHash, createdAt],
  });
}

export async function findUserByUsername(
  username: string
): Promise<{ id: string; passwordHash: string } | null> {
  await ensureSchema();
  const result = await getDb().execute({
    sql: 'SELECT id, password_hash FROM users WHERE username = ?',
    args: [username],
  });
  const row = result.rows[0];

  if (!row) return null;

  return {
    id: String(row.id),
    passwordHash: String(row.password_hash),
  };
}
