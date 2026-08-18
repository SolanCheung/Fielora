import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSelectedAttachments, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from './attachment-runtime.ts';

test('explicit attachment loading accepts bounded UTF-8 and never returns absolute paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fielora-attachments-'));
  try {
    const textPath = path.join(root, 'notes.md');
    const binaryPath = path.join(root, 'image.bin');
    const largePath = path.join(root, 'large.txt');
    await writeFile(textPath, '# Context\n真实附件内容');
    await writeFile(binaryPath, Buffer.from([0, 1, 2, 3]));
    await writeFile(largePath, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 97));
    const selection = await loadSelectedAttachments([textPath, binaryPath, largePath]);
    assert.equal(selection.attachments[0]?.status, 'READY');
    assert.equal(selection.attachments[0]?.content, '# Context\n真实附件内容');
    assert.equal(selection.attachments[1]?.status, 'UNSUPPORTED');
    assert.equal(selection.attachments[2]?.status, 'TOO_LARGE');
    assert.equal(JSON.stringify(selection).includes(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('attachment selection is limited before any file read result enters the renderer', async () => {
  const paths = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, index) => `Z:\\missing-${index}.txt`);
  const selection = await loadSelectedAttachments(paths);
  assert.equal(selection.attachments.length, MAX_ATTACHMENTS);
  assert.equal(selection.truncated_count, 2);
});
