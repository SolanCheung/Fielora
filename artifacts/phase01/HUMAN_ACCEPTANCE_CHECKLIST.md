# Phase 01 Human Experience Acceptance

待验收构建：`Fielora-V0.1-Phase01-win-x64.zip`  
SHA-256：`04a0d539d11324e941f2f4c7bee39628ad919dcb7e0326afb8525ebc1b7220f9`

请将 ZIP 解压到一个新目录，直接双击根目录内的 `Fielora.exe`。不需要安装 Node、pnpm 或 Rust。

人工只检查 Phase 01 冻结范围：

- [ ] 可以直接启动，没有信息白屏；
- [ ] Startup 状态可理解，Core 启动稳定；
- [ ] Now 页面创建 Field 的过程自然；
- [ ] 进入 Field、更新 Focus 后，界面不暴露 SQLite/FIPC/Rust/schema/UUID 等架构噪声；
- [ ] 关闭应用、再次双击启动后，Field 与 Focus 自动恢复；
- [ ] UI 层级、字体、间距和错误表达足以支持这条最小闭环；
- [ ] Resume 的确减少了重新建立当前工作上下文的成本。

若全部满足，请回复 `Phase 01 Human Experience Gate PASS`。若任一项不满足，请描述看到的页面和操作步骤；工程状态将保持 `WAITING HUMAN ACCEPTANCE`，直到问题被处理并重新验收。
