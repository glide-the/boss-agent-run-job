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
- `jobEntryLocators`：联系人聊天区域里的岗位信息定位方式；默认只使用第一个作为单流程入口，避免反复尝试导致页面闪动
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
2. 在同一次打开中滚动聊天列表，保存完整列表到 `output/chat-list.json`
3. 点击 `conversationEntryLocators` 中配置的联系人
4. 保存聊天上下文到 `output/chats.json`、`output/raw/chat-*.txt`
5. 点击 `jobEntryLocators[0]` 对应岗位信息
6. 从地址栏 URL 解析 `job_id`，保存招聘信息到 `output/jobs.json`、`output/raw/job-<job_id>.txt`

如果需要调试页面区域 selector，再显式运行：

```bash
bun run trace -- --inspect-selectors
```

这个调试模式会做额外页面探测，页面会更频繁刷新，不建议作为正常采集方式。

## 输出

- `output/snapshots/`：chat 页面交互元素快照
- `output/chat-list.json`：滚动收集到的完整 chat 列表
- `output/raw/chat-*.txt`：联系人聊天信息原始文本
- `output/raw/job-*.txt`：岗位详情/招聘信息原始文本
- `output/screenshots/`：岗位详情页截图
- `output/chats.json`：结构化聊天采集记录
- `output/jobs.json`：结构化岗位信息
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
