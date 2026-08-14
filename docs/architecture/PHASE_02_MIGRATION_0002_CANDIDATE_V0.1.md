# Fielora Phase 02 Migration 0002 Candidate

状态：CANDIDATE / NOT FROZEN / NOT APPLIED

版本：V0.1

日期：2026-08-14

基线：Migration 0001 checksum 保持不变

本文件精确描述候选 `0002_phase02_reality.sql`。它不是产品 migration 文件，本轮不得复制到 `crates/fielora-storage/migrations/`、不得执行或推进 schema version。

## 1. Migration policy

- 0001 永不编辑；
- 最终 schema version 从 1 变为 2；
- runner 按 version 顺序执行 compile-time embedded migrations 并核验 checksum；
- 0002 在一个 `BEGIN IMMEDIATE` transaction 中完成；
- runner 已开启 `PRAGMA foreign_keys = ON`；
- supported Phase 01 产品不会写 State/Object/Relation，因此正常升级为空表；
- 若 DB 含不满足新约束的非空 legacy rows，INSERT/constraint 必须使整个 migration 回滚并返回 `MIGRATION_INCOMPATIBLE_DATA`，不得删除、猜测转换或静默降级；
- transient `_v2` tables 不改变“Phase 02 不新增最终业务表”的裁决。

## 2. Exact SQL candidate

```sql
CREATE TABLE field_state_entries_v2 (
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
    status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                          status IN ('ACTIVE', 'RESOLVED', 'SUPERSEDED', 'RETRACTED')
                        ),
    confidence          REAL CHECK (
                          confidence IS NULL OR
                          (confidence >= 0.0 AND confidence <= 1.0)
                        ),
    created_by          TEXT NOT NULL REFERENCES principals(id),
    source_activity_id  TEXT NOT NULL REFERENCES activities(id),
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    CHECK (
      status != 'RESOLVED' OR
      kind IN ('QUESTION', 'TASK', 'BLOCKER')
    )
);

INSERT INTO field_state_entries_v2 (
    id, field_id, kind, content, status, confidence, created_by,
    source_activity_id, revision, created_at, updated_at
)
SELECT
    id, field_id, kind, content, COALESCE(status, 'ACTIVE'), confidence, created_by,
    source_activity_id, revision, created_at, updated_at
FROM field_state_entries;

DROP TABLE field_state_entries;
ALTER TABLE field_state_entries_v2 RENAME TO field_state_entries;

CREATE INDEX idx_state_field_kind
ON field_state_entries(field_id, kind);

CREATE INDEX idx_state_field_status_updated
ON field_state_entries(field_id, status, updated_at DESC, id DESC);

CREATE TABLE field_objects_v2 (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    owner_principal_id  TEXT NOT NULL REFERENCES principals(id),
    created_by          TEXT NOT NULL REFERENCES principals(id),
    source_activity_id  TEXT NOT NULL REFERENCES activities(id),
    object_kind         TEXT NOT NULL
                        CHECK (object_kind = 'REFERENCE'),
    title               TEXT NOT NULL,
    external_ref_type   TEXT NOT NULL
                        CHECK (external_ref_type = 'HTTPS_URL'),
    external_ref_id     TEXT NOT NULL,
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    lifecycle_status    TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED')),
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    CHECK (created_at <= updated_at)
);

INSERT INTO field_objects_v2 (
    id, field_id, owner_principal_id, created_by, source_activity_id, object_kind, title,
    external_ref_type, external_ref_id, metadata_json, lifecycle_status,
    revision, created_at, updated_at
)
SELECT
    id, field_id, owner_principal_id, owner_principal_id, NULL, object_kind, title,
    external_ref_type, external_ref_id, COALESCE(metadata_json, '{}'), 'ACTIVE',
    1, created_at, updated_at
FROM field_objects;

DROP TABLE field_objects;
ALTER TABLE field_objects_v2 RENAME TO field_objects;

CREATE INDEX idx_objects_field
ON field_objects(field_id);

CREATE INDEX idx_objects_field_lifecycle_updated
ON field_objects(field_id, lifecycle_status, updated_at DESC, id DESC);

CREATE UNIQUE INDEX uq_active_reference_per_field
ON field_objects(field_id, external_ref_type, external_ref_id)
WHERE object_kind = 'REFERENCE' AND lifecycle_status = 'ACTIVE';

CREATE TABLE field_relations_v2 (
    id                TEXT PRIMARY KEY,
    field_id          TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    from_type         TEXT NOT NULL,
    from_id           TEXT NOT NULL,
    relation_type     TEXT NOT NULL
                      CHECK (relation_type IN ('SOURCED_FROM', 'SUPERSEDED_BY')),
    to_type           TEXT NOT NULL,
    to_id             TEXT NOT NULL,
    lifecycle_status  TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (lifecycle_status IN ('ACTIVE', 'RETRACTED')),
    created_by        TEXT NOT NULL REFERENCES principals(id),
    revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    CHECK (from_id != to_id),
    CHECK (
      (relation_type = 'SOURCED_FROM' AND from_type = 'STATE' AND to_type = 'OBJECT') OR
      (relation_type = 'SUPERSEDED_BY' AND from_type = 'STATE' AND to_type = 'STATE')
    )
);

INSERT INTO field_relations_v2 (
    id, field_id, from_type, from_id, relation_type, to_type, to_id,
    lifecycle_status, created_by, revision, created_at, updated_at
)
SELECT
    id, field_id, from_type, from_id, relation_type, to_type, to_id,
    'ACTIVE', created_by, 1, created_at, created_at
FROM field_relations;

DROP TABLE field_relations;
ALTER TABLE field_relations_v2 RENAME TO field_relations;

CREATE INDEX idx_relations_field
ON field_relations(field_id);

CREATE INDEX idx_relations_from
ON field_relations(from_type, from_id);

CREATE INDEX idx_relations_to
ON field_relations(to_type, to_id);

CREATE INDEX idx_relations_field_lifecycle_created
ON field_relations(field_id, lifecycle_status, created_at DESC, id DESC);

CREATE UNIQUE INDEX uq_active_relation_tuple
ON field_relations(
    field_id, relation_type, from_type, from_id, to_type, to_id
)
WHERE lifecycle_status = 'ACTIVE';

DROP INDEX idx_activities_field_created;

CREATE INDEX idx_activities_field_created
ON activities(field_id, created_at DESC, id DESC);
```

## 3. Required Domain constraints outside SQL

SQLite CHECK 不替代 Domain validation：

- UUIDv7 canonical parsing；
- State content/confidence/transition matrix；
- source_activity_id 必须是本次创建 Activity 且属于同一 Field transaction；
- REFERENCE title、canonical HTTPS URL、no credentials、metadata exactly `{}`；
- archive REFERENCE 原子清除 typed focus 并 retract 指向它的 active SOURCED_FROM；
- Relation endpoint 存在、同一 Field、target lifecycle、same-kind supersede、no cycle；
- SUPERSEDED_BY 不可 retract；
- 所有 mutation 同 transaction 递增 Field aggregate revision；
- Event post-commit；
- snapshot open objects 从 typed layout 推导；
- Resume read-only。

## 4. Required schema validation after migration

Storage startup 不得继续只检查 table names。Schema version 2 至少核验：

- `field_state_entries.status/source_activity_id` 的 NOT NULL 与 status/kind CHECK；
- `field_objects.created_by/source_activity_id/lifecycle_status/revision`；
- `field_relations.lifecycle_status/revision/updated_at`；
- 三个 `_lifecycle_`/`_status_` query indexes；
- 两个 partial unique indexes；
- Activity composite keyset index；
- `PRAGMA foreign_key_check` 返回空；
- `schema_migrations` 中 0001 与 0002 name/checksum 精确匹配 compiled registry。

## 5. No-schema-change decisions

- `fields` 不新增 aggregate revision column；继续使用现有 `revision`，只冻结其语义；
- `activities` 不增加 payload/before/after/evidence JSON；
- `surface_snapshots` 不改 columns；V1 typed JSON 写入现有 layout/open_objects columns；
- `devices`、`device_bindings` 不变；Phase 02 REFERENCE 不建立 device binding；
- 不新增 State history、object metadata、relation graph、memory、agent、browser、provider 或 resume cache tables；
- 不建立万能 resources/EAV 表。

## 6. Candidate issue discovered

0001 的 `field_state_entries.source_activity_id` 允许 NULL 和 `ON DELETE SET NULL`；0002 candidate 将其变为 NOT NULL 且默认 restrictive FK，以满足 State creation provenance。现有 Activity 是 append-only，不存在合法删除路径，因此语义一致。

若后续确认需要删除 Activity，该需求与此 candidate 冲突，必须在实现前重新设计；Phase 02 不接受通过恢复 nullable 或把 provenance 塞入 JSON 解决。
