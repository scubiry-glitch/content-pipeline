// axes/_examples.ts — Few-shot examples bank for 16 axis computers
//
// 来自 webapp/_fixtures.ts ANALYSIS（远翎资本 AI 基础设施 2026 Q2 评审），
// 改写为每个 computer 期望的 JSON schema 格式，作为 SYSTEM prompt 的 few-shot。
//
// 设计原则（P0-2 改进）：
// 1. 每个 example 必须包含 demo 级颗粒度：人名 / 数字 / 日期 / 原文片段
// 2. JSON schema 与 computer 的 INSERT 列对齐（避免装饰器字段名漂移）
// 3. 中文输出风格示范"报告体"：紧凑、有数字、避免套话
// 4. 每条 example 配 1-2 行注释说明为什么这是好答案
//
// 使用方式（在每个 computer 的 SYSTEM prompt 末尾追加）：
//   const SYSTEM = `${ROLE_AND_SCHEMA}\n\n${FEW_SHOT_HEADER}\n${EXAMPLES_FOR_COMMITMENTS}`;

export const FEW_SHOT_HEADER = `── 优秀输出范例（学习这种颗粒度与文风）──`;

// ============================================================
// people axis
// ============================================================

export const EX_COMMITMENTS = `[
  {"who":"沈岚","text":"两周内提交推理层 3 家 candidate 尽调包","due_at":"2026-04-25","state":"on_track","progress":0},
  {"who":"Wei Tan","text":"整理北美 5 家同业在推理层的退出路径对比","due_at":"2026-04-22","state":"on_track","progress":0},
  {"who":"周劭然","text":"补充 2023-2025 基础设施细分赛道基础利率","due_at":"2026-04-18","state":"on_track","progress":0}
]
// 每条都带：人名 / 具体数字（3 家、5 家）/ ISO 日期 / 状态。不要"将尽快跟进"这种模糊表达。`;

export const EX_ROLE_TRAJECTORY = `[
  {"who":"陈汀","role_label":"decider","confidence":0.92},
  {"who":"沈岚","role_label":"proposer","confidence":0.88},
  {"who":"Wei Tan","role_label":"challenger","confidence":0.85},
  {"who":"林雾","role_label":"moderator","confidence":0.7},
  {"who":"周劭然","role_label":"reporter","confidence":0.65}
]
// 角色按本场会议表现归类。confidence 反映证据强度，不是默认 0.5。`;

export const EX_SPEECH_QUALITY = `[
  {"who":"沈岚","entropy_pct":78,"followed_up_count":6,"sample_quote":"推理层在特定 workload 下有价格歧视空间，毛利结构比训练层更耐得住周期"},
  {"who":"Wei Tan","entropy_pct":72,"followed_up_count":5,"sample_quote":"训练层一旦摊到 10^27 flops，单位成本会碾过毛利曲线"},
  {"who":"陈汀","entropy_pct":65,"followed_up_count":8,"sample_quote":"上限可以谈，但 8000 万那种单笔，我们要准备好跟 LP 沟通预案"},
  {"who":"周劭然","entropy_pct":81,"followed_up_count":2,"sample_quote":"2023-2025 同类基础利率中位数 38%"}
]
// entropy_pct 高 = 信息密度高（带数字、引用、具体词）。followed_up_count = 被其他人引用/反驳次数。
// sample_quote 必须是原文中真实出现的强信息密度句。`;

export const EX_SILENCE_SIGNAL = `[
  {"who":"林雾","topic_id":"deal_flow","state":"abnormal_silence","anomaly_score":72},
  {"who":"Omar K.","topic_id":"hardware_quota","state":"normal_silence","anomaly_score":18}
]
// 只列异常（abnormal_silence / absent）+ 1-2 个对照。anomaly_score 必须给出量化判断而非默认 0。`;

// ============================================================
// projects axis
// ============================================================

export const EX_DECISION_PROVENANCE = `[
  {"title":"AI 基础设施方向从「加配」调整为「精选加配」，单笔上限 6000 万美元","proposer":"陈汀","rationale":"推理层在特定 workload 有价格歧视空间（沈岚论证）+ subadvisor 渠道已验证（Omar K. 18 次 warm intro / 4 个 term sheet）+ LP 集中度边界（林雾提示）","confidence":0.88,"is_current":true},
  {"title":"优先布局中游推理效率层，暂缓训练层加注","proposer":"沈岚","rationale":"3-5 年内训练层规模摊薄存在不确定性（Wei Tan 反对意见已记录）；中游毛利结构经 cohort 分析更耐周期","confidence":0.78,"is_current":true}
]
// title ≤40 字，rationale 必须串联具体支撑人 + 反对人的论据，不要泛泛"经过讨论"。`;

export const EX_ASSUMPTIONS = `[
  {"text":"推理层在特定 workload 下存在价格歧视空间，毛利结构耐周期","evidence_grade":"B","confidence":0.7},
  {"text":"H-chip 进口配额 Q3 可能再次收紧","evidence_grade":"C","confidence":0.55},
  {"text":"subadvisor 结构每月可稳定提供 3-5 个北美 warm intro","evidence_grade":"A","confidence":0.85},
  {"text":"训练层 3 年内单位成本会摊薄到碾过中游毛利","evidence_grade":"C","confidence":0.6}
]
// A=硬数据（有具体次数/比率） B=类比案例 C=直觉/趋势判断 D=道听途说。
// 抽取后必须能在原文找到支撑句；不能找到就降到 C/D。`;

export const EX_OPEN_QUESTIONS = `[
  {"text":"LP 对 6000 万-8000 万单笔上限的接受边界究竟在哪","category":"governance","owner":"陈汀"},
  {"text":"如何对冲 H-chip 配额收紧对头部两家 portfolio 的下行压力","category":"strategic","owner":"沈岚"},
  {"text":"推理层 cohort 划分标准（按 workload 类型 vs 按客户行业）","category":"analytical"}
]
// category: strategic / analytical / governance / operational。owner 可空，但出现 owner 时必须是会上明确指派的人。`;

export const EX_RISK_HEAT = `[
  {"text":"LP 对集中度的担忧尚未回应，超过 8000 万单笔可能触发 LP 沟通预案","severity":"high","action_taken":false,"trend":"up"},
  {"text":"H-chip 进口配额 Q3 可能再次收紧，影响 portfolio 头部两家头寸","severity":"high","action_taken":false,"trend":"up"},
  {"text":"中游推理层 workload 粘性数据样本仅来自北美 3 家，本土代表性不足","severity":"med","action_taken":false,"trend":"flat"}
]
// severity: low/med/high/critical。trend: up/flat/down。每条都要能定位到具体业务场景。`;

// ============================================================
// knowledge axis
// ============================================================

export const EX_REUSABLE_JUDGMENTS = `[
  {"text":"在算力供给不可逆短缺的赛道，价格歧视能力是中游层的护城河，比规模效应更耐周期","author":"沈岚","domain":"基础设施投资","generality_score":0.78},
  {"text":"中国 GP 拿到北美 deal flow 的关键不是品牌，是结构（subadvisor / warm intro 节奏）","author":"Omar K.","domain":"deal flow / 跨境","generality_score":0.85},
  {"text":"决策中位数（基础利率）应作为反共识断言的默认对照，而不是事后再补","author":"周劭然","domain":"投资方法论","generality_score":0.92}
]
// 抽"可迁移到其他场景"的判断，不是事实。generality_score 高 = 抽象普适。
// 每条必须能去掉具体公司名仍然成立。`;

export const EX_MENTAL_MODELS = `[
  {"model_name":"价格歧视（price discrimination）","by":"沈岚","correctly_used":true,"outcome":"用 workload 异质性论证毛利耐久度","confidence":0.85},
  {"model_name":"规模效应 / 单位成本曲线","by":"Wei Tan","correctly_used":true,"outcome":"以 10^27 flops 为门槛预测训练层成本碾压","confidence":0.82},
  {"model_name":"基础利率（base rate）","by":"周劭然","correctly_used":true,"outcome":"用 2023-2025 同类样本中位数 38% 校准 cohort 判断","confidence":0.9},
  {"model_name":"反身性 / 叙事拐点","by":"陈汀","correctly_used":false,"outcome":"未明确说明叙事强度与 LP 接受度的反身联系","confidence":0.55}
]
// 只列被显式或强隐式调用的模型；correctly_used=false 表示模型被引用但应用不到位。`;

export const EX_COGNITIVE_BIASES = `[
  {"bias_type":"anchoring","where_excerpt":"上限可以谈，但 8000 万那种单笔，我们要准备好跟 LP 沟通预案","by":"陈汀","severity":"med","mitigated":true,"mitigation_strategy":"林雾随后给出 LP 接受边界的具体量化"},
  {"bias_type":"survivorship","where_excerpt":"北美 3 家推理层案例毛利结构都很好","by":"沈岚","severity":"med","mitigated":false,"mitigation_strategy":"未拉同期失败案例对照"},
  {"bias_type":"base_rate_neglect","where_excerpt":"这次推理层和过去那波 SaaS 不一样","by":"沈岚","severity":"low","mitigated":true,"mitigation_strategy":"周劭然补了 2023-2025 中位数 38%"}
]
// where_excerpt 必须是原文片段（≤60 字），不要复述。
// bias_type ∈ anchoring/overconfidence/confirmation/survivorship/sunk_cost/availability/hindsight/groupthink/base_rate_neglect`;

export const EX_COUNTERFACTUALS = `[
  {"rejected_path":"单笔上限抬高到 8000 万美元，集中持有北美头部 1-2 家","rejected_by":"林雾","tracking_note":"6 个月后回看：若 LP Q2 募资条款收紧，这条路径将被动证伪","months_later_check":6},
  {"rejected_path":"训练层加注，跟随北美大型基金","rejected_by":"陈汀","tracking_note":"12 个月后回看：若 H-chip 配额放松且训练成本未摊薄到预期，需要重新评估","months_later_check":12}
]
// 仅列真正被否决的候选；tracking_note 必须给出"6/12 个月后用什么事实判断这条路径"。`;

// ============================================================
// meta axis
// ============================================================

export const EX_DECISION_QUALITY = `{
  "clarity": 0.85,
  "actionable": 0.82,
  "traceable": 0.78,
  "falsifiable": 0.7,
  "aligned": 0.88,
  "notes": {
    "clarity": "决议明确为「精选加配 + 单笔上限 6000 万」，目标可量化",
    "actionable": "3 条 action item 都带 owner+due，但缺乏验收指标",
    "traceable": "Wei Tan 数据 + Omar K. warm intro 数据可溯源；推理层毛利耐周期主要依赖类比",
    "falsifiable": "6 个月后看推理层投资 IRR / Q3 H-chip 配额政策即可证伪",
    "aligned": "与远翎 Q2 整体策略对齐，但与 LP 集中度边界仍有 gap"
  }
}
// 5 维各自必须有非空 notes，不能"评估通过"这种套话。
// 必须用本会议中真实出现的依据。`;

export const EX_MEETING_NECESSITY = `{
  "verdict": "partial",
  "suggested_duration_min": 75,
  "reasons": [
    {"k":"async_ok_section","t":"周劭然的 2023-2025 基础利率数据可提前异步分发","ratio":0.18},
    {"k":"irreplaceable_debate","t":"沈岚 vs Wei Tan 中游 vs 训练层 之争必须当场对垒","ratio":0.35},
    {"k":"info_asymmetry","t":"Omar K. 北美 warm intro 数据需要现场答疑","ratio":0.22},
    {"k":"repeated_consensus","t":"6000 万上限的 LP 沟通预案讨论与上次会议重复 80%","ratio":0.15}
  ]
}
// verdict: async_ok / partial / needed。每个 reason 必须给出占会议时长的 ratio (0-1) 与具体内容。`;

// ============================================================
// tension axis (P1-5 新增)
// ============================================================

export const EX_TENSIONS = `[
  {
    "tension_key": "T1",
    "between": ["沈岚", "Wei Tan"],
    "topic": "中游推理层 vs 训练层 哪一层是真护城河",
    "intensity": 0.82,
    "summary": "沈岚主张推理层在特定 workload 下有价格歧视空间，毛利结构更耐周期；Wei Tan 反驳训练层规模效应不可逆，10^27 flops 后单位成本会碾过中游毛利。",
    "moments": [
      {"who": "沈岚", "text": "推理层在特定 workload 下有价格歧视空间，毛利结构比训练层更耐得住周期"},
      {"who": "Wei Tan", "text": "训练层一旦摊到 10^27 flops，单位成本会碾过毛利曲线"}
    ]
  },
  {
    "tension_key": "T2",
    "between": ["陈汀", "林雾"],
    "topic": "单笔上限 集中度 vs LP 偏好",
    "intensity": 0.61,
    "summary": "陈汀倾向 8000 万单笔以保持集中度；林雾从 LP 接受度边界出发要求降到 6000 万，并提出合规预案前置。",
    "moments": [
      {"who": "陈汀", "text": "上限可以谈，但 8000 万那种单笔，我们要准备好跟 LP 沟通预案"},
      {"who": "林雾", "text": "LP 对集中度的接受边界，我们这次必须算清楚再加单笔"}
    ]
  },
  {
    "tension_key": "T3",
    "between": ["沈岚", "Omar K."],
    "topic": "北美配售节奏 vs subadvisor 本土化路径",
    "intensity": 0.44,
    "summary": "沈岚主张直接按北美配售节奏；Omar K. 提出 subadvisor 结构（每月 3-5 个 warm intro）作为更稳定的本土化路径。",
    "moments": [
      {"who": "Omar K.", "text": "过去 6 个月 18 次 warm intro，4 个进 term sheet，subadvisor 渠道已验证"}
    ]
  }
]
// intensity 量化强度，必须有区分（0.4 / 0.6 / 0.85），不要全部 0.5。
// moments 至少 1 条，理想 2-3 条；text 必须是原文真实片段（≤60 字）。
// between 至少 2 人；多人派系对立时可以 3-4 人。
// 只列实质对立，不包括澄清式提问、重复主张。`;

export const EX_AFFECT_CURVE = `{
  "samples": [
    {"t_sec": 0, "valence": 0.3, "intensity": 0.4, "tag": "opening"},
    {"t_sec": 600, "valence": -0.4, "intensity": 0.7, "tag": "T1_中游vs训练层"},
    {"t_sec": 1500, "valence": -0.5, "intensity": 0.85, "tag": "T1_峰值"},
    {"t_sec": 2400, "valence": 0.4, "intensity": 0.6, "tag": "N1_认知更新"},
    {"t_sec": 3600, "valence": -0.2, "intensity": 0.55, "tag": "T2_集中度争议"},
    {"t_sec": 5400, "valence": 0.6, "intensity": 0.5, "tag": "C1_共识达成"},
    {"t_sec": 7080, "valence": 0.5, "intensity": 0.3, "tag": "closing"}
  ],
  "tension_peaks": [
    {"t_sec": 1500, "note": "沈岚 vs Wei Tan 中游 vs 训练层 第二轮交锋，intensity 0.85"}
  ],
  "insight_points": [
    {"t_sec": 2400, "note": "陈汀认知更新：推理层从毛利陷阱转为机会窗口"}
  ]
}
// samples 5-15 个点，valence -1=紧张冲突 +1=放松一致；tag 与 tension/cognition 的 id 对应。`;
