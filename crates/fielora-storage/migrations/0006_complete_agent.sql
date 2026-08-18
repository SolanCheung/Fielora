CREATE TABLE agent_runs (
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
    max_steps           INTEGER NOT NULL CHECK (max_steps BETWEEN 1 AND 64),
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

CREATE INDEX idx_agent_runs_conversation_updated
ON agent_runs(conversation_id, updated_at DESC, id DESC);

CREATE INDEX idx_agent_runs_status_updated
ON agent_runs(status, updated_at ASC, id ASC);

CREATE TABLE agent_events (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
    sequence        INTEGER NOT NULL CHECK (sequence >= 1),
    schema_version  INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    kind            TEXT NOT NULL,
    payload_json    TEXT NOT NULL CHECK (json_valid(payload_json)),
    created_at      INTEGER NOT NULL,
    UNIQUE (run_id, sequence),
    CHECK (length(kind) BETWEEN 1 AND 64),
    CHECK (length(payload_json) <= 1048576)
);

CREATE INDEX idx_agent_events_run_sequence
ON agent_events(run_id, sequence ASC);

CREATE TRIGGER agent_events_immutable_update
BEFORE UPDATE ON agent_events
BEGIN
    SELECT RAISE(ABORT, 'AGENT_EVENT_IMMUTABLE');
END;

CREATE TRIGGER agent_events_immutable_delete
BEFORE DELETE ON agent_events
BEGIN
    SELECT RAISE(ABORT, 'AGENT_EVENT_IMMUTABLE');
END;

CREATE TABLE agent_tool_calls (
    id                  TEXT PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    effect              TEXT NOT NULL
                        CHECK (effect IN ('OBSERVE', 'WORKSPACE_WRITE', 'PROCESS', 'NETWORK', 'DESTRUCTIVE')),
    status              TEXT NOT NULL
                        CHECK (status IN ('PROPOSED', 'WAITING_APPROVAL', 'RUNNING', 'COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'UNKNOWN')),
    policy_decision     TEXT NOT NULL CHECK (policy_decision IN ('ALLOW', 'ASK', 'DENY')),
    arguments_json      TEXT NOT NULL CHECK (json_valid(arguments_json)),
    receipt_json        TEXT CHECK (receipt_json IS NULL OR json_valid(receipt_json)),
    error_code          TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    finished_at         INTEGER,
    CHECK (length(name) BETWEEN 1 AND 128),
    CHECK (length(arguments_json) <= 1048576),
    CHECK (receipt_json IS NULL OR length(receipt_json) <= 1048576),
    CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 128),
    CHECK (created_at <= updated_at),
    CHECK (finished_at IS NULL OR finished_at >= created_at)
);

CREATE INDEX idx_agent_tool_calls_run_created
ON agent_tool_calls(run_id, created_at ASC, id ASC);

CREATE TABLE agent_approvals (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
    tool_call_id    TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    decision        TEXT CHECK (decision IS NULL OR decision IN ('ALLOW_ONCE', 'DENY')),
    nonce           TEXT NOT NULL UNIQUE,
    created_at      INTEGER NOT NULL,
    resolved_at     INTEGER,
    CHECK (length(nonce) BETWEEN 32 AND 128),
    CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

CREATE INDEX idx_agent_approvals_run_unresolved
ON agent_approvals(run_id, created_at ASC)
WHERE decision IS NULL;

CREATE TABLE agent_context_snapshots (
    id                  TEXT PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
    step                INTEGER NOT NULL CHECK (step >= 0),
    project_root_hash   TEXT NOT NULL,
    selected_files      INTEGER NOT NULL CHECK (selected_files >= 0),
    estimated_tokens    INTEGER NOT NULL CHECK (estimated_tokens >= 0),
    content_sha256      TEXT NOT NULL,
    manifest_json       TEXT NOT NULL CHECK (json_valid(manifest_json)),
    created_at          INTEGER NOT NULL,
    UNIQUE (run_id, step),
    CHECK (length(project_root_hash) = 64),
    CHECK (length(content_sha256) = 64),
    CHECK (length(manifest_json) <= 1048576)
);

CREATE TABLE agent_verification_receipts (
    id                  TEXT PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
    tool_call_id        TEXT REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    check_kind          TEXT NOT NULL,
    outcome             TEXT NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'BLOCKED', 'NOT_RUN')),
    summary             TEXT NOT NULL,
    artifact_sha256     TEXT,
    exit_code           INTEGER,
    created_at          INTEGER NOT NULL,
    CHECK (length(check_kind) BETWEEN 1 AND 128),
    CHECK (length(summary) BETWEEN 1 AND 8192),
    CHECK (artifact_sha256 IS NULL OR length(artifact_sha256) = 64)
);

CREATE INDEX idx_agent_verification_run_created
ON agent_verification_receipts(run_id, created_at ASC, id ASC);
