import React, { useEffect } from 'react';
import { redo, undo, updateSettings, useStore, visitPage, getState } from './store';
import { setUI, toast, useUI } from './ui';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { PageView } from './components/PageView';
import { CommentsPanel, ConfirmDialog, Home, PeekModal, SearchModal, SettingsModal, TemplatesModal, Toast } from './components/Panels';
import { FormatToolbar } from './components/FormatToolbar';
import { PasswordDialog } from './components/SyncPanel';
import { ImportModal } from './components/ImportModal';

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  const route = useUI((u) => u.route);
  const peek = useUI((u) => u.peek);
  const search = useUI((u) => u.search);
  const settings = useUI((u) => u.settings);
  const templates = useUI((u) => u.templates);
  const importer = useUI((u) => u.importer);
  const comments = useUI((u) => u.comments);
  const sidebarOpen = useStore((s) => s.settings.sidebarOpen);
  const page = useStore((s) => s.pages[route]);

  // on narrow screens the sidebar is an overlay: start closed and close after navigating
  useEffect(() => {
    if (window.innerWidth < 700 && getState().settings.sidebarOpen) updateSettings({ sidebarOpen: false });
  }, [route]);

  useEffect(() => {
    if (route !== 'home' && page) {
      visitPage(route);
      document.title = `${page.icon && !/^(https?:|data:)/.test(page.icon) ? page.icon + ' ' : ''}${page.title || '未命名'} · Lumen`;
    } else document.title = 'Lumen 筆記';
  }, [route, page?.title, page?.icon]); // eslint-disable-line

  useEffect(() => {
    const onToast = (e: Event) => toast((e as CustomEvent).detail);
    window.addEventListener('lumen:toast', onToast);
    return () => window.removeEventListener('lumen:toast', onToast);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const ae = document.activeElement as HTMLElement | null;
      const inInput = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if ((k === 'k' || k === 'p') && !e.shiftKey) {
        if (k === 'k' && ae?.isContentEditable && !window.getSelection()?.isCollapsed) return;
        e.preventDefault();
        setUI({ search: true });
      } else if (k === '\\') {
        e.preventDefault();
        updateSettings({ sidebarOpen: !getState().settings.sidebarOpen });
      } else if (k === 'l' && e.shiftKey) {
        e.preventDefault();
        const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        updateSettings({ theme: t });
      } else if (k === 'z' && !inInput) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (k === 'y' && !inInput) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      {sidebarOpen && <Sidebar />}
      {sidebarOpen && <div className="sb-backdrop" onClick={() => updateSettings({ sidebarOpen: false })} />}
      <main className="main">
        <Topbar />
        <div className="main-row">
          <div className="page-scroller" key={route}>
            {route === 'home' ? <Home /> : <PageView pageId={route} />}
          </div>
          {comments && route !== 'home' && <CommentsPanel pageId={route} />}
        </div>
      </main>
      {peek && <PeekModal id={peek} />}
      {search && <SearchModal />}
      {settings && <SettingsModal />}
      {templates && <TemplatesModal />}
      {importer && <ImportModal />}
      <FormatToolbar />
      <ConfirmDialog />
      <PasswordDialog />
      <Toast />
    </div>
  );
}
