import { useState, type CSSProperties } from 'react';
import type {
  AccentPreset, AdvancedColorKey, AppearancePreferences, CodeFont, InterfaceContrast, InterfaceDensity,
  InterfaceRadius, ReducedMotionPreference, ThemePreference, UiFont, UiFontScale,
} from './app-preferences';
import {
  defaultAppearancePreferences, exportThemeConfig, importThemeConfig, selectedAccent,
} from './app-preferences';
import { SelectMenu, SettingsToggle, TextActionDialog } from './UiPrimitives';

interface AppearanceSettingsProps {
  appearance: AppearancePreferences;
  onChange: (appearance: AppearancePreferences) => void;
}

const themeOptions: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'SYSTEM', label: '系统', description: '实时跟随 Windows 明暗模式' },
  { value: 'LIGHT', label: '浅色', description: '瓷白画布与柔和冷紫层级' },
  { value: 'DARK', label: '深色', description: '低疲劳深墨工作面' },
];

const accents: Array<{ value: AccentPreset; label: string; color: string }> = [
  { value: 'FIELORA', label: 'Fielora 紫', color: '#6546C7' },
  { value: 'BLUE', label: '蓝色', color: '#326BCB' },
  { value: 'TEAL', label: '青绿', color: '#147D83' },
  { value: 'ORANGE', label: '橙色', color: '#C15B28' },
  { value: 'CUSTOM', label: '自定义', color: 'custom' },
];

const advancedColors: Array<{ key: AdvancedColorKey; label: string; light: string; dark: string }> = [
  { key: 'accent', label: '强调色', light: '#6546C7', dark: '#6546C7' },
  { key: 'canvas', label: '画布', light: '#FFFFFF', dark: '#191B20' },
  { key: 'sidebar', label: '侧边栏', light: '#F8F9FC', dark: '#17191E' },
  { key: 'surface', label: 'Surface', light: '#F7F8FA', dark: '#22252B' },
  { key: 'foreground', label: '正文', light: '#181A1F', dark: '#F1F2F5' },
  { key: 'border', label: '边框', light: '#E9EBEF', dark: '#30343C' },
];

function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="appearance-segment" role="radiogroup" aria-label={label}>{options.map((option) => <button type="button" key={option.value} role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function MiniWorkspace({ kind = 'live' }: { kind?: 'live' | 'system' | 'light' | 'dark' }) {
  return <div className={`appearance-mini-workspace preview-${kind}`} aria-hidden="true">
    <div className="mini-sidebar"><i/><i/><i/></div>
    <div className="mini-canvas"><span/><b/><em/></div>
  </div>;
}

export function AppearanceSettings({ appearance, onChange }: AppearanceSettingsProps) {
  const [importValue, setImportValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const update = (patch: Partial<AppearancePreferences>) => onChange({ ...appearance, ...patch });
  const resolvedDark = appearance.themePreference === 'DARK' || (appearance.themePreference === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  async function copyTheme() {
    try {
      await window.fielora.clipboard.writeText(exportThemeConfig(appearance));
      setFeedback('主题配置已复制');
    } catch { setFeedback('复制失败，请稍后重试'); }
  }

  function applyImport() {
    try {
      onChange(importThemeConfig(importValue));
      setImportOpen(false);
      setImportValue('');
      setFeedback('主题已导入并应用');
    } catch { setFeedback('主题格式无效'); }
  }

  function resetAppearance() {
    onChange({ ...defaultAppearancePreferences, advancedColorOverrides: {} });
    setResetOpen(false);
    setFeedback('已恢复默认外观');
  }

  function updateAdvancedColor(key: AdvancedColorKey, value: string) {
    update({ advancedColorOverrides: { ...appearance.advancedColorOverrides, [key]: value.toUpperCase() } });
  }

  return <div className="settings-section appearance-settings" data-testid="settings-appearance">
    <header><p>设置 / 外观</p><h1>外观</h1><span>Porcelain White、Soft Lavender 与 Deep Ink，共同驱动 Fielora 的长期视觉语言。</span></header>
    {feedback && <div className="appearance-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback('')}>×</button></div>}

    <section className="appearance-section" aria-labelledby="appearance-theme-title">
      <div className="appearance-section-heading"><span><em>01</em><strong id="appearance-theme-title">主题</strong></span><small>立即应用，无需重启</small></div>
      <div className="theme-card-grid">{themeOptions.map((option) => <button type="button" key={option.value} className="theme-preview-card" aria-pressed={appearance.themePreference === option.value} onClick={() => update({ themePreference: option.value })} data-testid={`appearance-theme-${option.value.toLowerCase()}`}>
        <MiniWorkspace kind={option.value === 'SYSTEM' ? 'system' : option.value === 'LIGHT' ? 'light' : 'dark'}/>
        <span><strong>{option.label}</strong><small>{option.description}</small></span><i aria-hidden="true">✓</i>
      </button>)}</div>
      <div className="appearance-live-preview" style={{ '--preview-accent': selectedAccent(appearance) } as CSSProperties}>
        <MiniWorkspace/><span><strong>实时预览</strong><small>主题、强调色、圆角、密度与字体会同步作用于整个应用。</small></span>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-color-title">
      <div className="appearance-section-heading"><span><em>02</em><strong id="appearance-color-title">颜色与对比</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row accent-setting"><span><strong>强调色</strong><small>只用于选中状态、主操作、链接与焦点。</small></span><div className="accent-options">{accents.map((accent) => <button type="button" key={accent.value} aria-pressed={appearance.accentPreset === accent.value} title={accent.label} onClick={() => update({ accentPreset: accent.value })}><i style={accent.color === 'custom' ? { background: appearance.customAccent } : { background: accent.color }}/><span>{accent.label}</span></button>)}</div></div>
        {appearance.accentPreset === 'CUSTOM' && <label className="appearance-setting-row color-picker-row"><span><strong>自定义强调色</strong><small>{appearance.customAccent}</small></span><input type="color" value={appearance.customAccent} onChange={(event) => update({ customAccent: event.target.value.toUpperCase() })} aria-label="自定义强调色" data-testid="appearance-custom-accent" /></label>}
        <div className="appearance-setting-row"><span><strong>对比度</strong><small>调整次级文字、边框和选中 Surface 的区分度。</small></span><Segment value={appearance.contrast} label="对比度" onChange={(contrast: InterfaceContrast) => update({ contrast })} options={[{ value: 'SOFT', label: '较柔和' }, { value: 'STANDARD', label: '标准' }, { value: 'HIGH', label: '较高' }]}/></div>
        <div className="appearance-setting-row"><span><strong>高对比度</strong><small>强化文字、边框、焦点环和选中状态。</small></span><SettingsToggle value={appearance.highContrast} onChange={(highContrast) => update({ highContrast })} label="高对比度" testId="appearance-high-contrast"/></div>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-interface-title">
      <div className="appearance-section-heading"><span><em>03</em><strong id="appearance-interface-title">界面</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row"><span><strong>界面密度</strong><small>Coding Workspace 可用紧凑模式显示更多内容。</small></span><Segment value={appearance.density} label="界面密度" onChange={(density: InterfaceDensity) => update({ density })} options={[{ value: 'COMFORTABLE', label: '舒适' }, { value: 'STANDARD', label: '标准' }, { value: 'COMPACT', label: '紧凑' }]}/></div>
        <div className="appearance-setting-row"><span><strong>界面圆角</strong><small>统一控制列表、Surface、弹窗与 Composer。</small></span><Segment value={appearance.radius} label="界面圆角" onChange={(radius: InterfaceRadius) => update({ radius })} options={[{ value: 'SMALL', label: '小' }, { value: 'STANDARD', label: '标准' }, { value: 'LARGE', label: '大' }]}/></div>
        <div className="appearance-setting-row"><span><strong>半透明侧边栏</strong><small>使用稳定的柔和着色与轻量模糊，不穿透外部网页。</small></span><SettingsToggle value={appearance.translucentSidebar} onChange={(translucentSidebar) => update({ translucentSidebar })} label="半透明侧边栏" testId="appearance-translucent-sidebar"/></div>
        <div className="appearance-setting-row"><span><strong>柔和层次</strong><small>为 Composer、Popover 与 Dialog 增加极弱阴影。</small></span><SettingsToggle value={appearance.softElevation} onChange={(softElevation) => update({ softElevation })} label="柔和层次" testId="appearance-soft-elevation"/></div>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-font-title">
      <div className="appearance-section-heading"><span><em>04</em><strong id="appearance-font-title">字体</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row"><span><strong>UI 字体</strong><small>有限的安全字体栈，不扫描系统字体。</small></span><SelectMenu value={appearance.uiFont} onChange={(value) => update({ uiFont: value as UiFont })} ariaLabel="UI 字体" testId="appearance-ui-font" options={[{ value: 'SYSTEM', label: '系统默认' }, { value: 'INTER', label: 'Inter' }, { value: 'SEGOE_UI', label: 'Segoe UI' }, { value: 'PINGFANG_SC', label: 'PingFang SC' }, { value: 'MICROSOFT_YAHEI', label: 'Microsoft YaHei' }]}/></div>
        <div className="appearance-setting-row"><span><strong>代码字体</strong><small>用于 Diff、代码块和 Coding Editor，终端保持独立设置。</small></span><SelectMenu value={appearance.codeFont} onChange={(value) => update({ codeFont: value as CodeFont })} ariaLabel="代码字体" testId="appearance-code-font" options={[{ value: 'SYSTEM_MONO', label: '系统等宽字体' }, { value: 'CONSOLAS', label: 'Consolas' }, { value: 'CASCADIA_CODE', label: 'Cascadia Code' }, { value: 'JETBRAINS_MONO', label: 'JetBrains Mono' }]}/></div>
        <div className="appearance-setting-row"><span><strong>界面字体大小</strong><small>只调整 Fielora UI，不影响外部网页和终端。</small></span><SelectMenu value={String(appearance.uiFontScale)} onChange={(value) => update({ uiFontScale: Number(value) as UiFontScale })} ariaLabel="界面字体大小" testId="appearance-font-scale" options={[90, 95, 100, 105, 110, 115, 120].map((value) => ({ value: String(value), label: `${value}%` }))}/></div>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-motion-title">
      <div className="appearance-section-heading"><span><em>05</em><strong id="appearance-motion-title">动效与交互</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row"><span><strong>减少动态效果</strong><small>保留进度与 Agent 状态等必要反馈。</small></span><SelectMenu value={appearance.reducedMotionPreference} onChange={(value) => update({ reducedMotionPreference: value as ReducedMotionPreference })} ariaLabel="减少动态效果" testId="appearance-reduced-motion" options={[{ value: 'SYSTEM', label: '系统' }, { value: 'REDUCE', label: '开启' }, { value: 'FULL', label: '关闭' }]}/></div>
        <div className="appearance-setting-row"><span><strong>平滑滚动</strong><small>应用于 Fielora 自身滚动区域。</small></span><SettingsToggle value={appearance.smoothScrolling} onChange={(smoothScrolling) => update({ smoothScrolling })} label="平滑滚动" testId="appearance-smooth-scrolling"/></div>
        <div className="appearance-setting-row"><span><strong>使用指针光标</strong><small>按钮和交互元素使用指针，不影响编辑器与调整手柄。</small></span><SettingsToggle value={appearance.pointerCursor} onChange={(pointerCursor) => update({ pointerCursor })} label="使用指针光标" testId="appearance-pointer-cursor"/></div>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-management-title">
      <div className="appearance-section-heading"><span><em>06</em><strong id="appearance-management-title">主题管理</strong></span></div>
      <div className="appearance-card theme-management-card"><div><span><strong>Fielora 内置主题</strong><small>Fielora Light / Fielora Dark · Theme Config v1</small></span><div><button type="button" onClick={() => void copyTheme()} data-testid="appearance-copy-theme">复制主题</button><button type="button" onClick={() => setImportOpen(true)} data-testid="appearance-import-theme">导入主题</button><button type="button" className="danger" onClick={() => setResetOpen(true)} data-testid="appearance-reset">恢复默认外观</button></div></div></div>
    </section>

    <section className="appearance-section advanced-theme-section" aria-labelledby="appearance-advanced-title">
      <details><summary><span><em>07</em><strong id="appearance-advanced-title">高级自定义主题</strong></span><small>纯数据颜色覆盖</small></summary><div className="advanced-color-grid">{advancedColors.map((color) => { const value = appearance.advancedColorOverrides[color.key] ?? (color.key === 'accent' ? selectedAccent(appearance) : resolvedDark ? color.dark : color.light); return <label key={color.key}><span><strong>{color.label}</strong><code>{value}</code></span><input type="color" value={value} onChange={(event) => updateAdvancedColor(color.key, event.target.value)} aria-label={color.label}/></label>; })}</div><button type="button" className="clear-color-overrides" onClick={() => update({ advancedColorOverrides: {} })}>清除高级颜色覆盖</button></details>
    </section>

    {importOpen && <TextActionDialog title="导入主题" description="粘贴 Fielora Theme Config v1。配置只会作为 JSON 数据解析，不会执行代码。" value={importValue} multiline confirmLabel="验证并导入" onChange={setImportValue} onCancel={() => { setImportOpen(false); setImportValue(''); }} onConfirm={applyImport} testId="appearance-import-dialog"/>}
    {resetOpen && <TextActionDialog title="恢复默认外观？" description="只重置主题、颜色、字体、密度、圆角、动效与高级覆盖，不影响模型、项目或其它设置。" confirmLabel="恢复默认" danger onCancel={() => setResetOpen(false)} onConfirm={resetAppearance} testId="appearance-reset-dialog"/>}
  </div>;
}
