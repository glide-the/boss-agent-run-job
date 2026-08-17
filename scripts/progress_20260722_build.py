#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""2026-07-22 进度采集（657 条）-> Lark 三表载荷。
- changed 70 条：匹配现有 t2 record_id，生成逐条更新补丁
- new 440 条（剔除 147 条已在 t2 的今日沟通）：生成 t1/t2/t3 批量创建载荷
输入：/tmp/prog_new.json /tmp/prog_changed.json /tmp/prog_dup_keys.json /tmp/t2_idkeys.txt
输出：data/payload_prog_t1.json payload_prog_t2.json payload_prog_t3.json payload_prog_t2upd.json
"""
import json, re, datetime, collections

DATA = '/Users/dmeck/project/boss-agent/data'
TODAY = '2026-07-22'
STAMP = '2026-07-22 进度采集'

new_all = json.load(open('/tmp/prog_new.json'))
changed = json.load(open('/tmp/prog_changed.json'))
dup_keys = set(json.load(open('/tmp/prog_dup_keys.json')))
new = [r for r in new_all if r['key'] not in dup_keys]

t2_idkeys = [l.rstrip('\n').split('\t') for l in open('/tmp/t2_idkeys.txt') if '\t' in l]

CITIES = ['北京','上海','杭州','深圳','广州','南京','成都','武汉','西安','长沙','苏州','合肥','佛山','惠州','厦门',
          '郑州','重庆','天津','青岛','宁波','无锡','福州','济南','东莞','大连','南昌','马鞍山','德州','衢州',
          '中山','临沂','乌鲁木齐','保定','南通','海口','温州','湖州','金华','扬州','汕头','宁德','安阳','廊坊','江门','沧州','郴州','远程']

def parse_dt(t):
    if not t: return None
    t = t.strip()
    m = re.match(r'^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})', t)
    if m: return f'2026-{m.group(1)}-{m.group(2)} {m.group(3)}:{m.group(4)}:00'
    if t.startswith('昨天'):
        m2 = re.search(r'(\d{2}):(\d{2})', t)
        return f'2026-07-21 {m2.group(0)}:00' if m2 else '2026-07-21 00:00:00'
    m = re.match(r'^(\d{2})月(\d{2})日', t)
    if m: return f'2026-{m.group(1)}-{m.group(2)} 00:00:00'
    m = re.match(r'^(\d{2}):(\d{2})$', t)
    if m: return f'{TODAY} {m.group(1)}:{m.group(2)}:00'
    return None

def parse_job(raw):
    """raw 如 'ai架构师 15-25K 深圳 查看职位' -> (title, salary, city)"""
    if not raw or raw == '无职位条': return None, None, None
    s = raw.replace('查看职位', '').strip()
    if not s: return None, None, None
    city = None
    for c in CITIES:
        if re.search(r'[\s，,]' + c + r'$', s) or s.endswith(c):
            city = c; s = s[:s.rfind(c)].strip(); break
    salary = None
    m = re.search(r'(\d+[-~]\d+K(?:·\d+薪)?|\d+K[-~]\d+K|面议|\d+元/天|\d+-\d+元)', s)
    if m:
        salary = m.group(1); s = (s[:m.start()] + s[m.end():]).strip()
    title = re.sub(r'\s+', ' ', s).strip(' ,，') or None
    return title, salary, city

def company_of(r):
    name = r.get('name') or r['key'].split('|')[0]
    tb = r.get('titleBox') or ''
    rest = tb[len(name):] if tb.startswith(name) else tb
    comp = re.sub(r'(招聘者|招聘经理|招聘专员|招聘主管|HRBP经理|HRBP|HRD.*|HR\.|HR|hr|人力资源.*|人事.*|行政.*|经理|总监|专员|主管|高级|资深|法定代表人|法人代表|CEO|副总经理|总经理|副总|股东|区域|技术总监|产品总监|大数据架构师|联合创始人|业务副总|运营总监|销售经理|IT 部门经理|IT总监|部门经理|资深数据分析师|产品|负责人|助理|顾问|猎头|兼.*|\.\.\.|-|\s)+$', '', rest).strip()
    return comp or '待确认'

def classify(title):
    t = (title or '').lower()
    if re.search(r'产品经理|产品助理|产品运营|product|产品专家|产品负责人', t): return 'AI产品'
    if re.search(r'解决方案|售前|顾问|consult|架构师', t): return '解决方案'
    if re.search(r'交付|实施|项目经理|客户成功|运维|驻场|技术支持|售后|客服', t): return '交付'
    if re.search(r'分析师|业务分析|数据分析|需求分析|业务顾问|运营分析', t): return '业务分析'
    return '待确认'

REJECT_PAT = re.compile(r'不合适|不太匹配|不匹配|很遗憾|不符合|暂不考虑| pass|pass了|婉拒')
INTERVIEW_PAT = re.compile(r'面试邀请|约面|视频面试|现场面试|线下面试|线上初面|安排.*面试|面试时间')
RESUME_VIEW_PAT = re.compile(r'已查看了您的附件简历')
RESUME_SENT_PAT = re.compile(r'附件简历')

def flow_parts(r):
    flow = r.get('flow') or []
    times = [f['text'] for f in flow if f.get('kind') == 'time']
    me = [f for f in flow if f.get('kind') == 'msg' and f.get('sender') == 'me']
    hr = [f for f in flow if f.get('kind') == 'msg' and f.get('sender') == 'recruiter']
    sysm = [f.get('text', '') for f in flow if f.get('kind') == 'system'] + (r.get('sysTexts') or [])
    first_sender = next((f.get('sender') for f in flow if f.get('kind') == 'msg'), None)
    return times, me, hr, sysm, first_sender

def state_of(r):
    times, me, hr, sysm, first_sender = flow_parts(r)
    all_text = ' '.join([f.get('text', '') for f in (r.get('flow') or [])] + sysm)
    read = '未知'
    if me:
        t = me[-1].get('text', '')
        read = '是' if t.startswith('已读') else ('否' if t.startswith('送达') else '未知')
    elif hr:
        read = '是'
    dl = '是' if any(RESUME_VIEW_PAT.search(s) for s in sysm) else ('否' if any(RESUME_SENT_PAT.search(s) for s in sysm) else '未知')
    active = '是' if first_sender == 'recruiter' else ('否' if first_sender == 'me' else '未知')
    interview = '是' if INTERVIEW_PAT.search(all_text) else '否'
    if REJECT_PAT.search(all_text) and hr:
        status, nxt = '拒绝', '放弃'
    elif hr:
        status, nxt = '沟通中', '跟进'
    elif me:
        status, nxt = '无反馈', '待观察'
    else:
        status, nxt = '待确认', '待观察'
    first_dt = parse_dt(times[0]) if times else None
    last_dt = parse_dt(times[-1]) if times else None
    cycle = '待确认'
    if me and hr and len(times) >= 2:
        cycle = '约0天'
    return dict(read=read, dl=dl, active=active, interview=interview, status=status, nxt=nxt,
                first_dt=first_dt, last_dt=last_dt, cycle=cycle, hr=hr, me=me, sysm=sysm)

def src_key(r):
    raw = (r.get('job') or {}).get('raw') or '无职位条'
    return f"{r['key']} | {raw}"

# ============ B. 新增 440 条 ============
t1_rows, t2_rows, t3_rows = [], [], []
for r in new:
    raw = (r.get('job') or {}).get('raw') or ''
    title, salary, city = parse_job(raw)
    comp = company_of(r)
    direction = classify(title)
    st = state_of(r)
    src = src_key(r)
    jobtitle = title or ('待确认（职位条无信息）' if raw == '查看职位' else '待确认（聊天无职位入口）')
    hrs, mes = st['hr'], st['me']
    hr_fb = ' '.join(f.get('text', '').replace('\n', ' ')[:60] for f in hrs)[:150] or None
    if not mes and not hrs:
        note = '聊天无消息记录' + ('；聊天无职位入口' if not raw or raw == '无职位条' else '')
    elif not hrs:
        note = '我方已打招呼，对方无回复' + ('；消息未读' if st['read'] == '否' else '；消息已读未回' if st['read'] == '是' else '')
    else:
        note = (hrs[-1].get('text', '').replace('\n', ' ')[:80])
    t2_rows.append([st['first_dt'], direction, jobtitle, comp, '未知', st['read'], st['dl'], st['active'],
                    st['interview'], ('未知' if st['interview'] == '是' else '未开始'), st['status'], st['cycle'],
                    note, st['last_dt'], hr_fb, st['nxt'], None, src,
                    '高' if (mes or hrs) else '低', STAMP])
    if title:
        t1_rows.append([direction, jobtitle, comp, city or '待确认', salary or '待确认', '未提及',
                        '未提及（仅聊天职位条，未进入岗位详情页）', '未提及', None, '未提及', '未提及', '未提及',
                        '未提及', '未提及', '未提及',
                        3 if direction != '待确认' else 2,
                        '方向初判来自岗位标题；JD 未抽取，五维拆解待补充。' if direction != '待确认'
                        else '方向待确认（非目标四类）：研发/其他类岗位，仅有聊天职位条信息。',
                        None, src, '低', '中', STAMP])
    if hrs:
        all_hr = ' '.join(f.get('text', '') for f in hrs)
        focus = '其他'
        for pat, fcs in [(r'简历|作品|案例|项目', '项目经验'), (r'技术|熟悉|经验|栈', '技术能力'),
                         (r'离职|在职|长期|稳定', '稳定性'), (r'薪资|待遇|期望', '薪资'),
                         (r'到岗|入职|上班|地点|驻场|出差', '到岗时间'), (r'行业|领域', '行业经验')]:
            if re.search(pat, all_hr): focus = fcs; break
        result = '拒绝' if st['status'] == '拒绝' else ('继续推进' if len(hrs) >= 2 or mes else '待确认')
        nxt3 = '放弃' if result == '拒绝' else ('跟进' if st['status'] == '沟通中' else '准备案例')
        qs = '；'.join(f'{i+1}.{f.get("text","").replace(chr(10)," ")[:50]}' for i, f in enumerate(hrs[:3]))
        my = ' '.join(f.get('text', '').replace('\n', ' ')[4:].strip()[:40] for f in mes[:3])[:120] or '未回复'
        t3_rows.append([st['first_dt'], direction, jobtitle, comp,
                        'HR 面' if st['interview'] == '是' else '简单沟通', 'HR',
                        qs, [focus] if focus != '其他' else ['其他'], my, ['其他'],
                        '补项目复盘、Demo 与作品链接，按关注点定向准备',
                        result,
                        f'对方 {len(hrs)} 条消息，主要关注{focus}；当前{st["status"]}。',
                        nxt3, src,
                        hrs[-1].get('text', '').replace('\n', ' ')[:50], '高', STAMP])

# ============ A. 变更 70 条 -> 更新补丁 ============
def norm_key(k):
    name = k.split('|')[0]
    rest = k.split('|', 1)[1] if '|' in k else ''
    if rest.startswith(name): rest = rest[len(name):]
    return name, rest

updates, unmatched = [], []
for r in changed:
    name, rest = norm_key(r['key'])
    comp = company_of(r)
    rid = None
    for rec_id, src in t2_idkeys:
        if name in src and (comp != '待确认' and comp in src.replace(' ', '')):
            rid = rec_id; break
    st = state_of(r)
    hrs = st['hr']
    hr_fb = ' '.join(f.get('text', '').replace('\n', ' ')[:60] for f in hrs)[:150]
    patch = {
        '是否已读': st['read'], '是否下载简历': st['dl'], '是否主动沟通': st['active'],
        '是否面试': st['interview'], '当前状态': st['status'], '下一步动作': st['nxt'],
        '最后沟通时间': st['last_dt'], '采集时间': STAMP,
    }
    if hr_fb: patch['招聘方关键反馈'] = hr_fb
    patch = {k: v for k, v in patch.items() if v is not None}
    if rid:
        updates.append({'record_id': rid, 'key': r['key'], 'patch': patch})
    else:
        unmatched.append(r['key'])

json.dump({'fields': ['岗位方向','岗位名称','公司','城市','薪资','行业','核心职责','必备技能','高频关键词','硬门槛',
                      '它每天干什么','它要什么硬技能','它要什么业务经验','它要什么交付证据','它的硬门槛是什么',
                      '初步适配分','适配理由','岗位详情链接','来源聊天标识','信息完整度','置信度','采集时间'],
           'rows': t1_rows}, open(DATA + '/payload_prog_t1.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'fields': ['投递日期','岗位方向','岗位名称','公司','简历版本','是否已读','是否下载简历','是否主动沟通',
                      '是否面试','面试轮次','当前状态','反馈周期','备注','最后沟通时间','招聘方关键反馈','下一步动作',
                      '岗位详情链接','来源聊天标识','置信度','采集时间'],
           'rows': t2_rows}, open(DATA + '/payload_prog_t2.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'fields': ['沟通 / 面试日期','岗位方向','岗位名称','公司','沟通类型','当前轮次','对方核心问题','对方关注点',
                      '我的回答或已提供材料','暴露短板','可补强证据','结果','复盘结论','下一步动作','来源聊天标识',
                      '证据摘录','置信度','采集时间'],
           'rows': t3_rows}, open(DATA + '/payload_prog_t3.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'updates': updates, 'unmatched': unmatched}, open(DATA + '/payload_prog_t2upd.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'new': len(new), 't1': len(t1_rows), 't2': len(t2_rows), 't3': len(t3_rows),
                  'upd_matched': len(updates), 'upd_unmatched': len(unmatched),
                  't2_status': dict(collections.Counter(r[10] for r in t2_rows))}, ensure_ascii=False))
