# Fielora Minimal Reading Gate

状态：`RAPID DEVELOPMENT / NO REPORT APPROVAL GATE`

## Required Reading

- [ ] `README.md`
- [ ] `AGENTS.md`
- [ ] `docs/product/RAPID_DESKTOP_EXECUTION_V0.1.md`
- [ ] `docs/context/02_PROJECT_REALITY.md` 最新两节
- [ ] `docs/context/03_DECISIONS.md` 最新决策
- [ ] `docs/architecture/TECHNICAL_BASELINE_V0.1.md`
- [ ] `artifacts/phase04/KNOWN_ISSUES.md`
- [ ] 本次修改直接相关的代码和测试

## After Reading

不再生成或等待确认 `CODEX_READING_REPORT.md`。完成最小阅读和代码检查后，直接按当前用户任务实现可运行纵向切片。

## Historical Material

旧 Conversation Timeline、Phase 01–04 Freeze/Implementation/Test/Evidence 和 Phase 04→10 Remap 继续保留，但只在以下情况按需读取：

- 修改对应历史 Contract/Schema/Migration；
- 调查旧功能回归；
- 需要追溯某项决定或安全边界；
- 准备删除或替换旧实现。

## Short Change Impact Required

只有以下变化需要先写一页以内 Change Impact：

- Schema 或 Migration；
- credential storage / secret flow；
- trusted/untrusted boundary；
- command execution / filesystem write / destructive action；
- 不可回滚的架构或数据变化。

普通可逆 UI、Project、Conversation、Provider settings 与工作流改进不再制作 Product/Contract/Migration/Implementation/Test/Cross-review 六件套。

## Current Product Order

```text
Codex-like multi-provider desktop
  → stable long tasks
  → Aegis
  → DXE
  → Personal Steward
```
