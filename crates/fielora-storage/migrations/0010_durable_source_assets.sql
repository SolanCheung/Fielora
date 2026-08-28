CREATE TABLE assets (
    id                              TEXT PRIMARY KEY,
    profile_id                      TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    media_type                     TEXT NOT NULL CHECK (media_type = 'image/png'),
    content_sha256                 TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
    byte_length                    INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 8388608),
    width                          INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
    height                         INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
    blob_ref                       TEXT NOT NULL CHECK (blob_ref GLOB 'blobs/objects/[0-9a-f][0-9a-f]/[0-9a-f]*'),
    mutation_request_sha256        TEXT NOT NULL CHECK (length(mutation_request_sha256) = 64 AND mutation_request_sha256 NOT GLOB '*[^0-9a-f]*'),
    created_from_conversation_id   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    created_by_agent_run_id        TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    created_by_tool_call_id        TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    created_at                     INTEGER NOT NULL,
    CHECK (blob_ref = 'blobs/objects/' || substr(content_sha256, 1, 2) || '/' || content_sha256),
    CHECK (CAST(width AS INTEGER) * CAST(height AS INTEGER) <= 16777216)
);

CREATE INDEX idx_assets_profile_created
ON assets(profile_id, created_at DESC, id DESC);

CREATE TRIGGER assets_immutable_update
BEFORE UPDATE ON assets
BEGIN
    SELECT RAISE(ABORT, 'ASSET_IMMUTABLE');
END;

CREATE TRIGGER assets_immutable_delete
BEFORE DELETE ON assets
BEGIN
    SELECT RAISE(ABORT, 'ASSET_IMMUTABLE');
END;
