import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeSkillMetadata } from './ui-localization.ts';

test('trusted built-in Skill metadata is localized without changing its stable identifier', () => {
  const skill = {
    name: 'understand_project',
    description: 'Build a bounded evidence-based map of an unfamiliar repository.',
    source_kind: 'BUILTIN',
  };
  assert.deepEqual(localizeSkillMetadata(skill, 'zh-CN'), {
    name: '理解项目',
    description: '为不熟悉的代码仓库建立一份有边界、基于证据的结构地图。',
  });
  assert.equal(localizeSkillMetadata(skill, 'en').name, 'Understand project');
  assert.equal(skill.name, 'understand_project');
});

test('project and plugin Skill metadata remains author-provided text', () => {
  const projectSkill = { name: 'review_diff', description: '项目自己的说明', source_kind: 'PROJECT_AGENT_SKILL' };
  assert.deepEqual(localizeSkillMetadata(projectSkill, 'en'), { name: 'review_diff', description: '项目自己的说明' });
});
