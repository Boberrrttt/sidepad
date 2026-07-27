const USER_KEY = 'sidepad-user';

export function setLocalUserId(userId: string) {
  localStorage.setItem(USER_KEY, userId);
}

export function clearLocalUserId() {
  localStorage.removeItem(USER_KEY);
}

export function getLocalUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}
