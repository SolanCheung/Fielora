//! Bounded event-driven Human Model acquisition and lifecycle operations.
//!
//! A primary Model stream or deterministic typed source may propose; only this
//! deterministic admission layer may call the typed Storage mutation API.

use crate::idr_resolver::validate_registered_payload_v1;
use fielora_contracts::idr::ResolverReasonCodeV1;
use fielora_storage::StorageHandle;
use fielora_storage::idr::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAX_ACQUISITION_PROVENANCE_REFS_V1: usize = 8;
pub const MAX_DISPOSITION_OBSERVATIONS_V1: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SensitiveAdmissionClassV1 {
    OrdinaryBoundedPreference,
    HighRiskPersonalData,
    CredentialOrSecret,
    SecretDerivedData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SensitiveAdmissionDecisionV1 {
    Allow,
    RequireExplicit,
    Deny,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HumanModelUpdateProposalV1 {
    pub item: AdmittedHumanModelItem,
    pub durable_intent_explicit: bool,
    pub sensitive_class: SensitiveAdmissionClassV1,
    pub explicit_sensitive_confirmation: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExplicitActivationV1 {
    pub item_id: String,
    pub explicit_user_confirmation: bool,
    pub confirmation_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DispositionInferenceInputV1 {
    pub item_id: String,
    pub dimension: String,
    pub normalized_value: String,
    pub confidence: InferenceConfidence,
    pub scope: DispositionScope,
    pub observation_item_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcquisitionAdmissionErrorV1 {
    DurableIntentAmbiguous,
    InvalidProposalShape,
    InvalidSemanticRegistry,
    InvalidProvenance,
    SensitiveRequiresExplicit,
    SensitiveDenied,
    ExplicitConfirmationRequired,
    ObservationEvidenceInvalid,
    Storage(IdrStorageError),
}

impl From<IdrStorageError> for AcquisitionAdmissionErrorV1 {
    fn from(value: IdrStorageError) -> Self {
        Self::Storage(value)
    }
}

#[derive(Clone)]
pub struct HumanModelAcquisitionV1 {
    storage: StorageHandle,
}

impl HumanModelAcquisitionV1 {
    pub fn new(storage: StorageHandle) -> Self {
        Self { storage }
    }

    pub fn sensitive_decision(class: SensitiveAdmissionClassV1) -> SensitiveAdmissionDecisionV1 {
        match class {
            SensitiveAdmissionClassV1::OrdinaryBoundedPreference => {
                SensitiveAdmissionDecisionV1::Allow
            }
            SensitiveAdmissionClassV1::HighRiskPersonalData => {
                SensitiveAdmissionDecisionV1::RequireExplicit
            }
            SensitiveAdmissionClassV1::CredentialOrSecret
            | SensitiveAdmissionClassV1::SecretDerivedData => SensitiveAdmissionDecisionV1::Deny,
        }
    }

    pub fn admit_and_commit(
        &self,
        proposal: HumanModelUpdateProposalV1,
        expected_human_model_revision: u64,
        mutation_ref: String,
        now: i64,
    ) -> Result<HumanModelMutationResult, AcquisitionAdmissionErrorV1> {
        validate_proposal(&proposal)?;
        self.storage
            .create_human_model_item(
                proposal.item,
                expected_human_model_revision,
                mutation_ref,
                now,
            )
            .map_err(Into::into)
    }

    pub fn infer_disposition_candidate(
        &self,
        input: DispositionInferenceInputV1,
        expected_human_model_revision: u64,
        mutation_ref: String,
        now: i64,
    ) -> Result<HumanModelMutationResult, AcquisitionAdmissionErrorV1> {
        if input.observation_item_ids.is_empty()
            || input.observation_item_ids.len() > MAX_DISPOSITION_OBSERVATIONS_V1
        {
            return Err(AcquisitionAdmissionErrorV1::ObservationEvidenceInvalid);
        }
        let snapshot = self.storage.read_human_model_snapshot()?;
        if snapshot.human_model_revision != expected_human_model_revision {
            return Err(AcquisitionAdmissionErrorV1::Storage(
                IdrStorageError::RevisionConflict,
            ));
        }
        let mut observation_ids = input.observation_item_ids;
        observation_ids.sort();
        observation_ids.dedup();
        if observation_ids.is_empty()
            || observation_ids.len() > MAX_DISPOSITION_OBSERVATIONS_V1
            || observation_ids.iter().any(|item_id| {
                !snapshot.items.iter().any(|item| {
                    item.item_id == *item_id
                        && item.payload.kind() == HumanModelKind::Observation
                        && matches!(
                            item.lifecycle,
                            HumanModelLifecycle::Active | HumanModelLifecycle::Weakened
                        )
                })
            })
        {
            return Err(AcquisitionAdmissionErrorV1::ObservationEvidenceInvalid);
        }
        let provenance_refs = observation_ids
            .into_iter()
            .map(|item_id| ProvenanceRefInput {
                provenance_ref_id: format!("inference-support:{item_id}"),
                source_type: ProvenanceSourceType::SystemInference,
                source_ref_kind: ProvenanceSourceRefKind::HumanModelItem,
                source_ref_id: item_id.clone(),
                observed_at: now,
                bounded_support: None,
                source_digest: Some(sha256(item_id.as_bytes())),
                admission_relation: Some(ProvenanceAdmissionRelation::InferenceSupport),
                source_status_at_admission: ProvenanceSourceStatus::Available,
            })
            .collect();
        self.admit_and_commit(
            HumanModelUpdateProposalV1 {
                item: AdmittedHumanModelItem {
                    item_id: input.item_id,
                    contract_version: IDR_CONTRACT_VERSION,
                    payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
                    payload: HumanModelPayloadV1::Disposition(DispositionPayloadV1 {
                        dimension: input.dimension,
                        normalized_value: input.normalized_value,
                    }),
                    lifecycle: HumanModelLifecycle::Candidate,
                    evidence_basis: EvidenceBasis::Inferred,
                    inference_confidence: Some(input.confidence),
                    scope: input.scope,
                    provenance_refs,
                    reality_dependencies: Vec::new(),
                },
                durable_intent_explicit: true,
                sensitive_class: SensitiveAdmissionClassV1::OrdinaryBoundedPreference,
                explicit_sensitive_confirmation: false,
            },
            expected_human_model_revision,
            mutation_ref,
            now,
        )
    }

    pub fn activate_disposition(
        &self,
        activation: ExplicitActivationV1,
        expected_human_model_revision: u64,
        now: i64,
    ) -> Result<HumanModelMutationResult, AcquisitionAdmissionErrorV1> {
        if !activation.explicit_user_confirmation || activation.confirmation_ref.trim().is_empty() {
            return Err(AcquisitionAdmissionErrorV1::ExplicitConfirmationRequired);
        }
        let current = self
            .storage
            .get_human_model_item(activation.item_id.clone())?;
        if current.payload.kind() != HumanModelKind::Disposition
            || current.lifecycle != HumanModelLifecycle::Candidate
        {
            return Err(AcquisitionAdmissionErrorV1::InvalidProposalShape);
        }
        self.storage
            .transition_human_model_item(
                activation.item_id,
                HumanModelLifecycle::Active,
                current.inference_confidence,
                expected_human_model_revision,
                "EXPLICIT_USER_ACTIVATION".into(),
                activation.confirmation_ref,
                now,
            )
            .map_err(Into::into)
    }

    pub fn correct(
        &self,
        target_item_id: String,
        replacement: HumanModelUpdateProposalV1,
        expected_human_model_revision: u64,
        mutation_ref: String,
        now: i64,
    ) -> Result<HumanModelCorrectionResult, AcquisitionAdmissionErrorV1> {
        validate_proposal(&replacement)?;
        if replacement.item.lifecycle != HumanModelLifecycle::Active
            || !replacement.item.provenance_refs.iter().any(|provenance| {
                provenance.source_type == ProvenanceSourceType::UserCorrection
                    && provenance.admission_relation
                        == Some(ProvenanceAdmissionRelation::Correction)
            })
        {
            return Err(AcquisitionAdmissionErrorV1::InvalidProposalShape);
        }
        self.storage
            .correct_human_model_item(
                target_item_id,
                replacement.item,
                expected_human_model_revision,
                mutation_ref,
                now,
            )
            .map_err(Into::into)
    }

    pub fn disable_use(
        &self,
        item_id: String,
        expected_human_model_revision: u64,
        mutation_ref: String,
        now: i64,
    ) -> Result<HumanModelMutationResult, AcquisitionAdmissionErrorV1> {
        self.storage
            .disable_human_model_item(item_id, expected_human_model_revision, mutation_ref, now)
            .map_err(Into::into)
    }

    pub fn erase_if_allowed(
        &self,
        item_id: String,
        expected_human_model_revision: u64,
        now: i64,
    ) -> Result<HumanModelEraseResult, AcquisitionAdmissionErrorV1> {
        self.storage
            .erase_human_model_item_if_allowed(item_id, expected_human_model_revision, now)
            .map_err(Into::into)
    }

    pub fn reset_profile(
        &self,
        expected_human_model_revision: u64,
        now: i64,
    ) -> Result<HumanModelResetResult, AcquisitionAdmissionErrorV1> {
        self.storage
            .reset_human_model(expected_human_model_revision, now)
            .map_err(Into::into)
    }
}

pub fn explicit_proposal(
    item_id: String,
    payload: HumanModelPayloadV1,
    scope: DispositionScope,
    provenance: ProvenanceRefInput,
) -> HumanModelUpdateProposalV1 {
    HumanModelUpdateProposalV1 {
        item: AdmittedHumanModelItem {
            item_id,
            contract_version: IDR_CONTRACT_VERSION,
            payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
            payload,
            lifecycle: HumanModelLifecycle::Active,
            evidence_basis: EvidenceBasis::Explicit,
            inference_confidence: None,
            scope,
            provenance_refs: vec![provenance],
            reality_dependencies: Vec::new(),
        },
        durable_intent_explicit: true,
        sensitive_class: SensitiveAdmissionClassV1::OrdinaryBoundedPreference,
        explicit_sensitive_confirmation: false,
    }
}

pub fn observation_proposal(
    item_id: String,
    payload: ObservationPayloadV1,
    scope: DispositionScope,
    provenance: ProvenanceRefInput,
) -> HumanModelUpdateProposalV1 {
    HumanModelUpdateProposalV1 {
        item: AdmittedHumanModelItem {
            item_id,
            contract_version: IDR_CONTRACT_VERSION,
            payload_schema_version: IDR_PAYLOAD_SCHEMA_VERSION,
            payload: HumanModelPayloadV1::Observation(payload),
            lifecycle: HumanModelLifecycle::Active,
            evidence_basis: EvidenceBasis::Observed,
            inference_confidence: None,
            scope,
            provenance_refs: vec![provenance],
            reality_dependencies: Vec::new(),
        },
        durable_intent_explicit: true,
        sensitive_class: SensitiveAdmissionClassV1::OrdinaryBoundedPreference,
        explicit_sensitive_confirmation: false,
    }
}

fn validate_proposal(
    proposal: &HumanModelUpdateProposalV1,
) -> Result<(), AcquisitionAdmissionErrorV1> {
    let kind = proposal.item.payload.kind();
    if !proposal.durable_intent_explicit
        && matches!(
            kind,
            HumanModelKind::Fact | HumanModelKind::Preference | HumanModelKind::LongTermGoal
        )
    {
        return Err(AcquisitionAdmissionErrorV1::DurableIntentAmbiguous);
    }
    validate_registered_payload_v1(&proposal.item.payload)
        .map_err(|_: ResolverReasonCodeV1| AcquisitionAdmissionErrorV1::InvalidSemanticRegistry)?;
    if proposal.item.provenance_refs.is_empty()
        || proposal.item.provenance_refs.len() > MAX_ACQUISITION_PROVENANCE_REFS_V1
        || proposal
            .item
            .provenance_refs
            .iter()
            .any(|provenance| !allowed_source(provenance.source_type))
    {
        return Err(AcquisitionAdmissionErrorV1::InvalidProvenance);
    }
    let serialized = serde_json::to_string(&proposal.item.payload)
        .map_err(|_| AcquisitionAdmissionErrorV1::InvalidProposalShape)?;
    if contains_forbidden_secret_material(&proposal.item.item_id)
        || contains_forbidden_secret_material(&serialized)
        || proposal.item.provenance_refs.iter().any(|provenance| {
            contains_forbidden_secret_material(&provenance.provenance_ref_id)
                || contains_forbidden_secret_material(&provenance.source_ref_id)
                || provenance
                    .bounded_support
                    .as_deref()
                    .is_some_and(contains_forbidden_secret_material)
        })
    {
        return Err(AcquisitionAdmissionErrorV1::SensitiveDenied);
    }
    match HumanModelAcquisitionV1::sensitive_decision(proposal.sensitive_class) {
        SensitiveAdmissionDecisionV1::Allow => {}
        SensitiveAdmissionDecisionV1::RequireExplicit
            if proposal.explicit_sensitive_confirmation
                && proposal.item.evidence_basis == EvidenceBasis::Explicit
                && proposal.item.provenance_refs.iter().any(|provenance| {
                    matches!(
                        provenance.source_type,
                        ProvenanceSourceType::ExplicitUserStatement
                            | ProvenanceSourceType::ExplicitUserSetting
                            | ProvenanceSourceType::UserCorrection
                    )
                }) => {}
        SensitiveAdmissionDecisionV1::RequireExplicit => {
            return Err(AcquisitionAdmissionErrorV1::SensitiveRequiresExplicit);
        }
        SensitiveAdmissionDecisionV1::Deny => {
            return Err(AcquisitionAdmissionErrorV1::SensitiveDenied);
        }
    }
    match kind {
        HumanModelKind::Fact | HumanModelKind::Preference | HumanModelKind::LongTermGoal
            if proposal.item.lifecycle == HumanModelLifecycle::Active
                && proposal.item.evidence_basis == EvidenceBasis::Explicit
                && proposal.item.inference_confidence.is_none()
                && proposal.item.provenance_refs.iter().all(|provenance| {
                    matches!(
                        provenance.source_type,
                        ProvenanceSourceType::ExplicitUserStatement
                            | ProvenanceSourceType::ExplicitUserSetting
                            | ProvenanceSourceType::UserCorrection
                            | ProvenanceSourceType::UserApprovedImport
                    )
                }) => {}
        HumanModelKind::Observation
            if proposal.item.lifecycle == HumanModelLifecycle::Active
                && proposal.item.evidence_basis == EvidenceBasis::Observed
                && proposal.item.inference_confidence.is_none()
                && proposal.item.provenance_refs.iter().all(|provenance| {
                    matches!(
                        provenance.source_type,
                        ProvenanceSourceType::UserCorrection
                            | ProvenanceSourceType::UserAction
                            | ProvenanceSourceType::AgentOutcome
                    )
                }) => {}
        HumanModelKind::Disposition
            if proposal.item.lifecycle == HumanModelLifecycle::Candidate
                && proposal.item.evidence_basis == EvidenceBasis::Inferred
                && proposal.item.inference_confidence.is_some()
                && proposal.item.provenance_refs.iter().all(|provenance| {
                    provenance.source_type == ProvenanceSourceType::SystemInference
                        && provenance.source_ref_kind == ProvenanceSourceRefKind::HumanModelItem
                        && provenance.admission_relation
                            == Some(ProvenanceAdmissionRelation::InferenceSupport)
                }) => {}
        _ => return Err(AcquisitionAdmissionErrorV1::InvalidProposalShape),
    }
    Ok(())
}

fn allowed_source(source: ProvenanceSourceType) -> bool {
    matches!(
        source,
        ProvenanceSourceType::ExplicitUserStatement
            | ProvenanceSourceType::ExplicitUserSetting
            | ProvenanceSourceType::UserCorrection
            | ProvenanceSourceType::UserAction
            | ProvenanceSourceType::AgentOutcome
            | ProvenanceSourceType::SystemInference
            | ProvenanceSourceType::UserApprovedImport
    )
}

fn contains_forbidden_secret_material(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "authorization:",
        "bearer ",
        "api_key",
        "api-key",
        "password",
        "client_secret",
        "credential_fingerprint",
        "secret_hash",
        "secret_prefix",
        "secret_last4",
        "sk-",
        "ghp_",
        "xoxb-",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::idr_integration::{
        CurrentConstraintProjectionBuilderV1, IDRProductionIntegrationV1, TrustedIDRContextInputV1,
    };
    use fielora_contracts::idr::{
        IDRParticipationV1, InteractionKindV1, SemanticKeyV1, TaskTypeV1,
    };
    use fielora_contracts::{FieldId, ProjectView};
    use fielora_platform::{DeviceIdentity, PlatformPaths};
    use fielora_storage::StorageWorker;
    use std::fs;
    use std::path::{Path, PathBuf};
    use uuid::Uuid;

    fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!("fielora-idr-acquisition-{}", Uuid::now_v7()))
    }

    fn start(root: &Path, now: i64) -> StorageWorker {
        let paths = PlatformPaths::from_root(root.to_path_buf()).unwrap();
        let device = DeviceIdentity::load_or_create(&paths.device_identity).unwrap();
        StorageWorker::start(&paths.database, device, now).unwrap()
    }

    fn source(id: &str, source_type: ProvenanceSourceType) -> ProvenanceRefInput {
        ProvenanceRefInput {
            provenance_ref_id: format!("provenance-{id}"),
            source_type,
            source_ref_kind: ProvenanceSourceRefKind::Message,
            source_ref_id: format!("message-{id}"),
            observed_at: 10,
            bounded_support: None,
            source_digest: None,
            admission_relation: Some(match source_type {
                ProvenanceSourceType::UserCorrection => ProvenanceAdmissionRelation::Correction,
                ProvenanceSourceType::UserApprovedImport => ProvenanceAdmissionRelation::Import,
                ProvenanceSourceType::UserAction | ProvenanceSourceType::AgentOutcome => {
                    ProvenanceAdmissionRelation::Confirmation
                }
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
        source_type: ProvenanceSourceType,
    ) -> HumanModelUpdateProposalV1 {
        explicit_proposal(
            id.into(),
            HumanModelPayloadV1::Preference(PreferencePayloadV1 {
                dimension: "fielora.change_scope.mode".into(),
                relation: PreferenceRelation::Prefer,
                normalized_value: value.into(),
            }),
            DispositionScope::default(),
            source(id, source_type),
        )
    }

    #[test]
    fn explicit_fact_preference_goal_and_revision_concurrency_are_admitted() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let acquisition = HumanModelAcquisitionV1::new(worker.handle());
        let proposals = [
            explicit_proposal(
                "fact".into(),
                HumanModelPayloadV1::Fact(FactPayloadV1 {
                    subject_key: "fielora.human.communication_language".into(),
                    value: FactValueV1::Token("bilingual".into()),
                    qualifier: None,
                }),
                DispositionScope::default(),
                source("fact", ProvenanceSourceType::ExplicitUserStatement),
            ),
            preference(
                "preference",
                "minimal_delta",
                ProvenanceSourceType::ExplicitUserSetting,
            ),
            explicit_proposal(
                "goal".into(),
                HumanModelPayloadV1::LongTermGoal(LongTermGoalPayloadV1 {
                    goal_key: "fielora.goal.product.provider_neutrality".into(),
                    desired_outcome: "maintain_provider_neutrality".into(),
                }),
                DispositionScope::default(),
                source("goal", ProvenanceSourceType::ExplicitUserStatement),
            ),
        ];
        for (index, proposal) in proposals.into_iter().enumerate() {
            let result = acquisition
                .admit_and_commit(
                    proposal,
                    index as u64,
                    format!("mutation-{index}"),
                    20 + index as i64,
                )
                .unwrap();
            assert_eq!(result.human_model_revision, index as u64 + 1);
        }
        let stale = acquisition.admit_and_commit(
            preference(
                "stale",
                "bounded_change",
                ProvenanceSourceType::ExplicitUserStatement,
            ),
            1,
            "stale".into(),
            30,
        );
        assert_eq!(
            stale,
            Err(AcquisitionAdmissionErrorV1::Storage(
                IdrStorageError::RevisionConflict
            ))
        );
        assert_eq!(worker.handle().get_human_model_revision().unwrap(), 3);
        drop(worker);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn observation_to_candidate_requires_explicit_activation_before_influence() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let acquisition = HumanModelAcquisitionV1::new(handle.clone());
        for (revision, id) in [(0, "observation-a"), (1, "observation-b")] {
            acquisition
                .admit_and_commit(
                    observation_proposal(
                        id.into(),
                        ObservationPayloadV1 {
                            observation_kind: "fielora.observation.user_choice".into(),
                            normalized_value: "milestone_updates".into(),
                            related_dimension: Some("fielora.planning.mode".into()),
                        },
                        DispositionScope::default(),
                        source(id, ProvenanceSourceType::UserAction),
                    ),
                    revision,
                    format!("observe-{id}"),
                    10 + revision as i64,
                )
                .unwrap();
        }
        let candidate = acquisition
            .infer_disposition_candidate(
                DispositionInferenceInputV1 {
                    item_id: "candidate".into(),
                    dimension: "fielora.planning.mode".into(),
                    normalized_value: "milestone_updates".into(),
                    confidence: InferenceConfidence::High,
                    scope: DispositionScope::default(),
                    observation_item_ids: vec!["observation-a".into(), "observation-b".into()],
                },
                2,
                "infer-candidate".into(),
                20,
            )
            .unwrap();
        assert_eq!(candidate.item.lifecycle, HumanModelLifecycle::Candidate);
        assert_eq!(candidate.human_model_revision, 3);
        assert_eq!(
            acquisition.activate_disposition(
                ExplicitActivationV1 {
                    item_id: "candidate".into(),
                    explicit_user_confirmation: false,
                    confirmation_ref: "message-confirm".into(),
                },
                3,
                21,
            ),
            Err(AcquisitionAdmissionErrorV1::ExplicitConfirmationRequired)
        );
        assert_eq!(handle.get_human_model_revision().unwrap(), 3);
        let active = acquisition
            .activate_disposition(
                ExplicitActivationV1 {
                    item_id: "candidate".into(),
                    explicit_user_confirmation: true,
                    confirmation_ref: "message-confirm".into(),
                },
                3,
                22,
            )
            .unwrap();
        assert_eq!(active.item.lifecycle, HumanModelLifecycle::Active);
        assert_eq!(active.human_model_revision, 4);
        drop(worker);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn correction_disable_erase_and_reset_are_atomic_and_semantically_bounded() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        let acquisition = HumanModelAcquisitionV1::new(handle.clone());
        acquisition
            .admit_and_commit(
                preference(
                    "old",
                    "minimal_delta",
                    ProvenanceSourceType::ExplicitUserStatement,
                ),
                0,
                "create-old".into(),
                10,
            )
            .unwrap();
        let corrected = acquisition
            .correct(
                "old".into(),
                preference(
                    "new",
                    "bounded_change",
                    ProvenanceSourceType::UserCorrection,
                ),
                1,
                "correct-old".into(),
                11,
            )
            .unwrap();
        assert_eq!(
            corrected.previous.lifecycle,
            HumanModelLifecycle::Superseded
        );
        assert_eq!(corrected.replacement.lifecycle, HumanModelLifecycle::Active);
        assert_eq!(corrected.human_model_revision, 2);
        let disabled = acquisition
            .disable_use("new".into(), 2, "disable-new".into(), 12)
            .unwrap();
        assert_eq!(disabled.item.lifecycle, HumanModelLifecycle::Revoked);
        let erased = acquisition.erase_if_allowed("new".into(), 3, 13).unwrap();
        assert_eq!(erased.human_model_revision, 4);
        assert!(handle.get_human_model_item("new".into()).is_err());
        let reset = acquisition.reset_profile(4, 14).unwrap();
        assert_eq!(reset.human_model_revision, 5);
        assert_eq!(reset.erased_items, 1);
        assert!(handle.read_human_model_snapshot().unwrap().items.is_empty());
        drop(worker);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sensitive_policy_allows_bounded_requires_explicit_and_denies_secret_material() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let acquisition = HumanModelAcquisitionV1::new(worker.handle());
        let mut high_risk = explicit_proposal(
            "high-risk".into(),
            HumanModelPayloadV1::Fact(FactPayloadV1 {
                subject_key: "fielora.human.accessibility_high_contrast_required".into(),
                value: FactValueV1::Boolean(true),
                qualifier: None,
            }),
            DispositionScope::default(),
            source("high-risk", ProvenanceSourceType::ExplicitUserStatement),
        );
        high_risk.sensitive_class = SensitiveAdmissionClassV1::HighRiskPersonalData;
        assert_eq!(
            acquisition.admit_and_commit(high_risk.clone(), 0, "high-risk".into(), 10),
            Err(AcquisitionAdmissionErrorV1::SensitiveRequiresExplicit)
        );
        high_risk.explicit_sensitive_confirmation = true;
        acquisition
            .admit_and_commit(high_risk, 0, "high-risk-explicit".into(), 11)
            .unwrap();
        let mut secret = preference(
            "secret",
            "minimal_delta",
            ProvenanceSourceType::ExplicitUserStatement,
        );
        secret.sensitive_class = SensitiveAdmissionClassV1::CredentialOrSecret;
        assert_eq!(
            acquisition.admit_and_commit(secret, 1, "secret".into(), 12),
            Err(AcquisitionAdmissionErrorV1::SensitiveDenied)
        );
        assert_eq!(worker.handle().get_human_model_revision().unwrap(), 1);
        drop(worker);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restart_rebuilds_ephemeral_resolution_from_durable_human_model() {
        let root = temporary_root();
        let worker = start(&root, 1);
        let handle = worker.handle();
        HumanModelAcquisitionV1::new(handle)
            .admit_and_commit(
                preference(
                    "restart",
                    "minimal_delta",
                    ProvenanceSourceType::ExplicitUserStatement,
                ),
                0,
                "restart-create".into(),
                10,
            )
            .unwrap();
        drop(worker);

        let restarted = start(&root, 20);
        let snapshot = restarted.handle().read_human_model_snapshot().unwrap();
        let project = ProjectView {
            field_id: FieldId::new("project-restart"),
            title: "Restart".into(),
            goal: None,
            root_path: "C:/restart".into(),
            revision: 1,
            created_at: 1,
            updated_at: 1,
        };
        let current = CurrentConstraintProjectionBuilderV1.build(
            "restart-current",
            "restart-primary",
            vec![SemanticKeyV1::BehaviorDimension(
                "fielora.change_scope.mode".into(),
            )],
            Vec::new(),
        );
        let rebuilt = IDRProductionIntegrationV1.prepare(TrustedIDRContextInputV1 {
            participation: Some(IDRParticipationV1::Enabled),
            run_ref: "restart-run",
            conversation_ref: "restart-conversation",
            context_snapshot_ref: "restart-snapshot",
            project: &project,
            active_artifact: None,
            task_type: TaskTypeV1::General,
            interaction_kind: InteractionKindV1::TaskExecution,
            current_constraints: Some(&current),
            snapshot: &snapshot,
        });
        assert_eq!(rebuilt.human_model_revision, Some(1));
        assert_eq!(rebuilt.contribution.unwrap().entries.len(), 1);
        drop(restarted);
        let _ = fs::remove_dir_all(root);
    }
}
