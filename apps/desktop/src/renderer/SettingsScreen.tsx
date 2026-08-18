import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ProviderConfigView } from '@fielora/contracts';
import fieloraMark from '../../assets/fielora-mark.svg';
import type { AppPreferences, InterfaceDensity, StartupDestination } from './app-preferences';
import { ShellIcon } from './PrimaryNav';
import { ResizableDivider } from './ResizableDivider';

export type SettingsCategory = 'GENERAL' | 'MODELS' | 'APPEARANCE' | 'SHORTCUTS' | 'ABOUT';

interface SettingsScreenProps {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
  onBack: () => void;
  initialCategory?: SettingsCategory;
}

const categories: Array<{ id: SettingsCategory; label: string; keywords: string }> = [
  { id: 'GENERAL', label: '常规', keywords: '启动 页面 默认' },
  { id: 'MODELS', label: '模型与服务', keywords: 'provider api key model 模型 服务' },
  { id: 'APPEARANCE', label: '外观', keywords: '密度 动画 紧凑' },
  { id: 'SHORTCUTS', label: '键盘快捷键', keywords: '快捷键 keyboard shortcut' },
  { id: 'ABOUT', label: '关于', keywords: '版本 about' },
];

export function SettingsScreen({ preferences, onChange, onBack, initialCategory = 'GENERAL' }: SettingsScreenProps) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  const [query, setQuery] = useState('');
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [providerError, setProviderError] = useState('');
  const [navigationWidth, setNavigationWidth] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:settings-navigation-width') ?? '300');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 220), 420) : 300;
  });
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.dataset.settingsScreen = 'true';
    void window.fielora.provider.list().then(setProviders).catch((reason) => setProviderError(reason instanceof Error ? reason.message : String(reason)));
    return () => { delete document.body.dataset.settingsScreen; };
  }, []);

  useEffect(() => { setCategory(initialCategory); }, [initialCategory]);

  const visibleCategories = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? categories.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(needle)) : categories;
  }, [query]);
  const update = (patch: Partial<AppPreferences>) => onChange({ ...preferences, ...patch });
  const activeProviders = providers.filter((provider) => provider.lifecycle_status !== 'REMOVED');

  function updateNavigationWidth(next: number) {
    const maximum = Math.max(220, (rootRef.current?.getBoundingClientRect().width ?? window.innerWidth) - 480);
    const width = Math.min(Math.max(next, 220), Math.min(420, maximum));
    setNavigationWidth(width);
    window.localStorage.setItem('fielora:settings-navigation-width', String(Math.round(width)));
  }

  return <main ref={rootRef} className="settings-root" style={{ '--settings-navigation-width': `${navigationWidth}px` } as CSSProperties} data-testid="settings-screen">
    <aside className="settings-navigation">
      <button className="settings-back" onClick={onBack} data-testid="settings-back">← <span>返回应用</span></button>
      <label className="settings-search"><span className="sr-only">搜索设置</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" data-testid="settings-search" /></label>
      <nav aria-label="设置分类">
        {visibleCategories.map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)} data-testid={`settings-category-${item.id.toLowerCase()}`}><ShellIcon name={item.id === 'MODELS' ? 'models' : item.id === 'APPEARANCE' ? 'appearance' : item.id === 'SHORTCUTS' ? 'keyboard' : item.id === 'ABOUT' ? 'info' : 'settings'} /><span>{item.label}</span></button>)}
      </nav>
      <div className="settings-brand"><img src={fieloraMark} alt="" /><span>Fielora Desktop</span></div>
    </aside>
    <ResizableDivider label="调整设置导航宽度" value={navigationWidth} min={220} max={420} onResize={(clientX) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) updateNavigationWidth(clientX - rect.left);
    }} onKeyboardResize={(delta) => updateNavigationWidth(navigationWidth + delta)} testId="settings-resizer" className="settings-resizer" />
    <section className="settings-content">
      {category === 'GENERAL' && <div className="settings-section" data-testid="settings-general"><header><p>个人</p><h1>常规</h1></header><section className="settings-card"><label><span><strong>启动页面</strong><small>浏览器会在右侧工具区打开，不会替换中间工作面。</small></span><select value={preferences.startupDestination} onChange={(event) => update({ startupDestination: event.target.value as StartupDestination })} data-testid="startup-destination"><option value="PROJECTS">Projects</option><option value="NOW">Now</option><option value="BROWSE">Projects + 右侧浏览器</option></select></label></section></div>}
      {category === 'MODELS' && <div className="settings-section" data-testid="settings-models"><header><p>模型</p><h1>模型与服务</h1></header><section className="settings-card settings-provider-card"><div className="settings-card-heading"><span><strong>已配置服务</strong><small>API Key 继续存放在 Windows Credential Manager。</small></span><button className="settings-primary-action" onClick={() => window.dispatchEvent(new CustomEvent('fielora:open-provider-setup'))} data-testid="manage-providers">管理模型服务</button></div>{providerError && <p className="error">{providerError}</p>}{activeProviders.length === 0 ? <p className="settings-empty">尚未配置模型服务。点击“管理模型服务”添加 Provider、Base URL、API Key 和 Model ID。</p> : <div className="settings-provider-list">{activeProviders.map((provider) => <article key={provider.id}><span><strong>{provider.display_name}</strong><small>{provider.default_model}</small></span><em className={provider.credential_present ? 'ready' : 'warning'}>{provider.credential_present ? '已就绪' : '需要凭据'}</em></article>)}</div>}</section></div>}
      {category === 'APPEARANCE' && <div className="settings-section" data-testid="settings-appearance"><header><p>界面</p><h1>外观</h1></header><section className="settings-card"><label><span><strong>界面密度</strong><small>紧凑模式会减少菜单与列表的垂直间距。</small></span><select value={preferences.density} onChange={(event) => update({ density: event.target.value as InterfaceDensity })} data-testid="interface-density"><option value="COMFORTABLE">舒适</option><option value="COMPACT">紧凑</option></select></label><label><span><strong>减少动画</strong><small>关闭界面过渡和加载装饰动画。</small></span><button className="setting-switch" type="button" role="switch" aria-checked={preferences.reduceMotion} onClick={() => update({ reduceMotion: !preferences.reduceMotion })} data-testid="reduce-motion"><span /></button></label></section></div>}
      {category === 'SHORTCUTS' && <div className="settings-section" data-testid="settings-shortcuts"><header><p>效率</p><h1>键盘快捷键</h1></header><section className="settings-card shortcut-list"><div><span>新对话</span><kbd>Ctrl+N</kbd></div><div><span>打开 Project 文件夹</span><kbd>Ctrl+O</kbd></div><div><span>显示或隐藏侧栏</span><kbd>Ctrl+B</kbd></div><div><span>审阅</span><kbd>Ctrl+Shift+G</kbd></div><div><span>终端</span><kbd>Ctrl+`</kbd></div><div><span>浏览器 / 新建浏览页面</span><kbd>Ctrl+T</kbd></div><div><span>文件</span><kbd>Ctrl+P</kbd></div><div><span>侧边聊天</span><kbd>Ctrl+Alt+S</kbd></div><div><span>地址栏</span><kbd>Ctrl+L</kbd></div><div><span>刷新网页</span><kbd>Ctrl+R</kbd></div><div><span>Summon</span><kbd>Ctrl+Shift+Space</kbd></div></section></div>}
      {category === 'ABOUT' && <div className="settings-section" data-testid="settings-about"><header><p>Fielora</p><h1>关于</h1></header><section className="settings-card about-card"><img src={fieloraMark} alt="" /><span><strong>Fielora Desktop 0.1.0</strong><small>Windows 11 x64 · Electron 43.4.0 · schema 5</small></span></section></div>}
    </section>
  </main>;
}
