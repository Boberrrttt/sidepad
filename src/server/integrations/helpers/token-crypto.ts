import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

function getKey() {
  const secret = String(
    process.env.GITHUB_TOKEN_SECRET || process.env.SESSION_SECRET || ''
  ).trim();

  if (!secret) throw new Error('Set SESSION_SECRET');

  return scryptSync(secret, 'sidepad-github-token', 32);
}

let cachedKey: Buffer | null = null;

function key() {
  if (!cachedKey) cachedKey = getKey();
  return cachedKey;
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(payload: string) {
  const bytes = Buffer.from(payload, 'base64');
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const data = bytes.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]).toString('utf8');
}
