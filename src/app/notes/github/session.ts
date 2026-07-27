import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  type EncryptedSecret,
} from '@/app/notes/github/secret-crypto';

const PREFIX = 'sidepad.github.session.';

const sessions = new Map<string, string>();

function storageKey(projectId: string) {
  return `${PREFIX}${projectId}`;
}

export async function setGithubSession(
  projectId: string,
  token: string,
  passphrase: string
) {
  sessions.set(projectId, token);

  const encrypted = await encryptSecret(token, passphrase);

  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(encrypted));
  } catch {}
}

export function getGithubSession(projectId: string) {
  return sessions.get(projectId) ?? null;
}

export function readEncryptedSession(
  projectId: string
): EncryptedSecret | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isEncryptedSecret(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGithubSession(projectId: string) {
  sessions.delete(projectId);

  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {}
}

export function clearLegacyGithubStorage() {
  try {
    localStorage.removeItem('sidepad.github.session');
    localStorage.removeItem('sidepad.connections');
    sessionStorage.removeItem('sidepad.github.session');
  } catch {}
}
