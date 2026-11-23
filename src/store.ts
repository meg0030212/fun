import { produce, Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import type { Block, BlockType, Database, Page, Property, PropType, State, View, ViewType } from './types';
import { uid } from './utils';
import { seedState } from './seed';

const KEY = 'lumen-workspace-v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s && s.pages && s.dbs && s.settings) return s;
    }
  } catch { /* ignore */ }
  return seedState();
}

let state: State = load();
const listeners = new Set<() => void>();

let saveTimer: number | undefined;
let warned = false;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      if (!warned) {
        warned = true;
        window.dispatchEvent(new CustomEvent('lumen:toast', { detail: '儲存空間已滿，部分變更可能無法保存。請刪除大型圖片或匯出工作區備份。' }));
      }
    }
  }, 250);
}
window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
});

export function getState() { return state; }

function emit() { listeners.forEach((l) => l()); }

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

/* ---------------- undo / redo ---------------- */
type Snap = Pick<State, 'pages' | 'dbs'>;
const undoStack: Snap[] = [];
const redoStack: Snap[] = [];
let lastTyping = 0;

export function checkpoint() {
  undoStack.push({ pages: state.pages, dbs: state.dbs });
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

export function undo() {
  const s = undoStack.pop();
  if (!s) return;
  redoStack.push({ pages: state.pages, dbs: state.dbs });
  state = { ...state, ...s };
  emit(); scheduleSave();
}
export function redo() {
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push({ pages: state.pages, dbs: state.dbs });
  state = { ...state, ...s };
  emit(); scheduleSave();
}

/** update state. kind: 'structural' pushes a checkpoint, 'typing' throttles checkpoints, 'silent' none */
export function update(fn: (d: Draft<State>) => void, kind: 'structural' | 'typing' | 'silent' = 'structural') {
  if (kind === 'structural') checkpoint();
  else if (kind === 'typing') {
    const now = Date.now();
    if (now - lastTyping > 1200) checkpoint();
    lastTyping = now;
  }
  const prev = state;
  let next = produce(state, fn);
  // stamp modification times on every changed page / database so sync can merge per item
  if (next.pages !== prev.pages || next.dbs !== prev.dbs) {
    const now = Date.now();
    next = produce(next, (d) => {
      for (const id in d.pages) {
        const p = d.pages[id];
        const old = prev.pages[id];
        if (old && next.pages[id] !== old && p.updatedAt === old.updatedAt) p.updatedAt = now;
      }
      for (const id in d.dbs) {
        if (next.dbs[id] !== prev.dbs[id]) d.dbs[id].updatedAt = now;
      }
      if (d.pristine) d.pristine = false;
    });
  }
  state = next;
  emit();
  scheduleSave();
}

/** replace pages/dbs with a merged copy from sync without touching timestamps */
export function applyRemoteState(s: State) {
  checkpoint();
  state = s;
  emit();
  scheduleSave();
}

export function replaceState(s: State) {
  checkpoint();
  state = s;
  emit();
  scheduleSave();
}

/* ---------------- factories ---------------- */
export function newBlock(type: BlockType = 'text', extra: Partial<Block> = {}): Block {
  const b: Block = { id: uid(), type, html: '', indent: 0, ...extra };
  if (type === 'todo' && b.checked === undefined) b.checked = false;
  if (type === 'callout' && !b.icon) b.icon = '💡';
  if (type === 'table' && !b.rows) { b.rows = [['', '', ''], ['', '', ''], ['', '', '']]; b.headerRow = true; }
  if (type === 'code' && !b.lang) b.lang = 'plain';
  return b;
}

export function makePage(p: Partial<Page> = {}): Page {
  const now = Date.now();
  return {
    id: uid(), title: '', parentId: null, blocks: [newBlock()], createdAt: now, updatedAt: now,
    comments: [], sort: now, ...p,
  };
}

export function makeView(type: ViewType, db?: Pick<Database, 'properties'>, name?: string): View {
  const names: Record<ViewType, string> = { table: '表格', board: '看板', list: '清單', gallery: '畫廊', calendar: '行事曆' };
  const v: View = { id: uid(), name: name || names[type], type, filters: [], sorts: [], hidden: [], widths: {}, calcs: {} };
  if (db) {
    if (type === 'board') v.groupBy = db.properties.find((p) => p.type === 'status' || p.type === 'select')?.id;
    if (type === 'calendar') v.dateProp = db.properties.find((p) => p.type === 'date')?.id;
    if (type === 'gallery') v.cardPreview = 'content';
  }
  return v;
}

export function makeProp(type: PropType, name: string, extra: Partial<Property> = {}): Property {
  const p: Property = { id: uid(), name, type, ...extra };
  if ((type === 'select' || type === 'multi_select') && !p.options) p.options = [];
  if (type === 'status' && !p.options) p.options = [
    { id: uid(), name: '未開始', color: 'gray' },
    { id: uid(), name: '進行中', color: 'blue' },
    { id: uid(), name: '已完成', color: 'green' },
  ];
  return p;
}

/* ---------------- page actions ---------------- */
export function createPage(opts: Partial<Page> & { addLinkInParent?: boolean } = {}): string {
  const { addLinkInParent, ...rest } = opts;
  const siblings = Object.values(state.pages).filter((p) => p.parentId === (rest.parentId ?? null) && !p.rowOf);
  const p = makePage({ sort: siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 1 : Date.now(), ...rest });
  update((d) => {
    d.pages[p.id] = p;
    if (addLinkInParent && p.parentId && d.pages[p.parentId]) {
      const parent = d.pages[p.parentId];
      const blocks = parent.blocks;
      const last = blocks[blocks.length - 1];
      const link = newBlock('page', { pageId: p.id });
      if (last && last.type === 'text' && !last.html) blocks.splice(blocks.length - 1, 0, link);
      else blocks.push(link);
      parent.updatedAt = Date.now();
    }
  });
  return p.id;
}

export function patchPage(id: string, patch: Partial<Page>, kind: 'structural' | 'typing' | 'silent' = 'structural') {
  update((d) => {
    const p = d.pages[id];
    if (!p) return;
    Object.assign(p, patch);
    p.updatedAt = Date.now();
  }, kind);
}

export function setBlocks(pageId: string, fn: (blocks: Block[]) => Block[] | void, kind: 'structural' | 'typing' | 'silent' = 'structural') {
  update((d) => {
    const p = d.pages[pageId];
    if (!p) return;
    const r = fn(p.blocks as Block[]);
    if (r) p.blocks = r;
    p.updatedAt = Date.now();
  }, kind);
}

export function isTrashed(id: string, s: State = state): boolean {
  let cur: Page | undefined = s.pages[id];
  let guard = 0;
  while (cur && guard++ < 100) {
    if (cur.trashed) return true;
    if (cur.rowOf) {
      const db: Database | undefined = s.dbs[cur.rowOf];
      if (!db) return true;
      cur = s.pages[db.hostPageId];
      continue;
    }
    cur = cur.parentId ? s.pages[cur.parentId] : undefined;
  }
  return false;
}

export function trashPage(id: string) {
  update((d) => {
    const p = d.pages[id];
    if (!p) return;
    p.trashed = true;
    p.trashedAt = Date.now();
    p.favorite = false;
  });
}

export function restorePage(id: string) {
  update((d) => {
    const p = d.pages[id];
    if (!p) return;
    p.trashed = false;
    if (p.parentId && !d.pages[p.parentId]) p.parentId = null;
  });
}

function collectDescendants(s: State, id: string, out: Set<string>, dbOut: Set<string>) {
  if (out.has(id)) return;
  out.add(id);
  const p = s.pages[id];
  if (!p) return;
  const dbIds = new Set<string>();
  if (p.dbId) dbIds.add(p.dbId);
  p.blocks.forEach((b) => b.dbId && dbIds.add(b.dbId));
  Object.values(s.dbs).forEach((db) => db.hostPageId === id && dbIds.add(db.id));
  dbIds.forEach((dbId) => {
    dbOut.add(dbId);
    Object.values(s.pages).forEach((r) => r.rowOf === dbId && collectDescendants(s, r.id, out, dbOut));
  });
  Object.values(s.pages).forEach((c) => c.parentId === id && collectDescendants(s, c.id, out, dbOut));
}

export function deletePageForever(id: string) {
  const ids = new Set<string>();
  const dbIds = new Set<string>();
  collectDescendants(state, id, ids, dbIds);
  update((d) => {
    const now = Date.now();
    d.deleted = d.deleted || {};
    ids.forEach((i) => { delete d.pages[i]; d.deleted![i] = now; });
    dbIds.forEach((i) => { delete d.dbs[i]; d.deleted![i] = now; });
    Object.values(d.pages).forEach((p) => {
      if (p.blocks.some((b) => (b.pageId && ids.has(b.pageId)) || (b.dbId && dbIds.has(b.dbId)))) {
        p.blocks = p.blocks.filter((b) => !((b.pageId && ids.has(b.pageId)) || (b.dbId && dbIds.has(b.dbId))));
        if (!p.blocks.length) p.blocks.push(newBlock());
      }
    });
    d.recent = d.recent.filter((r) => !ids.has(r));
  });
}

export function emptyTrash() {
  Object.values(state.pages).filter((p) => p.trashed).forEach((p) => {
    if (state.pages[p.id]) deletePageForever(p.id);
  });
}

/** deep-duplicate a page (with sub pages & databases) */
export function duplicatePage(id: string, newParent?: string | null): string | null {
  const src = state.pages[id];
  if (!src) return null;
  const idMap = new Map<string, string>();
  const dbMap = new Map<string, string>();
  const newPages: Page[] = [];
  const newDbs: Database[] = [];

  const clonePage = (p: Page, parentId: string | null, rowOf?: string): string => {
    const nid = uid();
    idMap.set(p.id, nid);
    const copy: Page = JSON.parse(JSON.stringify(p));
    copy.id = nid;
    copy.parentId = parentId;
    copy.rowOf = rowOf;
    copy.favorite = false;
    copy.createdAt = copy.updatedAt = Date.now();
    copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid() }));
    newPages.push(copy);
    // databases owned by this page
    const dbIds = new Set<string>();
    if (p.dbId) dbIds.add(p.dbId);
    p.blocks.forEach((b) => b.dbId && dbIds.add(b.dbId));
    dbIds.forEach((dbId) => {
      const db = state.dbs[dbId];
      if (!db) return;
      const ndb: Database = JSON.parse(JSON.stringify(db));
      ndb.id = uid();
      ndb.hostPageId = nid;
      dbMap.set(dbId, ndb.id);
      newDbs.push(ndb);
      Object.values(state.pages).filter((r) => r.rowOf === dbId && !r.trashed).forEach((r) => clonePage(r, null, ndb.id));
    });
    if (copy.dbId) copy.dbId = dbMap.get(copy.dbId);
    copy.blocks.forEach((b) => { if (b.dbId) b.dbId = dbMap.get(b.dbId); });
    Object.values(state.pages).filter((c) => c.parentId === p.id && !c.rowOf && !c.trashed).forEach((c) => clonePage(c, nid));
    copy.blocks.forEach((b) => { if (b.pageId && idMap.has(b.pageId)) b.pageId = idMap.get(b.pageId); });
    return nid;
  };

  const rootId = clonePage(src, newParent === undefined ? src.parentId : newParent, src.rowOf);
  update((d) => {
    newPages.forEach((p) => {
      if (p.id === rootId) { p.title = p.title ? `${p.title} (副本)` : ''; p.sort = src.sort + 0.5; }
      d.pages[p.id] = p;
    });
    newDbs.forEach((db) => (d.dbs[db.id] = db));
    const root = d.pages[rootId];
    if (root.parentId && !root.rowOf && d.pages[root.parentId]) {
      const parent = d.pages[root.parentId];
      const idx = parent.blocks.findIndex((b) => b.pageId === id);
      const link = newBlock('page', { pageId: rootId });
      if (idx >= 0) parent.blocks.splice(idx + 1, 0, link);
    }
  });
  return rootId;
}

export function movePage(id: string, newParent: string | null, beforeId?: string | null) {
  if (newParent) {
    // prevent cycles
    let cur: string | null = newParent;
    while (cur) {
      if (cur === id) return;
      cur = state.pages[cur]?.parentId ?? null;
    }
  }
  update((d) => {
    const p = d.pages[id];
    if (!p) return;
    const oldParent = p.parentId;
    if (oldParent !== newParent) {
      if (oldParent && d.pages[oldParent]) {
        const op = d.pages[oldParent];
        op.blocks = op.blocks.filter((b) => !(b.type === 'page' && b.pageId === id));
        if (!op.blocks.length) op.blocks.push(newBlock());
      }
      if (newParent && d.pages[newParent]) {
        d.pages[newParent].blocks.push(newBlock('page', { pageId: id }));
      }
    }
    p.parentId = newParent;
    const siblings = Object.values(d.pages)
      .filter((s) => s.parentId === newParent && !s.rowOf && s.id !== id)
      .sort((a, b) => a.sort - b.sort);
    const idx = beforeId ? siblings.findIndex((s) => s.id === beforeId) : -1;
    if (idx < 0) siblings.push(p); else siblings.splice(idx, 0, p);
    siblings.forEach((s, i) => (s.sort = i));
  });
}

export function visitPage(id: string) {
  if (state.recent[0] === id) return;
  update((d) => {
    d.recent = [id, ...d.recent.filter((r) => r !== id)].slice(0, 30);
  }, 'silent');
}

export function updateSettings(patch: Partial<State['settings']>) {
  update((d) => { Object.assign(d.settings, patch); }, 'silent');
}

/* ---------------- database actions ---------------- */
export function makeDatabase(hostPageId: string, inline: boolean, viewType: ViewType = 'table', title = ''): Database {
  const status = makeProp('status', '狀態');
  const props: Property[] = [makeProp('title', '名稱'), status, makeProp('date', '日期'), makeProp('multi_select', '標籤')];
  const db: Database = { id: uid(), title, properties: props, views: [], activeView: '', hostPageId, inline };
  const v = makeView(viewType, db);
  db.views = [v];
  db.activeView = v.id;
  return db;
}

/** create a full-page database as a child page. returns page id */
export function createDatabasePage(parentId: string | null, viewType: ViewType = 'table', addLinkInParent = true): string {
  const pageId = uid();
  const db = makeDatabase(pageId, false, viewType);
  const siblings = Object.values(state.pages).filter((p) => p.parentId === parentId && !p.rowOf);
  const page = makePage({ id: pageId, parentId, dbId: db.id, blocks: [], sort: siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 1 : 0 });
  update((d) => {
    d.dbs[db.id] = db;
    d.pages[pageId] = page;
    if (addLinkInParent && parentId && d.pages[parentId]) d.pages[parentId].blocks.push(newBlock('page', { pageId }));
  });
  return pageId;
}

export function createInlineDatabase(hostPageId: string, viewType: ViewType = 'table'): string {
  const db = makeDatabase(hostPageId, true, viewType);
  update((d) => { d.dbs[db.id] = db; }, 'silent');
  return db.id;
}

export function updateDb(dbId: string, fn: (db: Draft<Database>) => void, kind: 'structural' | 'typing' | 'silent' = 'structural') {
  update((d) => {
    const db = d.dbs[dbId];
    if (db) fn(db);
  }, kind);
}

export function updateView(dbId: string, viewId: string, fn: (v: Draft<View>) => void) {
  updateDb(dbId, (db) => {
    const v = db.views.find((x) => x.id === viewId);
    if (v) fn(v);
  });
}

export function addRow(dbId: string, props: Record<string, any> = {}, title = '', sort?: number): string {
  const rows = Object.values(state.pages).filter((p) => p.rowOf === dbId);
  const p = makePage({ rowOf: dbId, title, props, sort: sort ?? (rows.length ? Math.max(...rows.map((r) => r.sort)) + 1 : 0), blocks: [newBlock()] });
  update((d) => { d.pages[p.id] = p; });
  return p.id;
}

export function setRowProp(rowId: string, propId: string, value: any, kind: 'structural' | 'typing' = 'structural') {
  update((d) => {
    const p = d.pages[rowId];
    if (!p) return;
    p.props = p.props || {};
    p.props[propId] = value;
    p.updatedAt = Date.now();
  }, kind);
}
