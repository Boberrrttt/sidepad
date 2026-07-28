import { ensureSchema, getDb } from '@/server/shared/db/client';
import {
  decryptToken,
  encryptToken,
} from '@/server/integrations/helpers/token-crypto';

export async function upsertGithubToken(
  userId: string,
  projectId: string,
  token: string
) {
  await ensureSchema();
  await getDb().execute({
    sql: `INSERT INTO github_tokens (user_id, project_id, token_enc)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, project_id) DO UPDATE SET
            token_enc = excluded.token_enc`,
    args: [userId, projectId, encryptToken(token)],
  });
}

export async function readGithubToken(userId: string, projectId: string) {
  await ensureSchema();
  const result = await getDb().execute({
    sql: `SELECT token_enc FROM github_tokens
          WHERE user_id = ? AND project_id = ?`,
    args: [userId, projectId],
  });
  const row = result.rows[0] as { token_enc?: string } | undefined;
  const encrypted = String(row?.token_enc ?? '').trim();

  if (!encrypted) return null;

  return decryptToken(encrypted);
}

export async function deleteGithubToken(userId: string, projectId: string) {
  await ensureSchema();
  await getDb().execute({
    sql: `DELETE FROM github_tokens WHERE user_id = ? AND project_id = ?`,
    args: [userId, projectId],
  });
}

export async function requireStoredGithubToken(
  userId: string,
  projectId: string
) {
  const token = await readGithubToken(userId, projectId);

  if (!token) {
    throw new Error('GitHub not connected. Reconnect with a PAT.');
  }

  return token;
}
