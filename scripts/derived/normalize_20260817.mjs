import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const jobs = readJson('data/derived/job_details_structured_20260817.json');
const feedback = readJson('data/derived/chat_feedback_20260817.json');
const fiveD = readJson('data/derived/job_requirements_5d_20260817.json');

const feedbackByKey = new Map(feedback.map((x) => [x.key, x]));
const fiveByKey = new Map(fiveD.map((x) => [x.source_key, x]));
const clean = (v) => String(v ?? '').trim();
const notMentioned = (v) => !v || v === '未提及' || (Array.isArray(v) && v.every((x) => x === '未提及'));
const listText = (xs) => (Array.isArray(xs) && xs.length ? xs : ['未提及']).join('；');

function classify(title, responsibilities) {
  const t = `${title} ${listText(responsibilities)}`.toLowerCase();
  if (/业务分析|数据分析|需求分析|商业分析|bi分析|分析师|数据运营/.test(t)) return '业务分析';
  if (/解决方案|售前|方案顾问|行业顾问|咨询顾问|架构师/.test(t)) return '解决方案';
  if (/产品经理|产品负责人|产品总监|产品专家|产品运营|产品专员|ai产品|aigc产品|智能体产品/.test(t)) return 'AI产品';
  if (/交付|实施|项目经理|项目负责人|客户成功|技术支持|运维|部署|开发|工程师|研发|测试/.test(t)) return '交付';
  return /产品|运营/.test(t) ? 'AI产品' : '交付';
}

function normalizeCity(city) {
  const c = clean(city);
  if (/北京/.test(c)) return '北京';
  if (/上海/.test(c)) return '上海';
  if (/杭州/.test(c)) return '杭州';
  if (/远程/.test(c)) return '远程';
  return c && c !== '未提及' ? '其他' : '其他';
}

function normalizeIndustry(job) {
  const text = `${job.industry} ${job.company_info} ${job.original_job_name}`;
  const rules = [
    ['教育', /教育|学校|教培/], ['政企', /政务|政企|政府/], ['医疗', /医疗|医院|医药/],
    ['金融', /金融|银行|证券|保险/], ['工业', /工业|制造|工厂/], ['企业服务', /企业服务|tob|to b|saas/i],
    ['人工智能', /人工智能|大模型|ai|aigc|agent/i], ['电子商务', /电商|电子商务/], ['游戏', /游戏/],
    ['计算机软件', /软件|开发|程序|算法/], ['计算机服务', /it服务|系统集成|网络监控/]
  ];
  return rules.find(([, re]) => re.test(text))?.[0] ?? (job.industry === '未提及' ? '未提及' : '其他');
}

function keywords(job, dims) {
  const text = `${job.original_job_name} ${listText(job.raw_keywords)} ${Object.values(dims).flat().join(' ')}`;
  const vocab = ['RAG','Agent','LLM','Prompt','MCP','LangChain','LangGraph','Dify','Coze','知识库','工作流','向量数据库','AIGC','Python','Java','Go','Rust','TypeScript','SQL','API','PRD','原型','需求分析','竞品分析','方案','PoC','Demo','上线','验收','培训','私有化部署','BI','Figma','Sketch','Axure','政务','教育','医疗'];
  return vocab.filter((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)).slice(0, 12);
}

function fit(direction, job) {
  const complete = job.status === 'JD已采集';
  const title = job.original_job_name.toLowerCase();
  const pureTech = /开发|工程师|算法|研发|测试|运维/.test(title) && !/产品|方案|交付|实施|项目|分析/.test(title);
  if (pureTech) return { score: complete ? 2 : 1, reason: '岗位偏纯技术研发，与目标岗位方向仅弱相关。' };
  if (direction === 'AI产品' || direction === '解决方案') {
    return { score: complete ? 4 : 3, reason: complete ? '岗位方向匹配且已取得完整职责与要求，仍需逐项核对个人证据。' : '标题方向匹配，但职位详情未完整打开，门槛与技能仍待确认。' };
  }
  if (direction === '交付' || direction === '业务分析') {
    return { score: complete ? 3 : 2, reason: complete ? '岗位具有可迁移相关性，但仍需核对行业、技术或交付证据。' : '标题有一定相关性，但缺少完整职责与门槛证据。' };
  }
  return { score: 2, reason: '仅能依据岗位标题做初步判断，详情待确认。' };
}

const records = jobs.map((job) => {
  const fb = feedbackByKey.get(job.source_key);
  const req = fiveByKey.get(job.source_key);
  if (!fb || !req) throw new Error(`Missing merged input for ${job.source_key}`);
  const dims = req.dimensions;
  const direction = classify(job.original_job_name, job.responsibilities);
  const company = job.company !== '未提及' ? job.company : (fb.company_visible || '未提及');
  const informationCompleteness = job.status === 'JD已采集' ? job.information_completeness : '低';
  const confidence = job.status === 'JD已采集' ? job.confidence : '低';
  const fitResult = fit(direction, job);
  const actualInterview = job.source_key === '方建华|方建华田螺云厨招聘者' ? '否' : fb.interview_mentioned;
  const currentStatus = job.source_key === '方建华|方建华田螺云厨招聘者' ? '沟通中' : fb.current_status;
  const interviewRound = job.source_key === '方建华|方建华田螺云厨招聘者' ? '未开始' : fb.interview_round;
  const nextAction = job.source_key === '方建华|方建华田螺云厨招聘者' ? '跟进' : fb.next_action;
  const kw = keywords(job, dims);
  const fullJobUrl = /^https?:\/\//.test(job.job_url) ? job.job_url : null;
  return {
    source_key: job.source_key,
    job_direction: direction,
    original_job_name: job.original_job_name,
    company,
    city: normalizeCity(job.city),
    original_city: job.city,
    salary: job.salary,
    industry: normalizeIndustry(job),
    core_responsibilities: job.status === 'JD已采集' ? job.responsibilities.slice(0, 3) : ['未提及'],
    required_skills: dims['硬技能'],
    keywords: kw,
    hard_thresholds: dims['硬门槛'],
    five_dimensions: dims,
    initial_fit_score: fitResult.score,
    fit_reason: fitResult.reason,
    job_url: fullJobUrl,
    information_completeness: informationCompleteness,
    confidence,
    source_status: job.status,
    delivery_date: fb.delivery_date || null,
    resume_version: '未知',
    read_status: fb.read_status,
    resume_sent: fb.resume_sent,
    resume_downloaded: fb.resume_downloaded,
    recruiter_initiated: fb.recruiter_initiated,
    recruiter_replied: fb.recruiter_replied,
    actual_interview: actualInterview,
    interview_round: interviewRound,
    current_status: currentStatus,
    feedback_cycle: fb.feedback_cycle,
    last_communication_time: fb.last_communication_time || null,
    recruiter_key_feedback: fb.recruiter_key_feedback,
    next_action: nextAction,
    evidence_excerpts: fb.raw_evidence_excerpts.map((x) => clean(x).slice(0, 50)),
    has_meaningful_communication: fb.recruiter_replied === '是' || actualInterview === '是'
  };
});

const priority = (r) => (r.source_status === 'JD已采集' ? 100 : 0) + (r.has_meaningful_communication ? 20 : 0) + r.initial_fit_score;
const t1Candidates = ['AI产品','解决方案','交付','业务分析'].flatMap((d) => records.filter((r) => r.job_direction === d).sort((a,b) => priority(b)-priority(a)).slice(0,15).map((r) => r.source_key));
const t2Candidates = records.map((r) => r.source_key);
const t3Candidates = records.filter((r) => r.has_meaningful_communication).map((r) => r.source_key);

const categoryTerms = {
  '大模型/AI能力': ['RAG','Agent','LLM','Prompt','MCP','LangChain','LangGraph','Dify','Coze','知识库','工作流','向量数据库','AIGC','AI'],
  '产品能力': ['PRD','原型','需求分析','竞品分析','产品规划','用户调研','Figma','Axure'],
  '解决方案能力': ['解决方案','方案','PoC','售前','客户调研','标书','演示'],
  '交付能力': ['交付','实施','上线','验收','培训','驻场','项目管理','客户成功'],
  '技术能力': ['Python','Java','Go','Rust','TypeScript','SQL','API','数据库','云服务','私有化部署'],
  '业务/行业经验': ['教育','政企','企业服务','工业','医疗','金融','ToB','SaaS'],
  '硬门槛': ['本科','大专','3年以上','5年以上','计算机','出差','驻场','英语'],
  '交付证据': ['Demo','案例','上线项目','方案文档','验收报告','客户培训','项目复盘','作品集']
};

const keywordSummary = Object.entries(categoryTerms).map(([category, terms]) => {
  const counts = new Map();
  const directions = new Set();
  const jobsHit = [];
  for (const r of records) {
    const text = `${r.original_job_name} ${r.keywords.join(' ')} ${Object.values(r.five_dimensions).flat().join(' ')} ${r.industry}`;
    let hit = false;
    for (const term of terms) {
      if (new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
        counts.set(term, (counts.get(term) || 0) + 1);
        hit = true;
      }
    }
    if (hit) {
      directions.add(r.job_direction);
      if (jobsHit.length < 5) jobsHit.push(r.original_job_name);
    }
  }
  const ranked = [...counts.entries()].sort((a,b) => b[1]-a[1]);
  return {
    keyword_category: category,
    representative_terms: ranked.map(([k,v]) => `${k}(${v})`),
    occurrence_count: ranked.reduce((n,[,v]) => n+v,0),
    related_directions: [...directions],
    typical_jobs: [...new Set(jobsHit)].slice(0,3),
    note: '基于本轮176条聊天岗位标题、23条完整JD及有证据的五维字段统计；153条未打开JD不补写隐含要求。'
  };
});

const counts = (field) => Object.fromEntries([...new Set(records.map((r) => r[field]))].map((v) => [v, records.filter((r) => r[field] === v).length]));
const out = {
  generated_at: new Date().toISOString(),
  run_date: '2026-08-17',
  records,
  candidates: { t1: t1Candidates, t2: t2Candidates, t3: t3Candidates },
  stats: {
    records: records.length,
    unique_source_keys: new Set(records.map((r) => r.source_key)).size,
    directions: counts('job_direction'),
    statuses: counts('current_status'),
    complete_jd: records.filter((r) => r.source_status === 'JD已采集').length,
    incomplete_jd: records.filter((r) => r.source_status !== 'JD已采集').length,
    low_confidence: records.filter((r) => r.confidence === '低').length,
    t1_candidates: t1Candidates.length,
    t2_candidates: t2Candidates.length,
    t3_candidates: t3Candidates.length
  }
};

if (out.stats.records !== 176 || out.stats.unique_source_keys !== 176) throw new Error('Expected 176 unique records');
fs.writeFileSync(path.join(root, 'data/derived/normalized_master_20260817.json'), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'data/derived/keyword_summary_20260817.json'), `${JSON.stringify(keywordSummary, null, 2)}\n`);
console.log(JSON.stringify(out.stats, null, 2));
