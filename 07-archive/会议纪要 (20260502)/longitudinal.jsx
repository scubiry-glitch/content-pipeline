// longitudinal.jsx — 纵向视图 · 跨会议
// 这是"一库多视图"真正的威力: 同一个人/项目/心智模型随时间的演化

const BELIEF_DRIFT = {
  who: "p1",
  topic: "单笔投资上限",
  points: [
    { meeting:"M-2025-11", date:"2025-11-12", value:"$40M",  confidence:0.65, note:"保守期" },
    { meeting:"M-2026-01", date:"2026-01-09", value:"$50M",  confidence:0.7,  note:"Q4 退出回款" },
    { meeting:"M-2026-02", date:"2026-02-22", value:"$65M",  confidence:0.72, note:"LP 加仓意向" },
    { meeting:"M-2026-03", date:"2026-03-28", value:"$80M",  confidence:0.6,  note:"看到头部 deal 规模" },
    { meeting:"M-2026-04", date:"2026-04-11", value:"$60M",  confidence:0.78, note:"妥协至决议值" },
  ],
};

const DECISION_TREE = {
  root: { id:"R", label:"AI 基础设施方向", meeting:"M-2025-11", date:"2025-11" },
  nodes: [
    { id:"N1", parent:"R", branch:"训练层 vs 推理层", decided:"两端布局", meeting:"M-2025-12", date:"2025-12" },
    { id:"N2", parent:"N1", branch:"团队 ramp-up", decided:"招 2 位 PM", meeting:"M-2026-01", date:"2026-01" },
    { id:"N3", parent:"N1", branch:"渠道选择", decided:"subadvisor 结构", meeting:"M-2026-03", date:"2026-03" },
    { id:"N4", parent:"N1", branch:"权重再平衡", decided:"精选推理层 · 上限 6000 万", meeting:"M-2026-04", date:"2026-04", current:true },
    { id:"N5", parent:"N4", branch:"LP 沟通", decided:"待定", meeting:"next", pending:true },
  ],
};

const MODEL_HITRATE = [
  { id:"MM-01", name:"二阶效应",      invoked:47, hits:39, hitrate:0.83, byTopExpert:"E09-09" },
  { id:"MM-02", name:"基础利率",      invoked:33, hits:30, hitrate:0.91, byTopExpert:"E07-18" },
  { id:"MM-04", name:"瓶颈分析",      invoked:28, hits:22, hitrate:0.79, byTopExpert:"E04-12" },
  { id:"MM-03", name:"反身性",        invoked:24, hits:14, hitrate:0.58, byTopExpert:"E11-03", warn:true },
  { id:"MM-06", name:"Wright's Law", invoked:12, hits:10, hitrate:0.83, byTopExpert:"E04-12" },
  { id:"MM-07", name:"叙事周期",      invoked:18, hits:11, hitrate:0.61, byTopExpert:"E11-03" },
];

function LongitudinalView() {
  const [tab, setTab] = React.useState("drift");
  const tabs = [
    { id:"drift",    label:"信念漂移",       sub:"同一人在同一议题上随时间的判断变化 · 已迁入人物轴", icon:"arrow" },
    { id:"tree",     label:"决策树",         sub:"项目的所有分岔点与未来待决 · 已迁入项目轴",          icon:"git" },
    { id:"hitrate",  label:"心智模型命中率", sub:"反向校准专家库 · 已迁入知识轴",                       icon:"target" },
  ];
  return (
    <window.DimShell axis="时间维度 · 一览（汇报用）" tabs={tabs} tab={tab} setTab={setTab}>
      <div style={{
        padding:"14px 32px", borderBottom:"1px solid var(--line-2)", background:"var(--amber-soft)",
        fontSize:12, color:"var(--ink-2)", fontFamily:"var(--serif)", lineHeight:1.6,
      }}>
        <b style={{fontFamily:"var(--sans)", fontWeight:600, color:"var(--ink)"}}>作用</b>：
        时间从"独立的轴"降级为"每条轴的修饰符"。
        下面三张大图在汇报/外发场景下横向一览使用；日常工作请到 <b>人物轴 · 信念轨迹</b> /
        <b>项目轴 · 决策溯源树</b> / <b>知识轴 · 心智命中</b> 中处理。
      </div>
      {tab==="drift"   && <BeliefDrift/>}
      {tab==="tree"    && <DecisionTree/>}
      {tab==="hitrate" && <ModelHitrate/>}
    </window.DimShell>
  );
}

// Time range helpers — map "7d" / "30d" / "90d" / "all" to a cutoff date
// Anchor "today" at 2026-04-24 for mock data
const RANGE_CUTOFF = {
  "7d":  "2026-04-17",
  "30d": "2026-03-25",
  "90d": "2026-01-24",
  "all": "2000-01-01",
};
const RANGE_LABEL = { "7d":"近 7 天", "30d":"近 30 天", "90d":"近 3 个月", "all":"全部" };

function useTimeRange() {
  const ctx = React.useContext(window.TimeRangeContext);
  const range = ctx?.range || "30d";
  const cutoff = RANGE_CUTOFF[range];
  return { range, cutoff, label: RANGE_LABEL[range] };
}

// Small info strip showing active range + filter result count
function RangeStrip({ range, label, total, filtered, note }) {
  const filteredOut = total - filtered;
  return (
    <div style={{
      margin:"0 0 14px", padding:"8px 12px",
      background: range==="all" ? "var(--paper-2)" : "var(--amber-soft)",
      border: "1px solid " + (range==="all" ? "var(--line-2)" : "oklch(0.88 0.06 75)"),
      borderRadius:4, fontSize:11.5, color:"var(--ink-2)", fontFamily:"var(--sans)",
      display:"flex", alignItems:"center", gap:10, lineHeight:1.5,
    }}>
      <span style={{
        fontFamily:"var(--mono)", fontSize:10, fontWeight:600, color:"var(--accent)",
        padding:"2px 6px", background:"var(--paper)", borderRadius:3,
        border:"1px solid oklch(0.88 0.06 75)",
      }}>
        {range.toUpperCase()}
      </span>
      <span>当前时间范围：<b style={{color:"var(--ink)"}}>{label}</b></span>
      <span style={{color:"var(--ink-4)"}}>·</span>
      <span>
        命中 <b style={{color:"var(--ink)", fontFamily:"var(--mono)"}}>{filtered}</b> / {total}
        {filteredOut > 0 && (
          <span style={{color:"var(--ink-4)", marginLeft:6}}>
            （{filteredOut} 条已过滤）
          </span>
        )}
      </span>
      {note && (
        <>
          <span style={{color:"var(--ink-4)"}}>·</span>
          <span style={{color:"var(--ink-3)", fontStyle:"italic"}}>{note}</span>
        </>
      )}
    </div>
  );
}

function BeliefDrift() {
  const { range, label } = useTimeRange();
  const all = BELIEF_DRIFT.points;
  const cutoff = RANGE_CUTOFF[range];
  const filtered = all.filter(p => p.date >= cutoff);
  // Need at least 2 points to draw a line
  const points = filtered.length >= 2 ? filtered : all.slice(-2);
  const tooFew = filtered.length < 2;

  const d = { ...BELIEF_DRIFT, points };
  const p = window.P(d.who);
  const W = 820, H = 260, PAD = 60;
  const vals = d.points.map(p=>parseFloat(p.value.replace(/[^0-9.]/g,"")));
  const vMin = 30, vMax = 90;
  const xFor = i => PAD + (i/Math.max(d.points.length-1,1))*(W-PAD*2);
  const yFor = v => H-PAD - ((v-vMin)/(vMax-vMin))*(H-PAD*1.5);

  return (
    <div style={{padding:"22px 32px 36px"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:4}}>
        <window.Avatar p={p} size={30}/>
        <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:0}}>
          {p.name} · 信念漂移
        </h3>
        <window.Chip tone="ghost">议题: {d.topic}</window.Chip>
      </div>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:14, maxWidth:700}}>
        观察<b>真实的心理价格区间</b>，而非某一次的表态。
      </div>

      <RangeStrip
        range={range} label={label}
        total={all.length} filtered={filtered.length}
        note={tooFew ? "样本过小 · 已回退到最近 2 个数据点" : null}
      />

      <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:8, padding:"18px"}}>
        <svg width={W} height={H} style={{display:"block"}}>
          {/* y grid */}
          {[30,50,70,90].map(v=>(
            <g key={v}>
              <line x1={PAD} x2={W-PAD/2} y1={yFor(v)} y2={yFor(v)} stroke="var(--line-2)" strokeDasharray="2 4"/>
              <text x={PAD-6} y={yFor(v)+3} fontSize="9.5" fontFamily="var(--mono)" fill="var(--ink-4)" textAnchor="end">${v}M</text>
            </g>
          ))}
          {/* confidence band */}
          <path
            d={[
              "M", xFor(0), yFor(vals[0])-d.points[0].confidence*20,
              ...d.points.slice(1).map((p,i)=>`L ${xFor(i+1)} ${yFor(vals[i+1])-p.confidence*20}`),
              ...d.points.slice().reverse().map((p,j)=>{
                const i = d.points.length-1-j;
                return `L ${xFor(i)} ${yFor(vals[i])+p.confidence*20}`;
              }),
              "Z",
            ].join(" ")}
            fill="oklch(0.75 0.1 40 / 0.15)" stroke="none"
          />
          {/* line */}
          <path
            d={d.points.map((p,i)=>`${i===0?"M":"L"} ${xFor(i)} ${yFor(vals[i])}`).join(" ")}
            fill="none" stroke="var(--accent)" strokeWidth="2"
          />
          {/* points */}
          {d.points.map((pt,i)=>(
            <g key={i}>
              <circle cx={xFor(i)} cy={yFor(vals[i])} r={i===d.points.length-1 ? 7 : 5}
                fill={i===d.points.length-1 ? "var(--accent)" : "var(--paper)"}
                stroke="var(--accent)" strokeWidth={2}/>
              <text x={xFor(i)} y={yFor(vals[i])-16} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">
                {pt.value}
              </text>
              <text x={xFor(i)} y={H-24} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-3)">
                {pt.date.slice(5)}
              </text>
              <text x={xFor(i)} y={H-10} textAnchor="middle" fontFamily="var(--sans)" fontSize="10" fill="var(--ink-4)">
                {pt.note}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{marginTop:18, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <window.CalloutCard title="观察 · 锚定的真实价格">
          陈汀在讨论中反复漂向 $70-80M，最终落在 $60M。
          真实心理均衡值约 <b>$65M</b>，这与 LP 的隐含偏好非常接近。下次决议前参考这个值。
        </window.CalloutCard>
        <window.CalloutCard title="置信度轨迹" tone="accent">
          在 M-2026-03 置信度骤降（0.6）—— 正是从 $65M 跳到 $80M 的那次。
          <i>置信度下降 + 判断变激进</i> 通常是警示信号。
        </window.CalloutCard>
      </div>
    </div>
  );
}

function DecisionTree() {
  const { range, label } = useTimeRange();
  const cutoff = RANGE_CUTOFF[range];
  // Layout tree nodes by date
  const allNodes = [DECISION_TREE.root, ...DECISION_TREE.nodes];
  const inRange = n => !n.date || n.date === "next" || n.date >= cutoff.slice(0,7);
  const matchedCount = allNodes.filter(inRange).length;
  const W = 860, H = 360;
  // Simple manual positions
  const pos = {
    "R":  { x: 80,  y: H/2 },
    "N1": { x: 240, y: H/2 },
    "N2": { x: 420, y: H/2 - 110 },
    "N3": { x: 420, y: H/2 },
    "N4": { x: 420, y: H/2 + 110 },
    "N5": { x: 620, y: H/2 + 110 },
  };

  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        项目决策树 · AI 基础设施方向
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:14, maxWidth:700}}>
        每个节点是一次会议上的分岔决定。红点 = 当前待决节点。超出时间范围的节点会被淡化 —— 保留上下文。
      </div>
      <RangeStrip
        range={range} label={label}
        total={allNodes.length} filtered={matchedCount}
        note="范围外节点保留形状但降透明度"
      />
      <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:8, padding:"18px"}}>
        <svg width={W} height={H}>
          {/* connections */}
          {DECISION_TREE.nodes.map(n=>{
            const p1 = pos[n.parent], p2 = pos[n.id];
            const dim = !inRange(n);
            return (
              <path key={n.id}
                d={`M ${p1.x+40} ${p1.y} C ${(p1.x+p2.x)/2} ${p1.y}, ${(p1.x+p2.x)/2} ${p2.y}, ${p2.x-40} ${p2.y}`}
                fill="none" stroke={n.pending ? "var(--accent)" : "var(--ink-3)"}
                strokeWidth="1.4" strokeDasharray={n.pending ? "4 3" : ""} opacity={dim ? 0.18 : 0.55}
              />
            );
          })}
          {/* nodes */}
          {allNodes.map(n=>{
            const p = pos[n.id];
            const current = n.current, pending = n.pending;
            const dim = !inRange(n);
            return (
              <g key={n.id} opacity={dim ? 0.32 : 1}>
                <rect x={p.x-80} y={p.y-26} width={160} height={52} rx={5}
                  fill={current ? "var(--accent-soft)" : "var(--paper)"}
                  stroke={current ? "oklch(0.6 0.13 40)" : pending ? "var(--accent)" : "var(--line-2)"}
                  strokeDasharray={pending ? "4 3" : ""}
                  strokeWidth={current ? 1.5 : 1}/>
                <text x={p.x} y={p.y-9} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-4)">
                  {n.date || ""} · {n.meeting || ""}
                </text>
                <text x={p.x} y={p.y+5} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">
                  {n.branch || n.label}
                </text>
                <text x={p.x} y={p.y+18} textAnchor="middle" fontFamily="var(--sans)" fontSize="10" fill="var(--ink-2)">
                  {n.decided ? `→ ${n.decided}` : ""}
                </text>
                {current && <circle cx={p.x+70} cy={p.y-18} r={5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2}/>}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{marginTop:16, fontSize:12, color:"var(--ink-3)"}}>
        <b style={{color:"var(--ink)"}}>当前节点</b>: M-2026-04 · 「精选推理层 · 上限 6000 万」 · 下一分支待 M-2026-05 LP 沟通会决定
      </div>
    </div>
  );
}

function ModelHitrate() {
  const { range, label } = useTimeRange();
  // Scale invocation counts by range (mock: how much of the 6-month data we see)
  const scale = { "7d":0.08, "30d":0.32, "90d":0.72, "all":1 }[range] || 1;
  const rows = MODEL_HITRATE.map(m => {
    const invoked = Math.max(1, Math.round(m.invoked * scale));
    // Hitrate drifts slightly by range — shorter windows are noisier
    const noise = range === "7d" ? 0.08 : range === "30d" ? 0.03 : 0;
    const hitrate = Math.min(1, Math.max(0.3, m.hitrate + (Math.sin(m.id.charCodeAt(3)) * noise)));
    const hits = Math.round(invoked * hitrate);
    return { ...m, invoked, hits, hitrate,
      // drop "warn" if too few samples to conclude
      warn: m.warn && invoked >= 10,
      lowSample: invoked < 8,
    };
  });
  const visible = rows.filter(r => r.invoked >= 1);
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px"}}>
        心智模型命中率 · 反向校准专家库
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:14, maxWidth:720}}>
        模型激活 × 后验命中。这张表用于<b>反向修正专家池</b> —— 命中率长期低于 65% 的模型，
        会被系统降低匹配权重。
      </div>
      <RangeStrip
        range={range} label={label}
        total={MODEL_HITRATE.length} filtered={visible.length}
        note={range === "7d" ? "7d 样本量小 · 命中率可能不稳定" : null}
      />
      <div style={{
        display:"grid", gridTemplateColumns:"180px 80px 1fr 100px 120px",
        padding:"10px 14px", fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)",
        letterSpacing:0.3, textTransform:"uppercase", borderBottom:"1px solid var(--line-2)",
      }}>
        <span>模型</span><span>激活</span><span>命中率</span><span>命中</span><span>主要专家</span>
      </div>
      {rows.map((m,i)=>(
        <div key={m.id} style={{
          display:"grid", gridTemplateColumns:"180px 80px 1fr 100px 120px",
          alignItems:"center", gap:10, padding:"14px 14px",
          borderBottom:"1px solid var(--line-2)",
          background: i%2===0 ? "var(--paper-2)" : "var(--paper)",
          opacity: m.lowSample ? 0.6 : 1,
        }}>
          <div>
            <window.MonoMeta style={{fontSize:9.5}}>{m.id}</window.MonoMeta>
            <div style={{fontFamily:"var(--serif)", fontSize:13.5, fontWeight:600, marginTop:3}}>{m.name}</div>
            {m.warn && <window.Chip tone="accent" style={{marginTop:6}}>建议降权</window.Chip>}
            {m.lowSample && <window.Chip tone="ghost" style={{marginTop:6}}>样本不足</window.Chip>}
          </div>
          <div style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, letterSpacing:"-0.01em"}}>{m.invoked}</div>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <div style={{flex:1, height:5, background:"var(--line-2)", borderRadius:2, overflow:"hidden"}}>
              <div style={{
                width:`${m.hitrate*100}%`, height:"100%",
                background: m.hitrate > 0.8 ? "oklch(0.6 0.1 140)"
                         : m.hitrate > 0.65 ? "var(--amber)"
                         : "var(--accent)",
              }}/>
            </div>
            <window.MonoMeta style={{fontSize:11.5, color:"var(--ink)", fontWeight:600, minWidth:40, textAlign:"right"}}>
              {(m.hitrate*100).toFixed(0)}%
            </window.MonoMeta>
          </div>
          <window.MonoMeta>{m.hits} / {m.invoked}</window.MonoMeta>
          <window.MonoMeta style={{fontSize:11}}>{m.byTopExpert}</window.MonoMeta>
        </div>
      ))}
      <div style={{marginTop:18, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <window.CalloutCard title="建议 · 反身性模型降权" tone="accent">
          反身性（MM-03）命中率仅 0.58，持续 3 个月低于阈值。
          系统建议在匹配 E11-03 (叙事追踪者) 时，自动降低反身性权重至 0.7。
        </window.CalloutCard>
        <window.CalloutCard title="最强信号 · 基础利率">
          MM-02 命中率 0.91，6 个月稳定。E07-18 (基础利率检察官) 应被优先匹配到所有
          含「这次不一样」表述的会议。
        </window.CalloutCard>
      </div>
    </div>
  );
}

Object.assign(window, { LongitudinalView, BeliefDrift, DecisionTree, ModelHitrate });
