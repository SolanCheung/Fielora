import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { WorkspaceFileEntry } from '../workspace-types';
import { AppIcon, FileTypeIcon } from './ui';

interface FileTreeNode {
  name: string;
  path: string;
  folders: Map<string, FileTreeNode>;
  files: WorkspaceFileEntry[];
}

function buildTree(files: WorkspaceFileEntry[]): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.relative_path.replaceAll('\\', '/').split('/');
    const filename = parts.pop() ?? file.relative_path;
    let node = root;
    for (const folder of parts) {
      const folderPath = node.path ? `${node.path}/${folder}` : folder;
      if (!node.folders.has(folder)) node.folders.set(folder, { name: folder, path: folderPath, folders: new Map(), files: [] });
      node = node.folders.get(folder)!;
    }
    node.files.push({ ...file, relative_path: node.path ? `${node.path}/${filename}` : filename });
  }
  return root;
}

export function WorkspaceFileTree({ files, filter, activePath, onFilter, onRefresh, onOpen }: {
  files: WorkspaceFileEntry[];
  filter: string;
  activePath: string;
  onFilter: (value: string) => void;
  onRefresh: () => void;
  onOpen: (file: WorkspaceFileEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => new Set<string>());
  const visibleFiles = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query ? files.filter((file) => file.relative_path.toLocaleLowerCase().includes(query)) : files;
  }, [files, filter]);
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const toggle = (path: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  const rows = (node: FileTreeNode, depth: number): ReactNode => <>
    {[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((folder) => {
      const closed = collapsed.has(folder.path) && !filter.trim();
      return <div key={folder.path} className="file-tree-group">
        <button type="button" className="file-tree-row is-folder" style={{ '--tree-depth': depth } as CSSProperties} onClick={() => toggle(folder.path)} aria-expanded={!closed} data-testid="workspace-folder"><AppIcon name="chevronDown"/><AppIcon name={closed ? 'folder' : 'folderOpen'}/><span>{folder.name}</span></button>
        {!closed && rows(folder, depth + 1)}
      </div>;
    })}
    {node.files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)).map((file) => <button key={file.relative_path} type="button" className={`file-tree-row is-file ${activePath === file.relative_path ? 'active' : ''}`} style={{ '--tree-depth': depth } as CSSProperties} onClick={() => onOpen(file)} data-testid="workspace-file"><span className="file-tree-spacer"/><FileTypeIcon path={file.relative_path}/><span title={file.relative_path}>{file.relative_path.split('/').at(-1)}</span></button>)}
  </>;

  return <div className="workspace-file-tool" data-testid="workspace-file-tool">
    <div className="workspace-file-filter"><input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="筛选文件…" aria-label="筛选文件" data-testid="workspace-file-filter"/><button type="button" onClick={onRefresh} aria-label="刷新文件" title="刷新文件" data-testid="workspace-file-refresh"><AppIcon name="refresh"/></button></div>
    <div className="workspace-file-tree" role="tree">{visibleFiles.length > 0 ? rows(tree, 0) : <p>没有匹配的文件</p>}</div>
  </div>;
}
