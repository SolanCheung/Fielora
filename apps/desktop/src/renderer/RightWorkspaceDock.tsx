import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShellIcon, type ShellIconName } from './PrimaryNav';

export interface RightWorkspaceTab {
  id: string;
  label: string;
  icon: ShellIconName;
}

export interface RightWorkspaceTool {
  id: string;
  label: string;
  icon: ShellIconName;
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
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setToolsOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [toolsOpen]);

  return <section className={`right-workspace-dock workspace-panel${toolbar ? ' has-toolbar' : ''}`} data-testid="right-workspace-dock" aria-label="右侧工作区">
    <header className="right-dock-tab-strip">
      <div className="right-dock-tabs" role="tablist" aria-label="工作区工具标签" data-testid="right-dock-tabs">
        {tabs.map((tab) => <div key={tab.id} className={`right-dock-tab ${tab.id === activeTabId ? 'active' : ''}`} data-tab-id={tab.id}>
          <button type="button" className="right-dock-tab-main" role="tab" aria-selected={tab.id === activeTabId} title={tab.label} onClick={() => onActivate(tab.id)} data-testid={`right-dock-tab-${tab.id}`}><ShellIcon name={tab.icon}/><span>{tab.label}</span></button>
          <button type="button" className="right-dock-tab-close" aria-label={`关闭 ${tab.label}`} onClick={() => onClose(tab.id)} data-testid={`right-dock-close-${tab.id}`}><ShellIcon name="close"/></button>
        </div>)}
      </div>
      <div className="right-dock-add-wrap" ref={menuRef}>
        <button type="button" className="right-dock-add" aria-label="打开工作区工具" title="打开工具" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)} data-testid="right-dock-add"><ShellIcon name="plus"/></button>
        {toolsOpen && <div className="right-dock-tool-menu" role="menu" data-testid="right-dock-tool-menu">{tools.map((tool) => <button key={tool.id} type="button" role="menuitem" onClick={() => { tool.onOpen(); setToolsOpen(false); }}><ShellIcon name={tool.icon}/><span>{tool.label}</span>{tool.shortcut && <kbd>{tool.shortcut}</kbd>}</button>)}</div>}
      </div>
    </header>
    {toolbar && <div className="right-dock-toolbar" data-testid="right-dock-toolbar">{toolbar}</div>}
    <div className="right-dock-active-view" data-testid="right-dock-active-view">{showLauncher ? <div className="right-dock-home" data-testid="right-dock-home"><nav aria-label="工作区工具">{tools.map((tool) => <button key={tool.id} type="button" onClick={tool.onOpen} data-testid={`right-dock-home-${tool.id}`}><ShellIcon name={tool.icon}/><span>{tool.label}</span>{tool.shortcut && <kbd>{tool.shortcut}</kbd>}</button>)}</nav></div> : children}</div>
  </section>;
}
