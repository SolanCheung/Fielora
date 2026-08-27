CREATE TABLE artifacts (
    id                              TEXT PRIMARY KEY,
    profile_id                      TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    artifact_type                   TEXT NOT NULL CHECK (artifact_type IN ('DOCUMENT', 'PRESENTATION')),
    title                           TEXT CHECK (title IS NULL OR length(title) BETWEEN 1 AND 512),
    project_field_id                TEXT REFERENCES fields(id) ON DELETE SET NULL,
    current_revision_id             TEXT NOT NULL,
    created_from_conversation_id    TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    created_by_agent_run_id         TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    updated_by_device               TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    created_at                      INTEGER NOT NULL,
    updated_at                      INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    FOREIGN KEY (current_revision_id, id)
        REFERENCES artifact_revisions(id, artifact_id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE artifact_revisions (
    id                              TEXT PRIMARY KEY,
    artifact_id                     TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
    sequence                        INTEGER NOT NULL CHECK (sequence >= 1),
    parent_revision_id              TEXT,
    mutation_kind                   TEXT NOT NULL CHECK (mutation_kind IN ('CREATE', 'UPDATE')),
    content_schema_version          INTEGER NOT NULL CHECK (content_schema_version = 1),
    content_json                    TEXT NOT NULL CHECK (json_valid(content_json)),
    semantic_sha256                 TEXT NOT NULL,
    mutation_request_sha256         TEXT NOT NULL,
    created_from_conversation_id    TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    created_by_agent_run_id         TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    created_by_tool_call_id          TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    created_at                      INTEGER NOT NULL,
    UNIQUE (artifact_id, sequence),
    UNIQUE (id, artifact_id),
    CHECK (length(CAST(content_json AS BLOB)) <= 262144),
    CHECK (length(semantic_sha256) = 64 AND semantic_sha256 NOT GLOB '*[^0-9a-f]*'),
    CHECK (length(mutation_request_sha256) = 64 AND mutation_request_sha256 NOT GLOB '*[^0-9a-f]*'),
    CHECK ((sequence = 1 AND parent_revision_id IS NULL AND mutation_kind = 'CREATE') OR
           (sequence > 1 AND parent_revision_id IS NOT NULL AND mutation_kind = 'UPDATE')),
    FOREIGN KEY (parent_revision_id, artifact_id)
        REFERENCES artifact_revisions(id, artifact_id) ON DELETE RESTRICT
);

CREATE INDEX idx_artifacts_profile_updated
ON artifacts(profile_id, updated_at DESC, id DESC);

CREATE INDEX idx_artifacts_project_updated
ON artifacts(profile_id, project_field_id, updated_at DESC, id DESC);

CREATE INDEX idx_artifact_revisions_artifact_sequence
ON artifact_revisions(artifact_id, sequence ASC);

CREATE TRIGGER artifact_revisions_immutable_update
BEFORE UPDATE ON artifact_revisions
BEGIN
    SELECT RAISE(ABORT, 'ARTIFACT_REVISION_IMMUTABLE');
END;

CREATE TRIGGER artifact_revisions_immutable_delete
BEFORE DELETE ON artifact_revisions
BEGIN
    SELECT RAISE(ABORT, 'ARTIFACT_REVISION_IMMUTABLE');
END;

ALTER TABLE agent_verification_receipts
ADD COLUMN subject_kind TEXT CHECK (subject_kind IS NULL OR subject_kind = 'ARTIFACT_REVISION');

ALTER TABLE agent_verification_receipts
ADD COLUMN subject_artifact_id TEXT REFERENCES artifacts(id) ON DELETE RESTRICT;

ALTER TABLE agent_verification_receipts
ADD COLUMN subject_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE RESTRICT;

ALTER TABLE agent_verification_receipts
ADD COLUMN subject_sha256 TEXT CHECK (
    subject_sha256 IS NULL OR
    (length(subject_sha256) = 64 AND subject_sha256 NOT GLOB '*[^0-9a-f]*')
);

CREATE INDEX idx_agent_verification_artifact_revision
ON agent_verification_receipts(subject_artifact_id, subject_revision_id, created_at ASC)
WHERE subject_kind = 'ARTIFACT_REVISION';
