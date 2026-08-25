'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { REQUIRED_NODE_MAJOR, nodeMajor, runNodeVersionGuard } = require('./check-node-version.cjs');

test('Node 24 passes the Fielora toolchain guard', () => {
  const output = [];
  assert.equal(REQUIRED_NODE_MAJOR, 24);
  assert.equal(nodeMajor('v24.18.1'), 24);
  assert.equal(runNodeVersionGuard('24.0.0', (line) => output.push(line)), 0);
  assert.deepEqual(output, []);
});

test('a wrong Node major is rejected with actionable output', () => {
  const output = [];
  assert.equal(runNodeVersionGuard('v14.18.2', (line) => output.push(line)), 1);
  assert.deepEqual(output, [
    'Fielora requires Node 24.x',
    'Current Node: 14.18.2',
  ]);
});
