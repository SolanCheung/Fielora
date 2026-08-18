import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AppView } from './view-state';
import { BrowsePanel } from './BrowseScreen';
import { ShellIcon } from './PrimaryNav';
import { ResizableDivider } from './ResizableDivider';

type ChromeMenu = 'FILE' | 'EDIT' | 'VIEW' | 'HELP';
type WorkspaceTool = 'FILES' | 'DIFF' | 'TERMINAL';
type UtilityView = 'HOME' | 'BROWSER';

interface RouteState {
  route: AppView;
  canBack: boolean;
  canForward: boolean;
}

const initialRoute: RouteState = { route: 'PROJECTS', canBack: false, canForward: false };
const utilityWidthKey = 'fielora:utility-panel-width-v2';
const utilityMin = 380;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readUtilityWidth(): number {
  const value = Number.parseFloat(window.localStorage.getItem(utilityWidthKey) ?? '480');
  return Number.isFinite(value) ? clamp(value, utilityMin, 960) : 480;
}

function emit<T>(name: string, detail?: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function ChromeGlyph({ name }: { name: 'sidebar' | 'back' | 'forward' | 'focus' | 'tools' }) {
  const paths = {
    sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 5v14"/></>,
    back: <><path d="m14.5 6-6 6 6 6"/><path d="M9 12h10"/></>,
    forward: <><path d="m9.5 6 6 6-6 6"/><path d="M15 12H5"/></>,
    focus: <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/></>,
    tools: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M15 5v14"/></>,
  } as const;
  return <svg className="shell-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function DesktopChrome({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ChromeMenu | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [utilityView, setUtilityView] = useState<UtilityView>('HOME');
  const [utilityWidth, setUtilityWidth] = useState(readUtilityWidth);
  const [route, setRoute] = useState<RouteState>(initialRoute);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const chromeRef = useRef<HTMLElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const previousRouteRef = useRef<AppView>(initialRoute.route);

  const openWorkspace = (tool: WorkspaceTool) => { setToolsOpen(false); emit('fielora:open-workspace', tool); };
  const toggleSidebar = () => setSidebarCollapsed((value) => !value);
  const toggleFocus = () => setFocusMode((value) => !value);
  const settingsRoute = route.route === 'SETTINGS';

  function openUtility(view: UtilityView) {
    if (settingsRoute) return;
    setUtilityWidth((current) => clamp(current, utilityMin, utilityMaximum()));
    setUtilityView(view);
    setToolsOpen(true);
  }

  function utilityMaximum(): number {
    const width = workAreaRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    return Math.max(utilityMin, width - 360 - 48 - 6);
  }

  function resizeUtility(clientX: number) {
    const rect = workAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = clamp(rect.right - 48 - clientX, utilityMin, utilityMaximum());
    setUtilityWidth(next);
    window.localStorage.setItem(utilityWidthKey, String(Math.round(next)));
  }

  function resizeUtilityBy(delta: number) {
    setUtilityWidth((current) => {
      const next = clamp(current - delta, utilityMin, utilityMaximum());
      window.localStorage.setItem(utilityWidthKey, String(Math.round(next)));
      return next;
    });
  }

  useEffect(() => {
    document.body.dataset.sidebarCollapsed = String(sidebarCollapsed);
    return () => { delete document.body.dataset.sidebarCollapsed; };
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.body.dataset.focusMode = String(focusMode);
    return () => { delete document.body.dataset.focusMode; };
  }, [focusMode]);

  useEffect(() => {
    document.body.dataset.utilityView = toolsOpen ? utilityView : 'CLOSED';
    return () => { delete document.body.dataset.utilityView; };
  }, [toolsOpen, utilityView]);

  useEffect(() => {
    const area = workAreaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() => setUtilityWidth((current) => clamp(current, utilityMin, utilityMaximum())));
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const routeChanged = previousRouteRef.current !== route.route;
    if (settingsRoute || (routeChanged && toolsOpen && utilityView === 'BROWSER')) setToolsOpen(false);
    previousRouteRef.current = route.route;
  }, [route.route, settingsRoute, toolsOpen, utilityView]);

  useEffect(() => {
    const updateRoute = (event: Event) => setRoute((event as CustomEvent<RouteState>).detail);
    const openRequestedUtility = (event: Event) => {
      const view = (event as CustomEvent<UtilityView>).detail;
      if (view === 'HOME' || view === 'BROWSER') openUtility(view);
    };
    const closeMenus = (event: PointerEvent) => {
      if (chromeRef.current && !chromeRef.current.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener('fielora:route-state', updateRoute);
    window.addEventListener('fielora:open-utility', openRequestedUtility);
    window.addEventListener('pointerdown', closeMenus);
    return () => {
      window.removeEventListener('fielora:route-state', updateRoute);
      window.removeEventListener('fielora:open-utility', openRequestedUtility);
      window.removeEventListener('pointerdown', closeMenus);
    };
  });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'n') { event.preventDefault(); emit('fielora:new-conversation'); return; }
      if (command && event.key.toLowerCase() === 'o') { event.preventDefault(); emit('fielora:add-project'); return; }
      if (command && event.key === ',') { event.preventDefault(); emit('fielora:open-settings', 'GENERAL'); return; }
      if (command && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); return; }
      if (command && event.shiftKey && event.key.toLowerCase() === 'g') { event.preventDefault(); openWorkspace('DIFF'); return; }
      if (command && event.key === '`') { event.preventDefault(); openWorkspace('TERMINAL'); return; }
      if (command && event.key.toLowerCase() === 'p') { event.preventDefault(); openWorkspace('FILES'); return; }
      if (command && event.altKey && event.key.toLowerCase() === 's') { event.preventDefault(); setToolsOpen(false); emit('fielora:open-summon'); return; }
      if (command && event.key.toLowerCase() === 't' && !(toolsOpen && utilityView === 'BROWSER')) { event.preventDefault(); openUtility('BROWSER'); return; }
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [route.route, settingsRoute, toolsOpen, utilityView]);

  const menuButton = (id: ChromeMenu, label: string, content: ReactNode) => <div className="chrome-menu-wrap">
    <button className={menu === id ? 'active' : ''} onClick={() => setMenu((current) => current === id ? null : id)}>{label}</button>
    {menu === id && <div className="chrome-menu" role="menu" onClick={() => setMenu(null)}>{content}</div>}
  </div>;

  const layoutStyle = { '--utility-panel-width': `${utilityWidth}px` } as CSSProperties;

  return <div className="desktop-frame" data-testid="desktop-frame">
    <header className="desktop-chrome" ref={chromeRef} data-testid="desktop-chrome">
      <div className="chrome-leading">
        <button className={sidebarCollapsed ? 'active' : ''} title="显示或隐藏侧栏 (Ctrl+B)" onClick={toggleSidebar} data-testid="chrome-sidebar-toggle"><ChromeGlyph name="sidebar"/></button>
        <button title="后退" disabled={!route.canBack} onClick={() => emit('fielora:navigation-back')} data-testid="chrome-back"><ChromeGlyph name="back"/></button>
        <button title="前进" disabled={!route.canForward} onClick={() => emit('fielora:navigation-forward')} data-testid="chrome-forward"><ChromeGlyph name="forward"/></button>
      </div>
      <nav className="chrome-menus" aria-label="应用菜单">
        {menuButton('FILE', '文件', <><button role="menuitem" onClick={() => emit('fielora:new-conversation')}><span>新对话</span><kbd>Ctrl+N</kbd></button><button role="menuitem" onClick={() => emit('fielora:add-project')}><span>打开文件夹…</span><kbd>Ctrl+O</kbd></button><button role="menuitem" onClick={() => emit('fielora:open-settings', 'GENERAL')}><span>设置</span><kbd>Ctrl+,</kbd></button></>)}
        {menuButton('EDIT', '编辑', <><button role="menuitem" onClick={() => document.execCommand('undo')}><span>撤销</span><kbd>Ctrl+Z</kbd></button><button role="menuitem" onClick={() => document.execCommand('redo')}><span>重做</span><kbd>Ctrl+Y</kbd></button><button role="menuitem" onClick={() => document.execCommand('selectAll')}><span>全选</span><kbd>Ctrl+A</kbd></button></>)}
        {menuButton('VIEW', '视图', <><button role="menuitem" onClick={toggleSidebar}><span>{sidebarCollapsed ? '显示侧栏' : '隐藏侧栏'}</span><kbd>Ctrl+B</kbd></button><button role="menuitem" onClick={() => openUtility('HOME')}><span>工作区工具</span></button><button role="menuitem" onClick={toggleFocus}><span>{focusMode ? '退出专注布局' : '专注布局'}</span></button></>)}
        {menuButton('HELP', '帮助', <><button role="menuitem" onClick={() => emit('fielora:open-settings', 'SHORTCUTS')}><span>键盘快捷键</span></button><button role="menuitem" onClick={() => emit('fielora:open-settings', 'ABOUT')}><span>关于 Fielora</span></button></>)}
      </nav>
      <div className="chrome-drag-region" />
    </header>
    <div ref={workAreaRef} className={`desktop-work-area ${toolsOpen ? 'utility-open' : ''} ${settingsRoute ? 'settings-route' : ''}`} style={layoutStyle} data-testid="desktop-work-area">
      <div className="desktop-content">{children}</div>
      {toolsOpen && !settingsRoute && <ResizableDivider label="调整右侧工具区宽度" value={utilityWidth} min={utilityMin} max={utilityMaximum()} onResize={resizeUtility} onKeyboardResize={resizeUtilityBy} testId="utility-resizer" className="utility-resizer" />}
      {toolsOpen && !settingsRoute && <aside className={`utility-launcher view-${utilityView.toLowerCase()}`} data-testid="utility-launcher">
        <header><div>{utilityView !== 'HOME' && <button className="utility-back" aria-label="返回工具列表" onClick={() => setUtilityView('HOME')}>←</button>}<strong>{utilityView === 'BROWSER' ? '浏览器' : '工作区工具'}</strong></div><button aria-label="关闭工具区" onClick={() => setToolsOpen(false)}>×</button></header>
        {utilityView === 'BROWSER' ? <BrowsePanel browser={window.fielora.browser} /> : <>
          <nav>
            <button onClick={() => openWorkspace('DIFF')} data-testid="utility-review"><ShellIcon name="diff"/><span>审阅</span><kbd>Ctrl+Shift+G</kbd></button>
            <button onClick={() => openWorkspace('TERMINAL')} data-testid="utility-terminal"><ShellIcon name="terminal"/><span>终端</span><kbd>Ctrl+`</kbd></button>
            <button onClick={() => setUtilityView('BROWSER')} data-testid="utility-browser"><ShellIcon name="browse"/><span>浏览器</span><kbd>Ctrl+T</kbd></button>
            <button onClick={() => openWorkspace('FILES')} data-testid="utility-files"><ShellIcon name="folder"/><span>文件</span><kbd>Ctrl+P</kbd></button>
            <button onClick={() => { setToolsOpen(false); emit('fielora:open-summon'); }} data-testid="utility-chat"><ShellIcon name="compose"/><span>侧边聊天</span><kbd>Ctrl+Alt+S</kbd></button>
          </nav>
          <p>拖动左侧分隔线调整工具区宽度。</p>
        </>}
      </aside>}
      {!settingsRoute && <aside className="utility-rail" aria-label="右侧工具栏" data-testid="utility-rail">
        <button className={focusMode ? 'active' : ''} title="专注布局" onClick={toggleFocus} data-testid="rail-focus"><ChromeGlyph name="focus"/></button>
        <button title="打开终端" onClick={() => openWorkspace('TERMINAL')} data-testid="rail-terminal"><ShellIcon name="terminal"/></button>
        <button className={toolsOpen && utilityView === 'BROWSER' ? 'active' : ''} title="浏览器" onClick={() => toolsOpen && utilityView === 'BROWSER' ? setToolsOpen(false) : openUtility('BROWSER')} data-testid="rail-browser"><ShellIcon name="browse"/></button>
        <button className={toolsOpen && utilityView === 'HOME' ? 'active' : ''} title="工作区工具" onClick={() => toolsOpen && utilityView === 'HOME' ? setToolsOpen(false) : openUtility('HOME')} data-testid="chrome-tools"><ChromeGlyph name="tools"/></button>
      </aside>}
    </div>
  </div>;
}
