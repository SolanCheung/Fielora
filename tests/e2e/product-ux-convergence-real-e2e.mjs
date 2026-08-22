import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.FIELORA_REAL_PRODUCT_UX !== '1') throw new Error('Set FIELORA_REAL_PRODUCT_UX=1 for real Production acceptance.');

const root = path.resolve(import.meta.dirname, '..', '..');
const evidence = process.env.FIELORA_PRODUCT_UX_EVIDENCE_DIR ?? path.join(root, 'artifacts', 'product-ux-convergence');
const port = Number(process.env.FIELORA_E2E_DEBUG_PORT ?? 9334);
const answerTask = '请用一句话概括当前 web Project 的用途和主要前端技术栈；只回答，不修改文件。';
const actionTask = '修改当前项目：新增一个 fielora-agent-ux-acceptance.js 文件，内容仅为 export const fieloraAgentUxAcceptance = true;，不要修改其他文件；完成后运行 node --check fielora-agent-ux-acceptance.js 验证。';

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', (event) => { const value=JSON.parse(String(event.data));const pending=this.pending.get(value.id);if(!pending)return;this.pending.delete(value.id);value.error?pending.reject(new Error(value.error.message)):pending.resolve(value.result); });
  }
  send(method, params={}) { const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));}); }
  async eval(expression) { const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value; }
  close() { this.socket.close(); }
}

async function connect() {
  const started=Date.now();
  while(Date.now()-started<60_000){
    try { const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const target=targets.find((item)=>item.type==='page'&&item.url.includes('main_window'));if(target){const cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.open();await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Page.bringToFront');return cdp;} } catch {}
    await new Promise((resolve)=>setTimeout(resolve,100));
  }
  throw new Error('Production Fielora Electron target not found.');
}

async function wait(cdp, expression, timeout=30_000) {
  const started=Date.now();
  while(Date.now()-started<timeout){try{if(await cdp.eval(`(async()=>Boolean(await (${expression})))()`))return;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  throw new Error(`Timed out waiting for ${expression}`);
}

function setValue(selector,value){return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;}

async function capture(cdp,name){const image=await cdp.send('Page.captureScreenshot',{format:'png'});const output=path.join(evidence,name);await writeFile(output,Buffer.from(image.data,'base64'));return output;}

async function nativePaste(cdp){
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17,modifiers:2});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',windowsVirtualKeyCode:86,nativeVirtualKeyCode:86,modifiers:2});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',windowsVirtualKeyCode:86,nativeVirtualKeyCode:86,modifiers:2});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17});
}

function powershell(source, env={}) {
  const encoded=Buffer.from(source,'utf16le').toString('base64');
  const result=spawnSync('powershell.exe',['-NoProfile','-STA','-EncodedCommand',encoded],{encoding:'utf8',windowsHide:true,env:{...process.env,...env}});
  if(result.status!==0)throw new Error(`PowerShell failed: ${result.stderr||result.stdout}`);
  return result.stdout.trim();
}

function setClipboardImage(){powershell(`Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $image=[Drawing.Bitmap]::new(48,48); $graphics=[Drawing.Graphics]::FromImage($image); $graphics.Clear([Drawing.Color]::FromArgb(101,70,199)); [Windows.Forms.Clipboard]::SetImage($image); $graphics.Dispose(); $image.Dispose()`);}

async function captureNative(cdp,name){
  void cdp;
  const output=path.join(evidence,name);
  const state=name.includes('maximized')?'MAXIMIZED':'RESTORED';
  powershell(`Add-Type -AssemblyName System.Drawing; Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\nusing System.Text;\npublic static class FieloraCapture { public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } public delegate bool EnumWindowsProc(IntPtr hWnd,IntPtr lParam); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback,IntPtr lParam); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint pid); [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd,StringBuilder text,int count); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd,int command); [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd,IntPtr after,int x,int y,int width,int height,uint flags); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd,out RECT rect); public static IntPtr Find(uint target){IntPtr found=IntPtr.Zero;EnumWindows((h,l)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==target){var title=new StringBuilder(256);GetWindowText(h,title,256);if(title.ToString()=="Fielora")found=h;}return true;},IntPtr.Zero);return found;} }\n'@; [FieloraCapture]::SetProcessDPIAware() | Out-Null; $main=Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'Fielora' } | Select-Object -First 1; if (-not $main) { throw 'Fielora process not found' }; $handle=[FieloraCapture]::Find([uint32]$main.ProcessId); if ($handle -eq [IntPtr]::Zero) { throw 'Fielora window not found' }; if ($env:SHOT_STATE -eq 'MAXIMIZED') { [FieloraCapture]::ShowWindow($handle,3) | Out-Null } else { [FieloraCapture]::ShowWindow($handle,9) | Out-Null; [FieloraCapture]::SetWindowPos($handle,[IntPtr]::Zero,60,40,1200,760,64) | Out-Null }; Start-Sleep -Milliseconds 350; $rect=New-Object FieloraCapture+RECT; [FieloraCapture]::GetWindowRect($handle,[ref]$rect) | Out-Null; $width=$rect.Right-$rect.Left; $height=$rect.Bottom-$rect.Top; if ($width -lt 400 -or $height -lt 300) { throw 'Fielora window bounds are not visible' }; $bitmap=[Drawing.Bitmap]::new($width,$height); $graphics=[Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size); $bitmap.Save($env:SHOT_PATH,[Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bitmap.Dispose(); if ($env:SHOT_STATE -eq 'MAXIMIZED') { [FieloraCapture]::ShowWindow($handle,9) | Out-Null; [FieloraCapture]::SetWindowPos($handle,[IntPtr]::Zero,60,40,1200,760,64) | Out-Null }`,{SHOT_PATH:output,SHOT_STATE:state});
  return output;
}

async function setTheme(cdp,theme){
  await cdp.eval(`(()=>{const key='fielora.ui.preferences.v2';const value=JSON.parse(localStorage.getItem(key)||'{}');value.version=2;value.startupDestination=value.startupDestination||'PROJECTS';value.appearance={...(value.appearance||{}),themePreference:${JSON.stringify(theme)}};localStorage.setItem(key,JSON.stringify(value));})()`);
  const previousTimeOrigin=await cdp.eval('performance.timeOrigin');
  await cdp.send('Page.reload');
  await wait(cdp,`performance.timeOrigin!==${previousTimeOrigin}&&document.querySelector('[data-testid="desktop-chrome"]')&&document.documentElement.dataset.resolvedTheme===${JSON.stringify(theme.toLowerCase())}`,60_000);
}

async function captureTitlebarStates(cdp,screenshots){
  const originalThemePreference=await cdp.eval(`(()=>{const value=JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')||'{}');return value.appearance?.themePreference||'SYSTEM';})()`);
  await setTheme(cdp,'LIGHT');
  const light=await cdp.eval(`(()=>{const element=document.querySelector('.desktop-chrome');const chrome=getComputedStyle(element);return{theme:document.documentElement.dataset.resolvedTheme,height:element.getBoundingClientRect().height,background:chrome.backgroundColor};})()`);
  assert.deepEqual(light,{theme:'light',height:40,background:'rgb(249, 250, 252)'});
  screenshots.push(await captureNative(cdp,'06-titlebar-light.png'));screenshots.push(await captureNative(cdp,'06-titlebar-light-maximized.png'));

  await setTheme(cdp,'DARK');
  const dark=await cdp.eval(`(()=>{const element=document.querySelector('.desktop-chrome');const chrome=getComputedStyle(element);return{theme:document.documentElement.dataset.resolvedTheme,height:element.getBoundingClientRect().height,background:chrome.backgroundColor};})()`);
  assert.deepEqual(dark,{theme:'dark',height:40,background:'rgb(23, 25, 30)'});
  screenshots.push(await captureNative(cdp,'07-titlebar-dark.png'));screenshots.push(await captureNative(cdp,'07-titlebar-dark-maximized.png'));
  await cdp.eval(`(()=>{const key='fielora.ui.preferences.v2';const value=JSON.parse(localStorage.getItem(key)||'{}');value.appearance={...(value.appearance||{}),themePreference:${JSON.stringify(originalThemePreference)}};localStorage.setItem(key,JSON.stringify(value));})()`);
  const previousTimeOrigin=await cdp.eval('performance.timeOrigin');await cdp.send('Page.reload');await wait(cdp,`performance.timeOrigin!==${previousTimeOrigin}&&document.querySelector('[data-testid="desktop-chrome"]')`,60_000);
}

await mkdir(evidence,{recursive:true});
const cdp=await connect();
const screenshots=[];

if(process.env.FIELORA_PRODUCT_UX_TITLEBAR_ONLY==='1'){
  try{
    await wait(cdp,`document.querySelector('[data-testid="desktop-chrome"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`,60_000);
    await captureTitlebarStates(cdp,screenshots);
    process.stdout.write(`${JSON.stringify({screenshots},null,2)}\n`);
  }finally{cdp.close();}
  process.exit(0);
}

if(process.env.FIELORA_PRODUCT_UX_RESULT_ONLY==='1'){
  const conversationId=process.env.FIELORA_PRODUCT_UX_ACTION_CONVERSATION;
  if(!conversationId)throw new Error('Set FIELORA_PRODUCT_UX_ACTION_CONVERSATION for result-only capture.');
  try{
    await wait(cdp,`document.querySelector('[data-testid="project-workspace"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`,60_000);
    const project=await cdp.eval(`window.fielora.project.list().then((projects)=>projects.find((item)=>item.title==='web'))`);assert.equal(project?.title,'web');
    await cdp.eval(`document.querySelector('[data-testid="project-${project.field_id}"]')?.click()`);await wait(cdp,`document.querySelector('[data-testid="conversation-${conversationId}"]')`,30_000);await cdp.eval(`document.querySelector('[data-testid="conversation-${conversationId}"]')?.click()`);
    const runId=await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs.find((run)=>run.status==='COMPLETED'&&run.task.includes('fielora-agent-ux-acceptance.js'))?.id)`);assert.ok(runId);
    await wait(cdp,`document.querySelector('[data-agent-run-id="${runId}"] [data-testid="agent-terminal-result"]')`,30_000);
    const result=await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id="${runId}"]');turn.scrollIntoView({block:'center'});return{body:turn.querySelector('.agent-terminal-body')?.innerText??'',review:Boolean(turn.querySelector('[data-testid="agent-change-review"]'))};})()`);assert.equal(result.review,true);assert.doesNotMatch(result.body,/变更：|验证：|✅/);
    screenshots.push(await capture(cdp,'03-action-result.png'));await cdp.eval(`document.querySelector('[data-agent-run-id="${runId}"] [data-testid="agent-change-review"]')?.click()`);await wait(cdp,`document.querySelector('[data-testid="agent-review"]')`);screenshots.push(await capture(cdp,'04-human-review.png'));screenshots.push(await capture(cdp,'05-sidebar.png'));
    process.stdout.write(`${JSON.stringify({result,screenshots},null,2)}\n`);
  }finally{cdp.close();}
  process.exit(0);
}

try {
  await wait(cdp,`document.querySelector('[data-testid="project-workspace"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`,60_000);
  const acceptance=await cdp.eval(`(async()=>{const projects=await window.fielora.project.list();const project=projects.find((item)=>item.title==='web');const providers=await window.fielora.provider.list();const provider=providers.find((item)=>item.default_model==='qwen3.7-plus'&&item.lifecycle_status==='ACTIVE'&&item.credential_present);if(!project||!provider)return{project,provider};const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'Product UX 真实验收 '+new Date().toLocaleTimeString('zh-CN'),provider_config_id:provider.id,model_id:provider.default_model});return{project,provider,conversation};})()`);
  assert.equal(acceptance.project?.title,'web');assert.equal(acceptance.provider?.default_model,'qwen3.7-plus');assert.equal(acceptance.provider?.credential_present,true);
  await cdp.send('Page.reload');
  await wait(cdp,`document.querySelector('[data-testid="project-${acceptance.project.field_id}"]')`,60_000);
  await cdp.eval(`document.querySelector('[data-testid="project-${acceptance.project.field_id}"]')?.click()`);
  await wait(cdp,`document.querySelector('[data-testid="conversation-${acceptance.conversation.id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${acceptance.conversation.id}"]')?.click()`);
  await wait(cdp,`document.querySelector('[data-testid="conversation-composer"]')`);
  await cdp.eval(`(()=>{const control=document.querySelector('[data-testid="composer-permission"]');if(control)control.click();})()`);
  await wait(cdp,`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]').click()`);

  const runsBeforePaste=await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(acceptance.conversation.id)}}).then((runs)=>runs.length)`);
  await cdp.eval(setValue('.conversation-composer textarea','开头\n结尾'));
  await cdp.eval(`(()=>{const input=document.querySelector('.conversation-composer textarea');input.focus();input.setSelectionRange(3,3);return window.fielora.clipboard.writeText(${JSON.stringify('第一行\nconst value = 1;')});})()`);
  await nativePaste(cdp);
  await wait(cdp,`document.querySelector('.conversation-composer textarea')?.value.includes('const value = 1;')`);
  const pasted=await cdp.eval(`document.querySelector('.conversation-composer textarea').value`);
  assert.equal(pasted,'开头\n第一行\nconst value = 1;结尾');
  assert.equal(await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(acceptance.conversation.id)}}).then((runs)=>runs.length)`),runsBeforePaste);

  await cdp.eval(setValue('.conversation-composer textarea',answerTask));await cdp.eval(`document.querySelector('[data-testid="send-message"]').click()`);
  await wait(cdp,`window.fielora.agent.list({conversation_id:${JSON.stringify(acceptance.conversation.id)}}).then((runs)=>runs[0]&&['COMPLETED','FAILED'].includes(runs[0].status))`,180_000);
  const answer=await cdp.eval(`(async()=>{const run=(await window.fielora.agent.list({conversation_id:${JSON.stringify(acceptance.conversation.id)}}))[0];const turn=document.querySelector('[data-agent-run-id="'+run.id+'"]');turn?.scrollIntoView({block:'center'});return{runId:run.id,status:run.status,kind:turn?.dataset.agentKind,text:turn?.innerText??'',answer:Boolean(turn?.querySelector('[data-testid="agent-answer"]')),activity:turn?.querySelectorAll('[data-testid="agent-live-activity"]').length,terminal:turn?.querySelectorAll('[data-testid="agent-terminal-result"]').length,steps:turn?.querySelectorAll('[data-testid="agent-steps-toggle"]').length};})()`);
  assert.equal(answer.status,'COMPLETED');assert.equal(answer.kind,'ANSWER');assert.equal(answer.answer,true);assert.equal(answer.activity+answer.terminal+answer.steps,0);assert.doesNotMatch(answer.text,/正在理解任务|已经完成|查看步骤|正在验证/);
  screenshots.push(await capture(cdp,'01-answer-turn.png'));

  await cdp.eval(setValue('.conversation-composer textarea',''));setClipboardImage();await cdp.eval(`document.querySelector('.conversation-composer textarea').focus()`);await nativePaste(cdp);
  await wait(cdp,`document.querySelector('.attachment-chip.image.unsupported')`);
  const imagePaste=await cdp.eval(`(()=>{const chip=document.querySelector('.attachment-chip.image');return{preview:Boolean(chip?.querySelector('img')),text:chip?.innerText??'',toast:document.querySelector('.project-toast')?.innerText??''};})()`);
  assert.equal(imagePaste.preview,true);assert.match(`${imagePaste.text} ${imagePaste.toast}`,/不支持图片输入/);
  screenshots.push(await capture(cdp,'08-image-paste-unsupported-model.png'));
  await cdp.eval(`document.querySelector('.attachment-chip.image button')?.click()`);

  // Keep the real Action acceptance independent from the preceding answer-only
  // turn. The configured Coding Plan endpoint currently rejects some mixed
  // answer/action histories before producing a tool call; Case B validates the
  // Production Action path itself with the same real Project/provider/model.
  const actionConversation=await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(acceptance.project.field_id)},title:'Product UX Action 真实验收 '+new Date().toLocaleTimeString('zh-CN'),provider_config_id:${JSON.stringify(acceptance.provider.id)},model_id:${JSON.stringify(acceptance.provider.default_model)}})`);
  await cdp.send('Page.reload');
  await wait(cdp,`document.querySelector('[data-testid="project-${acceptance.project.field_id}"]')`,60_000);
  await cdp.eval(`document.querySelector('[data-testid="project-${acceptance.project.field_id}"]')?.click()`);
  await wait(cdp,`document.querySelector('[data-testid="conversation-${actionConversation.id}"]')`,30_000);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${actionConversation.id}"]')?.click()`);
  await wait(cdp,`document.querySelector('[data-testid="conversation-composer"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]')?.click()`);
  await wait(cdp,`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')?.click()`);

  await cdp.eval(setValue('.conversation-composer textarea',actionTask));await cdp.eval(`document.querySelector('[data-testid="send-message"]').click()`);
  await wait(cdp,`window.fielora.agent.list({conversation_id:${JSON.stringify(actionConversation.id)}}).then((runs)=>runs[0]?.task.includes('fielora-agent-ux-acceptance.js')&&['QUEUED','RUNNING','WAITING_APPROVAL'].includes(runs[0].status))`,30_000);
  const actionRunId=await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(actionConversation.id)}}).then((runs)=>runs[0].id)`);
  const running=await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(actionRunId)}]');turn?.scrollIntoView({block:'center'});return{kind:turn?.dataset.agentKind,narrative:Boolean(turn?.querySelector('[data-testid="agent-narrative"]')),activity:Boolean(turn?.querySelector('[data-testid="agent-live-activity"]')),terminal:Boolean(turn?.querySelector('[data-testid="agent-terminal-result"]'))};})()`);
  assert.deepEqual(running,{kind:'ACTION',narrative:true,activity:true,terminal:false});
  screenshots.push(await capture(cdp,'02-action-running.png'));

  await wait(cdp,`window.fielora.agent.get({run_id:${JSON.stringify(actionRunId)}}).then((run)=>['COMPLETED','FAILED','CANCELLED'].includes(run.status))`,240_000);
  const result=await cdp.eval(`(async()=>{const run=await window.fielora.agent.get({run_id:${JSON.stringify(actionRunId)}});const events=await window.fielora.agent.events({run_id:run.id,after_sequence:null,limit:500});const tools=await window.fielora.agent.toolCalls({run_id:run.id});const turn=document.querySelector('[data-agent-run-id="'+run.id+'"]');turn?.scrollIntoView({block:'center'});return{status:run.status,error:run.error_code,outcome:events.findLast((event)=>event.kind==='RUN_COMPLETED')?.payload?.outcome??null,turnOutcome:turn?.querySelector('[data-testid="agent-terminal-result"]')?.dataset.resultOutcome??null,live:Boolean(turn?.querySelector('[data-testid="agent-live-activity"]')),review:Boolean(turn?.querySelector('[data-testid="agent-change-review"]')),writes:tools.filter((tool)=>tool.status==='COMPLETED'&&tool.effect==='WORKSPACE_WRITE').length,verified:tools.some((tool)=>tool.status==='COMPLETED'&&tool.effect==='PROCESS'&&tool.receipt?.success===true)};})()`);
  assert.equal(result.status,'COMPLETED',JSON.stringify(result));assert.equal(result.live,false);assert.equal(result.review,true);assert.equal(result.writes>0,true);assert.equal(result.verified,true);
  screenshots.push(await capture(cdp,'03-action-result.png'));

  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(actionRunId)}] [data-testid="agent-change-review"]').click()`);
  await wait(cdp,`document.querySelector('[data-testid="agent-review"]')`);
  const review=await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-review"]');return{mode:root?.dataset.reviewMode,visualKind:root?.querySelector('[data-human-diff-kind]')?.dataset.humanDiffKind??null,raw:Boolean(root?.querySelector('[data-testid="agent-review-diff"]')),unsafe:(root?.innerText??'').includes('修改前内容请查看原始 Diff'),text:root?.innerText??''};})()`);
  assert.equal(review.unsafe,false);assert.equal(review.visualKind!==null||review.raw,true);assert.match(review.text,/变更|原始 Diff/);
  screenshots.push(await capture(cdp,'04-human-review.png'));

  const sidebar=await cdp.eval(`(()=>{const project=document.querySelector('.project-item strong');const conversation=document.querySelector('.conversation-item.active');const projectPath=document.querySelector('.project-item small');const section=document.querySelector('.section-title');const style=(element)=>{const value=getComputedStyle(element);return{size:value.fontSize,weight:value.fontWeight};};return{project:style(project),conversation:style(conversation),path:style(projectPath),section:style(section)};})()`);
  assert.deepEqual(sidebar.project,{size:'14px',weight:'500'});assert.deepEqual(sidebar.conversation,{size:'13.5px',weight:'400'});assert.deepEqual(sidebar.path,{size:'12px',weight:'400'});assert.deepEqual(sidebar.section,{size:'12.5px',weight:'500'});
  screenshots.push(await capture(cdp,'05-sidebar.png'));

  await captureTitlebarStates(cdp,screenshots);

  process.stdout.write(`${JSON.stringify({project:'web',model:'qwen3.7-plus',answer,action:{run_id:actionRunId,...result},sidebar,imagePaste,screenshots},null,2)}\n`);
} finally { cdp.close(); }
