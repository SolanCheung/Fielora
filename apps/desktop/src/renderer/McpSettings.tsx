import { useCallback, useEffect, useState } from 'react';
import type { McpConnectionCatalogView } from '@fielora/contracts';

const diagnosticLabels: Record<string, string> = {
  CONFIG_NOT_FOUND: '尚未找到 mcp.json。添加受支持的 Local STDIO 定义后再刷新。',
  CONFIG_MALFORMED: 'mcp.json 无法按当前有界格式读取。',
  CONNECTION_UNSUPPORTED: '连接定义不受当前 Local STDIO 子集支持。',
  CONFIG_UNSUPPORTED: '连接包含当前版本尚未支持的字段。',
  EXECUTABLE_INVALID: 'command 必须是允许的绝对可执行文件路径。',
  CONFIG_SECRET_VALUE_FORBIDDEN: 'env 只允许静态 credential 引用；明文值被拒绝。',
  MCP_CREDENTIAL_REF_INVALID: 'env 中包含无效的 credential 引用。',
  MCP_CREDENTIAL_ENV_NAME_INVALID: 'credential 环境变量名无效或超出限制。',
  MCP_CREDENTIAL_ENV_DUPLICATE: 'credential 环境变量名存在大小写不敏感的重复。',
  MCP_CREDENTIAL_BINDING_LIMIT: '单个连接的 credential 绑定超过当前上限。',
};

export function McpSettings() {
  const [catalog, setCatalog] = useState<McpConnectionCatalogView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await window.fielora.agent.mcpConnections());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="settings-section" data-testid="settings-mcp">
    <header><p>工具连接</p><h1>MCP</h1></header>
    <section className="settings-card settings-mcp-card">
      <div className="settings-card-heading">
        <span><strong>本地 MCP Server</strong><small>只读取当前用户的 mcp.json；打开此页面不会启动 Server 或发现 Tools。</small></span>
        <button type="button" onClick={() => void refresh()} disabled={loading} data-testid="mcp-refresh">{loading ? '正在刷新…' : '刷新'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!error && catalog?.status === 'CONFIG_NOT_FOUND' && <div className="settings-mcp-empty" data-testid="mcp-config-not-found"><strong>尚未配置 MCP</strong><small>{diagnosticLabels.CONFIG_NOT_FOUND}</small></div>}
      {!error && catalog?.status === 'CONFIG_MALFORMED' && <div className="settings-mcp-empty is-error" data-testid="mcp-config-malformed"><strong>配置无法读取</strong><small>{diagnosticLabels.CONFIG_MALFORMED}</small></div>}
      {catalog && catalog.connections.length > 0 && <div className="settings-mcp-list" data-testid="mcp-connection-list">{catalog.connections.map((connection) => <article key={connection.connection_id} data-testid={`mcp-connection-${connection.connection_id}`}>
        <span><strong>{connection.connection_id}</strong><small>Local STDIO · 已配置</small></span>
        <div><em>未激活</em><details><summary>连接详情</summary><div><code title={connection.command_path}>{connection.command_path}</code><small>配置已读取 · executable 将在激活时检查</small><small>{connection.command_argument_count} 个参数 · {connection.credential_binding_count === 0 ? '无凭据绑定' : `${connection.credential_binding_count} 个凭据绑定${connection.credential_missing_count > 0 ? ` · ${connection.credential_missing_count} 个缺失` : ' · 已配置'}`}</small><small>Tools 仅在当前 AgentRun 激活后可用</small></div></details></div>
      </article>)}</div>}
      {catalog && catalog.diagnostics.filter((item) => item.code !== 'CONFIG_NOT_FOUND').length > 0 && <div className="settings-mcp-diagnostics" data-testid="mcp-diagnostics"><strong>诊断</strong>{catalog.diagnostics.filter((item) => item.code !== 'CONFIG_NOT_FOUND').map((item, index) => <p key={`${item.connection_id ?? 'config'}-${item.code}-${index}`}><code>{item.code}</code><span>{item.connection_id ? `${item.connection_id} · ` : ''}{diagnosticLabels[item.code] ?? '配置未通过当前 MCP admission。'}</span></p>)}</div>}
    </section>
    <details className="settings-mcp-security" data-testid="mcp-security-note"><summary>安全与支持范围</summary><p>Local MCP env 只接受静态 credential 引用，不接受明文值；当前仍不支持 headers、OAuth 或远程连接。Server 只会在你为一个正在进行的 AgentRun 明确激活，并通过现有 PROCESS Policy / Approval 后获得绑定并启动；Run 结束即停止。</p></details>
  </div>;
}
