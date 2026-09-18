# Fielora 完整框架与功能说明 V0.1

状态：`CURRENT PRODUCT SNAPSHOT / 事实说明，不是新的 Freeze 或实现授权`

事实日期：2026-09-02  
代码基线：`phase/complete-agent-v0.1@bd01ec3f4ce15f7730dbe81eb026565e47ede871`  
当前正式平台：Windows 11 x64  
当前数据库版本：SQLite schema 15

> 本文回答三个问题：Fielora 是什么、今天已经能做什么、未来能力应当接到哪里。
> 文中严格区分“已实现”“已实现但仍待真实/人工验收”“兼容保留”和“尚未实现”，不把历史候选设计写成现有产品能力。

## 1. 一句话定义

Fielora 是一个 **Project-first、Local-first、多模型 Provider-neutral 的 Agentic Desktop Workspace**：用户在本地 Project 和持久 Conversation 中提出任务，Fielora 的 Agent 在可控权限下理解项目、调用工具、修改文件、运行测试、审阅结果、记录证据，并在应用或 Core 重启后继续工作。

它不是以下产品的简单变体：

- 不是 `Chromium + 永久 AI Sidebar`；
- 不是只会聊天的模型客户端；
- 不是把所有内部状态堆成 Dashboard 的工作流系统；
- 不是复制 VS Code、Blender、CAD、专业剪辑或 DAW；
- 不是绑定 OpenAI、Anthropic 或任一国产模型的单厂商 Agent。

近期产品目标是先成为真正可日常使用的 Codex-like 多模型桌面工作软件。Fielora 的长期方向是在同一基础上继续建立 Stable Long Tasks、Aegis、DXE 和 Personal Steward。

## 2. 当前产品边界与状态

| 范围 | 当前状态 | 准确含义 |
| --- | --- | --- |
| Desktop Project + Conversation | 已实现 | 本地文件夹 Project、持久 Conversation、消息与最近工作恢复已接通 |
| Multi-provider Model | 已实现，真实质量未全面验收 | OpenAI Responses、Anthropic Messages、OpenAI-compatible 共用统一内部调用模型 |
| Coding Agent | 已实现并有工程验证 | 能检查仓库、修改文件、运行命令/测试、查看 Diff、审批、恢复和继续 |
| Stable Long Tasks 最小闭环 | 已实现 | Run/Tool/Approval/Verification/UNKNOWN/restart recovery 已存在；通用后台队列和更成熟 checkpoint 仍未完成 |
| Browser Foundation | 已实现并经过多宿主 Gate | 真实 Chromium 页面、多 Page、session、导航、安全隔离、右键和 loading 已接通 |
| Artifact 与 Rich Result | 已实现并有 targeted validation | Document、Presentation、Diagram、Spreadsheet、File Mutation、类型化结果引用与图片预览 |
| Library / Storage / Portable | 已实现 | 本地资料库、路径迁移、缓存清理、受限 Profile 导入导出 |
| Scheduled | 已实现 | Desktop 本地计划任务复用现有 Conversation 和 AgentRun；不是系统级后台服务 |
| IDR V2 | 已实现、targeted validated、架构冻结 | 为本地主用户提供可校正、非权威的个体化 Context，不拥有权限或最终决策 |
| Fielora Glass | 已实现候选 | 唯一官方设计语言；自动验证存在，最终 Visual Human Gate 仍待用户裁决 |
| Aegis | 未形成独立产品层 | 当前已有 Policy/Approval/Verification 基础；完整 Aegis 只能强化现有 Harness |
| DXE | 未实现 | 未来只能消费稳定工作状态编排固定 Surface，不能成为第二套 Agent Runtime |
| Personal Steward | 长期规划 | 等长期任务、Aegis、DXE 稳定后再建设 |

## 3. 总体框架

```text
Human / Local Environment
        │
        ▼
Fielora Desktop Product
├── Desktop Chrome / Navigation / Settings
├── Project / Conversation / Scheduled / Library
├── Right Workspace Dock / Bottom Terminal
├── Browser Host
└── Field / Capture compatibility capabilities
        │
        ▼  typed FIPC / narrow trusted bridges
Electron Main
├── Window and lifecycle supervision
├── BrowserRuntime (isolated WebContentsView)
├── WorkspaceRuntime (user-initiated desktop capability)
├── scheduled task service
└── Rust sidecar supervision
        │
        ▼
fielora-core.exe
├── Product/Core command routing
├── Fielora Agent = Model + Harness + Tools
├── StorageWorker
└── Platform adapters
        │
        ├── SQLite / ContentBlobStore / local configuration
        ├── Windows Credential Manager
        ├── Filesystem / Process / Git
        ├── Model Providers / Web / MCP
        └── Evidence and durable Artifacts
```

### 3.1 进程结构

```text
Fielora.exe
  ├── Electron Main
  │     ├── Desktop lifecycle
  │     ├── Browser WebContentsView
  │     └── narrow native/workspace bridges
  ├── trusted React Renderer
  └── fielora-core.exe
        ├── Rust Core
        ├── Agent Harness
        └── SQLite StorageWorker
```

- Renderer 负责交互和投影，不拥有 Agent 状态机、执行结果或 Verification truth。
- Electron Main 负责宿主、窗口、Browser 和受控 Desktop integration，不拥有 Project/Agent business truth。
- Rust Core 是 Project、Conversation、AgentRun、Artifact、Evidence 和核心持久状态的权威层。
- Sidecar 由 Electron Main 监督；parent stdin EOF 是权威退出信号，避免 orphan process。

### 3.2 Agent 顶层公式

```text
Fielora Agent
├── Model    —— 理解、推理、规划、生成候选动作
├── Harness  —— Context、范围、治理、执行、恢复、验证、个体化
└── Tools    —— 文件、命令、Git、Web、MCP、Artifact 等真实能力
```

永久执行链是：

```text
Model proposes Tool call
  → Harness validates
  → Governance: ALLOW / ASK / DENY
  → Approval when required
  → Execution
  → Tool backend
  → typed result / receipt
  → Verification and completion evaluation
```

Model 不能直接调用 Tool；Provider、Tool、Plugin、MCP 和 UI 都不能绕过 Harness 自授权限或完成状态。

## 4. 产品对象模型

```text
Local Installation / Primary Profile
├── Project *
│   ├── local folder binding
│   ├── Conversation *
│   │   ├── User / Assistant Message *
│   │   └── AgentRun *
│   │       ├── Context Snapshot *
│   │       ├── Event *
│   │       ├── ToolCall *
│   │       ├── Approval *
│   │       └── Verification Receipt *
│   ├── Files / Diff / Git / Terminal
│   └── Artifact *
│       └── immutable Revision *
├── Library Object *
├── Screenshot Evidence *
├── Scheduled Task *
├── Provider Configuration *
├── Human Model / IDR items
└── legacy Field Reality / Capture state
```

关键身份原则：

- 当前 Project 复用历史 Field stable identity，但用户侧按普通 Project 理解。
- 本地绝对路径只是 `PROJECT_ROOT` Device Binding，不是 Project 的 durable identity。
- Conversation、AgentRun、Provider 和 Model 都不能成为 Project/Artifact Reality identity owner。
- Artifact identity 与 revision identity 分离；历史 revision 不因更新而被覆盖。
- Screenshot Evidence、Library Object、Artifact Asset、Attachment 和 Verification Receipt 是不同对象，不能互相冒充。

## 5. Desktop 信息架构

### 5.1 顶部 Desktop Chrome

当前使用 Electron 隐藏原生标题栏并与 Windows Window Controls Overlay 整合。顶部提供：

- 左侧导航显示/隐藏；
- 应用内前进/后退；
- 文件、编辑、视图、帮助菜单；
- 当前 Project 的 Terminal 与右工作区开关；
- Right Dock 已打开时的扩展/恢复；
- 与 Renderer 品牌背景一致的 native caption color。

### 5.2 左侧 Primary Navigation

一级可见结构已经收敛为：

- 新聊天；
- 已安排；
- 资料库；
- Project 列表；
- 每个 Project 下的 Conversation 列表；
- 设置。

Browse 不再是中间主页面，而是右侧 Workspace Tool。历史 Fields、Now/Inbox 等能力没有继续占用当前一级导航。

### 5.3 中央 Conversation 工作面

Conversation 是近期一等产品对象和默认主焦点：

- 用户消息、Assistant 结果与 Agent execution narrative；
- Run 状态、审批、失败、完成与技术明细的渐进披露；
- Composer 中的模型、权限、附件、语音输入、发送/停止；
- 多于一定消息后的快速定位；
- Agent 正在运行时可排队下一条 follow-up，在真正发送前编辑或删除；
- 重启后恢复同一 Project、Conversation、消息和 Run 投影。

### 5.4 Right Workspace Dock

右侧工作区是 push layout，不是遮挡 Conversation 的 overlay。当前固定启动入口为：

- 审阅；
- PowerShell；
- 浏览器；
- 文件。

Agent 创建的 Artifact 可以直接打开独立 Tab，但不再占一个常驻“工作对象”启动器入口。

Dock 支持：

- File、Image、Artifact、Browser 等多 Tab；
- active Tab 自动 reveal 和 bounded horizontal scroll；
- Reload、Duplicate、Rename、Close、Close Others、Close Right 右键动作；
- Tab 名称只改 session presentation，不改文件路径或 durable identity；
- Resize、focus expansion、edge-collapse、Reduced Motion；
- 单 Tab 时 Tool Menu 通过 window-level Portal 保持在视口内，不被 Dock overflow 裁剪。

### 5.5 Bottom Terminal

底部 Terminal 从 Project 导航之后横跨主工作区和右 Dock：

- 支持运行、输出与取消；
- 跟随 System/Light/Dark；
- 与右侧 PowerShell Tool 区分图标和空间语义；
- 当前是受控 PowerShell process adapter，不是完整 PTY。

### 5.6 Settings

当前设置分类为：

- 常规：界面语言、默认工作面；
- 外观：Fielora Glass、System/Light/Dark、用户 Override；
- 模型与服务：Provider、Base URL、Model ID、凭据和连接测试；
- 能力与扩展：Skills、MCP、Local Plugins；
- 存储与数据：DataRoot、LibraryRoot、Cache、迁移、Profile 导入导出；
- 键盘快捷键；
- 关于。

Browser 设置从 Browser 自身菜单进入，不作为普通设置一级分类常驻。

## 6. 核心用户流程

### 6.1 日常编程闭环

```text
在 Settings 添加 Provider / Model
  → 打开本地 Project
  → 新建或恢复 Conversation
  → 描述任务并选择权限
  → Agent 检查仓库与相关文件
  → 产生并执行受控修改
  → 在 Review 查看 durable file change
  → 运行 test/check/build/lint/typecheck
  → 查看 Diff 与 Verification
  → 可选执行 typed Git finalize
  → 关闭并重启
  → 回到同一 Conversation / AgentRun 继续
```

### 6.2 Web 到工作结果

```text
在 Right Dock 打开 Browser
  → 浏览真实网页 / 多 Page 切换
  → 可将网页保存到 Library
  → 可通过 Web Tool 获取受限网页文本
  → 结果以 untrusted web content 进入 Context
  → Agent 产出带 typed Web/File/Image reference 的完成结果
```

### 6.3 Artifact 生成闭环

```text
Conversation 中提出产物需求
  → Agent 使用 typed Artifact Tool
  → 创建 durable Artifact revision
  → Right Dock 打开 Artifact Tab
  → 查看 current / historical revision
  → 导出 DOCX / PPTX / SVG / XLSX
```

### 6.4 已安排任务

```text
创建一次 / 每天 / 每周任务
  → 选择 Project、Provider、Model、Permission、max steps
  → Fielora 建立/绑定持久 Conversation
  → 触发时写入普通 User Message
  → 调用既有 command.agent.start
  → 产生正常 AgentRun、Tool、Approval 与 Evidence
```

## 7. Project 与 Conversation 功能

### 7.1 Project

已实现：

- 从本地文件夹创建 Project；
- Project 列表、选择、重命名、归档；
- 原路径不可用时显式 rebind；
- 最近活动排序和创建时间排序；
- 查看 Project 环境摘要、Git status/branch/diff 与可打开的本机目标；
- Project root containment、path traversal 与 symlink escape 防护。

### 7.2 Conversation

已实现：

- 每个 Project 下多个持久 Conversation；
- 新建、切换、重命名、归档；
- Provider/Model selection 随 Conversation 保存；
- 用户/Assistant 消息、调用 provenance 和 typed result references 持久化；
- 最近 Conversation 恢复；
- AgentRun、Terminal 结果和变更结果回到当前 Conversation；
- 运行中 follow-up 本地排队，上一 Run terminal 后才持久化并启动。

### 7.3 Composer

已实现：

- 发送与 stop；
- 已配置 Provider/Model picker；
- 三档 Agent 权限；
- trusted 多文件选择器；
- 受限 UTF-8 文本附件进入 Context；
- Chromium/System SpeechRecognition 将语音转为可编辑文字，用户确认后发送；
- 二进制附件不会伪装成已支持的文本 Context。

## 8. Agent Harness 详细结构

Harness 固定为八个职责域：

| Harness 域 | 回答的问题 | 当前实现重点 |
| --- | --- | --- |
| Ingress & Context | Model 现在应该知道什么？ | 输入/附件准入、Repository Context、Context budget、snapshot、IDR projection |
| Work Scope & Goal | 这次到底在处理什么？ | Project、Conversation、AgentRun、task、允许/排除范围 |
| Continuity | 工作上次停在哪里？ | Run/Event/Tool/Approval/Verification persistence、pause/restart/recovery |
| Orchestration | 下一步做什么？ | Agent loop、task classification、Profile/strategy、retry、subagent |
| Governance | Agent 可以做什么？ | Policy、Permission、Mandate、Approval Routing、Semantic Authority、risk |
| Execution | 获批动作如何执行？ | dispatch、ToolCall lifecycle、cancel、timeout、reconciliation |
| Verification & Evidence | 什么证明工作完成？ | receipt、mutation revision、test/diff/check、completion gate |
| IDR | 正在服务怎样的用户？ | Human Model、Resolver、Context Admission、个体化 Direction |

### 8.1 Coding Harness Profile

当前唯一正式 Harness Profile 是 `CODING_V0.1`，包含三种策略：

- `FAST_EDIT_ADAPTIVE_V1`：小范围修改，先定位证据，最小变更，最多一次 evidence recovery、ChangeSet correction 和 patch conflict retry；
- `FOCUSED_EDIT_V1`：范围较明确的编辑与验证；
- `GENERAL_AGENT_LOOP_V1`：更一般的检查、动作、观察、验证循环。

FAST_EDIT 的用户可见阶段是“定位 → 修改 → 验证”，不会把内部 FINALIZE 或私有 Chain-of-Thought 当成产品内容展示。

### 8.2 Run、Tool 与 Verification 状态

```text
AgentRun:
QUEUED → RUNNING ↔ WAITING_APPROVAL / PAUSED
       → COMPLETED | FAILED | CANCELLED

ToolCall:
PROPOSED → WAITING_APPROVAL → RUNNING
         → COMPLETED | FAILED | DENIED | CANCELLED | UNKNOWN
```

`UNKNOWN` 是一等状态：Core 启动时，没有 final receipt 的遗留 RUNNING Tool 不会被假设成功，也不会自动重放高风险或非幂等动作。

恢复规则包括：

- retry-safe read 可以重读；
- 文件写入通过当前 hash 与预期 before/after 状态判定 `APPLIED / NOT_APPLIED / DIVERGED`；
- 中断的 Verification 必须 fresh rerun；
- Git、network、destructive 和未知 process 不盲目 replay；
- WAITING_APPROVAL 的 nonce 和 Run 状态可跨重启恢复；
- terminal Run 不重复执行。

### 8.3 权限与审批

Composer 的三档权限为：

- `READ_ONLY`：只读，不允许将模型建议直接形成 workspace mutation；
- `REVIEW_CHANGES`：允许提出/执行受审阅约束的改动；
- `FULL_CONTROL`：减少可被简化的审批，但不能关闭安全不变量。

永久正交关系：

```text
Capability Boundary ≠ Mandate ≠ Approval Routing ≠ Semantic Authority
```

即使是 Full Control，也不能绕过 project-root containment、symlink protection、敏感路径、SHA guard、force/destructive restrictions、receipt 和 fresh verification。

Typed Git 的 stage、unstage、create branch、switch branch、commit、push 始终逐次 Ask；禁止 stage-all、force、amend、reset、clean、rebase、tag 和交互式 push credential prompt。

### 8.4 Verification

```text
Mutation
  → workspace revision changes
  → previous Verification becomes STALE
  → fresh test/check/build/lint/typecheck/diff
  → eligible receipt bound to current revision
  → Harness decides whether Run may complete
```

必须保持：

- Tool success 不等于 Task success；
- 普通 process exit 0 不等于 Verification；
- commit/push 不等于 Verification；
- Artifact 创建、Archive、Reviewed 或 Screenshot capture 不等于 PASS；
- Model 自称“完成”不能替代 Harness completion gate。

### 8.5 只读子 Agent

`delegate_readonly` 可以创建 bounded child AgentRun 做独立调查。它使用 observe-only catalog，不能通过委托扩大父 Run 的权限，也不是第二个 Agent Core。

## 9. Model 与 Provider

### 9.1 统一内部接口

当前 Provider kinds：

- `OPENAI`：OpenAI Responses；
- `ANTHROPIC`：Anthropic Messages；
- `OPENAI_COMPATIBLE`：Chat Completions compatible endpoint。

三类 wire events 被归一化为：

```text
STARTED
OUTPUT_TEXT_DELTA
USAGE
COMPLETED | CANCELLED | FAILED
```

Provider-specific 差异只能留在 adapter、capability facts 和 bounded behavior profile。不能建立 GPT Agent、Claude Agent、Qwen Agent 等独立 Core。

### 9.2 配置与凭据

用户可以：

- 添加、编辑、禁用/移除 Provider 配置；
- 设置显示名、协议、HTTPS Base URL、Default Model ID；
- 保存、替换和删除 API Key；
- 从 Settings 执行受限连接测试；
- 在 Conversation 选择已配置模型。

API Key 只进入 Windows Credential Manager；SQLite 保存 configuration metadata 与 credential presence/reference，不保存 secret bytes。

OpenAI official adapter 固定发送 `store:false`，但这不等同于 Provider ZDR；首次 external send 需要明确 Provider policy disclosure。

### 9.3 国产模型预设

Settings 提供可编辑预设：

- Qwen 通用 API；
- Qwen Coding Plan；
- DeepSeek；
- Kimi；
- GLM；
- MiniMax；
- Doubao。

它们共享 `china-coding-v1` 行为层，行为提示不授予 Tool、Permission、Execution、Reality 或 Verification authority。

当前验收边界：Qwen Coding Plan 曾完成真实 bounded coding Golden Task；其他国产模型质量仍未全面 live 验证。Provider metadata 或“凭据已保存”不代表连接成功、服务可用或模型质量通过。

## 10. Tool 能力

### 10.1 文件与仓库

已实现的主要 built-in Tools：

- `list_files`、`read_file`、`search_text`、`stat_path`；
- `create_file`、`write_file`、`replace_text`、`apply_patches`；
- `move_file`、`delete_file`、`restore_file`；
- SHA-256 guard、atomic write、checkpoint 和 project-relative containment；
- CRLF/LF 感知的 exact replacement；
- 敏感路径与内容排除。

### 10.2 Process 与测试

- `run_command` 只接受 `program + argv`，不接受把模型字符串直接拼入 PowerShell command；
- 子进程环境经过 allowlist/sanitization；
- Windows Job Object 负责 stop/timeout 时终止进程树；
- 输出和时间受限；
- Verification 只承认识别出的 test/check/build/lint/typecheck 等 eligible command。

### 10.3 Git

- 只读：status、diff、log、show；
- 写入：stage、unstage、create branch、switch branch、commit、push；
- 写工具受 typed arguments、显式路径、Approval、Git safety 与 verification-before-finalize 约束；
- 通用 `run_command` 不可绕过 typed Git 去执行 Git mutation。

### 10.4 Web Intelligence

- `web.fetch`：单 URL、GET、HTTP(S)、受限 redirect、公开 IP DNS 验证与 address pinning；
- `web.search`：provider-neutral SearchBackend，首个 adapter 为 Brave Search；
- Web 内容统一标记 `UNTRUSTED_WEB_CONTENT`，没有 instruction authority；
- search/fetch 成功不产生 Verification PASS；
- `web.download` 尚未实现，因为当前单 effect contract 不能诚实同时表达 `NETWORK + WORKSPACE_WRITE`。

当前 Brave credential 没有完整的非模型产品激活流程，因此不能把 Tool 存在写成默认可用的 live Search 服务。

### 10.5 Rich File Read

`file.extract` 能从 Project 内受限读取：

- PDF；
- DOCX；
- PPTX；
- XLSX。

它只产生 bounded、provider-neutral、untrusted text/metadata observation。当前不提供 OCR、宏执行、外部关系跟随、XLSX 公式计算或 Office 双向编辑。

### 10.6 Skills

- `list_skills`：列出 built-in、Project 和 Plugin-contributed Skill metadata；
- `load_skill`：按稳定名称渐进加载一个 Skill；
- Skill 内容进入 bounded Context admission；
- `allowed-tools` 只是 advisory，不能提升权限。

### 10.7 Local MCP

- 用户在 App ConfigRoot 的 `mcp.json` 声明最多八个 local stdio server；
- Project 内 `.mcp.json` 等文件不会被自动扫描或启动；
- `mcp.list_connections` 只读配置与诊断；
- `mcp.activate_connection` 经 Policy/Approval 后在当前 Run 激活；
- 生命周期绑定 Run，cancel/terminal/Core exit 时回收；
- 未知 MCP Tool 一律按 `DESTRUCTIVE` 处理；
- 当前不支持 remote MCP、OAuth、Marketplace 或 MCP daemon。

### 10.8 Local Plugins

- Settings 可以注册/移除 bounded canonical local plugin root reference；
- Registry 不删除用户 Plugin 文件；
- 当前只读取 declarative manifest 和 Skill contribution；
- Project 不自动扫描 Plugin 目录；
- executable Plugin runtime、installer、Marketplace 和任意 ToolProvider contribution 尚未实现。

## 11. Artifact、Rich Result 与 Evidence

### 11.1 Durable Artifact 类型

当前 closed Artifact types：

| 类型 | 当前能力 | 主要边界 |
| --- | --- | --- |
| `DOCUMENT` | typed content、revision、DOCX export、PNG inline image、Artifact composition | 不是任意 OOXML/HTML 编辑器 |
| `PRESENTATION` | typed slides、PPTX export、PNG image block | 没有自由画布或完整 PowerPoint editor |
| `DIAGRAM` | typed semantic graph、deterministic layered layout、SVG export | 不接受 raw SVG/Mermaid/CSS/manual geometry DSL |
| `SPREADSHEET` | sparse typed literal workbook、XLSX export | 无公式、计算、chart、pivot、merge 或 external data |
| `FILE_MUTATION` | 每个成功 Coding mutation 的 durable before/after lineage、Review、hash-guarded Undo | MOVE review/undo 和 binary delete undo 仍受限/后置 |

共同能力：

- `artifact.create/read/list/history/update/set_archive_state/export`；
- immutable revisions 与 current pointer CAS；
- Profile/Project/Conversation/AgentRun/Tool provenance；
- exact revision export；
- Archive 只改变可见性，不删除 identity 或 revision；
- Artifact 内容是 `UNTRUSTED_ARTIFACT_CONTENT`；
- Artifact 操作复用现有 Policy、Approval、ToolCall、receipt、recovery 和 Verification boundary。

### 11.2 Artifact Source Asset

当前只支持严格准入的静态 PNG：

- Profile-owned、immutable `AssetId`；
- content SHA-256 与 identity 分离；
- bytes 存入共享 ContentBlobStore；
- 不把原始 path、bytes 或 decoded pixels 发送给 Model；
- Document/Presentation 只引用 exact Asset facts；
- JPEG/WebP/GIF/TIFF、external SVG、Asset delete/GC 尚未进入 Artifact source asset contract。

### 11.3 Rich Result typed references

完成消息的 Markdown 可带受信任 sidecar reference：

- Project file；
- Code range；
- saved HTTPS Web reference；
- Library image；
- Screenshot Evidence image。

普通 Markdown 文字或伪造 marker 不能自行获得 trusted navigation/image behavior。点击后复用现有 File viewer、Browser 和 Image Lightbox。

### 11.4 Durable Screenshot Evidence

已建立的基础：

- 捕获当前 active、visible、navigation-stable 的 Browser viewport；
- Electron 使用 `WebContents.capturePage()`，不使用 production CDP；
- 严格准入 bounded PNG；
- 独立 `ScreenshotEvidenceId`、metadata 和 provenance；
- Conversation reopen、Core restart、LibraryRoot migration 后仍可恢复引用；
- Screenshot 不授予 Verification PASS；
- 默认 `LOCAL_ONLY / EXCLUDED`，不进入 portable export 或 sync journal。

当前没有可见的通用 Agent screenshot Tool，也没有 auto/full-page/window/desktop capture。

## 12. Browser

### 12.1 用户能力

- 真实 Electron/Chromium `WebContentsView`；
- 新建、切换、关闭到 0 Page；
- 地址栏识别显式 URL、域名、localhost/IP 与普通搜索词；
- 默认搜索 Provider 为 Google，策略集中且可替换；
- Back、Forward、Reload；
- `target=_blank` / `window.open()` 通过策略后创建受控新 Page；
- 多 Page 共享同一 untrusted persistent session，可保留 Cookie/登录；
- favicon、loading spinner、progress、原生网页和 trusted address/tab context menu；
- Clipboard、长页、复杂 JS、POST/redirect、resize 与 Browser/Project 往返；
- 保存网页到 Library。

Page ID 只是 Electron Main 内的 ephemeral runtime identity，不进入 Project/Field/Object schema，也不形成 History/Bookmark。

### 12.2 安全边界

Remote/Local Page 共同使用：

- no Node；
- no preload；
- no app bridge；
- sandbox + contextIsolation + webSecurity；
- 独立 untrusted session；
- permission deny；
- safe dialogs 和集中 navigation policy。

Navigation 必须同时判断 initiator 与 target：

- trusted Fielora Omnibox 可显式打开隔离 `file://` Local Page；
- HTTP(S) Remote Page 不能跳到、window-open、iframe/fetch `file://`；
- Loose Browse 的任何发起者都不能进入 `fielora://app`；
- Remote Browse 永远拿不到 Project filesystem/workspace bridge。

### 12.3 当前不包含

- History、Bookmarks、Profile/Sync；
- Download manager；
- OAuth privileged opener；
- Agent Browser tool catalog；
- 完整 Chrome Extension compatibility；
- Chromium Fork。

## 13. Library、Storage、Portable 与 Sync 边界

### 13.1 Library

已实现：

- 添加本地文件；
- 从 Browser 保存网页；
- 按 media kind 筛选；
- 打开、定位原文件、预览受支持图片；
- tombstone delete；
- stable LibraryObject ID、SHA-256 content hash 与 content-addressed blob。

Library 不是 Browser History，也不是第二套 Project。

### 13.2 Storage Roots

`StorageManager` 分开管理：

- `DataRoot`：SQLite 和核心持久状态；
- `LibraryRoot`：Library、Artifact Asset、Screenshot/File Artifact 等 content-addressed blobs；
- `CacheRoot`：可清理的缓存；
- repository index：内部 Project Context 索引。

DataRoot/LibraryRoot 迁移使用 `copy → validate → switch`，成功后也不自动删除原数据；Cache 清理只触及明确 CacheRoot。

### 13.3 Portable Profile

Portable export 使用 versioned manifest、logical-path allowlist 和逐文件 SHA-256：

- 可导出闭合 SQLite snapshot；
- 可选包含 eligible Library/Artifact blobs；
- 排除 credential bytes、Browser cookie/session、device binding、绝对路径、cache、临时状态；
- Screenshot Evidence 及其单独授权 blob 排除；
- Provider metadata 可保留，但导入后 disabled，需要新设备重新授权；
- Project path 由用户 rebind。

当前只有 provider-neutral sync identity/revision/journal/tombstone foundation；Cloud Sync provider 默认禁用且没有网络实现。

## 14. Scheduled Tasks

已安排页面支持：

- 搜索与状态筛选；
- 创建、编辑、删除；
- 暂停、恢复、立即运行；
- 一次、每天、每周；
- 本地时间、星期、时区；
- Project、Provider、Model、Permission、max steps；
- 下次运行、上次运行和上次错误。

它复用现有 persistent Conversation、User Message 与 AgentRun，不创建第二套 Agent Runtime。计划保存在 Desktop local durable JSON 中，Electron 运行时每 15 秒检查 due task；Fielora 完全退出时没有系统级后台服务替它执行。

## 15. IDR V2 与个体化

IDR 是 `Individualized Disposition Runtime`，属于 Harness，不是第二个 Agent 或第二次模型调用。

### 15.1 Human Model

支持五种 closed item：

- Fact；
- Preference；
- Observation；
- Disposition；
- Long-term Goal。

每项保留 type、scope、provenance、basis、confidence、lifecycle、revision 和 supersession/correction 关系。Explicit、Observed、Inferred 不可互相冒充。

### 15.2 运行链

```text
trusted current constraints
+ current Project / active Artifact Reality
+ source availability
+ durable Human Model snapshot
  → deterministic Core Resolver
  → ephemeral ResolvedHumanModelView
  → bounded IDR Context Admission
  → existing ContextCompiler / Context Snapshot
  → same primary Model request
```

### 15.3 权限和隐私边界

- IDR 只能产生 non-authoritative Individualized Direction；
- current instruction、Reality、Work Scope、Governance 和 Verification 优先；
- Model 只能 propose acquisition，deterministic Harness 决定 mutation；
- inferred Disposition 默认只是 Candidate，必须用户显式 activation；
- correction、disable、semantic erasure、reset 都检查 expected Human Model revision；
- secret、credential 和 secret-derived material 永不保存，也不生成 hash/prefix/last4/fingerprint；
- 当前没有 IDR UI、vector memory、cloud sync、multi-profile 或 enterprise identity。

## 16. Field Reality、Capture 与历史兼容能力

Fielora 仍保留早期 Field/Reality 模型及 Core API：

- Field focus 与 mode；
- State：Fact、Decision、Assumption、Question、Task、Blocker、Result；
- revise、transition、supersede；
- Reference 与 source relation；
- Activity ledger；
- Surface snapshot 与 Resume continuation；
- Capture/Inbox 的 create、attach、promote、archive、restore。

当前产品路线不再让它们压过 Project/Conversation。Fields 页面代码和持久能力仍在，但不在当前 Primary Navigation；Quick Capture/Inbox 也属于保留的次级能力，当前发现性和产品整合不等同于 Project 主线。

## 17. Fielora Glass 设计系统

Fielora Glass 是唯一 Theme identity；System、Light、Dark 只是同一设计语言的 appearance。

### 17.1 五层 Surface

| Surface | 用途 |
| --- | --- |
| Canvas | 应用最底层画布 |
| Content | Conversation、Settings、File、Diff、Terminal 等持续阅读面 |
| Chrome | Navigation、Toolbar、Tabs、Dock Header |
| Floating | Composer、浮动搜索、临时控制 |
| Overlay | Menu、Popover、Dialog、Lightbox |

Content 保持高可读和近实色；Glass 主要表达 Chrome/Floating/Overlay 层次。Remote WebContents 不注入 Fielora CSS。

### 17.2 当前视觉和交互规则

- 唯一品牌源为 `apps/desktop/assets/fielora-brand-mark.svg`；
- 左导航与 Desktop 顶栏共用一张低饱和 lavender/pink Brand Chrome canvas；
- Conversation、Settings Content、Right Dock 和外部网页保持 neutral surface；
- 产品图标统一通过 Phosphor `AppIcon` registry；
- 不使用原生 `prompt/confirm/alert/select` 作为产品控件；
- 布局、字体、控件、材质和 legacy CSS 有明确 Cascade ownership；
- Reduced Motion 服从系统；
- 现有 App Shell、Navigation、Conversation、Dock、Terminal 和 Settings 结构已锁定，结构变化需要用户预先授权。

### 17.3 用户 Override

Settings 可在唯一 Fielora Theme 上调整：

- Sidebar background：default / solid / gradient；
- Workspace background：default / solid / gradient；
- UI font family + size；
- Code font family + size；
- neutral Surface contrast；
- Primary Action base color。

Override 只作用于批准的 semantic tokens，不允许脚本、CSS selector、网络、文件、credential、Tool 或 Runtime capability。

## 18. 持久化与 schema 演进

当前 migration 轨迹：

| Schema | 主要内容 |
| --- | --- |
| 1–2 | Core Field / Reality foundation |
| 4 | Provider、Capture、Entry Intent 等 Phase 04 foundation |
| 5 | Project/Conversation Desktop Foundation |
| 6 | AgentRun、Events、ToolCalls、Approvals、Context、Verification |
| 7 | Library、Storage Profile、Portable/Sync foundation |
| 8–11 | Durable Artifact、type extensibility、PNG Asset、archive state |
| 12 | IDR V2 Human Model |
| 13 | Rich Result typed references |
| 14 | Durable Screenshot Evidence |
| 15 | Durable actionable File Mutation Artifact |

原则：

- SQLite 由 Rust `StorageWorker` 单独持有 connection；
- migration 内嵌并校验 checksum；
- UI localStorage 只保存 appearance/layout 等非核心偏好；
- 核心 truth 不放在 Renderer localStorage；
- binary/blob 使用 content-addressed storage，并与 durable identity 分离；
- 大输出只保存 bounded ref/hash/metadata，不把 secret 或无限正文写进 ledger。

## 19. 安全与信任模型

### 19.1 Trusted / Untrusted

- 唯一 production trusted app origin：`fielora://app`；
- dev 仅接受当次精确 Forge loopback origin；
- Remote/Local Browse Page 都是 untrusted WebContents；
- Project 文件、Web 内容和 Artifact semantic content 进入 Model 时都带 untrusted authority 标记；
- Renderer 的展示状态不能伪造 Core 执行成功或 Verification。

### 19.2 Action classes

Tool effect 当前分为：

- `OBSERVE`；
- `WORKSPACE_WRITE`；
- `PROCESS`；
- `NETWORK`；
- `DESTRUCTIVE`。

至少区分 read、local write、external send、destructive action、credentials、permission elevation。高风险边界不确定时必须 fail closed，并显示 `DENIED / BLOCKED / UNKNOWN / NOT_SUPPORTED`，而不是伪成功。

### 19.3 核心防护

- Project root realpath containment；
- symlink/reparse escape 防护；
- sensitive path/content guard；
- SHA-before-write 与 optimistic concurrency；
- typed argv、sanitized environment、process-tree cancellation；
- Approval nonce 与 replay protection；
- Provider secret redaction；
- Web SSRF、DNS/IP、redirect re-admission；
- Office ZIP/XML bomb、macro、external relationship 防护；
- PNG strict structure/decode limits；
- Tool receipt、workspace revision 与 verification freshness。

## 20. 当前明确未完成或受限的能力

### 20.1 Agent / Work

- 完整长期 Goal/Task/WorkScope 模型；
- 通用 durable background queue、成熟 checkpoint 选择和多 attempt history；
- 任意第三方调用内部的 preemptive suspension；
- 完整 Aegis 产品 integration；
- DXE Runtime；
- Personal Steward；
- 通用 Agent Browser profile/tools；
- 更广泛 cross-cutting Memory retrieval system。

### 20.2 Coding / Desktop

- 完整 IDE、LSP、debugger；
- true PTY；
- Git rebase/reset/force/amend 等高风险流程；
- installer/updater/code signing 的最终生产闭环；
- macOS/Linux 正式交付。

### 20.3 Web / Extensions

- web.download 的 composite permission model；
- remote MCP 与 OAuth；
- executable Plugin host、Marketplace；
- Browser History/Bookmarks/Profile/Sync/download manager；
- Chrome Extension full compatibility 或 Chromium Fork。

### 20.4 Artifact / Media

- Artifact 直接富编辑器、Presentation canvas、Spreadsheet formula/chart/pivot；
- OCR、图片理解、任意 Archive、音视频、CAD；
- broad image source asset formats 和 Asset GC；
- 自动/全页/窗口/桌面截图；
- Screenshot 作为 Verification authority。

### 20.5 Acceptance debt

- 多 Provider 的真实编程质量仍未全面认证；
- “凭据存在”不能写成 Provider 可用；
- Fielora Glass/最新 UI 仍需要最终用户 Visual Human Gate；
- 部分历史 Phase 04 Human/real-provider debt 继续作为质量记录保留；
- fixture、targeted unit 或 E2E PASS 不能冒充 live-provider、全产品或人工体验 PASS。

## 21. 后续路线

当前顺序由 [Rapid Desktop Execution](./RAPID_DESKTOP_EXECUTION_V0.1.md) 控制：

```text
Build A — Desktop Project + Multi-provider Chat        已实现
Build B — Codex-like Coding Loop                       已实现
Build C — Stable Long Tasks                            最小可靠闭环已实现，继续增强
Build D — Aegis Integration                            后续
Build E — DXE                                          后续
Build F — Personal Steward                             长期
```

未来 Agent 功能必须先回答：

1. 它属于 Model、Harness 还是 Tool？
2. 若属于 Harness，由八个域中的哪一个负责？
3. 它是 Harness Core 行为还是某个 Profile 行为？
4. 当前是否已有 owner？
5. 是否意外建立了第二套 Runtime、State、Permission、Evidence、Persistence 或 Provider-specific Agent Core？

只要第 5 项为“是”，设计就必须先修正。

## 22. 代码映射

| 职责 | 当前主要位置 |
| --- | --- |
| React Desktop UI | `apps/desktop/src/renderer/` |
| Electron Main / bridges | `apps/desktop/src/main.ts`、`preload.ts`、`channels.ts` |
| Browser backend | `apps/desktop/src/browser-runtime.ts`、`browser-policy.ts`、`browser-security.ts` |
| Workspace backend | `apps/desktop/src/workspace-runtime.ts` |
| Scheduled | `apps/desktop/src/scheduled-tasks.ts` |
| Shared contracts | `crates/fielora-contracts` |
| Agent primitives / ToolExecutor | `crates/fielora-agent` |
| Agent Harness composition | `crates/fielora-core/src/agent_runtime.rs` |
| Model adapters | `crates/fielora-model` |
| SQLite persistence | `crates/fielora-storage` |
| IDR storage | `crates/fielora-storage/src/idr.rs` |
| IDR Resolver/integration | `crates/fielora-core/src/idr_*.rs` |
| Platform adapters | `crates/fielora-platform` |
| Field/Reality domain | `crates/fielora-field` |
| Generated TypeScript contracts | `packages/contracts/generated` |
| Desktop E2E | `tests/e2e/` |
| Product/architecture facts | `docs/product/`、`docs/architecture/`、`docs/context/` |

## 23. 验证与交付原则

“代码修改成功”与“结果经过验证”必须分开记录。

日常验证按变更范围使用：

- `pnpm verify:dev:docs`；
- `pnpm verify:dev:ui`；
- `pnpm verify:dev:core`；
- `pnpm verify:dev:cross`；
- 进入 main 前运行 `pnpm verify:premerge`；
- packaging-sensitive 变更额外运行 targeted packaged smoke；
- 正式 Phase Gate 不被日常 Gate 替代。

当前仓库包含 contracts、Rust/TypeScript unit tests、Core integration、Desktop dev/package/fresh-directory E2E、Browser security E2E、Artifact/Result/Screenshot/File Artifact E2E 和各阶段 Evidence。任何结论都必须标明是 unit、fixture、targeted、premerge、packaged、portable、live-provider 还是 Human Gate。

## 24. Canonical 事实来源

当本文与更新后的具体合同或最新用户决定冲突时，按仓库规则使用更新的事实源：

1. 最新明确用户决定；
2. [`docs/context/02_PROJECT_REALITY.md`](../context/02_PROJECT_REALITY.md)；
3. [`docs/context/03_DECISIONS.md`](../context/03_DECISIONS.md)；
4. [`FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md`](../architecture/FIELORA_V0.1_AGENT_ARCHITECTURE_SPEC.md)；
5. [`TECHNICAL_BASELINE_V0.1.md`](../architecture/TECHNICAL_BASELINE_V0.1.md)；
6. [`FIELORA_DESIGN_LANGUAGE_V0.1.md`](./FIELORA_DESIGN_LANGUAGE_V0.1.md)；
7. [`FIELORA_UI_UX_SYSTEM_V0.1.md`](../architecture/FIELORA_UI_UX_SYSTEM_V0.1.md)；
8. 受影响的代码、migration、tests 与 Evidence。

本文是当前全局阅读入口，不替代上述精确 Contract、Migration、Security、Provider、Artifact 或 IDR 文档。
