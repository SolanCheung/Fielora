# Fielora Competitive Boundaries

版本：2026-08-17 Rapid Desktop Rebase

本文件区分三件事：竞品已经商品化的能力表面、Fielora 必须保留的架构不变量、以及用户最终能感知并可被证伪的产品差异。架构严谨不自动等于产品差异。

当前开发不再以“先证明差异”作为前置 Gate。用户已裁决：Fielora 先交付与 Codex 高度相似、但可自由配置不同 Provider/Model 的桌面工作软件；Reality 暂按 Project state 理解。四项差异机制降为后续产品假设，只有在 stable long-task runtime、Aegis 与 DXE 真正进入产品后再验证。当前执行顺序以 `RAPID_DESKTOP_EXECUTION_V0.1.md` 为准。

## 1. 不用“AI Browser 功能数量”竞争

以下视为 Foundation / Commodity：Chat、多轮对话、AI 问网页、页面总结、搜索、划词问答、截图问答、跨 Tab Context、Vertical Tabs、Tab Group、Split View、Browser Agent、网页点击/表单、Browser Profile/History/Downloads、文件预览与成品、Editor、Terminal、Coding Agent、测试修复循环、Permission/Sandbox/Approval、Multi-LLM、Connected Apps、MCP、Plugins、Workflow/Shortcut、Projects、本地文件夹、跨会话 Context、Memory、Computer History、Goals、长任务、Resume 与跨设备 continuation。

这些能力可以拥有，但不能解释“为什么 Fielora 必须存在”。

截至 2026-08-17，OpenAI 官方资料把 ChatGPT Desktop 描述为复杂工作的 desktop command center，并公开提供 Projects/Chats、本地文件夹、Browser、文件工作、长任务 Goal、Computer Use 与 Plugins/MCP 等能力。因此 `ChatGPT = AI Chat`、`Fielora = AI Work Environment` 已不是有效比较。官方能力存在不表示所有账号、地区或平台同时可用；尤其 Computer History 当前官方标注为 macOS Desktop、受计划/管理员/地区限制，不得写成 Windows 通用现状。

官方事实来源：

- https://learn.chatgpt.com/docs/app
- https://learn.chatgpt.com/docs/projects
- https://learn.chatgpt.com/docs/long-running-work
- https://learn.chatgpt.com/docs/browser
- https://learn.chatgpt.com/docs/computer-use
- https://learn.chatgpt.com/docs/plugins
- https://learn.chatgpt.com/docs/customization/memories
- https://learn.chatgpt.com/docs/customization/computer-history

## 2. 一级抽象必须不同

当前竞争定位收窄为：

```text
ChatGPT Desktop ≈ AI-centered workspace

Project / Chat / Goal
        ↓
AI 使用工具完成工作

Fielora ≈ Work-centered environment

Work lifecycle / operational state
        ↓
Human + interchangeable AI + tools
共同推进同一工作谱系
```

这不是声称 ChatGPT 做不到某个流程，也不推测竞品内部实现；它只定义 Fielora 必须把什么作为一级、持久、可操作的产品抽象。

`Field` 这个词本身不是差异。若 Field 只是 Conversations、Files、Pages、Notes、Goal 与 Current Focus 的集合，它就是另一种 Project。

`Reality` 这个词本身也不是差异。若 Reality 只是 Goal、Status、Task、Blocker 与 Result 的摘要，它就是另一种 project memory/status。只有 Reality mutation 真实改变 Resume、Action、Completion 或 Reverification，它才构成产品机制。

## 3. 四项未来差异假设

### 3.1 Explicit Lifecycle

```text
Capture → Inbox → Promote → Work → Result → Reuse
```

Capture 不要求立即分类；Promotion 表示用户明确决定某项内容何时正式进入持续工作。它不同于系统自动把活动变成 Memory。Phase 04 只证明了 `Capture → Inbox → Promote` 的入口，不得据此宣称完整 Lifecycle 已成立。

### 3.2 Operational Work State

> **Context informs the Agent; Reality governs the work.**

竞争命题不是 Fielora “记得更多”，而是当前被系统承认的工作状态从 Agent context 中独立出来，拥有稳定 Identity、Type、Provenance、Authority、Lifecycle 与 Verification Relation，并通过 Operational Effect 和 Provider Independence 实际支配 Resume、Action、Completion 与 Reverification。

最低反例：Requirement 从 `rev3` 变成 `rev4` 后，旧 Verified Result 仍保持有效，Resume 不变且 Completion 不受阻。出现该反例即表示 Reality 只是 metadata。

### 3.3 Persistent Work Lineage + Verification

```text
Capture / Idea
  → Decision
  → Requirement@revision
  → ChangeSet
  → Check@revision
  → Evidence
  → Verdict
  → Verified Result
  → Reuse
```

运行测试、看到 FAIL、修复并 PASS 是基础能力。差异要求 Requirement、Change、Check、Evidence 与 Result 拥有稳定关系；Requirement、Check 或 Evidence revision 改变时，证明有效性必须随之变化。

### 3.4 DXE

DXE 是从固定、可审计的 Surface Primitive 中，依据 `Field State + Intent + Current Goal + Available Objects / Capabilities` 选择、排列、聚焦、折叠或替换当前工作面。用户不应通过选择“Research Mode / Coding Mode / Test Mode”手工模拟状态机。

最低 Alpha 证明必须覆盖：

```text
Research:   Web + Reference
Development: Requirement + Code + Preview
Reverify:   Code + Diagnostics + Evidence
```

工作状态改变必须触发确定、可解释、可撤销的 Surface 转换。任意 LLM 生成 UI、无限自由布局或常驻多面板仍被禁止。

当前状态必须保持诚实：

```text
DXE_DESIGN_PRINCIPLES: PARTIALLY_APPLIED
DXE_SURFACE_RUNTIME: NOT_IMPLEMENTED
```

在最小 DXE Runtime 经真实 Human Gate 证明前，DXE 只能称为设计假设，不能称为当前产品优势。该假设不再阻断近期 Codex-like Desktop Foundation 的开发或交付。

## 4. 架构优势与长期愿景不是单独购买理由

战略层级固定为：

```text
Long-term vision       Personal Digital Steward
Core problem           Important work loses continuity and trustworthy state
                       across people, AI systems, tools and time.
Architecture enablers  Provider-neutral Reality + Governed Agency
                       + Verification + Recovery
Alpha position         Work Reality Steward
Life expansion         Deferred
```

`trustworthy state` 不声称 Reality 是绝对 Truth。Fielora 维护的是当前承认什么、依据是什么、authority/confidence 与 lifecycle 怎样，以及变化后必须产生什么操作后果。`FACT`、`DECISION`、`ASSUMPTION`、`QUESTION`、`BLOCKER`、`RESULT`、`UNKNOWN`、`STALE` 与 `SUPERSEDED` 不得被压成同一种“记忆”。

Provider-neutral、Governed Agency、Permission、Recovery、Capability Connector 与专业工具编排仍是必要架构和安全边界，但它们单独出现时不构成差异。用户购买的是工作生命周期、有效状态、谱系/证明和状态驱动工作面，而不是 Provider abstraction 或权限模型本身。

`Personal Digital Steward` 是北极星，不直接产生当前 Roadmap Item，也不是当前护城河。Memory、Computer History、Computer Use、Plugins 与 Scheduled Tasks 已使主要 AI 产品明显朝相同方向前进；Alpha 只证明 Fielora 的四项机制值得继续发展。

## 5. 视觉去同质化

Browse 可以像优秀浏览器，不为不同破坏成熟习惯。

Field 必须脱离 `左 Tab + 中网页 + 右 AI`，进入 `Current Goal / Focus → Dynamic Working Surface`。Browser 只是 Surface 之一。

## 6. 残酷判断标准

每设计一项功能先问：

> **如果把这个功能加到 ChatGPT Project + Codex，用户体验是否基本相同？**

若答案为“是”，按成熟 Foundation 实现或直接延后，不得把它包装成 Fielora 差异。Chat、Browser、Files、Editor、Terminal、MCP、Permissions、Goals、Memory、Provider 选择全部默认适用此规则。

只有以下完整实验才开始证明 Fielora 不只是另一种 AI Desktop：网页 Capture 进入 Field → 形成 Requirement → Provider B 产生 ChangeSet → Check/Evidence 验证当前 revision → 用户修订 Requirement → 旧 Result 自动失效并阻止 Completion → DXE 进入 Reverify Surface → 重启并更换 Provider 后沿同一 lineage 继续。

## 7. 审核问题

1. 遮住 Fielora Logo 后，这是不是仍然只是 Chrome / Tabbit / 豆包 + AI Sidebar？如果是，继续改。
2. 页面是否因为系统内部“知道很多”而把所有能力常驻展示？如果是，继续删。
3. 当前最重要工作对象是否占绝对视觉主导？如果不是，重新编排。
4. 删除聊天摘要、Memory 或更换 Provider 后，权威 Reality 与 Resume 是否仍完全一致？如果不是，Reality 仍由 Agent context 隐性拥有。
5. Source/Requirement revision 改变后，旧 Fact/Verified Result 是否自动失效并阻止错误 Completion？如果不是，Reality 只是 metadata。
6. 工作状态变化后，用户是否还要手工选择模式和拼装 Pane？如果是，DXE 仍未成立。
7. 把当前功能移植到 ChatGPT Project + Codex 后是否基本同构？如果是，它是 Foundation，不是差异。

## 8. Change Impact

本文件现在只保留长期竞争假设。近期允许先建立同类基础体验，不要求每个 Build 都提供差异化证明；当前开发顺序、轻量文档规则与现有代码处置见 `RAPID_DESKTOP_EXECUTION_V0.1.md`。
