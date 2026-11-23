import type { Block, Page, State } from './types';
import { escapeHtml, uid } from './utils';

export function inlineMdToHtml(s: string): string {
  let h = escapeHtml(s);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/__([^_]+)__/g, '<b>$1</b>');
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u.replace(/"/g, '%22')}">${t}</a>`);
  return h;
}

export function htmlToInlineMd(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent || '';
    if (n.nodeType !== 1) return '';
    const el = n as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join('');
    switch (el.tagName) {
      case 'B': case 'STRONG': return inner ? `**${inner}**` : '';
      case 'I': case 'EM': return inner ? `*${inner}*` : '';
      case 'CODE': return inner ? '`' + inner + '`' : '';
      case 'S': case 'STRIKE': case 'DEL': return inner ? `~~${inner}~~` : '';
      case 'A': return el.classList.contains('mention') ? inner : `[${inner}](${el.getAttribute('href') || ''})`;
      case 'BR': return '\n';
      default: return inner;
    }
  };
  return walk(d);
}

function mk(type: Block['type'], html = '', extra: Partial<Block> = {}): Block {
  const b: Block = { id: uid(), type, html, indent: 0, ...extra };
  if (type === 'todo' && b.checked === undefined) b.checked = false;
  return b;
}

export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const m = /^(\s*)(.*)$/.exec(raw)!;
    const indent = Math.min(8, Math.floor(m[1].replace(/\t/g, '    ').length / 2));
    const line = m[2];
    let r: RegExpExecArray | null;
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'plain';
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      out.push(mk('code', code.join('\n'), { lang, indent }));
      i++;
      continue;
    }
    if (line.startsWith('$$')) {
      const eq: string[] = [];
      const rest = line.slice(2);
      if (rest.endsWith('$$') && rest.length > 2) { out.push(mk('equation', rest.slice(0, -2))); i++; continue; }
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('$$')) eq.push(lines[i++]);
      out.push(mk('equation', eq.join('\n')));
      i++;
      continue;
    }
    if (/^\|.*\|$/.test(line.trim())) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells.map(inlineMdToHtml));
        i++;
      }
      out.push(mk('table', '', { rows, headerRow: true }));
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((r = /^(#{1,3})\s+(.*)$/.exec(line))) out.push(mk(('h' + r[1].length) as Block['type'], inlineMdToHtml(r[2])));
    else if ((r = /^[-*+]\s+\[( |x|X)\]\s?(.*)$/.exec(line))) out.push(mk('todo', inlineMdToHtml(r[2]), { checked: r[1] !== ' ', indent }));
    else if ((r = /^[-*+]\s+(.*)$/.exec(line))) out.push(mk('bulleted', inlineMdToHtml(r[1]), { indent }));
    else if ((r = /^\d+[.)]\s+(.*)$/.exec(line))) out.push(mk('numbered', inlineMdToHtml(r[1]), { indent }));
    else if ((r = /^>\s?(.*)$/.exec(line))) out.push(mk('quote', inlineMdToHtml(r[1])));
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) out.push(mk('divider'));
    else if ((r = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(line))) out.push(mk('image', '', { url: r[2], caption: r[1] }));
    else out.push(mk('text', inlineMdToHtml(line), { indent }));
    i++;
  }
  return out;
}

export function blocksToMarkdown(page: Page, s: State): string {
  const lines: string[] = [];
  if (page.title) lines.push(`# ${page.title}`, '');
  const counters: number[] = [];
  page.blocks.forEach((b) => {
    const pad = '  '.repeat(b.indent);
    const t = htmlToInlineMd(b.html);
    counters.length = b.indent + 1;
    if (b.type === 'numbered') counters[b.indent] = (counters[b.indent] || 0) + 1; else counters[b.indent] = 0;
    switch (b.type) {
      case 'h1': lines.push(`## ${t}`); break;
      case 'h2': lines.push(`### ${t}`); break;
      case 'h3': lines.push(`#### ${t}`); break;
      case 'bulleted': lines.push(`${pad}- ${t}`); break;
      case 'numbered': lines.push(`${pad}${counters[b.indent]}. ${t}`); break;
      case 'todo': lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${t}`); break;
      case 'toggle': lines.push(`${pad}- ${t}`); break;
      case 'quote': lines.push(`> ${t}`); break;
      case 'callout': lines.push(`> ${b.icon || ''} ${t}`); break;
      case 'divider': lines.push('---'); break;
      case 'code': lines.push('```' + (b.lang && b.lang !== 'plain' ? b.lang : ''), b.html, '```'); break;
      case 'equation': lines.push('$$', b.html, '$$'); break;
      case 'image': lines.push(`![${b.caption || ''}](${b.url || ''})`); break;
      case 'bookmark': case 'embed': case 'video': lines.push(b.url ? `[${b.url}](${b.url})` : ''); break;
      case 'page': { const p = b.pageId ? s.pages[b.pageId] : null; if (p) lines.push(`[${p.icon || ''} ${p.title || '未命名'}](#p-${p.id})`); break; }
      case 'database': { const db = b.dbId ? s.dbs[b.dbId] : null; lines.push(`*資料庫：${db?.title || '未命名'}*`); break; }
      case 'table': {
        const rows = b.rows || [];
        rows.forEach((r, i) => {
          lines.push('| ' + r.map((c) => htmlToInlineMd(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          if (i === 0) lines.push('| ' + r.map(() => '---').join(' | ') + ' |');
        });
        break;
      }
      case 'toc': break;
      default: lines.push(pad + t);
    }
    if (!['bulleted', 'numbered', 'todo', 'toggle'].includes(b.type)) lines.push('');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function blocksToHtmlDoc(page: Page, s: State): string {
  const body = page.blocks.map((b) => {
    switch (b.type) {
      case 'h1': return `<h1>${b.html}</h1>`;
      case 'h2': return `<h2>${b.html}</h2>`;
      case 'h3': return `<h3>${b.html}</h3>`;
      case 'bulleted': return `<ul style="margin-left:${b.indent * 24}px"><li>${b.html}</li></ul>`;
      case 'numbered': return `<ol style="margin-left:${b.indent * 24}px"><li>${b.html}</li></ol>`;
      case 'todo': return `<div style="margin-left:${b.indent * 24}px"><input type="checkbox" ${b.checked ? 'checked' : ''} disabled> ${b.html}</div>`;
      case 'quote': return `<blockquote>${b.html}</blockquote>`;
      case 'callout': return `<div style="background:#f1f1ef;padding:16px;border-radius:4px">${b.icon || ''} ${b.html}</div>`;
      case 'divider': return '<hr>';
      case 'code': return `<pre><code>${escapeHtml(b.html)}</code></pre>`;
      case 'image': return b.url ? `<figure><img src="${escapeHtml(b.url)}" style="max-width:100%"><figcaption>${escapeHtml(b.caption || '')}</figcaption></figure>` : '';
      case 'page': { const p = b.pageId ? s.pages[b.pageId] : null; return p ? `<p>📄 ${escapeHtml(p.title || '未命名')}</p>` : ''; }
      case 'table': return '<table border="1" cellpadding="6" style="border-collapse:collapse">' + (b.rows || []).map((r, i) => '<tr>' + r.map((c) => i === 0 && b.headerRow ? `<th>${c}</th>` : `<td>${c}</td>`).join('') + '</tr>').join('') + '</table>';
      default: return `<p style="margin-left:${b.indent * 24}px">${b.html}</p>`;
    }
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(page.title)}</title><style>body{font-family:-apple-system,"Segoe UI",sans-serif;max-width:720px;margin:40px auto;color:#37352f;line-height:1.6}blockquote{border-left:3px solid #37352f;padding-left:14px}pre{background:#f7f6f3;padding:16px}code{background:rgba(135,131,120,.15);padding:2px 4px;border-radius:3px}</style></head><body><h1>${page.icon || ''} ${escapeHtml(page.title)}</h1>${body}</body></html>`;
}
