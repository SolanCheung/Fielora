'use strict';

const REQUIRED_NODE_MAJOR = 24;

function normalizedVersion(version) {
  return String(version).replace(/^v/, '');
}

function nodeMajor(version) {
  const match = /^(\d+)(?:\.|$)/.exec(normalizedVersion(version));
  return match ? Number(match[1]) : Number.NaN;
}

function runNodeVersionGuard(version = process.versions.node, writeError = (message) => console.error(message)) {
  const current = normalizedVersion(version);
  if (nodeMajor(current) === REQUIRED_NODE_MAJOR) return 0;
  writeError(`Fielora requires Node ${REQUIRED_NODE_MAJOR}.x`);
  writeError(`Current Node: ${current}`);
  return 1;
}

if (require.main === module) process.exitCode = runNodeVersionGuard();

module.exports = { REQUIRED_NODE_MAJOR, nodeMajor, runNodeVersionGuard };
