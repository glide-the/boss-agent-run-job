# Exec Report: SUO-152 - 补做 BOSS trace 模块拆分与结构回归验证

## 1. 执行上下文
- Task ID: `SUO-152`
- 关联 Issue: `SUO-152`，`补做 BOSS trace 模块拆分与结构回归验证`
- 关联设计稿: [`docs/design/design_001_boss_trace_chat_to_job_detail.md`](/Users/dmeck/project/boss-agent/docs/design/design_001_boss_trace_chat_to_job_detail.md)
- 关联 Stage: [`docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`](/Users/dmeck/project/boss-agent/docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md)
- 关联 Task 包: [`docs/task/task_01_backend_boss_trace_execution_output_contract.md`](/Users/dmeck/project/boss-agent/docs/task/task_01_backend_boss_trace_execution_output_contract.md)
- 执行 Agent: `ExecTaskAgent`
- 执行时间: `2026-07-03 02:31:00 CST`

## 2. TASK-REQUIREMENT-FORMAT.md 填充摘要
- 模板路径: [`docs/task/TASK-REQUIREMENT-FORMAT.md`](/Users/dmeck/project/boss-agent/docs/task/TASK-REQUIREMENT-FORMAT.md)
- 输入 Issue: `SUO-152`，任务内容为补做 BOSS trace 模块拆分与结构回归验证。
- 输入 Task: 在已验证的逐联系人 BOSS trace contract 基础上，把 `src/trace-boss.ts` 的单文件实现拆成更清晰的 helper 边界，并证明拆分后没有回归 normal flow。
- 填充后的执行目标: 将 orchestration、command building、target resolution、output writing、parser/filter logic 分离到独立模块，同时保留 one-open-per-run、`target_id`、URL-derived `job_id` 与 required launch args contract。
- 关键约束: 不修改 `docs/design/`、`docs/issue/`、`docs/stage/`；不重新设计需求；不扩大到 BTR-02 文档同步；只在授权实现范围内改动源码和执行报告。
- 验收条件: `bun run check` 通过；`bun run trace:dry` 与 `bun run trace` 通过或给出明确外部 blocker；`output/chats.json` / `output/jobs.json` 保留 `target_id`；`jobs.json` 的 `job_id` 仍来自 URL；normal flow 只出现一次 `open https://www.zhipin.com/web/geek/chat`。

## 3. 模型生成的执行任务
- 任务目标: 把 BOSS trace 的结构回归问题修正为可维护的模块分层，并用最小验证证明 runtime contract 未受影响。
- 实现范围:
  - [`src/trace-boss.ts`](/Users/dmeck/project/boss-agent/src/trace-boss.ts)
  - [`src/trace-boss/runtime.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/runtime.ts)
  - [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)
  - [`src/trace-boss/commands.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/commands.ts)
  - [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)
  - [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)
  - [`src/trace-boss/output.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/output.ts)
  - [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)
- 文件范围: 仅修改实现源码、heartbeat 文档和本执行报告；未修改 design / issue / stage 文档。
- 实现步骤:
  - 抽取项目根目录、共享类型、agent-browser 命令构造、target 解析、parser/filter 和输出写入模块。
  - 保持 `src/trace-boss.ts` 为薄入口，仅负责配置读取、参数打印与调度。
  - 保持 normal flow 的单开页链路和输出 contract。
  - 执行 `bun run check`、`bun run trace:dry`、`bun run trace` 做结构回归验证。
- 验证方式:
  - 检查 `output/agent-browser-commands.log` 的 `open https://www.zhipin.com/web/geek/chat` 计数。
  - 检查 `output/chats.json` / `output/jobs.json` 是否都写入 `target_id`。
  - 检查 `output/jobs.json` 的 `job_id` 是否来自 `/job_detail/<job_id>.html`。
  - 检查 `output/trace-events.json` 是否保留 `job-collected`、`job-duplicate-skipped` 和 `done`。

## 4. 实现变更记录
| 文件 | 操作 | 说明 |
|---|---|---|
| [`src/trace-boss.ts`](/Users/dmeck/project/boss-agent/src/trace-boss.ts) | update | 将入口收缩为薄壳 bootstrap，只保留加载配置、打印参数和调度逻辑。 |
| [`src/trace-boss/runtime.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/runtime.ts) | create | 增加 project root 运行时定位，供入口和 helper 模块共用。 |
| [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts) | create | 抽出共享类型、trace marker 和 required agent-browser 配置。 |
| [`src/trace-boss/commands.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/commands.ts) | create | 抽出 agent-browser base args、命令构造、click command 与 batch 执行。 |
| [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts) | create | 抽出 target resolution、job 限制、selector inspection command 生成。 |
| [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts) | create | 抽出 chat/job 文本解析、job_id 提取、过滤和 trace marker 片段提取。 |
| [`src/trace-boss/output.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/output.ts) | create | 抽出 output 目录创建、JSON 写入、trace report 和 selector inspection 写入。 |
| [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts) | create | 抽出 normal flow / dry-run 的 orchestration 主逻辑。 |
| [`agents/exec-task-agent/HEARTBEAT.md`](/Users/dmeck/project/boss-agent/agents/exec-task-agent/HEARTBEAT.md) | create | 落地本 agent 的最小 heartbeat 规范，便于后续按同一协议执行。 |
| [`output/agent-browser-commands.log`](/Users/dmeck/project/boss-agent/output/agent-browser-commands.log) | update | 刷新 command log，证明当前 normal flow 只有一次 open chat。 |
| [`output/chat-list.json`](/Users/dmeck/project/boss-agent/output/chat-list.json) | update | 刷新 chat list 证据。 |
| [`output/chats.json`](/Users/dmeck/project/boss-agent/output/chats.json) | update | 刷新联系人输出，保留 `target_id`。 |
| [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json) | update | 刷新岗位输出，保留 `target_id`、URL-derived `job_id` 和输出路径。 |
| [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json) | update | 刷新 trace 事件，记录 `job-collected` / `job-duplicate-skipped` / `done`。 |
| [`output/trace-report.md`](/Users/dmeck/project/boss-agent/output/trace-report.md) | update | 刷新 summary 报告。 |
| [`output/raw/chat-list-full.txt`](/Users/dmeck/project/boss-agent/output/raw/chat-list-full.txt) | update | 刷新 chat list 原始证据。 |
| [`output/raw/single-session-flow.txt`](/Users/dmeck/project/boss-agent/output/raw/single-session-flow.txt) | update | 刷新整轮 normal flow 原始证据。 |
| [`output/raw/chat-target-wang-panpan.txt`](/Users/dmeck/project/boss-agent/output/raw/chat-target-wang-panpan.txt) | update | 刷新联系人级原始证据。 |
| [`output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt`](/Users/dmeck/project/boss-agent/output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt) | update | 刷新 job 原始证据样例。 |
| [`output/snapshots/chat-list-full.txt`](/Users/dmeck/project/boss-agent/output/snapshots/chat-list-full.txt) | update | 刷新 chat list snapshot。 |
| [`output/snapshots/chat-target-wang-panpan.txt`](/Users/dmeck/project/boss-agent/output/snapshots/chat-target-wang-panpan.txt) | update | 刷新联系人级 snapshot。 |
| [`output/snapshots/job-detail-8e3f269966c0594d0nd92Nu8ElVZ.txt`](/Users/dmeck/project/boss-agent/output/snapshots/job-detail-8e3f269966c0594d0nd92Nu8ElVZ.txt) | update | 刷新 job snapshot 样例。 |
| [`output/screenshots/job-target-wang-panpan-1.png`](/Users/dmeck/project/boss-agent/output/screenshots/job-target-wang-panpan-1.png) | update | 刷新岗位详情截图样例。 |

## 5. 测试与验证
- 已执行测试: `bun run check`
- 测试结果: 通过，`tsc --noEmit` 成功。
- 已执行测试: `bun run trace:dry`
- 测试结果: 通过，dry-run 输出 `chat-list-collected`，计数为 `59`，并保留单开页参数链路。
- 已执行测试: `bun run trace`
- 测试结果: 通过，生成新鲜 live evidence。
  - `output/agent-browser-commands.log` 中 normal flow 的 `open https://www.zhipin.com/web/geek/chat` 计数为 `1`。
  - `output/chats.json` 产生 `1` 条联系人记录，`target_id` 为 `target-wang-panpan`。
  - `output/jobs.json` 产生 `4` 条岗位记录，`job_id` 来自 URL。
  - `output/trace-events.json` 记录 `chat-list-collected`、`chat-collected`、`job-collected`、`job-duplicate-skipped` 和 `done`。
- 未执行测试及原因: 无。
- 手动验证步骤:
  - 读取 [`output/agent-browser-commands.log`](/Users/dmeck/project/boss-agent/output/agent-browser-commands.log)，确认只出现一次 chat open。
  - 读取 [`output/chats.json`](/Users/dmeck/project/boss-agent/output/chats.json)，确认联系人记录带 `target_id`。
  - 读取 [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json)，确认岗位记录带 `target_id` 与 URL-derived `job_id`。
  - 读取 [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json)，确认事件序列包含成功采集与去重跳过。

## 6. 风险与阻塞
- 风险: live BOSS 页面结构、联系人 locator 和 job detail 链接仍依赖现网页面稳定性。
- 风险: `src/trace-boss/` 新模块增加了文件数，后续维护需保持入口薄壳和 helper 边界一致。
- 阻塞: 无。
- 需要上游澄清的问题: 无。

## 7. 完成状态
- [x] 已完成实现
- [x] 已完成测试
- [x] 已记录变更
- [x] 已满足验收条件
- [x] 可进入 review / audit

## 8. 回滚建议
- 回滚文件: [`src/trace-boss.ts`](/Users/dmeck/project/boss-agent/src/trace-boss.ts)、[`src/trace-boss/runtime.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/runtime.ts)、[`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)、[`src/trace-boss/commands.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/commands.ts)、[`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)、[`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)、[`src/trace-boss/output.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/output.ts)、[`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)、[`agents/exec-task-agent/HEARTBEAT.md`](/Users/dmeck/project/boss-agent/agents/exec-task-agent/HEARTBEAT.md) 以及本报告和刷新出的 `output/` 证据。
- 回滚方式: 用上一版 monolith 恢复 `src/trace-boss.ts`，删除新增 helper 模块与 heartbeat 文档，然后重新运行 `bun run check` / `bun run trace:dry` / `bun run trace` 生成替代证据。
- 注意事项: `output/` 证据是执行时产物，回滚源码后应同步清理或重刷对应 evidence，避免旧证据和新源码不一致。

## 9. 执行完成报告
- 当前结论: `done`
- 已完成内容: 将 `trace-boss` 的 orchestration、command building、target resolution、output writing、parser/filter logic 拆分到独立模块，并用 `check` + `trace:dry` + `trace` 证明 normal flow contract 未回归。
- 未完成内容: 无。
- 是否可进入 review / audit: 可。

