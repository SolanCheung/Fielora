# Change Impact — Composer Inputs V0.1

状态：`IMPLEMENTED / TARGETED PACKAGED + FRESH VERIFIED / HUMAN ACCEPTANCE PENDING`  
日期：2026-08-17

## 用户流程

在 Project Conversation 的 Composer 中，用户可以显式选择本机附件、选择已配置 Provider/Model、选择真实生效的权限预设，并使用系统可用的语音识别把转写放入输入框后确认发送。

## 边界

- 不新增 Schema/Migration，不持久保存附件原文或绝对路径；消息只记录用户可见的附件文件名。
- 附件只由 trusted App 的系统文件选择器显式选择；最多 4 个、单文件最多 1 MiB。
- 当前 provider-neutral ModelInvocation 是纯文本协议。只有可严格解码为 UTF-8 的文本、代码、JSON、CSV、日志等进入 Context；图片、PDF、Office、压缩包和其他二进制明确显示“不支持当前模型通道”，不得伪装已发送。
- 每个附件进入模型前最多 1,500 字符；附件、当前文件和最近对话共同遵守既有 8 chips / 12,000 scalars / 48 KiB Context 上限。Core 的 credential-like 内容阻断继续生效。
- 权限仅提供现有 Runtime 能真实执行的 `只读` 与 `审阅后修改`。只读禁止把模型 replacement 转为 Review Draft；审阅后修改仍必须用户点击接受才写盘。不得展示尚未实现的 Full Access。
- 语音只做本地 Composer 转写，用户确认后发送；不自动提交。系统/Chromium 不提供 SpeechRecognition 或拒绝麦克风时显示稳定提示并继续支持文字输入。

## 验证

- Unit：文本/二进制/超限/数量边界及不暴露绝对路径。
- Desktop E2E：附件进入可见 chip、统一模型选择、权限切换真实影响、语音不可用降级、发送箭头、附件名称进入消息且内容进入 bounded Context。
- Packaging：Windows x64 packaged Desktop Foundation 与 single-instance smoke。

验证结果：42 项 TypeScript、30 项 Rust、6 项 Core integration，以及 Desktop Foundation dev/release packaged/fresh ZIP 与 packaged/fresh single-instance 均 PASS。完整 PreMerge 与三宿主 Browse 回归均停在仓库既有 Windows 原生 Ctrl+C/Ctrl+V 硬断言；此前检查点通过，断言未跳过或放宽。fixture 外部 Provider 请求为 0，真实 Provider 与用户 Human Acceptance 仍未运行。
