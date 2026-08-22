# Agent Permission Presets Change Impact — 2026-08-21

Status: USER AUTHORIZED / IMPLEMENTED / LIVE + PACKAGED VERIFIED

## User flow

用户在 Composer 选择权限后，新建 Conversation 必须继续继承该选择；三档产品语言固定为“请求批准 / 帮我批准 / 完全访问权限”。“请求批准”必须能够完成编程任务，不能再等同于只能读取。

## Compatibility and policy

- 不新增 Schema/Migration。现有 wire 值继续兼容：`READ_ONLY` 映射“请求批准”，`REVIEW_CHANGES` 映射“帮我批准”，`FULL_CONTROL` 映射“完全访问权限”。
- `READ_ONLY` 作为历史 wire 名不再是用户可见的只读模式；真正的 child subagent isolation 继续由 Core 的 observe-only tool catalog 强制，不能因 preset 改名获得写工具。
- 请求批准：Observe 自动；文件写入、命令、网络、删除与 Git 写请求批准。
- 帮我批准：普通 Project 写入与安全验证自动；危险命令、网络、删除与 Git 写请求批准。
- 完全访问权限：上述操作可自动执行，但仍受 typed tool、Project path guard、敏感路径拒绝、参数约束、verification 与 receipt 约束；不能把 full execution access 当作 Reality/Verification authority。
- 选择同时写入 Conversation override、Project default 和 global default；解析优先级保持 Conversation → Project → Global。

## Failure and rollback

- 非法命令参数、path escape、敏感文件、force push 与未验证完成仍 fail closed。
- 回滚只需恢复 PolicyEngine 映射和 Renderer 文案；没有持久数据删除或不可逆迁移。

## Verification

- Rust：三档策略、isolated child observe-only、Full Control typed execution、CRLF guarded replacement。
- Desktop：三档文案、全局/Project/Conversation 持久化、新 Conversation 继承、请求批准交互、完全访问无普通写入审批。
- 真实 Qwen：在真实失败文件的隔离副本上复现相同任务，必须完成修改、验证、diff，且不得再产生 `AGENT_FILE_CHANGED`。
