import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const browser = readFileSync(path.join(rendererRoot, 'BrowseScreen.tsx'), 'utf8');
const divider = readFileSync(path.join(rendererRoot, 'ResizableDivider.tsx'), 'utf8');
const chrome = readFileSync(path.join(rendererRoot, 'DesktopChrome.tsx'), 'utf8');
const dock = readFileSync(path.join(rendererRoot, 'RightWorkspaceDock.tsx'), 'utf8');
const fileTree = readFileSync(path.join(rendererRoot, 'WorkspaceFileTree.tsx'), 'utf8');
const fileTypeIcons = readFileSync(path.join(rendererRoot, 'ui', 'FileTypeIcon.tsx'), 'utf8');
const media = readFileSync(path.join(rendererRoot, 'AttachmentMedia.tsx'), 'utf8');
const styles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
const foundation = readFileSync(path.join(rendererRoot, 'styles', 'foundation.css'), 'utf8');
const layout = readFileSync(path.join(rendererRoot, 'styles', 'layout.css'), 'utf8');
const appearance = readFileSync(path.join(rendererRoot, 'styles', 'appearance.css'), 'utf8');
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
  assert.match(workspace, /tools=\{dockTools\}/);
  assert.match(dock, /data-testid="right-dock-home"/);
  assert.match(dock, /data-testid="right-dock-tool-menu"/);
  assert.match(dock, /createPortal\(<div ref=\{toolMenuRef\} className="right-dock-tool-menu-layer"[\s\S]*?document\.body\)/);
  assert.match(styles, /\.right-dock-tool-menu-layer \{ position: fixed;[\s\S]*?z-index: var\(--fl-layer-popover\);/);
  assert.match(dock, /onReload: \(id: string\) => void/);
  assert.match(dock, /onDuplicate: \(id: string\) => void/);
  assert.match(workspace, /onReload=\{reloadDockTab\}/);
  assert.match(workspace, /onDuplicate=\{duplicateDockTab\}/);
  assert.doesNotMatch(dock, /WorkspaceObjectPicker/);
  assert.match(dock, /createPortal\(<div ref=\{contextMenuRef\}[\s\S]*?document\.body\)/);
  for (const id of ['review', 'terminal', 'browser', 'files']) assert.match(workspace, new RegExp(`id: '${id}'`));
  assert.doesNotMatch(workspace, /id: 'artifacts'/);
  assert.doesNotMatch(workspace, /id: 'chat'/);
});

test('right workspace dock keeps a dynamic resize range and full-width tool views', () => {
  assert.match(workspace, /const PROJECT_WORKSPACE_DEFAULT_WIDTH = 635;/);
  assert.match(workspace, /const PROJECT_WORKSPACE_MIN_WIDTH = 360;/);
  assert.match(workspace, /const CONVERSATION_MIN_WIDTH = 340;/);
  assert.match(workspace, /availableWorkArea - CONVERSATION_MIN_WIDTH - WORKSPACE_RESIZER_WIDTH/);
  assert.match(workspace, /workspacePreferredWidthRef/);
  assert.match(workspace, /new ResizeObserver\(sync\)/);
  assert.match(workspace, /workspaceDragGeometryRef/);
  assert.match(workspace, /onResizeStart=\{\(\) =>/);
  assert.match(workspace, /captureWorkspaceDragGeometry\(\)/);
  assert.match(workspace, /onResizeEnd=\{\(clientX\) =>/);
  assert.match(divider, /onResizeStart\?\.\(position\)/);
  assert.match(divider, /requestAnimationFrame/);
  assert.match(divider, /getCoalescedEvents/);
  assert.match(browser, /showInFlight/);
  assert.match(browser, /queuedBounds/);
  assert.doesNotMatch(browser, /browser\.show\(bounds\)\.then\(\(state\)/);
  assert.doesNotMatch(workspace, /PROJECT_WORKSPACE_MAX_WIDTH/);
  assert.match(layout, /\.right-workspace-dock,[\s\S]*?\.right-dock-view-browser \.browse-panel,[\s\S]*?\.right-terminal-view \.terminal-session \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;/);
  assert.match(layout, /\.project-layout\.workspace-open \.project-workspace-resizer span \{[\s\S]*?width: 1px;[\s\S]*?opacity: 1;[\s\S]*?var\(--fl-color-workspace-divider\)/);
  assert.match(layout, /\.project-layout\.workspace-open \.project-workspace-resizer \{[\s\S]*?background: var\(--fl-surface-content\)/);
  assert.match(layout, /\.project-layout\.workspace-open \.project-workspace-resizer\.dragging span \{[\s\S]*?width: 1px;[\s\S]*?var\(--fl-color-workspace-divider\)/);
  assert.match(layout, /\.project-layout\.workspace-open\.dock-focused \{[\s\S]*?--fl-project-conversation-min-track: 0px;[\s\S]*?--fl-project-workspace-track: calc\(100%/);
  assert.doesNotMatch(layout, /\.project-layout\.workspace-open\.dock-focused \{\s*grid-template-columns:/);
  assert.match(layout, /:root\[data-resizing="vertical"\] \.project-layout \{\s*transition: none;/);
  assert.doesNotMatch(layout, /\.dock-code-highlight \{\s*visibility: hidden;/);
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

test('project controls keep environment in the conversation header and file opening in resource toolbars', () => {
  assert.match(chrome, /className="project-context-controls"/);
  assert.match(chrome, /projectDockOpen\) && <ToolbarAction/);
  assert.match(chrome, /fielora:toggle-workspace-focus/);
  assert.match(readFileSync(path.join(rendererRoot, 'ui', 'Icon.tsx'), 'utf8'), /focus: ArrowsOutSimple/);
  assert.doesNotMatch(workspace, /data-testid="project-open-menu-toggle"/);
  assert.doesNotMatch(workspace, /data-testid="project-open-default"/);
  assert.match(workspace, /data-testid="dock-project-open-menu-toggle"/);
  assert.match(workspace, /data-testid="dock-project-open-default"/);
  assert.match(workspace, /workspace\.getOpenTargets/);
  assert.match(workspace, /workspace\.openProject/);
  assert.match(workspace, /data-testid="environment-popover"/);
  assert.match(workspace, /displayedAgentReview\.additions/);
  assert.match(workspace, /environmentSources\.map/);
  assert.match(styles, /\.project-context-controls \{ right: 89px;/);
  assert.match(styles, /data-workspace-panel-open="true"[\s\S]*?\.project-context-controls \{ right: calc/);
  assert.match(styles, /\.right-dock-tab-strip \{[\s\S]*?padding: 4px 6px 4px 5px;/);
  assert.doesNotMatch(styles, /data-workspace-panel-open="true"[^\n]*\.utility-control-dock \{ right: calc/);
});

test('generated work objects keep their direct Artifact surface without a duplicate launcher tool', () => {
  const icons = readFileSync(path.join(rendererRoot, 'ui', 'Icon.tsx'), 'utf8');
  const artifacts = readFileSync(path.join(rendererRoot, 'ArtifactWorkingSurface.tsx'), 'utf8');
  assert.match(icons, /objects: Shapes/);
  assert.match(workspace, /kind: 'ARTIFACT'/);
  assert.match(workspace, /<ArtifactSurface/);
  assert.doesNotMatch(workspace, /kind: 'ARTIFACTS'|id: 'artifacts', label: '工作对象'|<ArtifactCatalog/);
  assert.match(artifacts, /<AppIcon name="objects"\/>/);
  assert.match(styles, /\.right-dock-view-artifact \{[\s\S]*?background: var\(--fl-surface-content\)/);
});

test('browser pages reuse the workspace tab strip while standalone browse keeps its own strip', () => {
  assert.match(styles, /\.browse-content \{[^}]*grid-template-rows: auto auto minmax\(0,1fr\);[^}]*background: var\(--fl-surface-content\)/);
  assert.match(styles, /\.browse-content\.browser-tabs-in-workspace \{ grid-template-rows: auto minmax\(0,1fr\); \}/);
  assert.match(layout, /\.right-dock-view-browser,[\s\S]*?\.right-dock-view-browser \.browse-empty \{[\s\S]*?background: var\(--fl-surface-content\);[\s\S]*?\}/);
  assert.match(appearance, /\.browse-content \{ background: var\(--fl-surface-content\); \}/);
  assert.match(appearance, /\.browser-page-strip \{[\s\S]*?min-height: 34px;[\s\S]*?background: transparent;/);
  assert.match(dock, /tab\.tabHostId[\s\S]*?className="right-dock-tab-host"/);
  assert.match(workspace, /BROWSER:[^\n]*tabHostId: 'right-workspace-browser-page-tabs'/);
  assert.match(workspace, /workspaceTabHostId=\{tab\.tabHostId\}/);
  assert.match(browser, /workspaceTabHost && createPortal\(pageTabs, workspaceTabHost, 'browser-workspace-pages'\)/);
  assert.match(browser, /\{!workspaceTabHostId && <div className="browser-page-strip">/);
  assert.match(appearance, /\.browser-toolbar \{[\s\S]*?min-height: 44px;[\s\S]*?background: transparent;/);
  assert.match(appearance, /\.address-form input \{[\s\S]*?height: 34px;/);
  assert.match(appearance, /\.browser-actions button,[\s\S]*?\.browser-overflow-button \{[\s\S]*?width: 30px;[\s\S]*?height: 30px;/);
  assert.match(browser, /<div className="browse-empty"><AppIcon name="browse"\/><h2>开始浏览<\/h2><p>输入 URL 以打开页面<\/p><\/div>/);
});

test('files and images open as dock tabs and images expose location plus zoom', () => {
  assert.match(workspace, /const tabId = options\?\.targetTabId \?\? `file:\$\{entry\.relative_path\}`/);
  assert.match(workspace, /id: `image:\$\{attachment\.id\}`/);
  assert.match(workspace, /className="dock-image-preview"/);
  assert.match(media, /image-context-menu-location/);
  assert.match(media, /在右侧工作区显示/);
  assert.match(workspace, /onClick=\{\(\) => setPreviewAttachment\(imageAttachment\)\}/);
  assert.match(workspace, /当前桌面与 Agent Runtime 版本不一致。请重新打开最新 Fielora 后重试/);
  assert.match(fileTypeIcons, /data-file-kind=\{kind\}/);
  assert.match(fileTree, /data-testid="workspace-file-refresh"/);
  assert.match(workspace, /dockBreadcrumb\.map/);
  assert.match(workspace, /loading: true/);
  assert.match(workspace, /正在载入文件/);
  assert.match(workspace, /正在载入图片/);
  assert.match(workspace, /<SyntaxCodeEditor value=\{session\.content\}/);
  assert.match(layout, /\.dock-image-preview > button \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
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
    assert.match(fileTypeIcons, new RegExp(`kind: '${kind}'`));
    assert.match(styles, new RegExp(`\\.file-type-icon\\.is-${kind}`));
  }
  assert.match(fileTypeIcons, /data-file-icon-source="material-icon-theme"/);
  assert.match(fileTypeIcons, /assets\/file-icons/);
  assert.doesNotMatch(fileTypeIcons, /<svg\b|<path\b|<rect\b/);
  assert.match(styles, /\.file-tree-row \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: var\(--fl-font-size-label\); font-weight: 400/);
});

test('workspace breadcrumbs and source editor use one typography system with semantic syntax color', () => {
  assert.match(styles, /\.conversation-header h2 \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: 15px; font-weight: 600/);
  assert.match(styles, /\.right-dock-breadcrumb \{[\s\S]*?font-family: var\(--fl-font-sans\); font-size: var\(--fl-font-size-meta\); font-weight: 400/);
  const editor = readFileSync(path.join(import.meta.dirname, 'SyntaxCodeEditor.tsx'), 'utf8');
  assert.match(editor, /fontFamily: 'var\(--fl-font-mono\)'/);
  assert.match(editor, /fontSize: 'var\(--fl-code-font-size\)'/);
  assert.match(editor, /syntaxHighlighting\(highlighting\)/);
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
  assert.match(workspace, /visibleMessages = useMemo\(\(\) => messages\.filter/);
  assert.doesNotMatch(workspace, /function TerminalMessageProjection/);
  assert.doesNotMatch(workspace, /data-testid="terminal-technical-output"/);
  assert.doesNotMatch(workspace, /role: 'ASSISTANT', content: transcript/);
});

test('floating composer leaves a full-height scroll viewport with compact scrollbars', () => {
  assert.match(styles, /\.conversation-composer \{ position: absolute;[\s\S]*?bottom: 0;/);
  assert.match(styles, /\.message-list \{ grid-row: 2; padding-bottom: 238px;/);
  assert.match(styles, /\.right-workspace-dock\.workspace-panel/);
  assert.doesNotMatch(styles, /\.project-layout\.workspace-open \.right-workspace-dock \{ position: absolute/);
  assert.match(foundation, /\*::-webkit-scrollbar \{ width: 4px; height: 4px; \}/);
  assert.match(foundation, /\*::-webkit-scrollbar-track \{ background: transparent; \}/);
  assert.match(foundation, /var\(--fl-color-text-muted\) 9%, transparent/);
  assert.doesNotMatch(foundation, /scrollbar-width: thin/);
});
