# Change Impact — Desktop Foundation Build A+B

日期：2026-08-17

状态：`IMPLEMENTATION AUTHORIZED BY CURRENT RAPID DESKTOP DIRECTION`

## 用户流程

```text
添加 Provider / Model
  → 选择本地文件夹作为 Project
  → 新建并切换持久 Conversation
  → 发送项目上下文并接收 streaming 回答
  → 查看文件、形成 bounded 文本变更、review diff、接受或撤销
  → 在 Project 根目录运行命令 / Test、查看输出或取消
  → 重启后恢复 Project、Conversation、Provider selection 与消息历史
```

## 数据影响

- 新增 Migration 0005，只增加 `conversations`、`conversation_messages`；不修改 Phase 01–04 既有表或冻结 migration。
- Project root 复用既有 `device_bindings`，以 Field identity + Device identity + `PROJECT_ROOT` 表达；Windows absolute path 只作为 device-scoped locator，不成为 Project 主键。
- Conversation 与 Message 由 Rust Core / SQLite 持久化；UI 不以 `localStorage` 保存产品事实。
- Provider selection 持久在 Conversation；API Key 继续只进入 Windows Credential Manager。

## 能力与安全影响

- Electron Main 新增受控本地 workspace adapter：用户通过系统文件夹选择器授权 Project root；文件路径必须保持在 root 内，拒绝 traversal、symlink escape、二进制和超限内容。
- 文件变更使用 expected SHA-256 乐观校验；review 阶段不写磁盘，Accept 后原子替换，Undo 仍需校验当前 hash。
- Terminal 仅由用户显式触发，在所选 Project root 内启动 PowerShell；提供输出上限、运行时状态与 Cancel，不把模型文本自动当命令执行。
- Remote Browse WebContents、trusted origin、Provider credential ingress、Provider wire 与 existing Field/Reality semantics 不变。

## 兼容、回滚与验证

- 0005 为 additive migration；旧数据库正常升级，既有 Phase 01–04 数据和测试必须继续通过。
- UI 可回退但已应用 migration 不删除；新增表可由旧二进制忽略。
- 自动验证覆盖 migration/reopen、Conversation CRUD/message order/provider selection、path boundary、diff/hash conflict、terminal output/cancel、桌面 hero flow 与 executable restart/resume。
- 打包验证至少运行 `verify:premerge`、Windows package 和 packaged Desktop smoke；人工清单单独验证真实编辑、命令、Provider 与重启体验。
