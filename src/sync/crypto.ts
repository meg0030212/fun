/* End-to-end encryption for the sync file and backups.
   Key: PBKDF2-SHA256 (600k iterations) from the user's password + random salt.
   Cipher: AES-256-GCM with a fresh 12-byte IV per save. */

export const ITERATIONS = 600_000;

export interface EncryptedFile {
  app: 'lumen';
  encrypted: true;
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  savedAt: number;
}

export interface KeyInfo { key: CryptoKey; salt: string; iterations: number }

export function isEncrypted(x: any): x is EncryptedFile {
  return !!x && typeof x === 'object' && x.encrypted === true && typeof x.ciphertext === 'string' && typeof x.salt === 'string';
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(password: string, salt: string, iterations = ITERATIONS): Promise<KeyInfo> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: scripts can use it but never read it out
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iterations };
}

export async function encryptJson(text: string, k: KeyInfo): Promise<EncryptedFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.key, new TextEncoder().encode(text));
  return {
    app: 'lumen', encrypted: true, version: 1, kdf: 'PBKDF2-SHA256', iterations: k.iterations,
    salt: k.salt, iv: toB64(iv), ciphertext: toB64(ct), savedAt: Date.now(),
  };
}

/** throws WrongPassword when the key does not match */
export async function decryptJson(f: EncryptedFile, k: KeyInfo): Promise<string> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(f.iv) }, k.key, fromB64(f.ciphertext));
    return new TextDecoder().decode(pt);
  } catch {
    throw Object.assign(new Error('密碼不正確'), { wrongPassword: true });
  }
}

export async function decryptWithPassword(f: EncryptedFile, password: string): Promise<{ text: string; key: KeyInfo }> {
  const key = await deriveKey(password, f.salt, f.iterations || ITERATIONS);
  return { text: await decryptJson(f, key), key };
}

/* ---- remember the (non-extractable) key on this device ---- */
const DB = 'lumen-sync';
const STORE = 'handles';
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const r = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => res(r.result as T);
      r.onerror = () => rej(r.error);
    };
  });
}
export async function loadSavedKey(): Promise<KeyInfo | null> {
  try { return (await idb<KeyInfo | undefined>('readonly', (s) => s.get('cryptoKey'))) ?? null; } catch { return null; }
}
export async function saveKey(k: KeyInfo | null) {
  try { await idb('readwrite', (s) => (k ? s.put(k, 'cryptoKey') : s.delete('cryptoKey'))); } catch { /* ignore */ }
}
