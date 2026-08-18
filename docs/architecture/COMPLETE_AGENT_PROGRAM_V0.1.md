# Fielora Complete Agent Program V0.1

状态：`INTEGRATED CONTRACT / IMPLEMENTATION AUTHORIZED`

日期：2026-08-18

## 1. 用户流程

用户在一个本地 Project 的持久 Conversation 中提出编程任务，Fielora 创建可恢复的 `AgentRun`。Agent 在受控边界内理解仓库、调用模型、读取和修改文件、运行命令与测试、根据失败继续修复，并把计划、工具调用、Diff、审批、测试和最终状态持续呈现。Desktop 或 Core 重启后，同一运行可解释、可恢复，非幂等动作不会被静默重放。

真实桌面验证链：

```text
Settings 配置 Provider/Model
  → 打开 Project/Conversation
  → 启动 AgentRun
  → 查看计划、上下文和工具活动
  → 审批受控修改/命令
  → Review Diff
  → 测试失败后继续修复
  → 测试通过
  → 重启 Desktop/Core
  → 恢复同一 AgentRun 与 Conversation
```

## 2. 冲突裁决

1. 近期产品关系固定为 `Project → Conversation → AgentRun`。现有 Field ID 继续作为 Project stable identity 的兼容实现，不为 Agent Program 新建同义 Thread 或第二套 Project。
2. `Agent Execution Ledger` 只对 AgentRun 的执行事件做 append-only persistence 和 projection；它不是全产品 Event Sourcing，不替代 Conversation、Workspace、Field/Project 或 Reality 的现有存储。
3. Agent output、Tool Intent、Tool Receipt 和 Verification Candidate 不自动成为 Reality。Reality Admission 是可选出口，不阻塞核心编程循环，也不在本阶段制造新 Reality UI。
4. Aegis 名称仍延后；本 Program 直接实现其成立前必需的四个正交执行边界：Capability、Mandate、Approval、Semantic Authority。
5. `CORE_AGENT_ENGINEERING` 由 Provider/Kernel/Context/Coding/Execution/Verification/Recovery/Packaging 决定。General artifact tools 和 Subagent 分别报告真实状态；未完成不得伪装 PASS，但不把可用编程 Agent 隐藏为全失败。

## 3. 所有权

### Rust Core

- AgentRun state machine、step/budget/timeout/cancel；
- Provider-neutral model turn；
- typed tool validation、policy、dispatch 与 receipt；
- Context Snapshot、Repo Map 和 stale revalidation；
- append-only Agent Execution Ledger 与 projection/recovery；
- Verification Receipt 和 failure replay；
- FIPC request/response/event/catch-up。

### Electron Main

- trusted Desktop integration 和 Browser host；
- 人工文件选择、窗口和 UI 生命周期；
- 不再作为 autonomous Agent 的 source of truth 或命令执行内核。

### Renderer

- 启动、停止、steer、审批和恢复 AgentRun；
- 渲染 durable projection、事件、Diff、测试和状态；
- 不持有 Agent state machine，不从模型文本自行推导磁盘动作。

## 4. Stable identity 与状态

```text
AgentRunStatus = QUEUED | RUNNING | WAITING_APPROVAL | PAUSED |
                 COMPLETED | FAILED | CANCELLED

ToolCallStatus = PROPOSED | WAITING_APPROVAL | RUNNING |
                 COMPLETED | FAILED | DENIED | CANCELLED | UNKNOWN
```

- 每个 Run、Event、ToolCall、Approval、Context Snapshot、Verification Receipt 使用稳定 ID。
- Event sequence 在单 Run 内从 1 单调递增，`(run_id, sequence)` 唯一。
- terminal transition 只允许一次；重复 terminal event 被拒绝。
- Core 启动时把遗留 `RUNNING` tool 标为 `UNKNOWN`，Run 进入 `PAUSED`，不得自动重放非幂等动作。

## 5. Schema 6 增量

Migration `0006_complete_agent.sql` 只增加：

- `agent_runs`：durable projection 与执行预算；
- `agent_events`：typed/versioned append-only ledger；
- `agent_tool_calls`：参数摘要、effect、policy、唯一终态和 receipt；
- `agent_approvals`：用户裁决与防 replay nonce；
- `agent_context_snapshots`：可检查的 bounded metadata；
- `agent_verification_receipts`：检查、exit/outcome 和 artifact refs。

Secret、Authorization header、完整环境变量、credential bytes、未裁剪的大输出不得进入这些表。大型输出进入本地 artifact file，只保存 hash、bytes、media type 和受控路径引用。

## 6. Tool 与执行边界

- 所有工具使用 typed JSON Schema 和稳定 tool name/version。
- 路径在 canonical Project root 下 realpath 校验；拒绝 `..`、symlink escape、device path 和 NUL。
- 命令使用 `program + argv`，不把模型文本直接拼入 PowerShell `-Command`。
- 子进程只获得 allowlisted environment；敏感值默认移除。
- Windows 使用 Job Object/process-tree cancellation；无法提供 OS enforcement 时明确标记 `CONTROLLED_WORKSPACE_EXECUTION`，不称 Sandbox。
- 文件写入先产生 bounded proposal/diff；外部 hash 变化进入 conflict。
- 网络和破坏性/Git 写操作 fail closed 或进入显式审批。

## 7. Provider contract

- OpenAI Responses、Anthropic Messages 和 OpenAI-compatible 是 adapter，不是 Agent domain。
- Provider capability profile 至少标记 streaming、native tools、parallel tools、strict schema、usage 和 cancellation。
- 流式 tool arguments 必须按 provider item/index 累积，JSON 完整且 schema-valid 后才能产生 Tool Intent。
- 不支持 native tools 的模型降级到 proposal-only；不能宣称 autonomous tool loop。
- OpenAI 保持 `store:false`；secret 只由 credential handle 在 Core 内部短暂使用。

## 8. Threat model

必须覆盖：prompt injection、路径逃逸、symlink race、命令注入、环境变量泄露、审批 replay、伪造 Tool Receipt、重复非幂等执行、event sequence corruption、跨 Project 读取、SSRF/private network、archive traversal/bomb、Provider tool schema confusion、Renderer compromise 和 Subagent permission escalation。

边界无法证明时 fail closed；错误必须可见为 `DENIED`、`BLOCKED`、`UNKNOWN` 或 `NOT_SUPPORTED`。

## 9. Test/Eval Gate

- contracts/schema/migration compatibility；
- Provider fragmented tool-call、cancel、usage、error 和 capability conformance；
- Agent state/property tests、唯一终态和 projection rebuild；
- fixture repositories 的 read/search/multi-file edit/conflict/undo；
- allow/deny/ask、process-tree cancel、timeout、workspace escape 和 redaction；
- fail→fix→replay、Core/Desktop restart 和 incomplete tool reconciliation；
- golden tasks 记录 success、incorrect diff、steps、tool calls、latency、approval burden 和 recovery；
- dev、packaged、fresh-directory Windows E2E；
- 用户中文人工验收。

真实 Provider 没有专用测试凭据和固定预算时必须报告 `NOT_RUN`，fixture 不得改写成 live PASS。

## 10. Git 与交付

- 分支：`phase/complete-agent-v0.1`；
- 每个纵向 Slice 独立本地 commit；
- 不 push、不 merge main、不 tag；
- 产物记录 bytes/SHA-256；
- 最终报告分别列出 Core Agent、Coding、General Tools、Subagent、Security、Recovery、Live Provider、Packaged 和 Human 状态。
