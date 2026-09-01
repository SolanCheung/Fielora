import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = import.meta.dirname;
const read = (name: string) => readFileSync(path.join(root, name), 'utf8');
const settings = read('SettingsScreen.tsx');
const capabilities = read('CapabilityExtensionsSettings.tsx');
const skills = read('SkillsSettings.tsx');
const plugins = read('PluginSettings.tsx');
const artifact = read('ArtifactWorkingSurface.tsx');

test('Settings exposes one capability and extension destination without group subtitles', () => {
  assert.match(settings, /id: 'EXTENSIONS', label: t\('能力与扩展', 'Capabilities & extensions'\)/);
  assert.doesNotMatch(settings, /settings-nav-group|visibleGroups|<h2>\{group\}<\/h2>/);
  assert.match(settings, /id: 'GENERAL'.*icon: 'settings'/);
  assert.match(settings, /id: 'MODELS'.*icon: 'models'/);
  assert.match(settings, /id: 'EXTENSIONS'.*icon: 'extensions'/);
  assert.match(settings, /id: 'STORAGE_DATA'.*icon: 'storage'/);
  assert.match(settings, /label: t\('项目', 'Projects'\)/);
  assert.match(settings, /label: t\('现在', 'Now'\)/);
  assert.match(settings, /testId="ui-language"/);
  for (const language of ['SYSTEM', 'ZH_CN', 'EN']) assert.match(settings, new RegExp(`value: '${language}'`));
});

test('Capability and extension destination uses one accessible three-tab page', () => {
  assert.match(capabilities, /<h1>\{t\('能力与扩展', 'Capabilities & extensions'\)\}<\/h1>/);
  assert.match(capabilities, /role="tablist"/);
  assert.match(capabilities, /id: 'SKILLS', label: 'Skills'/);
  assert.match(capabilities, /id: 'MCP', label: 'MCP'/);
  assert.match(capabilities, /id: 'PLUGINS', label: t\('插件', 'Plugins'\)/);
  assert.match(capabilities, /role="tabpanel"/);
  assert.match(capabilities, /<SkillsSettings fieldId=\{fieldId\} embedded\/>/);
  assert.match(capabilities, /<McpSettings embedded\/>/);
  assert.match(capabilities, /<PluginSettings embedded\/>/);
});

test('Skill Settings is metadata-only and states its authority boundary', () => {
  assert.match(skills, /window\.fielora\.skill\.catalog/);
  assert.match(skills, /allowed-tools（建议声明，不授予权限）/);
  assert.match(skills, /不能授予 Tool 权限、绕过 Policy/);
  assert.doesNotMatch(skills, /loadSkill|load_skill|\.context\b|SKILL_BODY/);
});

test('Plugin Settings registers only explicit local roots and makes no executable claim', () => {
  assert.match(plugins, /window\.fielora\.plugin\.registerLocal/);
  assert.match(plugins, /window\.fielora\.plugin\.unregisterLocal/);
  assert.match(plugins, /不会运行代码、启动进程、访问网络、读取凭据或激活 MCP/);
  assert.doesNotMatch(plugins, /运行插件|插件进程|已验证发布者/);
});

test('Artifact polish removes slider controls and keeps bounded sparse viewport', () => {
  assert.doesNotMatch(artifact, /type="range"/);
  assert.match(artifact, /data-rendered-cells/);
  assert.match(artifact, /artifact-sheet-virtual-space/);
  assert.match(artifact, /artifact-diagram-fit/);
});
