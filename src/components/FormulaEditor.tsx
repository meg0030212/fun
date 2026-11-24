import React, { useMemo, useRef, useState } from 'react';
import { updateDb, useStore } from '../store';
import { setUI, useUI } from '../ui';
import { evaluate, FDate, FN_DOCS, FnDoc, toText } from '../formula';
import { Modal } from './Popover';
import { PropIcon } from './db/Property';
import { propTypeLabel } from './db/dbutils';
import { Icon } from './Icons';

const EXAMPLES: { label: string; src: (p: string[]) => string }[] = [
  { label: '距離截止還有幾天', src: () => 'dateBetween(prop("日期"), today(), "days")' },
  { label: '依狀態顯示圖示', src: () => 'if(prop("狀態") == "已完成", "✅", "⏳")' },
  { label: '價格 × 數量', src: () => 'prop("價格") * prop("數量")' },
  { label: '逾期提醒', src: () => 'if(dateBetween(prop("日期"), now(), "minutes") < 0, "已逾期", "")' },
];

export function FormulaEditorHost() {
  const req = useUI((u) => u.formulaEdit);
  if (!req) return null;
  return <FormulaEditor key={req.dbId + req.propId} {...req} />;
}

function FormulaEditor({ dbId, propId, rowId }: { dbId: string; propId: string; rowId?: string }) {
  const db = useStore((s) => s.dbs[dbId]);
  const pages = useStore((s) => s.pages);
  const prop = db?.properties.find((p) => p.id === propId);
  const [src, setSrc] = useState(prop?.formula || '');
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<FnDoc | null>(FN_DOCS[0]);
  const ta = useRef<HTMLTextAreaElement>(null);

  const rows = useMemo(() => Object.values(pages).filter((p) => p.rowOf === dbId && !p.trashed).sort((a, b) => a.sort - b.sort), [pages, dbId]);
  const [previewId, setPreviewId] = useState(rowId || rows[0]?.id || '');
  const previewRow = rows.find((r) => r.id === previewId) || rows[0];

  if (!db || !prop) return null;
  const close = () => setUI({ formulaEdit: null });
  const save = () => {
    updateDb(dbId, (d) => { const p = d.properties.find((x) => x.id === propId); if (p) p.formula = src.trim(); });
    close();
  };

  const insert = (text: string, caretBack = 0) => {
    const el = ta.current;
    if (!el) { setSrc((s) => s + text); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    const next = src.slice(0, a) + text + src.slice(b);
    setSrc(next);
    requestAnimationFrame(() => { el.focus(); const pos = a + text.length - caretBack; el.setSelectionRange(pos, pos); });
  };

  // evaluate against a copy of the database where this property uses the draft formula
  const draftDb = { ...db, properties: db.properties.map((p) => (p.id === propId ? { ...p, formula: src } : p)) };
  const result = src.trim() && previewRow ? evaluate(src, previewRow, draftDb) : null;
  const describe = (v: unknown): string => {
    if (v === null || v === '') return '（空白）';
    if (v instanceof FDate) return `${toText(v as FDate)}（日期）`;
    if (Array.isArray(v)) return `[${(v as any[]).map((x) => toText(x)).join(', ')}]（清單）`;
    if (typeof v === 'boolean') return `${v ? '✓ true' : '✗ false'}（核取方塊）`;
    if (typeof v === 'number') return `${toText(v)}（數字）`;
    return `${v}（文字）`;
  };

  const ql = q.trim().toLowerCase();
  const props = db.properties.filter((p) => p.id !== propId && (!ql || p.name.toLowerCase().includes(ql)));
  const fns = FN_DOCS.filter((f) => !ql || (f.name + f.sig + f.desc).toLowerCase().includes(ql));
  const cats = Array.from(new Set(fns.map((f) => f.cat)));

  return (
    <Modal onClose={close} width={760} className="formula-modal">
      <div className="fx">
        <div className="fx-head">
          <PropIcon type="formula" size={16} />
          <span className="strong">編輯公式 · {prop.name}</span>
          <span className="spacer" />
          <button className="btn-icon" onClick={close}><Icon.x size={16} /></button>
        </div>
        <textarea
          ref={ta}
          id="formula-src"
          className="fx-input"
          spellCheck={false}
          autoFocus
          value={src}
          placeholder={'輸入公式，例如：prop("價格") * prop("數量")'}
          onChange={(e) => setSrc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
          }}
        />
        <div className={'fx-result' + (result && !result.ok ? ' err' : '')}>
          {!src.trim() ? (
            <span className="muted">從右側點選屬性或函式插入，或試試範例：
              {EXAMPLES.map((ex) => <button key={ex.label} className="btn-chip" onClick={() => setSrc(ex.src([]))}>{ex.label}</button>)}
            </span>
          ) : !previewRow ? (
            <span className="muted">新增一筆資料後即可預覽結果。</span>
          ) : result!.ok ? (
            <span><span className="muted">預覽：</span>{describe(result!.value)}</span>
          ) : (
            <span>⚠ {result!.error}</span>
          )}
          {rows.length > 1 && src.trim() && (
            <select className="select-sm fx-row-pick" value={previewRow?.id} onChange={(e) => setPreviewId(e.target.value)} aria-label="預覽的資料列">
              {rows.slice(0, 200).map((r) => <option key={r.id} value={r.id}>{r.title || '未命名'}</option>)}
            </select>
          )}
        </div>
        <div className="fx-body">
          <div className="fx-list">
            <input className="input sm" placeholder="搜尋屬性或函式…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="fx-scroll">
              {props.length > 0 && <div className="menu-header">屬性</div>}
              {props.map((p) => (
                <div key={p.id} className="menu-item" onClick={() => insert(`prop("${p.name}")`)}
                  onMouseEnter={() => setHover({ cat: '屬性', name: p.name, sig: `prop("${p.name}")`, desc: `${propTypeLabel(p.type)}屬性。點擊插入。`, ex: `prop("${p.name}")` })}>
                  <span className="menu-icon"><PropIcon type={p.type} /></span>
                  <span className="menu-label">{p.name}</span>
                </div>
              ))}
              {cats.map((c) => (
                <React.Fragment key={c}>
                  <div className="menu-header">{c}</div>
                  {fns.filter((f) => f.cat === c).map((f) => (
                    <div key={f.name} className={'menu-item' + (hover?.name === f.name ? ' active' : '')}
                      onMouseEnter={() => setHover(f)}
                      onClick={() => (f.name === 'prop' ? insert('prop("")', 2) : insert(`${f.name}()`, 1))}>
                      <span className="menu-icon mono small">ƒ</span>
                      <span className="menu-label mono">{f.name}</span>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="fx-doc">
            {hover && (
              <>
                <div className="strong mono">{hover.name}</div>
                <div className="fx-sig mono">{hover.sig}</div>
                <p>{hover.desc}</p>
                <div className="muted small">範例</div>
                <pre className="fx-ex mono" onClick={() => insert(hover.ex)} title="點擊插入">{hover.ex}</pre>
              </>
            )}
            <div className="fx-tips muted small">
              <div>運算：<code>+ - * / % ^</code>，比較：<code>== != &gt; &lt; &gt;= &lt;=</code>，邏輯：<code>and or not</code>，條件：<code>條件 ? 是 : 否</code></div>
              <div>文字用雙引號包起來：<code>"已完成"</code>；也可以用方法寫法：<code>prop("標籤").length()</code></div>
            </div>
          </div>
        </div>
        <div className="fx-foot">
          <span className="muted small">Ctrl + Enter 儲存</span>
          <span className="spacer" />
          <button className="btn-outline sm" onClick={close}>取消</button>
          <button className="btn-primary sm" onClick={save}>完成</button>
        </div>
      </div>
    </Modal>
  );
}
