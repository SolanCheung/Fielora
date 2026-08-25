import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const navigation = readFileSync(path.join(rendererRoot, 'PrimaryNav.tsx'), 'utf8');
const styles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');

test('markdown files default to responsive preview and keep a source toggle in the shared dock toolbar', () => {
  assert.match(workspace, /markdownMode: isMarkdownFile\(file\.relative_path\) \? 'PREVIEW' : undefined/);
  assert.match(workspace, /data-testid="markdown-view-toggle"/);
  assert.match(workspace, /data-testid="markdown-preview-toggle">预览<\/button>/);
  assert.match(workspace, /data-testid="markdown-source-toggle">源代码<\/button>/);
  assert.match(workspace, /data-testid="markdown-preview"><MarkdownMessage content=\{session\.content\}/);
  assert.match(styles, /\.dock-markdown-preview \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto/);
  assert.match(styles, /\.dock-markdown-preview \.markdown-code-block pre \{[^}]*overflow-x: hidden;[^}]*white-space: pre-wrap/);
  assert.match(styles, /\.dock-markdown-preview table \{[^}]*table-layout: fixed/);
});

test('code and markdown source viewers wrap to the available workspace width without horizontal scrolling', () => {
  assert.match(workspace, /wrap="soft"/);
  assert.doesNotMatch(workspace, /wrap="off"/);
  assert.match(styles, /\.dock-code-highlight, \.dock-code-editor-surface > \.dock-code-input \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere/);
  assert.match(styles, /\.dock-code-editor-surface > \.dock-code-input \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto/);
  assert.doesNotMatch(styles, /\.dock-code-line \{[^}]*min-width: max-content/);
});

test('chat review actions open or activate file-specific diff tabs in the existing right workspace', () => {
  assert.match(workspace, /id: `review:\$\{runId\}:\$\{relativePath \|\| 'summary'\}`/);
  assert.match(workspace, /label: relativePath \? `\$\{fileTabLabel\(relativePath\)\} Diff` : '变更 Diff'/);
  assert.match(workspace, /kind: 'REVIEW'/);
  assert.match(workspace, /selectedPathHint=\{tab\.relativePath \?\? agentReviewPath\}/);
  assert.match(workspace, /onReviewFile=\{\(path\) => openAgentReview\(path\)\}/);
});

test('selected project title toggles its conversation branch and hides the absolute path from the primary row', () => {
  assert.match(workspace, /const \[collapsedProjectIds, setCollapsedProjectIds\]/);
  assert.match(workspace, /aria-expanded=\{item\.field_id === projectId && !collapsedProjectIds\.has\(item\.field_id\)\}/);
  assert.match(workspace, /!collapsedProjectIds\.has\(item\.field_id\) && <div className="conversation-section"/);
  assert.match(workspace, /className="project-item" title=\{item\.root_path\}/);
  assert.doesNotMatch(workspace, /<small>\{item\.root_path\}<\/small>/);
  assert.match(styles, /\.conversation-section \{[^}]*border-left:/);
});

test('system navigation labels are consistently Chinese', () => {
  assert.match(navigation, /data-testid="new-conversation"[^>]*>[\s\S]*?<span>新聊天<\/span>/);
  assert.match(navigation, /data-testid="now-nav"[^>]*>[\s\S]*?<span>现在<\/span>/);
  assert.match(navigation, /data-testid="library-nav"[^>]*>[\s\S]*?<span>资料库<\/span>/);
  assert.doesNotMatch(navigation, /data-testid="(?:fields|inbox|browse)-nav"/);
  assert.doesNotMatch(navigation, /<span>(?:Now|Fields|Inbox|Browser)<\/span>/);
});
