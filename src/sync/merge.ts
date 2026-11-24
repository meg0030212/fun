import type { Database, Page, State } from '../types';

export interface SyncPayload {
  app: 'lumen';
  version: 1;
  savedAt: number;
  workspaceName: string;
  pages: Record<string, Page>;
  dbs: Record<string, Database>;
  deleted: Record<string, number>;
  plannerTemplates?: State['plannerTemplates'];
}

export function toPayload(s: State): SyncPayload {
  return {
    app: 'lumen', version: 1, savedAt: Date.now(), workspaceName: s.settings.workspaceName,
    pages: s.pages, dbs: s.dbs, deleted: s.deleted || {}, plannerTemplates: s.plannerTemplates || [],
  };
}

export function isPayload(x: any): x is SyncPayload {
  return !!x && typeof x === 'object' && x.pages && x.dbs;
}

function pick<T extends { updatedAt?: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}

/**
 * Merge a remote copy into the local state. Each page and database keeps whichever
 * side edited it last; permanently deleted items stay deleted unless edited afterwards.
 * Local-only settings (theme, sidebar, recent pages) are kept.
 */
export function mergeStates(local: State, remote: SyncPayload): State {
  const deleted: Record<string, number> = { ...(local.deleted || {}) };
  for (const [id, t] of Object.entries(remote.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);

  const pages: Record<string, Page> = {};
  const pageIds = new Set([...Object.keys(local.pages), ...Object.keys(remote.pages)]);
  pageIds.forEach((id) => {
    const p = pick(local.pages[id], remote.pages[id]);
    if (!p) return;
    if (deleted[id] && deleted[id] >= (p.updatedAt || 0)) return;
    pages[id] = p;
  });

  const dbs: Record<string, Database> = {};
  const dbIds = new Set([...Object.keys(local.dbs), ...Object.keys(remote.dbs)]);
  dbIds.forEach((id) => {
    const d = pick(local.dbs[id], remote.dbs[id]);
    if (!d) return;
    if (deleted[id] && deleted[id] >= (d.updatedAt || 0)) return;
    dbs[id] = d;
  });

  // drop page/database links that point to deleted items
  for (const id of Object.keys(pages)) {
    const p = pages[id];
    if (p.blocks.some((b) => (b.pageId && !pages[b.pageId] && deleted[b.pageId]) || (b.dbId && !dbs[b.dbId] && deleted[b.dbId]))) {
      pages[id] = { ...p, blocks: p.blocks.filter((b) => !((b.pageId && !pages[b.pageId] && deleted[b.pageId]) || (b.dbId && !dbs[b.dbId] && deleted[b.dbId]))) };
    }
  }

  const tpl = new Map((remote.plannerTemplates || []).map((t) => [t.id, t]));
  (local.plannerTemplates || []).forEach((t) => tpl.set(t.id, t));
  return { ...local, pages, dbs, deleted, plannerTemplates: [...tpl.values()], recent: local.recent.filter((r) => pages[r]), pristine: false };
}

/** true when merging changed anything compared to the local state */
export function differs(a: State, b: State): boolean {
  if (Object.keys(a.pages).length !== Object.keys(b.pages).length) return true;
  if (Object.keys(a.dbs).length !== Object.keys(b.dbs).length) return true;
  for (const id in b.pages) if (a.pages[id] !== b.pages[id]) return true;
  for (const id in b.dbs) if (a.dbs[id] !== b.dbs[id]) return true;
  return false;
}
