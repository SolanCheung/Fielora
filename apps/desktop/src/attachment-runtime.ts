import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreWorkspaceAttachmentRequest, WorkspaceAttachmentSelection, WorkspaceAttachmentView } from './workspace-types';

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;

function identity(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex');
}

function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function rejectedAttachment(id: string, name: string, size: number, status: 'UNSUPPORTED' | 'TOO_LARGE', reason: string): WorkspaceAttachmentView {
  return { id, name, size, kind: 'TEXT', mime_type: 'application/octet-stream', status, content: null, data_url: null, sha256: null, reason, width: null, height: null, source: 'file_picker', content_ref: null };
}

export async function loadSelectedAttachments(filePaths: string[]): Promise<WorkspaceAttachmentSelection> {
  const selected = filePaths.slice(0, MAX_ATTACHMENTS);
  const attachments = await Promise.all(selected.map(async (filePath): Promise<WorkspaceAttachmentView> => {
    const name = path.basename(filePath);
    const fileIdentity = identity(filePath);
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) return rejectedAttachment(fileIdentity, name, metadata.size, 'UNSUPPORTED', '只能附加普通文件');
      if (metadata.size > MAX_ATTACHMENT_BYTES) return rejectedAttachment(fileIdentity, name, metadata.size, 'TOO_LARGE', '文件超过 1 MiB');
      const bytes = await readFile(filePath);
      const mime = imageMime(bytes);
      if (mime) return {
        id: fileIdentity, name, size: metadata.size, kind: 'IMAGE', mime_type: mime, status: 'READY', content: null,
        data_url: `data:${mime};base64,${bytes.toString('base64')}`,
        sha256: createHash('sha256').update(bytes).digest('hex'), reason: null, width: null, height: null, source: 'file_picker', content_ref: null,
      };
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return rejectedAttachment(fileIdentity, name, metadata.size, 'UNSUPPORTED', '仅支持 UTF-8 文本或安全的 PNG、JPEG、WebP 图片');
      }
      if (content.includes('\0')) return rejectedAttachment(fileIdentity, name, metadata.size, 'UNSUPPORTED', '仅支持 UTF-8 文本或安全的 PNG、JPEG、WebP 图片');
      return {
        id: fileIdentity,
        name,
        size: metadata.size,
        kind: 'TEXT',
        mime_type: 'text/plain; charset=utf-8',
        status: 'READY',
        content,
        data_url: null,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        reason: null,
        width: null,
        height: null,
        source: 'file_picker',
        content_ref: null,
      };
    } catch {
      return rejectedAttachment(fileIdentity, name, 0, 'UNSUPPORTED', '无法读取这个文件');
    }
  }));
  return { attachments, truncated_count: Math.max(0, filePaths.length - MAX_ATTACHMENTS) };
}

function storedExtension(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : '';
}

function storedPath(root: string, contentRef: string): string {
  if (!/^[0-9a-f]{64}\.(?:png|jpg|webp)$/.test(contentRef)) throw new Error('Invalid attachment reference');
  return path.join(root, contentRef);
}

export async function storeImageAttachment(root: string, request: StoreWorkspaceAttachmentRequest): Promise<WorkspaceAttachmentView> {
  const extension = storedExtension(request.mime_type);
  const prefix = `data:${request.mime_type};base64,`;
  if (!extension || !request.data_url.startsWith(prefix) || request.size > MAX_ATTACHMENT_BYTES || request.width < 1 || request.height < 1) throw new Error('Invalid image attachment');
  const bytes = Buffer.from(request.data_url.slice(prefix.length), 'base64');
  if (bytes.length !== request.size || imageMime(bytes) !== request.mime_type) throw new Error('Invalid image attachment bytes');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (request.id !== digest) throw new Error('Attachment digest mismatch');
  const contentRef = `${digest}.${extension}`;
  await mkdir(root, { recursive: true });
  try { await writeFile(storedPath(root, contentRef), bytes, { flag: 'wx' }); }
  catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'EEXIST') throw reason; }
  return { ...request, kind: 'IMAGE', status: 'READY', content: null, sha256: digest, reason: null, content_ref: contentRef };
}

export async function readStoredImage(root: string, contentRef: string): Promise<{ data_url: string; bytes: Uint8Array; mime_type: 'image/png' | 'image/jpeg' | 'image/webp' }> {
  const bytes = await readFile(storedPath(root, contentRef));
  const mime = imageMime(bytes);
  if (!mime || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('Invalid stored image');
  return { data_url: `data:${mime};base64,${bytes.toString('base64')}`, bytes, mime_type: mime };
}
