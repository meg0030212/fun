import { useSyncExternalStore } from 'react';

export interface UIState {
  route: string; // page id or 'home'
  peek: string | null;
  search: boolean;
  settings: boolean;
  settingsTab?: string;
  trash: boolean;
  templates: boolean;
  importer: boolean;
  formulaEdit: { dbId: string; propId: string; rowId?: string } | null;
  comments: boolean;
  toast: string | null;
  confirm: { message: string; action: string; resolve: (ok: boolean) => void } | null;
  password: PasswordRequest | null;
}

export interface PasswordRequest {
  title: string;
  message: string;
  action: string;
  /** ask twice (setting a new password) */
  confirm?: boolean;
  /** async check; return an error message to keep the dialog open */
  check?: (pw: string) => Promise<string | null>;
  resolve: (pw: string | null) => void;
}

let ui: UIState = { route: parseHash(), peek: null, search: false, settings: false, trash: false, templates: false, importer: false, formulaEdit: null, comments: false, toast: null, confirm: null, password: null };
const ls = new Set<() => void>();

function parseHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h.startsWith('p-')) return decodeURIComponent(h.slice(2));
  return decodeURIComponent(h.split('?')[0]) || 'home';
}

export function setUI(patch: Partial<UIState>) {
  ui = { ...ui, ...patch };
  ls.forEach((l) => l());
}

export function useUI<T>(sel: (u: UIState) => T): T {
  return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, () => sel(ui));
}

export function getUI() { return ui; }

window.addEventListener('hashchange', () => setUI({ route: parseHash(), peek: null }));

export function hashFor(id: string) {
  return id === 'home' ? '#home' : '#p-' + id;
}

export function navigate(id: string) {
  // update the view right away (the hashchange that follows is a no-op) so focus lands without delay
  setUI({ route: id, peek: null });
  if (window.location.hash !== hashFor(id)) window.location.hash = hashFor(id);
}

/** in-app password dialog; resolves null when cancelled */
export function askPassword(opts: Omit<PasswordRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => setUI({ password: { ...opts, resolve } }));
}

/** in-app confirmation dialog (native confirm() is unavailable in sandboxed frames) */
export function askConfirm(message: string, action = '確定'): Promise<boolean> {
  return new Promise((resolve) => setUI({ confirm: { message, action, resolve } }));
}

export function openPeek(id: string | null) { setUI({ peek: id }); }

let toastTimer: number | undefined;
export function toast(msg: string) {
  setUI({ toast: msg });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setUI({ toast: null }), 2200);
}

export function pageLink(id: string) {
  return `${window.location.origin}${window.location.pathname}${hashFor(id)}`;
}
