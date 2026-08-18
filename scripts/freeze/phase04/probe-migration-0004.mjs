// Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration0001 = readFileSync(
  new URL("../../../crates/fielora-storage/migrations/0001_core.sql", import.meta.url),
  "utf8",
);
const migration0002 = readFileSync(
  new URL("../../../crates/fielora-storage/migrations/0002_phase02_reality.sql", import.meta.url),
  "utf8",
);
const candidateDocument = readFileSync(
  new URL("../../../docs/architecture/PHASE_04_MIGRATION_0004_CANDIDATE_V0.1.md", import.meta.url),
  "utf8",
);

const sqlMatch = candidateDocument.match(/```sql\r?\n([\s\S]*?)```/);
if (!sqlMatch) {
  throw new Error("Migration 0004 SQL fence not found");
}

const migration0004 = sqlMatch[1].replace(/\r\n/g, "\n").replace(/\n+$/, "");
const sha256 = createHash("sha256").update(migration0004).digest("hex");
const expectedSha256 = "4d142745b3e9a5ccd8c27f422ecdc888163a575a91b0515f90a1ee6aa0f869ab";
if (sha256 !== expectedSha256) {
  throw new Error(`Migration 0004 hash mismatch: ${sha256}`);
}

function rawChecksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function frozenChecksum(sql) {
  return rawChecksum(sql.replace(/\r\n/g, "\n").replace(/\n+$/, ""));
}

const registry = [
  { version: 1, name: "core", sql: migration0001, checksum: rawChecksum(migration0001) },
  {
    version: 2,
    name: "phase02_reality",
    sql: migration0002,
    checksum: frozenChecksum(migration0002),
  },
  { version: 4, name: "phase04_entry", sql: migration0004, checksum: sha256 },
];

function initializeRegistry(database) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

function applyMigration(database, migration) {
  const existing = database
    .prepare("SELECT name, checksum FROM schema_migrations WHERE version = ?")
    .get(migration.version);
  if (existing) {
    if (existing.name !== migration.name || existing.checksum !== migration.checksum) {
      throw new Error(`Migration ${migration.version} registry mismatch`);
    }
    return;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(migration.sql);
    database
      .prepare(
        "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
      )
      .run(migration.version, migration.name, migration.checksum, 1_776_326_400);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function applyRegistry(database, migrations = registry) {
  initializeRegistry(database);
  for (const migration of migrations) {
    applyMigration(database, migration);
  }
}

function versions(database) {
  return database
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map(({ version }) => version);
}

function validateVersion4(database) {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
    .all("table")
    .map(({ name }) => name);
  const indexes = database
    .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
    .all("index")
    .map(({ name }) => name);
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all();
  const captureColumns = database.prepare("PRAGMA table_info(captures)").all();
  const providerColumns = database.prepare("PRAGMA table_info(provider_configs)").all();
  for (const requiredTable of ["provider_configs", "captures"]) {
    if (!tables.includes(requiredTable)) throw new Error(`Missing table: ${requiredTable}`);
  }
  for (const requiredIndex of [
    "idx_provider_configs_owner_lifecycle_updated",
    "idx_captures_owner_inbox",
    "idx_captures_attached_field",
    "idx_captures_source_field",
  ]) {
    if (!indexes.includes(requiredIndex)) throw new Error(`Missing index: ${requiredIndex}`);
  }
  if (foreignKeyErrors.length > 0) {
    throw new Error(`Foreign key errors: ${JSON.stringify(foreignKeyErrors)}`);
  }
  if (captureColumns.length !== 25 || providerColumns.length !== 13) {
    throw new Error(
      `Unexpected column counts: captures=${captureColumns.length}, provider_configs=${providerColumns.length}`,
    );
  }
  const queryPlan = database
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM captures WHERE owner_principal_id = ? AND lifecycle_status = ? AND placement_status = ? ORDER BY updated_at DESC, id DESC",
    )
    .all("probe", "ACTIVE", "INBOX")
    .map(({ detail }) => detail)
    .join(" ");
  if (!queryPlan.includes("idx_captures_owner_inbox")) {
    throw new Error(`Inbox query does not use expected index: ${queryPlan}`);
  }
  return { captureColumns: captureColumns.length, providerColumns: providerColumns.length };
}

const fresh = new DatabaseSync(":memory:");
applyRegistry(fresh);
const freshSchema = validateVersion4(fresh);
if (JSON.stringify(versions(fresh)) !== JSON.stringify([1, 2, 4])) {
  throw new Error(`Fresh sequence mismatch: ${JSON.stringify(versions(fresh))}`);
}

const upgrade = new DatabaseSync(":memory:");
applyRegistry(upgrade, registry.slice(0, 2));
if (JSON.stringify(versions(upgrade)) !== JSON.stringify([1, 2])) {
  throw new Error("Version 2 fixture setup failed");
}
applyMigration(upgrade, registry[2]);
validateVersion4(upgrade);
applyRegistry(upgrade);
if (JSON.stringify(versions(upgrade)) !== JSON.stringify([1, 2, 4])) {
  throw new Error("Upgrade/idempotence sequence mismatch");
}

const tampered = new DatabaseSync(":memory:");
applyRegistry(tampered);
tampered
  .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 4")
  .run("0".repeat(64));
let tamperRejected = false;
try {
  applyRegistry(tampered);
} catch {
  tamperRejected = true;
}
if (!tamperRejected) throw new Error("Tampered checksum was not rejected");

const rollback = new DatabaseSync(":memory:");
applyRegistry(rollback, registry.slice(0, 2));
rollback.exec("CREATE TABLE provider_configs (sentinel INTEGER NOT NULL)");
let failureRolledBack = false;
try {
  applyMigration(rollback, registry[2]);
} catch {
  const captureExists = rollback
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = ? AND name = ?")
    .get("table", "captures").count;
  const version4Exists = rollback
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 4")
    .get().count;
  const sentinelColumns = rollback.prepare("PRAGMA table_info(provider_configs)").all();
  failureRolledBack =
    captureExists === 0 && version4Exists === 0 && sentinelColumns[0]?.name === "sentinel";
}
if (!failureRolledBack) throw new Error("Failed migration did not roll back atomically");

console.log(
  JSON.stringify(
    {
      result: "PASS",
      candidateSha256: sha256,
      frozenNormalizedBytes: Buffer.byteLength(migration0004),
      migrationSequence: [1, 2, 4],
      intentionalGapAccepted: true,
      freshInstall: "PASS",
      version2Upgrade: "PASS",
      idempotentReopen: "PASS",
      checksumTamperRejected: tamperRejected,
      failedMigrationRollback: failureRolledBack,
      queryPlanIndex: "idx_captures_owner_inbox",
      ...freshSchema,
      foreignKeyErrors: 0,
      note: "Bounded in-memory candidate-runner probe; product runner remains unchanged.",
    },
    null,
    2,
  ),
);
