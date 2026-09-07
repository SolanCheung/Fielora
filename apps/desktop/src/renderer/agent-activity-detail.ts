import type { AgentRunView, AgentToolCallView } from '@fielora/contracts';

export interface ActivityFileLink {
  path: string;
  expectedSha256: string;
  lineStart?: number;
  lineEnd?: number;
}

export function resolveActivityFileLink(target: string, tools: readonly AgentToolCallView[]): ActivityFileLink | null {
  const match = /^fielora-project-file:([^#]+)(?:#L([1-9]\d*)(?:-L?([1-9]\d*))?)?$/.exec(target);
  if (!match) return null;
  const path = match[1] ?? '';
  if (/[:\\]/.test(path) || [...path].some((part) => part.charCodeAt(0) < 32) || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  const tool = [...tools].reverse().find((item) => item.name === 'read_file' && item.status === 'COMPLETED'
    && item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)
    && (item.arguments as Record<string, unknown>).path === path);
  const receipt = tool?.receipt as Record<string, unknown> | null;
  const hash = receipt?.sha256;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const lineStart = match[2] ? Number(match[2]) : undefined;
  const lineEnd = match[3] ? Number(match[3]) : lineStart;
  if (lineStart !== undefined && (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) || lineEnd! < lineStart)) return null;
  return { path, expectedSha256: hash, lineStart, lineEnd };
}

/** Presentation only: preserve the recorded action, including its range and failure. */
export function activityToolDescription(tool: AgentToolCallView): string {
  const args = tool.arguments && typeof tool.arguments === 'object' && !Array.isArray(tool.arguments)
    ? tool.arguments as Record<string, unknown> : {};
  const path = typeof args.path === 'string' ? args.path : '';
  if (tool.name === 'read_file') {
    const start = Number.isSafeInteger(args.line_start) ? Number(args.line_start) : 1;
    const end = Number.isSafeInteger(args.line_end) ? Number(args.line_end) : null;
    return `${path}${end ? ` · 行 ${start}–${end}` : ' · 文件内容'}`;
  }
  if (tool.name === 'search_text') {
    const query = typeof args.query === 'string' ? args.query
      : Array.isArray(args.queries) ? args.queries.filter((item) => typeof item === 'string').join(' / ') : '';
    return [path, query && `“${query}”`].filter(Boolean).join(' · ');
  }
  if (tool.name === 'run_command') {
    return [args.program, ...(Array.isArray(args.argv) ? args.argv : [])]
      .filter((item) => typeof item === 'string').join(' ');
  }
  return path;
}

export function activityNarrativePreview(text: string): string | null {
  if (text.length <= 420 && !text.includes('```') && text.split('\n').length <= 6) return null;
  const paragraph = text.split(/\r?\n\s*\r?\n|```/)[0]?.trim() ?? '';
  const plain = paragraph.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`#]/g, '').replace(/\s+/g, ' ');
  return plain ? `${plain.slice(0, 180)}${plain.length > 180 ? '…' : ''}` : '查看详细分析';
}

export function activityFailureReason(run: AgentRunView | null): string | null {
  if (run?.status !== 'FAILED' || !run.error_code) return null;
  const labels: Record<string, string> = {
    AGENT_MAX_STEPS_REACHED: `本轮执行步数已用尽（${run.current_step}/${run.max_steps} 步）`,
    AGENT_TEXT_MATCH_FAILED: '待替换内容未能唯一匹配，修改未生效',
    AGENT_FILE_CHANGED: '文件内容已变化，需要重新核对修改',
    PROVIDER_RATE_LIMITED: '模型服务暂时限流',
    PROVIDER_PROTOCOL_ERROR: '模型服务未正确返回响应',
    CREDENTIAL_REJECTED: '模型凭据未通过验证',
    AGENT_VERIFICATION_STALE: '当前修改尚未获得有效验证',
  };
  return labels[run.error_code] ?? '执行中断，详情中保留了失败代码';
}
