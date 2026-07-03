# BOSS trace 左侧所有对话逐链路覆盖 Issue 清单

## 0. 文档元信息

- Issue 清单文件：`docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- 来源设计稿：
  - 主设计稿：`docs/design/design_001_boss_trace_chat_to_job_detail.md`
  - 补充设计稿：无
  - 背景设计稿：无
  - 参考设计稿：无
- 生成 Agent：`IssueDispatcher`
- 所属流水线阶段：`issue`
- 上游阶段：`design`
- 下游阶段：`task`
- 下游 Agent：
  - `FrontendTaskAgent`
  - `BackendTaskAgent`
- 共享设计稿来源：`docs/design/`
- 是否作为当前实现合同：是
- 备注：
  - 本文档由 [SUO-164](/SUO/issues/SUO-164) 触发的 issue-stage 重写生成，作为 task 阶段任务规划输入。
  - 若与设计稿冲突，以 `docs/design/` 中稳定设计稿为准。
  - 若与当前 API / 代码实现冲突，必须记录为阻塞或澄清项，不得静默覆盖。

## 1. 关联设计稿信息

- 主设计稿：`docs/design/design_001_boss_trace_chat_to_job_detail.md`
- 设计修订来源：
  - [SUO-147](/SUO/issues/SUO-147) 已完成，设计稿引入 `DEC-006` / `DEC-007`
  - [SUO-157](/SUO/issues/SUO-157) 已完成，设计稿把 normal-flow 的目标集合纠偏为左侧聊天列表
- 当前 issue 线程：
  - [SUO-164](/SUO/issues/SUO-164) 重写 issue 清单以对齐左侧对话覆盖合同
- 上游协调 Issue：
  - [SUO-159](/SUO/issues/SUO-159)
  - [SUO-155](/SUO/issues/SUO-155)
  - [SUO-145](/SUO/issues/SUO-145)
- 关联项目文档：
  - `README.md`
  - `docs/boss-agent-browser-trace.md`
  - `docs/task/task_01_backend_boss_trace_execution_output_contract.md`
  - `docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`
  - `docs/exec/exec_SUO-151_boss-trace-per-contact-chain-validation.md`
- 本清单覆盖范围：
  - 左侧对话发现与归一化，包含 `leftIndex` 与 `targetProvenance`
  - 逐联系人链路的运行契约
  - 输出 artifact 口径与 coverage audit
  - 文档同步边界与 downstream handoff 边界
  - 联合验证收口
- 明确排除范围：
  - 本批不拆 frontend 任务
  - 不在 issue 阶段直接产出 task/stage/exec 成品
  - 不直接下发给 `StagePlanner` 或 `ExecTaskAgent`
- 关键约束：
  - 正常模式以 `/web/geek/chat` 左侧聊天列表的当前可见对话为 source of truth，并在受限滚动设置下完成发现
  - `traceTargets` 与 `conversationEntryLocators` 仅作为 override / compatibility 输入，不得再次收窄目标集合
  - 每条 target 记录在可发现时必须带 `leftIndex`，并记录 `targetProvenance`（`discovered` / `fallback` / `config-only`）
  - `--inspect-selectors` 必须复用 normal flow 的 resolved target cardinality，不得把多对话合同降成单 target debug
  - `job_id` 必须从 `/job_detail/<job_id>.html` URL 解析
  - `job_sug_*`、`/recommend/` 和其他推荐/发现 URL 不是有效岗位证据，即使路径看起来像 `job_detail` 也要拒收
  - 目标链路在 normal flow 中只接受每个 target 的首个当前会话绑定 job；`traceTargets`、`maxJobs` 与 `maxJobsPerTarget` 仅保留为历史兼容字段，不驱动同联系人多 job 扩张
  - 仅对外部 blocker 采取 abort，其余可恢复错误应继续到下一个目标或 job
- 补充说明：
  - `DEC-009` 和 `DEC-010` 已把左侧对话覆盖与 inspect-mode 卡口径设为 active contract。
  - `BTR-02` 与 `BTR-03` 是面向 downstream task / validation 的文档化收口，不扩展实现范围。
  - `StagePlanner` 会在后续阶段使用本清单的依赖关系做 DAG 分析，但本清单本身不产出 stage 文档。
  - 旧的 single-target / limited-target 叙事已经被 superseded，不能继续以默认前提出现。

## 2. Issue 总览表

| Issue ID | 标题 | 类型 | 优先级 | 标签 | 前置依赖 | 分发去向 |
|---|---|---|---|---|---|---|
| `BTR-01` | 按左侧对话覆盖链路重构 BOSS trace 执行与输出契约 | backend | P0 | `backend,trace,orchestration,artifact-contract,left-panel-coverage,per-target-chain` | `SUO-157`, `SUO-147` | `@BackendTaskAgent` |
| `BTR-02` | 同步 README 与 trace 指南到左侧对话覆盖契约 | docs | P0 | `docs,contract,left-panel-coverage,traceability,runbook` | `SUO-157` | `@BackendTaskAgent` |
| `BTR-03` | 收口左侧对话覆盖验证与回归证据 | docs | P1 | `docs,validation,evidence,left-panel-coverage,hand-off` | `BTR-01`, `BTR-02` | `@BackendTaskAgent` |

## 3. Issue 明细

### `BTR-01`

- 标题：按左侧对话覆盖链路重构 BOSS trace 执行与输出契约
- 类型：backend
- 优先级：P0
- 标签：`backend,trace,orchestration,artifact-contract,left-panel-coverage,per-target-chain`
- 描述：
  把 `src/trace-boss.ts` 的正常执行改成按左侧聊天列表逐条覆盖处理，确保一次链路只服务一个 contact/target；目标集合必须从当前 left-panel conversation discovery 生成，并保留 `leftIndex` 与 `targetProvenance` 以便 coverage audit。`traceTargets`、`conversationEntryLocators`、`maxJobs` 与 `maxJobsPerTarget` 只能作为兼容 / override 输入，不得再把 normal flow 收窄成单 target 或有限 configured target set。与此同时，更新输出契约，使 `output/chat-list.json`、`output/chats.json`、`output/jobs.json` 和 trace event 记录都能按 `target_id`、`leftIndex`、`targetProvenance` 追溯。normal flow 只接受当前聊天会话真实绑定的首个岗位入口，`job_sug_*`、`/recommend/` 和未知岗位必须拒收。必要时拆分 orchestration、command building、output writing、parser/filter 逻辑，避免继续堆在单文件里。
- 验收条件：
  - 正常流按 left-panel conversation discovery 逐条执行，不再把单会话多目标或有限配置 target 作为默认假设。
  - 每个可发现 target 的记录包含 `leftIndex`；`targetProvenance` 至少能区分 `discovered`、`fallback`、`config-only`。
  - `output/chat-list.json`、`output/chats.json`、`output/jobs.json` 与 trace events 能稳定说明 target 覆盖关系，并且 normal flow 中每个 `target_id` 最多保留 1 条成功 job 记录。
  - 正常流只接受当前聊天会话绑定的首个岗位入口，不把 `job_sug_*`、`/recommend/` 或未知岗位写入 `jobs.json`。
  - `output/jobs.json` 记录 `target_id` 与 URL 派生的 `job_id`。
  - `--inspect-selectors` 使用与 normal flow 一致的 resolved target cardinality，不出现 debug 口径缩成 1 个 target 的情况。
  - 正常模式下，不出现 target 间重复 `open https://www.zhipin.com/web/geek/chat`。
  - `maxJobs` 与 `maxJobsPerTarget` 只作为历史兼容字段保留，失败 / abort 语义与 continue-vs-abort 规则一致。
  - 运行契约与代码结构分离后，单文件不再承载 orchestration、command building、output writing、parser/filter 全部职责。
- 前置依赖：`SUO-157`, `SUO-147`
- 关联路径：
  - `src/trace-boss.ts`
  - `config/boss.config.json`
  - `docs/design/design_001_boss_trace_chat_to_job_detail.md`
  - `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- 分发去向：`@BackendTaskAgent`
- 主责 Agent：
  - `BackendTaskAgent`
- 协作 Agent：
  - 无
- 设计决策引用：
  - `DEC-001`
  - `DEC-003`
  - `DEC-004`
  - `DEC-005`
  - `DEC-006`
  - `DEC-007`
  - `DEC-008`
  - `DEC-009`
  - `DEC-010`
- 备注：
  - 这是本批的主线执行契约。
  - 需要把 per-contact chain、left-panel coverage、coverage audit 与输出 artifact 归属一次性收紧。
  - 旧的单 target 叙事已被 superseded。

### `BTR-02`

- 标题：同步 README 与 trace 指南到左侧对话覆盖契约
- 类型：docs
- 优先级：P0
- 标签：`docs,contract,left-panel-coverage,traceability,runbook`
- 描述：
  把 `README.md`、`docs/boss-agent-browser-trace.md` 以及相关 task / stage / exec 参考文档统一到左侧对话覆盖契约，显式写出 `leftIndex`、`targetProvenance`、`target_id`、`job_id`、one-open-per-run、单目标单 job 与 continue-vs-abort 语义，并把旧的单 target / limited-target 语言标成 superseded。补充说明 current-session binding 约束：推荐/未知岗位不算正常完成证据。此项只做文档对齐，不引入新的实现范围。
- 验收条件：
  - `README.md` 与 `docs/boss-agent-browser-trace.md` 都改成以左侧对话覆盖作为 normal flow 的表述。
  - `docs/task/task_01_backend_boss_trace_execution_output_contract.md`、`docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`、`docs/exec/exec_SUO-151_boss-trace-per-contact-chain-validation.md` 不再把单会话有限 target 作为默认前提。
  - 文档明确指出 `leftIndex` / `targetProvenance` / `target_id` / `job_id` / one-open-per-run / 单目标单 job / continue-vs-abort，并明确拒收 `job_sug_*`、`/recommend/` 与未知岗位。
  - 旧假设在文档里被直接标记为 superseded，而不是只藏在评论或注释中。
- 前置依赖：`SUO-157`
- 关联路径：
  - `README.md`
  - `docs/boss-agent-browser-trace.md`
  - `docs/task/task_01_backend_boss_trace_execution_output_contract.md`
  - `docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`
  - `docs/exec/exec_SUO-151_boss-trace-per-contact-chain-validation.md`
  - `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- 分发去向：`@BackendTaskAgent`
- 主责 Agent：
  - `BackendTaskAgent`
- 协作 Agent：
  - 无
- 设计决策引用：
  - `DEC-001`
  - `DEC-002`
  - `DEC-005`
  - `DEC-006`
  - `DEC-007`
  - `DEC-009`
  - `DEC-010`
- 备注：
  - 这是纯文档对齐项。
  - 不把旧的单会话多目标叙事继续扩散到下游 task / stage / exec。

### `BTR-03`

- 标题：收口左侧对话覆盖验证与回归证据
- 类型：docs
- 优先级：P1
- 标签：`docs,validation,evidence,left-panel-coverage,hand-off`
- 描述：
  把左侧对话覆盖链路的运行证据和回归检查收口成可消费的验收边界，重点验证 artifact 里是否能稳定追踪到单个 target，以及 normal flow 是否已经移除了旧的重复 reopen 假设。该项主要沉淀验证口径和证据边界，不新增运行逻辑。`job_sug_*` 和 `/recommend/` 证据只能作为失败 / 阻塞证据，不能作为完成证据。
- 验收条件：
  - `output/chat-list.json`、`output/chats.json` 与 `output/jobs.json` 的样例 / 验收说明都能稳定说明 `leftIndex`、`targetProvenance` 与 `target_id` 的归属关系。
  - `output/jobs.json` 的成功记录在 normal flow 中对每个 `target_id` 只保留 1 条。
  - 联合验证说明清楚列出“正常流不重复 open chat between targets”的检查点。
  - `--inspect-selectors` 的证据说明与 normal flow 使用同一 resolved target set，而不是更小的 debug-only 集合。
  - 验收说明把旧的单 target / limited-target 假设明确写成 superseded 的历史约束。
  - 若验证发现 contract、docs、artifact 任一处仍保留旧假设，则该 issue 不得关闭。
- 前置依赖：`BTR-01`, `BTR-02`
- 关联路径：
  - `output/chat-list.json`
  - `output/chats.json`
  - `output/jobs.json`
  - `output/trace-events.json`
  - `output/selector-inspection.json`
  - `output/agent-browser-commands.log`
  - `docs/exec/exec_SUO-151_boss-trace-per-contact-chain-validation.md`
  - `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- 分发去向：`@BackendTaskAgent`
- 主责 Agent：
  - `BackendTaskAgent`
- 协作 Agent：
  - 无
- 设计决策引用：
  - `DEC-001`
  - `DEC-002`
  - `DEC-003`
  - `DEC-004`
  - `DEC-006`
  - `DEC-007`
  - `DEC-008`
  - `DEC-009`
  - `DEC-010`
- 备注：
  - 这是验证收口项，目标是把证据边界写清楚。
  - 任何残留旧假设都必须在验证材料里显式暴露，不得静默忽略。

## 4. 共享任务与依赖说明

- `BTR-01` 是本批的主线工作，先把运行契约、target 覆盖归属和 orchestration 边界收紧。
- `BTR-02` 可以在设计契约稳定后开始同步，核心是统一术语与历史假设标记，不需要新的实现决策。
- `BTR-03` 依赖 `BTR-01` 和 `BTR-02`，因为验证证据必须同时对齐 runtime contract 与文档 contract。
- 本批没有 frontend issue；如果后续真出现浏览器端可视化或人工确认需求，再由 task 阶段单独拆分。
- `StagePlanner` 会利用这里的依赖关系建立后续 DAG，但它不应直接绕过 task 文档去消费实现细节。

## 5. 分发去向说明

- `BackendTaskAgent`：
  - 领取 `BTR-01`、`BTR-02`、`BTR-03`
  - 负责接口、数据处理、Schema、脚本、路径规范、服务端逻辑、校验链路等任务规划

- `FrontendTaskAgent`：
  - 本批无领取项

- `Shared Issue` 处理规则：
  - shared 类型 Issue 必须明确主责 Agent
  - 另一个 Agent 作为协作方
  - 不允许 shared Issue 无主责
  - 若主责不清，必须标记 `[CLARIFICATION_NEEDED]`

## 6. 推荐推进顺序

1. `BTR-01`
2. `BTR-02`
3. `BTR-03`

推荐理由：

- 先锁定运行契约与 coverage audit，避免后续文档同步继续引用旧假设。
- 再同步 README 与 trace 指南，统一 downstream 的术语和边界。
- 最后用验证证据收口，确保 StagePlanner 和后续 task/stage/exec 拿到的是稳定、可验证的合同。

## 7. 阻塞与澄清记录

- `[BLOCKED]` 无
- `[CLARIFICATION_NEEDED]` 无
- 设计稿第 9 节已明确“None for now”；若后续 runtime 出现 login / CAPTCHA / risk / site availability blockers，应在 trace 执行线程里记录，不回写为 issue 阶段歧义。

## 8. Issue-First 协作说明

- Issue 是最小调度单元。
- 同一 Issue 任一时刻只允许一个主责 Agent。
- docs issue 也必须明确主责、依赖、分发去向和验收条件。
- 必须通过 Issue 评论区补充上下文、阻塞、回退和评审意见。
- 必须通过 `@mention` 唤醒目标 Agent。
- 不假设 Agent 之间存在隐式共享内存。
- 不允许绕过 Issue 直接下发 task。

## 9. 重新校验记录

- 2026-07-03: Revalidated `docs/design/design_001_boss_trace_chat_to_job_detail.md` against this Issue 清单. Updated the issue titles, coverage wording, dependency anchors, and DEC-009 / DEC-010 references so the list now treats left-panel discovery as the source of truth and keeps inspect-mode cardinality aligned.
- 2026-07-03 20:35 CST: Revalidated the current design and this Issue 清单 again in the active workspace; left-panel coverage, `leftIndex` / `targetProvenance`, and inspect-mode cardinality remain aligned, so no new issue boundaries were introduced.
