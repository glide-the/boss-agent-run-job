import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/dmeck/project/boss-agent';
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const master = read('data/derived/normalized_master_20260817.json');
const fiveD = read('data/derived/job_requirements_5d_20260817.json');
const jd = read('data/derived/job_details_structured_20260817.json');
const feedbackQa = read('data/derived/chat_feedback_qa_20260817.json');
const baseT1 = read('data/base_t1_keys_20260817.json');
const baseT2 = read('data/base_t2_keys_20260817.json');
const baseT3 = read('data/base_t3_keys_20260817.json');

const records = master.records;
const recordMap = new Map(records.map((r) => [r.source_key, r]));
const fiveDMap = new Map(fiveD.map((r) => [r.source_key, r]));
const jdMap = new Map(jd.map((r) => [r.source_key, r]));
const compact = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[\s|#·•:：,，;；()（）\[\]【】_\-\/\\]+/g, '');
const value = (v) => String(v ?? '').trim();
const cleanText = (v) => value(v).replace(/^\["|"\]$/g, '');
const canonUrl = (v) => {
  const text = value(v);
  if (!text) return '';
  const m = text.match(/https?:\/\/[^\s)\]]+/i);
  if (!m) return '';
  try {
    const u = new URL(m[0]);
    u.search = '';
    u.hash = '';
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return m[0].split(/[?#]/)[0].replace(/\/$/, '');
  }
};
const sourceSignature = (sourceKey) => {
  const [person = '', identity = ''] = String(sourceKey ?? '').split('|');
  let tail = identity;
  if (compact(identity).startsWith(compact(person))) tail = compact(identity).slice(compact(person).length);
  return compact(person) + compact(tail);
};
const sourceMatches = (baseSource, sourceKey) => {
  const b = compact(baseSource);
  const sig = sourceSignature(sourceKey);
  return Boolean(sig && b.includes(sig));
};
const isoDate = (v) => {
  const m = value(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
};
const dateTime = (v, fallbackDate = '') => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value(v))) {
    return value(v).length === 16 ? `${value(v)}:00` : value(v);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value(fallbackDate)) ? `${value(fallbackDate)} 00:00:00` : null;
};
const joinText = (v) => Array.isArray(v) ? v.join('；') : value(v);
const truncate50 = (v) => Array.from(value(v)).slice(0, 50).join('');
const candidateRecords = (keys) => keys.map((k) => recordMap.get(k)).filter(Boolean);

const errors = [];
const warnings = [];
const addError = (code, source_key, detail) => errors.push({ code, source_key, detail });
const addWarning = (code, source_key, detail) => warnings.push({ code, source_key, detail });

const directions = new Set(['AI产品', '解决方案', '交付', '业务分析']);
const cities = new Set(['北京', '上海', '杭州', '远程', '其他']);
const statuses = new Set(['无反馈', '沟通中', '拒绝', '面试', 'offer', '待确认']);
const roundsT2 = new Set(['HR', '业务', '技术', '终面', '未开始', '未知']);
const yesNo = new Set(['是', '否', '未知']);
const fiveKeys = ['每天干什么', '硬技能', '业务经验', '交付证据', '硬门槛'];

if (records.length !== 176) addError('MASTER_COUNT', null, `expected 176, got ${records.length}`);
const keyCounts = new Map();
for (const r of records) keyCounts.set(r.source_key, (keyCounts.get(r.source_key) ?? 0) + 1);
for (const [k, n] of keyCounts) if (n !== 1) addError('DUPLICATE_SOURCE_KEY', k, `count=${n}`);
if (keyCounts.size !== 176) addError('UNIQUE_SOURCE_COUNT', null, `expected 176, got ${keyCounts.size}`);

for (const r of records) {
  if (!directions.has(r.job_direction)) addError('INVALID_DIRECTION', r.source_key, r.job_direction);
  if (!cities.has(r.city)) addError('INVALID_CITY', r.source_key, r.city);
  if (!statuses.has(r.current_status)) addError('INVALID_STATUS', r.source_key, r.current_status);
  if (!roundsT2.has(r.interview_round)) addError('INVALID_T2_ROUND', r.source_key, r.interview_round);
  for (const f of ['read_status', 'resume_downloaded', 'recruiter_initiated', 'actual_interview']) {
    if (!yesNo.has(r[f])) addError('INVALID_YES_NO', r.source_key, `${f}=${r[f]}`);
  }
  const dims = r.five_dimensions ?? {};
  if (Object.keys(dims).sort().join('|') !== [...fiveKeys].sort().join('|')) addError('FIVE_DIMENSION_KEYS', r.source_key, Object.keys(dims));
  for (const k of fiveKeys) {
    if (!Array.isArray(dims[k]) || dims[k].length < 1 || dims[k].length > 3) addError('FIVE_DIMENSION_CARDINALITY', r.source_key, `${k}=${JSON.stringify(dims[k])}`);
  }
  const expected = fiveDMap.get(r.source_key)?.dimensions;
  if (!expected || JSON.stringify(expected) !== JSON.stringify(dims)) addError('FIVE_DIMENSION_TRACEABILITY', r.source_key, 'normalized dimensions differ from audited 5D extraction');
  const src = jdMap.get(r.source_key);
  if (!src) addError('MISSING_JD_SOURCE', r.source_key, 'no structured JD source record');
  if (src?.status === 'JD未在单标签约束下打开' && fiveKeys.some((k) => dims[k]?.some((x) => x !== '未提及'))) {
    addError('UNSUPPORTED_INCOMPLETE_JD_DIMENSION', r.source_key, 'incomplete JD has asserted five-dimension value');
  }
  for (const ex of r.evidence_excerpts ?? []) if (Array.from(value(ex)).length > 120) addWarning('LONG_RAW_EVIDENCE', r.source_key, 'raw evidence exceeds 120 chars; T3 payload will be capped at 50');
}

const fang = recordMap.get('方建华|方建华田螺云厨招聘者');
if (!fang || fang.actual_interview !== '否' || fang.current_status !== '沟通中' || fang.next_action !== '跟进' || fang.interview_round !== '未开始') {
  addError('FANG_JIANHUA_CORRECTION', fang?.source_key ?? null, fang ?? 'record missing');
}
const feedbackFang = feedbackQa.blocking_findings?.find((x) => x.source_key === '方建华|方建华田螺云厨招聘者');
if (!feedbackFang) addError('FANG_JIANHUA_QA_EVIDENCE', fang?.source_key ?? null, 'expected source QA finding is missing');

for (const [table, keys] of Object.entries(master.candidates)) {
  const set = new Set(keys);
  if (set.size !== keys.length) addError('DUPLICATE_CANDIDATE_KEY', null, `${table}: ${keys.length - set.size}`);
  for (const k of keys) if (!recordMap.has(k)) addError('CANDIDATE_NOT_IN_MASTER', k, table);
}

const t1Index = baseT1.map((x) => ({ id: x.id, source: x.vals[0], url: canonUrl(x.vals[1]), company: compact(x.vals[2]), job: compact(x.vals[3]), city: compact(x.vals[4]), salary: compact(x.vals[5]) }));
const t2Index = baseT2.map((x) => ({ id: x.id, source: x.vals[0], url: canonUrl(x.vals[1]), company: compact(x.vals[2]), job: compact(x.vals[3]), status: cleanText(x.vals[4]) }));
const t3Index = baseT3.map((x) => ({ id: x.id, source: x.vals[0], date: isoDate(x.vals[1]), round: cleanText(x.vals[2]), result: cleanText(x.vals[3]) }));

const decideT1 = (r) => {
  const url = canonUrl(r.job_url);
  let matches = url ? t1Index.filter((x) => x.url === url) : [];
  if (matches.length === 1) return { action: 'skip', reason: 'existing canonical JD URL', existing_ids: [matches[0].id] };
  if (matches.length > 1) return { action: 'conflict', reason: 'canonical JD URL matches multiple existing rows', existing_ids: matches.map((x) => x.id) };
  const parts = [compact(r.company), compact(r.original_job_name), compact(r.city), compact(r.salary)];
  if (!url) {
    if (parts.some((x) => !x)) return { action: 'conflict', reason: 'no JD URL and incomplete company+job+city+salary dedupe key', existing_ids: [] };
    matches = t1Index.filter((x) => x.company === parts[0] && x.job === parts[1] && x.city === parts[2] && x.salary === parts[3]);
    if (matches.length === 1) return { action: 'skip', reason: 'existing company+job+city+salary', existing_ids: [matches[0].id] };
    if (matches.length > 1) return { action: 'conflict', reason: 'company+job+city+salary matches multiple existing rows', existing_ids: matches.map((x) => x.id) };
  }
  return { action: 'insert', reason: url ? 'new canonical JD URL' : 'new complete composite key', existing_ids: [] };
};

const decideT2 = (r) => {
  const url = canonUrl(r.job_url);
  let matches = url ? t2Index.filter((x) => x.url === url) : [];
  if (matches.length === 1) return { action: 'skip', reason: 'existing canonical JD URL', existing_ids: [matches[0].id] };
  if (matches.length > 1) return { action: 'conflict', reason: 'canonical JD URL matches multiple existing rows', existing_ids: matches.map((x) => x.id) };
  const c = compact(r.company), j = compact(r.original_job_name);
  if (c && j) matches = t2Index.filter((x) => x.company === c && x.job === j);
  else matches = [];
  if (matches.length === 1) return { action: 'skip', reason: 'existing company+job (source label format may differ)', existing_ids: [matches[0].id] };
  if (matches.length > 1) return { action: 'conflict', reason: 'company+job matches multiple existing rows', existing_ids: matches.map((x) => x.id) };
  const sourceHits = t2Index.filter((x) => sourceMatches(x.source, r.source_key));
  if (sourceHits.length === 1) return { action: 'skip', reason: 'existing normalized source signature', existing_ids: [sourceHits[0].id] };
  if (sourceHits.length > 1) return { action: 'conflict', reason: 'normalized source signature matches multiple existing rows', existing_ids: sourceHits.map((x) => x.id) };
  return { action: 'insert', reason: 'no safe existing match', existing_ids: [] };
};

const decideT3 = (r) => {
  const d = isoDate(r.last_communication_time) || r.delivery_date;
  const round = r.actual_interview === '是' ? (r.interview_round === '未开始' ? '未知' : r.interview_round) : '未知';
  const matches = t3Index.filter((x) => sourceMatches(x.source, r.source_key) && x.date === d && x.round.includes(round));
  if (matches.length === 1) return { action: 'skip', reason: 'existing source+date+round', existing_ids: [matches[0].id] };
  if (matches.length > 1) return { action: 'conflict', reason: 'source+date+round matches multiple existing rows', existing_ids: matches.map((x) => x.id) };
  return { action: 'insert', reason: 'no safe existing source+date+round match', existing_ids: [] };
};

const decisions = { t1: [], t2: [], t3: [] };
for (const r of candidateRecords(master.candidates.t1)) decisions.t1.push({ source_key: r.source_key, ...decideT1(r) });
for (const r of candidateRecords(master.candidates.t2)) decisions.t2.push({ source_key: r.source_key, ...decideT2(r) });
for (const r of candidateRecords(master.candidates.t3)) decisions.t3.push({ source_key: r.source_key, ...decideT3(r) });

const focusFor = (r) => {
  const t = joinText(r.recruiter_key_feedback);
  const out = [];
  if (/作品|案例|简历|项目/.test(t)) out.push('项目经验');
  if (/技术|服务器|开发|ai|AI|栈/.test(t)) out.push('技术能力');
  if (/行业/.test(t)) out.push('行业经验');
  if (/到岗|离职|稳定/.test(t)) out.push('稳定性');
  if (/薪资/.test(t)) out.push('薪资');
  return [...new Set(out)].slice(0, 3).length ? [...new Set(out)].slice(0, 3) : ['其他'];
};

const t1Fields = ['岗位方向','岗位名称','公司','城市','薪资','行业','核心职责','必备技能','高频关键词','硬门槛','它每天干什么','它要什么硬技能','它要什么业务经验','它要什么交付证据','它的硬门槛是什么','初步适配分','适配理由','岗位详情链接','来源聊天标识','信息完整度','置信度','采集时间'];
const t2Fields = ['投递日期','岗位方向','岗位名称','公司','简历版本','是否已读','是否下载简历','是否主动沟通','是否面试','面试轮次','当前状态','反馈周期','备注','最后沟通时间','招聘方关键反馈','下一步动作','岗位详情链接','来源聊天标识','置信度','采集时间'];
const t3Fields = ['沟通 / 面试日期','岗位方向','岗位名称','公司','沟通类型','当前轮次','对方核心问题','对方关注点','我的回答或已提供材料','暴露短板','可补强证据','结果','复盘结论','下一步动作','来源聊天标识','证据摘录','置信度','采集时间'];

const rowT1 = (r) => [r.job_direction,r.original_job_name,r.company,r.city,r.salary,r.industry,joinText(r.core_responsibilities),joinText(r.required_skills),r.keywords ?? [],joinText(r.hard_thresholds),joinText(r.five_dimensions['每天干什么']),joinText(r.five_dimensions['硬技能']),joinText(r.five_dimensions['业务经验']),joinText(r.five_dimensions['交付证据']),joinText(r.five_dimensions['硬门槛']),r.initial_fit_score,r.fit_reason,r.job_url || null,r.source_key,r.information_completeness,r.confidence,'2026-08-17'];
const rowT2 = (r) => [dateTime(null,r.delivery_date),r.job_direction,r.original_job_name,r.company,r.resume_version,r.read_status,r.resume_downloaded,r.recruiter_initiated,r.actual_interview,r.interview_round,r.current_status,r.feedback_cycle,`职位详情：${r.source_status}；简历发送：${r.resume_sent}`,dateTime(r.last_communication_time),joinText(r.recruiter_key_feedback),r.next_action,r.job_url || null,r.source_key,r.confidence,'2026-08-17'];
const rowT3 = (r) => {
  const evidence = truncate50((r.recruiter_key_feedback ?? [])[0] ?? (r.evidence_excerpts ?? [])[0] ?? '待确认');
  const result = r.current_status === '拒绝' ? '拒绝' : r.current_status === 'offer' ? 'offer' : r.actual_interview === '是' ? '面试中' : '继续推进';
  const round = r.actual_interview === '是' && r.interview_round !== '未开始' ? r.interview_round : '未知';
  const conclusion = r.current_status === '拒绝' ? '招聘方已明确拒绝；原因仅按聊天原文记录，未作延伸推断。' : '招聘方已有实质回复；下一步按聊天证据继续跟进。';
  const strengthen = /作品|案例/.test(joinText(r.recruiter_key_feedback)) ? '补充对方明确询问的作品或案例' : '待确认';
  return [dateTime(r.last_communication_time,r.delivery_date),r.job_direction,r.original_job_name,r.company,r.actual_interview === '是' ? '其他' : '简单沟通',round,joinText(r.recruiter_key_feedback),focusFor(r),'未提及',['其他'],strengthen,result,conclusion,r.next_action,r.source_key,evidence,r.confidence,'2026-08-17'];
};

const inserts = {
  t1: decisions.t1.filter((d) => d.action === 'insert').map((d) => rowT1(recordMap.get(d.source_key))),
  t2: decisions.t2.filter((d) => d.action === 'insert').map((d) => rowT2(recordMap.get(d.source_key))),
  t3: decisions.t3.filter((d) => d.action === 'insert').map((d) => rowT3(recordMap.get(d.source_key))),
};
for (const row of inserts.t3) if (Array.from(value(row[t3Fields.indexOf('证据摘录')])).length > 50) addError('T3_EVIDENCE_OVER_50', row[t3Fields.indexOf('来源聊天标识')], row[t3Fields.indexOf('证据摘录')]);
const validDateCell = (v) => v === null || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value(v));
for (const row of inserts.t2) {
  for (const field of ['投递日期', '最后沟通时间']) {
    const cell = row[t2Fields.indexOf(field)];
    if (!validDateCell(cell)) addError('INVALID_T2_DATETIME', row[t2Fields.indexOf('来源聊天标识')], `${field}=${cell}`);
  }
}
for (const row of inserts.t3) {
  const cell = row[t3Fields.indexOf('沟通 / 面试日期')];
  if (!validDateCell(cell)) addError('INVALID_T3_DATETIME', row[t3Fields.indexOf('来源聊天标识')], `沟通 / 面试日期=${cell}`);
}
for (const [table, fields] of Object.entries({ t1: t1Fields, t2: t2Fields, t3: t3Fields })) {
  for (const row of inserts[table]) if (row.length !== fields.length) addError('PAYLOAD_ROW_WIDTH', null, `${table}: expected ${fields.length}, got ${row.length}`);
}

const writePayloads = (table, fields, rows) => {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((chunk, i) => {
    const suffix = chunks.length > 1 ? `_part${i + 1}` : '';
    write(`data/lark_write_20260817/${table}_inserts${suffix}.json`, { fields, rows: chunk });
  });
  return chunks.map((x) => x.length);
};
const payloadChunks = {
  t1: writePayloads('t1', t1Fields, inserts.t1),
  t2: writePayloads('t2', t2Fields, inserts.t2),
  t3: writePayloads('t3', t3Fields, inserts.t3),
};

const decisionStats = Object.fromEntries(Object.entries(decisions).map(([table, list]) => [table, Object.fromEntries(['insert','update','skip','conflict'].map((a) => [a, list.filter((x) => x.action === a).length]))]));
const pendingCount = JSON.stringify(records).match(/待确认/g)?.length ?? 0;
const lowConfidence = records.filter((r) => r.confidence === '低').length;
const manifest = {
  generated_at: new Date().toISOString(),
  base: { app_token: 'XumKb9cDUaFJsYsnUztcJi6pnAc', tables: { t1: 'tbl44DGANWkP65D5', t2: 'tblIlsvZfKvNuO1a', t3: 'tbldQMy52d7AkmN3' } },
  safeguards: ['Only insert rows are present in payloads', 'No ambiguous record is updated or overwritten', 'Canonical JD URL strips query/hash', 'Unknown URL is null', 'Batch files contain at most 200 rows'],
  stats: decisionStats,
  payload_chunks: payloadChunks,
  decisions,
};

const finalQa = {
  generated_at: new Date().toISOString(),
  scope: 'Final independent QA and Lark action manifest only; no browser and no Lark writes',
  input_counts: { master_records: records.length, unique_source_keys: keyCounts.size, t1_candidates: master.candidates.t1.length, t2_candidates: master.candidates.t2.length, t3_candidates: master.candidates.t3.length, base_t1: baseT1.length, base_t2: baseT2.length, base_t3: baseT3.length },
  checks: {
    master_176_unique: records.length === 176 && keyCounts.size === 176,
    five_dimensions_traceable: !errors.some((x) => x.code.startsWith('FIVE_DIMENSION') || x.code === 'UNSUPPORTED_INCOMPLETE_JD_DIMENSION'),
    fang_jianhua_corrected: !errors.some((x) => x.code.startsWith('FANG_JIANHUA')),
    t3_evidence_max_50: !errors.some((x) => x.code === 'T3_EVIDENCE_OVER_50'),
    datetime_cells_valid_or_null: !errors.some((x) => x.code === 'INVALID_T2_DATETIME' || x.code === 'INVALID_T3_DATETIME'),
    payload_shapes_valid: !errors.some((x) => x.code === 'PAYLOAD_ROW_WIDTH'),
    no_blind_updates: Object.values(decisions).flat().every((x) => x.action !== 'update'),
  },
  counts: { low_confidence_records: lowConfidence, pending_confirm_occurrences: pendingCount, complete_jd: records.filter((r) => r.source_status === 'JD已采集').length, incomplete_jd: records.filter((r) => r.source_status !== 'JD已采集').length },
  action_stats: decisionStats,
  errors,
  warnings,
  conclusion: errors.length ? 'FAIL' : 'PASS_WITH_SAFE_SKIPS',
};

write('data/derived/lark_action_manifest_20260817.json', manifest);
write('data/derived/final_qa_20260817.json', finalQa);
console.log(JSON.stringify({ conclusion: finalQa.conclusion, action_stats: decisionStats, payload_chunks: payloadChunks, errors: errors.length, warnings: warnings.length, low_confidence: lowConfidence, pending: pendingCount }, null, 2));
