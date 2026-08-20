import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const inputPath = path.join(root, 'data/derived/job_details_structured_20260817.json');
const outputPath = path.join(root, 'data/derived/job_requirements_5d_20260817.json');

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const dimensions = ['每天干什么', '硬技能', '业务经验', '交付证据', '硬门槛'];

const curated = {
  '严卓毅|严卓毅卓臣科技法人': {
    values: {
      每天干什么: ['引荐客户并销售电脑、网络与监控产品', '承接客户设备置换和技术服务', '制作短视频或直播内容'],
      硬技能: ['电脑、服务器、网络与监控技术服务'],
      业务经验: ['小型 IT 集成服务与数码产品销售'],
      交付证据: ['客户订单或技术服务案例'],
      硬门槛: ['经验不限', '学历不限'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]'],
      硬技能: ['responsibilities[1]', 'company_info'],
      业务经验: ['responsibilities[0]', 'company_info'],
      交付证据: ['responsibilities[0]', 'responsibilities[1]'],
      硬门槛: ['experience', 'education'],
    },
  },
  '杨明坡|杨明坡词元燃烧招聘者': {
    values: {
      每天干什么: ['设计高并发互动影游后端架构', '开发 Node.js 核心逻辑并串联前端', '落地 LLM、RAG 与向量记忆并优化性能'],
      硬技能: ['TypeScript、Node.js、Nest.js/Express', 'PostgreSQL/MySQL、Redis', 'WebSocket/HTTP、LLM API、RAG'],
      业务经验: ['6 年以上互联网或游戏后端经验', '互动影游、CRPG或视觉小说场景理解'],
      交付证据: ['百万级 DAU 实时剧情系统', '可运行的互动游戏规则与 AI 记忆系统'],
      硬门槛: ['本科及以上学历', '6 年以上互联网或游戏后端经验', '必须有 Redis 高性能缓存设计经验'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[2]', 'explicit_requirements[3]', 'explicit_requirements[4]'],
      业务经验: ['explicit_requirements[0]', 'explicit_requirements[5]'],
      交付证据: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[3]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[2]', 'explicit_requirements[3]'],
    },
  },
  '屠女士|屠女士杭州国技互联人事经理': {
    values: {
      每天干什么: ['开拓客户并获取销售线索', '分析需求、提供方案并推进报价签约回款', '维护客户并挖掘增购续费'],
      硬技能: ['客户需求分析与产品方案', '商务沟通与谈判', '云计算、智算与 AI 产品知识'],
      业务经验: ['公有云、IaaS、GPU 算力云与 AI 智能体销售', 'ToB 客户开发与维护'],
      交付证据: ['客户解决方案', '签约回款与增购续费记录'],
      硬门槛: ['大专及以上学历', '经验要求为 1 年以内'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[3]', 'responsibilities[4]'],
      硬技能: ['responsibilities[2]', 'explicit_requirements[1]', 'explicit_requirements[4]'],
      业务经验: ['responsibilities[1]', 'responsibilities[3]', 'responsibilities[4]'],
      交付证据: ['responsibilities[3]', 'responsibilities[4]'],
      硬门槛: ['explicit_requirements[0]', 'experience'],
    },
  },
  '陆蕴|陆蕴群核科技hrbp': {
    values: {
      每天干什么: ['用 AIGC 工具批量生成海外广告素材', '剪辑 TikTok、Meta、YouTube 与 Google Ads 视频', '分析投放数据并进行多版本 A/B 测试'],
      硬技能: ['PR、CapCut、Final Cut Pro 或 AE', 'Runway、Kling、Pika、Sora 等 AI 视频工具', 'AI 配音、Prompt 与多语种本地化'],
      业务经验: ['1-3 年以上出海广告视频剪辑经验', '熟悉 TikTok Shop、Meta 广告打法与风控'],
      交付证据: ['海外爆款素材案例或作品集', '海外素材库、Prompt 词库与配音模板'],
      硬门槛: ['大专及以上学历', '1-3 年以上出海广告视频剪辑经验', '熟练掌握至少 2-3 款 AI 视频工具'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[6]'],
      硬技能: ['explicit_requirements[2]', 'explicit_requirements[3]', 'explicit_requirements[4]'],
      业务经验: ['explicit_requirements[1]', 'explicit_requirements[6]'],
      交付证据: ['explicit_requirements[1]', 'responsibilities[8]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[3]'],
    },
  },
  '冯女士|冯女士宇日人事经理': {
    values: {
      每天干什么: ['设计 MLOps/LLMOps/AIOps 课程并授课', '讲解模型部署、监控、RAG、微调与评估', '调研客户需求并支持培训方案和项目交付'],
      硬技能: ['Python、TensorFlow/PyTorch', '模型训练部署监控与生命周期管理', 'RAG、Agent、向量数据库与大模型评估'],
      业务经验: ['6 年以上 AI 工程化、算法平台或智能运维经验', '企业培训、技术授课与项目指导'],
      交付证据: ['课程课件、案例与实验环境', '实验手册、实战项目和解决方案'],
      硬门槛: ['6 年及以上相关领域经验', '具备 Python 与主流机器学习框架能力', '学历要求为大专'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[7]'],
      硬技能: ['explicit_requirements[1]', 'explicit_requirements[2]', 'explicit_requirements[3]'],
      业务经验: ['explicit_requirements[0]', 'responsibilities[5]'],
      交付证据: ['responsibilities[0]', 'responsibilities[4]', 'explicit_requirements[7]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'education'],
    },
  },
  '金女士|金女士顾家家居HRBP': {
    values: {
      每天干什么: ['集成 AI 编码、测试与需求分析能力', '建设端到端研发数据链路和效能看板', '优化 CI/CD 门禁并推动团队规模化落地'],
      硬技能: ['IDE 插件或平台工具集成与 Prompt 优化', 'CI/CD、质量门禁与自动化发布', 'ETL、多源数据整合与指标看板'],
      业务经验: ['AI 辅助研发与研发效能建设', '从试点团队到规模化推广的平台落地'],
      交付证据: ['研发效能指标看板', '技术方案、API 文档与操作手册', '可复制的平台化方案'],
      硬门槛: ['本科', '5-10 年经验', '具备 AI 辅助编码、测试或需求分析实践'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[3]', 'responsibilities[5]', 'responsibilities[7]'],
      硬技能: ['explicit_requirements[1]', 'explicit_requirements[2]', 'explicit_requirements[3]', 'explicit_requirements[4]'],
      业务经验: ['explicit_requirements[0]', 'explicit_requirements[5]'],
      交付证据: ['responsibilities[4]', 'responsibilities[7]', 'responsibilities[8]'],
      硬门槛: ['education', 'experience', 'explicit_requirements[0]'],
    },
  },
  '杨女士|杨女士天娱数科招聘主管': {
    values: {
      每天干什么: ['访谈业务并梳理端到端流程', '拆解 AI 场景并设计最小可运行闭环', '配置 Agent、工作流、知识库并对接业务系统'],
      硬技能: ['Agent 平台、工作流编排、知识库与 Prompt', 'API、SQL、Python 或低代码工具', '业务流程梳理与系统集成'],
      业务经验: ['企业应用、流程自动化或 AI 应用经验', '至少参与一个企业级项目上线或真实试用'],
      交付证据: ['已上线或真实试用的企业级项目', '知识库、工作流模板、工具组件与测试集'],
      硬门槛: ['本科及以上学历', '2 年以上相关经验', '至少完整参与一个上线或真实试用项目'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[4]', 'responsibilities[5]'],
      硬技能: ['responsibilities[4]', 'responsibilities[5]', 'explicit_requirements[3]'],
      业务经验: ['explicit_requirements[1]', 'explicit_requirements[2]'],
      交付证据: ['explicit_requirements[1]', 'responsibilities[6]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]'],
    },
  },
  '李女士|李女士阿里集团招聘专员': {
    values: {
      每天干什么: ['研发核心搜索、推荐和广告系统', '推动搜推系统 AI Native 转型', '开发 Agent 编排框架并整合工具链、知识库与业务系统'],
      硬技能: ['Java、Python 或 C++', '分布式系统与性能优化', 'LLM 应用、Agent 框架与 RAG'],
      业务经验: ['2 年以上开发经验', '搜索、推荐、广告与亿级实时流量场景'],
      交付证据: ['高并发搜推广系统上线运维', '智能 Agent 系统与 Agent Infra'],
      硬门槛: ['2 年以上 Java、Python 或 C++ 开发经验', '熟悉 JVM 或 Python VM 至少一种', '计算机及相关专业背景'],
    },
    refs: {
      每天干什么: ['responsibilities[2]', 'responsibilities[3]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[3]'],
      业务经验: ['explicit_requirements[1]', 'responsibilities[2]'],
      交付证据: ['responsibilities[2]', 'responsibilities[4]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]'],
    },
  },
  '董先生|董先生开市科技信息招聘经理': {
    values: {
      每天干什么: ['组装 AI 服务器及 CPU、GPU、内存等部件', '安装风冷或液冷散热并完成理线包装', '上电自检、硬件排障并优化组装 SOP'],
      硬技能: ['x86 服务器拆装与 GPU 多卡装配', 'PCIe、NVLink、DDR5、SAS/SATA 等接口', 'BMC/IPMI、基础 Linux 与硬件排障'],
      业务经验: ['2 年以上服务器、工作站或工控机组装经验', 'AI/GPU 服务器生产装配场景'],
      交付证据: ['完成整机外观检查与包装出货', '组装 SOP 和不良品问题记录'],
      硬门槛: ['2 年以上硬件组装经验', '能独立拆装服务器核心部件', '能看懂组装图纸、BOM 与 SOP'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[4]', 'responsibilities[5]', 'responsibilities[8]', 'responsibilities[11]'],
      硬技能: ['explicit_requirements[1]', 'explicit_requirements[2]', 'responsibilities[9]'],
      业务经验: ['explicit_requirements[0]', 'responsibilities[0]'],
      交付证据: ['responsibilities[7]', 'responsibilities[11]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[3]'],
    },
  },
  '周女士|周女士字节跳动招聘者': {
    values: {
      每天干什么: ['设计和开发数据平台 AI 应用功能', '调优模型、Prompt 并评估效果', '调研前沿 AI 技术并沉淀方案文档'],
      硬技能: ['React/Vue/TypeScript 或 Node.js/Python/Go', '数据结构、算法、操作系统、网络或数据库基础', 'AI Agent、LLM、Prompt 与效果评估'],
      业务经验: ['数据平台 AI 应用', '独立完成模块设计、开发、调试与上线交付'],
      交付证据: ['上线交付的软件模块', '团队方案与技术文档'],
      硬门槛: ['2027 届本科或硕士毕业生', '扎实编程基础并熟悉至少一种主流语言'],
    },
    refs: {
      每天干什么: ['responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[1]', 'explicit_requirements[2]', 'explicit_requirements[3]'],
      业务经验: ['responsibilities[1]', 'explicit_requirements[2]'],
      交付证据: ['explicit_requirements[2]', 'responsibilities[4]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]'],
    },
  },
  '杭先生|杭先生微盟HRBP': {
    values: {
      每天干什么: ['推广 AI-GEO 与数字营销 SaaS 并开发客户', '演示产品、梳理需求并制定营销方案', '推进谈判签约回款并维护续费增购'],
      硬技能: ['客户开发、需求把控与商务谈判', '产品演示与定制营销方案', 'GEO/SEO/SEM 与数字营销 SaaS 知识'],
      业务经验: ['1 年以上 ToB 销售经验', '中小企业、品牌商家与营销服务商客户场景'],
      交付证据: ['签约、回款与项目交付记录', '客户增购、续费和转介绍结果'],
      硬门槛: ['大专及以上学历', '1 年及以上 ToB 销售经验', '适应电销与面销结合模式'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[2]', 'responsibilities[1]', 'explicit_requirements[4]'],
      业务经验: ['explicit_requirements[1]', 'responsibilities[0]'],
      交付证据: ['responsibilities[2]', 'responsibilities[3]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
    },
  },
  '杨女士|杨女士实在智能招聘经理': {
    values: {
      每天干什么: ['设计大模型软硬件适配方案', '定义客户交付需求与成功标准', '主导 Agent 方案执行并跟踪效果迭代'],
      硬技能: ['大模型软硬件交互方案设计', 'AI Agent 原理与应用边界', '产品说明文档和定制开发文案'],
      业务经验: ['客户业务场景需求提炼', 'AI 产品交付落地'],
      交付证据: ['成功的 AI 产品交付落地案例', '产品交付方案与成功标准'],
      硬门槛: ['本科', '3-5 年经验', '有成功的 AI 产品交付落地案例'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
      业务经验: ['explicit_requirements[3]', 'explicit_requirements[0]'],
      交付证据: ['explicit_requirements[0]', 'responsibilities[1]'],
      硬门槛: ['education', 'experience', 'explicit_requirements[0]'],
    },
  },
  '熊先生|熊先生超块招聘者': {
    values: {
      每天干什么: ['开发并落地业务 AI Agent', '沉淀 Agent 框架、模块与基础设施', '治理业务数据并部署调优 Agent 系统'],
      硬技能: ['Java 后端与 Web 工程体系', 'Prompt、RAG、Memory、多 Agent 工作流', '模型微调、数据治理、知识库与私有化部署'],
      业务经验: ['完整线上 Agent 项目或平台基建经验', '社交、通话、教学等业务数据治理'],
      交付证据: ['真实上线的核心 Agent 项目', 'Agent 平台、基建系统或可复用框架'],
      硬门槛: ['本科及以上相关专业', '必须有完整 AI 核心 Agent 落地项目', '精通 Java 后端并能独立从零搭建 Agent 系统'],
    },
    refs: {
      每天干什么: ['responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]', 'responsibilities[5]'],
      硬技能: ['explicit_requirements[3]', 'explicit_requirements[4]', 'explicit_requirements[5]'],
      业务经验: ['explicit_requirements[2]', 'responsibilities[3]'],
      交付证据: ['explicit_requirements[0]', 'explicit_requirements[2]', 'responsibilities[2]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]', 'explicit_requirements[3]'],
    },
  },
  '罗骁|罗骁宇链科技创始人CEO': {
    values: {
      每天干什么: ['规划政府端和企业端产品', '分析客户需求并设计流程、架构与原型', '协同研发测试推进上线与迭代'],
      硬技能: ['需求分析、产品架构与业务流程设计', '原型工具与产品功能设计', '系统测试验收与 AI 数据测试'],
      业务经验: ['5 年以上产品经验', 'ToG 或 ToB 产品设计与客户需求场景'],
      交付证据: ['0 到 1 及 1 到 N 产品设计项目', '产品原型、培训宣讲材料与验收成果'],
      硬门槛: ['本科以上学历', '5 年以上产品工作经验', '有 ToG 或 ToB 产品设计经验'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[1]', 'responsibilities[2]', 'explicit_requirements[5]'],
      业务经验: ['explicit_requirements[0]', 'explicit_requirements[3]'],
      交付证据: ['explicit_requirements[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬门槛: ['explicit_requirements[0]'],
    },
  },
  '王女士|王女士西安旺火创科有限公司人事专员': {
    values: {
      每天干什么: ['制定 AI 产品路线图和商业方向', '产出 PRD、交互原型并推进从 0 到 1', '跟踪产品指标并用 A/B 测试持续优化'],
      硬技能: ['PRD、交互原型与产品架构', 'LLM、RAG、Agent、Prompt 与模型评估', '数据分析、A/B 测试与项目管理'],
      业务经验: ['5 年以上互联网或科技产品经验', '至少 2 年 AI 产品与本地生活服务经验'],
      交付证据: ['AI 产品从 0 到 1 或大规模增长案例', '产品路线图、PRD、原型与指标结果'],
      硬门槛: ['统招本科及以上学历', '5 年以上产品经验且至少 2 年 AI 产品经验', '必须有本地生活服务工作经验'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['responsibilities[1]', 'explicit_requirements[2]', 'explicit_requirements[3]'],
      业务经验: ['explicit_requirements[0]'],
      交付证据: ['explicit_requirements[1]', 'responsibilities[0]', 'responsibilities[1]', 'responsibilities[3]'],
      硬门槛: ['explicit_requirements[0]'],
    },
  },
  '刘仁杰|刘仁杰清博智能人事经理': {
    values: {
      每天干什么: ['管理 AI 平台和行业产品全生命周期', '拆解客户场景并建立 AI 产品评测体系', '推进 PoC、MVP 到生产上线并沉淀标准模块'],
      硬技能: ['Agent、RAG、知识库与工具调用', 'PRD、原型、业务流程与版本规划', '模型评测、产品指标与数据闭环'],
      业务经验: ['4 年以上 AI、企业软件、数据平台或复杂 B 端产品经验', '企业客户调研、实施或客户成功经验'],
      交付证据: ['完整 AI 产品生产上线项目', '需求文档、产品原型、指标体系和版本规划'],
      硬门槛: ['本科及以上学历', '4 年以上产品工作经验', '完整参与至少一个 AI 产品生产上线全过程'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[2]', 'responsibilities[3]', 'responsibilities[4]', 'responsibilities[6]'],
      硬技能: ['explicit_requirements[3]', 'explicit_requirements[4]', 'explicit_requirements[6]'],
      业务经验: ['explicit_requirements[1]', 'explicit_requirements[7]'],
      交付证据: ['explicit_requirements[2]', 'explicit_requirements[6]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
    },
  },
  '朱敏|朱敏致拓科技HRBP': {
    values: {
      每天干什么: ['调研客户并设计端到端 AI 解决方案', '支持售前交流、招投标和方案编写', '协调资源推进交付并进行宣讲演示答疑'],
      硬技能: ['Python/Java/C++ 与 TensorFlow/PyTorch', 'NLP、计算机视觉与 AI 模型调优', '需求分析、方案编写与原型演示'],
      业务经验: ['3 年以上售前解决方案和项目交付经验', '互联网行业客户与 AI 解决方案场景'],
      交付证据: ['技术文档与解决方案', '招投标材料、原型演示和落地项目'],
      硬门槛: ['相关专业本科及以上学历', '3 年以上售前解决方案和项目交付经验', '精通 Python、Java 或 C++ 并熟悉深度学习框架'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[3]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[4]', 'responsibilities[0]', 'responsibilities[4]'],
      业务经验: ['explicit_requirements[0]', 'explicit_requirements[2]'],
      交付证据: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[4]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[4]'],
    },
  },
  '廖女士|廖女士沄尚电商HRM': {
    values: {
      每天干什么: ['驻场梳理业务并制定 AI 自动化方案', '搭建 Agent、API 与自动化工作流', '优化电商 AI 应用并完成项目交付'],
      硬技能: ['Agent 与工作流搭建', 'Python、JavaScript 或 API 调用', 'ChatGPT、Claude、Dify、Coze 等工具'],
      业务经验: ['电商内容生成、素材处理、数据分析与运营提效', '项目周期内驻场交付'],
      交付证据: ['完成的项目交付', '相关技术文档'],
      硬门槛: ['本科', '能接受项目周期内驻场'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
      业务经验: ['responsibilities[2]', 'explicit_requirements[3]', 'explicit_requirements[4]'],
      交付证据: ['responsibilities[4]'],
      硬门槛: ['education', 'explicit_requirements[4]'],
    },
  },
  '景喆宇|景喆宇奥启电竞招聘者': {
    values: {
      每天干什么: ['分析需求并规划 AI 产品', '协调团队推进模型落地与迭代', '设计产品原型并验证功能'],
      硬技能: ['需求梳理与产品方案输出', '产品原型设计与功能验证', '机器学习、NLP 或计算机视觉基础'],
      业务经验: ['AI 产品全生命周期管理', '技术与业务场景结合'],
      交付证据: ['产品原型和功能验证结果', '落地并迭代的 AI 产品'],
      硬门槛: ['本科', '1-3 年经验', '能独立完成需求梳理与产品方案输出'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[0]', 'explicit_requirements[1]', 'responsibilities[3]'],
      业务经验: ['responsibilities[0]', 'responsibilities[1]'],
      交付证据: ['responsibilities[1]', 'responsibilities[3]'],
      硬门槛: ['education', 'experience', 'explicit_requirements[1]'],
    },
  },
  '朱玥|朱玥实在智能HR': {
    values: {
      每天干什么: ['评估并设计大模型应用方案', '定义客户需求、成功标准和交付方案', '主导 Agent 交付并用效果反馈推动迭代'],
      硬技能: ['大模型软硬件交互方案设计', 'AI Agent 原理与应用边界', '产品说明文档与定制开发文案'],
      业务经验: ['客户场景洞察与需求提炼', 'AI 产品交付落地'],
      交付证据: ['成功的 AI 产品交付落地案例', '交付方案与业务价值验证结果'],
      硬门槛: ['本科', '3-5 年经验', '有成功的 AI 产品交付落地案例'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
      业务经验: ['explicit_requirements[3]', 'explicit_requirements[0]'],
      交付证据: ['explicit_requirements[0]', 'responsibilities[1]', 'responsibilities[3]'],
      硬门槛: ['education', 'experience', 'explicit_requirements[0]'],
    },
  },
  '张子枭|张子枭当贝网络技术总监': {
    values: {
      每天干什么: ['制定 AI 产品战略和落地路线图', '推动 Agent 与软硬件一体化产品化', '制定国际化策略并协调跨部门商业化落地'],
      硬技能: ['AI 产品全生命周期管理', 'Agent、LLM 与 AIGC 应用', '智能终端与 IoT 的 AI 集成方案'],
      业务经验: ['5 年以上产品且 3 年以上 AI 产品管理经验', 'AI 与软硬件结合项目经验'],
      交付证据: ['AI 与软硬件结合的项目', 'Agent 产品化及商业化落地成果'],
      硬门槛: ['相关专业本科及以上学历', '5 年以上产品经验且 3 年以上 AI 产品管理经验', '具备 AI 与软硬件结合项目经验'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['explicit_requirements[1]', 'explicit_requirements[2]', 'responsibilities[0]'],
      业务经验: ['explicit_requirements[0]', 'explicit_requirements[2]'],
      交付证据: ['explicit_requirements[2]', 'responsibilities[1]', 'responsibilities[3]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[2]'],
    },
  },
  '杨春山|杨春山南湖研究院产品经理': {
    values: {
      每天干什么: ['对接甲方并量化无人装备需求', '设计总体解决方案并编写论证材料', '面向高层或专家推演答辩并迭代方案'],
      硬技能: ['系统总体方案与需求量化', 'Visio 通信拓扑图和作战流程图', 'Word/Excel/PPT、基础 Python 与结构化写作'],
      业务经验: ['3 年以上无人系统、指控系统或军工电子经验', '装备采办或科研研制流程'],
      交付证据: ['完整参与无人装备型号或实验项目论证', '万字级总体论证报告与技术规格书'],
      硬门槛: ['相关专业本科及以上学历', '3 年以上无人系统、指控系统或军工电子经验', '至少参与一个项目论证且必须熟练使用 Visio'],
    },
    refs: {
      每天干什么: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]', 'responsibilities[4]'],
      硬技能: ['explicit_requirements[2]', 'explicit_requirements[3]', 'responsibilities[1]'],
      业务经验: ['explicit_requirements[1]'],
      交付证据: ['explicit_requirements[1]', 'responsibilities[2]', 'explicit_requirements[3]'],
      硬门槛: ['explicit_requirements[0]', 'explicit_requirements[1]', 'explicit_requirements[2]'],
    },
  },
  '孟先生|孟先生阿里巴巴集团高级开发工程师': {
    values: {
      每天干什么: ['开发电商大模型 Agent 应用', '推进多场景 AI 方案落地与效果验证', '建设技术中台并优化系统稳定性'],
      硬技能: ['传统工程研发与全栈开发', '机器学习、深度学习与数据处理', 'Agent 架构、模型训练部署与系统优化'],
      业务经验: ['电商 AI 产品与商业化场景', '从数据、模型到部署的全流程开发'],
      交付证据: ['部署上线并迭代的大模型 Agent 应用', '大模型应用技术中台'],
      硬门槛: ['本科', '应届'],
    },
    refs: {
      每天干什么: ['responsibilities[1]', 'responsibilities[2]', 'responsibilities[3]'],
      硬技能: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[3]'],
      业务经验: ['responsibilities[0]', 'responsibilities[1]', 'responsibilities[2]'],
      交付证据: ['responsibilities[1]', 'responsibilities[3]'],
      硬门槛: ['education', 'experience'],
    },
  },
};

function missingRecord(source) {
  const values = Object.fromEntries(dimensions.map((name) => [name, ['未提及']]));
  const refs = Object.fromEntries(dimensions.map((name) => [name, []]));
  return { values, refs };
}

if (input.length !== 176 || new Set(input.map((row) => row.source_key)).size !== 176) {
  throw new Error('Expected exactly 176 records with 176 unique source_key values');
}

const output = input.map((source) => {
  const extraction = curated[source.source_key] ?? missingRecord(source);
  for (const name of dimensions) {
    const items = extraction.values[name];
    if (!Array.isArray(items) || items.length < 1 || items.length > 3) {
      throw new Error(`${source.source_key}: ${name} must contain 1-3 items`);
    }
    if (!Array.isArray(extraction.refs[name])) {
      throw new Error(`${source.source_key}: ${name} must have evidence refs`);
    }
  }
  return {
    source_key: source.source_key,
    source_status: source.status,
    source_confidence: source.confidence,
    dimensions: Object.fromEntries(dimensions.map((name) => [name, extraction.values[name]])),
    evidence_refs: Object.fromEntries(dimensions.map((name) => [name, extraction.refs[name]])),
  };
});

const unknownCuratedKeys = Object.keys(curated).filter(
  (key) => !input.some((row) => row.source_key === key),
);
if (unknownCuratedKeys.length) {
  throw new Error(`Curated keys missing from input: ${unknownCuratedKeys.join(', ')}`);
}

const summary = Object.fromEntries(
  dimensions.map((name) => [
    name,
    output.filter((row) => row.dimensions[name].some((item) => item !== '未提及')).length,
  ]),
);

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  output: outputPath,
  records: output.length,
  unique_source_keys: new Set(output.map((row) => row.source_key)).size,
  source_status: Object.fromEntries([...new Set(output.map((row) => row.source_status))].map(
    (status) => [status, output.filter((row) => row.source_status === status).length],
  )),
  substantive_dimension_counts: summary,
}, null, 2));
