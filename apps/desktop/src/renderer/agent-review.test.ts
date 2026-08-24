import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentToolCallView } from '@fielora/contracts';
import { appliedAgentReview, buildAgentReview, reviewDisplayFor } from './agent-review.ts';

function tool(overrides: Partial<AgentToolCallView>): AgentToolCallView {
  return {
    id: 'tool-1', run_id: 'run-1', name: 'apply_patches', effect: 'WORKSPACE_WRITE', status: 'COMPLETED',
    policy_decision: 'ALLOW', arguments: {}, receipt: { kind: 'PATCH_SET_APPLIED' }, error_code: null, created_at: 1, updated_at: 2,
    ...overrides,
  };
}

test('applied Agent patches become real Review files and diff counts', () => {
  const review = buildAgentReview([tool({ arguments: { patches: [{ path: 'src/form.html', replacements: [{ old_text: 'optional', new_text: 'required' }] }] } })]);
  assert.equal(review.state, 'APPLIED');
  assert.equal(review.files[0]?.path, 'src/form.html');
  assert.equal(review.additions, 1);
  assert.equal(review.deletions, 1);
  assert.match(review.files[0]!.diff, /-optional/);
  assert.match(review.files[0]!.diff, /\+required/);
  assert.deepEqual(review.files[0]!.changes, [{ before: 'optional', after: 'required' }]);
});

test('live edited-file totals stay hidden before a write and update from the same applied review', () => {
  assert.deepEqual(appliedAgentReview(buildAgentReview([])), { files: [], additions: 0, deletions: 0, state: 'EMPTY' });
  const first = appliedAgentReview(buildAgentReview([
    tool({ id: 'write-a', name: 'create_file', arguments: { path: 'src/a.ts', content: 'export const a = true;' } }),
  ]));
  assert.deepEqual({ files: first?.files.length, additions: first?.additions, deletions: first?.deletions }, { files: 1, additions: 1, deletions: 0 });

  const updated = appliedAgentReview(buildAgentReview([
    tool({ id: 'write-a', name: 'create_file', arguments: { path: 'src/a.ts', content: 'export const a = true;' } }),
    tool({ id: 'write-b', name: 'replace_text', arguments: { path: 'src/b.ts', old_text: 'false', new_text: 'true' } }),
  ]));
  assert.deepEqual({ files: updated?.files.length, additions: updated?.additions, deletions: updated?.deletions }, { files: 2, additions: 2, deletions: 1 });
});

test('waiting REVIEW_CHANGES patches are proposed while failed tools stay out', () => {
  const review = buildAgentReview([
    tool({ id: 'waiting', status: 'WAITING_APPROVAL', arguments: { path: 'src/a.ts', old_text: 'a', new_text: 'b', replacements: [{ old_text: 'a', new_text: 'b' }] } }),
    tool({ id: 'failed', status: 'FAILED', arguments: { path: 'src/failed.ts', content: 'unsafe' } }),
  ]);
  assert.equal(review.state, 'PROPOSED');
  assert.deepEqual(review.files.map((file) => file.path), ['src/a.ts']);
});

test('line edits retain their exact source range for deterministic Human Review', () => {
  const review = buildAgentReview([tool({ arguments: { patches: [{ path: 'src/form.ts', line_edits: [{ start_line: 12, end_line: 13, new_text: '  optional: true,' }] }] } })]);
  assert.deepEqual(review.files[0]?.changes, [{ before: null, after: '  optional: true,', lineStart: 12, lineEnd: 13 }]);
  assert.equal(reviewDisplayFor(review.files[0]!), 'RAW');
});

test('review only claims semantics with exact evidence and otherwise degrades safely', () => {
  const semantic = buildAgentReview([tool({ arguments: { patches: [{ path: 'src/a.ts', replacements: [{ old_text: 'iContacter = 1', new_text: 'iContacter = 0' }] }] } })]);
  assert.equal(reviewDisplayFor(semantic.files[0]!), 'SEMANTIC');
  const structured = buildAgentReview([tool({ arguments: { patches: [{ path: 'src/b.ts', replacements: [{ old_text: 'const value = call();', new_text: 'const value = call(\n  option,\n);' }] }] } })]);
  assert.equal(reviewDisplayFor(structured.files[0]!), 'STRUCTURED');
  assert.doesNotMatch(JSON.stringify(structured), /修改前内容请查看原始 Diff/);
});

test('create, delete and rename reviews use adaptive human-safe presentations', () => {
  const created = buildAgentReview([tool({ name: 'create_file', arguments: { path: 'src/new.ts', content: 'export const value = 1;' } })]);
  assert.equal(created.files[0]?.changeType, 'CREATE');
  assert.equal(created.files[0]?.deletions, 0);
  assert.match(created.files[0]!.diff, /--- \/dev\/null/);
  assert.equal(reviewDisplayFor(created.files[0]!), 'STRUCTURED');

  const deleted = buildAgentReview([tool({ name: 'delete_file', effect: 'DESTRUCTIVE', arguments: { path: 'src/old.ts' } })]);
  assert.equal(deleted.files[0]?.changeType, 'DELETE');
  assert.equal(reviewDisplayFor(deleted.files[0]!), 'RAW');
  assert.doesNotMatch(deleted.files[0]!.diff, /invented|unknown content/i);

  const renamed = buildAgentReview([tool({ name: 'move_file', arguments: { from: 'src/old.ts', to: 'src/new.ts' } })]);
  assert.equal(renamed.files[0]?.previousPath, 'src/old.ts');
  assert.equal(renamed.files[0]?.path, 'src/new.ts');
  assert.equal(reviewDisplayFor(renamed.files[0]!), 'STRUCTURED');
});

test('direct replace_text receipts retain exact before and after content for structured review', () => {
  const review = buildAgentReview([tool({
    name: 'replace_text',
    arguments: { path: 'src/config.js', old_text: 'export const ready = true;', new_text: 'export const ready = { complete: true };' },
  })]);
  assert.equal(review.files[0]?.changeType, 'MODIFY');
  assert.equal(review.files[0]?.additions, 1);
  assert.equal(review.files[0]?.deletions, 1);
  assert.deepEqual(review.files[0]?.changes, [{ before: 'export const ready = true;', after: 'export const ready = { complete: true };' }]);
  assert.equal(reviewDisplayFor(review.files[0]!), 'STRUCTURED');
});
