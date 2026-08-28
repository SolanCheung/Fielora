import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = import.meta.dirname;
const read = (name: string) => readFileSync(path.join(root, name), 'utf8');
const settings = read('SettingsScreen.tsx');
const skills = read('SkillsSettings.tsx');
const plugins = read('PluginSettings.tsx');
const artifact = read('ArtifactWorkingSurface.tsx');

test('Settings exposes existing Skills, MCP and declarative Plugins in one group', () => {
  assert.match(settings, /group: 'AI 与扩展'/);
  assert.match(settings, /id: 'SKILLS'/);
  assert.match(settings, /id: 'MCP'/);
  assert.match(settings, /id: 'PLUGINS'/);
  assert.match(settings, /label: '项目'/);
  assert.match(settings, /label: '现在'/);
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
