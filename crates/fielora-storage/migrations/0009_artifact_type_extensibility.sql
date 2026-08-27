CREATE TABLE artifacts_v9 (
    id                              TEXT PRIMARY KEY,
    profile_id                      TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    artifact_type                   TEXT NOT NULL CHECK (
        length(CAST(artifact_type AS BLOB)) BETWEEN 1 AND 32 AND
        artifact_type GLOB '[A-Z]*' AND
        artifact_type NOT GLOB '*[^A-Z0-9_]*'
    ),
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

INSERT INTO artifacts_v9(
    id,
    profile_id,
    artifact_type,
    title,
    project_field_id,
    current_revision_id,
    created_from_conversation_id,
    created_by_agent_run_id,
    updated_by_device,
    created_at,
    updated_at
)
SELECT
    id,
    profile_id,
    artifact_type,
    title,
    project_field_id,
    current_revision_id,
    created_from_conversation_id,
    created_by_agent_run_id,
    updated_by_device,
    created_at,
    updated_at
FROM artifacts;

DROP TABLE artifacts;
ALTER TABLE artifacts_v9 RENAME TO artifacts;

CREATE INDEX idx_artifacts_profile_updated
ON artifacts(profile_id, updated_at DESC, id DESC);

CREATE INDEX idx_artifacts_project_updated
ON artifacts(profile_id, project_field_id, updated_at DESC, id DESC);
