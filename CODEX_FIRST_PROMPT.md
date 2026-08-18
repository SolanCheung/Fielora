# 第一次交给 Codex 的 Prompt

你接手的是 Fielora 项目。先读取仓库根 `AGENTS.md` 和 `context_manifest.json.required_reading` 中的最小当前资料，再检查本次任务直接相关的代码与测试。

当前产品顺序是：

```text
Codex-like multi-provider desktop
  → stable long tasks
  → Aegis
  → DXE
  → Personal Steward
```

不要生成新的阅读报告，不要先扩充未来领域定义。完成最小检查后，直接实现用户要求的可运行纵向切片，并运行相应自动测试。

只有 Schema/Migration、credential、安全边界、破坏性执行或不可回滚架构变化需要先写短 Change Impact。保留现有用户修改，不要删除历史 Phase 代码或 Evidence。
