import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { State } from '../types';
import { createPage, getState, isTrashed, patchPage, replaceState, updateSettings, useStore } from '../store';
import { askConfirm, askPassword, navigate, openPeek, setUI, toast, useUI } from '../ui';
import { decryptWithPassword, deriveKey, encryptJson, isEncrypted, newSalt } from '../sync/crypto';
import { downloadFile, formatDateTime, htmlToText, pickFile, readFileAsText, timeAgo, toISODate, uid } from '../utils';
import { Icon } from './Icons';
import { Modal } from './Popover';
import { PageIcon, coverStyle } from './EmojiPicker';
import { PageView } from './PageView';
import { ancestors } from './Topbar';
import { TEMPLATES } from '../templates';
import { seedState } from '../seed';
import { SyncSettings } from './SyncPanel';

/* ============================== SEARCH ============================== */
export function SearchModal() {
  const pages = useStore((s) => s.pages);
  const recent = useStore((s) => s.recent);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => setUI({ search: false });

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return recent.map((id) => pages[id]).filter((p) => p && !isTrashed(p.id)).slice(0, 12).map((p) => ({ page: p, snippet: '' }));
    }
    const out: { page: typeof pages[string]; snippet: string; score: number }[] = [];
    Object.values(pages).forEach((p) => {
      if (isTrashed(p.id)) return;
      const title = (p.title || '未命名').toLowerCase();
      let score = 0;
      let snippet = '';
      if (title.includes(query)) score = title.startsWith(query) ? 3 : 2;
      for (const b of p.blocks) {
        const t = b.type === 'code' ? b.html : htmlToText(b.html);
        const i = t.toLowerCase().indexOf(query);
        if (i >= 0) {
          snippet = (i > 20 ? '…' : '') + t.slice(Math.max(0, i - 20), i + query.length + 40);
          if (!score) score = 1;
          break;
        }
      }
      if (score) out.push({ page: p, snippet, score });
    });
    return out.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt).slice(0, 30);
  }, [q, pages, recent]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.search-item.active')?.scrollIntoView({ block: 'nearest' }); }, [idx]);

  const open = (id: string) => { close(); navigate(id); };
  const highlight = (text: string) => {
    const query = q.trim();
    if (!query) return text;
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
  };

  return (
    <Modal onClose={close} className="search-modal" width={620}>
      <div className="search-input-row">
        <Icon.search size={18} />
        <input autoFocus placeholder={`在 ${getState().settings.workspaceName} 中搜尋或提問…`} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (results[idx]) open(results[idx].page.id);
              else if (q.trim()) { const id = createPage({ title: q.trim() }); open(id); }
            }
          }} />
      </div>
      <div className="search-results" ref={listRef}>
        <div className="menu-header">{q.trim() ? '最佳結果' : '最近造訪'}</div>
        {results.map((r, i) => {
          const path = ancestors(r.page.id).slice(0, -1).map((p) => p.title || '未命名').join(' / ');
          return (
            <div key={r.page.id} className={'search-item' + (i === idx ? ' active' : '')} onMouseEnter={() => setIdx(i)} onClick={() => open(r.page.id)}>
              <PageIcon icon={r.page.icon} size={18} />
              <div className="search-text">
                <div className="search-title">{highlight(r.page.title || '未命名')}{path && <span className="search-path"> — {path}</span>}</div>
                {r.snippet && <div className="search-snippet">{highlight(r.snippet)}</div>}
              </div>
              <span className="search-time muted small">{timeAgo(r.page.updatedAt)}</span>
            </div>
          );
        })}
        {q.trim() && results.length === 0 && (
          <div className="search-item active" onClick={() => { const id = createPage({ title: q.trim() }); open(id); }}>
            <Icon.plus size={18} /><div className="search-text"><div className="search-title">新增頁面「{q.trim()}」</div></div>
          </div>
        )}
      </div>
      <div className="search-foot muted small"><span>↑↓ 選擇</span><span>↵ 開啟</span><span>Esc 關閉</span></div>
    </Modal>
  );
}

/* ============================== SETTINGS ============================== */
export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const pages = useStore((s) => s.pages);
  const initialTab = useUI((u) => u.settingsTab);
  const [tab, setTab] = useState<'account' | 'workspace' | 'appearance' | 'sync' | 'data' | 'shortcuts'>((initialTab as any) || 'account');
  const close = () => setUI({ settings: false, settingsTab: undefined });
  const size = useMemo(() => { try { return new Blob([JSON.stringify(getState())]).size; } catch { return 0; } }, [pages]);

  const exportAll = () => downloadFile(`lumen-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState(), null, 2), 'application/json');
  const exportEncrypted = async () => {
    const pw = await askPassword({
      title: '匯出加密備份', message: '備份檔會用這個密碼加密。還原時需要輸入同一個密碼，忘記就無法開啟。',
      action: '加密並下載', confirm: true,
    });
    if (!pw) return;
    const key = await deriveKey(pw, newSalt());
    const file = await encryptJson(JSON.stringify(getState()), key);
    downloadFile(`lumen-backup-encrypted-${toISODate(new Date())}.json`, JSON.stringify(file), 'application/json');
    toast('已匯出加密備份');
  };
  const importAll = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      let raw = JSON.parse(await readFileAsText(f));
      if (isEncrypted(raw)) {
        const enc = raw;
        let text: string | null = null;
        const pw = await askPassword({
          title: '開啟加密備份', message: '這個備份檔已加密，請輸入匯出時設定的密碼。', action: '解密',
          check: async (p) => { try { text = (await decryptWithPassword(enc, p)).text; return null; } catch { return '密碼不正確，請再試一次。'; } },
        });
        if (!pw || !text) return;
        raw = JSON.parse(text);
      }
      const s = raw as State;
      if (!s.pages || !s.dbs || !s.settings) throw new Error('bad');
      if (!(await askConfirm('匯入將取代目前所有資料，確定嗎？', '匯入並取代'))) return;
      replaceState(s);
      navigate('home');
      toast('已匯入工作區');
    } catch { toast('無法匯入：檔案不是有效的 Lumen 備份 JSON'); }
  };

  const tabs = [
    ['account', '我的帳號', <Icon.smile key="a" />], ['workspace', '工作區', <Icon.settings key="b" />], ['appearance', '外觀', <Icon.sun key="c" />], ['sync', '同步', <Icon.cloud key="s" />],
    ['data', '資料與備份', <Icon.database key="d" />], ['shortcuts', '鍵盤快速鍵', <Icon.text key="e" />],
  ] as const;

  return (
    <Modal onClose={close} className="settings-modal" width={900}>
      <div className="settings">
        <div className="settings-nav">
          <div className="menu-header">帳號</div>
          {tabs.map(([k, label, icon]) => (
            <div key={k} className={'sb-item' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><span className="sb-icon">{icon}</span><span className="sb-label">{label}</span></div>
          ))}
        </div>
        <div className="settings-body">
          {tab === 'account' && (
            <>
              <h3>我的個人資料</h3>
              <div className="set-row">
                <div className="ws-avatar xl">{(settings.userName || '我').slice(0, 1)}</div>
                <div className="grow">
                  <label className="muted small">偏好的名稱</label>
                  <input className="input" value={settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
                </div>
              </div>
            </>
          )}
          {tab === 'workspace' && (
            <>
              <h3>工作區設定</h3>
              <label className="muted small">名稱</label>
              <input className="input" value={settings.workspaceName} onChange={(e) => updateSettings({ workspaceName: e.target.value })} />
              <p className="muted small" style={{ marginTop: 12 }}>共 {Object.values(pages).filter((p) => !p.rowOf).length} 個頁面、{Object.keys(getState().dbs).length} 個資料庫。</p>
            </>
          )}
          {tab === 'appearance' && (
            <>
              <h3>外觀</h3>
              <div className="set-line">
                <div><div>主題</div><div className="muted small">自訂 Lumen 在你裝置上的外觀。</div></div>
                <select className="select-sm" value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as any })}>
                  <option value="system">使用系統設定</option><option value="light">淺色</option><option value="dark">深色</option>
                </select>
              </div>
              <div className="set-line">
                <div><div>年份顯示</div><div className="muted small">月曆、行事曆、手帳與日期的年份要用西元或民國。個別日期欄位也可在欄位選單另外設定。</div></div>
                <select className="select-sm" value={settings.era || 'gregorian'} onChange={(e) => updateSettings({ era: e.target.value as any })}>
                  <option value="gregorian">西元（2026年）</option><option value="roc">民國（民國115年）</option>
                </select>
              </div>
            </>
          )}
          {tab === 'sync' && <SyncSettings />}
          {tab === 'data' && (
            <>
              <h3>資料與備份</h3>
              <p className="muted small">所有資料都儲存在此瀏覽器的本機儲存空間中（目前約 {(size / 1024).toFixed(1)} KB）。建議定期匯出備份。</p>
              <div className="set-line">
                <div><div>匯出整個工作區</div><div className="muted small">下載包含所有頁面與資料庫的 JSON 檔案。</div></div>
                <span className="sync-row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn-outline sm" onClick={exportAll}>匯出</button>
                  <button className="btn-outline sm" onClick={() => void exportEncrypted()}>匯出（加密）</button>
                </span>
              </div>
              <div className="set-line">
                <div><div>從備份還原</div><div className="muted small">匯入先前匯出的 JSON 檔案，加密備份會要求輸入密碼（將取代目前資料）。</div></div>
                <button className="btn-outline sm" onClick={importAll}>匯入</button>
              </div>
              <div className="set-line">
                <div><div className="danger-text">重設工作區</div><div className="muted small">刪除所有資料並還原為範例內容。</div></div>
                <button className="btn-outline sm danger" onClick={async () => { if (await askConfirm('確定要刪除所有資料並還原為範例內容嗎？除非你有備份，否則無法復原。', '重設工作區')) { replaceState(seedState()); navigate('home'); } }}>重設</button>
              </div>
            </>
          )}
          {tab === 'shortcuts' && (
            <>
              <h3>鍵盤快速鍵</h3>
              <table className="shortcut-table">
                <tbody>
                  {[
                    ['Ctrl/⌘ + K 或 P', '搜尋'], ['Ctrl/⌘ + \\', '切換側邊欄'], ['Ctrl/⌘ + Shift + L', '切換深色模式'],
                    ['Ctrl/⌘ + Z', '復原'], ['Ctrl/⌘ + Shift + Z', '重做'], ['/', '開啟指令選單'], ['@', '提及頁面或日期'],
                    ['Ctrl/⌘ + B / I / U', '粗體 / 斜體 / 底線'], ['Ctrl/⌘ + E', '行內程式碼'], ['Ctrl/⌘ + Shift + S', '刪除線'],
                    ['Ctrl/⌘ + K（選取文字）', '加入連結'], ['Tab / Shift + Tab', '縮排 / 取消縮排'], ['Shift + Enter', '區塊內換行'],
                    ['Ctrl/⌘ + Enter', '勾選待辦 / 展開切換清單'], ['Ctrl/⌘ + D', '複製區塊'], ['Ctrl/⌘ + Shift + ↑/↓', '移動區塊'],
                    ['Ctrl/⌘ + Alt + 0~9', '轉換區塊類型'], ['Esc', '選取區塊'], ['Delete（選取區塊時）', '刪除區塊'],
                  ].map(([k, v]) => <tr key={k}><td><span className="kbd">{k}</span></td><td>{v}</td></tr>)}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ============================== TEMPLATES ============================== */
export function TemplatesModal() {
  const [sel, setSel] = useState(TEMPLATES[0].key);
  const t = TEMPLATES.find((x) => x.key === sel)!;
  const close = () => setUI({ templates: false });
  const cats = Array.from(new Set(TEMPLATES.map((x) => x.category)));
  return (
    <Modal onClose={close} className="templates-modal" width={760}>
      <div className="templates">
        <div className="tpl-list">
          <div className="strong" style={{ padding: '4px 8px 10px' }}>範本</div>
          {cats.map((c) => (
            <React.Fragment key={c}>
              <div className="menu-header">{c}</div>
              {TEMPLATES.filter((x) => x.category === c).map((x) => (
                <div key={x.key} className={'sb-item' + (x.key === sel ? ' active' : '')} onClick={() => setSel(x.key)}>
                  <span className="sb-icon">{x.icon}</span><span className="sb-label">{x.name}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="tpl-preview">
          <div style={{ fontSize: 56 }}>{t.icon}</div>
          <h2>{t.name}</h2>
          <p className="muted">{t.desc}</p>
          <button className="btn-primary" onClick={() => { const id = t.create(null); close(); navigate(id); toast(`已建立「${t.name}」`); }}>使用此範本</button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================== COMMENTS ============================== */
export function CommentsPanel({ pageId }: { pageId: string }) {
  const page = useStore((s) => s.pages[pageId]);
  const user = useStore((s) => s.settings.userName);
  const [text, setText] = useState('');
  if (!page) return null;
  const add = () => {
    if (!text.trim()) return;
    patchPage(page.id, { comments: [...page.comments, { id: uid(), text: text.trim(), author: user || '我', createdAt: Date.now() }] });
    setText('');
  };
  return (
    <aside className="comments-panel">
      <div className="cp-head">
        <span className="strong">留言</span>
        <span className="spacer" />
        <button className="btn-icon" onClick={() => setUI({ comments: false })}><Icon.x size={16} /></button>
      </div>
      <div className="cp-list">
        {page.comments.length === 0 && <div className="muted small cp-empty">尚無留言。在下方開始討論。</div>}
        {page.comments.map((c) => (
          <div key={c.id} className="comment">
            <div className="comment-head">
              <span className="ws-avatar sm">{c.author.slice(0, 1)}</span>
              <span className="strong">{c.author}</span>
              <span className="muted small" title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
              <span className="spacer" />
              <button className="btn-icon xs" title="刪除" onClick={() => patchPage(page.id, { comments: page.comments.filter((x) => x.id !== c.id) })}><Icon.trash size={13} /></button>
            </div>
            <div className="comment-text">{c.text}</div>
          </div>
        ))}
      </div>
      <div className="cp-input">
        <span className="ws-avatar sm">{(user || '我').slice(0, 1)}</span>
        <textarea className="input" rows={2} placeholder="新增留言…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button className="btn-primary sm" disabled={!text.trim()} onClick={add}>送出</button>
      </div>
    </aside>
  );
}

/* ============================== PEEK ============================== */
export function PeekModal({ id }: { id: string }) {
  const close = () => openPeek(null);
  return (
    <Modal onClose={close} className="peek-modal">
      <div className="peek-bar">
        <button className="btn-icon" title="以整頁開啟" onClick={() => navigate(id)}><Icon.expand size={15} /></button>
        <span className="spacer" />
        <button className="btn-icon" title="關閉" onClick={close}><Icon.x size={16} /></button>
      </div>
      <div className="page-scroller peek-scroller"><PageView pageId={id} peek /></div>
    </Modal>
  );
}

/* ============================== HOME ============================== */
export function Home() {
  const pages = useStore((s) => s.pages);
  const recent = useStore((s) => s.recent);
  const user = useStore((s) => s.settings.userName);
  const h = new Date().getHours();
  const greet = h < 5 ? '夜深了' : h < 12 ? '早安' : h < 18 ? '午安' : '晚安';
  const recentPages = recent.map((id) => pages[id]).filter((p) => p && !isTrashed(p.id)).slice(0, 10);
  const all = Object.values(pages).filter((p) => !p.rowOf && !isTrashed(p.id)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);

  const upcoming = useMemo(() => {
    const s = getState();
    const today = toISODate(new Date());
    const out: { page: typeof pages[string]; date: string }[] = [];
    Object.values(s.dbs).forEach((db) => {
      const dp = db.properties.find((p) => p.type === 'date');
      if (!dp) return;
      Object.values(pages).forEach((p) => {
        if (p.rowOf !== db.id || isTrashed(p.id)) return;
        const d = p.props?.[dp.id];
        if (typeof d === 'string' && (d.split('/')[1] || d) >= today) out.push({ page: p, date: d.split('/')[0] });
      });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [pages]);

  return (
    <div className="home">
      <h1 className="home-greet">{greet}{user && user !== '我' ? `，${user}` : ''}</h1>
      <section>
        <div className="home-sec-title"><Icon.clock size={14} /> 最近造訪</div>
        <div className="home-cards">
          {recentPages.map((p) => (
            <div key={p.id} className="home-card" onClick={() => navigate(p.id)}>
              <div className="home-card-cover" style={p.cover ? coverStyle(p.cover) : undefined} />
              <div className="home-card-icon"><PageIcon icon={p.icon} size={26} /></div>
              <div className="home-card-title">{p.title || '未命名'}</div>
              <div className="home-card-time muted small">{timeAgo(p.updatedAt)}</div>
            </div>
          ))}
          <div className="home-card new" onClick={() => { const id = createPage({}); navigate(id); }}>
            <Icon.plus size={22} /><div className="home-card-title">新增頁面</div>
          </div>
        </div>
      </section>
      <div className="home-grid">
        <section>
          <div className="home-sec-title"><Icon.calendar size={14} /> 即將到來</div>
          <div className="home-box">
            {upcoming.length === 0 && <div className="muted small" style={{ padding: 12 }}>沒有即將到來的項目。在資料庫中為項目設定日期即可顯示於此。</div>}
            {upcoming.map((u) => (
              <div key={u.page.id} className="home-row" onClick={() => openPeek(u.page.id)}>
                <span className="home-date">{u.date.slice(5, 10).replace('-', '/')}{u.date.includes('T') ? <span className="muted"> {u.date.slice(11, 16)}</span> : null}</span>
                <PageIcon icon={u.page.icon} size={15} /><span className="grow ellipsis">{u.page.title || '未命名'}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="home-sec-title"><Icon.page size={14} /> 最近編輯</div>
          <div className="home-box">
            {all.map((p) => (
              <div key={p.id} className="home-row" onClick={() => navigate(p.id)}>
                <PageIcon icon={p.icon} size={15} /><span className="grow ellipsis">{p.title || '未命名'}</span>
                <span className="muted small">{timeAgo(p.updatedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section>
        <div className="home-sec-title"><Icon.template size={14} /> 從範本開始</div>
        <div className="home-cards">
          {TEMPLATES.slice(0, 6).map((t) => (
            <div key={t.key} className="home-card tpl" onClick={() => { const id = t.create(null); navigate(id); }}>
              <div className="home-card-icon big">{t.icon}</div>
              <div className="home-card-title">{t.name}</div>
              <div className="muted small home-card-desc">{t.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ConfirmDialog() {
  const c = useUI((u) => u.confirm);
  if (!c) return null;
  const done = (ok: boolean) => { setUI({ confirm: null }); c.resolve(ok); };
  return (
    <Modal onClose={() => done(false)} width={340} className="confirm-modal">
      <div className="confirm-body">
        <div className="confirm-msg">{c.message}</div>
        <button className="btn-danger" autoFocus onClick={() => done(true)}>{c.action}</button>
        <button className="btn-outline" onClick={() => done(false)}>取消</button>
      </div>
    </Modal>
  );
}

export function Toast() {
  const msg = useUI((u) => u.toast);
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}
