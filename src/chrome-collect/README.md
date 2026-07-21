# chrome-collect - BOSS 直聘聊天采集脚本

来自会话 `019f7f85-5c66-7ba2-bfd8-241601970ef9`（及后续续采会话）的浏览器采集脚本，按模块拆分。脚本运行在 **Codex Chrome 插件的 node_repl 内核**中（不是普通 Node 进程），依赖内核提供的 `agent` / `browser` / `tab` / `nodeRepl` 全局对象。

## 运行环境

- 通过 Codex Chrome Extension 控制用户已登录的 Chrome（禁止本地 Playwright/Selenium 直连 BOSS）。
- 首次使用先执行 `browser.js` 中的 `setupChrome()` 完成 bootstrap。
- 本地文件可直接被内核 import（ESM）。

## 模块划分

| 模块 | 职责 |
| --- | --- |
| `browser.js` | Chrome 扩展 bootstrap、会话命名、标签页获取 |
| `chat-list.js` | 聊天列表滚动采集（列表是虚拟滚动，需滚轮加载） |
| `chat-extract.js` | 单个已打开会话提取：职位条 + 消息流 + 系统消息 + 已读状态 |
| `job-extract.js` | 「查看职位」新标签页认领与 JD/公司信息抽取 |
| `store.js` | JSONL 落盘、doneKeys 去重、队列构建（可与历史采集合并） |
| `collect-scroll.js` | 列表顺序扫场批量采集 |
| `collect-search.js` | 搜索框定位批量采集（列表只显示 50 条时的兜底方案） |
| `index.js` | 编排入口：setup -> 列表采集 -> 队列 -> 扫场 -> 搜索补漏 |

## 数据文件

- 原始落盘：`/tmp/boss_chats_raw.jsonl`（采集过程实时追加，防内核重置丢失）
- 工作区备份：`data/boss_chats_raw.jsonl`（本轮）、`data/chats_raw.jsonl`（上一轮 258 条含 JD）
- 全量列表快照：`data/boss_chatlist_now.json`（727 条）

## 注意事项

- BOSS 聊天列表会限流：连续打开几百个会话后，列表只返回前 50 条，此时用 `collect-search.js` 按「公司名/姓名」逐个搜索定位。
- 出现滑块/安全验证时采集器会记录 `captcha: true` 并停止。
- 只读操作：脚本不发送任何消息，不点击「发简历/换电话/换微信」。
