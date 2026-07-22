# job-greet — BOSS 直聘岗位「立即沟通」自动化模块

来源：会话 `019f830d-30c9-7101-82f8-412a07c9eb14`、`019f82ec-e662-7893-bc07-f943e5563bcc` 及本次会话沉淀的浏览器操作脚本，模块化整理。

## 运行环境

- 仅在 **Codex Chrome 插件的 node_repl 内核**中运行（依赖内核 `agent`/`browser`/`tab`/`nodeRepl` 全局对象）。
- 禁止本地 Playwright/Selenium/Puppeteer 直连 BOSS。
- 通过 `tab.playwright`（浏览器内受控 API）完成全部页面操作。

## 模块划分

| 模块 | 职责 |
| --- | --- |
| `browser.js` | Chrome 扩展 bootstrap、会话命名、标签页获取（幂等，内核重置后可重连） |
| `urls.js` | 目标分类稳定搜索 URL 与编排定义（AI自动化/AI解决方案/AI情感陪伴·杭州，含历史 IT技术支持·杭州、算法工程师·北京） |
| `scan.js` | 列表卡片扫描、滚动加载（连续两次无新增即停） |
| `detail.js` | 岗位详情自动校验（标题/JD/按钮）、风控与沟通上限检测 |
| `chat.js` | 聊天输入框分句发送（每句一条，Enter 发送） |
| `filter.js` | 筛选规则（实习/销售/客服/运营/标注等非目标岗位跳过）、标题去重、队列构建 |
| `messages.js` | 求职消息模板：AI 技术 / AI 产品 / IT 支持 / 情感陪伴 / 算法（首句贴合岗位，其余取自简历） |
| `process.js` | 单岗位全流程（直达详情→校验→立即沟通→发送）与批处理 `runChunk` |
| `progress.js` | JSONL 进度落盘、doneKeys/processedIds 断点恢复 |
| `index.js` | 编排入口 `processCategory`：扫描→过滤→分批沟通，触发平台限制即停 |

## 用法示例（node_repl 内核）

```js
const JG = await import("/Users/dmeck/project/boss-agent/src/job-greet/index.js");
const { tab } = await JG.setupChrome();
const progress = await JG.createProgress(JG.PROGRESS_FILE, ["<历史已处理jobId>"]);
// 处理单个分类（内部分批，默认每批 5 个）
const summary = await JG.processCategory(tab, JG.CATEGORIES[0], progress, {
  chunkSize: 5,
  onBatch: async (results, remaining) => console.log(`batch done, remaining=${remaining}`),
});
```

## 注意事项

- BOSS 列表每次渲染会重新生成加密 jobId，跨页去重必须用「岗位标题」（doneKeys 双向前缀匹配），不能依赖 jobId。
- 详情页按钮显示「继续沟通」的岗位一律跳过（此前已建立沟通，避免重复打扰）。
- 出现滑块/安全验证/沟通上限时记录 `blocked`/`daily-limit` 并停止，不做任何绕过。
- 数据落盘：`data/job_greet_progress.jsonl`，断点续跑时先 `createProgress` 恢复。
