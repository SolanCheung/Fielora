import assert from 'node:assert/strict';
import test from 'node:test';
import { ComposerDraftStore, composerDraftKey } from './composer-drafts.ts';
import type { WorkspaceAttachmentView } from '../workspace-types';

test('unsent drafts remain isolated across conversations, projects and late attachment completion', () => {
  const store = new ComposerDraftStore();
  const a = composerDraftKey('p', 'a'); const b = composerDraftKey('p', 'b');
  const image = { id: 'image', data_url: 'data:image/png;base64,fixture', content_ref: 'image.png' } as WorkspaceAttachmentView;
  store.write(a, { prompt: '还没有发送', attachments: [] });
  store.write(b, { prompt: '另一个草稿', attachments: [] });
  store.write(a, { ...store.read(a), attachments: [image] });
  assert.equal(store.read(a).attachments[0], image);
  assert.equal(store.read(a).prompt, '还没有发送');
  assert.equal(store.read(b).attachments.length, 0);
  assert.equal(store.read(composerDraftKey('other', 'a')).prompt, '');
  store.write(a, { prompt: '', attachments: [] });
  assert.equal(store.read(b).prompt, '另一个草稿');
});

test('first send moves the project draft to its created conversation without leaving a duplicate', () => {
  const store = new ComposerDraftStore();
  const from = composerDraftKey('p', ''); const to = composerDraftKey('p', 'created');
  store.write(from, { prompt: '开始工作', attachments: [] }); store.move(from, to);
  assert.equal(store.read(to).prompt, '开始工作'); assert.equal(store.read(from).prompt, '');
  store.move(from, to);
  assert.equal(store.read(to).prompt, '开始工作', 'an absent source must never clear an existing draft');
});
