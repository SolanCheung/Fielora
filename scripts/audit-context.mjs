import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "..");
const manifestPath = resolve(repoRoot, "context_manifest.json");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function resolveRepoPath(manifestRelativePath) {
  if (isAbsolute(manifestRelativePath)) {
    throw new Error(`manifest path must be relative: ${manifestRelativePath}`);
  }

  const absolutePath = resolve(repoRoot, manifestRelativePath);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`manifest path escapes repository: ${manifestRelativePath}`);
  }
  return absolutePath;
}

const errors = [];
let manifest;

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`CONTEXT_MANIFEST_AUDIT=FAIL parse_error=${error.message}`);
  process.exit(1);
}

if (!manifest.files || typeof manifest.files !== "object") {
  errors.push("manifest.files must be an object");
}
if (!Array.isArray(manifest.required_reading)) {
  errors.push("manifest.required_reading must be an array");
}

for (const [manifestRelativePath, expected] of Object.entries(manifest.files ?? {})) {
  try {
    const absolutePath = resolveRepoPath(manifestRelativePath);
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      errors.push(`not a file: ${manifestRelativePath}`);
      continue;
    }

    const bytes = readFileSync(absolutePath);
    const actualHash = sha256(bytes);
    if (bytes.length !== expected.bytes || actualHash !== expected.sha256) {
      errors.push(
        `mismatch: ${manifestRelativePath} expected=${expected.bytes}/${expected.sha256} actual=${bytes.length}/${actualHash}`,
      );
    }
  } catch (error) {
    errors.push(`unreadable: ${manifestRelativePath} (${error.message})`);
  }
}

for (const requiredPath of manifest.required_reading ?? []) {
  if (!Object.hasOwn(manifest.files ?? {}, requiredPath)) {
    errors.push(`required reading has no manifest entry: ${requiredPath}`);
  }
}

if (new Set(manifest.required_reading ?? []).size !== (manifest.required_reading ?? []).length) {
  errors.push("manifest.required_reading contains duplicates");
}

if (errors.length > 0) {
  console.error(
    `CONTEXT_MANIFEST_AUDIT=FAIL files=${Object.keys(manifest.files ?? {}).length} required=${manifest.required_reading?.length ?? 0}`,
  );
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `CONTEXT_MANIFEST_AUDIT=PASS files=${Object.keys(manifest.files).length} required=${manifest.required_reading.length}`,
);
