# Phase 02 Known Issues

状态：`FINAL_ACCEPTANCE_CANDIDATE`

## 当前限制与待裁决项

1. Human Experience Gate 尚未由用户正式裁决，因此 Phase 02 仍为 `NOT_COMPLETE`；Final Acceptance 为 `NOT_GRANTED`。
2. REFERENCE 在 Phase 02 是 inert HTTPS identity；不会抓取、渲染或导航远程内容。这是 Frozen 范围，不是功能回归。
3. Surface 只支持固定 TaskPane / ReferencePane template；没有自由拖拽、任意 resize、任意 pane 或 Generative UI。这是 Frozen 范围。
4. Installer 按已冻结 cadence 延后至 Phase 03；Phase 02 交付 portable ZIP。
5. `ts-rs` 生成期间会提示其自身不解析 `serde(deny_unknown_fields)` 属性。Rust serde 仍严格执行该属性，Electron Main 也执行逐方法 payload 校验；generated contract check、unit、integration 和 E2E 均通过。
6. Forge 在当前环境直接访问 Electron GitHub checksum endpoint 可能受网络影响；验证脚本在已校验的本地 Electron 43.4.0 ZIP 可用时通过 `FIELORA_ELECTRON_ZIP_DIR` 复用缓存。该变量只影响构建取包，不改变产品运行时或 Frozen semantics。

## 已关闭问题

- Human Gate 指出的 legacy Resume presentation 与内部术语泄露已由 renderer-only correction 修复；
- correction 后 full gate、packaged smoke 与 fresh-directory portable smoke 均 PASS；
- 未发现 Phase 02 core semantics、Contract、Schema 或 Migration blocker。

## 非问题边界

- 没有新增产品依赖；
- 没有修改 Frozen Phase 02 三份规格；
- 没有改变 FIPC/1 framing、hello 或 protocol version；
- 没有提前实现 Phase 03+ 能力。
