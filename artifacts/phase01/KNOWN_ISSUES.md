# Fielora V0.1 Phase 01 Known Issues

工程 Gate 后状态：0 个阻塞问题。

非阻塞限制：

- Phase 01 UI 只证明 Startup / Now / Field 与 Resume 闭环，不是最终视觉设计；
- Windows 构建尚未代码签名，首次运行可能触发 Windows SmartScreen；
- Phase 01 只要求 Portable ZIP，Installer 按冻结 cadence 延后到 Phase 03；
- Node test runner 会输出 `MODULE_TYPELESS_PACKAGE_JSON` warning，但 typecheck、test 与 package 均通过；
- Portable ZIP 是 145.7 MB 的可再生 build artifact，保留在本地 `artifacts/phase01`，不提交 Git；其哈希由 `BUILD_INFO.json` 固定；
- Human Experience Acceptance 仍需用户在其 Windows 11 x64 环境中确认，自动化不能代替人工裁决。
