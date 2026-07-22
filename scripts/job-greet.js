// job-greet.js — 兼容入口：规范实现已迁移至 ../src/job-greet/（模块化）
// 保留原导出名（URLS / scanCards / scanAllWithScroll / extractJobDetail /
// checkChatPage / sendMessages / processJobByUrl / aiMsgs / algoMsgs / itMsgs /
// emotionMsgs），既有内核调用方式不变。
export {
  URLS,
  scanCards,
  scanAllWithScroll,
  extractJobDetail,
  checkChatPage,
  sendMessages,
  processJobByUrl,
  aiMsgs,
  algoMsgs,
  itMsgs,
  emotionMsgs,
  pmMsgs,
  pickMsgs,
} from "../src/job-greet/index.js";
