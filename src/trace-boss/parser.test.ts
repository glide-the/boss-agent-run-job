import { expect, test } from "bun:test";
import { cleanJobDetailText, extractRecruiter, extractSectionText, extractSkillChipLines, extractSkillTags, parseJobText } from "./parser";

const sampleJobText = `
# AI技术负责人/研发总监（优先第一个招）
8-12K
郑州 1-3年
本科
感兴趣
继续沟通
完善在线简历
新增附件简历
AI技术负责人/研发总监（优先第一个招）
8-12K
上海拔策网络科技
查看所有职位
下载App, 不错过Boss每一条消息
公司基本信息
上海拔策网络科技
20-99人
互联网
查看全部职位
职位描述
智能体
Agent
互联网/AI
岗位职责
负责公司智能体（Agent）体系整体技术规划、架构设计与技术路线决策。
主导从业务场景到智能体产品的需求拆解、方案设计、落地交付全流程。
搭建大模型应用技术栈：RAG、工具调用、工作流编排、多 Agent 协同、记忆与规划机制。
任职要求
本科及以上学历，计算机、软件工程、AI 相关专业，3年以上AI研发/团队负责
相似职位
别的岗位
`;

const fallbackCompanyJobText = `
# AI技术负责人/研发总监（优先第一个招）
8-12K
郑州 1-3年
本科
上海拔策网络科技
20-99人
互联网
职位描述
- 智能体
- Agent
- 互联来自网/AI
岗位职责
负责公司智能体（Agent）体系整体技术规划、架构设计与技术路线决策。
任职要求
本科及以上学历，AI 相关专业。
相似职位
别的岗位
`;

test("parseJobText extracts richer job-detail fields from the cleaned page text", () => {
  const cleaned = cleanJobDetailText(sampleJobText, []);
  const parsed = parseJobText(cleaned);

  expect(parsed.title).toBe("AI技术负责人/研发总监（优先第一个招）");
  expect(parsed.salary).toBe("8-12K");
  expect(parsed.location).toBe("郑州");
  expect(parsed.company).toBe("上海拔策网络科技");
  expect(parsed.company_scale).toBe("20-99人");
  expect(parsed.industry).toBe("互联网");
  expect(parsed.skills).toContain("智能体");
  expect(parsed.skills).toContain("Agent");
  expect(parsed.skills).toContain("AI");
  expect(parsed.skills).toContain("RAG");
  expect(parsed.skills).toContain("工具调用");
  expect(parsed.skills).toContain("工作流编排");
  expect(parsed.skills).toContain("多 Agent 协同");
  expect(parsed.description).toContain("负责公司智能体（Agent）体系整体技术规划");
  expect(parsed.description).toContain("多 Agent 协同");
  expect(parsed.description).not.toContain("任职要求");
});

test("parseJobText falls back to the top card company block when company heading is absent", () => {
  const cleaned = cleanJobDetailText(fallbackCompanyJobText, []);
  const parsed = parseJobText(cleaned);

  expect(parsed.company).toBe("上海拔策网络科技");
  expect(parsed.company_scale).toBe("20-99人");
  expect(parsed.industry).toBe("互联网");
  expect(parsed.skills).toEqual(["智能体", "Agent", "AI"]);
});

test("parseJobText normalizes fragmented skill phrases from archived job detail text", () => {
  const fragmentedSkillJobText = `
# AI技术负责人/研发总监（优先第一个招）
8-12K
郑州 1-3年
本科
上海拔策网络科技
20-99人
互联网
职位描述
智能体
Agent
RAG
Function Calling
Workflow
多 Agent 协同
记忆与规划机制
岗位职责
负责公司智能体（Agent）体系整体技术规划、架构设计与技术路线决策。
任职要求
本科及以上学历，AI 相关专业。
相似职位
别的岗位
`;

  const cleaned = cleanJobDetailText(fragmentedSkillJobText, []);
  const parsed = parseJobText(cleaned);

  expect(parsed.skills).toContain("Function Calling");
  expect(parsed.skills).toContain("多 Agent 协同");
  expect(parsed.skills).not.toContain("Function");
  expect(parsed.skills).not.toContain("Calling");
  expect(parsed.skills).not.toContain("多");
});

test("cleanJobDetailText drops common control noise and stops at excluded sections", () => {
  const cleaned = cleanJobDetailText(sampleJobText, []);

  expect(cleaned).not.toContain("感兴趣");
  expect(cleaned).not.toContain("继续沟通");
  expect(cleaned).not.toContain("查看全部职位");
  expect(cleaned).not.toContain("相似职位");
  expect(cleaned).not.toContain("别的岗位");
});

test("extractSkillTags normalizes boss-site artifacts", () => {
  const skills = extractSkillTags("智boss能体\nAgent\n互联直聘网/AI\n互联来自网");

  expect(skills).toEqual(["智能体", "Agent", "AI"]);
});

test("extractRecruiter prefers recruiter labels over requirement text", () => {
  const recruiter = extractRecruiter([
    "## 王攀盼",
    "刚刚活跃",
    "上海拔策网络科技·招聘者",
    "本科及以上学历，计算机、软件工程、AI 相关专业，3年以上 AI研发/团队负责人经验。"
  ]);

  expect(recruiter).toBe("上海拔策网络科技·招聘者");
});

test("extractSectionText prefers the fuller repeated section instead of early page chrome", () => {
  const repeatedSectionLines = `
### 职位描述
- control chrome
竞争力分析
### 职位描述
负责核心工作
岗位职责
推进项目落地
任职要求
本科及以上
相似职位
`;
  const lines = repeatedSectionLines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const section = extractSectionText(lines, ["职位描述"], ["竞争力分析", "相似职位"]);

  expect(section).toContain("负责核心工作");
  expect(section).toContain("推进项目落地");
  expect(section).not.toContain("control chrome");
});

test("extractSkillChipLines prefers short chip lines under the real section", () => {
  const lines = `
### 职位描述
- link "继续沟通" [ref=e1, url=javascript:;]
竞争力分析
### 职位描述
- 智能体
- Agent
- RAG
岗位职责
负责核心工作
`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const chips = extractSkillChipLines(lines);

  expect(chips).toEqual(["- 智能体", "- Agent", "- RAG"]);
});
