# Fielora Phase 04 Capability Definition Candidate

状态：`ACCEPTED FOR FREEZE INPUT / PHASE 04 FREEZE GRANTED / IMPLEMENTATION EXECUTED`

> `HISTORICAL / SUPERSEDED TERMINOLOGY`：本文中的 `Bounded IDR` 是当前
> `Entry Intent Resolver` 的旧名，不是 `Individualized Disposition Runtime`；
> Phase 04 当时的实现与 Evidence 语义不变。

版本：V0.1 Candidate 1

日期：2026-08-16

```text
PHASE_04_ALPHA_REMAP_CANDIDATE: ACCEPTED
PHASE_04_CAPABILITY_DEFINITION: ACCEPTED_FOR_FREEZE_INPUT
PHASE_04_FREEZE: GRANTED
PHASE_04_IMPLEMENTATION: EXECUTED
```

本文件把已确认的战略、竞争、Reality、Aegis-derived Agency 与 Permission 讨论收敛为 Phase 04 的逐能力定义。它是后续 Product/Contract/Schema/Migration/Implementation Freeze 的输入，不修改 `CORE_CONTRACTS_V0.1.md`、`SCHEMA_FREEZE_V0.1.md` 或任何产品代码。

## 1. Phase 04 必须证明的产品结果

Phase 04 定位保持：

```text
LONG_TERM_VISION    Personal Digital Steward
ALPHA_POSITION      Work Reality Steward
PHASE_04            Field Entry & Model Foundation
```

用户结果：

> 用户可在 Now、Browse 或 Field 中低摩擦召唤真实模型，明确知道什么 Context 将被发送；模型结果不会自动冒充 Reality；用户可把有价值的输入或结果 Capture 到 Inbox，再显式 Promote 到持续工作，重启与更换 Provider 后对象身份、来源和 Resume 仍然成立。

核心闭环：

```text
Summon
  → explicit Context Package
  → provider-neutral invocation
  → streamed answer / draft
  → explicit Capture or Promote
  → Inbox / Field Reality
  → restart
  → Resume
```

Phase 04 不证明完整 Agent autonomy、Coding、Terminal、Connector 或 Verification。它只证明模型第一次以受边界约束的系统能力进入 Field，而不会夺取 Reality identity、permission 或 completion authority。

## 2. 前序讨论覆盖审计

| 讨论主题 | 当前结论 | 文档状态 |
|---|---|---|
| Codex/ChatGPT 能力重叠 | Browser、Goals、Projects、Memory、长任务、Coding、MCP 等视为基础设施，不能单独构成差异 | 已进入 `CODEX_READING_REPORT.md`、Remap Candidate、Competitive Boundaries、Reality/Decisions |
| 战略三层定义 | Personal Digital Steward 是北极星；Work Reality Steward 指导 Alpha；Life expansion deferred | 已进入 Remap Candidate、Competitive Boundaries、Reality/Decisions |
| `trustworthy state` | Reality 不声称绝对 Truth；维护系统当前承认的状态、依据、authority/confidence 与 lifecycle | 已进入 Remap Candidate、Competitive Boundaries、Reality/Decisions |
| Reality 竞争 Contract | Identity、Type、Provenance、Authority、Lifecycle、Operational Effect、Verification Relation、Provider Independence | 已进入 Remap Candidate、Reality/Decisions |
| Aegis 吸收边界 | Governed Agency 可吸收；不得成为第二套 Reality；Runtime 必须可替换 | 已进入 Remap Candidate、Reality/Decisions |
| 轻量求真规则 | 不建设独立重型 Epistemic Governance；只在持久 mutation、行动与完成处设置 Gate | 原先只有分散原则；由本文件第 5 节收敛 |
| Permission 产品模型 | 吸收 Codex 简单 UX，但 Scope、Mandate、Approval Routing、Semantic Authority 必须正交 | 原先只有旧 ApprovalMode/Policy；由本文件第 6 节首次完整定义 |
| Change Safety | 作为跨 Phase 工程纪律，不增加产品 Phase | 原先未进入开发文档；同步进入 `DEVELOPMENT_WORKFLOW_V0.1.md` |
| Phase 04 能力边界 | Provider、Summon、Context、Capture/Inbox/Promote 与 Gate | Remap 只有路线级定义；由本文件第 3–11 节细化 |

因此，前序讨论不是全部早已写入开发文档；本 Candidate 与同步的 Change Safety 章节补齐了已识别缺口。仍待用户裁决的内容必须保持 `CANDIDATE`，不能被实现 Agent 当作 Frozen 事实。

## 3. Capability Catalog

| ID | Capability | Foundation / Fielora Semantic | Phase 04 责任 |
|---|---|---|---|
| P04-C01 | Provider Registry & Configuration | Foundation | 管理 provider/model capability metadata 与可用状态，不持有 Reality identity |
| P04-C02 | Credential Boundary | Foundation + Security | 通过 OS-backed secret boundary 使用 credential；Renderer/LLM/普通 DB/log 不可读取 secret |
| P04-C03 | Model Invocation Contract | Foundation | 统一 request、stream、cancel、usage、error、capability negotiation |
| P04-C04 | Summon | Fielora Semantic | AI 作为随叫随走的系统能力出现，不形成永久 Sidebar |
| P04-C05 | Explicit Context Package / Chips | Fielora Semantic | 用户可查看、删除、补充本次发送上下文；Context 不等于 Reality |
| P04-C06 | Bounded IDR | Foundation + UX | 只识别 ASK/CAPTURE/PROMOTE/CONTINUE 等冻结 intent；低 confidence 回退给用户 |
| P04-C07 | Proposal / Draft Boundary | Fielora Semantic | 模型输出默认只是 Proposal、draft 或 Activity，不能自封 FACT/DECISION/VERIFIED |
| P04-C08 | Capture | Fielora Semantic | 从 Now/Browse/Field 保存带来源、actor、时间和 content kind 的临时对象 |
| P04-C09 | Inbox | Fielora Semantic | 作为未归属 Capture 的过渡查询面，不成为长期知识库或 Dashboard |
| P04-C10 | Promote / Reality Admission | Fielora Semantic | 只有显式用户意图可把临时对象晋升/关联到持续工作，并保留 lineage |
| P04-C11 | Provider Swap & Failure Recovery | Foundation + Fielora Semantic | 更换 Provider 不改变 Field/Capture identity；失败不产生半条 Reality |
| P04-C12 | Permission Foundation | Cross-phase invariant | 冻结权限分层与不可绕过规则；Phase 04 只实现模型调用所需最小边界 |
| P04-C13 | Resume after Entry | Fielora Semantic | 重启后从持久 Capture/relation/Activity 恢复，不依赖 provider chat memory |

## 4. Provider、Credential 与 Invocation

### 4.1 Provider Registry

逻辑 `ProviderConfig` 至少需要：

```text
provider_config_id       Fielora-owned local identity
provider_kind            OpenAI / Anthropic / Google / compatible / ...
display_name
endpoint_class           official / custom-compatible
endpoint_metadata        non-secret, validated
credential_ref           opaque reference only
enabled
default_model
capability_snapshot      streaming / usage / tool-call-shape / cancel / ...
created_at / updated_at
```

Provider config identity 只用于本地配置，不进入 Field/Capture/Requirement identity。Provider session、response id 与 opaque resume data 只能作为 adapter metadata。

### 4.2 Credential Boundary

必须冻结以下不变量：

1. secret 不进入普通 SQLite row、Renderer state、FIPC payload、Activity、日志、截图、测试 fixture 或 Evidence artifact；
2. UI 只能创建、替换、删除、探测 credential，不提供“显示完整 secret”；
3. Model/Agent 不能读取 credential，只能请求 Provider Adapter 代表它完成调用；
4. 数据库或配置只保存 opaque `credential_ref` 与非敏感 metadata；
5. redaction 对 request error、HTTP headers、stack、provider SDK error 与 crash report 同时生效；
6. 删除 Provider 必须明确 credential 是否一并删除，不能留下不可见 orphan secret；
7. Windows 具体采用 Credential Manager、DPAPI-backed vault 或其他方案，必须在 Phase 04 Freeze 通过 bounded probe 后裁决。

### 4.3 Model Invocation Contract

最小逻辑 Contract：

```text
ModelInvocationRequest
├─ invocation_id                 ephemeral Fielora trace identity
├─ provider_config_id
├─ model_id
├─ context_package
├─ user_input
├─ response_constraints
└─ cancellation_token

ModelInvocationEvent
├─ started
├─ content_delta
├─ usage_update
├─ provider_notice
├─ completed
├─ cancelled
└─ failed
```

统一错误分类至少包含：

```text
INVALID_CREDENTIAL
PERMISSION_DENIED
NETWORK_UNAVAILABLE
ENDPOINT_REJECTED
RATE_LIMITED
QUOTA_EXHAUSTED
MODEL_UNAVAILABLE
UNSUPPORTED_CAPABILITY
MALFORMED_RESPONSE
TIMED_OUT
CANCELLED
PARTIAL_STREAM
UNKNOWN_PROVIDER_ERROR
```

Provider 原始错误必须保留在受控诊断中并脱敏；产品 UI 只显示稳定错误语义。Partial stream 不自动保存为完整回答，不自动进入 Reality。

Phase 04 可以协商 `tool_calling` capability，但不执行模型提出的外部 Tool/Capability call。Tool request 在本阶段只能成为可见 Proposal 或返回 `UNSUPPORTED_CAPABILITY`；不得借 Provider SDK 绕过后续 Agency/Capability Policy。

## 5. Context、Proposal 与轻量 Reality Admission

### 5.1 Explicit Context Package

`ContextPackage` 是一次 invocation 的不可变发送快照，不是 Current Reality。Context Chip 至少表达：

```text
kind              current-field / selection / page / capture / user-note
display_label
source_ref
source_revision   where available
content_preview
included          user-visible
sensitivity       normal / sensitive / blocked
```

规则：

- 默认最小化，不静默发送全部 Tabs、History、Fields、Library、文件树或 Computer History；
- 用户能在发送前查看、删除和补充 Chips；
- Remote Page 不能直接调用 Model Provider 或 Core，必须经 trusted App 提取受控 selection/page metadata；
- Context 被发送不产生 Reality mutation；
- Provider 收到的内容与实际可见 Chips 必须能通过 test trace 对齐；
- credential、受保护 Field data 与明确 blocked content 不得进入 package。

### 5.2 Proposal Boundary

Phase 04 保留轻量规则，不建立独立 Epistemic Governance 子系统：

```text
Model claim            ≠ FACT
User factual statement ≠ automatically verified FACT
Tool/Provider success  ≠ Verified Result
Conversation text      ≠ Current Reality
Reality conflict       ≠ silent overwrite
```

模型推理质量、是否反驳用户、一般总结与规划主要交给模型；只有内容准备产生持久影响时才经过 Reality Admission。Phase 04 可写入的正式语义限于 Capture、Inbox lifecycle、明确 Field/Idea relation 和带 actor/source 的 Activity/draft；Requirement、Work Decision、Project Reality 与 Verified Result 的完整 admission 留在后续 Phase。

### 5.3 Reality Admission

```text
Conversation / Model output
        ↓ explicit user intent
Capture or Draft
        ↓ explicit target + mutation preview
Attach / Promote
        ↓
Field relation + Activity + Resume effect
```

- 模型不能自行 Promote；
- Capture 默认 `INBOX`；
- Attach 只增加归属关系，不暗含内容类型升级；
- Promote 必须记录 from-kind、to-kind、actor、source 与 target；
- Phase 04 的 Promote target 只限现有 Field 或 Idea candidate；Requirement/Decision promotion 留在 Phase 05 Freeze；
- revision conflict 必须返回 conflict，不得 last-write-wins；
- Browse Ask overlay 关闭后，未显式 Capture/Promote 时 Field Reality diff 必须为零。

## 6. Permission Foundation

### 6.1 必须正交的四层

```text
Capability Boundary
技术上能接触哪些 resource/action

Mandate
本次为了什么目标、在什么范围内有权行动

Approval Routing
边界请求由 user / reviewer / hard policy 中谁裁决

Semantic Authority
结果能否改变 Current Reality、Decision 或 Verification
```

对应原则：

```text
Permission permits capability use.
Mandate authorizes a purpose.
Approval chooses who adjudicates a boundary request.
Verification changes trustworthy work state.
```

Scope、reviewer 与 semantic authority 不得压成一个 `Allow/Ask/Deny` 字段，也不得把 `Observe / Work / Ask / Auto-review / Full control` 做成单轴 Domain Contract。未来 UX 可以用 preset 把多层压缩成一行摘要，但底层保持正交。

### 6.2 不可绕过的不变量

1. Model、Provider、网页、Connector metadata 与第三方文档不能 self-grant 或扩大 permission；
2. Permission identity 与 grant 不属于 Provider session；换 Provider 后边界不变；
3. `Full execution access ≠ full semantic authority`；
4. Execution success 不能直接写 Requirement verified；
5. System hard deny 不能被低层 policy、auto-review 或普通 Human approval 覆盖；
6. deny 优先于同等或更宽泛 allow；
7. credential vault、Reality store 与 Permission store 必须位于执行 Agent 不能直接读写的 trusted boundary；
8. approval 必须绑定 exact actor、action、resource、scope、purpose 与 expiry；不能从一次允许推导无限相似操作；
9. Permission 不替代 Mandate；“可以使用邮件”不等于“现在可以发送这封邮件”；
10. reviewer timeout、execution timeout 与 explicit denial 是不同状态。

### 6.3 Phase 04 最小权限面

Phase 04 不实现统一 Permission Mode/Profile UI。只实现模型调用与 Capture 所需最小边界：

- 用户显式配置 Provider 与 credential；
- 用户显式 Summon 构成本次 external model invocation intent；
- 发送前 Context Chips 可见；
- official endpoint 只访问冻结 Provider Adapter 目标；
- custom compatible endpoint 必须经过 URL validation、SSRF/private-network policy 与明确确认；
- usage/cost metadata 可见且错误不伪装成功；
- Provider tool request 不执行；
- 模型结果无 Reality authority；
- Capture/Promote mutation 只能由 trusted App → Core typed command 执行。

### 6.4 后续 Phase 分配

| Phase | Permission 增量 |
|---|---|
| 04 | 冻结四层分离、自授权禁止、credential/Reality trusted boundary；只做 model external-send 最小边界 |
| 06 | 最小用户可见 `Observe` / `Work in this Field` access scope 与越界 human ask；Coding Agent 不直接获得广泛设备权限 |
| 07 | durable AgencyMandate、PermissionGrant、ApprovalRequest、AuthorizationDecision、scope/expiry/revoke/audit；覆盖 Files/Terminal/Network/Git |
| 08 | Verification/Reality mutation authority，明确 execution 与 semantic completion 分离 |
| 09 | Connector capability grant、external effect、communication/cost/destructive policy |

`Approve for me`/Auto-review、广泛设备 `Full control`、通用用户 policy language 与完整权限继承不属于 Alpha 必需能力。保留 Contract 演进空间，但默认延后；不得因为竞品已有而扩大 Phase 04。

参考的交互原则来自当前 Codex Permission Modes、Permission Profiles 与 Auto-review；Fielora 吸收“两层简单 UX + 底层最小权限”思路，但不复制名称，也不把 Codex 面向本地命令的 Profile 误当成覆盖所有 Fielora Capability 的统一执行引擎：

- https://learn.chatgpt.com/docs/permission-modes
- https://learn.chatgpt.com/docs/permissions
- https://learn.chatgpt.com/docs/sandboxing/auto-review

## 7. Capture、Inbox 与 Promote

### 7.1 Capture kinds

Phase 04 候选最小集合：

```text
TEXT
PAGE
SELECTION
MODEL_OUTPUT
FIELD_EXCERPT
```

Screenshot、file、media timestamp 的长期产品语义保留，但只有在 Freeze 证明不扩大 Browser/file ingestion、安全和 artifact scope 时才进入本 Phase；否则延后而不伪造。

每个 Capture 至少拥有：

```text
capture_id
owner
created_by / actor
kind
content or content_ref
source_ref
source_revision where available
context_summary
status             INBOX / ATTACHED / PROMOTED / ARCHIVED
created_at / updated_at / revision
```

### 7.2 Inbox

Inbox 是 `Capture.status = INBOX` 的产品查询与整理面，不新增第二套 truth store。默认按最近未处理排序，支持 Attach、Promote、Archive；不以多卡片 Dashboard 暴露内部状态。

### 7.3 Promote

Promote 只用于 semantic elevation：临时材料成为持续工作对象或 Idea candidate。普通移动、打标签、复制和 Attach 不得使用 Promote 名称。Promotion 必须保留 origin Capture 与新对象/关系的 lineage；不得删除原始来源来制造“干净结果”。

## 8. UX / DXE Boundary

- `Summon` 是 overlay/popover/command surface，不是永久 AI Sidebar；
- 用户完成 Ask、Capture 或取消后回到原 Now/Browse/Field focus；
- Context Chips 默认简洁，可展开检查，不显示完整内部 graph；
- Streaming 只显示回答、cancel 与必要状态，不常驻 Agent Activity 面板；
- Capture 成功提供轻量可撤回反馈，不自动把用户拉进 Inbox；
- Inbox 是过渡处理面，一次只突出当前待处理项；
- Provider 设置属于 Settings；日常工作面只显示必要的当前 model/provider 与 degraded state；
- Provider/permission 内部复杂度由 DXE 压缩，但不能隐藏实际发送的 context、外部目标或需要用户决定的风险。

## 9. Logical Persistence Boundary

本 Candidate 只冻结逻辑责任，不裁决物理 schema：

| Logical object | Phase 04 persistence intent |
|---|---|
| Capture | durable；物理 `captures` table 已在 Frozen growth map 分配给 Phase 04，columns 待 Migration Freeze |
| Inbox | Capture status/query；不单独建 truth table |
| Promotion | typed command + relation + Activity；是否需要额外 event payload 在 Contract Delta 决定 |
| ProviderConfig | durable non-secret metadata；现有 Frozen growth map 未分配物理表，Freeze 必须裁决 DB table、bounded config store 或其他方案 |
| CredentialRef | durable opaque reference；secret 位于 OS-backed vault |
| ContextPackage | invocation snapshot；默认 ephemeral，只有 Capture/Activity 保存必要 provenance summary |
| ModelInvocation | stream 时 ephemeral；Field invocation 的 outcome/usage/error 保存为脱敏 Activity summary，不默认保存完整 prompt/response 副本 |
| Model response | overlay 中 ephemeral；只有显式 Continue/Capture/Promote 才成为 draft/Activity/Capture |

任何新增物理表、Migration 0004、FIPC command/event、Activity payload 或 Relation kind 都必须在 Phase 04 Freeze Candidate 中精确列出；本文件不构成 Schema authorization。

## 10. Vertical Slices and Gates

### Slice 01 — Provider & Credential Probe

- 一个 deterministic provider + 至少两个真实 provider family Adapter 候选；
- 创建/替换/删除 credential；
- secret absence scan 覆盖 DB、logs、Activity、screenshots、test artifacts；
- invalid credential、rate limit、timeout 与 partial stream 稳定失败。

### Slice 02 — Summon in Field

- Field 中 Summon；
- explicit Context Chips；
- real streaming/cancel/error；
- response 默认只为 non-authoritative draft/Activity；
- tool request 不执行。

### Slice 03 — Browse Ask without Pollution

- 真实网页 selection/page metadata 经 trusted extraction 进入 Context Package；
- Remote Page 无 Provider credential/Core bridge；
- overlay 关闭后完整 Field Reality snapshot 无变化。

### Slice 04 — Capture to Inbox

- Now text、Browse page/selection、Field excerpt 与 model output 可显式 Capture；
- source/actor/time/kind/revision 持久化；
- restart 后 Inbox 可恢复；
- Capture 后返回原工作面。

### Slice 05 — Promote and Provider Swap

- Capture Attach/Promote 到现有 Field 或 Idea candidate；
- source lineage 与 Activity 保留；
- Provider A 创建 Context/answer，Provider B 在同一 Field 消费已进入 Reality 的 Capture；
- 删除/禁用 Provider A chat/session memory 后对象 identity 与 Resume 不变。

### Phase Exit Evidence

必须同时包含：

1. Contract tests：两个真实 Adapter 满足同一 invocation/error/cancel contract；
2. Security tests：credential/context minimization/endpoint policy/remote isolation；
3. Invariant tests：model cannot self-grant、tool request cannot execute、AI output cannot become authoritative Reality；
4. Persistence/migration tests：old Phase 03 DB → Phase 04 migration → restart/semantic probe；
5. E2E：Acceptance A/B/C，dev + packaged + portable；
6. Negative evidence：Browse Ask no mutation、cancel/partial/error no half Reality、Provider swap no identity drift；
7. Human Experience：Summon 随叫随走、Context 可理解、Capture 足够快、Inbox 不笨重、无永久 Sidebar；
8. Phase report：Foundation、Fielora semantics、Differentiation hypothesis、failure evidence、commodity/deferred。

## 11. Explicitly Excluded

Phase 04 明确不做：

```text
Local LLM runtime
general Agent autonomy
Coding Agent / Editor / LSP
Terminal / PTY / Git execution
MCP / Connector execution
Auto-review reviewer
Full-device access mode
general Permission Profile editor
scheduled work / Continuous Life / Wake
Personal Model / Agent society / automatic skill evolution
Calendar / Email / Weather / Shopping
full Memory system
automatic web summarization
Requirement / Work Decision / Project Reality full admission
Verification Graph / Verified Result
arbitrary model-generated UI
```

## 12. Required Decisions Before Phase 04 Freeze

以下仍未冻结：

1. `PHASE_04_ALPHA_REMAP_CANDIDATE` 是否接受；**已于 2026-08-16 裁决 ACCEPTED**；
2. Phase 04 两个真实 Provider family 的精确组合与最低模型能力；**已裁决 OpenAI Responses + Anthropic Messages；具体 model id 不冻结**；
3. ProviderConfig 的物理 persistence、credential reference 与 delete semantics；
4. Windows credential vault 技术与 bounded security probe；**Win32 Credential Manager 已接受，probe 已授权**；
5. official/custom endpoint validation、SSRF/private-network 与 redirect policy；
6. Context Chip kinds、size/token limit、sensitivity/redaction 与 source revision 表达；
7. Capture precise kinds/columns/status transition/Relation/Activity/FIPC/Migration 0004；
8. model response、prompt、usage 与 error 的 retention；**必须区分 Fielora local retention 与 Provider-side retention；OpenAI `store:false` 为默认**；
9. Phase 04 minimal external-send/cost disclosure 与 consent semantics；
10. bounded IDR intent set、confidence threshold 与 fallback；
11. Phase 03 Installer historical checkpoint debt 的处置；**已接受为历史例外，不回溯伪造 Evidence**；
12. Phase 04 verify command、packaged/portable evidence layout 与 Human checklist。

这些决定必须分别进入 Phase 04 Product Freeze、Contract Delta、Schema/Migration Freeze、Implementation Spec 与 Test Plan。用户审查并冻结后，仍需单独给出 `PHASE_04_IMPLEMENTATION: AUTHORIZED` 才能修改产品代码。

## 13. Current Verdict

```text
RECENT_DISCUSSION_COVERAGE: AUDITED
STRATEGIC_AND_REALITY_DECISIONS: DOCUMENTED
PERMISSION_MODEL: DEFINED_AS_CANDIDATE
CHANGE_SAFETY: MOVED_TO_ENGINEERING_WORKFLOW
PHASE_04_CAPABILITIES: DEFINED_AS_CANDIDATE

PHASE_04_ALPHA_REMAP_CANDIDATE: ACCEPTED
PHASE_04_CAPABILITY_DEFINITION: ACCEPTED_FOR_FREEZE_INPUT
PHASE_04_FREEZE: GRANTED
PHASE_04_IMPLEMENTATION: EXECUTED
```
