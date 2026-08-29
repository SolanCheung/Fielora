//! Deterministic Harness.Ingress & Context admission for resolved IDR signals.
//!
//! This component only narrows an already resolved view into a bounded structured
//! contribution. It does not re-resolve Human Model truth and is not connected to
//! the production Agent request path in this implementation slice.

use fielora_contracts::idr::{
    CONTEXT_ADMISSION_CONTRACT_VERSION_V1, CONTEXT_ADMISSION_VERSION_V1, CanonicalEncoderV1,
    CanonicalSemanticValueV1, CurrentConstraintStateV1, EvidenceBasisV1, HumanModelConflictStateV1,
    HumanModelConflictV1, HumanModelKindV1, HumanModelLifecycleV1, IDR_TRUST_CLASS_V1,
    IDRApplicabilityProjectionV1, IDRContextAdmissionErrorV1, IDRContextAdmissionInputV1,
    IDRContextContributionV1, IDRMaterialityV1, IDRNeutralConflictNoticeV1, IDRProjectionEntryV1,
    MAX_IDR_CONTEXT_CONFLICT_NOTICES_V1, MAX_IDR_CONTEXT_DISPOSITIONS_V1,
    MAX_IDR_CONTEXT_ENTRIES_V1, MAX_IDR_CONTEXT_FACTS_V1, MAX_IDR_CONTEXT_GOALS_V1,
    MAX_IDR_CONTEXT_PREFERENCES_V1, MAX_IDR_CONTEXT_PROVENANCE_REFS_V1,
    MAX_IDR_CONTEXT_UTF8_BYTES_V1, MAX_WHY_USED_MANIFEST_UTF8_BYTES_V1, PreferenceRelationV1,
    RESOLVER_CONTRACT_VERSION_V1, RESOLVER_VERSION_V1, RealityValidationStateV1,
    ResolvedHumanModelItemV1, ResolverReasonCodeV1, SEMANTIC_REGISTRY_VERSION_V1, SemanticKeyV1,
    WhyUsedAdmittedItemV1, WhyUsedConflictNoticeV1, WhyUsedManifestV1, WhyUsedOmissionCountV1,
    WhyUsedRealityRefV1,
};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap};

const DOMAIN_APPLICABILITY: &str = "FIELORA_IDR_APPLICABILITY_PROJECTION_V1";
const DOMAIN_PROJECTION: &str = "FIELORA_IDR_CONTEXT_PROJECTION_V1";
const DOMAIN_CANONICAL_VALUE: &str = "FIELORA_IDR_CANONICAL_VALUE_V1";
const DOMAIN_CONFLICT_RECORD: &str = "FIELORA_IDR_CONFLICT_RECORD_V1";

#[derive(Debug, Default, Clone, Copy)]
pub struct IDRContextAdmissionV1;

#[derive(Clone)]
enum AdmissionCandidate<'a> {
    Item {
        item: &'a ResolvedHumanModelItemV1,
        materiality: IDRMaterialityV1,
        deterministic_order: u16,
    },
    Conflict {
        conflict: &'a HumanModelConflictV1,
        materiality: IDRMaterialityV1,
        deterministic_order: u16,
    },
}

impl AdmissionCandidate<'_> {
    fn materiality(&self) -> IDRMaterialityV1 {
        match self {
            Self::Item { materiality, .. } | Self::Conflict { materiality, .. } => *materiality,
        }
    }

    fn deterministic_order(&self) -> u16 {
        match self {
            Self::Item {
                deterministic_order,
                ..
            }
            | Self::Conflict {
                deterministic_order,
                ..
            } => *deterministic_order,
        }
    }

    fn semantic_key(&self) -> &SemanticKeyV1 {
        match self {
            Self::Item { item, .. } => &item.semantic_key,
            Self::Conflict { conflict, .. } => &conflict.semantic_key,
        }
    }
}

impl IDRContextAdmissionV1 {
    pub fn admit(
        &self,
        input: &IDRContextAdmissionInputV1,
    ) -> Result<IDRContextContributionV1, IDRContextAdmissionErrorV1> {
        validate_input(input)?;
        let applicability = input
            .applicability
            .entries
            .iter()
            .map(|entry| (entry.semantic_key.clone(), entry))
            .collect::<HashMap<_, _>>();
        let unresolved_conflict_keys = input
            .resolved_view
            .conflicts
            .iter()
            .filter(|conflict| conflict.state == HumanModelConflictStateV1::Unresolved)
            .map(|conflict| conflict.semantic_key.clone())
            .collect::<BTreeSet<_>>();

        let mut omitted_reason_counts = BTreeMap::<ResolverReasonCodeV1, u32>::new();
        let mut candidates = Vec::new();
        for item in &input.resolved_view.effective_items {
            if !item_projection_shape_valid(item) {
                increment_reason(
                    &mut omitted_reason_counts,
                    ResolverReasonCodeV1::UnsupportedSemanticValue,
                );
                continue;
            }
            if !matches!(
                item.kind,
                HumanModelKindV1::Fact
                    | HumanModelKindV1::Preference
                    | HumanModelKindV1::Disposition
                    | HumanModelKindV1::LongTermGoal
            ) {
                increment_reason(
                    &mut omitted_reason_counts,
                    ResolverReasonCodeV1::NotEffectiveKind,
                );
                continue;
            }
            if item
                .reality_validation
                .iter()
                .any(|entry| entry.validation_state != RealityValidationStateV1::Valid)
            {
                let reason = if item.reality_validation.iter().any(|entry| {
                    entry.validation_state == RealityValidationStateV1::StaleRealityRef
                }) {
                    ResolverReasonCodeV1::StaleRealityRef
                } else {
                    ResolverReasonCodeV1::RealityUnresolved
                };
                increment_reason(&mut omitted_reason_counts, reason);
                continue;
            }
            if item.current_constraint_state != CurrentConstraintStateV1::Compatible {
                increment_reason(
                    &mut omitted_reason_counts,
                    ResolverReasonCodeV1::CurrentConstraintsUnavailable,
                );
                continue;
            }
            if unresolved_conflict_keys.contains(&item.semantic_key) {
                increment_reason(
                    &mut omitted_reason_counts,
                    ResolverReasonCodeV1::SemanticConflict,
                );
                continue;
            }
            let Some(applicability_entry) = applicability.get(&item.semantic_key) else {
                continue;
            };
            if applicability_entry.materiality == IDRMaterialityV1::NotRelevant {
                continue;
            }
            candidates.push(AdmissionCandidate::Item {
                item,
                materiality: applicability_entry.materiality,
                deterministic_order: applicability_entry.deterministic_order,
            });
        }
        for conflict in input
            .resolved_view
            .conflicts
            .iter()
            .filter(|conflict| conflict.state == HumanModelConflictStateV1::Unresolved)
        {
            if !semantic_key_is_safe(&conflict.semantic_key) {
                continue;
            }
            let Some(applicability_entry) = applicability.get(&conflict.semantic_key) else {
                continue;
            };
            if applicability_entry.materiality == IDRMaterialityV1::NotRelevant {
                continue;
            }
            candidates.push(AdmissionCandidate::Conflict {
                conflict,
                materiality: applicability_entry.materiality,
                deterministic_order: applicability_entry.deterministic_order,
            });
        }
        candidates.sort_by(admission_order);

        let mut entries = Vec::new();
        let mut notices = Vec::new();
        let mut admitted_manifest = Vec::new();
        let mut conflict_manifest = Vec::new();
        let mut kind_counts = BTreeMap::<HumanModelKindV1, usize>::new();
        let mut omitted_count = 0_u32;

        for candidate in candidates {
            if entries.len() + notices.len() >= input.requested_budget.max_entries {
                omitted_count += 1;
                increment_reason(
                    &mut omitted_reason_counts,
                    ResolverReasonCodeV1::ProjectionLimit,
                );
                continue;
            }
            match candidate {
                AdmissionCandidate::Item {
                    item, materiality, ..
                } => {
                    let kind_count = kind_counts.get(&item.kind).copied().unwrap_or(0);
                    if kind_count >= kind_cap(item.kind) {
                        omitted_count += 1;
                        increment_reason(
                            &mut omitted_reason_counts,
                            ResolverReasonCodeV1::ProjectionLimit,
                        );
                        continue;
                    }
                    let projection_entry = IDRProjectionEntryV1 {
                        kind: item.kind,
                        semantic_key: item.semantic_key.clone(),
                        relation: item.relation,
                        canonical_value: item.canonical_value.clone(),
                    };
                    let mut tentative_entries = entries.clone();
                    tentative_entries.push(projection_entry.clone());
                    let tentative_block = render_block(&tentative_entries, &notices);
                    if tentative_block.len() > input.requested_budget.max_serialized_utf8_bytes {
                        omitted_count += 1;
                        increment_reason(
                            &mut omitted_reason_counts,
                            ResolverReasonCodeV1::ProjectionLimit,
                        );
                        continue;
                    }
                    let line_bytes = render_entry_line(&projection_entry).len() as u32 + 1;
                    let projection_index = (entries.len() + notices.len()) as u16;
                    entries.push(projection_entry);
                    kind_counts.insert(item.kind, kind_count + 1);
                    admitted_manifest.push(WhyUsedAdmittedItemV1 {
                        projection_index,
                        item_id: item.item_id.clone(),
                        kind: item.kind,
                        semantic_key: item.semantic_key.clone(),
                        canonical_value_digest: canonical_value_digest(&item.canonical_value),
                        matched_scope: item.matched_scope.clone(),
                        lifecycle: HumanModelLifecycleV1::Active,
                        evidence_basis: item.evidence_basis,
                        inference_confidence: item.inference_confidence,
                        admission_reason: materiality,
                        provenance_ref_ids: item
                            .provenance_ref_ids
                            .iter()
                            .take(MAX_IDR_CONTEXT_PROVENANCE_REFS_V1)
                            .cloned()
                            .collect(),
                        reality_refs: item
                            .reality_validation
                            .iter()
                            .map(|entry| WhyUsedRealityRefV1 {
                                reality_kind: entry.reality_kind,
                                reality_ref: entry.reality_ref.clone(),
                                validation_state: entry.validation_state,
                            })
                            .collect(),
                        current_constraint_state: item.current_constraint_state,
                        serialized_entry_bytes: line_bytes,
                    });
                }
                AdmissionCandidate::Conflict {
                    conflict,
                    materiality,
                    ..
                } => {
                    if notices.len() >= MAX_IDR_CONTEXT_CONFLICT_NOTICES_V1 {
                        omitted_count += 1;
                        increment_reason(
                            &mut omitted_reason_counts,
                            ResolverReasonCodeV1::ProjectionLimit,
                        );
                        continue;
                    }
                    let digest = conflict_record_digest(conflict);
                    let notice = IDRNeutralConflictNoticeV1 {
                        semantic_key: conflict.semantic_key.clone(),
                        applied: false,
                    };
                    let mut tentative_notices = notices.clone();
                    tentative_notices.push(notice.clone());
                    let tentative_block = render_block(&entries, &tentative_notices);
                    if tentative_block.len() > input.requested_budget.max_serialized_utf8_bytes {
                        omitted_count += 1;
                        increment_reason(
                            &mut omitted_reason_counts,
                            ResolverReasonCodeV1::ProjectionLimit,
                        );
                        continue;
                    }
                    notices.push(notice);
                    conflict_manifest.push(WhyUsedConflictNoticeV1 {
                        semantic_key: conflict.semantic_key.clone(),
                        conflict_record_digest: digest,
                        admission_reason: materiality,
                    });
                }
            }
        }

        let serialized_block = if entries.is_empty() && notices.is_empty() {
            let empty = render_block(&entries, &notices);
            if empty.len() <= input.requested_budget.max_serialized_utf8_bytes {
                empty
            } else {
                String::new()
            }
        } else {
            render_block(&entries, &notices)
        };
        let content_sha256 = sha256(serialized_block.as_bytes());
        let projection_utf8_bytes = serialized_block.len() as u32;
        let projection_entry_count = (entries.len() + notices.len()) as u16;
        let omitted_reason_counts = omitted_reason_counts
            .into_iter()
            .map(|(reason, count)| WhyUsedOmissionCountV1 { reason, count })
            .collect::<Vec<_>>();
        let why_used_manifest = WhyUsedManifestV1 {
            contract_version: CONTEXT_ADMISSION_CONTRACT_VERSION_V1,
            admission_version: CONTEXT_ADMISSION_VERSION_V1.to_owned(),
            resolver_version: input.resolved_view.resolver_version.clone(),
            semantic_registry_version: input.resolved_view.semantic_registry_version.clone(),
            resolution_ref: input.resolved_view.resolution_ref.clone(),
            human_model_revision: input.resolved_view.source_human_model_revision,
            resolution_context_fingerprint: input
                .resolved_view
                .resolution_context
                .context_fingerprint
                .clone(),
            reality_projection_ref: input
                .resolved_view
                .resolution_context
                .reality_projection_ref
                .clone(),
            reality_projection_digest: input
                .resolved_view
                .resolution_context
                .reality_projection_digest
                .clone(),
            current_constraints_ref: input
                .resolved_view
                .resolution_context
                .current_constraints_ref
                .clone(),
            current_constraints_digest: input
                .resolved_view
                .resolution_context
                .current_constraints_digest
                .clone(),
            applicability_projection_ref: input.applicability.projection_ref.clone(),
            applicability_projection_digest: input.applicability.projection_digest.clone(),
            invocation_binding: input.invocation_binding.clone(),
            admitted: admitted_manifest,
            conflict_notices: conflict_manifest,
            omitted_count,
            omitted_reason_counts,
            projection_entry_count,
            projection_utf8_bytes,
            projection_digest: content_sha256.clone(),
        };
        let manifest_bytes = serde_json::to_vec(&why_used_manifest)
            .map_err(|_| IDRContextAdmissionErrorV1::WhyUsedManifestInvalid)?;
        if manifest_bytes.len() > MAX_WHY_USED_MANIFEST_UTF8_BYTES_V1 {
            return Err(IDRContextAdmissionErrorV1::WhyUsedManifestInvalid);
        }
        Ok(IDRContextContributionV1 {
            admission_contract_version: CONTEXT_ADMISSION_CONTRACT_VERSION_V1,
            admission_version: CONTEXT_ADMISSION_VERSION_V1.to_owned(),
            trust_class: IDR_TRUST_CLASS_V1.to_owned(),
            resolution_ref: input.resolved_view.resolution_ref.clone(),
            source_human_model_revision: input.resolved_view.source_human_model_revision,
            entries,
            conflict_notices: notices,
            omitted_count,
            serialized_utf8_bytes: projection_utf8_bytes,
            content_sha256,
            serialized_block,
            why_used_manifest,
        })
    }
}

fn validate_input(input: &IDRContextAdmissionInputV1) -> Result<(), IDRContextAdmissionErrorV1> {
    if input.admission_contract_version != CONTEXT_ADMISSION_CONTRACT_VERSION_V1
        || input.admission_version != CONTEXT_ADMISSION_VERSION_V1
        || input.resolved_view.resolver_contract_version != RESOLVER_CONTRACT_VERSION_V1
        || input.resolved_view.resolver_version != RESOLVER_VERSION_V1
        || input.resolved_view.semantic_registry_version != SEMANTIC_REGISTRY_VERSION_V1
    {
        return Err(IDRContextAdmissionErrorV1::UnsupportedAdmissionVersion);
    }
    if input.expected_resolution_ref != input.resolved_view.resolution_ref {
        return Err(IDRContextAdmissionErrorV1::ResolutionRefMismatch);
    }
    if input.expected_resolution_context_fingerprint
        != input.resolved_view.resolution_context.context_fingerprint
    {
        return Err(IDRContextAdmissionErrorV1::ResolutionContextMismatch);
    }
    if input.requested_budget.max_entries > MAX_IDR_CONTEXT_ENTRIES_V1
        || input.requested_budget.max_serialized_utf8_bytes > MAX_IDR_CONTEXT_UTF8_BYTES_V1
    {
        return Err(IDRContextAdmissionErrorV1::InvalidContextBudget);
    }
    validate_applicability(&input.applicability)
}

fn validate_applicability(
    projection: &IDRApplicabilityProjectionV1,
) -> Result<(), IDRContextAdmissionErrorV1> {
    if projection.contract_version != fielora_contracts::idr::APPLICABILITY_PROJECTION_VERSION_V1
        || projection.projection_ref.is_empty()
        || fingerprint_applicability(projection) != projection.projection_digest
    {
        return Err(IDRContextAdmissionErrorV1::InvalidApplicabilityProjection);
    }
    let mut keys = BTreeSet::new();
    if projection.entries.iter().any(|entry| {
        entry.source_ref.is_empty()
            || entry.source_ref.len() > 512
            || !keys.insert(entry.semantic_key.clone())
    }) {
        return Err(IDRContextAdmissionErrorV1::InvalidApplicabilityProjection);
    }
    Ok(())
}

fn admission_order(left: &AdmissionCandidate<'_>, right: &AdmissionCandidate<'_>) -> Ordering {
    left.materiality()
        .allocation_order()
        .cmp(&right.materiality().allocation_order())
        .then_with(|| left.deterministic_order().cmp(&right.deterministic_order()))
        .then_with(|| match (left, right) {
            (
                AdmissionCandidate::Item { item: left, .. },
                AdmissionCandidate::Item { item: right, .. },
            ) => right
                .scope_specificity
                .cmp(&left.scope_specificity)
                .then_with(|| {
                    allocation_basis_order(left.evidence_basis)
                        .cmp(&allocation_basis_order(right.evidence_basis))
                })
                .then_with(|| {
                    allocation_kind_order(left.kind).cmp(&allocation_kind_order(right.kind))
                }),
            (AdmissionCandidate::Item { .. }, AdmissionCandidate::Conflict { .. }) => {
                Ordering::Less
            }
            (AdmissionCandidate::Conflict { .. }, AdmissionCandidate::Item { .. }) => {
                Ordering::Greater
            }
            (AdmissionCandidate::Conflict { .. }, AdmissionCandidate::Conflict { .. }) => {
                Ordering::Equal
            }
        })
        .then_with(|| left.semantic_key().cmp(right.semantic_key()))
        .then_with(|| match (left, right) {
            (
                AdmissionCandidate::Item { item: left, .. },
                AdmissionCandidate::Item { item: right, .. },
            ) => left.item_id.cmp(&right.item_id),
            (
                AdmissionCandidate::Conflict { conflict: left, .. },
                AdmissionCandidate::Conflict {
                    conflict: right, ..
                },
            ) => left.member_item_refs.cmp(&right.member_item_refs),
            _ => Ordering::Equal,
        })
}

fn allocation_basis_order(value: EvidenceBasisV1) -> u8 {
    match value {
        EvidenceBasisV1::Explicit => 0,
        EvidenceBasisV1::Observed => 1,
        EvidenceBasisV1::Inferred => 2,
    }
}

fn allocation_kind_order(value: HumanModelKindV1) -> u8 {
    match value {
        HumanModelKindV1::Fact => 0,
        HumanModelKindV1::Preference => 1,
        HumanModelKindV1::LongTermGoal => 2,
        HumanModelKindV1::Disposition => 3,
        HumanModelKindV1::Observation => 4,
    }
}

fn kind_cap(value: HumanModelKindV1) -> usize {
    match value {
        HumanModelKindV1::Fact => MAX_IDR_CONTEXT_FACTS_V1,
        HumanModelKindV1::Preference => MAX_IDR_CONTEXT_PREFERENCES_V1,
        HumanModelKindV1::Disposition => MAX_IDR_CONTEXT_DISPOSITIONS_V1,
        HumanModelKindV1::LongTermGoal => MAX_IDR_CONTEXT_GOALS_V1,
        HumanModelKindV1::Observation => 0,
    }
}

fn item_projection_shape_valid(item: &ResolvedHumanModelItemV1) -> bool {
    let relation_valid = match item.kind {
        HumanModelKindV1::Preference => item.relation.is_some(),
        HumanModelKindV1::Fact
        | HumanModelKindV1::Observation
        | HumanModelKindV1::Disposition
        | HumanModelKindV1::LongTermGoal => item.relation.is_none(),
    };
    relation_valid
        && semantic_key_is_safe(&item.semantic_key)
        && match &item.canonical_value {
            CanonicalSemanticValueV1::Token(value) => safe_token(value),
            CanonicalSemanticValueV1::Boolean(_) => true,
        }
}

fn semantic_key_is_safe(key: &SemanticKeyV1) -> bool {
    match key {
        SemanticKeyV1::HumanFact(value)
        | SemanticKeyV1::BehaviorDimension(value)
        | SemanticKeyV1::ObservationItem(value)
        | SemanticKeyV1::LongTermGoal(value) => safe_token(value),
    }
}

fn safe_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':'))
}

fn render_block(
    entries: &[IDRProjectionEntryV1],
    notices: &[IDRNeutralConflictNoticeV1],
) -> String {
    let mut block =
        String::from("<IDR_CONTEXT_V1 trust=\"PERSONALIZATION_SIGNAL_NON_AUTHORITATIVE\">\n");
    for entry in entries {
        block.push_str(&render_entry_line(entry));
        block.push('\n');
    }
    for notice in notices {
        block.push_str("CONFLICT key=");
        block.push_str(&notice.semantic_key.canonical_token());
        block.push_str(" applied=none\n");
    }
    block.push_str("</IDR_CONTEXT_V1>\n");
    block
}

fn render_entry_line(entry: &IDRProjectionEntryV1) -> String {
    let key = entry.semantic_key.canonical_token();
    let value = entry.canonical_value.canonical_token();
    match entry.kind {
        HumanModelKindV1::Fact => format!("FACT key={key} value={value}"),
        HumanModelKindV1::Preference => format!(
            "PREFERENCE key={key} relation={} value={value}",
            match entry.relation {
                Some(PreferenceRelationV1::Prefer) => "PREFER",
                Some(PreferenceRelationV1::Avoid) => "AVOID",
                None => "",
            }
        ),
        HumanModelKindV1::Disposition => format!("DISPOSITION key={key} value={value}"),
        HumanModelKindV1::LongTermGoal => {
            format!("LONG_TERM_GOAL key={key} value={value}")
        }
        HumanModelKindV1::Observation => String::new(),
    }
}

pub fn fingerprint_applicability(projection: &IDRApplicabilityProjectionV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_APPLICABILITY);
    encoder.field_u16("contract_version", projection.contract_version);
    encoder.field_str("projection_ref", &projection.projection_ref);
    let mut entries = projection
        .entries
        .iter()
        .map(|entry| {
            let mut nested = CanonicalEncoderV1::new("IDR_APPLICABILITY_ENTRY_V1");
            nested.field_str("semantic_key", &entry.semantic_key.canonical_token());
            nested.field_str("materiality", materiality_token(entry.materiality));
            nested.field_u16("deterministic_order", entry.deterministic_order);
            nested.field_str("source_ref", &entry.source_ref);
            nested.finish()
        })
        .collect::<Vec<_>>();
    entries.sort();
    encoder.field_list("entries", &entries);
    sha256(&encoder.finish())
}

fn canonical_value_digest(value: &CanonicalSemanticValueV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_CANONICAL_VALUE);
    match value {
        CanonicalSemanticValueV1::Token(value) => encoder.field_str("token", value),
        CanonicalSemanticValueV1::Boolean(value) => {
            encoder.field_bytes("boolean", &[u8::from(*value)])
        }
    }
    sha256(&encoder.finish())
}

fn conflict_record_digest(conflict: &HumanModelConflictV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_CONFLICT_RECORD);
    encoder.field_str("semantic_key", &conflict.semantic_key.canonical_token());
    encoder.field_str("conflict_kind", conflict_kind_token(conflict.conflict_kind));
    encoder.field_list(
        "member_item_refs",
        &conflict
            .member_item_refs
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
    sha256(&encoder.finish())
}

fn increment_reason(
    counts: &mut BTreeMap<ResolverReasonCodeV1, u32>,
    reason: ResolverReasonCodeV1,
) {
    *counts.entry(reason).or_default() += 1;
}

fn materiality_token(value: IDRMaterialityV1) -> &'static str {
    match value {
        IDRMaterialityV1::Required => "REQUIRED",
        IDRMaterialityV1::Relevant => "RELEVANT",
        IDRMaterialityV1::NotRelevant => "NOT_RELEVANT",
    }
}

fn conflict_kind_token(value: fielora_contracts::idr::HumanModelConflictKindV1) -> &'static str {
    use fielora_contracts::idr::HumanModelConflictKindV1;
    match value {
        HumanModelConflictKindV1::FactValueConflict => "FACT_VALUE_CONFLICT",
        HumanModelConflictKindV1::PreferenceConflict => "PREFERENCE_CONFLICT",
        HumanModelConflictKindV1::DispositionConflict => "DISPOSITION_CONFLICT",
        HumanModelConflictKindV1::GoalConflict => "GOAL_CONFLICT",
        HumanModelConflictKindV1::ResolvedByExplicitAuthority => "RESOLVED_BY_EXPLICIT_AUTHORITY",
        HumanModelConflictKindV1::ResolvedByScope => "RESOLVED_BY_SCOPE",
    }
}

fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[allow(dead_code)]
fn projection_contract_digest(contribution: &IDRContextContributionV1) -> String {
    let mut encoder = CanonicalEncoderV1::new(DOMAIN_PROJECTION);
    encoder.field_str("resolution_ref", &contribution.resolution_ref);
    encoder.field_str("content_sha256", &contribution.content_sha256);
    encoder.field_u32("serialized_utf8_bytes", contribution.serialized_utf8_bytes);
    sha256(&encoder.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_contracts::idr::{
        APPLICABILITY_PROJECTION_VERSION_V1, HumanModelConflictKindV1, HumanModelConflictStateV1,
        IDRApplicabilityEntryV1, IDRContextBudgetV1, IDRInvocationBindingV1, NormalizedScopeV1,
        RESOLUTION_PROFILE_VERSION_V1, RealityKindV1, ResolvedHumanModelViewV1,
        ResolvedRealityRefV1, ResolvedViewContextBindingV1, ResolverDiagnosticsSummaryV1,
        ScopeSpecificityV1, WhyUsedManifestV1,
    };

    #[test]
    fn context_admission_consumes_resolved_view_without_re_resolving() {
        fn resolved_view_from_input(
            input: &IDRContextAdmissionInputV1,
        ) -> &ResolvedHumanModelViewV1 {
            &input.resolved_view
        }

        let source = include_str!("idr_context.rs");
        let admission_core = source
            .split("#[cfg(test)]")
            .next()
            .expect("Context Admission source has a production section");

        for forbidden in [
            "HumanModelResolverV1",
            "ResolveHumanModelInputV1",
            "fielora_storage",
        ] {
            assert!(
                !admission_core.contains(forbidden),
                "Context Admission must not re-resolve through {forbidden}"
            );
        }
        assert!(admission_core.contains("IDRContextAdmissionInputV1"));
        let _ = resolved_view_from_input;
    }

    fn item(
        id: &str,
        kind: HumanModelKindV1,
        key: SemanticKeyV1,
        value: &str,
    ) -> ResolvedHumanModelItemV1 {
        ResolvedHumanModelItemV1 {
            item_id: id.into(),
            kind,
            semantic_key: key,
            relation: (kind == HumanModelKindV1::Preference)
                .then_some(PreferenceRelationV1::Prefer),
            canonical_value: CanonicalSemanticValueV1::Token(value.into()),
            matched_scope: NormalizedScopeV1::default(),
            scope_specificity: ScopeSpecificityV1([0, 0, 0, 0, 0]),
            evidence_basis: if kind == HumanModelKindV1::Disposition {
                EvidenceBasisV1::Inferred
            } else {
                EvidenceBasisV1::Explicit
            },
            inference_confidence: None,
            provenance_ref_ids: vec![
                format!("provenance-{id}-1"),
                format!("provenance-{id}-2"),
                format!("provenance-{id}-3"),
                format!("provenance-{id}-4"),
            ],
            omitted_provenance_ref_count: 0,
            reality_validation: vec![ResolvedRealityRefV1 {
                reality_kind: RealityKindV1::Project,
                reality_ref: "project-1".into(),
                validation_state: RealityValidationStateV1::Valid,
            }],
            current_constraint_state: CurrentConstraintStateV1::Compatible,
            resolution_reason_codes: Vec::new(),
            lineage_predecessor_refs: Vec::new(),
            lineage_incomplete: false,
        }
    }

    fn view(
        effective_items: Vec<ResolvedHumanModelItemV1>,
        conflicts: Vec<HumanModelConflictV1>,
    ) -> ResolvedHumanModelViewV1 {
        ResolvedHumanModelViewV1 {
            resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
            resolver_version: RESOLVER_VERSION_V1.into(),
            semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1.into(),
            resolution_profile_version: RESOLUTION_PROFILE_VERSION_V1.into(),
            source_human_model_revision: 7,
            resolution_context: ResolvedViewContextBindingV1 {
                context_ref: "context-1".into(),
                context_fingerprint: "a".repeat(64),
                reality_projection_ref: "reality-1".into(),
                reality_projection_digest: "b".repeat(64),
                source_availability_ref: "sources-1".into(),
                source_availability_digest: "c".repeat(64),
                current_constraints_ref: "constraints-1".into(),
                current_constraints_digest: "d".repeat(64),
            },
            resolution_ref: "e".repeat(64),
            effective_items,
            conflicts,
            suppressed: Vec::new(),
            diagnostics_summary: ResolverDiagnosticsSummaryV1::default(),
            canonical_result_digest: "f".repeat(64),
        }
    }

    fn applicability(keys: &[SemanticKeyV1]) -> IDRApplicabilityProjectionV1 {
        let mut projection = IDRApplicabilityProjectionV1 {
            contract_version: APPLICABILITY_PROJECTION_VERSION_V1,
            projection_ref: "applicability-1".into(),
            entries: keys
                .iter()
                .enumerate()
                .map(|(index, key)| IDRApplicabilityEntryV1 {
                    semantic_key: key.clone(),
                    materiality: if index % 2 == 0 {
                        IDRMaterialityV1::Required
                    } else {
                        IDRMaterialityV1::Relevant
                    },
                    deterministic_order: index as u16,
                    source_ref: format!("applicability-source-{index}"),
                })
                .collect(),
            projection_digest: String::new(),
        };
        projection.projection_digest = fingerprint_applicability(&projection);
        projection
    }

    fn input(
        resolved_view: ResolvedHumanModelViewV1,
        applicability: IDRApplicabilityProjectionV1,
        budget: IDRContextBudgetV1,
    ) -> IDRContextAdmissionInputV1 {
        IDRContextAdmissionInputV1 {
            admission_contract_version: CONTEXT_ADMISSION_CONTRACT_VERSION_V1,
            admission_version: CONTEXT_ADMISSION_VERSION_V1.into(),
            expected_resolution_ref: resolved_view.resolution_ref.clone(),
            expected_resolution_context_fingerprint: resolved_view
                .resolution_context
                .context_fingerprint
                .clone(),
            resolved_view,
            applicability,
            requested_budget: budget,
            invocation_binding: IDRInvocationBindingV1 {
                run_ref: "run-1".into(),
                conversation_ref: "conversation-1".into(),
                project_ref: "project-1".into(),
                context_snapshot_ref: "snapshot-pending".into(),
            },
        }
    }

    fn full_budget() -> IDRContextBudgetV1 {
        IDRContextBudgetV1 {
            max_entries: MAX_IDR_CONTEXT_ENTRIES_V1,
            max_serialized_utf8_bytes: MAX_IDR_CONTEXT_UTF8_BYTES_V1,
        }
    }

    #[test]
    fn admission_applies_total_kind_and_provenance_bounds() {
        let specs = [
            (
                "fact-1",
                HumanModelKindV1::Fact,
                "fielora.human.primary_platform",
            ),
            (
                "fact-2",
                HumanModelKindV1::Fact,
                "fielora.human.communication_language",
            ),
            ("fact-3", HumanModelKindV1::Fact, "fielora.human.extra"),
            (
                "pref-1",
                HumanModelKindV1::Preference,
                "fielora.change_scope.mode",
            ),
            (
                "pref-2",
                HumanModelKindV1::Preference,
                "fielora.workflow.mode",
            ),
            (
                "pref-3",
                HumanModelKindV1::Preference,
                "fielora.planning.mode",
            ),
            (
                "pref-4",
                HumanModelKindV1::Preference,
                "fielora.risk.posture",
            ),
            (
                "disp-1",
                HumanModelKindV1::Disposition,
                "fielora.communication.detail",
            ),
            (
                "disp-2",
                HumanModelKindV1::Disposition,
                "fielora.architecture.posture",
            ),
            (
                "goal-1",
                HumanModelKindV1::LongTermGoal,
                "fielora.goal.product.provider_neutrality",
            ),
        ];
        let items = specs
            .iter()
            .map(|(id, kind, key)| {
                item(
                    id,
                    *kind,
                    match kind {
                        HumanModelKindV1::Fact => SemanticKeyV1::HumanFact((*key).into()),
                        HumanModelKindV1::LongTermGoal => {
                            SemanticKeyV1::LongTermGoal((*key).into())
                        }
                        _ => SemanticKeyV1::BehaviorDimension((*key).into()),
                    },
                    "bounded_value",
                )
            })
            .collect::<Vec<_>>();
        let keys = items
            .iter()
            .map(|item| item.semantic_key.clone())
            .collect::<Vec<_>>();
        let contribution = IDRContextAdmissionV1
            .admit(&input(
                view(items, Vec::new()),
                applicability(&keys),
                full_budget(),
            ))
            .unwrap();
        assert_eq!(contribution.entries.len(), MAX_IDR_CONTEXT_ENTRIES_V1);
        assert!(contribution.omitted_count >= 2);
        assert!(
            contribution
                .entries
                .iter()
                .filter(|entry| entry.kind == HumanModelKindV1::Fact)
                .count()
                <= MAX_IDR_CONTEXT_FACTS_V1
        );
        assert!(
            contribution
                .entries
                .iter()
                .filter(|entry| entry.kind == HumanModelKindV1::Preference)
                .count()
                <= MAX_IDR_CONTEXT_PREFERENCES_V1
        );
        assert!(
            contribution
                .why_used_manifest
                .admitted
                .iter()
                .all(|entry| entry.provenance_ref_ids.len() <= 3)
        );
        assert!(contribution.serialized_utf8_bytes as usize <= MAX_IDR_CONTEXT_UTF8_BYTES_V1);
        assert_eq!(
            contribution.why_used_manifest.projection_digest,
            contribution.content_sha256
        );
    }

    #[test]
    fn byte_overflow_omits_whole_item_without_partial_truncation() {
        let first = item(
            "first",
            HumanModelKindV1::Preference,
            SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into()),
            "minimal_delta",
        );
        let second = item(
            "second",
            HumanModelKindV1::Preference,
            SemanticKeyV1::BehaviorDimension("fielora.workflow.mode".into()),
            "parallel_when_independent",
        );
        let first_projection = IDRProjectionEntryV1 {
            kind: first.kind,
            semantic_key: first.semantic_key.clone(),
            relation: first.relation,
            canonical_value: first.canonical_value.clone(),
        };
        let exact_first_budget = render_block(&[first_projection], &[]).len();
        let keys = vec![first.semantic_key.clone(), second.semantic_key.clone()];
        let contribution = IDRContextAdmissionV1
            .admit(&input(
                view(vec![first, second], Vec::new()),
                applicability(&keys),
                IDRContextBudgetV1 {
                    max_entries: 8,
                    max_serialized_utf8_bytes: exact_first_budget,
                },
            ))
            .unwrap();
        assert_eq!(contribution.entries.len(), 1);
        assert_eq!(
            contribution.entries[0].semantic_key,
            SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into())
        );
        assert_eq!(
            contribution.serialized_utf8_bytes as usize,
            exact_first_budget
        );
        assert!(!contribution.serialized_block.contains("second"));
        assert!(
            contribution
                .serialized_block
                .ends_with("</IDR_CONTEXT_V1>\n")
        );
    }

    #[test]
    fn unresolved_conflict_is_neutral_bounded_and_never_becomes_preference() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let conflict = HumanModelConflictV1 {
            semantic_key: key.clone(),
            conflict_kind: HumanModelConflictKindV1::PreferenceConflict,
            state: HumanModelConflictStateV1::Unresolved,
            member_item_refs: vec!["a".into(), "b".into()],
            selected_item_refs: Vec::new(),
            suppressed_item_refs: vec!["a".into(), "b".into()],
            reason_codes: vec![ResolverReasonCodeV1::SemanticConflict],
        };
        let contribution = IDRContextAdmissionV1
            .admit(&input(
                view(Vec::new(), vec![conflict]),
                applicability(&[key]),
                full_budget(),
            ))
            .unwrap();
        assert!(contribution.entries.is_empty());
        assert_eq!(contribution.conflict_notices.len(), 1);
        assert!(contribution.serialized_block.contains("CONFLICT key="));
        assert!(!contribution.serialized_block.contains("PREFERENCE key="));
        assert!(!contribution.serialized_block.contains("minimal_delta"));
    }

    #[test]
    fn only_compatible_valid_effective_items_are_admitted() {
        let key_a = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let key_b = SemanticKeyV1::BehaviorDimension("fielora.workflow.mode".into());
        let key_c = SemanticKeyV1::BehaviorDimension("fielora.planning.mode".into());
        let mut overridden = item(
            "overridden",
            HumanModelKindV1::Preference,
            key_a.clone(),
            "minimal_delta",
        );
        overridden.current_constraint_state = CurrentConstraintStateV1::Overridden;
        let mut stale = item(
            "stale",
            HumanModelKindV1::Preference,
            key_b.clone(),
            "sequential",
        );
        stale.reality_validation[0].validation_state = RealityValidationStateV1::StaleRealityRef;
        let compatible = item(
            "compatible",
            HumanModelKindV1::Preference,
            key_c.clone(),
            "plan_first",
        );
        let contribution = IDRContextAdmissionV1
            .admit(&input(
                view(vec![overridden, stale, compatible], Vec::new()),
                applicability(&[key_a, key_b, key_c]),
                full_budget(),
            ))
            .unwrap();
        assert_eq!(contribution.entries.len(), 1);
        assert_eq!(
            contribution.entries[0].semantic_key,
            SemanticKeyV1::BehaviorDimension("fielora.planning.mode".into())
        );
    }

    #[test]
    fn contribution_and_manifest_are_deterministic_for_128_permutations() {
        let mut items = vec![
            item(
                "a",
                HumanModelKindV1::Preference,
                SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into()),
                "minimal_delta",
            ),
            item(
                "b",
                HumanModelKindV1::Disposition,
                SemanticKeyV1::BehaviorDimension("fielora.communication.detail".into()),
                "concise",
            ),
            item(
                "c",
                HumanModelKindV1::Fact,
                SemanticKeyV1::HumanFact("fielora.human.primary_platform".into()),
                "windows",
            ),
        ];
        let keys = items
            .iter()
            .map(|item| item.semantic_key.clone())
            .collect::<Vec<_>>();
        let expected = IDRContextAdmissionV1
            .admit(&input(
                view(items.clone(), Vec::new()),
                applicability(&keys),
                full_budget(),
            ))
            .unwrap();
        let expected_bytes = serde_json::to_vec(&expected).unwrap();
        for index in 0..128 {
            let length = items.len();
            items.rotate_left(index % length);
            if index % 2 == 0 {
                items.reverse();
            }
            let mut application = applicability(&keys);
            application.entries.reverse();
            application.projection_digest = fingerprint_applicability(&application);
            let actual = IDRContextAdmissionV1
                .admit(&input(
                    view(items.clone(), Vec::new()),
                    application,
                    full_budget(),
                ))
                .unwrap();
            assert_eq!(serde_json::to_vec(&actual).unwrap(), expected_bytes);
        }
    }

    #[test]
    fn why_used_is_bounded_and_contains_no_raw_value_or_reasoning() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let contribution = IDRContextAdmissionV1
            .admit(&input(
                view(
                    vec![item(
                        "a",
                        HumanModelKindV1::Preference,
                        key.clone(),
                        "minimal_delta",
                    )],
                    Vec::new(),
                ),
                applicability(&[key]),
                full_budget(),
            ))
            .unwrap();
        let manifest = serde_json::to_string(&contribution.why_used_manifest).unwrap();
        assert!(!manifest.contains("minimal_delta"));
        assert!(!manifest.contains("chain-of-thought"));
        assert!(!manifest.contains("SECRET"));
        assert!(manifest.len() <= MAX_WHY_USED_MANIFEST_UTF8_BYTES_V1);
        assert_eq!(
            contribution.why_used_manifest.admitted[0].human_safe_lifecycle(),
            "ACTIVE"
        );
        let model_facing = serde_json::to_string(&contribution.entries).unwrap();
        assert!(!model_facing.contains("item_id"));
        assert!(!model_facing.contains("provenance"));
        assert!(!model_facing.contains("digest"));
    }

    #[test]
    fn invalid_versions_refs_budgets_and_unbounded_manifest_fail_closed() {
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let resolved = view(
            vec![item(
                "a",
                HumanModelKindV1::Preference,
                key.clone(),
                "minimal_delta",
            )],
            Vec::new(),
        );
        let application = applicability(&[key]);
        let mut bad_ref = input(resolved.clone(), application.clone(), full_budget());
        bad_ref.expected_resolution_ref = "wrong".into();
        assert_eq!(
            IDRContextAdmissionV1.admit(&bad_ref),
            Err(IDRContextAdmissionErrorV1::ResolutionRefMismatch)
        );

        let bad_budget = input(
            resolved.clone(),
            application.clone(),
            IDRContextBudgetV1 {
                max_entries: 9,
                max_serialized_utf8_bytes: 4096,
            },
        );
        assert_eq!(
            IDRContextAdmissionV1.admit(&bad_budget),
            Err(IDRContextAdmissionErrorV1::InvalidContextBudget)
        );

        let mut huge_manifest = input(resolved, application, full_budget());
        huge_manifest.invocation_binding.run_ref =
            "x".repeat(MAX_WHY_USED_MANIFEST_UTF8_BYTES_V1 + 1);
        assert_eq!(
            IDRContextAdmissionV1.admit(&huge_manifest),
            Err(IDRContextAdmissionErrorV1::WhyUsedManifestInvalid)
        );
    }

    trait ManifestTestExt {
        fn human_safe_lifecycle(&self) -> &'static str;
    }

    impl ManifestTestExt for WhyUsedAdmittedItemV1 {
        fn human_safe_lifecycle(&self) -> &'static str {
            match self.lifecycle {
                HumanModelLifecycleV1::Active => "ACTIVE",
                _ => "INELIGIBLE",
            }
        }
    }

    #[allow(dead_code)]
    fn assert_manifest_type_is_structured(_: &WhyUsedManifestV1) {}
}
