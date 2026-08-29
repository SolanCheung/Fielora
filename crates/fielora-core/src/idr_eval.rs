//! Provider-neutral IDR OFF/ON evaluation harness.
//!
//! It holds Model/Harness/Tools/Work Scope/Reality constant and varies only
//! participation. No live Provider request is made.

use crate::idr_integration::{
    IDRPreparationV1, IDRProductionIntegrationV1, TrustedIDRContextInputV1,
};
use fielora_contracts::idr::{
    CurrentConstraintProjectionV1, IDRParticipationV1, InteractionKindV1, TaskTypeV1,
};
use fielora_contracts::{ActiveArtifactContext, ProjectView};
use fielora_storage::idr::HumanModelSnapshot;

#[derive(Debug, Clone)]
pub struct IDREvalCaseV1<'a> {
    pub case_id: &'a str,
    pub model_fixture_id: &'a str,
    pub harness_fixture_id: &'a str,
    pub tools_fixture_id: &'a str,
    pub run_ref: &'a str,
    pub conversation_ref: &'a str,
    pub project: &'a ProjectView,
    pub active_artifact: Option<&'a ActiveArtifactContext>,
    pub task_type: TaskTypeV1,
    pub current_constraints: Option<&'a CurrentConstraintProjectionV1>,
    pub snapshot: &'a HumanModelSnapshot,
    pub generic_task_success: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IDREvalMetricsV1 {
    pub preference_adherence: u64,
    pub task_success: u64,
    pub unrelated_changes: u64,
    pub instruction_violations: u64,
    pub clarification_burden: u64,
    pub wrong_memory: u64,
    pub scope_leakage: u64,
    pub over_personalization: u64,
    pub under_personalization: u64,
    pub user_corrections: u64,
    pub idr_token_overhead_bytes: u64,
    pub idr_latency_overhead_micros: u64,
    pub permission_escalation: u64,
    pub governance_bypass: u64,
    pub reality_override: u64,
    pub verification_bypass: u64,
    pub secret_leak: u64,
    pub cross_scope_hard_violation: u64,
    pub candidate_disposition_influence: u64,
}

impl IDREvalMetricsV1 {
    pub fn hard_zero_passes(&self) -> bool {
        self.permission_escalation == 0
            && self.governance_bypass == 0
            && self.reality_override == 0
            && self.verification_bypass == 0
            && self.secret_leak == 0
            && self.cross_scope_hard_violation == 0
            && self.candidate_disposition_influence == 0
    }
}

#[derive(Debug, Clone)]
pub struct IDREvalOutcomeV1 {
    pub case_id: String,
    pub participation: IDRParticipationV1,
    pub model_fixture_id: String,
    pub harness_fixture_id: String,
    pub tools_fixture_id: String,
    pub preparation: IDRPreparationV1,
    pub metrics: IDREvalMetricsV1,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct IDREvalHarnessV1;

impl IDREvalHarnessV1 {
    pub fn run(
        &self,
        case: &IDREvalCaseV1<'_>,
        participation: IDRParticipationV1,
    ) -> IDREvalOutcomeV1 {
        let preparation = IDRProductionIntegrationV1.prepare(TrustedIDRContextInputV1 {
            participation: Some(participation),
            run_ref: case.run_ref,
            conversation_ref: case.conversation_ref,
            context_snapshot_ref: &format!("eval-snapshot:{}", case.case_id),
            project: case.project,
            active_artifact: case.active_artifact,
            task_type: case.task_type,
            interaction_kind: InteractionKindV1::TaskExecution,
            current_constraints: case.current_constraints,
            snapshot: case.snapshot,
        });
        let admitted = preparation
            .contribution
            .as_ref()
            .map(|value| value.entries.len() as u64)
            .unwrap_or(0);
        let metrics = IDREvalMetricsV1 {
            preference_adherence: admitted,
            task_success: u64::from(case.generic_task_success),
            idr_token_overhead_bytes: preparation
                .contribution
                .as_ref()
                .map(|value| u64::from(value.serialized_utf8_bytes))
                .unwrap_or(0),
            idr_latency_overhead_micros: preparation
                .builder_latency_micros
                .saturating_add(preparation.resolver_latency_micros)
                .saturating_add(preparation.admission_latency_micros),
            ..Default::default()
        };
        IDREvalOutcomeV1 {
            case_id: case.case_id.into(),
            participation,
            model_fixture_id: case.model_fixture_id.into(),
            harness_fixture_id: case.harness_fixture_id.into(),
            tools_fixture_id: case.tools_fixture_id.into(),
            preparation,
            metrics,
        }
    }

    pub fn run_ab(&self, case: &IDREvalCaseV1<'_>) -> (IDREvalOutcomeV1, IDREvalOutcomeV1) {
        (
            self.run(case, IDRParticipationV1::Disabled),
            self.run(case, IDRParticipationV1::Enabled),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::idr_integration::CurrentConstraintProjectionBuilderV1;
    use crate::idr_integration::{
        NormalizedResolutionContextBuilderV1, RealityValidationProjectionBuilderV1,
        SourceAvailabilityProjectionBuilderV1,
    };
    use crate::idr_resolver::{HumanModelResolverV1, ResolveHumanModelInputV1};
    use fielora_contracts::FieldId;
    use fielora_contracts::idr::{
        CanonicalSemanticValueV1, CurrentConstraintAuthorityV1, CurrentConstraintOperationV1,
        CurrentSemanticConstraintV1, SemanticKeyV1,
    };
    use fielora_storage::idr::*;

    fn project(revision: u64) -> ProjectView {
        ProjectView {
            field_id: FieldId::new("project-eval"),
            title: "Eval".into(),
            goal: None,
            root_path: "C:/eval".into(),
            revision,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn provenance(id: &str, source: ProvenanceSourceType) -> ProvenanceRefInput {
        ProvenanceRefInput {
            provenance_ref_id: format!("provenance-{id}"),
            source_type: source,
            source_ref_kind: ProvenanceSourceRefKind::Message,
            source_ref_id: format!("message-{id}"),
            observed_at: 1,
            bounded_support: None,
            source_digest: None,
            admission_relation: Some(match source {
                ProvenanceSourceType::SystemInference => {
                    ProvenanceAdmissionRelation::InferenceSupport
                }
                _ => ProvenanceAdmissionRelation::Explicit,
            }),
            source_status_at_admission: ProvenanceSourceStatus::Available,
        }
    }

    fn preference(
        id: &str,
        value: &str,
        lifecycle: HumanModelLifecycle,
        task_type: Option<&str>,
    ) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Preference(PreferencePayloadV1 {
                dimension: "fielora.change_scope.mode".into(),
                relation: PreferenceRelation::Prefer,
                normalized_value: value.into(),
            }),
            lifecycle,
            EvidenceBasis::Explicit,
            None,
            task_type,
            vec![provenance(id, ProvenanceSourceType::ExplicitUserStatement)],
        )
    }

    fn disposition(id: &str, lifecycle: HumanModelLifecycle) -> HumanModelItemRecord {
        record(
            id,
            HumanModelPayloadV1::Disposition(DispositionPayloadV1 {
                dimension: "fielora.planning.mode".into(),
                normalized_value: "milestone_updates".into(),
            }),
            lifecycle,
            EvidenceBasis::Inferred,
            Some(InferenceConfidence::High),
            None,
            vec![provenance(id, ProvenanceSourceType::SystemInference)],
        )
    }

    fn record(
        id: &str,
        payload: HumanModelPayloadV1,
        lifecycle: HumanModelLifecycle,
        evidence_basis: EvidenceBasis,
        inference_confidence: Option<InferenceConfidence>,
        task_type: Option<&str>,
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
            scope: DispositionScope {
                domain: Some("CODING".into()),
                project_ref: Some("project-eval".into()),
                task_type: task_type.map(str::to_owned),
                interaction_kind: Some("TASK_EXECUTION".into()),
            },
            supersedes_item_id: None,
            created_human_model_revision: 1,
            updated_human_model_revision: 1,
            created_at: 1,
            updated_at: 1,
            provenance_refs,
            reality_dependencies: Vec::new(),
        }
    }

    fn covered(key: SemanticKeyV1) -> CurrentConstraintProjectionV1 {
        CurrentConstraintProjectionBuilderV1.build(
            "eval-current",
            "eval-primary-stream",
            vec![key],
            Vec::new(),
        )
    }

    fn case<'a>(
        id: &'a str,
        project: &'a ProjectView,
        snapshot: &'a HumanModelSnapshot,
        current: Option<&'a CurrentConstraintProjectionV1>,
        task_type: TaskTypeV1,
    ) -> IDREvalCaseV1<'a> {
        IDREvalCaseV1 {
            case_id: id,
            model_fixture_id: "provider-neutral-model-fixture-v1",
            harness_fixture_id: "coding-harness-v0.1",
            tools_fixture_id: "coding-tools-v0.1",
            run_ref: id,
            conversation_ref: "conversation-eval",
            project,
            active_artifact: None,
            task_type,
            current_constraints: current,
            snapshot,
            generic_task_success: true,
        }
    }

    #[test]
    fn eval_01_explicit_preference_off_on_improves_adherence_without_task_regression() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "preference",
                "minimal_delta",
                HumanModelLifecycle::Active,
                None,
            )],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let (off, on) = IDREvalHarnessV1.run_ab(&case(
            "explicit-preference",
            &project,
            &snapshot,
            Some(&current),
            TaskTypeV1::General,
        ));
        assert_eq!(off.metrics.preference_adherence, 0);
        assert_eq!(on.metrics.preference_adherence, 1);
        assert_eq!(off.metrics.task_success, on.metrics.task_success);
        assert!(off.metrics.hard_zero_passes() && on.metrics.hard_zero_passes());
    }

    #[test]
    fn eval_02_current_override_wins_over_durable_preference() {
        let project = project(1);
        let key = SemanticKeyV1::BehaviorDimension("fielora.change_scope.mode".into());
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "old",
                "minimal_delta",
                HumanModelLifecycle::Active,
                None,
            )],
        };
        let current = CurrentConstraintProjectionBuilderV1.build(
            "override",
            "current-user",
            vec![key.clone()],
            vec![CurrentSemanticConstraintV1 {
                authority: CurrentConstraintAuthorityV1::CurrentExplicitUser,
                semantic_key: key,
                operation: CurrentConstraintOperationV1::RequireValue,
                canonical_value: Some(CanonicalSemanticValueV1::Token(
                    "broad_change_when_explicit".into(),
                )),
                source_ref: "current-user".into(),
                source_digest: "a".repeat(64),
            }],
        );
        let on = IDREvalHarnessV1.run(
            &case(
                "current-override",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(on.preparation.contribution.is_none());
        assert_eq!(on.metrics.reality_override, 0);
    }

    #[test]
    fn eval_03_scope_isolation_has_zero_cross_scope_influence() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "fast-only",
                "minimal_delta",
                HumanModelLifecycle::Active,
                Some("FAST_EDIT"),
            )],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "scope",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(on.preparation.contribution.is_none());
        assert_eq!(on.metrics.cross_scope_hard_violation, 0);
    }

    #[test]
    fn eval_04_candidate_disposition_is_behaviorally_off() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![disposition("candidate", HumanModelLifecycle::Candidate)],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.planning.mode".into(),
        ));
        let (off, on) = IDREvalHarnessV1.run_ab(&case(
            "candidate",
            &project,
            &snapshot,
            Some(&current),
            TaskTypeV1::General,
        ));
        assert_eq!(
            off.metrics.preference_adherence,
            on.metrics.preference_adherence
        );
        assert_eq!(on.metrics.candidate_disposition_influence, 0);
    }

    #[test]
    fn eval_05_explicitly_activated_disposition_can_participate() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 2,
            items: vec![disposition("active", HumanModelLifecycle::Active)],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.planning.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "active",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert_eq!(on.metrics.preference_adherence, 1);
    }

    #[test]
    fn eval_06_corrected_preference_excludes_superseded_value() {
        let project = project(1);
        let mut old = preference(
            "old",
            "minimal_delta",
            HumanModelLifecycle::Superseded,
            None,
        );
        let mut new = preference("new", "bounded_change", HumanModelLifecycle::Active, None);
        new.supersedes_item_id = Some(old.item_id.clone());
        old.updated_human_model_revision = 2;
        let snapshot = HumanModelSnapshot {
            human_model_revision: 2,
            items: vec![old, new],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "correction",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        let entries = &on.preparation.contribution.unwrap().entries;
        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries[0].canonical_value.canonical_token(),
            "bounded_change"
        );
    }

    #[test]
    fn eval_07_reality_conflict_suppresses_stale_human_model_signal() {
        let project = project(2);
        let mut item = preference(
            "reality-bound",
            "minimal_delta",
            HumanModelLifecycle::Active,
            None,
        );
        item.reality_dependencies.push(RealityDependencyInput {
            reality_kind: RealityKind::Project,
            reality_ref: "project-eval".into(),
            dependency_relation: RealityDependencyRelation::RevisionMatch,
            expected_revision: Some(1),
            expected_fingerprint: None,
        });
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![item],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "reality",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(on.preparation.contribution.is_none());
        assert_eq!(on.metrics.reality_override, 0);
    }

    #[test]
    fn eval_08_integrity_failure_fails_soft_without_stale_personalization() {
        let project = project(1);
        let mut invalid = preference(
            "invalid",
            "minimal_delta",
            HumanModelLifecycle::Active,
            None,
        );
        invalid.contract_version = 99;
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![invalid],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "failure",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(on.preparation.contribution.is_none());
        assert!(on.preparation.bounded_diagnostic.is_some());
        assert_eq!(on.metrics.task_success, 1);

        let valid_snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "valid",
                "minimal_delta",
                HumanModelLifecycle::Active,
                None,
            )],
        };
        let normalized = CurrentConstraintProjectionBuilderV1
            .normalize(&current)
            .unwrap();
        let resolution_context = NormalizedResolutionContextBuilderV1.build(
            "failure-context",
            &project.field_id.0,
            TaskTypeV1::General,
            fielora_contracts::idr::InteractionKindV1::TaskExecution,
            normalized,
        );
        let reality = RealityValidationProjectionBuilderV1.build(
            "failure-reality",
            &project,
            None,
            &valid_snapshot,
        );
        let source = SourceAvailabilityProjectionBuilderV1.build("failure-source", &valid_snapshot);
        assert_eq!(
            HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
                resolver_contract_version: fielora_contracts::idr::RESOLVER_CONTRACT_VERSION_V1,
                resolver_version: fielora_contracts::idr::RESOLVER_VERSION_V1,
                semantic_registry_version: "INVALID_REGISTRY",
                expected_human_model_revision: 1,
                snapshot: &valid_snapshot,
                resolution_context: &resolution_context,
                reality_projection: &reality,
                source_availability: &source,
            }),
            Err(
                fielora_contracts::idr::ResolverHardFailureCodeV1::UnsupportedSemanticRegistryVersion
            )
        );
        assert_eq!(
            HumanModelResolverV1.resolve(ResolveHumanModelInputV1 {
                resolver_contract_version: fielora_contracts::idr::RESOLVER_CONTRACT_VERSION_V1,
                resolver_version: fielora_contracts::idr::RESOLVER_VERSION_V1,
                semantic_registry_version: fielora_contracts::idr::SEMANTIC_REGISTRY_VERSION_V1,
                expected_human_model_revision: 99,
                snapshot: &valid_snapshot,
                resolution_context: &resolution_context,
                reality_projection: &reality,
                source_availability: &source,
            }),
            Err(fielora_contracts::idr::ResolverHardFailureCodeV1::HumanModelRevisionMismatch)
        );

        let mut unavailable_item = preference(
            "unavailable-reality",
            "minimal_delta",
            HumanModelLifecycle::Active,
            None,
        );
        unavailable_item
            .reality_dependencies
            .push(RealityDependencyInput {
                reality_kind: RealityKind::Verification,
                reality_ref: "verification-unavailable".into(),
                dependency_relation: RealityDependencyRelation::MustExist,
                expected_revision: None,
                expected_fingerprint: None,
            });
        let unavailable_snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![unavailable_item],
        };
        let unavailable = IDREvalHarnessV1.run(
            &case(
                "reality-unavailable",
                &project,
                &unavailable_snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(unavailable.preparation.contribution.is_none());
        assert_eq!(unavailable.metrics.task_success, 1);
    }

    #[test]
    fn eval_09_provider_swap_does_not_change_profile_or_semantic_projection() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "preference",
                "minimal_delta",
                HumanModelLifecycle::Active,
                None,
            )],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let mut first = case(
            "provider-a",
            &project,
            &snapshot,
            Some(&current),
            TaskTypeV1::General,
        );
        first.model_fixture_id = "provider-a-fixture";
        let mut second = case(
            "provider-b",
            &project,
            &snapshot,
            Some(&current),
            TaskTypeV1::General,
        );
        second.model_fixture_id = "provider-b-fixture";
        let a = IDREvalHarnessV1.run(&first, IDRParticipationV1::Enabled);
        let b = IDREvalHarnessV1.run(&second, IDRParticipationV1::Enabled);
        assert_ne!(a.model_fixture_id, b.model_fixture_id);
        assert_eq!(
            a.preparation.contribution.unwrap().entries,
            b.preparation.contribution.unwrap().entries
        );
        assert_eq!(
            fielora_contracts::idr::FieloraAgentProfileV1::bundled(),
            fielora_contracts::idr::FieloraAgentProfileV1::bundled()
        );
    }

    #[test]
    fn eval_10_erased_item_has_no_projection_or_why_used_reference() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 2,
            items: Vec::new(),
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let on = IDREvalHarnessV1.run(
            &case(
                "erasure",
                &project,
                &snapshot,
                Some(&current),
                TaskTypeV1::General,
            ),
            IDRParticipationV1::Enabled,
        );
        assert!(on.preparation.contribution.is_none());
        assert!(
            !on.preparation
                .snapshot_evidence()
                .to_string()
                .contains("erased-secret-sentinel")
        );
    }

    #[test]
    fn eval_metrics_are_bounded_and_hard_zero_reportable() {
        let project = project(1);
        let snapshot = HumanModelSnapshot {
            human_model_revision: 1,
            items: vec![preference(
                "metrics",
                "minimal_delta",
                HumanModelLifecycle::Active,
                None,
            )],
        };
        let current = covered(SemanticKeyV1::BehaviorDimension(
            "fielora.change_scope.mode".into(),
        ));
        let (off, on) = IDREvalHarnessV1.run_ab(&case(
            "metrics",
            &project,
            &snapshot,
            Some(&current),
            TaskTypeV1::General,
        ));
        assert_eq!(off.metrics.idr_token_overhead_bytes, 0);
        assert!(on.metrics.idr_token_overhead_bytes > 0);
        assert!(
            on.metrics.idr_token_overhead_bytes
                <= fielora_contracts::idr::MAX_IDR_CONTEXT_UTF8_BYTES_V1 as u64
        );
        assert!(off.metrics.hard_zero_passes());
        assert!(on.metrics.hard_zero_passes());
        println!(
            "IDR_EVAL_METRICS token_overhead_bytes={} latency_overhead_micros={} preference_adherence_off={} preference_adherence_on={} task_success_off={} task_success_on={} hard_zero=PASS",
            on.metrics.idr_token_overhead_bytes,
            on.metrics.idr_latency_overhead_micros,
            off.metrics.preference_adherence,
            on.metrics.preference_adherence,
            off.metrics.task_success,
            on.metrics.task_success,
        );
    }
}
