const STORAGE_KEY = 'sidepad.github.session';

let session: string | null = null;

function readStoredToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setGithubSession(token: string) {
  session = token;

  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {}
}

export function getGithubSession() {
  if (session) return session;

  const token = readStoredToken();
  if (!token) return null;

  session = token;
  return session;
}

export function clearGithubSession() {
  session = null;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
