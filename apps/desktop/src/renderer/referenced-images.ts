import type { WorkspaceAttachmentView } from '../workspace-types';

export function referencesPreviousImages(task: string): boolean {
  return /图片|截图|照片|image|screenshot|photo/i.test(task)
    && /上面|前面|之前|上一|刚才|图中|图里|图片中|截图里|above|previous|earlier/i.test(task);
}

/** Restore legacy image references from this conversation only; Core owns durable run inputs. */
export async function referencedConversationImages(
  task: string,
  conversationId: string,
  history: readonly { id: string; conversation_id: string; role: string; created_at: number }[],
  attachments: (id: string) => WorkspaceAttachmentView[],
  read: (ref: string) => Promise<{ data_url: string; mime_type: string }>,
  originMessageId?: string | null,
): Promise<WorkspaceAttachmentView[]> {
  if (!referencesPreviousImages(task)) return [];
  const ordered = history.filter(item => item.conversation_id === conversationId).sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  const originIndex = originMessageId ? ordered.findIndex(item => item.id === originMessageId) : ordered.length - 1;
  // A missing origin cannot authorize looking at a later, unrelated gallery.
  if (originIndex < 0) return [];
  for (const message of ordered.slice(0, originIndex + 1).reverse().filter(item => item.role === 'USER')) {
    const images = attachments(message.id).filter(item => item.kind === 'IMAGE' && item.content_ref);
    if (!images.length) continue;
    // A broken newest gallery must not silently select a different older reference.
    try {
      return await Promise.all(images.slice(0, 4).map(async image => ({ ...image, ...await read(image.content_ref!) })));
    } catch { return []; } // Core can still recover its own verified content blobs.
  }
  return [];
}
