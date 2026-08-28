CREATE TABLE idr_human_model_state (
    singleton_key                   INTEGER PRIMARY KEY CHECK (singleton_key = 1),
    current_human_model_revision    INTEGER NOT NULL CHECK (current_human_model_revision >= 0),
    storage_contract_version        INTEGER NOT NULL CHECK (storage_contract_version = 1),
    updated_at                      INTEGER NOT NULL CHECK (updated_at >= 0)
);

INSERT INTO idr_human_model_state(
    singleton_key,
    current_human_model_revision,
    storage_contract_version,
    updated_at
) VALUES(1, 0, 1, 0);

CREATE TABLE idr_human_model_items (
    item_id                         TEXT PRIMARY KEY,
    contract_version                INTEGER NOT NULL CHECK (contract_version = 1),
    payload_schema_version          INTEGER NOT NULL CHECK (payload_schema_version = 1),
    kind                            TEXT NOT NULL
                                    CHECK (kind IN ('FACT', 'PREFERENCE', 'OBSERVATION', 'DISPOSITION', 'LONG_TERM_GOAL')),
    typed_payload_json              TEXT NOT NULL
                                    CHECK (json_valid(typed_payload_json))
                                    CHECK (json_type(typed_payload_json) = 'object')
                                    CHECK (length(CAST(typed_payload_json AS BLOB)) BETWEEN 2 AND 16384)
                                    CHECK (json_extract(typed_payload_json, '$.kind') = kind),
    dimension                       TEXT,
    normalized_value                TEXT,
    lifecycle                       TEXT NOT NULL
                                    CHECK (lifecycle IN ('CANDIDATE', 'ACTIVE', 'WEAKENED', 'CONFLICTED', 'SUPERSEDED', 'REVOKED')),
    evidence_basis                  TEXT NOT NULL
                                    CHECK (evidence_basis IN ('EXPLICIT', 'OBSERVED', 'INFERRED')),
    inference_confidence            TEXT
                                    CHECK (inference_confidence IS NULL OR inference_confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    scope_domain                    TEXT,
    scope_project_ref               TEXT,
    scope_task_type                 TEXT,
    scope_interaction_kind          TEXT,
    supersedes_item_id              TEXT,
    created_human_model_revision    INTEGER NOT NULL CHECK (created_human_model_revision >= 1),
    updated_human_model_revision    INTEGER NOT NULL CHECK (updated_human_model_revision >= created_human_model_revision),
    created_at                      INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at                      INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (length(CAST(item_id AS BLOB)) BETWEEN 1 AND 128),
    CHECK (dimension IS NULL OR length(CAST(dimension AS BLOB)) BETWEEN 1 AND 128),
    CHECK (normalized_value IS NULL OR length(CAST(normalized_value AS BLOB)) BETWEEN 1 AND 512),
    CHECK (scope_domain IS NULL OR length(CAST(scope_domain AS BLOB)) BETWEEN 1 AND 128),
    CHECK (scope_project_ref IS NULL OR length(CAST(scope_project_ref AS BLOB)) BETWEEN 1 AND 128),
    CHECK (scope_task_type IS NULL OR length(CAST(scope_task_type AS BLOB)) BETWEEN 1 AND 128),
    CHECK (scope_interaction_kind IS NULL OR length(CAST(scope_interaction_kind AS BLOB)) BETWEEN 1 AND 128),
    CHECK (supersedes_item_id IS NULL OR (
        length(CAST(supersedes_item_id AS BLOB)) BETWEEN 1 AND 128
        AND supersedes_item_id != item_id
    )),
    CHECK (
        (kind = 'FACT' AND evidence_basis IN ('EXPLICIT', 'OBSERVED') AND inference_confidence IS NULL AND dimension IS NULL AND normalized_value IS NULL) OR
        (kind = 'PREFERENCE' AND evidence_basis = 'EXPLICIT' AND inference_confidence IS NULL AND dimension IS NOT NULL AND normalized_value IS NOT NULL) OR
        (kind = 'OBSERVATION' AND evidence_basis = 'OBSERVED' AND inference_confidence IS NULL AND ((dimension IS NULL AND normalized_value IS NULL) OR (dimension IS NOT NULL AND normalized_value IS NOT NULL))) OR
        (kind = 'DISPOSITION' AND evidence_basis = 'INFERRED' AND inference_confidence IS NOT NULL AND dimension IS NOT NULL AND normalized_value IS NOT NULL) OR
        (kind = 'LONG_TERM_GOAL' AND evidence_basis = 'EXPLICIT' AND inference_confidence IS NULL AND dimension IS NULL AND normalized_value IS NULL)
    ),
    CHECK (
        kind NOT IN ('PREFERENCE', 'DISPOSITION') OR
        (
            json_extract(typed_payload_json, '$.data.dimension') = dimension AND
            json_extract(typed_payload_json, '$.data.normalized_value') = normalized_value
        )
    )
);

CREATE TABLE idr_provenance_refs (
    provenance_ref_id               TEXT PRIMARY KEY,
    contract_version                INTEGER NOT NULL CHECK (contract_version = 1),
    source_type                     TEXT NOT NULL
                                    CHECK (source_type IN (
                                        'EXPLICIT_USER_STATEMENT', 'EXPLICIT_USER_SETTING',
                                        'USER_ACTION', 'USER_CORRECTION', 'AGENT_OUTCOME',
                                        'USER_APPROVED_IMPORT', 'SYSTEM_INFERENCE'
                                    )),
    source_ref_kind                 TEXT NOT NULL
                                    CHECK (source_ref_kind IN (
                                        'MESSAGE', 'CONVERSATION', 'AGENT_RUN', 'AGENT_EVENT',
                                        'SETTING', 'HUMAN_MODEL_ITEM', 'IMPORTED_SOURCE', 'USER_ACTION'
                                    )),
    source_ref_id                   TEXT NOT NULL,
    observed_at                     INTEGER NOT NULL CHECK (observed_at >= 0),
    bounded_support                 TEXT
                                    CHECK (bounded_support IS NULL OR length(CAST(bounded_support AS BLOB)) BETWEEN 1 AND 2048),
    source_digest                   TEXT
                                    CHECK (source_digest IS NULL OR (
                                        length(source_digest) = 64 AND
                                        source_digest NOT GLOB '*[^0-9a-f]*'
                                    )),
    admission_relation              TEXT
                                    CHECK (admission_relation IS NULL OR admission_relation IN (
                                        'EXPLICIT', 'CONFIRMATION', 'CORRECTION', 'IMPORT', 'INFERENCE_SUPPORT'
                                    )),
    source_status_at_admission      TEXT NOT NULL
                                    CHECK (source_status_at_admission IN ('AVAILABLE', 'REVOCABLE')),
    created_at                      INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (length(CAST(provenance_ref_id AS BLOB)) BETWEEN 1 AND 128),
    CHECK (length(CAST(source_ref_id AS BLOB)) BETWEEN 1 AND 512)
);

CREATE TABLE idr_item_provenance (
    item_id                         TEXT NOT NULL REFERENCES idr_human_model_items(item_id) ON DELETE CASCADE,
    provenance_ref_id               TEXT NOT NULL REFERENCES idr_provenance_refs(provenance_ref_id) ON DELETE RESTRICT,
    admitted_human_model_revision   INTEGER NOT NULL CHECK (admitted_human_model_revision >= 1),
    PRIMARY KEY(item_id, provenance_ref_id)
);

CREATE TABLE idr_item_reality_refs (
    item_id                         TEXT NOT NULL REFERENCES idr_human_model_items(item_id) ON DELETE CASCADE,
    reality_kind                    TEXT NOT NULL
                                    CHECK (reality_kind IN ('PROJECT', 'ARTIFACT', 'DECISION', 'VERIFICATION', 'FIELD_OBJECT')),
    reality_ref                     TEXT NOT NULL,
    dependency_relation             TEXT NOT NULL
                                    CHECK (dependency_relation IN ('MUST_EXIST', 'REVISION_MATCH', 'FINGERPRINT_MATCH')),
    expected_revision               INTEGER CHECK (expected_revision IS NULL OR expected_revision >= 0),
    expected_fingerprint            TEXT
                                    CHECK (expected_fingerprint IS NULL OR (
                                        length(expected_fingerprint) = 64 AND
                                        expected_fingerprint NOT GLOB '*[^0-9a-f]*'
                                    )),
    admitted_human_model_revision   INTEGER NOT NULL CHECK (admitted_human_model_revision >= 1),
    created_at                      INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY(item_id, reality_kind, reality_ref, dependency_relation),
    CHECK (length(CAST(reality_ref AS BLOB)) BETWEEN 1 AND 512),
    CHECK (
        (dependency_relation = 'MUST_EXIST' AND expected_revision IS NULL AND expected_fingerprint IS NULL) OR
        (dependency_relation = 'REVISION_MATCH' AND expected_revision IS NOT NULL AND expected_fingerprint IS NULL) OR
        (dependency_relation = 'FINGERPRINT_MATCH' AND expected_revision IS NULL AND expected_fingerprint IS NOT NULL)
    )
);

CREATE TABLE idr_item_history (
    history_id                      TEXT PRIMARY KEY,
    item_id                         TEXT NOT NULL REFERENCES idr_human_model_items(item_id) ON DELETE CASCADE,
    human_model_revision            INTEGER NOT NULL CHECK (human_model_revision >= 1),
    mutation_kind                   TEXT NOT NULL
                                    CHECK (mutation_kind IN (
                                        'CREATED', 'ACTIVATED', 'WEAKENED', 'CONFLICTED',
                                        'SUPERSEDED', 'REVOKED', 'CONFIDENCE_CHANGED'
                                    )),
    previous_lifecycle              TEXT
                                    CHECK (previous_lifecycle IS NULL OR previous_lifecycle IN (
                                        'CANDIDATE', 'ACTIVE', 'WEAKENED', 'CONFLICTED', 'SUPERSEDED', 'REVOKED'
                                    )),
    resulting_lifecycle             TEXT NOT NULL
                                    CHECK (resulting_lifecycle IN (
                                        'CANDIDATE', 'ACTIVE', 'WEAKENED', 'CONFLICTED', 'SUPERSEDED', 'REVOKED'
                                    )),
    previous_confidence             TEXT
                                    CHECK (previous_confidence IS NULL OR previous_confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    resulting_confidence            TEXT
                                    CHECK (resulting_confidence IS NULL OR resulting_confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    reason_code                     TEXT NOT NULL,
    mutation_ref                    TEXT NOT NULL,
    created_at                      INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (length(CAST(history_id AS BLOB)) BETWEEN 1 AND 128),
    CHECK (length(CAST(reason_code AS BLOB)) BETWEEN 1 AND 128),
    CHECK (length(CAST(mutation_ref AS BLOB)) BETWEEN 1 AND 128),
    CHECK (
        (mutation_kind = 'CREATED' AND previous_lifecycle IS NULL) OR
        (mutation_kind != 'CREATED' AND previous_lifecycle IS NOT NULL)
    )
);

CREATE TABLE idr_erasure_tombstones (
    item_id                         TEXT PRIMARY KEY,
    erased_marker                   INTEGER NOT NULL DEFAULT 1 CHECK (erased_marker = 1),
    erasure_mode                    TEXT NOT NULL CHECK (erasure_mode IN ('ERASE_IF_ALLOWED', 'RESET_PROFILE')),
    erased_at                       INTEGER NOT NULL CHECK (erased_at >= 0),
    erased_human_model_revision     INTEGER NOT NULL CHECK (erased_human_model_revision >= 1),
    contract_version                INTEGER NOT NULL CHECK (contract_version = 1),
    CHECK (length(CAST(item_id AS BLOB)) BETWEEN 1 AND 128)
);

CREATE INDEX idx_idr_items_lifecycle_scope_dimension
ON idr_human_model_items(
    lifecycle,
    scope_project_ref,
    scope_domain,
    scope_task_type,
    scope_interaction_kind,
    dimension,
    kind
);

CREATE INDEX idx_idr_items_candidate_disposition
ON idr_human_model_items(updated_at DESC, item_id)
WHERE kind = 'DISPOSITION' AND lifecycle = 'CANDIDATE';

CREATE UNIQUE INDEX uq_idr_items_supersedes_predecessor
ON idr_human_model_items(supersedes_item_id)
WHERE supersedes_item_id IS NOT NULL;

CREATE INDEX idx_idr_item_provenance_reverse
ON idr_item_provenance(provenance_ref_id, item_id);

CREATE INDEX idx_idr_item_reality_reverse
ON idr_item_reality_refs(reality_kind, reality_ref, item_id);

CREATE UNIQUE INDEX uq_idr_history_item_revision
ON idr_item_history(item_id, human_model_revision);
