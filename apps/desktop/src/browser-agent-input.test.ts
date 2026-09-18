import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchBrowserClick } from './browser-agent-input.ts';

test('a click is delivered once even when its following observation fails', async () => {
  const sent: string[] = []; const state = { inputState: 'NOT_DISPATCHED' };
  const result = await dispatchBrowserClick(state, type => { sent.push(type); }, async () => ({success:false,error_code:'BROWSER_PAGE_NOT_READY'}));
  assert.deepEqual(sent, ['mouseMove','mouseDown','mouseUp']);
  assert.equal(state.inputState, 'DISPATCHED');
  assert.equal(result.outcome_unknown, false); assert.equal(result.observation_required, true);
  assert.equal(result.success, false);
});

test('a partial native input remains uncertain and does not trigger another input', async () => {
  const sent: string[] = []; const state = { inputState: 'NOT_DISPATCHED' }; let observations=0;
  await assert.rejects(dispatchBrowserClick(state, type => { sent.push(type); if (type==='mouseUp') throw new Error('lost renderer'); }, async () => {observations++;return {}; }));
  assert.deepEqual(sent, ['mouseMove','mouseDown','mouseUp']); assert.equal(observations,0);
  assert.equal(state.inputState, 'DISPATCHING');
});

test('an exception after complete delivery retains dispatch evidence for the runtime', async () => {
  const state = { inputState: 'NOT_DISPATCHED' };
  await assert.rejects(dispatchBrowserClick(state, () => {}, async () => { throw new Error('snapshot lost'); }));
  assert.equal(state.inputState, 'DISPATCHED');
});
