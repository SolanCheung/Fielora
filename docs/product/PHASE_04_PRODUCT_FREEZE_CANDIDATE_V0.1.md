# Fielora V0.1 Phase 04 Product Freeze Candidate

状态：`FROZEN / PROVIDER ACCEPTANCE DEFERRED TO PHASE EXIT / IMPLEMENTATION AUTHORIZED`

> `HISTORICAL / SUPERSEDED TERMINOLOGY`：本冻结 Product 文档中的
> `Bounded IDR` 是当前 `Entry Intent Resolver` 的旧名，不是
> `Individualized Disposition Runtime`；冻结产品行为不变。

版本：V0.1 Frozen

日期：2026-08-16

## 1. 用户问题与 Phase 定位

真实用户问题：重要工作散落在网页、输入和模型回答中；普通聊天能够回答，但不会稳定维护“这条内容是什么、来自哪里、是否已进入持续工作、重启后从何处继续”。

Phase 04 属于 Now / Browse / Field 三层共同入口，Field 是持续工作的一级运行单位。它实现 `Field Entry & Model Foundation`，但不建设永久 AI Sidebar、Agent Dashboard、聊天产品、知识库或自动执行系统。

## 2. Product promise

> 用户可在 Now、Browse 或 Field 中召唤真实模型，先看见并控制本次 Context；回答完成后可离开而不污染 Reality，也可显式 Capture 到 Inbox、附着到 Field 或 Promote 为 `IDEA_CANDIDATE`。重启或更换 Provider 后，Fielora-owned identity、来源、归属和 Resume 仍成立。

## 3. Primary experience

### 3.1 Summon

- `Ctrl/Cmd + Shift + Space` 在当前主工作面打开轻量、可关闭的 Summon overlay；
- Overlay 不挤占永久布局，不保存成常驻 Sidebar；关闭后模型 invocation UI 消失；
- Now、Browse、Field 使用同一交互语义；可用的 Context Chip 因发起面不同而不同。

### 3.2 Context Package

用户提交前必须看到将发送的 Chip 列表，可删除、补充或编辑 `USER_NOTE`。允许的 kind：

```text
CURRENT_FIELD
CURRENT_FOCUS
CURRENT_PAGE
CURRENT_SELECTION
CAPTURE
USER_NOTE
```

上限：最多 8 Chips；单 Chip 最多 4,000 Unicode scalar / 16 KiB UTF-8；总 Context 最多 12,000 scalar / 48 KiB；用户输入最多 8,000 scalar / 32 KiB。超限必须提示并让用户选择，不得静默截断。`CURRENT_SELECTION` 必须标明网页来源与提取时间；导航 generation 变化后视为 stale，不发送。

### 3.3 Model response

- Phase 04 首发内置 OpenAI Responses 与 Anthropic Messages reference adapters；另支持受严格 endpoint policy 约束的 OpenAI-compatible 配置类；reference adapter 不是产品身份，任意 Provider 都必须服从同一 Fielora `ModelInvocation` 语义；
- 模型 id 是配置数据，不在 Product Contract 冻结具体营销型号；
- 回复流式呈现，可取消；取消、断网、限流、鉴权失败和 Provider 错误显示稳定产品错误；
- Provider 返回 tool request 时只显示/记录为 `TOOL_PROPOSAL`，Phase 04 永不执行；
- **Fielora local persistence** 默认不保存 full prompt、full response、Context Package、stream buffer 或 Provider chat memory；只有用户显式 Capture 的内容进入 Fielora persistence；
- **Provider-side retention** 由所选 Provider、账号、endpoint 与当时政策决定；Fielora 不得把 local non-retention 表述成 Provider 不保留；
- OpenAI Responses Adapter 默认且不可覆盖地发送 `store:false`，不使用 conversation/application-state continuity；这只能减少 OpenAI Responses application-state storage，不能声称 ZDR 或消除 abuse-monitoring/legal/safety retention；
- Anthropic Adapter 不声称远端 zero retention；标准/API-account/ZDR 等差异以 Provider 与账号政策为准。

### 3.4 Capture

Capture 是 Fielora-owned、带不可变来源内容的过渡对象，不是聊天消息。类型：

```text
TEXT
PAGE
SELECTION
MODEL_OUTPUT
FIELD_EXCERPT
```

单条正文最多 16,000 Unicode scalar / 64 KiB UTF-8；title 120 scalar；source URI 2,048 bytes 且禁止 credentials。Phase 04 `PAGE` 只接受 HTTP(S)；Local file/media capture 延后。

完成的模型回复可创建 `MODEL_OUTPUT`。未完成 stream 不得自动 Capture；用户如明确保存部分内容，必须创建 `TEXT` 并带 `partial source` 标识，不冒充完整模型结果。Capture 内容与 provenance 创建后不可编辑；纠错创建新 Capture，旧项可 archive/restore。

### 3.5 Inbox / Attach / Promote

- Inbox 是 `ACTIVE + INBOX` Capture 的查询面，不是独立表、Dashboard 或长期知识库；
- `Attach to Field` 把 Capture 归属到一个 Field，内容和 provenance 不变；Phase 04 不支持多 Field attach；
- `Promote` 是显式用户动作，把同一 Capture 标为 `PROMOTED / IDEA_CANDIDATE`；它不自动创建 Requirement、Decision、State 或 Verified Result；
- Promote 可选目标 Field。若进入 Field，必须原子递增 Field aggregate revision 并追加 Activity；
- archive/restore 与 placement 正交，不抹掉来源或晋升历史。

## 4. Bounded IDR

Phase 04 只识别：

```text
ASK | CAPTURE | PROMOTE | CONTINUE
```

显式按钮/命令优先。Freeform 默认 `ASK`；任何可能产生持久 mutation 的 `CAPTURE`/`PROMOTE` 都必须经过可见 preview/confirm，不因 confidence 高而自动执行。歧义或低 confidence 退回用户选择。IDR 无 Reality authority、Permission authority 或 tool execution authority。

## 5. Permission and disclosure

- Provider 调用是明确的 external send；提交前显示目标 Provider、model 与 Context 摘要；
- 首次创建 Provider 配置、首次 external send 前必须显示：`发送内容将离开 Fielora，并受所选 Provider 的数据处理和保留政策约束。` 配置创建动作本身构成该次显式继续，不新增复杂 Privacy UI 或独立 consent table；
- UI 可以说“未由 Fielora 保存”，不得说“不会被 Provider 保存”“零保留”或等价承诺，除非未来有独立、账号级可验证 Contract；
- 首次使用某 Provider 时明确提示调用可能产生该 Provider 侧费用；Phase 04 不承诺预估价格或建设 billing UI，只在 Provider 返回 usage 时展示本次 usage；
- `SENSITIVE` Context 需要逐次确认；`BLOCKED` 内容不能发送；
- secret、authorization header、credential-like token 使用确定性规则阻断/脱敏，模型分类器不能裁决放行；
- 自定义 endpoint 首次启用必须显示 hostname、外发风险并要求显式确认；Phase 04 不允许 loopback、IP literal 或 private/reserved network endpoint；
- 广泛 execution access 不推出 Reality/Verification authority。

## 6. Resume

重启后可恢复：Capture identity、content、provenance、placement、lifecycle、Field attachment/promotion 和 Activity。Invocation stream、overlay、Context Package 与 Provider response buffer 是 ephemeral，不恢复。Resume 必须来自 Fielora local state，不能依赖 Provider conversation memory。

## 7. Explicitly out of scope

- permanent AI Sidebar、multi-agent UI、自动 agent loop、Computer Use；
- Tool/MCP/Connector execution、Terminal、Editor/LSP/Git、Build/Verify；
- Requirement/Decision/Verified Result 创建、Evidence graph、stale propagation；
- 自动网页操作、注入 remote DOM、privileged web bridge；
- Chat history、cross-device sync、local LLM、Provider billing UI；
- History/Bookmarks/Profile/Sync、OAuth privileged opener；
- 通用 Permission editor、Auto-review、Full-device access；
- Local file/media capture 与多 Field Capture membership。

## 8. Product acceptance

Human Gate 必须在至少两个实际允许自动 API 调用的 Provider/协议实现下完成：Field Summon、Browse selection ask、取消、失败恢复、Capture、Inbox、Attach、Promote、restart/Resume 与 Provider swap。Provider 不预先锁定为具体厂商，但不能由同一 mock/fixture 冒充两个真实实现。验收者必须能明确回答“什么被发送、什么被保存、什么已经进入 Field、什么仍只是模型建议”。若体验仍主要像 AI Sidebar/chat wrapper，即使工程 Gate 通过也判定失败。
