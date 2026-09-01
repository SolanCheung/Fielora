import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  AppearanceMode,
  AppearancePreferences,
  BackgroundGradientOverride,
  CodeFont,
  CodeFontSize,
  ReducedMotionPreference,
  UiFont,
  UiFontSize,
} from './app-preferences';
import {
  appearanceThemeDefaults,
  defaultAppearancePreferences,
  isHexColor,
  resolveAppearance,
} from './app-preferences';
import { SelectMenu, SettingsToggle, TextActionDialog } from './UiPrimitives';

interface AppearanceSettingsProps {
  appearance: AppearancePreferences;
  onChange: (appearance: AppearancePreferences) => void;
}

const appearanceModes: Array<{ value: AppearanceMode; label: string }> = [
  { value: 'SYSTEM', label: '跟随系统' },
  { value: 'LIGHT', label: '浅色' },
  { value: 'DARK', label: '深色' },
];

const uiFontOptions: Array<{ value: UiFont; label: string }> = [
  { value: 'SYSTEM', label: '系统默认' },
  { value: 'INTER', label: 'Inter' },
  { value: 'SEGOE_UI', label: 'Segoe UI' },
  { value: 'PINGFANG_SC', label: '苹方' },
  { value: 'MICROSOFT_YAHEI', label: '微软雅黑' },
];

const codeFontOptions: Array<{ value: CodeFont; label: string }> = [
  { value: 'SYSTEM_MONO', label: '系统等宽' },
  { value: 'CASCADIA_CODE', label: 'Cascadia Code' },
  { value: 'JETBRAINS_MONO', label: 'JetBrains Mono' },
  { value: 'CONSOLAS', label: 'Consolas' },
];

function AppearanceModeControl({ value, onChange }: { value: AppearanceMode; onChange: (value: AppearanceMode) => void }) {
  return <div className="appearance-mode-control" role="radiogroup" aria-label="外观模式">
    {appearanceModes.map((option) => <button
      type="button"
      key={option.value}
      role="radio"
      aria-checked={value === option.value}
      onClick={() => onChange(option.value)}
      data-testid={`appearance-theme-${option.value.toLowerCase()}`}
    ><span>{option.label}</span></button>)}
  </div>;
}

interface HsvColor { h: number; s: number; v: number }

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToHsv(value: string): HsvColor {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels as [number, number, number];
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let h = 0;
  if (delta > 0) {
    if (maximum === r) h = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: h < 0 ? h + 360 : h, s: maximum === 0 ? 0 : delta / maximum, v: maximum };
}

function hsvToHex({ h, s, v }: HsvColor): string {
  const chroma = v * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r1, g1, b1] = segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
      : segment < 3 ? [0, chroma, x]
        : segment < 4 ? [0, x, chroma]
          : segment < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = v - chroma;
  return `#${[r1, g1, b1].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function positionPicker(anchor: HTMLElement, width: number, height: number): { left: number; top: number } {
  const margin = 12;
  const gap = 8;
  const rect = anchor.getBoundingClientRect();
  const left = clamp(rect.right - width, margin, Math.max(margin, window.innerWidth - width - margin));
  const below = rect.bottom + gap;
  const top = below + height <= window.innerHeight - margin
    ? below
    : Math.max(margin, rect.top - gap - height);
  return { left, top };
}

function ColorPickerPopover({ label, value, onChange, testId }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hsv = hexToHsv(value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      if (triggerRef.current) setPosition(positionPicker(triggerRef.current, 280, 254));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function beginDrag(event: ReactPointerEvent<HTMLElement>, kind: 'SV' | 'HUE') {
    event.preventDefault();
    const surface = event.currentTarget;
    const update = (clientX: number, clientY: number) => {
      const rect = surface.getBoundingClientRect();
      if (kind === 'SV') {
        onChange(hsvToHex({ h: hsv.h, s: clamp((clientX - rect.left) / rect.width), v: 1 - clamp((clientY - rect.top) / rect.height) }));
      } else {
        onChange(hsvToHex({ h: clamp((clientX - rect.left) / rect.width) * 359.999, s: hsv.s, v: hsv.v }));
      }
    };
    update(event.clientX, event.clientY);
    const move = (next: PointerEvent) => update(next.clientX, next.clientY);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  }

  return <>
    <button ref={triggerRef} type="button" className="appearance-color-picker-button" style={{ background: value }} aria-label={`${label}颜色选择器`} aria-expanded={open} data-testid={`${testId}-picker`} onClick={() => setOpen((current) => !current)}/>
    {open && createPortal(<div ref={popoverRef} className="appearance-color-popover" role="dialog" aria-label={`${label}颜色选择器`} data-surface="overlay" data-testid={`${testId}-popover`} style={{ left: position.left, top: position.top }}>
      <div className="appearance-color-sv" onPointerDown={(event) => beginDrag(event, 'SV')} style={{ '--picker-hue': `hsl(${hsv.h} 100% 50%)` } as CSSProperties}>
        <span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}/>
      </div>
      <div className="appearance-color-hue" onPointerDown={(event) => beginDrag(event, 'HUE')}><span style={{ left: `${(hsv.h / 360) * 100}%` }}/></div>
      <div className="appearance-color-popover-value"><span style={{ background: value }}/><strong>{value}</strong></div>
    </div>, document.body)}
  </>;
}

function ColorValueField({ label, value, preview, displayText, disabled = false, onChange, testId }: {
  label: string;
  value: string;
  preview?: string;
  displayText?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const normalized = draft.trim().toUpperCase();
    if (isHexColor(normalized)) onChange(normalized);
    else setDraft(value);
  };
  return <div className={`appearance-color-value${disabled ? ' is-default' : ''}`}>
    <span className="appearance-color-swatch" style={{ background: preview ?? value }} aria-hidden="true"/>
    {displayText ? <span className="appearance-color-summary" data-testid={`${testId}-summary`}>{displayText}</span> : <input className="appearance-color-hex" value={draft} readOnly={disabled} maxLength={7} spellCheck={false} aria-label={`${label} HEX`} data-testid={`${testId}-hex`} onChange={(event) => {
      const next = event.target.value.toUpperCase();
      setDraft(next);
      if (isHexColor(next)) onChange(next);
    }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}/>}
    {disabled ? <span className="appearance-color-picker-preview" style={{ background: preview ?? value }} aria-hidden="true"/> : <ColorPickerPopover label={label} value={value} onChange={onChange} testId={testId}/>}
  </div>;
}

function BackgroundOverrideControl({ label, solid, gradient, themeDefault, defaultDescription, defaultPreview, suggestedGradient, onSolidChange, onGradientChange, testId }: {
  label: string;
  solid: string | null;
  gradient: BackgroundGradientOverride | null;
  themeDefault: string;
  defaultDescription?: string;
  defaultPreview?: string;
  suggestedGradient: BackgroundGradientOverride;
  onSolidChange: (value: string | null) => void;
  onGradientChange: (value: BackgroundGradientOverride | null) => void;
  testId: string;
}) {
  const mode = gradient ? 'GRADIENT' : solid ? 'SOLID' : 'DEFAULT';
  const description = mode === 'DEFAULT' ? (defaultDescription ?? `当前主题默认 ${themeDefault}`) : mode === 'GRADIENT' ? '覆盖当前主题的渐变 Base Color' : '覆盖当前主题的单色 Base Color';
  const selectMode = (next: string) => {
    if (next === 'DEFAULT') { onSolidChange(null); onGradientChange(null); }
    else if (next === 'SOLID') { onGradientChange(null); onSolidChange(solid ?? gradient?.from ?? themeDefault); }
    else { onSolidChange(null); onGradientChange(gradient ?? { from: solid ?? suggestedGradient.from, to: suggestedGradient.to }); }
  };

  return <div className="appearance-setting-row appearance-color-row">
    <span><strong>{label}</strong><small>{description}</small></span>
    <div className="appearance-color-controls">
      <SelectMenu value={mode} onChange={selectMode} ariaLabel={`${label}来源`} testId={`${testId}-mode`} options={[{ value: 'DEFAULT', label: '默认' }, { value: 'SOLID', label: '单色' }, { value: 'GRADIENT', label: '渐变' }]}/>
      {mode === 'GRADIENT' && gradient ? <div className="appearance-gradient-editor">
        <ColorValueField label={`${label}起始色`} value={gradient.from} onChange={(from) => onGradientChange({ ...gradient, from })} testId={`${testId}-from`}/><i>→</i><ColorValueField label={`${label}结束色`} value={gradient.to} onChange={(to) => onGradientChange({ ...gradient, to })} testId={`${testId}-to`}/>
      </div> : <ColorValueField label={label} value={solid ?? themeDefault} preview={mode === 'DEFAULT' ? defaultPreview : undefined} displayText={mode === 'DEFAULT' && defaultPreview ? '主题渐变' : undefined} disabled={mode === 'DEFAULT'} onChange={(next) => onSolidChange(next)} testId={testId}/>}
    </div>
  </div>;
}

function SolidColorOverrideControl({ label, value, themeDefault, onChange, testId }: {
  label: string;
  value: string | null;
  themeDefault: string;
  onChange: (value: string | null) => void;
  testId: string;
}) {
  const custom = value !== null;
  return <div className="appearance-setting-row appearance-color-row">
    <span><strong>{label}</strong><small>{custom ? '覆盖当前主题的 Base Color' : `当前主题默认 ${themeDefault}`}</small></span>
    <div className="appearance-color-controls">
      <SelectMenu value={custom ? 'CUSTOM' : 'DEFAULT'} onChange={(next) => onChange(next === 'CUSTOM' ? themeDefault : null)} ariaLabel={`${label}来源`} testId={`${testId}-mode`} options={[{ value: 'DEFAULT', label: '默认' }, { value: 'CUSTOM', label: '自定义' }]}/>
      <ColorValueField label={label} value={value ?? themeDefault} disabled={!custom} onChange={(next) => onChange(next)} testId={testId}/>
    </div>
  </div>;
}

export function AppearanceSettings({ appearance, onChange }: AppearanceSettingsProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const update = (patch: Partial<AppearancePreferences>) => onChange({ ...appearance, ...patch });
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveAppearance = resolveAppearance(appearance.themePreference, prefersDark);
  const themeDefaults = appearanceThemeDefaults(effectiveAppearance);

  function resetOverrides() {
    onChange({
      ...appearance,
      sidebarBackgroundOverride: null,
      sidebarBackgroundGradientOverride: null,
      workspaceBackgroundOverride: null,
      workspaceBackgroundGradientOverride: null,
      uiFont: defaultAppearancePreferences.uiFont,
      uiFontSize: defaultAppearancePreferences.uiFontSize,
      codeFont: defaultAppearancePreferences.codeFont,
      codeFontSize: defaultAppearancePreferences.codeFontSize,
      surfaceContrast: defaultAppearancePreferences.surfaceContrast,
      actionColorOverride: null,
    });
    setResetOpen(false);
    setFeedback('已恢复当前主题默认值');
  }

  return <div className="settings-section appearance-settings" data-testid="settings-appearance">
    <header><h1>外观</h1></header>
    {feedback && <div className="appearance-feedback" role="status" data-surface="floating"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback('')}>×</button></div>}

    <section className="appearance-section appearance-mode-section" aria-labelledby="appearance-mode-title">
      <div className="appearance-section-heading"><span><strong id="appearance-mode-title">模式</strong></span></div>
      <AppearanceModeControl value={appearance.themePreference} onChange={(themePreference) => update({ themePreference })}/>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-customization-title">
      <div className="appearance-section-heading"><span><strong id="appearance-customization-title">界面自定义</strong><small>只覆盖当前主题中对应的令牌，其他颜色和材质继续继承当前主题。</small></span></div>
      <div className="appearance-card appearance-customization-card">
        <BackgroundOverrideControl label="侧边栏背景" solid={appearance.sidebarBackgroundOverride} gradient={appearance.sidebarBackgroundGradientOverride} themeDefault={themeDefaults.sidebar} defaultDescription="默认与标题栏使用同一连续渐变" defaultPreview="var(--fl-brand-chrome-navigation)" suggestedGradient={effectiveAppearance === 'DARK' ? { from: '#1B1820', to: '#2B2229' } : { from: '#EFEBFF', to: '#FFEFF2' }} onSolidChange={(sidebarBackgroundOverride) => update({ sidebarBackgroundOverride, sidebarBackgroundGradientOverride: null })} onGradientChange={(sidebarBackgroundGradientOverride) => update({ sidebarBackgroundGradientOverride, sidebarBackgroundOverride: null })} testId="appearance-sidebar-background"/>
        <BackgroundOverrideControl label="工作区背景" solid={appearance.workspaceBackgroundOverride} gradient={appearance.workspaceBackgroundGradientOverride} themeDefault={themeDefaults.workspace} suggestedGradient={effectiveAppearance === 'DARK' ? { from: '#181B23', to: '#222631' } : { from: '#FFFFFF', to: '#F4F8FF' }} onSolidChange={(workspaceBackgroundOverride) => update({ workspaceBackgroundOverride, workspaceBackgroundGradientOverride: null })} onGradientChange={(workspaceBackgroundGradientOverride) => update({ workspaceBackgroundGradientOverride, workspaceBackgroundOverride: null })} testId="appearance-workspace-background"/>
        <div className="appearance-setting-row appearance-font-row"><span><strong>界面字体</strong><small>普通 UI、Conversation 正文、导航、设置和菜单。</small></span><div className="appearance-paired-controls"><SelectMenu value={appearance.uiFont} onChange={(uiFont) => update({ uiFont: uiFont as UiFont })} ariaLabel="界面字体" testId="appearance-ui-font" options={uiFontOptions}/><SelectMenu value={String(appearance.uiFontSize)} onChange={(value) => update({ uiFontSize: Number(value) as UiFontSize })} ariaLabel="界面字号" testId="appearance-ui-font-size" options={[12, 13, 14, 15, 16, 17, 18].map((value) => ({ value: String(value), label: `${value}px` }))}/></div></div>
        <div className="appearance-setting-row appearance-font-row"><span><strong>代码字体</strong><small>Code Block、Inline Code、Diff、Editor 与 Terminal。</small></span><div className="appearance-paired-controls"><SelectMenu value={appearance.codeFont} onChange={(codeFont) => update({ codeFont: codeFont as CodeFont })} ariaLabel="代码字体" testId="appearance-code-font" options={codeFontOptions}/><SelectMenu value={String(appearance.codeFontSize)} onChange={(value) => update({ codeFontSize: Number(value) as CodeFontSize })} ariaLabel="代码字号" testId="appearance-code-font-size" options={[11, 12, 13, 14, 15, 16, 17].map((value) => ({ value: String(value), label: `${value}px` }))}/></div></div>
        <div className="appearance-setting-row appearance-contrast-row"><span><strong>对比度</strong><small>只调整中性 Surface、输入框、选中/悬停和边框层级。</small></span><label><input type="range" min="0" max="100" step="1" value={appearance.surfaceContrast} style={{ '--appearance-contrast-progress': `${appearance.surfaceContrast}%` } as CSSProperties} onChange={(event) => update({ surfaceContrast: Number(event.target.value) })} aria-label="对比度" data-testid="appearance-surface-contrast"/><output>{appearance.surfaceContrast}</output></label></div>
        <SolidColorOverrideControl label="按钮颜色" value={appearance.actionColorOverride} themeDefault={themeDefaults.action} onChange={(actionColorOverride) => update({ actionColorOverride })} testId="appearance-action-color"/>
      </div>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-accessibility-title">
      <div className="appearance-section-heading"><span><strong id="appearance-accessibility-title">可访问性</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row"><span><strong>减少动态效果</strong></span><SelectMenu value={appearance.reducedMotionPreference} onChange={(value) => update({ reducedMotionPreference: value as ReducedMotionPreference })} ariaLabel="减少动态效果" testId="appearance-reduced-motion" options={[{ value: 'SYSTEM', label: '跟随系统' }, { value: 'REDUCE', label: '开启' }, { value: 'FULL', label: '关闭' }]}/></div>
        <div className="appearance-setting-row"><span><strong>高对比度</strong></span><SettingsToggle value={appearance.highContrast} onChange={(highContrast) => update({ highContrast })} label="高对比度" testId="appearance-high-contrast"/></div>
        <div className="appearance-setting-row"><span><strong>平滑滚动</strong></span><SettingsToggle value={appearance.smoothScrolling} onChange={(smoothScrolling) => update({ smoothScrolling })} label="平滑滚动" testId="appearance-smooth-scrolling"/></div>
      </div>
    </section>

    <footer className="appearance-footer"><button type="button" onClick={() => setResetOpen(true)} data-testid="appearance-reset">恢复当前主题默认值</button></footer>
    {resetOpen && <TextActionDialog title="恢复当前主题默认值？" description="只清除这 6 项界面 Override；外观模式、可访问性、模型和项目设置不会改变。" confirmLabel="恢复默认" onCancel={() => setResetOpen(false)} onConfirm={resetOverrides} testId="appearance-reset-dialog"/>}
  </div>;
}
