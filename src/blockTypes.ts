import type { BlockType, ViewType } from './types';

export interface SlashItem {
  key: string;
  label: string;
  desc: string;
  thumb: string;
  section: string;
  keywords: string;
  type?: BlockType;
  extra?: Record<string, any>;
  special?: 'page' | 'inline-db' | 'page-db' | 'date-today' | 'mention' | 'planner';
  view?: ViewType;
}

export const SLASH_ITEMS: SlashItem[] = [
  { key: 'text', label: '文字', desc: '開始以純文字撰寫。', thumb: 'Aa', section: '基本區塊', keywords: 'text plain paragraph wenzi 文字 段落', type: 'text' },
  { key: 'page', label: '頁面', desc: '在此頁面內嵌入子頁面。', thumb: '📄', section: '基本區塊', keywords: 'page subpage yemian 頁面 子頁面', special: 'page' },
  { key: 'todo', label: '待辦清單', desc: '用待辦清單追蹤任務。', thumb: '☑', section: '基本區塊', keywords: 'todo to-do checkbox task 待辦 核取', type: 'todo' },
  { key: 'h1', label: '標題 1', desc: '大型區段標題。', thumb: 'H1', section: '基本區塊', keywords: 'h1 heading title 標題 大標', type: 'h1' },
  { key: 'h2', label: '標題 2', desc: '中型區段標題。', thumb: 'H2', section: '基本區塊', keywords: 'h2 heading subtitle 標題', type: 'h2' },
  { key: 'h3', label: '標題 3', desc: '小型區段標題。', thumb: 'H3', section: '基本區塊', keywords: 'h3 heading 標題', type: 'h3' },
  { key: 'table', label: '表格', desc: '在頁面中新增簡單表格。', thumb: '▦', section: '基本區塊', keywords: 'table simple grid 表格', type: 'table' },
  { key: 'bulleted', label: '項目符號清單', desc: '建立簡單的項目符號清單。', thumb: '•', section: '基本區塊', keywords: 'bullet list ul unordered 清單 項目', type: 'bulleted' },
  { key: 'numbered', label: '編號清單', desc: '建立有編號的清單。', thumb: '1.', section: '基本區塊', keywords: 'numbered list ol ordered 編號 清單', type: 'numbered' },
  { key: 'toggle', label: '切換清單', desc: '可隱藏或顯示內部內容。', thumb: '▸', section: '基本區塊', keywords: 'toggle collapse fold 切換 折疊', type: 'toggle' },
  { key: 'quote', label: '引言', desc: '擷取引言。', thumb: '❝', section: '基本區塊', keywords: 'quote blockquote 引言 引用', type: 'quote' },
  { key: 'divider', label: '分隔線', desc: '在視覺上分隔區塊。', thumb: '—', section: '基本區塊', keywords: 'divider hr line separator 分隔', type: 'divider' },
  { key: 'callout', label: '標註', desc: '讓文字更醒目。', thumb: '💡', section: '基本區塊', keywords: 'callout note tip highlight 標註 提示', type: 'callout', extra: { color: 'gray_bg' } },
  { key: 'mention', label: '提及頁面', desc: '連結到工作區中的另一個頁面。', thumb: '↗', section: '基本區塊', keywords: 'link page mention 連結 提及', special: 'mention' },

  { key: 'image', label: '圖片', desc: '上傳或嵌入連結。', thumb: '🖼', section: '媒體', keywords: 'image picture photo img 圖片 照片', type: 'image' },
  { key: 'video', label: '影片', desc: '嵌入 YouTube 或 Vimeo 影片。', thumb: '▶', section: '媒體', keywords: 'video youtube vimeo 影片', type: 'video' },
  { key: 'bookmark', label: '網頁書籤', desc: '以視覺書籤呈現連結。', thumb: '🔖', section: '媒體', keywords: 'bookmark link url web 書籤', type: 'bookmark' },
  { key: 'embed', label: '嵌入', desc: '嵌入任何網頁內容。', thumb: '⧉', section: '媒體', keywords: 'embed iframe 嵌入', type: 'embed' },
  { key: 'code', label: '程式碼', desc: '擷取程式碼片段。', thumb: '</>', section: '媒體', keywords: 'code snippet pre 程式碼', type: 'code' },

  { key: 'db-table', label: '表格檢視', desc: '在此頁面新增內嵌資料庫（表格）。', thumb: '▤', section: '資料庫', keywords: 'database table inline 資料庫 表格', special: 'inline-db', view: 'table' },
  { key: 'db-board', label: '看板檢視', desc: '以看板呈現的內嵌資料庫。', thumb: '▥', section: '資料庫', keywords: 'database board kanban 看板 資料庫', special: 'inline-db', view: 'board' },
  { key: 'db-gallery', label: '畫廊檢視', desc: '以卡片網格呈現的內嵌資料庫。', thumb: '▦', section: '資料庫', keywords: 'database gallery cards 畫廊', special: 'inline-db', view: 'gallery' },
  { key: 'db-list', label: '清單檢視', desc: '簡潔清單形式的資料庫。', thumb: '☰', section: '資料庫', keywords: 'database list 清單 資料庫', special: 'inline-db', view: 'list' },
  { key: 'db-calendar', label: '行事曆檢視', desc: '以行事曆呈現的資料庫。', thumb: '📅', section: '資料庫', keywords: 'database calendar 行事曆 日曆', special: 'inline-db', view: 'calendar' },
  { key: 'db-page', label: '資料庫 - 整頁', desc: '新增整頁資料庫作為子頁面。', thumb: '🗃', section: '資料庫', keywords: 'database full page 資料庫 整頁', special: 'page-db', view: 'table' },

  { key: 'planner', label: '電子手帳', desc: '像紙本手帳的月／週／日計畫頁，可自由組合區塊。', thumb: '📔', section: '資料庫', keywords: 'planner calendar diary 手帳 行事曆 計畫 日誌 週計畫 月計畫', special: 'planner' },
  { key: 'toc', label: '目錄', desc: '顯示頁面的標題大綱。', thumb: '≣', section: '進階區塊', keywords: 'toc table of contents outline 目錄', type: 'toc' },
  { key: 'equation', label: '方程式區塊', desc: '使用 KaTeX 顯示數學公式。', thumb: 'Σ', section: '進階區塊', keywords: 'equation math latex katex formula 公式 方程式', type: 'equation' },
  { key: 'today', label: '今天日期', desc: '插入今天的日期。', thumb: '@', section: '行內', keywords: 'date today now 日期 今天', special: 'date-today' },
];

export function filterSlash(q: string): SlashItem[] {
  const query = q.trim().toLowerCase();
  if (!query) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => (i.label + ' ' + i.keywords).toLowerCase().includes(query));
}

export const TURN_INTO: { type: BlockType; label: string; thumb: string }[] = [
  { type: 'text', label: '文字', thumb: 'Aa' },
  { type: 'h1', label: '標題 1', thumb: 'H1' },
  { type: 'h2', label: '標題 2', thumb: 'H2' },
  { type: 'h3', label: '標題 3', thumb: 'H3' },
  { type: 'bulleted', label: '項目符號清單', thumb: '•' },
  { type: 'numbered', label: '編號清單', thumb: '1.' },
  { type: 'todo', label: '待辦清單', thumb: '☑' },
  { type: 'toggle', label: '切換清單', thumb: '▸' },
  { type: 'quote', label: '引言', thumb: '❝' },
  { type: 'callout', label: '標註', thumb: '💡' },
  { type: 'code', label: '程式碼', thumb: '</>' },
];

export const TEXT_TYPES: BlockType[] = ['text', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code'];
export const LIST_TYPES: BlockType[] = ['bulleted', 'numbered', 'todo', 'toggle'];

export const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  text: "輸入「/」以使用指令",
  h1: '標題 1', h2: '標題 2', h3: '標題 3',
  bulleted: '清單', numbered: '清單', todo: '待辦事項', toggle: '切換',
  quote: '空白引言', callout: '輸入一些文字…', code: '',
};
