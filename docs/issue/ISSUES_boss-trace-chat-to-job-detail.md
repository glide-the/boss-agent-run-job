# BOSS trace 逐联系人链路重构 Issue 清单

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
  - 本文档由设计稿拆解生成，作为 task 阶段任务规划输入。
  - 若与设计稿冲突，以 `docs/design/` 中稳定设计稿为准。
  - 若与当前 API / 代码实现冲突，必须记录为阻塞或澄清项，不得静默覆盖。

## 1. 关联设计稿信息

- 主设计稿：`docs/design/design_001_boss_trace_chat_to_job_detail.md`
- 设计修订来源：`SUO-147` 已完成，设计稿引入 `DEC-006` / `DEC-007`
- 上游协调 Issue：`SUO-145`、`SUO-146`
- 关联项目文档：
  - `README.md`
  - `docs/boss-agent-browser-trace.md`
  - `docs/task/SUO-139-selector-inspection-multi-job-fix.md`
  - `docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md`
  - `docs/exec/exec_SUO-143_job-detail-more-info-blocked.md`
- 本清单覆盖范围：
  - 逐联系人链路的运行契约
  - 输出 artifact 口径
  - 代码结构边界
  - 文档同步边界
  - 联合验证收口
- 明确排除范围：
  - 本批不拆 frontend 任务
  - 不在 issue 阶段直接产出 task/stage/exec 成品
  - 不直接下发给 `StagePlanner` 或 `ExecTaskAgent`
- 关键约束：
  - 正常模式只允许一次 `open https://www.zhipin.com/web/geek/chat`
  - `--inspect-selectors` 仅用于 debug 探查，不作为正常完成证据
  - `job_id` 必须从 `/job_detail/<job_id>.html` URL 解析
  - 目标链路必须受 `traceTargets`、`maxJobs` 与 `maxJobsPerTarget` 约束
  - 仅对外部 blocker 采取 abort，其余可恢复错误应继续到下一个目标或 job
- 补充说明：
  - `DEC-006` 和 `DEC-007` 已把 per-contact chain 与 bounded target scope 设为 active contract。
  - `BTR-02` 与 `BTR-03` 是面向下游 task / stage / exec 的文档化收口，不扩展实现范围。
  - `StagePlanner` 会在后续阶段使用本清单的依赖关系做 DAG 分析，但本清单本身不产出 stage 文档。

## 2. Issue 总览表

| Issue ID | 标题 | 类型 | 优先级 | 标签 | 前置依赖 | 分发去向 |
|---|---|---|---|---|---|---|
| `BTR-01` | 按逐联系人链路重构 BOSS trace 执行与输出契约 | backend | P0 | `backend,trace,orchestration,artifact-contract,per-target-chain` | `SUO-147` | `@BackendTaskAgent` |
| `BTR-02` | 同步 README 与 trace 指南到逐联系人链路契约 | docs | P0 | `docs,contract,traceability,runbook` | `SUO-147` | `@BackendTaskAgent` |
| `BTR-03` | 收口联合验证与回归证据 | docs | P1 | `docs,validation,evidence,hand-off` | `BTR-01`, `BTR-02` | `@BackendTaskAgent` |

## 3. Issue 明细

### `BTR-01`

- 标题：按逐联系人链路重构 BOSS trace 执行与输出契约
- 类型：backend
- 优先级：P0
- 标签：`backend,trace,orchestration,artifact-contract,per-target-chain`
- 描述：
  把 `src/trace-boss.ts` 的正常执行改成按联系人逐链路处理，确保一次链路只服务一个 contact/target；同时更新输出契约，使 `output/chats.json` 和 `output/jobs.json` 能按 `target_id` 追溯，并保留 `traceTargets` 优先级、`target_id`、`maxJobsPerTarget` 与 continue-vs-abort 规则。必要时拆分 orchestration、command building、output writing、parser/filter 逻辑，避免继续堆在单文件里。
- 验收条件：
  - 正常流按 contact/target 逐条执行，不再把单会话多目标作为默认假设。
  - `output/chats.json` 记录 `target_id`。
  - `output/jobs.json` 记录 `target_id` 与 URL 派生的 `job_id`。
  - 正常模式下，不出现 target 间重复 `open https://www.zhipin.com/web/geek/chat`。
  - 失败 / abort 语义与 `maxJobsPerTarget`、continue-vs-abort 规则一致。
  - 运行契约与代码结构分离后，单文件不再承载 orchestration、command building、output writing、parser/filter 全部职责。
- 前置依赖：`SUO-147`
- 关联路径：
  - `src/trace-boss.ts`
  - `config/boss.config.json`
  - `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- 分发去向：`@BackendTaskAgent`
- 主责 Agent：
  - `BackendTaskAgent`
- 协作 Agent：
  - 无
- 设计决策引用：
  - `DEC-001`
  - `DEC-004`
  - `DEC-005`
  - `DEC-006`
  - `DEC-007`
- 备注：
  - 这是本批的主线执行契约。
  - 需要把 per-contact chain 与输出 artifact 归属一次性收紧。

### `BTR-02`

- 标题：同步 README 与 trace 指南到逐联系人链路契约
- 类型：docs
- 优先级：P0
- 标签：`docs,contract,traceability,runbook`
- 描述：
  把 `README.md`、`docs/boss-agent-browser-trace.md` 以及相关 task / stage / exec 参考文档统一到逐联系人链路契约，显式写出 `target_id`、`job_id`、one-open-per-run、`maxJobsPerTarget` 与 continue-vs-abort 语义，并把旧的单会话多目标语言标成 superseded。此项只做文档对齐，不引入新的实现范围。
- 验收条件：
  - `README.md` 与 `docs/boss-agent-browser-trace.md` 都改成以逐联系人链路作为 normal flow 的表述。
  - `docs/task/SUO-139-selector-inspection-multi-job-fix.md`、`docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md`、`docs/exec/exec_SUO-143_job-detail-more-info-blocked.md` 不再把单会话多目标写成默认前提。
  - 文档明确指出 `target_id` / `job_id` / one-open-per-run / `maxJobsPerTarget` / continue-vs-abort。
  - 旧假设在文档里被直接标记为 superseded，而不是只藏在评论或注释中。
- 前置依赖：`SUO-147`
- 关联路径：
  - `README.md`
  - `docs/boss-agent-browser-trace.md`
  - `docs/task/SUO-139-selector-inspection-multi-job-fix.md`
  - `docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md`
  - `docs/exec/exec_SUO-143_job-detail-more-info-blocked.md`
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
- 备注：
  - 这是纯文档对齐项。
  - 不把旧的单会话多目标叙事继续扩散到下游 task / stage / exec。

### `BTR-03`

- 标题：收口联合验证与回归证据
- 类型：docs
- 优先级：P1
- 标签：`docs,validation,evidence,hand-off`
- 描述：
  把逐联系人链路的运行证据和回归检查收口成可消费的验收边界，重点验证 artifact 里是否能稳定追踪到单个 target，以及正常流是否已经移除了旧的重复 reopen 假设。该项主要沉淀验证口径和证据边界，不新增运行逻辑。
- 验收条件：
  - `output/chats.json` 与 `output/jobs.json` 的样例 / 验收说明都能稳定说明 `target_id` 的归属关系。
  - 联合验证说明清楚列出“正常流不重复 open chat between targets”的检查点。
  - 验收说明把旧的单会话多目标假设明确写成 superseded 的历史约束。
  - 若验证发现 contract、docs、artifact 任一处仍保留旧假设，则该 issue 不得关闭。
- 前置依赖：`BTR-01`, `BTR-02`
- 关联路径：
  - `output/chats.json`
  - `output/jobs.json`
  - `output/trace-report.md`
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
- 备注：
  - 这是验证收口项，目标是把证据边界写清楚。
  - 任何残留旧假设都必须在验证材料里显式暴露，不得静默忽略。

## 4. 共享任务与依赖说明

- `BTR-01` 是本批的主线工作，先把运行契约、artifact 归属和 orchestration 边界收紧。
- `BTR-02` 可以在设计契约稳定后开始同步，核心是统一术语与历史假设标记，不需要新的实现决策。
- `BTR-03` 依赖 `BTR-01` 和 `BTR-02`，因为验证证据必须同时对齐 runtime contract 与文档 contract。
- 本批没有 frontend issue；如果后续真出现浏览器端可视化或人工确认需求，再由 task 阶段单独拆分。
- `StagePlanner` 会利用这里的依赖关系建立后续 DAG，但它不应直接绕过 task 文档去消费实现细节。

## 5. 分发去向说明

- `BackendTaskAgent`：领取 `BTR-01`、`BTR-02`、`BTR-03`
- `FrontendTaskAgent`：本批无领取项
- `StagePlanner`：不直接分发；仅在 task 文档完成后读取依赖边界
- `ExecTaskAgent`：不直接分发；必须等 stage 阶段完成后再进入执行

## 6. 推荐推进顺序

1. `BTR-01`
2. `BTR-02`
3. `BTR-03`

推荐理由：

- 先锁定运行契约与 artifact 归属，避免后续文档同步继续引用旧假设。
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

- 2026-07-03: Revalidated `docs/design/design_001_boss_trace_chat_to_job_detail.md` against this Issue 清单. No scope drift, blocker, or clarification delta was found, so the issue split remains unchanged.
