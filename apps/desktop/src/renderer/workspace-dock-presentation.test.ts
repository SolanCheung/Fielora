import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const chrome = readFileSync(path.join(rendererRoot, 'DesktopChrome.tsx'), 'utf8');
const dock = readFileSync(path.join(rendererRoot, 'RightWorkspaceDock.tsx'), 'utf8');
const fileTree = readFileSync(path.join(rendererRoot, 'WorkspaceFileTree.tsx'), 'utf8');
const media = readFileSync(path.join(rendererRoot, 'AttachmentMedia.tsx'), 'utf8');
const styles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
const foundation = readFileSync(path.join(rendererRoot, 'styles', 'foundation.css'), 'utf8');
const tokens = readFileSync(path.join(rendererRoot, 'styles', 'tokens.css'), 'utf8');

test('conversation remains one natural work surface without a duplicate top tab strip', () => {
  assert.match(workspace, /function activateConversation\(id: string\) \{\s*setConversationId\(id\);\s*\}/);
  assert.match(workspace, /data-testid=\{`conversation-\$\{conversationItem\.id\}`\}/);
  assert.doesNotMatch(workspace, /conversation-tab-strip|conversation-workspace-tab|closeConversationTab/);
  assert.doesNotMatch(styles, /\.conversation-tab-strip|\.conversation-workspace-tab/);
});

test('all project tools share one persistent right workspace dock with closable tabs', () => {
  assert.match(dock, /right-workspace-dock workspace-panel/);
  assert.match(dock, /right-dock-tab-strip/);
  assert.match(dock, /right-dock-active-view/);
  for (const kind of ['BROWSER', 'FILES', 'REVIEW', 'TERMINAL']) assert.match(workspace, new RegExp(`openDockTool\\('${kind}'\\)`));
  assert.match(workspace, /dockTabs\.map\(\(tab\) =>/);
  assert.match(chrome, /route\.route !== 'PROJECTS'/);
  assert.doesNotMatch(workspace, /请先在当前 Project 新建一条对话，再打开工作区工具/);
  assert.match(chrome, /testId="rail-terminal"/);
  assert.match(chrome, /emit\('fielora:toggle-terminal'\)/);
  assert.match(chrome, /emit\('fielora:open-workspace-launcher'\)/);
  assert.match(workspace, /showLauncher=\{workspaceOpen && dockTabs\.length === 0\}/);
  assert.match(dock, /data-testid="right-dock-home"/);
  for (const id of ['review', 'terminal', 'browser', 'files', 'chat']) assert.match(workspace, new RegExp(`id: '${id}'`));
});

test('a project can exist without a conversation and exposes a finite creation entry', () => {
  assert.match(workspace, /data-testid="project-empty-conversation"/);
  assert.match(workspace, /开始新的工作/);
  assert.match(workspace, /withUiTimeout\(window\.fielora\.conversation\.create/);
  assert.match(workspace, /无法创建新对话/);
  assert.doesNotMatch(workspace, /正在准备新对话/);
  const addProject = workspace.match(/async function addProject\(\)[\s\S]*?\n {2}}/)?.[0] ?? '';
  assert.doesNotMatch(addProject, /createConversationFor/);
});

test('project controls relocate by ownership and expose real open and environment actions', () => {
  assert.match(chrome, /className="project-context-controls"/);
  assert.match(chrome, /projectDockOpen\) && <ToolbarAction/);
  assert.match(chrome, /fielora:toggle-workspace-focus/);
  assert.match(workspace, /data-testid="project-open-menu-toggle"/);
  assert.match(workspace, /workspace\.getOpenTargets/);
  assert.match(workspace, /workspace\.openProject/);
  assert.match(workspace, /data-testid="environment-popover"/);
  assert.match(workspace, /displayedAgentReview\.additions/);
  assert.match(workspace, /environmentSources\.map/);
  assert.match(styles, /\.project-context-controls \{ right: 89px;/);
  assert.match(styles, /data-workspace-panel-open="true"[\s\S]*?\.project-context-controls \{ right: calc/);
  assert.match(styles, /\.right-dock-tab-strip \{[\s\S]*?padding: 4px 112px 4px 5px;/);
  assert.doesNotMatch(styles, /data-workspace-panel-open="true"[^\n]*\.utility-control-dock \{ right: calc/);
});

test('files and images open as dock tabs and images expose location plus zoom', () => {
  assert.match(workspace, /const tabId = `file:\$\{entry\.relative_path\}`/);
  assert.match(workspace, /id: `image:\$\{attachment\.id\}`/);
  assert.match(workspace, /className="dock-image-preview"/);
  assert.match(media, /image-context-menu-location/);
  assert.match(media, /在右侧工作区显示/);
  assert.match(workspace, /onClick=\{\(\) => setPreviewAttachment\(imageAttachment\)\}/);
  assert.match(workspace, /当前桌面与 Agent Runtime 版本不一致。请重新打开最新 Fielora 后重试/);
  assert.match(fileTree, /data-file-kind=\{kind\}/);
  assert.match(fileTree, /data-testid="workspace-file-refresh"/);
  assert.match(workspace, /dockBreadcrumb\.map/);
  assert.doesNotMatch(workspace, /activeDockTab\.label<\/strong>/);
});

test('file and image tabs keep a Codex-like project tree beside the active resource', () => {
  assert.match(workspace, /className=\{`dock-resource-layout/);
  assert.match(workspace, /data-testid="dock-resource-file-tree"/);
  assert.match(workspace, /className="dock-project-launcher-main"/);
  assert.match(styles, /\.dock-resource-layout \{[\s\S]*?grid-template-columns: minmax\(0,1fr\) 4px var\(--dock-file-tree-width,270px\)/);
  assert.match(styles, /\.dock-resource-file-tree \{[\s\S]*?grid-column: 3/);
  assert.match(workspace, /testId="dock-file-tree-resizer"/);
});

test('file types use a modern semantic icon palette and product typography', () => {
  for (const kind of ['typescript', 'javascript', 'html', 'style', 'json', 'config', 'markdown', 'image']) {
    assert.match(fileTree, new RegExp(`${kind}:`));
    assert.match(styles, new RegExp(`\\.file-type-icon\\.is-${kind}`));
  }
  assert.match(fileTree, /className="file-type-tile"/);
  assert.match(styles, /\.file-tree-row \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: 13\.5px; font-weight: 430/);
});

test('workspace breadcrumbs and source editor use one typography system with semantic syntax color', () => {
  assert.match(styles, /\.conversation-header h2 \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: 15px; font-weight: 600/);
  assert.match(styles, /\.right-dock-breadcrumb \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: 12\.5px; font-weight: 430/);
  assert.match(styles, /\.dock-code-highlight, \.dock-code-editor-surface > \.dock-code-input \{[\s\S]*?font-family: var\(--fl-font-mono\); font-size: 13px; font-weight: 400/);
  assert.match(workspace, /function SyntaxCodeEditor/);
  assert.match(workspace, /className={`syntax-\$\{kind\}`}/);
  for (const token of ['keyword', 'property', 'string', 'number', 'comment', 'punctuation']) assert.match(tokens, new RegExp(`--fl-code-${token}:`));
});

test('terminal inherits the workspace canvas instead of drawing a nested grey panel', () => {
  assert.match(workspace, /function TerminalSession/);
  assert.match(styles, /\.right-terminal-view \{[\s\S]*?display: block;[\s\S]*?background: inherit/);
  assert.match(styles, /\.terminal-session \{[\s\S]*?background: transparent;[\s\S]*?var\(--fl-font-agent-mono\)/);
  assert.match(styles, /\.terminal-prompt input \{[\s\S]*?border: 0; outline: 0;[\s\S]*?background: transparent/);
  assert.doesNotMatch(workspace, /terminal-toolbar|data-testid="run-tests"|data-testid="bottom-terminal-tests"/);
});

test('top-right terminal control opens the animated bottom dock across the workspace', () => {
  assert.match(chrome, /active=\{terminalLayout\.open\}[\s\S]*?testId="rail-terminal"/);
  assert.match(workspace, /data-testid="bottom-terminal-dock"/);
  assert.match(workspace, /testId="bottom-terminal-resizer"/);
  assert.match(workspace, /fielora:terminal-state/);
  assert.match(styles, /\.desktop-terminal-layer \{[\s\S]*?height var\(--fl-duration-panel\) var\(--fl-ease-panel\)/);
  assert.match(styles, /\.desktop-terminal-layer \.terminal-resizer, \.desktop-terminal-layer \.terminal-dock \{[\s\S]*?translateY\(var\(--fl-motion-distance-surface\)\)[\s\S]*?opacity var\(--fl-duration-surface\)/);
  assert.match(tokens, /--fl-motion-distance-panel: 14px;/);
  assert.match(tokens, /--fl-motion-offset-popover: -4px;/);
  assert.match(workspace, /testId="bottom-terminal"/);
  assert.match(workspace, /testId="terminal"/);
  assert.match(workspace, /onRun=\{\(\) => void runTerminal\(terminalCommand, 'BOTTOM'\)\}/);
  assert.match(workspace, /onRun=\{\(\) => void runTerminal\(terminalCommand, 'RIGHT'\)\}/);
});

test('manual terminal output stays in the terminal and legacy terminal messages stay out of conversation', () => {
  assert.match(workspace, /function isLegacyTerminalMessage/);
  assert.match(workspace, /visibleMessages = messages\.filter/);
  assert.doesNotMatch(workspace, /function TerminalMessageProjection/);
  assert.doesNotMatch(workspace, /data-testid="terminal-technical-output"/);
  assert.doesNotMatch(workspace, /role: 'ASSISTANT', content: transcript/);
});

test('floating composer leaves a full-height scroll viewport with compact scrollbars', () => {
  assert.match(styles, /\.conversation-composer \{ position: absolute;[\s\S]*?bottom: 0;/);
  assert.match(styles, /\.message-list \{ grid-row: 2; padding-bottom: 238px;/);
  assert.match(styles, /\.right-workspace-dock\.workspace-panel/);
  assert.match(styles, /@media \(max-width: 1080px\)[\s\S]*?\.right-workspace-dock \{ position: absolute;/);
  assert.match(foundation, /\*::-webkit-scrollbar \{ width: 4px; height: 4px; \}/);
  assert.match(foundation, /\*::-webkit-scrollbar-track \{ background: transparent; \}/);
  assert.match(foundation, /var\(--fl-color-text-muted\) 9%, transparent/);
  assert.doesNotMatch(foundation, /scrollbar-width: thin/);
});
