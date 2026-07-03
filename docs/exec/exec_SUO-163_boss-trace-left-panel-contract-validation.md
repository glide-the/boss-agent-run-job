# Exec Report: SUO-163 - BOSS Trace Left-Panel Contract Validation

## 1. 执行上下文
- Task ID: `SUO-163`
- 关联 Issue: `SUO-163`，`执行并验证左侧对话逐链路 BOSS trace 合同`
- 关联设计稿: [`docs/design/design_001_boss_trace_chat_to_job_detail.md`](/Users/dmeck/project/boss-agent/docs/design/design_001_boss_trace_chat_to_job_detail.md)
- 关联 Stage: [`docs/stage/stage_suo_162_boss_trace_left_panel_coverage_contract.md`](/Users/dmeck/project/boss-agent/docs/stage/stage_suo_162_boss_trace_left_panel_coverage_contract.md)
- 关联 Task 包: [`docs/task/task_01_backend_boss_trace_execution_output_contract.md`](/Users/dmeck/project/boss-agent/docs/task/task_01_backend_boss_trace_execution_output_contract.md)
- 执行 Agent: `ExecTaskAgent`
- 执行时间: `2026-07-03 CST`

## 2. TASK-REQUIREMENT-FORMAT.md 填充摘要
- 模板路径: [`docs/task/TASK-REQUIREMENT-FORMAT.md`](/Users/dmeck/project/boss-agent/docs/task/TASK-REQUIREMENT-FORMAT.md)
- 输入 Issue: `SUO-163`
- 输入 Task: 执行并验证左侧对话逐链路 BOSS trace 合同，产出 fresh runtime evidence。
- 填充后的执行目标: 在当前代码与配置下，验证单会话、单 open、左侧会话覆盖、单目标单 job、URL-derived `job_id`、以及 debug/normal 边界是否成立。
- 关键约束: 不修改 `docs/design/`、`docs/issue/`、`docs/stage/`；不重设需求；不扩大到 BTR-02 文档同步；仅在授权实现范围内改动源码、配置、测试与执行报告。
- 验收条件: `bun run check` 通过；相关测试通过；`bun run trace` 产出 fresh evidence；输出中能追踪 `target_id`、`leftIndex`、`targetProvenance`、`job_id`；若 live site / session 阻塞，则保留精确 stop point 与 blocker。

## 3. 模型生成的执行任务
- 任务目标: 让当前 trace-boss 实现与 left-panel coverage contract 对齐，并用 fresh runtime evidence 验证。
- 实现范围:
  - [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)
  - [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)
  - [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)
  - [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)
  - [`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json)
  - [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts)
- 文件范围: 仅修改实现源码、配置、测试与本执行报告；未修改 design / issue / stage 文档。
- 实现步骤:
  - 将 `target`/`chat`/`job` 记录补齐 `leftIndex` 与 `targetProvenance`。
  - 让 `resolveTraceTargets` 保留完整 job locator 顺序，不再只保留首个 locator。
  - 将 chat-list 发现结果写入 `leftIndex`。
  - 通过 `bun run check` 与 targeted tests 验证类型与行为。
  - 使用 `bun run trace` 做 fresh runtime validation。
- 验证方式:
  - `bun run check`
  - `bun test src/trace-boss/parser.test.ts src/trace-boss/targets.test.ts`
  - `bun run trace`

## 4. 实现变更记录
| 文件 | 操作 | 说明 |
|---|---|---|
| [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts) | update | 为 `JobRecord`、`ChatRecord`、`RuntimeTraceTarget`、`ChatListEntry` 增加 `leftIndex` 与 `targetProvenance` / audit 字段。 |
| [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts) | update | `extractChatListEntries` 产出 `leftIndex`，让 `chat-list.json` 能直接承载覆盖顺序。 |
| [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts) | update | 保留 job locator 原始顺序，不再只保留第一个 locator；为 resolved targets 补齐 `leftIndex` 与 `targetProvenance`。 |
| [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts) | update | 将 `leftIndex` / `targetProvenance` 写入 `chat-collected`、`job-not-collected`、`job-collected` 的输出与 trace event。 |
| [`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json) | update | 调整 job locator 顺序以验证 job fallback 行为，并在 current run 中切回已知可工作的 title-first 顺序。 |
| [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts) | create | 增加回归测试，确保 target 解析不会再次把 job locators 截断到单项。 |

## 5. 测试与验证
- 已执行测试: `bun run check`
- 测试结果: 通过，`tsc --noEmit` 成功。
- 已执行测试: `bun test src/trace-boss/parser.test.ts src/trace-boss/targets.test.ts`
- 测试结果: 通过，7/7 tests passed。
- 已执行测试: `bun run trace`
- 测试结果:
  - 早前一次 live run 成功完成 `chat-collected` 与 `job-collected`，并生成一个有效 `job_id` 为 `8e3f269966c0594d0nd92Nu8ElVZ` 的岗位记录；相关原始详情仍保留在 `output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt`。
  - 2026-07-03 的 fresh normal run 完成了 `chat-list-collected`、`chat-collected`、`job-not-collected`、`done`，并把 `leftIndex: 1` 与 `targetProvenance: config-only` 写入 `trace-events.json` 与 `chats.json`。
  - 2026-07-03 的 fresh `bun run trace -- --inspect-selectors` 复用了同一个 `targetCount: 1`，并额外写入 18 条 `selector-count` debug evidence，满足 debug-only 边界验证，但同样未产出新的 `job-collected`。
  - 最新 discovered-target `bun run trace` 已切换为 61 个左侧聊天目标，`trace-events.json` 已推进到 `single-session-flow-start`，`plannedJobAttempts` 为 61；当前 live 证据已在文件系统中写出 `job-chat-list-target-1-1.png` 到 `job-chat-list-target-12-1.png`，但尚未闭环到新的 `job-collected` / `done`。
- 未执行测试及原因: 无
- 手动验证步骤:
  - 检查 [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json) 中的 `chat-collected` / `job-not-collected` 是否带 `leftIndex` / `targetProvenance`。
  - 检查 [`output/chats.json`](/Users/dmeck/project/boss-agent/output/chats.json) 是否包含 `leftIndex` 与 `targetProvenance`。
  - 检查 [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json) 在成功 run 时是否保留 URL-derived `job_id` 与 `target_id`。
  - 检查 `output/screenshots/` 中最新的 `job-chat-list-target-*` 截图，确认 live job phase 正在顺序推进。

## 6. 风险与阻塞
- 风险: live BOSS 页面与 browser wait 行为不稳定，可能让 job locator 先命中 Feishu wiki / 非 job_detail 页面，或停留在 about:blank。
- 风险: 当前 discovered-target run 规模更大，虽然更接近左侧覆盖 contract，但也更容易被页面抖动、会话恢复和 scroll 竞争影响。
- 需要上游澄清的问题: 无；当前是 runtime/session 行为问题，不是设计问题。

## 7. 完成状态
- [x] 已完成实现
- [x] 已完成测试
- [x] 已记录变更
- [ ] 已满足验收条件
- [ ] 可进入 review / audit

## 8. 回滚建议
- 回滚文件: [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)、[`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)、[`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)、[`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)、[`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json)、[`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts)。
- 回滚方式: 恢复这些文件到 patch 前版本，然后重新运行 `bun run check` 与 `bun run trace` 重新收集 evidence。
- 注意事项: `output/` 属于执行产物，若回滚源码也应同步刷新或清理旧 evidence，避免旧输出与新代码不一致。

## 9. 执行完成报告
- 当前结论: `in_progress`
- 当前状态: 已完成源码与测试修改，fresh runtime validation 正在继续；更完整的 discovered-target trace 已启动，并已写出左侧列表发现结果与前 10 个 job 侧截图证据。
- 缺失输入: 无新的设计输入；当前只差 live trace 的后续完成结果。
- 已完成检查项:
  - `bun run check` 通过
  - 目标解析保留完整 job locator 顺序
  - `leftIndex` / `targetProvenance` 已进入 trace 输出
  - `targets.test.ts` 已新增回归保护
  - fresh normal run 产出了 `chat-list-collected`、`chat-collected`、`job-not-collected` 与 `done`
  - fresh inspect run 产出了 `selector-inspection-debug-evidence` 与 18 条 `selector-count` debug-only 记录
  - discovered-target run 已切换到 61 个左侧聊天目标与 61 次计划 job 尝试
  - 文件系统中已出现 `job-chat-list-target-1-1.png` 到 `job-chat-list-target-12-1.png` 的 fresh job 侧证据
- 需要上游澄清的问题: 无
- 恢复执行所需条件: 继续当前 discovered-target trace，或在当前 run 失败时重新启动一个干净的 browser/session，并在可稳定访问 BOSS live 页的前提下重跑 `bun run trace`，以同一轮 fresh evidence 同时收集 `chat-collected`、`job-collected`、`leftIndex`、`targetProvenance` 和 URL-derived `job_id`。
