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

## 浏览器可执行文件路径

本项目通过 Bun workspace 子包 `@boss-agent/resolve-chrome-executable` 自动查找 Chrome 可执行文件，并在启动 `agent-browser` 时传入 `--executable-path`。

```bash
bun run chrome:path
```

执行过程会先 `bun build` 打包 `scripts/resolve-chrome-executable/src/cli.ts`，再运行生成的 `dist/resolve-chrome-executable.js`。

相关文件：

- `scripts/resolve-chrome-executable/package.json`：Bun workspace 子包配置。
- `scripts/resolve-chrome-executable/src/resolve-chrome-executable.ts`：跨平台 Chrome 查找库。
- `scripts/resolve-chrome-executable/src/cli.ts`：CLI 入口。
- `scripts/resolve-chrome-executable/build.ts`：Bun 打包脚本。

如需显式指定 Chrome 路径，可在 `config/boss.config.json` 的 `agentBrowser.executablePath` 中写入绝对路径；设置 `agentBrowser.resolveExecutablePath: true` 时会自动解析。

## 账号切换与登录等待

打开 chat 页面后，脚本会先按 `config/boss.config.json` 的 `account` 配置执行账号切换，再等待登录完成，最后才开始采集聊天列表。

```json
"account": {
  "enabled": true,
  "strategy": "click-locator",
  "switchLocator": {
    "method": "find-text",
    "value": "切换账号"
  },
  "waitForLogin": true,
  "loginCheckUrl": "https://www.zhipin.com/web/geek/chat",
  "loginCheckSelectors": [".chat-container", ".chat-list", ".friend-list"],
  "loginPollIntervalMs": 3000,
  "loginTimeoutMs": 120000
}
```

- `enabled`：是否启用账号切换流程。
- `strategy`：`none`（不切换）、`click-locator`（点击指定元素）、`open-url`（打开指定 URL）。
- `switchLocator`：账号切换按钮的定位器，仅在 `strategy=click-locator` 时使用。
- `waitForLogin`：切换后是否等待登录完成。
- `loginCheckUrl` / `loginCheckSelectors`：判断已登录的 URL 和页面元素。
- `loginPollIntervalMs` / `loginTimeoutMs`：轮询间隔与超时。

如果未启用账号切换或已处于登录态，脚本会跳过等待直接进入采集。

## 单次执行链路（per-contact chain）

正常 `bun run trace` 流程被拆分为多个独立的 `agent-browser batch` 命令链：

1. 打开 chat 页面一次。
2. 切换账号并等待登录（如启用）。
3. 滚动采集完整聊天列表（一次 `batch`）。
4. 为左侧列表中每一个联系人分别执行一条 `per-contact batch`：
   - 点击联系人
   - 采集聊天信息 → `output/raw/chat-*.txt`
   - 点击当前会话绑定的岗位入口
   - 采集招聘信息 → `output/raw/job-*.txt`
   - 返回聊天列表
5. 当前联系人处理完成后关闭该 batch，再处理下一个联系人。

每个联系人的 batch 通过 `--session` / `--restore` 复用同一个浏览器会话，回退方式由 `perContactChain.returnToChatMethod` 控制：

```json
"perContactChain": {
  "returnToChatMethod": "browser-back"
}
```

可选值：

- `browser-back`：使用浏览器后退返回 chat 列表（默认，推荐）。
- `open-chat-url`：重新打开 `chatUrl` 返回。

这种拆分方式保证每个联系人的执行链路独立、可追踪、可恢复，也便于排查单点失败。

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

- `account`：账号切换与登录等待配置，控制是否在打开 chat 后切换账号并等待登录完成。
- `perContactChain`：per-contact batch 的回退策略，默认 `browser-back`。
- `agentBrowser.resolveExecutablePath` / `agentBrowser.executablePath`：是否自动解析或显式指定 Chrome 可执行文件路径。

## 运行

首次建议 dry run：

```bash
bun run trace:dry
```

确认 snapshot 中能看到岗位入口后运行：

```bash
bun run trace
```

默认 `trace` 按 per-contact chain 执行，不做 selector 全量探测：

1. 打开 BOSS chat。
2. 切换账号并等待登录完成（如 `account.enabled` 为 `true`）。
3. 滚动采集完整聊天列表，保存到 `output/chat-list.json`。
4. 以左侧列表发现结果为主，按发现顺序为每个联系人执行独立的 `per-contact batch`：
   - 点击联系人并采集聊天上下文 → `output/raw/chat-*.txt`
   - 点击当前会话绑定的第一个有效岗位入口
   - 采集岗位详情 → `output/raw/job-<job_id>.txt`
   - 通过 `perContactChain.returnToChatMethod` 返回列表，供下一个联系人复用会话
5. 汇总写入 `output/chats.json`、`output/jobs.json`，并保留 `target_id`、`leftIndex`、`targetProvenance`。

正常采集路径只生成一次 `open https://www.zhipin.com/web/geek/chat`。聊天列表采集完成后，每个联系人使用独立的 `agent-browser batch` 执行 per-contact chain，通过 `perContactChain.returnToChatMethod`（默认 `browser-back`）返回列表，不通过重新 `open` 入口页返回。每个 `target_id` 只接受一个 job；重复解析到同一 `target_id + job_id` 的岗位会被跳过，推荐页 / `job_sug_*` / `/recommend/` 链接不会被当作有效岗位入口。

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
