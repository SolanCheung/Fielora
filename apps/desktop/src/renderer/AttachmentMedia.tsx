import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { WorkspaceAttachmentView } from '../workspace-types';
import { ShellIcon } from './PrimaryNav';

interface AttachmentThumbnailProps {
  attachment: WorkspaceAttachmentView;
  variant: 'composer' | 'conversation';
  onOpen: (attachment: WorkspaceAttachmentView) => void;
  onRemove?: (id: string) => void;
  onContextMenu: (event: ReactMouseEvent, attachment: WorkspaceAttachmentView) => void;
}

export function AttachmentThumbnail({ attachment, variant, onOpen, onRemove, onContextMenu }: AttachmentThumbnailProps) {
  const ready = attachment.status === 'READY' && Boolean(attachment.data_url);
  return <article className={`attachment-thumbnail is-${variant}${ready ? '' : ' is-unavailable'}`} data-testid={`attachment-thumbnail-${variant}`} data-attachment-id={attachment.id}>
    <button type="button" className="attachment-thumbnail-image" onClick={() => ready && onOpen(attachment)} onContextMenu={(event) => { event.preventDefault(); if (ready) onContextMenu(event, attachment); }} aria-label={`查看图片 ${attachment.name}`} disabled={!ready}>
      {attachment.data_url ? <img src={attachment.data_url} alt={attachment.name}/> : <ShellIcon name="files"/>}
    </button>
    <footer><span title={attachment.name}>{attachment.name}</span>{onRemove && <button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => onRemove(attachment.id)}><ShellIcon name="close"/></button>}</footer>
    {attachment.status !== 'READY' && <small>{attachment.reason}</small>}
  </article>;
}

export function ConversationImageGallery({ attachments, onOpen, onContextMenu }: {
  attachments: WorkspaceAttachmentView[];
  onOpen: (attachment: WorkspaceAttachmentView) => void;
  onContextMenu: (event: ReactMouseEvent, attachment: WorkspaceAttachmentView) => void;
}) {
  const [resolved, setResolved] = useState(attachments);
  useEffect(() => {
    let live = true;
    void Promise.all(attachments.map(async (attachment) => {
      if (attachment.data_url || !attachment.content_ref) return attachment;
      try {
        const stored = await window.fielora.workspace.readAttachment({ content_ref: attachment.content_ref });
        return { ...attachment, data_url: stored.data_url, mime_type: stored.mime_type, status: 'READY' as const, reason: null };
      } catch {
        return { ...attachment, status: 'UNSUPPORTED' as const, reason: '图片内容暂时不可用' };
      }
    })).then((items) => { if (live) setResolved(items); });
    return () => { live = false; };
  }, [attachments]);
  return <div className="conversation-attachments" data-testid="conversation-image-attachments">
    {resolved.map((attachment) => <AttachmentThumbnail key={attachment.id} attachment={attachment} variant="conversation" onOpen={onOpen} onContextMenu={onContextMenu}/>)}
  </div>;
}

export function ImagePreview({ attachment, onClose, onContextMenu }: {
  attachment: WorkspaceAttachmentView;
  onClose: () => void;
  onContextMenu: (event: ReactMouseEvent, attachment: WorkspaceAttachmentView) => void;
}) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label={`查看图片 ${attachment.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} data-testid="image-preview">
    <section className="image-preview-shell">
      <header><span>{attachment.name}</span><div><button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))} aria-label="缩小图片">−</button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom((value) => Math.min(4, value + .25))} aria-label="放大图片">＋</button><button type="button" onClick={onClose} aria-label="关闭图片预览"><ShellIcon name="close"/></button></div></header>
      <div className="image-preview-canvas"><img src={attachment.data_url ?? ''} alt={attachment.name} style={{ transform: `scale(${zoom})` }} onContextMenu={(event) => { event.preventDefault(); onContextMenu(event, attachment); }}/></div>
    </section>
  </div>;
}

export function ImageContextMenu({ left, top, attachment, locationLabel, onShow, onCopy, onSave, onClose }: {
  left: number;
  top: number;
  attachment: WorkspaceAttachmentView;
  locationLabel: string;
  onShow: (attachment: WorkspaceAttachmentView) => void;
  onCopy: (attachment: WorkspaceAttachmentView) => void;
  onSave: (attachment: WorkspaceAttachmentView) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [onClose]);
  return <div className="image-context-menu" role="menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()} data-testid="image-context-menu">
    <p className="image-context-menu-location" title={locationLabel}><ShellIcon name="source"/><span>{locationLabel}</span></p>
    <button type="button" role="menuitem" onClick={() => onShow(attachment)}>在右侧工作区显示</button>
    <button type="button" role="menuitem" onClick={() => onCopy(attachment)}>复制图片</button>
    <button type="button" role="menuitem" onClick={() => onSave(attachment)}>图片另存为…</button>
  </div>;
}
