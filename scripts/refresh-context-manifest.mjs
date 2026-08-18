import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'context_manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const relativePath of manifest.required_reading) {
  if (!Object.hasOwn(manifest.files, relativePath)) manifest.files[relativePath] = {};
}
for (const relativePath of Object.keys(manifest.files)) {
  const bytes = await readFile(path.join(root, relativePath));
  manifest.files[relativePath] = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
  };
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Refreshed ${Object.keys(manifest.files).length} context manifest entries.`);
