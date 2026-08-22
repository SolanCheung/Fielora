# Fielora Programming + China Models Change Impact V0.1

Status: IMPLEMENTATION AUTHORIZED BY USER / 2026-08-18

## User flow

`Project + Conversation -> inspect code -> focused edit -> run test -> inspect diff -> stage -> commit -> optional push`。Qwen、DeepSeek、Kimi、GLM、MiniMax、Doubao 以及未来 Provider 必须复用相同的 Agent、Tool Receipt、Approval 与 Verification 语义。

## Change and boundary

- 增加 provider-neutral coding behavior profile：只根据 endpoint/model metadata 选择提示与工具暴露策略，不授予 Capability、Permission、Mandate 或 Semantic Authority。
- 增加窄化 Git 工具：stage、unstage、create/switch branch、commit、push。参数结构化传递；不支持 force、amend、reset、clean、rebase、checkout、tag 或任意 Git config 覆盖。
- Git 写操作的批准路由由 2026-08-21 权限 preset 决定：请求批准/帮我批准为 `ASK`，`FULL_CONTROL` 可自动执行；push 仍属于 Network effect。force、amend、reset、clean、rebase 与交互式 credential prompt 继续禁止。详见 `AGENT_PERMISSION_PRESETS_CHANGE_IMPACT_2026-08-21.md`。
- 不改变 Provider credential、数据库 Schema/Migration、Project/Conversation identity 或 Phase 04 frozen provider contracts。

## Failure and rollback

- 无效 path/ref/message/remote fail closed；敏感路径不能 stage；命令失败只形成失败 Receipt，不能写成成功。
- Workspace 文件写入后仍必须通过真实 verification receipt 才能完成；commit/push 不能替代测试。
- 回滚可删除新增 behavior profile 与 typed Git tools；没有数据迁移或不可逆持久化变化。

## Verification

- Rust unit/integration：六家识别、unknown fallback、权限正交、typed Git 成功/拒绝、无 force、无 prompt、verification invariant。
- Desktop/Core regression：Agent approval、tool receipt、test/diff/conversation loop；随后再用独立有预算凭据做逐 Provider live eval，不以 mock 冒充真实模型 PASS。
