export type NotePayload = {
  body: string;
  board: string;
};

export type DecryptResult = NotePayload & {
  key: CryptoKey;
  salt: Uint8Array;
};

const ENVELOPE_PREFIX = 'sidepad1';
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export function isEncryptedNote(body: string): boolean {
  return body.startsWith(`${ENVELOPE_PREFIX}.`);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parseEnvelope(envelope: string): {
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  const parts = envelope.split('.');

  if (parts.length !== 4 || parts[0] !== ENVELOPE_PREFIX) {
    throw new Error('Not an encrypted note');
  }

  return {
    salt: fromBase64Url(parts[1]),
    iv: fromBase64Url(parts[2]),
    ciphertext: fromBase64Url(parts[3]),
  };
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function encryptNote(
  passphrase: string,
  payload: NotePayload
): Promise<{ envelope: string; key: CryptoKey; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(passphrase, salt, ['encrypt', 'decrypt']);
  const envelope = await encryptWithKey(key, salt, payload);

  return { envelope, key, salt };
}

export async function encryptWithKey(
  key: CryptoKey,
  salt: Uint8Array,
  payload: NotePayload
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext
    )
  );

  return [
    ENVELOPE_PREFIX,
    toBase64Url(salt),
    toBase64Url(iv),
    toBase64Url(ciphertext),
  ].join('.');
}

async function decryptPayload(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<NotePayload> {
  try {
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ciphertext as BufferSource
      )
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as NotePayload;

    if (typeof parsed.body !== 'string' || typeof parsed.board !== 'string') {
      throw new Error('Invalid encrypted payload');
    }

    return { body: parsed.body, board: parsed.board };
  } catch (caughtError) {
    if (
      caughtError instanceof Error &&
      caughtError.message === 'Invalid encrypted payload'
    ) {
      throw caughtError;
    }

    throw new Error('Wrong passphrase');
  }
}

export async function decryptWithKey(
  key: CryptoKey,
  envelope: string
): Promise<NotePayload> {
  const { iv, ciphertext } = parseEnvelope(envelope);
  return decryptPayload(key, iv, ciphertext);
}

export async function decryptNote(
  passphrase: string,
  envelope: string
): Promise<DecryptResult> {
  const { salt, iv, ciphertext } = parseEnvelope(envelope);
  const key = await deriveKey(passphrase, salt, ['encrypt', 'decrypt']);
  const payload = await decryptPayload(key, iv, ciphertext);

  return { ...payload, key, salt };
}

export async function runNoteCryptoSelfCheck(): Promise<void> {
  const { envelope, key, salt } = await encryptNote('self-check-pass', {
    body: 'hello',
    board: '{"v":1,"columns":[]}',
  });

  if (!isEncryptedNote(envelope)) {
    throw new Error('envelope missing prefix');
  }

  const unlocked = await decryptNote('self-check-pass', envelope);

  if (unlocked.body !== 'hello') {
    throw new Error('decrypt body mismatch');
  }

  const rewritten = await encryptWithKey(key, salt, {
    body: 'hello2',
    board: unlocked.board,
  });
  const again = await decryptNote('self-check-pass', rewritten);

  if (again.body !== 'hello2') {
    throw new Error('re-encrypt mismatch');
  }

  let failed = false;

  try {
    await decryptNote('wrong-pass', envelope);
  } catch {
    failed = true;
  }

  if (!failed) {
    throw new Error('wrong passphrase should fail');
  }
}
