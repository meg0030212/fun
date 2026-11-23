/* Import a Notion "Markdown & CSV" export (.zip) into Lumen.
   Notion layout: "Title <32-hex id>.md" for pages, "Title <id>.csv" (and "_all.csv")
   for databases, and a folder "Title <id>/" holding each page's children,
   database row pages and attachments. */
import { unzipSync, strFromU8 } from 'fflate';
import type { Block, Database, Page, Property, PropType, SelectOption, View } from './types';
import { getState, makePage, makeView, newBlock, update } from './store';
import { markdownToBlocks, inlineMdToHtml } from './markdown';
import { COLORS, escapeHtml, toISODate, uid } from './utils';

export interface ImportReport {
  pages: number;
  databases: number;
  rows: number;
  images: number;
  skippedImages: number;
  rootIds: string[];
  warnings: string[];
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MAX_IMAGE = 400 * 1024;
const IMAGE_BUDGET = 2.5 * 1024 * 1024;

/* ---------------- zip & paths ---------------- */

function unzipAll(data: Uint8Array, out: Map<string, Uint8Array>, depth = 0) {
  const files = unzipSync(data);
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('/') || name.startsWith('__MACOSX') || /(^|\/)\.DS_Store$/.test(name)) continue;
    if (/\.zip$/i.test(name) && depth < 3) unzipAll(bytes, out, depth + 1);
    else out.set(name.normalize('NFC'), bytes);
  }
}

function dirOf(p: string) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function baseOf(p: string) { return p.slice(p.lastIndexOf('/') + 1); }
function noExt(p: string) { return p.replace(/\.[^./]+$/, ''); }

function resolvePath(fromDir: string, href: string): string | null {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return null;
  let rel: string;
  try { rel = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { rel = href; }
  const parts = (fromDir ? fromDir.split('/') : []).concat(rel.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop(); else out.push(p);
  }
  return out.join('/').normalize('NFC');
}

/** "Meeting notes 1a2b…(32 hex)" → "Meeting notes" */
export function stripNotionId(name: string): string {
  return name.replace(/\s+[0-9a-f]{32}$/i, '').replace(/\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '').trim();
}

/* ---------------- csv ---------------- */

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function parseAnyDate(v: string): string | null {
  const s = v.split('→')[0].trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return toISODate(new Date(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(s);
  if (m) return toISODate(new Date(+m[1], +m[2] - 1, +m[3]));
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return toISODate(new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return toISODate(new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return toISODate(new Date(+m[3], +m[1] - 1, +m[2]));
  return null;
}

const YES = new Set(['yes', 'no', 'true', 'false', '是', '否', '✓', '']);
const isUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const toNumber = (v: string) => { const n = Number(v.replace(/[,$%\s]|NT\$|US\$/g, '')); return v.trim() && !isNaN(n) ? n : null; };

function inferType(header: string, values: string[]): PropType {
  const h = header.toLowerCase();
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (/^(created( time)?|建立時間|last edited( time)?|上次編輯時間)$/.test(h)) return 'date';
  if (values.every((v) => YES.has(v.trim().toLowerCase()))) return 'checkbox';
  if (filled.every((v) => toNumber(v) !== null)) return 'number';
  if (filled.every((v) => parseAnyDate(v))) return 'date';
  if (filled.every(isUrl)) return 'url';
  if (filled.every(isEmail)) return 'email';
  const multi = filled.some((v) => v.includes(', '));
  const tokens = multi ? filled.flatMap((v) => v.split(', ').map((x) => x.trim())) : filled;
  const distinct = new Set(tokens);
  const longest = Math.max(...tokens.map((t) => t.length));
  const repetitive = distinct.size <= Math.max(12, Math.ceil(tokens.length * 0.6)) && distinct.size < tokens.length || filled.length <= 3;
  if (longest <= 40 && repetitive && distinct.size <= 60) {
    if (multi) return 'multi_select';
    return /^(status|狀態|進度)$/.test(h) ? 'status' : 'select';
  }
  return 'text';
}

/** familiar colors for common status / priority names */
function colorFor(name: string): string | null {
  const n = name.toLowerCase();
  if (/(已?完成|done|complete|finished|已讀完)/.test(n)) return 'green';
  if (/(進行中|in progress|doing|閱讀中|處理中)/.test(n)) return 'blue';
  if (/(未開始|not started|to ?do|待處理|backlog|想讀)/.test(n)) return 'gray';
  if (/(審核|review|blocked|卡住)/.test(n)) return 'purple';
  if (/^(高|high|urgent|緊急|p0)$/.test(n)) return 'red';
  if (/^(中|medium|p1)$/.test(n)) return 'yellow';
  if (/^(低|low|p2)$/.test(n)) return 'gray';
  return null;
}

/* ---------------- main ---------------- */

interface Node {
  key: string;          // path without extension (csv: without _all)
  kind: 'page' | 'db';
  file: string;         // .md or .csv path
  id: string;           // Lumen page id
  title: string;
  parentKey: string | null;
  isRow: boolean;
}

export async function importNotionZip(file: File, parentId: string | null): Promise<ImportReport> {
  const files = new Map<string, Uint8Array>();
  try {
    unzipAll(new Uint8Array(await file.arrayBuffer()), files);
  } catch {
    throw new Error('無法讀取這個 zip 檔。請確認是 Notion 匯出的「Markdown & CSV」壓縮檔。');
  }
  const report: ImportReport = { pages: 0, databases: 0, rows: 0, images: 0, skippedImages: 0, rootIds: [], warnings: [] };

  const mdFiles = [...files.keys()].filter((p) => /\.md$/i.test(p));
  const csvFiles = [...files.keys()].filter((p) => /\.csv$/i.test(p));
  if (!mdFiles.length && !csvFiles.length) {
    if ([...files.keys()].some((p) => /\.html?$/i.test(p))) throw new Error('這是 HTML 格式的匯出。請在 Notion 匯出時將格式改選「Markdown & CSV」。');
    throw new Error('壓縮檔中找不到 Notion 頁面（.md）或資料庫（.csv）。');
  }

  /* --- nodes --- */
  const nodes = new Map<string, Node>();
  for (const p of csvFiles) {
    const key = noExt(p).replace(/_all$/, '');
    const existing = nodes.get(key);
    if (existing && !/_all\.csv$/i.test(p)) continue; // prefer the complete "_all" export
    nodes.set(key, { key, kind: 'db', file: p, id: existing?.id || uid(), title: stripNotionId(baseOf(key)), parentKey: null, isRow: false });
  }
  for (const p of mdFiles) {
    const key = noExt(p);
    if (nodes.has(key)) continue;
    nodes.set(key, { key, kind: 'page', file: p, id: uid(), title: stripNotionId(baseOf(key)), parentKey: null, isRow: false });
  }
  for (const n of nodes.values()) {
    let d = dirOf(n.key);
    while (d && !nodes.has(d)) d = dirOf(d);
    n.parentKey = d && nodes.has(d) ? d : null;
    n.isRow = !!n.parentKey && nodes.get(n.parentKey)!.kind === 'db' && n.kind === 'page';
  }
  const pathToNode = (p: string | null): Node | undefined => {
    if (!p) return undefined;
    const k = noExt(p).replace(/_all$/, '');
    return nodes.get(k);
  };

  /* --- images --- */
  let imageBytes = 0;
  const imageCache = new Map<string, string | null>();
  const imageUrl = (path: string): string | null => {
    if (imageCache.has(path)) return imageCache.get(path)!;
    const bytes = files.get(path);
    let url: string | null = null;
    if (bytes && bytes.length <= MAX_IMAGE && imageBytes + bytes.length <= IMAGE_BUDGET) {
      const ext = (path.split('.').pop() || 'png').toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      url = `data:${mime};base64,${btoa(bin)}`;
      imageBytes += bytes.length;
      report.images++;
    } else if (bytes) report.skippedImages++;
    imageCache.set(path, url);
    return url;
  };

  /* --- markdown → blocks --- */
  const mentionHtml = (n: Node, label: string) =>
    `<a class="mention" contenteditable="false" data-page-id="${n.id}" href="#p-${n.id}"><span class="mention-icon">📄</span><span class="mention-title">${escapeHtml(label || n.title)}</span></a>`;

  const fixLinks = (html: string, dir: string) => html.replace(/<a href="([^"]*)">(.*?)<\/a>/g, (all, href, label) => {
    const target = pathToNode(resolvePath(dir, href.replace(/&amp;/g, '&')));
    if (target) return mentionHtml(target, stripNotionId(label.replace(/<[^>]+>/g, '').replace(/\.(md|csv)$/i, '')));
    return all;
  });

  const convert = (node: Node, md: string, linkedChildren: Set<string>): Block[] => {
    const dir = dirOf(node.file);
    let lines = md.replace(/\r\n?/g, '\n').split('\n');
    // drop the title line
    const first = lines.findIndex((l) => l.trim());
    if (first >= 0 && /^#\s+/.test(lines[first])) lines = lines.slice(first + 1);
    // row pages repeat their properties as "Name: value" lines right after the title
    if (node.isRow) {
      let i = 0;
      while (i < lines.length && !lines[i].trim()) i++;
      while (i < lines.length && /^[^\s:#>\-*|][^:]{0,60}:\s/.test(lines[i])) i++;
      lines = lines.slice(i);
    }
    const out: Block[] = [];
    let buf: string[] = [];
    const flush = () => {
      if (!buf.length) return;
      out.push(...markdownToBlocks(buf.join('\n')));
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*<aside>\s*$/.test(line)) {
        flush();
        const inner: string[] = [];
        i++;
        while (i < lines.length && !/^\s*<\/aside>\s*$/.test(lines[i])) inner.push(lines[i++]);
        const text = inner.map((l) => l.trim()).filter(Boolean);
        let icon = '💡';
        if (text.length) {
          const em = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u.exec(text[0]);
          if (em) { icon = em[1]; text[0] = text[0].slice(em[0].length); }
        }
        out.push(newBlock('callout', { icon, color: 'gray_bg', html: text.map(inlineMdToHtml).join('<br>') }));
        continue;
      }
      if (/^\s*<\/?(details|summary)>/.test(line)) continue;
      buf.push(line);
    }
    flush();

    const result: Block[] = [];
    for (const b of out) {
      if (b.type === 'image' && b.url) {
        const path = resolvePath(dir, b.url);
        if (path && files.has(path)) {
          const url = IMAGE_EXT.test(path) ? imageUrl(path) : null;
          if (url) { b.url = url; b.caption = b.caption && !IMAGE_EXT.test(b.caption) ? b.caption : ''; }
          else { result.push(newBlock('text', { indent: b.indent, html: `<i>[圖片未匯入：${escapeHtml(baseOf(path))}]</i>` })); continue; }
        }
      }
      // a line that is only a link to a child page / database → page block
      const only = /^<a href="([^"]*)">(.*?)<\/a>$/.exec(b.html.trim());
      if (only && (b.type === 'text' || b.type === 'bulleted')) {
        const target = pathToNode(resolvePath(dir, only[1].replace(/&amp;/g, '&')));
        if (target && target.parentKey === node.key && !target.isRow) {
          linkedChildren.add(target.key);
          result.push(newBlock('page', { pageId: target.id, indent: b.indent }));
          continue;
        }
      }
      if (b.html.includes('<a href=')) b.html = fixLinks(b.html, dir);
      if (b.rows) b.rows = b.rows.map((r) => r.map((c) => (c.includes('<a href=') ? fixLinks(c, dir) : c)));
      result.push(b);
    }
    return result;
  };

  /* --- build pages & databases --- */
  const newPages: Page[] = [];
  const newDbs: Database[] = [];
  const now = Date.now();
  const rootSort = Math.max(0, ...Object.values(getState().pages).filter((p) => p.parentId === parentId && !p.rowOf).map((p) => p.sort)) + 1;
  const ordered = [...nodes.values()].sort((a, b) => a.key.localeCompare(b.key));
  const pageById = new Map<string, Page>();
  const linked = new Map<string, Set<string>>();

  // databases first so rows can be attached
  const rowPagesOf = new Map<string, Node[]>();
  for (const n of ordered) if (n.isRow) rowPagesOf.set(n.parentKey!, [...(rowPagesOf.get(n.parentKey!) || []), n]);

  ordered.forEach((n, idx) => {
    if (n.isRow) return;
    const parentNode = n.parentKey ? nodes.get(n.parentKey) : undefined;
    const pId = parentNode && parentNode.kind === 'page' ? parentNode.id : parentNode ? parentNode.id : parentId;
    if (!parentNode) report.rootIds.push(n.id);

    if (n.kind === 'page') {
      const set = new Set<string>();
      linked.set(n.key, set);
      const blocks = convert(n, strFromU8(files.get(n.file)!), set);
      const page = makePage({ id: n.id, title: n.title, parentId: pId, blocks: blocks.length ? blocks : [newBlock()], sort: parentNode ? idx : rootSort + idx, createdAt: now, updatedAt: now });
      newPages.push(page);
      pageById.set(n.id, page);
      report.pages++;
      return;
    }

    // database
    const rows = parseCsv(strFromU8(files.get(n.file)!));
    const header = rows[0] || ['Name'];
    const body = rows.slice(1);
    const props: Property[] = header.map((h, ci) => {
      const name = h.trim() || `欄位 ${ci + 1}`;
      if (ci === 0) return { id: uid(), name, type: 'title' };
      const type = inferType(name, body.map((r) => r[ci] || ''));
      const prop: Property = { id: uid(), name, type };
      if (type === 'select' || type === 'status' || type === 'multi_select') {
        const names = new Set<string>();
        body.forEach((r) => (type === 'multi_select' ? (r[ci] || '').split(', ') : [r[ci] || '']).forEach((v) => v.trim() && names.add(v.trim())));
        prop.options = [...names].map((nm, k): SelectOption => ({ id: uid(), name: nm, color: colorFor(nm) || COLORS[1 + (k % (COLORS.length - 1))] }));
      }
      return prop;
    });
    const views: View[] = [makeView('table', { properties: props }, '表格')];
    const group = props.find((p) => p.type === 'status') || props.find((p) => p.type === 'select');
    if (group) { const v = makeView('board', { properties: props }, '看板'); v.groupBy = group.id; views.push(v); }
    const dateProp = props.find((p) => p.type === 'date');
    if (dateProp) { const v = makeView('calendar', { properties: props }, '行事曆'); v.dateProp = dateProp.id; views.push(v); }
    const db: Database = { id: uid(), title: n.title, properties: props, views, activeView: views[0].id, hostPageId: n.id, inline: false, updatedAt: now };
    newDbs.push(db);
    const dbPage = makePage({ id: n.id, title: n.title, parentId: pId, dbId: db.id, blocks: [], sort: parentNode ? idx : rootSort + idx, createdAt: now, updatedAt: now });
    newPages.push(dbPage);
    pageById.set(n.id, dbPage);
    report.databases++;

    const rowFiles = [...(rowPagesOf.get(n.key) || [])];
    body.forEach((r, ri) => {
      const title = (r[0] || '').trim();
      const fi = rowFiles.findIndex((f) => f.title === title);
      const rf = fi >= 0 ? rowFiles.splice(fi, 1)[0] : undefined;
      const values: Record<string, any> = {};
      props.forEach((p, ci) => {
        if (ci === 0) return;
        const v = (r[ci] || '').trim();
        if (!v) return;
        switch (p.type) {
          case 'checkbox': values[p.id] = /^(yes|true|是|✓)$/i.test(v); break;
          case 'number': values[p.id] = toNumber(v); break;
          case 'date': values[p.id] = parseAnyDate(v); break;
          case 'select': case 'status': values[p.id] = p.options!.find((o) => o.name === v)?.id; break;
          case 'multi_select': values[p.id] = v.split(', ').map((x) => p.options!.find((o) => o.name === x.trim())?.id).filter(Boolean); break;
          default: values[p.id] = v;
        }
      });
      const set = new Set<string>();
      const blocks = rf ? convert(rf, strFromU8(files.get(rf.file)!), set) : [];
      const row = makePage({ id: rf?.id || uid(), title, rowOf: db.id, props: values, blocks: blocks.length ? blocks : [newBlock()], sort: ri, createdAt: now, updatedAt: now });
      newPages.push(row);
      report.rows++;
    });
    // row pages that were not listed in the csv
    rowFiles.forEach((rf, k) => {
      const set = new Set<string>();
      const blocks = convert(rf, strFromU8(files.get(rf.file)!), set);
      newPages.push(makePage({ id: rf.id, title: rf.title, rowOf: db.id, props: {}, blocks: blocks.length ? blocks : [newBlock()], sort: body.length + k, createdAt: now, updatedAt: now }));
      report.rows++;
    });
  });

  // children that the parent page never linked to get a link at the end
  for (const n of ordered) {
    if (n.isRow || !n.parentKey) continue;
    const parent = nodes.get(n.parentKey)!;
    if (parent.kind !== 'page') continue;
    if (linked.get(parent.key)?.has(n.key)) continue;
    pageById.get(parent.id)?.blocks.push(newBlock('page', { pageId: n.id }));
  }
  // a page block linking into a database's rows is pointless; ensure every page has a trailing text block
  for (const p of newPages) {
    if (!p.dbId && (!p.blocks.length || p.blocks[p.blocks.length - 1].type !== 'text')) p.blocks.push(newBlock());
  }

  if (report.skippedImages) report.warnings.push(`有 ${report.skippedImages} 張圖片太大或超過總容量上限，未匯入（頁面中會標示檔名）。`);
  const size = new Blob([JSON.stringify(newPages), JSON.stringify(newDbs)]).size;
  if (size > 4 * 1024 * 1024) report.warnings.push(`匯入的內容約 ${(size / 1048576).toFixed(1)} MB，可能接近瀏覽器的儲存上限。建議開啟雲端同步並匯出備份。`);

  update((d) => {
    newDbs.forEach((db) => (d.dbs[db.id] = db));
    newPages.forEach((p) => (d.pages[p.id] = p));
    if (parentId && d.pages[parentId]) report.rootIds.forEach((id) => d.pages[parentId].blocks.push(newBlock('page', { pageId: id })));
  });
  return report;
}
