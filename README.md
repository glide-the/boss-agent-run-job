# boss-agent

Bun + agent-browser 的 BOSS 直聘轨迹采集项目，用来记录并执行以左侧聊天列表所有对话为 source of truth 的单条轨迹：从 chat 列表发现联系人，采集聊天信息，再点击当前会话绑定的岗位信息，采集招聘信息。

## 前置条件

- 已安装 Bun
- 已安装 agent-browser
- 当前浏览器会话已有 BOSS 直聘登录态

安装 agent-browser：

```bash
npm i -g agent-browser
agent-browser install
```

## 安装

```bash
cd /Users/dmeck/project/boss-agent
bun install
```

## 配置

编辑：

```bash
config/boss.config.json
```

关键配置：

- `startUrl`：chat 页面入口
- `chatListScrolls` / `chatListScrollPixels`：一次打开 chat 后滚动收集完整聊天列表
- `screenshot`：是否截图
- `conversationEntryLocators`：左侧对话发现的兼容覆盖输入；正常流程以左侧列表发现结果为 source of truth，不再把单个联系人写死为默认目标
- `traceTargets`：可选的 per-target override；如果配置，会与左侧列表发现结果合并，并保留 `target_id`、`leftIndex`、`targetProvenance`，不要把它当成单目标 normal flow 的全集
- `maxJobsPerTarget`：历史兼容字段，不再驱动 normal flow 的多岗位扩张；正常流程只记录一个当前会话绑定 job
- `jobEntryLocators`：当前会话里岗位入口的兼容候选；只接受第一个有效项，推荐页 / 未知岗位不要写入正常链路
- `excludedJobSectionHeadings`：岗位详情中不需要采集的尾部推荐区域，如相似职位、精选职位、热门职位、推荐公司等
- `jobInfoSelectors`：岗位详情页字段 selector 的预留配置，当前采集主要依赖 raw text 后处理，后续可继续扩展

## 运行

首次建议 dry run：

```bash
bun run trace:dry
```

确认 snapshot 中能看到岗位入口后运行：

```bash
bun run trace
```

默认 `trace` 只执行单流程，不做 selector 全量探测：

1. 打开 BOSS chat
2. 在同一个 agent-browser `batch` 中滚动聊天列表，保存完整列表到 `output/chat-list.json`
3. 在同一浏览器会话内滚回列表顶部，不重新打开 chat
4. 以左侧列表发现结果为主，按发现顺序点击联系人；`traceTargets` 和 `conversationEntryLocators` 只作为兼容 override
5. 保存聊天上下文到 `output/chats.json`、`output/raw/chat-*.txt`，并写入 `target_id`、`leftIndex`、`targetProvenance`
6. 在当前聊天会话绑定的岗位入口里只接受第一个有效项，每个 target 只记录 1 个 job
7. 从地址栏 URL 解析 `job_id`，保存带 `target_id`、`leftIndex`、`targetProvenance` 的招聘信息到 `output/jobs.json`、`output/raw/job-<job_id>.txt`，并补充 `description`、`skills`、`company_scale`、`industry`

正常采集路径只生成一次 `open https://www.zhipin.com/web/geek/chat`。如果需要处理多个已发现联系人，脚本通过浏览器后退返回 chat，不通过重新 `open` 入口页返回。每个 `target_id` 只接受一个 job；重复解析到同一 `target_id + job_id` 的岗位会被跳过，推荐页 / `job_sug_*` / `/recommend/` 链接不会被当作有效岗位入口。

如果需要调试页面区域 selector，再显式运行：

```bash
bun run trace -- --inspect-selectors
```

这个调试模式只在当前 trace 的已有 `agent-browser batch/session` 末尾追加 `get count` 探测，不会为每个 selector group、任务或 class probe 重新打开 chat。探测结果写入 `output/selector-inspection.json` 和 `output/trace-events.json`，标记为 debug evidence，不作为正常采集完成证据。debug 路径必须复用 normal flow 的 target cardinality。

## 输出

- `output/snapshots/`：chat 页面交互元素快照
- `output/chat-list.json`：滚动收集到的完整 chat 列表
- `output/raw/chat-*.txt`：按 `target_id` 保存的联系人聊天信息原始文本
- `output/raw/job-*.txt`：岗位详情/招聘信息原始文本
- `output/screenshots/`：岗位详情页截图
- `output/chats.json`：结构化聊天采集记录，包含 `target_id`、`leftIndex`、`targetProvenance`
- `output/jobs.json`：结构化岗位信息，每条包含 `target_id`、`leftIndex`、`targetProvenance`、URL 派生的 `job_id`、URL、`description`、`skills`、`company_scale`、`industry` 以及 raw/snapshot 路径
- `output/selector-inspection.json`：显式 `--inspect-selectors` 的 debug-only selector 计数证据
- `output/trace-events.json`：自动化轨迹事件

## 登录态

如果运行后进入登录页，请先手动登录 BOSS 直聘，再重新运行脚本。脚本不会读取、保存或输入账号密码。

## 常见问题

### 没有点击到岗位详情

先看：

```bash
output/snapshots/chat-initial.txt
```

根据页面里真实出现的按钮文本或链接，调整 `config/boss.config.json` 的 `jobEntryLocators`。正常流程只保留当前会话里真实绑定的首个有效岗位入口，不要把推荐页或未知岗位写进正常配置。

### 采集字段不完整

当前脚本会保存原始文本，并用保守规则抽取标题、薪资、城市、经验、学历、岗位描述、技能标签、公司、公司规模、行业和招聘者。若页面结构变化，再基于实际 raw text 和 selector 调整字段解析。左侧列表发现的顺序、`leftIndex` 和 `targetProvenance` 需要和输出一起保留，方便 coverage audit。

### 触发验证码或风控

停止脚本，人工处理。不要绕过验证码、风控或访问限制。

## 合规说明

仅采集当前账号有权限访问的页面信息；控制频率；不要绕过网站安全机制；不要采集与任务无关的个人敏感信息。
