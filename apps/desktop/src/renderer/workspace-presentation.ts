export interface FileProposal {
  relativePath: string;
  content: string;
}

export function parseFileProposal(output: string): FileProposal | null {
  const pattern = /```fielora-file\s+path="([^"]+)"\s*\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let proposal: FileProposal | null = null;
  while ((match = pattern.exec(output)) !== null) {
    const relativePath = match[1]!.replaceAll('\\', '/');
    if (/^(?:[a-zA-Z]:|\/)/.test(relativePath) || relativePath.split('/').some((part) => !part || part === '..')) continue;
    proposal = { relativePath, content: match[2]!.replace(/\r?\n$/, '') };
  }
  return proposal;
}

export function reviewDiff(relativePath: string, before: string, after: string): string {
  if (before === after) return `--- a/${relativePath}\n+++ b/${relativePath}\n(no changes)`;
  const left = before.split('\n');
  const right = after.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  const contextStart = Math.max(0, prefix - 3);
  const leftEnd = Math.min(left.length, left.length - suffix + 3);
  const rightEnd = Math.min(right.length, right.length - suffix + 3);
  const lines = [`--- a/${relativePath}`, `+++ b/${relativePath}`, `@@ -${contextStart + 1},${leftEnd - contextStart} +${contextStart + 1},${rightEnd - contextStart} @@`];
  for (let index = contextStart; index < prefix; index += 1) lines.push(` ${left[index] ?? ''}`);
  for (let index = prefix; index < left.length - suffix; index += 1) lines.push(`-${left[index] ?? ''}`);
  for (let index = prefix; index < right.length - suffix; index += 1) lines.push(`+${right[index] ?? ''}`);
  for (let index = 0; index < Math.min(3, suffix); index += 1) lines.push(` ${left[left.length - suffix + index] ?? ''}`);
  return lines.join('\n');
}
