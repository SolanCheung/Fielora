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
    CHECK (from_type != to_type OR from_id != to_id),
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
