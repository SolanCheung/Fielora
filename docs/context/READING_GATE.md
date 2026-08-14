# Codex Reading Gate

首次进入仓库时必须完成。

## Required Reading

- [ ] README.md
- [ ] AGENTS.md
- [ ] docs/context/00_CONVERSATION_INDEX.md
- [ ] docs/context/01_CONVERSATION_TIMELINE.md
- [ ] docs/context/02_PROJECT_REALITY.md
- [ ] docs/context/03_DECISIONS.md
- [ ] docs/context/04_REJECTED_DEFERRED.md
- [ ] docs/context/05_SOURCE_ARCHIVE.md
- [ ] docs/context/sources/Fielora_功能讨论_原始片段.txt
- [ ] docs/product/COMPETITIVE_BOUNDARIES.md
- [ ] docs/product/FIELORA_V0.1_INTERACTION_SPEC_CN.md
- [ ] docs/architecture/TECHNICAL_BASELINE_V0.1.md
- [ ] docs/architecture/TECHNICAL_ARCHITECTURE_V0.1.md
- [ ] docs/architecture/CORE_CONTRACTS_V0.1.md
- [ ] docs/architecture/SCHEMA_FREEZE_V0.1.md
- [ ] docs/architecture/PHASE_01_IMPLEMENTATION_SPEC_V0.1.md
- [ ] docs/architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md
- [ ] docs/architecture/PHASE_02_CONTRACT_DELTA_V0.1.md
- [ ] docs/architecture/PHASE_02_MIGRATION_0002_V0.1.md
- [ ] artifacts/phase02/PHASE_02_FREEZE_CANDIDATE_VALIDATION_REPORT.md
- [ ] artifacts/phase02/PHASE_02_IMPLEMENTATION_REPORT.md
- [ ] artifacts/phase02/TEST_REPORT.md
- [ ] artifacts/phase02/HUMAN_ACCEPTANCE_CHECKLIST.md
- [ ] artifacts/phase02/KNOWN_ISSUES.md
- [ ] artifacts/phase02/BUILD_INFO.json
- [ ] docs/architecture/TEST_AND_DELIVERY_BASELINE_V0.1.md
- [ ] context_manifest.json

## Output

生成：`docs/context/CODEX_READING_REPORT.md`

## Forbidden Before Approval

- 不修改产品代码
- 不安装依赖
- 不创建新应用骨架
- 不 Fork Chromium
- 不改写已经冻结的 DB / IPC / Core Contract / Phase 01 Schema；不自行决定 Editor 等仍开放事项
- 不增加“AI Browser 标配”功能
- 不宣布开始实现

## Understanding Checks

Codex 必须能准确解释：

- Field 为什么不是 Workspace；
- State 为什么不是 Chat Memory；
- 为什么无永久 Sidebar；
- DXE 为什么不能任意生成 UI；
- IDR 为什么应该轻量；
- 为什么 Coding 比 Blender 更深；
- 为什么 Build 与 Verify 分离；
- 为什么 Electron 暂时只是验证宿主；
- 为什么 Local LLM 延后；
- 为什么长期方向是 Personal Steward，但 V0.1 不是“AI 管家”。
- 为什么 Frozen Phase 02 只包含 Field Reality/State/REFERENCE/bounded lineage/constrained Surface/Resume；
- 为什么 `PHASE_02: APPROVED_FOR_FREEZE` 仍不构成 Phase 02 Implementation Authorization；
- bounded migration probe 证明了什么，以及它为什么仍不等于产品 Migration 实现或 schema version 推进。
- Phase 02 Implementation Authorization 如何取代旧的未授权状态，但不改变任何 Frozen semantics；
- 为什么 Engineering Gate 与 Desktop Reality Gate PASS 仍不等于 Human Experience Gate 或 Phase 02 Final Acceptance；
- 当前 Phase 02 artifact、实现 commit、Migration 0002 canonical hash、已验证范围与 Known Issues 分别是什么。
