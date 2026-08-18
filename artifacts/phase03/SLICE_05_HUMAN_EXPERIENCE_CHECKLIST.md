# Phase 03 Slice 05 — Desktop Experience Human Gate

状态：`HUMAN EXPERIENCE GATE PASS / ACCEPTED`

本清单只验证 Browse Foundation 能否长期作为真实 Browser Host 使用。它不授权或验收下载管理、历史、书签、Profile/Sync、扩展、AI Sidebar、Agent Browse 或任何 Field/Capture 能力。

## 1. 开始条件

- 使用当前 `codex/phase-03-browse-foundation` 工作树运行 `pnpm dev`；
- Electron 窗口由当前 fresh development build 启动；
- 测试前无需清空 Browse session；登录态跨 Page 保持正是本 Slice 的验证内容之一；
- 不在本清单中输入不愿用于测试的真实密码或敏感数据。

## 2. 真实网站体验矩阵

首次人工体验确认的窄窗真实网站呈现、Clipboard、网页上下文菜单与 loading feedback 阻断均已修复并经过多轮人工复验。用户于 2026-08-16 最终裁决“Phase 3 先完结”，构成 Slice 05 Human Experience Gate 与 Phase 03 Final Acceptance 的通过裁决。

### A. 普通文本网站

- 从 Omnibox 输入一个公开 HTTPS 文本网站；
- 确认正文可见、文本选择与链接点击正常；
- Back / Forward / Reload 正常，地址和标题同步。

结果：`PASS（最终整体裁决）`

### B. 复杂 JavaScript 网站

- 打开一个真实的搜索、视频门户或其他复杂 JS 网站；
- 完成搜索或一次明显的客户端交互；
- 确认异步内容能出现，页面没有停留在空白或不可操作状态；
- 若页面使用 `target=_blank` / `window.open()`，目标进入新的受控 Browse Page，而不是静默失效或打开 Electron native window。

结果：`PASS（最终整体裁决）`

### C. 登录页与 session

- 打开一个用户自行选择且允许测试的真实登录页；
- 确认账号/密码输入框、键盘操作与提交按钮可用；
- 若实际登录，确认 Reload 后登录态仍在；
- 从同站点打开第二个 Browse Page，确认正常共享该 Browser session；
- 不要求兼容依赖 native popup opener 通信的所有 OAuth 供应商，也不因此增加 privileged bridge。

结果：`PASS（最终整体裁决）`

### D. 长页面

- 打开一篇足够长的真实文章或信息流；
- 连续滚动到中部和底部，再返回顶部；
- Resize Fielora 窗口后继续滚动，页面不能留白、溢出或遮挡导航/地址栏。

结果：`PASS（最终整体裁决）`

### D2. 窄窗 viewport 对照

- 把 Fielora 调到接近最小窗口，记录网页区域本身的宽度；
- 把同一网站放入 Chrome，并把 Chrome DevTools viewport 调成相同 CSS 宽度后对比；不要比较两个应用相同外窗宽度，因为 Fielora 的产品导航会占用一部分宽度；
- 页面不应出现额外 zoom、DPR 错位、截断或错误响应式档位；
- Fielora 左侧 Browse shell 在窄窗应收敛为紧凑图标/导航，不应继续占 210px。

结果：`PASS`（自动证据确认 zoom=1、DPR 一致、remote CSS viewport=native bounds；相同 viewport 人工对照确认测试站点提示为站点自有行为）

2026-08-16 补充对照：本地测试站点在独立浏览器 991×590 CSS viewport 下得到 `innerWidth=991`、`visualViewport.scale=1`、DPR 1.25，基础登录布局与 Fielora 一致。截图中的全宽红色提示来自站点 `.system-notice` 自身的 fixed/100%-width/30px 样式，不列为 Fielora viewport Blocker；仍建议用其他真实网站完成最终窄窗抽查。

### D3. Clipboard 与网页上下文菜单

- 选中真实网页文字，使用 Ctrl+C 并粘贴到可编辑输入；
- 在选择文字、链接、网页输入框与图片上分别右键；
- 菜单内容应随上下文出现，复制/剪切/粘贴/全选、复制链接、打开链接及基础导航调用 Chromium 原生能力；
- 菜单底部提供 Chromium DevTools 的“检查”，并定位到用户右键位置的真实网页元素；
- 被安全 Policy 拒绝的链接不得通过右键菜单绕过限制。
- 在 Omnibox 右键，确认 undo/redo/cut/copy/paste/select-all 原生编辑菜单出现；
- 在 Page 标签右键，确认 reload/copy URL/close 原生菜单出现；
- 已加载且提供 favicon 的网站应在标签显示真实图标；无 favicon 时显示通用 globe，不猜测网站品牌。

结果：`PASS（最终整体裁决）`

### D4. Loading feedback

- 打开一个响应较慢的真实页面，确认首次导航期间有清晰但克制的加载反馈；
- Reload 同一页面，确认反馈出现并在完成或失败后消失；
- 切换 Page 后只显示 active Page 的 loading 状态。
- Reload 工具栏按钮保持静态；加载反馈位于 Page favicon slot 与页面顶部细进度线。

结果：`PASS（最终整体裁决）`

### E. 多 Page 与状态保持

- 至少保留两个已加载 Page；
- 在 Page 间往返切换，确认各自 URL、title、滚动/输入状态合理保持；
- 关闭其中一个 Page，剩余 Page 继续可见可操作；
- 关闭到 0 Page 后，直接从 Omnibox 输入地址重新创建第一个 Page。

结果：`PASS（最终整体裁决）`

### F. Browse / Field 边界回归

- 从 Browse 进入 Fields 和一个既有 Field，再回到 Browse；
- 原 Page collection 与登录/页面状态仍在；
- Browse 行为没有创建 Field、改变 Field focus/revision 或覆盖 Field Reality / Resume。

结果：`PASS（最终整体裁决）`

## 3. Slice 04 安全抽查

- 用户从 Omnibox 明确输入一个本地 `file://` 地址时，Local Page 可打开；
- Local Page 不获得 Node、preload 或 Fielora app bridge；
- 输入 `fielora://app/index.html` 时只显示稳定产品提示，不显示 Electron/IPC 原始异常；
- Remote Page 不能通过 navigation/window-open/iframe/fetch 访问本地文件；该项以自动对抗 Gate 为主，不要求用户在真实网站注入攻击脚本。

结果：`PASS（最终整体裁决）`

## 4. 自动化辅助证据

稳定 fixture 只作为防回归辅助，不替代上述真实网站体验。Browse Desktop E2E 覆盖：

- fresh `.webpack` build 与 fresh Electron Main launch；
- Remote/Local Page 可见与交互；
- 异步 JS hydration、登录表单 POST、303 redirect、HttpOnly session cookie、Reload 后 session 保持；
- 同 session 的第二 Browse Page；
- 长页面滚动、window-open、Back/Forward/Reload、多 Page 切换与关闭；
- Browse / Field Reality 不变；
- initiator-aware Remote→file 与 Loose Browse→`fielora://app` 拒绝。
- 900×620 窄窗口下 remote CSS viewport 与 native View bounds、visual scale、Shell/Remote DPR 及响应式单列渲染像素；
- Chromium 键盘 Ctrl+C→Ctrl+V 的真实网页结果、原生 `context-menu` 事件；
- 慢响应页面首次导航与 Reload 时 loading feedback 的出现和消失。
- favicon 经 Main 数据化后在 trusted Page strip 显示；地址栏与 Page 标签分别触发原生上下文菜单。
- 网页原生上下文菜单暴露真实 DevTools 元素检查入口。

最终自动结果：`pnpm verify:phase03` PASS；TS 25/25、Rust 19/19、Core Integration 4/4，Phase 02 与 Phase 03 Browse E2E 在 dev、packaged、fresh-directory portable 宿主全部 PASS。窄窗渲染证据为 `artifacts/phase03/slice05-narrow-runtime.png`。

## 5. 人工裁决

```text
PHASE_03_SLICE_05_IMPLEMENTATION: EXISTS
PHASE_03_SLICE_05_AUTOMATED_REPAIR_GATE: PASS
PHASE_03_SLICE_05_HUMAN_EXPERIENCE_GATE: PASS
PHASE_03_FINAL_ACCEPTANCE: GRANTED
PHASE_03_COMPLETE: YES
```

最终 PASS 来自用户在真实 Electron 桌面体验后的明确整体裁决；自动 Gate 只提供工程与交付证据，没有代替该裁决。
