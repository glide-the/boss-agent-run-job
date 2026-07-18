# Exec Report: SUO-167 - 按新 stage 产出 fresh trace evidence 与 execute 收口

## 1. 执行上下文
- Task ID: `SUO-167`
- 关联 Issue: `SUO-167 按新 stage 产出 fresh trace evidence 与 execute 收口`
- 关联设计稿: [`docs/design/design_001_boss_trace_chat_to_job_detail.md`](/Users/dmeck/project/boss-agent/docs/design/design_001_boss_trace_chat_to_job_detail.md)
- 关联 Stage: [`docs/stage/stage_suo_166_boss_trace_left_panel_per_conversation_execution.md`](/Users/dmeck/project/boss-agent/docs/stage/stage_suo_166_boss_trace_left_panel_per_conversation_execution.md), [`docs/stage/stage_suo_162_boss_trace_left_panel_coverage_contract.md`](/Users/dmeck/project/boss-agent/docs/stage/stage_suo_162_boss_trace_left_panel_coverage_contract.md)
- 执行 Agent: `ExecTaskAgent`
- 执行时间: `2026-07-03` (`Asia/Shanghai`)

## 2. TASK-REQUIREMENT-FORMAT.md 填充摘要
- 模板路径: [`docs/task/TASK-REQUIREMENT-FORMAT.md`](/Users/dmeck/project/boss-agent/docs/task/TASK-REQUIREMENT-FORMAT.md)
- 输入 Issue: 以 left-panel discovery 为 normal source-of-truth，输出 fresh trace evidence，并在必要时明确记录 blocker
- 输入 Task: 基于 `TASK-REQUIREMENT-FORMAT.md`、stage 文档和 issue 信息，生成可审计的 execute 收口结果
- 填充后的执行目标: normal trace 必须从左侧聊天列表发现 target，保留 `leftIndex` / `targetProvenance`，并输出可追溯 evidence；`--inspect-selectors` 只能追加 debug evidence，不能替代 normal contract
- 关键约束: 不修改 `docs/design/`、`docs/issue/`、`docs/stage/`；不扩大范围；只在授权实现文件和 `docs/exec/` 内落盘
- 验收条件: `bun run check` 通过；fresh normal / inspect 运行路径有证据；若 live site 或 runtime 阻塞，必须显式记录 blocker

## 3. 模型生成的执行任务
- 任务目标: 把 `trace-boss` 的目标解析与执行链收敛到 left-panel discovery first，并让运行产物可审计、可回滚
- 实现范围: `src/trace-boss.ts`, `src/trace-boss/orchestration.ts`, `src/trace-boss/targets.ts`, `src/trace-boss/types.ts`, `src/trace-boss/targets.test.ts`
- 文件范围: 允许修改上述实现文件；本次新增执行报告到 `docs/exec/`
- 实现步骤:
  - 先采集完整 chat list，再把 discovered entries 作为 normal target baseline
  - 在 target resolution 中优先 overlay discovered targets，`traceTargets` / `conversationEntryLocators` 只作为 override / compatibility 输入
  - 把 `leftIndex` 与 `targetProvenance` 贯穿到 chat/job 记录和 trace events
  - 用单元测试覆盖 discovered / config-only / fallback 三条路径
- 验证方式:
  - `bun run check`
  - `bun test src/trace-boss/parser.test.ts src/trace-boss/targets.test.ts`
  - 运行 `bun run trace` 与 `bun run trace:dry -- --inspect-selectors` 取 fresh runtime evidence

## 4. 实现变更记录
| 文件 | 操作 | 说明 |
|---|---|---|
| [`src/trace-boss.ts`](/Users/dmeck/project/boss-agent/src/trace-boss.ts) | update | 强制先收集完整 chat list，再进入 normal / dry-run 分支；normal flow 统一从 discovered chat-list entries 生成 target 输入。 |
| [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts) | update | 将 discovered entries 传入执行链；left-panel discovery 结果成为 target baseline；trace events 追加 `leftIndex` / `targetProvenance` / provenance counts。 |
| [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts) | update | 目标解析改为 discovered-first overlay；config-only 和 fallback 仅作为兼容路径；新增 target 匹配辅助逻辑。 |
| [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts) | update | 在 `ChatRecord` / `JobRecord` / `RuntimeTraceTarget` 中补齐 `leftIndex` 与 `targetProvenance` 契约。 |
| [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts) | create | 新增 discovered-first、overlay、config-only、fallback 三类回归测试。 |
| [`docs/exec/exec_SUO-167_fresh-trace-evidence-execute-closeout.md`](/Users/dmeck/project/boss-agent/docs/exec/exec_SUO-167_fresh-trace-evidence-execute-closeout.md) | create | 本次执行报告与 blocker 收口记录。 |

## 5. 测试与验证
- 已执行测试:
  - `bun run check`
  - `bun test src/trace-boss/parser.test.ts src/trace-boss/targets.test.ts`
  - `bun run trace:dry -- --inspect-selectors`
- 测试结果:
  - `check` 通过
  - `parser.test.ts` / `targets.test.ts` 共 10 个测试全部通过
  - `trace:dry -- --inspect-selectors` 成功写出 selector debug evidence
- Fresh evidence:
  - [`output/selector-inspection.json`](/Users/dmeck/project/boss-agent/output/selector-inspection.json)
  - [`output/chat-list.json`](/Users/dmeck/project/boss-agent/output/chat-list.json)
  - [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json)
  - [`output/raw/chat-list-full.txt`](/Users/dmeck/project/boss-agent/output/raw/chat-list-full.txt)
- 观测到的 debug evidence:
  - `chat-list.json` 当前长度为 `61`
  - `selector-inspection.json` 显示 chat area / conversation list / current chat / job cards 的计数存在，且 `jobDetailLinks` 计数为 `0`
  - `trace-events.json` 末尾包含 `selector-inspection-debug-evidence`、`chat-list-collected`、`dry-run-stop`、`done`
- 未完成项:
  - `bun run trace` 的 full normal traversal 未产生新的 `single-session-flow.txt` / `trace-report.md` 收口证据，当前只完成到 left-panel discovery 阶段

## 6. 风险与阻塞
- 风险: full normal trace 采用 59-target 串行 traversal，在 live site 上耗时过长，且没有在可接受窗口内写出收口 artifact
- 阻塞: 当前 issue 已被 board 取消为 duplicate leaf；它不再是活跃执行路径，因此不应继续作为 live blocker 追踪
- 需要上游澄清的问题:
  - 是否接受把 normal trace 拆成更小的 batch/chunk，以减少单次 batch 的等待和失败半径
  - 是否要求继续等待当前 live site 执行窗口，而不是用 dry-run inspect 证据作为 blocker 补充

## 7. 完成状态
- [x] 已完成实现
- [x] 已完成测试
- [x] 已记录变更
- [ ] 已满足验收条件
- [ ] 可进入 review / audit
- 当前状态: `cancelled`

## 8. 回滚建议
- 回滚文件:
  - [`src/trace-boss.ts`](/Users/dmeck/project/boss-agent/src/trace-boss.ts)
  - [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)
  - [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)
  - [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)
  - [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts)
  - [`docs/exec/exec_SUO-167_fresh-trace-evidence-execute-closeout.md`](/Users/dmeck/project/boss-agent/docs/exec/exec_SUO-167_fresh-trace-evidence-execute-closeout.md)
- 回滚方式:
  - 用 git 恢复上述实现文件到本次修改前状态
  - 删除本次新增的 exec 报告
  - 重新执行 `bun run check` 和最小回归测试，确认回滚后行为
- 注意事项:
  - 这次 dry-run inspect 的 selector evidence 只证明 debug path 可用，不代表 normal closeout 已完成
  - 重新尝试 normal trace 前，先确认 runtime/batch strategy 已调整，否则会重复遇到同类阻塞

## 9. Board Cancellation Delta
- Latest board comment: [SUO-167#comment-d1aa59c2-d517-4a6d-a7e3-7ff7acccc06b](/SUO/issues/SUO-167#comment-d1aa59c2-d517-4a6d-a7e3-7ff7acccc06b)
- Board disposition: `SUO-167` is a duplicate leaf in the `SUO-164 -> SUO-167` branch and is not the authoritative execution path.
- Canonical branch: `SUO-160 -> SUO-163 -> SUO-170` with recovery delegated through `SUO-179`.
- Impact: stop treating this issue as an active blocker; preserve its thread/evidence for audit only.
- Further action: none on this leaf unless the board reopens it explicitly.
