import type { ReactNode } from 'react';
import fieloraMark from '../../assets/fielora-mark.svg';

export type PrimarySection = 'PROJECTS' | 'NOW' | 'BROWSE' | 'FIELDS';
export type ShellIconName = 'compose' | 'now' | 'browse' | 'fields' | 'inbox' | 'folder' | 'files' | 'diff' | 'terminal' | 'settings' | 'refresh' | 'close' | 'models' | 'appearance' | 'keyboard' | 'info';

export function ShellIcon({ name }: { name: ShellIconName }) {
  const paths: Record<ShellIconName, ReactNode> = {
    compose: <><path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z"/><path d="m13 7.5 3.5 3.5"/><path d="M19 5.5 16.5 3 14.5 5"/></>,
    now: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    browse: <><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16"/></>,
    fields: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 17h6M17 14v6"/></>,
    inbox: <><path d="M5 5h14v14H5z"/><path d="M5 14h4l1.5 2h3L15 14h4"/></>,
    folder: <path d="M3.5 7.5h6l2-2h9v13h-17z"/>,
    files: <><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/></>,
    diff: <><path d="M8 4v12a4 4 0 0 0 4 4h4"/><circle cx="8" cy="4" r="2"/><circle cx="16" cy="20" r="2"/><path d="M13 7h7M16.5 3.5v7"/></>,
    terminal: <><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m7 10 2.5 2L7 14M12 15h4"/></>,
    settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></>,
    refresh: <><path d="M19 8a7 7 0 1 0 1 6"/><path d="M19 3v5h-5"/></>,
    close: <path d="m7 7 10 10M17 7 7 17"/>,
    models: <><rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
    appearance: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>,
    keyboard: <><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h.01M7 14h10"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  };
  return <svg className="shell-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

interface PrimaryNavProps {
  active: PrimarySection;
  onProjects: () => void;
  onNow: () => void;
  onBrowse: () => void;
  onFields: () => void;
  onNewConversation: () => void;
  onSettings: () => void;
  onAddProject?: () => void;
  projectContent?: ReactNode;
}

export function PrimaryNav({ active, onProjects, onNow, onBrowse, onFields, onNewConversation, onSettings, onAddProject, projectContent }: PrimaryNavProps) {
  const openInbox = () => window.dispatchEvent(new CustomEvent('fielora:open-inbox'));
  return <aside
    className="project-navigation app-navigation"
    data-testid="project-navigation"
    data-app-navigation="true"
  >
    <header className="project-brand"><button className="project-brand-button" onClick={onProjects} data-testid="projects-nav"><img src={fieloraMark} alt="" aria-hidden="true" /><strong>Fielora</strong><span>⌄</span></button></header>
    <button className="new-chat-button" onClick={onNewConversation} data-testid="new-conversation"><ShellIcon name="compose"/><span>新对话</span><kbd>＋</kbd></button>
    <nav className="project-global-nav" aria-label="主要功能">
      <button className={active === 'NOW' ? 'active' : ''} onClick={onNow} data-testid="now-nav"><ShellIcon name="now"/><span>Now</span></button>
      <button className={active === 'BROWSE' ? 'active' : ''} onClick={onBrowse} data-testid="browse-nav"><ShellIcon name="browse"/><span>浏览器</span></button>
      <button className={active === 'FIELDS' ? 'active' : ''} onClick={onFields} data-testid="fields-nav"><ShellIcon name="fields"/><span>Fields</span></button>
      <button onClick={openInbox} data-testid="inbox-nav"><ShellIcon name="inbox"/><span>Inbox</span></button>
    </nav>
    <section className="project-tree" aria-label="Projects and conversations">
      <div className="section-title"><span>项目</span><button onClick={onAddProject ?? onProjects} title={onAddProject ? '添加本地 Project' : '打开 Projects'}>＋</button></div>
      {projectContent ?? <button className={`sidebar-project-home ${active === 'PROJECTS' ? 'active' : ''}`} onClick={onProjects}><ShellIcon name="folder"/><span>所有项目</span></button>}
    </section>
    <footer><button onClick={onSettings} data-testid="settings-nav"><ShellIcon name="settings"/><span>设置</span></button></footer>
  </aside>;
}
