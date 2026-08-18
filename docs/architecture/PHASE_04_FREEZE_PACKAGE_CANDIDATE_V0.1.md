# Fielora Phase 04 Freeze Package Candidate

状态：`FROZEN / PROVIDER ACCEPTANCE DEFERRED TO PHASE EXIT / IMPLEMENTATION AUTHORIZED`

版本：V0.1 Frozen

日期：2026-08-16

```text
PHASE_04_ALPHA_REMAP_CANDIDATE: ACCEPTED
PHASE_04_CAPABILITY_DEFINITION: ACCEPTED_FOR_FREEZE_INPUT
PHASE_04_FREEZE_PACKAGE: ACCEPTED_FOR_FINAL_PROBES_AND_AMENDMENT
PROVIDER_RETENTION_SEMANTICS: AMENDED
PHASE_04_PROVIDER_GATE_AMENDMENT: ACCEPTED
REAL_PROVIDER_PRE_FREEZE_PROBE: DEFERRED_TO_IMPLEMENTATION_ACCEPTANCE
PHASE_04_FREEZE: GRANTED
PHASE_04_IMPLEMENTATION: AUTHORIZED
```

本包响应用户“正式进入 Phase 04 Freeze Package 的编写与审查，不再做战略层重排”的裁决。它把既有 Remap Candidate 与 Capability Definition Candidate 收敛为可冻结的 Product、Contract、Migration、Implementation 与 Test 五个面；不修改 Phase 01/02 Frozen Contract，不创建产品 Migration 0004，不新增依赖或产品代码。

## 1. Freeze 输入

- `PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md`：路线和 Phase 边界；本轮不重排；
- `PHASE_04_CAPABILITY_DEFINITION_CANDIDATE_V0.1.md`：13 项能力与五个纵向 Slice；
- `CORE_CONTRACTS_V0.1.md`、`SCHEMA_FREEZE_V0.1.md`、Phase 02 三份 Frozen specs：兼容性基线；
- Phase 03 closeout：真实 Browse Runtime、安全边界与 Loose Browse 不污染 Field Reality 的已验证基线；
- `DEVELOPMENT_WORKFLOW_V0.1.md`：Change Impact、compatibility 与 Hero Flow regression 纪律。

## 2. Package contents

| Freeze 面 | 文件 | 本轮状态 |
|---|---|---|
| Product | `docs/product/PHASE_04_PRODUCT_FREEZE_CANDIDATE_V0.1.md` | ACCEPTED_FOR_FINAL_PROBES |
| Contract | `docs/architecture/PHASE_04_CONTRACT_DELTA_CANDIDATE_V0.1.md` | ACCEPTED_FOR_FINAL_PROBES |
| Schema / Migration | `docs/architecture/PHASE_04_MIGRATION_0004_CANDIDATE_V0.1.md` | ACCEPTED_FOR_FINAL_PROBES |
| Implementation | `docs/architecture/PHASE_04_IMPLEMENTATION_SPEC_CANDIDATE_V0.1.md` | ACCEPTED_FOR_FINAL_PROBES |
| Test / Delivery | `docs/architecture/PHASE_04_TEST_PLAN_CANDIDATE_V0.1.md` | ACCEPTED_FOR_FINAL_PROBES |
| Cross-review | `artifacts/phase04/PHASE_04_FREEZE_PACKAGE_REVIEW_REPORT.md` | WAITING_FOR_REAL_PROVIDER_PROBE |

`PHASE_04_PROVIDER_GATE_AMENDMENT_V0.1.md` supersedes the Cross-review row above: the package is Frozen, and real Provider proof is an implementation/exit acceptance debt rather than a Freeze blocker.

## 3. Phase 04 frozen target

```text
Summon
  -> inspectable Context Package
  -> provider-neutral streamed invocation
  -> proposal/draft with no Reality authority
  -> explicit Capture
  -> Inbox or Field attachment
  -> explicit Promote to IDEA_CANDIDATE
  -> restart and Resume from Fielora-owned state
```

Phase 04 必须证明 Provider A 与 Provider B 可以通过同一 Fielora contract 服务该闭环；Provider、模型、网页和 Connector metadata 都不能 self-grant 权限或 Reality authority。

## 4. Freeze invariants

1. Reality identity 由 Fielora 持有，Provider response/session identity 只作 provenance metadata；
2. 模型输出默认是 Proposal/Draft，不是 FACT、DECISION、REQUIREMENT 或 VERIFIED；
3. Provenance 与 authority 分离；有来源不等于有权威；
4. Context Package 是本次发送快照，不是 Current Reality；
5. Freeform 输入默认只产生非持久 ASK；Capture/Promote 永不由 confidence 自动执行；
6. secret 不进入普通状态、数据库、日志、Activity、事件、响应、截图或 Evidence；
7. Browse 选择只经受控、只读、限长的 Main-owned extraction 进入 trusted UI，不给 remote page 新增 app bridge；
8. Provider failure、cancel 或 partial stream 不产生半条 Capture/Reality；
9. Provider swap 不改变 Field/Capture identity、lineage 或 Resume；
10. `Capability Boundary / Mandate / Approval Routing / Semantic Authority` 保持正交。
11. “Fielora 本地不保存”绝不等同于“Provider 不保留”；Provider/account policy 独立适用；
12. OpenAI Responses Phase 04 请求必须显式 `store:false`，不得由用户配置覆盖；这不构成 ZDR 声明。

## 5. Freeze review gate

Freeze 只有在以下条件同时满足后才可由用户裁决：

- 五份候选规范互相一致；
- Migration 0004 exact SQL、归一化 hash、2→4 upgrade 与 incompatible rollback probe 完成；
- Windows Credential Manager bounded probe 证明 store/read/delete 与 secret absence；2048 bytes 是 Fielora 产品上限，WinCred 系统上限为 2560 bytes；
- OpenAI Responses 与 Anthropic Messages reference adapter 的 deterministic fixture/local controlled server 证明 auth/stream/text/usage/cancel/terminal 可归一化；真实产品链 Provider validation 移至 Phase Exit Acceptance；
- 自定义 endpoint 的 SSRF/DNS/redirect policy 有可执行 probe；
- Contract fixtures 和 Context/Capture domain tests 可运行；
- Cross-review 无未关闭 blocker；
- 用户明确给出 `PHASE_04_FREEZE: GRANTED`。

这些 bounded probe 的非产品源码固定置于 `scripts/freeze/phase04/`；`artifacts/phase04/freeze/` 只允许保存脱敏 Evidence，或使用不进入仓库的临时目录。Evidence 不得包含 prompt body、response body、credential bytes、Authorization/header value 或 secret-bearing log。Probe 不得接入产品 runtime、写产品 DB、推进 schema version 或新增 shipping dependency。

## 6. Freeze 与 Implementation 的分离

用户随后通过 `PHASE_04_PROVIDER_GATE_AMENDMENT_V0.1.md` 独立授予了 Implementation Authorization。以下限制仍成立：

- 不得改写 Phase 01/02 Frozen semantics 或 Phase 03 Browse security boundary；
- 不得把 reference adapter wire protocol 变成 Fielora Domain Contract；
- 不得使用服务条款禁止自动化/API testing 的 credential；
- 宣布 Phase 04 started/complete。

Slice 01–05 已获实现授权；`PHASE_04: COMPLETE` 仍需 Engineering、Real Provider 与 Human Experience 三类 Gate。
