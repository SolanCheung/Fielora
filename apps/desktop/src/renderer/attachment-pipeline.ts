import type { StoreWorkspaceAttachmentRequest, WorkspaceAttachmentSelection, WorkspaceAttachmentSource, WorkspaceAttachmentView } from '../workspace-types';
import type { ModelCapabilities } from './model-capabilities.ts';

const MAX_BROWSER_ATTACHMENT_BYTES = 1024 * 1024;
const supportedImages = new Set(['image/png', 'image/jpeg', 'image/webp']);

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取这个图片'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function clipboardImageName(mime: string): string {
  const date = new Date();
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join('');
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
  return `image-${stamp}.${extension}`;
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('无法读取图片尺寸'));
    image.src = dataUrl;
  });
}

export async function loadBrowserAttachments(files: readonly File[], source: WorkspaceAttachmentSource): Promise<WorkspaceAttachmentSelection> {
  const selected = Array.from(files).slice(0, 4);
  const attachments = await Promise.all(selected.map(async (file, index): Promise<WorkspaceAttachmentView> => {
    const fallbackId = `browser-attachment-${Date.now()}-${index}`;
    if (file.size > MAX_BROWSER_ATTACHMENT_BYTES) return {
      id: fallbackId, name: file.name || `附件 ${index + 1}`, size: file.size, kind: 'TEXT', mime_type: file.type || 'application/octet-stream',
      status: 'TOO_LARGE', content: null, data_url: null, sha256: null, reason: '文件超过 1 MiB', width: null, height: null, source, content_ref: null,
    };
    const bytes = await file.arrayBuffer();
    const digest = await sha256(bytes);
    if (supportedImages.has(file.type)) return {
      id: digest, name: file.name || (source === 'clipboard' ? clipboardImageName(file.type) : `图片.${file.type.split('/')[1]}`), size: file.size, kind: 'IMAGE', mime_type: file.type,
      status: 'READY', content: null, data_url: await readDataUrl(file), sha256: digest, reason: null, width: null, height: null, source, content_ref: null,
    };
    if (file.type.startsWith('image/')) return {
      id: digest, name: file.name || '粘贴的图片', size: file.size, kind: 'IMAGE', mime_type: file.type,
      status: 'UNSUPPORTED', content: null, data_url: null, sha256: digest, reason: '仅支持 PNG、JPEG 和 WebP 图片', width: null, height: null, source, content_ref: null,
    };
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (content.includes('\0')) throw new Error('binary');
      return { id: digest, name: file.name || '文本附件', size: file.size, kind: 'TEXT', mime_type: file.type || 'text/plain', status: 'READY', content, data_url: null, sha256: digest, reason: null, width: null, height: null, source, content_ref: null };
    } catch {
      return { id: digest, name: file.name || '附件', size: file.size, kind: 'TEXT', mime_type: file.type || 'application/octet-stream', status: 'UNSUPPORTED', content: null, data_url: null, sha256: digest, reason: '仅支持 UTF-8 文本或 PNG、JPEG、WebP 图片', width: null, height: null, source, content_ref: null };
    }
  }));
  return { attachments, truncated_count: Math.max(0, files.length - 4) };
}

export async function normalizeAttachmentSelection(
  attachments: readonly WorkspaceAttachmentView[],
  source: WorkspaceAttachmentSource,
  store: (request: StoreWorkspaceAttachmentRequest) => Promise<WorkspaceAttachmentView>,
): Promise<WorkspaceAttachmentView[]> {
  return Promise.all(attachments.map(async (attachment) => {
    const sourced = { ...attachment, source };
    if (sourced.kind !== 'IMAGE' || sourced.status !== 'READY' || !sourced.data_url || !sourced.sha256) return sourced;
    const dimensions = sourced.width && sourced.height ? { width: sourced.width, height: sourced.height } : await imageDimensions(sourced.data_url);
    return store({
      id: sourced.sha256, name: sourced.name, size: sourced.size, mime_type: sourced.mime_type, data_url: sourced.data_url,
      width: dimensions.width, height: dimensions.height, source,
    });
  }));
}

export function attachmentsForCapabilities(attachments: readonly WorkspaceAttachmentView[], capabilities: ModelCapabilities): WorkspaceAttachmentView[] {
  return attachments.map((attachment) => attachment.status === 'READY' && !(attachment.kind === 'IMAGE' ? capabilities.imageInput : capabilities.fileInput)
    ? { ...attachment, status: 'UNSUPPORTED', reason: attachment.kind === 'IMAGE' ? (capabilities.imageInputReason ?? '当前模型不支持图片输入') : '当前模型不支持文件输入' }
    : attachment);
}

function messageAttachmentKey(messageId: string): string { return `fielora:conversation-message-attachments:${messageId}`; }

export function persistMessageAttachments(messageId: string, attachments: readonly WorkspaceAttachmentView[]): void {
  const stored = attachments.filter((attachment) => attachment.kind === 'IMAGE' && attachment.status === 'READY' && attachment.content_ref).map((attachment) => ({ ...attachment, data_url: null }));
  if (stored.length > 0) window.localStorage.setItem(messageAttachmentKey(messageId), JSON.stringify(stored));
  else window.localStorage.removeItem(messageAttachmentKey(messageId));
}

export function messageAttachments(messageId: string): WorkspaceAttachmentView[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(messageAttachmentKey(messageId)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is WorkspaceAttachmentView => Boolean(item && typeof item === 'object'
      && (item as WorkspaceAttachmentView).kind === 'IMAGE'
      && typeof (item as WorkspaceAttachmentView).content_ref === 'string'
      && /^[0-9a-f]{64}\.(?:png|jpg|webp)$/.test((item as WorkspaceAttachmentView).content_ref!)));
  } catch { return []; }
}
