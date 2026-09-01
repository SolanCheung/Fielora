import type { ReactNode } from 'react';
import fieloraMark from '../../assets/fielora-brand-mark.svg';
import { AppIcon } from './ui';

export type PrimarySection = 'PROJECTS' | 'NOW' | 'LIBRARY' | 'BROWSE' | 'FIELDS';
interface PrimaryNavProps {
  active: PrimarySection;
  onProjects: () => void;
  onNow: () => void;
  onBrowse: () => void;
  onFields: () => void;
  onNewConversation: () => void;
  onSettings: () => void;
  onAddProject?: () => void;
  projectHeaderControls?: ReactNode;
  projectContent?: ReactNode;
}

export function PrimaryNav({ active, onProjects, onNow, onBrowse, onFields, onNewConversation, onSettings, onAddProject, projectHeaderControls, projectContent }: PrimaryNavProps) {
  void onBrowse; void onFields;
  const openLibrary = () => window.dispatchEvent(new CustomEvent('fielora:navigate', { detail: 'LIBRARY' }));
  return <aside
    className="project-navigation app-navigation"
    data-surface="chrome"
    data-brand-chrome="navigation"
    data-testid="project-navigation"
    data-app-navigation="true"
  >
    <header className="project-brand"><div className="project-brand-button"><img src={fieloraMark} alt="" aria-hidden="true" /><strong>Fielora</strong></div></header>
    <button className="new-chat-button" onClick={onNewConversation} data-testid="new-conversation"><AppIcon name="compose"/><span>新聊天</span><kbd>＋</kbd></button>
    <nav className="project-global-nav" aria-label="主要功能">
      <button className={active === 'NOW' ? 'active' : ''} onClick={onNow} data-testid="now-nav"><AppIcon name="scheduled"/><span>已安排</span></button>
      <button className={active === 'LIBRARY' ? 'active' : ''} onClick={openLibrary} data-testid="library-nav"><AppIcon name="library"/><span>资料库</span></button>
    </nav>
    <section className="project-tree" aria-label="项目与对话">
      <div className="section-title"><span>项目</span><div className="section-title-actions">{projectHeaderControls ?? <button onClick={onAddProject ?? onProjects} title={onAddProject ? '添加本地 Project' : '打开 Projects'}><AppIcon name="plus"/></button>}</div></div>
      {projectContent ?? <button className={`sidebar-project-home ${active === 'PROJECTS' ? 'active' : ''}`} onClick={onProjects}><AppIcon name="folder"/><span>所有项目</span></button>}
    </section>
    <footer><button onClick={onSettings} data-testid="settings-nav"><AppIcon name="settings"/><span>设置</span></button></footer>
  </aside>;
}
