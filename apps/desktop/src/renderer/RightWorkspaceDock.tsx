import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, MenuItem, Tab, TabStrip } from './UiPrimitives';
import { AppIcon, type AppIconName } from './ui';

export interface RightWorkspaceTab {
  id: string;
  label: string;
  icon: AppIconName;
  tabHostId?: string;
}

export interface RightWorkspaceTool {
  id: string;
  label: string;
  icon: AppIconName;
  shortcut?: string;
  onOpen: () => void;
}

export function RightWorkspaceDock({ tabs, activeTabId, toolbar, tools, showLauncher = false, onActivate, onClose, children }: {
  tabs: RightWorkspaceTab[];
  activeTabId: string;
  toolbar?: ReactNode;
  tools: RightWorkspaceTool[];
  showLauncher?: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  children: ReactNode;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolsOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsOpen]);

  useEffect(() => {
    if (tabs.length === 0) setToolsOpen(false);
  }, [tabs.length]);

  const openTool = (tool: RightWorkspaceTool) => {
    setToolsOpen(false);
    tool.onOpen();
  };

  return <section className={`right-workspace-dock workspace-panel${toolbar ? ' has-toolbar' : ''}`} data-surface="content" data-testid="right-workspace-dock" aria-label="右侧工作区">
    <header className="right-dock-tab-strip">
      <TabStrip className="right-dock-tabs" label="工作区工具标签" data-testid="right-dock-tabs">
        {tabs.map((tab) => tab.tabHostId
          ? <div key={tab.id} id={tab.tabHostId} className="right-dock-tab-host" data-workspace-tab-id={tab.id}/>
          : <Tab key={tab.id} className="right-dock-tab" mainClassName="right-dock-tab-main" closeClassName="right-dock-tab-close" label={tab.label} leading={<AppIcon name={tab.icon}/>} active={tab.id === activeTabId} onActivate={() => onActivate(tab.id)} onClose={() => onClose(tab.id)} testId={`right-dock-tab-${tab.id}`} closeTestId={`right-dock-close-${tab.id}`} data-tab-id={tab.id} />)}
      </TabStrip>
      {tabs.length > 0 && <div className="right-dock-add-wrap" ref={menuRef}>
        <button type="button" className="right-dock-add" aria-label="打开工作区工具" title="打开工具" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)} data-testid="right-dock-add"><AppIcon name="plus"/></button>
        {toolsOpen && <Menu label="工作区工具" className="right-dock-tool-menu" data-surface="overlay" data-testid="right-dock-tool-menu">{tools.map((tool) => <MenuItem key={tool.id} onClick={() => openTool(tool)} icon={<AppIcon name={tool.icon}/>} label={tool.label} trailing={tool.shortcut && <kbd>{tool.shortcut}</kbd>} />)}</Menu>}
      </div>}
    </header>
    {toolbar && <div className="right-dock-toolbar" data-testid="right-dock-toolbar">{toolbar}</div>}
    <div className="right-dock-active-view" data-testid="right-dock-active-view">{showLauncher ? <div className="right-dock-home" data-testid="right-dock-home"><nav aria-label="工作区工具">{tools.map((tool) => <button key={tool.id} type="button" onClick={() => openTool(tool)} data-testid={`right-dock-home-${tool.id}`}><AppIcon name={tool.icon}/><span>{tool.label}</span>{tool.shortcut && <kbd>{tool.shortcut}</kbd>}</button>)}</nav></div> : children}</div>
  </section>;
}
