import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActivityView, FieldResumeV1View, FieldStateKind, FieldSummary, HealthDTO,
  ReferenceView, StateView, SurfaceLayoutV1,
} from '@fielora/contracts';
import fieloraLogo from '../../assets/fielora-logo.svg';
import fieloraMark from '../../assets/fielora-mark.svg';
import { focusLabel, screenFor } from './view-state';

function BrandWordmark() {
  return <div className="wordmark"><img src={fieloraMark} alt="" aria-hidden="true" /><span>Fielora</span></div>;
}

function paneId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const time = BigInt(Date.now());
  for (let index = 0; index < 6; index += 1) bytes[index] = Number((time >> BigInt((5 - index) * 8)) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `pane_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function continuationLabel(resume: FieldResumeV1View): string {
  const { continuation } = resume;
  if (continuation.target.kind === 'LEGACY_TEXT') return continuation.target.label;
  if (continuation.target.kind === 'STATE') {
    const stateId = continuation.target.state_id;
    const item = [...resume.active_blockers, ...resume.active_questions, ...resume.active_tasks].find((state) => state.id === stateId);
    return item?.content_excerpt ?? '继续当前 State';
  }
  if (continuation.target.kind === 'REFERENCE') return '继续当前 Reference';
  return '回到 Field 总览';
}

export function App() {
  const [health, setHealth] = useState<HealthDTO>();
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [resume, setResume] = useState<FieldResumeV1View>();
  const [states, setStates] = useState<StateView[]>([]);
  const [references, setReferences] = useState<ReferenceView[]>([]);
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshHealth = useCallback(async () => {
    try { const next = await window.fielora.core.getHealth(); setHealth(next); if (next.state === 'READY') setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);
  const refreshFields = useCallback(async () => {
    try { setFields(await window.fielora.field.list()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);
  const refreshReality = useCallback(async (fieldId: string) => {
    const [nextResume, nextStates, activeReferences, archivedReferences, nextActivities] = await Promise.all([
      window.fielora.field.resumeV1({ field_id: fieldId }),
      window.fielora.state.list({ field_id: fieldId, kind: null, status: null, cursor: null, limit: 100 }),
      window.fielora.reference.list({ field_id: fieldId, lifecycle: 'ACTIVE', cursor: null, limit: 100 }),
      window.fielora.reference.list({ field_id: fieldId, lifecycle: 'ARCHIVED', cursor: null, limit: 100 }),
      window.fielora.activity.list({ field_id: fieldId, cursor: null, limit: 50 }),
    ]);
    setResume(nextResume); setStates(nextStates.items); setReferences([...activeReferences.items, ...archivedReferences.items]); setActivities(nextActivities.items);
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 350);
    const unsubscribe = window.fielora.core.subscribe((event) => {
      if (event.event === 'event.core.health' && 'error' in event && event.error) setError(event.error);
      void refreshHealth(); void refreshFields();
      if (event.event === 'event.field.changed' && resume?.field.id === event.field_id) void refreshReality(event.field_id);
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [refreshFields, refreshHealth, refreshReality, resume?.field.id]);
  useEffect(() => { if (health?.state === 'READY') { void refreshFields(); if (resume?.field.id) void refreshReality(resume.field.id); } }, [health?.state, refreshFields, refreshReality, resume?.field.id]);

  async function run(action: () => Promise<unknown>, fieldId?: string) {
    setBusy(true); setError('');
    try { await action(); if (fieldId) await refreshReality(fieldId); await refreshFields(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function createField(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const target = event.currentTarget;
    await run(async () => { await window.fielora.field.create({ title: String(form.get('title') ?? ''), goal: String(form.get('goal') ?? '') || null }); target.reset(); });
  }
  async function openField(fieldId: string) { setBusy(true); try { await refreshReality(fieldId); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }
  async function createState(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resume) return; const form = new FormData(event.currentTarget); const target = event.currentTarget;
    await run(async () => { await window.fielora.state.create({ field_id: resume.field.id, kind: String(form.get('kind')) as FieldStateKind, content: String(form.get('content') ?? ''), confidence: null }); target.reset(); }, resume.field.id);
  }
  async function createReference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resume) return; const form = new FormData(event.currentTarget); const target = event.currentTarget;
    await run(async () => { await window.fielora.reference.create({ field_id: resume.field.id, title: String(form.get('title') ?? ''), url: String(form.get('url') ?? '') }); target.reset(); }, resume.field.id);
  }
  async function focusState(state: StateView) { if (!resume) return; await run(() => window.fielora.field.setFocusV1({ field_id: resume.field.id, expected_field_revision: resume.field_revision, focus: { kind: 'STATE', state_id: state.id } }), resume.field.id); }
  async function transitionState(state: StateView, target: 'ACTIVE' | 'RESOLVED' | 'RETRACTED') { if (!resume) return; await run(() => window.fielora.state.transition({ field_id: resume.field.id, state_id: state.id, expected_state_revision: state.revision, target }), resume.field.id); }
  async function supersedeState(state: StateView) { if (!resume) return; const content = window.prompt('Replacement State', state.content); if (!content) return; await run(() => window.fielora.state.supersede({ field_id: resume.field.id, state_id: state.id, expected_state_revision: state.revision, replacement_content: content, replacement_confidence: state.confidence }), resume.field.id); }
  async function reviseState(state: StateView) { if (!resume) return; const content = window.prompt('Revise State', state.content); if (!content) return; await run(() => window.fielora.state.revise({ field_id: resume.field.id, state_id: state.id, expected_state_revision: state.revision, content, confidence: state.confidence }), resume.field.id); }
  async function openReference(reference: ReferenceView) {
    if (!resume || reference.lifecycle !== 'ACTIVE') return;
    const layout: SurfaceLayoutV1 = { version: 1, template: 'PRIMARY_SUPPORT_RIGHT', primary: { pane_id: 'primary_task', primitive: 'TASK_PANE', binding: { kind: 'FIELD_TASKS' }, collapsed: false }, supporting: [{ pane_id: paneId(), primitive: 'REFERENCE_PANE', binding: { kind: 'REFERENCE', object_id: reference.id }, collapsed: false }], focused_pane_id: 'primary_task' };
    await run(async () => { await window.fielora.surface.saveSnapshotV1({ field_id: resume.field.id, layout }); await window.fielora.field.setFocusV1({ field_id: resume.field.id, expected_field_revision: resume.field_revision, focus: { kind: 'REFERENCE', object_id: reference.id } }); }, resume.field.id);
  }
  async function closeReferencePane() { if (!resume) return; await run(() => window.fielora.surface.saveSnapshotV1({ field_id: resume.field.id, layout: { version: 1, template: 'PRIMARY_ONLY', primary: { pane_id: 'primary_task', primitive: 'TASK_PANE', binding: { kind: 'FIELD_TASKS' }, collapsed: false }, supporting: [], focused_pane_id: 'primary_task' } }), resume.field.id); }
  async function archiveReference(reference: ReferenceView) { if (!resume) return; await run(() => window.fielora.reference.archive({ field_id: resume.field.id, object_id: reference.id, expected_object_revision: reference.revision }), resume.field.id); }
  async function restoreReference(reference: ReferenceView) { if (!resume) return; await run(() => window.fielora.reference.restore({ field_id: resume.field.id, object_id: reference.id, expected_object_revision: reference.revision }), resume.field.id); }

  const tasks = useMemo(() => states.filter((state) => state.kind === 'TASK' && !['SUPERSEDED', 'RETRACTED'].includes(state.status)), [states]);
  const supportingReferenceId = resume?.layout.supporting.find((pane) => pane.binding.kind === 'REFERENCE')?.binding;
  const supportingReference = supportingReferenceId?.kind === 'REFERENCE' ? references.find((reference) => reference.id === supportingReferenceId.object_id) : undefined;
  const screen = screenFor(health, resume?.field.id);

  if (screen === 'startup') {
    const failed = health && ['UNAVAILABLE', 'DEGRADED'].includes(health.state);
    return <main className="startup" data-testid="startup-screen"><img className="brand-logo" src={fieloraLogo} alt="Fielora" /><h1>{failed ? 'Fielora Core 暂时不可用' : '正在启动 Fielora…'}</h1><p>{failed ? (error || '核心服务未能启动。你可以重试，或打开日志目录查看详情。') : '正在恢复你的 Field Reality。'}</p>{failed && <div className="actions"><button onClick={() => void window.fielora.core.retry()} data-testid="retry-core">重试</button><button className="secondary" onClick={() => void window.fielora.core.openLogs()}>打开日志目录</button><button className="quiet" onClick={() => void window.fielora.core.quit()}>退出</button></div>}</main>;
  }

  if (screen === 'field' && resume) {
    return <div className="shell" data-testid="field-screen"><aside><BrandWordmark /><button className="nav active">Fields</button></aside><main className="content field-content">
      <button className="back" onClick={() => { setResume(undefined); setInspectorOpen(false); }}>← 返回 Now</button>
      <header className="field-header"><div><p className="eyebrow">FIELD · REV {resume.field_revision}</p><h1 data-testid="field-title">{resume.field.title}</h1><p>{resume.field.goal || '这个 Field 还没有目标说明。'}</p></div><div className="field-tools"><select aria-label="Field mode" value={resume.field.current_mode ?? ''} onChange={(event) => void run(() => window.fielora.field.updateMode({ field_id: resume.field.id, expected_field_revision: resume.field_revision, mode: event.target.value ? event.target.value as never : null }), resume.field.id)}><option value="">No mode</option>{['EXPLORE','THINK','BUILD','OPERATE','VERIFY'].map((mode)=><option key={mode}>{mode}</option>)}</select><button className="secondary-button" onClick={() => setInspectorOpen((open) => !open)} data-testid="toggle-inspector">{inspectorOpen ? '关闭 Context' : '打开 Context'}</button></div></header>
      <div className="resume-strip"><span>继续</span><strong data-testid="current-focus">{continuationLabel(resume)}</strong><small>{resume.snapshot_freshness} · {resume.layout_source}</small></div>
      <div className={`surface ${resume.layout.template !== 'PRIMARY_ONLY' ? 'with-support' : ''}`} data-template={resume.layout.template}>
        <section className="task-pane" data-testid="task-pane"><div className="pane-heading"><div><p className="eyebrow">TASK PANE</p><h2>推进中的工作</h2></div><span>{tasks.filter((task) => task.status === 'ACTIVE').length} active</span></div>
          {tasks.length === 0 ? <div className="empty task-empty" data-testid="empty-task-pane"><h3>这里还没有 Task</h3><p>空工作面也是有效 Reality；Fielora 不会创建占位内容。</p></div> : <div className="state-list">{tasks.map((state)=><article className={`state-row ${state.status.toLowerCase()}`} key={state.id}><button className="state-main" onClick={() => void focusState(state)}><span>{state.content}</span><small>{state.status} · r{state.revision}</small></button><div className="row-actions">{state.status === 'ACTIVE' && <button onClick={() => void transitionState(state,'RESOLVED')}>完成</button>}{state.status === 'RESOLVED' && <button onClick={() => void transitionState(state,'ACTIVE')}>重开</button>}<button onClick={() => void reviseState(state)}>修订</button><button onClick={() => void supersedeState(state)}>替代</button></div></article>)}</div>}
          <form className="quick-create" onSubmit={createState}><select name="kind" defaultValue="TASK"><option>TASK</option><option>QUESTION</option><option>BLOCKER</option><option>FACT</option><option>DECISION</option><option>ASSUMPTION</option><option>RESULT</option></select><input name="content" required maxLength={4000} placeholder="记录一个当前 State…" data-testid="create-state-content" /><button type="submit" disabled={busy} data-testid="create-state">添加</button></form>
        </section>
        {resume.layout.template !== 'PRIMARY_ONLY' && <section className="reference-pane" data-testid="reference-pane"><div className="pane-heading"><div><p className="eyebrow">REFERENCE PANE</p><h2>{supportingReference?.title ?? 'Reference unavailable'}</h2></div><button className="icon-button" onClick={() => void closeReferencePane()}>×</button></div>{supportingReference?.lifecycle === 'ACTIVE' ? <><p className="inert-url">{supportingReference.canonical_url}</p><p className="muted">这是 inert reference；Phase 02 不会发起网络访问。</p><button className="danger-link" onClick={() => void archiveReference(supportingReference)}>Archive</button></> : <div className="empty"><p>Snapshot 引用已归档或缺失。当前 Reality 未被旧工作面覆盖。</p></div>}</section>}
      </div>
      {inspectorOpen && <section className="context-inspector" data-testid="context-inspector"><div className="inspector-head"><div><p className="eyebrow">ON-DEMAND CONTEXT</p><h2>Reality & lineage</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)}>×</button></div><div className="inspector-grid"><div><h3>Questions & blockers</h3>{states.filter((state)=>['QUESTION','BLOCKER'].includes(state.kind)&&state.status==='ACTIVE').map((state)=><article className="context-row" key={state.id}><button onClick={() => void focusState(state)}>{state.kind}: {state.content}</button><div><button onClick={() => void transitionState(state,'RESOLVED')}>Resolve</button><button onClick={() => void supersedeState(state)}>Supersede</button></div></article>)}</div><div><h3>References</h3>{references.map((reference)=><article className="context-row" key={reference.id}><div><strong>{reference.title}</strong><small>{reference.lifecycle}</small></div><div>{reference.lifecycle==='ACTIVE'?<><button onClick={() => void openReference(reference)} data-testid={`open-reference-${reference.title}`}>打开工作面</button><button onClick={() => void archiveReference(reference)}>Archive</button></>:<button onClick={() => void restoreReference(reference)}>Restore</button>}</div></article>)}<form className="reference-create" onSubmit={createReference}><input name="title" required maxLength={120} placeholder="Reference title" data-testid="reference-title" /><input name="url" required maxLength={2048} placeholder="https://…" data-testid="reference-url" /><button type="submit" disabled={busy} data-testid="create-reference">保存 Reference</button></form></div><div><h3>Recent activity</h3>{activities.slice(0,8).map((activity)=><div className="activity-row" key={activity.id}><span>{activity.action.replaceAll('_',' ')}</span><small>{new Date(activity.created_at).toLocaleTimeString()}</small></div>)}</div></div></section>}
      {error && <p className="error">{error}</p>}
    </main></div>;
  }

  return <div className="shell" data-testid="now-screen"><aside><BrandWordmark /><button className="nav active">Now</button><button className="nav">Fields</button></aside><main className="content"><header className="now-header"><div><p className="eyebrow">NOW</p><h1>继续真正重要的工作</h1><p>你的 Field Reality 已从本地安全恢复。</p></div></header><div className="now-grid"><section className="continue"><h2>继续</h2>{fields.length === 0 ? <div className="empty"><h3>从第一个 Field 开始</h3><p>为一件需要持续推进的事情保存目标、State、来源和工作现场。</p></div> : fields.slice(0,3).map((field)=><button className="field-row" key={field.id} onClick={() => void openField(field.id)} data-testid={`field-${field.title}`}><span><strong>{field.title}</strong><small>{field.goal || '未设置目标'}</small></span><em>{focusLabel(field.current_focus)} →</em></button>)}</section><section className="create"><h2>创建 Field</h2><form onSubmit={createField}><label>名称<input name="title" required maxLength={120} placeholder="例如：Fielora / Build V0.1" data-testid="create-title" /></label><label>目标（可选）<textarea name="goal" maxLength={4000} placeholder="这个 Field 要推进什么？" data-testid="create-goal" /></label><button disabled={busy} data-testid="create-field">创建 Field</button></form></section></div>{error && <p className="error">{error}</p>}</main></div>;
}
