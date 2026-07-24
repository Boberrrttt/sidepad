export const COOKIE = 'sidepad_session';

function secret() {
  const s = String(process.env.SESSION_SECRET || '').trim();
  if (!s) throw new Error('Set SESSION_SECRET');
  return s;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );
  return toHex(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ok = true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) ok = false;
  }
  return ok;
}

export async function signSession(userId: string): Promise<string> {
  const sig = await hmacHex(userId);
  return `${userId}.${sig}`;
}

export async function readSession(
  token: string | undefined | null
): Promise<string | null> {
  if (!token || !token.includes('.')) return null;
  const i = token.indexOf('.');
  const userId = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!userId || !sig) return null;
  try {
    const expected = await hmacHex(userId);
    if (!safeEqual(sig, expected)) return null;
    return userId;
  } catch {
    return null;
  }
}

export async function isValidSession(
  token: string | undefined | null
): Promise<boolean> {
  return (await readSession(token)) !== null;
}
