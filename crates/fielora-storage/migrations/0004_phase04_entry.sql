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
