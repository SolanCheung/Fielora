import { useState } from 'react';
import type { AppearanceMode, AppearancePreferences, ReducedMotionPreference, UiFontScale } from './app-preferences';
import { defaultAppearancePreferences } from './app-preferences';
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

export function AppearanceSettings({ appearance, onChange }: AppearanceSettingsProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const update = (patch: Partial<AppearancePreferences>) => onChange({ ...appearance, ...patch });

  function resetAppearance() {
    onChange({ ...defaultAppearancePreferences, advancedColorOverrides: {} });
    setResetOpen(false);
    setFeedback('已恢复默认外观');
  }

  return <div className="settings-section appearance-settings" data-testid="settings-appearance">
    <header><h1>外观</h1></header>
    {feedback && <div className="appearance-feedback" role="status" data-surface="floating"><span>{feedback}</span><button type="button" aria-label="关闭提示" onClick={() => setFeedback('')}>×</button></div>}

    <section className="appearance-section appearance-mode-section" aria-labelledby="appearance-mode-title">
      <div className="appearance-section-heading"><span><strong id="appearance-mode-title">模式</strong></span></div>
      <AppearanceModeControl value={appearance.themePreference} onChange={(themePreference) => update({ themePreference })}/>
    </section>

    <section className="appearance-section" aria-labelledby="appearance-accessibility-title">
      <div className="appearance-section-heading"><span><strong id="appearance-accessibility-title">可访问性</strong></span></div>
      <div className="appearance-card">
        <div className="appearance-setting-row"><span><strong>界面字体大小</strong></span><SelectMenu value={String(appearance.uiFontScale)} onChange={(value) => update({ uiFontScale: Number(value) as UiFontScale })} ariaLabel="界面字体大小" testId="appearance-font-scale" options={[90, 95, 100, 105, 110, 115, 120].map((value) => ({ value: String(value), label: `${value}%` }))}/></div>
        <div className="appearance-setting-row"><span><strong>减少动态效果</strong></span><SelectMenu value={appearance.reducedMotionPreference} onChange={(value) => update({ reducedMotionPreference: value as ReducedMotionPreference })} ariaLabel="减少动态效果" testId="appearance-reduced-motion" options={[{ value: 'SYSTEM', label: '跟随系统' }, { value: 'REDUCE', label: '开启' }, { value: 'FULL', label: '关闭' }]}/></div>
        <div className="appearance-setting-row"><span><strong>高对比度</strong></span><SettingsToggle value={appearance.highContrast} onChange={(highContrast) => update({ highContrast })} label="高对比度" testId="appearance-high-contrast"/></div>
        <div className="appearance-setting-row"><span><strong>平滑滚动</strong></span><SettingsToggle value={appearance.smoothScrolling} onChange={(smoothScrolling) => update({ smoothScrolling })} label="平滑滚动" testId="appearance-smooth-scrolling"/></div>
      </div>
    </section>

    <footer className="appearance-footer"><button type="button" onClick={() => setResetOpen(true)} data-testid="appearance-reset">恢复默认外观</button></footer>
    {resetOpen && <TextActionDialog title="恢复默认外观？" description="只重置外观模式和可访问性选项，不影响模型、项目或其它设置。" confirmLabel="恢复默认" danger onCancel={() => setResetOpen(false)} onConfirm={resetAppearance} testId="appearance-reset-dialog"/>}
  </div>;
}
