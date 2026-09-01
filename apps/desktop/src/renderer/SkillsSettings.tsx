import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SkillCatalogEntryView, SkillCatalogView } from '@fielora/contracts';
import { useUiLocale, type UiTranslator } from './ui-locale';
import { localizeSkillMetadata } from './ui-localization';

function skillLabels(t: UiTranslator) {
  return {
    source: {
      BUILTIN: t('内置', 'Built in'),
      PROJECT_AGENT_SKILL: t('当前项目', 'Current project'),
      PLUGIN: t('插件提供', 'Provided by plugin'),
    } as Record<string, string>,
    scope: {
      HARNESS: 'Fielora Harness',
      PROJECT: t('当前项目', 'Current project'),
      PLUGIN: t('本地插件', 'Local plugin'),
    } as Record<string, string>,
    trust: {
      TRUSTED_BUILTIN: t('可信内置内容', 'Trusted built-in content'),
      UNTRUSTED_PROJECT: t('不受信任的项目内容', 'Untrusted project content'),
      UNTRUSTED_LOCAL_PLUGIN: t('未验证的本地插件内容', 'Unverified local plugin content'),
    } as Record<string, string>,
  };
}

function fact(label: string, value: string | null | undefined) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function SkillRow({ skill }: { skill: SkillCatalogEntryView }) {
  const { locale, t } = useUiLocale();
  const labels = skillLabels(t);
  const display = localizeSkillMetadata(skill, locale);
  return <details className="settings-extension-row" data-testid={`settings-skill-${skill.name}`}>
    <summary title={display.name}>
      <span><strong>{display.name}</strong><small>{display.description}</small></span>
      <em>{labels.source[skill.source_kind] ?? skill.source_kind}</em>
    </summary>
    <div className="settings-extension-details" data-testid={`settings-skill-details-${skill.name}`}>
      <dl>
        {fact(t('名称', 'Name'), display.name)}
        {fact(t('描述', 'Description'), display.description)}
        {fact(t('内部标识符', 'Internal identifier'), skill.name)}
        {fact(t('来源', 'Source'), labels.source[skill.source_kind] ?? skill.source_kind)}
        {fact(t('作用域', 'Scope'), labels.scope[skill.scope] ?? skill.scope)}
        {fact(t('信任', 'Trust'), labels.trust[skill.trust] ?? skill.trust)}
        {fact(t('SKILL.md 来源', 'SKILL.md source'), skill.location_reference)}
        {fact(t('版本', 'Version'), skill.version)}
        {fact('License', skill.license)}
        {fact(t('兼容性', 'Compatibility'), skill.compatibility)}
        {fact(t('内容摘要', 'Content digest'), skill.content_digest)}
        {fact(t('allowed-tools（建议声明，不授予权限）', 'allowed-tools (advisory only; does not grant access)'), skill.allowed_tools_advisory)}
        {skill.plugin && fact(t('插件来源', 'Plugin source'), `${skill.plugin.plugin_id} · ${skill.plugin.plugin_version}`)}
      </dl>
      {skill.metadata.length > 0 && <section><strong>Metadata</strong><ul>{skill.metadata.map((item) => <li key={item.key}><code>{item.key}</code><span>{item.value}</span></li>)}</ul></section>}
      <section><strong>Resources</strong>{skill.resources.length > 0 ? <ul>{skill.resources.map((resource) => <li key={resource}><code>{resource}</code></li>)}</ul> : <p>{t('没有已发现的 resource。', 'No resources discovered.')}</p>}{skill.resources_truncated && <p>{t('Resource 清单已按边界截断。', 'The resource list was truncated at its safety boundary.')}</p>}</section>
      <p className="settings-authority-note">{t('Skill 是按需加载的说明与资源。它不能授予 Tool 权限、绕过 Policy、读取凭据、激活 MCP 或自行执行脚本。', 'Skills are instructions and resources loaded on demand. They cannot grant Tool access, bypass Policy, read credentials, activate MCP, or run scripts on their own.')}</p>
    </div>
  </details>;
}

export function SkillsSettings({ fieldId, embedded = false }: { fieldId: string | null; embedded?: boolean }) {
  const { t } = useUiLocale();
  const [catalog, setCatalog] = useState<SkillCatalogView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setCatalog(await window.fielora.skill.catalog({ field_id: fieldId })); }
    catch { setError(t('暂时无法读取 Skills 清单。', 'The Skills catalog is temporarily unavailable.')); }
    finally { setLoading(false); }
  }, [fieldId, t]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const changed = () => void refresh();
    window.addEventListener('fielora:plugins-changed', changed);
    return () => window.removeEventListener('fielora:plugins-changed', changed);
  }, [refresh]);
  const groups = useMemo(() => [
    { id: 'BUILTIN', label: t('内置', 'Built in'), items: catalog?.entries.filter((item) => item.source_kind === 'BUILTIN') ?? [] },
    { id: 'PROJECT_AGENT_SKILL', label: t('当前项目', 'Current project'), items: catalog?.entries.filter((item) => item.source_kind === 'PROJECT_AGENT_SKILL') ?? [] },
    { id: 'PLUGIN', label: t('插件提供', 'Provided by plugins'), items: catalog?.entries.filter((item) => item.source_kind === 'PLUGIN') ?? [] },
  ], [catalog, t]);
  return <div className={embedded ? 'settings-extension-pane' : 'settings-section'} data-testid="settings-skills">
    {!embedded && <header><p>{t('AI 与扩展', 'AI & extensions')}</p><h1>Skills</h1></header>}
    <section className="settings-card settings-extension-card">
      <div className="settings-card-heading"><span><strong>{t('可发现的 Skills', 'Discovered Skills')}</strong><small>{t('这里只读取现有 SkillCatalog metadata；完整 SKILL.md 正文仍只在 Agent 明确需要时加载。', 'This page reads only SkillCatalog metadata. Full SKILL.md content is loaded only when the Agent explicitly needs it.')}</small></span><button type="button" onClick={() => void refresh()} disabled={loading}>{t('刷新', 'Refresh')}</button></div>
      {loading && <p className="settings-empty">{t('正在读取 Skills…', 'Loading Skills…')}</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && groups.map((group) => <section className="settings-extension-group" key={group.id} data-skill-source={group.id}>
        <header><strong>{group.label}</strong><small>{t(`${group.items.length} 个`, `${group.items.length}`)}</small></header>
        {group.items.length > 0 ? group.items.map((skill) => <SkillRow key={`${skill.source_kind}:${skill.name}`} skill={skill}/>) : <p className="settings-empty">{group.id === 'PROJECT_AGENT_SKILL' && !fieldId ? t('从项目工作区进入设置后，可查看当前项目 Skills。', 'Open Settings from a project workspace to view its Skills.') : t('当前没有可发现内容。', 'Nothing is currently discoverable.')}</p>}
      </section>)}
      {catalog && <p className="settings-catalog-fact">Catalog digest · <code>{catalog.catalog_sha256}</code></p>}
    </section>
  </div>;
}
