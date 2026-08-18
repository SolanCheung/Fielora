# Phase 04 Human Acceptance Checklist

日期：2026-08-17

状态：`READY FOR USER RETEST / NOT YET EXECUTED`

使用新 [Phase 04 Portable](./Fielora-V0.1-Phase04-win-x64.zip)。不要在截图、日志、对话或文件中放入 API key、真实 prompt/response 或 Authorization header。

## 1. Summon 第一印象

1. 分别从 Now、Browse、Field 按 `Ctrl+Shift+Space`。
2. 不看说明，判断第一眼是否明确“可在这里问当前工作内容”。
3. 确认输入是第一视觉焦点，没有 Ask / Inbox / Providers 三个等权 Tab，也没有永久 AI Sidebar。
4. 用 Esc、关闭按钮、点击 backdrop 关闭；确认原 surface、布局和键盘焦点恢复。

通过标准：像“当前现场的临时智能入口”，不是 AI 配置控制台。

## 2. Context 渐进披露

1. 在 Field 或网页中打开 Summon，默认只应看到“上下文 · N”或自然语言摘要。
2. 展开后检查 Field、当前关注、页面/选区、来源；移除一项并添加 USER_NOTE。
3. 正常内容不应出现常驻“普通/敏感”选择器。
4. 输入仅用于测试的敏感关键词；确认只有此时出现敏感发送提示，并可选择“移除敏感内容”或“仅本次允许发送”。

通过标准：知道会发送什么，但不必每次管理一排工程 chips；安全语义没有降低。

## 3. Provider 低频设置

1. 正常 Ask 首屏只显示轻量 Provider 状态。
2. 通过设置入口打开独立 Provider Setup；确认列表优先，新增表单按需出现。
3. 检查 protocol、名称、model、credential、custom endpoint、external-send 与 retention disclosure、probe/error state。
4. 无 Provider 时，Ask 仍可理解并引导配置，不出现损坏页面。

通过标准：正常使用几乎感受不到 Provider 基础设施复杂度；没有“零保留/ZDR”错误承诺。

## 4. Inbox 决策列表

1. 不打开 Summon，直接从主导航进入 Inbox。
2. 确认每条默认只显示类型、标题、来源、时间、短预览和状态；长网页正文不倾倒。
3. 显式“查看完整内容”，确认 immutable content 与 provenance 仍在。
4. 检查自然语言动作：“加入 Field”“作为上下文使用”“作为灵感继续”“归档”。
5. 确认界面没有 `ATTACHED`、`PROMOTED`、`IDEA_CANDIDATE`、Attach、Promote 等内部术语。

通过标准：像快速处理 Capture 的地方，不是内部对象管理器或 Dashboard。

## 5. Browse Quick Capture

1. 打开一个日常文本网页，不选文字点击“捕获”；确认提示“已捕获页面到 Inbox”。
2. 选中一小段文字再捕获；确认提示“已捕获选区到 Inbox”。
3. 两次操作后都应继续停留在相同 Browse Page，不自动跳 Inbox、不遮挡页面。
4. 在 Inbox 中确认 PAGE 与 SELECTION 可区分，来源 URL/title 正确。
5. 原生剪贴板人工补测：在网页中选中文字按 Ctrl+C，在网页输入框按 Ctrl+V，确认精确粘贴。这一项用于关闭当前自动化会话的 Clipboard `Access denied` 阻断。

通过标准：Capture 快、不打断、不强迫立即整理；真实 Chromium 剪贴板正常。

## 6. Summon 与 Capture 的关系

1. 用 Summon 处理当前页面/Field，完成一个 fixture 或安全 synthetic 回答。
2. 确认回答区可“捕获回答”，但没有堆满 Inbox/Attach/Promote 操作。
3. 确认用户能自然区分：Summon 是“现在帮我处理”，Capture 是“带进 Fielora 以后继续”。

## 7. Resize 与整体视觉

1. 在常用窗口尺寸和较窄窗口下检查 Summon、Context Inspector、Inbox、Provider Setup。
2. 确认没有粗黑 Tab、大片工程表单、Debug chips 或明显原生 playground 感。
3. 检查滚动、按钮、提示和 disclosure 不重叠。

通过标准：米白、淡紫、留白和层级与 Fielora 主界面一致，紫色只承担重点 action/focus。

## 8. Real Provider（独立 Phase Exit Gate）

只有具备符合自动化/API 测试条款的 Provider credential 时才执行。对两个 eligible provider/protocol 分别验证 complete、cancel、invalid-auth failed，且统一呈现 `STARTED / OUTPUT_TEXT_DELTA / USAGE / COMPLETED|CANCELLED|FAILED`。不要使用受限 Coding Plan 凭据冒充此 Gate。

## 记录模板

```text
HOST: portable
SUMMON_FIRST_IMPRESSION: PASS | FAIL
CONTEXT_PROGRESSIVE_DISCLOSURE: PASS | FAIL
SENSITIVE_EXCEPTION_ONLY: PASS | FAIL
PROVIDER_LOW_FREQUENCY_SETUP: PASS | FAIL
INBOX_DECISION_LIST: PASS | FAIL
PAGE_CAPTURE_STAYS_IN_BROWSE: PASS | FAIL
SELECTION_CAPTURE_STAYS_IN_BROWSE: PASS | FAIL
NATIVE_CTRL_C_CTRL_V: PASS | FAIL
SUMMON_CLOSE_RESTORES_FOCUS: PASS | FAIL
VISUAL_CONSISTENCY: PASS | FAIL
SUMMON_VS_CAPTURE_CLEAR: PASS | FAIL
NO_SECRET_OR_BODY_IN_SCREENSHOTS_LOGS: PASS | FAIL

PHASE_04_HUMAN_EXPERIENCE_GATE: PASS | FAIL
BLOCKERS:
```

人工 PASS 不会自动改变 `PHASE_04_REAL_PROVIDER_ACCEPTANCE: PENDING`，也不会授权 Phase 05。

