import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu, MenuItem, Tab, TabStrip, TextActionDialog } from './UiPrimitives';
import { AppIcon, FileTypeIcon, type AppIconName } from './ui';

export interface RightWorkspaceTab {
  id: string;
  label: string;
  icon: AppIconName;
  fileIconPath?: string;
  tabHostId?: string;
}

export interface RightWorkspaceTool {
  id: string;
  label: string;
  icon: AppIconName;
  shortcut?: string;
  onOpen: () => void;
}

export function RightWorkspaceDock({ tabs, activeTabId, toolbar, tools, showLauncher = false, onActivate, onClose, onReload, onDuplicate, onRename, onCloseOthers, onCloseToRight, children }: {
  tabs: RightWorkspaceTab[];
  activeTabId: string;
  toolbar?: ReactNode;
  tools: RightWorkspaceTool[];
  showLauncher?: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReload: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseToRight: (id: string) => void;
  children: ReactNode;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolMenuPosition, setToolMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; left: number; top: number } | null>(null);
  const [renameTab, setRenameTab] = useState<{ id: string; value: string } | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabOrder = tabs.map((tab) => tab.id).join('\n');

  useEffect(() => {
    if (!toolsOpen && !contextMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuAnchorRef.current?.contains(target) && !toolMenuRef.current?.contains(target) && !contextMenuRef.current?.contains(target)) {
        setToolsOpen(false);
        setContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setToolsOpen(false); setContextMenu(null); }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu, toolsOpen]);

  useEffect(() => {
    if (tabs.length === 0) setToolsOpen(false);
  }, [tabs.length]);

  useEffect(() => {
    if (!toolsOpen) return;
    let frame = 0;
    const placeToolMenu = () => {
      frame = 0;
      const anchor = menuAnchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const menu = toolMenuRef.current?.getBoundingClientRect();
      const menuWidth = menu?.width || 184;
      const menuHeight = menu?.height || 154;
      const margin = 8;
      const gap = 5;
      const left = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, anchor.right - menuWidth));
      const below = anchor.bottom + gap;
      const top = below + menuHeight <= window.innerHeight - margin
        ? below
        : Math.max(margin, anchor.top - menuHeight - gap);
      setToolMenuPosition((current) => current?.left === left && current.top === top ? current : { left, top });
    };
    const schedulePlacement = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(placeToolMenu);
    };
    schedulePlacement();
    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('scroll', schedulePlacement, true);
    return () => {
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('scroll', schedulePlacement, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toolsOpen]);

  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    let frame = 0;
    let revealRequested = true;
    const updateStrip = () => {
      frame = 0;
      if (revealRequested) {
        revealRequested = false;
        // Browser pages arrive through a portal; use the rendered selected tab.
        const activeTab = strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.closest<HTMLElement>('.ui-tab');
        if (activeTab) {
          const stripRect = strip.getBoundingClientRect();
          const tabRect = activeTab.getBoundingClientRect();
          const margin = Math.min(24, Math.max(0, (stripRect.width - tabRect.width) / 2));
          if (tabRect.left < stripRect.left + margin) strip.scrollBy({ left: tabRect.left - stripRect.left - margin, behavior: 'instant' });
          else if (tabRect.right > stripRect.right - margin) strip.scrollBy({ left: tabRect.right - stripRect.right + margin, behavior: 'instant' });
        }
      }
      const overflowLeft = String(strip.scrollLeft > 1);
      const overflowRight = String(strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1);
      if (strip.dataset.overflowLeft !== overflowLeft) strip.dataset.overflowLeft = overflowLeft;
      if (strip.dataset.overflowRight !== overflowRight) strip.dataset.overflowRight = overflowRight;
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateStrip);
    };
    const scheduleReveal = () => { revealRequested = true; scheduleUpdate(); };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || strip.scrollWidth <= strip.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? strip.clientWidth : 1;
      strip.scrollBy({ left: delta * unit, behavior: 'instant' });
    };
    scheduleReveal();
    const observer = new ResizeObserver(scheduleReveal);
    observer.observe(strip);
    const tabObserver = new MutationObserver(scheduleReveal);
    tabObserver.observe(strip, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    strip.addEventListener('wheel', wheel, { passive: false });
    strip.addEventListener('scroll', scheduleUpdate, { passive: true });
    return () => {
      observer.disconnect();
      tabObserver.disconnect();
      strip.removeEventListener('wheel', wheel);
      strip.removeEventListener('scroll', scheduleUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeTabId, tabOrder]);

  const openTool = (tool: RightWorkspaceTool) => {
    setToolsOpen(false);
    tool.onOpen();
  };

  const toggleToolMenu = () => {
    if (toolsOpen) {
      setToolsOpen(false);
      return;
    }
    const anchor = menuAnchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const menuWidth = 184;
    const menuHeight = 154;
    const margin = 8;
    const gap = 5;
    const left = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, anchor.right - menuWidth));
    const below = anchor.bottom + gap;
    const top = below + menuHeight <= window.innerHeight - margin
      ? below
      : Math.max(margin, anchor.top - menuHeight - gap);
    setToolMenuPosition({ left, top });
    setContextMenu(null);
    setToolsOpen(true);
  };

  const openTabMenu = (tab: RightWorkspaceTab, left: number, top: number) => {
    onActivate(tab.id);
    setToolsOpen(false);
    setContextMenu({
      tabId: tab.id,
      left: Math.max(8, Math.min(window.innerWidth - 224, left)),
      top: Math.max(8, Math.min(window.innerHeight - 274, top)),
    });
  };

  const contextTab = contextMenu ? tabs.find((tab) => tab.id === contextMenu.tabId) ?? null : null;
  const contextIndex = contextTab ? tabs.findIndex((tab) => tab.id === contextTab.id) : -1;
  const runContextAction = (action: () => void) => { setContextMenu(null); action(); };

  return <section className={`right-workspace-dock workspace-panel${toolbar ? ' has-toolbar' : ''}`} data-surface="content" data-testid="right-workspace-dock" aria-label="右侧工作区">
    <header className="right-dock-tab-strip">
      <TabStrip innerRef={tabsRef} className="right-dock-tabs" label="工作区工具标签" data-testid="right-dock-tabs">
        {tabs.map((tab) => tab.tabHostId
          ? <div key={tab.id} id={tab.tabHostId} className="right-dock-tab-host" data-workspace-tab-id={tab.id}/>
          : <Tab key={tab.id} className="right-dock-tab" mainClassName="right-dock-tab-main" closeClassName="right-dock-tab-close" label={tab.label} leading={tab.fileIconPath ? <FileTypeIcon path={tab.fileIconPath}/> : <AppIcon name={tab.icon}/>} active={tab.id === activeTabId} onActivate={() => onActivate(tab.id)} onClose={() => onClose(tab.id)} onContextMenu={(event) => { event.preventDefault(); openTabMenu(tab, event.clientX, event.clientY); }} onKeyDown={(event) => { if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openTabMenu(tab, bounds.left + 14, bounds.bottom); }} testId={`right-dock-tab-${tab.id}`} closeTestId={`right-dock-close-${tab.id}`} data-tab-id={tab.id} />)}
      </TabStrip>
      {tabs.length > 0 && <div className="right-dock-add-wrap" ref={menuAnchorRef}>
        <button type="button" className="right-dock-add" aria-label="打开工作区工具" title="打开工具" aria-expanded={toolsOpen} onClick={toggleToolMenu} data-testid="right-dock-add"><AppIcon name="plus"/></button>
      </div>}
    </header>
    {toolbar && <div className="right-dock-toolbar" data-testid="right-dock-toolbar">{toolbar}</div>}
    <div className="right-dock-active-view" data-testid="right-dock-active-view">{showLauncher ? <div className="right-dock-home" data-testid="right-dock-home"><nav aria-label="工作区工具">{tools.map((tool) => <button key={tool.id} type="button" onClick={() => openTool(tool)} data-testid={`right-dock-home-${tool.id}`}><AppIcon name={tool.icon}/><span>{tool.label}</span>{tool.shortcut && <kbd>{tool.shortcut}</kbd>}</button>)}</nav></div> : children}</div>
    {toolsOpen && toolMenuPosition && createPortal(<div ref={toolMenuRef} className="right-dock-tool-menu-layer" style={{ left: toolMenuPosition.left, top: toolMenuPosition.top }} data-surface="overlay"><Menu label="工作区工具" className="right-dock-tool-menu" data-testid="right-dock-tool-menu">{tools.map((tool) => <MenuItem key={tool.id} onClick={() => openTool(tool)} icon={<AppIcon name={tool.icon}/>} label={tool.label} trailing={tool.shortcut && <kbd>{tool.shortcut}</kbd>} />)}</Menu></div>, document.body)}
    {contextMenu && contextTab && createPortal(<div ref={contextMenuRef} className="right-dock-tab-context-menu" style={{ left: contextMenu.left, top: contextMenu.top }} data-surface="overlay" data-testid="right-dock-tab-context-menu"><Menu label={`${contextTab.label} 标签操作`}>
      <MenuItem label="重新加载" icon={<AppIcon name="refresh"/>} onClick={() => runContextAction(() => onReload(contextTab.id))}/>
      <MenuItem label="复制标签页" icon={<AppIcon name="copy"/>} onClick={() => runContextAction(() => onDuplicate(contextTab.id))}/>
      <MenuItem label="重命名" icon={<AppIcon name="edit"/>} onClick={() => { setContextMenu(null); setRenameTab({ id: contextTab.id, value: contextTab.label }); }}/>
      <div className="right-dock-tab-menu-separator" role="separator"/>
      <MenuItem label="关闭" icon={<AppIcon name="close"/>} onClick={() => runContextAction(() => onClose(contextTab.id))}/>
      <MenuItem label="关闭其他标签页" disabled={tabs.length <= 1} onClick={() => runContextAction(() => onCloseOthers(contextTab.id))}/>
      <MenuItem label="关闭右侧标签页" disabled={contextIndex < 0 || contextIndex === tabs.length - 1} onClick={() => runContextAction(() => onCloseToRight(contextTab.id))}/>
    </Menu></div>, document.body)}
    {renameTab && createPortal(<TextActionDialog title="重命名标签页" description="只修改当前工作区标签的显示名称。" value={renameTab.value} confirmLabel="重命名" onChange={(value) => setRenameTab((current) => current ? { ...current, value } : null)} onCancel={() => setRenameTab(null)} onConfirm={() => { const next = renameTab.value.trim(); if (next) onRename(renameTab.id, next); setRenameTab(null); }} testId="right-dock-tab-rename-dialog"/>, document.body)}
  </section>;
}
