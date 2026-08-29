CREATE TABLE screenshot_evidence (
    id                          TEXT PRIMARY KEY,
    profile_id                  TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    content_sha256              TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
    blob_ref                    TEXT NOT NULL CHECK (blob_ref = 'blobs/objects/' || substr(content_sha256, 1, 2) || '/' || content_sha256),
    mime_type                   TEXT NOT NULL CHECK (mime_type = 'image/png'),
    byte_size                   INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4194304),
    width                       INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
    height                      INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
    source_kind                 TEXT NOT NULL CHECK (source_kind = 'BROWSER_VIEWPORT'),
    page_id                     TEXT NOT NULL CHECK (length(page_id) BETWEEN 1 AND 128),
    navigation_generation       INTEGER NOT NULL CHECK (navigation_generation >= 0),
    captured_url                TEXT NOT NULL CHECK (length(CAST(captured_url AS BLOB)) BETWEEN 1 AND 8192),
    captured_at                 INTEGER NOT NULL CHECK (captured_at >= 0),
    conversation_id             TEXT REFERENCES conversations(id) ON DELETE RESTRICT,
    run_id                      TEXT REFERENCES agent_runs(id) ON DELETE RESTRICT,
    tool_call_id                TEXT REFERENCES agent_tool_calls(id) ON DELETE RESTRICT,
    verification_receipt_id     TEXT REFERENCES agent_verification_receipts(id) ON DELETE RESTRICT,
    visibility                  TEXT NOT NULL CHECK (visibility = 'INTERNAL'),
    retention_class             TEXT NOT NULL CHECK (retention_class = 'LOCAL_EVIDENCE'),
    status                      TEXT NOT NULL CHECK (status = 'ACTIVE'),
    export_policy               TEXT NOT NULL CHECK (export_policy = 'EXCLUDED'),
    sync_policy                 TEXT NOT NULL CHECK (sync_policy = 'LOCAL_ONLY'),
    created_at                  INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (width * height <= 16777216),
    CHECK (tool_call_id IS NULL OR run_id IS NOT NULL),
    CHECK (verification_receipt_id IS NULL OR run_id IS NOT NULL)
);

CREATE INDEX idx_screenshot_evidence_run_captured
ON screenshot_evidence(run_id, captured_at ASC, id ASC)
WHERE run_id IS NOT NULL;

CREATE INDEX idx_screenshot_evidence_verification_captured
ON screenshot_evidence(verification_receipt_id, captured_at ASC, id ASC)
WHERE verification_receipt_id IS NOT NULL;
