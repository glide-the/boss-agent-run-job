# Exec Report: SUO-158 - 岗位详情页 richer job-detail fields repair

## 1. 执行上下文
- Task ID: `SUO-158`
- 关联 Issue: `SUO-158 执行修复：补齐 BOSS 岗位详情页具体信息采集`
- 关联设计稿: [`docs/design/design_001_boss_trace_chat_to_job_detail.md`](/Users/dmeck/project/boss-agent/docs/design/design_001_boss_trace_chat_to_job_detail.md)
- 关联 Stage: [`docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`](/Users/dmeck/project/boss-agent/docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md)
- 执行 Agent: `ExecTaskAgent`
- 执行时间: `2026-07-03T21:01:39+0800`
- 执行目标: 修复岗位详情页采集的数据丢失问题，让 `jobs.json`、raw/snapshot 证据重新携带完整的当前岗位与当前公司信息，同时保留 `job_id` 来自当前 `/job_detail/<job_id>.html` 的约束

## 2. TASK-REQUIREMENT-FORMAT.md 填充摘要
- 模板路径: [`docs/task/TASK-REQUIREMENT-FORMAT.md`](/Users/dmeck/project/boss-agent/docs/task/TASK-REQUIREMENT-FORMAT.md)
- 输入 Issue: `SUO-158`
- 输入 Task: `SUO-158`，修复当前会话绑定岗位详情的 richer fields 采集与解析
- 填充后的执行目标: 保持 current-session-bound contract 不变，补齐 `description`、`skills`、`company_scale`、`industry`、`recruiter`
- 关键约束:
  - 只接受当前会话绑定的首个有效岗位入口
  - 拒收 `job_sug_*`、`/recommend/` 和未知岗位
  - 不修改 design / issue / stage 文档
  - 不扩大为泛爬取或额外岗位链路
- 验收条件:
  - `bun test src/trace-boss/parser.test.ts` 通过
  - `bun test src/trace-boss/targets.test.ts` 通过
  - `bun run trace` 至少能完成一次 blocker sweep，不再因为 `wait --url` 硬超时直接挂起
  - `output/jobs.json` 包含 `target_id`、URL-derived `job_id` 和 richer job fields

## 3. 模型生成的执行任务
- 任务目标: 让岗位详情采集不再丢失公司规模、行业、招聘者和技能信息，并让输出文本证据与结构化输出一致；同时让 live trace 在外部访问受限时能完成 blocker sweep 而不是卡死
- 实现范围:
  - 采集侧补充详情页第二视口后的内容
  - 解析侧从原始 job segment 解析 richer fields
  - 技能抽取增加噪声识别、term merge 与 fallback
  - trace 编排移除会导致外部 blocker 长时间挂起的 `wait --url`
  - 添加回归测试并重新跑 live trace
- 文件范围:
  - [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)
  - [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)
  - [`src/trace-boss/parser.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.test.ts)
  - [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)
  - [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)
  - [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts)
  - [`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json)
- 实现步骤:
  1. 在 job detail batch 中增加第二次下滚和 `read`，把首屏外的详情内容纳入同一 session 证据。
  2. 将 `JobRecord` schema 扩展为可承载 richer fields。
  3. 让 parser 从原始 job segment 解析 title、salary、company、company_scale、industry、recruiter、description。
  4. 为 skills 增加噪声检测，避免把 OCR / 浏览器噪声写入结构化输出。
  5. 补回归测试，并重新执行 `bun run trace` 生成 fresh evidence。
- 验证方式:
  - `bun test src/trace-boss/parser.test.ts`
  - `bun test src/trace-boss/targets.test.ts`
  - `bun run trace`

## 4. 实现变更记录
| 文件 | 操作 | 说明 |
|---|---|---|
| [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts) | update | 扩展 `JobRecord`、`ChatRecord`、`RuntimeTraceTarget` 的覆盖字段，承载 `leftIndex` 与 `targetProvenance`。 |
| [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts) | update | 保留 discovered + config 兼容合并逻辑，并修正类型推断，避免 target provenance 在 fallback 路径上丢失。 |
| [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts) | update | job detail 采集增加下滚补证据；移除会在访问受限时硬挂起的 `wait --url`，让 blocker sweep 能继续产出 `job-not-collected`。 |
| [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts) | update | 强化 job detail 清洗边界、skills 归一化、term merge、recruiter/company/company_scale/industry 解析，并修复顶部公司块回退与 `智能体` term 识别。 |
| [`src/trace-boss/parser.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.test.ts) | update | 新增 richer fields、公司块回退、skill noise、fragmented skill 归一化和 recruiter 选择回归测试。 |
| [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts) | update | 验证 target 解析保留顺序与 provenance 元数据。 |
| [`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json) | update | 调整岗位入口 locator 的尝试顺序，尝试从 text / css / role 路径恢复 job_detail 点击。 |
| [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json) | update | 用保留的历史 raw job evidence 重建 1 条 richer job record，补齐 `company_scale`、`industry`、`recruiter`、`skills` 等结构化字段。 |
| [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json) | update | 记录最新 blocker sweep：`chat-list-collected` 为空、`job-not-collected` 与 `done` 正常落盘。 |
| [`output/trace-report.md`](/Users/dmeck/project/boss-agent/output/trace-report.md) | update | 刷新 blocker sweep report，保留当前 live 访问受限状态。 |
| [`docs/exec/exec_SUO-158_job-detail-richer-fields.md`](/Users/dmeck/project/boss-agent/docs/exec/exec_SUO-158_job-detail-richer-fields.md) | update | 持续归档本次执行报告。 |

## 5. 测试与验证
- 已执行测试:
  - `bun test src/trace-boss/parser.test.ts`
  - `bun test src/trace-boss/commands.test.ts`
  - `bun test src/trace-boss/targets.test.ts`
- 测试结果:
  - parser tests: `8 pass / 0 fail`
  - commands tests: `2 pass / 0 fail`
  - target resolver tests: `1 pass / 0 fail`
- 已执行 live trace:
  - `bun run src/trace-boss.ts --no-screenshot`
- live trace 结果:
  - parser / unit tests 通过
  - fresh live trace 已完成 blocker sweep，不再卡在 `wait --url`
  - `chat-list-collected` 结果为 `0`，`target-wang-panpan` 仅能作为 `config-only` 兼容目标记录 `job-not-collected`
- `output/jobs.json` 已用保留的历史 raw job evidence 重建出 1 条 richer job record
  - issue 状态已回写为 `blocked`，并在 issue thread 发布 triage comment，指定 `CEOOrchestrator` 为 unblock owner
- 验证证据:
  - [`output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt`](/Users/dmeck/project/boss-agent/output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt) 保留了目标岗位的 richer raw job evidence
  - [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json) 现已恢复 1 条 richer job record
  - [`output/trace-report.md`](/Users/dmeck/project/boss-agent/output/trace-report.md) 记录了最新 blocker sweep 和 `job-not-collected`
- 未执行测试及原因:
  - 未额外跑全仓 build/test；本次问题聚焦在 trace parser / orchestration / browser locator 路径，已用 focused checks + live trace 覆盖
- 手动验证步骤:
  - 对比 raw job text、snapshot、trace event 和 `jobs.json`
  - 确认 company/company_scale/industry/recruiter/skills 的回退与 merge 逻辑修复后，parser 单测通过

## 6. 风险与阻塞
- 风险:
  - `skills` fallback 依赖当前 BOSS 页面结构和 description 文本词表，后续版式变化可能需要再调。
  - 详细岗位信息的可点击入口在当前浏览器会话中不稳定，text / css / role locator 都可能命中错误目标或无法触发 `job_detail` 导航。
- 阻塞:
  - 当前 live BOSS session 仍会落到 `https://www.zhipin.com/web/passport/zp/403.html?callbackUrl=...&code=32` 的 `访问受限` 页面，导致无法继续采集新的 job_detail 证据。
  - 最新 run 已能完成 blocker sweep，但只能产出 `job-not-collected`，不能稳定恢复新的 `job-collected`。
- 需要上游澄清的问题:
  - 是否要为 SUO-158 提供单目标执行路径，还是接受当前 discovered-coverage 运行契约后再回头补齐 live evidence。
  - 是否需要由 CEOOrchestrator 确认一个稳定的岗位入口 locator 策略，或刷新可用的 BOSS 登录 / 反风控状态。
- 恢复执行所需条件:
  - 提供稳定的 job-entry locator 或单目标执行路径
  - 重新确认 trace contract 不会被 discovered coverage 扩展打断
  - 恢复可访问的 BOSS session / auth state，避免 403 风控页

## 7. 完成状态
- [x] 已完成实现
- [x] 已完成测试
- [x] 已记录变更
- [ ] 已满足验收条件
- [ ] 可进入 review / audit
- [x] 已完成 fresh live blocker evidence

## 8. 回滚建议
- 回滚文件:
  - [`src/trace-boss/types.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/types.ts)
  - [`src/trace-boss/targets.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.ts)
  - [`src/trace-boss/orchestration.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/orchestration.ts)
  - [`src/trace-boss/parser.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.ts)
  - [`src/trace-boss/parser.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/parser.test.ts)
  - [`src/trace-boss/targets.test.ts`](/Users/dmeck/project/boss-agent/src/trace-boss/targets.test.ts)
  - [`config/boss.config.json`](/Users/dmeck/project/boss-agent/config/boss.config.json)
  - [`output/jobs.json`](/Users/dmeck/project/boss-agent/output/jobs.json)
  - [`output/trace-events.json`](/Users/dmeck/project/boss-agent/output/trace-events.json)
  - [`output/trace-report.md`](/Users/dmeck/project/boss-agent/output/trace-report.md)
- 回滚方式:
  - 恢复上述代码文件到变更前版本
  - 重新运行 `bun test src/trace-boss/parser.test.ts`
  - 如需保留当前 raw evidence，可单独保留 `output/raw/job-8e3f269966c0594d0nd92Nu8ElVZ.txt`
  - 如需撤销重建的 richer jobs.json，可删除 `output/jobs.json` 并恢复到空数组
- 注意事项:
  - 回滚后 `jobs.json` 会退回到缺少 richer fields 或出现噪声技能的状态
  - `output/` 下证据文件可通过重新跑 trace 覆盖，无需手工逐文件编辑

## 9. 总结
- 本次 SUO-158 的 parser / richer field 修复已经实现并通过单测。
- fresh live trace 已完成 blocker sweep，并明确记录了 `403.html` / `访问受限` 阻塞路径，不再卡在 `wait --url`。
- `output/jobs.json` 已用保留的历史 raw job evidence 重建出 1 条 richer job record，但当前 live session 仍无法恢复新的 `job_detail`。
- issue 已明确标记为 `blocked`，并补充了指向 `CEOOrchestrator` 的 unblock comment。
- 下一步应由 CEOOrchestrator 或上游 contract owner 提供稳定的单目标执行路径、确认可用的 job-entry locator，或恢复可访问的 BOSS session / auth state，再重新收口 live evidence。
