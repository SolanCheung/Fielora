import { useCallback, useEffect, useState } from 'react';
import type { FieldSummary, FieldView, HealthDTO } from '@fielora/contracts';
import { focusLabel, screenFor } from './view-state';

export function App() {
  const [health, setHealth] = useState<HealthDTO>();
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selected, setSelected] = useState<FieldView>();
  const [focus, setFocus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshHealth = useCallback(async () => {
    try {
      const next = await window.fielora.core.getHealth();
      setHealth(next);
      if (next.state === 'READY') setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const refreshFields = useCallback(async () => {
    try { setFields(await window.fielora.field.list()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 350);
    const unsubscribe = window.fielora.core.subscribe((event) => {
      if (event.event === 'event.core.health' && 'error' in event && event.error) setError(event.error);
      void refreshHealth();
      void refreshFields();
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [refreshFields, refreshHealth]);

  useEffect(() => { if (health?.state === 'READY') void refreshFields(); }, [health?.state, refreshFields]);

  useEffect(() => {
    if (health?.state !== 'READY' || !selected?.id) return;
    void window.fielora.field.get({ field_id: selected.id }).then(setSelected).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [health?.state, selected?.id]);

  async function createField(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await window.fielora.field.create({
        title: String(form.get('title') ?? ''),
        goal: String(form.get('goal') ?? '') || null,
      });
      await refreshFields();
      event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function openField(fieldId: string) {
    setBusy(true);
    try {
      const resume = await window.fielora.surface.latestSnapshot({ field_id: fieldId });
      setSelected(resume.field);
      setFocus(focusLabel(resume.field.current_focus) === '尚未设置当前焦点' ? '' : focusLabel(resume.field.current_focus));
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function updateFocus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await window.fielora.field.updateFocus({
        field_id: selected.id,
        expected_revision: selected.revision,
        focus,
      });
      await window.fielora.surface.saveSnapshot({
        field_id: selected.id,
        layout: { primary: 'FIELD', supporting: [] },
        open_objects: [],
      });
      setSelected(updated);
      await refreshFields();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  const screen = screenFor(health, selected?.id);
  if (screen === 'startup') {
    const failed = health && ['UNAVAILABLE', 'DEGRADED'].includes(health.state);
    return <main className="startup" data-testid="startup-screen">
      <div className="brand-mark">F</div>
      <h1>{failed ? 'Fielora Core 暂时不可用' : '正在启动 Fielora…'}</h1>
      <p>{failed ? (error || '核心服务未能启动。你可以重试，或打开日志目录查看详情。') : '正在恢复你的 Field Reality。'}</p>
      {failed && <div className="actions">
        <button onClick={() => void window.fielora.core.retry()} data-testid="retry-core">重试</button>
        <button className="secondary" onClick={() => void window.fielora.core.openLogs()}>打开日志目录</button>
        <button className="quiet" onClick={() => void window.fielora.core.quit()}>退出</button>
      </div>}
    </main>;
  }

  if (screen === 'field' && selected) {
    return <div className="shell" data-testid="field-screen">
      <aside><div className="wordmark"><span>F</span> Fielora</div><button className="nav active">Fields</button></aside>
      <main className="content">
        <button className="back" onClick={() => setSelected(undefined)}>← 返回 Now</button>
        <header className="field-header"><div><p className="eyebrow">FIELD</p><h1 data-testid="field-title">{selected.title}</h1><p>{selected.goal || '这个 Field 还没有目标说明。'}</p></div><span className="mode">Focus</span></header>
        <section className="focus-card">
          <p className="eyebrow">CURRENT FOCUS</p>
          <h2 data-testid="current-focus">{focusLabel(selected.current_focus)}</h2>
          <form onSubmit={updateFocus} className="focus-form">
            <input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="现在最重要的工作是什么？" data-testid="focus-input" />
            <button disabled={busy} data-testid="save-focus">保存焦点</button>
          </form>
          <p className="resume-note">Fielora 会保存当前 Reality 与此设备的工作面，重启后从这里继续。</p>
        </section>
        {error && <p className="error">{error}</p>}
      </main>
    </div>;
  }

  return <div className="shell" data-testid="now-screen">
    <aside><div className="wordmark"><span>F</span> Fielora</div><button className="nav active">Now</button><button className="nav">Fields</button></aside>
    <main className="content">
      <header className="now-header"><div><p className="eyebrow">NOW</p><h1>继续真正重要的工作</h1><p>你的 Field Reality 已从本地安全恢复。</p></div></header>
      <div className="now-grid">
        <section className="continue"><h2>继续</h2>
          {fields.length === 0 ? <div className="empty"><h3>从第一个 Field 开始</h3><p>为一件需要持续推进的事情保存目标、焦点和工作现场。</p></div>
            : fields.slice(0, 3).map((field) => <button className="field-row" key={field.id} onClick={() => void openField(field.id)} data-testid={`field-${field.title}`}>
              <span><strong>{field.title}</strong><small>{field.goal || '未设置目标'}</small></span><em>{focusLabel(field.current_focus)} →</em>
            </button>)}
        </section>
        <section className="create"><h2>创建 Field</h2><form onSubmit={createField}>
          <label>名称<input name="title" required maxLength={120} placeholder="例如：Fielora / Build V0.1" data-testid="create-title" /></label>
          <label>目标（可选）<textarea name="goal" maxLength={4000} placeholder="这个 Field 要推进什么？" data-testid="create-goal" /></label>
          <button disabled={busy} data-testid="create-field">创建 Field</button>
        </form></section>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  </div>;
}
