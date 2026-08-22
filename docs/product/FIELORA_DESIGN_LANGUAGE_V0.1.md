# Fielora Design Language V0.1

状态：`CURRENT / MAINTENANCE CONTRACT`

名称：**Fielora Quiet Workbench / 静默工作台**

## 1. 目标

Fielora 的界面首先服务持续工作，而不是展示内部能力。设计语言必须让 Project、Conversation、Files、Review、Terminal、Browser、Settings 与未来 Agent 状态看起来属于同一个产品，并让新增功能默认继承统一视觉，而不是依赖逐页手工对齐。

核心句：**工作内容高对比，应用结构低对比；能力常驻系统，但只在需要时进入屏幕。**

## 2. 产品原则

1. **Workbench first**：白色工作 Surface 是视觉焦点，导航和 Chrome 后退。
2. **Progressive disclosure**：默认只显示当前任务需要的控件；右工具、Terminal、弹层按需出现。
3. **Three-surface maximum**：同一时刻最多为导航、主工作区、可选右工具三块；Terminal 是主/右工作区的底部层，不成为第四列。
4. **Soft boundaries**：优先使用背景、留白、圆角表达层级；分隔线仅为单像素低对比辅助。
5. **Functional calm**：静止状态不制造底板、强阴影或高饱和色；hover 才给予轻微抬升反馈。
6. **Provider-neutral presentation**：模型、Provider、Agent 和工具状态使用产品语义，不让厂商视觉控制工作面。
7. **System-respectful motion**：控件、Surface、Panel 使用固定动效等级，并服从 `prefers-reduced-motion`。

## 3. 视觉语法

### 3.1 Surface

- App/Chrome/Navigation：同一冷灰应用背景。
- Workbench：承载布局的低对比底色。
- Primary Surface：白色、左上 20px 圆角、无常驻重阴影。
- Raised Surface：只用于 Popover/Dialog，使用明确 elevation。
- Terminal：属于工作区底层，跟随系统明暗；不能进入左侧导航下方。

### 3.2 颜色

- 中性灰承担结构、文字和交互反馈。
- Fielora 紫只用于品牌、焦点、选中和关键确认，不作为大面积装饰色。
- Success/Warning/Danger 只表达状态，不表达品牌。
- 产品样式不得直接新增 hex/rgb；必须先在 `styles/tokens.css` 中建立语义 token。

### 3.3 字体

字体栈：`Inter → Segoe UI Variable → Segoe UI`。

| 层级 | Token | 用途 |
|---|---|---|
| Caption | 9px | 时间、路径补充、极低优先级 metadata |
| Meta | 10px | 紧凑工具状态、顶部标签 |
| Label | 11px | 菜单项、紧凑按钮、Agent 工具标题 |
| Navigation | 12px | 左侧导航、设置导航、标准控件 |
| Body | 13px | 消息正文、说明文本 |
| Title | 16px | Conversation/Panel 标题 |

不得通过随意增加字号制造层级；先使用字重、颜色和间距。

### 3.4 Geometry

- 控件圆角：8px；输入框：10px；卡片：16px；工作 Surface：20px；Dialog：18px。
- 控件高度：30/34/38px 三档。
- 标准图标：14/17px 两档。
- 间距只使用 token 中的 4/6/8/10/12/16/20/24px 主尺度。

### 3.5 Motion

- Instant 100ms：局部状态变化。
- Control 140ms：hover、active、chevron。
- Surface 220ms：导航、Workspace resize/collapse。
- Panel 250ms：右工具区出现和离开。
- Canonical easing：`cubic-bezier(.2,.72,.2,1)`。
- 动效必须解释状态变化；不得为静态装饰持续运行。

## 4. 共享组件契约

新页面优先使用：

- `Button`
- `IconButton`
- `ToolbarAction`
- `SelectMenu`
- `TextActionDialog`
- `WorkspaceSurface`
- `ResizableDivider`

原生 `prompt/confirm/alert/select` 禁止进入产品 Renderer。共享控件必须包含 keyboard、focus-visible、disabled、active 和 reduced-motion 行为。

## 5. 样式分层

加载顺序固定为：

1. `styles/tokens.css`：唯一设计值事实源，同时定义 Light/Dark/System 的语义角色；
2. `styles/foundation.css`：reset、字体、focus、scrollbar、系统 motion；
3. `styles.css`：现有 Feature/Surface 兼容层，逐步迁移；
4. `styles/appearance.css`：Appearance 设置页与触达 Surface 的 token-only 迁移层，不定义第二套主题值；
5. `styles/controls.css`：共享原语的 canonical 样式，禁止 raw color。

旧 `styles.css` 允许在迁移期保留历史字面值，但新的跨页面控件不得继续写入其中。`appearance.css` 与 shared controls 一样禁止 raw color，强制主题示例色也必须先成为 preview token。每次触及旧组件时，优先把相关视觉值迁入 token/primitive，而不是增加新的独立主题分支。

## 6. 维护规则

新增 UI 前依次判断：

1. 是否已有共享 primitive；
2. 是否可以由现有 semantic token 表达；
3. 是否引入第四个常驻 Surface；
4. hover/focus/active/disabled 是否完整；
5. 真实窗口缩窄、拖动、系统减少动画后是否仍成立。

评审硬规则：

- `tokens.css` 之外的设计系统文件不得出现 raw hex/rgb/rgba。
- 不为单页复制 Button/Popover/Dialog/Select 样式。
- 不用 z-index 竞争修复错误 DOM ownership。
- 不用 `!important` 解决普通组件优先级；唯一例外是系统 reduced-motion 兜底。
- 几何不变量进入 E2E；纯 token/primitive 契约进入静态测试。

## 7. 当前迁移状态

V0.1 已建立 semantic tokens、Light/Dark/System resolver、Appearance preferences、foundation、Button/IconButton/ToolbarAction、Select、Dialog，以及共享 Workspace/Divider。Project navigation、Conversation、Message、Composer、Settings、File/Diff/Terminal、Popover/Dialog 与 Desktop Chrome 的触达路径已开始统一消费同一组 token；外部 Browse WebContents 不注入主题 CSS。现有历史 Surface 保留在兼容层以避免一次性视觉回归；后续按实际修改路径迁移，不进行无验证价值的全量重写。

完成标准不是“styles.css 归零”，而是：新增页面不再创造新的颜色、阴影、圆角、控件和布局方言；修改一个 semantic token 可以稳定影响所有使用该语义的界面。
