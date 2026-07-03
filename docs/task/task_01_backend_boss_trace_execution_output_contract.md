# 后端任务：BOSS trace 逐联系人链路执行与输出契约

## 1. 任务标题

为 `BTR-01` 产出 BOSS trace 后端任务包：逐联系人链路执行与输出契约收口。

## 2. 关联 Issue

- 当前 task-package issue: [SUO-149](/SUO/issues/SUO-149)
- 目标 implementation issue: [BTR-01](/SUO/issues/BTR-01)
- 设计输入: [design_001_boss_trace_chat_to_job_detail.md](../design/design_001_boss_trace_chat_to_job_detail.md)
- 相关 issue 列表: [ISSUES_boss-trace-chat-to-job-detail.md](../issue/ISSUES_boss-trace-chat-to-job-detail.md)
- 相关 follow-up issue: [BTR-02](/SUO/issues/BTR-02)、[BTR-03](/SUO/issues/BTR-03)
- 填充后的提示词模板: [TASK-REQUIREMENT-FORMAT.md](./TASK-REQUIREMENT-FORMAT.md)

本批 task 的映射边界：

- `BTR-01`：本 backend task package 的直接覆盖范围
- `BTR-02`：docs 同步 follow-up，保持为后续单独 issue
- `BTR-03`：验证与收口 follow-up，保持为后续单独 issue

输入说明：

- `SUO-149` 是当前 task-package issue，`BTR-01` 才是实际后端实现目标。
- 本任务包使用本地 `docs/issue/` 的 issue 清单和设计稿作为结构化输入，不把文档同步或阶段规划混入后端实现边界。

## 3. 任务目标

把当前 BOSS trace 正常流程收口为“逐联系人链路”的后端实现任务包，要求实现者能据此完成以下目标：

1. 正常 `bun run trace` 保持单次打开 `https://www.zhipin.com/web/geek/chat` 的单会话轨迹。
2. 在同一 browser/session 中完成 chat list 收集、联系人点击、聊天上下文采集、当前会话绑定的岗位入口点击、岗位详情采集。
3. `output/chats.json` 与 `output/jobs.json` 必须能按 `target_id` 追溯。
4. `job_id` 只能从当前地址栏的 `/job_detail/<job_id>.html` 解析，不允许从页面文本推断。
5. `traceTargets`、`maxJobs`、`maxJobsPerTarget` 在 normal flow 中均视为历史兼容字段；正常流程只接受每个 target 的首个当前会话绑定 job，并显式拒收 `job_sug_*`、`/recommend/` 与未知岗位。
6. orchestration、command building、output writing、parser/filter logic 不再继续堆在单文件里，必要时拆成独立 helper 模块，且不得通过 CSS fallback padding 扩张岗位列表。
7. `--inspect-selectors` 保持显式 debug-only，不得作为正常完成证据。

## 4. 实现步骤

### 4.1 契约基线梳理

- 读取 `src/trace-boss.ts`、`config/boss.config.json`、设计稿和 issue 清单，梳理当前执行路径。
- 标出 normal flow、`trace:dry`、`--inspect-selectors`、`back` 回退、job 过滤、命令日志写入的所有入口。
- 固化本任务的核心不变量：
  - normal flow 只 open chat 一次
  - 目标遍历按 `traceTargets` 优先、`conversationEntryLocators` 补齐
  - 每个目标只接受 1 个当前会话绑定 job，`maxJobs` / `maxJobsPerTarget` 不再驱动 normal flow 的多 job 扩张
  - 成功 job 必须携带 `target_id` + `job_id`

### 4.2 拆分 orchestration 边界

- 让 `src/trace-boss.ts` 保持入口/调度职责，降低它对命令拼接、目标解析、输出写入和文本过滤的直接耦合。
- 如需拆分 helper 文件，优先把责任分到下列模块边界：
  - `src/trace-boss/targets.ts`
  - `src/trace-boss/commands.ts`
  - `src/trace-boss/output.ts`
  - `src/trace-boss/parser.ts`
- 保持 `buildAgentBrowserBaseArgs()`、`agent()`、`runBatch()` 这一条 launch 入口路径不分叉，确保所有命令都携带 required args。

### 4.3 稳定 output contract

- `chats.json` 必须保留 `target_id`、`contactLocator`、`collectedAt`、`rawTextFile`、`snapshotFile`。
- `jobs.json` 必须保留 `target_id`、`job_id`、`url`、`collectedAt`、`rawTextFile`、`snapshotFile`，以及可解析出的岗位字段。
- raw/snapshot 文件命名应继续按目标或 job id 可追溯，例如：
  - `output/raw/chat-<target>.txt`
  - `output/raw/flow-<target>.txt`
  - `output/raw/job-<job_id>.txt`
  - `output/snapshots/chat-<target>.txt`
  - `output/snapshots/job-detail-<job_id>.txt`
- 保留 `job-not-collected`、`job-duplicate-skipped`、`selector-inspection-debug-evidence` 等 trace event 语义。
- job detail 文本过滤必须去掉相似职位、推荐公司、热门职位、其他公司品牌信息等噪声区块；`job_sug_*` 和 `/recommend/` 不是正常完成证据。

### 4.4 固化控制流语义

- 保持正常流程的目标顺序、岗位尝试顺序、失败跳过规则和终止规则。
- 仅允许当前会话绑定的岗位入口进入成功态，不允许推荐/未知岗位写入 `jobs.json`。
- `returnToChat` 必须以 browser-back 作为同 session 回退策略，不得通过重新 open chat 回退。
- 只有外部 blocker 才允许整轮 abort：
  - login redirect
  - CAPTCHA / 风控
  - browser/session loss
  - 站点不可用
- 单个目标或单个 job 失败时，应记录证据并在安全范围内继续。

### 4.5 最小验证与交付收口

- 先跑静态检查与最小命令生成验证，再跑新鲜 trace 证据。
- 验证时优先证明：
  - `output/agent-browser-commands.log` 每条命令都包含 required args
  - normal flow 没有重复 open chat
  - `chats.json` / `jobs.json` 里都有 `target_id`
  - `jobs.json` 里 `job_id` 来自 URL，且每个 `target_id` 只记录 1 条成功 job
  - 过滤后的 raw/snapshot 不包含无关推荐区块
  - `jobs.json` 不包含 `job_sug_*` 或 `/recommend/` URL
- 若 live BOSS 运行被 blocker 卡住，必须保留 blocker 的精确位置和最小本地验证，不允许靠旧输出冒充完成。

## 5. 涉及文件路径

### 可写入

- `src/trace-boss.ts`
- `src/trace-boss/targets.ts`
- `src/trace-boss/commands.ts`
- `src/trace-boss/output.ts`
- `src/trace-boss/parser.ts`
- `config/boss.config.json`
- `output/`（仅用于 fresh verification evidence）

### 只读输入

- [design_001_boss_trace_chat_to_job_detail.md](../design/design_001_boss_trace_chat_to_job_detail.md)
- [ISSUES_boss-trace-chat-to-job-detail.md](../issue/ISSUES_boss-trace-chat-to-job-detail.md)
- [TASK-REQUIREMENT-FORMAT.md](./TASK-REQUIREMENT-FORMAT.md)
- `README.md`
- `docs/boss-agent-browser-trace.md`

### 明确不在本任务范围内

- `README.md`
- `docs/boss-agent-browser-trace.md`
- `docs/stage/`
- `docs/exec/`

说明：

- `BTR-02` 负责文档同步，`BTR-03` 负责验证收口，本任务只覆盖 backend 实现边界。

## 6. 输入 / 输出说明

### 输入

- `config/boss.config.json` 中的：
  - `chatUrl` / `startUrl`
  - `chatListScrolls` / `chatListScrollPixels`
  - `traceTargets`
  - `conversationEntryLocators`
  - `jobEntryLocators`
  - `maxJobsPerTarget`
  - `jobDetailUrlPattern`
  - `excludedJobSectionHeadings`
  - `agentBrowser`
- 当前 BOSS 登录态与可访问页面
- 设计稿和 issue 清单中定义的 per-contact chain contract

### 输出

- `output/chat-list.json`
- `output/chats.json`
- `output/jobs.json`
- `output/raw/chat-list-full.txt`
- `output/raw/single-session-flow.txt`
- `output/raw/chat-<target>.txt`
- `output/raw/flow-<target>.txt`
- `output/raw/job-<job_id>.txt`
- `output/snapshots/chat-list-full.txt`
- `output/snapshots/chat-<target>.txt`
- `output/snapshots/job-detail-<job_id>.txt`
- `output/screenshots/job-*.png`（启用截图时）
- `output/trace-events.json`
- `output/selector-inspection.json`
- `output/trace-report.md`
- `output/agent-browser-commands.log`

### 必需字段

- `target_id`
- `contactLocator`
- `job_id`
- `url`
- `collectedAt`
- `rawTextFile`
- `snapshotFile`
- `screenshotFile`（可选）
- `title`
- `salary`
- `location`
- `experience`
- `education`
- `company`
- `recruiter`

## 7. 依赖项

- `SUO-147` 设计修订已完成并作为上游约束。
- `traceTargets`、`maxJobs`、`maxJobsPerTarget`、`excludedJobSectionHeadings` 继续保留为配置字段，但 `maxJobs` / `maxJobsPerTarget` 在 normal flow 中仅作历史兼容，不再驱动多 job 扩张。
- BOSS 登录态、风控状态和站点可用性。
- 后续 `BTR-02` / `BTR-03` 会消费本任务包定义的 backend contract，但不反向扩大本任务范围。

## 8. 测试策略

1. 静态检查

```bash
bun run check
```

2. 命令生成 smoke test

```bash
bun run trace:dry
```

- 检查 `output/agent-browser-commands.log` 中每条 command 是否都带有 required args。
- 检查 normal 路径是否仍然只出现一次 `open https://www.zhipin.com/web/geek/chat`。

3. 新鲜正常流程验证

```bash
bun run trace
```

- 检查 `output/chats.json` 和 `output/jobs.json` 是否都带 `target_id`。
- 检查 `output/jobs.json` 是否把 `job_id` 固定来自 URL。
- 检查 filtered raw/snapshot 输出是否去掉无关推荐区块。

4. Debug-only selector 路径验证

```bash
bun run trace -- --inspect-selectors
```

- 仅在需要确认 debug 路径时运行。
- 结果必须被标记为 debug evidence，不能作为正常完成证据。

5. Blocker 处理

- 若 live BOSS 被登录、CAPTCHA、风控、站点可用性或 session loss 阻塞，记录精确停点与 blocker，并保留最小可重复的本地验证证据。

## 9. 完成标志

- `docs/task/task_01_backend_boss_trace_execution_output_contract.md` 已产出。
- 下游实现者可以直接据此拆分 stage，不需要回读 issue 评论线程。
- `output/chats.json`、`output/jobs.json`、`output/trace-events.json` 和 `output/agent-browser-commands.log` 的契约已经在任务包中明确。
- normal flow、debug flow、output contract、failure semantics 的边界清晰。
- `BTR-02` 与 `BTR-03` 保持为后续独立 issue，不在本任务包内混写。

## 10. 风险提示

- 联系人 locator 漂移会导致目标点击失败，需要保留可追溯的失败证据。
- chat list 可能是虚拟滚动，未滚动到的元素不应被误认为缺失。
- job 入口可能重复命中，必须保留 `(target_id, job_id)` 去重语义。
- selector inspection 很容易被误当作正常完成证据，必须始终保持 debug-only。
- 单文件重构如果不先抽出 command / output / parser 边界，容易在回归时把 launch args 或 filter 逻辑弄丢。
- live BOSS 运行可能被登录、风控、CAPTCHA 或站点可用性卡住，任务包必须允许 exact blocker 结论，而不是把旧输出当新证据。
