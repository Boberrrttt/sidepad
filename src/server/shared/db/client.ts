import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = String(process.env.TURSO_DATABASE_URL || '').trim();
  const authToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();

  if (!url) throw new Error('Set TURSO_DATABASE_URL');

  client = createClient({ url, authToken: authToken || undefined });
  return client;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb();

      const usersInfo = await db.execute('PRAGMA table_info(users)');
      const userCols = usersInfo.rows.map((row) => String(row.name));

      if (userCols.length && !userCols.includes('username')) {
        await db.execute('DROP TABLE IF EXISTS users');
      }

      await db.execute(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);

      const notesInfo = await db.execute('PRAGMA table_info(notes)');
      const noteCols = notesInfo.rows.map((row) => String(row.name));

      if (noteCols.length && !noteCols.includes('user_id')) {
        await db.execute('DROP TABLE IF EXISTS notes');
        await db.execute('DROP TABLE IF EXISTS chats');
      }

      await db.execute(`CREATE TABLE IF NOT EXISTS notes (
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        mtime INTEGER NOT NULL,
        PRIMARY KEY (user_id, name)
      )`);

      await db.execute(`CREATE TABLE IF NOT EXISTS chats (
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        messages TEXT NOT NULL DEFAULT '[]',
        mtime INTEGER NOT NULL,
        PRIMARY KEY (user_id, name)
      )`);
    })();
  }

  await schemaReady;
}
