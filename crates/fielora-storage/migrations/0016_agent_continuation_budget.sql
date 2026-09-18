-- Preserve durable AgentRun identity while allowing explicit continuation grants.
CREATE TABLE agent_runs_v16 (
    id                  TEXT PRIMARY KEY,
    field_id            TEXT NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    provider_config_id  TEXT NOT NULL REFERENCES provider_configs(id) ON DELETE RESTRICT,
    model_id            TEXT NOT NULL,
    task                TEXT NOT NULL,
    permission          TEXT NOT NULL
                        CHECK (permission IN ('READ_ONLY', 'REVIEW_CHANGES', 'FULL_CONTROL')),
    status              TEXT NOT NULL
                        CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    current_step        INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
    max_steps           INTEGER NOT NULL CHECK (max_steps BETWEEN 1 AND 4096),
    next_sequence       INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
    error_code          TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    finished_at         INTEGER,
    CHECK (length(model_id) BETWEEN 1 AND 256),
    CHECK (length(task) BETWEEN 1 AND 32768),
    CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 128),
    CHECK (created_at <= updated_at),
    CHECK (finished_at IS NULL OR finished_at >= created_at)
);

INSERT INTO agent_runs_v16 SELECT * FROM agent_runs;
DROP TABLE agent_runs;
ALTER TABLE agent_runs_v16 RENAME TO agent_runs;

CREATE INDEX idx_agent_runs_conversation_updated
ON agent_runs(conversation_id, updated_at DESC, id DESC);

CREATE INDEX idx_agent_runs_status_updated
ON agent_runs(status, updated_at ASC, id ASC);

