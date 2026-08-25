CREATE TABLE profiles (
    singleton_key       INTEGER PRIMARY KEY CHECK (singleton_key = 1),
    profile_id          TEXT NOT NULL UNIQUE,
    schema_version      INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    created_at          INTEGER NOT NULL
);

CREATE TABLE library_objects (
    id                  TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    kind                TEXT NOT NULL CHECK (kind IN ('FILE', 'WEB')),
    media_kind          TEXT NOT NULL CHECK (media_kind IN ('DOCUMENT', 'IMAGE', 'AUDIO', 'VIDEO', 'OTHER', 'WEB')),
    title               TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 512),
    original_source     TEXT,
    original_filename   TEXT,
    mime_type           TEXT,
    size                INTEGER CHECK (size IS NULL OR size >= 0),
    blob_ref            TEXT,
    content_hash        TEXT,
    metadata_json       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    lifecycle           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle IN ('ACTIVE', 'TOMBSTONE')),
    revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    updated_by_device   TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    deleted_at          INTEGER,
    CHECK (created_at <= updated_at),
    CHECK ((lifecycle = 'ACTIVE' AND deleted_at IS NULL) OR (lifecycle = 'TOMBSTONE' AND deleted_at IS NOT NULL)),
    CHECK (
      (kind = 'FILE' AND media_kind != 'WEB' AND blob_ref IS NOT NULL AND content_hash IS NOT NULL AND size IS NOT NULL) OR
      (kind = 'WEB' AND media_kind = 'WEB' AND blob_ref IS NULL AND content_hash IS NULL AND size IS NULL)
    ),
    CHECK (content_hash IS NULL OR (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*')),
    CHECK (blob_ref IS NULL OR blob_ref GLOB 'blobs/objects/[0-9a-f][0-9a-f]/[0-9a-f]*')
);

CREATE INDEX idx_library_profile_lifecycle_updated
ON library_objects(profile_id, lifecycle, updated_at DESC, id DESC);

CREATE INDEX idx_library_profile_media_updated
ON library_objects(profile_id, media_kind, updated_at DESC, id DESC);

CREATE TABLE sync_change_journal (
    change_id           TEXT PRIMARY KEY,
    profile_id          TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE RESTRICT,
    device_id           TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    entity_type         TEXT NOT NULL,
    entity_id           TEXT NOT NULL,
    operation           TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'TOMBSTONE')),
    revision            INTEGER NOT NULL CHECK (revision >= 1),
    changed_at          INTEGER NOT NULL,
    CHECK (length(entity_type) BETWEEN 1 AND 64)
);

CREATE INDEX idx_sync_change_profile_changed
ON sync_change_journal(profile_id, changed_at ASC, change_id ASC);

CREATE TRIGGER sync_change_journal_immutable_update
BEFORE UPDATE ON sync_change_journal
BEGIN
    SELECT RAISE(ABORT, 'SYNC_CHANGE_IMMUTABLE');
END;

CREATE TRIGGER sync_change_journal_immutable_delete
BEFORE DELETE ON sync_change_journal
BEGIN
    SELECT RAISE(ABORT, 'SYNC_CHANGE_IMMUTABLE');
END;
