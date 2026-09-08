import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
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

interface TreeRow {
  path: string;
  label: string;
  depth: number;
  ancestors: string[];
  file?: WorkspaceFileEntry;
  expanded?: boolean;
}

function flattenTree(root: FileTreeNode, collapsed: Set<string>, filtering: boolean): TreeRow[] {
  const result: TreeRow[] = [];
  const visit = (node: FileTreeNode, ancestors: string[]) => {
    for (const folder of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      let displayed = folder;
      let label = folder.name;
      if (filtering) while (displayed.folders.size === 1 && displayed.files.length === 0) {
        displayed = [...displayed.folders.values()][0]!;
        label += ` / ${displayed.name}`;
      }
      const expanded = filtering || !collapsed.has(displayed.path);
      result.push({ path: displayed.path, label, depth: ancestors.length, ancestors, expanded });
      if (expanded) visit(displayed, [...ancestors, displayed.path]);
    }
    for (const file of [...node.files].sort((a, b) => a.relative_path.localeCompare(b.relative_path))) {
      result.push({ path: file.relative_path, label: file.relative_path.split('/').at(-1)!, depth: ancestors.length, ancestors, file });
    }
  };
  visit(root, []);
  return result;
}

export const WorkspaceFileTree = memo(function WorkspaceFileTree({ files, filter, activePath, onFilter, onRefresh, onOpen }: {
  files: WorkspaceFileEntry[];
  filter: string;
  activePath: string;
  onFilter: (value: string) => void;
  onRefresh: () => void;
  onOpen: (file: WorkspaceFileEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => new Set<string>());
  const filterRef = useRef<HTMLInputElement>(null);
  const visibleFiles = useMemo(() => {
    const terms = filter.trim().replaceAll('\\', '/').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? files.filter((file) => terms.every((term) => file.relative_path.replaceAll('\\', '/').toLocaleLowerCase().includes(term))) : files;
  }, [files, filter]);
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const flatRows = useMemo(() => flattenTree(tree, collapsed, Boolean(filter.trim())), [tree, collapsed, filter]);
  const virtual = files.length > 200 || flatRows.length > 200;
  const viewportRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLButtonElement>(null);
  const focusedPathRef = useRef('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [rowHeight, setRowHeight] = useState(27);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const probe = probeRef.current;
    if (!viewport || !probe) return;
    let previousHeight = 0;
    let previousRowHeight = 0;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === viewport) {
          const height = entry.contentRect.height;
          if (height > 0 && height !== previousHeight) { previousHeight = height; setViewportHeight(height); }
        } else {
          const height = entry.borderBoxSize[0]?.blockSize ?? probe.offsetHeight;
          if (height > 0 && height !== previousRowHeight) { previousRowHeight = height; setRowHeight(height); }
        }
      }
    });
    observer.observe(viewport);
    observer.observe(probe, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [filter]);
  const count = Math.ceil(viewportHeight / rowHeight) + 12;
  const start = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight) - 6), Math.max(0, flatRows.length - count));
  const end = Math.min(flatRows.length, start + count);
  const toggle = (path: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  const focusRow = (index: number) => {
    const row = flatRows[index];
    const viewport = viewportRef.current;
    if (!row || !viewport) return;
    const top = index * rowHeight;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + rowHeight > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = top + rowHeight - viewport.clientHeight;
    setScrollTop(viewport.scrollTop);
    focusedPathRef.current = row.path;
    requestAnimationFrame(() => [...viewport.querySelectorAll<HTMLButtonElement>('[data-tree-path]')].find((node) => node.dataset.treePath === row.path)?.focus({ preventScroll: true }));
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!virtual) return;
    const index = Math.max(0, flatRows.findIndex((row) => row.path === focusedPathRef.current));
    const row = flatRows[index];
    const moves: Record<string, number> = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: flatRows.length - 1, PageUp: index - Math.floor(viewportHeight / rowHeight), PageDown: index + Math.floor(viewportHeight / rowHeight) };
    if (event.key in moves) {
      event.preventDefault();
      focusRow(Math.min(flatRows.length - 1, Math.max(0, moves[event.key]!)));
    } else if (row && event.key === 'ArrowRight' && row.expanded === false) {
      event.preventDefault(); toggle(row.path);
    } else if (row && event.key === 'ArrowLeft') {
      event.preventDefault();
      if (row.expanded) toggle(row.path);
      else focusRow(flatRows.findIndex((candidate) => candidate.path === row.ancestors.at(-1)));
    }
  };
  const rows = (node: FileTreeNode, depth: number): ReactNode => <>
    {[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((folder) => {
      // Compress single-child directory chains only in the filtered result;
      // the ordinary tree keeps the hierarchy visible for navigation.
      let displayed = folder;
      let label = folder.name;
      if (filter.trim()) while (displayed.folders.size === 1 && displayed.files.length === 0) {
        displayed = [...displayed.folders.values()][0]!;
        label += ` / ${displayed.name}`;
      }
      const closed = collapsed.has(displayed.path) && !filter.trim();
      return <div key={folder.path} className="file-tree-group" style={{ '--tree-depth': depth } as CSSProperties}>
        <button type="button" role="treeitem" aria-level={depth + 1} className="file-tree-row is-folder" onClick={() => toggle(displayed.path)} aria-expanded={!closed} data-testid="workspace-folder"><AppIcon name="chevronDown"/><span title={displayed.path}>{label}</span></button>
        {!closed && <div className="file-tree-children" role="group">{rows(displayed, depth + 1)}</div>}
      </div>;
    })}
    {node.files.sort((a, b) => a.relative_path.localeCompare(b.relative_path)).map((file) => <button key={file.relative_path} type="button" role="treeitem" aria-level={depth + 1} aria-selected={activePath === file.relative_path} className={`file-tree-row is-file ${activePath === file.relative_path ? 'active' : ''}`} style={{ '--tree-depth': depth } as CSSProperties} onClick={() => onOpen(file)} data-testid="workspace-file"><FileTypeIcon path={file.relative_path}/><span title={file.relative_path}>{file.relative_path.split('/').at(-1)}</span></button>)}
  </>;

  return <div className="workspace-file-tool" data-testid="workspace-file-tool">
    <div className="workspace-file-filter"><div className="workspace-file-search"><AppIcon name="search"/><input ref={filterRef} value={filter} onChange={(event) => onFilter(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { onFilter(''); event.stopPropagation(); } }} placeholder="筛选文件..." aria-label="筛选文件" data-testid="workspace-file-filter"/>{filter ? <button type="button" onClick={() => { onFilter(''); filterRef.current?.focus(); }} aria-label="清除筛选" data-testid="workspace-file-filter-clear"><AppIcon name="close"/></button> : <button type="button" className="workspace-file-refresh" onClick={onRefresh} aria-label="刷新文件" data-testid="workspace-file-refresh"><AppIcon name="refresh"/></button>}</div></div>
    <div ref={viewportRef} className="workspace-file-tree" role="tree" onScroll={(event) => { if (virtual) setScrollTop(event.currentTarget.scrollTop); }} onKeyDown={keyDown} data-total-rows={flatRows.length} data-virtualized={virtual}>
      <button ref={probeRef} type="button" className="file-tree-row file-tree-row-probe" aria-hidden="true" tabIndex={-1}><span/><span>Ag</span></button>
      <div className="workspace-file-rows">{visibleFiles.length === 0 ? <p>没有匹配的文件</p> : virtual ? <>
        <div aria-hidden="true" style={{ height: start * rowHeight }}/>
        {flatRows.slice(start, end).map((row, offset) => <div key={row.path} className="file-tree-virtual-row" style={{ height: rowHeight, '--tree-depth': row.depth } as CSSProperties}>
          {row.ancestors.map((ancestor, depth) => <span key={ancestor} className="file-tree-guide" aria-hidden="true" style={{ left: 15 + depth * 18 }}/>)}
          <button type="button" role="treeitem" aria-level={row.depth + 1} aria-expanded={row.expanded} aria-selected={row.file ? activePath === row.path : undefined} className={`file-tree-row ${row.file ? 'is-file' : 'is-folder'} ${activePath === row.path ? 'active' : ''}`} onClick={() => row.file ? onOpen(row.file) : toggle(row.path)} onFocus={() => { focusedPathRef.current = row.path; }} data-tree-path={row.path} data-row-index={start + offset} data-testid={row.file ? 'workspace-file' : 'workspace-folder'}>
            {row.file ? <FileTypeIcon path={row.path}/> : <AppIcon name="chevronDown"/>}<span title={row.path}>{row.label}</span>
          </button>
        </div>)}
        <div aria-hidden="true" style={{ height: (flatRows.length - end) * rowHeight }}/>
      </> : visibleFiles.length > 0 ? rows(tree, 0) : <p>没有匹配的文件</p>}</div>
    </div>
  </div>;
});
