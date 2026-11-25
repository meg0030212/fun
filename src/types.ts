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
  dateFormat?: 'full' | 'short' | 'slash' | 'iso' | 'relative' | 'roc' | 'roc-slash';
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
  /** calendar: other databases whose dated rows also show here */
  calLinks?: PlannerSource[];
  /** calendar: colour, visibility and tag field of this database's own rows */
  calSelf?: { color?: string; hidden?: boolean; tagProp?: string };
  /** calendar: hide times such as 13:30 */
  calHideTime?: boolean;
  /** calendar (month): split each day into slots such as 上午／下午／晚上 */
  calSlotMode?: 'none' | 'custom';
  calSlots?: { id: string; label: string; time?: string }[];
  /** calendar: hide the quick tag bar */
  calHideTagBar?: boolean;
  /** calendar: source new quick tags go to ('self' = this database) */
  calTagTo?: string;
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
  /** year display: Gregorian or Republic of China (民國) */
  era?: 'gregorian' | 'roc';
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
  /** time: optional "HH:mm-HH:mm" the slot covers (used to place and add events) */
  slots?: { id: string; label: string; time?: string }[];
  startHour?: number;
  endHour?: number;
  step?: 30 | 60;
  /** legacy single database link (migrated into planner sources) */
  dbId?: string;
  /** month / slots / schedule: which planner sources to show (undefined = all) */
  sourceIds?: string[];
  /** month / slots / schedule: hide event times such as 13:30 */
  hideTime?: boolean;
  /** month: hide the quick tag bar above the calendar */
  hideTagBar?: boolean;
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
  /** content height in pixels set by dragging the corner (undefined = fit content) */
  hp?: number;
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
  /** linked databases whose dated rows appear in the planner */
  sources?: PlannerSource[];
  /** source that new events are added to */
  addTo?: string;
  /** source that new quick tags are created in (default: addTo) */
  tagTo?: string;
}

/** a database linked into a planner, optionally narrowed by filters (e.g. 類別 是 工作) */
export interface PlannerSource {
  id: string;
  dbId: string;
  name?: string;
  color: string;
  filters: Filter[];
  /** date property to place rows by (default: first date property) */
  dateProp?: string;
  /** select / multi-select property used as tags (colours the events, quick-add on the calendar); 'none' = off */
  tagProp?: string;
  hidden?: boolean;
}

export interface PlannerTemplate {
  id: string;
  name: string;
  icon: string;
  desc?: string;
  period: PlannerPeriod;
  widgets: PlannerWidget[];
  style: PlannerStyle;
  /** linked data sources carried by a user template */
  sources?: PlannerSource[];
  builtin?: boolean;
}
