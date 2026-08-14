# Phase 02 Human Experience Acceptance

状态：`PENDING_USER`

当前日常体验入口：仓库根目录运行 `pnpm dev`

当前 UI correction commit：`f03ed1fe120e60f925896e12a35caca7cc19ec54`

正式 Gate packaged/portable：`PENDING_REGENERATION`

现有 `Fielora-V0.1-Phase02-win-x64.zip` 生成于 UI correction 之前，不用于验收当前界面。请先在长期运行的 dev app 中完成体验；界面确认后再生成一次正式 packaged/portable build。

人工只检查 Frozen Phase 02 范围：

- [ ] 应用可直接启动，Now 页面没有白屏或工程术语噪声；
- [ ] 界面不显示 revision、pane primitive、wire enum、snapshot freshness 或 layout source；
- [ ] 旧 text focus 被清楚表达为“上次关注”，不会与 `STALE`/legacy fallback diagnostic 拼成误导性的“继续”；
- [ ] 创建 Field 后，空工作面明确但不产生虚假占位任务；
- [ ] 记录任务、问题、阻塞等内容的交互自然，完成、重开、修订、替代的含义可理解；
- [ ] 工作状态与当前关注的变化清楚，不需要理解 SQLite、FIPC、schema 或 UUID；
- [ ] 上下文默认关闭，仅在需要查看待确认项、阻塞、参考资料与最近动态时出现；
- [ ] 保存 HTTPS 参考资料后，右侧辅助面出现，主工作面仍保持视觉主导；
- [ ] 参考资料被清楚表达为保存的来源地址，不像一个已加载网页；
- [ ] 关闭辅助面、归档、恢复的反馈可理解，恢复不会神秘恢复旧工作面；
- [ ] 关闭应用并再次启动后，Field Reality 与合理的工作现场可以继续；
- [ ] Resume 确实减少重新判断当前任务、阻塞、问题和来源的成本；
- [ ] 整体界面符合“一主焦点、最多两个辅助区域”，不存在永久 AI Sidebar、永久 Field State Dashboard 或永久 Activity 面板；
- [ ] 体验中未发现与 Frozen Phase 02 semantics 冲突、不可实现或必须修改 Contract/Schema 的问题。

若全部通过，请由用户给出明确裁决，例如：

```text
PHASE_02_HUMAN_EXPERIENCE_GATE: PASS
```

若有任一项失败，请记录复现步骤、期望与实际表现；在问题修复并重新提供真实 Evidence 前，不得宣布 Phase 02 完成。

dev 人工体验通过后仍需运行正式 Phase Gate，重新生成并验证 packaged/portable build；只有该正式 Evidence 同样通过后，才进入 Final Acceptance。
