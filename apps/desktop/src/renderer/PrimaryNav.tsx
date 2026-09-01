import type { ReactNode } from 'react';
import fieloraMark from '../../assets/fielora-brand-mark.svg';
import { AppIcon } from './ui';
import { useUiLocale } from './ui-locale';

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
  const { t } = useUiLocale();
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
    <button className="new-chat-button" onClick={onNewConversation} data-testid="new-conversation"><AppIcon name="compose"/><span>{t('新聊天', 'New chat')}</span><kbd>＋</kbd></button>
    <nav className="project-global-nav" aria-label={t('主要功能', 'Primary navigation')}>
      <button className={active === 'NOW' ? 'active' : ''} onClick={onNow} data-testid="now-nav"><AppIcon name="scheduled"/><span>{t('已安排', 'Scheduled')}</span></button>
      <button className={active === 'LIBRARY' ? 'active' : ''} onClick={openLibrary} data-testid="library-nav"><AppIcon name="library"/><span>{t('资料库', 'Library')}</span></button>
    </nav>
    <section className="project-tree" aria-label={t('项目与对话', 'Projects and conversations')}>
      <div className="section-title"><span>{t('项目', 'Projects')}</span><div className="section-title-actions">{projectHeaderControls ?? <button onClick={onAddProject ?? onProjects} title={onAddProject ? t('添加本地 Project', 'Add local Project') : t('打开 Projects', 'Open Projects')}><AppIcon name="plus"/></button>}</div></div>
      {projectContent ?? <button className={`sidebar-project-home ${active === 'PROJECTS' ? 'active' : ''}`} onClick={onProjects}><AppIcon name="folder"/><span>{t('所有项目', 'All projects')}</span></button>}
    </section>
    <footer><button onClick={onSettings} data-testid="settings-nav"><AppIcon name="settings"/><span>{t('设置', 'Settings')}</span></button></footer>
  </aside>;
}
