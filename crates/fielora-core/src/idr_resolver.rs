//! Deterministic, read-only Harness.IDR Resolver V1.
//!
//! The physical module lives beside Harness composition in `fielora-core` and consumes
//! the immutable storage-owned `HumanModelSnapshot` boundary. The resolver core performs
//! no SQLite I/O and exposes no Human Model mutations.

use fielora_contracts::idr::{
    CanonicalEncoderV1, CanonicalSemanticValueV1, CurrentConstraintAuthorityV1,
    CurrentConstraintOperationV1, CurrentConstraintStateV1, DomainV1, EvidenceBasisV1,
    HumanModelConflictKindV1, HumanModelConflictStateV1, HumanModelConflictV1, HumanModelKindV1,
    HumanModelSuppressionV1, InferenceConfidenceV1, InteractionKindV1,
    MAX_RESOLVED_PROVENANCE_REFS_V1, MAX_RESOLVER_CONFLICT_ITEM_REFS_V1,
    MAX_RESOLVER_CONFLICT_RECORDS_V1, MAX_RESOLVER_LINEAGE_DEPTH_V1,
    MAX_RESOLVER_PROVENANCE_REFS_PER_ITEM_V1, MAX_RESOLVER_REALITY_REFS_PER_ITEM_V1,
    MAX_RESOLVER_SNAPSHOT_ITEMS_V1, MAX_RESOLVER_SUPPRESSION_RECORDS_V1,
    NormalizedCurrentConstraintsV1, NormalizedResolutionContextV1, NormalizedScopeV1,
    PreferenceRelationV1, REALITY_PROJECTION_VERSION_V1, RESOLUTION_CONTEXT_VERSION_V1,
    RESOLUTION_PROFILE_VERSION_V1, RESOLVER_CONTRACT_VERSION_V1, RESOLVER_VERSION_V1,
    RealityAvailabilityV1, RealityKindV1, RealityStateEntryV1, RealityValidationProjectionV1,
    RealityValidationStateV1, ResolvedHumanModelItemV1, ResolvedHumanModelViewV1,
    ResolvedRealityRefV1, ResolvedViewContextBindingV1, ResolverDiagnosticsSummaryV1,
    ResolverHardFailureCodeV1, ResolverReasonCodeV1, SEMANTIC_REGISTRY_VERSION_V1,
    SOURCE_AVAILABILITY_VERSION_V1, ScopeSpecificityV1, SelectorStateV1, SemanticKeyV1,
    SourceAvailabilityProjectionV1, SourceAvailabilityStateV1, TaskTypeV1,
};
use fielora_storage::idr::{
    DispositionScope, EvidenceBasis, FactValueV1, HumanModelItemRecord, HumanModelKind,
    HumanModelLifecycle, HumanModelPayloadV1, HumanModelSnapshot, IDR_CONTRACT_VERSION,
    IDR_PAYLOAD_SCHEMA_VERSION, InferenceConfidence, PreferenceRelation,
    ProvenanceAdmissionRelation, ProvenanceRefInput, ProvenanceSourceStatus, ProvenanceSourceType,
    RealityDependencyInput, RealityDependencyRelation, RealityKind,
};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

const DOMAIN_CONTEXT: &str = "FIELORA_IDR_RESOLUTION_CONTEXT_V1";
const DOMAIN_REALITY_FINGERPRINT: &str = "FIELORA_IDR_REALITY_FINGERPRINT_V1";
const DOMAIN_REALITY_PROJECTION: &str = "FIELORA_IDR_REALITY_PROJECTION_V1";
const DOMAIN_SOURCE_AVAILABILITY: &str = "FIELORA_IDR_SOURCE_AVAILABILITY_V1";
const DOMAIN_CURRENT_CONSTRAINTS: &str = "FIELORA_IDR_CURRENT_CONSTRAINTS_V1";
const DOMAIN_RESOLVED_VIEW: &str = "FIELORA_IDR_RESOLVED_VIEW_V1";
const DOMAIN_RESOLUTION_REF: &str = "FIELORA_IDR_RESOLUTION_REF_V1";
const DOMAIN_DIAGNOSTIC_OVERFLOW: &str = "FIELORA_IDR_DIAGNOSTIC_OVERFLOW_V1";

pub struct ResolveHumanModelInputV1<'a> {
    pub resolver_contract_version: u16,
    pub resolver_version: &'a str,
    pub semantic_registry_version: &'a str,
    pub expected_human_model_revision: u64,
    pub snapshot: &'a HumanModelSnapshot,
    pub resolution_context: &'a NormalizedResolutionContextV1,
    pub reality_projection: &'a RealityValidationProjectionV1,
    pub source_availability: &'a SourceAvailabilityProjectionV1,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct HumanModelResolverV1;

#[derive(Clone)]
struct Candidate<'a> {
    record: &'a HumanModelItemRecord,
    kind: HumanModelKindV1,
    key: SemanticKeyV1,
    relation: Option<PreferenceRelationV1>,
    value: CanonicalSemanticValueV1,
    scope: NormalizedScopeV1,
    specificity: ScopeSpecificityV1,
    basis: EvidenceBasisV1,
    confidence: Option<InferenceConfidenceV1>,
    provenance_refs: Vec<String>,
    reality_validation: Vec<ResolvedRealityRefV1>,
    constraint_state: CurrentConstraintStateV1,
    lineage_predecessors: Vec<String>,
    lineage_incomplete: bool,
}

#[derive(Default)]
struct ResolutionAccumulator {
    effective: Vec<ResolvedHumanModelItemV1>,
    conflicts: Vec<HumanModelConflictV1>,
    suppressions: BTreeMap<String, HumanModelSuppressionV1>,
}

impl ResolutionAccumulator {
    fn suppress(
        &mut self,
        item_id: &str,
        kind: HumanModelKindV1,
        key: Option<SemanticKeyV1>,
        reason: ResolverReasonCodeV1,
        selected_by: &[String],
    ) {
        let entry = self
            .suppressions
            .entry(item_id.to_owned())
            .or_insert_with(|| HumanModelSuppressionV1 {
                item_id: item_id.to_owned(),
                kind,
                semantic_key: key.clone(),
                reason_codes: Vec::new(),
                selected_by_item_refs: Vec::new(),
            });
        if entry.semantic_key.is_none() {
            entry.semantic_key = key;
        }
        entry.reason_codes.push(reason);
        entry.reason_codes.sort();
        entry.reason_codes.dedup();
        entry.selected_by_item_refs.extend_from_slice(selected_by);
        entry.selected_by_item_refs.sort();
        entry.selected_by_item_refs.dedup();
    }
}

impl HumanModelResolverV1 {
    pub fn resolve(
        &self,
        input: ResolveHumanModelInputV1<'_>,
    ) -> Result<ResolvedHumanModelViewV1, ResolverHardFailureCodeV1> {
        validate_envelope(&input)?;
        let item_by_id = validate_snapshot(input.snapshot)?;
        validate_context(input.resolution_context)?;
        validate_reality_projection(input.reality_projection)?;
        validate_source_availability(input.source_availability)?;
        let lineage = validate_lineage(&item_by_id)?;

        let source_states = input
            .source_availability
            .entries
            .iter()
            .map(|entry| (entry.provenance_ref_id.as_str(), entry.state))
            .collect::<HashMap<_, _>>();
        let reality_states = input
            .reality_projection
            .entries
            .iter()
            .map(|entry| ((entry.reality_kind, entry.reality_ref.as_str()), entry))
            .collect::<HashMap<_, _>>();

        let mut accumulator = ResolutionAccumulator::default();
        let mut candidates = Vec::new();
        let mut ordered_records = input.snapshot.items.iter().collect::<Vec<_>>();
        ordered_records.sort_by(|left, right| left.item_id.cmp(&right.item_id));

        for record in ordered_records {
            let kind = map_kind(record.payload.kind());
            let projected = match project_semantics(record) {
                Ok(projected) => projected,
                Err(reason) => {
                    accumulator.suppress(&record.item_id, kind, None, reason, &[]);
                    continue;
                }
            };

            let lifecycle_reason = match record.lifecycle {
                HumanModelLifecycle::Active => None,
                HumanModelLifecycle::Candidate | HumanModelLifecycle::Weakened => {
                    Some(ResolverReasonCodeV1::LifecycleExcluded)
                }
                HumanModelLifecycle::Conflicted => Some(ResolverReasonCodeV1::ConflictedItem),
                HumanModelLifecycle::Superseded => Some(ResolverReasonCodeV1::SupersededItem),
                HumanModelLifecycle::Revoked => Some(ResolverReasonCodeV1::RevokedItem),
            };
            if let Some(reason) = lifecycle_reason {
                accumulator.suppress(&record.item_id, kind, Some(projected.0), reason, &[]);
                continue;
            }

            let (scope, specificity) =
                match normalize_and_match_scope(&record.scope, input.resolution_context) {
                    Ok(value) => value,
                    Err(reason) => {
                        accumulator.suppress(&record.item_id, kind, Some(projected.0), reason, &[]);
                        continue;
                    }
                };

            if record.provenance_refs.len() > MAX_RESOLVER_PROVENANCE_REFS_PER_ITEM_V1
                || record.reality_dependencies.len() > MAX_RESOLVER_REALITY_REFS_PER_ITEM_V1
            {
                accumulator.suppress(
                    &record.item_id,
                    kind,
                    Some(projected.0),
                    ResolverReasonCodeV1::ResolverItemLimit,
                    &[],
                );
                continue;
            }

            if !provenance_is_authoritative(record) {
                accumulator.suppress(
                    &record.item_id,
                    kind,
                    Some(projected.0),
                    ResolverReasonCodeV1::SourceNotAuthoritative,
                    &[],
                );
                continue;
            }
            if let Some(reason) = source_availability_reason(record, &source_states) {
                accumulator.suppress(&record.item_id, kind, Some(projected.0), reason, &[]);
                continue;
            }

            let reality_validation = validate_item_reality(record, &reality_states);
            if reality_validation
                .iter()
                .any(|entry| entry.validation_state == RealityValidationStateV1::StaleRealityRef)
            {
                accumulator.suppress(
                    &record.item_id,
                    kind,
                    Some(projected.0),
                    ResolverReasonCodeV1::StaleRealityRef,
                    &[],
                );
                continue;
            }
            if reality_validation
                .iter()
                .any(|entry| entry.validation_state == RealityValidationStateV1::RealityUnresolved)
            {
                accumulator.suppress(
                    &record.item_id,
                    kind,
                    Some(projected.0),
                    ResolverReasonCodeV1::RealityUnresolved,
                    &[],
                );
                continue;
            }

            let constraint = evaluate_constraints(
                &projected.0,
                projected.1,
                &projected.2,
                &input.resolution_context.current_constraints,
            );
            if let ConstraintEvaluation::Overridden(reason) = constraint {
                accumulator.suppress(&record.item_id, kind, Some(projected.0), reason, &[]);
                continue;
            }
            let constraint_state = match constraint {
                ConstraintEvaluation::Compatible => CurrentConstraintStateV1::Compatible,
                ConstraintEvaluation::Unresolved => CurrentConstraintStateV1::Unresolved,
                ConstraintEvaluation::Overridden(_) => unreachable!(),
            };

            if record.payload.kind() == HumanModelKind::Observation {
                accumulator.suppress(
                    &record.item_id,
                    kind,
                    Some(projected.0),
                    ResolverReasonCodeV1::NotEffectiveKind,
                    &[],
                );
                continue;
            }

            let mut provenance_refs = record
                .provenance_refs
                .iter()
                .map(|provenance| provenance.provenance_ref_id.clone())
                .collect::<Vec<_>>();
            provenance_refs.sort();
            provenance_refs.dedup();
            let lineage_predecessors = lineage
                .predecessors
                .get(&record.item_id)
                .cloned()
                .unwrap_or_default();
            candidates.push(Candidate {
                record,
                kind,
                key: projected.0,
                relation: projected.1,
                value: projected.2,
                scope,
                specificity,
                basis: map_basis(record.evidence_basis),
                confidence: record.inference_confidence.map(map_confidence),
                provenance_refs,
                reality_validation,
                constraint_state,
                lineage_predecessors,
                lineage_incomplete: lineage.incomplete.contains(&record.item_id),
            });
        }

        let candidates = apply_scope_specificity(candidates, &mut accumulator);
        resolve_semantic_groups(candidates, &mut accumulator);
        finalize_view(input, accumulator)
    }
}

struct LineageValidation {
    predecessors: HashMap<String, Vec<String>>,
    incomplete: HashSet<String>,
}

fn validate_envelope(
    input: &ResolveHumanModelInputV1<'_>,
) -> Result<(), ResolverHardFailureCodeV1> {
    if input.resolver_contract_version != RESOLVER_CONTRACT_VERSION_V1 {
        return Err(ResolverHardFailureCodeV1::UnsupportedContractVersion);
    }
    if input.resolver_version != RESOLVER_VERSION_V1 {
        return Err(ResolverHardFailureCodeV1::UnsupportedResolverVersion);
    }
    if input.semantic_registry_version != SEMANTIC_REGISTRY_VERSION_V1 {
        return Err(ResolverHardFailureCodeV1::UnsupportedSemanticRegistryVersion);
    }
    if input.snapshot.human_model_revision != input.expected_human_model_revision {
        return Err(ResolverHardFailureCodeV1::HumanModelRevisionMismatch);
    }
    if input.snapshot.items.len() > MAX_RESOLVER_SNAPSHOT_ITEMS_V1 {
        return Err(ResolverHardFailureCodeV1::ResolverInputLimit);
    }
    Ok(())
}

fn validate_snapshot(
    snapshot: &HumanModelSnapshot,
) -> Result<HashMap<&str, &HumanModelItemRecord>, ResolverHardFailureCodeV1> {
    let mut items = HashMap::with_capacity(snapshot.items.len());
    for item in &snapshot.items {
        if item.item_id.is_empty()
            || item.contract_version != IDR_CONTRACT_VERSION
            || item.payload_schema_version != IDR_PAYLOAD_SCHEMA_VERSION
            || items.insert(item.item_id.as_str(), item).is_some()
            || !storage_contract_compatible(item)
        {
            return Err(ResolverHardFailureCodeV1::InvalidHumanModelSnapshot);
        }
    }
    Ok(items)
}

fn storage_contract_compatible(item: &HumanModelItemRecord) -> bool {
    matches!(
        (item.payload.kind(), item.evidence_basis),
        (
            HumanModelKind::Fact,
            EvidenceBasis::Explicit | EvidenceBasis::Observed
        ) | (HumanModelKind::Preference, EvidenceBasis::Explicit)
            | (HumanModelKind::Observation, EvidenceBasis::Observed)
            | (HumanModelKind::Disposition, EvidenceBasis::Inferred)
            | (HumanModelKind::LongTermGoal, EvidenceBasis::Explicit)
    ) && (item.payload.kind() == HumanModelKind::Disposition) == item.inference_confidence.is_some()
}

fn validate_context(
    context: &NormalizedResolutionContextV1,
) -> Result<(), ResolverHardFailureCodeV1> {
    if context.contract_version != RESOLUTION_CONTEXT_VERSION_V1
        || context.context_ref.is_empty()
        || context.context_ref.len() > 512
        || fingerprint_current_constraints(&context.current_constraints)
            != context.current_constraints.constraints_digest
        || fingerprint_resolution_context(context) != context.context_fingerprint
        || !validate_constraints(&context.current_constraints)
    {
        return Err(ResolverHardFailureCodeV1::InvalidResolutionContext);
    }
    if let SelectorStateV1::Known(project) = &context.project
        && (project.is_empty() || project.len() > 512)
    {
        return Err(ResolverHardFailureCodeV1::InvalidResolutionContext);
    }
    Ok(())
}

fn validate_constraints(constraints: &NormalizedCurrentConstraintsV1) -> bool {
    if constraints.contract_version != fielora_contracts::idr::CURRENT_CONSTRAINTS_VERSION_V1
        || constraints.constraint_set_ref.is_empty()
        || constraints.constraint_set_ref.len() > 512
    {
        return false;
    }
    let mut covered = BTreeSet::new();
    for key in &constraints.covered_semantic_keys {
        if !semantic_key_registered(key) || !covered.insert(key.clone()) {
            return false;
        }
    }
    let mut unique = BTreeSet::new();
    let mut lanes: BTreeMap<(SemanticKeyV1, CurrentConstraintAuthorityV1), Vec<_>> =
        BTreeMap::new();
    for entry in &constraints.entries {
        if !covered.contains(&entry.semantic_key)
            || entry.source_ref.is_empty()
            || entry.source_ref.len() > 512
            || !is_sha256(&entry.source_digest)
            || !constraint_value_valid(entry)
        {
            return false;
        }
        let identity = (
            entry.semantic_key.clone(),
            entry.authority,
            entry.operation,
            entry.canonical_value.clone(),
            entry.source_ref.clone(),
        );
        if !unique.insert(identity) {
            return false;
        }
        lanes
            .entry((entry.semantic_key.clone(), entry.authority))
            .or_default()
            .push(entry);
    }
    lanes
        .values()
        .all(|entries| !constraints_contradict(entries))
}

fn constraint_value_valid(entry: &fielora_contracts::idr::CurrentSemanticConstraintV1) -> bool {
    match entry.operation {
        CurrentConstraintOperationV1::SuppressDurableKey => entry.canonical_value.is_none(),
        CurrentConstraintOperationV1::RequireValue | CurrentConstraintOperationV1::ForbidValue => {
            entry
                .canonical_value
                .as_ref()
                .is_some_and(|value| semantic_value_registered(&entry.semantic_key, value))
        }
    }
}

fn constraints_contradict(
    entries: &[&fielora_contracts::idr::CurrentSemanticConstraintV1],
) -> bool {
    let suppress = entries
        .iter()
        .any(|entry| entry.operation == CurrentConstraintOperationV1::SuppressDurableKey);
    if suppress && entries.len() > 1 {
        return true;
    }
    let required = entries
        .iter()
        .filter(|entry| entry.operation == CurrentConstraintOperationV1::RequireValue)
        .filter_map(|entry| entry.canonical_value.as_ref())
        .collect::<BTreeSet<_>>();
    if required.len() > 1 {
        return true;
    }
    required.iter().any(|value| {
        entries.iter().any(|entry| {
            entry.operation == CurrentConstraintOperationV1::ForbidValue
                && entry.canonical_value.as_ref() == Some(*value)
        })
    })
}

fn validate_reality_projection(
    projection: &RealityValidationProjectionV1,
) -> Result<(), ResolverHardFailureCodeV1> {
    if projection.contract_version != REALITY_PROJECTION_VERSION_V1
        || projection.projection_ref.is_empty()
        || projection.authority_revision_or_digest.is_empty()
        || fingerprint_reality_projection(projection) != projection.projection_digest
    {
        return Err(ResolverHardFailureCodeV1::InvalidRealityProjection);
    }
    let mut keys = BTreeSet::new();
    for entry in &projection.entries {
        if entry.reality_ref.is_empty()
            || entry.reality_ref.len() > 512
            || entry.authority_ref.is_empty()
            || entry.authority_ref.len() > 512
            || entry
                .current_fingerprint
                .as_deref()
                .is_some_and(|value| !is_sha256(value))
            || !keys.insert((entry.reality_kind, entry.reality_ref.clone()))
        {
            return Err(ResolverHardFailureCodeV1::InvalidRealityProjection);
        }
    }
    Ok(())
}

fn validate_source_availability(
    projection: &SourceAvailabilityProjectionV1,
) -> Result<(), ResolverHardFailureCodeV1> {
    if projection.contract_version != SOURCE_AVAILABILITY_VERSION_V1
        || projection.projection_ref.is_empty()
        || fingerprint_source_availability(projection) != projection.projection_digest
    {
        return Err(ResolverHardFailureCodeV1::InvalidSourceAvailabilityProjection);
    }
    let mut keys = BTreeSet::new();
    if projection.entries.iter().any(|entry| {
        entry.provenance_ref_id.is_empty()
            || entry.provenance_ref_id.len() > 512
            || !keys.insert(entry.provenance_ref_id.clone())
    }) {
        return Err(ResolverHardFailureCodeV1::InvalidSourceAvailabilityProjection);
    }
    Ok(())
}

fn validate_lineage(
    items: &HashMap<&str, &HumanModelItemRecord>,
) -> Result<LineageValidation, ResolverHardFailureCodeV1> {
    let mut successor_by_predecessor: HashMap<&str, &str> = HashMap::new();
    let mut incomplete = HashSet::new();
    for item in items.values() {
        let Some(predecessor_id) = item.supersedes_item_id.as_deref() else {
            continue;
        };
        if predecessor_id == item.item_id
            || successor_by_predecessor
                .insert(predecessor_id, item.item_id.as_str())
                .is_some()
        {
            return Err(ResolverHardFailureCodeV1::InvalidLineage);
        }
        if let Some(predecessor) = items.get(predecessor_id) {
            if !matches!(
                predecessor.lifecycle,
                HumanModelLifecycle::Superseded | HumanModelLifecycle::Revoked
            ) {
                return Err(ResolverHardFailureCodeV1::InvalidLineage);
            }
        } else {
            incomplete.insert(item.item_id.clone());
        }
    }

    let mut predecessors = HashMap::new();
    for item in items.values() {
        let mut chain = Vec::new();
        let mut seen = HashSet::new();
        let mut current = item.supersedes_item_id.as_deref();
        while let Some(predecessor_id) = current {
            if !seen.insert(predecessor_id) || predecessor_id == item.item_id {
                return Err(ResolverHardFailureCodeV1::InvalidLineage);
            }
            if chain.len() >= MAX_RESOLVER_LINEAGE_DEPTH_V1 {
                return Err(ResolverHardFailureCodeV1::ResolverInputLimit);
            }
            chain.push(predecessor_id.to_owned());
            current = items
                .get(predecessor_id)
                .and_then(|record| record.supersedes_item_id.as_deref());
        }
        predecessors.insert(item.item_id.clone(), chain);
    }
    Ok(LineageValidation {
        predecessors,
        incomplete,
    })
}

fn project_semantics(
    record: &HumanModelItemRecord,
) -> Result<
    (
        SemanticKeyV1,
        Option<PreferenceRelationV1>,
        CanonicalSemanticValueV1,
    ),
    ResolverReasonCodeV1,
> {
    match &record.payload {
        HumanModelPayloadV1::Fact(payload) => {
            if payload.qualifier.is_some() {
                return Err(ResolverReasonCodeV1::UnsupportedSemanticValue);
            }
            let key = SemanticKeyV1::HumanFact(payload.subject_key.clone());
            if !semantic_key_registered(&key) {
                return Err(ResolverReasonCodeV1::InvalidSemanticKey);
            }
            let value = match (&payload.subject_key[..], &payload.value) {
                ("fielora.human.primary_platform", FactValueV1::Token(value))
                    if matches!(value.as_str(), "windows" | "macos" | "linux") =>
                {
                    CanonicalSemanticValueV1::Token(value.clone())
                }
                ("fielora.human.communication_language", FactValueV1::Token(value))
                    if matches!(value.as_str(), "zh_cn" | "en" | "bilingual") =>
                {
                    CanonicalSemanticValueV1::Token(value.clone())
                }
                (
                    "fielora.human.accessibility_high_contrast_required",
                    FactValueV1::Boolean(value),
                ) => CanonicalSemanticValueV1::Boolean(*value),
                _ => return Err(ResolverReasonCodeV1::UnsupportedSemanticValue),
            };
            Ok((key, None, value))
        }
        HumanModelPayloadV1::Preference(payload) => {
            let key = SemanticKeyV1::BehaviorDimension(payload.dimension.clone());
            if !semantic_key_registered(&key) {
                return Err(ResolverReasonCodeV1::InvalidSemanticKey);
            }
            let relation = match payload.relation {
                PreferenceRelation::Prefer => PreferenceRelationV1::Prefer,
                PreferenceRelation::Avoid => PreferenceRelationV1::Avoid,
                PreferenceRelation::Tradeoff => {
                    return Err(ResolverReasonCodeV1::UnsupportedSemanticValue);
                }
            };
            let value = CanonicalSemanticValueV1::Token(payload.normalized_value.clone());
            if !semantic_value_registered(&key, &value) {
                return Err(ResolverReasonCodeV1::UnsupportedSemanticValue);
            }
            Ok((key, Some(relation), value))
        }
        HumanModelPayloadV1::Observation(payload) => {
            if !observation_registered(payload) {
                return Err(
                    if payload.observation_kind.starts_with("fielora.observation.") {
                        ResolverReasonCodeV1::UnsupportedSemanticValue
                    } else {
                        ResolverReasonCodeV1::InvalidSemanticKey
                    },
                );
            }
            Ok((
                SemanticKeyV1::ObservationItem(record.item_id.clone()),
                None,
                CanonicalSemanticValueV1::Token(payload.normalized_value.clone()),
            ))
        }
        HumanModelPayloadV1::Disposition(payload) => {
            let key = SemanticKeyV1::BehaviorDimension(payload.dimension.clone());
            if !semantic_key_registered(&key) {
                return Err(ResolverReasonCodeV1::InvalidSemanticKey);
            }
            let value = CanonicalSemanticValueV1::Token(payload.normalized_value.clone());
            if !semantic_value_registered(&key, &value) {
                return Err(ResolverReasonCodeV1::UnsupportedSemanticValue);
            }
            Ok((key, None, value))
        }
        HumanModelPayloadV1::LongTermGoal(payload) => {
            let key = SemanticKeyV1::LongTermGoal(payload.goal_key.clone());
            if !semantic_key_registered(&key) {
                return Err(ResolverReasonCodeV1::InvalidSemanticKey);
            }
            let value = CanonicalSemanticValueV1::Token(payload.desired_outcome.clone());
            if !semantic_value_registered(&key, &value) {
                return Err(ResolverReasonCodeV1::UnsupportedSemanticValue);
            }
            Ok((key, None, value))
        }
    }
}

/// Admission-time semantic registry check shared by the bounded acquisition
/// path. It projects only the typed payload and performs no storage I/O.
pub fn validate_registered_payload_v1(
    payload: &HumanModelPayloadV1,
) -> Result<(), ResolverReasonCodeV1> {
    let record = HumanModelItemRecord {
        item_id: "proposal-semantic-check".into(),
        contract_version: IDR_CONTRACT_VERSION,
        payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
        payload: payload.clone(),
        lifecycle: HumanModelLifecycle::Candidate,
        evidence_basis: EvidenceBasis::Explicit,
        inference_confidence: None,
        scope: DispositionScope::default(),
        supersedes_item_id: None,
        created_human_model_revision: 0,
        updated_human_model_revision: 0,
        created_at: 0,
        updated_at: 0,
        provenance_refs: Vec::new(),
        reality_dependencies: Vec::new(),
    };
    project_semantics(&record).map(|_| ())
}

fn semantic_key_registered(key: &SemanticKeyV1) -> bool {
    match key {
        SemanticKeyV1::HumanFact(key) => matches!(
            key.as_str(),
            "fielora.human.primary_platform"
                | "fielora.human.communication_language"
                | "fielora.human.accessibility_high_contrast_required"
        ),
        SemanticKeyV1::BehaviorDimension(key) => behavior_values(key).is_some(),
        SemanticKeyV1::ObservationItem(key) => !key.is_empty() && key.len() <= 512,
        SemanticKeyV1::LongTermGoal(key) => matches!(
            key.as_str(),
            "fielora.goal.product.provider_neutrality"
                | "fielora.goal.product.architecture_stability"
                | "fielora.goal.learning.capability_growth"
        ),
    }
}

fn semantic_value_registered(key: &SemanticKeyV1, value: &CanonicalSemanticValueV1) -> bool {
    match (key, value) {
        (SemanticKeyV1::BehaviorDimension(dimension), CanonicalSemanticValueV1::Token(value)) => {
            behavior_values(dimension).is_some_and(|values| values.contains(&value.as_str()))
        }
        (SemanticKeyV1::HumanFact(subject), CanonicalSemanticValueV1::Token(value))
            if subject == "fielora.human.primary_platform" =>
        {
            ["windows", "macos", "linux"].contains(&value.as_str())
        }
        (SemanticKeyV1::HumanFact(subject), CanonicalSemanticValueV1::Token(value))
            if subject == "fielora.human.communication_language" =>
        {
            ["zh_cn", "en", "bilingual"].contains(&value.as_str())
        }
        (SemanticKeyV1::HumanFact(subject), CanonicalSemanticValueV1::Boolean(_)) => {
            subject == "fielora.human.accessibility_high_contrast_required"
        }
        (SemanticKeyV1::LongTermGoal(key), CanonicalSemanticValueV1::Token(value)) => {
            matches!(
                (key.as_str(), value.as_str()),
                (
                    "fielora.goal.product.provider_neutrality",
                    "maintain_provider_neutrality"
                ) | (
                    "fielora.goal.product.architecture_stability",
                    "preserve_existing_architecture"
                ) | (
                    "fielora.goal.learning.capability_growth",
                    "develop_durable_capability"
                )
            )
        }
        _ => false,
    }
}

fn behavior_values(dimension: &str) -> Option<&'static [&'static str]> {
    match dimension {
        "fielora.workflow.mode" => Some(&[
            "sequential",
            "parallel_when_independent",
            "review_before_action",
        ]),
        "fielora.change_scope.mode" => Some(&[
            "minimal_delta",
            "bounded_change",
            "broad_change_when_explicit",
        ]),
        "fielora.verification.order" => {
            Some(&["targeted_first", "full_gate_first", "risk_proportional"])
        }
        "fielora.communication.detail" => Some(&["concise", "balanced", "detailed"]),
        "fielora.decision.presentation" => {
            Some(&["recommend_one", "present_options", "ask_before_choice"])
        }
        "fielora.risk.posture" => Some(&["conservative", "balanced", "expansive_within_mandate"]),
        "fielora.planning.mode" => Some(&["plan_first", "act_when_clear", "milestone_updates"]),
        "fielora.architecture.posture" => Some(&[
            "preserve_existing",
            "simplify_when_scoped",
            "review_before_structural_change",
        ]),
        _ => None,
    }
}

fn observation_registered(payload: &fielora_storage::idr::ObservationPayloadV1) -> bool {
    match payload.observation_kind.as_str() {
        "fielora.observation.user_choice" => payload
            .related_dimension
            .as_deref()
            .and_then(behavior_values)
            .is_some_and(|values| values.contains(&payload.normalized_value.as_str())),
        "fielora.observation.user_correction" => {
            payload.normalized_value == "corrected"
                && payload
                    .related_dimension
                    .as_deref()
                    .is_none_or(|dimension| behavior_values(dimension).is_some())
        }
        "fielora.observation.user_acceptance" => {
            payload.normalized_value == "accepted"
                && payload
                    .related_dimension
                    .as_deref()
                    .is_none_or(|dimension| behavior_values(dimension).is_some())
        }
        "fielora.observation.user_rejection" => {
            payload.normalized_value == "rejected"
                && payload
                    .related_dimension
                    .as_deref()
                    .is_none_or(|dimension| behavior_values(dimension).is_some())
        }
        "fielora.observation.agent_outcome" => {
            matches!(payload.normalized_value.as_str(), "succeeded" | "failed")
                && payload
                    .related_dimension
                    .as_deref()
                    .is_none_or(|dimension| behavior_values(dimension).is_some())
        }
        _ => false,
    }
}

fn normalize_and_match_scope(
    scope: &DispositionScope,
    context: &NormalizedResolutionContextV1,
) -> Result<(NormalizedScopeV1, ScopeSpecificityV1), ResolverReasonCodeV1> {
    let domain = match scope.domain.as_deref() {
        None => None,
        Some("CODING") => Some(DomainV1::Coding),
        Some(_) => return Err(ResolverReasonCodeV1::UnsupportedScopeValue),
    };
    let task_type = match scope.task_type.as_deref() {
        None => None,
        Some("FAST_EDIT") => Some(TaskTypeV1::FastEdit),
        Some("FOCUSED_EDIT") => Some(TaskTypeV1::FocusedEdit),
        Some("GENERAL") => Some(TaskTypeV1::General),
        Some(_) => return Err(ResolverReasonCodeV1::UnsupportedScopeValue),
    };
    let interaction_kind = match scope.interaction_kind.as_deref() {
        None => None,
        Some("TASK_EXECUTION") => Some(InteractionKindV1::TaskExecution),
        Some("FINAL_RESPONSE") => Some(InteractionKindV1::FinalResponse),
        Some("APPROVAL_EXPLANATION") => Some(InteractionKindV1::ApprovalExplanation),
        Some(_) => return Err(ResolverReasonCodeV1::UnsupportedScopeValue),
    };
    match_selector(scope.project_ref.as_ref(), &context.project)?;
    match_selector(domain.as_ref(), &context.domain)?;
    match_selector(task_type.as_ref(), &context.task_type)?;
    match_selector(interaction_kind.as_ref(), &context.interaction_kind)?;
    let selector_count = usize::from(scope.project_ref.is_some())
        + usize::from(domain.is_some())
        + usize::from(task_type.is_some())
        + usize::from(interaction_kind.is_some());
    let normalized = NormalizedScopeV1 {
        domain,
        project_ref: scope.project_ref.clone(),
        task_type,
        interaction_kind,
    };
    let specificity = ScopeSpecificityV1([
        u8::from(normalized.project_ref.is_some()),
        selector_count as u8,
        u8::from(normalized.task_type.is_some()),
        u8::from(normalized.interaction_kind.is_some()),
        u8::from(normalized.domain.is_some()),
    ]);
    Ok((normalized, specificity))
}

fn match_selector<T: PartialEq>(
    required: Option<&T>,
    current: &SelectorStateV1<T>,
) -> Result<(), ResolverReasonCodeV1> {
    let Some(required) = required else {
        return Ok(());
    };
    match current {
        SelectorStateV1::Known(current) if current == required => Ok(()),
        SelectorStateV1::Known(_) | SelectorStateV1::KnownAbsent => {
            Err(ResolverReasonCodeV1::ScopeMismatch)
        }
        SelectorStateV1::Unavailable => Err(ResolverReasonCodeV1::ScopeInputUnavailable),
    }
}

fn provenance_is_authoritative(record: &HumanModelItemRecord) -> bool {
    match (record.payload.kind(), record.evidence_basis) {
        (HumanModelKind::Fact, EvidenceBasis::Observed) => false,
        (
            HumanModelKind::Fact | HumanModelKind::Preference | HumanModelKind::LongTermGoal,
            EvidenceBasis::Explicit,
        ) => record
            .provenance_refs
            .iter()
            .any(human_controlled_provenance),
        (HumanModelKind::Observation, EvidenceBasis::Observed) => {
            record.provenance_refs.iter().any(|provenance| {
                matches!(
                    provenance.source_type,
                    ProvenanceSourceType::UserAction
                        | ProvenanceSourceType::UserCorrection
                        | ProvenanceSourceType::AgentOutcome
                )
            })
        }
        (HumanModelKind::Disposition, EvidenceBasis::Inferred) => {
            record
                .provenance_refs
                .iter()
                .any(|provenance| provenance.source_type == ProvenanceSourceType::SystemInference)
                && record.provenance_refs.iter().any(|provenance| {
                    provenance.admission_relation
                        == Some(ProvenanceAdmissionRelation::InferenceSupport)
                })
        }
        _ => false,
    }
}

fn human_controlled_provenance(provenance: &ProvenanceRefInput) -> bool {
    matches!(
        (provenance.source_type, provenance.admission_relation),
        (
            ProvenanceSourceType::ExplicitUserStatement,
            Some(ProvenanceAdmissionRelation::Explicit | ProvenanceAdmissionRelation::Confirmation)
        ) | (
            ProvenanceSourceType::ExplicitUserSetting,
            Some(ProvenanceAdmissionRelation::Explicit | ProvenanceAdmissionRelation::Confirmation)
        ) | (
            ProvenanceSourceType::UserCorrection,
            Some(
                ProvenanceAdmissionRelation::Correction | ProvenanceAdmissionRelation::Confirmation
            )
        ) | (
            ProvenanceSourceType::UserApprovedImport,
            Some(ProvenanceAdmissionRelation::Import | ProvenanceAdmissionRelation::Confirmation)
        )
    )
}

fn source_availability_reason(
    record: &HumanModelItemRecord,
    source_states: &HashMap<&str, SourceAvailabilityStateV1>,
) -> Option<ResolverReasonCodeV1> {
    let refs_requiring_live_state = record.provenance_refs.iter().filter(|provenance| {
        provenance.source_status_at_admission == ProvenanceSourceStatus::Revocable
            || (record.payload.kind() == HumanModelKind::Disposition
                && provenance.admission_relation
                    == Some(ProvenanceAdmissionRelation::InferenceSupport))
    });
    let mut unresolved = false;
    for provenance in refs_requiring_live_state {
        match source_states
            .get(provenance.provenance_ref_id.as_str())
            .copied()
        {
            Some(SourceAvailabilityStateV1::Available) => {}
            Some(SourceAvailabilityStateV1::Missing) => {
                return Some(ResolverReasonCodeV1::SourceMissing);
            }
            Some(SourceAvailabilityStateV1::Unresolved) | None => unresolved = true,
        }
    }
    unresolved.then_some(ResolverReasonCodeV1::SourceUnresolved)
}

fn validate_item_reality(
    record: &HumanModelItemRecord,
    projection: &HashMap<(RealityKindV1, &str), &RealityStateEntryV1>,
) -> Vec<ResolvedRealityRefV1> {
    let mut resolved = record
        .reality_dependencies
        .iter()
        .map(|dependency| {
            let kind = map_reality_kind(dependency.reality_kind);
            let state = projection
                .get(&(kind, dependency.reality_ref.as_str()))
                .map_or(RealityValidationStateV1::RealityUnresolved, |entry| {
                    evaluate_reality_dependency(dependency, entry)
                });
            ResolvedRealityRefV1 {
                reality_kind: kind,
                reality_ref: dependency.reality_ref.clone(),
                validation_state: state,
            }
        })
        .collect::<Vec<_>>();
    resolved.sort_by(|left, right| {
        left.reality_kind
            .cmp(&right.reality_kind)
            .then_with(|| left.reality_ref.cmp(&right.reality_ref))
    });
    resolved
}

fn evaluate_reality_dependency(
    dependency: &RealityDependencyInput,
    entry: &RealityStateEntryV1,
) -> RealityValidationStateV1 {
    match entry.availability {
        RealityAvailabilityV1::Missing => RealityValidationStateV1::StaleRealityRef,
        RealityAvailabilityV1::Unresolved => RealityValidationStateV1::RealityUnresolved,
        RealityAvailabilityV1::Available => match dependency.dependency_relation {
            RealityDependencyRelation::MustExist => RealityValidationStateV1::Valid,
            RealityDependencyRelation::RevisionMatch => match entry.current_revision {
                Some(revision) if Some(revision) == dependency.expected_revision => {
                    RealityValidationStateV1::Valid
                }
                Some(_) => RealityValidationStateV1::StaleRealityRef,
                None => RealityValidationStateV1::RealityUnresolved,
            },
            RealityDependencyRelation::FingerprintMatch => {
                match entry.current_fingerprint.as_deref() {
                    Some(fingerprint)
                        if Some(fingerprint) == dependency.expected_fingerprint.as_deref() =>
                    {
                        RealityValidationStateV1::Valid
                    }
                    Some(_) => RealityValidationStateV1::StaleRealityRef,
                    None => RealityValidationStateV1::RealityUnresolved,
                }
            }
        },
    }
}

enum ConstraintEvaluation {
    Compatible,
    Overridden(ResolverReasonCodeV1),
    Unresolved,
}

fn evaluate_constraints(
    key: &SemanticKeyV1,
    relation: Option<PreferenceRelationV1>,
    value: &CanonicalSemanticValueV1,
    constraints: &NormalizedCurrentConstraintsV1,
) -> ConstraintEvaluation {
    if !constraints.covered_semantic_keys.contains(key) {
        return ConstraintEvaluation::Unresolved;
    }
    let highest = constraints
        .entries
        .iter()
        .filter(|entry| &entry.semantic_key == key)
        .map(|entry| entry.authority.precedence())
        .max();
    let Some(highest) = highest else {
        return ConstraintEvaluation::Compatible;
    };
    let entries = constraints
        .entries
        .iter()
        .filter(|entry| &entry.semantic_key == key && entry.authority.precedence() == highest);
    for entry in entries {
        let overridden = match entry.operation {
            CurrentConstraintOperationV1::SuppressDurableKey => true,
            CurrentConstraintOperationV1::RequireValue => match relation {
                Some(PreferenceRelationV1::Avoid) => entry.canonical_value.as_ref() == Some(value),
                _ => entry.canonical_value.as_ref() != Some(value),
            },
            CurrentConstraintOperationV1::ForbidValue => match relation {
                Some(PreferenceRelationV1::Avoid) => false,
                _ => entry.canonical_value.as_ref() == Some(value),
            },
        };
        if overridden {
            return ConstraintEvaluation::Overridden(match entry.authority {
                CurrentConstraintAuthorityV1::CurrentExplicitUser => {
                    ResolverReasonCodeV1::CurrentInstructionOverride
                }
                CurrentConstraintAuthorityV1::CurrentReality => {
                    ResolverReasonCodeV1::CurrentRealityOverride
                }
                CurrentConstraintAuthorityV1::CurrentTaskProject => {
                    ResolverReasonCodeV1::CurrentTaskProjectOverride
                }
            });
        }
    }
    ConstraintEvaluation::Compatible
}

fn authority_class(candidate: &Candidate<'_>) -> (HumanModelKindV1, EvidenceBasisV1) {
    (candidate.kind, candidate.basis)
}

fn apply_scope_specificity<'a>(
    candidates: Vec<Candidate<'a>>,
    accumulator: &mut ResolutionAccumulator,
) -> Vec<Candidate<'a>> {
    let mut groups: BTreeMap<
        (SemanticKeyV1, HumanModelKindV1, EvidenceBasisV1),
        Vec<Candidate<'a>>,
    > = BTreeMap::new();
    for candidate in candidates {
        let class = authority_class(&candidate);
        groups
            .entry((candidate.key.clone(), class.0, class.1))
            .or_default()
            .push(candidate);
    }
    let mut retained = Vec::new();
    for ((_key, _kind, _basis), mut group) in groups {
        let maximum = group
            .iter()
            .map(|candidate| candidate.specificity)
            .max()
            .expect("non-empty specificity group");
        let selected_refs = group
            .iter()
            .filter(|candidate| candidate.specificity == maximum)
            .map(|candidate| candidate.record.item_id.clone())
            .collect::<Vec<_>>();
        group.sort_by(|left, right| left.record.item_id.cmp(&right.record.item_id));
        for candidate in group {
            if candidate.specificity == maximum {
                retained.push(candidate);
            } else {
                accumulator.suppress(
                    &candidate.record.item_id,
                    candidate.kind,
                    Some(candidate.key.clone()),
                    ResolverReasonCodeV1::LowerPrecedence,
                    &selected_refs,
                );
            }
        }
    }
    retained
}

fn resolve_semantic_groups<'a>(
    candidates: Vec<Candidate<'a>>,
    accumulator: &mut ResolutionAccumulator,
) {
    let mut groups: BTreeMap<SemanticKeyV1, Vec<Candidate<'a>>> = BTreeMap::new();
    for candidate in candidates {
        groups
            .entry(candidate.key.clone())
            .or_default()
            .push(candidate);
    }
    for (key, mut group) in groups {
        group.sort_by(|left, right| left.record.item_id.cmp(&right.record.item_id));
        match key {
            SemanticKeyV1::HumanFact(_) => resolve_facts(group, accumulator),
            SemanticKeyV1::BehaviorDimension(_) => resolve_behavior(group, accumulator),
            SemanticKeyV1::LongTermGoal(_) => resolve_goals(group, accumulator),
            SemanticKeyV1::ObservationItem(_) => {
                for candidate in group {
                    accumulator.suppress(
                        &candidate.record.item_id,
                        candidate.kind,
                        Some(candidate.key),
                        ResolverReasonCodeV1::NotEffectiveKind,
                        &[],
                    );
                }
            }
        }
    }
}

fn resolve_facts(group: Vec<Candidate<'_>>, accumulator: &mut ResolutionAccumulator) {
    let values = group
        .iter()
        .map(|candidate| candidate.value.clone())
        .collect::<BTreeSet<_>>();
    if values.len() > 1 {
        emit_unresolved_conflict(
            &group,
            HumanModelConflictKindV1::FactValueConflict,
            accumulator,
        );
        return;
    }
    let selected = group
        .iter()
        .min_by(|left, right| {
            fact_representation_order(left)
                .cmp(&fact_representation_order(right))
                .then_with(|| left.record.item_id.cmp(&right.record.item_id))
        })
        .expect("non-empty fact group");
    select_representative(selected, &group, accumulator);
}

fn fact_representation_order(candidate: &Candidate<'_>) -> u8 {
    match candidate.basis {
        EvidenceBasisV1::Explicit => 0,
        EvidenceBasisV1::Observed => 1,
        EvidenceBasisV1::Inferred => 2,
    }
}

fn resolve_behavior(group: Vec<Candidate<'_>>, accumulator: &mut ResolutionAccumulator) {
    let preferences = group
        .iter()
        .filter(|candidate| candidate.kind == HumanModelKindV1::Preference)
        .cloned()
        .collect::<Vec<_>>();
    let dispositions = group
        .iter()
        .filter(|candidate| candidate.kind == HumanModelKindV1::Disposition)
        .cloned()
        .collect::<Vec<_>>();

    let preference_outcome = resolve_preferences(&preferences, accumulator);
    if preference_outcome.conflicted {
        for disposition in &dispositions {
            accumulator.suppress(
                &disposition.record.item_id,
                disposition.kind,
                Some(disposition.key.clone()),
                ResolverReasonCodeV1::LowerPrecedence,
                &preference_outcome.member_refs,
            );
        }
        return;
    }

    let selected_preferences = preference_outcome.selected;
    if selected_preferences.is_empty() {
        for disposition in resolve_dispositions(&dispositions, accumulator).selected {
            accumulator.effective.push(to_resolved_item(&disposition));
        }
        return;
    }

    for preference in &selected_preferences {
        accumulator.effective.push(to_resolved_item(preference));
    }
    let mut compatible_dispositions = Vec::new();
    for disposition in dispositions {
        let incompatible = selected_preferences
            .iter()
            .filter(|preference| preference_conflicts_with_disposition(preference, &disposition))
            .collect::<Vec<_>>();
        if incompatible.is_empty() {
            compatible_dispositions.push(disposition);
            continue;
        }
        let selected_refs = incompatible
            .iter()
            .map(|candidate| candidate.record.item_id.clone())
            .collect::<Vec<_>>();
        accumulator.suppress(
            &disposition.record.item_id,
            disposition.kind,
            Some(disposition.key.clone()),
            ResolverReasonCodeV1::LowerPrecedence,
            &selected_refs,
        );
        let mut members = selected_refs.clone();
        members.push(disposition.record.item_id.clone());
        members.sort();
        accumulator.conflicts.push(HumanModelConflictV1 {
            semantic_key: disposition.key.clone(),
            conflict_kind: HumanModelConflictKindV1::ResolvedByExplicitAuthority,
            state: HumanModelConflictStateV1::Resolved,
            member_item_refs: bounded_refs(members),
            selected_item_refs: bounded_refs(selected_refs),
            suppressed_item_refs: vec![disposition.record.item_id.clone()],
            reason_codes: vec![ResolverReasonCodeV1::LowerPrecedence],
        });
    }
    for disposition in resolve_dispositions(&compatible_dispositions, accumulator).selected {
        accumulator.effective.push(to_resolved_item(&disposition));
    }
}

struct PreferenceOutcome<'a> {
    selected: Vec<Candidate<'a>>,
    conflicted: bool,
    member_refs: Vec<String>,
}

fn resolve_preferences<'a>(
    preferences: &[Candidate<'a>],
    accumulator: &mut ResolutionAccumulator,
) -> PreferenceOutcome<'a> {
    if preferences.is_empty() {
        return PreferenceOutcome {
            selected: Vec::new(),
            conflicted: false,
            member_refs: Vec::new(),
        };
    }
    let mut unique: BTreeMap<(PreferenceRelationV1, CanonicalSemanticValueV1), Candidate<'a>> =
        BTreeMap::new();
    for preference in preferences {
        let key = (
            preference.relation.expect("preference relation"),
            preference.value.clone(),
        );
        if let Some(existing) = unique.get(&key) {
            accumulator.suppress(
                &preference.record.item_id,
                preference.kind,
                Some(preference.key.clone()),
                ResolverReasonCodeV1::SemanticDuplicate,
                std::slice::from_ref(&existing.record.item_id),
            );
        } else {
            unique.insert(key, preference.clone());
        }
    }
    let selected = unique.values().cloned().collect::<Vec<_>>();
    let preferred_values = selected
        .iter()
        .filter(|candidate| candidate.relation == Some(PreferenceRelationV1::Prefer))
        .map(|candidate| candidate.value.clone())
        .collect::<BTreeSet<_>>();
    let direct_conflict = selected.iter().any(|left| {
        selected.iter().any(|right| {
            left.relation == Some(PreferenceRelationV1::Prefer)
                && right.relation == Some(PreferenceRelationV1::Avoid)
                && left.value == right.value
        })
    });
    if preferred_values.len() > 1 || direct_conflict {
        emit_unresolved_conflict(
            &selected,
            HumanModelConflictKindV1::PreferenceConflict,
            accumulator,
        );
        return PreferenceOutcome {
            member_refs: selected
                .iter()
                .map(|candidate| candidate.record.item_id.clone())
                .collect(),
            selected: Vec::new(),
            conflicted: true,
        };
    }
    PreferenceOutcome {
        selected,
        conflicted: false,
        member_refs: Vec::new(),
    }
}

struct DispositionOutcome<'a> {
    selected: Vec<Candidate<'a>>,
}

fn resolve_dispositions<'a>(
    dispositions: &[Candidate<'a>],
    accumulator: &mut ResolutionAccumulator,
) -> DispositionOutcome<'a> {
    if dispositions.is_empty() {
        return DispositionOutcome {
            selected: Vec::new(),
        };
    }
    let values = dispositions
        .iter()
        .map(|candidate| candidate.value.clone())
        .collect::<BTreeSet<_>>();
    if values.len() > 1 {
        emit_unresolved_conflict(
            dispositions,
            HumanModelConflictKindV1::DispositionConflict,
            accumulator,
        );
        return DispositionOutcome {
            selected: Vec::new(),
        };
    }
    let selected = dispositions
        .iter()
        .min_by(|left, right| disposition_representation_order(left, right))
        .expect("non-empty disposition group")
        .clone();
    for candidate in dispositions {
        if candidate.record.item_id != selected.record.item_id {
            accumulator.suppress(
                &candidate.record.item_id,
                candidate.kind,
                Some(candidate.key.clone()),
                ResolverReasonCodeV1::SemanticDuplicate,
                std::slice::from_ref(&selected.record.item_id),
            );
        }
    }
    DispositionOutcome {
        selected: vec![selected],
    }
}

fn disposition_representation_order(left: &Candidate<'_>, right: &Candidate<'_>) -> Ordering {
    if left.scope == right.scope {
        confidence_rank(right.confidence)
            .cmp(&confidence_rank(left.confidence))
            .then_with(|| left.record.item_id.cmp(&right.record.item_id))
    } else {
        left.scope
            .cmp(&right.scope)
            .then_with(|| left.record.item_id.cmp(&right.record.item_id))
    }
}

fn confidence_rank(confidence: Option<InferenceConfidenceV1>) -> u8 {
    match confidence {
        Some(InferenceConfidenceV1::High) => 3,
        Some(InferenceConfidenceV1::Medium) => 2,
        Some(InferenceConfidenceV1::Low) => 1,
        None => 0,
    }
}

fn preference_conflicts_with_disposition(
    preference: &Candidate<'_>,
    disposition: &Candidate<'_>,
) -> bool {
    match preference.relation {
        Some(PreferenceRelationV1::Prefer) => preference.value != disposition.value,
        Some(PreferenceRelationV1::Avoid) => preference.value == disposition.value,
        None => false,
    }
}

fn resolve_goals(group: Vec<Candidate<'_>>, accumulator: &mut ResolutionAccumulator) {
    let values = group
        .iter()
        .map(|candidate| candidate.value.clone())
        .collect::<BTreeSet<_>>();
    if values.len() > 1 {
        emit_unresolved_conflict(&group, HumanModelConflictKindV1::GoalConflict, accumulator);
        return;
    }
    let selected = group
        .iter()
        .min_by_key(|candidate| candidate.record.item_id.as_str())
        .expect("non-empty goal group");
    select_representative(selected, &group, accumulator);
}

fn select_representative(
    selected: &Candidate<'_>,
    group: &[Candidate<'_>],
    accumulator: &mut ResolutionAccumulator,
) {
    accumulator.effective.push(to_resolved_item(selected));
    for candidate in group {
        if candidate.record.item_id != selected.record.item_id {
            accumulator.suppress(
                &candidate.record.item_id,
                candidate.kind,
                Some(candidate.key.clone()),
                ResolverReasonCodeV1::SemanticDuplicate,
                std::slice::from_ref(&selected.record.item_id),
            );
        }
    }
}

fn emit_unresolved_conflict(
    group: &[Candidate<'_>],
    kind: HumanModelConflictKindV1,
    accumulator: &mut ResolutionAccumulator,
) {
    let refs = group
        .iter()
        .map(|candidate| candidate.record.item_id.clone())
        .collect::<Vec<_>>();
    let key = group.first().expect("non-empty conflict group").key.clone();
    accumulator.conflicts.push(HumanModelConflictV1 {
        semantic_key: key.clone(),
        conflict_kind: kind,
        state: HumanModelConflictStateV1::Unresolved,
        member_item_refs: bounded_refs(refs.clone()),
        selected_item_refs: Vec::new(),
        suppressed_item_refs: bounded_refs(refs.clone()),
        reason_codes: vec![ResolverReasonCodeV1::SemanticConflict],
    });
    for candidate in group {
        accumulator.suppress(
            &candidate.record.item_id,
            candidate.kind,
            Some(key.clone()),
            ResolverReasonCodeV1::SemanticConflict,
            &[],
        );
    }
}

fn bounded_refs(mut refs: Vec<String>) -> Vec<String> {
    refs.sort();
    refs.dedup();
    refs.truncate(MAX_RESOLVER_CONFLICT_ITEM_REFS_V1);
    refs
}

fn to_resolved_item(candidate: &Candidate<'_>) -> ResolvedHumanModelItemV1 {
    let mut provenance_ref_ids = candidate.provenance_refs.clone();
    let omitted = provenance_ref_ids
        .len()
        .saturating_sub(MAX_RESOLVED_PROVENANCE_REFS_V1);
    provenance_ref_ids.truncate(MAX_RESOLVED_PROVENANCE_REFS_V1);
    let mut reason_codes = Vec::new();
    if candidate.lineage_incomplete {
        reason_codes.push(ResolverReasonCodeV1::LineagePredecessorUnavailable);
    }
    ResolvedHumanModelItemV1 {
        item_id: candidate.record.item_id.clone(),
        kind: candidate.kind,
        semantic_key: candidate.key.clone(),
        relation: candidate.relation,
        canonical_value: candidate.value.clone(),
        matched_scope: candidate.scope.clone(),
        scope_specificity: candidate.specificity,
        evidence_basis: candidate.basis,
        inference_confidence: candidate.confidence,
        provenance_ref_ids,
        omitted_provenance_ref_count: omitted as u32,
        reality_validation: candidate.reality_validation.clone(),
        current_constraint_state: candidate.constraint_state,
        resolution_reason_codes: reason_codes,
        lineage_predecessor_refs: candidate.lineage_predecessors.clone(),
        lineage_incomplete: candidate.lineage_incomplete,
    }
}

fn finalize_view(
    input: ResolveHumanModelInputV1<'_>,
    mut accumulator: ResolutionAccumulator,
) -> Result<ResolvedHumanModelViewV1, ResolverHardFailureCodeV1> {
    accumulator.effective.sort_by(effective_order);
    accumulator.conflicts.sort_by(conflict_order);
    let total_conflicts = accumulator.conflicts.len();
    let omitted_conflicts = accumulator
        .conflicts
        .split_off(total_conflicts.min(MAX_RESOLVER_CONFLICT_RECORDS_V1));

    let mut suppressions = accumulator.suppressions.into_values().collect::<Vec<_>>();
    suppressions.sort_by(|left, right| {
        left.item_id
            .cmp(&right.item_id)
            .then_with(|| left.reason_codes.cmp(&right.reason_codes))
    });
    let total_suppressions = suppressions.len();
    let omitted_suppressions =
        suppressions.split_off(total_suppressions.min(MAX_RESOLVER_SUPPRESSION_RECORDS_V1));

    let diagnostics_summary = ResolverDiagnosticsSummaryV1 {
        total_suppression_count: total_suppressions as u32,
        omitted_suppression_count: omitted_suppressions.len() as u32,
        omitted_suppression_digest: (!omitted_suppressions.is_empty())
            .then(|| digest_suppressions(&omitted_suppressions)),
        total_conflict_count: total_conflicts as u32,
        omitted_conflict_count: omitted_conflicts.len() as u32,
        omitted_conflict_digest: (!omitted_conflicts.is_empty())
            .then(|| digest_conflicts(&omitted_conflicts)),
    };

    let canonical_result_digest = digest_resolved_result(
        &accumulator.effective,
        &accumulator.conflicts,
        &suppressions,
        &diagnostics_summary,
    );
    let resolution_ref = fingerprint_resolution_ref(
        input.snapshot.human_model_revision,
        input.resolution_context,
        input.reality_projection,
        input.source_availability,
        &canonical_result_digest,
    );
    Ok(ResolvedHumanModelViewV1 {
        resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
        resolver_version: RESOLVER_VERSION_V1.to_owned(),
        semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1.to_owned(),
        resolution_profile_version: RESOLUTION_PROFILE_VERSION_V1.to_owned(),
        source_human_model_revision: input.snapshot.human_model_revision,
        resolution_context: ResolvedViewContextBindingV1 {
            context_ref: input.resolution_context.context_ref.clone(),
            context_fingerprint: input.resolution_context.context_fingerprint.clone(),
            reality_projection_ref: input.reality_projection.projection_ref.clone(),
            reality_projection_digest: input.reality_projection.projection_digest.clone(),
            source_availability_ref: input.source_availability.projection_ref.clone(),
            source_availability_digest: input.source_availability.projection_digest.clone(),
            current_constraints_ref: input
                .resolution_context
                .current_constraints
                .constraint_set_ref
                .clone(),
            current_constraints_digest: input
                .resolution_context
                .current_constraints
                .constraints_digest
                .clone(),
        },
        resolution_ref,
        effective_items: accumulator.effective,
        conflicts: accumulator.conflicts,
        suppressed: suppressions,
        diagnostics_summary,
        canonical_result_digest,
    })
}

fn effective_order(left: &ResolvedHumanModelItemV1, right: &ResolvedHumanModelItemV1) -> Ordering {
    effective_family_order(&left.semantic_key)
        .cmp(&effective_family_order(&right.semantic_key))
        .then_with(|| {
            left.semantic_key
                .canonical_token()
                .cmp(&right.semantic_key.canonical_token())
        })
        .then_with(|| behavior_kind_order(left.kind).cmp(&behavior_kind_order(right.kind)))
        .then_with(|| right.scope_specificity.cmp(&left.scope_specificity))
        .then_with(|| left.relation.cmp(&right.relation))
        .then_with(|| left.canonical_value.cmp(&right.canonical_value))
        .then_with(|| left.item_id.cmp(&right.item_id))
}

fn effective_family_order(key: &SemanticKeyV1) -> u8 {
    match key {
        SemanticKeyV1::HumanFact(_) => 0,
        SemanticKeyV1::BehaviorDimension(_) => 1,
        SemanticKeyV1::LongTermGoal(_) => 2,
        SemanticKeyV1::ObservationItem(_) => 3,
    }
}

fn behavior_kind_order(kind: HumanModelKindV1) -> u8 {
    match kind {
        HumanModelKindV1::Preference => 0,
        HumanModelKindV1::Disposition => 1,
        HumanModelKindV1::Fact => 0,
        HumanModelKindV1::LongTermGoal => 0,
        HumanModelKindV1::Observation => 2,
    }
}

fn conflict_order(left: &HumanModelConflictV1, right: &HumanModelConflictV1) -> Ordering {
    left.semantic_key
        .cmp(&right.semantic_key)
        .then_with(|| left.conflict_kind.cmp(&right.conflict_kind))
        .then_with(|| left.member_item_refs.cmp(&right.member_item_refs))
}

pub fn fingerprint_current_constraints(constraints: &NormalizedCurrentConstraintsV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_CURRENT_CONSTRAINTS);
    encoder.field_u16("contract_version", constraints.contract_version);
    encoder.field_str("constraint_set_ref", &constraints.constraint_set_ref);
    let mut covered = constraints
        .covered_semantic_keys
        .iter()
        .map(encode_semantic_key)
        .collect::<Vec<_>>();
    covered.sort();
    encoder.field_list("covered_semantic_keys", &covered);
    let mut entries = constraints
        .entries
        .iter()
        .map(|entry| {
            let mut nested = CanonicalEncoderV1::new("CURRENT_CONSTRAINT_ENTRY_V1");
            nested.field_str("authority", current_authority_token(entry.authority));
            nested.field_bytes("semantic_key", &encode_semantic_key(&entry.semantic_key));
            nested.field_str("operation", current_operation_token(entry.operation));
            if let Some(value) = &entry.canonical_value {
                nested.field_bytes("canonical_value", &encode_value(value));
            } else {
                nested.field_absent("canonical_value");
            }
            nested.field_str("source_ref", &entry.source_ref);
            nested.field_str("source_digest", &entry.source_digest);
            nested.finish()
        })
        .collect::<Vec<_>>();
    entries.sort();
    encoder.field_list("entries", &entries);
    sha256(&encoder.finish())
}

pub fn fingerprint_resolution_context(context: &NormalizedResolutionContextV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_CONTEXT);
    encoder.field_u16("contract_version", context.contract_version);
    encoder.field_str("context_ref", &context.context_ref);
    encode_selector(&mut encoder, "project", &context.project, |value| {
        value.as_bytes().to_vec()
    });
    encode_selector(&mut encoder, "domain", &context.domain, |value| {
        value.as_token().as_bytes().to_vec()
    });
    encode_selector(&mut encoder, "task_type", &context.task_type, |value| {
        value.as_token().as_bytes().to_vec()
    });
    encode_selector(
        &mut encoder,
        "interaction_kind",
        &context.interaction_kind,
        |value| value.as_token().as_bytes().to_vec(),
    );
    encoder.field_str(
        "current_constraints_digest",
        &context.current_constraints.constraints_digest,
    );
    sha256(&encoder.finish())
}

fn encode_selector<T>(
    encoder: &mut CanonicalEncoderV1,
    tag: &str,
    selector: &SelectorStateV1<T>,
    encode: impl Fn(&T) -> Vec<u8>,
) {
    match selector {
        SelectorStateV1::Known(value) => {
            let mut bytes = b"KNOWN\0".to_vec();
            bytes.extend_from_slice(&encode(value));
            encoder.field_bytes(tag, &bytes);
        }
        SelectorStateV1::KnownAbsent => encoder.field_str(tag, "KNOWN_ABSENT"),
        SelectorStateV1::Unavailable => encoder.field_str(tag, "UNAVAILABLE"),
    }
}

pub fn fingerprint_reality_projection(projection: &RealityValidationProjectionV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_REALITY_PROJECTION);
    encoder.field_u16("contract_version", projection.contract_version);
    encoder.field_str("projection_ref", &projection.projection_ref);
    encoder.field_str(
        "authority_revision_or_digest",
        &projection.authority_revision_or_digest,
    );
    let mut entries = projection
        .entries
        .iter()
        .map(|entry| {
            let mut nested = CanonicalEncoderV1::new("REALITY_STATE_ENTRY_V1");
            nested.field_str("reality_kind", reality_kind_token(entry.reality_kind));
            nested.field_str("reality_ref", &entry.reality_ref);
            nested.field_str(
                "availability",
                reality_availability_token(entry.availability),
            );
            if let Some(value) = entry.current_revision {
                nested.field_u64("current_revision", value);
            } else {
                nested.field_absent("current_revision");
            }
            if let Some(value) = &entry.current_state_ref {
                nested.field_str("current_state_ref", value);
            } else {
                nested.field_absent("current_state_ref");
            }
            if let Some(value) = &entry.current_fingerprint {
                nested.field_str("current_fingerprint", value);
            } else {
                nested.field_absent("current_fingerprint");
            }
            nested.field_str("authority_ref", &entry.authority_ref);
            nested.finish()
        })
        .collect::<Vec<_>>();
    entries.sort();
    encoder.field_list("entries", &entries);
    sha256(&encoder.finish())
}

pub fn fingerprint_source_availability(projection: &SourceAvailabilityProjectionV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_SOURCE_AVAILABILITY);
    encoder.field_u16("contract_version", projection.contract_version);
    encoder.field_str("projection_ref", &projection.projection_ref);
    let mut entries = projection
        .entries
        .iter()
        .map(|entry| {
            let mut nested = CanonicalEncoderV1::new("SOURCE_AVAILABILITY_ENTRY_V1");
            nested.field_str("provenance_ref_id", &entry.provenance_ref_id);
            nested.field_str("state", source_state_token(entry.state));
            nested.finish()
        })
        .collect::<Vec<_>>();
    entries.sort();
    encoder.field_list("entries", &entries);
    sha256(&encoder.finish())
}

pub fn fingerprint_project_reality(project_ref: &str, revision: u64) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_REALITY_FINGERPRINT);
    encoder.field_str("kind", "PROJECT");
    encoder.field_str("reality_ref", project_ref);
    encoder.field_u64("current_revision", revision);
    encoder.field_absent("current_state_ref");
    sha256(&encoder.finish())
}

pub fn fingerprint_artifact_reality(artifact_ref: &str, current_revision_ref: &str) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_REALITY_FINGERPRINT);
    encoder.field_str("kind", "ARTIFACT");
    encoder.field_str("reality_ref", artifact_ref);
    encoder.field_absent("current_revision");
    encoder.field_str("current_state_ref", current_revision_ref);
    sha256(&encoder.finish())
}

fn fingerprint_resolution_ref(
    revision: u64,
    context: &NormalizedResolutionContextV1,
    reality: &RealityValidationProjectionV1,
    source: &SourceAvailabilityProjectionV1,
    canonical_result_digest: &str,
) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_RESOLUTION_REF);
    encoder.field_u16("resolver_contract_version", RESOLVER_CONTRACT_VERSION_V1);
    encoder.field_str("resolver_version", RESOLVER_VERSION_V1);
    encoder.field_str("semantic_registry_version", SEMANTIC_REGISTRY_VERSION_V1);
    encoder.field_str("resolution_profile_version", RESOLUTION_PROFILE_VERSION_V1);
    encoder.field_u64("source_human_model_revision", revision);
    encoder.field_str(
        "resolution_context_fingerprint",
        &context.context_fingerprint,
    );
    encoder.field_str("reality_projection_digest", &reality.projection_digest);
    encoder.field_str("source_availability_digest", &source.projection_digest);
    encoder.field_str(
        "current_constraints_digest",
        &context.current_constraints.constraints_digest,
    );
    encoder.field_str("canonical_result_digest", canonical_result_digest);
    sha256(&encoder.finish())
}

fn digest_resolved_result(
    effective: &[ResolvedHumanModelItemV1],
    conflicts: &[HumanModelConflictV1],
    suppressions: &[HumanModelSuppressionV1],
    summary: &ResolverDiagnosticsSummaryV1,
) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_RESOLVED_VIEW);
    encoder.field_list(
        "effective_items",
        &effective
            .iter()
            .map(encode_effective_item)
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "conflicts",
        &conflicts.iter().map(encode_conflict).collect::<Vec<_>>(),
    );
    encoder.field_list(
        "suppressed",
        &suppressions
            .iter()
            .map(encode_suppression)
            .collect::<Vec<_>>(),
    );
    encoder.field_u32(
        "omitted_suppression_count",
        summary.omitted_suppression_count,
    );
    if let Some(value) = &summary.omitted_suppression_digest {
        encoder.field_str("omitted_suppression_digest", value);
    } else {
        encoder.field_absent("omitted_suppression_digest");
    }
    encoder.field_u32("omitted_conflict_count", summary.omitted_conflict_count);
    if let Some(value) = &summary.omitted_conflict_digest {
        encoder.field_str("omitted_conflict_digest", value);
    } else {
        encoder.field_absent("omitted_conflict_digest");
    }
    sha256(&encoder.finish())
}

fn digest_suppressions(values: &[HumanModelSuppressionV1]) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_DIAGNOSTIC_OVERFLOW);
    encoder.field_list(
        "suppressions",
        &values.iter().map(encode_suppression).collect::<Vec<_>>(),
    );
    sha256(&encoder.finish())
}

fn digest_conflicts(values: &[HumanModelConflictV1]) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_DIAGNOSTIC_OVERFLOW);
    encoder.field_list(
        "conflicts",
        &values.iter().map(encode_conflict).collect::<Vec<_>>(),
    );
    sha256(&encoder.finish())
}

fn encode_effective_item(item: &ResolvedHumanModelItemV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("RESOLVED_HUMAN_MODEL_ITEM_V1");
    encoder.field_str("item_id", &item.item_id);
    encoder.field_str("kind", kind_token(item.kind));
    encoder.field_bytes("semantic_key", &encode_semantic_key(&item.semantic_key));
    if let Some(relation) = item.relation {
        encoder.field_str("relation", preference_relation_token(relation));
    } else {
        encoder.field_absent("relation");
    }
    encoder.field_bytes("canonical_value", &encode_value(&item.canonical_value));
    encoder.field_bytes("matched_scope", &encode_scope(&item.matched_scope));
    encoder.field_bytes("scope_specificity", &item.scope_specificity.0);
    encoder.field_str("evidence_basis", basis_token(item.evidence_basis));
    if let Some(confidence) = item.inference_confidence {
        encoder.field_str("inference_confidence", confidence_token(confidence));
    } else {
        encoder.field_absent("inference_confidence");
    }
    encoder.field_list(
        "provenance_ref_ids",
        &item
            .provenance_ref_ids
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_u32(
        "omitted_provenance_ref_count",
        item.omitted_provenance_ref_count,
    );
    encoder.field_list(
        "reality_validation",
        &item
            .reality_validation
            .iter()
            .map(encode_reality_ref)
            .collect::<Vec<_>>(),
    );
    encoder.field_str(
        "current_constraint_state",
        constraint_state_token(item.current_constraint_state),
    );
    encoder.field_list(
        "resolution_reason_codes",
        &item
            .resolution_reason_codes
            .iter()
            .map(|reason| reason.as_token().as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "lineage_predecessor_refs",
        &item
            .lineage_predecessor_refs
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_bytes("lineage_incomplete", &[u8::from(item.lineage_incomplete)]);
    encoder.finish()
}

fn encode_conflict(conflict: &HumanModelConflictV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("HUMAN_MODEL_CONFLICT_V1");
    encoder.field_bytes("semantic_key", &encode_semantic_key(&conflict.semantic_key));
    encoder.field_str("conflict_kind", conflict_kind_token(conflict.conflict_kind));
    encoder.field_str("state", conflict_state_token(conflict.state));
    encoder.field_list(
        "member_item_refs",
        &conflict
            .member_item_refs
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "selected_item_refs",
        &conflict
            .selected_item_refs
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "suppressed_item_refs",
        &conflict
            .suppressed_item_refs
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "reason_codes",
        &conflict
            .reason_codes
            .iter()
            .map(|reason| reason.as_token().as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.finish()
}

fn encode_suppression(suppression: &HumanModelSuppressionV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("HUMAN_MODEL_SUPPRESSION_V1");
    encoder.field_str("item_id", &suppression.item_id);
    encoder.field_str("kind", kind_token(suppression.kind));
    if let Some(key) = &suppression.semantic_key {
        encoder.field_bytes("semantic_key", &encode_semantic_key(key));
    } else {
        encoder.field_absent("semantic_key");
    }
    encoder.field_list(
        "reason_codes",
        &suppression
            .reason_codes
            .iter()
            .map(|reason| reason.as_token().as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.field_list(
        "selected_by_item_refs",
        &suppression
            .selected_by_item_refs
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>(),
    );
    encoder.finish()
}

fn encode_semantic_key(key: &SemanticKeyV1) -> Vec<u8> {
    key.canonical_token().into_bytes()
}

fn encode_value(value: &CanonicalSemanticValueV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("CANONICAL_SEMANTIC_VALUE_V1");
    match value {
        CanonicalSemanticValueV1::Token(value) => encoder.field_str("token", value),
        CanonicalSemanticValueV1::Boolean(value) => {
            encoder.field_bytes("boolean", &[u8::from(*value)])
        }
    }
    encoder.finish()
}

fn encode_scope(scope: &NormalizedScopeV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("NORMALIZED_SCOPE_V1");
    if let Some(value) = scope.domain {
        encoder.field_str("domain", value.as_token());
    } else {
        encoder.field_absent("domain");
    }
    if let Some(value) = &scope.project_ref {
        encoder.field_str("project_ref", value);
    } else {
        encoder.field_absent("project_ref");
    }
    if let Some(value) = scope.task_type {
        encoder.field_str("task_type", value.as_token());
    } else {
        encoder.field_absent("task_type");
    }
    if let Some(value) = scope.interaction_kind {
        encoder.field_str("interaction_kind", value.as_token());
    } else {
        encoder.field_absent("interaction_kind");
    }
    encoder.finish()
}

fn encode_reality_ref(reference: &ResolvedRealityRefV1) -> Vec<u8> {
    let mut encoder = CanonicalEncoderV1::new("RESOLVED_REALITY_REF_V1");
    encoder.field_str("reality_kind", reality_kind_token(reference.reality_kind));
    encoder.field_str("reality_ref", &reference.reality_ref);
    encoder.field_str(
        "validation_state",
        reality_validation_token(reference.validation_state),
    );
    encoder.finish()
}

fn map_kind(kind: HumanModelKind) -> HumanModelKindV1 {
    match kind {
        HumanModelKind::Fact => HumanModelKindV1::Fact,
        HumanModelKind::Preference => HumanModelKindV1::Preference,
        HumanModelKind::Observation => HumanModelKindV1::Observation,
        HumanModelKind::Disposition => HumanModelKindV1::Disposition,
        HumanModelKind::LongTermGoal => HumanModelKindV1::LongTermGoal,
    }
}

fn map_basis(basis: EvidenceBasis) -> EvidenceBasisV1 {
    match basis {
        EvidenceBasis::Explicit => EvidenceBasisV1::Explicit,
        EvidenceBasis::Observed => EvidenceBasisV1::Observed,
        EvidenceBasis::Inferred => EvidenceBasisV1::Inferred,
    }
}

fn map_confidence(confidence: InferenceConfidence) -> InferenceConfidenceV1 {
    match confidence {
        InferenceConfidence::Low => InferenceConfidenceV1::Low,
        InferenceConfidence::Medium => InferenceConfidenceV1::Medium,
        InferenceConfidence::High => InferenceConfidenceV1::High,
    }
}

fn map_reality_kind(kind: RealityKind) -> RealityKindV1 {
    match kind {
        RealityKind::Project => RealityKindV1::Project,
        RealityKind::Artifact => RealityKindV1::Artifact,
        RealityKind::Decision => RealityKindV1::Decision,
        RealityKind::Verification => RealityKindV1::Verification,
        RealityKind::FieldObject => RealityKindV1::FieldObject,
    }
}

fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn current_authority_token(value: CurrentConstraintAuthorityV1) -> &'static str {
    match value {
        CurrentConstraintAuthorityV1::CurrentExplicitUser => "CURRENT_EXPLICIT_USER",
        CurrentConstraintAuthorityV1::CurrentReality => "CURRENT_REALITY",
        CurrentConstraintAuthorityV1::CurrentTaskProject => "CURRENT_TASK_PROJECT",
    }
}

fn current_operation_token(value: CurrentConstraintOperationV1) -> &'static str {
    match value {
        CurrentConstraintOperationV1::RequireValue => "REQUIRE_VALUE",
        CurrentConstraintOperationV1::ForbidValue => "FORBID_VALUE",
        CurrentConstraintOperationV1::SuppressDurableKey => "SUPPRESS_DURABLE_KEY",
    }
}

fn reality_kind_token(value: RealityKindV1) -> &'static str {
    match value {
        RealityKindV1::Project => "PROJECT",
        RealityKindV1::Artifact => "ARTIFACT",
        RealityKindV1::Decision => "DECISION",
        RealityKindV1::Verification => "VERIFICATION",
        RealityKindV1::FieldObject => "FIELD_OBJECT",
    }
}

fn reality_availability_token(value: RealityAvailabilityV1) -> &'static str {
    match value {
        RealityAvailabilityV1::Available => "AVAILABLE",
        RealityAvailabilityV1::Missing => "MISSING",
        RealityAvailabilityV1::Unresolved => "UNRESOLVED",
    }
}

fn source_state_token(value: SourceAvailabilityStateV1) -> &'static str {
    match value {
        SourceAvailabilityStateV1::Available => "AVAILABLE",
        SourceAvailabilityStateV1::Missing => "MISSING",
        SourceAvailabilityStateV1::Unresolved => "UNRESOLVED",
    }
}

fn kind_token(value: HumanModelKindV1) -> &'static str {
    match value {
        HumanModelKindV1::Fact => "FACT",
        HumanModelKindV1::Preference => "PREFERENCE",
        HumanModelKindV1::Observation => "OBSERVATION",
        HumanModelKindV1::Disposition => "DISPOSITION",
        HumanModelKindV1::LongTermGoal => "LONG_TERM_GOAL",
    }
}

fn basis_token(value: EvidenceBasisV1) -> &'static str {
    match value {
        EvidenceBasisV1::Explicit => "EXPLICIT",
        EvidenceBasisV1::Observed => "OBSERVED",
        EvidenceBasisV1::Inferred => "INFERRED",
    }
}

fn confidence_token(value: InferenceConfidenceV1) -> &'static str {
    match value {
        InferenceConfidenceV1::Low => "LOW",
        InferenceConfidenceV1::Medium => "MEDIUM",
        InferenceConfidenceV1::High => "HIGH",
    }
}

fn preference_relation_token(value: PreferenceRelationV1) -> &'static str {
    match value {
        PreferenceRelationV1::Prefer => "PREFER",
        PreferenceRelationV1::Avoid => "AVOID",
    }
}

fn constraint_state_token(value: CurrentConstraintStateV1) -> &'static str {
    match value {
        CurrentConstraintStateV1::Compatible => "COMPATIBLE",
        CurrentConstraintStateV1::Overridden => "OVERRIDDEN",
        CurrentConstraintStateV1::Unresolved => "UNRESOLVED",
    }
}

fn reality_validation_token(value: RealityValidationStateV1) -> &'static str {
    match value {
        RealityValidationStateV1::Valid => "VALID",
        RealityValidationStateV1::StaleRealityRef => "STALE_REALITY_REF",
        RealityValidationStateV1::RealityUnresolved => "REALITY_UNRESOLVED",
    }
}

fn conflict_kind_token(value: HumanModelConflictKindV1) -> &'static str {
    match value {
        HumanModelConflictKindV1::FactValueConflict => "FACT_VALUE_CONFLICT",
        HumanModelConflictKindV1::PreferenceConflict => "PREFERENCE_CONFLICT",
        HumanModelConflictKindV1::DispositionConflict => "DISPOSITION_CONFLICT",
        HumanModelConflictKindV1::GoalConflict => "GOAL_CONFLICT",
        HumanModelConflictKindV1::ResolvedByExplicitAuthority => "RESOLVED_BY_EXPLICIT_AUTHORITY",
        HumanModelConflictKindV1::ResolvedByScope => "RESOLVED_BY_SCOPE",
    }
}

fn conflict_state_token(value: HumanModelConflictStateV1) -> &'static str {
    match value {
        HumanModelConflictStateV1::Resolved => "RESOLVED",
        HumanModelConflictStateV1::Unresolved => "UNRESOLVED",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_contracts::idr::{
        CURRENT_CONSTRAINTS_VERSION_V1, CurrentSemanticConstraintV1, RealityStateEntryV1,
        SourceAvailabilityEntryV1,
    };
    use fielora_platform::{DeviceIdentity, PlatformPaths};
    use fielora_storage::StorageWorker;
    use fielora_storage::idr::{
        AdmittedHumanModelItem, DispositionPayloadV1, FactPayloadV1, LongTermGoalPayloadV1,
        ObservationPayloadV1, PreferencePayloadV1, ProvenanceSourceRefKind,
    };
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn resolver_core_has_no_forbidden_runtime_dependencies() {
        let source = include_str!("idr_resolver.rs");
        let resolver_core = source
            .split("#[cfg(test)]")
            .next()
            .expect("resolver source has a production section");

        for forbidden in [
            "rusqlite",
            "StorageHandle",
            "ModelClient",
            "ProviderEndpoint",
            "PolicyEngine",
            "ToolRuntime",
            "fielora_renderer",
            "FIPC",
        ] {
            assert!(
                !resolver_core.contains(forbidden),
                "Resolver Core must not depend on {forbidden}"
            );
        }
        assert!(resolver_core.contains("fielora_storage::idr"));
        assert!(!resolver_core.contains("fielora_storage::StorageWorker"));
    }

    fn explicit_provenance(id: &str) -> ProvenanceRefInput {
        ProvenanceRefInput {
            provenance_ref_id: format!("provenance-{id}"),
            source_type: ProvenanceSourceType::ExplicitUserStatement,
            source_ref_kind: ProvenanceSourceRefKind::Message,
            source_ref_id: format!("message-{id}"),
            observed_at: 1,
            bounded_support: Some("SECRET_TRANSCRIPT_BODY".into()),
            source_digest: None,
            admission_relation: Some(ProvenanceAdmissionRelation::Explicit),
            source_status_at_admission: ProvenanceSourceStatus::Available,
        }
    }

    fn observed_provenance(id: &str) -> ProvenanceRefInput {
        ProvenanceRefInput {
            provenance_ref_id: format!("provenance-{id}"),
            source_type: ProvenanceSourceType::UserAction,
            source_ref_kind: ProvenanceSourceRefKind::UserAction,
            source_ref_id: format!("action-{id}"),
            observed_at: 1,
            bounded_support: None,
            source_digest: None,
            admission_relation: Some(ProvenanceAdmissionRelation::Confirmation),
            source_status_at_admission: ProvenanceSourceStatus::Available,
        }
    }

    fn inference_provenance(id: &str) -> ProvenanceRefInput {
        ProvenanceRefInput {
            provenance_ref_id: format!("provenance-{id}"),
            source_type: ProvenanceSourceType::SystemInference,
            source_ref_kind: ProvenanceSourceRefKind::HumanModelItem,
            source_ref_id: format!("support-{id}"),
            observed_at: 1,
            bounded_support: None,
            source_digest: None,
            admission_relation: Some(ProvenanceAdmissionRelation::InferenceSupport),
            source_status_at_admission: ProvenanceSourceStatus::Available,
        }
    }

    fn preference(id: &str, dimension: &str, value: &str) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Preference(PreferencePayloadV1 {
                dimension: dimension.into(),
                relation: PreferenceRelation::Prefer,
                normalized_value: value.into(),
            }),
            HumanModelLifecycle::Active,
            EvidenceBasis::Explicit,
            None,
            vec![explicit_provenance(id)],
        )
    }

    fn avoid(id: &str, dimension: &str, value: &str) -> HumanModelItemRecord {
        let mut item = preference(id, dimension, value);
        if let HumanModelPayloadV1::Preference(payload) = &mut item.payload {
            payload.relation = PreferenceRelation::Avoid;
        }
        item
    }

    fn disposition(
        id: &str,
        dimension: &str,
        value: &str,
        confidence: InferenceConfidence,
    ) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Disposition(DispositionPayloadV1 {
                dimension: dimension.into(),
                normalized_value: value.into(),
            }),
            HumanModelLifecycle::Active,
            EvidenceBasis::Inferred,
            Some(confidence),
            vec![inference_provenance(id)],
        )
    }

    fn fact(id: &str, subject: &str, value: &str) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Fact(FactPayloadV1 {
                subject_key: subject.into(),
                value: FactValueV1::Token(value.into()),
                qualifier: None,
            }),
            HumanModelLifecycle::Active,
            EvidenceBasis::Explicit,
            None,
            vec![explicit_provenance(id)],
        )
    }

    fn goal(id: &str, key: &str, outcome: &str) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::LongTermGoal(LongTermGoalPayloadV1 {
                goal_key: key.into(),
                desired_outcome: outcome.into(),
            }),
            HumanModelLifecycle::Active,
            EvidenceBasis::Explicit,
            None,
            vec![explicit_provenance(id)],
        )
    }

    fn observation(id: &str) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Observation(ObservationPayloadV1 {
                observation_kind: "fielora.observation.user_choice".into(),
                normalized_value: "minimal_delta".into(),
                related_dimension: Some("fielora.change_scope.mode".into()),
            }),
            HumanModelLifecycle::Active,
            EvidenceBasis::Observed,
            None,
            vec![observed_provenance(id)],
        )
    }

    fn record(
        id: &str,
        payload: HumanModelPayloadV1,
        lifecycle: HumanModelLifecycle,
        evidence_basis: EvidenceBasis,
        inference_confidence: Option<InferenceConfidence>,
        provenance_refs: Vec<ProvenanceRefInput>,
    ) -> HumanModelItemRecord {
        HumanModelItemRecord {
            item_id: id.into(),
            contract_version: IDR_CONTRACT_VERSION,
            payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
            payload,
            lifecycle,
            evidence_basis,
            inference_confidence,
            scope: DispositionScope::default(),
            supersedes_item_id: None,
            created_human_model_revision: 1,
            updated_human_model_revision: 1,
            created_at: 1,
            updated_at: 1,
            provenance_refs,
            reality_dependencies: Vec::new(),
        }
    }

    fn constraints(
        covered: Vec<SemanticKeyV1>,
        entries: Vec<CurrentSemanticConstraintV1>,
    ) -> NormalizedCurrentConstraintsV1 {
        let mut value = NormalizedCurrentConstraintsV1 {
            contract_version: CURRENT_CONSTRAINTS_VERSION_V1,
            constraint_set_ref: "constraints-1".into(),
            covered_semantic_keys: covered,
            entries,
            constraints_digest: String::new(),
        };
        value.constraints_digest = fingerprint_current_constraints(&value);
        value
    }

    fn context_with(
        project: SelectorStateV1<String>,
        domain: SelectorStateV1<DomainV1>,
        task_type: SelectorStateV1<TaskTypeV1>,
        interaction_kind: SelectorStateV1<InteractionKindV1>,
        constraints: NormalizedCurrentConstraintsV1,
    ) -> NormalizedResolutionContextV1 {
        let mut value = NormalizedResolutionContextV1 {
            contract_version: RESOLUTION_CONTEXT_VERSION_V1,
            context_ref: "context-1".into(),
            project,
            domain,
            task_type,
            interaction_kind,
            current_constraints: constraints,
            context_fingerprint: String::new(),
        };
        value.context_fingerprint = fingerprint_resolution_context(&value);
        value
    }

    fn global_context(keys: Vec<SemanticKeyV1>) -> NormalizedResolutionContextV1 {
        context_with(
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            constraints(keys, Vec::new()),
        )
    }

    fn reality(entries: Vec<RealityStateEntryV1>) -> RealityValidationProjectionV1 {
        let mut value = RealityValidationProjectionV1 {
            contract_version: REALITY_PROJECTION_VERSION_V1,
            projection_ref: "reality-1".into(),
            authority_revision_or_digest: "authority-1".into(),
            entries,
            projection_digest: String::new(),
        };
        value.projection_digest = fingerprint_reality_projection(&value);
        value
    }

    fn sources(items: &[HumanModelItemRecord]) -> SourceAvailabilityProjectionV1 {
        let mut entries = items
            .iter()
            .flat_map(|item| item.provenance_refs.iter())
            .map(|provenance| SourceAvailabilityEntryV1 {
                provenance_ref_id: provenance.provenance_ref_id.clone(),
                state: SourceAvailabilityStateV1::Available,
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| left.provenance_ref_id.cmp(&right.provenance_ref_id));
        entries.dedup_by(|left, right| left.provenance_ref_id == right.provenance_ref_id);
        let mut value = SourceAvailabilityProjectionV1 {
            contract_version: SOURCE_AVAILABILITY_VERSION_V1,
            projection_ref: "sources-1".into(),
            entries,
            projection_digest: String::new(),
        };
        value.projection_digest = fingerprint_source_availability(&value);
        value
    }

    fn resolve(
        items: Vec<HumanModelItemRecord>,
        context: &NormalizedResolutionContextV1,
        reality: &RealityValidationProjectionV1,
    ) -> Result<ResolvedHumanModelViewV1, ResolverHardFailureCodeV1> {
        let source = sources(&items);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 7,
            items,
        };
        HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
            resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
            resolver_version: RESOLVER_VERSION_V1,
            semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
            expected_human_model_revision: 7,
            snapshot: &snapshot,
            resolution_context: context,
            reality_projection: reality,
            source_availability: &source,
        })
    }

    #[test]
    fn registry_and_lifecycle_fail_closed() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let context = global_context(vec![key]);
        let reality = reality(Vec::new());
        let mut items = Vec::new();
        for (index, lifecycle) in [
            HumanModelLifecycle::Active,
            HumanModelLifecycle::Candidate,
            HumanModelLifecycle::Weakened,
            HumanModelLifecycle::Conflicted,
            HumanModelLifecycle::Superseded,
            HumanModelLifecycle::Revoked,
        ]
        .into_iter()
        .enumerate()
        {
            let mut item = preference(
                &format!("item-{index}"),
                "fielora.change_scope.mode",
                "minimal_delta",
            );
            item.lifecycle = lifecycle;
            items.push(item);
        }
        items.push(preference(
            "unknown-key",
            "fielora.unknown.mode",
            "minimal_delta",
        ));
        items.push(preference(
            "unknown-value",
            "fielora.change_scope.mode",
            "anything",
        ));
        let view = resolve(items, &context, &reality).unwrap();
        assert_eq!(view.effective_items.len(), 1);
        assert_eq!(view.effective_items[0].item_id, "item-0");
        assert!(view.suppressed.iter().any(|value| {
            value.item_id == "unknown-key"
                && value
                    .reason_codes
                    .contains(&ResolverReasonCodeV1::InvalidSemanticKey)
        }));
        assert!(view.suppressed.iter().any(|value| {
            value.item_id == "unknown-value"
                && value
                    .reason_codes
                    .contains(&ResolverReasonCodeV1::UnsupportedSemanticValue)
        }));
        assert_eq!(view.suppressed.len(), 7);
    }

    #[test]
    fn all_registered_behavior_values_are_accepted() {
        let dimensions = [
            ("fielora.workflow.mode", "sequential"),
            ("fielora.change_scope.mode", "minimal_delta"),
            ("fielora.verification.order", "targeted_first"),
            ("fielora.communication.detail", "concise"),
            ("fielora.decision.presentation", "recommend_one"),
            ("fielora.risk.posture", "conservative"),
            ("fielora.planning.mode", "plan_first"),
            ("fielora.architecture.posture", "preserve_existing"),
        ];
        let items = dimensions
            .iter()
            .enumerate()
            .map(|(index, (dimension, value))| preference(&format!("p-{index}"), dimension, value))
            .collect::<Vec<_>>();
        let keys = dimensions
            .iter()
            .map(|(dimension, _)| SemanticKeyV1::BehaviorDimension((*dimension).into()))
            .collect();
        let view = resolve(items, &global_context(keys), &reality(Vec::new())).unwrap();
        assert_eq!(view.effective_items.len(), dimensions.len());
    }

    #[test]
    fn semantic_families_and_dimensions_are_isolated() {
        let items = vec![
            preference("pref-a", "fielora.change_scope.mode", "minimal_delta"),
            disposition(
                "disp-b",
                "fielora.communication.detail",
                "concise",
                InferenceConfidence::High,
            ),
            fact("fact-a", "fielora.human.communication_language", "en"),
            goal(
                "goal-a",
                "fielora.goal.product.provider_neutrality",
                "maintain_provider_neutrality",
            ),
        ];
        let keys = vec![
            SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into()),
            SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into()),
            SemanticKeyV1::HumanFact("fielora.human.communication_language".into()),
            SemanticKeyV1::LongTermGoal("fielora.goal.product.provider_neutrality".into()),
        ];
        let view = resolve(items, &global_context(keys), &reality(Vec::new())).unwrap();
        assert_eq!(view.effective_items.len(), 4);
        assert!(view.conflicts.is_empty());
    }

    #[test]
    fn explicit_preference_overrides_only_incompatible_same_dimension_disposition() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let items = vec![
            preference("preference", "fielora.change_scope.mode", "minimal_delta"),
            disposition(
                "disposition",
                "fielora.change_scope.mode",
                "bounded_change",
                InferenceConfidence::High,
            ),
        ];
        let view = resolve(items, &global_context(vec![key]), &reality(Vec::new())).unwrap();
        assert_eq!(view.effective_items.len(), 1);
        assert_eq!(view.effective_items[0].item_id, "preference");
        assert!(view.conflicts.iter().any(|conflict| {
            conflict.conflict_kind == HumanModelConflictKindV1::ResolvedByExplicitAuthority
                && conflict.state == HumanModelConflictStateV1::Resolved
        }));

        let view = resolve(
            vec![
                preference("preference", "fielora.change_scope.mode", "minimal_delta"),
                disposition(
                    "disposition-a",
                    "fielora.change_scope.mode",
                    "bounded_change",
                    InferenceConfidence::Low,
                ),
                disposition(
                    "disposition-b",
                    "fielora.change_scope.mode",
                    "broad_change_when_explicit",
                    InferenceConfidence::High,
                ),
            ],
            &global_context(vec![SemanticKeyV1::BehaviorDimension(
                "fielora.change_scope.mode".into(),
            )]),
            &reality(Vec::new()),
        )
        .unwrap();
        assert_eq!(view.effective_items.len(), 1);
        assert!(
            view.conflicts
                .iter()
                .all(|conflict| conflict.state == HumanModelConflictStateV1::Resolved)
        );
    }

    #[test]
    fn preference_relation_matrix_preserves_compatible_avoids_and_conflicts_on_same_value() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let context = global_context(vec![key]);
        let compatible = resolve(
            vec![
                avoid(
                    "avoid-broad",
                    "fielora.change_scope.mode",
                    "broad_change_when_explicit",
                ),
                preference(
                    "prefer-minimal",
                    "fielora.change_scope.mode",
                    "minimal_delta",
                ),
            ],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert_eq!(compatible.effective_items.len(), 2);

        let conflict = resolve(
            vec![
                avoid("avoid", "fielora.change_scope.mode", "minimal_delta"),
                preference("prefer", "fielora.change_scope.mode", "minimal_delta"),
            ],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert!(conflict.effective_items.is_empty());
        assert_eq!(
            conflict.conflicts[0].conflict_kind,
            HumanModelConflictKindV1::PreferenceConflict
        );
    }

    #[test]
    fn confidence_never_wins_conflicting_values_but_selects_same_value_representation() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into());
        let context = global_context(vec![key.clone()]);
        let conflict = resolve(
            vec![
                disposition(
                    "low",
                    "fielora.communication.detail",
                    "concise",
                    InferenceConfidence::Low,
                ),
                disposition(
                    "high",
                    "fielora.communication.detail",
                    "detailed",
                    InferenceConfidence::High,
                ),
            ],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert!(conflict.effective_items.is_empty());
        assert_eq!(
            conflict.conflicts[0].conflict_kind,
            HumanModelConflictKindV1::DispositionConflict
        );

        let duplicate = resolve(
            vec![
                disposition(
                    "low",
                    "fielora.communication.detail",
                    "concise",
                    InferenceConfidence::Low,
                ),
                disposition(
                    "high",
                    "fielora.communication.detail",
                    "concise",
                    InferenceConfidence::High,
                ),
            ],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert_eq!(duplicate.effective_items[0].item_id, "high");
    }

    #[test]
    fn scope_is_exact_and_specificity_is_deterministic() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let context = context_with(
            SelectorStateV1::Known("project-1".into()),
            SelectorStateV1::Known(DomainV1::Coding),
            SelectorStateV1::Known(TaskTypeV1::FastEdit),
            SelectorStateV1::Known(InteractionKindV1::TaskExecution),
            constraints(vec![key.clone()], Vec::new()),
        );
        let mut global = preference("global", "fielora.change_scope.mode", "bounded_change");
        let mut exact = preference("exact", "fielora.change_scope.mode", "minimal_delta");
        exact.scope = DispositionScope {
            domain: Some("CODING".into()),
            project_ref: Some("project-1".into()),
            task_type: Some("FAST_EDIT".into()),
            interaction_kind: Some("TASK_EXECUTION".into()),
        };
        let mut other_project = preference(
            "other",
            "fielora.change_scope.mode",
            "broad_change_when_explicit",
        );
        other_project.scope.project_ref = Some("project-2".into());
        let view = resolve(
            vec![global.clone(), exact.clone(), other_project],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert_eq!(view.effective_items[0].item_id, "exact");
        assert_eq!(view.effective_items[0].scope_specificity.0, [1, 4, 1, 1, 1]);
        assert!(view.suppressed.iter().any(|value| {
            value.item_id == "global"
                && value
                    .reason_codes
                    .contains(&ResolverReasonCodeV1::LowerPrecedence)
        }));
        assert!(view.suppressed.iter().any(|value| {
            value.item_id == "other"
                && value
                    .reason_codes
                    .contains(&ResolverReasonCodeV1::ScopeMismatch)
        }));

        global.scope.domain = Some("CODING".into());
        let unavailable = context_with(
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::Unavailable,
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            constraints(vec![key], Vec::new()),
        );
        let view = resolve(vec![global], &unavailable, &reality(Vec::new())).unwrap();
        assert!(
            view.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::ScopeInputUnavailable)
        );
    }

    #[test]
    fn current_explicit_constraint_overrides_durable_value() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let current = CurrentSemanticConstraintV1 {
            authority: CurrentConstraintAuthorityV1::CurrentExplicitUser,
            semantic_key: key.clone(),
            operation: CurrentConstraintOperationV1::RequireValue,
            canonical_value: Some(CanonicalSemanticValueV1::Token(
                "broad_change_when_explicit".into(),
            )),
            source_ref: "current-user".into(),
            source_digest: "a".repeat(64),
        };
        let context = context_with(
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            SelectorStateV1::KnownAbsent,
            constraints(vec![key], vec![current]),
        );
        let view = resolve(
            vec![preference(
                "durable",
                "fielora.change_scope.mode",
                "minimal_delta",
            )],
            &context,
            &reality(Vec::new()),
        )
        .unwrap();
        assert!(view.effective_items.is_empty());
        assert!(
            view.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::CurrentInstructionOverride)
        );
    }

    #[test]
    fn reality_validation_is_three_state_for_project_and_artifact() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let context = global_context(vec![key]);
        let mut project_item = preference("project", "fielora.change_scope.mode", "minimal_delta");
        project_item.reality_dependencies = vec![RealityDependencyInput {
            reality_kind: RealityKind::Project,
            reality_ref: "project-1".into(),
            dependency_relation: RealityDependencyRelation::RevisionMatch,
            expected_revision: Some(7),
            expected_fingerprint: None,
        }];
        let valid_reality = reality(vec![RealityStateEntryV1 {
            reality_kind: RealityKindV1::Project,
            reality_ref: "project-1".into(),
            availability: RealityAvailabilityV1::Available,
            current_revision: Some(7),
            current_state_ref: None,
            current_fingerprint: Some(fingerprint_project_reality("project-1", 7)),
            authority_ref: "project-store".into(),
        }]);
        let valid = resolve(vec![project_item.clone()], &context, &valid_reality).unwrap();
        assert_eq!(valid.effective_items.len(), 1);

        let stale_reality = reality(vec![RealityStateEntryV1 {
            current_revision: Some(8),
            current_fingerprint: Some(fingerprint_project_reality("project-1", 8)),
            ..valid_reality.entries[0].clone()
        }]);
        let stale = resolve(vec![project_item.clone()], &context, &stale_reality).unwrap();
        assert!(
            stale.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::StaleRealityRef)
        );

        let unresolved = resolve(vec![project_item], &context, &reality(Vec::new())).unwrap();
        assert!(
            unresolved.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::RealityUnresolved)
        );

        let artifact_fingerprint = fingerprint_artifact_reality("artifact-1", "revision-2");
        let mut artifact_item =
            preference("artifact", "fielora.change_scope.mode", "minimal_delta");
        artifact_item.reality_dependencies = vec![RealityDependencyInput {
            reality_kind: RealityKind::Artifact,
            reality_ref: "artifact-1".into(),
            dependency_relation: RealityDependencyRelation::FingerprintMatch,
            expected_revision: None,
            expected_fingerprint: Some(artifact_fingerprint.clone()),
        }];
        let artifact_reality = reality(vec![RealityStateEntryV1 {
            reality_kind: RealityKindV1::Artifact,
            reality_ref: "artifact-1".into(),
            availability: RealityAvailabilityV1::Available,
            current_revision: None,
            current_state_ref: Some("revision-2".into()),
            current_fingerprint: Some(artifact_fingerprint),
            authority_ref: "artifact-store".into(),
        }]);
        assert_eq!(
            resolve(vec![artifact_item], &context, &artifact_reality)
                .unwrap()
                .effective_items
                .len(),
            1
        );
    }

    #[test]
    fn supersession_is_explicit_and_invalid_lineage_hard_fails() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let context = global_context(vec![key]);
        let reality = reality(Vec::new());
        let mut predecessor = preference("a", "fielora.change_scope.mode", "bounded_change");
        predecessor.lifecycle = HumanModelLifecycle::Superseded;
        let mut successor = preference("b", "fielora.change_scope.mode", "minimal_delta");
        successor.supersedes_item_id = Some("a".into());
        let view = resolve(
            vec![predecessor.clone(), successor.clone()],
            &context,
            &reality,
        )
        .unwrap();
        assert_eq!(view.effective_items[0].item_id, "b");

        let mut missing = successor.clone();
        missing.item_id = "missing-head".into();
        missing.supersedes_item_id = Some("erased".into());
        let view = resolve(vec![missing], &context, &reality).unwrap();
        assert!(view.effective_items[0].lineage_incomplete);

        let mut self_ref = successor.clone();
        self_ref.item_id = "self".into();
        self_ref.supersedes_item_id = Some("self".into());
        assert_eq!(
            resolve(vec![self_ref], &context, &reality),
            Err(ResolverHardFailureCodeV1::InvalidLineage)
        );

        let mut cycle_a = predecessor.clone();
        cycle_a.supersedes_item_id = Some("b".into());
        let mut cycle_b = predecessor.clone();
        cycle_b.item_id = "b".into();
        cycle_b.supersedes_item_id = Some("a".into());
        assert_eq!(
            resolve(vec![cycle_a, cycle_b], &context, &reality),
            Err(ResolverHardFailureCodeV1::InvalidLineage)
        );

        let mut fork_one = successor.clone();
        fork_one.item_id = "b".into();
        let mut fork_two = successor;
        fork_two.item_id = "c".into();
        assert_eq!(
            resolve(vec![predecessor, fork_one, fork_two], &context, &reality),
            Err(ResolverHardFailureCodeV1::InvalidLineage)
        );
    }

    #[test]
    fn every_kind_conflict_is_structured_and_observation_is_not_effective() {
        let items = vec![
            fact("fact-en", "fielora.human.communication_language", "en"),
            fact("fact-zh", "fielora.human.communication_language", "zh_cn"),
            preference("pref-a", "fielora.change_scope.mode", "minimal_delta"),
            preference("pref-b", "fielora.change_scope.mode", "bounded_change"),
            disposition(
                "disp-a",
                "fielora.communication.detail",
                "concise",
                InferenceConfidence::Low,
            ),
            disposition(
                "disp-b",
                "fielora.communication.detail",
                "detailed",
                InferenceConfidence::High,
            ),
            goal(
                "goal-a",
                "fielora.goal.product.provider_neutrality",
                "maintain_provider_neutrality",
            ),
            // Valid storage-compatible but unknown V1 goal outcome is suppressed, not a conflict.
            goal(
                "goal-b",
                "fielora.goal.product.architecture_stability",
                "preserve_existing_architecture",
            ),
            observation("observation"),
        ];
        let keys = vec![
            SemanticKeyV1::HumanFact("fielora.human.communication_language".into()),
            SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into()),
            SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into()),
            SemanticKeyV1::LongTermGoal("fielora.goal.product.provider_neutrality".into()),
            SemanticKeyV1::LongTermGoal("fielora.goal.product.architecture_stability".into()),
        ];
        let view = resolve(items, &global_context(keys), &reality(Vec::new())).unwrap();
        assert!(
            view.conflicts
                .iter()
                .any(|value| value.conflict_kind == HumanModelConflictKindV1::FactValueConflict)
        );
        assert!(
            view.conflicts
                .iter()
                .any(|value| value.conflict_kind == HumanModelConflictKindV1::PreferenceConflict)
        );
        assert!(
            view.conflicts
                .iter()
                .any(|value| value.conflict_kind == HumanModelConflictKindV1::DispositionConflict)
        );
        assert!(
            view.effective_items
                .iter()
                .all(|value| value.kind != HumanModelKindV1::Observation)
        );
        assert!(view.suppressed.iter().any(|value| {
            value.item_id == "observation"
                && value
                    .reason_codes
                    .contains(&ResolverReasonCodeV1::NotEffectiveKind)
        }));
    }

    #[test]
    fn goal_comparator_emits_structured_conflict_for_incompatible_registered_lane_values() {
        fn goal_candidate<'a>(record: &'a HumanModelItemRecord, value: &str) -> Candidate<'a> {
            Candidate {
                record,
                kind: HumanModelKindV1::LongTermGoal,
                key: SemanticKeyV1::LongTermGoal("fielora.goal.product.provider_neutrality".into()),
                relation: None,
                value: CanonicalSemanticValueV1::Token(value.into()),
                scope: NormalizedScopeV1::default(),
                specificity: ScopeSpecificityV1([0, 0, 0, 0, 0]),
                basis: EvidenceBasisV1::Explicit,
                confidence: None,
                provenance_refs: vec!["support".into()],
                reality_validation: Vec::new(),
                constraint_state: CurrentConstraintStateV1::Compatible,
                lineage_predecessors: Vec::new(),
                lineage_incomplete: false,
            }
        }
        let first_record = goal(
            "goal-a",
            "fielora.goal.product.provider_neutrality",
            "maintain_provider_neutrality",
        );
        let mut second_record = first_record.clone();
        second_record.item_id = "goal-b".into();
        let mut accumulator = ResolutionAccumulator::default();
        resolve_goals(
            vec![
                goal_candidate(&first_record, "maintain_provider_neutrality"),
                goal_candidate(&second_record, "future_incompatible_registered_value"),
            ],
            &mut accumulator,
        );
        assert!(accumulator.effective.is_empty());
        assert_eq!(accumulator.conflicts.len(), 1);
        assert_eq!(
            accumulator.conflicts[0].conflict_kind,
            HumanModelConflictKindV1::GoalConflict
        );
    }

    #[test]
    fn same_input_and_item_permutations_are_byte_equivalent_for_128_iterations() {
        let mut items = vec![
            preference("p", "fielora.change_scope.mode", "minimal_delta"),
            disposition(
                "d",
                "fielora.communication.detail",
                "concise",
                InferenceConfidence::High,
            ),
            fact("f", "fielora.human.primary_platform", "windows"),
            goal(
                "g",
                "fielora.goal.product.provider_neutrality",
                "maintain_provider_neutrality",
            ),
            observation("o"),
        ];
        let keys = vec![
            SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into()),
            SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into()),
            SemanticKeyV1::HumanFact("fielora.human.primary_platform".into()),
            SemanticKeyV1::LongTermGoal("fielora.goal.product.provider_neutrality".into()),
        ];
        let context = global_context(keys);
        let reality = reality(Vec::new());
        let expected = resolve(items.clone(), &context, &reality).unwrap();
        let expected_bytes = serde_json::to_vec(&expected).unwrap();
        for index in 0..128 {
            let item_count = items.len();
            items.rotate_left(index % item_count);
            if index % 2 == 0 {
                items.reverse();
            }
            let actual = resolve(items.clone(), &context, &reality).unwrap();
            assert_eq!(serde_json::to_vec(&actual).unwrap(), expected_bytes);
            assert_eq!(actual.resolution_ref, expected.resolution_ref);
        }
        let encoded = String::from_utf8(expected_bytes).unwrap();
        assert!(!encoded.contains("SECRET_TRANSCRIPT_BODY"));
        assert!(!encoded.contains("provider_response"));
        assert!(!encoded.contains("model_name"));
    }

    #[test]
    fn snapshot_bounds_and_revision_mismatch_are_hard_failures() {
        let item = preference("p", "fielora.change_scope.mode", "minimal_delta");
        let items = (0..=MAX_RESOLVER_SNAPSHOT_ITEMS_V1)
            .map(|index| {
                let mut item = item.clone();
                item.item_id = format!("item-{index}");
                item
            })
            .collect::<Vec<_>>();
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items,
        };
        let context = global_context(vec![SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        )]);
        let reality = reality(Vec::new());
        let source = sources(&snapshot.items);
        let result = HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
            resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
            resolver_version: RESOLVER_VERSION_V1,
            semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
            expected_human_model_revision: 1,
            snapshot: &snapshot,
            resolution_context: &context,
            reality_projection: &reality,
            source_availability: &source,
        });
        assert_eq!(result, Err(ResolverHardFailureCodeV1::ResolverInputLimit));

        let snapshot = HumanModelSnapshot {
            human_model_revision: 2,
            items: Vec::new(),
        };
        let result = HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
            resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
            resolver_version: RESOLVER_VERSION_V1,
            semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
            expected_human_model_revision: 1,
            snapshot: &snapshot,
            resolution_context: &context,
            reality_projection: &reality,
            source_availability: &sources(&[]),
        });
        assert_eq!(
            result,
            Err(ResolverHardFailureCodeV1::HumanModelRevisionMismatch)
        );
    }

    #[test]
    fn source_authority_availability_and_item_bounds_fail_closed() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into());
        let context = global_context(vec![key]);
        let reality = reality(Vec::new());
        let mut invalid_authority = disposition(
            "invalid-authority",
            "fielora.communication.detail",
            "concise",
            InferenceConfidence::High,
        );
        invalid_authority.provenance_refs[0].source_type = ProvenanceSourceType::AgentOutcome;
        let view = resolve(vec![invalid_authority], &context, &reality).unwrap();
        assert!(
            view.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::SourceNotAuthoritative)
        );

        let missing_item = disposition(
            "missing-source",
            "fielora.communication.detail",
            "concise",
            InferenceConfidence::High,
        );
        let snapshot = HumanModelSnapshot {
            human_model_revision: 7,
            items: vec![missing_item],
        };
        let mut source = sources(&snapshot.items);
        source.entries[0].state = SourceAvailabilityStateV1::Missing;
        source.projection_digest = fingerprint_source_availability(&source);
        let view = HumanModelResolverV1
            .resolve(ResolveHumanModelInputV1 {
                resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
                resolver_version: RESOLVER_VERSION_V1,
                semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
                expected_human_model_revision: 7,
                snapshot: &snapshot,
                resolution_context: &context,
                reality_projection: &reality,
                source_availability: &source,
            })
            .unwrap();
        assert!(
            view.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::SourceMissing)
        );

        let mut bounded = preference("bounded", "fielora.communication.detail", "concise");
        bounded.provenance_refs = (0..=MAX_RESOLVER_PROVENANCE_REFS_PER_ITEM_V1)
            .map(|index| explicit_provenance(&format!("bounded-{index}")))
            .collect();
        let view = resolve(vec![bounded], &context, &reality).unwrap();
        assert!(
            view.suppressed[0]
                .reason_codes
                .contains(&ResolverReasonCodeV1::ResolverItemLimit)
        );
    }

    #[test]
    fn suppression_diagnostics_are_bounded_without_changing_semantics() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let mut items = (0..300)
            .map(|index| {
                let mut value = preference(
                    &format!("candidate-{index:03}"),
                    "fielora.change_scope.mode",
                    "minimal_delta",
                );
                value.lifecycle = HumanModelLifecycle::Candidate;
                value
            })
            .collect::<Vec<_>>();
        items.push(preference(
            "active",
            "fielora.change_scope.mode",
            "minimal_delta",
        ));
        let view = resolve(items, &global_context(vec![key]), &reality(Vec::new())).unwrap();
        assert_eq!(view.effective_items.len(), 1);
        assert_eq!(view.suppressed.len(), MAX_RESOLVER_SUPPRESSION_RECORDS_V1);
        assert_eq!(view.diagnostics_summary.total_suppression_count, 300);
        assert_eq!(view.diagnostics_summary.omitted_suppression_count, 44);
        assert!(
            view.diagnostics_summary
                .omitted_suppression_digest
                .as_deref()
                .is_some_and(is_sha256)
        );
    }

    #[test]
    fn project_and_artifact_fingerprints_have_stable_known_vectors() {
        assert_eq!(
            fingerprint_project_reality("project-1", 7),
            "e749142b4a9ed9f2a734d09147a64a897aa9b8e80626a804a14b9035e967b394"
        );
        assert_eq!(
            fingerprint_artifact_reality("artifact-1", "revision-2"),
            "cc448dffde3314b609726a219a1f730c3c68e8028d939db7334696cd332bb02c"
        );
        assert_ne!(
            fingerprint_project_reality("project-1", 7),
            fingerprint_project_reality("project-1", 8)
        );
    }

    #[test]
    fn resolver_over_real_snapshot_is_read_only() {
        let root: PathBuf =
            std::env::temp_dir().join(format!("fielora-idr-resolver-{}", Uuid::now_v7()));
        let paths = PlatformPaths::from_root(root.clone()).unwrap();
        let device = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        let worker = StorageWorker::start(&paths.database, device, 1).unwrap();
        let handle = worker.handle();
        let admitted = AdmittedHumanModelItem {
            item_id: "read-only-item".into(),
            contract_version: IDR_CONTRACT_VERSION,
            payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
            payload: HumanModelPayloadV1::Preference(PreferencePayloadV1 {
                dimension: "fielora.change_scope.mode".into(),
                relation: PreferenceRelation::Prefer,
                normalized_value: "minimal_delta".into(),
            }),
            lifecycle: HumanModelLifecycle::Active,
            evidence_basis: EvidenceBasis::Explicit,
            inference_confidence: None,
            scope: DispositionScope::default(),
            provenance_refs: vec![explicit_provenance("read-only")],
            reality_dependencies: Vec::new(),
        };
        handle
            .create_human_model_item(admitted, 0, "create".into(), 2)
            .unwrap();
        let before = handle.read_human_model_snapshot().unwrap();
        let context = global_context(vec![SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        )]);
        let reality = reality(Vec::new());
        let source = sources(&before.items);
        let resolved = HumanModelResolverV1
            .resolve(ResolveHumanModelInputV1 {
                resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
                resolver_version: RESOLVER_VERSION_V1,
                semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
                expected_human_model_revision: before.human_model_revision,
                snapshot: &before,
                resolution_context: &context,
                reality_projection: &reality,
                source_availability: &source,
            })
            .unwrap();
        assert_eq!(resolved.effective_items.len(), 1);
        let after = handle.read_human_model_snapshot().unwrap();
        assert_eq!(after, before);
        worker.shutdown();
        std::fs::remove_dir_all(&root).unwrap();
    }
}
