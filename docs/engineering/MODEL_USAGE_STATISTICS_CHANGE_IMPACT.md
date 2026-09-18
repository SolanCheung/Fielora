# 模型计费统计 Change Impact

日期：2026-09-15。用户授权设置内的逐任务 token、模型切换归账和可视化。

- 用户流程：执行任务 → 设置 / 模型计费统计 → 查看实际运行模型、用量趋势、模型分布、任务明细；配置每百万输入/输出 token 单价查看估算。
- 数据：复用 Rust StorageWorker / SQLite 的 agent_runs 与不可变 agent_events，新增只读、分页、owner-scoped 汇总 FIPC。没有 migration、账单写入、权限或 credential 变化。Run 固定的 provider/model 是归账依据，Composer 选择仅表示下一次任务。
- 覆盖：已保存 MODEL_COMPLETED usage；失败/取消/重试、旧子任务无 usage 明确为覆盖缺口，不把缺失写成已知零。补齐新子任务 MODEL_COMPLETED 的 usage。服务端未返回的中途 token 无法凭文本准确还原。连接测试与不调用模型的人工终端命令不属于任务统计。
- 金额：用户配置的本地展示偏好（币种、模型单价），不是账单事实；不内置未核实价格。按输入/输出计算的估算不含缓存差价、阶梯、订阅、税费；缺失单价/usage 不宣称完整费用。
- 验证：存储聚合与归属、分页、未知/零值、续作不重复、服务同名模型隔离；Main 参数拒绝；UI 价格与筛选；真实 Electron fixture 的模型切换、实时刷新、重启历史、窄窗/主题/图表。没有真实付费模型调用。
- 回滚：撤回新增查询与展示即可，既有数据库兼容；新增 usage payload 是 additive。保留当前工作树其他未提交工作。
