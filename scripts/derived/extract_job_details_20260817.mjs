import fs from 'node:fs';

const collectPath = new URL('../../data/boss_collect_20260817_raw.jsonl', import.meta.url);
const detailPath = new URL('../../data/boss_jd_20260817_raw.jsonl', import.meta.url);
const outputPath = new URL('../../data/derived/job_details_structured_20260817.json', import.meta.url);

const readJsonl = (url) => fs.readFileSync(url, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unsupported = '未提及';

function parseStrip(rawValue) {
  const raw = clean(rawValue).replace(/\s*查看职位$/, '');
  const cityMatch = raw.match(/\s(杭州|北京|上海|深圳|广州|成都|南京|苏州|武汉|西安|合肥|宁波|远程)$/);
  const city = cityMatch?.[1] ?? unsupported;
  const withoutCity = cityMatch ? raw.slice(0, cityMatch.index).trim() : raw;
  const salaryPattern = /(?:\d+(?:\.\d+)?-\d+(?:\.\d+)?K(?:·\d+薪)?|\d+-\d+元\/(?:时|天|月))(?:\s*)$/i;
  const salaryMatch = withoutCity.match(salaryPattern);
  const salary = salaryMatch?.[0]?.trim() ?? unsupported;
  const jobName = salaryMatch
    ? withoutCity.slice(0, salaryMatch.index).replace(/^兼职·/, '').trim()
    : withoutCity.replace(/^兼职·/, '').trim();
  return {
    raw_job_strip: clean(rawValue),
    original_job_name: jobName || unsupported,
    salary,
    city,
  };
}

function companyFromTitle(titleValue) {
  const title = clean(titleValue);
  const match = title.match(/_(.+?)(?:招聘-BOSS直聘|\d{4}年)/);
  return match?.[1]?.trim() || unsupported;
}

function pageSummary(detail) {
  const info = String(detail.infoPrimary ?? '');
  const lines = info.split(/\r?\n/).map(clean).filter(Boolean);
  const locationLine = lines.find((line) => /(?:杭州|北京|上海|深圳|广州|成都|南京|苏州|武汉|西安|合肥|宁波|远程)/.test(line)) ?? '';
  const experienceMatch = locationLine.match(/(经验不限|在校\/应届|应届|1年以内|1-3年|3-5年|5-10年|10年以上)/);
  const educationMatch = locationLine.match(/(学历不限|初中及以下|中专\/中技|高中|大专|本科|硕士|博士)/);
  return {
    experience: clean(detail.exp) || experienceMatch?.[1] || unsupported,
    education: clean(detail.edu) || educationMatch?.[1] || unsupported,
  };
}

const responsibilityHeading = /^(?:一、|二、|三、|\d+[.、]\s*)?(?:你的)?(?:核心)?(?:岗位|工作)?(?:职责|工作内容)|^主要职责|^职位描述[:：]?$/i;
const requirementHeading = /^(?:一、|二、|三、|\d+[.、]\s*)?(?:我们的)?(?:硬性核心)?(?:任职要求|职位要求|岗位要求|任职资格|硬性要求)|^要求[:：]?$/i;
const bonusHeading = /^(?:\[|【)?(?:优先)?加分项|^我们将提供|^福利待遇/i;
const genericHeading = /^(?:一、|二、|三、|四、|五、)?[^。；]{1,24}(?:职责|工作内容|要求|资格|能力|经验|素质|背景|介绍|建设|支持|设计|落地|管理|沉淀|优化|实现)[:：]?$/;

function normalizeJdLines(jdValue) {
  return String(jdValue ?? '')
    .split(/\r?\n/)
    .map((line) => clean(
      line
        .replace(/^[-•●·]\s*/, '')
        .replace(/^【([^】]+)】/, '$1'),
    ))
    .filter(Boolean);
}

function extractSections(jdValue) {
  const lines = normalizeJdLines(jdValue);
  const reqIndex = lines.findIndex((line) => requirementHeading.test(line));
  const respIndex = lines.findIndex((line) => responsibilityHeading.test(line));
  const bonusIndex = lines.findIndex((line, index) => index > reqIndex && bonusHeading.test(line));

  let responsibilityLines = [];
  if (respIndex >= 0) {
    const end = reqIndex > respIndex ? reqIndex : lines.length;
    responsibilityLines = lines.slice(respIndex + 1, end);
  } else if (reqIndex > 0) {
    responsibilityLines = lines.slice(0, reqIndex);
  } else {
    responsibilityLines = lines.filter((line) => /^(?:销售岗|技术岗|短视频、直播)[:：]/.test(line));
  }

  const requirementLines = reqIndex >= 0
    ? lines.slice(reqIndex + 1, bonusIndex > reqIndex ? bonusIndex : lines.length)
    : [];

  const contentOnly = (items) => items
    .filter((line) => !responsibilityHeading.test(line))
    .filter((line) => !requirementHeading.test(line))
    .filter((line) => !bonusHeading.test(line))
    .filter((line) => !genericHeading.test(line))
    .filter((line) => !/^\d+[.、]\s*[^。；：:]{1,24}$/.test(line));

  return {
    responsibilities: contentOnly(responsibilityLines),
    explicit_requirements: contentOnly(requirementLines),
  };
}

function hardThresholds(requirementLines, summary) {
  const hardSignal = /(?:必须|硬性|一定要|请勿投递|本科|大专|学历|至少|\d+\s*年|年以上|经验不限|学历不限|驻场|出差|精通|熟练掌握|英语流利|相关专业)/i;
  const matches = requirementLines.filter((line) => hardSignal.test(line));
  const badges = [];
  if (summary.experience !== unsupported) badges.push(`经验：${summary.experience}`);
  if (summary.education !== unsupported) badges.push(`学历：${summary.education}`);
  const thresholds = [...badges, ...matches];
  return thresholds.length ? thresholds : [unsupported];
}

function extractCompanyInfo(jdValue) {
  const lines = normalizeJdLines(jdValue);
  const explicitCompanyLines = lines.filter((line) =>
    /(?:有限公司|公司（\d{4}年成立|^主营[:：])/.test(line),
  );
  return explicitCompanyLines.length ? explicitCompanyLines.join('；') : unsupported;
}

const keywordLexicon = [
  'AI', 'AIGC', 'LLM', 'Agent', 'RAG', 'Prompt', 'MCP', '知识库', '向量数据库', '多模态',
  '机器学习', '深度学习', '自然语言处理', '计算机视觉', '模型评测', '模型微调', '工具调用',
  '工作流', 'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'SQL', 'API', 'Node.js',
  'Nest.js', 'Express', 'Redis', 'PostgreSQL', 'MySQL', 'WebSocket', 'Docker', 'Kubernetes',
  'K8s', 'TensorFlow', 'PyTorch', 'MLOps', 'LLMOps', 'AIOps', 'CI/CD', 'ETL', 'PRD',
  '原型', '需求分析', '产品规划', '项目管理', 'PoC', '售前', '交付', '驻场', '私有化部署',
  '系统集成', '数据分析', '客户调研', '解决方案', '验收', '培训', 'SaaS', 'ToB', 'To G',
];

function extractRawKeywords(textValue) {
  const text = String(textValue ?? '');
  const lower = text.toLowerCase();
  return keywordLexicon.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

const collectRows = readJsonl(collectPath);
const detailRows = readJsonl(detailPath);
const usableDetails = new Map(
  detailRows
    .filter((row) => row.status === 'success')
    .filter((row) => clean(row.detail?.jd).length > 0)
    .filter((row) => !clean(row.detail?.title).includes('页面不存在'))
    .map((row) => [row.key, row]),
);

const records = collectRows.map((chat) => {
  const strip = parseStrip(chat.job?.raw);
  const source = usableDetails.get(chat.key);

  if (!source) {
    return {
      source_key: chat.key,
      job_url: unsupported,
      original_job_name: strip.original_job_name,
      company: unsupported,
      city: strip.city,
      salary: strip.salary,
      industry: unsupported,
      company_info: unsupported,
      responsibilities: [unsupported],
      explicit_requirements: [unsupported],
      experience: unsupported,
      education: unsupported,
      hard_thresholds: [unsupported],
      raw_keywords: extractRawKeywords(strip.raw_job_strip).length
        ? extractRawKeywords(strip.raw_job_strip)
        : [unsupported],
      raw_job_strip: strip.raw_job_strip,
      status: 'JD未在单标签约束下打开',
      information_completeness: '低',
      confidence: '中',
    };
  }

  const detail = source.detail;
  const sections = extractSections(detail.jd);
  const summary = pageSummary(detail);
  return {
    source_key: chat.key,
    job_url: clean(detail.url) || unsupported,
    original_job_name: strip.original_job_name,
    company: companyFromTitle(detail.title),
    city: strip.city,
    salary: strip.salary,
    industry: unsupported,
    company_info: extractCompanyInfo(detail.jd),
    responsibilities: sections.responsibilities.length ? sections.responsibilities : [unsupported],
    explicit_requirements: sections.explicit_requirements.length ? sections.explicit_requirements : [unsupported],
    experience: summary.experience,
    education: summary.education,
    hard_thresholds: hardThresholds(sections.explicit_requirements, summary),
    raw_keywords: extractRawKeywords(`${detail.infoPrimary}\n${detail.jd}`),
    raw_job_strip: strip.raw_job_strip,
    status: 'JD已采集',
    information_completeness: '高',
    confidence: '高',
  };
});

const uniqueKeys = new Set(records.map((row) => row.source_key));
const detailedCount = records.filter((row) => row.status === 'JD已采集').length;
const incompleteCount = records.filter((row) => row.status === 'JD未在单标签约束下打开').length;

if (records.length !== 176 || uniqueKeys.size !== 176 || detailedCount !== 23 || incompleteCount !== 153) {
  throw new Error(JSON.stringify({
    records: records.length,
    unique_keys: uniqueKeys.size,
    detailed: detailedCount,
    incomplete: incompleteCount,
  }));
}

fs.writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`);
console.log(JSON.stringify({
  output: outputPath.pathname,
  records: records.length,
  unique_keys: uniqueKeys.size,
  detailed: detailedCount,
  incomplete: incompleteCount,
}, null, 2));
