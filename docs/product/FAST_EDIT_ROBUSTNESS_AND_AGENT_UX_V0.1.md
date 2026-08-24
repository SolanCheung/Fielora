# FAST_EDIT Robustness and Agent UX V0.1

日期：2026-08-21
状态：IMPLEMENTED / QWEN LIVE ROBUSTNESS PASS

架构归属：`FAST_EDIT_ADAPTIVE_V1` 是 `CODING_V0.1` Harness Profile 的
Orchestration / Verification strategy，复用同一 AgentRun、Governance、
ToolExecutor、durable events 与 receipts；它不是独立 Agent 或 Model 架构。

## 用户流程

用户用自然语言提出一个小范围代码修改。Fielora 必须在不扩大范围的前提下定位、修改、验证；上下文不足时自动补一次证据，修改集不合格时自动纠正一次。目标本来已经满足时，以“无需修改”正常完成。

## Runtime

```text
Task Classifier
  → Repository Context + Context Confidence
  → LOW: NEED_MORE_EVIDENCE → one batched search → parallel bounded reads
  → READY_TO_EDIT: apply_patches | no_change_needed
  → typed ChangeSet validation
  → at most one evidence-backed ChangeSet retry
  → at most one affected-file patch-conflict retry
  → targeted verification + diff invariant
  → result
```

正常路径使用 2–3 次模型调用；恢复路径最多 4 次。Search/Read 的目标是一次获取必要证据，不以零调用为指标。模型不能通过工具参数扩大权限或修改范围。

## ChangeSet validation

稳定类型包括：`MISSING_CONTEXT`、`SCHEMA_ERROR`、`UNKNOWN_FILE`、`STALE_SHA`、`AMBIGUOUS_EDIT`、`NO_OPERATION`、`INVALID_RANGE`、`PARTIAL_CHANGESET`。

界面控件请求默认只允许证据支持的模板文件；controller、service、表格业务逻辑和同名设置不自动进入范围。删除同时包含多个相邻 label 的块会被判为 `AMBIGUOUS_EDIT`。只有用户明确要求清理对应残留配置时，才允许扩大到相关配置文件。

## Presentation

FAST_EDIT 只展示三个工作阶段：`定位 / 修改 / 验证`。最终结果独立呈现；失败流程不再显示“完成”。`SKIPPED` 与 `BLOCKED` 使用中性未执行状态，不显示为验证失败。Activity Detail 在 Conversation 中行内展开，Technical Trace 继续折叠。

## Acceptance

最终真实 Qwen `qwen3.7-plus` 隔离套件运行 10 次，覆盖 5 种真实用户措辞、8 次最小修改与 2 次 already-satisfied：

- 成功率：100%（10/10）
- P50：8,309ms
- P90：17,349ms
- P95：18,351ms
- 平均模型调用：3.0
- 最大模型调用：4
- 不安全写入：0
- 相邻控件、表格业务列、controller 与非目标文件：全部保持不变

证据：`artifacts/agent-v0.1/qwen/live/qwen-live-2026-08-21T05-32-03-629Z.json`。
