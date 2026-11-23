import { useSyncExternalStore } from 'react';
import { applyRemoteState, getState, subscribe } from '../store';
import { differs, isPayload, mergeStates, SyncPayload, toPayload } from './merge';
import { DriveProvider } from './drive';
import { FileProvider, loadHandle, pickFile, saveHandle } from './fileSync';

export interface PullResult { exists: boolean; unchanged?: boolean; version?: string; data?: any }

export interface Provider {
  kind: 'drive' | 'file';
  label: string;
  needsAuth(): boolean;
  refreshOnGesture(): Promise<void>;
  pull(knownVersion: string | null): Promise<PullResult>;
  push(json: string): Promise<string>;
  disconnect(): void;
}

export type SyncState = 'off' | 'syncing' | 'synced' | 'needs-auth' | 'error' | 'offline';

export interface SyncStatus {
  kind: 'drive' | 'file' | null;
  label: string;
  state: SyncState;
  error?: string;
  lastSync?: number;
  clientId?: string;
}

interface Config { kind: 'drive' | 'file' | null; clientId?: string; fileId?: string | null; version?: string | null; lastSync?: number }

const CFG_KEY = 'lumen-sync-config';
function loadCfg(): Config {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '') || { kind: null }; } catch { return { kind: null }; }
}
function saveCfg() {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

let cfg: Config = loadCfg();
let provider: Provider | null = null;
let status: SyncStatus = { kind: cfg.kind, label: '', state: 'off', lastSync: cfg.lastSync, clientId: cfg.clientId };
const ls = new Set<() => void>();
function setStatus(p: Partial<SyncStatus>) { status = { ...status, ...p }; ls.forEach((l) => l()); }
export function useSyncStatus() {
  return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, () => status);
}
export function getSyncStatus() { return status; }

let dirty = false;
let busy = false;
let again = false;
let applying = false;
let timer: number | undefined;
let gestureTried = false;

function scheduleSync(ms = 2500) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { void syncNow(); }, ms);
}

/** remote copy is missing something the merged state has → we must upload */
function remoteBehind(merged: ReturnType<typeof getState>, remote: SyncPayload): boolean {
  const ids = Object.keys(merged.pages);
  if (ids.length !== Object.keys(remote.pages).length) return true;
  if (ids.some((id) => !remote.pages[id] || (remote.pages[id].updatedAt || 0) !== (merged.pages[id].updatedAt || 0))) return true;
  const dids = Object.keys(merged.dbs);
  if (dids.length !== Object.keys(remote.dbs).length) return true;
  if (dids.some((id) => !remote.dbs[id] || (remote.dbs[id].updatedAt || 0) !== (merged.dbs[id].updatedAt || 0))) return true;
  return Object.keys(merged.deleted || {}).length !== Object.keys(remote.deleted || {}).length;
}

export async function syncNow(): Promise<void> {
  if (!provider) return;
  if (busy) { again = true; return; }
  if (provider.needsAuth()) { setStatus({ state: 'needs-auth', error: undefined }); return; }
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  busy = true;
  setStatus({ state: 'syncing', error: undefined });
  try {
    const r = await provider.pull(cfg.version ?? null);
    let needPush = dirty || !r.exists;
    if (r.data) {
      if (!isPayload(r.data)) throw new Error('雲端檔案不是有效的 Lumen 工作區資料');
      const local = getState();
      // a device that still has only the example content takes the cloud copy as-is
      const base = local.pristine ? { ...local, pages: {}, dbs: {}, deleted: {}, pristine: false } : local;
      const merged = mergeStates(base, r.data);
      if (differs(local, merged)) {
        applying = true;
        try { applyRemoteState(merged); } finally { applying = false; }
      }
      if (remoteBehind(merged, r.data)) needPush = true;
    }
    if (r.version) cfg.version = r.version;
    if (needPush) {
      dirty = false;
      cfg.version = await provider.push(JSON.stringify(toPayload(getState())));
    }
    if (provider instanceof DriveProvider) cfg.fileId = provider.fileId;
    cfg.lastSync = Date.now();
    saveCfg();
    setStatus({ state: 'synced', lastSync: cfg.lastSync, error: undefined });
  } catch (e: any) {
    if (e?.auth) setStatus({ state: 'needs-auth', error: undefined });
    else if (!navigator.onLine || e?.name === 'TypeError') setStatus({ state: 'offline', error: '無法連線，恢復網路後會自動同步。' });
    else setStatus({ state: 'error', error: e?.message || String(e) });
  } finally {
    busy = false;
    if (again) { again = false; scheduleSync(500); }
  }
}

function attach(p: Provider) {
  provider = p;
  gestureTried = false;
  cfg.kind = p.kind;
  saveCfg();
  setStatus({ kind: p.kind, label: p.label, clientId: cfg.clientId });
}

/* ---------- public actions (call from click handlers) ---------- */

export async function connectDrive(clientId: string) {
  const id = clientId.trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('用戶端 ID 格式不正確，應以 .apps.googleusercontent.com 結尾。');
  if (cfg.clientId !== id) { cfg.fileId = null; cfg.version = null; }
  cfg.clientId = id;
  const p = new DriveProvider(id, cfg.fileId ?? null);
  await p.authorize('');
  attach(p);
  dirty = true;
  await syncNow();
}

export async function connectFile(create: boolean) {
  const h = await pickFile(create);
  if (!h) return;
  const p = new FileProvider(h);
  if (!(await p.checkPermission())) await p.authorize();
  await saveHandle(h);
  cfg.version = null;
  attach(p);
  dirty = true;
  await syncNow();
}

export async function reconnect() {
  if (!provider) return;
  gestureTried = false;
  try {
    if (provider instanceof DriveProvider) await provider.authorize('');
    else if (provider instanceof FileProvider) await provider.authorize();
    await syncNow();
  } catch (e: any) {
    setStatus({ state: 'needs-auth', error: e?.message });
  }
}

export async function disconnect() {
  provider?.disconnect();
  provider = null;
  cfg = { kind: null, clientId: cfg.clientId };
  saveCfg();
  await saveHandle(null);
  setStatus({ kind: null, label: '', state: 'off', error: undefined, lastSync: undefined });
}

/* ---------- startup ---------- */

export async function initSync() {
  subscribe(() => {
    if (applying || !provider) return;
    dirty = true;
    scheduleSync();
  });
  window.addEventListener('focus', () => provider && scheduleSync(300));
  window.addEventListener('online', () => provider && scheduleSync(300));
  window.setInterval(() => { if (provider && document.visibilityState === 'visible') void syncNow(); }, 30_000);
  // OAuth tokens and file permissions can only be renewed during a user gesture:
  // use the first click after they lapse to renew them quietly.
  document.addEventListener('pointerdown', () => {
    if (!provider || gestureTried) return;
    const near = provider instanceof DriveProvider ? !provider.tokenValid(5 * 60_000) : provider.needsAuth();
    if (!near) return;
    gestureTried = true;
    provider.refreshOnGesture().then(() => {
      if (!provider?.needsAuth()) { gestureTried = false; void syncNow(); }
    });
  }, true);

  if (cfg.kind === 'drive' && cfg.clientId) {
    const p = new DriveProvider(cfg.clientId, cfg.fileId ?? null);
    attach(p);
    setStatus({ state: p.needsAuth() ? 'needs-auth' : 'syncing' });
    if (!p.needsAuth()) void syncNow();
  } else if (cfg.kind === 'file') {
    const h = await loadHandle();
    if (!h) { cfg.kind = null; saveCfg(); return; }
    const p = new FileProvider(h);
    attach(p);
    if (await p.checkPermission()) void syncNow();
    else setStatus({ state: 'needs-auth' });
  }
}
