# Fielora Phase 01 Desktop Reality Verification Report

执行日期：2026-08-14（Asia/Shanghai）

源码证据 HEAD：`5051ab31a25285b16ef5bc3aad1ffaaeebbd1a16`

验证对象：`artifacts/phase01/Fielora-V0.1-Phase01-win-x64.zip`

SHA-256：`04a0d539d11324e941f2f4c7bee39628ad919dcb7e0326afb8525ebc1b7220f9`

结论：`DESKTOP_REALITY_GATE_PASS`

## 1. Packaged desktop reality

- ZIP 解压到全新临时目录后直接运行根目录 `Fielora.exe`；不依赖 workspace、Node、pnpm、Rust 或 dev server。
- 解压内容包含真实 `Fielora.exe`、`resources/app.asar` 与 `resources/fielora-core.exe`。
- 普通 packaged 启动形成 Electron Main、renderer、GPU、utility 与 Rust Core 的真实进程树；普通启动无应用监听端口。
- packaged application renderer URL 为 `fielora://app/index.html`，origin 为精确 `fielora://app`。
- 对照 dev 启动使用 `http://localhost:3000/main_window/index.html` 并出现 Node dev listeners；普通浏览器打开该 dev renderer 不获得 `window.fielora`、Electron、Node 或 `require`，不能伪装成桌面闭环。

## 2. Security boundary

- packaged renderer 无 Node / `require` 能力；
- app preload bridge 只存在于 expected trusted main frame；
- subframe bridge 被拒绝；
- `window.open` 被拒绝；
- remote/external navigation 被拒绝；
- 普通 packaged runtime 不暴露 E2E-only Core kill bridge。

## 3. Lifecycle / orphan verification

- 两次普通 application quit 都得到 exit code 0；Electron 退出后对应 Rust Core 同步退出，无残留被测进程或 listener。
- 强制结束 parent Electron 后，Rust Core 因 parent stdin EOF 在约 156 ms 内退出，满足小于 2 秒的 frozen boundary，无 orphan。

## 4. Full executable restart/resume

隔离 `LOCALAPPDATA` 下创建唯一 Field：

```text
Title: Desktop Reality Gate 20260814015143238
Focus: PACKAGED_DESKTOP_RESUME_20260814015143238
Revision: 2
```

保存 Snapshot 后完全退出 executable，再次启动同一 Portable build。第二次 Core PID 从 `6328` 变为 `8748`，证明不是沿用原进程；Field、Focus、revision 2 与 current-device Snapshot 均自动恢复。

## 5. Persistence evidence

对隔离的真实 SQLite database 执行只读查询，确认：

- 唯一测试 Field 存在且 revision 为 2；
- Activity 包含 `FIELD_CREATED` 与 `FOCUS_UPDATED`；
- latest Surface Snapshot 观察到 Field revision 2；
- renderer localStorage 为空，核心事实没有退化为前端本地存储。

## 6. User-facing reality

- 可从 ZIP 解压后双击 `Fielora.exe` 进入产品；
- 界面没有要求启动网站、打开 localhost 或使用浏览器替代桌面应用；
- repo 和验收文案中未发现“Fielora网站”“网站打开”“打开网站”等误导性产品措辞。

## 7. Final hygiene

Gate 全程只读使用交付产物与隔离临时状态，没有修改产品代码。结束时被测进程、Core orphan 与 listener 均为 0，Git tracked dirty state 为 0。

最终裁决：`DESKTOP_REALITY_GATE_PASS`。
