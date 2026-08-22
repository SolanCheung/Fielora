import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const FAST_EDIT_TASK = '删除项目列表页面“显示/隐藏列”中的“进行阶段”相关配置，同时删除对应残留配置，不修改其他业务逻辑。';

export const FAST_EDIT_TARGET_FILES = [
  'src/app/position-list/position-list.controller.js',
  'src/app/position-list/position-list.html',
  'src/backstage/listshow-setting/listshow-setting.controller.js',
  'src/backstage/listshow-setting/listshow-setting.html',
];

export const FAST_EDIT_UNRELATED_FILES = ['package.json', 'verify.cjs', 'README.md'];

export const FAST_EDIT_REAL_PHRASES = [
  '把项目列表页面的显示/隐藏列里面的进行阶段勾选项去掉',
  '项目列表的显示隐藏列里不要再显示进行阶段这个复选框',
  '请移除项目列表页面“显示/隐藏列”中的“进行阶段”选项，别动旁边的项目',
  '把显示/隐藏列菜单里的进行阶段删除掉，表格和业务逻辑保持原样',
  '项目列表列设置中去掉进行阶段勾选项，只改这个控件',
];

export const FAST_EDIT_MINIMUM_SCOPE_PATH = 'src/app/position-list/position-list.html';
export const FAST_EDIT_MINIMUM_SCOPE_UNRELATED = [
  'src/app/position-list/position-list.controller.js',
  'README.md',
  'package.json',
  'verify.cjs',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function fastEditFixtureEntries() {
  return new Map([
    ['src/app/position-list/position-list.controller.js', `function createPositionListController() {\r\n  const showFormData = {\r\n    name: true,\r\n    department: true,\r\n    stage: true,\r\n    status: true,\r\n  };\r\n\r\n  const ctlFormData = {\r\n    name: '名称',\r\n    department: '部门',\r\n    stage: '进行阶段',\r\n    status: '状态',\r\n  };\r\n\r\n  function resetVisibleColumns() {\r\n    return {\r\n      name: showFormData.name,\r\n      stage: showFormData.stage,\r\n      status: showFormData.status,\r\n    };\r\n  }\r\n\r\n  return { showFormData, ctlFormData, resetVisibleColumns };\r\n}\r\n`],
    ['src/app/position-list/position-list.html', `<section class="column-settings">\r\n    <label class="column-setting">\r\n        <input type="checkbox" ng-model="showFormData.name">\r\n        <span>名称</span>\r\n    </label>\r\n\r\n    <label class="column-setting">\r\n        <input type="checkbox" ng-model="showFormData.stage">\r\n        <span>进行阶段</span>\r\n    </label>\r\n\r\n    <label class="column-setting">\r\n        <input type="checkbox" ng-model="showFormData.status">\r\n        <span>状态</span>\r\n    </label>\r\n</section>\r\n`],
    ['src/backstage/listshow-setting/listshow-setting.controller.js', `function createListShowSetting() {\r\n  const showFormData = {\r\n    name: true,\r\n    stage: true,\r\n    status: true,\r\n  };\r\n\r\n  const ctlFormData = {\r\n    name: '名称',\r\n    stage: '进行阶段',\r\n    status: '状态',\r\n  };\r\n\r\n  return { showFormData, ctlFormData };\r\n}\r\n`],
    ['src/backstage/listshow-setting/listshow-setting.html', `<div class="listshow-setting">\r\n    <label><input type="checkbox" ng-model="showFormData.name">名称</label>\r\n    <label><input type="checkbox" ng-model="showFormData.stage">进行阶段</label>\r\n    <label><input type="checkbox" ng-model="showFormData.status">状态</label>\r\n</div>\r\n`],
    ['package.json', `${JSON.stringify({ name: 'fielora-golden-edit', private: true, scripts: { test: 'node verify.cjs' } }, null, 2)}\n`],
    ['verify.cjs', `const fs = require('node:fs');\nconst vm = require('node:vm');\nconst targets = ${JSON.stringify(FAST_EDIT_TARGET_FILES)};\nlet failed = false;\nfor (const file of targets) {\n  const source = fs.readFileSync(file, 'utf8');\n  if (/进行阶段|\\bstage\\b/.test(source)) { console.error('remaining-stage:' + file); failed = true; }\n  if (file.endsWith('.js')) { try { new vm.Script(source, { filename: file }); } catch (error) { console.error('syntax-error:' + file + ':' + error.message); failed = true; } }\n}\nif (failed) process.exit(1);\nconsole.log('stage-column-removal:pass');\n`],
    ['README.md', '# Golden fixture\n\nKeep this unrelated file unchanged.\n'],
  ]);
}

export async function createFastEditFixture(projectRoot) {
  const entries = fastEditFixtureEntries();
  for (const [relative, content] of entries) {
    const target = path.join(projectRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  for (const args of [['init'], ['config', 'user.email', 'golden@fielora.local'], ['config', 'user.name', 'Fielora Golden'], ['add', '.'], ['commit', '-m', 'golden fixture']]) {
    const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`GOLDEN_GIT_FIXTURE_FAILED:${args[0]}`);
  }
  return Object.fromEntries(await Promise.all([...entries.keys()].map(async (relative) => [relative, sha256(await readFile(path.join(projectRoot, relative)))])));
}

export async function inspectFastEditFixture(projectRoot, beforeHashes) {
  const entries = fastEditFixtureEntries();
  const after = Object.fromEntries(await Promise.all([...entries.keys()].map(async (relative) => [relative, await readFile(path.join(projectRoot, relative), 'utf8')])));
  const changedFiles = Object.keys(after).filter((relative) => sha256(after[relative]) !== beforeHashes[relative]);
  const changedTargets = changedFiles.filter((relative) => FAST_EDIT_TARGET_FILES.includes(relative));
  const targetStageRemoved = changedTargets.length === FAST_EDIT_TARGET_FILES.length
    && FAST_EDIT_TARGET_FILES.every((relative) => !/进行阶段|\bstage\b/.test(after[relative]));
  const unrelatedUnchanged = FAST_EDIT_UNRELATED_FILES.every((relative) => sha256(after[relative]) === beforeHashes[relative]);
  const onlyTargetFilesChanged = changedFiles.length === FAST_EDIT_TARGET_FILES.length
    && changedFiles.every((relative) => FAST_EDIT_TARGET_FILES.includes(relative));
  return { after, changedFiles, targetStageRemoved, unrelatedUnchanged, onlyTargetFilesChanged };
}

function minimumScopeHtml(includeStageOption) {
  const prefix = Array.from({ length: 760 }, (_, index) => `<!-- unrelated project template context ${index} -->`).join('\n');
  const stage = includeStageOption ? `
      <label class="stage-option">
        <input type="checkbox" ng-model="showFormData.stage">
        <span>进行阶段</span>
      </label>` : '';
  return `${prefix}
<section class="column-menu" aria-label="显示/隐藏列">
  <ul>
    <li class="shared-column-row">${stage}
      <label class="consultant-option">
        <input type="checkbox" ng-model="showFormData.developerConsultant">
        <span>开发顾问</span>
      </label>
    </li>
    <li><label><input type="checkbox" ng-model="showFormData.status"><span>状态</span></label></li>
  </ul>
</section>
<table class="position-list">
  <thead><tr><th class="stage-column">进行阶段</th><th>状态</th></tr></thead>
  <tbody><tr><td class="stage-cell">进行阶段业务数据</td><td>招聘中</td></tr></tbody>
</table>
`;
}

export async function createMinimumScopeFixture(projectRoot) {
  const entries = new Map([
    [FAST_EDIT_MINIMUM_SCOPE_PATH, minimumScopeHtml(true)],
    ['src/app/position-list/position-list.controller.js', `export const showFormData = { stage: true, developerConsultant: true, status: true };\nexport const businessStage = '进行阶段';\n`],
    ['README.md', '# Minimum necessary change fixture\n\nEverything outside the requested checkbox is protected.\n'],
    ['package.json', `${JSON.stringify({ name: 'fielora-fast-edit-robustness', private: true }, null, 2)}\n`],
    ['verify.cjs', `const fs=require('node:fs');const html=fs.readFileSync(${JSON.stringify(FAST_EDIT_MINIMUM_SCOPE_PATH)},'utf8');if(/class="stage-option"/.test(html))process.exit(1);if(!/class="consultant-option"[\\s\\S]*开发顾问/.test(html))process.exit(2);if(!/class="shared-column-row"/.test(html))process.exit(3);if(!/class="stage-column">进行阶段/.test(html)||!/class="stage-cell">进行阶段业务数据/.test(html))process.exit(4);console.log('minimum-necessary-change:pass');\n`],
  ]);
  for (const [relative, content] of entries) {
    const target = path.join(projectRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  for (const args of [['init'], ['config', 'user.email', 'robustness@fielora.local'], ['config', 'user.name', 'Fielora Robustness'], ['add', '.'], ['commit', '-m', 'minimum scope fixture']]) {
    const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`ROBUSTNESS_GIT_FIXTURE_FAILED:${args[0]}`);
  }
}

export async function resetMinimumScopeFixture(projectRoot, alreadySatisfied = false) {
  const reset = spawnSync('git', ['restore', '--source=HEAD', '--worktree', '--', '.'], { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
  if (reset.status !== 0) throw new Error('ROBUSTNESS_GIT_RESET_FAILED');
  if (alreadySatisfied) await writeFile(path.join(projectRoot, FAST_EDIT_MINIMUM_SCOPE_PATH), minimumScopeHtml(false), 'utf8');
  const tracked = [FAST_EDIT_MINIMUM_SCOPE_PATH, ...FAST_EDIT_MINIMUM_SCOPE_UNRELATED];
  return Object.fromEntries(await Promise.all(tracked.map(async (relative) => [relative, sha256(await readFile(path.join(projectRoot, relative)))])));
}

export async function inspectMinimumScopeFixture(projectRoot, beforeHashes, alreadySatisfied = false) {
  const tracked = Object.keys(beforeHashes);
  const after = Object.fromEntries(await Promise.all(tracked.map(async (relative) => [relative, await readFile(path.join(projectRoot, relative), 'utf8')])));
  const changedFiles = tracked.filter((relative) => sha256(after[relative]) !== beforeHashes[relative]);
  const html = after[FAST_EDIT_MINIMUM_SCOPE_PATH];
  const stageOptionAbsent = !/class="stage-option"/.test(html);
  const adjacentPreserved = /class="shared-column-row"/.test(html) && /class="consultant-option"[\s\S]*开发顾问/.test(html);
  const businessStagePreserved = /class="stage-column">进行阶段/.test(html) && /class="stage-cell">进行阶段业务数据/.test(html);
  const unrelatedUnchanged = FAST_EDIT_MINIMUM_SCOPE_UNRELATED.every((relative) => sha256(after[relative]) === beforeHashes[relative]);
  const changeShapeValid = alreadySatisfied ? changedFiles.length === 0 : changedFiles.length === 1 && changedFiles[0] === FAST_EDIT_MINIMUM_SCOPE_PATH;
  return { changedFiles, stageOptionAbsent, adjacentPreserved, businessStagePreserved, unrelatedUnchanged, changeShapeValid };
}
