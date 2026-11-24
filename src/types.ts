export type BlockType =
  | 'text' | 'h1' | 'h2' | 'h3'
  | 'bulleted' | 'numbered' | 'todo' | 'toggle'
  | 'quote' | 'callout' | 'divider' | 'code'
  | 'image' | 'page' | 'database' | 'bookmark' | 'embed' | 'video'
  | 'equation' | 'toc' | 'table';

export interface Block {
  id: string;
  type: BlockType;
  html: string;
  indent: number;
  checked?: boolean;
  collapsed?: boolean;
  color?: string; // 'red' | 'red_bg' ...
  icon?: string;
  lang?: string;
  url?: string;
  caption?: string;
  pageId?: string;
  dbId?: string;
  rows?: string[][];
  headerRow?: boolean;
  width?: number;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: number;
}

export type FontStyle = 'default' | 'serif' | 'mono';

export interface Page {
  id: string;
  title: string;
  icon?: string;
  cover?: string;
  parentId: string | null;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  trashed?: boolean;
  trashedAt?: number;
  fullWidth?: boolean;
  smallText?: boolean;
  font?: FontStyle;
  locked?: boolean;
  comments: Comment[];
  dbId?: string; // full-page database
  planner?: Planner; // digital planner page
  rowOf?: string; // database row
  props?: Record<string, any>;
  sort: number;
}

export type PropType =
  | 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'status'
  | 'date' | 'checkbox' | 'url' | 'email' | 'phone'
  | 'created_time' | 'last_edited_time' | 'formula';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
  numberFormat?: 'number' | 'percent' | 'dollar' | 'twd' | 'comma';
  dateFormat?: 'full' | 'short' | 'slash' | 'iso' | 'relative';
  timeFormat?: '24h' | '12h';
  /** date picker shortcuts: "HH:mm" or a slot "HH:mm-HH:mm" */
  quickTimes?: string[];
  /** formula source for type 'formula' */
  formula?: string;
}

export type ViewType = 'table' | 'board' | 'list' | 'gallery' | 'calendar';

export interface Filter {
  id: string;
  propId: string;
  op: string;
  value?: any;
}

export interface SortRule {
  propId: string;
  dir: 'asc' | 'desc';
}

export interface View {
  id: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: SortRule[];
  groupBy?: string;
  dateProp?: string;
  hidden: string[];
  widths: Record<string, number>;
  calcs?: Record<string, string>;
  /** calendar layout */
  calMode?: 'month' | 'week';
  cardPreview?: 'none' | 'cover' | 'content';
}

export interface Database {
  id: string;
  title: string;
  properties: Property[];
  views: View[];
  activeView: string;
  hostPageId: string;
  inline: boolean;
  updatedAt?: number;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  workspaceName: string;
  userName: string;
  sidebarWidth: number;
  sidebarOpen: boolean;
}

export interface State {
  pages: Record<string, Page>;
  dbs: Record<string, Database>;
  settings: Settings;
  recent: string[];
  /** ids of permanently deleted pages/databases → deletion time (used by sync) */
  deleted?: Record<string, number>;
  /** user-made planner layouts */
  plannerTemplates?: PlannerTemplate[];
  /** true while the workspace still holds only the untouched example content */
  pristine?: boolean;
}

/* ---------------- digital planner ---------------- */
export type PlannerPeriod = 'day' | 'week' | 'month';
export type WidgetType = 'notes' | 'list' | 'month' | 'slots' | 'schedule' | 'habit';

export interface WidgetOpts {
  /** list: bullet style */
  style?: 'check' | 'bullet' | 'number';
  /** slots: how a day is divided */
  slotMode?: 'custom' | 'hourly' | 'none';
  slots?: { id: string; label: string }[];
  startHour?: number;
  endHour?: number;
  step?: 30 | 60;
  /** month / slots / schedule: show events from this database */
  dbId?: string;
  /** habit tracker rows */
  habits?: { id: string; name: string }[];
}

export interface PlannerWidget {
  id: string;
  type: WidgetType;
  title: string;
  /** width in 12-column grid */
  w: number;
  /** height in grid rows */
  h: number;
  color?: string;
  opts?: WidgetOpts;
}

export interface PlannerStyle {
  paper: 'plain' | 'grid' | 'dots' | 'lined';
  accent: string;
  weekStart: 0 | 1;
}

export interface Planner {
  period: PlannerPeriod;
  widgets: PlannerWidget[];
  style: PlannerStyle;
  /** period key ("2026-11", week start "2026-11-23", day "2026-11-24") → widget id → content */
  entries: Record<string, Record<string, any>>;
}

export interface PlannerTemplate {
  id: string;
  name: string;
  icon: string;
  desc?: string;
  period: PlannerPeriod;
  widgets: PlannerWidget[];
  style: PlannerStyle;
  builtin?: boolean;
}
