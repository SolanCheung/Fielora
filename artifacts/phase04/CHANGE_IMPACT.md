# Phase 04 Change Impact

日期：2026-08-17

状态：`REVIEWED / IMPLEMENTED / ENGINEERING GATE PASS`

## Product problem

Phase 04 解决模型回答、网页内容与工作上下文在一次性聊天后失去来源、归属和恢复能力的问题。入口同时属于 Now / Browse / Field；Field 仍是持续工作的一级运行单位。实现没有引入永久 AI Sidebar、聊天历史、自动执行或新的 Reality authority。

## Impact matrix

| 面 | 变更 | 保持不变的边界 |
|---|---|---|
| Contract | additive Provider / ModelInvocation / Context / Capture DTO、command/query/event | FIPC/1、Phase 01/02 Reality identity 与 revision semantics |
| Persistence | schema 2→4；新增 `provider_configs`、`captures`；0003 永久空号 | 无 prompt/response/credential/session table；0001/0002 不变 |
| Security | Windows Credential Manager、external-send disclosure、custom endpoint SSRF policy、credential-like outbound block | remote WebContents 无 preload/Node/app bridge；Provider 无 Reality authority |
| Concurrency | Tokio invocation workers、per-invocation cancellation、单一 bounded FIPC writer | parent EOF bounded shutdown、Main/Core supervision |
| Browse | active main-frame page/selection read-only candidate、Quick Capture | 无 DOM 注入、网页自动操作或 privileged bridge |
| Reality | Capture → Inbox → Attach / explicit `IDEA_CANDIDATE` Promote | 模型输出默认无 authority；不创建 Requirement/Decision/Verified Result |
| Delivery | dev、packaged、fresh-directory portable 三宿主 Phase 02–04 回归 | 不新增 Installer checkpoint |

## Frozen invariants rechecked

- Reality identity、Capture identity、provenance、Field revision 与 Resume 由 Fielora 持有。
- Provider-specific wire protocol 只存在于 adapter；上层只消费稳定 `ModelInvocation`。
- Context Package 是 ephemeral send input，不等于 Current Reality，也不持久化。
- Permission、Mandate、Approval Routing、Semantic Authority 保持正交。
- OpenAI request 强制 `store:false`，但 UI 不承诺 Provider ZDR；Anthropic 不伪造 retention flag。
- Tool request 只生成可见 `TOOL_PROPOSAL`，没有执行路径。

## Negative scope evidence

未新增 Chat History、Conversations/previous-response continuity、local LLM、MCP/Connector execution、Computer Use、Requirement/Verification graph、永久 Agent 面板、History/Bookmarks/Profile/Sync 或 Chromium fork。

