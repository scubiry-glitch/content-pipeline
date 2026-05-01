// dimensions-knowledge-extra.jsx — 知识轴新增 ⑤ 共识与分歧 · ⑥ 概念辨析 · ⑦ 议题谱系与健康 · ⑧ 外脑批注

// ─────────────────────────────────────────────────────────
// ⑤ 共识与分歧 · 跨会议追踪
// ─────────────────────────────────────────────────────────
const CROSS_CONSENSUS = [
  { id:"CX-01", text:"AI 基础设施是 3 年级别的主航道",
    kind:"stable", history:[1,1,1,1,1,1], firstAt:"M-2025-11", lastAt:"M-2026-04",
    note:"6 场会议 6 次共识 · 信念已硬化为共同前提" },
  { id:"CX-02", text:"推理层毛利可持续性",
    kind:"settling", history:[0,0,1,0,1,1], firstAt:"M-2025-12", lastAt:"M-2026-04",
    note:"经过 3 场分歧后逐步收敛 · D-06 是关键节点" },
  { id:"CX-03", text:"单笔上限的上限",
    kind:"recurring", history:[1,0,1,0,1,0], firstAt:"M-2025-11", lastAt:"M-2026-04",
    note:"每隔一场就反复 · 表明决议力度不够 · 是慢性争议" },
  { id:"CX-04", text:"训练层 vs 推理层权重",
    kind:"settling", history:[0,0,0,1,0,1], firstAt:"M-2025-12", lastAt:"M-2026-04",
    note:"D-02 推翻后正在向推理层收敛 · 但 Wei Tan 仍保留质疑" },
  { id:"CX-05", text:"北美渠道的最佳形态",
    kind:"divergent", history:[0,0,0,0,1,0], firstAt:"M-2026-02", lastAt:"M-2026-04",
    note:"3 种方案 · 仍在分歧 · 需要专项会议" },
  { id:"CX-06", text:"LP 集中度容忍度的真实阈值",
    kind:"avoided", history:["?","?","?","?","?","?"], firstAt:"M-2026-01", lastAt:"M-2026-04",
    note:"5 次被提起 · 5 次被回避 · 这是房间里的大象" },
];

const KIND_TONE = {
  stable:    { label:"稳定共识",    fg:"oklch(0.35 0.12 140)",  bg:"oklch(0.93 0.06 140)" },
  settling:  { label:"正在收敛",    fg:"oklch(0.3 0.08 200)",   bg:"var(--teal-soft)" },
  recurring: { label:"反复争议",    fg:"oklch(0.38 0.09 75)",   bg:"var(--amber-soft)" },
  divergent: { label:"持续分歧",    fg:"oklch(0.32 0.1 40)",    bg:"var(--accent-soft)" },
  avoided:   { label:"系统性回避",  fg:"oklch(0.32 0.1 40)",    bg:"var(--accent-soft)" },
};

function KConsensusDivergence() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        共识与分歧 · 跨会议追踪
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:720}}>
        哪些观点已形成稳定共识、哪些反复分歧、哪些被系统性回避。
        <b> 每行的「波形」是 6 场会议的共识强度</b> —— 1 表示对齐, 0 表示分歧, ? 表示被回避。
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {CROSS_CONSENSUS.map(c=>{
          const k = KIND_TONE[c.kind];
          return (
            <div key={c.id} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6,
              padding:"14px 18px",
              display:"grid", gridTemplateColumns:"80px 1fr 220px 120px", gap:14, alignItems:"center",
            }}>
              <window.MonoMeta>{c.id}</window.MonoMeta>
              <div>
                <div style={{fontFamily:"var(--serif)", fontSize:14, fontWeight:600, lineHeight:1.45}}>{c.text}</div>
                <div style={{fontSize:11, color:"var(--ink-3)", marginTop:4, fontStyle:"italic", fontFamily:"var(--serif)"}}>{c.note}</div>
              </div>
              <div>
                <window.MonoMeta style={{fontSize:9.5}}>6 场轨迹 · {c.firstAt} → {c.lastAt}</window.MonoMeta>
                <div style={{display:"flex", gap:4, marginTop:5}}>
                  {c.history.map((v,i)=>(
                    <div key={i} style={{
                      width:24, height:18, borderRadius:3,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"var(--mono)", fontSize:10, fontWeight:600,
                      background: v===1 ? "oklch(0.93 0.06 140)" : v===0 ? "var(--accent-soft)" : "var(--paper-3)",
                      color: v===1 ? "oklch(0.35 0.12 140)" : v===0 ? "oklch(0.32 0.1 40)" : "var(--ink-3)",
                      border:"1px solid var(--line-2)",
                    }}>{v===1?"●":v===0?"○":"?"}</div>
                  ))}
                </div>
              </div>
              <span style={{
                fontSize:11, padding:"3px 10px", borderRadius:99, fontWeight:600,
                background:k.bg, color:k.fg, textAlign:"center",
              }}>{k.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:18}}>
        <window.CalloutCard title="房间里的大象 · CX-06" tone="accent">
          <b>LP 集中度阈值</b> 5 次被提起、5 次被回避 —— 这种系统性回避比真正的分歧更危险。
          建议下次会议第一项议程就是这个,且必须有结论才能离场。
        </window.CalloutCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ⑥ 概念辨析 · 同词异义诊断
// ─────────────────────────────────────────────────────────
const CONCEPT_DRIFT = [
  { id:"CD-01", word:"增长",
    interpretations:[
      { who:"p1", meaning:"AUM 规模增长 · 募资速度",       evidence:"Q2 沟通里 4 次提到都指向资金端" },
      { who:"p2", meaning:"标的公司 ARR 增长 · 业务侧",     evidence:"在 thesis 讨论里 5 次专指被投" },
      { who:"p3", meaning:"市场容量增长 · 行业 TAM",        evidence:"反共识时使用,常配合「天花板」" },
    ],
    severity:"high",
    diagnosis:"三个人在用同一个词谈三件事 · 共识看似存在,实际从未对齐。" },
  { id:"CD-02", word:"退出",
    interpretations:[
      { who:"p1", meaning:"IPO 上市退出",                   evidence:"6 月策略会 · 默认 IPO" },
      { who:"p3", meaning:"二级市场转让 · secondary",       evidence:"过去 3 场提起退出都指 secondary" },
      { who:"p2", meaning:"被并购退出 · M&A",                evidence:"Q1 估值讨论里隐含 M&A" },
    ],
    severity:"med",
    diagnosis:"三种退出路径的概率/估值差距很大 —— 但讨论时没人区分,导致估值模型口径混乱。" },
  { id:"CD-03", word:"敏捷",
    interpretations:[
      { who:"p2", meaning:"决策速度快",                     evidence:"团队 ramp-up 讨论用过 2 次" },
      { who:"p4", meaning:"假设小步验证",                   evidence:"基础利率讨论用过 1 次" },
    ],
    severity:"low",
    diagnosis:"分歧不大,但仍建议在书面纪要里替换为更精确的词。" },
  { id:"CD-04", word:"集中度",
    interpretations:[
      { who:"p1", meaning:"单笔金额占基金比例",             evidence:"D-07 讨论中默认此口径" },
      { who:"p5", meaning:"行业暴露占基金比例",             evidence:"林雾 4 月 11 日提示" },
    ],
    severity:"high",
    diagnosis:"陈汀和林雾在<i>同一句话里</i>用同一个词谈两件事 —— 这就是为什么对话总过不去。" },
];

const SEV_TONE_K = {
  high: { fg:"oklch(0.32 0.1 40)",  bg:"var(--accent-soft)", label:"高 · 影响决议" },
  med:  { fg:"oklch(0.38 0.09 75)", bg:"var(--amber-soft)",  label:"中 · 影响沟通" },
  low:  { fg:"var(--ink-3)",        bg:"var(--paper-3)",     label:"低 · 仅措辞" },
};

function KConceptDrift() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        概念辨析 · Same word, different meaning
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:720}}>
        同一个词被不同人讲成不同意思的诊断。<b>很多看似的共识,只是大家在用同一个词谈三件事。</b>
        系统从跨会议语料里抽取每人对这个词的实际使用语境。
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {CONCEPT_DRIFT.map(c=>{
          const sev = SEV_TONE_K[c.severity];
          return (
            <div key={c.id} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)",
              borderLeft:`3px solid ${sev.fg}`, borderRadius:6, padding:"14px 18px",
            }}>
              <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:10}}>
                <window.MonoMeta>{c.id}</window.MonoMeta>
                <div style={{
                  fontFamily:"var(--serif)", fontSize:24, fontWeight:600, color:"var(--ink)",
                  letterSpacing:"-0.01em",
                }}>"{c.word}"</div>
                <span style={{
                  fontSize:11, padding:"2px 10px", borderRadius:99, fontWeight:600,
                  background:sev.bg, color:sev.fg,
                }}>{sev.label}</span>
                <div style={{marginLeft:"auto", fontSize:11.5, color:"var(--ink-3)", fontStyle:"italic"}}>
                  {c.interpretations.length} 种用法
                </div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:`repeat(${c.interpretations.length}, 1fr)`, gap:8}}>
                {c.interpretations.map((it,i)=>{
                  const p = window.P(it.who);
                  return (
                    <div key={i} style={{
                      background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:5,
                      padding:"10px 12px",
                    }}>
                      <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:6}}>
                        <window.Avatar p={p} size={20} radius={4}/>
                        <span style={{fontSize:12, fontWeight:600}}>{p.name}</span>
                      </div>
                      <div style={{fontSize:13, fontFamily:"var(--serif)", lineHeight:1.5, fontWeight:500}}>
                        {it.meaning}
                      </div>
                      <div style={{fontSize:10.5, color:"var(--ink-3)", marginTop:6, fontStyle:"italic"}}>
                        {it.evidence}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop:10, padding:"8px 12px", background:"var(--paper)", borderRadius:4,
                fontSize:12, fontFamily:"var(--serif)", fontStyle:"italic", lineHeight:1.5, color:"var(--ink-2)",
              }}>
                诊断: {c.diagnosis}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ⑦ 议题谱系与健康 · Topic Lineage & Vitals
// ─────────────────────────────────────────────────────────
const TOPIC_LINEAGE = [
  { id:"TL-01", topic:"推理层毛利可持续性", lineage:"基础设施判断 → 单位经济模型 → 推理层毛利",
    bornAt:"M-2025-12-20", parent:"基础设施判断", depth:3, mentions:21,
    health:0.74, healthLabel:"健康", lastVisit:"M-2026-04-11",
    trend:"converging",
    note:"出生后被持续追问 · 已有数据支撑 · 是知识资产" },
  { id:"TL-02", topic:"LP 集中度阈值", lineage:"LP 治理 → 单笔上限 → 集中度阈值",
    bornAt:"M-2026-01-30", parent:"LP 治理", depth:3, mentions:14,
    health:0.32, healthLabel:"病弱", lastVisit:"M-2026-04-11",
    trend:"flatlined",
    note:"反复出现但从未推进 · 慢性问题 · 健康度持续下降" },
  { id:"TL-03", topic:"训练层 vs 推理层", lineage:"赛道选择 → 训练 vs 推理",
    bornAt:"M-2025-11-08", parent:"赛道选择", depth:2, mentions:18,
    health:0.81, healthLabel:"健康", lastVisit:"M-2026-04-11",
    trend:"resolved",
    note:"经历 6 个月辩论已收敛 · 在 D-06 处结案" },
  { id:"TL-04", topic:"H-chip 配额监控", lineage:"地缘风险 → 供应链 → H-chip → 配额监控",
    bornAt:"M-2026-02-08", parent:"H-chip", depth:4, mentions:11,
    health:0.45, healthLabel:"亚健康", lastVisit:"M-2026-04-11",
    trend:"orphaned",
    note:"重要但无人主动认领(参见责任盘点 AC-07)" },
  { id:"TL-05", topic:"Subadvisor allocation 决策权", lineage:"北美渠道 → Subadvisor → allocation 决策权",
    bornAt:"M-2026-03-14", parent:"Subadvisor", depth:3, mentions:7,
    health:0.68, healthLabel:"成长中", lastVisit:"M-2026-04-11",
    trend:"emerging",
    note:"新生 · 由 J-03 提炼为通用判断 · 值得继续投入" },
  { id:"TL-06", topic:"训练层 IPO 通道",  lineage:"退出路径 → IPO → 训练层 IPO",
    bornAt:"M-2025-12-20", parent:"退出路径", depth:3, mentions:5,
    health:0.18, healthLabel:"濒危", lastVisit:"M-2026-02-08",
    trend:"abandoned",
    note:"已 2 个月未被讨论 · 但仍是 Q-05 慢性问题的核心 · 需要复活" },
];

const HEALTH_FG = (h)=> h>=0.7 ? "oklch(0.35 0.12 140)" : h>=0.5 ? "oklch(0.4 0.1 200)" : h>=0.3 ? "oklch(0.38 0.09 75)" : "oklch(0.32 0.1 40)";

function KTopicLineage() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        议题谱系与健康 · Topic lineage & vitals
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:740}}>
        每个议题家族都有「血统」(从哪来)和「血压」(健康度)。
        <b>濒危议题 = 重要但被遗忘</b>;<b>慢性病弱 = 反复出现但从未推进</b>。这两类都需要主动干预。
      </div>

      <div style={{
        display:"grid", gridTemplateColumns:"80px minmax(180px,1fr) minmax(220px,1.4fr) 80px 100px 110px 1fr",
        padding:"10px 14px", fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)",
        letterSpacing:0.3, textTransform:"uppercase", borderBottom:"1px solid var(--line-2)",
      }}>
        <span>ID</span><span>议题</span><span>谱系</span><span>提及</span><span>健康</span><span>状态</span><span>诊断</span>
      </div>
      {TOPIC_LINEAGE.map((t,i)=>{
        const fg = HEALTH_FG(t.health);
        return (
          <div key={t.id} style={{
            display:"grid", gridTemplateColumns:"80px minmax(180px,1fr) minmax(220px,1.4fr) 80px 100px 110px 1fr",
            alignItems:"center", gap:10, padding:"12px 14px",
            borderBottom:"1px solid var(--line-2)",
            background: i%2===0 ? "var(--paper-2)" : "var(--paper)",
          }}>
            <window.MonoMeta>{t.id}</window.MonoMeta>
            <div style={{fontFamily:"var(--serif)", fontSize:13.5, fontWeight:600, lineHeight:1.4}}>{t.topic}</div>
            <div style={{fontSize:11, color:"var(--ink-3)", fontFamily:"var(--mono)", lineHeight:1.6}}>
              {t.lineage.split(" → ").map((n,idx,arr)=>(
                <React.Fragment key={idx}>
                  <span style={{color: idx===arr.length-1 ? "var(--ink-2)" : "var(--ink-4)"}}>{n}</span>
                  {idx<arr.length-1 && <span style={{color:"var(--ink-4)", margin:"0 4px"}}>→</span>}
                </React.Fragment>
              ))}
              <div style={{fontSize:10, color:"var(--ink-4)", marginTop:3}}>出生 {t.bornAt} · 深度 {t.depth}</div>
            </div>
            <window.MonoMeta style={{fontSize:11, color:"var(--ink-2)"}}>{t.mentions}×</window.MonoMeta>
            <div>
              <div style={{display:"flex", alignItems:"center", gap:5}}>
                <div style={{flex:1, height:6, background:"var(--line-2)", borderRadius:3, overflow:"hidden"}}>
                  <div style={{width:`${t.health*100}%`, height:"100%", background:fg}}/>
                </div>
                <window.MonoMeta style={{fontSize:10, color:fg, fontWeight:600}}>{t.health.toFixed(2)}</window.MonoMeta>
              </div>
              <div style={{fontSize:10, color:fg, fontWeight:600, marginTop:2}}>{t.healthLabel}</div>
            </div>
            <window.Chip tone={
              t.trend==="resolved"?"teal":
              t.trend==="emerging"?"teal":
              t.trend==="flatlined"||t.trend==="abandoned"?"accent":
              t.trend==="orphaned"?"amber":"ghost"
            }>{
              {converging:"收敛中",resolved:"已结案",flatlined:"停滞",emerging:"萌芽",
               orphaned:"无主",abandoned:"被遗忘"}[t.trend]
            }</window.Chip>
            <div style={{fontSize:11, color:"var(--ink-3)", fontStyle:"italic", lineHeight:1.5, fontFamily:"var(--serif)"}}>
              {t.note}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ⑧ 外脑批注 · External Annotations
// 图书馆 6 位专家对内部判断的批注
// ─────────────────────────────────────────────────────────
const EXTERNAL_ANNOTATIONS = [
  { id:"EA-01", expert:"E09-09", expertName:"二阶思考者 · Howard",
    target:"D-07 · 单笔上限定为 6,000 万",
    targetType:"decision", stance:"caution",
    note:"上限本身不是问题。问题是「为什么不是 5,000 或 7,000 万」的论证链 ——\n你们有 LP 锚点(政治)和集中度自查(规则),但缺乏一个「单笔上限作为函数」的模型: f(机会规模, 基金阶段, 风险预算) = 上限。\n下次校准时建议把这条函数显式写出来,否则每次都是 ad-hoc。",
    confidence:0.82, agreedBy:["p1","p2"], disputedBy:[] },
  { id:"EA-02", expert:"E07-18", expertName:"基础利率检察官",
    target:"AS-01 · 推理层毛利 >45%",
    targetType:"assumption", stance:"oppose",
    note:"45% 这个数字的同类样本中位数其实是 38%,你们引用的「北美 3 家在 45-52%」属于上四分位选择性样本。\n建议把假设改为「基准 38%,但在 X/Y/Z 条件下可达 45%+」,然后把 X/Y/Z 显式列出。\n这是基础利率纪律的标准动作。",
    confidence:0.88, agreedBy:["p4"], disputedBy:["p2"] },
  { id:"EA-03", expert:"E11-03", expertName:"叙事追踪者 · 清野",
    target:"CX-02 · 推理层共识收敛",
    targetType:"consensus", stance:"warning",
    note:"你们的「推理层叙事」从去年 11 月 weak signal 上升到现在的 strong consensus,过了一个完整反身性周期。\n这意味着市场上已经有 5-7 家 GP 在同一时间到达这个结论。先发优势窗口正在关闭,接下来的 candidate 会被反复抢标。\n如果 4 月底之前不能锁住头部 2 家,这个共识本身会变成消极资产。",
    confidence:0.74, agreedBy:["p2"], disputedBy:["p3"] },
  { id:"EA-04", expert:"E04-12", expertName:"产业链测绘师 · Marco",
    target:"AS-02 · H-chip 配额不再收紧",
    targetType:"assumption", stance:"oppose",
    note:"基于 BIS 过去 18 个月的政策节奏,Q3 前再次调整的概率约 35-40% —— 不是「不会」。\n你们的 D-04 把 H-chip 显式纳入估值是对的,但 AS-02 的措辞应该改为「下行风险已 priced in」 而不是「不会收紧」。\n措辞决定了你们会不会在事发时手忙脚乱。",
    confidence:0.79, agreedBy:["p2","p4"], disputedBy:["p1"] },
  { id:"EA-05", expert:"E02-41", expertName:"制度与治理观察者",
    target:"CX-06 · LP 集中度回避",
    targetType:"consensus", stance:"strong-warning",
    note:"林雾的 5 次提示 + 5 次回避,在 LP 治理实务里有专门名字: 「记录在案的合规预警」。\n含义是: 如果未来 12 个月内 portfolio 出问题,LP 委员会会援引这 5 次提示作为「你们被警告过」的证据。\n这不再是讨论问题,是法律风险问题。下次会议必须有书面回应。",
    confidence:0.91, agreedBy:["p5"], disputedBy:[] },
  { id:"EA-06", expert:"E09-09", expertName:"二阶思考者 · Howard",
    target:"MM-05 · Pre-mortem 未激活",
    targetType:"model", stance:"suggest",
    note:"你们对 D-07 没做 pre-mortem,我替你们做半个: \n6 个月后这个决议失败的最可能场景 ——\n 不是 LP 反弹(这是显性的, AS-04 已盯着),\n 而是 candidate 池中头部那家被某个 8000 万级 deal 截胡(参见 CF-01)。\n建议下次会议前 5 分钟集中做这个推演。",
    confidence:0.71, agreedBy:[], disputedBy:[] },
];

const STANCE = {
  caution:        { label:"提醒", fg:"oklch(0.38 0.09 75)",  bg:"var(--amber-soft)" },
  oppose:         { label:"反对", fg:"oklch(0.32 0.1 40)",   bg:"var(--accent-soft)" },
  warning:        { label:"警告", fg:"oklch(0.38 0.09 75)",  bg:"var(--amber-soft)" },
  "strong-warning": { label:"强警告", fg:"oklch(0.32 0.1 40)", bg:"var(--accent-soft)" },
  suggest:        { label:"建议", fg:"oklch(0.3 0.08 200)",  bg:"var(--teal-soft)" },
};

function KExternalAnnotations() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        外脑批注 · External annotations
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:720}}>
        图书馆 6 位专家对你们内部判断的批注。<b>外脑不参加会议,但他们读了纪要,在边上写了批注。</b>
        每条批注会被持续追踪 —— 团队同意 / 反驳 / 6 个月后回看是否言中。
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {EXTERNAL_ANNOTATIONS.map(a=>{
          const s = STANCE[a.stance];
          return (
            <div key={a.id} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)",
              borderLeft:`3px solid ${s.fg}`, borderRadius:6, padding:"14px 18px",
            }}>
              <div style={{display:"grid", gridTemplateColumns:"220px 1fr", gap:18, alignItems:"start"}}>
                <div>
                  <window.MonoMeta style={{fontSize:9.5}}>{a.expert}</window.MonoMeta>
                  <div style={{fontFamily:"var(--serif)", fontSize:13, fontWeight:600, marginTop:3}}>{a.expertName}</div>
                  <div style={{marginTop:10, padding:"6px 10px", background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:4}}>
                    <window.MonoMeta style={{fontSize:9}}>批注对象</window.MonoMeta>
                    <div style={{fontSize:11.5, color:"var(--ink)", fontFamily:"var(--serif)", marginTop:2, lineHeight:1.4}}>
                      {a.target}
                    </div>
                    <div style={{fontSize:9.5, color:"var(--ink-4)", marginTop:3, fontFamily:"var(--mono)"}}>
                      {a.targetType}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                    <span style={{
                      fontSize:11, padding:"3px 10px", borderRadius:99, fontWeight:600,
                      background:s.bg, color:s.fg,
                    }}>{s.label}</span>
                    <window.MonoMeta>置信 {a.confidence.toFixed(2)}</window.MonoMeta>
                  </div>
                  <div style={{
                    fontSize:13, fontFamily:"var(--serif)", lineHeight:1.65, color:"var(--ink)",
                    whiteSpace:"pre-line",
                  }}>{a.note}</div>
                  <div style={{marginTop:10, display:"flex", gap:18, fontSize:11, color:"var(--ink-3)"}}>
                    {a.agreedBy.length>0 && (
                      <div>
                        <window.MonoMeta style={{fontSize:9}}>已同意</window.MonoMeta>
                        <div style={{display:"flex", gap:4, marginTop:3}}>
                          {a.agreedBy.map(id=>{
                            const p = window.P(id);
                            return <window.Avatar key={id} p={p} size={20} radius={4}/>;
                          })}
                        </div>
                      </div>
                    )}
                    {a.disputedBy.length>0 && (
                      <div>
                        <window.MonoMeta style={{fontSize:9}}>已反驳</window.MonoMeta>
                        <div style={{display:"flex", gap:4, marginTop:3}}>
                          {a.disputedBy.map(id=>{
                            const p = window.P(id);
                            return (
                              <div key={id} style={{position:"relative"}}>
                                <window.Avatar p={p} size={20} radius={4}/>
                                <div style={{position:"absolute", top:-2, right:-2, width:8, height:8, background:"var(--accent)", borderRadius:99, border:"1.5px solid var(--paper-2)"}}/>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {a.agreedBy.length===0 && a.disputedBy.length===0 && (
                      <span style={{fontStyle:"italic", color:"var(--ink-4)"}}>团队尚未表态</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:18}}>
        <window.CalloutCard title="为什么需要外脑批注" tone="ink">
          会议室里所有人都被语境绑架。外脑读的是纪要文本,没有人际包袱,容易看见房间里的人看不见的东西。
          <b>这不是「咨询意见」 —— 是把你们 6 个月后回看时会自责的事情,提前 6 个月写出来。</b>
        </window.CalloutCard>
      </div>
    </div>
  );
}

Object.assign(window, { KConsensusDivergence, KConceptDrift, KTopicLineage, KExternalAnnotations });
