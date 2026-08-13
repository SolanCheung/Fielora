# Fielora Rejected / Deferred

## A. 明确否决

### R-001 永久 AI Sidebar
同质化、占屏，并与“随叫随走”的 AI 系统能力冲突。

### R-002 Field = Tab Group / Workspace
无法形成持续工作状态，也容易与现有 AI Browser Task/Workspace 同质化。

### R-003 任意 Generative UI
不稳定、难测试、体验不可控。替代：固定 Surface Primitive + DXE 编排。

### R-004 所有内部 State / Graph 永久展示
内部重要不代表用户需要常看。

### R-005 重做 Blender / CAD / 专业视频 / DAW 等
已有成熟工程产品，不符合 Fielora 核心价值。

### R-006 从零重新发明完整 IDE
成熟 Editor / LSP / Git / Terminal 基础已有验证。应调研后按 Fielora 重设计，不复制源码。

### R-007 V0.1 Local LLM
GPU / Runtime / Model Management 会抢占核心产品验证资源。

### R-008 V0.1 直接 Fork Chromium
工程量过大，容易长期陷入 Browser 基础设施。

### R-009 Leisure Productivity Dashboard
降低生活体验，违背提升生活质量的目标。

### R-010 用 V0.1 Chrome Extension compatibility 目标推动 Chromium Fork
完整兼容不属于 V0.1 验收；future compatibility target 不能成为提前进入 Chromium 大工程的理由。

### R-011 核心架构绑定 Windows-specific 假设
Windows 11 x64 只是 V0.1 唯一正式验收平台。Core、Field Model、UI、Agent、Provider、Capability Contract 不得把 Windows 当作永久业务前提，OS-specific 能力必须进入 Platform Adapter。

### R-012 Field Object identity 等同本地文件路径
本地路径是设备绑定信息，不是跨平台、跨设备稳定对象身份。

### R-013 V0.1 扩张为完整 Exchange / IM / 共享 Field
长期 Exchange 方向只允许在 V0.1 预留模型语义，不得借此扩大首版 UI、账号体系、网络服务或自动协作范围。

### R-014 在当前非 Git Context Pack 目录擅自初始化仓库
不得用 `git init` 把上下文包冒充为真正项目仓库。进入实现前应确认真实 Fielora Repo，并把上下文放入该 Repo。

### R-015 在 Local Worktree 未确认前开始实现
Remote Repo 已确认为空，不等于本地工作目录已经确认。`LOCAL_WORKTREE_NOT_CONFIRMED` 关闭前不得编码、安装依赖、初始化技术栈或把当前 Context Pack 擅自变成仓库。

该 Gate 已于 2026-08-13 由用户确认 `F:\项目\Fielora` 为 canonical Local Worktree 后关闭。关闭 Repo Gate 不等于授权 Phase 01 产品实现。

### R-016 把任意本地或远程页面当作 trusted App origin
禁止用 wildcard localhost/127.0.0.1、任意端口、`file://` 或远程 origin 获得 Fielora bridge。Production 只信任 `fielora://app`；dev 只信任当次精确 Forge loopback origin；Browse/remote content 永远是不受信任边界。

### R-017 Parent 消失后保留 Rust Sidecar orphan
Parent-pipe EOF 是权威退出信号。Core 不能因缺少显式 `system.shutdown` 而继续运行，也不能自行承担 restart ownership。

## B. 延后但保留

- F-001：更深 Chromium Integration / Fork；Electron 成为关键阻塞后再评估。
- F-002：Local LLM；以后作为 Provider 增量加入。
- F-003：Fielora App Runtime；长期方向，当前服务工作连续性。
- F-004：专业软件深度 MCP / Plugin 自动化；V0.1 先定义 Connector Interface。
- F-005：Creative Field 深化；不在 V0.1 重做完整编辑器。
- F-006：Personal Steward / Butler；必须从真实长期状态成长。
- F-007：Capability Compiler 全自动化；V0.1 不假设任意网站/软件都能可靠自动学习。
- F-008：Agent / Capability / App Marketplace。
- F-009：Multi-Agent Society。
- F-010：完整 Chrome Extension compatibility；只保留 future compatibility target，出现真实核心阻塞后再评估。
- F-011：macOS / Linux 正式交付与验收；V0.1 先保证架构可移植，唯一正式验收平台仍为 Windows 11 x64。
- F-012：跨设备 Field Continuity；V0.1 只完成 identity / Device Binding 的模型边界。
- F-013：Fielora Exchange 的完整通信、IM、共享 Field、Field Invite 交付与 Steward-to-Steward 自动协作；V0.1 只预留核心模型语义。
