export type UnlockEntry = {
  key: CryptoKey;
  salt: Uint8Array;
};

const unlockedNotes = new Map<string, UnlockEntry>();
const DEVICE_PASS_KEY = 'sidepad.device-pass';

export function getUnlockEntry(name: string): UnlockEntry | undefined {
  return unlockedNotes.get(name);
}

export function setUnlockEntry(name: string, entry: UnlockEntry): void {
  unlockedNotes.set(name, entry);
}

export function clearUnlockEntry(name: string): void {
  unlockedNotes.delete(name);
}

export function renameUnlockEntry(from: string, to: string): void {
  const entry = unlockedNotes.get(from);
  if (!entry) return;

  unlockedNotes.delete(from);
  unlockedNotes.set(to, entry);
}

export function getDevicePassphrase(): string {
  let value = localStorage.getItem(DEVICE_PASS_KEY);

  if (!value) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    value = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(DEVICE_PASS_KEY, value);
  }

  return value;
}
