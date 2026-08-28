ALTER TABLE artifacts
ADD COLUMN archived_at INTEGER CHECK (archived_at IS NULL OR archived_at >= created_at);

ALTER TABLE artifacts
ADD COLUMN lifecycle_updated_by_tool_call_id TEXT REFERENCES agent_tool_calls(id) ON DELETE RESTRICT;

ALTER TABLE artifacts
ADD COLUMN lifecycle_mutation_request_sha256 TEXT CHECK (
    lifecycle_mutation_request_sha256 IS NULL OR
    (length(lifecycle_mutation_request_sha256) = 64 AND
     lifecycle_mutation_request_sha256 NOT GLOB '*[^0-9a-f]*')
);

CREATE INDEX idx_artifacts_profile_archive_updated
ON artifacts(profile_id, archived_at, updated_at DESC, id DESC);
