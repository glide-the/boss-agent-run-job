import fs from "node:fs";
import path from "node:path";

const INPUT = "/Users/dmeck/project/boss-agent/data/boss_collect_20260817_raw.jsonl";
const OUTPUT = "/Users/dmeck/project/boss-agent/data/derived/chat_feedback_20260817.json";
const RUN_DATE = "2026-08-17";
const YESTERDAY = "2026-08-16";

const trimText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const excerpt = (value, max = 50) => [...trimText(value)].slice(0, max).join("");

function visibleDateTime(value) {
  const text = trimText(value);
  if (!text) return { date: "待确认", datetime: "待确认" };
  if (text === "昨天") return { date: YESTERDAY, datetime: YESTERDAY };
  let match = text.match(/^昨天\s+(\d{2}:\d{2})$/);
  if (match) return { date: YESTERDAY, datetime: `${YESTERDAY} ${match[1]}` };
  match = text.match(/^(\d{2}:\d{2})$/);
  if (match) return { date: RUN_DATE, datetime: `${RUN_DATE} ${match[1]}` };
  match = text.match(/^(\d{1,2})月(\d{1,2})日(?:\s+(\d{2}:\d{2}))?$/);
  if (match) {
    const date = `2026-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    return { date, datetime: match[3] ? `${date} ${match[3]}` : date };
  }
  return { date: "待确认", datetime: text };
}

const ROLE_SUFFIXES = [
  "人力行政负责人", "高级Java开发工程师", "前端开发工程师", "高级开发工程师",
  "高级招聘专员", "高级招聘专家", "资深招聘专家", "技术负责人", "业务部负责人",
  "直播项目运营总监", "基础平台开发", "研发工程师", "后端技术专家", "java技术专家",
  "技术总监", "研发总监", "人事行政专员", "行政人事专员", "高级运营总监",
  "招聘负责人", "高级招聘HR", "高级招聘BP", "总经理助理", "办公室主任",
  "创始人CEO", "部门负责人", "人事总监", "人力总监", "项目运营总监",
  "招聘管理", "招聘主管", "招聘专员", "招聘经理", "招聘专家", "招聘顾问", "招聘HR",
  "人事主管", "人事经理", "人事专员", "行政人事", "资深人事", "AI产品经理", "产品经理", "销售经理",
  "技术专家", "后端开发", "技术开发", "收展员", "总经理", "部门经理",
  "HRBP", "hrbp", "HRM", "HRD", "HRG", "CHO", "CEO", "CTO",
  "招聘者", "招聘", "HR", "hr", "人事", "法人", "经理"
].sort((a, b) => b.length - a.length);

function companyVisible(record) {
  const title = trimText(record.titleBox);
  const name = trimText(record.name);
  let remainder = title.startsWith(name) ? title.slice(name.length) : title;
  for (const role of ROLE_SUFFIXES) {
    if (remainder.toLowerCase().endsWith(role.toLowerCase())) {
      remainder = remainder.slice(0, remainder.length - role.length);
      break;
    }
  }
  return trimText(remainder) || "待确认";
}

function annotateMessageTimes(flow) {
  const items = Array.isArray(flow) ? flow : [];
  const annotated = items.map((item, index) => ({ ...item, _index: index, _time: null }));
  for (let i = 0; i < annotated.length; i += 1) {
    if (annotated[i].kind !== "time") continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (annotated[j].kind === "msg") {
        annotated[j]._time = trimText(annotated[i].text);
        break;
      }
    }
  }
  return annotated.filter((item) => item.kind === "msg");
}

function readStatus(myMessages) {
  const last = myMessages.at(-1);
  if (!last) return "未知";
  const combined = `${trimText(last.read)} ${trimText(last.text)}`;
  if (/已读/.test(combined)) return "是";
  if (/送达/.test(combined)) return "否";
  return "未知";
}

function currentStatus(statusText, recruiterMessages, interviewMentioned) {
  if (interviewMentioned) return "面试";
  if (/不(?:太)?合适|不完全匹配|不太匹配|不完全吻合|不匹配|遗憾.*(?:寻找|职位需要)|抱歉.*(?:不匹配|特定需求)/.test(statusText)) return "拒绝";
  if (recruiterMessages.length > 0) return "沟通中";
  return "无反馈";
}

function interviewRound(allText) {
  if (/终面/.test(allText)) return "终面";
  if (/技术面|技术面试/.test(allText)) return "技术";
  if (/业务面|业务面试/.test(allText)) return "业务";
  if (/HR面|HR 面|人事面/.test(allText)) return "HR";
  return /面试|约面/.test(allText) ? "未知" : "未开始";
}

function firstDeliveryDate(myMessages, listTime) {
  if (myMessages.length === 0) return "待确认";
  const firstTimed = myMessages.find((item) => item._time);
  if (firstTimed) return visibleDateTime(firstTimed._time).date;
  return visibleDateTime(listTime).date;
}

function feedbackCycle(deliveryDate, recruiterMessages, initiated) {
  if (initiated || recruiterMessages.length === 0) return "待确认";
  const firstTimed = recruiterMessages.find((item) => item._time);
  if (!firstTimed) return "待确认";
  const replyDate = visibleDateTime(firstTimed._time).date;
  if (deliveryDate === "待确认" || replyDate === "待确认") return "待确认";
  const delta = Math.round((Date.parse(replyDate) - Date.parse(deliveryDate)) / 86400000);
  return delta >= 0 ? `${delta}天` : "待确认";
}

function nextAction(status, read) {
  if (status === "面试") return "准备面试";
  if (status === "拒绝") return "放弃";
  if (status === "沟通中") return "跟进";
  return read === "是" ? "跟进" : "待观察";
}

function confidence(record, messages, status, read) {
  if (record.error || record.searchMiss || record.captcha || !record.job?.raw) return "低";
  if (messages.length > 0 && (status !== "无反馈" || read !== "未知")) return "高";
  return "中";
}

function derive(record) {
  const messages = annotateMessageTimes(record.flow);
  const myMessages = messages.filter((item) => item.sender === "me");
  const recruiterMessages = messages.filter((item) => item.sender === "recruiter");
  const systemMessages = messages.filter((item) => item.sender === "system");
  const sysTexts = [...(record.sysTexts ?? []), ...systemMessages.map((item) => item.text)].map(trimText);
  const allText = [...messages.map((item) => trimText(item.text)), ...sysTexts].join(" ");
  const humanRecruiterTexts = recruiterMessages
    .map((item) => trimText(item.text))
    .filter((text) => text && !/^我想要一份您的附件简历/.test(text));
  const statusText = [...humanRecruiterTexts, ...sysTexts].join(" ");
  const interviewMentioned = /面试|约面/.test(allText);
  const firstMeIndex = myMessages[0]?._index ?? Number.POSITIVE_INFINITY;
  const recruiterInitiated = recruiterMessages.some((item) => item._index < firstMeIndex);
  const recruiterReplied = recruiterMessages.some((item) => item._index > firstMeIndex);
  const deliveryDate = firstDeliveryDate(myMessages, record.listTime);
  const listVisible = visibleDateTime(record.listTime);
  const flowTimes = (record.flow ?? []).filter((item) => item.kind === "time").map((item) => trimText(item.text));
  const lastVisibleTime = flowTimes.at(-1) || record.listTime;
  const lastCommunicationTime = visibleDateTime(lastVisibleTime).datetime;
  const read = readStatus(myMessages);
  const status = currentStatus(statusText, recruiterMessages, interviewMentioned);
  const resumeSent = sysTexts.some((text) => /附件简历.*已发送|简历.*已发送给Boss/.test(text)) ? "是" : "未知";
  const resumeDownloaded = /已下载.*简历|简历.*已下载/.test(allText) ? "是" : "未知";
  const humanFeedback = humanRecruiterTexts
    .slice(0, 3)
    .map((text) => excerpt(text));
  const evidence = [];
  for (const value of [record.job?.raw, ...humanFeedback, sysTexts[0], myMessages.at(-1)?.text, record.listLastMsg]) {
    const piece = excerpt(value);
    if (piece && !evidence.includes(piece)) evidence.push(piece);
    if (evidence.length >= 5) break;
  }
  return {
    key: record.key,
    delivery_date: deliveryDate,
    last_visible_date: listVisible.date,
    job_raw: trimText(record.job?.raw) || "待确认",
    recruiter_visible: trimText(record.name) || "待确认",
    company_visible: companyVisible(record),
    visible_identity_raw: trimText(record.titleBox) || "待确认",
    read_status: read,
    resume_sent: resumeSent,
    resume_downloaded: resumeDownloaded,
    recruiter_initiated: recruiterInitiated ? "是" : "否",
    recruiter_replied: recruiterReplied ? "是" : "否",
    interview_mentioned: interviewMentioned ? "是" : "否",
    interview_round: interviewRound(allText),
    current_status: status,
    feedback_cycle: feedbackCycle(deliveryDate, recruiterMessages, recruiterInitiated),
    last_communication_time: lastCommunicationTime,
    recruiter_key_feedback: humanFeedback.length ? humanFeedback : ["未提及"],
    next_action: nextAction(status, read),
    confidence: confidence(record, messages, status, read),
    raw_evidence_excerpts: evidence.length ? evidence : ["未提及"]
  };
}

const lines = fs.readFileSync(INPUT, "utf8").split(/\r?\n/).filter(Boolean);
const inputRecords = lines.map((line, index) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
});
const uniqueKeys = new Set(inputRecords.map((item) => item.key));
if (inputRecords.length !== 176 || uniqueKeys.size !== 176) {
  throw new Error(`Expected 176 records and keys; got records=${inputRecords.length}, keys=${uniqueKeys.size}`);
}

const outputRecords = inputRecords.map(derive);
if (outputRecords.length !== 176 || new Set(outputRecords.map((item) => item.key)).size !== 176) {
  throw new Error("Output cardinality validation failed");
}
for (const item of outputRecords) {
  for (const text of [...item.recruiter_key_feedback, ...item.raw_evidence_excerpts]) {
    if ([...text].length > 50) throw new Error(`Excerpt exceeds 50 chars for ${item.key}`);
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(outputRecords, null, 2)}\n`);

const countBy = (field) => Object.fromEntries([...new Set(outputRecords.map((item) => item[field]))]
  .sort().map((value) => [value, outputRecords.filter((item) => item[field] === value).length]));
const summary = {
  records: outputRecords.length,
  unique_keys: new Set(outputRecords.map((item) => item.key)).size,
  current_status: countBy("current_status"),
  read_status: countBy("read_status"),
  resume_sent: countBy("resume_sent"),
  resume_downloaded: countBy("resume_downloaded"),
  recruiter_initiated: countBy("recruiter_initiated"),
  recruiter_replied: countBy("recruiter_replied"),
  confidence: countBy("confidence"),
  interview_candidates: outputRecords.filter((item) => item.interview_mentioned === "是")
    .map((item) => ({ key: item.key, job_raw: item.job_raw, evidence: item.recruiter_key_feedback }))
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
