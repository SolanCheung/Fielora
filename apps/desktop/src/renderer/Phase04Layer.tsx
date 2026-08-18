import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CaptureSource,
  CaptureView,
  ContextChip,
  FieldSummary,
  ModelInvocationEvent,
  ProviderConfigView,
  ProviderKind,
} from '@fielora/contracts';
import {
  captureKindLabels,
  capturePreview,
  captureSourceLabel,
  captureStateLabel,
  contextKindLabels,
  contextSummary,
  inferUserNoteSensitivity,
  invocationStatusLabel,
  providerKindLabels,
} from './phase04-presentation';

type ExperienceSurface = 'SUMMON' | 'INBOX' | 'PROVIDER_SETUP' | null;
type CaptureAction = { captureId: string; mode: 'ATTACH' | 'PROMOTE' } | null;
type InvocationStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

const emptySource = (kind: CaptureSource['kind']): CaptureSource => ({
  kind,
  title: null,
  uri: null,
  field_id: null,
  resource_type: null,
  resource_id: null,
  resource_revision: null,
  provider_config_id: null,
  provider_model_id: null,
  provider_invocation_id: null,
  is_partial: false,
});

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function contextContentFits(value: string): boolean {
  return [...value].length <= 4000 && new TextEncoder().encode(value).byteLength <= 16 * 1024;
}

function contextPackageFits(items: ContextChip[]): boolean {
  return items.length <= 8
    && items.reduce((total, item) => total + [...item.content].length, 0) <= 12000
    && items.reduce((total, item) => total + new TextEncoder().encode(item.content).byteLength, 0) <= 48 * 1024;
}

function contextDetail(chip: ContextChip): string {
  if (chip.kind === 'CURRENT_FIELD' || chip.kind === 'CURRENT_FOCUS') return '发送时由 Fielora 从当前 Field 重新读取';
  if (chip.kind === 'CURRENT_SELECTION') return '来自当前网页选区';
  if (chip.kind === 'CURRENT_PAGE') return '来自当前网页';
  if (chip.kind === 'CAPTURE') return '来自已保存的 Capture';
  return '仅用于本次提问，不会自动保存';
}

export function Phase04Layer() {
  const [surface, setSurface] = useState<ExperienceSurface>(null);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [providerId, setProviderId] = useState('');
  const [providerKind, setProviderKind] = useState<ProviderKind>('OPENAI');
  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [probeState, setProbeState] = useState<{ invocationId: string; providerId: string; label: string } | null>(null);
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [output, setOutput] = useState('');
  const [toolProposals, setToolProposals] = useState<string[]>([]);
  const [invocationId, setInvocationId] = useState('');
  const [terminal, setTerminal] = useState<InvocationStatus>('IDLE');
  const [usage, setUsage] = useState('');
  const [captures, setCaptures] = useState<CaptureView[]>([]);
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [expandedCaptureId, setExpandedCaptureId] = useState('');
  const [captureAction, setCaptureAction] = useState<CaptureAction>(null);
  const [error, setError] = useState('');
  const [customAck, setCustomAck] = useState(false);
  const [sendAck, setSendAck] = useState(false);
  const [sensitiveAck, setSensitiveAck] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const invocationRef = useRef('');
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.lifecycle_status !== 'REMOVED'),
    [providers],
  );
  const activeProvider = availableProviders.find((provider) => provider.id === providerId);
  const activeCaptures = useMemo(
    () => captures.filter((capture) => capture.lifecycle_status === 'ACTIVE'),
    [captures],
  );
  const hasSensitiveContext = chips.some((chip) => chip.sensitivity === 'SENSITIVE');

  const refresh = useCallback(async () => {
    const [nextProviders, nextCaptures, nextFields] = await Promise.all([
      window.fielora.provider.list(),
      window.fielora.capture.list({ placement: null, lifecycle: null, field_id: null, cursor: null, limit: 100 }),
      window.fielora.field.list(),
    ]);
    setProviders(nextProviders);
    setCaptures(nextCaptures.items);
    setFields(nextFields);
    setProviderId((current) => nextProviders.some((item) => item.id === current)
      ? current
      : (nextProviders.find((item) => item.lifecycle_status === 'ACTIVE')?.id ?? nextProviders[0]?.id ?? ''));
  }, []);

  const rememberFocus = useCallback(() => {
    if (surface === null && document.activeElement instanceof HTMLElement) previousFocusRef.current = document.activeElement;
  }, [surface]);

  const showSurface = useCallback((next: Exclude<ExperienceSurface, null>) => {
    rememberFocus();
    setError('');
    setSurface(next);
    void window.fielora.browser.hide().catch(() => undefined);
    void refresh().catch((reason) => setError(message(reason)));
  }, [refresh, rememberFocus]);

  const close = useCallback(() => {
    setSurface(null);
    setError('');
    setContextOpen(false);
    setCaptureAction(null);
    window.dispatchEvent(new Event('resize'));
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

  const summon = useCallback(async () => {
    rememberFocus();
    setError('');
    const next: ContextChip[] = [];
    let contextNotice = '';
    const fieldId = document.body.dataset.activeFieldId;
    if (fieldId) {
      next.push({ kind: 'CURRENT_FIELD', source_identity: fieldId, source_revision_or_navigation_generation: 'authoritative', display_label: '当前 Field', content: 'Core will re-read the current Field', sensitivity: 'NORMAL', completeness: 'COMPLETE' });
      next.push({ kind: 'CURRENT_FOCUS', source_identity: fieldId, source_revision_or_navigation_generation: 'authoritative', display_label: '当前关注', content: 'Core will re-read the current focus', sensitivity: 'NORMAL', completeness: 'COMPLETE' });
    }
    try {
      const page = await window.fielora.browser.getContextCandidate();
      const extractedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const pageContent = `${page.url}\n\n${page.page_text}`;
      const pageChip: ContextChip = {
        kind: 'CURRENT_PAGE',
        source_identity: page.page_id,
        source_revision_or_navigation_generation: String(page.navigation_generation),
        display_label: (page.title || page.url).slice(0, 160),
        content: pageContent,
        sensitivity: 'NORMAL',
        completeness: page.is_partial ? 'PARTIAL' : 'COMPLETE',
      };
      if (contextContentFits(pageContent) && contextPackageFits([...next, pageChip])) next.push(pageChip);
      else contextNotice = '当前网页内容较长，未自动加入上下文。你可以选择一小段文字，或先捕获后再使用。';
      if (page.selection_text) {
        const selectionChip: ContextChip = {
          kind: 'CURRENT_SELECTION',
          source_identity: page.page_id,
          source_revision_or_navigation_generation: String(page.navigation_generation),
          display_label: `当前选区 · ${page.title || page.url} · ${extractedAt}`.slice(0, 160),
          content: page.selection_text,
          sensitivity: 'NORMAL',
          completeness: 'COMPLETE',
        };
        if (contextContentFits(page.selection_text) && contextPackageFits([...next, selectionChip])) next.push(selectionChip);
        else contextNotice = '当前选区内容较长，未自动加入上下文。请缩小选区后重试。';
      }
    } catch {
      // Now and Field surfaces do not have a Browse context candidate.
    }
    setChips(next);
    setSensitiveAck(false);
    setContextOpen(false);
    setError(contextNotice);
    setSurface('SUMMON');
    await window.fielora.browser.hide().catch(() => undefined);
    void refresh().catch((reason) => setError(message(reason)));
  }, [refresh, rememberFocus]);

  useEffect(() => {
    const openInbox = () => showSurface('INBOX');
    const openProviderSetup = () => { setProviderFormOpen(false); showSurface('PROVIDER_SETUP'); };
    const openSummon = () => { void summon(); };
    window.addEventListener('fielora:open-inbox', openInbox);
    window.addEventListener('fielora:open-provider-setup', openProviderSetup);
    window.addEventListener('fielora:open-summon', openSummon);
    return () => {
      window.removeEventListener('fielora:open-inbox', openInbox);
      window.removeEventListener('fielora:open-provider-setup', openProviderSetup);
      window.removeEventListener('fielora:open-summon', openSummon);
    };
  }, [showSurface, summon]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        if (surface) close(); else void summon();
      }
      if (event.key === 'Escape' && surface) close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, summon, surface]);

  useEffect(() => window.fielora.core.subscribe((event) => {
    if (event.event !== 'event.model.invocation') return;
    const model = event as ModelInvocationEvent;
    if (probeState?.invocationId === model.invocation_id) {
      if (model.kind === 'COMPLETED') setProbeState((current) => current ? { ...current, label: '连接正常' } : null);
      if (model.kind === 'FAILED') setProbeState((current) => current ? { ...current, label: '连接失败' } : null);
      if (model.kind === 'CANCELLED') setProbeState((current) => current ? { ...current, label: '测试已取消' } : null);
      return;
    }
    if (model.invocation_id !== invocationRef.current) return;
    if (model.kind === 'OUTPUT_TEXT_DELTA' && model.text_delta) setOutput((value) => value + model.text_delta);
    if (model.kind === 'TOOL_PROPOSAL' && model.tool_proposal) setToolProposals((items) => [...items, `${model.tool_proposal?.name ?? 'tool'} · ${JSON.stringify(model.tool_proposal?.arguments ?? {})}`]);
    if (model.kind === 'USAGE' && model.usage) setUsage(`${model.usage.input_tokens ?? '?'} 输入 / ${model.usage.output_tokens ?? '?'} 输出`);
    if (model.kind === 'COMPLETED') setTerminal('COMPLETED');
    if (model.kind === 'CANCELLED') setTerminal('CANCELLED');
    if (model.kind === 'FAILED') { setTerminal('FAILED'); setError(model.error_code ?? '模型服务暂时不可用'); }
  }), [probeState?.invocationId]);

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProvider) { setError('尚未配置可用的模型服务。'); return; }
    if (activeProvider.endpoint_class === 'CUSTOM' && !sendAck) { setError('发送到自定义服务前，需要完成本次确认。'); return; }
    if (hasSensitiveContext && !sensitiveAck) { setError('这次上下文包含敏感内容，需要本次明确确认。'); return; }
    const data = new FormData(event.currentTarget);
    setOutput(''); setToolProposals([]); setUsage(''); setTerminal('RUNNING'); setError('');
    try {
      const result = await window.fielora.model.start({
        provider_config_id: activeProvider.id,
        model_id: null,
        intent: 'ASK',
        user_input: String(data.get('prompt') ?? ''),
        context_package: chips,
        response_mode: 'TEXT',
      });
      invocationRef.current = result.invocation_id;
      setInvocationId(result.invocation_id);
    } catch (reason) {
      setTerminal('FAILED');
      setError(message(reason));
    }
  }

  async function cancel() {
    if (invocationId) await window.fielora.model.cancel({ invocation_id: invocationId }).catch((reason) => setError(message(reason)));
  }

  async function saveOutput() {
    if (!activeProvider || !output) return;
    const source = emptySource('MODEL_RESPONSE');
    source.provider_config_id = activeProvider.id;
    source.provider_model_id = activeProvider.default_model;
    source.provider_invocation_id = invocationId;
    source.is_partial = terminal !== 'COMPLETED';
    try {
      await window.fielora.capture.create({ kind: terminal === 'COMPLETED' ? 'MODEL_OUTPUT' : 'TEXT', title: '模型回答', content: output, source });
      await refresh();
      setError('回答已捕获到 Inbox。');
    } catch (reason) { setError(message(reason)); }
  }

  async function createProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    try {
      const custom = providerKind === 'OPENAI_COMPATIBLE';
      const provider = await window.fielora.provider.create({
        provider_kind: providerKind,
        display_name: String(data.get('display_name') ?? ''),
        base_url: custom ? String(data.get('base_url') ?? '') : null,
        default_model: String(data.get('default_model') ?? ''),
        custom_endpoint_acknowledged: custom && customAck,
      });
      const secret = secretRef.current?.value ?? '';
      if (secret) {
        await window.fielora.provider.storeCredential({ provider_config_id: provider.id, secret });
        if (secretRef.current) secretRef.current.value = '';
      }
      form.reset();
      setCustomAck(false);
      setProviderFormOpen(false);
      await refresh();
      setProviderId(provider.id);
    } catch (reason) {
      if (secretRef.current) secretRef.current.value = '';
      setError(message(reason));
    }
  }

  async function probeProvider(provider: ProviderConfigView) {
    setProbeState({ invocationId: '', providerId: provider.id, label: '正在测试连接…' });
    try {
      const result = await window.fielora.provider.probe({ provider_config_id: provider.id });
      setProbeState({ invocationId: result.invocation_id, providerId: provider.id, label: '正在测试连接…' });
    } catch (reason) {
      setProbeState({ invocationId: '', providerId: provider.id, label: `连接失败：${message(reason)}` });
    }
  }

  async function archive(capture: CaptureView) {
    await window.fielora.capture.archive({ capture_id: capture.id, expected_revision: capture.revision });
    setCaptureAction(null); await refresh();
  }
  async function restore(capture: CaptureView) {
    await window.fielora.capture.restore({ capture_id: capture.id, expected_revision: capture.revision });
    await refresh();
  }
  async function attach(capture: CaptureView, fieldId: string) {
    if (!fieldId) return;
    await window.fielora.capture.attach({ capture_id: capture.id, field_id: fieldId, expected_revision: capture.revision });
    setCaptureAction(null); await refresh();
  }
  async function promote(capture: CaptureView, fieldId: string) {
    await window.fielora.capture.promote({ capture_id: capture.id, field_id: fieldId || null, expected_revision: capture.revision });
    setCaptureAction(null); await refresh();
  }

  function useCapture(capture: CaptureView) {
    const chip: ContextChip = {
      kind: 'CAPTURE',
      source_identity: capture.id,
      source_revision_or_navigation_generation: String(capture.revision),
      display_label: capture.title.slice(0, 160),
      content: capture.content,
      sensitivity: 'NORMAL',
      completeness: 'COMPLETE',
    };
    if (!contextContentFits(capture.content) || !contextPackageFits([...chips, chip])) {
      setError('这份内容较长，无法完整加入本次上下文。请先展开并选择更短内容。');
      return;
    }
    setChips((items) => items.some((item) => item.kind === 'CAPTURE' && item.source_identity === capture.id) ? items : [...items, chip]);
    setContextOpen(true);
    setError('');
    setSurface('SUMMON');
  }

  function addNote() {
    const content = noteDraft.trim();
    if (!content) return;
    const sensitivity = inferUserNoteSensitivity(content);
    const chip: ContextChip = {
      kind: 'USER_NOTE',
      source_identity: `user-note-${crypto.randomUUID()}`,
      source_revision_or_navigation_generation: 'ephemeral',
      display_label: '本次补充',
      content,
      sensitivity,
      completeness: 'COMPLETE',
    };
    if (!contextContentFits(content)) { setError('单条补充最多 4,000 字符 / 16 KiB。'); return; }
    if (!contextPackageFits([...chips, chip])) { setError('本次上下文最多 8 项 / 12,000 字符 / 48 KiB。'); return; }
    setChips((items) => [...items, chip]);
    setNoteDraft('');
    setError('');
    if (sensitivity === 'SENSITIVE') setSensitiveAck(false);
  }

  function editNote(index: number, chip: ContextChip) {
    const content = window.prompt('修改本次补充', chip.content);
    if (content === null || !content.trim()) return;
    const trimmed = content.trim();
    const next = chips.map((item, itemIndex) => itemIndex === index
      ? { ...item, content: trimmed, sensitivity: inferUserNoteSensitivity(trimmed) }
      : item);
    if (!contextContentFits(trimmed)) { setError('单条补充最多 4,000 字符 / 16 KiB。'); return; }
    if (!contextPackageFits(next)) { setError('本次上下文最多 8 项 / 12,000 字符 / 48 KiB。'); return; }
    setChips(next);
    setSensitiveAck(false);
    setError('');
  }

  const header = surface === 'SUMMON'
    ? <><div><p className="eyebrow">SUMMON</p><h2>询问当前内容</h2></div><div className="experience-header-actions"><button className="text-button" onClick={() => showSurface('INBOX')} data-testid="summon-open-inbox">Inbox <span>{activeCaptures.length}</span></button><button className="icon-button" onClick={close} aria-label="关闭">×</button></div></>
    : surface === 'INBOX'
      ? <><div><p className="eyebrow">CAPTURE</p><h2>Inbox</h2><p>暂时收好，之后再决定放到哪里。</p></div><button className="icon-button" onClick={close} aria-label="关闭">×</button></>
      : <><div><button className="back-link" onClick={() => setSurface('SUMMON')}>← 返回 Summon</button><h2>模型服务</h2><p>低频设置，不会占用日常工作现场。</p></div><button className="icon-button" onClick={close} aria-label="关闭">×</button></>;

  return <>
    <button className="summon-button" onClick={() => void summon()} title="Summon (Ctrl+Shift+Space)" data-testid="summon-button">Summon</button>
    {surface && <div className="summon-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className={`experience-panel ${surface === 'SUMMON' ? 'summon-panel' : ''}`} role="dialog" aria-modal="true" aria-label={surface === 'SUMMON' ? 'Fielora Summon' : surface === 'INBOX' ? 'Fielora Inbox' : '模型服务设置'} data-testid={surface === 'SUMMON' ? 'summon-panel' : surface === 'INBOX' ? 'inbox-surface' : 'provider-setup'}>
        <header>{header}</header>

        {surface === 'SUMMON' && <div className="summon-body summon-compose">
          <form onSubmit={ask} data-testid="summon-form">
            <textarea name="prompt" required autoFocus placeholder="问当前页面、Field 或已捕获内容……" aria-label="想让 Fielora 帮你做什么" data-testid="summon-prompt" />

            <button type="button" className="context-summary" onClick={() => setContextOpen((open) => !open)} aria-expanded={contextOpen} data-testid="context-summary">
              <span><strong>上下文 · {chips.length}</strong><small>{contextSummary(chips)}</small></span><span aria-hidden="true">{contextOpen ? '⌃' : '⌄'}</span>
            </button>

            {contextOpen && <section className="summon-context-inspector" data-testid="summon-context-inspector">
              <div className="context-inspector-heading"><div><strong>这次会参考</strong><small>可以检查、移除或补充；关闭后不会自动保存本次补充。</small></div><button type="button" className="icon-button" aria-label="收起上下文" onClick={() => setContextOpen(false)}>×</button></div>
              {chips.length === 0 ? <p className="muted">没有自动加入上下文，你仍然可以直接提问。</p> : <div className="context-list">{chips.map((chip, index) => <article key={`${chip.kind}-${chip.source_identity}-${index}`} className="context-item">
                <div><span className="context-kind">{contextKindLabels[chip.kind]}</span><strong>{chip.display_label}</strong><small>{contextDetail(chip)}{chip.completeness === 'PARTIAL' ? ' · 内容不完整' : ''}</small>{chip.sensitivity === 'SENSITIVE' && <em>发送前需要确认</em>}</div>
                <div>{chip.kind === 'USER_NOTE' && <button type="button" className="quiet-button" onClick={() => editNote(index, chip)}>修改</button>}<button type="button" className="quiet-button" onClick={() => { setChips((items) => items.filter((_, itemIndex) => itemIndex !== index)); setSensitiveAck(false); }}>移除</button></div>
              </article>)}</div>}
              <div className="context-note"><input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="补充一句本次需要参考的内容" data-testid="context-note" /><button type="button" className="secondary-button" onClick={addNote} data-testid="context-add">添加</button></div>
            </section>}

            {hasSensitiveContext && <section className="sensitive-confirmation" data-testid="sensitive-disclosure">
              <div><strong>这次上下文包含敏感内容</strong><p>仅在你明确允许后发送给 {activeProvider?.display_name ?? '所选模型服务'}。</p></div>
              <button type="button" className="quiet-button" onClick={() => { setChips((items) => items.filter((chip) => chip.sensitivity !== 'SENSITIVE')); setSensitiveAck(false); }}>移除敏感内容</button>
              <label><input type="checkbox" checked={sensitiveAck} onChange={(event) => setSensitiveAck(event.target.checked)} />仅本次允许发送</label>
            </section>}

            <div className="model-bar">
              {availableProviders.length > 0 ? <select className="provider-indicator" aria-label="切换模型服务" value={providerId} onChange={(event) => { setProviderId(event.target.value); setSendAck(false); }} data-testid="provider-indicator">
                {availableProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name}{provider.credential_present ? '' : ' · 需要凭据'}</option>)}
              </select> : <div className="provider-degraded" data-testid="provider-degraded"><span><strong>尚未配置模型</strong><small>配置后即可在当前内容上提问。</small></span><button type="button" onClick={() => { setProviderFormOpen(true); setSurface('PROVIDER_SETUP'); }}>配置模型服务</button></div>}
              {availableProviders.length > 0 && <button type="button" className="settings-button" aria-label="管理模型服务" title="管理模型服务" onClick={() => setSurface('PROVIDER_SETUP')}>⚙</button>}
            </div>

            {activeProvider && <p className="send-summary" data-testid="send-summary">发送给 {activeProvider.display_name} · {activeProvider.default_model}{activeProvider.base_url ? ` · ${activeProvider.base_url}` : ''}。内容将离开 Fielora，可能产生服务费用；服务方是否保留内容由其账号与服务政策决定。</p>}
            {activeProvider?.endpoint_class === 'CUSTOM' && <label className="disclosure"><input type="checkbox" checked={sendAck} onChange={(event) => setSendAck(event.target.checked)} />我确认本次内容将发送到这个自定义服务：{activeProvider.base_url}</label>}

            <div className="summon-actions">
              <button type="submit" className="primary-button" disabled={!activeProvider || terminal === 'RUNNING'} data-testid="summon-send">发送</button>
              {terminal === 'RUNNING' && <button type="button" className="secondary-button" onClick={() => void cancel()}>取消</button>}
              {output && <button type="button" className="secondary-button" onClick={() => void saveOutput()}>捕获回答</button>}
              <small>{invocationStatusLabel(terminal)}{usage && ` · ${usage}`}</small>
            </div>
          </form>
          {toolProposals.length > 0 && <aside className="tool-proposals"><strong>建议的工具操作（不会执行）</strong>{toolProposals.map((proposal, index) => <code key={`${proposal}-${index}`}>{proposal}</code>)}</aside>}
          {output && <article className="model-output" data-testid="model-output">{output}</article>}
        </div>}

        {surface === 'INBOX' && <div className="experience-body inbox-list">
          {captures.length === 0 ? <div className="empty"><h3>还没有捕获内容</h3><p>在 Browse 中捕获页面或选区，或者保存一次模型回答，它们会先来到这里。</p></div> : captures.map((capture) => {
            const expanded = expandedCaptureId === capture.id;
            const currentAction = captureAction?.captureId === capture.id ? captureAction.mode : null;
            return <article key={capture.id} className={`capture-card ${capture.lifecycle_status === 'ARCHIVED' ? 'archived' : ''}`} data-testid="inbox-capture-card">
              <div className="capture-card-meta"><span>{captureKindLabels[capture.kind]}</span><small>{captureSourceLabel(capture)} · {new Date(capture.created_at).toLocaleString()}</small><em>{captureStateLabel(capture)}</em></div>
              <h3>{capture.title}</h3>
              <p className="capture-preview" data-testid="capture-preview">{capturePreview(capture.content) || '这份捕获没有可显示的文字预览。'}</p>
              <button className="capture-expand" type="button" onClick={() => setExpandedCaptureId(expanded ? '' : capture.id)}>{expanded ? '收起完整内容' : '查看完整内容'}</button>
              {expanded && <pre className="capture-full-content" data-testid="capture-full-content">{capture.content}</pre>}
              {currentAction && <div className="capture-decision" data-testid="capture-decision">
                <div><strong>{currentAction === 'ATTACH' ? '加入哪个 Field？' : '在哪里继续这份灵感？'}</strong><small>{currentAction === 'ATTACH' ? '让这份材料属于一件持续工作。' : '保留来源，并把它作为后续工作入口。'}</small></div>
                <select defaultValue="" aria-label="选择 Field" onChange={(event) => {
                  const fieldId = event.target.value;
                  if (currentAction === 'ATTACH') void attach(capture, fieldId);
                  else if (fieldId === '__global') void promote(capture, '');
                  else void promote(capture, fieldId);
                }}>
                  <option value="" disabled>选择…</option>
                  {currentAction === 'PROMOTE' && <option value="__global">先作为独立灵感保留</option>}
                  {fields.map((field) => <option key={field.id} value={field.id}>{field.title}</option>)}
                </select>
                <button type="button" className="quiet-button" onClick={() => setCaptureAction(null)}>取消</button>
              </div>}
              <div className="capture-card-actions">
                {capture.lifecycle_status === 'ACTIVE' && capture.placement_status !== 'PROMOTED' && <button type="button" className="primary-button compact" onClick={() => setCaptureAction({ captureId: capture.id, mode: 'ATTACH' })}>加入 Field</button>}
                {capture.lifecycle_status === 'ACTIVE' && <button type="button" className="secondary-button" onClick={() => useCapture(capture)}>作为上下文使用</button>}
                <details><summary aria-label="更多操作">更多</summary><div>{capture.lifecycle_status === 'ACTIVE' && capture.placement_status !== 'PROMOTED' && <button type="button" onClick={() => setCaptureAction({ captureId: capture.id, mode: 'PROMOTE' })}>作为灵感继续</button>}{capture.lifecycle_status === 'ACTIVE' ? <button type="button" onClick={() => void archive(capture)}>归档</button> : <button type="button" onClick={() => void restore(capture)}>恢复</button>}</div></details>
              </div>
            </article>;
          })}
        </div>}

        {surface === 'PROVIDER_SETUP' && <div className="experience-body provider-setup-body">
          <section className="provider-disclosure"><strong>发送边界</strong><p>Fielora 默认不保存完整提问与回答。使用模型时，内容会发送给所选服务；是否保留以及费用由服务方和账号政策决定。</p></section>
          <div className="provider-setup-heading"><div><h3>已配置的模型服务</h3><p>日常 Summon 只显示当前选择和必要异常。</p></div><button type="button" className="secondary-button" onClick={() => setProviderFormOpen((open) => !open)} data-testid="provider-add-toggle">{providerFormOpen ? '取消添加' : '添加模型服务'}</button></div>
          <div className="provider-list">{availableProviders.length === 0 ? <div className="empty compact-empty"><p>还没有模型服务。添加后，Summon 才能发送问题。</p></div> : availableProviders.map((provider) => <article key={provider.id}>
            <div><strong>{provider.display_name}</strong><small>{providerKindLabels[provider.provider_kind]} · {provider.default_model}</small><span className={provider.credential_present ? 'ready' : 'needs-attention'}>{provider.credential_present ? '已就绪' : '需要凭据'}</span>{probeState?.providerId === provider.id && <em>{probeState.label}</em>}</div>
            <div><button type="button" onClick={() => void probeProvider(provider)} disabled={!provider.credential_present}>测试连接</button><button type="button" onClick={async () => { await window.fielora.provider.deleteCredential({ provider_config_id: provider.id }); await refresh(); }} disabled={!provider.credential_present}>删除凭据</button><button type="button" className="quiet" onClick={async () => { await window.fielora.provider.remove({ provider_config_id: provider.id }); await refresh(); }}>移除配置</button></div>
          </article>)}</div>
          {providerFormOpen && <form className="provider-form" onSubmit={createProvider} data-testid="provider-form">
            <div className="provider-form-intro"><h3>添加模型服务</h3><p>凭据只写入 Windows Credential Manager，不会显示在配置列表中。</p></div>
            <label>协议<select value={providerKind} onChange={(event) => { setProviderKind(event.target.value as ProviderKind); setCustomAck(false); }}><option value="OPENAI">OpenAI Responses</option><option value="ANTHROPIC">Anthropic Messages</option><option value="OPENAI_COMPATIBLE">OpenAI-compatible</option></select></label>
            <label>显示名称<input name="display_name" required maxLength={120} placeholder="例如：工作模型" /></label>
            <label>模型<input name="default_model" required maxLength={256} placeholder="模型标识" /></label>
            {providerKind === 'OPENAI_COMPATIBLE' && <><label>HTTPS 服务地址<input name="base_url" type="url" required placeholder="https://gateway.example/v1" /></label><label className="disclosure"><input type="checkbox" checked={customAck} onChange={(event) => setCustomAck(event.target.checked)} />我理解这个自定义服务的运营方、DNS 和内容保留风险。</label></>}
            <label>API Key<input ref={secretRef} name="secret" type="password" autoComplete="off" required maxLength={2048} /><small>只写入 Windows Credential Manager，保存后不可查看。</small></label>
            <button type="submit" className="primary-button">保存模型服务</button>
          </form>}
        </div>}

        {error && <p className="experience-message error" role="alert">{error}</p>}
      </section>
    </div>}
  </>;
}
