import { postJson } from '@/app/shared/http';

type AuthUser = {
  userId: string;
};

async function authWithPassword(
  url: string,
  username: string,
  password: string
): Promise<AuthUser> {
  const data = await postJson<{ userId?: string }>(url, { username, password });

  if (!data.userId) throw new Error('missing user');

  return { userId: data.userId };
}

export async function login(
  username: string,
  password: string
): Promise<AuthUser> {
  return authWithPassword('/api/auth/login', username, password);
}

export async function register(
  username: string,
  password: string
): Promise<AuthUser> {
  return authWithPassword('/api/auth/register', username, password);
}

export async function getMe(): Promise<AuthUser> {
  const response = await fetch('/api/auth/me');

  if (!response.ok) throw new Error('unauthorized');

  const data = (await response.json()) as { userId: string };
  return { userId: data.userId };
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
