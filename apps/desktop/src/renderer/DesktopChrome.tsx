import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AppView } from './view-state';
import { BrowsePanel } from './BrowseScreen';
import { AppIcon } from './ui';
import { ResizableDivider } from './ResizableDivider';
import { ToolbarAction } from './UiPrimitives';

type ChromeMenu = 'FILE' | 'EDIT' | 'VIEW' | 'HELP';
type WorkspaceTool = 'FILES' | 'DIFF' | 'TERMINAL' | 'BROWSER';
type UtilityView = 'HOME' | 'BROWSER';

interface RouteState {
  route: AppView;
  canBack: boolean;
  canForward: boolean;
}

interface TerminalLayoutState {
  open: boolean;
  height: number;
}

const initialRoute: RouteState = { route: 'PROJECTS', canBack: false, canForward: false };
const utilityWidthKey = 'fielora:utility-panel-width-v2';
const utilityMin = 340;

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

export function DesktopChrome({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ChromeMenu | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renderTools, setRenderTools] = useState(false);
  const [utilityView, setUtilityView] = useState<UtilityView>('HOME');
  const [utilityWidth, setUtilityWidth] = useState(readUtilityWidth);
  const [route, setRoute] = useState<RouteState>(initialRoute);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [projectDockOpen, setProjectDockOpen] = useState(false);
  const [projectDockFocus, setProjectDockFocus] = useState(false);
  const [terminalLayout, setTerminalLayout] = useState<TerminalLayoutState>({ open: false, height: 250 });
  const chromeRef = useRef<HTMLElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const utilityOpenFrameRef = useRef<number | null>(null);
  const previousRouteRef = useRef<AppView>(initialRoute.route);

  const openWorkspace = (tool: WorkspaceTool) => {
    if (toolsOpen) closeUtility();
    emit('fielora:open-workspace', tool);
  };
  const toggleSidebar = () => setSidebarCollapsed((value) => !value);
  const settingsRoute = route.route === 'SETTINGS';
  const globalPageRoute = route.route === 'NOW' || route.route === 'LIBRARY' || settingsRoute;
  const workspaceControlsVisible = !globalPageRoute || toolsOpen;

  function openUtility(view: UtilityView) {
    if (settingsRoute) return;
    if (route.route === 'PROJECTS') {
      if (view === 'BROWSER') openWorkspace('BROWSER');
      else emit('fielora:open-workspace-launcher');
      return;
    }
    setUtilityWidth((current) => clamp(current, utilityMin, utilityMaximum()));
    setUtilityView(view);
    if (toolsOpen) return;
    if (utilityOpenFrameRef.current !== null) window.cancelAnimationFrame(utilityOpenFrameRef.current);
    setRenderTools(true);
    utilityOpenFrameRef.current = window.requestAnimationFrame(() => {
      utilityOpenFrameRef.current = null;
      setToolsOpen(true);
    });
  }

  function closeUtility() {
    if (utilityOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(utilityOpenFrameRef.current);
      utilityOpenFrameRef.current = null;
    }
    setToolsOpen(false);
    setFocusMode(false);
  }

  function toggleFocus() {
    if (settingsRoute) return;
    if (focusMode) {
      setFocusMode(false);
      return;
    }
    if (!toolsOpen) openUtility('HOME');
    setFocusMode(true);
  }

  function utilityMaximum(): number {
    const width = workAreaRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    return Math.max(utilityMin, width - 360 - 4);
  }

  function resizeUtility(clientX: number) {
    const rect = workAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = clamp(rect.right - clientX, utilityMin, utilityMaximum());
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
    document.body.dataset.utilityOpen = String(toolsOpen);
    emit('fielora:utility-state', { open: toolsOpen, view: utilityView });
    return () => { delete document.body.dataset.utilityView; delete document.body.dataset.utilityOpen; };
  }, [toolsOpen, utilityView]);

  useEffect(() => {
    if (toolsOpen) { setRenderTools(true); return; }
    setFocusMode(false);
    const timer = window.setTimeout(() => setRenderTools(false), 300);
    return () => window.clearTimeout(timer);
  }, [toolsOpen]);

  useEffect(() => () => {
    if (utilityOpenFrameRef.current !== null) window.cancelAnimationFrame(utilityOpenFrameRef.current);
  }, []);

  useEffect(() => {
    const area = workAreaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() => setUtilityWidth((current) => clamp(current, utilityMin, utilityMaximum())));
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const routeChanged = previousRouteRef.current !== route.route;
    if (settingsRoute || (routeChanged && toolsOpen && utilityView === 'BROWSER')) closeUtility();
    previousRouteRef.current = route.route;
  }, [route.route, settingsRoute, toolsOpen, utilityView]);

  useEffect(() => {
    const updateRoute = (event: Event) => setRoute((event as CustomEvent<RouteState>).detail);
    const openRequestedUtility = (event: Event) => {
      const view = (event as CustomEvent<UtilityView>).detail;
      if (view === 'HOME' || view === 'BROWSER') openUtility(view);
    };
    const closeRequestedUtility = () => closeUtility();
    const updateProjectDock = (event: Event) => setProjectDockOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    const updateProjectFocus = (event: Event) => setProjectDockFocus(Boolean((event as CustomEvent<{ focused?: boolean }>).detail?.focused));
    const updateTerminal = (event: Event) => {
      const detail = (event as CustomEvent<TerminalLayoutState>).detail;
      if (detail && typeof detail.open === 'boolean' && Number.isFinite(detail.height)) setTerminalLayout(detail);
    };
    const closeMenus = (event: PointerEvent) => {
      if (chromeRef.current && !chromeRef.current.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener('fielora:route-state', updateRoute);
    window.addEventListener('fielora:open-utility', openRequestedUtility);
    window.addEventListener('fielora:close-utility', closeRequestedUtility);
    window.addEventListener('fielora:workspace-dock-state', updateProjectDock);
    window.addEventListener('fielora:workspace-focus-state', updateProjectFocus);
    window.addEventListener('fielora:terminal-state', updateTerminal);
    window.addEventListener('pointerdown', closeMenus);
    return () => {
      window.removeEventListener('fielora:route-state', updateRoute);
      window.removeEventListener('fielora:open-utility', openRequestedUtility);
      window.removeEventListener('fielora:close-utility', closeRequestedUtility);
      window.removeEventListener('fielora:workspace-dock-state', updateProjectDock);
      window.removeEventListener('fielora:workspace-focus-state', updateProjectFocus);
      window.removeEventListener('fielora:terminal-state', updateTerminal);
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
      if (command && event.key === '`') { event.preventDefault(); emit('fielora:toggle-terminal'); return; }
      if (command && event.key.toLowerCase() === 'p') { event.preventDefault(); openWorkspace('FILES'); return; }
      if (command && event.key.toLowerCase() === 't' && !(toolsOpen && utilityView === 'BROWSER')) {
        event.preventDefault();
        if (route.route === 'PROJECTS') openWorkspace('BROWSER');
        else openUtility('BROWSER');
        return;
      }
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [route.route, settingsRoute, toolsOpen, utilityView]);

  const menuButton = (id: ChromeMenu, label: string, content: ReactNode) => <div className="chrome-menu-wrap">
    <button className={menu === id ? 'active' : ''} onClick={() => setMenu((current) => current === id ? null : id)}>{label}</button>
    {menu === id && <div className="chrome-menu" role="menu" data-surface="overlay" onClick={() => setMenu(null)}>{content}</div>}
  </div>;

  const layoutStyle = {
    '--utility-panel-width': `${utilityWidth}px`,
    '--desktop-terminal-height': `${terminalLayout.height}px`,
  } as CSSProperties;

  return <div className="desktop-frame" data-surface="canvas" data-testid="desktop-frame">
    <header className="desktop-chrome" ref={chromeRef} data-surface="chrome" data-chrome-plane="window" data-brand-chrome="top" data-testid="desktop-chrome">
      <div className="chrome-leading">
        <button className={sidebarCollapsed ? 'active' : ''} title="显示或隐藏侧栏 (Ctrl+B)" onClick={toggleSidebar} data-testid="chrome-sidebar-toggle"><AppIcon name="sidebar"/></button>
        <button title="后退" disabled={!route.canBack} onClick={() => emit('fielora:navigation-back')} data-testid="chrome-back"><AppIcon name="back"/></button>
        <button title="前进" disabled={!route.canForward} onClick={() => emit('fielora:navigation-forward')} data-testid="chrome-forward"><AppIcon name="forward"/></button>
      </div>
      <nav className="chrome-menus" aria-label="应用菜单">
        {menuButton('FILE', '文件', <><button role="menuitem" onClick={() => emit('fielora:new-conversation')}><span>新对话</span><kbd>Ctrl+N</kbd></button><button role="menuitem" onClick={() => emit('fielora:add-project')}><span>打开文件夹…</span><kbd>Ctrl+O</kbd></button><button role="menuitem" onClick={() => emit('fielora:open-settings', 'GENERAL')}><span>设置</span><kbd>Ctrl+,</kbd></button></>)}
        {menuButton('EDIT', '编辑', <><button role="menuitem" onClick={() => document.execCommand('undo')}><span>撤销</span><kbd>Ctrl+Z</kbd></button><button role="menuitem" onClick={() => document.execCommand('redo')}><span>重做</span><kbd>Ctrl+Y</kbd></button><button role="menuitem" onClick={() => document.execCommand('selectAll')}><span>全选</span><kbd>Ctrl+A</kbd></button></>)}
        {menuButton('VIEW', '视图', <><button role="menuitem" onClick={toggleSidebar}><span>{sidebarCollapsed ? '显示侧栏' : '隐藏侧栏'}</span><kbd>Ctrl+B</kbd></button><button role="menuitem" onClick={() => openUtility('HOME')}><span>工作区工具</span></button><button role="menuitem" onClick={toggleFocus}><span>{focusMode ? '退出专注布局' : '专注布局'}</span></button></>)}
        {menuButton('HELP', '帮助', <><button role="menuitem" onClick={() => emit('fielora:open-settings', 'SHORTCUTS')}><span>键盘快捷键</span></button><button role="menuitem" onClick={() => emit('fielora:open-settings', 'ABOUT')}><span>关于 Fielora</span></button></>)}
      </nav>
      <div className="chrome-drag-region" />
    </header>
    <div ref={workAreaRef} className={`desktop-work-area ${toolsOpen ? 'utility-open' : renderTools ? 'utility-closing' : ''} ${focusMode && toolsOpen ? 'utility-focus' : ''} ${terminalLayout.open ? 'terminal-open' : ''} ${settingsRoute ? 'settings-route' : ''}`} style={layoutStyle} data-testid="desktop-work-area" data-surface-context={workspaceControlsVisible ? 'workspace' : 'global'}>
      <div className="desktop-content">{children}</div>
      {renderTools && !settingsRoute && route.route !== 'PROJECTS' && <ResizableDivider label="调整右侧工具区宽度" value={utilityWidth} min={utilityMin} max={utilityMaximum()} onResize={resizeUtility} onKeyboardResize={resizeUtilityBy} testId="utility-resizer" className="utility-resizer" />}
      {renderTools && !settingsRoute && route.route !== 'PROJECTS' && <aside className={`utility-launcher view-${utilityView.toLowerCase()}`} aria-hidden={!toolsOpen} data-testid="utility-launcher">
        <header><div>{utilityView !== 'HOME' && <button className="utility-back" aria-label="返回工具列表" onClick={() => setUtilityView('HOME')}>←</button>}<strong>{utilityView === 'BROWSER' ? '浏览器' : '工作区工具'}</strong></div></header>
        {utilityView === 'BROWSER' ? <BrowsePanel browser={window.fielora.browser} onSaveToLibrary={(input) => window.fielora.library.saveWeb(input)} onOpenBrowserSettings={() => emit('fielora:open-settings', 'BROWSER')} /> : <>
          <nav>
            <button onClick={() => openWorkspace('DIFF')} data-testid="utility-review"><AppIcon name="diff"/><span>审阅</span><kbd>Ctrl+Shift+G</kbd></button>
            <button onClick={() => setUtilityView('BROWSER')} data-testid="utility-browser"><AppIcon name="browse"/><span>浏览器</span><kbd>Ctrl+T</kbd></button>
            <button onClick={() => openWorkspace('FILES')} data-testid="utility-files"><AppIcon name="folder"/><span>文件</span><kbd>Ctrl+P</kbd></button>
          </nav>
          <p>拖动左侧分隔线调整工具区宽度。</p>
        </>}
      </aside>}
      {!settingsRoute && route.route === 'PROJECTS' && <aside className="project-context-controls" aria-label="Project 控制" data-testid="project-context-controls"><div id="desktop-project-actions-layer" className="desktop-project-actions-layer" data-testid="desktop-project-actions-layer" /></aside>}
      {!settingsRoute && workspaceControlsVisible && <aside className={`utility-control-dock ${toolsOpen || projectDockOpen ? 'in-utility' : 'floating'}`} aria-label="工作区控制" data-testid="utility-rail">
        {(toolsOpen || projectDockOpen) && <ToolbarAction active={route.route === 'PROJECTS' ? projectDockFocus : focusMode} label={(route.route === 'PROJECTS' ? projectDockFocus : focusMode) ? '恢复左右工作区' : '扩展右侧工具区'} icon={<AppIcon name="focus"/>} onClick={() => route.route === 'PROJECTS' ? emit('fielora:toggle-workspace-focus') : toggleFocus()} testId="rail-focus" />}
        {route.route === 'PROJECTS' && <ToolbarAction active={terminalLayout.open} label={terminalLayout.open ? '关闭底部终端' : '打开底部终端'} icon={<AppIcon name="terminal"/>} onClick={() => emit('fielora:toggle-terminal')} testId="rail-terminal" />}
        <ToolbarAction active={route.route === 'PROJECTS' ? projectDockOpen : toolsOpen} label={(route.route === 'PROJECTS' ? projectDockOpen : toolsOpen) ? '收起右侧工具区' : '展开右侧工具区'} icon={<AppIcon name="panelRight"/>} onClick={() => route.route === 'PROJECTS' ? (projectDockOpen ? emit('fielora:close-workspace-dock') : emit('fielora:open-workspace-launcher')) : (toolsOpen ? closeUtility() : openUtility('HOME'))} testId="chrome-tools" />
      </aside>}
      <div id="desktop-terminal-layer" className="desktop-terminal-layer" data-testid="desktop-terminal-layer" />
    </div>
  </div>;
}
