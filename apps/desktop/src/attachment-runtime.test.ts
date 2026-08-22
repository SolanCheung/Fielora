import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSelectedAttachments, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, readStoredImage, storeImageAttachment } from './attachment-runtime.ts';

test('explicit attachment loading accepts bounded UTF-8 and never returns absolute paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fielora-attachments-'));
  try {
    const textPath = path.join(root, 'notes.md');
    const binaryPath = path.join(root, 'image.bin');
    const largePath = path.join(root, 'large.txt');
    const imagePath = path.join(root, 'preview.png');
    await writeFile(textPath, '# Context\n真实附件内容');
    await writeFile(binaryPath, Buffer.from([0, 1, 2, 3]));
    await writeFile(largePath, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 97));
    await writeFile(imagePath, Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]));
    const selection = await loadSelectedAttachments([textPath, binaryPath, largePath, imagePath]);
    assert.equal(selection.attachments[0]?.status, 'READY');
    assert.equal(selection.attachments[0]?.content, '# Context\n真实附件内容');
    assert.equal(selection.attachments[1]?.status, 'UNSUPPORTED');
    assert.equal(selection.attachments[2]?.status, 'TOO_LARGE');
    assert.equal(selection.attachments[3]?.kind, 'IMAGE');
    assert.equal(selection.attachments[3]?.mime_type, 'image/png');
    assert.match(selection.attachments[3]?.data_url ?? '', /^data:image\/png;base64,/);
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

test('conversation image storage uses a digest reference and restores the exact bytes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fielora-stored-attachments-'));
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const stored = await storeImageAttachment(root, {
      id: digest, name: 'clipboard-image.png', size: bytes.length, mime_type: 'image/png',
      data_url: `data:image/png;base64,${bytes.toString('base64')}`, width: 32, height: 20, source: 'clipboard',
    });
    assert.equal(stored.content_ref, `${digest}.png`);
    assert.equal(stored.width, 32);
    assert.equal(stored.source, 'clipboard');
    const restored = await readStoredImage(root, stored.content_ref!);
    assert.deepEqual(Buffer.from(restored.bytes), bytes);
    assert.equal(restored.data_url, stored.data_url);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
