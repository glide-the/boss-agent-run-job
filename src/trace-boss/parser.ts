import type { Config, ChatListEntry, JobRecord } from "./types";
import { traceMarkerPrefix } from "./types";

export function extractChatListEntries(text: string): ChatListEntry[] {
  const seen = new Set<string>();
  const entries: ChatListEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/generic "([^"]{8,})" \[ref=e\d+\] clickable/);
    if (!match) continue;
    const value = match[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (seen.has(value)) continue;
    seen.add(value);
    const leftIndex = entries.length + 1;
    entries.push({ index: leftIndex, leftIndex, text: value });
  }
  return entries;
}

export function parseJobText(text: string): Partial<JobRecord> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.join("\n");
  const title = extractJobTitle(lines);
  const titleIndex = title ? lines.findIndex((line) => line === `# ${title}`) : -1;
  const detailSectionIndex = findJobDetailSectionIndex(lines);
  const topWindowEnd = detailSectionIndex >= 0
    ? detailSectionIndex
    : Math.min(lines.length, titleIndex >= 0 ? titleIndex + 8 : 8);
  const topWindow = titleIndex >= 0
    ? lines.slice(titleIndex + 1, topWindowEnd)
    : lines.slice(0, topWindowEnd);
  const companyInfoIndex = lines.findIndex((line) => line === "公司基本信息");
  const companyFromInfo = companyInfoIndex >= 0 ? extractCompanyName(lines, companyInfoIndex, title) : undefined;
  const companyInfoLines = companyInfoIndex >= 0 ? lines.slice(companyInfoIndex + 1, companyInfoIndex + 8) : [];
  const companyContextLines = companyInfoLines.length > 0 ? companyInfoLines : topWindow;
  const companyScale = findFirstMatchingLine(companyContextLines, /(?:\d+\s*[-~]\s*\d+\s*人|\d+\+?\s*人|\d+\s*-\s*\d+\s*人以上|\d+\s*人以下)/);
  const industry = findIndustryLine(companyContextLines, companyScale);
  const detailSectionLines = detailSectionIndex >= 0 ? lines.slice(detailSectionIndex) : lines;
  const description = extractSectionText(detailSectionLines, ["岗位职责"], ["技能标签", "任职要求", "相似职位", "公司基本信息", "工商信息"])
    || extractSectionText(detailSectionLines, ["职位描述"], ["岗位职责", "任职要求", "相似职位", "公司基本信息", "工商信息"]);
  const extractedSkills = extractSkillTags(
    extractSectionText(detailSectionLines, ["技能标签"], ["岗位职责", "任职要求", "相似职位", "公司基本信息", "工商信息"])
      || extractSectionText(detailSectionLines, ["职位描述"], ["岗位职责", "任职要求", "相似职位", "公司基本信息", "工商信息"])
  );
  const skillTermSource = [description, detailSectionLines.join("\n")].filter(Boolean).join("\n");
  const skillTerms = extractSkillTermsFromText(skillTermSource);
  const skills = extractedSkills.length > 0 && !looksLikeSkillNoise(extractedSkills)
    ? [...new Set([...extractedSkills, ...skillTerms])]
    : skillTerms;
  const companyBusinessIndex = findFirstIndexFrom(lines, /工商信息/, detailSectionIndex >= 0 ? detailSectionIndex : 0);
  const companyBusinessLines = companyBusinessIndex >= 0 ? lines.slice(companyBusinessIndex + 1, companyBusinessIndex + 8) : [];
  const detailedCompanyName = extractLabelValueFromLines(companyBusinessLines, "公司名称");
  const topCompanyName = extractCompanyName(topWindow, -1, title);

  return {
    title: title || firstMeaningfulLine(lines),
    salary: titleIndex >= 0
      ? matchFirst(lines.slice(titleIndex, titleIndex + 8).join("\n"), /(?:\d+\s*-\s*\d+|\d+)\s*K(?:·\d+薪)?|(?:\d+\s*-\s*\d+|\d+)\s*元\/月/i)
        || matchFirst(joined, /(?:\d+\s*-\s*\d+|\d+)\s*K(?:·\d+薪)?|(?:\d+\s*-\s*\d+|\d+)\s*元\/月/i)
      : matchFirst(joined, /(?:\d+\s*-\s*\d+|\d+)\s*K(?:·\d+薪)?|(?:\d+\s*-\s*\d+|\d+)\s*元\/月/i),
    location: titleIndex >= 0
      ? matchFirst(lines.slice(titleIndex, titleIndex + 6).join("\n"), /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/)
      : matchFirst(joined, /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/),
    experience: matchFirst(joined, /(经验不限|\d+\s*-\s*\d+年|\d+年以上|\d+年以内|在校\/应届)/),
    education: matchFirst(joined, /(学历不限|中专\/中技|高中|大专|本科|硕士|博士)/),
    description,
    skills: skills.length > 0 ? skills : undefined,
    company: detailedCompanyName || companyFromInfo || topCompanyName,
    company_scale: companyScale,
    industry,
    recruiter: extractRecruiter(detailSectionLines.filter((line) => line !== title))
  };
}

export function extractJobId(url: string) {
  return url.match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/)?.[1];
}

export function cleanJobDetailText(text: string, excludedHeadings: string[]) {
  const headings = excludedHeadings.length > 0
    ? excludedHeadings
    : ["相似职位", "更多相似职位", "精选职位", "看过该职位的人还看了", "城市招聘", "热门职位", "推荐公司", "热门企业"];
  const allLines = text.split(/\r?\n/);
  const startIndex = findJobContentStartIndex(allLines);
  const descriptionIndex = findJobDetailSectionIndex(allLines);
  const recommendationPattern = /相似职位|更多相似职位|精选职位|看过该职位的人还看了/;
  const footerPattern = /竞争力分析|BOSS 安全提示|工商信息|工作地址|更多职位|城市招聘|热门职位|推荐公司|热门企业/;
  const recommendationBeforeDescription = descriptionIndex >= 0
    ? findLastIndexBefore(allLines, recommendationPattern, descriptionIndex)
    : findLastIndexBefore(allLines, recommendationPattern, allLines.length);
  const topEndIndex = recommendationBeforeDescription >= 0 && (descriptionIndex < 0 || recommendationBeforeDescription < descriptionIndex)
    ? recommendationBeforeDescription
    : descriptionIndex >= 0
      ? descriptionIndex
      : allLines.length;
  const detailStartIndex = descriptionIndex >= 0 ? descriptionIndex : topEndIndex;
  const recommendationAfterDescription = descriptionIndex >= 0
    ? findFirstIndexFrom(allLines, recommendationPattern, descriptionIndex + 1)
    : -1;
  const footerIndex = descriptionIndex >= 0
    ? findFirstIndexFrom(allLines, footerPattern, descriptionIndex + 1)
    : findFirstIndex(allLines, footerPattern);
  const detailEndCandidates = [recommendationAfterDescription, footerIndex].filter((index) => index >= 0);
  const detailEndIndex = detailEndCandidates.length > 0 ? Math.min(...detailEndCandidates) : allLines.length;
  const lines = [
    ...allLines.slice(startIndex, topEndIndex),
    ...(detailStartIndex < detailEndIndex ? allLines.slice(detailStartIndex, detailEndIndex) : [])
  ];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const normalized = normalizeJobLine(line);
    if (containsExcludedJobHeading(normalized, headings)) continue;
    if (isExcludedJobNoise(normalized)) continue;
    if (isJobDetailControlNoise(normalized)) continue;
    if (line.includes(traceMarkerPrefix)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(line);
  }

  return `${cleaned.join("\n").trim()}\n`;
}

export function normalizeJobLine(line: string) {
  return line.replace(/^[-#\s]+/, "").trim();
}

export function containsExcludedJobHeading(line: string, headings: string[]) {
  return headings.some((heading) => line.includes(heading));
}

export function isExcludedJobNoise(line: string) {
  return [
    "相似职位",
    "更多相似职位",
    "精选职位",
    "看过该职位的人还看了",
    "竞争力分析",
    "BOSS 安全提示",
    "工商信息",
    "工作地址",
    "更多职位",
    "城市招聘",
    "热门职位",
    "推荐公司",
    "热门企业",
    "其它公司品牌信息",
    "其他公司品牌信息"
  ].some((keyword) => line.includes(keyword));
}

export function isJobDetailControlNoise(line: string) {
  return [
    "招聘中",
    "感兴趣",
    "继续沟通",
    "完善在线简历",
    "新增附件简历",
    "下载App, 不错过Boss每一条消息",
    "下载App，不错过Boss每一条消息",
    "微信扫码分享",
    "分享",
    "举报",
    "查看所有职位",
    "查看全部职位",
    "完善在线简历",
    "BOSS直聘"
  ].some((keyword) => line.includes(keyword));
}

export function firstMeaningfulLine(lines: string[]) {
  return lines.find((line) => line.length >= 2 && line.length <= 40 && !line.includes("BOSS直聘"));
}

export function matchFirst(text: string, regex: RegExp) {
  return text.match(regex)?.[0];
}

export function findLineAfterKeywords(lines: string[], keywords: string[]) {
  return lines.find((line) =>
    !line.startsWith("#") &&
    keywords.some((keyword) => line.includes(keyword)) &&
    line.length <= 60
  );
}

export function findFirstMatchingLine(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line));
}

export function extractJobTitle(lines: string[]) {
  for (const line of lines) {
    const hashMatch = line.match(/^#\s+(.+)$/);
    if (hashMatch) return hashMatch[1];

    const headingMatch = line.match(/heading\s+"([^"]+)"\s+\[level=1/i);
    if (headingMatch) return headingMatch[1];

    const quotedMatch = line.match(/「([^」]+?)招聘」/);
    if (quotedMatch) return quotedMatch[1];
  }

  return firstMeaningfulLine(lines);
}

export function findJobContentStartIndex(lines: string[]) {
  const startMarkers = [
    /heading\s+".*"\s+\[level=1/i,
    /^#\s+/,
    /职位描述/,
    /岗位职责/,
    /公司基本信息/
  ];
  const indexes = startMarkers
    .map((pattern) => lines.findIndex((line) => pattern.test(line)))
    .filter((index) => index >= 0);

  if (indexes.length === 0) return 0;
  return Math.max(0, Math.min(...indexes));
}

export function findFirstIndex(lines: string[], pattern: RegExp) {
  return lines.findIndex((line) => pattern.test(line));
}

export function findFirstIndexFrom(lines: string[], pattern: RegExp, startIndex: number) {
  for (let i = Math.max(0, startIndex); i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

export function findLastIndexBefore(lines: string[], pattern: RegExp, endIndex: number) {
  for (let i = Math.min(lines.length, endIndex) - 1; i >= 0; i--) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

export function findJobDetailSectionIndex(lines: string[]) {
  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/职位描述|技能标签/.test(lines[i])) {
      candidates.push(i);
    }
  }

  for (const index of candidates) {
    const window = lines.slice(index + 1, index + 12).join("\n");
    if (/岗位职责/.test(window) && /(智能体|Agent|互联网\/AI|来自BOSS直聘)/i.test(window)) {
      return index;
    }
  }

  const responsibilitiesIndex = findFirstIndex(lines, /岗位职责/);
  if (responsibilitiesIndex >= 0) {
    return Math.max(0, responsibilitiesIndex - 3);
  }

  return candidates.at(-1) ?? -1;
}

export function findIndustryLine(lines: string[], companyScale?: string) {
  const scaleIndex = companyScale ? lines.indexOf(companyScale) : -1;
  const candidates = scaleIndex >= 0 ? lines.slice(scaleIndex + 1) : lines.slice(1);
  return candidates.find((line) => {
    if (!line) return false;
    if (companyScale && line === companyScale) return false;
    if (/^\d/.test(line)) return false;
    if (line.length > 30) return false;
    return /互联网|人工智能|AI|科技|信息|网络|软件|电子商务|游戏|教育|金融|医疗|制造|电商|传媒|咨询|广告|物流|汽车|能源|房地产|旅游|餐饮/.test(line);
  }) || candidates.find((line) =>
    line &&
    line.length > 0 &&
    line.length <= 20 &&
    !/^\d/.test(line) &&
    !/(查看|职位|下载App|公司基本信息|BOSS直聘|感兴趣|继续沟通)/.test(line)
  );
}

export function extractCompanyName(lines: string[], companyInfoIndex: number, title?: string) {
  const candidates = companyInfoIndex >= 0
    ? [
      companyInfoIndex > 0 ? lines[companyInfoIndex - 1] : undefined,
      lines[companyInfoIndex + 1],
      lines[companyInfoIndex + 2],
      lines[companyInfoIndex + 3],
      lines[companyInfoIndex + 4]
    ]
    : lines.slice(0, 8);

  return candidates.find((line) => isLikelyCompanyName(line, title));
}

export function isLikelyCompanyName(line?: string, title?: string) {
  if (!line) return false;
  const normalized = line.trim();
  if (/^#\s+/.test(normalized) || /heading\s+"/i.test(normalized)) return false;
  if (title && normalized === title) return false;
  if (normalized.length > 40) return false;
  if (/^\d/.test(normalized)) return false;
  const cityMatch = normalized.match(/^(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/u);
  if (cityMatch) {
    const remainder = normalized.slice(cityMatch[0].length);
    if (!remainder || /^\s*(?:\d|经验|学历|本科|大专|硕士|博士|应届|在校|年)/u.test(remainder)) {
      return false;
    }
  }
  if (/^(互联网|人工智能|AI|科技|信息|网络|软件|公司|集团|招聘者|招聘经理|HR|人事)$/u.test(normalized)) {
    return false;
  }
  if (/(查看|职位|下载App|BOSS直聘|公司基本信息|感兴趣|继续沟通|完善在线简历|新增附件简历|招聘中|职位描述|岗位职责|任职要求|技能标签|工商信息|工作地址|竞争力分析|BOSS 安全提示)/.test(normalized)) {
    return false;
  }
  return /公司|科技|网络|信息|集团|有限公司|股份|控股|研究院|实验室|传媒|文化|教育|咨询|智能|软件|技术|开发|人才/.test(normalized)
    || /^[\u4e00-\u9fa5A-Za-z0-9·（）()&\-\s]{4,}$/.test(normalized);
}

export function extractLabelValueFromLines(lines: string[], label: string) {
  const compactLabel = label.replace(/\s+/g, "");
  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeJobLine(lines[i]).replace(/\s+/g, "");
    const index = normalized.indexOf(compactLabel);
    if (index < 0) continue;

    const value = normalized.slice(index + compactLabel.length).trim();
    if (value) return value;

    const nextLine = lines[i + 1];
    if (nextLine) {
      const nextValue = normalizeJobLine(nextLine).trim();
      if (nextValue) return nextValue;
    }
  }

  return undefined;
}

export function extractSectionText(lines: string[], startHeadings: string[], endHeadings: string[]) {
  const sectionLines = extractSectionLines(lines, startHeadings, endHeadings);
  if (sectionLines.length === 0) return undefined;
  return sectionLines.join("\n");
}

export function extractSectionLines(
  lines: string[],
  startHeadings: string[],
  endHeadings: string[],
  options: {
    maxLength?: number;
    rejectPatterns?: RegExp[];
  } = {}
) {
  const startIndexes = lines.flatMap((line, index) =>
    startHeadings.some((heading) => line.includes(heading)) ? [index] : []
  );
  if (startIndexes.length === 0) return [];

  const candidates = startIndexes.map((startIndex) => {
    const tail = lines.slice(startIndex + 1);
    const endIndex = tail.findIndex((line) => endHeadings.some((heading) => line.includes(heading)));
    const slice = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
    const filtered = slice.filter((line) => {
      if (!line) return false;
      if (options.maxLength && line.length > options.maxLength) return false;
      if (options.rejectPatterns?.some((pattern) => pattern.test(line))) return false;
      return true;
    });

    return {
      startIndex,
      lines: filtered,
      score: filtered.reduce((sum, line) => sum + (isLikelySectionContentLine(line) ? 1 : 0), 0)
    };
  }).filter((candidate) => candidate.lines.length > 0);

  if (candidates.length === 0) return [];

  candidates.sort((a, b) =>
    b.lines.length - a.lines.length ||
    b.score - a.score ||
    b.startIndex - a.startIndex
  );

  return candidates[0].lines;
}

export function extractSkillTags(text?: string) {
  if (!text) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();
  const lineBlacklist = [
    /^(岗位职责|任职要求|职位描述|技能标签|公司基本信息|加分项|核心亮点（招聘文案用）|查看全部职位|查看所有职位|下载App|感兴趣|继续沟通|完善在线简历|新增附件简历|举报|微信扫码分享)$/u,
    /^(BOSS直聘|互联网|互联网|首页|职位|公司|校园|海归|APP|有了|海外|项目外包|搜索|消息\d*|简历|AI简历|智能简历生成|简历更新|自动识别新简历|在线编辑|匹配优质岗位|附件简历制作|打动HR的专业简历|附件上传|快速投递心仪职位|张毛峰|升级VIP尊享\d+大求职权益去升级|个人中心查看面试投递状态|编辑在线简历|规则中心|账号与安全中心待优化|隐私保护|消息通知|切换为招聘者|退出登录|去看看|招聘中)$/u
  ];

  for (const line of text.split(/\r?\n/)) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    if (lineBlacklist.some((pattern) => pattern.test(normalized))) {
      continue;
    }

    const compact = normalized.replace(/^[-•·*]\s*/, "");
    const hasBullet = /^[-•·*]\s*/.test(normalized);
    if (!hasBullet && (compact.length > 24 || /[。！？；;：:]/.test(compact))) {
      continue;
    }

    for (const token of compact.split(/[、，,/|·]+|\s{2,}|\s+/u)) {
      const skill = normalizeSkillToken(token);
      if (!skill) continue;
      if (/^[-•·*]+$/.test(skill)) continue;
      if (skill.length > 24) continue;
      if (/^互联(?:来自)?网$/u.test(skill) || skill === "互联网") continue;
      if (lineBlacklist.some((pattern) => pattern.test(skill))) {
        continue;
      }
      if (seen.has(skill)) continue;
      seen.add(skill);
      ordered.push(skill);
    }
  }

  return ordered;
}

export function extractRecruiter(lines: string[]) {
  const recruiterKeywords = ["招聘者", "HR", "人事", "经理", "负责人"];
  const filtered = lines.filter((line) => line.length > 0);
  const headingIndex = filtered.findIndex((line) => /^##\s+/.test(line));
  const preferredWindow = headingIndex >= 0 ? filtered.slice(headingIndex, headingIndex + 12) : filtered;

  return (
    preferredWindow.find((line) => isLikelyRecruiterLine(line, recruiterKeywords))
    || filtered.find((line) => isLikelyRecruiterLine(line, recruiterKeywords))
  );
}

function isLikelyRecruiterLine(line: string, recruiterKeywords: string[]) {
  if (!recruiterKeywords.some((keyword) => line.includes(keyword))) return false;
  if (line.length > 40) return false;
  if (/(学历|经验|技术|项目|能力|方案|团队|业务|研发|Python|Java|Go|岗位职责|任职要求)/.test(line)) {
    return false;
  }
  return true;
}

function normalizeSkillToken(token: string) {
  return token
    .replace(/boss/ig, "")
    .replace(/直聘/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSkillChipLines(lines: string[]) {
  const startIndexes = lines.flatMap((line, index) =>
    line.includes("职位描述") ? [index] : []
  );
  if (startIndexes.length === 0) return [];

  const candidates = startIndexes.map((startIndex) => {
    const tail = lines.slice(startIndex + 1, startIndex + 8);
    const chipLines = tail.filter(isLikelySkillChipLine);
    return {
      startIndex,
      chipLines
    };
  }).filter((candidate) => candidate.chipLines.length > 0);

  if (candidates.length === 0) return [];

  candidates.sort((a, b) =>
    b.chipLines.length - a.chipLines.length ||
    b.startIndex - a.startIndex
  );

  return candidates[0].chipLines;
}

const skillTermPatterns: Array<[RegExp, string]> = [
  [/智能体/u, "智能体"],
  [/\bAgent\b/u, "Agent"],
  [/\bRAG\b/u, "RAG"],
  [/\bFunction\s+Calling\b/u, "Function Calling"],
  [/\bWorkflow\b/u, "Workflow"],
  [/工具调.?用/u, "工具调用"],
  [/工作流编排/u, "工作流编排"],
  [/多\s*Agent\s*协同/u, "多 Agent 协同"],
  [/记忆与规划机制/u, "记忆与规划机制"],
  [/记忆/u, "记忆"],
  [/规划机制/u, "规划机制"],
  [/\b后端\b/u, "后端"],
  [/\b服务端\b/u, "服务端"],
  [/\bPython\b/u, "Python"],
  [/\bJava\b/u, "Java"],
  [/\bGo\b/u, "Go"],
  [/\bGitHub\b/u, "GitHub"],
  [/\bAPI\b/u, "API"],
  [/\bAI\b/u, "AI"],
  [/人工智能/u, "人工智能"],
  [/大模型/u, "大模型"],
  [/云服务/u, "云服务"],
  [/向量库/u, "向量库"],
  [/中间件/u, "中间件"],
  [/团队管理/u, "团队管理"],
  [/项目统筹/u, "项目统筹"],
  [/跨部门协同/u, "跨部门协同"],
  [/风险把控/u, "风险把控"],
  [/数据安全/u, "数据安全"],
  [/合规/u, "合规"],
  [/需求拆解/u, "需求拆解"],
  [/技术选型/u, "技术选型"],
  [/研发规范/u, "研发规范"],
  [/质量管控/u, "质量管控"],
  [/企业级/u, "企业级"],
  [/场景化/u, "场景化"],
  [/产品落地/u, "产品落地"],
];

export function extractSkillTermsFromText(text?: string) {
  if (!text) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();
  const normalizedText = text.replace(/\s+/g, " ");
  for (const [pattern, term] of skillTermPatterns) {
    if (!pattern.test(normalizedText)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    ordered.push(term);
  }

  return ordered;
}

function looksLikeSkillNoise(skills: string[]) {
  return skills.some((skill) =>
    /^(heading|link|button|url=|ref=|\[level=|\[ref=|BOSS直聘|BOSS|首页|职位|公司|校园|海归|APP|有了|海外|项目外包|搜索|消息|简历|AI简历|智能简历生成|简历更新|自动识别新简历|在线编辑|匹配优质岗位|附件简历制作|打动HR的专业简历|附件上传|快速投递心仪职位|升级VIP尊享|个人中心查看面试投递状态|编辑在线简历|规则中心|账号与安全中心待优化|隐私保护|消息通知|切换为招聘者|退出登录|去看看|招聘中|感兴趣|继续沟通|完善在线简历|新增附件简历|下载App|微信扫码分享|举报|王攀盼|刚刚活跃|竞争力分析|安全提示|请立即举报|Function|Calling|^多$)$/i.test(skill)
  );
}

function isLikelySectionContentLine(line: string) {
  const normalized = normalizeJobLine(line);
  if (!normalized) return false;
  if (/^(岗位职责|任职要求|职位描述|技能标签|公司基本信息|竞争力分析|BOSS 安全提示|工商信息|工作地址|更多职位|精选职位)$/u.test(normalized)) {
    return false;
  }
  if (/^\s*[-#]/.test(line)) return false;
  return normalized.length > 1;
}

function isLikelySkillChipLine(line: string) {
  const trimmed = line.replace(/\s+/g, " ").trim();
  const normalized = normalizeJobLine(line);
  if (!normalized) return false;
  if (/^(岗位职责|任职要求|职位描述|技能标签|公司基本信息|竞争力分析|BOSS 安全提示|工商信息|工作地址|更多职位|精选职位|加分项|核心亮点（招聘文案用）)$/u.test(normalized)) {
    return false;
  }
  if (/(link|button|url=|ref=|heading|首页|职位|公司|校园|海归|APP|有了|海外|项目外包|搜索|消息|简历|AI简历|智能简历生成|简历更新|自动识别新简历|在线编辑|匹配优质岗位|附件简历制作|打动HR的专业简历|附件上传|快速投递心仪职位|张毛峰|升级VIP尊享\d+大求职权益去升级|个人中心查看面试投递状态|编辑在线简历|规则中心|账号与安全中心待优化|隐私保护|消息通知|切换为招聘者|退出登录|去看看|招聘中|感兴趣|继续沟通|完善在线简历|新增附件简历|下载App|微信扫码分享|举报)/i.test(normalized)) {
    return false;
  }
  if (!/^[-•·*]\s*\S+/.test(trimmed)) return false;
  if (normalized.length > 40) return false;
  return true;
}

export function looksLikeJobDetail(url: string, config: Config) {
  if (url.includes("/job_detail/")) return true;
  const simplifiedPattern = config.jobDetailUrlPattern.replaceAll("*", "");
  return simplifiedPattern.length > 0 && url.includes(simplifiedPattern);
}

export function isRecommendedJobUrl(url: string) {
  try {
    const parsed = new URL(url);
    const ka = parsed.searchParams.get("ka")?.toLowerCase() || "";
    return (
      ka.startsWith("job_sug") ||
      ka.includes("recommend") ||
      parsed.pathname.includes("/recommend/")
    );
  } catch {
    const normalized = url.toLowerCase();
    return normalized.includes("ka=job_sug") || normalized.includes("/recommend/");
  }
}

export function extractMarkedSegment(output: string, startLabel: string, endLabel: string) {
  const startMarker = `${traceMarkerPrefix}${startLabel}`;
  const endMarker = `${traceMarkerPrefix}${endLabel}`;
  const startIndex = output.indexOf(startMarker);
  if (startIndex < 0) return "";

  const segmentStart = output.indexOf("\n", startIndex);
  const endIndex = output.indexOf(endMarker, segmentStart >= 0 ? segmentStart : startIndex);
  const rawSegment = output.slice(segmentStart >= 0 ? segmentStart + 1 : startIndex, endIndex >= 0 ? endIndex : undefined);
  return rawSegment
    .split(/\r?\n/)
    .filter((line) => !line.includes(traceMarkerPrefix))
    .join("\n")
    .trim();
}

export function lastUrl(text: string) {
  const standalone = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\/\S+$/.test(line));
  if (standalone.length > 0) return standalone.at(-1) || "";

  const matches = text.match(/https?:\/\/[^\s)"\]]+/g);
  return matches?.at(-1) || "";
}

export function lastInteger(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  return Number.parseInt(lines.at(-1) || "0", 10);
}

export function lastNonEmptyLine(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("✓"))
    .filter((line) => !line.startsWith("[agent-browser]"))
    .filter((line) => !line.startsWith("- "));
  return lines.at(-1) || "";
}
