# 第一次交给 Codex 的 Prompt

现在先不要修改任何产品代码。

你接手的是 Fielora 项目。首先读取仓库根目录 `AGENTS.md`，并严格按照其中规定的顺序，完整阅读 `context_manifest.json` 中 `required_reading` 指定的全部资料。

要求：

1. 不允许只用关键词搜索替代完整阅读。
2. 不允许只阅读 PROJECT_REALITY 而跳过历史时间线。
3. 重点理解“方案为什么改变”，而不是只记最终结论。
4. 如果文档冲突，以最新明确用户决定和 PROJECT_REALITY 为优先，但必须把冲突列出来，不能静默修正。
5. 本轮禁止写产品代码、禁止安装依赖、禁止初始化新技术栈。

阅读后生成：

`docs/context/CODEX_READING_REPORT.md`

报告至少包含：当前正式产品定义、去同质化原则、Now/ Browse/ Field、Field、Capture/Inbox/Promote、Field State、Summon/Context Chips/Progressive Context、DXE、IDR、Development Field、Existing Project Takeover、Requirement→Code→Test→Evidence、专业软件边界、Capability Connector、Coding IDE 原则、Multi-LLM、Local LLM 边界、App Runtime、Personal Steward、V0.1 范围和不做项、Windows/Electron/TS/Rust 技术决定、测试打包人工验收要求、否决项、延期项、未确定问题和冲突。

最后单独输出“理解校验”，回答：

1. 为什么 Field 不是 Tab Group？
2. 为什么 Fielora 不能靠 AI Sidebar 作为差异化？
3. 为什么 Browse 可以像 Chrome，但 Field 不应像 Chrome？
4. 为什么专业软件不应在 Fielora 中重做？
5. 为什么 Coding 是例外，需要更深的一等工作流？
6. 为什么 Build 完成不能直接等同 Verify PASS？
7. 为什么 Local LLM 不进入 V0.1？
8. 为什么 Electron 当前只是 V0.1 验证宿主而不是永远的产品边界？

在我明确确认 `CODEX_READING_REPORT.md` 正确之前，不进入实现。
