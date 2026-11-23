/* Google Drive provider: stores the workspace as one JSON file in the user's My Drive. */
import type { Provider, PullResult } from './engine';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'Lumen 筆記工作區.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_KEY = 'lumen-drive-token';

declare global {
  interface Window { google?: any }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { gisPromise = null; rej(new Error('無法載入 Google 登入元件，請檢查網路連線。')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export class DriveProvider implements Provider {
  kind = 'drive' as const;
  label = 'Google 雲端硬碟';
  private token: string | null = null;
  private expiresAt = 0;
  private client: any = null;
  private pending: { res: (t: string) => void; rej: (e: Error) => void }[] = [];
  fileId: string | null;
  email = '';

  constructor(private clientId: string, fileId: string | null) {
    this.fileId = fileId;
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (t && t.clientId === clientId && t.expiresAt > Date.now()) { this.token = t.token; this.expiresAt = t.expiresAt; }
    } catch { /* ignore */ }
  }

  private async ensureClient() {
    await loadGis();
    if (this.client) return;
    this.client = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPE,
      callback: (r: any) => {
        const waiters = this.pending.splice(0);
        if (r.error) { waiters.forEach((w) => w.rej(new Error(r.error_description || r.error))); return; }
        this.token = r.access_token;
        this.expiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: this.token, expiresAt: this.expiresAt, clientId: this.clientId })); } catch { /* ignore */ }
        waiters.forEach((w) => w.res(this.token!));
      },
      error_callback: (e: any) => {
        const waiters = this.pending.splice(0);
        waiters.forEach((w) => w.rej(new Error(e?.type === 'popup_closed' ? '登入視窗已關閉' : e?.type === 'popup_failed_to_open' ? '登入視窗被瀏覽器封鎖，請允許彈出視窗' : (e?.message || '登入失敗'))));
      },
    });
  }

  /** must be called from a user click the first time (opens Google's popup) */
  async authorize(prompt: '' | 'consent' = ''): Promise<void> {
    await this.ensureClient();
    await new Promise<string>((res, rej) => {
      this.pending.push({ res, rej });
      this.client.requestAccessToken({ prompt });
    });
  }

  tokenValid(marginMs = 60_000) { return !!this.token && Date.now() < this.expiresAt - marginMs; }

  needsAuth() { return !this.tokenValid(); }

  /** called on user clicks: refresh the token shortly before it expires (popup closes on its own) */
  async refreshOnGesture() {
    if (this.tokenValid(5 * 60_000) || this.pending.length) return;
    try { await this.authorize(''); } catch { /* ignored; status shows reconnect */ }
  }

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.tokenValid(0)) throw Object.assign(new Error('需要重新登入 Google'), { auth: true });
    const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${this.token}` } });
    if (r.status === 401) { this.token = null; try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } throw Object.assign(new Error('Google 登入已過期'), { auth: true }); }
    if (!r.ok) {
      let msg = `Google 雲端硬碟錯誤 (${r.status})`;
      try { const j = await r.json(); if (j?.error?.message) msg += '：' + j.error.message; } catch { /* ignore */ }
      if (r.status === 404) { this.fileId = null; }
      throw new Error(msg);
    }
    return r;
  }

  private async findFile(): Promise<string | null> {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const r = await this.req(`${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
    const j = await r.json();
    return j.files?.[0]?.id ?? null;
  }

  async pull(knownVersion: string | null): Promise<PullResult> {
    if (!this.fileId) this.fileId = await this.findFile();
    if (!this.fileId) return { exists: false };
    const meta = await (await this.req(`${API}/files/${this.fileId}?fields=version,modifiedTime,trashed`)).json();
    if (meta.trashed) { this.fileId = null; return { exists: false }; }
    const version = String(meta.version);
    if (knownVersion && version === knownVersion) return { exists: true, unchanged: true, version };
    const text = await (await this.req(`${API}/files/${this.fileId}?alt=media`)).text();
    return { exists: true, version, data: JSON.parse(text) };
  }

  async push(json: string): Promise<string> {
    if (this.fileId) {
      const r = await this.req(`${UPLOAD}/files/${this.fileId}?uploadType=media&fields=version`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json,
      });
      return String((await r.json()).version);
    }
    const boundary = 'lumen' + Math.random().toString(36).slice(2);
    const meta = { name: FILE_NAME, mimeType: 'application/json', description: 'Lumen 筆記的同步資料，請勿手動編輯。' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    const r = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    const j = await r.json();
    this.fileId = j.id;
    return String(j.version);
  }

  disconnect() {
    if (this.token) { try { window.google?.accounts?.oauth2?.revoke(this.token, () => {}); } catch { /* ignore */ } }
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }
}
