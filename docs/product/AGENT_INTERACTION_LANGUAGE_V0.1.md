# Fielora Agent Interaction Language V0.1

Status: CURRENT PRODUCT CONTRACT
Scope: Project / Conversation / Coding Agent presentation
Non-goals: model chain-of-thought、Agent protocol、permission semantics、schema、Provider wire

## 1. 目标

Fielora 默认呈现“完成工作的人”，而不是“打印状态的运行时”。所有 Agent 状态必须先翻译为用户能理解、能判断影响、能继续操作的工作语言。

## 2. 三层结构

1. **Conversation Layer**：理解了什么、正在做什么、遇到什么、最终完成什么。默认可见。
2. **Execution Layer**：检查、修改、运行验证、版本管理组成的 Work Narrative。运行中展开，结束后折叠。
3. **Technical Trace**：原始 Tool、Event、error code。始终二次折叠，不进入默认对话。

不得展示模型私有 Chain-of-Thought。Work Narrative 只使用已持久化的 Run、Event、Tool、Receipt 事实。

## 3. 状态语法

| Runtime 状态 | Conversation Layer |
| --- | --- |
| Queued / Planning | 正在准备工作；说明将先检查什么 |
| Running / Observe | 正在检查项目；说明当前可见对象 |
| Running / Write | 正在修改项目；说明操作类型与范围 |
| Running / Process | 正在运行并验证；说明正在运行的命令或检查 |
| Waiting Approval | 为什么需要确认、将发生什么、确认范围 |
| Paused | 已完成到哪里、当前是否已有项目变化 |
| Failed | 人话原因、项目是否变化、用户下一步 |
| Cancelled | 已停止、停止前是否有变化 |
| Completed | 工作结果、修改文件数、验证结果、可操作入口 |

状态不能仅依赖红/绿/黄卡片表达；颜色只作辅助。错误码、事件数和 request metadata 只在 Technical Trace 出现。

## 4. Work Narrative

Coding V0.1 使用以下事实阶段：

```text
理解任务 → 检查项目 → 修改 → 运行与验证 → 版本管理 → 完成
```

不存在的阶段不显示。阶段由真实 Tool effect/name 与 Receipt 推导，不由模型自由生成。运行中显示轻量时间线；结束后默认压缩为结果摘要。

## 5. Approval 与 Failure

Approval 必须回答：

- Agent 已准备做什么；
- 将影响哪些文件、命令或 Git 操作；
- 本次批准的边界。

按钮使用“允许修改 / 允许运行 / 允许删除 / 允许 Git 操作”等效果语言，不显示 `APPROVAL_REQUIRED`。

Failure 必须区分“没有项目变化”和“已有部分变化”。Provider error code 保留在技术详情；Conversation Layer 提供可重试或先查看修改的建议。

## 6. Result Surface

Coding 结果优先呈现：最终回答、修改文件数、Verification Receipt、查看修改、查看运行记录。结果操作必须连接真实 Workspace/Review，不添加空按钮。

未来 Research、Writing、Browser、Image 使用各自 Result Surface，但复用相同三层结构和状态语法。

## 7. 视觉语法

- 用户消息按内容收缩，最大宽度 76%，弱背景、16px 左右圆角；
- Composer 不常驻权限说明，解释位于权限菜单；
- Header 显示用户意义上的 Project / Fielora，完整本地路径只在 hover title；
- Sidebar 正文式字号、轻量图标、弱选中 tint 与细 active indicator；
- 默认页面不出现 avatar、nickname、原始 Runtime 卡片或大面积状态色块。

## 8. 验证

最低 Gate：

- presentation unit：运行、成功、失败、Approval 的确定性映射；
- Renderer typecheck / lint / design-system tests；
- 真实 Electron fixture：Approval → 修改 → Verification → Result → 展开 Work Narrative / Execution / Technical Trace；
- packaged EXE 使用同一 fixture 回归，external Provider requests 必须为 0。
