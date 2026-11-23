import type { Block, Database, Page, Property, View } from './types';
import { makePage, makeProp, makeView, newBlock, update, getState } from './store';
import { toISODate, uid } from './utils';

const b = (type: Block['type'], html = '', extra: Partial<Block> = {}) => newBlock(type, { html, ...extra });

function nextSort(parentId: string | null) {
  const sib = Object.values(getState().pages).filter((p) => p.parentId === parentId && !p.rowOf);
  return sib.length ? Math.max(...sib.map((s) => s.sort)) + 1 : 0;
}

function createSimple(parentId: string | null, p: Partial<Page>): string {
  const page = makePage({ parentId, sort: nextSort(parentId), ...p });
  update((d) => {
    d.pages[page.id] = page;
    if (parentId && d.pages[parentId]) d.pages[parentId].blocks.push(newBlock('page', { pageId: page.id }));
  });
  return page.id;
}

function createDb(parentId: string | null, title: string, icon: string, props: Property[], views: View[], rows: { title: string; icon?: string; props: Record<string, any> }[], cover?: string): string {
  const pageId = uid();
  const db: Database = { id: uid(), title, properties: props, views, activeView: views[0].id, hostPageId: pageId, inline: false };
  const page = makePage({ id: pageId, title, icon, parentId, dbId: db.id, blocks: [], sort: nextSort(parentId), cover });
  update((d) => {
    d.dbs[db.id] = db;
    d.pages[pageId] = page;
    rows.forEach((r, i) => {
      const rp = makePage({ title: r.title, icon: r.icon, rowOf: db.id, props: r.props, sort: i });
      d.pages[rp.id] = rp;
    });
    if (parentId && d.pages[parentId]) d.pages[parentId].blocks.push(newBlock('page', { pageId }));
  });
  return pageId;
}

export interface Template {
  key: string;
  name: string;
  icon: string;
  desc: string;
  category: string;
  create: (parentId: string | null) => string;
}

export const TEMPLATES: Template[] = [
  {
    key: 'todo', name: '待辦清單', icon: '✅', category: '個人', desc: '簡單的待辦事項清單，追蹤每日任務。',
    create: (pid) => createSimple(pid, {
      title: '待辦清單', icon: '✅',
      blocks: [
        b('callout', '把今天要完成的事情列出來，完成後勾選。', { icon: '📌', color: 'yellow_bg' }),
        b('h2', '今天'), b('todo', '回覆重要郵件'), b('todo', '完成報告初稿'), b('todo', '運動 30 分鐘'),
        b('h2', '本週'), b('todo', '規劃下週行程'), b('todo', '整理桌面與檔案'),
        b('h2', '之後'), b('todo', '學習新技能'), b('text'),
      ],
    }),
  },
  {
    key: 'meeting', name: '會議記錄', icon: '📝', category: '工作', desc: '結構化的會議記錄，包含議程、決議與待辦事項。',
    create: (pid) => createSimple(pid, {
      title: `會議記錄 ${toISODate(new Date())}`, icon: '📝',
      blocks: [
        b('text', '<b>日期：</b>' + toISODate(new Date())), b('text', '<b>參與者：</b>'),
        b('h2', '📋 議程'), b('numbered', ''), b('h2', '💬 討論內容'), b('bulleted', ''),
        b('h2', '✅ 決議事項'), b('bulleted', ''), b('h2', '🎯 待辦事項'), b('todo', ''), b('text'),
      ],
    }),
  },
  {
    key: 'journal', name: '日記', icon: '📔', category: '個人', desc: '記錄每天的心情、感恩與反思。',
    create: (pid) => createSimple(pid, {
      title: `日記 ${toISODate(new Date())}`, icon: '📔', cover: 'linear-gradient(120deg, #fccb90 0%, #d57eeb 100%)',
      blocks: [
        b('callout', '今天的心情：😊', { icon: '🌤️', color: 'orange_bg' }),
        b('h2', '🙏 感恩的三件事'), b('numbered', ''), b('numbered', ''), b('numbered', ''),
        b('h2', '✨ 今天的亮點'), b('text', ''), b('h2', '💭 反思'), b('text', ''),
        b('h2', '🎯 明天的目標'), b('todo', ''), b('text'),
      ],
    }),
  },
  {
    key: 'weekly', name: '週計畫', icon: '🗓️', category: '個人', desc: '以週為單位規劃每日任務。',
    create: (pid) => createSimple(pid, {
      title: '週計畫', icon: '🗓️',
      blocks: [
        b('h2', '🎯 本週目標'), b('todo', ''),
        ...['週一', '週二', '週三', '週四', '週五', '週末'].flatMap((d) => [b('toggle', `<b>${d}</b>`), b('todo', '', { indent: 1 })]),
        b('h2', '📝 回顧'), b('text', ''),
      ],
    }),
  },
  {
    key: 'project', name: '專案看板', icon: '🚀', category: '工作', desc: '以看板管理專案任務與進度。',
    create: (pid) => {
      const status = makeProp('status', '狀態');
      status.options = [
        { id: uid(), name: '待處理', color: 'gray' }, { id: uid(), name: '進行中', color: 'blue' },
        { id: uid(), name: '審核中', color: 'purple' }, { id: uid(), name: '已完成', color: 'green' },
      ];
      const owner = makeProp('text', '負責人');
      const due = makeProp('date', '截止日期');
      const pri = makeProp('select', '優先順序', { options: [{ id: uid(), name: 'P0', color: 'red' }, { id: uid(), name: 'P1', color: 'orange' }, { id: uid(), name: 'P2', color: 'gray' }] });
      const props = [makeProp('title', '任務'), status, owner, due, pri];
      const board = makeView('board', { properties: props }, '看板');
      board.groupBy = status.id;
      const table = makeView('table', { properties: props }, '全部');
      const cal = makeView('calendar', { properties: props }, '時程');
      cal.dateProp = due.id;
      const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
      const s = status.options!;
      return createDb(pid, '專案看板', '🚀', props, [board, table, cal], [
        { title: '需求訪談', icon: '🎤', props: { [status.id]: s[3].id, [owner.id]: '小明', [due.id]: day(-3), [pri.id]: pri.options![1].id } },
        { title: '撰寫規格文件', icon: '📄', props: { [status.id]: s[2].id, [owner.id]: '小華', [due.id]: day(1), [pri.id]: pri.options![0].id } },
        { title: '設計 UI', icon: '🎨', props: { [status.id]: s[1].id, [owner.id]: '小美', [due.id]: day(4), [pri.id]: pri.options![1].id } },
        { title: '開發後端 API', icon: '⚙️', props: { [status.id]: s[0].id, [owner.id]: '阿強', [due.id]: day(8), [pri.id]: pri.options![0].id } },
        { title: '測試與上線', icon: '✈️', props: { [status.id]: s[0].id, [due.id]: day(14), [pri.id]: pri.options![2].id } },
      ], 'linear-gradient(120deg, #667eea 0%, #764ba2 100%)');
    },
  },
  {
    key: 'reading', name: '閱讀清單', icon: '📚', category: '個人', desc: '以畫廊追蹤想讀、在讀與讀完的書。',
    create: (pid) => {
      const author = makeProp('text', '作者');
      const status = makeProp('status', '狀態');
      status.options = [{ id: uid(), name: '想讀', color: 'gray' }, { id: uid(), name: '閱讀中', color: 'yellow' }, { id: uid(), name: '已讀完', color: 'green' }];
      const genre = makeProp('multi_select', '類型', { options: [{ id: uid(), name: '小說', color: 'purple' }, { id: uid(), name: '商業', color: 'blue' }, { id: uid(), name: '科普', color: 'green' }, { id: uid(), name: '歷史', color: 'brown' }] });
      const rating = makeProp('select', '評分', { options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'].map((n) => ({ id: uid(), name: n, color: 'yellow' })) });
      const props = [makeProp('title', '書名'), author, status, genre, rating];
      const gal = makeView('gallery', { properties: props }, '書架');
      gal.cardPreview = 'cover';
      const board = makeView('board', { properties: props }, '依狀態');
      board.groupBy = status.id;
      const covers = ['linear-gradient(160deg,#f6d365,#fda085)', 'linear-gradient(160deg,#84fab0,#8fd3f4)', 'linear-gradient(160deg,#a18cd1,#fbc2eb)', 'linear-gradient(160deg,#30cfd0,#330867)'];
      const books = [
        ['百年孤寂', '馬奎斯', 2, [0], 4], ['原子習慣', '詹姆斯．克利爾', 1, [1], 3], ['人類大歷史', '哈拉瑞', 0, [3, 2], -1], ['三體', '劉慈欣', 2, [0, 2], 4],
      ] as const;
      const id = createDb(pid, '閱讀清單', '📚', props, [gal, board], books.map(([t, a, st, g, r]) => ({
        title: t, icon: '📖', props: { [author.id]: a, [status.id]: status.options![st].id, [genre.id]: g.map((i) => genre.options![i].id), [rating.id]: r >= 0 ? rating.options![r].id : undefined },
      })));
      // add covers
      update((d) => {
        const rows = Object.values(d.pages).filter((p) => p.rowOf === d.pages[id].dbId);
        rows.forEach((r, i) => (r.cover = covers[i % covers.length]));
      }, 'silent');
      return id;
    },
  },
  {
    key: 'habit', name: '習慣追蹤', icon: '🌱', category: '個人', desc: '每天打卡，養成好習慣。',
    create: (pid) => {
      const date = makeProp('date', '日期');
      const ex = makeProp('checkbox', '運動');
      const rd = makeProp('checkbox', '閱讀');
      const md = makeProp('checkbox', '冥想');
      const water = makeProp('number', '喝水 (杯)');
      const props = [makeProp('title', '日期名稱'), date, ex, rd, md, water];
      const table = makeView('table', { properties: props }, '每日');
      table.calcs = { [ex.id]: 'percent_checked', [rd.id]: 'percent_checked', [md.id]: 'percent_checked', [water.id]: 'avg' };
      table.sorts = [{ propId: date.id, dir: 'desc' }];
      const rows = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return { title: `${d.getMonth() + 1}/${d.getDate()}`, props: { [date.id]: toISODate(d), [ex.id]: i % 2 === 0, [rd.id]: i !== 3, [md.id]: i % 3 === 0, [water.id]: 5 + (i % 4) } };
      });
      return createDb(pid, '習慣追蹤', '🌱', props, [table, makeView('calendar', { properties: props }, '月曆')], rows);
    },
  },
  {
    key: 'wiki', name: '團隊知識庫', icon: '🏛️', category: '工作', desc: '集中整理團隊的文件與規範。',
    create: (pid) => createSimple(pid, {
      title: '團隊知識庫', icon: '🏛️', cover: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      blocks: [
        b('callout', '歡迎來到團隊知識庫！在這裡可以找到所有重要的資訊。', { icon: '👋', color: 'blue_bg' }),
        b('toc'),
        b('h2', '🧭 新人指南'), b('bulleted', '公司介紹'), b('bulleted', '開發環境設定'), b('bulleted', '溝通工具與流程'),
        b('h2', '📐 規範'), b('bulleted', '程式碼風格'), b('bulleted', '設計規範'), b('bulleted', '文件撰寫原則'),
        b('h2', '❓ 常見問題'), b('toggle', '如何申請休假？', { collapsed: true }), b('text', '請透過人資系統提出申請。', { indent: 1 }),
        b('toggle', '如何取得系統權限？', { collapsed: true }), b('text', '請聯絡 IT 部門。', { indent: 1 }), b('text'),
      ],
    }),
  },
];
