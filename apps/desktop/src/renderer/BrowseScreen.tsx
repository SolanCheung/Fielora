import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toBrowserUserMessage } from '../browser-policy';
import type { BrowserPageState } from '../browser-types';
import type { FieloraBridge } from '../types';
import { PrimaryNav } from './PrimaryNav';

const EMPTY_BROWSER: BrowserPageState = {
  active_page_id: '',
  pages: [],
  url: '',
  title: '新页面',
  favicon_data_url: null,
  can_go_back: false,
  can_go_forward: false,
  is_loading: false,
  error: null,
  surface: {
    app_view: 'NOT_BROWSE',
    attached: false,
    visible: false,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  },
};

interface BrowseScreenProps {
  browser: FieloraBridge['browser'];
  onSaveToLibrary: FieloraBridge['library']['saveWeb'];
  onOpenBrowserSettings: () => void;
  onProjects: () => void;
  onNow: () => void;
  onFields: () => void;
  onNewConversation: () => void;
  onSettings: () => void;
}

export function BrowsePanel({ browser, onSaveToLibrary, onOpenBrowserSettings }: Pick<BrowseScreenProps, 'browser' | 'onSaveToLibrary' | 'onOpenBrowserSettings'>) {
  const [page, setPage] = useState<BrowserPageState>(EMPTY_BROWSER);
  const [address, setAddress] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const editingAddress = useRef(false);
  const activePageIdRef = useRef('');

  useEffect(() => {
    void browser.getState().then((state) => {
      activePageIdRef.current = state.active_page_id;
      setPage(state);
      setAddress(state.url);
    }).catch((reason) => setActionError(toBrowserUserMessage(reason)));
    return browser.subscribe((state) => {
      activePageIdRef.current = state.active_page_id;
      setPage(state);
      if (!editingAddress.current) setAddress(state.url);
    });
  }, [browser]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (menuOpen) {
      void browser.hide();
      return;
    }
    let settleTimer = 0;
    const syncBounds = () => {
      const rect = host.getBoundingClientRect();
      void browser.show({
        x: Math.max(0, Math.round(rect.left)),
        y: Math.max(0, Math.round(rect.top)),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      }).then((state) => {
        setPage(state);
        if (!editingAddress.current) setAddress(state.url);
      }).catch((reason) => setActionError(toBrowserUserMessage(reason)));
    };
    const syncAfterWindowResize = () => {
      syncBounds();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncBounds, 50);
    };
    const observer = new window.ResizeObserver(syncBounds);
    observer.observe(host);
    window.addEventListener('resize', syncAfterWindowResize);
    syncBounds();
    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', syncAfterWindowResize);
      void browser.hide();
    };
  }, [browser, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void browser.reload();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
        event.preventDefault();
        void createPage();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        void closePage(activePageIdRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [browser]);

  async function navigate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError('');
    editingAddress.current = false;
    try {
      const state = await browser.navigate({ url: address });
      setPage(state);
      setAddress(state.url);
    } catch (reason) {
      setActionError(toBrowserUserMessage(reason));
    }
  }

  async function act(action: () => Promise<BrowserPageState>) {
    setActionError('');
    try { setPage(await action()); }
    catch (reason) { setActionError(toBrowserUserMessage(reason)); }
  }

  async function saveToLibrary() {
    setMenuOpen(false);
    setActionError(''); setActionStatus('');
    try {
      await onSaveToLibrary({ url: page.url, title: page.title || page.url, source: 'BROWSER', selected_content: null, metadata: { version: 1 } });
      setActionStatus('已保存到资料库');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function createPage() {
    editingAddress.current = false;
    setActionError('');
    try {
      const state = await browser.createPage();
      setPage(state);
      setAddress(state.url);
      window.requestAnimationFrame(() => addressRef.current?.focus());
    } catch (reason) {
      setActionError(toBrowserUserMessage(reason));
    }
  }

  async function switchPage(pageId: string) {
    editingAddress.current = false;
    setActionError('');
    try {
      const state = await browser.switchPage({ page_id: pageId });
      setPage(state);
      setAddress(state.url);
    } catch (reason) {
      setActionError(toBrowserUserMessage(reason));
    }
  }

  async function closePage(pageId: string) {
    if (!pageId) return;
    editingAddress.current = false;
    setActionError('');
    try {
      const state = await browser.closePage({ page_id: pageId });
      setPage(state);
      setAddress(state.url);
      if (!state.url) window.requestAnimationFrame(() => addressRef.current?.focus());
    } catch (reason) {
      setActionError(toBrowserUserMessage(reason));
    }
  }

  return <div className="browse-panel" data-testid="browse-screen">
    <main className="browse-content">
      <div className="browser-page-strip">
        <div className="browser-pages" role="tablist" aria-label="Browse 页面">
          {page.pages.map((item) => <div
            className={`browser-page ${item.id === page.active_page_id ? 'active' : ''}`}
            key={item.id}
            data-loading={item.is_loading ? 'true' : 'false'}
            onContextMenu={(event) => { event.preventDefault(); void act(() => browser.showPageContextMenu({ page_id: item.id })); }}
          >
            <button
              className="browser-page-main"
              role="tab"
              aria-selected={item.id === page.active_page_id}
              title={item.title || item.url || '新页面'}
              onClick={() => void switchPage(item.id)}
              data-testid={`browser-page-${item.id}`}
            >
              <span className="browser-page-visual" aria-hidden="true">
                {item.is_loading
                  ? <span className="browser-page-loader" />
                  : item.favicon_data_url
                    ? <img src={item.favicon_data_url} alt="" />
                    : <span className="browser-page-fallback" />}
              </span>
              <span className="browser-page-label">{item.title || '新页面'}</span>
            </button>
            <button className="browser-page-close" aria-label={`关闭 ${item.title || '新页面'}`} onClick={() => void closePage(item.id)} data-testid={`browser-close-page-${item.id}`}>×</button>
          </div>)}
        </div>
        <button className="browser-new-page" aria-label="新建页面" title="新建页面 (Ctrl+T)" onClick={() => void createPage()} data-testid="browser-new-page">+</button>
      </div>
      <div className="browser-toolbar">
        <div className="browser-actions" aria-label="页面导航">
          <button aria-label="后退" data-testid="browser-back" disabled={!page.can_go_back} onClick={() => void act(() => browser.back())}>←</button>
          <button aria-label="前进" data-testid="browser-forward" disabled={!page.can_go_forward} onClick={() => void act(() => browser.forward())}>→</button>
          <button
            aria-label="刷新"
            aria-busy={page.is_loading}
            title="刷新 (Ctrl+R)"
            data-testid="browser-reload"
            disabled={!page.url}
            onClick={() => void act(() => browser.reload())}
          >↻</button>
        </div>
        <form className="address-form" onSubmit={navigate}>
          <input
            ref={addressRef}
            value={address}
            onChange={(event) => { editingAddress.current = true; setAddress(event.target.value); }}
            onFocus={() => { editingAddress.current = true; }}
            onBlur={() => { editingAddress.current = false; if (!address.trim()) setAddress(page.url); }}
            aria-label="网址"
            placeholder="输入网址，例如 example.com"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="browser-address"
          />
        </form>
        <div className="browser-toolbar-end" ref={menuRef}>
          <span className="page-title" title={page.title}>{page.title}</span>
          <button className="browser-overflow-button" type="button" aria-label="浏览器菜单" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)} data-testid="browser-overflow">⋮</button>
          {menuOpen && <div className="browser-overflow-menu" role="menu" aria-label="浏览器菜单" data-testid="browser-overflow-menu">
            <div className="browser-menu-group">
              <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); void createPage(); }}><span>新建标签页</span><kbd>Ctrl+T</kbd></button>
              <button role="menuitem" type="button" disabled={!/^https?:\/\//u.test(page.url)} onClick={() => void saveToLibrary()} data-testid="browser-save-library"><span>保存到资料库</span></button>
            </div>
            <div className="browser-menu-group">
              <button role="menuitem" type="button" disabled={!page.url} onClick={() => { setMenuOpen(false); void act(() => browser.reload()); }}><span>刷新页面</span><kbd>Ctrl+R</kbd></button>
              <button role="menuitem" type="button" disabled={!page.active_page_id} onClick={() => { setMenuOpen(false); void closePage(page.active_page_id); }}><span>关闭标签页</span><kbd>Ctrl+W</kbd></button>
            </div>
            <div className="browser-menu-group browser-menu-settings">
              <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onOpenBrowserSettings(); }} data-testid="browser-open-settings"><span>浏览器设置</span></button>
            </div>
          </div>}
        </div>
        <span className="sr-only" role="status" aria-live="polite">{page.is_loading ? '网页正在加载' : ''}</span>
        {page.is_loading && <div className="browser-loading" role="progressbar" aria-label="网页正在加载" data-testid="browser-loading"><span /></div>}
      </div>
      {(actionError || page.error) && <div className="browser-error" role="status" data-testid="browser-error">{actionError || toBrowserUserMessage(page.error)}</div>}
      {actionStatus && <div className="browser-status" role="status">{actionStatus}</div>}
      <div className="browse-viewport" ref={hostRef} data-testid="browse-viewport" aria-busy={page.is_loading}>
        {!page.url && <div className="browse-empty"><h2>新页面</h2><p>在地址栏输入网址或搜索内容。</p></div>}
      </div>
    </main>
  </div>;
}

export function BrowseScreen({ browser, onSaveToLibrary, onOpenBrowserSettings, onProjects, onNow, onFields, onNewConversation, onSettings }: BrowseScreenProps) {
  return <div className="shell browse-shell">
    <PrimaryNav active="BROWSE" onProjects={onProjects} onNow={onNow} onBrowse={() => undefined} onFields={onFields} onNewConversation={onNewConversation} onSettings={onSettings} />
    <BrowsePanel browser={browser} onSaveToLibrary={onSaveToLibrary} onOpenBrowserSettings={onOpenBrowserSettings} />
  </div>;
}
