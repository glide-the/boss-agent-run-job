# BOSS 直聘 agent-browser 轨迹采集清单

## 目标

采集 `agent-browser` 在 BOSS 直聘中从 chat 对话页进入具体岗位详情页的自动化轨迹，明确每一步的页面区域、点击方式、信息区域和采集方法，并沉淀为可复用脚本。normal flow 以左侧聊天列表所有对话的发现结果为 source of truth，`traceTargets` 和 `conversationEntryLocators` 只作为兼容 override。

## 入口

- 默认入口：`https://www.zhipin.com/web/geek/chat`
- 前置条件：浏览器中已有 BOSS 直聘登录态
- 推荐先运行：`bun run trace:dry`
- dry run 会打开 chat 页面并保存 snapshot，不会点击岗位

## 从 chat 到岗位详情页的路径

| 步骤 | 当前页面 | 动作 | 目标区域 | 推荐定位方式 | 等待策略 | 兜底 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | chat 首页 | 打开 URL | 整页 | `agent-browser open <startUrl>` | `wait --load networkidle` | 如果跳登录页，人工登录后重跑 |
| 2 | chat 对话页 | 滚动收集完整会话列表 | 会话列表 | `scroll down <px>` + `snapshot -i -u -c` | 每次滚动后短等待 | 滚动结束后在同一会话中滚回顶部 |
| 3 | chat 对话页 | 点击联系人 | 左侧列表发现结果，必要时叠加 `traceTargets[*].conversationLocator` 或兼容的 `conversationEntryLocators` override | `find text "<联系人>" click` 或配置的 CSS/role locator | `wait --load networkidle` | 保存 snapshot 后人工标注 selector |
| 4 | chat 对话页 | 点击岗位入口 | 当前 resolved target 内与当前会话绑定的首个有效 `jobEntryLocators` | `find text "职位详情" click`、`find text "查看职位" click`、`click "a[href*='/job_detail/']"` | `wait --url "**/job_detail/**"` 或 `wait --load networkidle` | 只接受当前会话里真实出现的首个有效岗位入口；正常模式每个 target 只记录 1 个 job，推荐页 / `job_sug_*` / `/recommend/` 不算有效岗位入口 |
| 5 | 岗位详情页 | 保存详情页文本 | 岗位详情主内容区 | `read` | `wait --load networkidle` | 先截图，再从 snapshot 定位主区域 |
| 6 | 岗位详情页 | 截图留证 | 当前视口 | `screenshot output/screenshots/job-N.png` | 无 | 关闭截图配置 |
| 7 | 岗位详情页 | 回到 chat | 当前浏览器历史 | `back` | `wait --load networkidle` | 多岗位/多联系人之间不在正常流程中重新 `open <startUrl>` |

## 信息区域清单

| 字段 | 页面区域 | 采集方法 | 输出字段 |
| --- | --- | --- | --- |
| 岗位标题 | 岗位详情头部 | `read` 后取首个有效短行，或使用标题 selector | `title` |
| 薪资 | 岗位标题附近 | 正则匹配 `10-20K`、`15K`、`10000-20000元/月` | `salary` |
| 城市/区域 | 岗位基础信息 | 城市名正则或 selector | `location` |
| 经验要求 | 岗位基础信息 | 匹配 `经验不限`、`3-5年`、`5年以上` | `experience` |
| 学历要求 | 岗位基础信息 | 匹配 `大专`、`本科`、`硕士` 等 | `education` |
| 岗位描述 | 详情正文 | raw text 后处理 | `description` |
| 技能关键词 | 岗位描述/标签区 | raw text 关键词抽取 | `skills` |
| 公司名称 | 公司信息区 | selector 或包含公司后缀的短行 | `company` |
| 公司规模 | 公司信息区 | 匹配人数规模文本 | `company_scale` |
| 行业 | 公司信息区 | selector 或行业词表匹配 | `industry` |
| 招聘者 | 右侧/顶部招聘者区 | 匹配 `HR`、`经理`、`招聘者` 等 | `recruiter` |
| 目标 ID | 配置目标 | `traceTargets[*].id` 或自动 `target-N` | `target_id` |
| 左侧索引 | 左侧聊天列表发现顺序 | discovery 结果中的稳定位置 | `leftIndex` |
| 目标 provenance | 左侧聊天列表发现结果 / 配置兜底 | 区分 `discovered`、`fallback`、`config-only` | `targetProvenance` |
| 岗位 ID | 浏览器地址栏 URL | 从 `/job_detail/<job_id>.html` 解析 | `job_id` |
| 页面 URL | 浏览器状态 | `get url` | `url` |
| 采集时间 | 本地运行时间 | `new Date().toISOString()` | `collectedAt` |

## 采集方法

1. Snapshot 采集  
   使用 `agent-browser snapshot -i -u -c` 保存可交互元素、链接文本和 href，用于定位 chat 页面中的岗位入口。

2. 文本定位点击  
   优先使用 `agent-browser find text "职位详情" click`、`agent-browser find text "查看职位" click`，避免依赖会失效的 `@eN`。

3. CSS selector 点击  
   对岗位详情链接使用 `a[href*='/job_detail/']`，对 BOSS 动态类名区域使用候选 selector，并放在配置文件中维护。

4. 页面文本读取  
   使用 `agent-browser read` 保存详情页可见文本，再用规则抽取字段。原始文本保留在 `output/raw/`，结构化结果保留在 `output/jobs.json`，并在 trace event 中记录 `leftIndex`、`targetProvenance` 和 `job_id`。

5. 截图校验  
   使用 `agent-browser screenshot` 保存岗位详情页截图，方便检查脚本点击是否进入了正确页面。

6. 轨迹事件记录  
   每一步写入 `output/trace-events.json`，包括打开页面、目标 `target_id`、`leftIndex`、`targetProvenance`、尝试 locator、点击成功、采集完成、失败原因。

7. Selector inspection  
   只有显式传入 `--inspect-selectors` 时才启用。inspection 命令追加到当前 `agent-browser batch/session`，在已经打开的页面中执行 `get count`，不得为每个 selector group、任务、联系人或 class probe 重新 `open https://www.zhipin.com/web/geek/chat`。输出写入 `output/selector-inspection.json`，并在 trace event 中标记为 debug-only evidence。

## 可自动化脚本清单

- `src/trace-boss.ts`：主采集脚本
- `config/boss.config.json`：入口 URL、滚动次数、候选 locator、输出目录
- `output/snapshots/`：chat 页面 snapshot
- `output/raw/`：岗位详情页原始文本
- `output/screenshots/`：岗位详情页截图
- `output/chats.json`：结构化聊天数据，包含 `target_id`、`leftIndex`、`targetProvenance`
- `output/jobs.json`：结构化岗位数据，包含 `target_id`、`leftIndex`、`targetProvenance` 与 URL 派生的 `job_id`
- `output/selector-inspection.json`：显式 selector inspection 的 debug-only 计数结果
- `output/trace-events.json`：轨迹事件日志

## 风险和限制

- BOSS 直聘可能要求登录，脚本不会保存或输入账号密码。
- 如果触发验证码或风控，脚本应停止，不能绕过。
- chat 列表可能使用虚拟滚动，未出现在视口中的岗位入口不会被 snapshot 捕获。
- `@eN` ref 每次 snapshot 都会变化，脚本不依赖固定 ref。
- 页面动态类名可能变化，CSS selector 需要根据 snapshot 调整。
- 正常流程只允许一次 `open https://www.zhipin.com/web/geek/chat`；selector 探测只能通过 `--inspect-selectors` 显式开启，且必须复用当前 session。
- 正常流程只遍历左侧聊天列表发现结果，不做无边界站内爬取；`traceTargets` / locator 配置只作为 override。单个目标只接受 1 个当前会话绑定 job，`maxJobs` 或全局 `maxJobsPerTarget` 仅作为历史兼容字段。
- 最终岗位文本会在写入 raw/snapshot/job JSON 前截断或过滤相似职位、热门职位、推荐公司、其他公司品牌信息等非当前岗位区域。
- `job_sug_*`、`/recommend/` 和其他推荐/发现链路的 URL 会被拒收，不算正常岗位入口。
- 建议小批量低频运行，避免对网站造成压力。

## 调参建议

首次运行：

```bash
bun run trace:dry
```

查看：

```bash
output/snapshots/chat-initial.txt
```

如果没有找到岗位入口，在 `config/boss.config.json` 中追加更稳定的 locator，例如：

```json
{
  "method": "css",
  "value": "a[href*='/job_detail/']",
  "description": "岗位详情页链接"
}
```
