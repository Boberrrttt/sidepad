import { randomBytes } from 'crypto';
import { checkPassword, hashPassword } from '@/server/auth/helpers/passwords';
import { findUserByUsername, insertUser } from '@/server/auth/users.repository';

function cleanUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function createUser(username: string, password: string): Promise<string> {
  const cleanedUsername = cleanUsername(username);

  if (!cleanedUsername || cleanedUsername.length < 2 || /\s/.test(cleanedUsername)) {
    throw new Error('bad username');
  }

  if (password.length < 6) throw new Error('password too short');

  const userId = randomBytes(16).toString('hex');

  try {
    await insertUser(
      userId,
      cleanedUsername,
      hashPassword(password),
      Date.now()
    );
  } catch {
    throw new Error('username taken');
  }

  return userId;
}

export async function loginUser(username: string, password: string): Promise<string> {
  const cleanedUsername = cleanUsername(username);
  const row = await findUserByUsername(cleanedUsername);

  if (!row) throw new Error('bad login');
  if (!checkPassword(password, row.passwordHash)) throw new Error('bad login');

  return row.id;
}
