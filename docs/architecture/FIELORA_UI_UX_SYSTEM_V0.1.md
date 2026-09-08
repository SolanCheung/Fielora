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
   │  ├─ Settings
   │  │  ├─ Settings Navigation
   │  │  └─ Settings Content
   │  └─ Scheduled
   │     ├─ Shared Project Navigation
   │     └─ Scheduled Content
   ├─ Utility Workspace（按需）
   └─ Bottom Terminal（按需）
```

- Conversation 与 Right Workspace Dock 是同一个连续 `Content` 背景上的两个工作视图，不建立两套页面底板。
- Settings 与 Scheduled 的 Content pane 使用 `--fl-radius-work-surface` 左上接入 Chrome；Conversation 使用更克制的 `--fl-radius-conversation-surface`（Standard `16px`，Small/Large `12px / 20px`）。其外层 shell 只在既有圆角切口处露出同一 Brand Chrome canvas，保证弧度真实可见而不向正文着色。Conversation 右上角保持直角，不随 Brand Chrome 调整。
- Window Chrome、Project Navigation 与 Settings Navigation 保持同一个连续 Chrome owner，并通过显式 `data-brand-chrome="top|navigation"` 消费可替换的 Brand Chrome token bundle。Light 使用一张跨整个 viewport 的低饱和近白薰衣草/雾粉画布，Navigation 以 `-44px` 纵向偏移续接顶栏；顶栏进入原生 Window Controls Overlay 前必须平滑收敛到当前 Sidebar solid/gradient 的右端色，并将同一 HEX 传给 native caption，主题切换和自定义色都不得产生竖向接缝。该作用域不得进入 Conversation、Settings Content、Right Workspace Dock、Right Dock Tab Strip、Utility Workspace 或 Overlay。
- Settings 与 Scheduled 内容区复用同一 `Content` 背景；Scheduled 直接复用 Project 的 Primary Navigation，二者均通过共享 `WorkspaceSurface` 持有相同宽度偏好与 resizer。
- Bottom Terminal 是工作区底层，不进入左侧导航，也不成为第四列。
- Composer 浮在完整 Conversation viewport 上；滚动区延伸至 Pane 底部并通过 bottom padding 避让。
- Workspace/Navigation/Dock/Terminal 的 resizer、窄窗口 overlay 行为和所有权保持现状。材质 changeset 不得改 DOM ownership、grid topology 或 Pane routing。

Canonical geometry 位于 `styles/layout.css`；真实页面结构由 `WorkspaceSurface`、`ProjectWorkspace`、`RightWorkspaceDock` 和 `DesktopChrome` 持有。

2026-09-07 Conversation 校准：用户明确要求整个对话内容区统一居中并增加左右留白。
用户消息、Assistant 正文、运行记录、Markdown 代码/表格、结果与变更列表共用 `1040px` reading rail；
Composer 与 queued follow-up 使用同一 rail 和 `clamp(28px, 5cqw, 56px)` 最小 gutter。
按用户最新桌面截图将普通窗口的内容再略向内收，宽窗 rail 上限仍为 1040px，窄栏保留至少 28px。
不再分别使用 680/700/720px 的内部宽度上限。文字保持左对齐，用户气泡仍在公共 rail 内靠右。
Conversation Header 保持原 ownership，左 inset 固定复用 Navigation 外边距与菜单内边距之和，
图标到标题的间距与菜单文字起点对齐，不再按宽窗 reading rail 向右缩进。Dock 关闭时为 window-right controls 预留至少 `144px`，
打开时为 Project 摘要按钮预留 `60px`，标题及更多操作不得进入该命中区域；摘要按钮位置跟随实际
Conversation 右边界，不能使用窄窗可能被压缩或裁切的 Dock 偏好宽度推算。
摘要 Portal host 在 DesktopChrome 内保持挂载，离开 Project 时隐藏；设置、资料库等页面返回后，
ProjectWorkspace 可立即找到既有 host，不能因两个组件更新路由的时序差异丢失摘要按钮。
既有 Composer/Queue 的 ResizeObserver 只更新当前 Pane 的遮挡高度变量，滚动尾部和回到底部按钮
随真实输入框高度避让；不改变浮动锚点、Pane topology 或 Runtime。

至少四个已展示的用户轮次且对话需要纵向滚动时，在 Conversation 左侧留白显示低对比短横线导航。
每条横线对应一个用户轮次，当前阅读轮次加深；悬停/键盘聚焦提示轮次与请求摘要，点击或 Enter
跳转至对应用户消息。支持上下方向键及 Home/End，在大量轮次时标记区独立滚动并保持当前项可见。
轮次列表随对话切换、新消息及排队消息状态更新；滚动、过程展开和输入框尺寸变化后重新定位。
导航避让输入框及排队区，不改变公共 reading rail，主动回看历史后沿用既有“回到最新”行为。

运行过程按真实事件顺序展示简短进展。工具组默认折叠为一行，可展开全部操作；每项操作可进一步
展开完整路径/行号/搜索词/命令、状态、结束时间和已有错误码。时间仅在操作详情显示，删除父组与子项
重叠 hover 提示。长段分析和包含代码块的过程说明默认显示 bounded 原文预览，点击展开完整 Markdown。
最终答案保持完整；结束后的“查看执行记录”使用同一套折叠组件，已记录的 Run failure code 同时映射为
直接可见的原因。此 presentation 不改变 Run 状态、预算、恢复或完成裁决。
历史 `fielora-project-file:` 标记只在匹配本 Run 成功 read_file 的路径和 SHA 回执后变成可打开的文件链接，
打开复用现有 Project file viewer 和 SHA guard；其他标记只显示标签，不直接导航自定义 URL。

Workbench 比例同样属于锁定布局，不属于材质：Project/Settings/Scheduled Navigation 默认 `304px`、允许在 `220–560px` 内调整并共享宽度偏好；Right Workspace Dock 默认 `635px`、最小 `360px`；Conversation Pane 最小 `340px`，reading column 为 `1040px`，Composer 为 `1040px`。应用初始窗口保持 `1180px` 宽，初始窗口高度等于允许的最小高度 `560px`；用户之后仍可正常调整窗口。Navigation 收起时必须释放整个导航列与 resizer，Conversation、Settings 或 Scheduled Content 原地扩展占用可用 Work Area。Settings、Scheduled 与 Conversation 复用同一 `WorkspaceSurface` 和 Content frame，Settings 不显示 Project 工具按钮，Settings 与 Scheduled Content 自身纵向滚动。Dock 不使用截图像素形成固定上限：可用上限始终为当前 Project Work Area 扣除实际 Navigation、Conversation 最小宽度与 resizer 后的剩余宽度。用户拖动得到的偏好宽度独立持久化；窗口缩小时仅临时 clamp，窗口再次放大时恢复该偏好宽度。历史版本持久化的极窄值在读取时恢复为当前默认比例。窄窗口策略与 Pane ownership 不变。Conversation 与 Right Workspace Dock 之间始终保留可发现但低对比的 `1px` neutral gray divider；它只消费 Light/Dark 对应的 `--fl-color-workspace-divider`，不得从 Brand Chrome、Accent 或用户 Action Color 混色。拖动命中区可以更宽，但视觉线及 hover/dragging 状态始终保持 `1px`，不得表现成厚边框。Project Navigation 与 Conversation 之间的 resizer 默认不可见，hover 只显示极轻 neutral edge，dragging 才适度增强；其命中宽度不得随视觉线宽变化。拖动开始时一次性缓存 Work Area、Navigation 和动态 max，pointer move 每帧只更新宽度 CSS variable，结束时才提交 React state 与持久化；Browser native view 的 bounds 同步必须 latest-only 合并，纯几何变化不得反复回写 Browser React state。

Right Workspace Dock 的“＋”只在至少存在一个标签时显示；零标签状态由 Dock 内的工具启动页提供入口，不重复显示空 Tab Strip 操作。关闭最后一个标签或手动收起 Dock 时，Conversation minimum、divider 与 Dock width 使用可插值 length track 在 `--fl-duration-panel` 内同步收起，Panel 内容同时淡出并向右移动；若用户启用 Reduced Motion，仍遵守全局无动画设置。

Right Workspace Dock 的扩展/恢复同样只能改变上述可插值 track：Conversation 连续收窄/恢复并淡出/淡入，Dock 在 `--fl-duration-panel` 内占满/退回用户偏好宽度，不得通过两套不兼容的 `grid-template-columns` 瞬切。直接拖动 Divider 时则关闭该 track transition；coalesced pointer samples 只取最新位置，并继续以 `requestAnimationFrame` 合并为每帧一次 CSS width 更新，结束时才提交 React state 与持久化。代码视图可以在拖动期间暂停重复 syntax paint，但必须保持原始代码文字可见并在释放后立即恢复。Reduced Motion 继续由全局设置即时关闭面板过渡。

2026-09-07 Divider 修复：普通分栏仍保留 Conversation `340px` minimum；继续向左越过动态分栏上限
`48px` 后进入既有 Dock focus，保留分栏宽度偏好。保持同次 pointer capture，回拉至上限外 `12px`
以内退出 focus，避免边界抖动；往右收起与反向恢复沿用既有行为。没有新增 Pane 或迁移 Resizer ownership。
面板几何只对解析后的 `grid-template-columns` 做一次插值，不再同时动画化输入 track。
点击展开/恢复期间由真实 transition run/end/cancel 暂停 syntax layer 的 layout/paint，textarea 保持同一代码文字，
结束或取消后立即恢复高亮；拖动同样跳过高亮子树排版。摘要控制位置只写入其自身 host，按像素去重，
不再每帧更新 body 的继承变量，也不对已按帧测量的位置再叠加 `right` transition。
语法 token 节点只在代码内容或语言改变时重建，单纯打开面板、调整宽度或切换 focus 不重新分词。
真实 Electron 回归需覆盖 compact 窗口代码文件、拖动进入/退出 focus、偏好恢复、动画中代码可见及结束后清理。

Tab Strip 的“＋”紧跟在 bounded tab lane 的右边，不得被拉伸到 window controls 前形成孤立按钮；点击后显示由 `document.body` Portal 承载的 fixed Tool Menu。该 Menu 使用触发器的 viewport bounds 定位，在窗口边缘自动翻转并保持至少 `8px` inset，不得受 Tab Strip、单标签 Browser host 或 Right Dock overflow 裁剪。通用 Workspace Tab 通过受控右键 Menu 提供重新加载、复制、重命名、关闭、关闭其他与关闭右侧标签；Browser Page 继续复用 Browser Runtime 的原生 Page context menu。Conversation branch 不属于 File/Tool Tab 语义，不得伪装成 Workspace Tab 操作。

全局 Summon、浮动 Summon 按钮、`Ctrl+Shift+Space`、右侧“侧边聊天”工具和 `Ctrl+Alt+S` 已从当前产品删除。右侧 Dock 的零标签启动页固定只提供审阅、PowerShell、浏览器和文件四个入口；“工作对象”不再作为常驻工具，与文件预览形成重复心智。Agent 新建的 Artifact 仍直接打开为独立 Tab，底层持久化、版本与上下文能力保持。模型交互由 Project Conversation / Agent 工作流拥有，Inbox 与模型服务设置继续作为独立 Surface 存在，不以隐藏入口保留第二套 Summon UI。

## 2. Cascade Ownership

2026-09-08 Large-directory drag correction: the 300-file trace did not cover the real Project's
2,759 rendered directory rows (including folders). The subsequent scrollbar review supersedes the width
hold completely during direct dragging: code, directory rows, filter and native scrollports stay responsive
on every pointer frame. Scrollbars remain on the pane edge and code wrapping/thumb size update before
release. Never hold the width of a scrollport or an ancestor that positions it.

Large directories use a flattened presentation of the same filtered/collapsed tree model. Above 200 files
or rows, only the viewport plus six rows of overscan on each side are mounted. Native scrolling uses spacer
heights computed from the full row count and a font-aware measured row height; no synthetic scrollbar is
introduced. Scroll/height changes update the window, while width-only ResizeObserver notifications never
trigger a tree state update. Small trees keep their nested presentation. Depth, ancestor guides, selection,
filter-path compression and directory state remain consistent; Home/End/Up/Down/Page keys navigate beyond
the mounted window and Left/Right collapse/expand folders. Performance regression covers 2,500 files plus
400 long source lines, actual bidirectional input, pre-release native viewport edges, stable scroll extent,
the final directory entry, filtering and keyboard navigation.

The inner divider may shrink its live directory viewport below the saved 160px minimum. Within 36px
of the right edge it sets the same collapsed state as the toolbar; reversing to 80px restores it within
the same captured gesture. Collapse retains the expanded width preference; a toolbar reopen restores it.
After release the file viewer consumes the resulting full width. Pointer previews never become durable
Project state, and these changes preserve the current pane ownership.

2026-09-08 Motion performance follow-up: the three live grid inputs
`--workspace-navigation-width`, `--project-workspace-width` and `--dock-file-tree-width` are registered
lengths with `inherits:false`. They belong to their grid, never to file rows, syntax tokens or hidden tabs.
This is a performance invariant: a 300-file, multi-tab Chromium trace reproduced widespread style
recalculation with inherited inputs. Navigation drag also caches geometry and viewport clamping waits
until the drag ends. The navigation viewport clips stable-width children on collapse without an
independent opacity, padding or translation transition.
Temporary slide/code/navigation content dimensions follow the same rule: write to the actual consumer,
or explicitly inherit only onto the immediate pane child, never through the entire file subtree.
Directory trees retain their sessions and use memoization with stable open/refresh callbacks so that
unrelated panel state changes do not rebuild every hidden file tab's tree.

Bottom Terminal and every affected pane above it use the same panel timing for height/margin-bottom.
The terminal body keeps its full content height during the reveal; it does not run a separate fade/translate
animation. Its left edge directly follows the measured navigation edge without a second transition.
Terminal resizing previews only local height/margins on animation frames, committing state and storage
once on release; focus uses preventScroll. Regression must verify intermediate shared edges, not merely
final bounds. The default Open button uses the existing native FILE_EXPLORER icon; that entry and the
Fielora Files/Terminal shortcuts are excluded from its alternate-app menu.

2026-09-08 File workspace correction supersedes the earlier motion details: the existing outer Dock and inner
resource grid retain their ownership and topology. During a state transition the tab strip, toolbar, viewer and
tree body retain a measured content width and are revealed by the moving pane edge; opacity/translate preludes
and `display:none` on the collapsing tree are removed. The owning grid animation controls cleanup, including
interruption and reduced motion. Inner directory drags cache geometry, update only the CSS width per animation
frame, and commit React state/localStorage on release. Pointer cancellation, capture loss and window blur end
the drag and restore interactive content. Code keeps wrapping throughout direct dragging and its native
scrollport follows the live pane edge; the whole-code width hold is superseded. Click-driven inner reveal
retains its existing measured-content transition. Syntax and source line numbers remain visible throughout.

Source editing uses CodeMirror 6 inside the existing file surface. One editor owns text, soft wrapping,
selection, undo, native scrolling and source line numbers. Its viewport layout replaces the previous full
textarea plus full highlighted DOM overlay, whose duplicate layout became costly on 400 long lines.
Language parsing covers the existing JS/TS/JSX/TSX, JSON, HTML, CSS and Markdown paths; unsupported extensions
remain editable plain text. Lezer highlight tags map to the existing semantic syntax classes and code
palette, not a second theme. Code font family/size and line height are shared by text and the gutter.
The React adapter preserves controlled content updates, existing review/save callbacks and line-range reveal;
unmount destroys the view and its observers. No completion UI, IDE panels, file access or new runtime is added.
The code palette pairs purple keywords with blue properties and teal strings in both light
and dark appearance. File and image tabs consume the same local FileTypeIcon mapping as directory rows;
rename changes the tab label only, never its file-type identity. Tool tabs keep their semantic action glyph.

The File toolbar has a 1px workspace-divider bottom edge. Directory toggle precedes the external Open control;
the resource separator uses the same neutral 1px line and a larger invisible pointer target. The filter is a
28px search field immediately below that edge with a clear action (Escape also clears), bounded path filtering,
and compressed single-child folder chains in filtered results. Normal directories use 18px depth indentation,
light ancestor guides that strengthen on hover, compact rows and file-type artwork. Real Electron tests must
type into the visible file tab, wheel-scroll to the bottom, verify input/highlight agreement, exercise both
separators and record intermediate reveal widths; DOM existence and animation duration alone are insufficient.

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

- `tokens.css`：唯一 design value source；允许 Light/Dark 的 token 值。`--fl-brand-chrome-*` 是连续、可替换的品牌 Chrome bundle，只允许由 `data-brand-chrome` owner 消费；Appearance 用户 Override 只能覆盖下述批准的 semantic token seam。
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
| Title | 17 / 600 / 1.3 | 独立 Result 与 Dialog 标题 |
| Section | 13 / 500 / 1.4 | 小节和导航分组 |
| Body | 15 / 400 / 1.7 | Conversation、Markdown、说明正文 |
| Label | 14 / 500 / 1.35 | Button、Menu、Select、Tabs |
| Meta | 13 / 400 / 1.45 | 路径、时间、Evidence、Toolbar metadata |

2026-09-07 用户字体校准：Conversation 顶部标题复用 Body 字号和 Medium 字重（默认 `15px / 500`），
不继承独立 Title 的 `17px / 600`；标题栏使用与右侧功能行一致的 `40px` 高度，标题、更多操作和功能按钮
垂直居中对齐。Conversation 内 Markdown 的 h1–h6 和正文强调仅以 `600` 字重区分，小标题保持 Body 字号，
inline strong/b 继承当前字号，不因加粗放大。原有标题语义、层级间距及独立代码字号保持。

代码、Diff、Terminal 只使用 Mono。UI 基础字号允许在 `12–18px` 中选择并按 15px 基线等比派生上述五个角色；代码字号在 `11–17px` 独立设置，不跟随 UI scale。新组件不得添加独立 `font-family`，不得新增未进入 role contract 的字号或 700/800 重字重。

### 3.1 Appearance User Override Contract

Settings → 外观在唯一 `fielora` Theme identity 之上提供六项持久、实时生效的用户 Override，不注册新 Theme、不注入 CSS selector，也不改变五层 Surface ownership：

| 设置 | Preference / Token seam | 当前 Light 默认 | 约束 |
|---|---|---:|---|
| 侧边栏背景 | `sidebarBackgroundOverride` / `sidebarBackgroundGradientOverride` → `--fl-brand-chrome-canvas` | Theme Chrome 渐变 | 默认、单色、渐变三种来源；Titlebar、Navigation 与圆角 underlay 必须消费同一个 viewport-aligned canvas，文字、图标和 selected semantics 不随背景改色 |
| 工作区背景 | `workspaceBackgroundOverride` / `workspaceBackgroundGradientOverride` → `--fl-surface-content` | `#FFFFFF` | 默认、单色、渐变三种来源；Conversation、Library/Settings Content、Right Dock/Utility 共享 Paint，neutral token 只从两个 stop 的 solid mix 派生，Floating/Overlay 继续由 Material resolver 管理 |
| 界面字体/字号 | `uiFont` / `uiFontSize` → `--fl-font-sans` / `--fl-ui-font-scale` | System / `15px` | 普通 UI 与正文按现有 role scale 相对派生 |
| 代码字体/字号 | `codeFont` / `codeFontSize` → `--fl-font-mono` / `--fl-code-font-size` | System Mono / `13px` | Code、Diff、Editor、Terminal 独立于 UI 字体 |
| 对比度 | `surfaceContrast` → neutral Surface derivation | `42` | 只派生 subtle/hover/selected/border/input 与 Brand Chrome 菜单 hover/selected/edge/input/selection-shadow；禁止全局 `filter: contrast()`，不修改正文与 Success/Warning/Danger |
| 按钮颜色 | `actionColorOverride` → `--fl-action-primary` | `#6847D8` | 自动派生 hover/pressed/focus/disabled/foreground；不覆盖 Danger/Success/Warning |

背景控件统一提供默认/单色/渐变、真实预览与 `#RRGGBB` 输入；Action Color 提供默认/自定义。颜色选择只使用 Fielora 自己的 bounded Overlay：160px saturation/value 平面、Hue track、当前 HEX，按触发器位置在窗口内上下翻转并与四边至少保留 12px，不调用 Windows native color picker，也不得产生 viewport 横向溢出。Sidebar 默认控件明确显示“主题渐变”和真实 Chrome 预览，不再以 `#F7EFFB` 单色冒充实际画布；旧版等于 `#EFEBFF/#F0ECFF/#F7EFFB` 的 persisted flat override 必须迁回 `null`。Dark 对应默认值由同一 registry resolver 提供。`applyAppPreferences` 只写批准的 CSS custom properties，更新后同帧预览并继续复用现有 Glass/Solid material recipe。恢复操作只清除这六项 Override，保留 System/Light/Dark、Reduced Motion、高对比度、项目和模型设置。

Appearance 的六项自定义使用单一两列 settings matrix：左列为 label/description，右列为统一宽度的 source/value 或 family/size control；所有右列起止边界必须对齐，桌面行高保持 compact，section copy 必须位于 section label 下方。全部 Settings category 统一使用 `920px` Content rail，Header、row copy、shortcut label 的左边线不得因历史 860/960px 宽度、20px row inset 或长页面滚动条出现而跳动；Settings Content 必须预留 stable scrollbar gutter。

Library、Scheduled 与 Project Conversation 的 Page Header 统一使用 `1040px` page rail；Library/Scheduled 共用 30px title、38px Primary Action 和无虚线卡片的 quiet empty state，Conversation 只保留其专用 reading/composer width，但 Header 左边线必须与上述 page rail 对齐。四者继续复用 `WorkspaceSurface`、navigation-width preference、4px resizer 和 Content 左上圆角，禁止回退到 legacy `.shell` fixed column。

Contrast 控件使用无外围输入框的 3px neutral/action track、20px strong thumb 与右侧等宽数值；focus 只在 thumb 周围显示 token 化 focus ring。侧栏菜单的 hover、selected material 及 selection shadow 必须从同一个 `surfaceContrast` 派生，0 时 selection shadow 为 `none`，高值逐步增强；项目容器本身继续保持无选中阴影，避免 Conversation 选中状态污染父 Project。

## 4. Icon System

- 产品图标只通过 `ui/Icon.tsx` 的 `<AppIcon>` 使用 `@phosphor-icons/react`。
- 尺寸只使用 14 / 16 / 18px；默认 regular weight，状态由 `currentColor` 与父控件 semantic token 表达。
- Phosphor 组件独占 glyph 的 `fill` / `stroke` / `stroke-width` / `weight`；CSS 只管理 optical box、`currentColor`、布局和交互状态。禁止把 `<AppIcon>`、Composer、Select 或文件图标重新套入旧手绘 SVG 的 `fill:none + stroke` 规则，否则填充式 glyph 会被抹除并错误呈现为禁用态。
- 可操作图标默认必须达到 secondary icon contrast；只有真实 `disabled` 控件允许通过控件级 opacity 降权，不能在 glyph 本身设置低透明度模拟 disabled。
- 文件类型通过 `ui/FileTypeIcon.tsx` 使用本地 Material Icon Theme SVG 子集；这是 2026-09-08 用户明确要求的 file glyph 例外。源图与 MIT 许可位于 `apps/desktop/assets/file-icons/`，许可同时嵌入分发 SVG；不发起远程图标请求，不改变 Phosphor 产品控件 registry。不得将来源不明的专有产品图标拷贝到仓库。
- Agent 生成的 `工作对象` Tab 与空状态使用 Icon Registry 中独立的 `objects → Shapes` 语义，不再占用零标签工具启动页；不得借用表示“新建文件”的 `filePlus`。
- `审阅` 与 Conversation 完成结果中的变更入口统一使用 `diff → PlusMinus`，并由 canonical optical box 添加圆角方框，使“＋ / −”同时可辨；不使用只有“＋”的 `PlusSquare` 或分支状 `GitDiff`。右侧 PowerShell 工具使用 `terminal → Terminal`，底部 Terminal 控件与标题使用 `terminalPanel → TerminalWindow`，同一行出现时必须可区分。
- 右侧工作区普通态使用 `focus → ArrowsOutSimple`，扩展后切换为 `unfocus → ArrowsInSimple`；文件目录开关使用 `fileTree → Folders`，位于“打开”左边。
- 禁止组件内手绘 SVG、Unicode glyph、emoji 图标、局部 icon registry 或 CSS 伪元素画图标。
- 例外只有真实外部应用的本机 icon、站点 favicon 和用户内容媒体；它们不是 Fielora 产品 glyph。
- Fielora 品牌标记是另一项明确例外：`apps/desktop/assets/fielora-brand-mark.svg` 是 Renderer 的 canonical 品牌源；当前 mark 固定三条 `#5840C8` 花瓣 path 且中心保持透明负空间。`render-brand-svg.cjs` 只生成 Windows icon pipeline 消费的同形 PNG，再由既有 `icon:generate` 生成 ICO；不得在组件中复制第二份品牌图或恢复中心圆。
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

2026-09-08 工作区菜单与标签校准：Conversation Header 的摘要入口改称“工作区信息”。分支/上游属于静态状态；“任务改动”读取当前 Review，“工作区改动”读取 Git status，二者不能混用计数。“查看改动统计”只在终端展示未暂存 diff 统计，不再标作比较分支。提交/推送分别使用 GitCommit/CloudArrowUp，以“准备提交 / 准备推送”明确生成 Composer 草稿，保留原草稿且不自动发送、不修改当前权限；没有上游时推送不可用。删除未实现 PR 状态和重复添加来源入口，来源文件复用 FileTypeIcon，当前文件直接回到对应文件 Tab。打开/刷新读取真实状态，失败与非 Git 状态不伪装成零改动；异步返回不能串入其他 Project。

Right Dock 选中标签使用中性 selected 底色与 subtle shadow；Keyboard focus 绘制在完整 Tab 上并向内收口，避免主按钮 outline 被标签裁切成一根竖线。共享 TabStrip 使用 roving tabindex、左右方向键及 Home/End；激活后保持标签焦点并 reveal。Right Dock 的普通滚轮映射为横向滚动，保留横向触控板与 Ctrl 缩放手势；滚动不改变活动文件。左右渐隐只在对应方向确有溢出时出现，mask 仅作用于 bounded Tab lane，“＋”及窗口控制不参与渐隐。滚动/ResizeObserver/标签变更按 frame 更新边缘状态，不因无关 Conversation render 自动滚回活动标签。点击共享图标控件时收起 Tooltip，避免盖住刚打开的菜单。

权限 Select 的常驻触发器保持无边框、透明底的轻量控件；常规高度 `30px`，窄 Composer 仅保留 `30px` 图标槽。三种权限统一使用 Phosphor 语义图标：请求批准为 `HandPalm`、帮我批准为 `ChatCircleDots`、完全访问为 `WarningOctagon`；图标槽必须透明，不增加独立底板。选项文案固定为“请求批准 / 编辑外部文件和使用互联网时始终询问”“帮我批准 / 仅对检测到的风险操作请求批准”“完全访问权限 / 可不受限制地访问互联网和你电脑上的任何文件”；Composer 中第三项只显示紧凑标签“完全访问”。`FULL_CONTROL` 只以 warning icon/text/check signal 表达风险，选中行保持透明底，不改变 Composer 底板或制造大面积状态色。菜单宽度上限 `440px`，确保三条说明在标准桌面窗口中完整单行显示，单项最小高度 `50px`；菜单中的同一选项复用相同 warning token，并从触发器上方以 motion token 定义的轻量位移/透明度过渡进入。

共享 `IconButton` / `ToolbarAction` 禁止使用浏览器原生 `title` 提示。Hover 或键盘 Focus 统一显示 Portal 承载的深色轻量 Tooltip：白色 Caption 文本、约 `7px` 圆角、`8px` 锚点间距，并在窗口边缘自动 clamp；顶栏 Tooltip 必须避开原生窗口按钮所在的 Chrome 区域。Tooltip 必须位于 App Shell overflow 之外，不得被 Conversation 或 Workspace Pane 裁切。Escape、Pointer leave 与 Blur 必须关闭，`prefers-reduced-motion` 下仅保留即时可见性变化。Sidebar 的 Project / Conversation 项使用同一受控 Tooltip 的轻量 Card variant，补充标题、Project、时间或本地路径；不得依赖浏览器原生 `title`，阴影统一使用 Floating token。

Project 下的 Conversation 只通过缩进表达层级，不绘制持续的树形竖线；项目标题再次点击仍负责展开/收起，且 hover preview 不改变选择或折叠行为。`项目` 分组标题固定在滚动容器之外，只有其下方 Project/Conversation list 纵向滚动；滚动区上下保留 `8px`、右侧保留额外 inset，Scrollbar 不得贴住分组标题或 Content 接缝。Project expanded 只表达层级展开，不消费 active background/shadow；选择某条 Conversation 时只允许该 Conversation row 显示 selection。

Conversation Composer 在空对话、历史对话和运行中使用同一底部锚点；空状态不得把 Composer 重定位到内容中央。发送/追加按钮固定为 `36px` 圆形，使用 `17px` 粗体 ArrowUp；可用态使用 Fielora emphasis purple 与白色 glyph，禁用态只降低语义对比而不改变轮廓，hover/press 动效必须复用 control motion token。

## 6. Material Contract

Fielora Glass 是唯一官方语言。组件只声明：

```text
Canvas / Content / Chrome / Floating / Overlay
```

`materials.css` 统一决定 background、edge、shadow、blur 和 fallback。Content 近实色；Chrome、Floating、Overlay 才允许受控 translucent material。System/Light/Dark 是 appearance，不是不同布局或组件体系。Solid 仅为同 DOM 的能力 fallback。

Brand Chrome 是 `Chrome` 内的显式产品子主题，不是第六种 Surface，也不是应用全局 Theme。只有持久的 Desktop title/tab bar 与 Project/Settings 左导航可以声明 `data-brand-chrome`；它们共享同一 viewport-sized 低饱和薰衣草粉画布和坐标系，原生 Windows caption 颜色与顶部渐变右端一致。品牌 foreground/hover/active/input/edge 也必须来自同一 token bundle。菜单/Popover 仍是 `Overlay`，右侧 Dock/Tabs/Utility 与全部 Conversation/Workspace/Settings 正文仍是中性的 `Content`/既有控件语义。

所有工作区正文区域使用同一个 `Content` 基础背景。材质变化不得增加 Pane 间实色割裂、重复标题栏、大面积状态色、装饰性 gradient card 或重阴影。

Conversation Header 不常驻 Project 打开方式控件；Project 外部打开器只属于 File/Resource toolbar。Right Workspace Dock 中的工作对象与 Browser viewer 均使用标准白色 `Content` plane。嵌入 Right Workspace Dock 的 Browser Page 必须直接使用 Dock 顶部的共享 Tab Strip，不得在内容区重复绘制第二层 Page Strip；active Tab 只以中性 material shift 与文字状态表达，禁止在标签底部绘制蓝色或紫色 indicator。共享 Tab Strip 必须在 window-right controls 前结束并保留 `126px` clearance；标签超过可视宽度时只在该 bounded lane 内横向滚动，激活标签自动滚回可视区，且 Dock 宽度动画导致 lane 再次变化时必须由 ResizeObserver 重做 reveal，不能覆盖 Focus/Terminal/Panel 控件。其内部固定为 `Address Toolbar → Viewport` 两行，自上而下占满动态 Dock。独立 Browse Route 可以保留自己的 Page Strip。共享 Page Tab / Address Toolbar 分别为约 `32px / 44px`，地址框为 `34px`，导航与更多操作为 `30px`；空状态使用中性的 Browser glyph、`开始浏览` 与一行说明，不形成 Landing Page 式大标题。

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
| Composer width / compact height | ≈920px / ≈100px | 1040px / ≈100px（用户收窄留白校准） |
| Composer bottom offset | ≈12px | 12px |
| Permission trigger / menu width | 30px compact / ≈440px | 30px compact / 440px max |
| Send button / glyph | 36px / 17px | 36px / 17px |
| Browser Page Tab / Address Toolbar | ≈32px / ≈44px | 共享 Dock Tab 32px / 44px |
| Browser address / action control | ≈34px / ≈30px | 34px / 30px |
| Toolbar control | ≈30–34px | 30–34px |
| Selected row radius | ≈8px | 8px |
| Main readable width | ≈920px | 1040px（用户收窄留白校准） |
| Right Workspace Dock default | ≈635px | 635px（不是 max） |
| Divider | ≈1px / 6–8% neutral | 1px neutral visual / 4px content-painted hit track |

Light appearance 的 Content 文字/图标对比基线为：Primary `#181a1f`、Secondary `#343a43`、Muted `#717a87`、普通图标 `#505761`。工作内容中的亮紫色只用于菜单选中标记与 Composer 发送/停止主操作；Workspace 顶部 active Tab 使用 neutral material shift，不使用底部 accent line。显式 Brand Chrome 是独立例外，只覆盖 Desktop 顶栏与左导航，并使用其自有高对比 foreground/selection tokens。普通 Content 导航、展开状态、进度、文件、工具栏与焦点反馈均使用 Neutral，成功/警告/危险继续使用各自语义色。Project expanded 不是 selected；同一导航链只保留 Current Conversation 的 selection。Composer 仍由 `Floating` material resolver 绘制，但使用低一级 surface shadow，减少独立 Card 感。

Conversation 顶部遵循单行 Header：项目文件夹图标 → 当前 Conversation 标题 → 更多操作。Project 名称、绝对路径或重复上下文不得作为第二行常驻标题。右上角 Workspace Dock 开关统一使用 Phosphor 右侧面板图标；不得以 Columns、手绘 SVG 或文本符号代替。

校准顺序固定为 Typography → Icon/contrast → Sidebar/selection → Composer/controls → Spacing/density。每次只比较相同窗口尺寸；若效果需要改变 DOM 或 ownership，必须报告 BLOCKED 而不是实现。

## 9. 当前验证基线

- Packaged Renderer 能挂载真实界面，React singleton contract 有静态回归测试。
- Design-system static tests 覆盖 cascade、type roles、Phosphor icon entry、glyph paint ownership、shared primitives、material ownership 和 legacy raw-color budget。
- Brand Chrome static contract 验证唯一 PNG 品牌源、顶部/左导航显式作用域、同一 viewport canvas 与 `-44px` 续接坐标、只在既有 Content 圆角切口可见的 shell underlay、受控 Logo opacity、Light/Dark token bundle、native caption 连续性，以及 Conversation/Right Workspace Dock/Utility 的零品牌 token 消费；Conversation 右上几何必须保持不变。真实 Electron 视觉验收仍判断渐变、Logo 与五层 Surface 的最终质量。
- Workspace packaged E2E 以 `data-file-kind` 与实际 decoded size 验证本地 Material Icon Theme 文件图标，不再依赖已删除的手绘 SVG tile path；File/Image viewer 必须进一步证明代码输入值与上层 syntax paint 同时包含真实内容、图片完成解码且 `naturalWidth/naturalHeight` 与渲染尺寸均大于 0，禁止仅以 DOM 节点存在判定 PASS。
- Workspace E2E 验证 Navigation/Dock 使用 `304px / 635px` 默认比例；Scheduled/Settings 使用标准 Work Surface 圆角，Conversation 使用 `16px` compact 左上圆角并共享 Navigation 宽度，初始窗口为 `1180 × 560px`。Dock 可持续向左扩展到动态可用上限，在 `1280 / 1440 / 1920` 窗口下实时 clamp，并在窗口重新放大后恢复用户偏好宽度；零标签不显示“＋”，关闭最后标签会采样到多个中间宽度。Dock launcher 只含审阅、PowerShell、浏览器、文件四个当前入口且没有侧边聊天或工作对象常驻项。File / Browser / Terminal 视图占满 Dock 且不添加内部固定宽度上限。
- Workspace presentation tests 验证 Conversation Header 不再渲染 Project launcher、工作对象不再成为常驻工具但 Agent 生成的 Artifact 仍使用直接 Tab 与白色 Content surface、嵌入式 Browser Page 直接复用 Dock Tab Strip，且 Address Toolbar / Viewport 流体占满剩余空间。
- Terminal 定向测试验证命令输入在 IPC 建立 run id 前仍接收首个真实事件，右侧与底部终端继续复用真实 Workspace Runtime；右侧工具使用 Phosphor `Terminal`，底部终端使用 `TerminalWindow`，语义相同但 presentation 可辨识。
- Managed Tooltip 与 Workspace Content Viewer E2E 分别验证顶栏提示避开原生 Chrome，以及 Sidebar 无树形竖线、Project/Conversation hover card 使用真实标题、时间与路径。
- Visual Golden E2E 固定在 `1600 × 816`，记录并断言 Typography、Icon、Sidebar、Selection、Composer、Toolbar、Dock、Divider 与无横向溢出；只生成 Sidebar + Conversation、Conversation + Composer、Workspace open、Settings 四张证据。
- 只对本轮触达的 packaged UI 路径运行最小 E2E；不以无关 Agent/Provider/Rust 全量 Gate 代替 UI 验证。
- Visual Human Gate 仍决定最终材质质量；自动测试只证明结构、契约和可运行性。

## 10. UI/UX 结构硬锁

`STRUCTURAL_CHANGE_REQUIRES_USER_APPROVAL`

当前 Desktop App Shell、Primary Navigation、Conversation、Composer、Right Workspace Dock、Bottom Terminal、Settings shared frame 以及各 Route 的主要页面结构已经锁定。后续字体、图标、色彩、材质、阴影、动效、密度和整体视觉优化只能在现有 ownership 与 DOM topology 内校准，不得借“统一样式”或“重构”进行大幅结构调整。

以下任一变化都属于结构变化：改变 App Shell / Route composition；增删主要 Pane；改变 Navigation / Conversation / Workspace / Dock / Overlay 的归属关系；改变主要 grid/flex topology；迁移 Resizer ownership；改变 Composer 底部锚点、Conversation Header ownership、Settings shared frame 或 Bottom Terminal/Dock 语义。

遇到上述需求，Agent 必须在实现前暂停，说明变更原因、范围、受影响页面和兼容风险，并获得用户明确批准后才能继续。批准后的结构变化必须在同一 changeset 同步更新本文、`docs/product/FIELORA_DESIGN_LANGUAGE_V0.1.md`、Project Reality、Decisions 与相应回归测试；未获批准时只能提交保持现有结构的校准方案。
