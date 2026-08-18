# Fielora Desktop Foundation — 人工验收清单

状态：`READY_FOR_HUMAN_ACCEPTANCE`  
目标版本：Windows 11 x64 / schema 5  
交付包：`apps/desktop/out/desktop-foundation-resizable-sidebar-v4/make/zip/win32/x64/Fielora-win32-x64-0.1.0.zip`

> 自动化已经完成同一 Hero Flow，但不会代替真人对日常可用性的裁决。每项记录 `PASS`、`FAIL` 或 `NOT_RUN`；失败时附截图、Project 路径与最短复现步骤。不要把 API Key 写进截图或记录。

> 本包的完整 PreMerge、Desktop Foundation、Browse 与 single-instance 已在开发态、release unpacked 和全新 ZIP 解压目录 PASS；原生 Ctrl+C/Ctrl+V 硬断言本轮也已通过。自动化不替代真人体验裁决。

## 1. 安装与启动

- [ ] 历史 `artifacts\phase04\Fielora.exe` 即使仍在运行，本次新版也能独立启动且不出现来自旧包的错误；历史包本身不能作为本次验收包。
- [ ] 将 ZIP 解压到仓库外的新目录，直接运行 `Fielora.exe`。
- [ ] Windows 应用图标和左栏 Fielora 标志使用本次提供的透明图标，周围没有白色或浅色方块背景，16–256 px 下没有被裁切。
- [ ] 应用已打开时再次双击同一个 `Fielora.exe`，现有窗口获得焦点且不出现 `Object has been destroyed` 或 Main process JavaScript error。
- [ ] 关闭窗口后立即再次双击启动，应用正常恢复且没有错误弹窗。
- [ ] 首次启动默认进入 Projects，空状态清楚，窗口缩放和 1280×720 左右尺寸无横向裁切。
- [ ] Windows 标题栏与应用顶栏合为一行；左侧依次显示侧栏、后退、前进、文件、编辑、视图、帮助，右侧最小化/最大化/关闭仍可用且不存在第二条英文原生菜单。
- [ ] 先后进入 Projects、浏览器、设置，再使用顶栏后退/前进，页面按真实访问顺序切换；没有历史时按钮为禁用。
- [ ] 点击顶栏侧栏按钮或 `Ctrl+B`，左栏隐藏并释放主工作区宽度；再次点击完整恢复。
- [ ] “文件”菜单的新对话、打开文件夹、设置，“视图”菜单的侧栏、工具启动器、专注布局，以及“帮助”的快捷键、关于均打开对应真实动作或页面。
- [ ] 左侧只有一根导航栏；主要功能、Project 与 Conversation 在同一层级中，不再出现两根并排菜单。
- [ ] 点击 Projects、Now、浏览器、Fields、Inbox 往返时，左栏的宽度、颜色、按钮顺序和底部设置保持一致，不再切回旧版 FIELORA 大字侧栏。
- [ ] 无 Project 时点击“新对话”先进入“开始一条新对话”页面，不立即弹出 Windows 文件夹选择器；只有再点“选择 Project 文件夹”才打开选择器。
- [ ] Project 区空状态只显示“还没有项目”，不再出现占据侧栏的大号“选择文件夹”卡片。
- [ ] Conversation 默认占据主工作面，Projects 页面右下角不再显示重复的 Summon 入口。
- [ ] 从对话顶栏打开文件、审阅或终端时，右工作区与主界面保持同一色系；关闭后 Conversation 恢复完整宽度。
- [ ] 窗口右侧控制栏依次提供专注、终端、浏览器和工具入口；它们打开真实页面或状态，不再占用顶栏中央，也不是装饰按钮。
- [ ] 右侧工具页从窗口右边缘展开并向左推窄中间 Conversation；它不能悬浮覆盖对话，Conversation 与工具页边界必须衔接。
- [ ] 工具页出现审阅、终端、浏览器、文件、侧边聊天五项；在已有 Project/Conversation 时分别点击，前四项进入对应页面/工作区，侧边聊天打开 Summon；不是空按钮。
- [ ] 右侧控制栏的终端图标可直接打开当前 Project 的真实 Terminal；运行一条只读命令后能看到输出，而不是装饰图标。
- [ ] 拖动 Project 导航与 Conversation、Conversation 与 Files/Review/Terminal 工作区之间的分隔条，两边宽度连续变化且不会把设置内容挤成单字竖排。
- [ ] 拖动右侧工具区左边界可以向左扩展或向右收窄；中间区域被真正推开而非遮挡，关闭再打开后宽度保持。
- [ ] 打开设置时右侧工具区和控制栏自动关闭且不能同时出现；设置页独占工作区，返回应用后恢复正常桌面布局。
- [ ] 浏览器只在右侧工具区出现，中间区域继续显示 Project/Conversation；拖宽浏览器或缩放窗口时真实网页 viewport 同步响应。
- [ ] 无 Project 时从工具启动器点文件/审阅/终端，会返回 Projects 并显示明确的“请先打开 Project”提示，不静默失败。
- [ ] 关闭并重新启动后没有残留调试窗口、额外控制台或重复应用实例。

## 2. 设置、Provider / Model

- [ ] 点击左栏底部“设置”进入完整设置页；“返回应用”、搜索、常规、模型与服务、外观、键盘快捷键、关于均能打开对应内容。
- [ ] 在“常规”修改启动页面，完全退出并重启后进入所选页面。
- [ ] 在“外观”切换紧凑密度和减少动态效果，界面立即变化且重启后保持。
- [ ] 在“设置 → 模型与服务 → 管理模型服务”新增一个可测试的 OpenAI-compatible 或 Anthropic-compatible Provider，填写 Base URL、API Key、默认 Model ID。
- [ ] 保存后 UI 只显示凭据已存在，不回显 API Key；重启后 Provider 和 Model 仍可选择。
- [ ] 在 Conversation 中切换 Provider / Model，发送一条无敏感信息的短消息，确认增量输出可读且“停止”可终止生成。
- [ ] 使用一个明确无效的 key 验证错误提示稳定、可理解且不包含原始 Authorization header 或 secret。

## 3. Composer、附件、权限与语音

- [ ] 点击输入框左下角 `+`，系统文件选择器允许多选；选择 `.md`、`.txt`、`.ts`、`.json`、`.csv` 或日志等 UTF-8 文本后，文件名、大小和“将作为文字 Context”状态出现在附件 chip 中。
- [ ] 每次最多选择 4 个附件，单文件最多 1 MiB；绝对路径不出现在聊天消息或模型 Context 中。
- [ ] 选择图片、PDF、Office、压缩包或其他二进制时，界面明确显示当前纯文本模型通道不支持，不得假装已经把内容发送给模型。
- [ ] 发送带附件的消息后，聊天历史保留附件文件名，已发送附件从 Composer 清空；模型确实能读取受限的 UTF-8 文本 Context。
- [ ] 选择“只读”后，即使模型返回 `fielora-file` replacement 也不能形成待写入变更；选择“审阅后修改”时只能进入 Review，仍需用户点击接受后才能落盘。
- [ ] 模型下拉框只列出“设置 → 模型与服务”中已配置 Provider 的默认 Model；未配置凭据的项不可用于发送，切换后当前 Conversation 使用所选 Provider/Model。
- [ ] 权限和模型菜单从 Composer 底部向上展开，始终位于输入框附近并完整留在可视区域内；改变中间栏宽度后不会跑到屏幕外或被右侧工具区遮住。
- [ ] 点击麦克风并授权系统麦克风，讲话内容先转写到输入框，可以继续编辑；转写结束不会自动发送，必须再点发送键确认。
- [ ] 系统或 Chromium 不支持语音识别、或用户拒绝麦克风权限时，界面显示稳定提示，文字输入和发送仍正常。
- [ ] 发送键是清晰的黑色圆形上箭头；生成中切换为停止键并能真正终止当前调用，而不是装饰按钮。

## 4. Project 与 Conversation

- [ ] 通过系统文件夹选择器打开一个真实本地代码目录；Project 名称、路径和文件列表正确。
- [ ] 新建至少两条 Conversation，切换后各自历史不串线；重命名生效；删除只归档目标 Conversation。
- [ ] 关闭 Fielora 后重新启动，自动回到最近 Project / Conversation，消息与 Provider / Model 选择保持。

## 5. 文件、Context 与 Diff

- [ ] 在 Files 中打开 UTF-8 文本文件，内容完整；二进制、大于 1 MiB、Project 外路径或逃逸 symlink 不被当作可编辑文本开放。
- [ ] 选中文件后询问模型，确认发送提示明确说明文件会作为 Context 交给所选 Provider。
- [ ] 手工修改文件，点击 `Review Diff`；Diff 的删除/新增行易于辨认，进入 Review 前磁盘文件未改变。
- [ ] “接受变更”后磁盘内容更新；“撤销已接受变更”恢复原内容。
- [ ] Review 后用外部编辑器修改同一文件，再接受旧 Diff；Fielora 应拒绝覆盖并要求重新载入。
- [ ] 让模型给出一个 `fielora-file` replacement；它只能形成待 Review Diff，不能未经点击自动写盘。

## 6. Terminal / Test

- [ ] 运行 `git status --short` 或等价只读命令，输出持续显示在 Terminal。
- [ ] 点击“运行测试”，确认命令在 Project 根目录执行，结束码和输出回到当前 Conversation。
- [ ] 运行一个持续命令并点击“取消”，进程树结束且 Conversation 记录为已取消而非成功。
- [ ] 长输出被限制在合理大小，窗口和 Conversation 仍可操作。

## 7. 既有能力回归

- [ ] Projects、Now、Browse、Fields、Inbox 可以往返；Project / Conversation 状态不因 Browse/Fields 往返丢失。
- [ ] Browse 仍可打开普通网页、切换 Page、Reload；远程网页不能访问 Fielora bridge 或本地 Project 文件。
- [ ] Summon / Inbox 的 Phase 04 能力仍可打开，且不会成为 Projects 页面永久侧栏。

## 验收记录

```text
HUMAN_ACCEPTANCE: PASS | FAIL | NOT_RUN
Tester:
Build ZIP SHA-256: ccf74f76458d08d8743ea21f7491d8ba860737dcd8aa03f115e6b2b7dba74279
Provider family/model used:
Date:
Failures / notes:
```
