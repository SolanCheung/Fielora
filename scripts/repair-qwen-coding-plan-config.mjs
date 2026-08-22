import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

if (process.env.FIELORA_REPAIR_QWEN_CODING_PLAN !== 'AUTHORIZED') {
  throw new Error('QWEN_CODING_PLAN_REPAIR_NOT_AUTHORIZED');
}
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error('LOCALAPPDATA_UNAVAILABLE');
const databasePath = path.join(localAppData, 'Fielora', 'data', 'fielora.db');
if (!existsSync(databasePath)) throw new Error('FIELORA_DATABASE_NOT_FOUND');

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA busy_timeout=10000');
const candidates = database.prepare(`
  SELECT id, owner_principal_id, provider_kind, display_name, endpoint_class,
         base_url, default_model, credential_ref, lifecycle_status, revision
  FROM provider_configs
  WHERE lifecycle_status != 'REMOVED' AND lower(default_model) = 'qwen3.7-plus'
`).all();
if (candidates.length !== 1) {
  database.close();
  throw new Error(`EXPECTED_ONE_QWEN_CONFIG_FOUND_${candidates.length}`);
}
const candidate = candidates[0];
if (candidate.lifecycle_status !== 'ACTIVE'
  || candidate.credential_ref !== `Fielora/provider/${candidate.id}`) {
  database.close();
  throw new Error('QWEN_CONFIG_OR_CREDENTIAL_REFERENCE_INVALID');
}

const backups = path.join(localAppData, 'Fielora', 'data', 'backups');
await mkdir(backups, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupPath = path.join(backups, `fielora-before-qwen-coding-plan-repair-${stamp}.db`);
await backup(database, backupPath);

const now = Date.now();
database.exec('BEGIN IMMEDIATE');
try {
  const result = database.prepare(`
    UPDATE provider_configs
    SET provider_kind = 'OPENAI_COMPATIBLE', endpoint_class = 'CUSTOM',
        base_url = 'https://coding.dashscope.aliyuncs.com/v1',
        default_model = 'qwen3.7-plus', custom_endpoint_acknowledged_at = ?,
        revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ? AND lifecycle_status = 'ACTIVE'
  `).run(now, now, candidate.id, candidate.revision);
  if (result.changes !== 1) throw new Error('QWEN_CONFIG_REVISION_CONFLICT');
  database.prepare(`
    INSERT INTO activities(
      id, field_id, actor_principal_id, intent, action, target_type,
      target_id, summary, trace_id, created_at
    ) VALUES(?, NULL, ?, NULL, 'PROVIDER_CONFIG_CODING_PLAN_REPAIRED',
             'PROVIDER_CONFIG', ?, NULL, ?, ?)
  `).run(randomUUID(), candidate.owner_principal_id, candidate.id, randomUUID(), now);
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  database.close();
  throw error;
}

const repaired = database.prepare(`
  SELECT id, provider_kind, endpoint_class, base_url, default_model,
         credential_ref, lifecycle_status, revision
  FROM provider_configs WHERE id = ?
`).get(candidate.id);
console.log(JSON.stringify({
  action: 'QWEN_CODING_PLAN_CONFIG_REPAIRED',
  external_model_requests: 0,
  credential_bytes_read: false,
  credential_reference_preserved: repaired.credential_ref === candidate.credential_ref,
  config_id: repaired.id,
  provider_kind: repaired.provider_kind,
  endpoint_class: repaired.endpoint_class,
  endpoint_host: new URL(repaired.base_url).hostname,
  model_id: repaired.default_model,
  lifecycle_status: repaired.lifecycle_status,
  revision: Number(repaired.revision),
  backup_path: backupPath,
}, null, 2));
database.close();
