import React, { useState } from 'react';
import { connectDrive, connectFile, disableEncryption, disconnect, enableEncryption, reconnect, syncNow, unlock, useSyncStatus } from '../sync/engine';
import { fileSyncSupported } from '../sync/fileSync';
import { askConfirm, askPassword, setUI, toast, useUI } from '../ui';
import { Modal } from './Popover';
import { formatDateTime, timeAgo } from '../utils';
import { Icon } from './Icons';

const STATE_TEXT: Record<string, string> = {
  off: '未開啟同步',
  syncing: '同步中…',
  synced: '已同步',
  'needs-auth': '需要重新連線',
  locked: '需要輸入密碼',
  error: '同步失敗',
  offline: '離線中',
};

export function SyncIndicator() {
  const s = useSyncStatus();
  const color = s.state === 'synced' ? 'var(--c-green)' : s.state === 'error' || s.state === 'needs-auth' || s.state === 'locked' ? 'var(--red)' : 'var(--text-3)';
  const text = s.state === 'synced' && s.lastSync ? `已同步 · ${timeAgo(s.lastSync)}` : STATE_TEXT[s.state];
  return (
    <div className="sb-item muted sync-indicator" title={s.label ? `同步到：${s.label}` : '設定同步'}
      onClick={() => {
        if (s.state === 'needs-auth') void reconnect();
        else if (s.state === 'locked') void promptUnlock();
        else setUI({ settings: true, settingsTab: 'sync' });
      }}>
      <span className="sb-icon" style={{ color }}>{s.encrypted ? <Icon.lock size={15} /> : <Icon.cloud size={16} />}</span>
      <span className="sb-label">{s.state === 'needs-auth' ? '點擊重新連線同步' : s.state === 'locked' ? '點擊輸入同步密碼' : text}</span>
    </div>
  );
}

export function SyncSettings() {
  const s = useSyncStatus();
  const [clientId, setClientId] = useState(s.clientId || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(!s.clientId);
  const origin = window.location.origin;

  const run = async (fn: () => Promise<void>) => {
    setErr('');
    setBusy(true);
    try { await fn(); } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <h3>同步</h3>
      <div className={'sync-status st-' + s.state}>
        <Icon.cloud size={18} />
        <div className="grow">
          <div className="strong">{STATE_TEXT[s.state]}{s.label ? ` · ${s.label}` : ''}{s.encrypted ? ' · 已加密' : ''}</div>
          <div className="muted small">
            {s.lastSync ? `上次同步：${formatDateTime(s.lastSync)}` : '開啟同步後，你在任何裝置上的變更都會自動合併到同一份雲端檔案。'}
          </div>
          {s.error && <div className="small danger-text" style={{ marginTop: 4 }}>{s.error}</div>}
        </div>
        {s.kind && s.state === 'needs-auth' && <button className="btn-primary sm" disabled={busy} onClick={() => run(reconnect)}>重新連線</button>}
        {s.kind && s.state === 'locked' && <button className="btn-primary sm" onClick={() => void promptUnlock()}>輸入密碼</button>}
        {s.kind && s.state !== 'needs-auth' && s.state !== 'locked' && <button className="btn-outline sm" disabled={busy || s.state === 'syncing'} onClick={() => run(syncNow)}>立即同步</button>}
        {s.kind && <button className="btn-ghost sm danger" onClick={() => run(disconnect)}>停止同步</button>}
      </div>
      {err && <div className="sync-error">{err}</div>}

      <div className="sync-option">
        <div className="sync-option-head">
          <span className="sync-badge">方式一 · 建議</span>
          <div className="strong">Google 雲端硬碟（網頁連線）</div>
          <div className="muted small">電腦、手機、平板都能用。工作區會存成你雲端硬碟中的「Lumen 筆記工作區.json」，Lumen 只能存取它自己建立的這個檔案。</div>
        </div>
        <label className="muted small" htmlFor="sync-client-id">Google OAuth 用戶端 ID</label>
        <div className="sync-row">
          <input id="sync-client-id" className="input" placeholder="例如 1234567890-abc.apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <button className="btn-primary" disabled={busy || !clientId.trim()} onClick={() => run(() => connectDrive(clientId))}>
            {s.kind === 'drive' ? '重新連線' : '連線 Google 雲端硬碟'}
          </button>
        </div>
        <button className="btn-ghost sm muted" onClick={() => setHelp((h) => !h)}>
          <Icon.chevronRight size={12} style={{ transform: help ? 'rotate(90deg)' : undefined }} /> 如何取得用戶端 ID（只需設定一次，約 5 分鐘）
        </button>
        {help && (
          <ol className="sync-help">
            <li>前往 <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>，用你的 Google 帳號登入，建立一個新專案（名稱隨意，例如 Lumen）。</li>
            <li>到「API 和服務 → 程式庫」，搜尋 <b>Google Drive API</b> 並按「啟用」。</li>
            <li>到「API 和服務 → OAuth 同意畫面」：使用者類型選「外部」，填入應用程式名稱與你的電子郵件，其他保持預設。在「測試使用者」加入你自己的 Gmail。</li>
            <li>到「API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID」，應用程式類型選「網頁應用程式」。</li>
            <li>在「已授權的 JavaScript 來源」加入這個網址：<code className="copyable" onClick={() => { navigator.clipboard?.writeText(origin).then(() => toast('已複製'), () => {}); }}>{origin}</code>（點擊複製）。若你在多個網址使用 Lumen（例如 GitHub Pages 和本機），每個都要加入。</li>
            <li>按「建立」，複製畫面上的「用戶端 ID」，貼到上方欄位，按「連線 Google 雲端硬碟」，在彈出視窗中選擇你的帳號並允許存取。</li>
            <li>在其他裝置上開啟同一個 Lumen 網址，貼上同一個用戶端 ID 並連線，就會自動合併成同一份資料。</li>
          </ol>
        )}
        {window.self !== window.top && <div className="muted small" style={{ marginTop: 6 }}>注意：在預覽框架內無法登入 Google，請在獨立的網址（例如 GitHub Pages）開啟 Lumen 後再連線。</div>}
      </div>

      <div className="sync-option">
        <div className="sync-option-head">
          <span className="sync-badge">方式二 · 免設定</span>
          <div className="strong">電腦上的 Google 雲端硬碟資料夾</div>
          <div className="muted small">若電腦已安裝「Google 雲端硬碟電腦版」，把工作區檔案存在「Google 雲端硬碟」資料夾中，就會由它自動上傳同步。僅支援電腦版 Chrome 或 Edge。</div>
        </div>
        {fileSyncSupported() ? (
          <div className="sync-row">
            <button className="btn-outline" disabled={busy} onClick={() => run(() => connectFile(true))}>建立新的同步檔案…</button>
            <button className="btn-outline" disabled={busy} onClick={() => run(() => connectFile(false))}>開啟現有的同步檔案…</button>
          </div>
        ) : (
          <div className="muted small">目前的瀏覽器不支援直接讀寫檔案。請改用電腦版 Chrome 或 Edge，或使用方式一。</div>
        )}
      </div>

      <EncryptionSettings />

      <div className="muted small" style={{ marginTop: 16, lineHeight: 1.6 }}>
        同步方式：每個頁面與資料庫各自保留最後修改的版本，所以兩台裝置編輯不同頁面時都會保留；若同時編輯同一頁面，以較晚儲存的為準。永久刪除的頁面也會在其他裝置上刪除。
      </div>
    </>
  );
}

/* ---------------- password dialog ---------------- */
export function PasswordDialog() {
  const req = useUI((u) => u.password);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const close = (v: string | null) => {
    setUI({ password: null });
    setPw(''); setPw2(''); setErr(''); setShow(false);
    req.resolve(v);
  };
  const submit = async () => {
    setErr('');
    if (req.confirm) {
      if (pw.length < 8) { setErr('密碼至少需要 8 個字元。'); return; }
      if (pw !== pw2) { setErr('兩次輸入的密碼不一致。'); return; }
    } else if (!pw) return;
    if (req.check) {
      setBusy(true);
      const e = await req.check(pw);
      setBusy(false);
      if (e) { setErr(e); return; }
    }
    close(pw);
  };
  return (
    <Modal onClose={() => !busy && close(null)} width={380} className="confirm-modal">
      <form className="pw-dialog" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="pw-title"><Icon.lock size={16} /> {req.title}</div>
        <div className="muted small pw-msg">{req.message}</div>
        <input id="pw-1" className="input" type={show ? 'text' : 'password'} autoFocus autoComplete={req.confirm ? 'new-password' : 'current-password'}
          placeholder={req.confirm ? '新密碼（至少 8 個字元）' : '密碼'} value={pw} onChange={(e) => setPw(e.target.value)} />
        {req.confirm && (
          <input id="pw-2" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="再輸入一次" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        )}
        <label className="muted small pw-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> 顯示密碼</label>
        {err && <div className="sync-error">{err}</div>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? '處理中…' : req.action}</button>
        <button type="button" className="btn-outline" disabled={busy} onClick={() => close(null)}>取消</button>
      </form>
    </Modal>
  );
}

/** shared flow: ask for the password and unlock the encrypted cloud file */
export async function promptUnlock() {
  await askPassword({
    title: '輸入同步密碼',
    message: '雲端的工作區已加密。請輸入設定加密時使用的密碼，此裝置會記住它。',
    action: '解鎖並同步',
    check: async (pw) => {
      try { await unlock(pw); return null; } catch (e: any) { return e?.wrongPassword ? '密碼不正確，請再試一次。' : (e?.message || String(e)); }
    },
  });
}

export function EncryptionSettings() {
  const s = useSyncStatus();
  const setOrChange = async (change: boolean) => {
    await askPassword({
      title: change ? '變更加密密碼' : '開啟加密',
      message: change
        ? '雲端檔案會改用新密碼重新加密。其他裝置下次同步時需要輸入新密碼。'
        : '上傳前會用這個密碼加密整個工作區。請務必記住它：忘記密碼就無法讀取雲端資料（本機資料不受影響）。',
      action: change ? '變更密碼' : '開啟加密',
      confirm: true,
      check: async (pw) => {
        try { await enableEncryption(pw); toast(change ? '已變更加密密碼' : '已開啟加密'); return null; } catch (e: any) { return e?.message || String(e); }
      },
    });
  };
  return (
    <div className="sync-option">
      <div className="sync-option-head">
        <span className={'sync-badge' + (s.encrypted ? ' on' : '')}>{s.encrypted ? '已開啟' : '未開啟'}</span>
        <div className="strong"><Icon.lock size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> 端對端加密</div>
        <div className="muted small">開啟後，上傳到雲端的檔案會先用你的密碼加密（AES-256-GCM）。Google 或任何拿到檔案的人都無法讀取內容。密碼不會上傳，只有你的裝置知道。</div>
      </div>
      {!s.kind ? (
        <div className="muted small">請先在上方選擇同步方式。</div>
      ) : s.state === 'locked' ? (
        <div className="sync-row"><button className="btn-primary" onClick={() => void promptUnlock()}>輸入密碼以解鎖</button></div>
      ) : s.encrypted ? (
        <div className="sync-row">
          <button className="btn-outline" onClick={() => void setOrChange(true)}>變更密碼</button>
          <button className="btn-ghost sm danger" onClick={async () => {
            if (await askConfirm('關閉加密後，雲端檔案會改以未加密的形式儲存。確定嗎？', '關閉加密')) { await disableEncryption(); toast('已關閉加密'); }
          }}>關閉加密</button>
        </div>
      ) : (
        <div className="sync-row"><button className="btn-primary" onClick={() => void setOrChange(false)}>開啟加密…</button></div>
      )}
      <div className="muted small">注意：加密只保護雲端檔案。此瀏覽器中的資料仍未加密，請保護好你的裝置。</div>
    </div>
  );
}
