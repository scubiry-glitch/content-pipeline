// dimensions-projects-extra.jsx — 项目轴新增 ⑤ 责任盘点 · ⑥ 对外影响

// ─────────────────────────────────────────────────────────
// ⑤ 责任盘点 · Accountability Map
// 项目里每个待办的「真正责任人」是谁、卡在哪
// ─────────────────────────────────────────────────────────
const ACCOUNTABILITY = [
  { id:"AC-01", item:"推理层 3 家 candidate 尽调包",
    nominal:"p2", real:"p2", blocker:null, age:14, status:"on-track",
    why:"提出者即执行者,链路最短。" },
  { id:"AC-02", item:"北美同业退出路径对比",
    nominal:"p3", real:"p3", blocker:"等待 Omar 提供 raw data", age:21, status:"blocked",
    why:"卡在外部依赖 · 责任名义和实质都在 Wei,但他没有催 Omar 的渠道。" },
  { id:"AC-03", item:"2023-2025 基础利率补充",
    nominal:"p4", real:"p4", blocker:null, age:7, status:"done",
    why:"" },
  { id:"AC-04", item:"LP 集中度口径预沟通",
    nominal:"p1", real:"p1", blocker:"陈汀本人时间", age:42, status:"slipped",
    why:"已逾期 14 天 · 没有 backup 路径 —— 他是唯一能直接对话 LP 的人。" },
  { id:"AC-05", item:"估值模型 v2 校准",
    nominal:"p2", real:"unclear", blocker:"职责模糊", age:35, status:"limbo",
    why:"沈岚提议、周劭然在做,但谁拍板「校准完成」没说清。" },
  { id:"AC-06", item:"Subadvisor term sheet 草稿",
    nominal:"p3", real:"p6", blocker:null, age:5, status:"on-track",
    why:"名义是 Wei,实际 Omar 在写 · 名义/实质错配但运转良好。" },
  { id:"AC-07", item:"H-chip 配额 Q3 监控",
    nominal:"—", real:"—", blocker:"无人认领", age:60, status:"orphan",
    why:"重要但无人主动认领 · AS-02 假设的验证全靠这条。" },
];

const ACC_STATUS = {
  "on-track": { label:"进行中", fg:"oklch(0.3 0.08 200)",   bg:"var(--teal-soft)" },
  "done":     { label:"已完成", fg:"oklch(0.35 0.12 140)",  bg:"oklch(0.93 0.06 140)" },
  "blocked":  { label:"阻塞",   fg:"oklch(0.38 0.09 75)",   bg:"var(--amber-soft)" },
  "slipped":  { label:"逾期",   fg:"oklch(0.32 0.1 40)",    bg:"var(--accent-soft)" },
  "limbo":    { label:"职责模糊", fg:"oklch(0.32 0.1 40)",  bg:"var(--accent-soft)" },
  "orphan":   { label:"孤儿 · 无人认领", fg:"oklch(0.32 0.1 40)", bg:"var(--accent-soft)" },
};

function ProjAccountability() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        责任盘点 · Accountability map
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:20, maxWidth:720}}>
        每个待办的<b>名义责任人</b>(谁被点名)和<b>实质责任人</b>(谁真在推动)往往不是同一个人。
        卡住的事情、孤儿任务、错配关系 —— 都在这张表里。
      </div>

      <div style={{
        display:"grid", gridTemplateColumns:"80px minmax(220px,1fr) 110px 110px 90px 110px 1fr",
        padding:"10px 14px", fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)",
        letterSpacing:0.3, textTransform:"uppercase", borderBottom:"1px solid var(--line-2)",
      }}>
        <span>ID</span><span>事项</span><span>名义</span><span>实质</span><span>停留</span><span>状态</span><span>诊断</span>
      </div>
      {ACCOUNTABILITY.map((a,i)=>{
        const st = ACC_STATUS[a.status];
        const nominal = a.nominal==="—" ? null : window.P(a.nominal);
        const real = a.real==="—" || a.real==="unclear" ? null : window.P(a.real);
        const mismatch = nominal && real && nominal.id!==real.id;
        return (
          <div key={a.id} style={{
            display:"grid", gridTemplateColumns:"80px minmax(220px,1fr) 110px 110px 90px 110px 1fr",
            alignItems:"center", gap:10, padding:"12px 14px",
            borderBottom:"1px solid var(--line-2)",
            background: i%2===0 ? "var(--paper-2)" : "var(--paper)",
          }}>
            <window.MonoMeta>{a.id}</window.MonoMeta>
            <div style={{fontSize:13, fontFamily:"var(--serif)", lineHeight:1.45, fontWeight:500}}>
              {a.item}
              {a.blocker && (
                <div style={{fontSize:10.5, color:"oklch(0.38 0.09 75)", marginTop:3}}>
                  ⛔ {a.blocker}
                </div>
              )}
            </div>
            <div style={{fontSize:11.5}}>
              {nominal ? (
                <div style={{display:"flex", alignItems:"center", gap:5}}>
                  <window.Avatar p={nominal} size={18} radius={4}/>
                  <span>{nominal.name}</span>
                </div>
              ) : <span style={{color:"var(--ink-4)", fontStyle:"italic"}}>未定</span>}
            </div>
            <div style={{fontSize:11.5}}>
              {a.real==="unclear" ? (
                <span style={{color:"oklch(0.32 0.1 40)", fontStyle:"italic"}}>不清楚</span>
              ) : real ? (
                <div style={{display:"flex", alignItems:"center", gap:5}}>
                  <window.Avatar p={real} size={18} radius={4}/>
                  <span>{real.name}</span>
                  {mismatch && <span title="错配" style={{color:"oklch(0.32 0.1 40)", fontSize:10}}>⚠</span>}
                </div>
              ) : <span style={{color:"var(--ink-4)", fontStyle:"italic"}}>无</span>}
            </div>
            <window.MonoMeta style={{fontSize:11, color: a.age>30 ? "oklch(0.32 0.1 40)" : "var(--ink-3)"}}>{a.age}d</window.MonoMeta>
            <span style={{fontSize:10.5, padding:"2px 8px", borderRadius:3, fontWeight:600, background:st.bg, color:st.fg}}>
              {st.label}
            </span>
            <div style={{fontSize:11, color:"var(--ink-3)", fontStyle:"italic", lineHeight:1.5, fontFamily:"var(--serif)"}}>
              {a.why || "—"}
            </div>
          </div>
        );
      })}

      <div style={{marginTop:22, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12}}>
        <window.CalloutCard title="孤儿任务 · 1 项" tone="accent">
          <b>AC-07 · H-chip Q3 监控</b> 已挂 60 天无人认领。AS-02 假设的验证全靠这条。
          下次会议前 5 分钟必须指定责任人。
        </window.CalloutCard>
        <window.CalloutCard title="名实错配 · 1 项">
          <b>AC-06</b> 名义 Wei,实际 Omar。运转良好但代价是 Wei 在汇报里揽功 ——
          下次复盘时把名义改对,否则贡献度打分会失真。
        </window.CalloutCard>
        <window.CalloutCard title="单点故障 · 1 处">
          <b>AC-04</b> 陈汀是唯一对 LP 通道。若他出差/生病, LP 集中度沟通直接断。
          建议 p2 作为第二接口预热。
        </window.CalloutCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ⑥ 对外影响 · External Impact
// 这个项目对 LP / 客户 / 竞品 / 监管 的辐射
// ─────────────────────────────────────────────────────────
const STAKEHOLDER_GROUPS = [
  { id:"lp", label:"LP", icon:"users", count:"5 家",
    impacts:[
      { decision:"D-07 · 单笔上限 6,000 万", direction:"积极",
        detail:"在合规口径范围内 · 比 8,000 万方案更易获 LP 委员会通过", confidence:0.74 },
      { decision:"D-06 · 推理层为主", direction:"中性偏负",
        detail:"集中度上升 · 林雾本周已第 3 次提示 · 需要主动沟通", confidence:0.68 },
    ],
    pendingComm:"集中度专项预沟通(Owner: p1, Due: 2026-04-25)" },
  { id:"target", label:"标的公司", icon:"target", count:"7 候选",
    impacts:[
      { decision:"D-06 · 推理层精选", direction:"积极",
        detail:"被纳入 candidate 池的 3 家会感受到 term sheet 速度提升", confidence:0.81 },
      { decision:"D-06", direction:"消极",
        detail:"未入池的 4 家会被搁置 · 其中 2 家可能转向竞品", confidence:0.55 },
    ],
    pendingComm:"未入池公司的礼貌沟通(Owner: p2, Due: 持续)" },
  { id:"competitor", label:"竞品 GP", icon:"network", count:"6 家在跟踪",
    impacts:[
      { decision:"D-06 · 收敛推理层", direction:"信号外泄",
        detail:"如果决议外泄 · 头部 2 家 GP 会立刻在同一池竞价 · 抢标风险", confidence:0.62 },
    ],
    pendingComm:"内部禁言期 · 至 D-07 完成 LP 沟通" },
  { id:"reg", label:"监管 / 政策", icon:"scale", count:"中美双轨",
    impacts:[
      { decision:"D-04 · H-chip 纳入估值", direction:"暴露",
        detail:"估值模型显式依赖配额政策 · 若 Q3 收紧,估值需立即下修", confidence:0.78 },
    ],
    pendingComm:"无 · 但需监控 BIS 4 月公告" },
  { id:"team", label:"被投团队 / 既有 portfolio", icon:"users", count:"2 家头部",
    impacts:[
      { decision:"D-06 · 赛道收敛", direction:"消极",
        detail:"训练层已投 1 家会感到资源被抽 · 需要 partner 主动安抚", confidence:0.71 },
    ],
    pendingComm:"陈汀亲自电话(Owner: p1, Due: 2026-04-18)" },
];

const DIR_TONE = {
  "积极":      { bg:"oklch(0.93 0.06 140)", fg:"oklch(0.35 0.12 140)" },
  "中性偏负":  { bg:"var(--amber-soft)",    fg:"oklch(0.38 0.09 75)" },
  "消极":      { bg:"var(--accent-soft)",   fg:"oklch(0.32 0.1 40)" },
  "信号外泄":  { bg:"var(--accent-soft)",   fg:"oklch(0.32 0.1 40)" },
  "暴露":      { bg:"var(--amber-soft)",    fg:"oklch(0.38 0.09 75)" },
};

function ProjExternalImpact() {
  return (
    <div style={{padding:"22px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        对外影响 · External impact
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:720}}>
        决议不只在会议室里发生作用。这张图把<b>每个决议向外辐射</b>到的 5 个利益相关方都列出来 ——
        谁会感到积极/消极、信号会如何外泄、哪些沟通必须主动发起。
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {STAKEHOLDER_GROUPS.map(g=>(
          <div key={g.id} style={{
            background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 20px",
          }}>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12, paddingBottom:12,
              borderBottom:"1px solid var(--line-2)"}}>
              <div style={{
                width:34, height:34, borderRadius:6, background:"var(--paper)", border:"1px solid var(--line-2)",
                display:"flex", alignItems:"center", justifyContent:"center", color:"var(--ink-2)",
              }}>
                <window.Icon name={g.icon} size={18}/>
              </div>
              <div>
                <div style={{fontFamily:"var(--serif)", fontSize:16, fontWeight:600}}>{g.label}</div>
                <window.MonoMeta>{g.count}</window.MonoMeta>
              </div>
              <div style={{marginLeft:"auto", fontSize:11.5, color:"var(--ink-3)"}}>
                {g.pendingComm && (
                  <>
                    <span style={{color:"var(--ink-4)"}}>待发起沟通:</span>{" "}
                    <span style={{fontStyle:"italic"}}>{g.pendingComm}</span>
                  </>
                )}
              </div>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {g.impacts.map((im,i)=>{
                const t = DIR_TONE[im.direction];
                return (
                  <div key={i} style={{
                    display:"grid", gridTemplateColumns:"180px 90px 1fr 100px", gap:12, alignItems:"center",
                    padding:"8px 12px", background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:5,
                  }}>
                    <window.MonoMeta style={{color:"var(--ink-2)"}}>{im.decision}</window.MonoMeta>
                    <span style={{
                      fontSize:11, padding:"2px 8px", borderRadius:3, fontWeight:600,
                      background:t.bg, color:t.fg, textAlign:"center",
                    }}>{im.direction}</span>
                    <div style={{fontSize:12, fontFamily:"var(--serif)", color:"var(--ink-2)", lineHeight:1.5}}>{im.detail}</div>
                    <div style={{textAlign:"right"}}>
                      <window.MonoMeta style={{fontSize:9.5}}>置信</window.MonoMeta>
                      <div style={{display:"flex", alignItems:"center", gap:5, justifyContent:"flex-end"}}>
                        <div style={{width:50, height:3, background:"var(--line-2)", borderRadius:2}}>
                          <div style={{width:`${im.confidence*100}%`, height:"100%", background:t.fg, borderRadius:2}}/>
                        </div>
                        <window.MonoMeta style={{fontSize:10}}>{im.confidence.toFixed(2)}</window.MonoMeta>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop:22, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <window.CalloutCard title="被低估的辐射" tone="accent">
          团队倾向于只看 LP 一条线。但 D-06 对<b>未入池标的</b>和<b>训练层既有 portfolio</b>的负面辐射,
          没有进会议纪要 —— 这次系统帮你抓出来了。
        </window.CalloutCard>
        <window.CalloutCard title="信号外泄风险">
          D-06 是当前最敏感的内部信息。若在 LP 沟通完成之前外泄到 6 家竞品 GP 中任何一家,
          头部 candidate 的 term sheet 价格会立刻被推高 15-25%。
        </window.CalloutCard>
      </div>
    </div>
  );
}

Object.assign(window, {
  ProjAccountability, ProjExternalImpact,
  PJAccountability: ProjAccountability,
  PJExternalImpact: ProjExternalImpact,
});
