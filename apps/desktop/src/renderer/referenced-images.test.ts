import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceAttachmentView } from '../workspace-types';
import { referencedConversationImages, referencesPreviousImages } from './referenced-images.ts';

test('explicit historical image references restore the newest user gallery only in this conversation', async () => {
  const gallery = (ref: string) => [{ kind: 'IMAGE', content_ref: ref }] as WorkspaceAttachmentView[];
  const history = [
    { id: 'old', conversation_id: 'a', role: 'USER', created_at: 1 },
    { id: 'current', conversation_id: 'a', role: 'USER', created_at: 2 },
    { id: 'other', conversation_id: 'b', role: 'USER', created_at: 3 },
  ];
  const reads: string[] = [];
  const read = async (ref: string) => { reads.push(ref); return { data_url: ref, mime_type: 'image/png' }; };
  assert.equal(referencesPreviousImages('上面的图片中 modal 字段需要继续调整'), true);
  assert.equal(referencesPreviousImages('为网站添加图片上传功能'), false);
  assert.deepEqual(await referencedConversationImages('修正逻辑', 'a', history, gallery, read), []);
  const result = await referencedConversationImages('上面的截图', 'a', history, gallery, read);
  assert.deepEqual(reads, ['current']); assert.equal(result[0]?.data_url, 'current');
  reads.length = 0;
  assert.deepEqual(await referencedConversationImages('上面的截图', 'a', history, gallery, async ref => { reads.push(ref); throw Error('missing'); }), []);
  assert.deepEqual(reads, ['current'], 'missing latest image does not substitute an unrelated older image');
});

test('retry and resume resolve images at the original message, excluding later galleries', async () => {
  const history = [
    { id: 'original', conversation_id: 'a', role: 'USER', created_at: 1 },
    { id: 'follow-up', conversation_id: 'a', role: 'USER', created_at: 2 },
    { id: 'later', conversation_id: 'a', role: 'USER', created_at: 3 },
  ];
  const attachments = (id: string) => id === 'follow-up' ? [] : [{ kind: 'IMAGE', content_ref: id }] as WorkspaceAttachmentView[];
  const reads: string[] = [];
  const read = async (ref: string) => { reads.push(ref); return { data_url: ref, mime_type: 'image/png' }; };
  const restored = await referencedConversationImages('继续核对之前的图片', 'a', history, attachments, read, 'follow-up');
  assert.equal(restored[0]?.data_url, 'original');
  assert.deepEqual(reads, ['original']);
  assert.deepEqual(await referencedConversationImages('之前的图片', 'a', history, attachments, read, 'missing'), []);
});
