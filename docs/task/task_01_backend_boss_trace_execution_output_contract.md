# 后端任务：按左侧对话覆盖合同重写 BOSS trace 后端任务包

> Supersedes the earlier limited-target task-template wording. This rewrite aligns the backend task package with the left-panel coverage contract now reflected in `SUO-160` and `SUO-157`.

## 1. 任务标题

为 `BTR-01` 产出 BOSS trace 后端任务包：左侧对话覆盖、单会话单 job 与输出契约收口。

## 2. 关联 Issue

- 当前 task-package issue: [SUO-165](/SUO/issues/SUO-165)
- 当前 issue title: `同步 README、trace 指南与 backend task 包到 all-left-panel contract`
- 当前 issue status at wake: `in_progress`
- 当前 issue priority at wake: `medium`
- 当前 issue work mode: `standard`
- Assigned agent: `BackendTaskAgent`
- Target upstream implementation issue: [BTR-01](/SUO/issues/BTR-01)
- Related follow-up issues: [BTR-02](/SUO/issues/BTR-02)、[BTR-03](/SUO/issues/BTR-03)
- Design input: [design_001_boss_trace_chat_to_job_detail.md](../design/design_001_boss_trace_chat_to_job_detail.md)
- Issue list input: [ISSUES_boss-trace-chat-to-job-detail.md](../issue/ISSUES_boss-trace-chat-to-job-detail.md)
- Filled prompt template: [TASK-REQUIREMENT-FORMAT.md](./TASK-REQUIREMENT-FORMAT.md)

Input notes:

- `SUO-165` is the rewrite trigger for this task package.
- `BTR-01` remains the concrete backend implementation target.
- `BTR-02` and `BTR-03` stay out of the backend scope.
- Downstream handoff after this package goes to `SUO-162` (`StagePlanner`) and then `SUO-163` (`ExecTaskAgent`).

## 3. 任务目标

把当前 BOSS trace normal flow 收口成一个以左侧聊天列表为 source of truth 的后端任务包，要求下游实现者能够据此完成以下边界：

1. 正常 `bun run trace` 只打开 `https://www.zhipin.com/web/geek/chat` 一次，并在同一 browser/session 中完成 chat list、联系人、聊天上下文、岗位入口和岗位详情采集。
2. 目标集合从当前 left-panel conversation discovery 生成；`traceTargets`、`conversationEntryLocators`、`jobEntryLocators` 只作为 override / compatibility 输入，不得再次收窄 normal flow 的目标覆盖面。
3. 每个可发现 target 都必须具备稳定的 `target_id`，并在可发现时保留 `leftIndex` 与 `targetProvenance`（`discovered` / `fallback` / `config-only`）用于 coverage audit。
4. normal flow 只接受当前会话绑定的首个有效岗位入口；`maxJobs` 和 `maxJobsPerTarget` 仅作为历史兼容字段，不再驱动多 job 扩张，且要显式拒收 `job_sug_*`、`/recommend/` 和未知岗位。
5. `job_id` 只能从当前地址栏的 `/job_detail/<job_id>.html` 解析，不能从页面文本或推荐页推断。
6. orchestration、command building、output writing、parser/filter logic 保持清晰边界；若需调整实现，优先收紧 helper 接口，而不是重新把逻辑堆回 `src/trace-boss.ts`。
7. `--inspect-selectors` 必须保持 debug-only，并与 normal mode 使用同一 resolved target cardinality。
8. `BTR-02` 与 `BTR-03` 保持为独立 follow-up，不混入本 backend task package。

## 4. 实现步骤

### 4.1 冻结左侧覆盖合同

- 重新核对 design 与 issue list，确认 current contract 已从 configured-only / single-target 叙事切换为 left-panel coverage。
- 在任务包中显式写出 `leftIndex`、`targetProvenance`、`target_id`、`job_id`、one-open-per-run、单目标单 job、continue-vs-abort 的术语。
- 明确 `BTR-02` / `BTR-03` 不属于 backend 实现范围。

### 4.2 规范 target resolution

- 以当前 left-panel conversation discovery 作为优先来源，生成目标顺序和 `leftIndex`。
- 将 `traceTargets` 按 target 级 override 叠加到 discovered 集合上，保留兼容但不收窄覆盖。
- 对未能发现的配置项保留 `config-only` 追踪事件，避免 silent drop。
- 对重复 locator / 重复 target 的命中做去重，避免同一联系人重复进入 normal flow。

### 4.3 固化 single-session 主链路

- 保持 `src/trace-boss.ts` 为入口调度层，尽量不让它承担 parser、filter、output 的全部细节。
- 正常链路只 open chat once，后续目标间通过 browser history 返回，不通过再次 open chat 回退。
- 目标内只保留首个当前会话绑定 job，成功后停止同目标的 normal job 尝试。
- `--inspect-selectors` 仅允许在当前 batch/session 末尾追加探测，不得改变 resolved target cardinality。

### 4.4 锁定 output contract

- 将 `leftIndex`、`targetProvenance`、`target_id` 与 `job_id` 写入适当的结构化输出与 trace event。
- `job_id` 只允许从 URL 派生，失败时必须留下具体 blocker 或 `job-not-collected` 事件。
- 过滤掉推荐/发现噪声和其它公司品牌区块，拒收 `job_sug_*` 与 `/recommend/` 结果。
- 保持 `(target_id, job_id)` 去重语义，并在 trace events 中记录跳过原因。
- `output/agent-browser-commands.log` 与 `output/trace-events.json` 都应成为验收证据的一部分。

### 4.5 最小验证与交付收口

- 先跑静态检查，再跑命令生成 smoke test，最后跑 fresh trace 证据。
- 验证时优先证明 normal flow 的一次 open、left-panel coverage、`target_id` / `leftIndex` / `targetProvenance`、URL-derived `job_id`、以及 debug-only inspection 边界。
- 如果 live BOSS 被登录、CAPTCHA、风控或站点可用性阻塞，必须保留精确 stop point 和最小可重复命令证据，不允许复用旧输出冒充完成。
- `BTR-02` 和 `BTR-03` 仍然保持为独立 follow-up，不在此任务包中折叠。

## 5. 涉及文件路径

### 可写入

- `docs/task/TASK-REQUIREMENT-FORMAT.md`
- `docs/task/task_01_backend_boss_trace_execution_output_contract.md`

### 下游实现可能修改

- `src/trace-boss.ts`
- `src/trace-boss/orchestration.ts`
- `src/trace-boss/targets.ts`
- `src/trace-boss/parser.ts`
- `src/trace-boss/output.ts`
- `config/boss.config.json`
- `output/`（仅用于 fresh verification evidence）

### 只读输入

- `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- `README.md`
- `docs/boss-agent-browser-trace.md`
- `docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`
- `docs/task/SUO-139-selector-inspection-multi-job-fix.md`
- `docs/task/SUO-133-boss-trace-flashing-fix.md`

### 明确不在本任务范围内

- `README.md`
- `docs/boss-agent-browser-trace.md`
- `docs/stage/`
- `docs/exec/`

说明：

- `README.md` 和 `docs/boss-agent-browser-trace.md` 属于 `BTR-02` 的文档同步边界，不应被本 backend task package 直接吸收。
- `docs/stage/` 与 `docs/exec/` 只作为 downstream 参考，不在本任务包中改写。

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
  - `returnToChat`
  - `agentBrowser`
  - `screenshot`
  - `fieldHints`
- 当前 BOSS 登录态与可访问页面
- 设计稿与 issue list 中定义的 left-panel coverage contract

### 输出

- `output/chat-list.json`
- `output/chats.json`
- `output/jobs.json`
- `output/trace-events.json`
- `output/selector-inspection.json`（仅 debug-only）
- `output/agent-browser-commands.log`
- `output/raw/chat-list-full.txt`
- `output/raw/chat-<target>.txt`
- `output/raw/flow-<target>.txt`
- `output/raw/job-<job_id>.txt`
- `output/snapshots/chat-list-full.txt`
- `output/snapshots/chat-<target>.txt`
- `output/snapshots/job-detail-<job_id>.txt`
- `output/screenshots/job-*.png`（启用截图时）
- `output/trace-report.md`

### 必需字段

- `leftIndex`
- `targetProvenance`
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

### 输出规则

- `chats.json` 应记录每个 target 的 coverage audit 信息，至少包括 `target_id`、`leftIndex`、`targetProvenance`、`contactLocator`、`collectedAt`、`rawTextFile`、`snapshotFile`。
- `jobs.json` 应记录每个成功 job 的 audit 信息，至少包括 `target_id`、`leftIndex`、`targetProvenance`、`job_id`、`url`、`collectedAt`、`rawTextFile`、`snapshotFile`。
- `trace-events.json` 必须记录 `chat-list-collected`、`chat-collected`、`job-collected`、`job-not-collected`、`job-duplicate-skipped`、`trace-target-not-found`、`selector-inspection-debug-evidence` 和 `done` 等关键事件。
- `selector-inspection.json` 只能承载 debug-only evidence，不能作为正常完成证据。

## 7. 依赖项

- `SUO-157`
- `SUO-160`
- `SUO-147`
- `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- `src/trace-boss.ts`
- `config/boss.config.json`
- `output/` fresh verification evidence
- BOSS 登录态、风控状态和站点可用性

说明：

- `SUO-160` 负责 issue 清单本身的左侧覆盖重写。
- `SUO-157` 负责将设计稿的目标覆盖 baseline 切到 left-panel discovery。
- `SUO-147` 提供 per-contact chain 的上游设计语义。
- `BTR-02` 与 `BTR-03` 是 downstream follow-up，不作为本 task package 的实现扩展范围。

## 8. 测试策略

1. 静态检查

```bash
bun run check
```

2. 命令生成 smoke test

```bash
bun run trace:dry
```

- 检查 `output/agent-browser-commands.log` 中每条 command 是否都带 required args。
- 检查 normal 路径是否仍然只出现一次 `open https://www.zhipin.com/web/geek/chat`。
- 检查 `--inspect-selectors` 是否仍然只是 debug-only 追加命令。

3. 新鲜正常流程验证

```bash
bun run trace
```

- 检查 `output/chat-list.json`、`output/chats.json`、`output/jobs.json` 与 `output/trace-events.json` 是否都带 `leftIndex` / `targetProvenance` / `target_id` / `job_id` 的覆盖证据。
- 检查 `output/jobs.json` 的 `job_id` 是否来自 URL。
- 检查 filtered raw/snapshot 输出是否去掉无关推荐区块。

4. Debug-only selector 路径验证

```bash
bun run trace -- --inspect-selectors
```

- 仅在需要确认 debug 路径时运行。
- 结果必须被标记为 debug evidence，不能作为正常完成证据。
- 探测目标数量必须与 normal mode 一致。

5. Blocker 处理

- 若 live BOSS 被登录、CAPTCHA、风控、站点可用性或 session loss 阻塞，记录精确停点与最小本地验证证据。
- 不要用旧输出替代 fresh verification。

## 9. 完成标志

- `docs/task/TASK-REQUIREMENT-FORMAT.md` 已重写并填入 `SUO-165` 版上下文。
- `docs/task/task_01_backend_boss_trace_execution_output_contract.md` 已重写为左侧对话覆盖合同版本。
- 下游实现者可以直接据此拆分 stage，不需要回读 issue 评论线程。
- `output/chats.json`、`output/jobs.json`、`output/trace-events.json` 和 `output/agent-browser-commands.log` 的左侧覆盖契约已经在任务包中明确。
- normal flow、debug flow、output contract、failure semantics 的边界清晰。
- `BTR-02` 与 `BTR-03` 保持为后续独立 issue，不在本任务包内混写。

## 10. 风险提示

- 左侧聊天列表可能虚拟滚动或重排，导致 `leftIndex` 与发现顺序漂移，需要保留可追溯的发现证据。
- `traceTargets` / `conversationEntryLocators` 的兼容覆盖如果处理不当，可能把 normal flow 误收窄成配置子集。
- `maxJobs` / `maxJobsPerTarget` 仍可能被误读成 normal-flow 约束，必须在任务包里明确标成历史兼容字段。
- `--inspect-selectors` 很容易被误当作正常完成证据，必须始终保持 debug-only。
- job detail 页面可能包含相似职位、推荐公司、热门职位、其他公司品牌信息等噪声区块，需要在 raw/snapshot/job JSON 三层同时过滤。
- `job_sug_*` 和 `/recommend/` 可能伪装成看起来像 job detail 的链路，必须在写入 `jobs.json` 前拒收。
- live BOSS 运行可能被登录、风控、CAPTCHA 或站点可用性卡住，任务包必须允许 exact blocker 结论，而不是把旧输出当新证据。
