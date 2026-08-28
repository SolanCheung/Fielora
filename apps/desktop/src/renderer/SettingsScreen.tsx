import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModelInvocationEvent, ProviderConfigView } from '@fielora/contracts';
import fieloraMark from '../../assets/fielora-mark.svg';
import type { AppPreferences, StartupDestination } from './app-preferences';
import { AppearanceSettings } from './AppearanceSettings';
import { ShellIcon } from './PrimaryNav';
import { SelectMenu, SettingsToggle } from './UiPrimitives';
import { persistWorkspaceNavigationWidth, readWorkspaceNavigationWidth, WorkspaceSurface } from './WorkspaceSurface';
import { StorageDataSettings } from './StorageDataSettings';
import { McpSettings } from './McpSettings';
import { SkillsSettings } from './SkillsSettings';
import { PluginSettings } from './PluginSettings';

export type SettingsCategory = 'GENERAL' | 'APPEARANCE' | 'MODELS' | 'SKILLS' | 'MCP' | 'PLUGINS' | 'STORAGE_DATA' | 'SHORTCUTS' | 'ABOUT' | 'BROWSER';

interface SettingsScreenProps {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
  onBack: () => void;
  initialCategory?: SettingsCategory;
  fieldId?: string | null;
}

const categories: Array<{ id: SettingsCategory; label: string; keywords: string; group: string }> = [
  { id: 'GENERAL', label: '常规', keywords: '启动 页面 默认', group: '个人' },
  { id: 'APPEARANCE', label: '外观', keywords: '主题 浅色 深色 系统 字体 密度 圆角 动效 theme appearance', group: '个人' },
  { id: 'MODELS', label: '模型与服务', keywords: 'provider api key model 模型 服务', group: 'AI 与扩展' },
  { id: 'SKILLS', label: 'Skills', keywords: 'skills agent skill 项目 插件', group: 'AI 与扩展' },
  { id: 'MCP', label: 'MCP', keywords: 'mcp tool server stdio connection 工具 连接', group: 'AI 与扩展' },
  { id: 'PLUGINS', label: '插件', keywords: 'plugin extension local unpacked 插件 扩展 本地', group: 'AI 与扩展' },
  { id: 'STORAGE_DATA', label: '存储与数据', keywords: 'storage data library cache profile backup import export 存储 数据 资料库 缓存 备份 迁移', group: '数据' },
  { id: 'SHORTCUTS', label: '键盘快捷键', keywords: '快捷键 keyboard shortcut', group: '系统' },
  { id: 'ABOUT', label: '关于', keywords: '版本 about', group: '系统' },
];

function probeFailureLabel(provider: ProviderConfigView, code?: string | null): string {
  if (provider.provider_kind === 'OPENAI' && /^qwen/i.test(provider.default_model)) return '连接失败 · 当前是 OpenAI 官方协议，但模型像兼容服务；请检查协议与 Base URL';
  const labels: Record<string, string> = {
    CREDENTIAL_REJECTED: 'API Key 无效或已失效',
    MODEL_NOT_AVAILABLE: '模型不可用，请检查 Model ID',
    PROVIDER_RATE_LIMITED: '服务限流，请稍后重试',
    PROVIDER_UNAVAILABLE: '服务不可达，请检查网络与 Base URL',
    PROVIDER_PROTOCOL_ERROR: '服务响应与所选协议不兼容',
    CUSTOM_ENDPOINT_REJECTED: '自定义地址未通过安全检查',
  };
  return `连接失败 · ${labels[code ?? ''] ?? code ?? '服务异常'}`;
}

export function SettingsScreen({ preferences, onChange, onBack, initialCategory = 'GENERAL', fieldId = null }: SettingsScreenProps) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  const [query, setQuery] = useState('');
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [providerError, setProviderError] = useState('');
  const [providerProbe, setProviderProbe] = useState<Record<string, string>>({});
  const [navigationWidth, setNavigationWidth] = useState(() => readWorkspaceNavigationWidth(270, 'fielora:settings-navigation-width'));
  const probeInvocations = useRef(new Map<string, string>());

  const refreshProviders = useCallback(async () => {
    try { setProviders(await window.fielora.provider.list()); setProviderError(''); }
    catch (reason) { setProviderError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);

  useEffect(() => {
    document.body.dataset.settingsScreen = 'true';
    void refreshProviders();
    const changed = () => void refreshProviders();
    window.addEventListener('fielora:providers-changed', changed);
    return () => { delete document.body.dataset.settingsScreen; window.removeEventListener('fielora:providers-changed', changed); };
  }, [refreshProviders]);

  useEffect(() => { setCategory(initialCategory); }, [initialCategory]);

  useEffect(() => window.fielora.core.subscribe((event) => {
    if (event.event !== 'event.model.invocation') return;
    const model = event as ModelInvocationEvent;
    const providerId = probeInvocations.current.get(model.invocation_id);
    if (!providerId) return;
    if (model.kind === 'COMPLETED') setProviderProbe((current) => ({ ...current, [providerId]: '连接正常' }));
    if (model.kind === 'FAILED') {
      const provider = providers.find((item) => item.id === providerId);
      setProviderProbe((current) => ({ ...current, [providerId]: provider ? probeFailureLabel(provider, model.error_code) : `连接失败 · ${model.error_code ?? '服务异常'}` }));
    }
    if (model.kind === 'CANCELLED') setProviderProbe((current) => ({ ...current, [providerId]: '测试已取消' }));
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(model.kind)) probeInvocations.current.delete(model.invocation_id);
  }), [providers]);

  const visibleCategories = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? categories.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(needle)) : categories;
  }, [query]);
  const visibleGroups = useMemo(() => [...new Set(visibleCategories.map((item) => item.group))], [visibleCategories]);
  const update = (patch: Partial<AppPreferences>) => onChange({ ...preferences, ...patch });
  const activeProviders = providers.filter((provider) => provider.lifecycle_status !== 'REMOVED');

  async function probe(provider: ProviderConfigView) {
    setProviderProbe((current) => ({ ...current, [provider.id]: '正在测试…' }));
    try {
      const result = await window.fielora.provider.probe({ provider_config_id: provider.id });
      probeInvocations.current.set(result.invocation_id, provider.id);
    } catch (reason) {
      setProviderProbe((current) => ({ ...current, [provider.id]: `连接失败 · ${reason instanceof Error ? reason.message : String(reason)}` }));
    }
  }

  function updateNavigationWidth(next: number) {
    const width = Math.min(Math.max(next, 190), 360);
    setNavigationWidth(width);
    persistWorkspaceNavigationWidth(width, 'fielora:settings-navigation-width');
  }

  return <WorkspaceSurface className="settings-root" testId="settings-screen" navigationWidth={navigationWidth} onNavigationWidthChange={updateNavigationWidth} navigationResizerTestId="settings-navigation-resizer" navigationResizerClassName="settings-navigation-resizer" navigation={<aside className="settings-navigation">
      <button className="settings-back" onClick={onBack} data-testid="settings-back">← <span>返回应用</span></button>
      <label className="settings-search"><span className="sr-only">搜索设置</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" data-testid="settings-search" /></label>
      <nav aria-label="设置分类">
        {visibleGroups.map((group) => <section className="settings-nav-group" key={group}><h2>{group}</h2>{visibleCategories.filter((item) => item.group === group).map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)} data-testid={`settings-category-${item.id.toLowerCase()}`}><ShellIcon name={item.id === 'MODELS' ? 'models' : item.id === 'APPEARANCE' ? 'appearance' : item.id === 'SKILLS' ? 'files' : item.id === 'PLUGINS' ? 'source' : item.id === 'MCP' || item.id === 'STORAGE_DATA' ? 'source' : item.id === 'SHORTCUTS' ? 'keyboard' : item.id === 'ABOUT' ? 'info' : 'settings'} /><span>{item.label}</span></button>)}</section>)}
      </nav>
      <div className="settings-brand"><img src={fieloraMark} alt="" /><span>Fielora Desktop</span></div>
    </aside>}>
    <section className="settings-content">
      {category === 'GENERAL' && <div className="settings-section" data-testid="settings-general"><header><p>个人</p><h1>常规</h1></header><section className="settings-card"><div className="settings-row"><span><strong>默认工作面</strong><small>选择启动 Fielora 时显示的主要工作面。</small></span><SelectMenu value={preferences.startupDestination === 'NOW' ? 'NOW' : 'PROJECTS'} onChange={(value) => update({ startupDestination: value as StartupDestination })} ariaLabel="默认工作面" testId="startup-destination" options={[{ value: 'PROJECTS', label: '项目' }, { value: 'NOW', label: '现在' }]} /></div></section></div>}
      {category === 'BROWSER' && <div className="settings-section" data-testid="settings-browser"><header><p>浏览器</p><h1>浏览器设置</h1></header><section className="settings-card"><div className="settings-row"><span><strong>启动时恢复浏览器</strong><small>启动 Fielora 时恢复上次打开的浏览页面。</small></span><SettingsToggle value={preferences.startupDestination === 'BROWSE'} onChange={(value) => update({ startupDestination: value ? 'BROWSE' : 'PROJECTS' })} label="启动时恢复浏览器" testId="browser-startup-toggle" /></div><div className="settings-row"><span><strong>搜索引擎</strong></span><em className="settings-readonly-value">Google</em></div><div className="settings-row"><span><strong>浏览数据</strong><small>Cookie 和网站登录状态仅保留在此设备，不会包含在 Fielora 迁移备份中。</small></span><em className="settings-readonly-value">仅此设备</em></div></section></div>}
      {category === 'APPEARANCE' && <AppearanceSettings appearance={preferences.appearance} onChange={(appearance) => onChange({ ...preferences, appearance })} />}
      {category === 'MODELS' && <div className="settings-section" data-testid="settings-models">
        <header><p>模型</p><h1>模型与服务</h1></header>
        <section className="settings-card settings-provider-card">
          <div className="settings-card-heading"><span><strong>已配置服务</strong><small>API Key 继续存放在 Windows Credential Manager。</small></span><button className="settings-primary-action" onClick={() => window.dispatchEvent(new CustomEvent('fielora:open-provider-setup'))} data-testid="manage-providers">添加模型服务</button></div>
          {providerError && <p className="error">{providerError}</p>}
          {activeProviders.length === 0 ? <p className="settings-empty">尚未配置模型服务。点击“添加模型服务”填写协议、Base URL、API Key 和 Model ID。</p> : <div className="settings-provider-list">{activeProviders.map((provider) => <article key={provider.id}>
            <span><strong>{provider.display_name}</strong><small>{provider.provider_kind} · {provider.default_model}</small><small>{provider.base_url ?? '官方服务地址'}</small></span>
            <div><em className={providerProbe[provider.id] === '连接正常' ? 'pass' : provider.credential_present ? 'ready' : 'warning'}>{providerProbe[provider.id] ?? (provider.credential_present ? '凭据已保存 · 未测试' : '需要凭据')}</em><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('fielora:open-provider-setup', { detail: provider.id }))} data-testid={`settings-edit-${provider.id}`}>编辑</button><button type="button" disabled={!provider.credential_present || providerProbe[provider.id] === '正在测试…'} onClick={() => void probe(provider)} data-testid={`settings-probe-${provider.id}`}>测试连接</button></div>
          </article>)}</div>}
        </section>
      </div>}
      {category === 'SKILLS' && <SkillsSettings fieldId={fieldId}/>}
      {category === 'MCP' && <McpSettings/>}
      {category === 'PLUGINS' && <PluginSettings/>}
      {category === 'STORAGE_DATA' && <StorageDataSettings preferences={preferences} onPreferencesChange={onChange} />}
      {category === 'SHORTCUTS' && <div className="settings-section" data-testid="settings-shortcuts"><header><p>效率</p><h1>键盘快捷键</h1></header><section className="settings-card shortcut-list"><div><span>新对话</span><kbd>Ctrl+N</kbd></div><div><span>打开 Project 文件夹</span><kbd>Ctrl+O</kbd></div><div><span>显示或隐藏侧栏</span><kbd>Ctrl+B</kbd></div><div><span>审阅</span><kbd>Ctrl+Shift+G</kbd></div><div><span>终端</span><kbd>Ctrl+`</kbd></div><div><span>浏览器 / 新建浏览页面</span><kbd>Ctrl+T</kbd></div><div><span>文件</span><kbd>Ctrl+P</kbd></div><div><span>侧边聊天</span><kbd>Ctrl+Alt+S</kbd></div><div><span>地址栏</span><kbd>Ctrl+L</kbd></div><div><span>刷新网页</span><kbd>Ctrl+R</kbd></div><div><span>Summon</span><kbd>Ctrl+Shift+Space</kbd></div></section></div>}
      {category === 'ABOUT' && <div className="settings-section" data-testid="settings-about"><header><p>Fielora</p><h1>关于</h1></header><section className="settings-card about-card"><img src={fieloraMark} alt="" /><span><strong>Fielora Desktop 0.1.0</strong><small>Windows 11 x64 · Electron 43.4.0 · schema 11</small></span></section></div>}
    </section>
  </WorkspaceSurface>;
}
