#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""增量分析：从采集 JSONL + JD JSONL + Base 导出，生成三张表的增量写入 payload。
规则化提取，不做主观臆测；不确定字段标「待确认」。"""
import json, re, sys
from datetime import date, timedelta
from collections import Counter

ROOT = "/Users/dmeck/project/boss-agent"
TODAY = date(2026, 7, 21)

ROLE_SUFFIX = re.compile(
    r"(招聘者|招聘专员|HRBP|HR|人事.*|招聘主管|招聘经理|猎头.*|经纪人|行政.*|总经理|ceo|CEO|产品总监|办公室主任|执行主任|员工|负责人|业务负责人|资深招聘专家|高级招聘顾问|人力.*|全栈开发|运营总监|研发技术总监|运营|经理|主管|总监|专员|助理|顾问|主任|创始人|技术主管|渠道总监|人事总监|人事经理|人事|总裁/总经理/CEO|招聘专员|CTO|cto)$")

AI_KWS = ["RAG", "Agent", "AIGC", "LLM", "Prompt", "向量数据库", "知识库", "智能体", "工作流", "大模型", "MCP", "LangChain", "Dify", "模型评测", "多模态", "fine-tuning", "微调"]
TECH_KWS = ["Python", "SQL", "API", "Java", "JavaScript", "TypeScript", "Vue", "React", "Spring", "FastAPI", "Docker", "K8s", "数据库", "云服务", "私有化部署", "系统集成", "数据处理", "爬虫", "Git", "Linux", "Redis", "MySQL", "PostgreSQL", "MongoDB", "Node"]
PROD_KWS = ["PRD", "原型", "需求分析", "用户调研", "产品规划", "竞品分析", "产品路线图", "数据指标", "Axure", "Figma"]
SOL_KWS = ["售前", "PoC", "方案撰写", "客户调研", "标书", "演示", "行业解决方案", "商务沟通"]
DEL_KWS = ["项目管理", "实施", "上线", "验收", "培训", "驻场", "客户成功", "进度管理", "风险管理", "交付"]
IND_MAP = [("教育", ["教育", "K12", "培训"]), ("政企", ["政企", "政务", "政府", "事业单位", "公安", "智慧城市"]),
           ("金融", ["金融", "银行", "证券", "保险", "量化", "支付"]), ("医疗", ["医疗", "医药", "医院", "健康"]),
           ("工业", ["工业", "制造", "工厂", "IoT", "物联网"]), ("企业服务", ["企业服务", "SaaS", "ToB", "B端", "OA", "CRM"]),
           ("电商", ["电商", "跨境", "贸易", "零售"]), ("传媒", ["传媒", "广告", "新媒体", "短视频", "影视", "动画", "游戏"])]

def load_chats():
    seen = {}
    for l in open(f"{ROOT}/data/boss_chats_raw.jsonl"):
        r = json.loads(l)
        seen[r["key"]] = r
    return list(seen.values())

def load_jds():
    out = {}
    for l in open(f"{ROOT}/data/boss_jd_raw.jsonl"):
        r = json.loads(l)
        if not r.get("error") and r.get("jd"):
            out[r["key"]] = r
    return out

def parse_job_bar(raw):
    """'AI应用开发工程师（Java） 13-20K 上海 查看职位' -> title, salary, city"""
    if not raw:
        return "", "", ""
    s = raw.replace("查看职位", "").strip()
    m = re.search(r"(\d+-\d+K(?:·\d+薪)?|\d+K以下|\d+K以上|面议)", s)
    if not m:
        return s, "", ""
    title = s[:m.start()].strip()
    rest = s[m.end():].strip()
    city = rest.split()[0] if rest else ""
    return title, m.group(1), city

def parse_company(r):
    tb = r.get("titleBox", "")
    name = r.get("name", "")
    rest = tb[len(name):] if tb.startswith(name) else tb
    comp = ROLE_SUFFIX.sub("", rest).strip()
    return comp or "待确认"

def parse_time_token(tok):
    """'昨天 16:33' / '07-18 09:48' / '14:14' / '前天 10:00' -> date|None"""
    tok = tok.strip()
    m = re.match(r"(\d{2})-(\d{2})\s+(\d{2}):(\d{2})", tok)
    if m:
        return date(2026, int(m.group(1)), int(m.group(2))), f"{m.group(3)}:{m.group(4)}"
    if tok.startswith("昨天"):
        mm = re.search(r"(\d{2}:\d{2})", tok)
        return TODAY - timedelta(days=1), (mm.group(1) if mm else "")
    if tok.startswith("前天"):
        mm = re.search(r"(\d{2}:\d{2})", tok)
        return TODAY - timedelta(days=2), (mm.group(1) if mm else "")
    m = re.match(r"^(\d{1,2}):(\d{2})$", tok)
    if m:
        return TODAY, tok
    m = re.match(r"(\d+)月(\d+)日\s*(\d{1,2}:\d{2})?", tok)
    if m:
        return date(2026, int(m.group(1)), int(m.group(2))), (m.group(3) or "")
    return None, ""

def walk_flow(r):
    """返回结构化聊天事件：[(date,time,sender,text,read)]，系统消息 sender=system"""
    events = []
    cur_d, cur_t = None, ""
    for m in r.get("flow", []):
        if m.get("kind") == "time":
            cur_d, cur_t = parse_time_token(m.get("text", ""))
            continue
        txt = (m.get("text") or "").strip()
        read = ""
        if txt.startswith("已读"):
            read, txt = "已读", txt[2:].strip()
        elif txt.startswith("送达"):
            read, txt = "送达", txt[2:].strip()
        events.append({"d": cur_d, "t": cur_t, "sender": m.get("sender"), "text": txt, "read": read})
    return events

def classify_direction(title, jd=""):
    t = title or ""
    if re.search(r"解决方案|售前", t): return "解决方案"
    if re.search(r"交付|实施顾问|实施工程师|项目经理|客户成功", t): return "交付"
    if re.search(r"业务分析|数据分析|需求分析|业务顾问|运营分析", t): return "业务分析"
    if re.search(r"产品", t): return "AI产品"
    # 标题不明确看职责/关键词
    blob = t + (jd or "")
    if re.search(r"解决方案|售前", blob): return "解决方案"
    if re.search(r"交付|实施|驻场|客户成功", blob[:400]): return "交付"
    if re.search(r"AI|人工智能|大模型|AIGC|Agent|智能体|算法|LLM|研发|工程师|开发|全栈|Java|Python|前端|后端|数据|技术|运维|测试|爬虫", t, re.I): return "AI产品"
    return "待确认"

def scan_kws(text, kws):
    return [k for k in kws if k.lower() in (text or "").lower()]

def pick_industry(text):
    for name, pats in IND_MAP:
        if any(p in (text or "") for p in pats):
            return name
    return "未提及"

def extract_thresholds(text):
    hits = []
    for pat in [r"(博士|硕士|本科|大专|学历不限|统招本科)", r"(\d+-\d+年|\d+年以上|经验不限|应届)",
                r"(计算机相关|计算机专业|理工科)", r"(接受出差|能出差|出差)", r"(驻场)", r"(英语[CET46级读写听说流利]*)"]:
        m = re.search(pat, text or "")
        if m: hits.append(m.group(0))
    return "、".join(dict.fromkeys(hits)) or "未提及"

def first_sentences(text, n=3, mx=220):
    parts = re.split(r"(?<=[。；;])\s*|\n+", (text or "").strip())
    parts = [p.strip() for p in parts if len(p.strip()) >= 8]
    out = " ".join(parts[:n])
    return out[:mx] or "未提及"

def resume_version(events):
    for e in events:
        if e["sender"] == "system" and ".pdf" in e["text"]:
            f = e["text"]
            if "LLM应用产品" in f or "ink_memory" in f: return "AI产品版"
            if "symbolcatalyst" in f: return "解决方案版"
            return "未知"
    return "未知"

def analyze_chat(r, jd_rec):
    job_raw = (r.get("job") or {}).get("raw", "")
    title, salary, city = parse_job_bar(job_raw)
    company = parse_company(r)
    jd = (jd_rec or {}).get("jd", "")
    company_info = (jd_rec or {}).get("companyInfo", "")
    ev = walk_flow(r)
    my = [e for e in ev if e["sender"] == "me"]
    hr = [e for e in ev if e["sender"] == "recruiter"]
    sysm = [e for e in ev if e["sender"] == "system"]
    first_my = next((e for e in my if e["d"]), None)
    last_ev = next((e for e in reversed(ev) if e["d"]), None)
    is_read = any(e["read"] == "已读" for e in my)
    resume_dl = any("已发送给对方" in e["text"] for e in sysm)
    hr_active = len(hr) > 0
    interview = any(re.search(r"面试邀请|面试间|线上面试|面试时间|视频面试|现场面试|约面", e["text"]) for e in ev)
    rejected = any(re.search(r"不合适|很遗憾|抱歉.*不|暂不匹配|不太匹配", e["text"]) for e in hr)
    if interview: status = "面试"
    elif rejected: status = "拒绝"
    elif hr_active: status = "沟通中"
    else: status = "无反馈"
    # 反馈周期
    period = "待确认"
    if first_my:
        first_resp = next((e for e in ev if e["sender"] in ("recruiter", "system") and e["d"] and first_my["d"] and e["d"] >= first_my["d"]), None)
        if first_resp and first_resp["d"]:
            period = f"约{(first_resp['d'] - first_my['d']).days}天"
    direction = classify_direction(title, jd)
    blob = title + " " + jd
    kws = list(dict.fromkeys(scan_kws(blob, AI_KWS + TECH_KWS + PROD_KWS + SOL_KWS + DEL_KWS)))[:8]
    hr_q = [e["text"] for e in hr if re.search(r"[?？]|吗$|是否|方便|能不能|可以", e["text"])][:3]
    next_act = {"沟通中": "跟进", "面试": "准备面试", "拒绝": "放弃", "无反馈": "待观察"}[status]
    last_dt = f"{last_ev['d'].isoformat()} {last_ev['t'] or '00:00'}:00" if last_ev else None
    return {
        "key": r["key"], "title": title or "待确认", "company": company, "salary": salary, "city": city,
        "direction": direction, "jd": jd, "company_info": company_info, "kws": kws,
        "status": status, "is_read": "是" if is_read else ("未知" if not my else "否"),
        "resume_dl": "是" if resume_dl else "未知", "hr_active": "是" if hr_active else "否",
        "interview": "是" if interview else "否", "period": period, "next_act": next_act,
        "first_my_date": first_my["d"].isoformat() if first_my else None,
        "last_dt": last_dt,
        "hr_msgs": [e["text"] for e in hr][:5], "my_msgs": [e["text"] for e in my][-3:],
        "hr_q": hr_q, "resume_ver": resume_version(ev),
        "sys_note": "；".join(e["text"][:40] for e in sysm[:3]),
        "job_url": (jd_rec or {}).get("url", ""),
        "jd_title": (jd_rec or {}).get("name", ""),
        "has_jd": bool(jd),
        "closed": "职位已关闭" in ((jd_rec or {}).get("company", "") + (jd_rec or {}).get("title", "")),
        "events": ev,
    }

def main():
    chats = load_chats()
    jds = load_jds()
    t1 = json.load(open(f"{ROOT}/data/base_dump/t1_sample.json"))
    t2 = json.load(open(f"{ROOT}/data/base_dump/t2_feedback.json"))
    t3 = json.load(open(f"{ROOT}/data/base_dump/t3_review.json"))
    # 列序（与 markdown 表头一致）
    c1 = ["岗位方向","薪资","它的硬门槛是什么","行业","高频关键词","核心职责","置信度","必备技能","它要什么交付证据","它要什么硬技能","信息完整度","硬门槛","岗位名称","采集时间","它每天干什么","适配理由","它要什么业务经验","城市","初步适配分","公司","来源聊天标识","岗位详情链接"]
    c2 = ["投递日期","当前状态","是否主动沟通","岗位方向","反馈周期","简历版本","招聘方关键反馈","备注","公司","面试轮次","下一步动作","置信度","岗位名称","是否下载简历","最后沟通时间","岗位详情链接","是否面试","采集时间","来源聊天标识","是否已读"]
    c3 = ["沟通 / 面试日期","沟通类型","当前轮次","下一步动作","岗位名称","证据摘录","来源聊天标识","结果","我的回答或已提供材料","暴露短板","置信度","采集时间","复盘结论","可补强证据","岗位方向","对方核心问题","公司","对方关注点"]
    def norm(s):
        return re.sub(r"[\s　（）()·,，/]+", "", str(s or "")).lower()
    def ex_name(src):
        src = str(src or "")
        for pat in [r"#\d+\s*\|\s*([^\s|]+)", r"batch_\w+\s*\|\s*([^\s|]+)", r"chat_\w+｜([^·|]+)"]:
            m = re.match(pat, src)
            if m: return m.group(1)
        return ""
    def exist_index(rows, ci_company, ci_title, ci_src):
        out = []
        for row in rows:
            comp = row[ci_company] if ci_company < len(row) else ""
            tit = row[ci_title] if ci_title < len(row) else ""
            src = row[ci_src] if ci_src < len(row) else ""
            if isinstance(comp, list): comp = comp[0] if comp else ""
            out.append({"name": ex_name(src), "title": norm(tit), "comp": norm(comp)})
        return out
    e1 = exist_index(t1["rows"], c1.index("公司"), c1.index("岗位名称"), c1.index("来源聊天标识"))
    e2 = exist_index(t2["rows"], c2.index("公司"), c2.index("岗位名称"), c2.index("来源聊天标识"))
    e3 = exist_index(t3["rows"], c3.index("公司"), c3.index("岗位名称"), c3.index("来源聊天标识"))
    def already(eidx, r, title, company):
        nt, nc, nm = norm(title), norm(company), r.get("name", "")
        if not nt: return False
        for e in eidx:
            if not e["title"]: continue
            if not (nt in e["title"] or e["title"] in nt): continue
            if e["name"] and e["name"] == nm: return True
            if nc and e["comp"] and (nc in e["comp"] or e["comp"] in nc): return True
        return False

    new1, new2, new3 = [], [], []
    stats = Counter()
    for r in chats:
        a = analyze_chat(r, jds.get(r["key"]))
        if a["closed"]:
            stats["closed"] += 1
        # ---- 表2 投递反馈（全覆盖） ----
        if not already(e2, r, a["title"], a["company"]) and a["title"] != "待确认":
            conf = "高" if a["has_jd"] else ("中" if a["hr_active"] == "是" else "低")
            note = ("HR: " + "；".join(m[:60] for m in a["hr_msgs"][:3])) if a["hr_msgs"] else "无回复"
            if a["closed"]: note += "；【岗位已关闭】"
            new2.append({
                "投递日期": (a["first_my_date"] or "待确认") + (" 00:00:00" if a["first_my_date"] else ""),
                "当前状态": a["status"], "是否主动沟通": a["hr_active"], "岗位方向": a["direction"] if a["direction"] != "待确认" else "AI产品",
                "反馈周期": a["period"], "简历版本": a["resume_ver"],
                "招聘方关键反馈": (a["hr_msgs"][0][:120] if a["hr_msgs"] else "无"),
                "备注": note[:500], "公司": a["company"],
                "面试轮次": ("HR" if a["interview"] == "是" else "未开始"),
                "下一步动作": a["next_act"], "置信度": conf, "岗位名称": a["title"],
                "是否下载简历": a["resume_dl"], "最后沟通时间": a["last_dt"],
                "岗位详情链接": a["job_url"] or None, "是否面试": a["interview"],
                "采集时间": "2026-07-21", "来源聊天标识": f'{a["key"]} | {(r.get("job") or {}).get("raw","")}'[:180],
                "是否已读": a["is_read"],
            })
            stats["t2_new"] += 1
        # ---- 表1 岗位样本（有 JD 或职位条信息完整） ----
        if not already(e1, r, a["title"], a["company"]) and a["title"] != "待确认" and (a["has_jd"] or (a["salary"] and a["city"])):
            jd_txt = a["jd"]
            duties = first_sentences(jd_txt, 3) if jd_txt else "未提及（未打开岗位详情）"
            skills = a["kws"][:5]
            thr = extract_thresholds(jd_txt) if jd_txt else "未提及"
            ind = pick_industry(jd_txt + " " + a["company_info"])
            biz = "、".join([n for n, ps in IND_MAP if any(p in (jd_txt + a["company_info"]) for p in ps)]) or "未提及"
            evid_kws = scan_kws(jd_txt, ["上线", "案例", "项目经验", "作品", "Demo", "标书", "验收", "落地"])
            ai_hit = scan_kws(jd_txt + a["title"], AI_KWS)
            if a["direction"] in ("AI产品", "解决方案") and len(ai_hit) >= 2: score, why = 4, "方向匹配且JD含多项AI关键词；需确认业务经验与交付证据是否充分。"
            elif a["direction"] in ("AI产品", "解决方案"): score, why = 3, "方向相关但AI关键词较少，需要包装或补项目证据。"
            elif a["direction"] == "交付": score, why = 3, "交付类岗位，与AI落地经验部分相关，需补交付证据。"
            else: score, why = 2, "方向弱相关或门槛不清，建议低优先级。"
            if re.search(r"移民顾问|销售|客服|电销", a["title"]): score, why = 1, "岗位方向明显不匹配。"
            new1.append({
                "岗位方向": a["direction"] if a["direction"] != "待确认" else "AI产品",
                "薪资": a["salary"] or None, "它的硬门槛是什么": thr, "行业": ind,
                "高频关键词": a["kws"][:6], "核心职责": duties,
                "置信度": "高" if a["has_jd"] else "中", "必备技能": "、".join(skills) or "未提及",
                "它要什么交付证据": "、".join(evid_kws) or "未提及",
                "它要什么硬技能": "、".join(skills) or "未提及",
                "信息完整度": "高" if a["has_jd"] else "中", "硬门槛": thr,
                "岗位名称": a["title"], "采集时间": "2026-07-21",
                "它每天干什么": duties, "适配理由": why,
                "它要什么业务经验": biz, "城市": a["city"] or None,
                "初步适配分": score, "公司": a["company"],
                "来源聊天标识": f'{a["key"]} | {(r.get("job") or {}).get("raw","")}'[:180],
                "岗位详情链接": a["job_url"] or None,
            })
            stats["t1_new"] += 1
        # ---- 表3 面试/沟通复盘（有实质沟通） ----
        if not already(e3, r, a["title"], a["company"]) and a["hr_active"] == "是" and len(a["hr_msgs"]) >= 1 and a["title"] != "待确认":
            q = a["hr_q"] or a["hr_msgs"][:3]
            focus = []
            qb = " ".join(q)
            if re.search(r"熟悉|技术|框架|语言|栈", qb): focus.append("技术能力")
            if re.search(r"项目|经验|做过", qb): focus.append("项目经验")
            if re.search(r"行业|领域", qb): focus.append("行业经验")
            if re.search(r"哪|城市|北京|上海|杭州|到岗|在职", qb): focus.append("稳定性")
            if re.search(r"薪资|期望", qb): focus.append("薪资")
            if not focus: focus = ["其他"]
            weak = []
            if re.search(r"几年|经验", qb): weak.append("缺项目证据")
            if re.search(r"熟悉吗|会不会|技术", qb): weak.append("缺技术细节")
            if a["interview"] == "是": weak.append("其他")
            if not weak: weak = ["其他"]
            result = {"沟通中": "继续推进", "面试": "面试中", "拒绝": "拒绝", "无反馈": "无反馈"}[a["status"]]
            new3.append({
                "沟通 / 面试日期": (a["first_my_date"] or "待确认") + (" 00:00:00" if a["first_my_date"] else ""),
                "沟通类型": ("HR面" if a["interview"] == "是" else "简单沟通"),
                "当前轮次": ("HR" if a["interview"] == "是" else "未知"),
                "下一步动作": ("准备面试" if a["interview"] == "是" else ("跟进" if a["status"] == "沟通中" else "放弃" if a["status"] == "拒绝" else "待观察")),
                "岗位名称": a["title"],
                "证据摘录": (a["hr_msgs"][0][:50] if a["hr_msgs"] else ""),
                "来源聊天标识": f'{a["key"]} | {(r.get("job") or {}).get("raw","")}'[:180],
                "结果": result,
                "我的回答或已提供材料": "；".join(m[:60] for m in a["my_msgs"][-2:])[:200] or "未回复",
                "暴露短板": weak[:2], "置信度": "中", "采集时间": "2026-07-21",
                "复盘结论": ("对方有实质提问并推进沟通，需针对性准备回答。" if a["status"] == "沟通中" else "已进入面试流程，重点准备项目证据与技术细节。" if a["status"] == "面试" else "沟通后无进一步推进，回顾匹配度。"),
                "可补强证据": "补 GitHub / 开源项目链接、补 Demo / 案例说明、补项目复盘与技术说明",
                "岗位方向": a["direction"] if a["direction"] != "待确认" else "AI产品",
                "对方核心问题": "；".join(x[:80] for x in q)[:240],
                "公司": a["company"], "对方关注点": focus[:3],
            })
            stats["t3_new"] += 1
    json.dump({"fields": c1, "rows": [[rec.get(f) for f in c1] for rec in new1]}, open(f"{ROOT}/data/payload_t1.json", "w"), ensure_ascii=False, indent=1)
    json.dump({"fields": c2, "rows": [[rec.get(f) for f in c2] for rec in new2]}, open(f"{ROOT}/data/payload_t2.json", "w"), ensure_ascii=False, indent=1)
    json.dump({"fields": c3, "rows": [[rec.get(f) for f in c3] for rec in new3]}, open(f"{ROOT}/data/payload_t3.json", "w"), ensure_ascii=False, indent=1)
    print(dict(stats))
    print("payloads:", len(new1), len(new2), len(new3))
    # QA 预览
    dirs2 = Counter(r[3] for r in json.load(open(f"{ROOT}/data/payload_t2.json"))["rows"])
    print("t2 direction dist:", dict(dirs2))
    stat2 = Counter(r[1] for r in json.load(open(f"{ROOT}/data/payload_t2.json"))["rows"])
    print("t2 status dist:", dict(stat2))

if __name__ == "__main__":
    main()
