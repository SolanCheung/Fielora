# Fielora Competitive Rebase — Change Impact

日期：2026-08-17

状态：`DOCS-ONLY / PRODUCT DIFFERENTIATION GATE HARDENING`

> 历史说明：本报告随后被 `2026-08-17_RAPID_DESKTOP_REBASE_CHANGE_IMPACT.md` supersede。四项机制保留为未来假设，但不再阻断 Codex-like Desktop Foundation。

## 1. Change

依据用户对当前 ChatGPT Desktop / Codex 官方能力的复核，Fielora 的产品差异口径从一组宽泛概念收窄为四项必须实证的机制：

1. Explicit Lifecycle；
2. Operational Work State；
3. Persistent Work Lineage + Verification；
4. DXE。

`Field`、`Reality`、Resume、Memory、Coding、Browser、MCP、Agent、Permission、Multi-provider、Computer Use 与 Personal Steward 等名词或能力本身不再构成差异声明。

## 2. Official-source qualification

OpenAI 官方资料支持 ChatGPT Desktop 已覆盖 Projects/Chats、本地文件夹、Browser、长任务 Goal、文件工作、Computer Use 与 Plugins/MCP 等能力表面。竞争判断只能基于公开产品 Contract，不推测竞品内部绝对不存在统一 Reality。

Computer History 必须单独限定：截至本报告日期，官方文档标注其为 macOS Desktop 能力，并受 plan、workspace-admin 与 region availability 影响。它可证明竞争方向与产品哲学重叠，但不能写成 Windows 通用现状。

## 3. Affected

- `docs/product/COMPETITIVE_BOUNDARIES.md`：成为四项差异机制的 canonical 产品边界；
- `docs/architecture/PHASE_04_ALPHA_REMAP_CANDIDATE_V0.1.md`：未来 Phase Gate 与 Alpha Closure 加入四项机制、同构反例和最小 DXE proof；
- `docs/context/02_PROJECT_REALITY.md`、`03_DECISIONS.md`：同步正式 Reality 与决策；
- `README.md`、`AGENTS.md`、Conversation Index 与 Reading Gate：同步接手约束。

## 4. Not affected

- Phase 04 Frozen Product/Contract/Migration/Implementation/Test semantics；
- Migration 0004、schema version、FIPC、Provider wire/normalization、Credential/Security boundary；
- Phase 04 当前 Engineering、Human、real-provider 与 Clipboard revalidation 状态；
- Phase 05 implementation authorization；
- 产品代码、依赖、构建与 Portable。

## 5. Required future regressions

未来 Phase Freeze 必须给出下列反例测试，而不仅是功能存在测试：

- Field 退化成 Chat/Files/Goal 容器；
- Reality revision 改变但 Resume/Completion/Reverification 不变；
- tests PASS 但没有稳定 Requirement→Check→Evidence→Result 关系；
- Provider/chat/memory 缺失后 lineage 或 authoritative state 消失；
- 用户仍需手工选择 Mode 才能得到正确工作面；
- 把功能加入 ChatGPT Project + Codex 后体验基本同构。

## 6. Current verdict

```text
COMPETITIVE_REBASE: ACCEPTED_AS_ROUTE_CONSTRAINT
PHASE_ORDER: UNCHANGED
PHASE_04_FROZEN_CONTRACT: UNCHANGED
PHASE_04_EXIT_STATUS: UNCHANGED
PHASE_05: NOT_AUTHORIZED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
```
