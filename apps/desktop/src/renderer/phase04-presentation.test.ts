import test from 'node:test';
import assert from 'node:assert/strict';
import type { CaptureView, ContextChip } from '@fielora/contracts';
import {
  capturePreview,
  captureSourceLabel,
  captureStateLabel,
  contextSummary,
  inferUserNoteSensitivity,
  invocationStatusLabel,
} from './phase04-presentation.ts';

const capture: CaptureView = {
  id: '018f84cb-7c4e-7a12-a6d4-3c441f80a227', kind: 'PAGE', title: 'Example',
  content: '首页\n\n新闻    很长的正文', placement_status: 'INBOX', lifecycle_status: 'ACTIVE',
  attached_field_id: null, promoted_as: null,
  source: { kind: 'REMOTE_PAGE', title: 'Example', uri: 'https://example.com/path', field_id: null, resource_type: null, resource_id: null, resource_revision: null, provider_config_id: null, provider_model_id: null, provider_invocation_id: null, is_partial: false },
  revision: 1, created_at: 1, updated_at: 1,
};

test('Inbox presentation compresses content and translates lifecycle without domain wire values', () => {
  assert.equal(capturePreview(capture.content), '首页 新闻 很长的正文');
  assert.equal(capturePreview('一'.repeat(181)).length, 181);
  assert.equal(captureSourceLabel(capture), 'example.com');
  assert.equal(captureStateLabel(capture), '待整理');
  assert.equal(captureStateLabel({ ...capture, placement_status: 'PROMOTED', promoted_as: 'IDEA_CANDIDATE' }), '已作为灵感继续');
});

test('Context summary stays compact while deterministic sensitive cues remain exception-driven', () => {
  const chips = [
    { kind: 'CURRENT_FIELD', source_identity: 'field', source_revision_or_navigation_generation: '1', display_label: 'Fielora', content: 'Field', sensitivity: 'NORMAL', completeness: 'COMPLETE' },
    { kind: 'CURRENT_PAGE', source_identity: 'page', source_revision_or_navigation_generation: '2', display_label: 'Example', content: 'Page', sensitivity: 'NORMAL', completeness: 'COMPLETE' },
  ] satisfies ContextChip[];
  assert.equal(contextSummary(chips), '当前 Field + 当前页面');
  assert.equal(inferUserNoteSensitivity('普通工作说明'), 'NORMAL');
  assert.equal(inferUserNoteSensitivity('这是 synthetic API key 提示'), 'SENSITIVE');
  assert.equal(invocationStatusLabel('RUNNING'), '正在生成');
});
