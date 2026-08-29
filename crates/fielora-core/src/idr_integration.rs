//! Trusted Harness.IDR context builders and production composition.
//!
//! This module composes existing Storage, Resolver, and Context Admission
//! boundaries. It owns no durable state and never calls a Model.

use crate::idr_resolver::{
    HumanModelResolverV1, ResolveHumanModelInputV1, fingerprint_artifact_reality,
    fingerprint_current_constraints, fingerprint_project_reality, fingerprint_reality_projection,
    fingerprint_resolution_context, fingerprint_source_availability,
};
use fielora_agent::idr_context::{IDRContextAdmissionV1, fingerprint_applicability};
use fielora_contracts::idr::*;
use fielora_contracts::{ActiveArtifactContext, ProjectView};
use fielora_storage::idr::{
    HumanModelSnapshot, ProvenanceSourceStatus, RealityKind as StoredRealityKind,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct TrustedIDRContextInputV1<'a> {
    pub participation: Option<IDRParticipationV1>,
    pub run_ref: &'a str,
    pub conversation_ref: &'a str,
    pub context_snapshot_ref: &'a str,
    pub project: &'a ProjectView,
    pub active_artifact: Option<&'a ActiveArtifactContext>,
    pub task_type: TaskTypeV1,
    pub interaction_kind: InteractionKindV1,
    pub current_constraints: Option<&'a CurrentConstraintProjectionV1>,
    pub snapshot: &'a HumanModelSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IDRPreparationV1 {
    pub participation: IDRParticipationV1,
    pub human_model_revision: Option<u64>,
    pub invalidation_fingerprint: String,
    pub resolution_ref: Option<String>,
    pub contribution: Option<IDRContextContributionV1>,
    pub bounded_diagnostic: Option<String>,
    pub human_model_read_latency_micros: u64,
    pub builder_latency_micros: u64,
    pub resolver_latency_micros: u64,
    pub admission_latency_micros: u64,
}

impl IDRPreparationV1 {
    pub fn disabled(diagnostic: Option<&str>) -> Self {
        Self {
            participation: IDRParticipationV1::Disabled,
            human_model_revision: None,
            invalidation_fingerprint: sha256(b"IDR_DISABLED"),
            resolution_ref: None,
            contribution: None,
            bounded_diagnostic: diagnostic.map(str::to_owned),
            human_model_read_latency_micros: 0,
            builder_latency_micros: 0,
            resolver_latency_micros: 0,
            admission_latency_micros: 0,
        }
    }

    pub fn snapshot_evidence(&self) -> Value {
        let contribution = self.contribution.as_ref();
        json!({
            "participation": participation_token(self.participation),
            "effective_participation": if self.bounded_diagnostic.is_some() {
                "IDR_DISABLED_FOR_ATTEMPT"
            } else {
                participation_token(self.participation)
            },
            "human_model_revision": self.human_model_revision,
            "resolver_version": RESOLVER_VERSION_V1,
            "resolution_profile_version": RESOLUTION_PROFILE_VERSION_V1,
            "resolution_ref": self.resolution_ref,
            "invalidation_fingerprint": self.invalidation_fingerprint,
            "projection_digest": contribution.map(|value| value.content_sha256.clone()),
            "why_used_manifest": contribution.map(|value| value.why_used_manifest.clone()),
            "bounded_diagnostic": self.bounded_diagnostic,
            "metrics": {
                "human_model_read_latency_micros": self.human_model_read_latency_micros,
                "builder_latency_micros": self.builder_latency_micros,
                "resolver_latency_micros": self.resolver_latency_micros,
                "admission_latency_micros": self.admission_latency_micros,
                "extra_context_bytes": contribution.map(|value| value.serialized_utf8_bytes).unwrap_or(0),
            }
        })
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct CurrentConstraintProjectionBuilderV1;

impl CurrentConstraintProjectionBuilderV1 {
    pub fn build(
        &self,
        projection_ref: impl Into<String>,
        source_ref: impl Into<String>,
        mut covered_semantic_keys: Vec<SemanticKeyV1>,
        mut entries: Vec<CurrentSemanticConstraintV1>,
    ) -> CurrentConstraintProjectionV1 {
        covered_semantic_keys.sort();
        covered_semantic_keys.dedup();
        entries.sort_by(|left, right| {
            left.semantic_key
                .cmp(&right.semantic_key)
                .then_with(|| {
                    right
                        .authority
                        .precedence()
                        .cmp(&left.authority.precedence())
                })
                .then_with(|| left.operation.cmp(&right.operation))
                .then_with(|| left.source_ref.cmp(&right.source_ref))
        });
        let projection_ref = projection_ref.into();
        let source_ref = source_ref.into();
        let normalized = NormalizedCurrentConstraintsV1 {
            contract_version: CURRENT_CONSTRAINTS_VERSION_V1,
            constraint_set_ref: projection_ref.clone(),
            covered_semantic_keys: covered_semantic_keys.clone(),
            entries: entries.clone(),
            constraints_digest: String::new(),
        };
        CurrentConstraintProjectionV1 {
            contract_version: CURRENT_CONSTRAINTS_VERSION_V1,
            projection_ref,
            source_ref,
            covered_semantic_keys,
            entries,
            projection_digest: fingerprint_current_constraints(&normalized),
        }
    }

    pub fn unavailable(&self, run_ref: &str) -> CurrentConstraintProjectionV1 {
        self.build(
            format!("current-constraints:{run_ref}:unavailable"),
            format!("agent-run:{run_ref}"),
            Vec::new(),
            Vec::new(),
        )
    }

    pub fn normalize(
        &self,
        projection: &CurrentConstraintProjectionV1,
    ) -> Result<NormalizedCurrentConstraintsV1, &'static str> {
        if projection.contract_version != CURRENT_CONSTRAINTS_VERSION_V1
            || projection.projection_ref.is_empty()
            || projection.source_ref.is_empty()
        {
            return Err("INVALID_CURRENT_CONSTRAINT_PROJECTION");
        }
        let normalized = NormalizedCurrentConstraintsV1 {
            contract_version: projection.contract_version,
            constraint_set_ref: projection.projection_ref.clone(),
            covered_semantic_keys: projection.covered_semantic_keys.clone(),
            entries: projection.entries.clone(),
            constraints_digest: projection.projection_digest.clone(),
        };
        if fingerprint_current_constraints(&NormalizedCurrentConstraintsV1 {
            constraints_digest: String::new(),
            ..normalized.clone()
        }) != projection.projection_digest
        {
            return Err("INVALID_CURRENT_CONSTRAINT_DIGEST");
        }
        Ok(normalized)
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct NormalizedResolutionContextBuilderV1;

impl NormalizedResolutionContextBuilderV1 {
    pub fn build(
        &self,
        context_ref: impl Into<String>,
        project_ref: &str,
        task_type: TaskTypeV1,
        interaction_kind: InteractionKindV1,
        current_constraints: NormalizedCurrentConstraintsV1,
    ) -> NormalizedResolutionContextV1 {
        let mut context = NormalizedResolutionContextV1 {
            contract_version: RESOLUTION_CONTEXT_VERSION_V1,
            context_ref: context_ref.into(),
            project: SelectorStateV1::Known(project_ref.to_owned()),
            domain: SelectorStateV1::Known(DomainV1::Coding),
            task_type: SelectorStateV1::Known(task_type),
            interaction_kind: SelectorStateV1::Known(interaction_kind),
            current_constraints,
            context_fingerprint: String::new(),
        };
        context.context_fingerprint = fingerprint_resolution_context(&context);
        context
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct RealityValidationProjectionBuilderV1;

impl RealityValidationProjectionBuilderV1 {
    pub fn build(
        &self,
        projection_ref: impl Into<String>,
        project: &ProjectView,
        active_artifact: Option<&ActiveArtifactContext>,
        snapshot: &HumanModelSnapshot,
    ) -> RealityValidationProjectionV1 {
        let project_ref = project.field_id.0.clone();
        let artifact_ref = active_artifact.map(|value| value.artifact_id.0.clone());
        let artifact_revision = active_artifact.map(|value| value.current_revision_id.0.clone());
        let mut requested = snapshot
            .items
            .iter()
            .flat_map(|item| item.reality_dependencies.iter())
            .map(|dependency| {
                (
                    (
                        stored_reality_order(dependency.reality_kind),
                        dependency.reality_ref.clone(),
                    ),
                    dependency.reality_kind,
                )
            })
            .collect::<BTreeMap<_, _>>();
        requested.insert(
            (
                stored_reality_order(StoredRealityKind::Project),
                project_ref.clone(),
            ),
            StoredRealityKind::Project,
        );
        if let Some(value) = artifact_ref.as_ref() {
            requested.insert(
                (
                    stored_reality_order(StoredRealityKind::Artifact),
                    value.clone(),
                ),
                StoredRealityKind::Artifact,
            );
        }
        let mut entries = requested
            .into_iter()
            .map(|((_, reference), kind)| match kind {
                StoredRealityKind::Project if reference == project_ref => RealityStateEntryV1 {
                    reality_kind: RealityKindV1::Project,
                    reality_ref: reference,
                    availability: RealityAvailabilityV1::Available,
                    current_revision: Some(project.revision),
                    current_state_ref: None,
                    current_fingerprint: Some(fingerprint_project_reality(
                        &project_ref,
                        project.revision,
                    )),
                    authority_ref: "fielora-storage:project".into(),
                },
                StoredRealityKind::Artifact
                    if artifact_ref.as_deref() == Some(reference.as_str()) =>
                {
                    let revision = artifact_revision.as_deref().unwrap_or_default();
                    RealityStateEntryV1 {
                        reality_kind: RealityKindV1::Artifact,
                        reality_ref: reference.clone(),
                        availability: RealityAvailabilityV1::Available,
                        current_revision: None,
                        current_state_ref: Some(revision.to_owned()),
                        current_fingerprint: Some(fingerprint_artifact_reality(
                            &reference, revision,
                        )),
                        authority_ref: "fielora-storage:artifact".into(),
                    }
                }
                _ => RealityStateEntryV1 {
                    reality_kind: map_reality_kind(kind),
                    reality_ref: reference,
                    availability: RealityAvailabilityV1::Unresolved,
                    current_revision: None,
                    current_state_ref: None,
                    current_fingerprint: None,
                    authority_ref: "authoritative-projection:unavailable".into(),
                },
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            left.reality_kind
                .cmp(&right.reality_kind)
                .then_with(|| left.reality_ref.cmp(&right.reality_ref))
        });
        let authority_revision_or_digest = sha256(
            format!(
                "project:{}:{}\nartifact:{}:{}",
                project_ref,
                project.revision,
                artifact_ref.as_deref().unwrap_or("UNAVAILABLE"),
                artifact_revision.as_deref().unwrap_or("UNAVAILABLE")
            )
            .as_bytes(),
        );
        let mut projection = RealityValidationProjectionV1 {
            contract_version: REALITY_PROJECTION_VERSION_V1,
            projection_ref: projection_ref.into(),
            authority_revision_or_digest,
            entries,
            projection_digest: String::new(),
        };
        projection.projection_digest = fingerprint_reality_projection(&projection);
        projection
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SourceAvailabilityProjectionBuilderV1;

impl SourceAvailabilityProjectionBuilderV1 {
    pub fn build(
        &self,
        projection_ref: impl Into<String>,
        snapshot: &HumanModelSnapshot,
    ) -> SourceAvailabilityProjectionV1 {
        let mut states = BTreeMap::new();
        for provenance in snapshot
            .items
            .iter()
            .flat_map(|item| item.provenance_refs.iter())
        {
            let state = match provenance.source_status_at_admission {
                ProvenanceSourceStatus::Available | ProvenanceSourceStatus::Revocable => {
                    SourceAvailabilityStateV1::Available
                }
            };
            states.insert(provenance.provenance_ref_id.clone(), state);
        }
        let entries = states
            .into_iter()
            .map(|(provenance_ref_id, state)| SourceAvailabilityEntryV1 {
                provenance_ref_id,
                state,
            })
            .collect();
        let mut projection = SourceAvailabilityProjectionV1 {
            contract_version: SOURCE_AVAILABILITY_VERSION_V1,
            projection_ref: projection_ref.into(),
            entries,
            projection_digest: String::new(),
        };
        projection.projection_digest = fingerprint_source_availability(&projection);
        projection
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct IDRProductionIntegrationV1;

impl IDRProductionIntegrationV1 {
    pub fn prepare(&self, input: TrustedIDRContextInputV1<'_>) -> IDRPreparationV1 {
        if input.participation != Some(IDRParticipationV1::Enabled) {
            return IDRPreparationV1::disabled(
                input
                    .participation
                    .is_none()
                    .then_some("IDR_PARTICIPATION_MISSING_OR_INVALID"),
            );
        }
        let builder_started = Instant::now();
        let constraints_builder = CurrentConstraintProjectionBuilderV1;
        let unavailable;
        let current = match input.current_constraints {
            Some(value) => value,
            None => {
                unavailable = constraints_builder.unavailable(input.run_ref);
                &unavailable
            }
        };
        let current = match constraints_builder.normalize(current) {
            Ok(value) => value,
            Err(code) => return fail_soft(input.snapshot.human_model_revision, code),
        };
        let resolution_context = NormalizedResolutionContextBuilderV1.build(
            format!("resolution-context:{}", input.run_ref),
            &input.project.field_id.0,
            input.task_type,
            input.interaction_kind,
            current,
        );
        let reality = RealityValidationProjectionBuilderV1.build(
            format!("reality-projection:{}", input.run_ref),
            input.project,
            input.active_artifact,
            input.snapshot,
        );
        let source = SourceAvailabilityProjectionBuilderV1.build(
            format!("source-availability:{}", input.run_ref),
            input.snapshot,
        );
        let builder_latency_micros = elapsed_micros(builder_started);
        let invalidation_fingerprint = invalidation_fingerprint(
            input.snapshot.human_model_revision,
            &resolution_context,
            &reality,
            &source,
            IDRParticipationV1::Enabled,
        );

        let resolver_started = Instant::now();
        let resolved = match HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
            resolver_contract_version: RESOLVER_CONTRACT_VERSION_V1,
            resolver_version: RESOLVER_VERSION_V1,
            semantic_registry_version: SEMANTIC_REGISTRY_VERSION_V1,
            expected_human_model_revision: input.snapshot.human_model_revision,
            snapshot: input.snapshot,
            resolution_context: &resolution_context,
            reality_projection: &reality,
            source_availability: &source,
        }) {
            Ok(value) => value,
            Err(code) => {
                return fail_soft(
                    input.snapshot.human_model_revision,
                    &format!("IDR_RESOLVER_{}", code.as_token()),
                );
            }
        };
        let resolver_latency_micros = elapsed_micros(resolver_started);
        let applicability = applicability_projection(input.run_ref, &resolved, &resolution_context);
        let admission_started = Instant::now();
        let admitted = IDRContextAdmissionV1.admit(&IDRContextAdmissionInputV1 {
            admission_contract_version: CONTEXT_ADMISSION_CONTRACT_VERSION_V1,
            admission_version: CONTEXT_ADMISSION_VERSION_V1.into(),
            expected_resolution_ref: resolved.resolution_ref.clone(),
            expected_resolution_context_fingerprint: resolution_context.context_fingerprint.clone(),
            resolved_view: resolved.clone(),
            applicability,
            requested_budget: IDRContextBudgetV1 {
                max_entries: MAX_IDR_CONTEXT_ENTRIES_V1,
                max_serialized_utf8_bytes: MAX_IDR_CONTEXT_UTF8_BYTES_V1,
            },
            invocation_binding: IDRInvocationBindingV1 {
                run_ref: input.run_ref.into(),
                conversation_ref: input.conversation_ref.into(),
                project_ref: input.project.field_id.0.clone(),
                context_snapshot_ref: input.context_snapshot_ref.into(),
            },
        });
        let admission_latency_micros = elapsed_micros(admission_started);
        let contribution = match admitted {
            Ok(value) if !value.entries.is_empty() || !value.conflict_notices.is_empty() => {
                Some(value)
            }
            Ok(_) => None,
            Err(code) => {
                return fail_soft(
                    input.snapshot.human_model_revision,
                    &format!("IDR_ADMISSION_{}", code.as_token()),
                );
            }
        };
        IDRPreparationV1 {
            participation: IDRParticipationV1::Enabled,
            human_model_revision: Some(input.snapshot.human_model_revision),
            invalidation_fingerprint,
            resolution_ref: Some(resolved.resolution_ref),
            contribution,
            bounded_diagnostic: None,
            human_model_read_latency_micros: 0,
            builder_latency_micros,
            resolver_latency_micros,
            admission_latency_micros,
        }
    }
}

fn applicability_projection(
    run_ref: &str,
    resolved: &ResolvedHumanModelViewV1,
    context: &NormalizedResolutionContextV1,
) -> IDRApplicabilityProjectionV1 {
    let covered = context
        .current_constraints
        .covered_semantic_keys
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    let required = context
        .current_constraints
        .entries
        .iter()
        .map(|entry| entry.semantic_key.clone())
        .collect::<BTreeSet<_>>();
    let keys = resolved
        .effective_items
        .iter()
        .map(|item| item.semantic_key.clone())
        .chain(
            resolved
                .conflicts
                .iter()
                .map(|item| item.semantic_key.clone()),
        )
        .collect::<BTreeSet<_>>();
    let entries = keys
        .iter()
        .enumerate()
        .map(|(index, key)| IDRApplicabilityEntryV1 {
            semantic_key: key.clone(),
            materiality: if !covered.contains(key) {
                IDRMaterialityV1::NotRelevant
            } else if required.contains(key) {
                IDRMaterialityV1::Required
            } else {
                IDRMaterialityV1::Relevant
            },
            deterministic_order: index.min(u16::MAX as usize) as u16,
            source_ref: context.current_constraints.constraint_set_ref.clone(),
        })
        .collect();
    let mut projection = IDRApplicabilityProjectionV1 {
        contract_version: APPLICABILITY_PROJECTION_VERSION_V1,
        projection_ref: format!("applicability:{run_ref}"),
        entries,
        projection_digest: String::new(),
    };
    projection.projection_digest = fingerprint_applicability(&projection);
    projection
}

fn invalidation_fingerprint(
    revision: u64,
    context: &NormalizedResolutionContextV1,
    reality: &RealityValidationProjectionV1,
    source: &SourceAvailabilityProjectionV1,
    participation: IDRParticipationV1,
) -> String {
    sha256(
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}\n{}",
            revision,
            context.context_fingerprint,
            reality.projection_digest,
            source.projection_digest,
            RESOLVER_VERSION_V1,
            RESOLUTION_PROFILE_VERSION_V1,
            participation_token(participation),
        )
        .as_bytes(),
    )
}

fn fail_soft(revision: u64, diagnostic: &str) -> IDRPreparationV1 {
    IDRPreparationV1 {
        participation: IDRParticipationV1::Enabled,
        human_model_revision: Some(revision),
        invalidation_fingerprint: sha256(
            format!("IDR_FAIL_SOFT:{revision}:{diagnostic}").as_bytes(),
        ),
        resolution_ref: None,
        contribution: None,
        bounded_diagnostic: Some(diagnostic.chars().take(160).collect()),
        human_model_read_latency_micros: 0,
        builder_latency_micros: 0,
        resolver_latency_micros: 0,
        admission_latency_micros: 0,
    }
}

fn map_reality_kind(kind: StoredRealityKind) -> RealityKindV1 {
    match kind {
        StoredRealityKind::Project => RealityKindV1::Project,
        StoredRealityKind::Artifact => RealityKindV1::Artifact,
        StoredRealityKind::Decision => RealityKindV1::Decision,
        StoredRealityKind::Verification => RealityKindV1::Verification,
        StoredRealityKind::FieldObject => RealityKindV1::FieldObject,
    }
}

fn stored_reality_order(kind: StoredRealityKind) -> u8 {
    match kind {
        StoredRealityKind::Project => 0,
        StoredRealityKind::Artifact => 1,
        StoredRealityKind::Decision => 2,
        StoredRealityKind::Verification => 3,
        StoredRealityKind::FieldObject => 4,
    }
}

fn participation_token(value: IDRParticipationV1) -> &'static str {
    match value {
        IDRParticipationV1::Enabled => "IDR_ENABLED",
        IDRParticipationV1::Disabled => "IDR_DISABLED",
    }
}

fn elapsed_micros(started: Instant) -> u64 {
    started.elapsed().as_micros().min(u64::MAX as u128) as u64
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_contracts::{
        ActiveArtifactViewMode, ArtifactId, ArtifactRevisionId, ArtifactType, FieldId,
    };
    use fielora_storage::idr::{
        DispositionScope, EvidenceBasis, HumanModelItemRecord, HumanModelLifecycle,
        HumanModelPayloadV1, PreferencePayloadV1, PreferenceRelation, ProvenanceAdmissionRelation,
        ProvenanceRefInput, ProvenanceSourceRefKind, ProvenanceSourceType,
    };

    fn project(revision: u64) -> ProjectView {
        ProjectView {
            field_id: FieldId::new("project-builder"),
            title: "Builder".into(),
            goal: None,
            root_path: "C:/builder".into(),
            revision,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn preference_snapshot(revision: u64) -> HumanModelSnapshot {
        HumanModelSnapshot {
            human_model_revision: revision,
            items: vec![HumanModelItemRecord {
                item_id: "preference-builder".into(),
                contract_version: fielora_storage::idr::IDR_CONTRACT_VERSION,
                payload_schema_version: fielora_storage::idr::IDR_PAYLOAD_SCHEMA_VERSION,
                payload: HumanModelPayloadV1::Preference(PreferencePayloadV1 {
                    dimension: "fielora.change_scope.mode".into(),
                    relation: PreferenceRelation::Prefer,
                    normalized_value: "minimal_delta".into(),
                }),
                lifecycle: HumanModelLifecycle::Active,
                evidence_basis: EvidenceBasis::Explicit,
                inference_confidence: None,
                scope: DispositionScope::default(),
                supersedes_item_id: None,
                created_human_model_revision: revision,
                updated_human_model_revision: revision,
                created_at: 1,
                updated_at: 1,
                provenance_refs: vec![ProvenanceRefInput {
                    provenance_ref_id: "provenance-builder".into(),
                    source_type: ProvenanceSourceType::ExplicitUserStatement,
                    source_ref_kind: ProvenanceSourceRefKind::Message,
                    source_ref_id: "message-builder".into(),
                    observed_at: 1,
                    bounded_support: None,
                    source_digest: None,
                    admission_relation: Some(ProvenanceAdmissionRelation::Explicit),
                    source_status_at_admission: ProvenanceSourceStatus::Available,
                }],
                reality_dependencies: Vec::new(),
            }],
        }
    }

    fn covered() -> CurrentConstraintProjectionV1 {
        CurrentConstraintProjectionBuilderV1.build(
            "builder-current",
            "builder-primary-stream",
            vec![SemanticKeyV1::BehaviorDimension(
                "fielora.change_scope.mode".into(),
            )],
            Vec::new(),
        )
    }

    fn input<'a>(
        project: &'a ProjectView,
        snapshot: &'a HumanModelSnapshot,
        current: Option<&'a CurrentConstraintProjectionV1>,
    ) -> TrustedIDRContextInputV1<'a> {
        TrustedIDRContextInputV1 {
            participation: Some(IDRParticipationV1::Enabled),
            run_ref: "builder-run",
            conversation_ref: "builder-conversation",
            context_snapshot_ref: "builder-snapshot",
            project,
            active_artifact: None,
            task_type: TaskTypeV1::General,
            interaction_kind: InteractionKindV1::TaskExecution,
            current_constraints: current,
            snapshot,
        }
    }

    #[test]
    fn builders_preserve_unavailable_and_authoritative_project_artifact_identity() {
        let unavailable = CurrentConstraintProjectionBuilderV1.unavailable("run");
        assert!(unavailable.covered_semantic_keys.is_empty());
        assert!(unavailable.entries.is_empty());
        assert!(
            CurrentConstraintProjectionBuilderV1
                .normalize(&unavailable)
                .unwrap()
                .covered_semantic_keys
                .is_empty()
        );
        let project = project(7);
        let artifact = ActiveArtifactContext {
            artifact_id: ArtifactId::new("artifact-builder"),
            artifact_type: ArtifactType::Document,
            viewed_revision_id: ArtifactRevisionId::new("revision-3"),
            current_revision_id: ArtifactRevisionId::new("revision-3"),
            view_mode: ActiveArtifactViewMode::Current,
            archived: false,
            selected_slide: None,
            selected_sheet_id: None,
        };
        let reality = RealityValidationProjectionBuilderV1.build(
            "reality-builder",
            &project,
            Some(&artifact),
            &HumanModelSnapshot {
                human_model_revision: 0,
                items: Vec::new(),
            },
        );
        assert!(reality.entries.iter().any(|entry| {
            entry.reality_kind == RealityKindV1::Project
                && entry.current_revision == Some(7)
                && entry.current_fingerprint
                    == Some(fingerprint_project_reality("project-builder", 7))
        }));
        assert!(reality.entries.iter().any(|entry| {
            entry.reality_kind == RealityKindV1::Artifact
                && entry.current_state_ref.as_deref() == Some("revision-3")
                && entry.current_fingerprint
                    == Some(fingerprint_artifact_reality(
                        "artifact-builder",
                        "revision-3",
                    ))
        }));
    }

    #[test]
    fn participation_missing_or_disabled_is_generic_and_does_not_touch_snapshot() {
        let project = project(1);
        let snapshot = preference_snapshot(1);
        let mut missing = input(&project, &snapshot, None);
        missing.participation = None;
        let result = IDRProductionIntegrationV1.prepare(missing);
        assert_eq!(result.participation, IDRParticipationV1::Disabled);
        assert!(result.contribution.is_none());
        assert_eq!(snapshot.items.len(), 1);
        let mut disabled = input(&project, &snapshot, None);
        disabled.participation = Some(IDRParticipationV1::Disabled);
        assert!(
            IDRProductionIntegrationV1
                .prepare(disabled)
                .contribution
                .is_none()
        );
    }

    #[test]
    fn invalidation_is_stable_and_changes_only_with_semantic_inputs() {
        let project1 = project(1);
        let project2 = project(2);
        let snapshot1 = preference_snapshot(1);
        let snapshot2 = preference_snapshot(2);
        let current = covered();
        let first =
            IDRProductionIntegrationV1.prepare(input(&project1, &snapshot1, Some(&current)));
        let repeated =
            IDRProductionIntegrationV1.prepare(input(&project1, &snapshot1, Some(&current)));
        assert_eq!(
            first.invalidation_fingerprint,
            repeated.invalidation_fingerprint
        );
        let project_changed =
            IDRProductionIntegrationV1.prepare(input(&project2, &snapshot1, Some(&current)));
        let revision_changed =
            IDRProductionIntegrationV1.prepare(input(&project1, &snapshot2, Some(&current)));
        assert_ne!(
            first.invalidation_fingerprint,
            project_changed.invalidation_fingerprint
        );
        assert_ne!(
            first.invalidation_fingerprint,
            revision_changed.invalidation_fingerprint
        );
    }
}
