import assert from 'node:assert/strict';
import test from 'node:test';
import { chinaProviderPresets } from './china-provider-presets.ts';

test('initial China coding provider presets are complete and use base URLs', () => {
  const configured = chinaProviderPresets.filter((preset) => preset.value !== 'MANUAL');
  assert.deepEqual(configured.map((preset) => preset.value), [
    'QWEN', 'QWEN_CODING_PLAN', 'DEEPSEEK', 'KIMI', 'GLM', 'MINIMAX', 'DOUBAO',
  ]);
  for (const preset of configured) {
    const url = new URL(preset.baseUrl);
    assert.equal(url.protocol, 'https:');
    assert.ok(preset.model.length > 0);
    assert.doesNotMatch(url.pathname, /\/chat\/completions\/?$/);
  }
});

test('preset endpoint classes remain distinct for model-family detection', () => {
  const hosts = chinaProviderPresets
    .filter((preset) => preset.value !== 'MANUAL')
    .map((preset) => new URL(preset.baseUrl).host);
  assert.equal(new Set(hosts).size, 7);
});
