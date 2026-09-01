# Fielora UI/UX System V0.1

状态：`CURRENT / CANONICAL / CHANGE-SYNCHRONIZED`

产品视觉语言由 `docs/product/FIELORA_DESIGN_LANGUAGE_V0.1.md` 定义；本文定义 Desktop Renderer 如何实现、约束和演进该语言。任何受管理 UI/UX 系统文件的变化，必须在同一 changeset 更新本文。`pnpm verify:ui-ux` 强制检查这一规则。

## 1. 当前布局基线（锁定）

材质、字体、图标和控件优化不得改变以下 ownership：

```text
DesktopChrome
├─ Window Chrome（系统菜单与窗口按钮，共用一个 Chrome plane）
└─ Desktop Work Area
   ├─ Active Route
   │  ├─ Project Workspace
   │  │  ├─ Project Navigation
   │  │  ├─ Conversation Content
   │  │  └─ Right Workspace Dock（按需）
   │  ├─ Browse
   │  └─ Settings
   │     ├─ Settings Navigation
   │     └─ Settings Content
   ├─ Utility Workspace（按需）
   └─ Bottom Terminal（按需）
```

- Conversation 与 Right Workspace Dock 是同一个连续 `Content` 背景上的两个工作视图，不建立两套页面底板。
- Conversation 与 Settings 的 Content pane 只在左上角使用独立的 `--fl-radius-work-surface`（Standard 为 `24px`）接入 Chrome；它不是独立卡片，其他边保持连续。
- Window Chrome、Project Navigation 与 Settings Navigation 解析为同一个 `--fl-color-app` Chrome plane，不得因半透明 recipe 形成多条色带。
- Settings 内容区复用同一 `Content` 背景；导航使用 `Chrome`/Navigation 语义。
- Bottom Terminal 是工作区底层，不进入左侧导航，也不成为第四列。
- Composer 浮在完整 Conversation viewport 上；滚动区延伸至 Pane 底部并通过 bottom padding 避让。
- Workspace/Navigation/Dock/Terminal 的 resizer、窄窗口 overlay 行为和所有权保持现状。材质 changeset 不得改 DOM ownership、grid topology 或 Pane routing。

Canonical geometry 位于 `styles/layout.css`；真实页面结构由 `WorkspaceSurface`、`ProjectWorkspace`、`RightWorkspaceDock` 和 `DesktopChrome` 持有。

Workbench 比例同样属于锁定布局，不属于材质：Project/Settings Navigation 默认 `304px`、允许在 `220–560px` 内调整并共享宽度偏好；Right Workspace Dock 默认 `635px`、最小 `360px`；Conversation Pane 最小 `340px`，reading column 为 `920px`，Composer 为 `920px`。Navigation 收起时必须释放整个导航列与 resizer，Conversation 或 Settings Content 原地扩展占用可用 Work Area。Settings 与 Conversation 复用同一 `WorkspaceSurface` 和 Content frame，Settings 不显示 Project 工具按钮，Settings Content 自身纵向滚动。Dock 不使用截图像素形成固定上限：可用上限始终为当前 Project Work Area 扣除实际 Navigation、Conversation 最小宽度与 resizer 后的剩余宽度。用户拖动得到的偏好宽度独立持久化；窗口缩小时仅临时 clamp，窗口再次放大时恢复该偏好宽度。历史版本持久化的极窄值在读取时恢复为当前默认比例。窄窗口策略与 Pane ownership 不变。Conversation 与 Right Workspace Dock 之间始终保留可发现但低对比的 `1px` neutral divider；拖动命中区可以更宽，但不得表现成厚边框。Project Navigation 与 Conversation 之间的 resizer 默认不可见，hover 只显示极轻 neutral edge，dragging 才适度增强；其命中宽度不得随视觉线宽变化。拖动开始时一次性缓存 Work Area、Navigation 和动态 max，pointer move 每帧只更新宽度 CSS variable，结束时才提交 React state 与持久化；Browser native view 的 bounds 同步必须 latest-only 合并，纯几何变化不得反复回写 Browser React state。

## 2. Cascade Ownership

Renderer 只从 `styles/index.css` 加载样式。Cascade 顺序是稳定 API：

```text
reset
→ tokens
→ legacy
→ foundation
→ features
→ layout
→ typography
→ components
→ materials
→ utilities
→ overrides
```

- `tokens.css`：唯一 design value source；允许 Light/Dark 的 token 值。
- `styles.css`：只读式 legacy compatibility layer；不得增加新跨页面视觉规则，其 raw-color budget 只能下降。
- `foundation.css`：reset、focus、scrollbar、系统 motion。
- `appearance.css`：现有 feature presentation，不能拥有 shared control 或 material recipe。
- `layout.css`：锁定 Pane ownership、Workbench 比例、连续工作面与 viewport/composer 关系；Feature/Material 层不得声明 Composer 宽度、Pane grid 或持久化宽度边界。
- `typography.css`：字体栈和有限 type roles。
- `controls.css`：Button、Menu、Select、Tabs、Dialog、IconButton/ToolbarAction 与受控 Tooltip。
- `materials.css`：五种 semantic surface 的唯一 paint resolver 和 Solid fallback。

禁止通过 selector specificity、加载顺序偶然性或 `!important` 穿透上层 ownership。仅 reduced-motion 系统兜底允许 `!important`。

## 3. Typography Roles

Sans：`Segoe UI Variable → Segoe UI → Microsoft YaHei UI → sans-serif`。

Mono：`Cascadia Code → Consolas → monospace`。

只使用五个产品角色：

| Role | Size / Weight / Line height | 用途 |
|---|---|---|
| Title | 17 / 600 / 1.3 | Conversation、Result、Dialog 标题 |
| Section | 13 / 500 / 1.4 | 小节和导航分组 |
| Body | 15 / 400 / 1.7 | Conversation、Markdown、说明正文 |
| Label | 14 / 500 / 1.35 | Button、Menu、Select、Tabs |
| Meta | 13 / 400 / 1.45 | 路径、时间、Evidence、Toolbar metadata |

代码、Diff、Terminal 只使用 Mono。新组件不得添加独立 `font-family`，不得新增未进入 role contract 的字号或 700/800 重字重。

## 4. Icon System

- 产品图标只通过 `ui/Icon.tsx` 的 `<AppIcon>` 使用 `@phosphor-icons/react`。
- 尺寸只使用 14 / 16 / 18px；默认 regular weight，状态由 `currentColor` 与父控件 semantic token 表达。
- Phosphor 组件独占 glyph 的 `fill` / `stroke` / `stroke-width` / `weight`；CSS 只管理 optical box、`currentColor`、布局和交互状态。禁止把 `<AppIcon>`、Composer、Select 或文件图标重新套入旧手绘 SVG 的 `fill:none + stroke` 规则，否则填充式 glyph 会被抹除并错误呈现为禁用态。
- 可操作图标默认必须达到 secondary icon contrast；只有真实 `disabled` 控件允许通过控件级 opacity 降权，不能在 glyph 本身设置低透明度模拟 disabled。
- 文件类型通过 `ui/FileTypeIcon.tsx` 使用同一 Phosphor family 和集中 file-type color tokens。
- `工作对象` 使用 Icon Registry 中独立的 `objects → Shapes` 语义入口；不得借用表示“新建文件”的 `filePlus`，Tab、工具入口与空状态必须一致。
- 禁止组件内手绘 SVG、Unicode glyph、emoji 图标、局部 icon registry 或 CSS 伪元素画图标。
- 例外只有真实外部应用的本机 icon、站点 favicon 和用户内容媒体；它们不是 Fielora 产品 glyph。
- Webpack 必须固定 React/ReactDOM singleton。Phosphor 等 hook-based shared UI dependency 不得解析第二份 React，否则 packaged Renderer 会发生 Invalid Hook Call 并空白启动。

## 5. Shared Interaction Primitives

`UiPrimitives.tsx` 是共享交互入口：

- `Button`
- `IconButton`
- `ToolbarAction`
- `Tooltip` / `TooltipButton`（由 `IconButton` / `ToolbarAction` / Sidebar 项统一托管并通过 Portal 绘制）
- `Menu` / `MenuItem`
- `SelectMenu`
- `TabStrip` / `Tab`
- `TextActionDialog`

Button/Menu/Select/Tabs 共用 geometry、type roles、hover、active、focus-visible、disabled、keyboard 和 reduced-motion。Feature 可以添加布局 class，但不得复制一套控件状态。原生 `alert` / `confirm` / `prompt` / 产品级原生 `select` 不进入 Renderer。

权限 Select 的常驻触发器保持无边框、透明底的轻量控件；常规高度 `30px`，窄 Composer 仅保留 `30px` 图标槽。三种权限统一使用 Phosphor 语义图标：请求批准为 `HandPalm`、帮我批准为 `ChatCircleDots`、完全访问为 `WarningOctagon`；图标槽必须透明，不增加独立底板。选项文案固定为“请求批准 / 编辑外部文件和使用互联网时始终询问”“帮我批准 / 仅对检测到的风险操作请求批准”“完全访问权限 / 可不受限制地访问互联网和你电脑上的任何文件”；Composer 中第三项只显示紧凑标签“完全访问”。`FULL_CONTROL` 只以 warning icon/text/check signal 表达风险，选中行保持透明底，不改变 Composer 底板或制造大面积状态色。菜单宽度上限 `440px`，确保三条说明在标准桌面窗口中完整单行显示，单项最小高度 `50px`；菜单中的同一选项复用相同 warning token，并从触发器上方以 motion token 定义的轻量位移/透明度过渡进入。

共享 `IconButton` / `ToolbarAction` 禁止使用浏览器原生 `title` 提示。Hover 或键盘 Focus 统一显示 Portal 承载的深色轻量 Tooltip：白色 Caption 文本、约 `7px` 圆角、`8px` 锚点间距，并在窗口边缘自动 clamp；顶栏 Tooltip 必须避开原生窗口按钮所在的 Chrome 区域。Tooltip 必须位于 App Shell overflow 之外，不得被 Conversation 或 Workspace Pane 裁切。Escape、Pointer leave 与 Blur 必须关闭，`prefers-reduced-motion` 下仅保留即时可见性变化。Sidebar 的 Project / Conversation 项使用同一受控 Tooltip 的轻量 Card variant，补充标题、Project、时间或本地路径；不得依赖浏览器原生 `title`，阴影统一使用 Floating token。

Project 下的 Conversation 只通过缩进表达层级，不绘制持续的树形竖线；项目标题再次点击仍负责展开/收起，且 hover preview 不改变选择或折叠行为。

Conversation Composer 在空对话、历史对话和运行中使用同一底部锚点；空状态不得把 Composer 重定位到内容中央。发送/追加按钮固定为 `36px` 圆形，使用 `17px` 粗体 ArrowUp；可用态使用 Fielora emphasis purple 与白色 glyph，禁用态只降低语义对比而不改变轮廓，hover/press 动效必须复用 control motion token。

## 6. Material Contract

Fielora Glass 是唯一官方语言。组件只声明：

```text
Canvas / Content / Chrome / Floating / Overlay
```

`materials.css` 统一决定 background、edge、shadow、blur 和 fallback。Content 近实色；Chrome、Floating、Overlay 才允许受控 translucent material。System/Light/Dark 是 appearance，不是不同布局或组件体系。Solid 仅为同 DOM 的能力 fallback。

所有工作区正文区域使用同一个 `Content` 基础背景。材质变化不得增加 Pane 间实色割裂、重复标题栏、大面积状态色、装饰性 gradient card 或重阴影。

Conversation Header 不常驻 Project 打开方式控件；Project 外部打开器只属于 File/Resource toolbar。Right Workspace Dock 中的工作对象与 Browser viewer 均使用标准白色 `Content` plane。嵌入 Right Workspace Dock 的 Browser Page 必须直接使用 Dock 顶部的共享 Tab Strip，不得在内容区重复绘制第二层 Page Strip；其内部固定为 `Address Toolbar → Viewport` 两行，自上而下占满动态 Dock。独立 Browse Route 可以保留自己的 Page Strip。共享 Page Tab / Address Toolbar 分别为约 `32px / 44px`，地址框为 `34px`，导航与更多操作为 `30px`；空状态使用中性的 Browser glyph、`开始浏览` 与一行说明，不形成 Landing Page 式大标题。

## 7. Change Protocol（强制）

任何修改下列路径的 changeset，必须同步更新本文的对应 contract、mapping、例外或验证方式：

```text
apps/desktop/src/renderer/styles.css
apps/desktop/src/renderer/styles/**
apps/desktop/src/renderer/ui/**
apps/desktop/src/renderer/UiPrimitives.tsx
apps/desktop/src/renderer/WorkspaceSurface.tsx
apps/desktop/src/renderer/ResizableDivider.tsx
apps/desktop/webpack.renderer.ts
```

顺序固定：

1. 说明现有 Layout ownership 是否保持；
2. 更新 token/type/icon/primitive contract；
3. 在正确 Cascade Layer 实现；
4. 删除被替代的 legacy override，不增加新的全局方言；
5. 更新本文；
6. 只运行受影响的静态、TypeScript、Desktop/packaged smoke 和必要视觉验收。

`scripts/check-ui-ux-doc-sync.mjs` 会拒绝“改样式但未改本文”的 changeset。产品视觉原则变化时还必须同步更新 `docs/product/FIELORA_DESIGN_LANGUAGE_V0.1.md`；重大布局/ownership 决策同步更新 Project Reality 与 Decisions。

## 8. Visual Golden Metrics

`FIELORA VISUAL GOLDEN CALIBRATION` 以 `1600 × 816`、100% UI scale 的当前 Codex Desktop 截图为人工参考。数值只约束视觉参数，不改变 App Shell、Pane topology、Dock/Overlay 语义或行为。

| Metric | Codex reference（截图估算） | Fielora canonical |
|---|---:|---:|
| Sidebar width | ≈304px | 304px |
| Top chrome height | ≈44px | 44px |
| Navigation row | ≈38px | 38px |
| Conversation row | ≈36px | 36px |
| Icon glyph / optical slot | 16px / ≈24px | 16px / 24px |
| Icon / text gap | ≈12–14px | 12px |
| UI / Meta / Title / Body | 14 / 13 / 17 / 15px | 14 / 13 / 17 / 15px |
| Composer width / compact height | ≈920px / ≈100px | 920px / ≈100px |
| Composer bottom offset | ≈12px | 12px |
| Permission trigger / menu width | 30px compact / ≈440px | 30px compact / 440px max |
| Send button / glyph | 36px / 17px | 36px / 17px |
| Browser Page Tab / Address Toolbar | ≈32px / ≈44px | 共享 Dock Tab 32px / 44px |
| Browser address / action control | ≈34px / ≈30px | 34px / 30px |
| Toolbar control | ≈30–34px | 30–34px |
| Selected row radius | ≈8px | 8px |
| Main readable width | ≈920px | 920px |
| Right Workspace Dock default | ≈635px | 635px（不是 max） |
| Divider | ≈1px / 6–8% neutral | 1px / 6% neutral |

Light appearance 的文字/图标对比基线为：Primary `#181a1f`、Secondary `#343a43`、Muted `#717a87`、普通图标 `#505761`。亮紫色只用于菜单选中标记、Workspace 顶部 active Tab 与 Composer 发送/停止主操作；品牌标记可保留品牌紫。普通导航、展开状态、进度、文件、工具栏与焦点反馈均使用 Neutral，成功/警告/危险继续使用各自语义色。Project expanded 不是 selected；同一导航链只保留 Current Conversation 的 neutral selection。Composer 仍由 `Floating` material resolver 绘制，但使用低一级 surface shadow，减少独立 Card 感。

Conversation 顶部遵循单行 Header：项目文件夹图标 → 当前 Conversation 标题 → 更多操作。Project 名称、绝对路径或重复上下文不得作为第二行常驻标题。右上角 Workspace Dock 开关统一使用 Phosphor 右侧面板图标；不得以 Columns、手绘 SVG 或文本符号代替。

校准顺序固定为 Typography → Icon/contrast → Sidebar/selection → Composer/controls → Spacing/density。每次只比较相同窗口尺寸；若效果需要改变 DOM 或 ownership，必须报告 BLOCKED 而不是实现。

## 9. 当前验证基线

- Packaged Renderer 能挂载真实界面，React singleton contract 有静态回归测试。
- Design-system static tests 覆盖 cascade、type roles、Phosphor icon entry、glyph paint ownership、shared primitives、material ownership 和 legacy raw-color budget。
- Workspace packaged E2E 以 `data-file-kind` 验证真实 Phosphor file icon，不再依赖已删除的手绘 SVG tile path。
- Workspace E2E 验证 Navigation/Dock 使用 `304px / 635px` 默认比例；Dock 可持续向左扩展到动态可用上限，在 `1280 / 1440 / 1920` 窗口下实时 clamp，并在窗口重新放大后恢复用户偏好宽度。File / Browser / Terminal 视图占满 Dock 且不添加内部固定宽度上限。
- Workspace presentation tests 验证 Conversation Header 不再渲染 Project launcher、工作对象统一使用 `objects` 图标和白色 Content surface、嵌入式 Browser Page 直接复用 Dock Tab Strip，且 Address Toolbar / Viewport 流体占满剩余空间。
- Terminal 定向测试验证命令输入在 IPC 建立 run id 前仍接收首个真实事件，右侧与底部终端继续复用真实 Workspace Runtime；Terminal glyph 统一使用 Phosphor `Terminal`。
- Managed Tooltip 与 Workspace Content Viewer E2E 分别验证顶栏提示避开原生 Chrome，以及 Sidebar 无树形竖线、Project/Conversation hover card 使用真实标题、时间与路径。
- Visual Golden E2E 固定在 `1600 × 816`，记录并断言 Typography、Icon、Sidebar、Selection、Composer、Toolbar、Dock、Divider 与无横向溢出；只生成 Sidebar + Conversation、Conversation + Composer、Workspace open、Settings 四张证据。
- 只对本轮触达的 packaged UI 路径运行最小 E2E；不以无关 Agent/Provider/Rust 全量 Gate 代替 UI 验证。
- Visual Human Gate 仍决定最终材质质量；自动测试只证明结构、契约和可运行性。

## 10. UI/UX 结构硬锁

`STRUCTURAL_CHANGE_REQUIRES_USER_APPROVAL`

当前 Desktop App Shell、Primary Navigation、Conversation、Composer、Right Workspace Dock、Bottom Terminal、Settings shared frame 以及各 Route 的主要页面结构已经锁定。后续字体、图标、色彩、材质、阴影、动效、密度和整体视觉优化只能在现有 ownership 与 DOM topology 内校准，不得借“统一样式”或“重构”进行大幅结构调整。

以下任一变化都属于结构变化：改变 App Shell / Route composition；增删主要 Pane；改变 Navigation / Conversation / Workspace / Dock / Overlay 的归属关系；改变主要 grid/flex topology；迁移 Resizer ownership；改变 Composer 底部锚点、Conversation Header ownership、Settings shared frame 或 Bottom Terminal/Dock 语义。

遇到上述需求，Agent 必须在实现前暂停，说明变更原因、范围、受影响页面和兼容风险，并获得用户明确批准后才能继续。批准后的结构变化必须在同一 changeset 同步更新本文、`docs/product/FIELORA_DESIGN_LANGUAGE_V0.1.md`、Project Reality、Decisions 与相应回归测试；未获批准时只能提交保持现有结构的校准方案。
