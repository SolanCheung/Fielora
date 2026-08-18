import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const appPath = process.env.FIELORA_PACKAGED_APP
  ?? path.join(root, 'apps', 'desktop', 'out', 'desktop-foundation', 'Fielora-win32-x64', 'Fielora.exe');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-single-instance-'));
const roamingRoot = path.join(dataRoot, 'roaming');
const historicalProfile = path.join(roamingRoot, '@fielora', 'desktop');
const currentProfile = path.join(roamingRoot, '@fielora', 'desktop-foundation');
const evidenceRoot = process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts', 'desktop-foundation');
const output = [];
let historical;
let firstCurrent;
let secondCurrent;

function launch(args = []) {
  const child = spawn(appPath, args, {
    env: { ...process.env, APPDATA: roamingRoot, LOCALAPPDATA: dataRoot, FIELORA_E2E: '0' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  return child;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForExit(child, timeout) {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('second instance did not exit')), timeout)),
  ]);
}

await mkdir(roamingRoot, { recursive: true });
await mkdir(evidenceRoot, { recursive: true });

try {
  historical = launch([`--user-data-dir=${historicalProfile}`]);
  await delay(3_500);
  assert.equal(historical.exitCode, null, `historical-profile instance exited early\n${output.join('')}`);

  firstCurrent = launch([`--user-data-dir=${currentProfile}`]);
  await delay(3_500);
  assert.equal(firstCurrent.exitCode, null, `current instance was intercepted by the historical profile\n${output.join('')}`);
  assert.equal(historical.exitCode, null, `historical-profile instance exited unexpectedly\n${output.join('')}`);

  secondCurrent = launch([`--user-data-dir=${currentProfile}`]);
  assert.equal(await waitForExit(secondCurrent, 10_000), 0);
  await delay(600);
  assert.equal(firstCurrent.exitCode, null, `current instance crashed after second launch\n${output.join('')}`);

  const transcript = output.join('');
  assert.equal(/Object has been destroyed|A JavaScript error occurred|Uncaught Exception/i.test(transcript), false, transcript);
  await writeFile(path.join(evidenceRoot, 'PACKAGED_SINGLE_INSTANCE_ACCEPTANCE.json'), `${JSON.stringify({
    status: 'PASS',
    checks: [
      'current_starts_while_historical_profile_is_locked',
      'second_current_instance_exits',
      'first_current_instance_survives',
      'no_destroyed_window_exception',
    ],
    captured_at: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log('Packaged upgrade-collision and single-instance lifecycle E2E: PASS');
} finally {
  for (const child of [secondCurrent, firstCurrent, historical]) {
    if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
  await delay(200);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
}
