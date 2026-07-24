import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { ensureSchema, getDb } from './db';
import { COOKIE, readSession } from './session';

export { COOKIE, signSession, readSession, isValidSession } from './session';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), next);
  } catch {
    return false;
  }
}

export async function requireUserId(): Promise<string> {
  const jar = await cookies();
  const userId = await readSession(jar.get(COOKIE)?.value);
  if (!userId) throw new Error('unauthorized');
  return userId;
}

function cleanUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function createUser(username: string, password: string): Promise<string> {
  await ensureSchema();
  const u = cleanUsername(username);
  if (!u || u.length < 2 || /\s/.test(u)) throw new Error('bad username');
  if (password.length < 6) throw new Error('password too short');

  const id = randomBytes(16).toString('hex');
  try {
    await getDb().execute({
      sql: 'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
      args: [id, u, hashPassword(password), Date.now()],
    });
  } catch {
    throw new Error('username taken');
  }
  return id;
}

export async function loginUser(username: string, password: string): Promise<string> {
  await ensureSchema();
  const u = cleanUsername(username);
  const rs = await getDb().execute({
    sql: 'SELECT id, password_hash FROM users WHERE username = ?',
    args: [u],
  });
  const row = rs.rows[0];
  if (!row) throw new Error('bad login');
  if (!checkPassword(password, String(row.password_hash))) throw new Error('bad login');
  return String(row.id);
}
