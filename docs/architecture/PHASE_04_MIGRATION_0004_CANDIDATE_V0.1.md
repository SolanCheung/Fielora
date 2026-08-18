# Fielora V0.1 Phase 04 Migration 0004 Candidate

状态：`FROZEN / EXACT SQL / APPLIED BY PRODUCT RUNNER / VERIFIED`

版本：V0.1 Frozen

日期：2026-08-16

冻结基线：产品 schema version 为 2；Phase 03 无 durable Browser schema 或 migration。实现结果：产品 runner 已按 exact SQL 应用 0004，当前 schema version 为 4。

本文件冻结 `0004_phase04_entry.sql` 的 exact SQL。用户已授予 Freeze 与独立 Implementation Authorization；实现必须 normalized-byte-for-byte 复制到产品 migration、加入 runner 并将 schema version 推进到 4。

## 1. Version policy

- 0001、0002 永不编辑；
- version `0003` 明确保留为空号，不得以后回填；它记录 Phase 03 “无 durable schema”的边界；
- registry 允许有意的 2→4 跳号，但必须精确包含 `(1, 2, 4)`，不得把跳号解释成缺 migration；
- 0004 成功后 `schema_version()` 才变为 4；
- migration 由 runner 在 `BEGIN IMMEDIATE` transaction 中执行并登记与现有 `frozen_migration_checksum` 一致的 SHA-256：CRLF→LF、移除末尾 LF 后计算；
- upgrade failure 必须完全 rollback，保持 version 2；不得删除、猜测转换或静默重建用户数据。

## 2. Exact candidate SQL

```sql
CREATE TABLE provider_configs (
    id                              TEXT PRIMARY KEY,
    owner_principal_id              TEXT NOT NULL REFERENCES principals(id),
    provider_kind                   TEXT NOT NULL
                                    CHECK (provider_kind IN (
                                      'OPENAI', 'ANTHROPIC', 'OPENAI_COMPATIBLE'
                                    )),
    display_name                    TEXT NOT NULL,
    endpoint_class                  TEXT NOT NULL
                                    CHECK (endpoint_class IN ('OFFICIAL', 'CUSTOM')),
    base_url                        TEXT,
    default_model                   TEXT NOT NULL,
    credential_ref                  TEXT NOT NULL UNIQUE,
    lifecycle_status                TEXT NOT NULL DEFAULT 'DISABLED'
                                    CHECK (lifecycle_status IN (
                                      'ACTIVE', 'DISABLED', 'REMOVED'
                                    )),
    custom_endpoint_acknowledged_at INTEGER,
    revision                        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at                      INTEGER NOT NULL,
    updated_at                      INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    CHECK (
      (provider_kind IN ('OPENAI', 'ANTHROPIC') AND
       endpoint_class = 'OFFICIAL' AND base_url IS NULL AND
       custom_endpoint_acknowledged_at IS NULL) OR
      (provider_kind = 'OPENAI_COMPATIBLE' AND
       endpoint_class = 'CUSTOM' AND base_url IS NOT NULL AND
       custom_endpoint_acknowledged_at IS NOT NULL)
    )
);

CREATE INDEX idx_provider_configs_owner_lifecycle_updated
ON provider_configs(owner_principal_id, lifecycle_status, updated_at DESC, id DESC);

CREATE TABLE captures (
    id                        TEXT PRIMARY KEY,
    owner_principal_id        TEXT NOT NULL REFERENCES principals(id),
    created_by                TEXT NOT NULL REFERENCES principals(id),
    source_activity_id        TEXT NOT NULL REFERENCES activities(id),
    kind                      TEXT NOT NULL
                              CHECK (kind IN (
                                'TEXT', 'PAGE', 'SELECTION',
                                'MODEL_OUTPUT', 'FIELD_EXCERPT'
                              )),
    title                     TEXT NOT NULL,
    content                   TEXT NOT NULL,
    placement_status          TEXT NOT NULL DEFAULT 'INBOX'
                              CHECK (placement_status IN (
                                'INBOX', 'ATTACHED', 'PROMOTED'
                              )),
    lifecycle_status          TEXT NOT NULL DEFAULT 'ACTIVE'
                              CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED')),
    attached_field_id         TEXT REFERENCES fields(id) ON DELETE RESTRICT,
    promoted_as               TEXT CHECK (promoted_as = 'IDEA_CANDIDATE'),
    source_kind               TEXT NOT NULL
                              CHECK (source_kind IN (
                                'USER_INPUT', 'REMOTE_PAGE', 'REMOTE_SELECTION',
                                'MODEL_RESPONSE', 'FIELD_RESOURCE'
                              )),
    source_title              TEXT,
    source_uri                TEXT,
    source_field_id           TEXT REFERENCES fields(id) ON DELETE RESTRICT,
    source_resource_type      TEXT,
    source_resource_id        TEXT,
    source_resource_revision  INTEGER CHECK (
                                source_resource_revision IS NULL OR
                                source_resource_revision >= 1
                              ),
    provider_config_id        TEXT REFERENCES provider_configs(id) ON DELETE RESTRICT,
    provider_model_id         TEXT,
    provider_invocation_id    TEXT,
    source_is_partial         INTEGER NOT NULL DEFAULT 0
                              CHECK (source_is_partial IN (0, 1)),
    revision                  INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    CHECK (
      (placement_status = 'INBOX' AND attached_field_id IS NULL AND promoted_as IS NULL) OR
      (placement_status = 'ATTACHED' AND attached_field_id IS NOT NULL AND promoted_as IS NULL) OR
      (placement_status = 'PROMOTED' AND promoted_as = 'IDEA_CANDIDATE')
    ),
    CHECK (
      (source_kind = 'MODEL_RESPONSE' AND
       provider_config_id IS NOT NULL AND
       provider_model_id IS NOT NULL AND
       provider_invocation_id IS NOT NULL) OR
      (source_kind != 'MODEL_RESPONSE' AND
       provider_config_id IS NULL AND
       provider_model_id IS NULL AND
       provider_invocation_id IS NULL)
    ),
    CHECK (
      (source_kind IN ('REMOTE_PAGE', 'REMOTE_SELECTION') AND source_uri IS NOT NULL) OR
      (source_kind NOT IN ('REMOTE_PAGE', 'REMOTE_SELECTION'))
    ),
    CHECK (
      (source_kind = 'FIELD_RESOURCE' AND
       source_field_id IS NOT NULL AND
       source_resource_type IS NOT NULL AND
       source_resource_id IS NOT NULL AND
       source_resource_revision IS NOT NULL) OR
      (source_kind != 'FIELD_RESOURCE' AND
       source_field_id IS NULL AND
       source_resource_type IS NULL AND
       source_resource_id IS NULL AND
       source_resource_revision IS NULL)
    )
);

CREATE INDEX idx_captures_owner_inbox
ON captures(owner_principal_id, lifecycle_status, placement_status, updated_at DESC, id DESC);

CREATE INDEX idx_captures_attached_field
ON captures(attached_field_id, lifecycle_status, updated_at DESC, id DESC)
WHERE attached_field_id IS NOT NULL;

CREATE INDEX idx_captures_source_field
ON captures(source_field_id, created_at DESC, id DESC)
WHERE source_field_id IS NOT NULL;
```

Candidate SQL frozen-normalized hash（UTF-8、CRLF→LF、移除末尾 LF）：`4d142745b3e9a5ccd8c27f422ecdc888163a575a91b0515f90a1ee6aa0f869ab`。该算法精确沿用现有 Phase 02 `frozen_migration_checksum`；最终产品 migration 必须 normalized-byte-for-byte 匹配。

## 3. Domain validation outside SQL

- UUIDv7 canonical parsing、owner/actor/source Activity ownership；
- display name/model/title/content/URI 长度和空白规范；
- official/custom endpoint policy、DNS/IP classification、redirect deny；
- Credential Manager target format 和 credential existence；
- Capture content/source immutable；placement/lifecycle transition matrix；
- PAGE/SELECTION 只接受 credential-free HTTP(S) URI；
- `MODEL_OUTPUT` 只接受已完成 invocation；用户明确保存 partial stream 时必须为 `TEXT + MODEL_RESPONSE provenance + source_is_partial = 1`；
- FIELD_RESOURCE endpoint 存在、同一 principal、revision 精确；
- attach/promote 与 Field revision/Activity 原子事务；
- Provider tombstone/credential deletion reconciliation。

## 4. Required schema validation

schema version 4 startup 至少核验：

- 0001、0002、0004 registry name/checksum 精确匹配，0003 明确 absent；
- 两张新表的 columns、NOT NULL、FK、CHECK；
- provider credential_ref unique；
- 三个 Capture query indexes 与 Provider index；
- `PRAGMA foreign_key_check` 为空；
- 不存在 credential bytes、prompt/response blob 或 Provider session table；
- Phase 01/02 frozen tables、indexes 与 constraints 全部保持。

## 5. Required bounded probe

Freeze 前在临时 DB 证明：fresh 0001→0002→0004、真实 version 2 fixture→4、重复 startup idempotence、tampered checksum fail-closed、incompatible data full rollback、FK/index/query plan、2→4 intentional gap。Probe 只生成 Evidence，不成为产品 migration 实现。
