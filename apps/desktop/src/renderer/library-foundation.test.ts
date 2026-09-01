import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = import.meta.dirname;
const navigation = readFileSync(path.join(root, 'PrimaryNav.tsx'), 'utf8');
const library = readFileSync(path.join(root, 'LibraryScreen.tsx'), 'utf8');
const browser = readFileSync(path.join(root, 'BrowseScreen.tsx'), 'utf8');
const project = readFileSync(path.join(root, 'ProjectWorkspace.tsx'), 'utf8');
const settings = readFileSync(path.join(root, 'SettingsScreen.tsx'), 'utf8');

test('fixed sidebar converges on New chat, Now, and Library while preserving the project list', () => {
  assert.match(navigation, /data-testid="new-conversation"/);
  assert.match(navigation, /data-testid="now-nav"/);
  assert.match(navigation, /data-testid="library-nav"/);
  assert.doesNotMatch(navigation, /data-testid="(?:fields|inbox|browse)-nav"/);
  assert.match(navigation, /className="project-tree"/);
  assert.match(project, /className="project-list"/);
});

test('Library exposes focused file/web flows and Browser runtime keeps a save action', () => {
  assert.match(library, /<WorkspaceSurface className="library-root"/);
  assert.match(library, /readWorkspaceNavigationWidth\(WORKSPACE_NAVIGATION_DEFAULT_WIDTH/);
  assert.match(library, /navigationResizerTestId="library-navigation-resizer"/);
  assert.match(library, /data-testid="library-add-file"/);
  for (const label of ['全部', '网页', '文件', '图片', '音频', '视频']) assert.match(library, new RegExp(`label: '${label}'`));
  assert.match(library, /window\.fielora\.library\.delete/);
  assert.match(library, /window\.fielora\.library\.open/);
  assert.match(browser, /data-testid="browser-save-library"/);
  assert.match(project, /openDockTool\('BROWSER'\)/);
});

test('Browser owns its overflow settings entry and global settings exposes the Browser-only surface', () => {
  assert.match(browser, /data-testid="browser-overflow"/u);
  assert.match(browser, /data-testid="browser-open-settings"/u);
  assert.match(settings, /data-testid="settings-browser"/u);
  assert.doesNotMatch(settings, /id: 'BROWSER', label:/u);
});
