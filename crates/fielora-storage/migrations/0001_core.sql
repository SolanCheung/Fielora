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
