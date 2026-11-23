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
  rowOf?: string; // database row
  props?: Record<string, any>;
  sort: number;
}

export type PropType =
  | 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'status'
  | 'date' | 'checkbox' | 'url' | 'email' | 'phone'
  | 'created_time' | 'last_edited_time';

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
}
