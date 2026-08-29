//! Provider-neutral contracts for deterministic IDR resolution and Context admission.
//!
//! These types are not part of the current FIPC surface. They deliberately contain
//! no Provider, Model, permission, tool, storage, or UI concepts.

use serde::{Deserialize, Serialize};

pub const RESOLVER_CONTRACT_VERSION_V1: u16 = 1;
pub const RESOLVER_VERSION_V1: &str = "IDR_RESOLVER_V1";
pub const SEMANTIC_REGISTRY_VERSION_V1: &str = "IDR_SEMANTIC_REGISTRY_V1";
pub const RESOLUTION_PROFILE_VERSION_V1: &str = "IDR_RESOLUTION_PROFILE_V1";
pub const RESOLUTION_CONTEXT_VERSION_V1: u16 = 1;
pub const REALITY_PROJECTION_VERSION_V1: u16 = 1;
pub const SOURCE_AVAILABILITY_VERSION_V1: u16 = 1;
pub const CURRENT_CONSTRAINTS_VERSION_V1: u16 = 1;
pub const CONTEXT_ADMISSION_CONTRACT_VERSION_V1: u16 = 1;
pub const CONTEXT_ADMISSION_VERSION_V1: &str = "IDR_CONTEXT_ADMISSION_V1";
pub const APPLICABILITY_PROJECTION_VERSION_V1: u16 = 1;
pub const IDR_TRUST_CLASS_V1: &str = "PERSONALIZATION_SIGNAL_NON_AUTHORITATIVE";
pub const FIELORA_AGENT_PROFILE_VERSION_V1: &str = "FIELORA_AGENT_PROFILE_V1";

pub const MAX_RESOLVER_SNAPSHOT_ITEMS_V1: usize = 4_096;
pub const MAX_RESOLVER_PROVENANCE_REFS_PER_ITEM_V1: usize = 64;
pub const MAX_RESOLVER_REALITY_REFS_PER_ITEM_V1: usize = 16;
pub const MAX_RESOLVER_LINEAGE_DEPTH_V1: usize = 64;
pub const MAX_RESOLVER_CONFLICT_ITEM_REFS_V1: usize = 16;
pub const MAX_RESOLVER_SUPPRESSION_RECORDS_V1: usize = 256;
pub const MAX_RESOLVER_CONFLICT_RECORDS_V1: usize = 128;
pub const MAX_RESOLVED_PROVENANCE_REFS_V1: usize = 3;

pub const MAX_IDR_CONTEXT_ENTRIES_V1: usize = 8;
pub const MAX_IDR_CONTEXT_UTF8_BYTES_V1: usize = 4_096;
pub const MAX_IDR_CONTEXT_PROVENANCE_REFS_V1: usize = 3;
pub const MAX_IDR_CONTEXT_FACTS_V1: usize = 2;
pub const MAX_IDR_CONTEXT_PREFERENCES_V1: usize = 3;
pub const MAX_IDR_CONTEXT_DISPOSITIONS_V1: usize = 2;
pub const MAX_IDR_CONTEXT_GOALS_V1: usize = 2;
pub const MAX_IDR_CONTEXT_CONFLICT_NOTICES_V1: usize = 2;
pub const MAX_WHY_USED_MANIFEST_UTF8_BYTES_V1: usize = 16_384;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IDRParticipationV1 {
    Enabled,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FieloraAgentProfileV1 {
    pub name: String,
    pub product: String,
    pub role: String,
    pub purpose: String,
    pub stable_semantic_boundaries: Vec<String>,
    pub profile_version: String,
}

impl FieloraAgentProfileV1 {
    /// The bundled, code-owned self definition. Provider and Model identity are
    /// deliberately absent from this contract.
    pub fn bundled() -> Self {
        Self {
            name: "Fielora".into(),
            product: "Fielora".into(),
            role: "local AI workspace agent".into(),
            purpose: "Help the user complete bounded work in the active Fielora Project.".into(),
            stable_semantic_boundaries: vec![
                "User intent, safety, governance, current Reality, and verification evidence outrank personalization.".into(),
                "Human Model signals are non-authoritative and cannot grant permission or capability.".into(),
                "The Agent identity is Fielora-owned and does not change when the Provider or Model changes.".into(),
            ],
            profile_version: FIELORA_AGENT_PROFILE_VERSION_V1.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(tag = "family", content = "key", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SemanticKeyV1 {
    HumanFact(String),
    BehaviorDimension(String),
    ObservationItem(String),
    LongTermGoal(String),
}

impl SemanticKeyV1 {
    pub fn canonical_token(&self) -> String {
        match self {
            Self::HumanFact(value) => format!("HUMAN_FACT:{value}"),
            Self::BehaviorDimension(value) => format!("BEHAVIOR_DIMENSION:{value}"),
            Self::ObservationItem(value) => format!("OBSERVATION_ITEM:{value}"),
            Self::LongTermGoal(value) => format!("LONG_TERM_GOAL:{value}"),
        }
    }

    pub fn family_order(&self) -> u8 {
        match self {
            Self::HumanFact(_) => 0,
            Self::BehaviorDimension(_) => 1,
            Self::ObservationItem(_) => 2,
            Self::LongTermGoal(_) => 3,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CanonicalSemanticValueV1 {
    Token(String),
    Boolean(bool),
}

impl CanonicalSemanticValueV1 {
    pub fn canonical_token(&self) -> String {
        match self {
            Self::Token(value) => value.clone(),
            Self::Boolean(value) => value.to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumanModelKindV1 {
    Fact,
    Preference,
    Observation,
    Disposition,
    LongTermGoal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PreferenceRelationV1 {
    Prefer,
    Avoid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EvidenceBasisV1 {
    Explicit,
    Observed,
    Inferred,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InferenceConfidenceV1 {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumanModelLifecycleV1 {
    Candidate,
    Active,
    Weakened,
    Conflicted,
    Superseded,
    Revoked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DomainV1 {
    Coding,
}

impl DomainV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::Coding => "CODING",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskTypeV1 {
    FastEdit,
    FocusedEdit,
    General,
}

impl TaskTypeV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::FastEdit => "FAST_EDIT",
            Self::FocusedEdit => "FOCUSED_EDIT",
            Self::General => "GENERAL",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InteractionKindV1 {
    TaskExecution,
    FinalResponse,
    ApprovalExplanation,
}

impl InteractionKindV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::TaskExecution => "TASK_EXECUTION",
            Self::FinalResponse => "FINAL_RESPONSE",
            Self::ApprovalExplanation => "APPROVAL_EXPLANATION",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", content = "value", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SelectorStateV1<T> {
    Known(T),
    KnownAbsent,
    Unavailable,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedScopeV1 {
    pub domain: Option<DomainV1>,
    pub project_ref: Option<String>,
    pub task_type: Option<TaskTypeV1>,
    pub interaction_kind: Option<InteractionKindV1>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ScopeSpecificityV1(pub [u8; 5]);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CurrentConstraintAuthorityV1 {
    CurrentExplicitUser,
    CurrentReality,
    CurrentTaskProject,
}

impl CurrentConstraintAuthorityV1 {
    pub fn precedence(self) -> u8 {
        match self {
            Self::CurrentExplicitUser => 3,
            Self::CurrentReality => 2,
            Self::CurrentTaskProject => 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CurrentConstraintOperationV1 {
    RequireValue,
    ForbidValue,
    SuppressDurableKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentSemanticConstraintV1 {
    pub authority: CurrentConstraintAuthorityV1,
    pub semantic_key: SemanticKeyV1,
    pub operation: CurrentConstraintOperationV1,
    pub canonical_value: Option<CanonicalSemanticValueV1>,
    pub source_ref: String,
    pub source_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedCurrentConstraintsV1 {
    pub contract_version: u16,
    pub constraint_set_ref: String,
    pub covered_semantic_keys: Vec<SemanticKeyV1>,
    pub entries: Vec<CurrentSemanticConstraintV1>,
    pub constraints_digest: String,
}

/// Provider-neutral semantic projection emitted by the primary Model stream or
/// supplied by a deterministic typed source. An empty covered-key set means
/// that current natural-language semantics are unavailable, not known absent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentConstraintProjectionV1 {
    pub contract_version: u16,
    pub projection_ref: String,
    pub source_ref: String,
    pub covered_semantic_keys: Vec<SemanticKeyV1>,
    pub entries: Vec<CurrentSemanticConstraintV1>,
    pub projection_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedResolutionContextV1 {
    pub contract_version: u16,
    pub context_ref: String,
    pub project: SelectorStateV1<String>,
    pub domain: SelectorStateV1<DomainV1>,
    pub task_type: SelectorStateV1<TaskTypeV1>,
    pub interaction_kind: SelectorStateV1<InteractionKindV1>,
    pub current_constraints: NormalizedCurrentConstraintsV1,
    pub context_fingerprint: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RealityKindV1 {
    Project,
    Artifact,
    Decision,
    Verification,
    FieldObject,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RealityAvailabilityV1 {
    Available,
    Missing,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealityStateEntryV1 {
    pub reality_kind: RealityKindV1,
    pub reality_ref: String,
    pub availability: RealityAvailabilityV1,
    pub current_revision: Option<u64>,
    pub current_state_ref: Option<String>,
    pub current_fingerprint: Option<String>,
    pub authority_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealityValidationProjectionV1 {
    pub contract_version: u16,
    pub projection_ref: String,
    pub authority_revision_or_digest: String,
    pub entries: Vec<RealityStateEntryV1>,
    pub projection_digest: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SourceAvailabilityStateV1 {
    Available,
    Missing,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceAvailabilityEntryV1 {
    pub provenance_ref_id: String,
    pub state: SourceAvailabilityStateV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceAvailabilityProjectionV1 {
    pub contract_version: u16,
    pub projection_ref: String,
    pub entries: Vec<SourceAvailabilityEntryV1>,
    pub projection_digest: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RealityValidationStateV1 {
    Valid,
    StaleRealityRef,
    RealityUnresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolvedRealityRefV1 {
    pub reality_kind: RealityKindV1,
    pub reality_ref: String,
    pub validation_state: RealityValidationStateV1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CurrentConstraintStateV1 {
    Compatible,
    Overridden,
    Unresolved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResolverHardFailureCodeV1 {
    UnsupportedContractVersion,
    UnsupportedResolverVersion,
    UnsupportedSemanticRegistryVersion,
    HumanModelRevisionMismatch,
    InvalidHumanModelSnapshot,
    InvalidResolutionContext,
    InvalidRealityProjection,
    InvalidSourceAvailabilityProjection,
    InvalidLineage,
    ResolverInputLimit,
}

impl ResolverHardFailureCodeV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::UnsupportedContractVersion => "UNSUPPORTED_CONTRACT_VERSION",
            Self::UnsupportedResolverVersion => "UNSUPPORTED_RESOLVER_VERSION",
            Self::UnsupportedSemanticRegistryVersion => "UNSUPPORTED_SEMANTIC_REGISTRY_VERSION",
            Self::HumanModelRevisionMismatch => "HUMAN_MODEL_REVISION_MISMATCH",
            Self::InvalidHumanModelSnapshot => "INVALID_HUMAN_MODEL_SNAPSHOT",
            Self::InvalidResolutionContext => "INVALID_RESOLUTION_CONTEXT",
            Self::InvalidRealityProjection => "INVALID_REALITY_PROJECTION",
            Self::InvalidSourceAvailabilityProjection => "INVALID_SOURCE_AVAILABILITY_PROJECTION",
            Self::InvalidLineage => "INVALID_LINEAGE",
            Self::ResolverInputLimit => "RESOLVER_INPUT_LIMIT",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResolverReasonCodeV1 {
    InvalidSemanticKey,
    UnsupportedSemanticValue,
    UnsupportedScopeValue,
    LifecycleExcluded,
    ConflictedItem,
    SupersededItem,
    RevokedItem,
    ScopeMismatch,
    ScopeInputUnavailable,
    SourceMissing,
    SourceUnresolved,
    SourceConflict,
    SourceNotAuthoritative,
    StaleRealityRef,
    RealityUnresolved,
    CurrentInstructionOverride,
    CurrentRealityOverride,
    CurrentTaskProjectOverride,
    CurrentConstraintsUnavailable,
    LineagePredecessorUnavailable,
    SemanticDuplicate,
    SemanticConflict,
    LowerPrecedence,
    NotEffectiveKind,
    ResolverItemLimit,
    DiagnosticLimit,
    ProjectionLimit,
}

impl ResolverReasonCodeV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::InvalidSemanticKey => "INVALID_SEMANTIC_KEY",
            Self::UnsupportedSemanticValue => "UNSUPPORTED_SEMANTIC_VALUE",
            Self::UnsupportedScopeValue => "UNSUPPORTED_SCOPE_VALUE",
            Self::LifecycleExcluded => "LIFECYCLE_EXCLUDED",
            Self::ConflictedItem => "CONFLICTED_ITEM",
            Self::SupersededItem => "SUPERSEDED_ITEM",
            Self::RevokedItem => "REVOKED_ITEM",
            Self::ScopeMismatch => "SCOPE_MISMATCH",
            Self::ScopeInputUnavailable => "SCOPE_INPUT_UNAVAILABLE",
            Self::SourceMissing => "SOURCE_MISSING",
            Self::SourceUnresolved => "SOURCE_UNRESOLVED",
            Self::SourceConflict => "SOURCE_CONFLICT",
            Self::SourceNotAuthoritative => "SOURCE_NOT_AUTHORITATIVE",
            Self::StaleRealityRef => "STALE_REALITY_REF",
            Self::RealityUnresolved => "REALITY_UNRESOLVED",
            Self::CurrentInstructionOverride => "CURRENT_INSTRUCTION_OVERRIDE",
            Self::CurrentRealityOverride => "CURRENT_REALITY_OVERRIDE",
            Self::CurrentTaskProjectOverride => "CURRENT_TASK_PROJECT_OVERRIDE",
            Self::CurrentConstraintsUnavailable => "CURRENT_CONSTRAINTS_UNAVAILABLE",
            Self::LineagePredecessorUnavailable => "LINEAGE_PREDECESSOR_UNAVAILABLE",
            Self::SemanticDuplicate => "SEMANTIC_DUPLICATE",
            Self::SemanticConflict => "SEMANTIC_CONFLICT",
            Self::LowerPrecedence => "LOWER_PRECEDENCE",
            Self::NotEffectiveKind => "NOT_EFFECTIVE_KIND",
            Self::ResolverItemLimit => "RESOLVER_ITEM_LIMIT",
            Self::DiagnosticLimit => "DIAGNOSTIC_LIMIT",
            Self::ProjectionLimit => "PROJECTION_LIMIT",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumanModelConflictKindV1 {
    FactValueConflict,
    PreferenceConflict,
    DispositionConflict,
    GoalConflict,
    ResolvedByExplicitAuthority,
    ResolvedByScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumanModelConflictStateV1 {
    Resolved,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HumanModelConflictV1 {
    pub semantic_key: SemanticKeyV1,
    pub conflict_kind: HumanModelConflictKindV1,
    pub state: HumanModelConflictStateV1,
    pub member_item_refs: Vec<String>,
    pub selected_item_refs: Vec<String>,
    pub suppressed_item_refs: Vec<String>,
    pub reason_codes: Vec<ResolverReasonCodeV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HumanModelSuppressionV1 {
    pub item_id: String,
    pub kind: HumanModelKindV1,
    pub semantic_key: Option<SemanticKeyV1>,
    pub reason_codes: Vec<ResolverReasonCodeV1>,
    pub selected_by_item_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolvedHumanModelItemV1 {
    pub item_id: String,
    pub kind: HumanModelKindV1,
    pub semantic_key: SemanticKeyV1,
    pub relation: Option<PreferenceRelationV1>,
    pub canonical_value: CanonicalSemanticValueV1,
    pub matched_scope: NormalizedScopeV1,
    pub scope_specificity: ScopeSpecificityV1,
    pub evidence_basis: EvidenceBasisV1,
    pub inference_confidence: Option<InferenceConfidenceV1>,
    pub provenance_ref_ids: Vec<String>,
    pub omitted_provenance_ref_count: u32,
    pub reality_validation: Vec<ResolvedRealityRefV1>,
    pub current_constraint_state: CurrentConstraintStateV1,
    pub resolution_reason_codes: Vec<ResolverReasonCodeV1>,
    pub lineage_predecessor_refs: Vec<String>,
    pub lineage_incomplete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolvedViewContextBindingV1 {
    pub context_ref: String,
    pub context_fingerprint: String,
    pub reality_projection_ref: String,
    pub reality_projection_digest: String,
    pub source_availability_ref: String,
    pub source_availability_digest: String,
    pub current_constraints_ref: String,
    pub current_constraints_digest: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolverDiagnosticsSummaryV1 {
    pub total_suppression_count: u32,
    pub omitted_suppression_count: u32,
    pub omitted_suppression_digest: Option<String>,
    pub total_conflict_count: u32,
    pub omitted_conflict_count: u32,
    pub omitted_conflict_digest: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolvedHumanModelViewV1 {
    pub resolver_contract_version: u16,
    pub resolver_version: String,
    pub semantic_registry_version: String,
    pub resolution_profile_version: String,
    pub source_human_model_revision: u64,
    pub resolution_context: ResolvedViewContextBindingV1,
    pub resolution_ref: String,
    pub effective_items: Vec<ResolvedHumanModelItemV1>,
    pub conflicts: Vec<HumanModelConflictV1>,
    pub suppressed: Vec<HumanModelSuppressionV1>,
    pub diagnostics_summary: ResolverDiagnosticsSummaryV1,
    pub canonical_result_digest: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IDRMaterialityV1 {
    Required,
    Relevant,
    NotRelevant,
}

impl IDRMaterialityV1 {
    pub fn allocation_order(self) -> u8 {
        match self {
            Self::Required => 0,
            Self::Relevant => 1,
            Self::NotRelevant => 2,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRApplicabilityEntryV1 {
    pub semantic_key: SemanticKeyV1,
    pub materiality: IDRMaterialityV1,
    pub deterministic_order: u16,
    pub source_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRApplicabilityProjectionV1 {
    pub contract_version: u16,
    pub projection_ref: String,
    pub entries: Vec<IDRApplicabilityEntryV1>,
    pub projection_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRContextBudgetV1 {
    pub max_entries: usize,
    pub max_serialized_utf8_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRInvocationBindingV1 {
    pub run_ref: String,
    pub conversation_ref: String,
    pub project_ref: String,
    pub context_snapshot_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRContextAdmissionInputV1 {
    pub admission_contract_version: u16,
    pub admission_version: String,
    pub resolved_view: ResolvedHumanModelViewV1,
    pub expected_resolution_ref: String,
    pub expected_resolution_context_fingerprint: String,
    pub applicability: IDRApplicabilityProjectionV1,
    pub requested_budget: IDRContextBudgetV1,
    pub invocation_binding: IDRInvocationBindingV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRProjectionEntryV1 {
    pub kind: HumanModelKindV1,
    pub semantic_key: SemanticKeyV1,
    pub relation: Option<PreferenceRelationV1>,
    pub canonical_value: CanonicalSemanticValueV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRNeutralConflictNoticeV1 {
    pub semantic_key: SemanticKeyV1,
    pub applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhyUsedRealityRefV1 {
    pub reality_kind: RealityKindV1,
    pub reality_ref: String,
    pub validation_state: RealityValidationStateV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhyUsedAdmittedItemV1 {
    pub projection_index: u16,
    pub item_id: String,
    pub kind: HumanModelKindV1,
    pub semantic_key: SemanticKeyV1,
    pub canonical_value_digest: String,
    pub matched_scope: NormalizedScopeV1,
    pub lifecycle: HumanModelLifecycleV1,
    pub evidence_basis: EvidenceBasisV1,
    pub inference_confidence: Option<InferenceConfidenceV1>,
    pub admission_reason: IDRMaterialityV1,
    pub provenance_ref_ids: Vec<String>,
    pub reality_refs: Vec<WhyUsedRealityRefV1>,
    pub current_constraint_state: CurrentConstraintStateV1,
    pub serialized_entry_bytes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhyUsedConflictNoticeV1 {
    pub semantic_key: SemanticKeyV1,
    pub conflict_record_digest: String,
    pub admission_reason: IDRMaterialityV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhyUsedOmissionCountV1 {
    pub reason: ResolverReasonCodeV1,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhyUsedManifestV1 {
    pub contract_version: u16,
    pub admission_version: String,
    pub resolver_version: String,
    pub semantic_registry_version: String,
    pub resolution_ref: String,
    pub human_model_revision: u64,
    pub resolution_context_fingerprint: String,
    pub reality_projection_ref: String,
    pub reality_projection_digest: String,
    pub current_constraints_ref: String,
    pub current_constraints_digest: String,
    pub applicability_projection_ref: String,
    pub applicability_projection_digest: String,
    pub invocation_binding: IDRInvocationBindingV1,
    pub admitted: Vec<WhyUsedAdmittedItemV1>,
    pub conflict_notices: Vec<WhyUsedConflictNoticeV1>,
    pub omitted_count: u32,
    pub omitted_reason_counts: Vec<WhyUsedOmissionCountV1>,
    pub projection_entry_count: u16,
    pub projection_utf8_bytes: u32,
    pub projection_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IDRContextContributionV1 {
    pub admission_contract_version: u16,
    pub admission_version: String,
    pub trust_class: String,
    pub resolution_ref: String,
    pub source_human_model_revision: u64,
    pub entries: Vec<IDRProjectionEntryV1>,
    pub conflict_notices: Vec<IDRNeutralConflictNoticeV1>,
    pub omitted_count: u32,
    pub serialized_utf8_bytes: u32,
    pub content_sha256: String,
    pub serialized_block: String,
    pub why_used_manifest: WhyUsedManifestV1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IDRContextAdmissionErrorV1 {
    UnsupportedAdmissionVersion,
    ResolutionRefMismatch,
    ResolutionContextMismatch,
    InvalidApplicabilityProjection,
    InvalidContextBudget,
    WhyUsedManifestInvalid,
}

impl IDRContextAdmissionErrorV1 {
    pub fn as_token(self) -> &'static str {
        match self {
            Self::UnsupportedAdmissionVersion => "UNSUPPORTED_ADMISSION_VERSION",
            Self::ResolutionRefMismatch => "RESOLUTION_REF_MISMATCH",
            Self::ResolutionContextMismatch => "RESOLUTION_CONTEXT_MISMATCH",
            Self::InvalidApplicabilityProjection => "INVALID_APPLICABILITY_PROJECTION",
            Self::InvalidContextBudget => "INVALID_CONTEXT_BUDGET",
            Self::WhyUsedManifestInvalid => "WHY_USED_MANIFEST_INVALID",
        }
    }
}

/// Shared canonical byte encoder used by Resolver and Context Admission hashes.
/// Callers sort lists according to their contract before adding them.
#[derive(Debug, Clone)]
pub struct CanonicalEncoderV1 {
    bytes: Vec<u8>,
}

impl CanonicalEncoderV1 {
    pub fn new(domain: &str) -> Self {
        let mut bytes = domain.as_bytes().to_vec();
        bytes.push(0);
        Self { bytes }
    }

    pub fn field_absent(&mut self, tag: &str) {
        self.bytes.extend_from_slice(tag.as_bytes());
        self.bytes.extend_from_slice(&[0, 0]);
    }

    pub fn field_bytes(&mut self, tag: &str, value: &[u8]) {
        self.bytes.extend_from_slice(tag.as_bytes());
        self.bytes.push(0);
        self.bytes.push(1);
        self.bytes
            .extend_from_slice(&(value.len() as u32).to_be_bytes());
        self.bytes.extend_from_slice(value);
    }

    pub fn field_str(&mut self, tag: &str, value: &str) {
        self.field_bytes(tag, value.as_bytes());
    }

    pub fn field_u16(&mut self, tag: &str, value: u16) {
        self.field_bytes(tag, &value.to_be_bytes());
    }

    pub fn field_u32(&mut self, tag: &str, value: u32) {
        self.field_bytes(tag, &value.to_be_bytes());
    }

    pub fn field_u64(&mut self, tag: &str, value: u64) {
        self.field_bytes(tag, &value.to_be_bytes());
    }

    pub fn field_list(&mut self, tag: &str, values: &[Vec<u8>]) {
        let mut encoded = Vec::new();
        encoded.extend_from_slice(&(values.len() as u32).to_be_bytes());
        for value in values {
            encoded.extend_from_slice(&(value.len() as u32).to_be_bytes());
            encoded.extend_from_slice(value);
        }
        self.field_bytes(tag, &encoded);
    }

    pub fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolver_reason_tokens_are_closed_and_stable() {
        let hard = [
            ResolverHardFailureCodeV1::UnsupportedContractVersion,
            ResolverHardFailureCodeV1::UnsupportedResolverVersion,
            ResolverHardFailureCodeV1::UnsupportedSemanticRegistryVersion,
            ResolverHardFailureCodeV1::HumanModelRevisionMismatch,
            ResolverHardFailureCodeV1::InvalidHumanModelSnapshot,
            ResolverHardFailureCodeV1::InvalidResolutionContext,
            ResolverHardFailureCodeV1::InvalidRealityProjection,
            ResolverHardFailureCodeV1::InvalidSourceAvailabilityProjection,
            ResolverHardFailureCodeV1::InvalidLineage,
            ResolverHardFailureCodeV1::ResolverInputLimit,
        ];
        assert_eq!(
            hard.map(ResolverHardFailureCodeV1::as_token),
            [
                "UNSUPPORTED_CONTRACT_VERSION",
                "UNSUPPORTED_RESOLVER_VERSION",
                "UNSUPPORTED_SEMANTIC_REGISTRY_VERSION",
                "HUMAN_MODEL_REVISION_MISMATCH",
                "INVALID_HUMAN_MODEL_SNAPSHOT",
                "INVALID_RESOLUTION_CONTEXT",
                "INVALID_REALITY_PROJECTION",
                "INVALID_SOURCE_AVAILABILITY_PROJECTION",
                "INVALID_LINEAGE",
                "RESOLVER_INPUT_LIMIT",
            ]
        );
        assert_eq!(
            ResolverReasonCodeV1::SemanticConflict.as_token(),
            "SEMANTIC_CONFLICT"
        );
        assert_eq!(
            ResolverReasonCodeV1::ProjectionLimit.as_token(),
            "PROJECTION_LIMIT"
        );
        assert_eq!(
            IDRContextAdmissionErrorV1::WhyUsedManifestInvalid.as_token(),
            "WHY_USED_MANIFEST_INVALID"
        );
    }

    #[test]
    fn idr_contracts_reject_unknown_fields_and_have_no_provider_or_model_input() {
        assert!(
            serde_json::from_str::<NormalizedScopeV1>(
                r#"{"domain":null,"project_ref":null,"task_type":null,"interaction_kind":null,"provider":"forbidden"}"#,
            )
            .is_err()
        );
        let context = NormalizedResolutionContextV1 {
            contract_version: 1,
            context_ref: "context".into(),
            project: SelectorStateV1::KnownAbsent,
            domain: SelectorStateV1::Known(DomainV1::Coding),
            task_type: SelectorStateV1::Known(TaskTypeV1::General),
            interaction_kind: SelectorStateV1::Known(InteractionKindV1::TaskExecution),
            current_constraints: NormalizedCurrentConstraintsV1 {
                contract_version: 1,
                constraint_set_ref: "constraints".into(),
                covered_semantic_keys: Vec::new(),
                entries: Vec::new(),
                constraints_digest: "a".repeat(64),
            },
            context_fingerprint: "b".repeat(64),
        };
        let encoded = serde_json::to_string(&context).unwrap();
        assert!(!encoded.contains("provider"));
        assert!(!encoded.contains("model"));
        assert!(!encoded.contains("timestamp"));
    }

    #[test]
    fn canonical_encoder_is_length_prefixed_and_platform_independent() {
        let mut encoder = CanonicalEncoderV1::new("TEST_DOMAIN");
        encoder.field_str("alpha", "value");
        encoder.field_u64("revision", 7);
        encoder.field_absent("optional");
        assert_eq!(
            encoder.finish(),
            [
                b"TEST_DOMAIN\0".as_slice(),
                b"alpha\0\x01\0\0\0\x05value".as_slice(),
                b"revision\0\x01\0\0\0\x08\0\0\0\0\0\0\0\x07".as_slice(),
                b"optional\0\0".as_slice(),
            ]
            .concat()
        );
    }

    #[test]
    fn bundled_agent_profile_is_fielora_owned_and_provider_neutral() {
        let profile = FieloraAgentProfileV1::bundled();
        assert_eq!(profile.name, "Fielora");
        assert_eq!(profile.product, "Fielora");
        assert_eq!(profile.role, "local AI workspace agent");
        assert_eq!(profile.profile_version, FIELORA_AGENT_PROFILE_VERSION_V1);
        let encoded = serde_json::to_string(&profile).unwrap();
        for forbidden in ["provider_id", "model_id", "openai", "anthropic"] {
            assert!(!encoded.to_ascii_lowercase().contains(forbidden));
        }
        assert_eq!(
            serde_json::to_string(&FieloraAgentProfileV1::bundled()).unwrap(),
            encoded
        );
    }
}
