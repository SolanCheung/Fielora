import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { WorkspaceFileEntry } from '../workspace-types';
import { ShellIcon } from './PrimaryNav';

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

type FileIconKind = 'typescript' | 'javascript' | 'code' | 'html' | 'style' | 'json' | 'config' | 'markdown' | 'image' | 'file';

function fileIconKind(path: string): FileIconKind {
  if (/\.(?:ts|tsx)$/i.test(path)) return 'typescript';
  if (/\.(?:js|jsx|mjs|cjs)$/i.test(path)) return 'javascript';
  if (/\.(?:rs|py|go|java|cs|c|cc|cpp|h|hpp|sh|ps1)$/i.test(path)) return 'code';
  if (/\.(?:html?|vue|svelte)$/i.test(path)) return 'html';
  if (/\.(?:css|scss|sass|less)$/i.test(path)) return 'style';
  if (/\.(?:json|jsonc)$/i.test(path)) return 'json';
  if (/\.(?:ya?ml|toml|xml|ini|env)$/i.test(path)) return 'config';
  if (/\.(?:md|mdx)$/i.test(path)) return 'markdown';
  if (/\.(?:png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(path)) return 'image';
  return 'file';
}

function FileTypeIcon({ path }: { path: string }) {
  const kind = fileIconKind(path);
  const marks: Record<FileIconKind, ReactNode> = {
    typescript: <text x="9" y="11.2">TS</text>,
    javascript: <text x="9" y="11.2">JS</text>,
    code: <path d="m7.8 6.7-2 2.3 2 2.3M10.2 6.7l2 2.3-2 2.3"/>,
    html: <path d="m7.8 6.7-2 2.3 2 2.3M10.2 6.7l2 2.3-2 2.3"/>,
    style: <text x="9" y="11.4">#</text>,
    json: <text x="9" y="11.2">{'{}'}</text>,
    config: <><path d="M5.5 7h7M5.5 11h7"/><circle cx="8" cy="7" r="1"/><circle cx="10.5" cy="11" r="1"/></>,
    markdown: <text x="9" y="11.3">M</text>,
    image: <><path d="M4.8 12.3 7.5 9.5l1.8 1.7 1.5-1.4 2.4 2.5"/><circle cx="11.8" cy="6.6" r="1"/></>,
    file: <><rect x="5.5" y="4.5" width="7" height="9" rx="1.5"/><path d="M7.5 8h3M7.5 10.5h3"/></>,
  };
  return <svg className={`file-type-icon is-${kind}`} data-file-kind={kind} viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect className="file-type-tile" x="1.5" y="1.5" width="15" height="15" rx="3.25"/>{marks[kind]}</svg>;
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
        <button type="button" className="file-tree-row is-folder" style={{ '--tree-depth': depth } as CSSProperties} onClick={() => toggle(folder.path)} aria-expanded={!closed} data-testid="workspace-folder"><ShellIcon name="chevronDown"/><ShellIcon name={closed ? 'folder' : 'folderOpen'}/><span>{folder.name}</span></button>
        {!closed && rows(folder, depth + 1)}
      </div>;
    })}
    {node.files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)).map((file) => <button key={file.relative_path} type="button" className={`file-tree-row is-file ${activePath === file.relative_path ? 'active' : ''}`} style={{ '--tree-depth': depth } as CSSProperties} onClick={() => onOpen(file)} data-testid="workspace-file"><span className="file-tree-spacer"/><FileTypeIcon path={file.relative_path}/><span title={file.relative_path}>{file.relative_path.split('/').at(-1)}</span></button>)}
  </>;

  return <div className="workspace-file-tool" data-testid="workspace-file-tool">
    <div className="workspace-file-filter"><input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="筛选文件…" aria-label="筛选文件" data-testid="workspace-file-filter"/><button type="button" onClick={onRefresh} aria-label="刷新文件" title="刷新文件" data-testid="workspace-file-refresh"><ShellIcon name="refresh"/></button></div>
    <div className="workspace-file-tree" role="tree">{visibleFiles.length > 0 ? rows(tree, 0) : <p>没有匹配的文件</p>}</div>
  </div>;
}
