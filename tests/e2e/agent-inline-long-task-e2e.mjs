import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  captureScreenshot,
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktopRoot = path.join(root, 'apps', 'desktop');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-inline-long-task-'));
const projectRoot = path.join(dataRoot, 'project');
const screenshotDir = path.join(desktopRoot, 'out', 'agent-inline-long-task-review');
const screenshotPath = path.join(screenshotDir, 'long-task-activity-stream-visual-closeout.png');
const forgeEntry = path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const runtimePath = [path.dirname(process.execPath), process.env.Path ?? process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
const output = [];
let child;
let cdp;

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
}

try {
  await mkdir(projectRoot, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), '# Long task fixture\n');
  const initialized = spawnSync('git.exe', ['init'], { cwd: projectRoot, windowsHide: true, encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

  const launched = await launchElectron({
    root: desktopRoot,
    dataRoot,
    executablePath: process.execPath,
    args: [forgeEntry, 'start'],
    extraEnv: { Path: runtimePath, PATH: runtimePath },
    output,
  });
  child = launched.child;
  cdp = await connectToFieloraApp({ port: launched.port, output, timeoutMs: 120_000, enablePage: true });
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 760, deviceScaleFactor: 1, mobile: false });
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, { timeoutMs: 120_000, output });

  const setup = await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Long Task Fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_slow__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'fixture-secret'});
    const project=await window.fieloraTest.createProject({title:'Long Task UI',goal:'Verify continuous task presentation',root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'连续任务流与完成时间',provider_config_id:provider.id,model_id:provider.default_model});
    return {project,conversation};
  })()`);

  await cdp.send('Page.reload');
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-${setup.project.field_id}"]')`, { timeoutMs: 60_000, output });
  await cdp.eval(`(()=>{const project=document.querySelector('[data-testid="project-${setup.project.field_id}"]');if(project?.getAttribute('aria-expanded')!=='true')project?.click();})()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="conversation-${setup.conversation.id}"]')`, { output });
  await cdp.eval(`document.querySelector('[data-testid="conversation-${setup.conversation.id}"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="conversation-composer"]')`, { output });
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`, { output });
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')?.click()`);

  await cdp.eval(setValue('.conversation-composer textarea', 'FIELORA_AGENT_FIXTURE_DELEGATE FIELORA_AGENT_FIXTURE_CREATE 先检查项目，再创建验证文件并运行 targeted verification。'));
  await cdp.eval(`document.querySelector('[data-testid="send-message"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="conversation-activity-stream"] [data-activity-entry]')`, { timeoutMs: 30_000, output });
  const firstActivityCount = await cdp.eval(`document.querySelectorAll('[data-testid="conversation-activity-stream"] [data-activity-entry]').length`);
  assert.equal(firstActivityCount, 1);
  await waitForExpression(cdp, `document.querySelectorAll('[data-testid="conversation-activity-stream"] [data-activity-entry]').length>${firstActivityCount}`, { timeoutMs: 45_000, output });
  const secondActivityCount = await cdp.eval(`document.querySelectorAll('[data-testid="conversation-activity-stream"] [data-activity-entry]').length`);
  assert.ok(secondActivityCount > firstActivityCount);
  await waitForExpression(cdp, `document.querySelectorAll('[data-testid="conversation-activity-stream"] [data-activity-entry]').length>=3`, { timeoutMs: 45_000, output });

  const view = await cdp.eval(`(()=>{
    const stream=document.querySelector('[data-testid="conversation-activity-stream"]');
    const turn=stream?.closest('[data-agent-turn="true"]');
    const summary=turn?.querySelector('[data-testid="agent-progress-summary"]');
    const composer=document.querySelector('[data-testid="conversation-composer"]');
    const messageList=document.querySelector('.message-list');
    const entries=[...stream.querySelectorAll('[data-activity-entry]')];
    const groups=[...stream.querySelectorAll('[data-testid="conversation-activity-group"]')];
    const completed=entries.filter((entry)=>entry.hasAttribute('data-completed-at'));
    const hoverTarget=completed.at(-1);
    hoverTarget.scrollIntoView({block:'center'});
    const rect=hoverTarget.getBoundingClientRect();
    const internalScroll=[...turn.querySelectorAll('.conversation-activity-stream,.conversation-activity-group,.conversation-activity-entries,.agent-progress-summary')].filter((element)=>['auto','scroll'].includes(getComputedStyle(element).overflowY));
    const sequences=entries.map((entry)=>Number(entry.dataset.activitySequence));
    const completionLabels=[...stream.querySelectorAll('.agent-completion-time')];
    return {
      summary:summary?.innerText??'',
      streamText:stream?.innerText??'',
      summaryBeforeComposer:Boolean(summary&&(summary.compareDocumentPosition(composer)&Node.DOCUMENT_POSITION_FOLLOWING)),
      sameTurn:Boolean(turn&&turn.contains(stream)&&turn.contains(summary)),
      detailsVisible:Boolean(turn.querySelector('[data-testid="agent-run-details"]')),
      legacyHeadings:['操作记录','步骤','技术信息','本轮已更改文件'].filter((heading)=>turn.innerText.includes(heading)),
      inventedProgress:turn.querySelectorAll('[data-testid="agent-narrative"],.conversation-activity-progress').length,
      groupCount:groups.length,
      groupIconCount:groups.filter((group)=>group.querySelector('.conversation-activity-group-summary > .shell-icon')).length,
      entryCount:entries.length,
      chronological:sequences.every((sequence,index)=>index===0||sequence>=sequences[index-1]),
      mainOverflow:getComputedStyle(messageList).overflowY,
      mainScrollable:messageList.scrollHeight>messageList.clientHeight,
      internalScrollCount:internalScroll.length,
      normalStatusDots:turn.querySelectorAll('.conversation-activity-entries > li > i,.conversation-activity-phase > span,.agent-progress-orbit').length,
      itemCountLabels:stream.querySelectorAll('.conversation-activity-group-summary small').length,
      visibleCompletionLabels:completionLabels.filter((label)=>getComputedStyle(label).visibility==='visible').length,
      streamBackground:getComputedStyle(stream).backgroundColor,
      summaryBackground:getComputedStyle(summary).backgroundColor,
      warningBackground:(()=>{const probe=document.createElement('i');probe.style.background='var(--fl-color-surface-warning)';document.body.append(probe);const value=getComputedStyle(probe).backgroundColor;probe.remove();return value;})(),
      streamWidth:stream.getBoundingClientRect().width,
      turnWidth:turn.getBoundingClientRect().width,
      completedCount:completed.length,
      allCompletedHaveLabels:completed.every((segment)=>/^\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(segment.title)),
      completionTitle:hoverTarget.title,
      x:rect.left+Math.max(12,Math.min(rect.width-12,rect.width/2)),
      y:rect.top+rect.height/2,
    };
  })()`);

  assert.equal(view.sameTurn, true);
  assert.equal(view.summaryBeforeComposer, true);
  assert.equal(view.detailsVisible, false);
  assert.deepEqual(view.legacyHeadings, []);
  assert.equal(view.inventedProgress, 0);
  assert.ok(view.groupCount >= 3, JSON.stringify(view));
  assert.equal(view.groupIconCount, view.groupCount);
  assert.ok(view.entryCount >= 3, JSON.stringify(view));
  assert.equal(view.chronological, true);
  assert.equal(view.mainOverflow, 'auto');
  assert.equal(view.mainScrollable, true);
  assert.equal(view.internalScrollCount, 0);
  assert.equal(view.normalStatusDots, 0);
  assert.equal(view.itemCountLabels, 0);
  assert.equal(view.visibleCompletionLabels, 0);
  assert.equal(view.streamBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(view.summaryBackground, 'rgba(0, 0, 0, 0)');
  assert.notEqual(view.summaryBackground, view.warningBackground);
  assert.ok(view.streamWidth > 650 && view.streamWidth <= view.turnWidth, JSON.stringify(view));
  assert.doesNotMatch(view.streamText, /\bdelegate readonly\b|Summarize the project tree with evidence\.|\d+\s*项|已完成/u);
  assert.match(view.summary, /正在执行/);
  assert.match(view.summary, /第 \d+ \/ \d+ 步/);
  assert.ok(view.completedCount >= 2, JSON.stringify(view));
  assert.equal(view.allCompletedHaveLabels, true);
  assert.match(view.completionTitle, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);

  const running = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(setup.conversation.id)}}).then((runs)=>runs[0])`);
  assert.equal(running.status, 'RUNNING');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: view.x, y: view.y });
  const completionTarget = `[...document.querySelectorAll('[data-activity-entry][data-completed-at]')].find((entry)=>entry.title===${JSON.stringify(view.completionTitle)})`;
  await waitForExpression(cdp, `(()=>{const target=${completionTarget};return target&&getComputedStyle(target.querySelector('.agent-completion-time')).visibility==='visible';})()`, { output });
  assert.equal(await cdp.eval(`${completionTarget}.querySelector('.agent-completion-time').innerText`), view.completionTitle);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await waitForExpression(cdp, `(()=>{const target=${completionTarget};return target&&getComputedStyle(target.querySelector('.agent-completion-time')).visibility==='hidden';})()`, { output });
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await captureScreenshot(cdp, screenshotPath);

  await waitForExpression(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(running.id)}}).then((run)=>run.status==='COMPLETED')`, { timeoutMs: 30_000, output });
  await waitForExpression(cdp, `document.querySelector('[data-agent-run-id="${running.id}"] [data-testid="agent-terminal-result"]')`, { timeoutMs: 30_000, output });
  const completed = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id="${running.id}"]');const toggle=turn.querySelector('[data-testid="agent-execution-detail-toggle"]');return{activity:Boolean(turn.querySelector('[data-testid="conversation-activity-stream"]')),final:Boolean(turn.querySelector('[data-testid="agent-terminal-result"]')),details:Boolean(turn.querySelector('[data-testid="agent-execution-detail"]')),expanded:toggle?.getAttribute('aria-expanded')};})()`);
  assert.deepEqual(completed, { activity: false, final: true, details: false, expanded: 'false' });
  await cdp.eval(`document.querySelector('[data-agent-run-id="${running.id}"] [data-testid="agent-execution-detail-toggle"]')?.click()`);
  await waitForExpression(cdp, `document.querySelector('[data-agent-run-id="${running.id}"] [data-testid="agent-execution-detail"]')`, { output });
  const history = await cdp.eval(`(()=>{const detail=document.querySelector('[data-agent-run-id="${running.id}"] [data-testid="agent-execution-detail"]');return{text:detail.innerText,activity:Boolean(detail.querySelector('[data-testid="conversation-activity-stream"]')),legacy:['操作记录','步骤','技术信息'].filter((heading)=>detail.innerText.includes(heading))};})()`);
  assert.equal(history.activity, true);
  assert.deepEqual(history.legacy, []);
  assert.doesNotMatch(history.text, /\bdelegate readonly\b|Summarize the project tree with evidence\.|\d+\s*项|已完成/u);
  console.log(`AGENT_CONVERSATION_ACTIVITY_STREAM_E2E: PASS\nSCREENSHOT: ${screenshotPath}`);
} finally {
  if (cdp) {
    try { await cdp.eval('void window.fielora.core.quit()'); } catch {}
    cdp.close();
  }
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
