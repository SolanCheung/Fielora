import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const main = readFileSync(path.join(rendererRoot, '..', 'main.ts'), 'utf8');
const chrome = readFileSync(path.join(rendererRoot, 'DesktopChrome.tsx'), 'utf8');
const dock = readFileSync(path.join(rendererRoot, 'RightWorkspaceDock.tsx'), 'utf8');
const styles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
const primaryNav = readFileSync(path.join(rendererRoot, 'PrimaryNav.tsx'), 'utf8');
const fileTree = readFileSync(path.join(rendererRoot, 'WorkspaceFileTree.tsx'), 'utf8');

test('conversation uses one natural header instead of a duplicate workspace tab strip', () => {
  assert.match(workspace, /className="conversation-header conversation-context-header"/);
  assert.match(workspace, /className="conversation-title-line"><h2 title=\{conversation\.title\}>\{conversation\.title\}<\/h2><ConversationActionsMenu/);
  assert.doesNotMatch(workspace, /className="conversation-heading"><ShellIcon/);
  assert.doesNotMatch(workspace, /conversation-tab-strip|conversation-workspace-tab|closeConversationTab/);
  assert.doesNotMatch(styles, /\.conversation-tab-strip|\.conversation-workspace-tab/);
});

test('right resource view has animated opening, a resizable collapsible tree, and shared project launcher targets', () => {
  assert.match(styles, /\.project-layout \{[\s\S]*?transition: grid-template-columns var\(--fl-duration-panel\)/);
  assert.match(workspace, /testId="dock-file-tree-resizer"/);
  assert.match(workspace, /data-testid="dock-file-tree-toggle"/);
  assert.match(workspace, /setDockFileTreeCollapsed\(\(current\) => !current\)/);
  assert.match(workspace, /fielora:dock-file-tree-width/);
  assert.match(styles, /\.dock-resource-layout \{[\s\S]*?var\(--dock-file-tree-width,270px\)/);
  assert.match(styles, /\.dock-resource-layout\.file-tree-collapsed \{[\s\S]*?0 0/);
  assert.match(workspace, /data-testid="dock-project-open-default"><ShellIcon name="folder"\/><span>打开<\/span>/);
  assert.match(workspace, /data-testid="dock-project-open-menu"/);
  assert.match(workspace, /projectOpenTargets\.map\(\(target\)/);
  assert.match(styles, /\.right-dock-toolbar \.project-launcher-popover > button \{[\s\S]*?width: 100%[\s\S]*?grid-template-columns: 25px minmax\(0,1fr\)/);
  assert.equal(workspace.match(/data-testid="dock-file-tree-toggle"/g)?.length, 1);
  assert.match(main, /app\.getFileIcon\(executable, \{ size: 'normal' \}\)/);
  assert.match(workspace, /data-icon-source="native"/);
  assert.doesNotMatch(workspace, /<footer><span>\{session\.content === session\.file\.content/);
  assert.match(styles, /\.dock-resource-file-tree \{[\s\S]*?contain: layout paint[\s\S]*?animation: dock-file-tree-enter/);
  assert.doesNotMatch(styles, /\.dock-resource-layout \{[^}]*transition: grid-template-columns/);
});

test('review, local environment, and installed applications use recognizable semantic icons', () => {
  assert.match(readFileSync(path.join(rendererRoot, 'PrimaryNav.tsx'), 'utf8'), /diff: <><rect x="4" y="4" width="16" height="16" rx="3"\/><path d="M8 9h5M10\.5 6\.5v5M14\.5 15\.5h3"\/>/);
  assert.match(workspace, /<ShellIcon name="computer"\/><span><strong>本地<\/strong>/);
  for (const target of ['FILE_EXPLORER', 'VISUAL_STUDIO_CODE', 'CURSOR', 'VISUAL_STUDIO', 'GIT_BASH', 'INTELLIJ_IDEA', 'PYCHARM', 'WEBSTORM']) {
    assert.match(workspace, new RegExp(`${target}:`));
  }
  assert.match(workspace, /className=\{`workspace-app-icon target-\$\{target\.toLowerCase\(\)\}`\}/);
  assert.doesNotMatch(workspace, /FILE_EXPLORER: 'F'|VISUAL_STUDIO_CODE: '<\/>'|INTELLIJ_IDEA: 'IJ'/);
});

test('right dock plus follows the last soft-edged tab', () => {
  assert.match(dock, /<div className="right-dock-tabs"[\s\S]*?tabs\.map[\s\S]*?<\/div>\s*<div className="right-dock-add-wrap"/);
  assert.match(styles, /\.right-dock-tab-strip \{[\s\S]*?display: flex;[\s\S]*?padding: 4px 112px 4px 5px/);
  assert.match(styles, /\.right-dock-tabs \{[\s\S]*?width: max-content; max-width: calc\(100% - 32px\);[\s\S]*?flex: 0 1 auto/);
  assert.match(styles, /\.right-dock-tab \{[\s\S]*?border-radius: 9px/);
  assert.match(styles, /\.right-dock-tab\.active \{[\s\S]*?background: var\(--fl-color-surface-subtle\)/);
});

test('closing all dock tabs reopens the shared tool launcher and the dock remains mounted for motion', () => {
  assert.match(workspace, /if \(next\.length === 0\) \{[\s\S]*?setWorkspaceOpen\(false\)/);
  assert.match(chrome, /emit\('fielora:open-workspace-launcher'\)/);
  assert.match(workspace, /showLauncher=\{workspaceOpen && dockTabs\.length === 0\}/);
  assert.match(workspace, /\{project && <RightWorkspaceDock/);
  assert.match(dock, /data-testid="right-dock-home"/);
  assert.match(styles, /\.workspace-panel \{[\s\S]*?opacity: 0; visibility: hidden;[\s\S]*?translateX\(var\(--fl-motion-distance-panel\)\)/);
});

test('top rail terminal and right launcher terminal use separate presentations', () => {
  assert.match(chrome, /testId="rail-terminal"/);
  assert.match(chrome, /onClick=\{\(\) => emit\('fielora:toggle-terminal'\)\}/);
  assert.match(workspace, /data-testid="right-dock-home-terminal"|id: 'terminal'/);
  assert.match(workspace, /onRun=\{\(\) => void runTerminal\(terminalCommand, 'BOTTOM'\)\}/);
  assert.match(workspace, /onRun=\{\(\) => void runTerminal\(terminalCommand, 'RIGHT'\)\}/);
});

test('both terminals use a normal PowerShell transcript and prompt without legacy action chrome', () => {
  assert.match(workspace, /Windows PowerShell/);
  assert.match(workspace, /className="terminal-transcript"[\s\S]*?<form className="terminal-prompt" data-terminal-inline-prompt="true"/);
  assert.match(workspace, /PS \{workingDirectory\}&gt;/);
  assert.match(workspace, /working_directory: workingDirectory/);
  assert.match(workspace, /setTerminalWorkingDirectory\(started\.working_directory\)/);
  assert.match(workspace, /isLegacyTerminalMessage\(message\.content\)/);
  assert.doesNotMatch(workspace, /role: 'ASSISTANT', content: transcript/);
  assert.match(workspace, /active=\{bottomTerminalOpen\}/);
  assert.match(workspace, /active=\{workspaceOpen && tab\.id === activeDockTabId\}/);
  assert.doesNotMatch(workspace, /terminal-toolbar|data-testid="run-tests"|data-testid="bottom-terminal-tests"/);
  assert.match(styles, /\.terminal-session \{[\s\S]*?display: block;[\s\S]*?background: transparent;[\s\S]*?var\(--fl-font-agent-mono\)/);
  assert.match(styles, /\.terminal-transcript \{[\s\S]*?height: 100%;[\s\S]*?overflow: auto/);
  assert.match(styles, /\.terminal-prompt input \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none/);
  assert.match(styles, /\.right-terminal-view \{[\s\S]*?background: inherit/);
});

test('file surfaces use the shared rounded document icon language', () => {
  assert.match(primaryNav, /files: <><rect x="6" y="3\.5" width="12" height="17" rx="2\.5"\/><path d="M9\.5 9\.5h5M9\.5 13h5"\/><\/>/);
  assert.match(primaryNav, /source: <><rect x="6" y="3\.5" width="12" height="17" rx="2\.5"\/>/);
  assert.match(fileTree, /file: <><rect x="5\.5" y="4\.5" width="7" height="9" rx="1\.5"\/>/);
  assert.doesNotMatch(primaryNav, /files: <><path d="M7 3\.5h7l4 4/);
});
