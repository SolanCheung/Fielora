import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CaptureView,
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
  providerKindLabels,
} from './phase04-presentation';
import { SelectMenu } from './UiPrimitives';
import { chinaProviderPresets } from './china-provider-presets';

type ExperienceSurface = 'INBOX' | 'PROVIDER_SETUP' | null;
type CaptureAction = { captureId: string; mode: 'ATTACH' | 'PROMOTE' } | null;

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function providerProbeFailure(provider: ProviderConfigView | undefined, code?: string | null): string {
  if (provider?.provider_kind === 'OPENAI' && /^qwen/i.test(provider.default_model)) return '连接失败：当前是 OpenAI 官方协议，但模型像兼容服务；请检查协议与 Base URL';
  const labels: Record<string, string> = {
    CREDENTIAL_REJECTED: 'API Key 无效或已失效',
    MODEL_NOT_AVAILABLE: '模型不可用，请检查 Model ID',
    PROVIDER_RATE_LIMITED: '服务限流，请稍后重试',
    PROVIDER_UNAVAILABLE: '服务不可达，请检查网络与 Base URL',
    PROVIDER_PROTOCOL_ERROR: '服务响应与所选协议不兼容',
  };
  return `连接失败：${labels[code ?? ''] ?? code ?? '服务异常'}`;
}

export function Phase04Layer() {
  const [surface, setSurface] = useState<ExperienceSurface>(null);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [providerKind, setProviderKind] = useState<ProviderKind>('OPENAI');
  const [providerPreset, setProviderPreset] = useState('MANUAL');
  const [providerDraft, setProviderDraft] = useState({ displayName: '', model: '', baseUrl: '' });
  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState('');
  const [probeState, setProbeState] = useState<{ invocationId: string; providerId: string; label: string } | null>(null);
  const [captures, setCaptures] = useState<CaptureView[]>([]);
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [expandedCaptureId, setExpandedCaptureId] = useState('');
  const [captureAction, setCaptureAction] = useState<CaptureAction>(null);
  const [error, setError] = useState('');
  const [customAck, setCustomAck] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.lifecycle_status !== 'REMOVED'),
    [providers],
  );
  const isQwenCodingPlan = providerKind === 'OPENAI_COMPATIBLE'
    && providerDraft.baseUrl.replace(/\/+$/, '') === 'https://coding.dashscope.aliyuncs.com/v1';

  const refresh = useCallback(async () => {
    const [nextProviders, nextCaptures, nextFields] = await Promise.all([
      window.fielora.provider.list(),
      window.fielora.capture.list({ placement: null, lifecycle: null, field_id: null, cursor: null, limit: 100 }),
      window.fielora.field.list(),
    ]);
    setProviders(nextProviders);
    setCaptures(nextCaptures.items);
    setFields(nextFields);
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
    setCaptureAction(null);
    window.dispatchEvent(new Event('resize'));
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    const openInbox = () => showSurface('INBOX');
    const openProviderSetup = (event: Event) => {
      const requestedProviderId = (event as CustomEvent<string | undefined>).detail;
      setProviderFormOpen(false);
      setEditingProviderId('');
      showSurface('PROVIDER_SETUP');
      if (requestedProviderId) {
        void window.fielora.provider.get({ provider_config_id: requestedProviderId })
          .then((provider) => beginEditProvider(provider))
          .catch((reason) => setError(message(reason)));
      }
    };
    window.addEventListener('fielora:open-inbox', openInbox);
    window.addEventListener('fielora:open-provider-setup', openProviderSetup);
    return () => {
      window.removeEventListener('fielora:open-inbox', openInbox);
      window.removeEventListener('fielora:open-provider-setup', openProviderSetup);
    };
  }, [showSurface]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && surface) close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, surface]);

  useEffect(() => window.fielora.core.subscribe((event) => {
    if (event.event !== 'event.model.invocation') return;
    const model = event as ModelInvocationEvent;
    if (probeState?.invocationId === model.invocation_id) {
      if (model.kind === 'COMPLETED') setProbeState((current) => current ? { ...current, label: '连接正常' } : null);
      if (model.kind === 'FAILED') setProbeState((current) => current ? { ...current, label: providerProbeFailure(providers.find((provider) => provider.id === current.providerId), model.error_code) } : null);
      if (model.kind === 'CANCELLED') setProbeState((current) => current ? { ...current, label: '测试已取消' } : null);
    }
  }), [probeState?.invocationId, providers]);

  function resetProviderForm() {
    setEditingProviderId('');
    setProviderPreset('MANUAL');
    setProviderKind('OPENAI');
    setProviderDraft({ displayName: '', model: '', baseUrl: '' });
    setCustomAck(false);
    setProviderFormOpen(false);
    if (secretRef.current) secretRef.current.value = '';
  }

  function beginAddProvider() {
    if (providerFormOpen && !editingProviderId) { resetProviderForm(); return; }
    setEditingProviderId('');
    setProviderPreset('MANUAL');
    setProviderKind('OPENAI');
    setProviderDraft({ displayName: '', model: '', baseUrl: '' });
    setCustomAck(false);
    setProviderFormOpen(true);
    if (secretRef.current) secretRef.current.value = '';
  }

  function beginEditProvider(provider: ProviderConfigView) {
    setEditingProviderId(provider.id);
    setProviderPreset('MANUAL');
    setProviderKind(provider.provider_kind);
    setProviderDraft({ displayName: provider.display_name, model: provider.default_model, baseUrl: provider.base_url ?? '' });
    setCustomAck(provider.endpoint_class === 'CUSTOM');
    setProviderFormOpen(true);
    if (secretRef.current) secretRef.current.value = '';
  }

  async function saveProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    try {
      const custom = providerKind === 'OPENAI_COMPATIBLE';
      const existing = editingProviderId ? providers.find((item) => item.id === editingProviderId) : undefined;
      if (editingProviderId && !existing) throw new Error('要编辑的模型配置已发生变化，请重新打开。');
      const common = {
        display_name: String(data.get('display_name') ?? ''),
        base_url: custom ? String(data.get('base_url') ?? '') : null,
        default_model: String(data.get('default_model') ?? ''),
        custom_endpoint_acknowledged: custom && customAck,
      };
      const provider = existing
        ? await window.fielora.provider.update({ provider_config_id: existing.id, expected_revision: existing.revision, ...common })
        : await window.fielora.provider.create({ provider_kind: providerKind, ...common });
      const secret = secretRef.current?.value ?? '';
      if (secret) {
        await window.fielora.provider.storeCredential({ provider_config_id: provider.id, secret });
        if (secretRef.current) secretRef.current.value = '';
      }
      form.reset();
      resetProviderForm();
      await refresh();
      window.dispatchEvent(new Event('fielora:providers-changed'));
    } catch (reason) {
      if (secretRef.current) secretRef.current.value = '';
      setError(message(reason));
    }
  }

  function applyProviderPreset(value: string) {
    const existing = editingProviderId ? providers.find((item) => item.id === editingProviderId) : undefined;
    if (existing && existing.provider_kind !== 'OPENAI_COMPATIBLE') {
      setError('已保存配置的协议不能直接变更；请新增一个模型服务。');
      return;
    }
    setProviderPreset(value);
    const preset = chinaProviderPresets.find((item) => item.value === value) ?? chinaProviderPresets[0]!;
    setProviderKind('OPENAI_COMPATIBLE');
    setProviderDraft({ displayName: preset.displayName, model: preset.model, baseUrl: preset.baseUrl });
    setCustomAck(false);
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

  const header = surface === 'INBOX'
    ? <><div><p className="eyebrow">CAPTURE</p><h2>Inbox</h2><p>暂时收好，之后再决定放到哪里。</p></div><button className="icon-button" onClick={close} aria-label="关闭">×</button></>
    : <><div><p className="eyebrow">SETTINGS</p><h2>模型与服务</h2><p>独立管理 Provider、Model 与安全凭据。</p></div><button className="icon-button" onClick={close} aria-label="关闭">×</button></>;

  return <>
    {surface && <div className="experience-backdrop" data-effect="backdrop-dim" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="experience-panel" role="dialog" aria-modal="true" data-surface="overlay" aria-label={surface === 'INBOX' ? 'Fielora Inbox' : '模型服务设置'} data-testid={surface === 'INBOX' ? 'inbox-surface' : 'provider-setup'}>
        <header>{header}</header>

        {surface === 'INBOX' && <div className="experience-body inbox-list">
          {captures.length === 0 ? <div className="empty"><h3>还没有捕获内容</h3><p>在 Browse 中捕获页面或选区，它们会先来到这里。</p></div> : captures.map((capture) => {
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
                <SelectMenu value="" ariaLabel="选择 Field" options={[{ value: '', label: '选择…', disabled: true }, ...(currentAction === 'PROMOTE' ? [{ value: '__global', label: '先作为独立灵感保留' }] : []), ...fields.map((field) => ({ value: field.id, label: field.title }))]} onChange={(fieldId) => {
                  if (currentAction === 'ATTACH') void attach(capture, fieldId);
                  else if (fieldId === '__global') void promote(capture, '');
                  else void promote(capture, fieldId);
                }} />
                <button type="button" className="quiet-button" onClick={() => setCaptureAction(null)}>取消</button>
              </div>}
              <div className="capture-card-actions">
                {capture.lifecycle_status === 'ACTIVE' && capture.placement_status !== 'PROMOTED' && <button type="button" className="primary-button compact" onClick={() => setCaptureAction({ captureId: capture.id, mode: 'ATTACH' })}>加入 Field</button>}
                <details><summary aria-label="更多操作">更多</summary><div>{capture.lifecycle_status === 'ACTIVE' && capture.placement_status !== 'PROMOTED' && <button type="button" onClick={() => setCaptureAction({ captureId: capture.id, mode: 'PROMOTE' })}>作为灵感继续</button>}{capture.lifecycle_status === 'ACTIVE' ? <button type="button" onClick={() => void archive(capture)}>归档</button> : <button type="button" onClick={() => void restore(capture)}>恢复</button>}</div></details>
              </div>
            </article>;
          })}
        </div>}

        {surface === 'PROVIDER_SETUP' && <div className="experience-body provider-setup-body">
          <section className="provider-disclosure"><strong>发送边界</strong><p>Fielora 默认不保存完整提问与回答。使用模型时，内容会发送给所选服务；是否保留以及费用由服务方和账号政策决定。</p></section>
          <div className="provider-setup-heading"><div><h3>已配置的模型服务</h3><p>这些模型可供 Project 对话与 Agent 选择。</p></div><button type="button" className="secondary-button" onClick={beginAddProvider} data-testid="provider-add-toggle">{providerFormOpen && !editingProviderId ? '取消添加' : '添加模型服务'}</button></div>
          <div className="provider-list">{availableProviders.length === 0 ? <div className="empty compact-empty"><p>还没有模型服务。添加并通过连接测试后即可在对话中选择。</p></div> : availableProviders.map((provider) => <article key={provider.id}>
            <div><strong>{provider.display_name}</strong><small>{providerKindLabels[provider.provider_kind]} · {provider.default_model}</small><span className={provider.credential_present ? 'ready' : 'needs-attention'}>{provider.credential_present ? '凭据已保存 · 未测试' : '需要凭据'}</span>{probeState?.providerId === provider.id && <em>{probeState.label}</em>}</div>
            <div><button type="button" onClick={() => beginEditProvider(provider)} data-testid={`provider-edit-${provider.id}`}>编辑</button><button type="button" onClick={() => void probeProvider(provider)} disabled={!provider.credential_present}>测试连接</button><button type="button" onClick={async () => { await window.fielora.provider.deleteCredential({ provider_config_id: provider.id }); await refresh(); window.dispatchEvent(new Event('fielora:providers-changed')); }} disabled={!provider.credential_present}>删除凭据</button><button type="button" className="quiet" onClick={async () => { await window.fielora.provider.remove({ provider_config_id: provider.id }); await refresh(); window.dispatchEvent(new Event('fielora:providers-changed')); }}>移除配置</button></div>
          </article>)}</div>
          {providerFormOpen && <form className="provider-form" onSubmit={saveProvider} data-testid="provider-form">
            <div className="provider-form-intro"><h3>{editingProviderId ? '编辑模型服务' : '添加模型服务'}</h3><p>{editingProviderId ? '可以修改名称、Base URL、Model ID，或填写新的 API Key。留空 API Key 会保留现有凭据。' : '凭据只写入 Windows Credential Manager，不会显示在配置列表中。'}</p></div>
            <label>国产模型快捷配置<SelectMenu value={providerPreset} ariaLabel="国产模型快捷配置" testId="provider-preset" onChange={applyProviderPreset} options={chinaProviderPresets.map((preset) => ({ value: preset.value, label: preset.label, description: preset.description }))} /></label>
            <small className="provider-preset-note">快捷配置会填写协议和官方 Base URL；Model ID 仍以你的账号控制台实际可用列表为准，可以直接修改。</small>
            <label>协议<SelectMenu value={providerKind} ariaLabel="协议" onChange={(value) => { if (editingProviderId) return; setProviderKind(value); setProviderPreset('MANUAL'); setCustomAck(false); }} options={[{ value: 'OPENAI', label: 'OpenAI Responses', disabled: Boolean(editingProviderId) && providerKind !== 'OPENAI' }, { value: 'ANTHROPIC', label: 'Anthropic Messages', disabled: Boolean(editingProviderId) && providerKind !== 'ANTHROPIC' }, { value: 'OPENAI_COMPATIBLE', label: 'OpenAI-compatible', disabled: Boolean(editingProviderId) && providerKind !== 'OPENAI_COMPATIBLE' }]} /></label>
            <label>显示名称<input name="display_name" required maxLength={120} placeholder="例如：工作模型" value={providerDraft.displayName} onChange={(event) => setProviderDraft((draft) => ({ ...draft, displayName: event.target.value }))} /></label>
            <label>模型<input name="default_model" required maxLength={256} placeholder="模型标识" value={providerDraft.model} onChange={(event) => setProviderDraft((draft) => ({ ...draft, model: event.target.value }))} /></label>
            {providerKind === 'OPENAI_COMPATIBLE' && <><label>HTTPS 服务地址<input name="base_url" type="url" required placeholder="https://gateway.example/v1" value={providerDraft.baseUrl} onChange={(event) => setProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))} /></label>{isQwenCodingPlan && <aside className="provider-verified-config" data-testid="qwen-coding-plan-config"><strong>Qwen Coding Plan 已验证配置</strong><span>OpenAI-compatible Chat Completions · Base URL 如上 · Model ID 区分大小写。</span><small>Fielora 会自动发送 Coding Agent 所需的客户端标识，无需额外填写 Header。</small></aside>}<label className="disclosure"><input type="checkbox" checked={customAck} onChange={(event) => setCustomAck(event.target.checked)} />我理解这个自定义服务的运营方、DNS 和内容保留风险。</label></>}
            <label>API Key<input ref={secretRef} name="secret" type="password" autoComplete="off" required={!editingProviderId} maxLength={2048} placeholder={editingProviderId ? '留空以保留现有 API Key' : ''} /><small>只写入 Windows Credential Manager，保存后不可查看。</small></label>
            <div className="provider-form-actions"><button type="submit" className="primary-button" data-testid="provider-form-save">{editingProviderId ? '保存修改' : '保存模型服务'}</button>{editingProviderId && <button type="button" className="secondary-button" onClick={resetProviderForm}>取消编辑</button>}</div>
          </form>}
        </div>}

        {error && <p className="experience-message error" role="alert">{error}</p>}
      </section>
    </div>}
  </>;
}
