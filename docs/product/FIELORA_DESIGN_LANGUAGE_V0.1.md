# Fielora Design Language V0.1

状态：`CURRENT OFFICIAL LANGUAGE / IMPLEMENTED CANDIDATE / HUMAN GATE PENDING`

名称：**Fielora Glass**

## 1. 产品定义

Fielora Glass 是 Fielora 唯一的官方视觉语言，不是可选主题，也不是 Settings 中与其他内置主题并列的皮肤。应用只有一个稳定主题身份 `fielora`；`System / Light / Dark` 只决定明暗外观，不能改变设计语言。

核心句：**工作内容清晰稳定，应用结构通过克制的层次、边界与材质被感知；能力常驻系统，但只在需要时进入屏幕。**

Glass 的目的不是装饰性透明。它必须帮助用户辨认 Chrome、浮动控制与 Overlay 的空间关系，同时让 Conversation、File、Diff、Terminal、Artifact 与真实网页内容保持可读。外部 Browse `WebContents` 不注入 Fielora 样式。

## 2. 产品原则

1. **Content first**：内容面近实色、高可读；透明度不穿透正文。
2. **One language, three appearances**：Fielora Glass 是唯一语言；System、Light、Dark 是同一 token contract 的外观解析。
3. **Semantic surfaces**：组件声明表面角色，不自行选择 blur、alpha 或阴影配方。
4. **Progressive disclosure**：默认只显示当前任务需要的控件；Workspace、Terminal、菜单和弹层按需出现。
5. **Soft boundaries**：优先使用材质差、留白和单像素边缘表达层级，避免堆叠描边与厚重阴影。
6. **Restrained accent**：工作内容中的 Fielora 紫只用于焦点、选中与关键动作。唯一大面积品牌例外是持久的左导航和 Desktop 顶部 tab/title Chrome；Conversation、Settings Content、Right Dock、右侧工具栏、Overlay 与外部网页不得继承该底色。
7. **Provider-neutral presentation**：模型、Provider、Agent 与 Tool 使用产品语义，不让厂商视觉控制工作面。
8. **System-respectful motion**：动效解释状态变化并服从 `prefers-reduced-motion`。

## 3. 五层 Surface Contract

产品组件只使用以下五种语义表面：

| Surface | 语义 | 典型位置 |
|---|---|---|
| `Canvas` | 最底层应用画布，不表达 elevation | Desktop frame、Workspace 背景 |
| `Content` | 近实色的持续阅读/工作面 | Conversation、Settings 内容、File/Diff/Terminal 主体 |
| `Chrome` | 低 elevation、可与内容分离的应用结构 | 左导航、工具栏、Page/Tabs、Dock header |
| `Floating` | 与当前内容相关的临时或悬浮控制 | Composer、Quick Capture、浮动搜索 |
| `Overlay` | 最高临时层，必须有明确边界与关闭路径 | Menu、Popover、Dialog、Lightbox |

Renderer 通过 `data-surface="canvas|content|chrome|floating|overlay"` 声明角色。背景、边缘、阴影与 backdrop 只由 `styles/materials.css` 解析；Feature CSS 不复制 Glass recipe。

## 4. Glass 与 Solid Fallback

Glass 是官方体验。`solid` 仅为运行时内部 fallback，用于系统不支持 `backdrop-filter` 或未来明确的可访问性降级；它不是可选择主题、设置卡片或第二套组件样式。

Fallback 必须复用同一 DOM、同一 `data-surface` 与同一交互状态，只替换 semantic material token。任何组件不得通过 `@supports` 自行建立局部 fallback 分支。

## 5. 视觉语法

### 5.1 颜色与材质

- Light 与 Dark 共享语义角色和组件结构，只替换 token 值。
- Content 保持近实色；Chrome、Floating、Overlay 才允许受控 translucent material。
- Brand Chrome 只允许在左导航与 Desktop 顶栏共享一张低饱和、近白的薰衣草粉连续背景；进入 Windows 原生窗口按钮前平滑过渡到当前背景的右端色，native caption 必须同步使用同一颜色。shell underlay 只可从 Content 的圆角切口露出，用于让弧度可见，不得向正文着色。不得将两处画成分割的高饱和紫色块。右侧 Dock/Tabs/Utility、Conversation 和其他 Content 继续使用中性表面，active Tab 不使用蓝紫底线。
- Success、Warning、Danger 只表达状态，不表达配置、当前项或品牌。
- 产品样式不得直接新增 hex/rgb；必须先在 `styles/tokens.css` 建立语义 token。
- 阴影表达 elevation，不用于装饰卡片；边缘高光不得替代 focus ring。

### 5.2 字体

字体栈为 `Segoe UI Variable → Segoe UI → Microsoft YaHei UI`，代码使用 `Cascadia Code → Consolas`。Conversation 正文约 15px，运行状态约 14px，metadata 约 12.5px；标题通过有限的 16–17px 层级、字重和间距建立秩序。不得用任意字号或高字重制造局部品牌方言。

### 5.3 Geometry

- 控件圆角 8px；输入框 10px；卡片约 12px；Surface/Dialog 16px。Brand Chrome 不改变 Conversation 既有右上角几何。
- 控件高度使用 30/34/38px 三档。
- 图标使用 14/17/20px 三档和统一 stroke token。
- 间距消费 `--fl-space-*`；不在新组件内建立第二套尺度。

### 5.4 Motion

- Fast 120ms：hover、active、chevron。
- Normal 200ms：局部 Surface 和浮层出现。
- Panel 280ms：可调整 Workspace/Dock 转换。
- 进入与离开使用各自 easing；reduced-motion 下必须安全退化。
- 禁止无状态意义的持续动画；loading 是例外，但必须与真实 loading state 绑定。

## 6. Icon Grammar

高频产品图标统一通过 `ui/Icon.tsx` 的 `<AppIcon>` 使用 `@phosphor-icons/react` 输出。导航、Chrome、Composer、权限、文件工作流、设置、菜单和通用控件不得各自复制 SVG path 或建立局部 glyph component。

AppIcon 使用 `currentColor`、14/17/20px 尺寸角色和统一 weight；状态由父控件的 semantic token 表达。用户于 2026-09-08 要求文件类型采用更容易辨识的彩色语言标记，文件 glyph 因此使用本地 Material Icon Theme SVG 子集（保留 MIT 许可），React/TypeScript/JSON/ESLint 等有各自标记；这只属于文件类型的例外，不替换 Phosphor 产品控件 registry。外部应用的本机图标、站点 favicon 和内容媒体可保留真实来源。

文件目录与文件标签共用该类型映射，重命名标签不会改变文件图标。图标资源与代码语法主题是独立能力；代码展示使用与产品协调的紫色关键字、蓝色属性和青绿色字符串，并跟随浅色/深色外观。源文件始终显示等宽行号，软换行不重复编号；字体、滚动和拖动必须保持代码与行号对齐，不能为了动效临时隐藏行号。

文件工具栏的默认“打开”使用本机文件资源管理器图标；其下拉菜单只显示其他已安装应用，不重复文件资源管理器，也不再列出 Fielora 文件/终端。侧栏、文件工作区与终端开合以连续裁切和同一移动边界表达，禁止相邻面板一块瞬移、一块缓动。拖动宽度必须局限在拥有该宽度的布局容器，不能因继承变量让所有文件节点重复计算样式；性能验收使用多文件/多标签场景及中间帧，不只检查动画末态。

右侧工作区与内部目录的展开采用滑动裁切：内容随边界露出，避免先显示空白底板、文字压成窄条或结束时突然消失。拖动期间边界直接跟随指针，释放才提交宽度偏好；正常展开/恢复的控件同步使用向外/向内箭头。文件工具栏下方与正文/目录之间使用同一细 neutral divider，目录开关位于“打开”的左侧。目录缩进、弱层级线及 hover 加深帮助辨认父子关系；筛选紧靠工具栏分割线，显示搜索与清空操作。

Fielora Logo 不属于通用 AppIcon grammar。唯一 canonical 品牌源是 `apps/desktop/assets/fielora-brand-mark.svg`；Renderer 直接消费 SVG，Windows icon pipeline 消费由它机械生成的同形 PNG/ICO。当前批准版本使用紫色 `#5840C8` 三瓣轮廓，中心保持透明负空间，不保留浅色圆；更换 Logo 不建立第二份组件资源。

## 7. 共享组件契约

新页面优先使用：

- `AppIcon`
- `Button`
- `IconButton`
- `ToolbarAction`
- `Menu` / `MenuItem`
- `SelectMenu`
- `TabStrip` / `Tab`
- `TextActionDialog`
- `WorkspaceSurface`
- `ResizableDivider`

原生 `prompt/confirm/alert/select` 禁止进入产品 Renderer。共享控件必须覆盖 keyboard、focus-visible、disabled、active 与 reduced-motion。

## 8. Appearance 与 User Override Seam

Appearance identity 只提供 `System / Light / Dark`，Fielora Glass 仍是唯一 Theme。Settings 可以在当前 Theme 之上持久化六项批准的用户 Override：Sidebar Background、Workspace Background、UI font family/size、Code font family/size、neutral Surface contrast 和 Primary Action Base Color。背景允许默认、单色或两端色渐变，但仍只覆盖对应 semantic token；未设置的值继续继承当前 Light/Dark registry，恢复时删除 Override 而不是切换或复制 Theme。

Sidebar 当前 Light 默认继承与 Titlebar 同一张 viewport-aligned Brand Chrome 渐变；设置必须以真实渐变 swatch 和“主题渐变”表达默认状态，不得再用 `#EFEBFF/#F0ECFF/#F7EFFB` flat fill 或代表色制造横向断层。Workspace 默认仍为 `#FFFFFF`，Primary Action 为 `#6847D8`。颜色输入只接受 `#RRGGBB` 并实时预览；应用内 Color Picker 必须是受控 Overlay，含 saturation/value 与 Hue，并始终夹紧在当前窗口内，禁止调用会越出产品窗口的 native picker。Contrast 只派生 `surface.subtle/hover/selected`、border、input 以及 Brand Chrome 菜单 hover/selected/edge/input/selection-shadow 等中性层级，禁止对整页使用 CSS filter，禁止改变正文、图标、Success、Warning、Danger；控件自身使用 thin track、strong circular thumb 和右侧数值，不使用厚重输入框高光。Action Color 自动派生 Default/Hover/Pressed/Focus/Disabled 和可读前景色；红绿黄语义状态保持独立。UI 与 Code typography 各自拥有 family/size，代码内容不跟随普通 UI 字号。

Scheduled、Library 与 Conversation Header 使用同一 1040px Page Rail；前两者的标题、Primary Action 和 empty state 共享一套尺度，按钮不得作为孤立高饱和块悬在页面远端。全部 Settings category 使用同一 920px Content Rail 与左边线，并预留 stable scrollbar gutter，Appearance 不得拥有独立宽度或在滚动条出现时水平跳动。该校准不改变各 Route、Navigation、Composer、Dock 或 Resizer ownership。

这些 Override 仍属于声明式扩展缝隙：禁止脚本、React、DOM、CSS selector、网络、文件、credential、Tool 或 Runtime capability。未来主题导入入口在 importer 与安全验证真正实现前保持禁用，不用伪配置导入冒充主题系统。

当前内置的 Brand Chrome bundle 是该声明式缝隙的第一个受控 group：`--fl-brand-chrome-*` 只改变左导航与 Desktop 顶栏的 paint/foreground/state，配合单一 `fielora-brand-mark.svg` 即可快速换品牌。它不是第二套 Theme，也不能覆盖 Content、Conversation、Right Dock/Utility 或 Overlay selector。

## 9. 样式分层

Renderer 只加载 `styles/index.css`，并由 CSS Cascade Layers 固定以下 ownership：

1. `tokens`：唯一设计值事实源；
2. `legacy`：历史 `styles.css` 兼容层，只减不增；
3. `foundation` / `features`：系统基础与现有 feature presentation；
4. `layout`：锁定 Pane ownership 与连续工作面；
5. `typography`：五个字体角色；
6. `components`：Button/Menu/Select/Tabs/Dialog 等 canonical 状态；
7. `materials`：五层 Surface 的唯一 material resolver 与 solid fallback。

`tokens.css` 之外的设计系统新增代码禁止 raw color。Feature 文件可以声明 `data-surface`、布局与内容 geometry，但不得重新定义 backdrop recipe。

## 10. 维护与验证

新增 UI 前依次判断：

1. 属于哪一个 semantic surface；
2. 是否已有 shared primitive/AppIcon；
3. 是否能由现有 token 表达；
4. hover/focus/active/disabled/reduced-motion 是否完整；
5. 1280、1440、1920 宽度及 Light/Dark 是否仍成立；
6. Glass 不可用时，同一组件结构能否在 solid fallback 下保持可读和可操作。

评审硬规则：

- 产品内置 Theme identity 必须恰好一个：`fielora`。
- Appearance 只能是 System/Light/Dark。
- Feature CSS 不得直接写 `backdrop-filter: blur(...)`。
- 不为单页复制 Button/Popover/Dialog/Select 或产品 SVG glyph。
- 不用 z-index 竞争修复错误 DOM ownership。
- 不用 `!important` 解决普通组件优先级；仅允许系统 reduced-motion 兜底。
- 几何与 fallback 进入 Desktop E2E；token、registry、icon 和 material boundary 进入静态测试。

实现 ownership、受管理文件、布局锁定、Typography/Icon/Primitive 规则与强制文档同步流程，以 `docs/architecture/FIELORA_UI_UX_SYSTEM_V0.1.md` 为 canonical。任何受管理样式变化必须在同一 changeset 更新该文档并通过 `pnpm verify:ui-ux`。当前材质状态仍是 `IMPLEMENTED CANDIDATE / NOT FROZEN`；自动 Gate 不替代用户 Visual Human Gate。

## 11. 既有页面结构锁定

`STRUCTURAL_CHANGE_REQUIRES_USER_APPROVAL`

Fielora 已有页面的 App Shell、导航、对话区、Composer、工作区 Dock、底部终端和 Settings shared frame 是稳定产品结构。后续整体样式优化默认只允许校准 Typography、Icon、Color、Material、Shadow、Motion 与 Spacing，不得重排主要页面区域、改变 Pane ownership 或以新 Dashboard/Card topology 代替现有 Route。

任何需要改变上述结构或布局 ownership 的工作必须在编码前暂停，向用户说明原因、范围和影响并取得明确许可。没有明确许可时，结构保持不变；这一规则同时适用于 Agent、自动优化、重构和视觉对标工作。
