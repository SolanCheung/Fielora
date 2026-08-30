DROP TRIGGER artifact_revisions_immutable_update;
DROP TRIGGER artifact_revisions_immutable_delete;

CREATE TABLE artifact_revisions_v15 (
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
    created_by_tool_call_id         TEXT NOT NULL REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    created_at                      INTEGER NOT NULL,
    UNIQUE (artifact_id, sequence),
    UNIQUE (id, artifact_id),
    UNIQUE (created_by_tool_call_id, artifact_id),
    CHECK (length(CAST(content_json AS BLOB)) <= 262144),
    CHECK (length(semantic_sha256) = 64 AND semantic_sha256 NOT GLOB '*[^0-9a-f]*'),
    CHECK (length(mutation_request_sha256) = 64 AND mutation_request_sha256 NOT GLOB '*[^0-9a-f]*'),
    CHECK ((sequence = 1 AND parent_revision_id IS NULL AND mutation_kind = 'CREATE') OR
           (sequence > 1 AND parent_revision_id IS NOT NULL AND mutation_kind = 'UPDATE')),
    FOREIGN KEY (parent_revision_id, artifact_id)
        REFERENCES artifact_revisions_v15(id, artifact_id) ON DELETE RESTRICT
);

INSERT INTO artifact_revisions_v15(
    id, artifact_id, sequence, parent_revision_id, mutation_kind,
    content_schema_version, content_json, semantic_sha256,
    mutation_request_sha256, created_from_conversation_id,
    created_by_agent_run_id, created_by_tool_call_id, created_at
)
SELECT
    id, artifact_id, sequence, parent_revision_id, mutation_kind,
    content_schema_version, content_json, semantic_sha256,
    mutation_request_sha256, created_from_conversation_id,
    created_by_agent_run_id, created_by_tool_call_id, created_at
FROM artifact_revisions;

DROP TABLE artifact_revisions;
ALTER TABLE artifact_revisions_v15 RENAME TO artifact_revisions;

CREATE INDEX idx_artifact_revisions_artifact_sequence
ON artifact_revisions(artifact_id, sequence ASC);

CREATE INDEX idx_artifact_revisions_tool_call
ON artifact_revisions(created_by_tool_call_id, artifact_id);

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

CREATE TABLE file_artifact_bindings (
    artifact_id                     TEXT NOT NULL PRIMARY KEY REFERENCES artifacts(id) ON DELETE RESTRICT,
    profile_id                      TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    project_field_id                TEXT NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
    relative_path                   TEXT NOT NULL CHECK (
        length(CAST(relative_path AS BLOB)) BETWEEN 1 AND 4096 AND
        relative_path NOT LIKE '/%' AND
        relative_path NOT LIKE '%\\%'
    ),
    created_at                      INTEGER NOT NULL,
    updated_at                      INTEGER NOT NULL,
    CHECK (created_at <= updated_at),
    UNIQUE (profile_id, project_field_id, relative_path)
);

CREATE INDEX idx_file_artifact_bindings_project_path
ON file_artifact_bindings(profile_id, project_field_id, relative_path);

CREATE TABLE artifact_revision_reviews (
    revision_id                    TEXT NOT NULL PRIMARY KEY REFERENCES artifact_revisions(id) ON DELETE RESTRICT,
    profile_id                     TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    state                          TEXT NOT NULL CHECK (state = 'REVIEWED'),
    reviewed_by_principal_id       TEXT NOT NULL REFERENCES principals(id) ON DELETE RESTRICT,
    reviewed_at                    INTEGER NOT NULL CHECK (reviewed_at >= 0)
);

CREATE INDEX idx_artifact_revision_reviews_profile_reviewed
ON artifact_revision_reviews(profile_id, reviewed_at ASC, revision_id ASC);
