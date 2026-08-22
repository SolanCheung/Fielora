import { useState } from 'react';
import {
  AGENTIC_UX_PROTOTYPE_VIEWS,
  AGENTIC_UX_REVIEW_FILES,
  type AgenticUXPrototypeView,
  type AgenticUXReviewFile,
} from './agentic-ux-prototype-data';

interface AgenticUXPrototypeProps {
  initialView: AgenticUXPrototypeView;
}

type ReviewMode = 'FULL_CONTROL' | 'REVIEW_CHANGES' | 'PARTIAL';

function PrototypeIcon({ name }: { name: 'plus' | 'shield' | 'microphone' | 'send' | 'chevron' }) {
  if (name === 'plus') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>;
  if (name === 'shield') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8 16 5v4.4c0 3.7-2.5 6.5-6 7.8-3.5-1.3-6-4.1-6-7.8V5l6-2.2Z" /></svg>;
  if (name === 'microphone') return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="3" width="6" height="10" rx="3" /><path d="M4.8 10.5a5.2 5.2 0 0 0 10.4 0M10 15.7V18" /></svg>;
  if (name === 'send') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 10 14-6-4.7 12-2.4-4.5L3 10Z" /><path d="m10 11.4 7-7.4" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function StepRow({ label, state, note }: { label: string; state: 'done' | 'failed' | 'skipped'; note?: string }) {
  return <div className={`prototype-step prototype-step--${state}`}>
    <span>{label}</span>
    <span className="prototype-step-result" aria-label={state === 'done' ? '完成' : state === 'failed' ? '失败' : '未执行'}>
      {state === 'done' ? '✓' : state === 'failed' ? '×' : '—'}{note ? ` ${note}` : ''}
    </span>
  </div>;
}

function CollapsedActivity({ kind }: { kind: Exclude<AgenticUXPrototypeView, 'RUNNING' | 'APPROVAL' | 'REVIEW'> | 'REVIEW' }) {
  const [expanded, setExpanded] = useState(false);
  const failed = kind === 'FAILED';
  const partial = kind === 'PARTIAL';
  const noChange = kind === 'NO_CHANGE';
  const duration = failed ? 18 : partial ? 21 : noChange ? 11 : 24;
  return <div className="prototype-completed-activity">
    <button type="button" className="prototype-activity-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      耗时 {duration} 秒 · {expanded ? '收起步骤' : '查看步骤'} <PrototypeIcon name="chevron" />
    </button>
    {expanded && <div className="prototype-steps" data-testid="prototype-inline-steps">
      <StepRow label="定位" state="done" />
      <StepRow label="修改" state={failed || noChange ? 'failed' : 'done'} note={noChange ? '无需修改' : undefined} />
      <StepRow label="验证" state={failed ? 'skipped' : partial ? 'skipped' : 'done'} note={failed ? '未执行' : partial ? '待完成' : undefined} />
      <details className="prototype-technical-details">
        <summary>技术信息</summary>
        <p>{failed ? '没有文件写入项目。' : noChange ? '检查范围：Controller 与表单模板。' : '2 个文件 · 1 次定向验证。'}</p>
      </details>
    </div>}
  </div>;
}

function RunningActivity() {
  return <div className="prototype-live-activity" aria-live="polite">
    <p><span className="prototype-live-dot" aria-hidden="true" /><strong>正在检查相关实现</strong><span>· 4 秒</span></p>
    <div className="prototype-evidence">
      <span>已定位 finance-add.controller.js</span>
      <span>正在确认模板中的字段约束</span>
    </div>
  </div>;
}

function AssistantTurn({ view, onOpenReview }: { view: AgenticUXPrototypeView; onOpenReview: () => void }) {
  const terminalView = view === 'REVIEW' ? 'SUCCESS' : view;
  return <section className="prototype-assistant-turn" data-testid={`prototype-assistant-${view.toLowerCase()}`}>
    {terminalView === 'RUNNING' && <>
      <p className="prototype-narrative">我先确认“用户”字段的必填规则来自哪里，<br />只调整这个字段，不影响其他表单校验。</p>
      <RunningActivity />
    </>}
    {terminalView === 'SUCCESS' && <>
      <CollapsedActivity kind={view === 'REVIEW' ? 'REVIEW' : 'SUCCESS'} />
      <div className="prototype-terminal-result">
        <h2>已经改好了。</h2>
        <p>“用户”字段现在允许为空，其他表单字段的校验没有变化。</p>
        <p className="prototype-result-meta">2 个文件修改 · 验证通过</p>
        <button type="button" className="prototype-text-action" onClick={onOpenReview}>查看修改</button>
      </div>
    </>}
    {terminalView === 'PARTIAL' && <>
      <CollapsedActivity kind="PARTIAL" />
      <div className="prototype-terminal-result">
        <h2>只完成了部分修改。</h2>
        <p>Controller 中的必填规则已经调整，但模板中的对应约束还没有安全确认，因此我没有继续扩大修改范围。</p>
        <p className="prototype-result-meta">1 个文件已修改</p>
        <div className="prototype-result-actions"><button type="button" className="prototype-primary-action">继续完成剩余部分</button><button type="button" className="prototype-text-action" onClick={onOpenReview}>查看修改</button></div>
      </div>
    </>}
    {terminalView === 'FAILED' && <>
      <CollapsedActivity kind="FAILED" />
      <div className="prototype-terminal-result">
        <h2>这次没有完成。</h2>
        <p>我已经找到目标实现，但没有得到足够可靠的修改方案，所以没有写入项目。</p>
        <div className="prototype-result-actions"><button type="button" className="prototype-primary-action">重新尝试</button><button type="button" className="prototype-text-action">查看步骤</button></div>
      </div>
    </>}
    {terminalView === 'NO_CHANGE' && <>
      <CollapsedActivity kind="NO_CHANGE" />
      <div className="prototype-terminal-result">
        <h2>无需修改。</h2>
        <p>我检查了与本次请求直接相关的实现，当前“用户”字段已经是非必填状态，所以没有改动项目。</p>
        <button type="button" className="prototype-text-action">查看检查范围</button>
      </div>
    </>}
    {terminalView === 'APPROVAL' && <div className="prototype-approval">
      <p className="prototype-narrative">我已经定位到需要修改的位置。</p>
      <p>这次只会调整“用户”字段的必填规则：</p>
      <ul><li>finance-add.controller.js</li><li>finance-add.html</li></ul>
      <p>不会修改其他表单字段。</p>
      <div className="prototype-result-actions"><button type="button" className="prototype-text-action">查看修改范围</button><button type="button" className="prototype-primary-action">允许修改</button></div>
    </div>}
  </section>;
}

function PrototypeComposer({ running }: { running: boolean }) {
  return <form className={`prototype-composer${running ? ' is-running' : ''}`} onSubmit={(event) => event.preventDefault()}>
    <textarea aria-label="消息" placeholder={running ? 'Agent 正在工作…' : '继续这条对话…'} disabled={running} />
    <div className="prototype-composer-controls">
      <button type="button" className="prototype-icon-control" aria-label="添加附件"><PrototypeIcon name="plus" /></button>
      <button type="button" className="prototype-compact-control"><PrototypeIcon name="shield" /><span>帮我批准</span><PrototypeIcon name="chevron" /></button>
      <button type="button" className="prototype-compact-control"><span>Qwen3.7-plus</span><PrototypeIcon name="chevron" /></button>
      <span className="prototype-composer-spacer" />
      <button type="button" className="prototype-icon-control" aria-label="语音输入"><PrototypeIcon name="microphone" /></button>
      <button type="submit" className="prototype-send-control" aria-label="发送" disabled={running}><PrototypeIcon name="send" /></button>
    </div>
  </form>;
}

function RawDiff({ file }: { file: AgenticUXReviewFile }) {
  return <pre className="prototype-raw-diff" data-testid="prototype-raw-diff">{file.rawDiff.split('\n').map((line) => <span key={line} className={line.startsWith('+') ? 'is-addition' : line.startsWith('-') ? 'is-deletion' : 'is-context'}>{line}</span>)}</pre>;
}

function ReviewPanel() {
  const [selectedPath, setSelectedPath] = useState<string>(AGENTIC_UX_REVIEW_FILES[0].path);
  const [diffMode, setDiffMode] = useState<'HUMAN' | 'RAW'>('HUMAN');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('FULL_CONTROL');
  const [notice, setNotice] = useState('');
  const selectedFile = AGENTIC_UX_REVIEW_FILES.find((file) => file.path === selectedPath) ?? AGENTIC_UX_REVIEW_FILES[0];
  const actions: Record<ReviewMode, string[]> = {
    FULL_CONTROL: ['打开文件', '恢复此文件', '恢复本次修改'],
    REVIEW_CHANGES: ['接受', '拒绝'],
    PARTIAL: ['保留当前修改', '恢复修改', '继续完成'],
  };
  return <aside className="prototype-review-panel" data-testid="prototype-human-review">
    <header><span className="prototype-kicker">变更</span><h2>本次任务</h2><p>新增发票页面</p></header>
    <section className="prototype-review-summary">
      <div><strong>2 个文件</strong><span className="prototype-change-count"><b>+2</b> <i>−2</i></span></div>
      <span>修改目标</span>
      <p>“用户”字段：必填 → 非必填</p>
    </section>
    <section className="prototype-file-section">
      <h3>已修改文件</h3>
      <div className="prototype-file-list">{AGENTIC_UX_REVIEW_FILES.map((file) => <button type="button" key={file.path} className={file.path === selectedFile.path ? 'is-active' : ''} onClick={() => setSelectedPath(file.path)}><span className="prototype-file-path">{file.path}</span><small><b>+{file.additions}</b> <i>−{file.deletions}</i></small></button>)}</div>
    </section>
    <section className="prototype-diff-section">
      <div className="prototype-diff-toolbar"><h3>{selectedFile.subject}</h3><div role="tablist" aria-label="Diff 类型"><button type="button" role="tab" aria-selected={diffMode === 'HUMAN'} onClick={() => setDiffMode('HUMAN')}>可视化</button><button type="button" role="tab" aria-selected={diffMode === 'RAW'} onClick={() => setDiffMode('RAW')}>原始 Diff</button></div></div>
      {diffMode === 'HUMAN' ? <div className="prototype-human-diff" data-testid="prototype-human-diff">
        <div className="prototype-diff-state is-before"><span>{selectedFile.beforeLabel}</span><code>{selectedFile.beforeValue}</code></div>
        <div className="prototype-diff-arrow" aria-hidden="true">↓</div>
        <div className="prototype-diff-state is-after"><span>{selectedFile.afterLabel}</span><code>{selectedFile.afterValue}</code></div>
        <p>{selectedFile.explanation}</p>
      </div> : <RawDiff file={selectedFile} />}
    </section>
    <footer className="prototype-review-actions">
      <div className="prototype-review-mode" aria-label="Review 操作模式">{(['FULL_CONTROL', 'REVIEW_CHANGES', 'PARTIAL'] as const).map((mode) => <button type="button" key={mode} className={reviewMode === mode ? 'is-active' : ''} onClick={() => { setReviewMode(mode); setNotice(''); }}>{mode === 'FULL_CONTROL' ? '完全访问' : mode === 'REVIEW_CHANGES' ? '审阅修改' : '部分完成'}</button>)}</div>
      <div className="prototype-review-button-row">{actions[reviewMode].map((action, index) => <button type="button" key={action} className={index === actions[reviewMode].length - 1 ? 'is-primary' : ''} onClick={() => setNotice(`${action} · Mock Prototype`)}>{action}</button>)}</div>
      {notice && <p className="prototype-review-notice">{notice}</p>}
    </footer>
  </aside>;
}

export function AgenticUXPrototype({ initialView }: AgenticUXPrototypeProps) {
  const [view, setView] = useState<AgenticUXPrototypeView>(initialView);
  const selectView = (next: AgenticUXPrototypeView) => {
    setView(next);
    window.history.replaceState(null, '', `#agentic-ux-prototype/${next}`);
  };
  return <main className={`agentic-ux-prototype is-${view.toLowerCase()}`} data-testid="agentic-ux-prototype" data-prototype-state={view}>
    <aside className="prototype-selector">
      <header><span className="prototype-brand-mark" aria-hidden="true" /><div><strong>Agentic UX</strong><small>Mock Prototype</small></div></header>
      <p>Conversation、Activity、Result 与 Human Review 的静态视觉原型。</p>
      <nav aria-label="Prototype Selector">{AGENTIC_UX_PROTOTYPE_VIEWS.map((item) => <button type="button" key={item.id} className={view === item.id ? 'is-active' : ''} onClick={() => selectView(item.id)} data-testid={`prototype-select-${item.id.toLowerCase()}`}><span>{item.label}</span><small>{item.id}</small></button>)}</nav>
      <footer><span>Mock Data</span><span>Runtime 未连接</span></footer>
    </aside>
    <section className={`prototype-workbench${view === 'REVIEW' ? ' with-review' : ''}`}>
      <div className="prototype-conversation-canvas">
        <header className="prototype-conversation-header"><div><strong>新增发票页面</strong><span>Agentic UX Prototype</span></div><span className="prototype-header-status">{view.replace('_', ' ')}</span></header>
        <div className="prototype-conversation-scroll">
          <div className="prototype-conversation-column">
            <section className="prototype-user-turn"><div className="prototype-speaker">用户</div><p>新增发票页面的用户表单改成非必填</p></section>
            <AssistantTurn view={view} onOpenReview={() => selectView('REVIEW')} />
          </div>
        </div>
        <PrototypeComposer running={view === 'RUNNING' || view === 'APPROVAL'} />
      </div>
      {view === 'REVIEW' && <ReviewPanel />}
    </section>
  </main>;
}
