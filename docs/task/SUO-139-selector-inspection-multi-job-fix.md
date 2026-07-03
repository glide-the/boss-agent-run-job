# SUO-140 Task Package: SUO-139 Selector Inspection, Single-Session, and Multi-Job Collection

> Superseded by SUO-153 current-session binding correction. Historical context only; recommendation/unknown job URLs are not valid normal evidence.

## 1. 任务标题

为 `SUO-139` 产出 BOSS trace 后端任务包：显式 selector inspection、正常路径单会话采集、配置化多岗位采集。

## 2. 关联 Issue

- 当前任务包 Issue: [SUO-140](/SUO/issues/SUO-140)
- 上游目标 Issue: [SUO-139](/SUO/issues/SUO-139)
- 相关历史任务包: [SUO-133 task package](./SUO-133-boss-trace-flashing-fix.md)
- 设计输入: [design_001_boss_trace_chat_to_job_detail.md](../design/design_001_boss_trace_chat_to_job_detail.md)

输入说明：当前 workspace 缺少 `$PROJECT_ROOT/docs/issue/`，因此本任务包的 Issue 字段来自 Paperclip wake payload 与现有设计/任务文档，不引用本地 Issue 清单文件。

## 3. 任务目标

下游实现应把当前 BOSS trace 采集器整理成可验证的后端能力：

1. 正常 `bun run trace` 保持单次打开 chat 页面，并在同一 browser/session 中完成聊天列表、联系人、聊天上下文、岗位入口与岗位详情采集。
2. `--inspect-selectors` 只作为显式调试模式存在，输出必须标记为 inspection/debug evidence，不能混入正常完成证据。
3. 支持配置化多岗位/多联系人采集：遍历配置中的有限目标集合，复用同一会话返回 chat，不为每个目标重新 `open https://www.zhipin.com/web/geek/chat`。
4. 每个岗位输出都保留从当前详情页 URL 解析的唯一 `job_id`，并只包含当前岗位与当前公司信息。

## 4. 实现步骤

### 4.1 基线梳理

- 阅读 `src/trace-boss.ts`，列出所有生成 `agent-browser` 命令的路径。
- 确认正常模式、dry-run 模式、selector inspection 模式是否共用相同 launch 参数构造函数。
- 确认正常模式是否只生成一次 `open https://www.zhipin.com/web/geek/chat`。
- 确认 `conversationEntryLocators` 与 `jobEntryLocators` 的现有数据结构是否足够表达多岗位目标；不足时扩展配置 schema。

### 4.2 Selector inspection 隔离

- 保留 `--inspect-selectors` 为显式 opt-in 参数。
- 禁止正常 `bun run trace` 调用 broad selector probing。
- inspection 输出写入独立命名的 evidence，例如 `output/selector-inspection.json` 或 trace event `selector-inspection-*`。
- inspection 可执行额外 `open/read/count/snapshot`，但必须在报告中声明不是 normal collection evidence。
- 所有 selector 计数、locator 命中情况、失败原因要写入 `output/trace-events.json`。

### 4.3 单会话正常采集

- 正常模式必须以一个 batch/session 轨迹完成：
  - open chat once
  - wait/load
  - scroll chat list
  - snapshot/read chat list
  - click configured contact
  - snapshot/read current chat
  - click configured job entry
  - wait for `/job_detail/`
  - get current URL/title
  - snapshot/read focused job detail
- 每个目标之间返回 chat 时优先使用配置化 `returnToChat.method = browser-back`，不得重新 open chat。
- locator fallback 不得通过重复 open chat 探测实现；失败时记录 attempted locator、current URL、snapshot/raw path 和 failure reason。

### 4.4 多岗位/多联系人采集

- 支持有限、配置驱动的目标集合，避免变成站内爬取。
- 推荐配置结构：

```json
{
  "traceTargets": [
    {
      "id": "target-1",
      "conversationLocator": { "method": "find-text", "value": "王攀盼" },
      "jobEntryLocators": [
        { "method": "find-text", "value": "AI技术负责人/研发总监" }
      ]
    }
  ]
}
```

- 如果为了兼容继续使用 `conversationEntryLocators` + `jobEntryLocators`，必须明确遍历规则：
  - 每个 conversation locator 是一个目标联系人。
  - 每个联系人默认只点击配置的第一个 job locator，除非新 schema 明确声明多个岗位入口。
  - 多岗位点击必须有边界，例如每个联系人最多 N 个配置岗位入口。
- 每个目标生成稳定的 `target_id`，写入 `chats.json`、`jobs.json` 和 trace events。
- 单个目标失败不得中断整个批次，除非失败属于登录、风控、CAPTCHA、站点不可用或 browser/session 失效。

### 4.5 岗位详情输出边界

- `job_id` 的唯一来源是当前地址栏 URL：

```text
/job_detail/<job_id>.html
```

- `output/jobs.json` 每条记录至少包含：
  - `target_id`
  - `job_id`
  - `url`
  - `collectedAt`
  - `rawTextFile`
  - `snapshotFile`
  - 可解析出的 `title`、`salary`、`location`、`experience`、`education`、`company`、`recruiter`
- raw/snapshot 文件名优先使用 `job_id`，例如 `output/raw/job-<job_id>.txt`。
- 最终输出必须过滤以下无关区块：
  - 相似职位
  - 更多相似职位
  - 精选职位
  - 看过该职位的人还看了
  - 城市招聘
  - 热门职位
  - 推荐公司
  - 热门企业
  - 其它公司品牌信息
  - 其他公司品牌信息

### 4.6 Launch 参数集中化

- 所有 `agent-browser` 命令必须经过同一 base args 构造函数。
- 必需参数：

```text
--extension /Users/dmeck/agent-brower/capsolver-extension
--extension /Users/dmeck/agent-brower/stealth-extension
--state /Users/dmeck/agent-brower/my-auth.json
--headed
```

- `output/agent-browser-commands.log` 必须可证明每条 agent-browser 调用都包含这些参数。

## 5. 涉及文件路径

允许下游实现修改：

- [src/trace-boss.ts](/Users/dmeck/project/boss-agent/src/trace-boss.ts)
- [config/boss.config.json](/Users/dmeck/project/boss-agent/config/boss.config.json)
- [README.md](/Users/dmeck/project/boss-agent/README.md)
- [docs/boss-agent-browser-trace.md](/Users/dmeck/project/boss-agent/docs/boss-agent-browser-trace.md)
- [package.json](/Users/dmeck/project/boss-agent/package.json)，仅当新增必要验证脚本时修改

任务阶段新增/维护文件：

- [docs/task/TASK-REQUIREMENT-FORMAT.md](/Users/dmeck/project/boss-agent/docs/task/TASK-REQUIREMENT-FORMAT.md)
- [docs/task/SUO-139-selector-inspection-multi-job-fix.md](/Users/dmeck/project/boss-agent/docs/task/SUO-139-selector-inspection-multi-job-fix.md)

禁止下游实现修改：

- `$PROJECT_ROOT/docs/design/`
- `$PROJECT_ROOT/docs/issue/`
- `$PROJECT_ROOT/docs/stage/`
- `/Users/dmeck/agent-brower/capsolver-extension`
- `/Users/dmeck/agent-brower/stealth-extension`
- `/Users/dmeck/agent-brower/my-auth.json`
- secret、token、auth、browser profile 或无关项目文件

## 6. 输入 / 输出说明

输入：

- `config/boss.config.json` 中的 chat URL、scroll budget、conversation/job locator、return-to-chat 策略、排除区块列表与 agent-browser 配置。
- BOSS 当前登录态与可访问页面。
- 明确 opt-in 的 CLI 参数，例如 `--inspect-selectors`、`--dry-run`、`--no-screenshot`。

输出：

- `output/chat-list.json`: 单会话滚动得到的聊天列表。
- `output/chats.json`: 每个目标联系人对应的聊天上下文索引。
- `output/jobs.json`: 多岗位结构化输出，每条记录包含 `target_id` 与 `job_id`。
- `output/raw/chat-*.txt`: 每个目标的聊天原始证据。
- `output/raw/job-<job_id>.txt`: 每个岗位过滤后的详情文本。
- `output/snapshots/`: 交互与详情页 snapshot。
- `output/screenshots/`: 启用截图时的岗位详情截图。
- `output/trace-events.json`: 状态迁移、locator 尝试、selector inspection、URL 变化、阻塞与完成事件。
- `output/agent-browser-commands.log`: command-generation 证据。
- 可选 `output/selector-inspection.json`: selector inspection 汇总。

## 7. 依赖项

- Bun 与 TypeScript 工具链。
- `agent-browser` CLI 可用。
- BOSS 登录态有效。
- BOSS 页面没有被 CAPTCHA、风控或站点错误阻断。
- 设计文档中的 single-open/single-session/no-flashing 规则保持有效。

## 8. 测试策略

最小验证：

```bash
bun run check
bun run trace:dry
bun run trace
```

针对 selector inspection：

```bash
bun run trace -- --inspect-selectors
```

验收证据必须包含：

- `bun run check` 结果。
- 正常 `bun run trace` 的新鲜运行结果，或登录/CAPTCHA/风控/站点不可用的精确阻塞点。
- `output/agent-browser-commands.log` 中正常模式只有一次 `open https://www.zhipin.com/web/geek/chat` 的证据。
- 每条 agent-browser 命令包含两个 extension、state 和 `--headed` 的证据。
- 多目标运行时没有为每个目标重复 open chat 的证据。
- `output/jobs.json` 每条记录都有唯一 `job_id`。
- raw/snapshot/job JSON 均不包含被排除的推荐/无关公司区块。
- `--inspect-selectors` 输出被标记为 debug/inspection evidence，且不是正常完成证据。

如果真实 BOSS 运行被外部因素阻塞，下游实现仍需提供：

- 阻塞页面或步骤的 trace event。
- command-generation proof。
- 本地 parser/filter 单元级或脚本级验证，证明 `job_id` 解析与区块过滤逻辑正确。

## 9. 完成标志

- task 包已落地到 `docs/task/SUO-139-selector-inspection-multi-job-fix.md`。
- 下游 stage 可直接按 selector inspection、single-session flow、multi-job output、verification evidence 拆分执行。
- 实现完成后，正常模式和 inspection 模式有清晰边界。
- 实现完成后，多岗位采集是配置化、有限目标、单会话复用，而不是无边界爬取。
- 实现完成后，所有输出能回溯到 `target_id`、`job_id`、当前 URL 与对应 raw/snapshot 证据。

## 10. 风险提示

- `$PROJECT_ROOT/docs/issue/` 当前缺失，StagePlanner 如需严格 Issue 清单输入，应要求 IssueDispatcher 补齐或由 board 明确豁免。
- BOSS DOM、文本或风控策略变化可能导致 locator 失败；实现应记录失败证据，不应通过重复 open chat 掩盖问题。
- 多岗位采集容易扩大为抓取需求；本任务只允许配置化有限目标集合。
- 旧 `output/` 文件不能作为完成证据，除非下游实现明确刷新并记录运行时间。
- selector inspection 可能产生额外页面刷新；必须与正常路径证据隔离。
