# boss-agent

Bun + agent-browser 的 BOSS 直聘轨迹采集项目，用来记录并执行单个流程：从 chat 列表点击联系人，采集聊天信息，再点击聊天里的岗位信息，采集招聘信息。

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
- `conversationEntryLocators`：chat 列表中的联系人定位方式
- `traceTargets`：有限目标集合；每个目标有稳定 `id`、联系人 locator、岗位入口 locator 列表和可选 `maxJobs`。如果 `traceTargets` 与 `conversationEntryLocators` 同时存在，会按 `traceTargets` 先执行，再补齐 `conversationEntryLocators` 中未重复的联系人继续执行。
- `maxJobsPerTarget`：没有在目标上单独设置 `maxJobs` 时，每个目标最多尝试的岗位入口数。超过岗位入口数量时会按 CSS locator 方式补齐，并按顺序执行不同命中的索引，避免单个 locator 重复绑定同一条岗位。
- `jobEntryLocators`：兼容旧配置的全局岗位入口 locator；当 `traceTargets[*].jobEntryLocators` 缺失时作为兜底
- `excludedJobSectionHeadings`：岗位详情中不需要采集的尾部推荐区域，如相似职位、精选职位、热门职位、推荐公司等

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
4. 按 `traceTargets` 中的有限目标点击联系人；未配置 `traceTargets` 时兼容遍历 `conversationEntryLocators`
5. 保存聊天上下文到 `output/chats.json`、`output/raw/chat-*.txt`
6. 在当前聊天里按配置的岗位入口 locator 继续尝试，最多 `maxJobs` / `maxJobsPerTarget` 个
7. 从地址栏 URL 解析 `job_id`，保存带 `target_id` 的招聘信息到 `output/jobs.json`、`output/raw/job-<job_id>.txt`

正常采集路径只生成一次 `open https://www.zhipin.com/web/geek/chat`。如果需要处理多个已配置联系人或同一联系人内的多个岗位入口，脚本通过浏览器后退返回 chat，不通过重新 `open` 入口页返回。重复解析到同一 `target_id + job_id` 的岗位会被跳过。

如果需要调试页面区域 selector，再显式运行：

```bash
bun run trace -- --inspect-selectors
```

这个调试模式只在当前 trace 的已有 `agent-browser batch/session` 末尾追加 `get count` 探测，不会为每个 selector group、任务或 class probe 重新打开 chat。探测结果写入 `output/selector-inspection.json` 和 `output/trace-events.json`，标记为 debug evidence，不作为正常采集完成证据。

## 输出

- `output/snapshots/`：chat 页面交互元素快照
- `output/chat-list.json`：滚动收集到的完整 chat 列表
- `output/raw/chat-*.txt`：按 `target_id` 保存的联系人聊天信息原始文本
- `output/raw/job-*.txt`：岗位详情/招聘信息原始文本
- `output/screenshots/`：岗位详情页截图
- `output/chats.json`：结构化聊天采集记录，包含 `target_id`
- `output/jobs.json`：结构化岗位信息，每条包含 `target_id`、URL 派生的 `job_id`、URL、raw/snapshot 路径
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

根据页面里真实出现的按钮文本或链接，调整 `config/boss.config.json` 的 `jobEntryLocators`。

### 采集字段不完整

当前脚本先保存原始文本，再用保守规则抽取标题、薪资、城市、经验、学历、公司、招聘者。后续可以基于实际 raw text 和 selector 扩展更精确的字段解析。

### 触发验证码或风控

停止脚本，人工处理。不要绕过验证码、风控或访问限制。

## 合规说明

仅采集当前账号有权限访问的页面信息；控制频率；不要绕过网站安全机制；不要采集与任务无关的个人敏感信息。
