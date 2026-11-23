/* Local-file provider: reads/writes a JSON file the user picks, e.g. inside the
   "Google Drive" folder created by Google Drive for desktop, which then syncs it. */
import type { Provider, PullResult } from './engine';

const DB = 'lumen-sync';
const STORE = 'handles';

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    };
  });
}

export const fileSyncSupported = () => typeof (window as any).showSaveFilePicker === 'function' && window.self === window.top;

export async function loadHandle(): Promise<any | null> {
  try { return (await idb('readonly', (s) => s.get('file'))) ?? null; } catch { return null; }
}
export async function saveHandle(h: any | null) {
  try { await idb<unknown>('readwrite', (s) => (h ? s.put(h, 'file') : s.delete('file')) as IDBRequest<unknown>); } catch { /* ignore */ }
}

export async function pickFile(create: boolean): Promise<any | null> {
  const types = [{ description: 'Lumen 工作區', accept: { 'application/json': ['.json'] } }];
  try {
    if (create) return await (window as any).showSaveFilePicker({ suggestedName: 'Lumen 筆記工作區.json', types });
    const [h] = await (window as any).showOpenFilePicker({ types, multiple: false });
    return h;
  } catch { return null; }
}

export class FileProvider implements Provider {
  kind = 'file' as const;
  label: string;
  constructor(public handle: any) {
    this.label = `本機檔案「${handle.name}」`;
  }

  private permOk = false;

  needsAuth() { return !this.permOk; }

  async checkPermission(): Promise<boolean> {
    try { this.permOk = (await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { this.permOk = false; }
    return this.permOk;
  }

  /** must run inside a user click */
  async authorize() {
    this.permOk = (await this.handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    if (!this.permOk) throw new Error('未取得檔案的讀寫權限');
  }

  async refreshOnGesture() {
    if (!this.permOk) { try { await this.authorize(); } catch { /* ignore */ } }
  }

  async pull(knownVersion: string | null): Promise<PullResult> {
    const f: File = await this.handle.getFile();
    if (f.size === 0) return { exists: false };
    const version = `${f.lastModified}:${f.size}`;
    if (knownVersion && knownVersion === version) return { exists: true, unchanged: true, version };
    return { exists: true, version, data: JSON.parse(await f.text()) };
  }

  async push(json: string): Promise<string> {
    const w = await this.handle.createWritable();
    await w.write(json);
    await w.close();
    const f: File = await this.handle.getFile();
    return `${f.lastModified}:${f.size}`;
  }

  disconnect() { /* nothing to revoke */ }
}
