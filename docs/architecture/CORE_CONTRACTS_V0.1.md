# Fielora V0.1 Core Contracts

状态：FROZEN / APPROVED（含 Phase 02 Frozen Contract Delta）

版本：V0.1

日期：2026-08-14
原则：语义完整，物理实现克制

Phase 02 精确 Frozen 增量见 `PHASE_02_CONTRACT_DELTA_V0.1.md`。Freeze 本身不构成实现授权；用户随后单独授权、验收并裁决 `PHASE_02: COMPLETE`。Frozen Contract semantics 未改变，Phase 03 未授权。

## 1. Contract 总图

```text
Intent
  → Field Runtime
      ├─ Reality: Field / State / Object / Relation / Activity
      ├─ Work: Requirement / DevelopmentTask / CodingSession / ProjectReality
      ├─ Execution: Capability / Policy / CapabilityExecution
      ├─ Proof: Evidence / VerificationResult
      └─ Continuity: DeviceBinding / SurfaceSnapshot
```

执行语义：

```text
CAN DO            Capability
  → MAY DO        PolicyDecision
  → DID           CapabilityResult / CapabilityExecution
  → PROOF         Evidence
  → IS TRUE       VerificationResult accepted by Field Runtime
```

不变量：外部系统、LLM、Coding Agent、Browser、MCP 和 Capability 都不能直接写 Field Reality。

## 2. 跨对象基础语义

### 2.1 Stable identity

所有持久化 Domain Object 使用 UUIDv7。以下内容永远不能成为对象 identity：

- title；
- local file path；
- Git commit；
- Agent/provider session id；
- external URL；
- Windows SID、MAC 或 computer name。

本地路径属于 `DeviceBinding`。Provider session id 属于 opaque adapter resume data。

### 2.2 Time 与 revision

- 时间：UTC Unix milliseconds；
- 可变 Aggregate 使用 `revision: u64`；
- mutation 可带 `expected_revision`；
- revision 不匹配返回 `conflict`，不得 last-write-wins 静默覆盖。

### 2.3 Principal、access 与 provenance

```rust
struct ResourceMeta {
    id: ResourceId,
    owner: PrincipalId,
    created_by: PrincipalId,
    created_at: Timestamp,
    updated_at: Timestamp,
    revision: u64,
    provenance: Provenance,
}

struct AccessEnvelope {
    visibility: Visibility,
    share_scope: ShareScope,
    permissions: PermissionEnvelope,
}
```

V0.1 Principal kind：`LOCAL_USER | AGENT | SYSTEM`。不建立账号、Remote User 或 ACL 服务。

Exchange 预留语义按适用对象分布，而不是要求每张表机械复制所有字段：

| 语义 | 主要对象 |
|---|---|
| owner | Field、Object、Capture、Library Object、长期 Work Object |
| actor | Activity、Command、CapabilityExecution |
| visibility / share_scope / permissions | Field/Object 的 AccessEnvelope；V0.1 默认为 local private |
| provenance | State、Object、Requirement、Evidence、Execution、Result |

V0.1 不实现 Exchange UI、网络同步、Shared Field 或权限继承引擎。

## 3. Reality Contracts

### 3.1 Field

Field 是持续运行单位，不是 Tab Group、folder 或 chat。

```rust
struct Field {
    meta: ResourceMeta,
    access: AccessEnvelope,
    title: String,
    goal: Option<String>,
    lifecycle: FieldLifecycle,
    current_mode: Option<FieldMode>,
    current_focus: Option<StructuredValue>,
}

enum FieldLifecycle { Active, Completed, Archived }
```

Phase 01 title 规则：trim 后 1–120 Unicode scalar values；goal 可选，最多 4000。

### 3.2 Field State

```rust
enum FieldStateKind {
    Fact,
    Decision,
    Assumption,
    Question,
    Task,
    Blocker,
    Result,
}
```

重要 State 保存 created_by、source activity/provenance 与 revision。Evidence 通过 Relation 关联，State 不内嵌一个不断增长的 evidence array。

### 3.3 Field Object

Field Object 表示“这个对象参与当前 Field”，不是所有对象的事实源。

```rust
struct FieldObject {
    id: ObjectId,
    field_id: FieldId,
    owner: PrincipalId,
    access: AccessEnvelope,
    kind: ObjectKind,
    title: Option<String>,
    external_ref: Option<ExternalObjectRef>,
    metadata: StructuredValue,
    provenance: Provenance,
}
```

Requirement、DevelopmentTask 等有独立 Aggregate；其 FieldObject 只是 Field membership/reference。

### 3.4 Relation

Relation 构建 Work Lineage，不另造知识图谱 Runtime：

```text
REQUIREMENT IMPLEMENTED_BY DEVELOPMENT_TASK
DEVELOPMENT_TASK PRODUCED CHANGE_SET
DEVELOPMENT_TASK VERIFIED_BY VERIFICATION_RESULT
STATE SUPPORTED_BY EVIDENCE
OBJECT BOUND_ON_DEVICE DEVICE_BINDING
```

Generic endpoint 在 Domain 层验证。V0.1 不强行为跨多业务表 endpoint 建 FK。

### 3.5 Activity

Activity append-only，回答“发生了什么”：

```rust
struct Activity {
    id: ActivityId,
    field_id: Option<FieldId>,
    actor: PrincipalId,
    intent: Option<String>,
    action: ActivityAction,
    target: Option<ResourceRef>,
    summary: Option<String>,
    trace_id: TraceId,
    provenance: Provenance,
    created_at: Timestamp,
}
```

Activity 不承担完整 command output、Diff 或 Evidence artifact。

## 4. Capture、Requirement 与 Project Reality

### 4.1 Capture

```text
status = INBOX | ATTACHED | PROMOTED | ARCHIVED
```

Capture 由 Summon + IDR 的 CAPTURE Intent 创建，不拥有独立一级快捷键。

### 4.2 Requirement

```rust
struct Requirement {
    meta: ResourceMeta,
    field_id: FieldId,
    title: String,
    goal: String,
    description: String,
    status: RequirementStatus,
    confirmed_by: Option<PrincipalId>,
}

enum RequirementStatus {
    Draft, Ready, InProgress, Verified, Blocked, Superseded, Cancelled
}
```

AI 草稿不能自动设置 confirmed_by。Requirement 只有在目标 VerificationResult Passed 后才能进入 Verified。

AcceptanceCriterion：

```text
UNVERIFIED | PASSED | FAILED | BLOCKED | NOT_APPLICABLE
```

Criterion Passed 必须关联 Evidence。

### 4.3 Project Reality

Project Reality 至少可靠回答：项目是什么、如何运行、主要技术栈、入口、关键模块、测试和风险，并能追溯依据。

它不是超级知识图谱，也不是一次性 Markdown。Project identity 与 DeviceBinding/local root 分离。

## 5. DevelopmentTask

DevelopmentTask 是一次明确的软件实现委托，不是 Requirement、Prompt、Agent Session、Chat 或 Git commit。

```text
Requirement / ChangeRequest / VerificationFailure
  1 → N DevelopmentTask
  1 → N CodingSession
```

### 5.1 Contract

```rust
struct DevelopmentTask {
    meta: ResourceMeta,
    field_id: FieldId,
    source: DevelopmentSource,
    title: String,
    goal: String,
    acceptance_criteria: Vec<AcceptanceCriterionRef>,
    project: ProjectTarget,
    context_refs: DevelopmentContextRefs,
    execution_policy: ExecutionPolicy,
    verification_policy: VerificationPolicy,
    execution_budget: ExecutionBudget,
    agent_preference: AgentPreference,
    lifecycle: DevelopmentLifecycle,
    implementation: ImplementationState,
    verification: DevelopmentVerificationState,
    result: Option<DevelopmentResultRef>,
}
```

Task 回答 WHY、WHAT、WHERE、CONTEXT、BOUNDARY、VERIFY；Provider prompt 由 ContextAssembler/Adapter 临时生成，不能污染 Task identity。

### 5.2 三轴状态

```text
Lifecycle:
DRAFT | READY | ACTIVE | WAITING_APPROVAL | WAITING_INPUT |
PAUSED | CLOSED | CANCELLED | SUPERSEDED

Implementation:
NOT_STARTED | IN_PROGRESS | IMPLEMENTED | FAILED | BLOCKED

Verification:
NOT_STARTED | RUNNING | PASSED | FAILED | PARTIAL | BLOCKED | INCONCLUSIVE
```

不使用模糊 `DONE`。`CLOSED + IMPLEMENTED + FAILED` 是合法组合，表示执行结束但产品未通过。

### 5.3 Project target / workspace

```rust
struct ProjectTarget {
    project_object_id: ObjectId,
    device_binding_id: DeviceBindingId,
    workspace_scope: WorkspaceScope,
    baseline: ProjectBaseline,
}

enum CodingWorkspaceMode { Direct, IsolatedWorktree }
```

WorkspaceScope 使用 project-relative paths。复杂任务或 Dirty Working Tree 默认倾向 IsolatedWorktree；选择权属于 Development Orchestrator，不属于 Coding Agent。

### 5.4 Policy 与 budget

```rust
enum ApprovalMode { Allow, Ask, Deny }
```

V0.1 默认：项目内 read/write/new file 与 build/test 可允许；项目外读写、credential 和 privilege deny；dependency install、destructive delete、git commit/push、network 按 task policy ask；force push deny。

ExecutionBudget 可限制 duration、turns、failed commands、failed verification cycles、cost；changed file count 是 soft review threshold。

## 6. CodingAgentProvider

CodingAgentProvider 表示可自主完成 codebase task 的 Coding Agent harness，不是 Model Provider。

```rust
trait CodingAgentProvider {
    async fn describe(&self) -> ProviderDescriptor;
    async fn start_session(&self, req: StartCodingSessionRequest) -> Result<SessionHandle>;
    async fn resume_session(&self, req: ResumeCodingSessionRequest) -> Result<SessionHandle>;
    async fn send(&self, input: CodingAgentInput) -> Result<()>;
    async fn resolve_approval(&self, resolution: ApprovalResolution) -> Result<()>;
    async fn cancel(&self, session_id: CodingSessionId) -> Result<()>;
    async fn stream_events(&self, session_id: CodingSessionId) -> EventStream<CodingAgentEvent>;
    async fn inspect_session(&self, session_id: CodingSessionId) -> Result<CodingSessionSnapshot>;
}
```

具体 async trait 实现不在 Contract Freeze 中绑定。

ProviderKind 表示 OpenCode、ACP、Codex、FieloraNative、Custom；Claude/Gemini/GPT 是模型，不是 CodingAgentProviderKind。

Provider 必须声明 capabilities，例如 resume、approval events、diff events、structured changes、test events、model selection。能力不足时显式 degraded/limited，不能假装等价。

### 6.1 Session separation

同一 DevelopmentTask 可以有多个 CodingSession，例如 retry 或 provider takeover。切换 Provider 不改变 Task identity。

Provider session ref / resume data 是 opaque adapter data，不进入 Field Domain identity。

### 6.2 Agent event

统一事件覆盖 status、plan、file read/change、command/test start/finish、approval request、agent message、context warning、completed、failed。

Contract 不要求 Chain of Thought；只要求 Plan、Action、Tool、Change、Result、Status。

`CodingAgentEvent::Completed` 只能将 Implementation 变为 Implemented candidate，不能设置 Verification Passed。

### 6.3 Integration spikes

OpenCode Deep Adapter 在正式采用前必须做 bounded spike，验证 session、stream、permission、diff、cancel、resume、approval。若失败，不得为迁就预设而破坏 Contract。

ACP 用于第二 Provider abstraction spike，不作为 Coding Core。以上均不阻塞 Phase 01。

## 7. Capability Contracts

Capability 是 Fielora 对一个可执行数字能力的统一描述，而不是外部 Tool 的原始名字。

```rust
struct CapabilityDescriptor {
    id: CapabilityId,
    name: CapabilityName,       // namespace.action
    display_name: String,
    description: String,
    source: CapabilitySource,
    version: CapabilityVersion,
    input_schema: SchemaRef,
    output_schema: SchemaRef,
    risk_classes: Vec<RiskClass>,
    default_approval: ApprovalMode,
    availability: CapabilityAvailability,
    health: CapabilityHealth,
    metadata: StructuredValue,
    provenance: Provenance,
}
```

RiskClass：Read、LocalWrite、ExternalSend、Destructive、Credential、Payment、Privilege、LegalCommitment、PublicPublish。

Execution metadata 必须表达 reversibility 与 idempotency；外部 source metadata 不能赋予权限。

## 8. Invocation、Policy、Result 与 Execution

语义上保持：

```text
CapabilityInvocation
→ PolicyDecision
→ CapabilityResult
```

V0.1 Persistence 将三阶段收敛为一条 `CapabilityExecution`，避免每次普通 read 产生多表噪声。Rust Domain/DTO 仍保持阶段边界。

### 8.1 Policy

```text
Verdict = ALLOW | ALLOW_WITH_CONSTRAINTS | ASK | DENY
```

Policy 输入至少包含 actor、Capability/version、input、scope、Field/Task、risk 与 authorization。System hard deny 不能被 lower-level policy 或 Human approval 覆盖。

普通低风险 read/allow 可以只在 Execution 中记录摘要。ASK、DENY、constraint、高风险和 Human approval 必须保留详细 Audit Activity/Evidence。

LLM、网页文字、MCP metadata 和第三方文档都不能扩大权限。

### 8.2 Result

```text
SUCCEEDED | FAILED | PARTIAL | CANCELLED | TIMED_OUT | UNKNOWN_OUTCOME
```

Capability execution succeeded 只表示动作执行，不表示业务目标成功。

非幂等 `UNKNOWN_OUTCOME` 禁止盲目 retry，必须先 query/reconcile。

## 9. Evidence

Evidence 是支持事实、结果或判断的可追溯材料，不是普通附件。

```rust
struct Evidence {
    meta: ResourceMeta,
    field_id: Option<FieldId>,
    kind: EvidenceKind,
    source_kind: EvidenceSourceKind,
    artifact_ref: Option<ResourceRef>,
    structured_data: Option<StructuredValue>,
    trust: EvidenceTrust,
    content_hash: Option<String>,
    captured_by: PrincipalId,
    captured_at: Timestamp,
}
```

Trust：DIRECT_OBSERVATION、AUTHORITATIVE_EXTERNAL、USER_CONFIRMED、TOOL_REPORTED、AGENT_REPORTED、DERIVED、UNKNOWN。

Agent claim 可作为 Evidence，但不能自动升级为 direct observation。关键 Evidence 保存 immutable artifact/hash，而非只存可能变化的 URL。

## 10. VerificationResult

Verification 回答某个 Requirement、criterion、DevelopmentTask、Capability outcome 或 Field Result 是否成立。

```text
Verdict = PASSED | FAILED | PARTIAL | BLOCKED | INCONCLUSIVE
Authority = FIELORA | HUMAN | FIELORA_AND_HUMAN
```

Passed 硬规则：至少有一项 Evidence，且所有 required checks 满足 completion rule。主观体验可以保持 Human Review Pending，不能用自动 PASS 代替。

VerificationResult 由 Verification Runtime 产生，Field Runtime 接纳后才允许 Requirement/State 进入 Verified/Result。

## 11. DeviceBinding 与 SurfaceSnapshot

```rust
struct DeviceBinding {
    id: DeviceBindingId,
    device_id: DeviceId,
    object_id: ObjectId,
    kind: BindingKind,
    local_locator: String,
    metadata: StructuredValue,
}
```

local locator 不是 Object identity。

SurfaceSnapshot 是 per-device UI continuity，不是 Field truth：

```rust
struct SurfaceSnapshot {
    id: SurfaceSnapshotId,
    field_id: FieldId,
    device_id: DeviceId,
    observed_field_revision: u64,
    layout: SurfaceLayout,
    open_objects: Vec<ObjectId>,
    created_at: Timestamp,
}
```

Authoritative focus/mode 从 Field 读取；Snapshot 不能用陈旧副本覆盖 Field。

## 12. Deferred semantic contracts

### 12.1 Capability Acquisition

长期语义：Need → trusted candidate → plan → policy → setup → smoke test → register。发现或安装不等于可用，Smoke Test PASS 后才能注册。

当前 V0.1 P0 只要求最小真实 Generic MCP Connector，不实现 Acquisition Runtime、candidate registry、license engine 或自动安装未知软件。

### 12.2 Mandate

长期语义：Goal + Scope + Authority + Budget + Human Checkpoints + Completion/Verification。Mandate 不能突破 System Policy、不能向 LLM 暴露 credential、长期等待不能依赖 Agent Session。

Deploy Website Mandate Prototype 不在当前 Baseline P0。Contract Draft 保留为 Deferred Design，不创建 V0.1 table、command、UI 或 phase gate，除非用户另行裁决。

## 13. Core invariants

以下进入对应 Phase 自动测试：

1. 只有 Rust Field Runtime 可以改变持久化 Reality；
2. LLM/Agent/MCP/Browser 不能直接写 Domain Truth；
3. Requirement Verified 必须有 VerificationResult Passed；
4. AcceptanceCriterion Passed 必须关联 Evidence；
5. Coding Agent Completed 不等于 Development Verification Passed；
6. CapabilityExecution Succeeded 不等于业务目标成功；
7. 非幂等 UnknownOutcome 禁止盲目 retry；
8. Project/Object identity 与 Device local path 分离；
9. 高风险 Capability 不能绕过 Policy；
10. Agent Session 不能破坏用户已有/未提交代码；
11. Provider switch 不改变 DevelopmentTask identity；
12. Verification Passed 不允许空 Evidence；
13. SurfaceSnapshot 不得覆盖更新的 Field Reality；
14. External metadata 不得扩大 permission scope；
15. post-commit 前不得发布 Reality changed event。

## 14. Persistence schema freeze

完整 V0.1 schema 上限：

```text
principals
fields
field_state_entries
field_objects
field_relations
activities
evidence
captures
library_objects
requirements
acceptance_criteria
project_realities
development_tasks
coding_sessions
change_sets
capabilities
capability_executions
verification_results
verification_checks
devices
device_bindings
surface_snapshots
schema_migrations
```

这是上限，不是 Phase 01 一次建表清单。

禁止提前创建：users/accounts/organizations、remote_users/contacts/messages/field_invites、ACL/roles、marketplace/reviews/reputation、license registry、workflow definitions、agent memories、sync/conflicts、cloud objects、multi-agent tasks、capability acquisitions、mandates。

相对于 Contract Draft 的裁决：`capability_acquisitions` 与 `mandates` 不进入当前 V0.1 P0 physical schema；这是遵守 Baseline Freeze，而非删除长期语义。

### Phase migration map

| Phase | 新增物理表 |
|---|---|
| 01 | principals, fields, field_state_entries, field_objects, field_relations, activities, devices, device_bindings, surface_snapshots, schema_migrations |
| 02 | 无新增最终业务表；通过 Frozen Migration 0002 收紧 Phase 01 的 State/Object/Relation 结构与 indexes |
| 04 | captures |
| 05 | requirements, acceptance_criteria, project_realities, evidence |
| 06 | development_tasks, coding_sessions, change_sets |
| 08 | capabilities, capability_executions, verification_results, verification_checks |
| 10 | library_objects（若前期未引入） |

## 15. FIPC domain surface

跨进程 API 分类为 `command.*`、`query.*`、`event.*`、`system.*`。UI 不获得 SQL 或 arbitrary method pass-through。

Phase 01 产品实现只 export Field/Surface/System DTO。Phase 02 已按 Frozen Delta 实现并验收 State/REFERENCE/bounded Relation/Activity/SurfaceLayoutV1/Resume 的 additive FIPC DTO 与 methods。后续每个 Phase 才增加 Capture、Requirement、Development、Capability、Verification 等 DTO；Phase 03 未授权，不得提前增加。

FIPC DTO、Domain Command、Aggregate、Repository Row 必须是不同类型，避免 IPC version 与 DB schema 深耦合。

## 16. Freeze 结论

以下 Contract 已经冻结：

- Reality/Work/Execution/Proof/Continuity 五层；
- DevelopmentTask 与 CodingSession 分离；
- CodingAgentProvider 与 Model Provider 分离；
- Invocation/Policy/Result 语义分离、Persistence 收敛；
- Evidence 与 Verification 分离；
- Stable identity 与 DeviceBinding 分离；
- Field Reality 与 SurfaceSnapshot 分离；
- Exchange 只做 access/provenance 语义预留；
- 不做万能 Resource、Full Event Sourcing 或 Workflow Engine；
- Acquisition/Mandate 保留 Deferred semantic contract，不进入当前 V0.1 P0 physical implementation。
- Phase 02 只冻结 Field Reality/State/REFERENCE/bounded lineage/constrained Surface/richer Resume 增量，不引入新的一级 Contract 概念；精确 wire surface 以 `PHASE_02_CONTRACT_DELTA_V0.1.md` 为准。

确认本文件后，Core Contract 不再继续增加一级概念；新抽象必须由真实 Phase 实现证明现有模型无法表达必要能力。
