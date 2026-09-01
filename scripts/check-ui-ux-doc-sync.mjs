import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const structuralLock = 'STRUCTURAL_CHANGE_REQUIRES_USER_APPROVAL';
const structuralLockDocs = [
  'docs/architecture/FIELORA_UI_UX_SYSTEM_V0.1.md',
  'docs/product/FIELORA_DESIGN_LANGUAGE_V0.1.md',
];
for (const file of structuralLockDocs) {
  if (!readFileSync(file, 'utf8').includes(structuralLock)) {
    console.error('UI_UX_LAYOUT_LOCK: FAIL');
    console.error(`${file} is missing ${structuralLock}.`);
    process.exit(1);
  }
}

const run = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const lines = (value) => value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
const changed = new Set();

try {
  const worktree = lines(run('diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD'));
  const untracked = lines(run('ls-files', '--others', '--exclude-standard'));
  for (const file of [...worktree, ...untracked]) changed.add(file.replaceAll('\\', '/'));

  if (changed.size === 0) {
    let base = process.env.FIELORA_UI_UX_BASE_REF?.trim();
    if (!base) {
      try { base = run('merge-base', 'HEAD', 'origin/main'); } catch { base = 'HEAD^'; }
    }
    for (const file of lines(run('diff', '--name-only', '--diff-filter=ACMRTUXB', base, 'HEAD'))) changed.add(file.replaceAll('\\', '/'));
  }
} catch (error) {
  console.error(`UI/UX documentation sync check could not inspect Git changes: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const uiSystemFile = (file) =>
  file === 'apps/desktop/src/renderer/styles.css'
  || file === 'apps/desktop/src/renderer/UiPrimitives.tsx'
  || file === 'apps/desktop/src/renderer/WorkspaceSurface.tsx'
  || file === 'apps/desktop/src/renderer/ResizableDivider.tsx'
  || file === 'apps/desktop/webpack.renderer.ts'
  || file.startsWith('apps/desktop/src/renderer/styles/')
  || file.startsWith('apps/desktop/src/renderer/ui/');

const systemChanges = [...changed].filter(uiSystemFile);
if (systemChanges.length === 0) {
  console.log('UI_UX_LAYOUT_LOCK: PASS');
  console.log('UI_UX_DOC_SYNC: NOT_APPLICABLE');
  process.exit(0);
}

const canonicalDoc = 'docs/architecture/FIELORA_UI_UX_SYSTEM_V0.1.md';
if (!changed.has(canonicalDoc)) {
  console.error('UI_UX_DOC_SYNC: FAIL');
  console.error(`Changes to the managed UI/UX system require a same-changeset update to ${canonicalDoc}.`);
  for (const file of systemChanges) console.error(`- ${file}`);
  process.exit(1);
}

console.log('UI_UX_LAYOUT_LOCK: PASS');
console.log(`UI_UX_DOC_SYNC: PASS (${systemChanges.length} managed file${systemChanges.length === 1 ? '' : 's'})`);
