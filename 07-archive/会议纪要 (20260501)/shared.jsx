// shared.jsx — mock data + primitives shared across all three variants

// ─────────────────────────────────────────────────────────
// Mock meeting: 虚构的投资/战略会议
// ─────────────────────────────────────────────────────────
const MEETING = {
  id: "M-2026-04-11-0237",
  title: "2026 Q2 远翎资本 · AI 基础设施投资策略评审",
  date: "2026-04-11",
  duration: "118 分钟",
  room: "上海 · 外滩 22 号 5F",
  source: "zoom-recording-237.m4a + 会议纪要初稿.docx",
  tokens: "41,382",
};

const PARTICIPANTS = [
  { id:"p1", name:"陈汀", role:"管理合伙人", initials:"陈", tone:"neutral",  speakingPct: 28 },
  { id:"p2", name:"沈岚", role:"基础设施方向负责人", initials:"沈", tone:"warm",   speakingPct: 23 },
  { id:"p3", name:"Wei Tan", role:"硅谷顾问", initials:"WT", tone:"cool",   speakingPct: 19 },
  { id:"p4", name:"周劭然", role:"分析师 · 本场纪要作者", initials:"周", tone:"neutral",  speakingPct: 11 },
  { id:"p5", name:"林雾", role:"LP 代表(旁听)", initials:"林", tone:"cool",   speakingPct: 8  },
  { id:"p6", name:"Omar K.", role:"行业顾问(远程)", initials:"OK", tone:"warm",   speakingPct: 11 },
];

// Recommended experts for this meeting — picked by the batch-ops style engine
const EXPERTS = [
  {
    id: "E09-09",
    name: "二阶思考者 · Howard",
    field: "投资哲学 / 概率思维",
    style: "冷静、反共识、偏好通过否定逼近答案",
    match: 0.94,
    calibration: "Brier 0.18 · overbias -0.04",
    mentalModels: ["二阶效应","反身性","基础利率","失败前提 pre-mortem"],
    signature: "从市场共识的反面开始提问",
    recommendedFor: ["tension","belief_evolution"],
    selected: true,
  },
  {
    id: "E04-12",
    name: "产业链测绘师 · Marco",
    field: "硬科技 / 供应链",
    style: "以事实链条锚定判断，重证据",
    match: 0.91,
    calibration: "Brier 0.21 · overbias +0.02",
    mentalModels: ["瓶颈分析","替代弹性","单点故障","Wright's Law"],
    signature: "追溯到 BOM 与产能瓶颈",
    recommendedFor: ["focus_map","consensus"],
    selected: true,
  },
  {
    id: "E11-03",
    name: "叙事追踪者 · 清野",
    field: "市场心理 / 叙事周期",
    style: "擅长识别叙事曲线与反身性拐点",
    match: 0.86,
    calibration: "Brier 0.24 · overbias +0.08",
    mentalModels: ["叙事的生命周期","反身性","meme → 资本 → 基本面"],
    signature: "用叙事强度预估资金流向",
    recommendedFor: ["new_cognition","tension"],
    selected: true,
  },
  {
    id: "E07-18",
    name: "基础利率检察官",
    field: "统计直觉 / 归因",
    style: "以基础利率质疑每一个\"这次不一样\"",
    match: 0.78,
    calibration: "Brier 0.16 · overbias -0.09",
    mentalModels: ["Base Rate","幸存者偏差","参考类预测"],
    signature: "提供同类样本的历史命中率",
    recommendedFor: ["consensus","belief_evolution"],
    selected: false,
  },
  {
    id: "E02-41",
    name: "制度与治理观察者",
    field: "合规 / 地缘",
    style: "自底向上的政策敏感度",
    match: 0.69,
    calibration: "Brier 0.28 · overbias +0.11",
    mentalModels: ["监管捕获","合规阈值","地缘摩擦"],
    signature: "识别被低估的制度摩擦",
    recommendedFor: ["focus_map"],
    selected: false,
  },
];

// The 6 dimensions the product exposes
const DIMENSIONS = [
  { id:"minutes",         label:"常规纪要",    sub:"发言序列 · 决议 · 行动项",            accent:"ink"    },
  { id:"tension",         label:"张力",        sub:"观点之间的推拉、犹豫与让步",         accent:"accent" },
  { id:"new_cognition",   label:"新认知",      sub:"会议中被更新/翻转的信念",             accent:"teal"   },
  { id:"focus_map",       label:"各自关注点",  sub:"每位参与者反复回到的议题",             accent:"amber"  },
  { id:"consensus",       label:"共识与分歧",  sub:"哪些已对齐、哪些仍在分岔",             accent:"accent" },
  { id:"cross_view",      label:"关键观点的他人观点", sub:"对一条主张，其他人如何回应",      accent:"teal"   },
];

// Sample analysis content per dimension — authored so the 3 variants can
// reuse the same substance but arrange it differently.
const ANALYSIS = {
  summary: {
    decision: "对 AI 基础设施方向从「加配」调整为「精选加配」：单笔上限 6,000 万美元，优先布局中游推理效率层。",
    actionItems: [
      { id:"A1", who:"沈岚", what:"两周内提交推理层 3 家 candidate 尽调包",  due:"2026-04-25" },
      { id:"A2", who:"Wei Tan", what:"整理北美 5 家同业在推理层的退出路径对比",  due:"2026-04-22" },
      { id:"A3", who:"周劭然", what:"补充 2023-2025 基础设施细分赛道基础利率",  due:"2026-04-18" },
    ],
    risks: [
      "LP 对集中度担忧尚未回应",
      "H-chip 进口配额 Q3 可能再次收紧",
    ],
  },
  tension: [
    { id:"T1", between:["p2","p3"], topic:"中游 vs 训练层", intensity: 0.82,
      summary:"沈岚坚持推理层毛利更可持续；Wei Tan 认为训练层的规模效应才是护城河。双方在第 42 分钟出现明显停顿。",
      moments:["「规模你守不住」—— Wei Tan", "「那你给我一个 3 年期的反例」—— 沈岚"] },
    { id:"T2", between:["p1","p5"], topic:"集中度 vs LP 偏好", intensity: 0.61,
      summary:"陈汀推动单笔上限放到 8,000 万；林雾作为 LP 代表在流程外提示合规边界。",
      moments:["「上限可以谈」—— 陈汀","「我只提醒，决策还是你们」—— 林雾"] },
    { id:"T3", between:["p2","p6"], topic:"北美配售 vs 本土化", intensity: 0.44,
      summary:"Omar 主张在北美保留 subadvisor；沈岚希望团队自建。没有激烈对抗但暗含资源分配分歧。",
      moments:[] },
  ],
  newCognition: [
    { id:"N1", who:"p1",  before:"推理层=毛利陷阱", after:"推理层在特定 workload 下具备价格歧视空间",
      trigger:"沈岚展示的 7 家客户报价曲线" },
    { id:"N2", who:"p3",  before:"中国团队很难拿到北美 deal flow", after:"通过 subadvisor 结构每月 3-5 个 warm intro 可行",
      trigger:"Omar 引用的过去 6 个月的数据" },
    { id:"N3", who:"p2",  before:"H-chip 短缺是利好", after:"若配额再收紧，portfolio 头部两家将被迫降价",
      trigger:"Wei Tan 的反面测算" },
  ],
  focusMap: [
    { who:"p1", themes:["集中度","回撤","LP 关系"], returnsTo:4 },
    { who:"p2", themes:["推理层","毛利","团队 ramp-up"], returnsTo:7 },
    { who:"p3", themes:["规模效应","退出路径","估值"], returnsTo:6 },
    { who:"p4", themes:["基础利率","可比样本"], returnsTo:3 },
    { who:"p5", themes:["合规边界","信息披露"], returnsTo:2 },
    { who:"p6", themes:["北美 subadvisor","渠道"], returnsTo:3 },
  ],
  consensus: [
    { id:"C1", kind:"consensus",  text:"AI 基础设施仍是 3 年级别的主航道", supportedBy:["p1","p2","p3","p6"] },
    { id:"C2", kind:"consensus",  text:"Q2 需要完成一次估值模型的校准", supportedBy:["p1","p2","p4"] },
    { id:"D1", kind:"divergence", text:"单笔上限：6000 万 vs 8000 万", sides:[
        { stance:"6000 万", by:["p5","p2"], reason:"集中度与 LP 偏好" },
        { stance:"8000 万", by:["p1","p3"], reason:"抓住头部项目" },
    ]},
    { id:"D2", kind:"divergence", text:"训练层 vs 推理层权重", sides:[
        { stance:"训练层优先", by:["p3"], reason:"规模效应护城河" },
        { stance:"推理层优先", by:["p2","p1"], reason:"毛利结构与落地速度" },
    ]},
  ],
  crossView: [
    { id:"V1", claim:"推理层毛利在 2027 之前保持 >45%", claimBy:"p2",
      responses:[
        { who:"p3", stance:"oppose",  text:"规模上来之后一定会压到 30%。" },
        { who:"p1", stance:"partial", text:"分客户群看，这个数字成立，但要拆分。" },
        { who:"p4", stance:"neutral", text:"同类样本历史中位数 38%，需要更细的 cohort。" },
        { who:"p6", stance:"support", text:"北美 3 家对标公司确实在 45-52% 区间。" },
      ] },
    { id:"V2", claim:"国内团队拿北美 deal 是结构性困难", claimBy:"p3",
      responses:[
        { who:"p6", stance:"oppose",  text:"过去 6 个月我们提供了 18 个 warm intro。" },
        { who:"p2", stance:"partial", text:"拿得到 meeting，但赢不到 allocation。" },
        { who:"p1", stance:"neutral", text:"要区分看 meeting 和 allocation。" },
      ] },
  ],
};

// ─────────────────────────────────────────────────────────
// Tiny icon set (line, 16-stroke consistent)
// ─────────────────────────────────────────────────────────
const Icon = ({ name, size=16, stroke=1.5, style }) => {
  const common = { width:size, height:size, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round", style };
  const paths = {
    upload:      <><path d="M12 3v13" /><path d="M7 8l5-5 5 5" /><path d="M4 21h16" /></>,
    folder:      <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    sparkle:     <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></>,
    users:       <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M21 20c0-2.5-1.8-4-4-4" /></>,
    scale:       <><path d="M12 4v16" /><path d="M4 9h16" /><path d="M4 9l-2 5a4 4 0 0 0 8 0z" /><path d="M20 9l2 5a4 4 0 0 1-8 0z" /></>,
    compass:     <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
    target:      <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
    git:         <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8" /><path d="M8 6h4a4 4 0 0 1 4 4v0" /></>,
    network:     <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10" /><path d="M6 8l5 8" /><path d="M18 8l-5 8" /></>,
    arrow:       <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
    check:       <><path d="M5 13l4 4L19 7" /></>,
    x:           <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
    dot:         <><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>,
    expand:      <><path d="M4 10V4h6" /><path d="M20 14v6h-6" /><path d="M4 4l6 6" /><path d="M20 20l-6-6" /></>,
    play:        <><path d="M6 4l14 8-14 8z" fill="currentColor" /></>,
    mic:         <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
    clock:       <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    bolt:        <><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></>,
    chevron:     <><path d="M9 6l6 6-6 6" /></>,
    chevronDown: <><path d="M6 9l6 6 6-6" /></>,
    layers:      <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" /></>,
    search:      <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    plus:        <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    wand:        <><path d="M3 21l12-12" /><path d="M15 3v3" /><path d="M19 7h3" /><path d="M17 5l2 2" /><path d="M13 1v2" /></>,
    book:        <><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M5 4v12" /></>,
    ledger:      <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16" /><path d="M9 4v16" /></>,
  };
  return <svg {...common}>{paths[name] || null}</svg>;
};

// ─────────────────────────────────────────────────────────
// Avatar — deterministic soft-tinted initials square
// ─────────────────────────────────────────────────────────
const TONE = {
  warm:    { bg:"oklch(0.92 0.04 40)",  fg:"oklch(0.38 0.1 40)" },
  cool:    { bg:"oklch(0.93 0.03 200)", fg:"oklch(0.38 0.08 200)" },
  neutral: { bg:"oklch(0.92 0.008 75)", fg:"oklch(0.32 0.01 60)" },
};
const Avatar = ({ p, size=28, radius=6, style }) => (
  <div style={{
    width:size, height:size, borderRadius:radius, background: TONE[p.tone].bg,
    color: TONE[p.tone].fg, fontFamily:"var(--sans)", fontWeight:600,
    fontSize: size*0.42, display:"flex", alignItems:"center", justifyContent:"center",
    letterSpacing: p.initials.length>1 ? "-0.02em" : 0, flexShrink:0,
    ...style,
  }}>
    {p.initials}
  </div>
);

const Chip = ({ children, tone="ink", style }) => {
  const tones = {
    ink:    { bg:"oklch(0.94 0.005 75)", fg:"var(--ink-2)",  bd:"var(--line)" },
    accent: { bg:"var(--accent-soft)",   fg:"oklch(0.35 0.1 40)", bd:"oklch(0.85 0.07 40)" },
    teal:   { bg:"var(--teal-soft)",     fg:"oklch(0.32 0.08 200)", bd:"oklch(0.85 0.05 200)" },
    amber:  { bg:"var(--amber-soft)",    fg:"oklch(0.38 0.09 75)", bd:"oklch(0.85 0.07 75)" },
    ghost:  { bg:"transparent",          fg:"var(--ink-3)",  bd:"var(--line)" },
  };
  const t = tones[tone] || tones.ink;
  return <span style={{
    display:"inline-flex", alignItems:"center", gap:4,
    padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:500,
    background:t.bg, color:t.fg, border:`1px solid ${t.bd}`,
    fontFamily:"var(--sans)", letterSpacing:0.1, ...style
  }}>{children}</span>;
};

const Dot = ({ color="var(--accent)", size=6, style }) => (
  <span style={{display:"inline-block", width:size, height:size, borderRadius:99, background:color, ...style}} />
);

const MonoMeta = ({ children, style }) => (
  <span style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)", letterSpacing:0.2, ...style}}>
    {children}
  </span>
);

const SectionLabel = ({ children, num, style }) => (
  <div style={{
    display:"flex", alignItems:"baseline", gap:8,
    fontFamily:"var(--mono)", fontSize:10.5, letterSpacing:"0.12em",
    textTransform:"uppercase", color:"var(--ink-3)", ...style
  }}>
    {num && <span style={{color:"var(--ink-4)"}}>§{num}</span>}
    {children}
  </div>
);

// Look up a participant by id
const P = (id) => PARTICIPANTS.find(x=>x.id===id) || { name:id, initials:"?", tone:"neutral" };

// Export globals
Object.assign(window, {
  MEETING, PARTICIPANTS, EXPERTS, DIMENSIONS, ANALYSIS,
  Icon, Avatar, Chip, Dot, MonoMeta, SectionLabel, P, TONE,
});
