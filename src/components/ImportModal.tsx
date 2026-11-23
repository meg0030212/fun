import React, { useState } from 'react';
import { importNotionZip, ImportReport } from '../importNotion';
import { navigate, setUI, toast } from '../ui';
import { pickFile } from '../utils';
import { Modal } from './Popover';
import { Icon } from './Icons';
import { importMarkdown } from './Sidebar';

export function ImportModal() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const close = () => !busy && setUI({ importer: false });

  const fromNotion = async () => {
    const f = await pickFile('.zip,application/zip');
    if (!f) return;
    setErr(''); setReport(null); setBusy(true);
    try {
      const r = await importNotionZip(f, null);
      setReport(r);
      toast(`已從 Notion 匯入 ${r.pages + r.rows} 個頁面`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close} width={600} className="import-modal">
      <div className="import">
        <div className="import-head">
          <div className="strong" style={{ fontSize: 16 }}>匯入</div>
          <button className="btn-icon" onClick={close}><Icon.x size={16} /></button>
        </div>

        <div className="sync-option">
          <div className="sync-option-head">
            <span className="sync-badge">推薦</span>
            <div className="strong">從 Notion 匯入</div>
            <div className="muted small">保留頁面層級、子頁面、資料庫（欄位、選項、日期、核取方塊）、待辦、標註、表格、程式碼、圖片與頁面連結。</div>
          </div>
          <ol className="sync-help">
            <li>在 Notion 左側欄點「設定」→「一般」（或「工作區」）→「匯出所有工作區內容」。只想匯出某一頁：在該頁右上角「⋯」→「匯出」。</li>
            <li>匯出格式選 <b>Markdown &amp; CSV</b>，勾選「包含子頁面」與「為子頁面建立資料夾」，內容選「全部」。</li>
            <li>Notion 會下載一個 <b>.zip</b> 檔（大型工作區會寄到你的電子郵件）。<b>不需要解壓縮</b>，直接在下方選擇這個 zip 檔。</li>
          </ol>
          <div className="sync-row">
            <button className="btn-primary" disabled={busy} onClick={() => void fromNotion()}>{busy ? '匯入中，請稍候…' : '選擇 Notion 匯出的 .zip 檔'}</button>
          </div>
          {err && <div className="sync-error">{err}</div>}
          {report && (
            <div className="import-report">
              <div className="strong">匯入完成</div>
              <div className="small">頁面 {report.pages} 個 · 資料庫 {report.databases} 個（共 {report.rows} 筆資料）· 圖片 {report.images} 張</div>
              {report.warnings.map((w) => <div key={w} className="small danger-text">{w}</div>)}
              <div className="sync-row" style={{ marginTop: 6 }}>
                {report.rootIds.slice(0, 1).map((id) => (
                  <button key={id} className="btn-outline sm" onClick={() => { setUI({ importer: false }); navigate(id); }}>開啟匯入的頁面</button>
                ))}
              </div>
            </div>
          )}
          <div className="muted small">匯入的頁面會放在側邊欄「私人」的最下方。公式、關聯、彙總欄位會以文字匯入；留言、頁面歷史與權限不會匯入。</div>
        </div>

        <div className="sync-option">
          <div className="sync-option-head">
            <div className="strong">Markdown 檔案（.md）</div>
            <div className="muted small">匯入單一 Markdown 或文字檔為新頁面。</div>
          </div>
          <div className="sync-row"><button className="btn-outline" disabled={busy} onClick={() => { setUI({ importer: false }); void importMarkdown(null); }}>選擇 .md 檔</button></div>
        </div>

        <div className="sync-option">
          <div className="sync-option-head">
            <div className="strong">Lumen 備份（.json）</div>
            <div className="muted small">還原先前從 Lumen 匯出的完整工作區（包含加密備份）。</div>
          </div>
          <div className="sync-row"><button className="btn-outline" disabled={busy} onClick={() => setUI({ importer: false, settings: true, settingsTab: 'data' })}>前往資料與備份</button></div>
        </div>
      </div>
    </Modal>
  );
}
