# Fielora V0.1 Schema Freeze

状态：FROZEN / APPROVED（含 Phase 02 Migration 0002 Frozen Spec）

版本：V0.1

日期：2026-08-14

## 1. Freeze 规则

- Domain 语义可以先完整定义；物理 schema 只随真实 Phase 增长；
- 不建立万能 `resources(type, json)` EAV 表；
- 重要 Aggregate 独立建表；
- Relation 构建 Work Lineage；
- Activity、Evidence、Verification 分离；
- Capability Invocation/Policy/Result 在 Domain 语义中分离，在 V0.1 Persistence 收敛为 `capability_executions`；
- Migration 一经发布不可修改，checksum mismatch 必须阻止启动；
- 本文件精确冻结 Phase 01 Migration 0001；后续表只冻结职责、名称和 Phase，实际 columns/constraints 在对应 Phase 开工前冻结。
- Phase 02 不新增最终业务表；其 Frozen Migration 0002 只重建并收紧 `field_state_entries`、`field_objects`、`field_relations` 与相关 indexes，精确 SQL 见 `PHASE_02_MIGRATION_0002_V0.1.md`。Migration 0002 已按 Frozen spec 实现、应用并通过正常升级、incompatible-data rollback、Engineering/Desktop/Packaged/Portable 验证；0001 保持不变。

## 2. Storage primitives

- ID：UUIDv7 canonical string / SQLite `TEXT`；
- time：UTC Unix milliseconds / SQLite `INTEGER`；
- booleans：SQLite `INTEGER` 0/1；
- structured values：canonical JSON text，由 Domain/Repository 校验；
- revision：`INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)`；
- enum：uppercase stable wire name + SQL `CHECK`；
- object identity 与 device locator 分离。

## 3. Phase 01 Migration 0001

Runner 首先用固定 DDL bootstrap `schema_migrations` metadata table；它不属于编号 migration。其余 SQL 位于 `crates/fielora-storage/migrations/0001_core.sql` 并编译进 `fielora-core`。

```sql
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    checksum    TEXT NOT NULL,
    applied_at  INTEGER NOT NULL
);

CREATE TABLE principals (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL
                  CHECK (kind IN ('LOCAL_USER', 'AGENT', 'SYSTEM')),
    display_name  TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX uq_principals_local_user
ON principals(kind)
WHERE kind = 'LOCAL_USER';

CREATE UNIQUE INDEX uq_principals_system
ON principals(kind)
WHERE kind = 'SYSTEM';

CREATE TABLE fields (
    id                  TEXT PRIMARY KEY,
    owner_principal_id  TEXT NOT NULL REFERENCES principals(id),
    title               TEXT NOT NULL,
    goal                TEXT,
    lifecycle_status    TEXT NOT NULL
                        CHECK (lifecycle_status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
    current_mode        TEXT
                        CHECK (
                          current_mode IS NULL OR
                          current_mode IN ('EXPLORE', 'THINK', 'BUILD', 'OPERATE', 'VERIFY')
                        ),
    current_focus_json  TEXT,
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);

CREATE TABLE activities (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT REFERENCES fields(id) ON DELETE CASCADE,
    actor_principal_id  TEXT NOT NULL REFERENCES principals(id),
    intent              TEXT,
    action              TEXT NOT NULL,
    target_type         TEXT,
    target_id           TEXT,
    summary             TEXT,
    trace_id            TEXT NOT NULL,
    created_at          INTEGER NOT NULL
);

CREATE TABLE field_state_entries (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL
                        CHECK (
                          kind IN (
                            'FACT', 'DECISION', 'ASSUMPTION', 'QUESTION',
                            'TASK', 'BLOCKER', 'RESULT'
                          )
                        ),
    content             TEXT NOT NULL,
    status              TEXT,
    confidence          REAL CHECK (
                          confidence IS NULL OR
                          (confidence >= 0.0 AND confidence <= 1.0)
                        ),
    created_by          TEXT NOT NULL REFERENCES principals(id),
    source_activity_id  TEXT REFERENCES activities(id) ON DELETE SET NULL,
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);

CREATE TABLE field_objects (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    owner_principal_id  TEXT NOT NULL REFERENCES principals(id),
    object_kind         TEXT NOT NULL,
    title               TEXT,
    external_ref_type   TEXT,
    external_ref_id     TEXT,
    metadata_json       TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);

CREATE TABLE field_relations (
    id             TEXT PRIMARY KEY,
    field_id       TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    from_type      TEXT NOT NULL,
    from_id        TEXT NOT NULL,
    relation_type  TEXT NOT NULL,
    to_type        TEXT NOT NULL,
    to_id          TEXT NOT NULL,
    created_by     TEXT NOT NULL REFERENCES principals(id),
    created_at     INTEGER NOT NULL
);

CREATE TABLE devices (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    platform      TEXT NOT NULL,
    architecture  TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
);

CREATE TABLE device_bindings (
    id             TEXT PRIMARY KEY,
    device_id      TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    object_id      TEXT NOT NULL,
    binding_kind   TEXT NOT NULL,
    local_locator  TEXT NOT NULL,
    metadata_json  TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    UNIQUE(device_id, object_id, binding_kind)
);

CREATE TABLE surface_snapshots (
    id                       TEXT PRIMARY KEY,
    field_id                 TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    device_id                TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    observed_field_revision  INTEGER NOT NULL CHECK (observed_field_revision >= 1),
    layout_json              TEXT NOT NULL,
    open_objects_json        TEXT NOT NULL,
    created_at               INTEGER NOT NULL
);

CREATE INDEX idx_fields_lifecycle_updated
ON fields(lifecycle_status, updated_at DESC);

CREATE INDEX idx_state_field_kind
ON field_state_entries(field_id, kind);

CREATE INDEX idx_objects_field
ON field_objects(field_id);

CREATE INDEX idx_relations_field
ON field_relations(field_id);

CREATE INDEX idx_relations_from
ON field_relations(from_type, from_id);

CREATE INDEX idx_relations_to
ON field_relations(to_type, to_id);

CREATE INDEX idx_activities_field_created
ON activities(field_id, created_at DESC);

CREATE INDEX idx_snapshots_field_device_created
ON surface_snapshots(field_id, device_id, created_at DESC);
```

## 4. Phase 01 Domain constraints outside SQL

以下由 Rust Domain/Repository 强制，并进入测试：

- canonical UUIDv7 parse；
- title trim 后 1–120 Unicode scalar values；
- goal 最多 4000；
- JSON parse 与 DTO schema；
- created_at ≤ updated_at；
- generic relation endpoint 存在且属于允许的 Domain type；
- DeviceBinding object_id 指向稳定 Object identity，而非 path；
- SurfaceSnapshot 的 device_id 只能由 Core 当前 DeviceIdentity 决定；
- snapshot observed revision 必须来自读取时 Field revision；
- per Field/Device 最近最多 10 个 snapshots；
- Field create/update Reality 与 Activity 同 transaction；
- Domain Event 在 commit 后发布。

## 5. Bootstrap records

首次打开 DB：

- 从 installation-local config 获取/生成 Device UUIDv7；
- 确保唯一 LOCAL_USER Principal；
- 确保唯一 SYSTEM Principal；
- upsert 当前 Device；
- 不使用固定 `user_id=1`、computer name、SID 或 MAC 作为 identity。

Bootstrap 必须幂等。

## 6. Phase growth map

| Phase | 表 | 冻结深度 |
|---|---|---|
| 01 | bootstrap: schema_migrations；0001: principals, fields, field_state_entries, field_objects, field_relations, activities, devices, device_bindings, surface_snapshots | 本文件精确冻结 |
| 02 | 无新增最终业务表；0002 重建/收紧 field_state_entries, field_objects, field_relations 与 indexes | `PHASE_02_MIGRATION_0002_V0.1.md` 精确冻结；已实现并验收 |
| 04 | captures | 表职责/名称冻结；Phase 04 冻结 columns |
| 05 | requirements, acceptance_criteria, project_realities, evidence | 表职责/名称冻结；Phase 05 冻结 columns |
| 06 | development_tasks, coding_sessions, change_sets | 表职责/名称冻结；Phase 06 冻结 columns |
| 08 | capabilities, capability_executions, verification_results, verification_checks | 表职责/名称冻结；Phase 08 冻结 columns |
| 10 | library_objects | 表职责/名称冻结；Phase 10 冻结 columns |

每个 Phase 只能以新 migration 前进，不能编辑 0001。

## 7. Future table intent

### captures

保存 owner、content/kind、source、context、INBOX/ATTACHED/PROMOTED/ARCHIVED 与时间。

### requirements / acceptance_criteria

Requirement 保存 field、goal/description、confirmation、revision；criterion 独立保存状态。Evidence 通过 Relation 关联。

### project_realities

保存 project object、scanner version/fingerprint、facts/summary、revision；source 通过 Relation/Evidence 追溯。

### development_tasks / coding_sessions / change_sets

Task 持久化三轴状态、project/device binding、policy/budget；Session 保存 provider opaque resume；ChangeSet 保存 baseline、diff artifact 与 changed file summary。

### capabilities / capability_executions

Capability 保存 descriptor registry；Execution 持久化 invocation scope、policy summary、status/output/side effects/rollback/trace。详细 high-risk approval 进入 Activity/Evidence。

### verification_results / verification_checks

Result 保存 target、verdict、authority、summary；checks 保存 method、required、observed、verdict。Passed 必须通过 Relation 关联 Evidence。

### library_objects

保存 owner、kind/title、source/artifact、reason saved 与 metadata；不提前构建知识图谱。

## 8. Deferred physical schema

当前 V0.1 P0 明确不建：

```text
capability_acquisitions
mandates
users / accounts / organizations
remote_users / contacts / messages / field_invites
access_control_lists / role_permissions
capability_marketplace / reviews / publisher_reputation
license_registry
workflow_definitions / workflow_steps
agent_memories
sync_events / sync_conflicts / cloud_objects
multi_agent_tasks
```

Acquisition/Mandate Draft 保留 Contract 研究价值，但不改变当前 P0 schema。

## 9. Open schema decisions

不阻塞当前 Frozen Phase 01/02：

- Evidence artifact store 的文件布局、hash algorithm 与 retention；
- later-phase JSON normalization thresholds；
- credential metadata（secret 本身绝不进普通 DB row）；
- backup/export/sync schema；
- future Exchange ID namespace 与 access inheritance；
- DB at-rest encryption 是否在敏感数据进入前启用。

这些必须在对应 Phase 进入前评审，不能在 Phase 01 猜测性建表。
