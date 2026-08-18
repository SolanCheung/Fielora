import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..', '..');
const core = path.join(root, 'target', 'debug', 'fielora-core.exe');

function request(child, id, method, params = {}, protocol = '1.0') {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params, _meta: { protocol, trace_id: randomUUID(), deadline_ms: 10000 } })}\n`);
}

function harness(dataDir) {
  const child = spawn(core, ['--development'], { env: { ...process.env, FIELORA_DATA_DIR: dataDir, FIELORA_E2E: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = readline.createInterface({ input: child.stdout });
  const queue = [];
  const waiters = [];
  lines.on('line', (line) => {
    const value = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(value); else queue.push(value);
  });
  return {
    child,
    send(id, method, params = {}, protocol) { request(child, id, method, params, protocol); },
    next() { if (queue.length) return Promise.resolve(queue.shift()); return new Promise((resolve) => waiters.push(resolve)); },
    async exit(timeout = 2000) {
      if (child.exitCode !== null) return child.exitCode;
      return Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Core did not exit')), timeout)),
      ]);
    },
  };
}

async function hello(h) { h.send('hello', 'system.hello'); return h.next(); }
async function mutation(h, id, method, params) {
  h.send(id, method, params);
  const response = await h.next();
  assert.ok(response.result, JSON.stringify(response));
  const event = await h.next();
  assert.equal(event.method, 'event.field.changed');
  const revision = response.result.field_revision ?? response.result.revision;
  assert.equal(event.params.revision, revision);
  return response.result;
}

test('real Core persists create/focus/snapshot through close and restart', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-integration-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const first = harness(dataDir);
  assert.equal((await hello(first)).result.schema_version, 6);
  first.send('create', 'command.field.create', { title: 'Phase 01 Test', goal: 'Persistence' });
  const created = await first.next();
  const event = await first.next();
  assert.equal(event.method, 'event.field.changed');
  first.send('focus', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'Persistence' });
  const updated = await first.next();
  await first.next();
  assert.equal(updated.result.revision, 2);
  first.send('snapshot', 'command.surface.save_snapshot', { field_id: created.result.id, layout: { primary: 'FIELD' }, open_objects: [] });
  assert.equal((await first.next()).result.observed_field_revision, 2);
  first.send('shutdown', 'system.shutdown');
  await first.next();
  assert.equal(await first.exit(), 0);

  const second = harness(dataDir);
  await hello(second);
  second.send('list', 'query.field.list');
  assert.equal((await second.next()).result[0].current_focus, 'Persistence');
  second.send('resume', 'query.surface.latest_snapshot', { field_id: created.result.id });
  const resume = await second.next();
  assert.equal(resume.result.field.current_focus, 'Persistence');
  assert.equal(resume.result.snapshot.observed_field_revision, 2);
  second.send('shutdown', 'system.shutdown');
  await second.next();
  await second.exit();
});

test('parent-pipe EOF exits within two seconds without explicit shutdown', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-eof-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const h = harness(dataDir);
  await hello(h);
  const started = performance.now();
  h.child.stdin.end();
  assert.equal(await h.exit(2000), 0);
  assert.ok(performance.now() - started < 2000);
});

test('Desktop Foundation persists Project, Conversation, provider selection, and messages', async (t) => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'fielora-desktop-foundation-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const projectRoot=path.join(dataDir,'local-project');
  const first=harness(dataDir);const greeting=await hello(first);assert.equal(greeting.result.schema_version,6);
  for(const capability of ['project.create','conversation.create','conversation.message.create'])assert.ok(greeting.result.capabilities.includes(capability));
  first.send('provider','command.provider.create_config',{provider_kind:'OPENAI_COMPATIBLE',display_name:'Desktop fixture',base_url:'https://example.com/v1',default_model:'__fielora_fixture__',custom_endpoint_acknowledged:true});const provider=(await first.next()).result;
  first.send('project','command.project.create',{title:'Local Project',goal:'Persist the coding loop',root_path:projectRoot});const project=(await first.next()).result;assert.equal(project.root_path,projectRoot);
  first.send('conversation','command.conversation.create',{field_id:project.field_id,title:'Build the feature',provider_config_id:provider.id,model_id:'__fielora_fixture__'});let conversation=(await first.next()).result;
  first.send('user-message','command.conversation.message.create',{conversation_id:conversation.id,role:'USER',content:'Inspect the project',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});assert.equal((await first.next()).result.role,'USER');
  first.send('assistant-message','command.conversation.message.create',{conversation_id:conversation.id,role:'ASSISTANT',content:'Ready to review a bounded change.',status:'COMPLETED',provider_config_id:provider.id,model_id:'__fielora_fixture__',invocation_id:null});assert.equal((await first.next()).result.role,'ASSISTANT');
  first.send('get-conversation','query.conversation.get',{conversation_id:conversation.id});conversation=(await first.next()).result;assert.equal(conversation.revision,3);
  first.send('rename','command.conversation.update',{conversation_id:conversation.id,expected_revision:conversation.revision,title:'Review and test',provider_config_id:provider.id,model_id:'__fielora_fixture__'});conversation=(await first.next()).result;assert.equal(conversation.title,'Review and test');
  first.send('shutdown','system.shutdown');await first.next();await first.exit();

  const second=harness(dataDir);await hello(second);
  second.send('projects','query.project.list');assert.equal((await second.next()).result[0].field_id,project.field_id);
  second.send('conversations','query.conversation.list',{field_id:project.field_id});const resumed=(await second.next()).result;assert.equal(resumed[0].title,'Review and test');assert.equal(resumed[0].provider_config_id,provider.id);
  second.send('messages','query.conversation.message.list',{conversation_id:conversation.id});assert.deepEqual((await second.next()).result.map((message)=>message.content),['Inspect the project','Ready to review a bounded change.']);
  second.send('archive','command.conversation.archive',{conversation_id:conversation.id,expected_revision:conversation.revision});assert.equal((await second.next()).result.lifecycle_status,'ARCHIVED');
  second.send('active-after-archive','query.conversation.list',{field_id:project.field_id});assert.deepEqual((await second.next()).result,[]);
  second.send('shutdown','system.shutdown');await second.next();await second.exit();
});

test('Phase 02 FIPC reality workflow persists, resumes, and preserves atomic revisions', async (t) => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'fielora-phase02-integration-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const h=harness(dataDir);const helloResponse=await hello(h);
  assert.equal(helloResponse.result.schema_version,6);
  for(const capability of ['state.supersede','reference.archive','relation.attach_reference_source','surface.save_snapshot_v1','field.resume_v1'])assert.ok(helloResponse.result.capabilities.includes(capability));
  const field=await mutation(h,'p2-field','command.field.create',{title:'Phase 02 Reality',goal:'Prove durable truth'});
  const task=await mutation(h,'p2-task','command.state.create',{field_id:field.id,kind:'TASK',content:'Ship Phase 02',confidence:0.8});
  const question=await mutation(h,'p2-question','command.state.create',{field_id:field.id,kind:'QUESTION',content:'Is resume current?',confidence:null});
  const blocker=await mutation(h,'p2-blocker','command.state.create',{field_id:field.id,kind:'BLOCKER',content:'Need evidence',confidence:1});
  assert.deepEqual([task.field_revision,question.field_revision,blocker.field_revision],[2,3,4]);
  let changed=await mutation(h,'p2-resolve','command.state.transition',{field_id:field.id,state_id:blocker.resource.id,expected_state_revision:1,target:'RESOLVED'});assert.equal(changed.field_revision,5);
  changed=await mutation(h,'p2-reopen','command.state.transition',{field_id:field.id,state_id:blocker.resource.id,expected_state_revision:2,target:'ACTIVE'});assert.equal(changed.field_revision,6);
  changed=await mutation(h,'p2-revise','command.state.revise',{field_id:field.id,state_id:blocker.resource.id,expected_state_revision:3,content:'Need packaged evidence',confidence:1});assert.equal(changed.field_revision,7);
  const superseded=await mutation(h,'p2-supersede','command.state.supersede',{field_id:field.id,state_id:blocker.resource.id,expected_state_revision:4,replacement_content:'Evidence captured',replacement_confidence:1});assert.equal(superseded.field_revision,8);
  const reference=await mutation(h,'p2-reference','command.reference.create',{field_id:field.id,title:'Evidence source',url:'HTTPS://Example.COM:443/evidence?q=token'});assert.equal(reference.resource.canonical_url,'https://example.com/evidence?q=token');
  const relation=await mutation(h,'p2-attach','command.relation.attach_reference_source',{field_id:field.id,state_id:superseded.replacement.id,reference_id:reference.resource.id});assert.equal(relation.field_revision,10);
  const mode=await mutation(h,'p2-mode','command.field.update_mode',{field_id:field.id,expected_field_revision:10,mode:'VERIFY'});assert.equal(mode.field_revision,11);
  const focused=await mutation(h,'p2-focus','command.field.set_focus_v1',{field_id:field.id,expected_field_revision:11,focus:{kind:'REFERENCE',object_id:reference.resource.id}});assert.equal(focused.field_revision,12);
  h.send('p2-snapshot','command.surface.save_snapshot_v1',{field_id:field.id,layout:{version:1,template:'PRIMARY_SUPPORT_RIGHT',primary:{pane_id:'primary_task',primitive:'TASK_PANE',binding:{kind:'FIELD_TASKS'},collapsed:false},supporting:[{pane_id:`pane_${reference.resource.id}`,primitive:'REFERENCE_PANE',binding:{kind:'REFERENCE',object_id:reference.resource.id},collapsed:false}],focused_pane_id:'primary_task'}});
  assert.equal((await h.next()).result.observed_field_revision,12);
  h.send('p2-resume-current','query.field.resume_v1',{field_id:field.id});let resume=(await h.next()).result;
  assert.equal(resume.snapshot_freshness,'CURRENT');assert.equal(resume.continuation.reason,'TYPED_FOCUS');assert.deepEqual(resume.open_reference_ids,[reference.resource.id]);
  changed=await mutation(h,'p2-stale','command.state.revise',{field_id:field.id,state_id:task.resource.id,expected_state_revision:1,content:'Ship and verify Phase 02',confidence:1});assert.equal(changed.field_revision,13);
  const archived=await mutation(h,'p2-archive','command.reference.archive',{field_id:field.id,object_id:reference.resource.id,expected_object_revision:1});assert.equal(archived.field_revision,14);
  h.send('p2-resume-stale','query.field.resume_v1',{field_id:field.id});resume=(await h.next()).result;
  assert.equal(resume.snapshot_freshness,'STALE');assert.deepEqual(resume.unavailable_reference_ids,[reference.resource.id]);assert.equal(resume.typed_focus,null);
  const restored=await mutation(h,'p2-restore','command.reference.restore',{field_id:field.id,object_id:reference.resource.id,expected_object_revision:2});assert.equal(restored.field_revision,15);
  h.send('p2-relations','query.relation.list',{field_id:field.id,relation_type:null,lifecycle:'RETRACTED',endpoint:null,cursor:null,limit:100});
  assert.equal((await h.next()).result.items.find((item)=>item.id===relation.resource.id).lifecycle,'RETRACTED');
  h.send('p2-activities','query.activity.list',{field_id:field.id,cursor:null,limit:100});const activities=(await h.next()).result.items;
  assert.equal(activities.length,15);assert.ok(!JSON.stringify(activities).includes('token'));
  const empty=await mutation(h,'empty-field','command.field.create',{title:'Empty task surface',goal:null});
  h.send('empty-resume','query.field.resume_v1',{field_id:empty.id});const emptyResume=(await h.next()).result;
  assert.equal(emptyResume.field_revision,1);assert.equal(emptyResume.layout.template,'PRIMARY_ONLY');assert.deepEqual(emptyResume.active_tasks,[]);
  h.send('shutdown','system.shutdown');await h.next();await h.exit();
});

test('protocol failures recover without crashing and conflict remains conflict', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-protocol-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const h = harness(dataDir);
  h.child.stdin.write(Buffer.from([0xff, 0xfe, 0x0a]));
  assert.equal((await h.next()).error.code, -32700);
  h.child.stdin.write('{not-json}\n');
  assert.equal((await h.next()).error.code, -32700);
  await hello(h);
  h.child.stdin.write(`${'x'.repeat(4 * 1024 * 1024 + 1)}\n`);
  assert.equal((await h.next()).error.data.code, 'protocol_error');
  h.send('recovered', 'system.health');
  assert.equal((await h.next()).result.state, 'READY');
  h.send('unknown', 'unknown.method');
  assert.equal((await h.next()).error.code, -32601);
  h.send('wrong', 'system.health', {}, '2.0');
  assert.equal((await h.next()).error.data.code, 'protocol_error');
  h.send('minor', 'system.health', {}, '1.9');
  assert.equal((await h.next()).result.state, 'READY');
  h.send('extra', 'command.field.create', { title: 'No passthrough', goal: null, arbitrary: true });
  assert.equal((await h.next()).error.code, -32602);
  h.send('create', 'command.field.create', { title: 'Conflict', goal: null });
  const created = await h.next(); await h.next();
  h.send('object-focus', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: { arbitrary: true } });
  assert.equal((await h.next()).error.code, -32602);
  h.send('first', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'A' });
  await h.next(); await h.next();
  h.send('stale', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'B' });
  assert.equal((await h.next()).error.data.code, 'REVISION_CONFLICT');
  h.send('shutdown', 'system.shutdown'); await h.next(); await h.exit();
});

test('Phase 04 fixture proves provider-neutral stream, capture lifecycle, and no secret echo', async (t) => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'fielora-phase04-integration-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const h=harness(dataDir);assert.equal((await hello(h)).result.schema_version,6);const notifications=[];
  async function response(id){for(;;){const value=await h.next();if(value.id===id)return value;notifications.push(value);}}
  h.send('provider','command.provider.create_config',{provider_kind:'OPENAI_COMPATIBLE',display_name:'Fixture provider',base_url:'https://example.com/v1',default_model:'__fielora_fixture__',custom_endpoint_acknowledged:true});
  const provider=(await response('provider')).result;t.after(()=>spawnSync('cmdkey.exe',[`/delete:Fielora/provider/${provider.id}`],{windowsHide:true,stdio:'ignore'}));assert.equal(provider.lifecycle_status,'DISABLED');assert.equal(JSON.stringify(provider).includes('credential_ref'),false);
  const secret=`phase04-fixture-${randomUUID()}`;h.send('credential','command.provider.store_credential',{provider_config_id:provider.id,secret});const active=(await response('credential')).result;assert.equal(active.lifecycle_status,'ACTIVE');assert.equal(active.credential_present,true);assert.equal(JSON.stringify(active).includes(secret),false);
  h.send('field','command.field.create',{title:'Phase 04 Context',goal:'Prove capture semantics'});const field=(await response('field')).result;
  h.send('blocked-secret','command.model.start',{provider_config_id:provider.id,model_id:null,intent:'ASK',user_input:'do not send sk-abcdefghijklmnopqrstuvwxyz',context_package:[],response_mode:'TEXT'});const blockedSecret=await response('blocked-secret');assert.equal(blockedSecret.error.message,'CONTEXT_BLOCKED');assert.equal(JSON.stringify(blockedSecret).includes('sk-abcdefghijklmnopqrstuvwxyz'),false);
  const smallChip={kind:'USER_NOTE',source_identity:'note',source_revision_or_navigation_generation:'ephemeral',display_label:'Note',content:'bounded',sensitivity:'NORMAL',completeness:'COMPLETE'};h.send('too-many-chips','command.model.start',{provider_config_id:provider.id,model_id:null,intent:'ASK',user_input:'bounded',context_package:Array.from({length:9},()=>smallChip),response_mode:'TEXT'});assert.equal((await response('too-many-chips')).error.message,'CONTEXT_TOO_LARGE');
  h.send('invoke','command.model.start',{provider_config_id:provider.id,model_id:null,intent:'ASK',user_input:'Fixture prompt must not persist',context_package:[{kind:'CURRENT_FIELD',source_identity:field.id,source_revision_or_navigation_generation:'stale',display_label:'Current Field',content:'forged renderer field text',sensitivity:'NORMAL',completeness:'COMPLETE'}],response_mode:'TEXT'});
  const invocation=(await response('invoke')).result;const stream=[];while(!stream.some((event)=>event.params?.kind==='COMPLETED')){const event=notifications.shift()??await h.next();if(event.method==='event.model.invocation'&&event.params.invocation_id===invocation.invocation_id)stream.push(event);}
  assert.deepEqual(stream.map((event)=>event.params.kind),['STARTED','OUTPUT_TEXT_DELTA','USAGE','COMPLETED']);assert.equal(stream.find((event)=>event.params.kind==='OUTPUT_TEXT_DELTA').params.text_delta,'Fielora fixture response');
  h.send('invoke-cancel','command.model.start',{provider_config_id:provider.id,model_id:null,intent:'ASK',user_input:'cancel fixture',context_package:[],response_mode:'TEXT'});const cancelInvocation=(await response('invoke-cancel')).result;h.send('cancel','command.model.cancel',{invocation_id:cancelInvocation.invocation_id});await response('cancel');const cancelled=[];while(!cancelled.some((event)=>event.params?.kind==='CANCELLED')){const event=notifications.shift()??await h.next();if(event.method==='event.model.invocation'&&event.params.invocation_id===cancelInvocation.invocation_id)cancelled.push(event);}assert.deepEqual(cancelled.map((event)=>event.params.kind),['STARTED','CANCELLED']);assert.equal(cancelled.at(-1).params.error_code,'INVOCATION_CANCELLED');
  h.send('invoke-fail','command.model.start',{provider_config_id:provider.id,model_id:'__fielora_fixture_failure__',intent:'ASK',user_input:'failure fixture',context_package:[],response_mode:'TEXT'});const failedInvocation=(await response('invoke-fail')).result;const failed=[];while(!failed.some((event)=>event.params?.kind==='FAILED')){const event=notifications.shift()??await h.next();if(event.method==='event.model.invocation'&&event.params.invocation_id===failedInvocation.invocation_id)failed.push(event);}assert.deepEqual(failed.map((event)=>event.params.kind),['STARTED','FAILED']);assert.equal(failed.at(-1).params.error_code,'PROVIDER_RATE_LIMITED');
  h.send('capture','command.capture.create',{kind:'MODEL_OUTPUT',title:'Saved fixture result',content:'Fielora fixture response',source:{kind:'MODEL_RESPONSE',title:null,uri:null,field_id:null,resource_type:null,resource_id:null,resource_revision:null,provider_config_id:provider.id,provider_model_id:'__fielora_fixture__',provider_invocation_id:invocation.invocation_id,is_partial:false}});const capture=(await response('capture')).result;assert.equal(capture.placement_status,'INBOX');
  h.send('attach','command.capture.attach',{capture_id:capture.id,field_id:field.id,expected_revision:capture.revision});const attached=(await response('attach')).result;assert.equal(attached.placement_status,'ATTACHED');
  h.send('promote','command.capture.promote',{capture_id:capture.id,field_id:field.id,expected_revision:attached.revision});const promoted=(await response('promote')).result;assert.equal(promoted.placement_status,'PROMOTED');assert.equal(promoted.promoted_as,'IDEA_CANDIDATE');
  h.send('list','query.capture.list',{placement:null,lifecycle:'ACTIVE',field_id:field.id,cursor:null,limit:100});assert.equal((await response('list')).result.items[0].id,capture.id);
  h.send('remove','command.provider.remove_config',{provider_config_id:provider.id});await response('remove');
  const serialized=JSON.stringify(notifications);assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('Fixture prompt must not persist'),false);assert.equal(serialized.includes('forged renderer field text'),false);
  h.send('shutdown','system.shutdown');await response('shutdown');await h.exit();
});

test('Complete Agent executes an approved coding loop with durable tools, verification, and conversation result', async (t) => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'fielora-agent-integration-'));
  const projectRoot=path.join(dataDir,'agent-project');await mkdir(projectRoot,{recursive:true});
  assert.equal(spawnSync('git',['init'],{cwd:projectRoot,windowsHide:true,stdio:'ignore'}).status,0);
  const h=harness(dataDir);t.after(async()=>{if(h.child.exitCode===null){spawnSync('taskkill.exe',['/PID',String(h.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}await rm(dataDir,{recursive:true,force:true});});const greeting=await hello(h);for(const capability of ['agent.start','agent.events','agent.resolve_approval'])assert.ok(greeting.result.capabilities.includes(capability));
  const notifications=[];async function response(id){for(;;){const value=await h.next();if(value.id===id)return value;notifications.push(value);}}
  h.send('agent-provider','command.provider.create_config',{provider_kind:'OPENAI_COMPATIBLE',display_name:'Agent fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture__',custom_endpoint_acknowledged:true});const provider=(await response('agent-provider')).result;
  h.send('agent-credential','command.provider.store_credential',{provider_config_id:provider.id,secret:`agent-fixture-${randomUUID()}`});assert.equal((await response('agent-credential')).result.lifecycle_status,'ACTIVE');t.after(()=>spawnSync('cmdkey.exe',[`/delete:Fielora/provider/${provider.id}`],{windowsHide:true,stdio:'ignore'}));
  h.send('agent-project','command.project.create',{title:'Agent Project',goal:'Prove a real tool loop',root_path:projectRoot});const project=(await response('agent-project')).result;
  h.send('agent-conversation','command.conversation.create',{field_id:project.field_id,title:'Agent execution',provider_config_id:provider.id,model_id:'__fielora_agent_fixture__'});const conversation=(await response('agent-conversation')).result;
  h.send('agent-user-message','command.conversation.message.create',{conversation_id:conversation.id,role:'USER',content:'FIELORA_AGENT_FIXTURE_CREATE',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});await response('agent-user-message');
  h.send('agent-start','command.agent.start',{field_id:project.field_id,conversation_id:conversation.id,provider_config_id:provider.id,model_id:'__fielora_agent_fixture__',task:'FIELORA_AGENT_FIXTURE_CREATE',permission:'REVIEW_CHANGES',max_steps:8});const run=(await response('agent-start')).result;

  let sequence=0;let approvalCount=0;let finalRun=null;
  for(let attempt=0;attempt<120;attempt+=1){
    h.send(`agent-get-${attempt}`,'query.agent.get',{run_id:run.id});finalRun=(await response(`agent-get-${attempt}`)).result;
    h.send(`agent-events-${attempt}`,'query.agent.events',{run_id:run.id,after_sequence:sequence,limit:100});const events=(await response(`agent-events-${attempt}`)).result;if(events.length)sequence=events.at(-1).sequence;
    const requested=events.find((event)=>event.kind==='APPROVAL_REQUESTED');
    if(requested){
      const approval=requested.payload.approval;approvalCount+=1;
      h.send(`agent-approve-${approvalCount}`,'command.agent.resolve_approval',{run_id:run.id,approval_id:approval.id,nonce:approval.nonce,decision:'ALLOW_ONCE'});assert.equal((await response(`agent-approve-${approvalCount}`)).result.decision,'ALLOW_ONCE');
    }
    if(['COMPLETED','FAILED','CANCELLED'].includes(finalRun.status))break;
    await new Promise((resolve)=>setTimeout(resolve,25));
  }
  assert.equal(finalRun.status,'COMPLETED',JSON.stringify(finalRun));assert.equal(approvalCount,2);
  assert.equal(await readFile(path.join(projectRoot,'fielora-agent-fixture.txt'),'utf8'),'created by the Fielora Agent fixture\n');
  h.send('agent-tools','query.agent.tool_calls',{run_id:run.id});const tools=(await response('agent-tools')).result;assert.deepEqual(tools.map((tool)=>[tool.name,tool.status]),[['create_file','COMPLETED'],['run_command','COMPLETED']]);assert.equal(tools[1].receipt.success,true);assert.equal(tools[1].receipt.execution_boundary,'CONTROLLED_WORKSPACE_EXECUTION');
  h.send('agent-all-events','query.agent.events',{run_id:run.id,after_sequence:null,limit:500});const kinds=(await response('agent-all-events')).result.map((event)=>event.kind);for(const kind of ['RUN_CREATED','CONTEXT_COMPILED','APPROVAL_REQUESTED','TOOL_COMPLETED','VERIFICATION_RECORDED','RUN_COMPLETED'])assert.ok(kinds.includes(kind),kind);
  h.send('agent-messages','query.conversation.message.list',{conversation_id:conversation.id});const messages=(await response('agent-messages')).result;assert.deepEqual(messages.map((message)=>message.role),['USER','ASSISTANT']);assert.match(messages[1].content,/completed the task/i);
  h.send('delegate-start','command.agent.start',{field_id:project.field_id,conversation_id:conversation.id,provider_config_id:provider.id,model_id:'__fielora_agent_fixture__',task:'FIELORA_AGENT_FIXTURE_DELEGATE',permission:'FULL_CONTROL',max_steps:8});const delegated=(await response('delegate-start')).result;
  let delegatedRun=null;for(let attempt=0;attempt<80;attempt+=1){h.send(`delegate-get-${attempt}`,'query.agent.get',{run_id:delegated.id});delegatedRun=(await response(`delegate-get-${attempt}`)).result;if(['COMPLETED','FAILED','CANCELLED'].includes(delegatedRun.status))break;await new Promise((resolve)=>setTimeout(resolve,25));}assert.equal(delegatedRun.status,'COMPLETED');
  h.send('delegate-runs','query.agent.list',{conversation_id:conversation.id});const allRuns=(await response('delegate-runs')).result;const child=allRuns.find((item)=>item.task.startsWith('[SUBAGENT parent='));assert.ok(child);assert.equal(child.permission,'READ_ONLY');assert.equal(child.status,'COMPLETED');
  h.send('delegate-parent-tools','query.agent.tool_calls',{run_id:delegated.id});const delegationTool=(await response('delegate-parent-tools')).result.find((tool)=>tool.name==='delegate_readonly');assert.equal(delegationTool.status,'COMPLETED');assert.equal(delegationTool.receipt.child_run_id,child.id);
  h.send('delegate-child-tools','query.agent.tool_calls',{run_id:child.id});assert.deepEqual((await response('delegate-child-tools')).result.map((tool)=>[tool.name,tool.effect,tool.status]),[['list_files','OBSERVE','COMPLETED']]);
  h.send('cancel-start','command.agent.start',{field_id:project.field_id,conversation_id:conversation.id,provider_config_id:provider.id,model_id:'__fielora_agent_fixture_slow__',task:'Wait until cancelled',permission:'READ_ONLY',max_steps:4});const cancellable=(await response('cancel-start')).result;
  h.send('cancel-agent','command.agent.cancel',{run_id:cancellable.id});await response('cancel-agent');let cancelledRun=null;for(let attempt=0;attempt<50;attempt+=1){h.send(`cancel-get-${attempt}`,'query.agent.get',{run_id:cancellable.id});cancelledRun=(await response(`cancel-get-${attempt}`)).result;if(cancelledRun.status==='CANCELLED')break;await new Promise((resolve)=>setTimeout(resolve,20));}assert.equal(cancelledRun.status,'CANCELLED');assert.equal(cancelledRun.error_code,'AGENT_CANCELLED');
  h.send('agent-shutdown','system.shutdown');await response('agent-shutdown');await h.exit();
});

test('Complete Agent reconciles an abrupt Core crash to PAUSED without replaying work', async (t) => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'fielora-agent-recovery-'));const projectRoot=path.join(dataDir,'project');await mkdir(projectRoot,{recursive:true});let active;
  t.after(async()=>{if(active?.child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(active.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await rm(dataDir,{recursive:true,force:true});});
  const first=harness(dataDir);active=first;await hello(first);const notices=[];async function response(h,id){for(;;){const value=await h.next();if(value.id===id)return value;notices.push(value);}}
  first.send('recovery-provider','command.provider.create_config',{provider_kind:'OPENAI_COMPATIBLE',display_name:'Recovery fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_slow__',custom_endpoint_acknowledged:true});const provider=(await response(first,'recovery-provider')).result;t.after(()=>spawnSync('cmdkey.exe',[`/delete:Fielora/provider/${provider.id}`],{windowsHide:true,stdio:'ignore'}));
  first.send('recovery-credential','command.provider.store_credential',{provider_config_id:provider.id,secret:`recovery-${randomUUID()}`});await response(first,'recovery-credential');
  first.send('recovery-project','command.project.create',{title:'Recovery',goal:null,root_path:projectRoot});const project=(await response(first,'recovery-project')).result;
  first.send('recovery-conversation','command.conversation.create',{field_id:project.field_id,title:'Crash recovery',provider_config_id:provider.id,model_id:'__fielora_agent_fixture_slow__'});const conversation=(await response(first,'recovery-conversation')).result;
  first.send('recovery-start','command.agent.start',{field_id:project.field_id,conversation_id:conversation.id,provider_config_id:provider.id,model_id:'__fielora_agent_fixture_slow__',task:'Remain active across the crash',permission:'READ_ONLY',max_steps:4});const run=(await response(first,'recovery-start')).result;
  for(let attempt=0;attempt<30;attempt+=1){first.send(`recovery-running-${attempt}`,'query.agent.get',{run_id:run.id});if((await response(first,`recovery-running-${attempt}`)).result.status==='RUNNING')break;await new Promise((resolve)=>setTimeout(resolve,20));}
  spawnSync('taskkill.exe',['/PID',String(first.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await first.exit();
  const second=harness(dataDir);active=second;await hello(second);second.send('recovery-get','query.agent.get',{run_id:run.id});const recovered=(await response(second,'recovery-get')).result;assert.equal(recovered.status,'PAUSED');assert.equal(recovered.error_code,'CORE_RESTARTED');
  second.send('recovery-events','query.agent.events',{run_id:run.id,after_sequence:null,limit:500});assert.ok((await response(second,'recovery-events')).result.some((event)=>event.kind==='RECOVERY_RECONCILED'));
  second.send('recovery-resume','command.agent.resume',{run_id:run.id});assert.equal((await response(second,'recovery-resume')).result.status,'RUNNING');second.send('recovery-cancel','command.agent.cancel',{run_id:run.id});await response(second,'recovery-cancel');
  let terminal=null;for(let attempt=0;attempt<50;attempt+=1){second.send(`recovery-terminal-${attempt}`,'query.agent.get',{run_id:run.id});terminal=(await response(second,`recovery-terminal-${attempt}`)).result;if(terminal.status==='CANCELLED')break;await new Promise((resolve)=>setTimeout(resolve,20));}assert.equal(terminal.status,'CANCELLED');
  second.send('recovery-shutdown','system.shutdown');await response(second,'recovery-shutdown');await second.exit();
});
