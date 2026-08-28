import { useEffect, useMemo, useState } from 'react';
import type {
  ArtifactAssetRefV1, ArtifactReadView, ArtifactRevisionMetadataView,
  ArtifactView, DocumentBlock, PresentationBlock, PresentationSlide,
  SpreadsheetCellV1, SpreadsheetRangeEmbedV1, SpreadsheetSheetV1,
} from '@fielora/contracts';
import { ShellIcon } from './PrimaryNav';
import {
  artifactTypeLabel, spreadsheetViewport, type ArtifactSurfaceSession,
} from './artifact-working-surface';

function productError(reason: unknown, fallback: string): string {
  const code = reason && typeof reason === 'object' && 'code' in reason
    ? String((reason as { code?: unknown }).code ?? '')
    : '';
  if (code.includes('NOT_FOUND')) return '这个工作对象或版本已不存在。';
  if (code.includes('ASSET_PREVIEW')) return '图片预览不可用或未通过完整性检查。';
  if (code.includes('DIAGRAM_PREVIEW')) return '图示暂时无法安全渲染。';
  return fallback;
}

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function ArtifactCatalog({ refreshToken, onOpen }: {
  refreshToken: number;
  onOpen: (artifact: ArtifactView) => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactView[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    void window.fielora.artifact.list({ cursor: null, limit: 50, include_archived: includeArchived })
      .then((page) => { if (alive) setArtifacts(page.artifacts); })
      .catch((reason) => { if (alive) setError(productError(reason, '暂时无法读取工作对象。')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [includeArchived, refreshToken]);

  return <section className="artifact-catalog" data-testid="artifact-catalog">
    <header>
      <div><p className="eyebrow">WORKING SURFACE</p><h2>工作对象</h2><p>通过对话创建或修改，然后在这里查看准确版本。</p></div>
      <label className="artifact-archive-filter"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)}/><span>显示已归档</span></label>
    </header>
    {loading && <div className="artifact-state"><span className="artifact-spinner"/>正在读取…</div>}
    {error && <div className="artifact-state artifact-error" role="alert">{error}</div>}
    {!loading && !error && artifacts.length === 0 && <div className="artifact-empty"><ShellIcon name="filePlus"/><h3>还没有工作对象</h3><p>在当前对话中请 Agent 创建文档、演示文稿、图示或电子表格。</p></div>}
    {!loading && artifacts.length > 0 && <div className="artifact-list" role="list">{artifacts.map((artifact) => <button key={artifact.artifact_id} type="button" role="listitem" onClick={() => onOpen(artifact)} data-testid={`artifact-list-${artifact.artifact_id}`}>
      <span className={`artifact-type-mark type-${artifact.artifact_type.toLowerCase()}`}><ShellIcon name={artifact.artifact_type === 'PRESENTATION' ? 'image' : 'files'}/></span>
      <span className="artifact-list-copy"><strong>{artifact.title?.trim() || `未命名${artifactTypeLabel(artifact.artifact_type)}`}</strong><small>{artifactTypeLabel(artifact.artifact_type)} · {relativeTime(artifact.updated_at)}{artifact.archived_at !== null ? ' · 已归档' : ''}</small></span>
      <span className="artifact-list-revision">当前版本</span>
    </button>)}</div>}
  </section>;
}

function ArtifactImage({ source, alt }: { source: ArtifactAssetRefV1; alt: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl(''); setError('');
    void window.fielora.artifact.previewAsset({ asset_id: source.asset_id, expected_content_sha256: source.content_sha256 })
      .then((preview) => { if (alive) setUrl(preview.data_url); })
      .catch((reason) => { if (alive) setError(productError(reason, '图片预览不可用。')); });
    return () => { alive = false; };
  }, [source.asset_id, source.content_sha256]);
  if (error) return <div className="artifact-inline-error" data-testid="artifact-asset-error">{error}</div>;
  if (!url) return <div className="artifact-image-loading"><span className="artifact-spinner"/>图片加载中</div>;
  return <img className="artifact-durable-image" src={url} alt={alt} data-testid={`artifact-asset-${source.asset_id}`}/>;
}

function cellText(cell: SpreadsheetCellV1 | undefined): string {
  if (!cell) return '';
  if (cell.value.kind === 'BOOLEAN') return cell.value.value ? 'TRUE' : 'FALSE';
  return String(cell.value.value);
}

function columnLabel(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function SpreadsheetGrid({ sheet, range }: { sheet: SpreadsheetSheetV1; range?: { startRow: number; startColumn: number; endRow: number; endColumn: number } }) {
  const firstRow = sheet.cells.length > 0 ? Math.min(...sheet.cells.map((cell) => cell.row)) : 1;
  const firstColumn = sheet.cells.length > 0 ? Math.min(...sheet.cells.map((cell) => cell.column)) : 1;
  const [rowStart, setRowStart] = useState(range?.startRow ?? firstRow);
  const [columnStart, setColumnStart] = useState(range?.startColumn ?? firstColumn);
  useEffect(() => {
    setRowStart(range?.startRow ?? firstRow);
    setColumnStart(range?.startColumn ?? firstColumn);
  }, [firstColumn, firstRow, range?.startColumn, range?.startRow, sheet.sheet_id]);
  const maxRow = range?.endRow ?? Math.max(...sheet.cells.map((cell) => cell.row), rowStart);
  const maxColumn = range?.endColumn ?? Math.max(...sheet.cells.map((cell) => cell.column), columnStart);
  const viewport = useMemo(() => spreadsheetViewport(sheet.cells, rowStart, columnStart, range ? Math.min(20, range.endRow - range.startRow + 1) : 20, range ? Math.min(10, range.endColumn - range.startColumn + 1) : 10), [columnStart, range, rowStart, sheet.cells]);
  return <div className="artifact-sheet-grid-wrap" data-testid="artifact-spreadsheet-grid" data-rendered-cells={viewport.rows.length * viewport.columns.length}>
    {!range && <div className="artifact-grid-navigation">
      <label>行 <input type="range" min={1} max={Math.max(1, maxRow)} value={Math.min(rowStart, maxRow)} onChange={(event) => setRowStart(Number(event.target.value))}/><span>{rowStart}</span></label>
      <label>列 <input type="range" min={1} max={Math.max(1, maxColumn)} value={Math.min(columnStart, maxColumn)} onChange={(event) => setColumnStart(Number(event.target.value))}/><span>{columnLabel(columnStart)}</span></label>
    </div>}
    <div className="artifact-sheet-grid" role="grid" style={{ gridTemplateColumns: `48px repeat(${viewport.columns.length}, minmax(96px, 1fr))` }}>
      <span className="sheet-corner"/>{viewport.columns.map((column) => <span key={`h:${column}`} className="sheet-column" role="columnheader">{columnLabel(column)}</span>)}
      {viewport.rows.map((row) => <div className="sheet-row" role="row" key={row} style={{ display: 'contents' }}><span className="sheet-row-number" role="rowheader">{row}</span>{viewport.columns.map((column) => { const cell = viewport.cells.get(`${row}:${column}`); return <span key={`${row}:${column}`} role="gridcell" className={`sheet-cell ${cell?.presentation?.emphasis ? `emphasis-${cell.presentation.emphasis.toLowerCase()}` : ''}`} title={cellText(cell)}>{cellText(cell)}</span>; })}</div>)}
    </div>
  </div>;
}

function SpreadsheetRange({ source }: { source: SpreadsheetRangeEmbedV1 }) {
  const [read, setRead] = useState<ArtifactReadView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void window.fielora.artifact.read({ artifact_id: source.artifact_ref.artifact_id, revision_id: source.artifact_ref.revision_id })
      .then((value) => {
        if (!alive) return;
        if (value.revision.semantic_sha256 !== source.artifact_ref.semantic_sha256 || value.revision.content.type !== 'SPREADSHEET') {
          setError('引用的精确版本未通过完整性检查。'); return;
        }
        setRead(value);
      })
      .catch((reason) => { if (alive) setError(productError(reason, '无法读取引用的电子表格版本。')); });
    return () => { alive = false; };
  }, [source.artifact_ref.artifact_id, source.artifact_ref.revision_id, source.artifact_ref.semantic_sha256]);
  if (error) return <div className="artifact-inline-error">{error}</div>;
  if (!read || read.revision.content.type !== 'SPREADSHEET') return <div className="artifact-image-loading"><span className="artifact-spinner"/>正在读取引用版本</div>;
  const sheet = read.revision.content.content.sheets.find((candidate) => candidate.sheet_id === source.sheet_id);
  if (!sheet) return <div className="artifact-inline-error">引用的工作表不存在。</div>;
  return <section className="document-spreadsheet-embed" data-testid="document-spreadsheet-range"><header><div><strong>{read.artifact.title || read.revision.content.content.title || sheet.name}</strong><span>精确引用 · R{read.revision.sequence}</span></div><small>{sheet.name} · {columnLabel(source.start_column)}{source.start_row}:{columnLabel(source.end_column)}{source.end_row}</small></header><SpreadsheetGrid sheet={sheet} range={{ startRow: source.start_row, startColumn: source.start_column, endRow: source.end_row, endColumn: source.end_column }}/></section>;
}

function DocumentBlockView({ block }: { block: DocumentBlock }) {
  switch (block.kind) {
    case 'HEADING': return block.level === 1 ? <h1>{block.text}</h1> : block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>;
    case 'PARAGRAPH': return <p>{block.text}</p>;
    case 'BULLET_LIST': return <ul>{block.items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul>;
    case 'TABLE': return <div className="document-table-wrap"><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case 'SPREADSHEET_RANGE': return <SpreadsheetRange source={block.source}/>;
    case 'INLINE_IMAGE': return <figure><ArtifactImage source={block.source} alt={block.alt_text || 'Artifact 图片'}/>{block.alt_text && <figcaption>{block.alt_text}</figcaption>}</figure>;
  }
}

function DocumentSurface({ read }: { read: ArtifactReadView }) {
  if (read.revision.content.type !== 'DOCUMENT') return null;
  const document = read.revision.content.content;
  return <article className="artifact-document" data-testid="artifact-document-surface">{document.title && <header><p className="eyebrow">DOCUMENT</p><h1>{document.title}</h1></header>}{document.blocks.map((block, index) => <DocumentBlockView key={index} block={block}/>)}</article>;
}

function PresentationBlockView({ block }: { block: PresentationBlock }) {
  if (block.kind === 'PARAGRAPH') return <p>{block.text}</p>;
  if (block.kind === 'BULLET_LIST') return <ul>{block.items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul>;
  return <ArtifactImage source={block.source} alt="演示文稿图片"/>;
}

function PresentationSlideView({ slide }: { slide: PresentationSlide }) {
  return <div className={`artifact-slide layout-${slide.layout.toLowerCase()}`} data-testid="artifact-active-slide"><header><h2>{slide.title}</h2></header><div className="artifact-slide-regions">{slide.regions.map((region, index) => <section key={`${region.slot}:${index}`} className={`slot-${region.slot.toLowerCase()}`}>{region.blocks.map((block, blockIndex) => <PresentationBlockView key={blockIndex} block={block}/>)}</section>)}</div><footer>FIELORA · SEMANTIC PREVIEW</footer></div>;
}

function PresentationSurface({ read, selectedSlide, onSelectedSlide }: { read: ArtifactReadView; selectedSlide: number | null; onSelectedSlide: (index: number) => void }) {
  if (read.revision.content.type !== 'PRESENTATION') return null;
  const slides = read.revision.content.content.slides;
  const index = Math.min(selectedSlide ?? 0, Math.max(0, slides.length - 1));
  return <div className="artifact-presentation" data-testid="artifact-presentation-surface"><nav aria-label="幻灯片">{slides.map((slide, slideIndex) => <button key={slideIndex} type="button" className={index === slideIndex ? 'active' : ''} onClick={() => onSelectedSlide(slideIndex)} data-testid={`artifact-slide-${slideIndex}`}><span>{slideIndex + 1}</span><strong>{slide.title}</strong></button>)}</nav><main>{slides[index] ? <PresentationSlideView slide={slides[index]}/> : <div className="artifact-empty">没有幻灯片</div>}</main></div>;
}

function DiagramSurface({ read }: { read: ArtifactReadView }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl(''); setError('');
    void window.fielora.artifact.previewDiagram({ artifact_id: read.artifact.artifact_id, revision_id: read.revision.revision_id })
      .then((preview) => { if (alive && preview.semantic_sha256 === read.revision.semantic_sha256) setUrl(preview.data_url); else if (alive) setError('图示预览与当前版本不一致。'); })
      .catch((reason) => { if (alive) setError(productError(reason, '图示暂时无法安全渲染。')); });
    return () => { alive = false; };
  }, [read.artifact.artifact_id, read.revision.revision_id, read.revision.semantic_sha256]);
  if (error) return <div className="artifact-state artifact-error" role="alert">{error}</div>;
  if (!url) return <div className="artifact-state"><span className="artifact-spinner"/>正在生成受控预览…</div>;
  return <div className="artifact-diagram" data-testid="artifact-diagram-surface"><img src={url} alt={read.artifact.title || 'Fielora 图示'}/><p>由当前精确版本通过 Fielora 受控布局与 SVG 验证生成。</p></div>;
}

function SpreadsheetSurface({ read, selectedSheetId, onSelectedSheet }: { read: ArtifactReadView; selectedSheetId: string | null; onSelectedSheet: (sheetId: string) => void }) {
  if (read.revision.content.type !== 'SPREADSHEET') return null;
  const workbook = read.revision.content.content;
  const sheet = workbook.sheets.find((candidate) => candidate.sheet_id === selectedSheetId) ?? workbook.sheets[0];
  return <div className="artifact-spreadsheet" data-testid="artifact-spreadsheet-surface"><header><div><p className="eyebrow">SPREADSHEET</p><h2>{workbook.title || read.artifact.title || '未命名电子表格'}</h2></div><nav aria-label="工作表">{workbook.sheets.map((candidate) => <button key={candidate.sheet_id} type="button" className={candidate.sheet_id === sheet?.sheet_id ? 'active' : ''} onClick={() => onSelectedSheet(candidate.sheet_id)} data-testid={`artifact-sheet-${candidate.sheet_id}`}>{candidate.name}</button>)}</nav></header>{sheet ? <SpreadsheetGrid sheet={sheet}/> : <div className="artifact-empty">没有工作表</div>}</div>;
}

function RevisionItem({ revision, currentId, activeId, onSelect }: { revision: ArtifactRevisionMetadataView; currentId: string; activeId: string; onSelect: (revisionId: string) => void }) {
  return <button type="button" className={revision.revision_id === activeId ? 'active' : ''} onClick={() => onSelect(revision.revision_id)} data-testid={`artifact-revision-${revision.sequence}`}><span>R{revision.sequence}</span><small>{revision.revision_id === currentId ? '当前 · ' : ''}{relativeTime(revision.created_at)}</small></button>;
}

export function ArtifactSurface({ session, busy, onSelectRevision, onReturnCurrent, onArchiveState, onSelectedSlide, onSelectedSheet }: {
  session: ArtifactSurfaceSession;
  busy: boolean;
  onSelectRevision: (revisionId: string) => void;
  onReturnCurrent: () => void;
  onArchiveState: (archived: boolean) => void;
  onSelectedSlide: (index: number) => void;
  onSelectedSheet: (sheetId: string) => void;
}) {
  const read = session.read;
  if (session.loading && !read) return <div className="artifact-state"><span className="artifact-spinner"/>正在读取工作对象…</div>;
  if (session.error && !read) return <div className="artifact-state artifact-error" role="alert">{session.error}</div>;
  if (!read) return <div className="artifact-state artifact-error">这个工作对象暂时不可用。</div>;
  const archived = read.artifact.archived_at !== null;
  return <section className={`artifact-work-surface${session.mode === 'HISTORICAL' ? ' has-version-banner' : ''}`} data-testid="artifact-work-surface" data-artifact-id={read.artifact.artifact_id} data-view-mode={session.mode}>
    <header className="artifact-surface-header"><div><span className={`artifact-type-mark type-${read.artifact.artifact_type.toLowerCase()}`}><ShellIcon name={read.artifact.artifact_type === 'PRESENTATION' ? 'image' : 'files'}/></span><div><strong>{read.artifact.title || `未命名${artifactTypeLabel(read.artifact.artifact_type)}`}</strong><small>{artifactTypeLabel(read.artifact.artifact_type)} · R{read.revision.sequence}{archived ? ' · 已归档' : ''}</small></div></div><div>{session.mode === 'HISTORICAL' && <button type="button" onClick={onReturnCurrent} data-testid="artifact-return-current">回到当前版本</button>}<button type="button" disabled={busy} onClick={() => onArchiveState(!archived)} data-testid="artifact-archive-toggle">{archived ? '恢复' : '归档'}</button></div></header>
    {session.mode === 'HISTORICAL' && <div className="artifact-version-banner"><span>正在查看固定历史版本 R{read.revision.sequence}</span>{session.newRevisionAvailable && <strong>存在更新版本</strong>}</div>}
    <div className="artifact-surface-layout"><main className="artifact-surface-content">
      {read.revision.content.type === 'DOCUMENT' && <DocumentSurface read={read}/>}
      {read.revision.content.type === 'PRESENTATION' && <PresentationSurface read={read} selectedSlide={session.selectedSlide} onSelectedSlide={onSelectedSlide}/>}
      {read.revision.content.type === 'DIAGRAM' && <DiagramSurface read={read}/>}
      {read.revision.content.type === 'SPREADSHEET' && <SpreadsheetSurface read={read} selectedSheetId={session.selectedSheetId} onSelectedSheet={onSelectedSheet}/>}
    </main><aside className="artifact-history" aria-label="版本历史"><header><strong>版本历史</strong><small>按需读取精确版本</small></header>{session.history?.revisions.map((revision) => <RevisionItem key={revision.revision_id} revision={revision} currentId={read.artifact.current_revision_id} activeId={read.revision.revision_id} onSelect={onSelectRevision}/>) ?? <div className="artifact-state">正在读取…</div>}</aside></div>
  </section>;
}
