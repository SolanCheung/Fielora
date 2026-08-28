# Agent Framework Architecture Change Impact

状态：`ACCEPTED ARCHITECTURE TERMINOLOGY / DOCS-ONLY`

日期：2026-08-28

## Change

Fielora Agent 顶层继续固定为 `Agent = Model + Harness + Tools`。Harness
一级职责域由旧 `Ingress & Context / Identity & Goal / Continuity /
Orchestration / Governance / Execution / Verification & Evidence / Adaptation`
收口为：

```text
Ingress & Context
Work Scope & Goal
Continuity
Orchestration
Governance
Execution
Verification & Evidence
IDR — Individualized Disposition Runtime
```

旧 Phase 04 `Bounded IDR` 入口路由改称 `Entry Intent Resolver`。Memory
定义为 cross-cutting Domain；Agent Profile 定义为 Fielora-owned versioned
product definition。二者均不是 Agent 顶层 Part、Harness 第九域或 Runtime。

## Current user flow

本变更不改变用户流程。它为后续 Agent 能力回答统一的 ownership 问题，防止
入口路由、长期 Human Model、Workspace、Work Scope、Agent identity、Reality
identity、Permission 与 Verification 被错误合并或建立平行 Runtime。

## Impact boundary

- Product/UI behavior：无变化；
- AgentCoordinator / ContextCompiler：无变化；
- Tool catalog、Tool execution、Policy、Approval、Verification：无变化；
- Provider/Model wire、credential、安全边界：无变化；
- public Rust/TypeScript contracts：无变化；
- Schema/Migration/persistence：无变化；
- dependencies：无变化；
- historical Freeze/Candidate/Evidence：不重写当时语义。

## Risk and mitigation

主要风险是 `IDR` 同名异义：历史资料中的 intent routing 可能被误读为新的
长期 Human Model。Canonical Agent Spec 固定新定义与非权力边界，active 入口
统一使用 `Entry Intent Resolver`，决策 D-266 显式 supersede D-008 术语和
D-252 domain map。历史原文只按 historical/superseded terminology 读取。

另一个风险是把逻辑职责域物理化成空 crate/table/service。Canonical Spec 与
Technical Baseline 明确禁止在没有真实产品行为、state、authority、lifecycle
和独立 Change Impact 时创建 IDR、Memory、Agent Profile、Identity 或
Adaptation Runtime。

## Verification in the desktop product

本轮没有运行时代码，真实 Desktop 行为应保持 byte-for-byte-equivalent 的既有
语义。本次结果通过文档一致性检查、历史/active reference audit、
`git diff --check` 与仓库 docs lane 验证；不运行 Desktop E2E、packaged、portable
或完整 Rust workspace tests。

## Deferred

`IDR V2 DESIGN ONLY / NOT IMPLEMENTED`。Human Model schema、Memory index、
HumanProfileId、Agent Profile runtime、IDR retrieval/projection、UI、migration
及 learning/correction behavior 均不在本 changeset。
