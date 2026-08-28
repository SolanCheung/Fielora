import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SkillCatalogEntryView, SkillCatalogView } from '@fielora/contracts';

const sourceLabels: Record<string, string> = {
  BUILTIN: '内置',
  PROJECT_AGENT_SKILL: '当前项目',
  PLUGIN: '插件提供',
};

const scopeLabels: Record<string, string> = {
  HARNESS: 'Fielora Harness',
  PROJECT: '当前项目',
  PLUGIN: '本地插件',
};

const trustLabels: Record<string, string> = {
  TRUSTED_BUILTIN: '可信内置内容',
  UNTRUSTED_PROJECT: '不受信任的项目内容',
  UNTRUSTED_LOCAL_PLUGIN: '未验证的本地插件内容',
};

function fact(label: string, value: string | null | undefined) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function SkillRow({ skill }: { skill: SkillCatalogEntryView }) {
  return <details className="settings-extension-row" data-testid={`settings-skill-${skill.name}`}>
    <summary title={skill.name}>
      <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
      <em>{sourceLabels[skill.source_kind] ?? skill.source_kind}</em>
    </summary>
    <div className="settings-extension-details" data-testid={`settings-skill-details-${skill.name}`}>
      <dl>
        {fact('名称', skill.name)}
        {fact('描述', skill.description)}
        {fact('来源', sourceLabels[skill.source_kind] ?? skill.source_kind)}
        {fact('作用域', scopeLabels[skill.scope] ?? skill.scope)}
        {fact('信任', trustLabels[skill.trust] ?? skill.trust)}
        {fact('SKILL.md 来源', skill.location_reference)}
        {fact('版本', skill.version)}
        {fact('License', skill.license)}
        {fact('兼容性', skill.compatibility)}
        {fact('内容摘要', skill.content_digest)}
        {fact('allowed-tools（建议声明，不授予权限）', skill.allowed_tools_advisory)}
        {skill.plugin && fact('插件来源', `${skill.plugin.plugin_id} · ${skill.plugin.plugin_version}`)}
      </dl>
      {skill.metadata.length > 0 && <section><strong>Metadata</strong><ul>{skill.metadata.map((item) => <li key={item.key}><code>{item.key}</code><span>{item.value}</span></li>)}</ul></section>}
      <section><strong>Resources</strong>{skill.resources.length > 0 ? <ul>{skill.resources.map((resource) => <li key={resource}><code>{resource}</code></li>)}</ul> : <p>没有已发现的 resource。</p>}{skill.resources_truncated && <p>Resource 清单已按边界截断。</p>}</section>
      <p className="settings-authority-note">Skill 是按需加载的说明与资源。它不能授予 Tool 权限、绕过 Policy、读取凭据、激活 MCP 或自行执行脚本。</p>
    </div>
  </details>;
}

export function SkillsSettings({ fieldId, embedded = false }: { fieldId: string | null; embedded?: boolean }) {
  const [catalog, setCatalog] = useState<SkillCatalogView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setCatalog(await window.fielora.skill.catalog({ field_id: fieldId })); }
    catch { setError('暂时无法读取 Skills 清单。'); }
    finally { setLoading(false); }
  }, [fieldId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const changed = () => void refresh();
    window.addEventListener('fielora:plugins-changed', changed);
    return () => window.removeEventListener('fielora:plugins-changed', changed);
  }, [refresh]);
  const groups = useMemo(() => [
    { id: 'BUILTIN', label: '内置', items: catalog?.entries.filter((item) => item.source_kind === 'BUILTIN') ?? [] },
    { id: 'PROJECT_AGENT_SKILL', label: '当前项目', items: catalog?.entries.filter((item) => item.source_kind === 'PROJECT_AGENT_SKILL') ?? [] },
    { id: 'PLUGIN', label: '插件提供', items: catalog?.entries.filter((item) => item.source_kind === 'PLUGIN') ?? [] },
  ], [catalog]);
  return <div className={embedded ? 'settings-extension-pane' : 'settings-section'} data-testid="settings-skills">
    {!embedded && <header><p>AI 与扩展</p><h1>Skills</h1></header>}
    <section className="settings-card settings-extension-card">
      <div className="settings-card-heading"><span><strong>可发现的 Skills</strong><small>这里只读取现有 SkillCatalog metadata；完整 SKILL.md 正文仍只在 Agent 明确需要时加载。</small></span><button type="button" onClick={() => void refresh()} disabled={loading}>刷新</button></div>
      {loading && <p className="settings-empty">正在读取 Skills…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && groups.map((group) => <section className="settings-extension-group" key={group.id} data-skill-source={group.id}>
        <header><strong>{group.label}</strong><small>{group.items.length} 个</small></header>
        {group.items.length > 0 ? group.items.map((skill) => <SkillRow key={`${skill.source_kind}:${skill.name}`} skill={skill}/>) : <p className="settings-empty">{group.id === 'PROJECT_AGENT_SKILL' && !fieldId ? '从项目工作区进入设置后，可查看当前项目 Skills。' : '当前没有可发现内容。'}</p>}
      </section>)}
      {catalog && <p className="settings-catalog-fact">Catalog digest · <code>{catalog.catalog_sha256}</code></p>}
    </section>
  </div>;
}
