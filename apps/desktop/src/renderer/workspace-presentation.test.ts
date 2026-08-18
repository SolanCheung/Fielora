import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFileProposal, reviewDiff } from './workspace-presentation.ts';

test('file proposal accepts one bounded relative replacement', () => {
  assert.deepEqual(parseFileProposal('Done\n```fielora-file path="src/app.ts"\nexport const ok = true;\n```'), {
    relativePath: 'src/app.ts', content: 'export const ok = true;',
  });
  assert.equal(parseFileProposal('```fielora-file path="../secret"\nno\n```'), null);
});

test('review diff clearly separates removed and added lines', () => {
  const diff = reviewDiff('src/app.ts', 'one\ntwo\nthree', 'one\nchanged\nthree');
  assert.match(diff, /-two/);
  assert.match(diff, /\+changed/);
  assert.match(diff, /--- a\/src\/app.ts/);
});
