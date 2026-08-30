import { useEffect, useMemo, useState } from 'react';
import { reviewDisplayFor, semanticReviewLabel, type AgentReviewChange, type AgentReviewFile, type AgentReviewSummary } from './agent-review';

interface AgentHumanReviewProps {
  review: AgentReviewSummary;
  task: string;
  runId: string;
  onOpenFile: (path: string) => void;
  onMarkReviewed?: (file: AgentReviewFile) => Promise<void>;
  onUndo?: (file: AgentReviewFile) => Promise<void>;
  selectedPathHint?: string;
}

function taskLabel(task: string): string {
  const firstLine = task.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine || '本次 Agent 任务';
}

function changeVerb(file: AgentReviewFile): string {
  return ({ CREATE: '新增', MODIFY: '修改', DELETE: '删除', RENAME: '重命名' } as const)[file.changeType];
}

function changeHeading(file: AgentReviewFile): string {
  return ({ CREATE: '新增文件', MODIFY: '代码变更', DELETE: '删除文件', RENAME: '文件重命名' } as const)[file.changeType];
}

function CodeSurface({ value, tone }: { value: string; tone?: 'before' | 'after' | 'create' | 'delete' }) {
  return <pre className={`human-code-surface${tone ? ` is-${tone}` : ''}`}><code>{value}</code></pre>;
}

function compactModify(change: AgentReviewChange): boolean {
  if (change.before === null || change.before.length + change.after.length > 520) return false;
  return change.before.split(/\r?\n/).length <= 3 && change.after.split(/\r?\n/).length <= 3;
}

function changeBindingLabel(change: AgentReviewChange): string | null {
  if (change.before === null) return null;
  const before = change.before.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/u)?.[1];
  const after = change.after.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/u)?.[1];
  return before && before === after ? before : null;
}

function InlineModifyChange({ change, label }: { change: AgentReviewChange; label: string | null }) {
  return <div className="human-inline-change" data-human-diff-layout="inline">
    {label && <p className="human-diff-semantic-label">{label}</p>}
    <pre className="human-inline-diff" aria-label="紧凑代码变更"><code>
      {change.before!.split(/\r?\n/).map((line, index) => <span className="is-remove" key={`remove-${index}`}><i aria-hidden="true">−</i>{line}</span>)}
      {change.after.split(/\r?\n/).map((line, index) => <span className="is-add" key={`add-${index}`}><i aria-hidden="true">+</i>{line}</span>)}
    </code></pre>
  </div>;
}

function ModifyChange({ change, semantic }: { change: AgentReviewChange; semantic: boolean }) {
  const label = semantic ? semanticReviewLabel(change) : changeBindingLabel(change);
  if (compactModify(change)) return <InlineModifyChange change={change} label={label}/>;
  return <div className="human-diff-change">
    {label && <p className="human-diff-semantic-label">{label}</p>}
    <div className="human-diff-state-label">修改前</div>
    <CodeSurface value={change.before ?? ''} tone="before"/>
    <span className="human-diff-arrow" aria-hidden="true"/>
    <div className="human-diff-state-label">修改后</div>
    <CodeSurface value={change.after} tone="after"/>
  </div>;
}

function VisualReview({ file, display }: { file: AgentReviewFile; display: ReturnType<typeof reviewDisplayFor> }) {
  if (file.changeType === 'CREATE') return <div className="human-diff human-diff-create" data-testid="agent-review-human-diff" data-human-diff-kind="create">
    <CodeSurface value={file.changes[0]?.after ?? ''} tone="create"/>
  </div>;
  if (file.changeType === 'DELETE') return <div className="human-diff human-diff-delete" data-testid="agent-review-human-diff" data-human-diff-kind="delete">
    <CodeSurface value={file.changes[0]?.before ?? ''} tone="delete"/>
  </div>;
  if (file.changeType === 'RENAME') return <div className="human-diff human-diff-rename" data-testid="agent-review-human-diff" data-human-diff-kind="rename">
    <code>{file.previousPath}</code><span className="human-rename-arrow" aria-hidden="true"/><code>{file.path}</code>
  </div>;
  return <div className="human-diff" data-testid="agent-review-human-diff" data-human-diff-kind={display.toLowerCase()}>
    {file.changes.map((change, index) => <ModifyChange change={change} semantic={display === 'SEMANTIC'} key={`${file.path}-${index}`}/>)}
  </div>;
}

export function AgentHumanReview({ review, task, runId, onOpenFile, onMarkReviewed, onUndo, selectedPathHint = '' }: AgentHumanReviewProps) {
  const [selectedPath, setSelectedPath] = useState(review.files[0]?.path ?? '');
  const [reviewedRevisions, setReviewedRevisions] = useState<string[]>([]);
  const [undoFinished, setUndoFinished] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const initialFile = review.files[0] ?? null;
  const [mode, setMode] = useState<'VISUAL' | 'RAW'>(() => initialFile && reviewDisplayFor(initialFile) !== 'RAW' ? 'VISUAL' : 'RAW');
  useEffect(() => {
    if (!review.files.some((file) => file.path === selectedPath)) setSelectedPath(review.files[0]?.path ?? '');
  }, [review.files, selectedPath]);
  useEffect(() => {
    if (!selectedPathHint || !review.files.some((file) => file.path === selectedPathHint)) return;
    const next = review.files.find((file) => file.path === selectedPathHint)!;
    setSelectedPath(selectedPathHint);
    setMode(reviewDisplayFor(next) === 'RAW' ? 'RAW' : 'VISUAL');
  }, [review.files, selectedPathHint]);
  const selected = useMemo<AgentReviewFile | null>(() => review.files.find((file) => file.path === selectedPath) ?? review.files[0] ?? null, [review.files, selectedPath]);
  const display = selected ? reviewDisplayFor(selected) : 'RAW';

  return <section className="agent-review agent-human-review" data-testid="agent-review" data-review-mode={mode} data-agent-run-id={runId} data-file-count={review.files.length} data-additions={review.additions} data-deletions={review.deletions} aria-label={taskLabel(task)}>
    <header className="human-review-heading">
      <h2>变更</h2>
      <p className="human-review-count"><strong>{review.files.length} 文件</strong><span className="diff-additions">+{review.additions}</span><span className="diff-deletions">−{review.deletions}</span></p>
    </header>

    {selected && <p className="human-review-summary" title={taskLabel(task)}>{changeVerb(selected)} <code>{selected.path.split('/').at(-1)}</code></p>}

    {review.files.length > 1 && <div className="human-review-files" aria-label="已修改文件">
      {review.files.map((file) => <button type="button" className={file.path === selected?.path ? 'active' : ''} onClick={() => { setSelectedPath(file.path); setMode(reviewDisplayFor(file) === 'RAW' ? 'RAW' : 'VISUAL'); }} key={file.path} data-testid="agent-review-file" data-change-type={file.changeType}>
        <span>{file.path}</span><small><b className="diff-additions">+{file.additions}</b><b className="diff-deletions">−{file.deletions}</b></small>
      </button>)}
    </div>}

    {selected && <div className={`human-review-detail${review.files.length === 1 ? ' is-single-file' : ''}`} data-change-type={selected.changeType} data-testid="agent-review-file" data-change-type-summary={selected.changeType}>
      {selected.changeType !== 'CREATE' && <h3>{changeHeading(selected)}</h3>}
      {selected.applicability === 'CHANGED_SINCE' && <p className="human-review-stale" data-testid="agent-review-stale">当前文件已在这次修改之后继续变化；下方仍是当时的原始 Diff。</p>}
      {mode === 'VISUAL' && display !== 'RAW'
        ? <VisualReview file={selected} display={display}/>
        : <pre className="human-review-raw" data-testid="agent-review-diff">{selected.diff}</pre>}
      <footer>
        <div className="human-review-mode" role="tablist" aria-label="Diff 显示方式">
          {display !== 'RAW' && <button type="button" role="tab" aria-selected={mode === 'VISUAL'} onClick={() => setMode('VISUAL')} data-testid="agent-review-human">可视化</button>}
          <button type="button" role="tab" aria-selected={mode === 'RAW'} onClick={() => setMode('RAW')} data-testid="agent-review-raw">原始 Diff</button>
        </div>
        <div>
          {selected.artifactId && selected.revisionId && onMarkReviewed && selected.reviewState !== 'REVIEWED' && !reviewedRevisions.includes(selected.revisionId) && <button type="button" disabled={actionBusy} onClick={() => { setActionBusy(true); void onMarkReviewed(selected).then(() => setReviewedRevisions((items) => [...items, selected.revisionId!])).catch(() => undefined).finally(() => setActionBusy(false)); }} data-testid="agent-review-mark-reviewed">标记已审阅</button>}
          {selected.artifactId && selected.revisionId && onUndo && selected.undoAvailability === 'AVAILABLE' && !undoFinished.includes(selected.revisionId) && <button type="button" disabled={actionBusy} onClick={() => { setActionBusy(true); void onUndo(selected).then(() => setUndoFinished((items) => [...items, selected.revisionId!])).catch(() => undefined).finally(() => setActionBusy(false)); }} data-testid="agent-review-undo">撤销这次修改</button>}
          {selected.undoAvailability === 'BLOCKED_CHANGED_SINCE' && <span data-testid="agent-review-undo-blocked">当前文件已变化，无法安全撤销</span>}
          <button type="button" className="human-review-open-file" onClick={() => onOpenFile(selected.path)}>打开文件</button>
        </div>
      </footer>
    </div>}
  </section>;
}
