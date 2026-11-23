import type { Block, Database, Page, State } from './types';
import { uid, toISODate } from './utils';

function b(type: Block['type'], html = '', extra: Partial<Block> = {}): Block {
  const blk: Block = { id: uid(), type, html, indent: 0, ...extra };
  if (type === 'todo' && blk.checked === undefined) blk.checked = false;
  return blk;
}

function page(p: Partial<Page>): Page {
  const now = Date.now();
  return { id: uid(), title: '', parentId: null, blocks: [], createdAt: now, updatedAt: now, comments: [], sort: 0, ...p };
}

export function seedState(): State {
  const welcomeId = uid();
  const tasksPageId = uid();
  const notesId = uid();
  const journalId = uid();

  // Tasks database
  const optTodo = uid(), optDoing = uid(), optDone = uid();
  const tagWork = uid(), tagHome = uid(), tagUrgent = uid();
  const pTitle = uid(), pStatus = uid(), pDate = uid(), pTags = uid(), pPri = uid(), pDone = uid();
  const prHigh = uid(), prMid = uid(), prLow = uid();
  const vBoard = uid(), vTable = uid(), vCal = uid();
  const tasksDb: Database = {
    id: uid(),
    title: '任務清單',
    hostPageId: tasksPageId,
    inline: false,
    properties: [
      { id: pTitle, name: '名稱', type: 'title' },
      { id: pStatus, name: '狀態', type: 'status', options: [
        { id: optTodo, name: '未開始', color: 'gray' },
        { id: optDoing, name: '進行中', color: 'blue' },
        { id: optDone, name: '已完成', color: 'green' },
      ] },
      { id: pPri, name: '優先順序', type: 'select', options: [
        { id: prHigh, name: '高', color: 'red' },
        { id: prMid, name: '中', color: 'yellow' },
        { id: prLow, name: '低', color: 'gray' },
      ] },
      { id: pDate, name: '截止日期', type: 'date' },
      { id: pTags, name: '標籤', type: 'multi_select', options: [
        { id: tagWork, name: '工作', color: 'blue' },
        { id: tagHome, name: '生活', color: 'green' },
        { id: tagUrgent, name: '緊急', color: 'red' },
      ] },
      { id: pDone, name: '已確認', type: 'checkbox' },
    ],
    views: [
      { id: vBoard, name: '看板', type: 'board', groupBy: pStatus, filters: [], sorts: [], hidden: [], widths: {} },
      { id: vTable, name: '所有任務', type: 'table', filters: [], sorts: [], hidden: [], widths: { [pTitle]: 260 }, calcs: {} },
      { id: vCal, name: '行事曆', type: 'calendar', dateProp: pDate, filters: [], sorts: [], hidden: [], widths: {} },
    ],
    activeView: vBoard,
  };
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
  const rows: Page[] = [
    ['設計首頁草圖', optDoing, prHigh, day(1), [tagWork], '🎨'],
    ['準備季度報告', optTodo, prHigh, day(3), [tagWork, tagUrgent], '📊'],
    ['買菜', optTodo, prLow, day(0), [tagHome], '🛒'],
    ['整理書桌', optDone, prLow, day(-2), [tagHome], '🧹'],
    ['回覆客戶郵件', optDone, prMid, day(-1), [tagWork], '✉️'],
    ['規劃週末旅行', optTodo, prMid, day(6), [tagHome], '🧳'],
  ].map(([title, st, pri, date, tags, icon], i) => page({
    title: title as string, icon: icon as string, rowOf: tasksDb.id, sort: i,
    props: { [pStatus]: st, [pPri]: pri, [pDate]: date, [pTags]: tags, [pDone]: st === optDone },
    blocks: [b('text', '在這裡寫下任務的細節…')],
  }));

  const welcome = page({
    id: welcomeId, title: '歡迎使用 Lumen', icon: '👋', sort: 0,
    cover: 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)',
    blocks: [
      b('callout', 'Lumen 是一個全功能的筆記與知識管理工作區。所有資料都儲存在你的瀏覽器中。', { icon: '💡', color: 'blue_bg' }),
      b('h2', '基本操作'),
      b('todo', '點擊任何地方開始輸入'),
      b('todo', '輸入 <code>/</code> 開啟指令選單，插入標題、清單、資料庫、圖片等區塊'),
      b('todo', '選取文字以顯示<b>格式工具列</b>：<b>粗體</b>、<i>斜體</i>、<u>底線</u>、<s>刪除線</s>、<code>程式碼</code>、<span class="c-red">顏色</span>、連結'),
      b('todo', '將滑鼠移到區塊左側，拖曳 <b>⋮⋮</b> 來重新排列區塊', { checked: true }),
      b('todo', '輸入 <code>@</code> 提及其他頁面或日期'),
      b('h2', 'Markdown 快捷鍵'),
      b('bulleted', '<code>#</code>、<code>##</code>、<code>###</code> + 空白 → 標題'),
      b('bulleted', '<code>-</code> 或 <code>*</code> + 空白 → 項目符號清單'),
      b('bulleted', '<code>1.</code> + 空白 → 編號清單'),
      b('bulleted', '<code>[]</code> + 空白 → 待辦清單'),
      b('bulleted', '<code>&gt;</code> + 空白 → 切換清單，<code>"</code> + 空白 → 引言'),
      b('bulleted', '<code>```</code> → 程式碼區塊，<code>---</code> → 分隔線'),
      b('bulleted', '<code>**粗體**</code>、<code>*斜體*</code>、<code>`程式碼`</code>、<code>~~刪除線~~</code>'),
      b('h2', '鍵盤快速鍵'),
      b('toggle', '展開查看所有快速鍵', { collapsed: true }),
      b('bulleted', '<b>Ctrl/⌘ + K</b>：搜尋', { indent: 1 }),
      b('bulleted', '<b>Ctrl/⌘ + \\</b>：顯示/隱藏側邊欄', { indent: 1 }),
      b('bulleted', '<b>Ctrl/⌘ + Shift + L</b>：切換深色模式', { indent: 1 }),
      b('bulleted', '<b>Ctrl/⌘ + Z / Shift + Z</b>：復原 / 重做', { indent: 1 }),
      b('bulleted', '<b>Tab / Shift + Tab</b>：縮排 / 取消縮排', { indent: 1 }),
      b('bulleted', '<b>Esc</b>：選取目前區塊，接著可按 Delete 刪除或 Ctrl+D 複製', { indent: 1 }),
      b('bulleted', '<b>Ctrl/⌘ + E</b>：行內程式碼，<b>Ctrl/⌘ + Shift + S</b>：刪除線，<b>Ctrl/⌘ + K</b>（選取文字時）：連結', { indent: 1 }),
      b('h2', '更多範例'),
      b('page', '', { pageId: tasksPageId }),
      b('page', '', { pageId: notesId }),
      b('quote', '「最好的整理方式，就是讓一切都有它的位置。」'),
      b('divider'),
      b('code', 'function hello(name) {\n  return `你好，${name}！`;\n}', { lang: 'javascript' }),
      b('equation', 'E = mc^2'),
      b('text'),
    ],
  });

  const tasksPage = page({ id: tasksPageId, title: '任務清單', icon: '✅', parentId: welcomeId, dbId: tasksDb.id, sort: 0 });

  const notes = page({
    id: notesId, title: '會議記錄', icon: '📝', parentId: welcomeId, sort: 1,
    blocks: [
      b('toc'),
      b('h1', '產品週會'),
      b('text', '<b>日期：</b>' + toISODate(new Date())),
      b('h2', '議程'),
      b('numbered', '回顧上週進度'),
      b('numbered', '討論新功能需求'),
      b('numbered', '子項目示範', { indent: 1 }),
      b('numbered', '指派下週任務'),
      b('h2', '待辦事項'),
      b('todo', '更新產品路線圖'),
      b('todo', '寄送會議摘要', { checked: true }),
      b('h2', '資料'),
      b('table', '', { rows: [['項目', '負責人', '進度'], ['首頁改版', '小明', '80%'], ['行動版', '小華', '45%']], headerRow: true }),
      b('text'),
    ],
  });

  const journal = page({
    id: journalId, title: '個人日誌', icon: '📔', sort: 1,
    blocks: [b('h2', '今天的想法'), b('text', '今天天氣很好，適合整理思緒。'), b('text')],
  });

  const pages: Record<string, Page> = {};
  [welcome, tasksPage, notes, journal, ...rows].forEach((p) => (pages[p.id] = p));
  welcome.favorite = true;

  return {
    pages,
    dbs: { [tasksDb.id]: tasksDb },
    settings: { theme: 'system', workspaceName: '我的工作區', userName: '我', sidebarWidth: 240, sidebarOpen: true },
    recent: [welcomeId],
  };
}
