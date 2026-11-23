import React from 'react';

type P = { size?: number; className?: string; style?: React.CSSProperties };
const mk = (path: React.ReactNode, vb = '0 0 20 20') => ({ size = 16, className, style }: P) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" className={'icon ' + (className || '')} style={style} aria-hidden>
    {path}
  </svg>
);

export const Icon = {
  search: mk(<><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></>),
  home: mk(<><path d="M3 9l7-6 7 6v8a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z" /></>),
  settings: mk(<><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>),
  plus: mk(<path d="M10 4v12M4 10h12" />),
  trash: mk(<><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" /></>),
  chevronRight: mk(<path d="M8 5l5 5-5 5" />),
  chevronDown: mk(<path d="M5 8l5 5 5-5" />),
  chevronLeft: mk(<path d="M12 5l-5 5 5 5" />),
  chevronsLeft: mk(<><path d="M10 5l-5 5 5 5" /><path d="M15 5l-5 5 5 5" /></>),
  menu: mk(<path d="M3 5h14M3 10h14M3 15h14" />),
  more: mk(<><circle cx="4.5" cy="10" r="1" fill="currentColor" /><circle cx="10" cy="10" r="1" fill="currentColor" /><circle cx="15.5" cy="10" r="1" fill="currentColor" /></>),
  star: mk(<path d="M10 2.8l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8l5-.7z" />),
  starFilled: ({ size = 16, className }: P) => (
    <svg width={size} height={size} viewBox="0 0 20 20" className={'icon ' + (className || '')} aria-hidden>
      <path d="M10 2.8l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8l5-.7z" fill="#f5c518" stroke="#e0b000" strokeWidth={1} />
    </svg>
  ),
  comment: mk(<path d="M4 4h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />),
  page: mk(<><path d="M5 2.5h7l3.5 3.5v11.5h-10.5z" /><path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5" /></>),
  drag: ({ size = 14 }: P) => (
    <svg width={size * 0.7} height={size} viewBox="0 0 10 16" aria-hidden className="icon">
      {[3, 8, 13].map((y) => <React.Fragment key={y}><circle cx="2.5" cy={y} r="1.3" fill="currentColor" /><circle cx="7.5" cy={y} r="1.3" fill="currentColor" /></React.Fragment>)}
    </svg>
  ),
  template: mk(<><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M8 8v9" /></>),
  import: mk(<><path d="M10 3v9M6 8l4 4 4-4" /><path d="M4 14v2.5h12V14" /></>),
  export: mk(<><path d="M10 12V3M6 7l4-4 4 4" /><path d="M4 14v2.5h12V14" /></>),
  clock: mk(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>),
  check: mk(<path d="M4 10.5l4 4 8-9" />),
  x: mk(<path d="M5 5l10 10M15 5L5 15" />),
  table: mk(<><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M3 12h14M8 8v8" /></>),
  board: mk(<><rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8" y="4" width="4" height="8" rx="1" /><rect x="13" y="4" width="4" height="10" rx="1" /></>),
  list: mk(<><path d="M7 5h10M7 10h10M7 15h10" /><circle cx="3.5" cy="5" r=".8" fill="currentColor" /><circle cx="3.5" cy="10" r=".8" fill="currentColor" /><circle cx="3.5" cy="15" r=".8" fill="currentColor" /></>),
  gallery: mk(<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>),
  calendar: mk(<><rect x="3" y="4.5" width="14" height="12.5" rx="1.5" /><path d="M3 8.5h14M7 3v3M13 3v3" /></>),
  filter: mk(<path d="M3 5h14M6 10h8M8.5 15h3" />),
  sort: mk(<><path d="M6 4v12M3 13l3 3 3-3" /><path d="M14 16V4M11 7l3-3 3 3" /></>),
  link: mk(<><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" /></>),
  copy: mk(<><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" /></>),
  edit: mk(<><path d="M13.5 3.5l3 3L7 16H4v-3z" /></>),
  arrowUpRight: mk(<path d="M7 13l6-6M8 7h5v5" />),
  expand: mk(<><path d="M11 3h6v6M9 17H3v-6M17 3l-6 6M3 17l6-6" /></>),
  lock: mk(<><rect x="4" y="9" width="12" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>),
  unlock: mk(<><rect x="4" y="9" width="12" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 5.8-1" /></>),
  move: mk(<><path d="M4 10h12M12 6l4 4-4 4" /></>),
  eye: mk(<><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.3" /></>),
  eyeOff: mk(<><path d="M3 3l14 14M8 5a8 8 0 0 1 2-.5C15 4.5 18 10 18 10a14 14 0 0 1-2.2 2.8M5.5 6.5A14 14 0 0 0 2 10s3 5.5 8 5.5a7.7 7.7 0 0 0 3.5-.8" /></>),
  image: mk(<><rect x="3" y="4" width="14" height="12" rx="1.5" /><circle cx="7.5" cy="8.5" r="1.3" /><path d="M3 14l4-4 3 3 2-2 5 5" /></>),
  smile: mk(<><circle cx="10" cy="10" r="7" /><path d="M7 12s1 1.5 3 1.5 3-1.5 3-1.5" /><circle cx="7.6" cy="8" r=".6" fill="currentColor" /><circle cx="12.4" cy="8" r=".6" fill="currentColor" /></>),
  sun: mk(<><circle cx="10" cy="10" r="3.2" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>),
  moon: mk(<path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" />),
  text: mk(<path d="M4 5h12M10 5v11" />),
  hash: mk(<path d="M7 3l-1.5 14M14.5 3L13 17M3.5 7.5h14M2.5 12.5h14" />),
  number: mk(<><path d="M5 6l2-1.5V15M4.5 15h5M12 7a2 2 0 1 1 3.5 1.3L12 15h4.5" /></>),
  select: mk(<><circle cx="10" cy="10" r="7" /><path d="M7 9l3 3 3-3" /></>),
  multi: mk(<><path d="M7 5h10M7 10h10M7 15h10" /><path d="M2.5 5l1 1 1.5-2M2.5 10l1 1 1.5-2M2.5 15l1 1 1.5-2" /></>),
  status: mk(<><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" /></>),
  checkbox: mk(<><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M6.5 10l2.5 2.5 4.5-5" /></>),
  at: mk(<><circle cx="10" cy="10" r="3" /><path d="M13 7v4a2 2 0 0 0 4 0v-1a7 7 0 1 0-3 5.7" /></>),
  phone: mk(<path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A13.5 13.5 0 0 1 3.5 4.5 1.5 1.5 0 0 1 5 3z" />),
  history: mk(<><path d="M3 10a7 7 0 1 0 2-4.9" /><path d="M3 3v3.5h3.5M10 6.5V10l2.5 1.5" /></>),
  font: mk(<path d="M4 16l5-12h2l5 12M6.5 11.5h7" />),
  width: mk(<path d="M2.5 10h15M5.5 7l-3 3 3 3M14.5 7l3 3-3 3" />),
  undo: mk(<><path d="M5 8h8a4 4 0 0 1 0 8H8" /><path d="M8 5L5 8l3 3" /></>),
  sidebar: mk(<><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M8 4v12" /></>),
  duplicate: mk(<><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13" /></>),
  database: mk(<><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></>),
  inbox: mk(<><path d="M3 11l2-7h10l2 7v5H3z" /><path d="M3 11h4l1 2h4l1-2h4" /></>),
};
