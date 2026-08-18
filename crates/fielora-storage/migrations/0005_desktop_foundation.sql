CREATE TABLE conversations (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    provider_config_id  TEXT REFERENCES provider_configs(id) ON DELETE SET NULL,
    model_id            TEXT,
    lifecycle_status    TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED')),
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    CHECK (length(title) BETWEEN 1 AND 120),
    CHECK (model_id IS NULL OR length(model_id) BETWEEN 1 AND 256),
    CHECK (created_at <= updated_at)
);

CREATE INDEX idx_conversations_field_lifecycle_updated
ON conversations(field_id, lifecycle_status, updated_at DESC, id DESC);

CREATE TABLE conversation_messages (
    id                  TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
    content             TEXT NOT NULL,
    status              TEXT NOT NULL
                        CHECK (status IN ('COMPLETED', 'CANCELLED', 'FAILED')),
    provider_config_id  TEXT REFERENCES provider_configs(id) ON DELETE SET NULL,
    model_id            TEXT,
    invocation_id       TEXT,
    created_at          INTEGER NOT NULL,
    CHECK (length(content) BETWEEN 1 AND 1048576),
    CHECK (model_id IS NULL OR length(model_id) BETWEEN 1 AND 256),
    CHECK (
      (role = 'USER' AND provider_config_id IS NULL AND model_id IS NULL AND invocation_id IS NULL) OR
      role = 'ASSISTANT'
    )
);

CREATE INDEX idx_conversation_messages_conversation_created
ON conversation_messages(conversation_id, created_at ASC, id ASC);

CREATE UNIQUE INDEX uq_conversation_message_invocation
ON conversation_messages(invocation_id)
WHERE invocation_id IS NOT NULL;
