import { cookies } from 'next/headers';
import { COOKIE, readSession } from '@/shared/session';

export { COOKIE, signSession, readSession, isValidSession } from '@/shared/session';

export async function requireUserId(): Promise<string> {
  const jar = await cookies();
  const userId = await readSession(jar.get(COOKIE)?.value);
  if (!userId) throw new Error('unauthorized');
  return userId;
}
