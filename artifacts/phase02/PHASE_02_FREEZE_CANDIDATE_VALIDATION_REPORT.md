# Fielora Phase 02 Freeze Candidate Validation Report

> 历史验证证据：本报告的 verdict 记录用户 Freeze 裁决前的 Final Candidate 状态。用户随后于 2026-08-14 正式裁决 `PHASE_02: APPROVED_FOR_FREEZE`；当前正式规格见 `docs/architecture/PHASE_02_IMPLEMENTATION_SPEC_V0.1.md`、`PHASE_02_CONTRACT_DELTA_V0.1.md` 与 `PHASE_02_MIGRATION_0002_V0.1.md`。本报告中的 `NOT FROZEN` 不构成当前状态源，且 Freeze 仍未授权产品实现。

状态：FINAL CANDIDATE VALIDATION PASS / NOT FROZEN / IMPLEMENTATION NOT AUTHORIZED

日期：2026-08-14

分支：`phase/02-freeze-candidate`

本报告记录 Phase 02 Candidate 正式 Freeze 前的最后 amendment 与 bounded SQLite probe。它不构成 Freeze 裁决，不创建产品 Migration 0002，不推进产品 schema version，也不授权 Phase 02 实现。

## 1. Confirmed candidate parameters

- REFERENCE 保持 HTTPS-only；
- State content maximum：4000 Unicode scalar values；
- Activity summary maximum：240 Unicode scalar values；
- Resume active BLOCKER/QUESTION/TASK：每组最多 5 条；
- Surface 使用固定 template/slots；
- 72/28 只是 Phase 02 renderer default，不进入 SurfaceLayoutV1、Snapshot 或 Migration durable semantics。

## 2. Final amendments

### 2.1 REFERENCE lifecycle

`ACTIVE ↔ ARCHIVED`：

- archive 清除 typed focus、retract active SOURCED_FROM、写一条 Activity、Field aggregate revision +1；
- restore 校验 active canonical URL uniqueness，写一条 Activity、Object/Field revision +1；
- restore 不自动恢复旧 focus 或已 retracted relation。

### 2.2 Typed relation self-edge

SQL CHECK 修正为：

```sql
CHECK (from_type != to_type OR from_id != to_id)
```

只有 `(from_type, from_id) == (to_type, to_id)` 才是 self-edge。Probe 已证明相同文本 ID 的 STATE→OBJECT 合法，相同 typed STATE→STATE self-edge 被拒绝。

### 2.3 TaskPane invariant

- 一个 SurfaceLayoutV1 最多一个 TASK_PANE/FIELD_TASKS；
- 零 TASK State 的空 TaskPane 是合法默认状态；
- 恢复/渲染空 TaskPane 不创建占位 State、Activity 或 Field revision。

## 3. Probe sources

- SQLite runtime：Python sqlite3 / SQLite 3.39.4；
- real Migration 0001：`crates/fielora-storage/migrations/0001_core.sql`；
- 0001 bytes：5196；
- 0001 SHA-256：`a1396e4b2db60344ca4526973d91bb0218a1726f224c1d712a1e43d220822117`；
- Candidate 0002：从 `PHASE_02_MIGRATION_0002_CANDIDATE_V0.1.md` 的唯一 `sql` code block 直接提取；
- extracted Candidate SQL SHA-256：`9152a933786c33a58769d1c0268084a4471113fd3eee1436d122dcb1986039f9`；
- databases：系统临时目录中的两个独立 SQLite files；probe 完成后均已删除。

未把 Candidate SQL 写入 `crates/fielora-storage/migrations/`，未调用产品 migration runner，未修改产品数据库。

## 4. Normal 1→2 upgrade probe

先执行真实 0001，写入代表 Phase 01 的 Field、FIELD_CREATED/FIELD_FOCUS_UPDATED Activities、Device 与 legacy SurfaceSnapshot，再在单一 `BEGIN IMMEDIATE` transaction 中执行 Candidate 0002。

结果：PASS。

- schema version：2；
- Phase 01 Field/Activities/legacy snapshot 保留；
- State status/source_activity 为 NOT NULL；
- Object/Relation Phase 02 columns 与 required indexes 存在；
- `PRAGMA foreign_key_check` 为空；
- typed cross-type same-id edge：允许；
- same typed endpoint self-edge：拒绝；
- schema fingerprint：`81df430d551d93b56e88763375d12446c9db16c3ca19b16c503b596b8cbf1ae1`。

## 5. Incompatible-data rollback probe

先执行真实 0001，再写入 0001 允许、但 0002 不允许的 legacy `NOTE` field_object。Candidate 0002 在 State rebuild 成功后，于 Object rebuild 因缺少 required source_activity_id 失败。

预期错误：

```text
NOT NULL constraint failed: field_objects_v2.source_activity_id
```

结果：PASS / fail-closed。

- schema version 保持 1；
- legacy NOTE row 保留；
- schema fingerprint 前后完全一致：`00bccc34f12816dff911ab8cd91f0b6e7bda87a70e6504162d1fdcdcb94f1d3a`；
- State status 恢复为 0001 nullable；
- Phase 02 Object columns 不存在；
- 无 transient `_v2` tables；
- `PRAGMA foreign_key_check` 为空。

## 6. Evidence artifact

完整机器可读结果：`artifacts/phase02/MIGRATION_0002_BOUNDED_PROBE.json`。

## 7. Verdict

```text
PHASE_02_FINAL_FREEZE_CANDIDATE: VALIDATION_PASS
PHASE_02_FROZEN: NO
PHASE_02_IMPLEMENTATION_AUTHORIZED: NO
PHASE_02_IMPLEMENTATION_STARTED: NO
```

未发现剩余 Frozen Spec conflict。下一步只能是用户对 Final Candidate 的明确 Freeze 裁决；Freeze 本身仍不自动授权实现。
