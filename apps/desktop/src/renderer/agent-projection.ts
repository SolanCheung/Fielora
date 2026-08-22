import type { AgentEventView } from '@fielora/contracts';

export const AGENT_PROJECTION_UNAVAILABLE_MESSAGE = '运行记录暂时无法更新，Agent 仍会继续工作。';

export function mergeAgentEventPages(
  current: AgentEventView[],
  incoming: AgentEventView[],
): AgentEventView[] {
  if (current.length === 0) return [...incoming].sort((left, right) => left.sequence - right.sequence);
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}
