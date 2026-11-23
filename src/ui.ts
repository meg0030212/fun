import { useSyncExternalStore } from 'react';

export interface UIState {
  route: string; // page id or 'home'
  peek: string | null;
  search: boolean;
  settings: boolean;
  trash: boolean;
  templates: boolean;
  comments: boolean;
  toast: string | null;
}

let ui: UIState = { route: parseHash(), peek: null, search: false, settings: false, trash: false, templates: false, comments: false, toast: null };
const ls = new Set<() => void>();

function parseHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
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

export function navigate(id: string) {
  if (window.location.hash !== '#/' + id) window.location.hash = '#/' + id;
  else setUI({ route: id, peek: null });
}

export function openPeek(id: string | null) { setUI({ peek: id }); }

let toastTimer: number | undefined;
export function toast(msg: string) {
  setUI({ toast: msg });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setUI({ toast: null }), 2200);
}

export function pageLink(id: string) {
  return `${window.location.origin}${window.location.pathname}#/${id}`;
}
