import { useCallback, useEffect, useState } from 'react';
import type { LibraryMediaKind, LibraryObjectView } from '@fielora/contracts';
import { PrimaryNav } from './PrimaryNav';

type Filter = 'ALL' | LibraryMediaKind;

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: '全部' },
  { id: 'WEB', label: '网页' },
  { id: 'DOCUMENT', label: '文件' },
  { id: 'IMAGE', label: '图片' },
  { id: 'AUDIO', label: '音频' },
  { id: 'VIDEO', label: '视频' },
];

const kindLabels: Record<LibraryMediaKind, string> = {
  WEB: '网页', DOCUMENT: '文件', IMAGE: '图片', AUDIO: '音频', VIDEO: '视频', OTHER: '其他',
};

interface LibraryScreenProps {
  onProjects: () => void;
  onNow: () => void;
  onBrowse: () => void;
  onFields: () => void;
  onNewConversation: () => void;
  onSettings: () => void;
}

export function LibraryScreen(props: LibraryScreenProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [objects, setObjects] = useState<LibraryObjectView[]>([]);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async (nextFilter: Filter = filter) => {
    try {
      setObjects(await window.fielora.library.list({ media_kind: nextFilter === 'ALL' ? null : nextFilter, include_deleted: false, limit: 200 }));
      setStatus('');
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : String(reason)); }
  }, [filter]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addFiles() {
    try {
      const added = await window.fielora.library.addFiles();
      if (added.length > 0) setStatus(`已添加 ${added.length} 个文件`);
      await refresh();
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function remove(object: LibraryObjectView) {
    try {
      await window.fielora.library.delete({ library_object_id: object.id, expected_revision: object.revision });
      await refresh();
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function openObject(object: LibraryObjectView) {
    try {
      await window.fielora.library.open({ library_object_id: object.id });
      if (object.kind === 'WEB') props.onBrowse();
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <div className="shell library-shell" data-testid="library-screen">
    <PrimaryNav active="LIBRARY" {...props} />
    <main className="content library-content">
      <header className="library-header"><div><p className="eyebrow">长期资料</p><h1>资料库</h1><p>保存以后需要重新寻找、查看和使用的数字资产。</p></div><button className="primary-button" onClick={() => void addFiles()} data-testid="library-add-file">添加文件</button></header>
      <nav className="library-filters" aria-label="资料类型">{filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => { setFilter(item.id); void refresh(item.id); }} data-testid={`library-filter-${item.id.toLowerCase()}`}>{item.label}</button>)}</nav>
      {objects.length === 0 ? <section className="library-empty"><h2>还没有保存的内容</h2><p>添加本地文件，或者在浏览网页时使用“保存到资料库”。</p></section> : <section className="library-list" aria-label="资料库内容">{objects.map((object) => <article key={object.id} className="library-row" data-testid={`library-object-${object.id}`}>
        <div><strong>{object.title}</strong><span>{kindLabels[object.media_kind]} · {object.kind === 'WEB' ? object.original_source : object.original_filename}</span><small>{new Date(object.created_at).toLocaleString()}</small></div>
        <div className="library-actions"><button onClick={() => void openObject(object)}>打开</button>{object.kind === 'FILE' && <button onClick={() => void window.fielora.library.reveal({ library_object_id: object.id })}>打开所在位置</button>}<button className="danger-link" onClick={() => void remove(object)}>删除</button></div>
      </article>)}</section>}
      {status && <p className="library-status" role="status">{status}</p>}
    </main>
  </div>;
}
