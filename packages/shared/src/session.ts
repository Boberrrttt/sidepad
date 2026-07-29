export const COOKIE = 'sidepad_session';

function secret() {
  const value = String(process.env.SESSION_SECRET || '').trim();
  if (!value) throw new Error('Set SESSION_SECRET');
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
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
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );
  return toHex(signature);
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let isEqual = true;

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) isEqual = false;
  }

  return isEqual;
}

export async function signSession(userId: string): Promise<string> {
  const signature = await hmacHex(userId);
  return `${userId}.${signature}`;
}

export async function readSession(
  token: string | undefined | null
): Promise<string | null> {
  if (!token || !token.includes('.')) return null;

  const separatorIndex = token.indexOf('.');
  const userId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!userId || !signature) return null;

  try {
    const expected = await hmacHex(userId);
    if (!safeEqual(signature, expected)) return null;
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
