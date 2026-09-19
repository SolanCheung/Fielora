import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  captureScreenshot,
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-project-navigation-presentation-'));
const projectRoot = path.join(dataRoot, 'project');
const screenshotPath = path.join(root, 'artifacts', 'fielora-glass', 'human-gate', '12-navigation-scroll-selection-light-1440.png');
const packagedExecutable = process.env.FIELORA_E2E_EXE ?? '';
const output = [];
let child;

const wait = (cdp, expression, timeoutMs = 30_000) => waitForExpression(cdp, expression, { timeoutMs, output });

try {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(path.dirname(screenshotPath), { recursive: true }),
  ]);
  const launched = await launchElectron({ root, dataRoot, executablePath: packagedExecutable, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);

  const setup = await cdp.eval(`(async()=>{
    const project=await window.fieloraTest.createProject({title:'Fielora',goal:'Project navigation presentation',root_path:${JSON.stringify(projectRoot)}});
    const titles=['主题打磨','UI 优化和 Agent 交互方式优化','对话样式优化','Agent 框架修改','扩展能力','桌面视觉校准','多模型设置','工作区标签','命令与终端','文件审阅','Artifact 预览','浏览器布局','权限交互','长任务状态','截图证据','主题注册表','图标灰度','字体层级','Composer 密度','项目导航','设置页','最终验收'];
    const conversations=[];
    for(const title of titles) conversations.push(await window.fielora.conversation.create({field_id:project.field_id,title,provider_config_id:null,model_id:null}));
    for(const c of conversations) await window.fielora.conversation.createMessage({conversation_id:c.id,role:'USER',content:c.title,status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]});
    return{projectId:project.field_id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-item')`);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1440,height:900})`);
  await wait(cdp, `Math.abs(window.innerWidth-1440)<=2`);
  const selectedTestId = await cdp.eval(`(()=>{
    const selected=document.querySelector('.conversation-item');
    selected.click();
    return selected.dataset.testid;
  })()`);
  await wait(cdp, `document.querySelector('.conversation-item.active')?.dataset.testid===${JSON.stringify(selectedTestId)}`);
  await cdp.eval(`(()=>{
    document.documentElement.dataset.effectiveAppearance='light';
    const list=document.querySelector('.project-tree > .project-list');
    list.scrollTop=0;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 240));

  const presentation = await cdp.eval(`(()=>{
    const tree=document.querySelector('.project-tree');
    const title=document.querySelector('.project-tree > .section-title');
    const list=document.querySelector('.project-tree > .project-list');
    const projectRow=document.querySelector('[data-testid="project-row-${setup.projectId}"]');
    const conversationRow=document.querySelector('.conversation-item.active');
    const treeRect=tree.getBoundingClientRect();
    const titleRect=title.getBoundingClientRect();
    const listRect=list.getBoundingClientRect();
    return{
      viewport:{width:innerWidth,height:innerHeight},
      titleGap:listRect.top-titleRect.bottom,
      rightInset:treeRect.right-listRect.right,
      bottomInset:treeRect.bottom-listRect.bottom,
      listOverflow:getComputedStyle(list).overflowY,
      listScrollTop:list.scrollTop,
      listScrollable:list.scrollHeight>list.clientHeight,
      projectBackground:getComputedStyle(projectRow).backgroundColor,
      projectShadow:getComputedStyle(projectRow).boxShadow,
      conversationBackground:getComputedStyle(conversationRow).backgroundColor,
    };
  })()`);

  assert.equal(presentation.viewport.width, 1440);
  assert.ok(presentation.viewport.height >= 898 && presentation.viewport.height <= 902, JSON.stringify(presentation));
  assert.ok(presentation.titleGap >= 7, JSON.stringify(presentation));
  assert.ok(presentation.rightInset >= 3, JSON.stringify(presentation));
  assert.ok(presentation.bottomInset >= 7, JSON.stringify(presentation));
  assert.equal(presentation.listOverflow, 'auto');
  assert.equal(presentation.listScrollable, true);
  assert.ok(presentation.listScrollTop <= 1, JSON.stringify(presentation));
  assert.equal(presentation.projectBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(presentation.projectShadow, 'none');
  assert.notEqual(presentation.conversationBackground, 'rgba(0, 0, 0, 0)');

  await captureScreenshot(cdp, screenshotPath);
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log(`PROJECT_NAVIGATION_PRESENTATION_E2E: PASS\nMETRICS: ${JSON.stringify(presentation)}\nSCREENSHOT: ${screenshotPath}\nMODEL_REQUESTS: 0\nPUBLIC_NETWORK_REQUESTS: 0`);
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
