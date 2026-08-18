import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceAttachmentSelection, WorkspaceAttachmentView } from './workspace-types';

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;

function identity(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex');
}

export async function loadSelectedAttachments(filePaths: string[]): Promise<WorkspaceAttachmentSelection> {
  const selected = filePaths.slice(0, MAX_ATTACHMENTS);
  const attachments = await Promise.all(selected.map(async (filePath): Promise<WorkspaceAttachmentView> => {
    const name = path.basename(filePath);
    const fileIdentity = identity(filePath);
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) return { id: fileIdentity, name, size: metadata.size, status: 'UNSUPPORTED', content: null, sha256: null, reason: '只能附加普通文件' };
      if (metadata.size > MAX_ATTACHMENT_BYTES) return { id: fileIdentity, name, size: metadata.size, status: 'TOO_LARGE', content: null, sha256: null, reason: '文件超过 1 MiB' };
      const bytes = await readFile(filePath);
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return { id: fileIdentity, name, size: metadata.size, status: 'UNSUPPORTED', content: null, sha256: null, reason: '当前模型通道仅支持 UTF-8 文本、代码、JSON、CSV 和日志' };
      }
      if (content.includes('\0')) return { id: fileIdentity, name, size: metadata.size, status: 'UNSUPPORTED', content: null, sha256: null, reason: '当前模型通道不支持二进制附件' };
      return {
        id: fileIdentity,
        name,
        size: metadata.size,
        status: 'READY',
        content,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        reason: null,
      };
    } catch {
      return { id: fileIdentity, name, size: 0, status: 'UNSUPPORTED', content: null, sha256: null, reason: '无法读取这个文件' };
    }
  }));
  return { attachments, truncated_count: Math.max(0, filePaths.length - MAX_ATTACHMENTS) };
}
