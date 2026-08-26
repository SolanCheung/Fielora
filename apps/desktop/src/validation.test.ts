import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBrowserBounds, validateBrowserNavigate, validateBrowserPageRequest, validateClipboardText, validateCreate, validateCreateState, validateFocus, validateSetFocusV1,
  validateSnapshot, validateSnapshotV1,
  validateCreateProvider, validateStoreCredential, validateStartModel, validateCreateCapture,
  validateCreateConversation, validateCreateConversationMessage, validateUpdateProject, validateApplyWorkspaceFile,
  validateRunTerminal,
  validateStartAgent, validateListAgentEvents, validateResolveAgentApproval,
  validateActivateMcpConnection,
  validateStoreWorkspaceAttachment, validateReadWorkspaceAttachment, validateSaveWorkspaceAttachment,
} from './validation.ts';

const fieldId = '018f84cb-7c4e-7a12-a6d4-3c441f80a227';

test('bridge payload validators do not expose arbitrary pass-through', () => {
  assert.deepEqual(validateCreate({ title: 'Phase 02', goal: null }), { title: 'Phase 02', goal: null });
  assert.throws(() => validateCreate({ title: 'Phase 02', goal: null, method: 'system.shutdown' }));
  assert.deepEqual(validateFocus({ field_id: fieldId, expected_revision: 2, focus: 'Persistence' }), {
    field_id: fieldId, expected_revision: 2, focus: 'Persistence',
  });
  assert.throws(() => validateFocus({ field_id: fieldId, expected_revision: 0, focus: 'x' }));
  assert.throws(() => validateFocus({ field_id: fieldId, expected_revision: 2, focus: { arbitrary: true } }));
  assert.deepEqual(validateSnapshot({ field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [] }), {
    field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [],
  });
});

test('Browse bridge accepts only typed URL, Page ID, and view bounds payloads', () => {
  assert.deepEqual(validateBrowserNavigate({ url: 'https://example.com/' }), { url: 'https://example.com/' });
  assert.throws(() => validateBrowserNavigate({ url: 'https://example.com/', method: 'command.field.create' }));
  assert.deepEqual(validateBrowserPageRequest({ page_id: 'page_123e4567-e89b-42d3-a456-426614174000' }), {
    page_id: 'page_123e4567-e89b-42d3-a456-426614174000',
  });
  assert.throws(() => validateBrowserPageRequest({ page_id: 'field_123e4567-e89b-42d3-a456-426614174000' }));
  assert.throws(() => validateBrowserPageRequest({ page_id: 'page_123e4567-e89b-42d3-a456-426614174000', field_id: fieldId }));
  assert.deepEqual(validateBrowserBounds({ x: 210, y: 64, width: 970, height: 696 }), {
    x: 210, y: 64, width: 970, height: 696,
  });
  assert.throws(() => validateBrowserBounds({ x: -1, y: 0, width: 100, height: 100 }));
  assert.throws(() => validateBrowserBounds({ x: 0, y: 0, width: 100, height: 100, preload: 'evil.js' }));
});

test('trusted clipboard bridge accepts bounded text only', () => {
  assert.equal(validateClipboardText('复制这条消息'), '复制这条消息');
  assert.equal(validateClipboardText(''), '');
  assert.throws(() => validateClipboardText({ text: 'not a primitive' }));
  assert.throws(() => validateClipboardText('界'.repeat(349_526)));
});

test('Phase 02 bridge accepts only typed focus, bounded DTOs, and typed layout', () => {
  assert.deepEqual(validateSetFocusV1({ field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId } }), {
    field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId },
  });
  assert.throws(() => validateSetFocusV1({ field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId, html: '<b>x</b>' } }));
  assert.deepEqual(validateCreateState({ field_id: fieldId, kind: 'TASK', content: 'Ship', confidence: 0.8 }).kind, 'TASK');
  assert.throws(() => validateCreateState({ field_id: fieldId, kind: 'TASK', content: 'Ship', confidence: Number.NaN }));
  const layout = { version: 1, template: 'PRIMARY_ONLY', primary: { pane_id: 'primary_task', primitive: 'TASK_PANE', binding: { kind: 'FIELD_TASKS' }, collapsed: false }, supporting: [], focused_pane_id: 'primary_task' };
  assert.deepEqual(validateSnapshotV1({ field_id: fieldId, layout }).layout, layout);
  assert.throws(() => validateSnapshotV1({ field_id: fieldId, layout: { ...layout, ratio: 0.72 } }));
});

test('Phase 04 bridge rejects secret echo fields, unknown context, and malformed provenance', () => {
  assert.equal(validateCreateProvider({ provider_kind: 'OPENAI', display_name: 'OpenAI', base_url: null, default_model: 'gpt-test', custom_endpoint_acknowledged: false }).provider_kind, 'OPENAI');
  assert.throws(() => validateCreateProvider({ provider_kind: 'OPENAI', display_name: 'OpenAI', base_url: null, default_model: 'gpt-test', custom_endpoint_acknowledged: false, secret: 'no' }));
  assert.equal(validateStoreCredential({ provider_config_id: fieldId, secret: 'test-only' }).secret, 'test-only');
  assert.throws(() => validateStoreCredential({ provider_config_id: fieldId, secret: 'x'.repeat(2049) }));
  assert.throws(() => validateStoreCredential({ provider_config_id: fieldId, secret: '界'.repeat(683) }));
  const chip = { kind: 'CURRENT_FIELD', source_identity: fieldId, source_revision_or_navigation_generation: '1', display_label: 'Field', content: 're-read', sensitivity: 'NORMAL', completeness: 'COMPLETE' };
  assert.equal(validateStartModel({ provider_config_id: fieldId, model_id: null, intent: 'ASK', user_input: 'hello', context_package: [chip], response_mode: 'TEXT' }).context_package.length, 1);
  assert.throws(() => validateStartModel({ provider_config_id: fieldId, model_id: null, intent: 'ASK', user_input: 'hello', context_package: [{ ...chip, authority: 'REALITY' }], response_mode: 'TEXT' }));
  assert.throws(() => validateStartModel({ provider_config_id: fieldId, model_id: null, intent: 'ASK', user_input: 'hello', context_package: Array.from({ length: 9 }, () => chip), response_mode: 'TEXT' }));
  assert.throws(() => validateStartModel({ provider_config_id: fieldId, model_id: null, intent: 'ASK', user_input: 'x'.repeat(8001), context_package: [], response_mode: 'TEXT' }));
  assert.throws(() => validateStartModel({ provider_config_id: fieldId, model_id: null, intent: 'ASK', user_input: 'hello', context_package: [{ ...chip, content: '😀'.repeat(4001) }], response_mode: 'TEXT' }));
  const source = { kind: 'USER_INPUT', title: null, uri: null, field_id: null, resource_type: null, resource_id: null, resource_revision: null, provider_config_id: null, provider_model_id: null, provider_invocation_id: null, is_partial: false };
  assert.equal(validateCreateCapture({ kind: 'TEXT', title: 'Note', content: 'Body', source }).source.kind, 'USER_INPUT');
  assert.throws(() => validateCreateCapture({ kind: 'TEXT', title: 'Note', content: 'Body', source: { ...source, authorization: 'Bearer secret' } }));
  assert.throws(() => validateCreateCapture({ kind: 'TEXT', title: 'N'.repeat(121), content: 'Body', source }));
  assert.throws(() => validateCreateCapture({ kind: 'TEXT', title: 'Note', content: 'x'.repeat(16001), source }));
});

test('Desktop Foundation bridge keeps Project, Conversation, file, and terminal payloads bounded', () => {
  assert.equal(validateUpdateProject({ field_id: fieldId, expected_revision: 1, title: 'Renamed Project' }).title, 'Renamed Project');
  assert.throws(() => validateUpdateProject({ field_id: fieldId, expected_revision: 1, title: '', root_path: 'C:\\escape' }));
  assert.equal(validateCreateConversation({ field_id: fieldId, title: 'Build', provider_config_id: null, model_id: null }).title, 'Build');
  assert.throws(() => validateCreateConversation({ field_id: fieldId, title: 'Build', provider_config_id: null, model_id: null, root_path: 'C:\\escape' }));
  assert.equal(validateCreateConversationMessage({ conversation_id: fieldId, role: 'USER', content: 'Inspect', status: 'COMPLETED', provider_config_id: null, model_id: null, invocation_id: null }).role, 'USER');
  assert.throws(() => validateCreateConversationMessage({ conversation_id: fieldId, role: 'SYSTEM', content: 'Escalate', status: 'COMPLETED', provider_config_id: null, model_id: null, invocation_id: null }));
  assert.equal(validateApplyWorkspaceFile({ field_id: fieldId, relative_path: 'src/app.ts', expected_sha256: 'a'.repeat(64), content: 'ok' }).relative_path, 'src/app.ts');
  assert.throws(() => validateApplyWorkspaceFile({ field_id: fieldId, relative_path: '../secret', expected_sha256: 'a'.repeat(64), content: 'no' }));
  assert.equal(validateRunTerminal({ field_id: fieldId, command: 'pnpm test', working_directory: 'C:\\work' }).command, 'pnpm test');
  assert.equal(validateRunTerminal({ field_id: fieldId, command: 'pnpm test', working_directory: 'C:\\work' }).working_directory, 'C:\\work');
  assert.throws(() => validateRunTerminal({ field_id: fieldId, command: '', working_directory: 'C:\\work' }));
  assert.throws(() => validateRunTerminal({ field_id: fieldId, command: 'pnpm test' }));
});

test('Complete Agent bridge accepts only bounded typed execution and approval payloads', () => {
  const start={field_id:fieldId,conversation_id:fieldId,provider_config_id:fieldId,model_id:'gpt-test',task:'Fix the failing test',permission:'REVIEW_CHANGES',max_steps:24} as const;
  assert.equal(validateStartAgent(start).permission,'REVIEW_CHANGES');
  assert.equal(validateStartAgent({...start,user_message_id:fieldId}).user_message_id,fieldId);
  assert.throws(()=>validateStartAgent({...start,user_message_id:'not-an-id'}));
  assert.throws(()=>validateStartAgent({...start,permission:'UNRESTRICTED'}));
  assert.throws(()=>validateStartAgent({...start,max_steps:65}));
  assert.throws(()=>validateStartAgent({...start,tool:{name:'shell'}}));
  assert.deepEqual(validateListAgentEvents({run_id:fieldId,after_sequence:0,limit:500}),{run_id:fieldId,after_sequence:0,limit:500});
  assert.throws(()=>validateListAgentEvents({run_id:fieldId,after_sequence:0,limit:501}));
  assert.equal(validateResolveAgentApproval({run_id:fieldId,approval_id:fieldId,nonce:'one-time-nonce',decision:'ALLOW_ONCE'}).decision,'ALLOW_ONCE');
  assert.throws(()=>validateResolveAgentApproval({run_id:fieldId,approval_id:fieldId,nonce:'one-time-nonce',decision:'ALWAYS_ALLOW'}));
  assert.deepEqual(validateActivateMcpConnection({run_id:fieldId,connection_id:'local.docs-v1'}),{run_id:fieldId,connection_id:'local.docs-v1'});
  assert.throws(()=>validateActivateMcpConnection({run_id:fieldId,connection_id:'local docs',command:'cmd.exe'}));
});

test('multimodal Agent and attachment bridges accept only bounded native image parts', () => {
  const image = { id: 'a'.repeat(64), filename: 'image.png', mime_type: 'image/png', size: 8, width: 32, height: 20, source: 'clipboard', data_url: 'data:image/png;base64,iVBORw0KGgo=' } as const;
  const start = { field_id: fieldId, conversation_id: fieldId, user_message_id: fieldId, provider_config_id: fieldId, model_id: 'qwen3.7-plus', task: '说明图片内容', permission: 'REVIEW_CHANGES', max_steps: 24, attachments: [image] } as const;
  assert.equal(validateStartAgent(start).attachments?.[0]?.source, 'clipboard');
  assert.equal(validateStartAgent(start).attachments?.[0]?.mime_type, 'image/png');
  assert.throws(() => validateStartAgent({ ...start, attachments: [{ ...image, source: 'remote_url' }] }));
  assert.throws(() => validateStartAgent({ ...start, attachments: Array.from({ length: 5 }, () => image) }));

  const stored = validateStoreWorkspaceAttachment({ id: image.id, name: image.filename, size: image.size, mime_type: image.mime_type, data_url: image.data_url, width: image.width, height: image.height, source: image.source });
  assert.equal(stored.name, 'image.png');
  assert.deepEqual(validateReadWorkspaceAttachment({ content_ref: `${'a'.repeat(64)}.png` }), { content_ref: `${'a'.repeat(64)}.png` });
  assert.throws(() => validateReadWorkspaceAttachment({ content_ref: '../image.png' }));
  assert.equal(validateSaveWorkspaceAttachment({ content_ref: `${'a'.repeat(64)}.png`, filename: 'saved.png' }).filename, 'saved.png');
  assert.throws(() => validateSaveWorkspaceAttachment({ content_ref: `${'a'.repeat(64)}.png`, filename: '../saved.png' }));
});
