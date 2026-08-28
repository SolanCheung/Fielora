import { useCallback, useEffect, useState } from 'react';
import type { LocalPluginRegistryView, LocalPluginRegistrationView } from '@fielora/contracts';

const pluginErrors: Record<string, string> = {
  PLUGIN_ROOT_INVALID: '本地路径不可用',
  PLUGIN_MANIFEST_NOT_FOUND: '找不到 fielora.json',
  PLUGIN_MANIFEST_TOO_LARGE: 'Manifest 超出读取边界',
  PLUGIN_MANIFEST_INVALID: 'Manifest 格式无效',
  PLUGIN_MANIFEST_UNSUPPORTED: 'Manifest 含当前不支持的声明',
  PLUGIN_ENGINE_INCOMPATIBLE: '与当前 Fielora 版本不兼容',
  PLUGIN_SKILL_INVALID: '声明的 Skill 无法安全读取',
  PLUGIN_SKILL_COLLISION: 'Skill 名称发生冲突',
};

function PluginRow({ registration, busy, onRemove }: { registration: LocalPluginRegistrationView; busy: boolean; onRemove: (id: string) => void }) {
  const plugin = registration.plugin;
  return <article className="settings-plugin-row" data-testid={`settings-plugin-${registration.registration_id}`} data-plugin-status={registration.status}>
    <div className="settings-plugin-summary">
      <span><strong>{plugin?.name ?? '本地插件不可用'}</strong><small>{plugin ? `${plugin.id} · ${plugin.version}` : (pluginErrors[registration.error_code ?? ''] ?? registration.error_code ?? '配置有问题')}</small><small>{plugin ? `提供 ${plugin.skills.length} 个 Skill` : '注册仍保留，可检查路径后刷新或移除。'}</small></span>
      <div><em>{registration.status === 'AVAILABLE' ? '已注册' : '不可用'}</em><button type="button" disabled={busy} onClick={() => onRemove(registration.registration_id)} data-testid={`plugin-remove-${registration.registration_id}`}>移除注册</button></div>
    </div>
    <details className="settings-extension-details-disclosure">
      <summary>技术详情</summary>
      <div className="settings-extension-details">
        <dl>
          <div><dt>本地根目录</dt><dd>{registration.root_reference}</dd></div>
          {plugin && <>
            <div><dt>Plugin ID</dt><dd>{plugin.id}</dd></div>
            <div><dt>名称</dt><dd>{plugin.name}</dd></div>
            <div><dt>版本</dt><dd>{plugin.version}</dd></div>
            <div><dt>Publisher namespace</dt><dd>{plugin.publisher}（自声明，未验证）</dd></div>
            <div><dt>Fielora engine</dt><dd>{plugin.engine_requirement}</dd></div>
            <div><dt>来源</dt><dd>本地未打包插件</dd></div>
            <div><dt>信任</dt><dd>未验证的本地插件</dd></div>
            <div><dt>Manifest 来源</dt><dd>{plugin.manifest_reference}</dd></div>
            <div><dt>Manifest digest</dt><dd>{plugin.manifest_digest}</dd></div>
          </>}
        </dl>
        {plugin && <section><strong>声明式贡献</strong><ul>{plugin.skills.map((skill) => <li key={skill.relative_path}><span>{skill.name}</span><code>{skill.relative_path}</code></li>)}</ul></section>}
        <p className="settings-authority-note">注册只保存显式本地路径并被动读取声明式 Skill。不会运行代码、启动进程、访问网络、读取凭据或激活 MCP。</p>
      </div>
    </details>
  </article>;
}

export function PluginSettings() {
  const [registry, setRegistry] = useState<LocalPluginRegistryView | null>(null);
  const [rootPath, setRootPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setRegistry(await window.fielora.plugin.localRegistry()); setError(''); }
    catch { setError('暂时无法读取本地插件注册表。'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addPlugin(event: React.FormEvent) {
    event.preventDefault();
    if (!rootPath.trim()) return;
    setBusy(true); setError('');
    try {
      setRegistry(await window.fielora.plugin.registerLocal({ root_path: rootPath.trim() }));
      setRootPath('');
      window.dispatchEvent(new CustomEvent('fielora:plugins-changed'));
    } catch (reason) {
      const code = reason && typeof reason === 'object' && 'code' in reason ? String((reason as { code?: unknown }).code ?? '') : '';
      setError(pluginErrors[code] ?? '无法注册这个本地插件，请检查路径与声明。');
    } finally { setBusy(false); }
  }

  async function removePlugin(registrationId: string) {
    setBusy(true); setError('');
    try {
      setRegistry(await window.fielora.plugin.unregisterLocal({ registration_id: registrationId }));
      window.dispatchEvent(new CustomEvent('fielora:plugins-changed'));
    } catch { setError('无法移除这个注册，请刷新后重试。'); }
    finally { setBusy(false); }
  }

  return <div className="settings-section" data-testid="settings-plugins">
    <header><p>AI 与扩展</p><h1>插件</h1></header>
    <section className="settings-card settings-extension-card">
      <div className="settings-card-heading"><span><strong>本地声明式插件</strong><small>本地插件可以向 Fielora 提供 Skills 等声明式扩展内容。</small></span><button type="button" onClick={() => void refresh()} disabled={busy}>刷新</button></div>
      <form className="settings-plugin-add" onSubmit={addPlugin}>
        <label><span>本地插件根目录</span><input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="C:\\path\\to\\plugin" data-testid="plugin-root-input" /></label>
        <button className="settings-primary-action" type="submit" disabled={busy || !rootPath.trim()} data-testid="plugin-register-local">添加本地插件</button>
      </form>
      <p className="settings-authority-note">添加是显式的人类配置动作，只注册路径。不会复制或删除插件文件，也不会授予权限。</p>
      {error && <p className="error">{error}</p>}
      {registry?.config_status === 'PLUGIN_REGISTRY_MALFORMED' && <p className="error">本地插件配置格式无效；Fielora 没有自动改写它。</p>}
      <div className="settings-plugin-list">{registry && registry.registrations.length > 0 ? registry.registrations.map((registration) => <PluginRow key={registration.registration_id} registration={registration} busy={busy} onRemove={(id) => void removePlugin(id)}/>) : <p className="settings-empty">尚未注册本地插件。</p>}</div>
    </section>
  </div>;
}
