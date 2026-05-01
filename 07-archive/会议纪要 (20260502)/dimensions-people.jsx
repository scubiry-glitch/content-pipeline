// dimensions-people.jsx — 人物轴的四个细分维度
// 承诺与兑现 · 角色画像演化 · 发言质量 · 沉默信号
// 设计原则：一套数据库 · 多种视图 —— 每个维度都是对同一批会议数据的不同投射

// ────────────────────────────────────────────────────────────
// Mock cross-meeting data
// ────────────────────────────────────────────────────────────
const COMMITMENTS = [
  { id:"K-0237-A1", who:"p2", meeting:"M-2026-04-11", what:"两周内提交推理层 3 家 candidate 尽调包",
    due:"2026-04-25", state:"on-track", progress:0.6 },
  { id:"K-0237-A2", who:"p3", meeting:"M-2026-04-11", what:"整理北美 5 家同业在推理层的退出路径对比",
    due:"2026-04-22", state:"at-risk", progress:0.2 },
  { id:"K-0237-A3", who:"p4", meeting:"M-2026-04-11", what:"补充 2023-2025 基础设施细分赛道基础利率",
    due:"2026-04-18", state:"done", progress:1.0 },
  { id:"K-0188-A1", who:"p2", meeting:"M-2026-03-22", what:"估值模型 v2 —— 加入 workload cohort 维度",
    due:"2026-04-05", state:"done", progress:1.0 },
  { id:"K-0188-A2", who:"p1", meeting:"M-2026-03-22", what:"与 LP 预沟通单笔上限的口径",
    due:"2026-04-01", state:"slipped", progress:0.3 },
  { id:"K-0173-A1", who:"p3", meeting:"M-2026-03-14", what:"subadvisor 条款 term sheet 草稿",
    due:"2026-03-28", state:"done", progress:1.0 },
  { id:"K-0121-A1", who:"p1", meeting:"M-2026-02-08", what:"H-chip 配额 Q2 预案文件",
    due:"2026-02-25", state:"done", progress:1.0 },
  { id:"K-0107-A1", who:"p3", meeting:"M-2026-01-30", what:"退出预演 · 头部 3 家二级市场对标",
    due:"2026-02-15", state:"done", progress:1.0 },
];

// Per-person aggregate stats (derived from the full database of meetings)
const PEOPLE_STATS = [
  { who:"p1", fulfillment:0.72, avgLatency:"+2.4d", claims:34, followThroughGrade:"B",
    roleTrajectory:[{m:"M-2025-11",role:"提出者"},{m:"M-2026-01",role:"质疑者"},{m:"M-2026-04",role:"决策者"}],
    speechHighEntropy:0.61, beingFollowedUp:18, silentOnTopics:["技术路线"] },
  { who:"p2", fulfillment:0.88, avgLatency:"-0.3d", claims:51, followThroughGrade:"A",
    roleTrajectory:[{m:"M-2025-11",role:"执行者"},{m:"M-2026-02",role:"提出者"},{m:"M-2026-04",role:"提出者"}],
    speechHighEntropy:0.74, beingFollowedUp:27, silentOnTopics:[] },
  { who:"p3", fulfillment:0.64, avgLatency:"+3.1d", claims:42, followThroughGrade:"B-",
    roleTrajectory:[{m:"M-2025-11",role:"决策者"},{m:"M-2026-02",role:"质疑者"},{m:"M-2026-04",role:"质疑者"}],
    speechHighEntropy:0.52, beingFollowedUp:22, silentOnTopics:["合规边界"] },
  { who:"p4", fulfillment:0.95, avgLatency:"-1.1d", claims:18, followThroughGrade:"A+",
    roleTrajectory:[{m:"M-2025-11",role:"执行者"},{m:"M-2026-02",role:"执行者"},{m:"M-2026-04",role:"执行者"}],
    speechHighEntropy:0.68, beingFollowedUp:11, silentOnTopics:[] },
  { who:"p5", fulfillment:1.0, avgLatency:"-", claims:6, followThroughGrade:"—",
    roleTrajectory:[{m:"M-2025-11",role:"旁观者"},{m:"M-2026-02",role:"旁观者"},{m:"M-2026-04",role:"旁观者"}],
    speechHighEntropy:0.81, beingFollowedUp:5, silentOnTopics:["产业判断","估值方法"] },
  { who:"p6", fulfillment:0.80, avgLatency:"+1.2d", claims:14, followThroughGrade:"A-",
    roleTrajectory:[{m:"M-2025-11",role:"旁观者"},{m:"M-2026-02",role:"提出者"},{m:"M-2026-04",role:"执行者"}],
    speechHighEntropy:0.58, beingFollowedUp:9, silentOnTopics:["合规"] },
];

const stateStyle = {
  "done":     { bg:"oklch(0.93 0.06 140)", fg:"oklch(0.35 0.12 140)", bd:"oklch(0.85 0.08 140)", label:"已兑现" },
  "on-track": { bg:"var(--teal-soft)",      fg:"oklch(0.3 0.08 200)",   bd:"oklch(0.85 0.05 200)", label:"进行中" },
  "at-risk":  { bg:"var(--amber-soft)",     fg:"oklch(0.38 0.09 75)",   bd:"oklch(0.85 0.07 75)",  label:"有风险" },
  "slipped":  { bg:"var(--accent-soft)",    fg:"oklch(0.32 0.1 40)",    bd:"oklch(0.85 0.07 40)",  label:"已逾期" },
};

// ────────────────────────────────────────────────────────────
// Shell: a 4-tab view hosting the four sub-dimensions
// ────────────────────────────────────────────────────────────
function DimensionPeople() {
  const [tab, setTab] = React.useState("commitments");
  const tabs = [
    { id:"commitments", label:"承诺与兑现", sub:"说到做到率 · 跨会议承诺 ledger", icon:"check" },
    { id:"trajectory",  label:"角色画像演化", sub:"功能角色的漂移 · 提出者 / 质疑者 / 执行者", icon:"git" },
    { id:"speech",      label:"发言质量",   sub:"信息熵 · 被追问率 · 引用率", icon:"mic" },
    { id:"silence",     label:"沉默信号",   sub:"谁在什么议题上反常沉默", icon:"wand" },
    { id:"drift",       label:"信念轨迹",   sub:"同一人在同一议题上随时间的判断变化", icon:"arrow" },
    { id:"formation",   label:"阵型",       sub:"功能位置 · 缺位预警", icon:"users" },
    { id:"blindspots",  label:"盲区档案",   sub:"系统性低估 · 过度自信", icon:"wand" },
  ];
  return (
    <DimShell axis="人物" tabs={tabs} tab={tab} setTab={setTab}>
      {tab==="commitments" && <PCommitments/>}
      {tab==="trajectory"  && <PTrajectory/>}
      {tab==="speech"      && <PSpeech/>}
      {tab==="silence"     && <PSilence/>}
      {tab==="drift"       && <window.BeliefDrift/>}
      {tab==="formation"   && <window.PFormation/>}
      {tab==="blindspots"  && <window.PBlindSpots/>}
    </DimShell>
  );
}

// ────────────────────────────────────────────────────────────
// Reusable shell (people / project / knowledge / meeting)
// ────────────────────────────────────────────────────────────
function DimShell({ axis, tabs, tab, setTab, children }) {
  const axisColor = { "人物":"var(--accent)", "项目":"var(--teal)", "知识":"var(--amber)", "会议":"var(--ink)" }[axis] || "var(--ink)";
  const [range, setRange] = React.useState("30d");
  // Header tweakables (read from window; safe defaults if tweaks panel not loaded)
  const h = (window.__headerTweaks) || {};
  const preset      = h.headerPreset      || "current";   // current | minimal | twoRow | underline
  const showSubtitle = h.headerShowSubtitle !== false;
  const tabStyle    = h.headerTabStyle    || "pill-icon"; // pill-icon | pill-text | underline | icon-only
  const identityStyle = h.headerIdentity  || "full";      // full | compact | dot
  const collapseUtils = h.headerCollapseUtils || false;
  // Preset overrides
  const effectivePreset = preset;
  const useTwoRow      = effectivePreset === "twoRow";
  const useMinimal     = effectivePreset === "minimal";
  const useUnderline   = effectivePreset === "underline";
  const effTabStyle    = useMinimal ? "pill-text" : useUnderline ? "underline" : tabStyle;
  const effIdentity    = useMinimal ? "dot" : useUnderline ? "compact" : identityStyle;
  const effShowSub     = useMinimal ? false : useTwoRow ? true : showSubtitle;
  const effCollapse    = useMinimal || collapseUtils;
  const headerH        = useTwoRow ? 88 : useMinimal ? 48 : 64;
  const padX           = useMinimal ? 20 : 28;
  const currentTab = tabs.find(t => t.id === tab);

  // Identity block
  const identity = effIdentity === "dot" ? (
    <div style={{display:"flex", alignItems:"center", gap:8}}>
      <div style={{width:8, height:8, borderRadius:99, background:axisColor}}/>
      <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600, letterSpacing:"-0.005em"}}>
        {axis}
      </div>
    </div>
  ) : effIdentity === "compact" ? (
    <div style={{display:"flex", alignItems:"baseline", gap:8}}>
      <div style={{
        width:3, height:18, background:axisColor, borderRadius:2, transform:"translateY(3px)",
      }}/>
      <div style={{fontFamily:"var(--serif)", fontSize:17, fontWeight:600, letterSpacing:"-0.005em"}}>
        {axis}轴
      </div>
      <window.MonoMeta style={{fontSize:9.5}}>AXIS</window.MonoMeta>
    </div>
  ) : (
    <div style={{display:"flex", alignItems:"center", gap:10}}>
      <div style={{
        width:34, height:34, borderRadius:7, background:"var(--paper-2)", border:`1px solid var(--line-2)`,
        borderLeft:`3px solid ${axisColor}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"var(--serif)", fontSize:16, fontWeight:600, color:"var(--ink)",
      }}>{axis[0]}</div>
      <div>
        <window.MonoMeta style={{fontSize:10}}>AXIS · 一库多视图</window.MonoMeta>
        <div style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:600, letterSpacing:"-0.005em", marginTop:-2}}>
          {axis}轴
        </div>
      </div>
    </div>
  );

  // Tab list
  const tabsBlock = effTabStyle === "underline" ? (
    <div style={{display:"flex", gap:2, alignSelf:"stretch"}}>
      {tabs.map(t=>{
        const active = t.id===tab;
        return (
          <button key={t.id} onClick={()=>setTab(t.id)} title={t.sub} style={{
            padding:"0 14px", border:0, background:"transparent",
            borderBottom: active ? `2px solid ${axisColor}` : "2px solid transparent",
            color: active ? "var(--ink)" : "var(--ink-3)",
            cursor:"pointer", fontWeight: active ? 600 : 450, fontSize:13,
            fontFamily:"var(--sans)", display:"flex", alignItems:"center", gap:5,
            marginBottom:-1,
          }}>
            {t.label}
          </button>
        );
      })}
    </div>
  ) : (
    <div style={{display:"flex", gap:2, border:"1px solid var(--line)", borderRadius:6, padding:2}}>
      {tabs.map(t=>{
        const active = t.id===tab;
        const showIcon = effTabStyle !== "pill-text";
        const showLabel = effTabStyle !== "icon-only";
        return (
          <button key={t.id} onClick={()=>setTab(t.id)} title={t.sub || t.label} style={{
            padding: showLabel ? "6px 13px" : "6px 9px",
            border:0, borderRadius:4, fontSize:12.5,
            background: active ? "var(--ink)" : "transparent",
            color: active ? "var(--paper)" : "var(--ink-2)",
            cursor:"pointer", fontWeight: active ? 600 : 450, fontFamily:"var(--sans)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            {showIcon && <window.Icon name={t.icon} size={12}/>}
            {showLabel && t.label}
          </button>
        );
      })}
    </div>
  );

  // Right utils block
  const rightUtils = (
    <>
      {effShowSub && currentTab && !useTwoRow && (
        <span style={{fontSize:12, color:"var(--ink-3)", fontStyle:"italic"}}>{currentTab.sub}</span>
      )}
      {!effCollapse && <window.CrossAxisLink axis={axis}/>}
      <window.TimeRangePill />
      <window.ScopePill />
      {!effCollapse && (
        <button title="重新生成此轴数据" style={{
          border:"1px solid var(--line)", background:"var(--paper)", borderRadius:5,
          padding:"5px 10px", fontSize:11.5, cursor:"pointer", color:"var(--ink-2)",
          display:"flex", alignItems:"center", gap:5, fontFamily:"var(--sans)",
        }}>
          <span style={{fontSize:13, lineHeight:1}}>↻</span> 重算
        </button>
      )}
      {effCollapse && <OverflowMenu axis={axis}/>}
      <window.RunBadge axis={axis + "轴"}/>
    </>
  );

  return (
    <window.TimeRangeContext.Provider value={{ range, setRange }}>
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      display:"grid", gridTemplateRows:`${headerH}px 1fr`, color:"var(--ink)",
      fontFamily:"var(--sans)", overflow:"hidden",
    }}>
      {useTwoRow ? (
        <div style={{
          display:"grid", gridTemplateRows:"52px 36px",
          borderBottom:"1px solid var(--line-2)",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:18, padding:`0 ${padX}px`}}>
            {identity}
            <div style={{flex:1}}/>
            {rightUtils}
          </div>
          <div style={{
            display:"flex", alignItems:"center", gap:18, padding:`0 ${padX}px`,
            borderTop:"1px solid var(--line-2)", background:"var(--paper-2)",
          }}>
            {tabsBlock}
            {currentTab && (
              <span style={{fontSize:11.5, color:"var(--ink-3)", fontStyle:"italic", marginLeft:6}}>
                {currentTab.sub}
              </span>
            )}
          </div>
        </div>
      ) : (
        <header style={{
          display:"flex", alignItems:"center", gap: useMinimal ? 12 : 16, padding:`0 ${padX}px`,
          borderBottom:"1px solid var(--line-2)",
        }}>
          {identity}
          <div style={{marginLeft: useMinimal ? 12 : 18}}>{tabsBlock}</div>
          <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
            {rightUtils}
          </div>
        </header>
      )}

      <div style={{overflow:"auto"}}>{children}</div>
    </div>
    </window.TimeRangeContext.Provider>
  );
}

function OverflowMenu({ axis }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)} title="更多" style={{
        width:30, height:28, border:"1px solid var(--line)", background:"var(--paper)",
        borderRadius:5, cursor:"pointer", color:"var(--ink-2)", fontSize:14, lineHeight:1,
        fontFamily:"var(--sans)",
      }}>⋯</button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed", inset:0, zIndex:40}}/>
          <div style={{
            position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:41,
            minWidth:160, background:"var(--paper)", border:"1px solid var(--line)",
            borderRadius:6, boxShadow:"0 8px 24px rgba(0,0,0,.08)", padding:6,
          }}>
            <MenuItem label="跨轴联动" sub="CrossAxisLink"/>
            <MenuItem label="重新生成" sub="此轴数据"/>
          </div>
        </>
      )}
    </div>
  );
}
function MenuItem({ label, sub }) {
  return (
    <button style={{
      display:"block", width:"100%", textAlign:"left", padding:"7px 10px",
      border:0, background:"transparent", borderRadius:4, cursor:"pointer",
      fontSize:12, color:"var(--ink-2)", fontFamily:"var(--sans)",
    }}>
      <div>{label}</div>
      <div style={{fontSize:10, color:"var(--ink-4)", marginTop:1}}>{sub}</div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// P1 · 承诺与兑现
// ────────────────────────────────────────────────────────────
function PCommitments() {
  const byPerson = window.PARTICIPANTS.map(p => ({
    p, stats: PEOPLE_STATS.find(x=>x.who===p.id),
    items: COMMITMENTS.filter(c=>c.who===p.id),
  })).filter(x=>x.items.length>0);

  return (
    <div style={{padding:"24px 32px 36px", display:"grid", gridTemplateColumns:"1fr 340px", gap:24}}>
      <div>
        <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
          承诺 ledger · 跨会议
        </h3>
        <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:18, maxWidth:600}}>
          每一条行动项都被抽出为可追踪的承诺。谁说的话能当 signal、谁的话需要 discount，这张表会告诉你。
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:18}}>
          {byPerson.map(({p, stats, items}) => (
            <div key={p.id} style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
                <window.Avatar p={p} size={36} radius={7}/>
                <div>
                  <div style={{fontSize:14, fontWeight:600}}>{p.name}</div>
                  <div style={{fontSize:11.5, color:"var(--ink-3)"}}>{p.role}</div>
                </div>
                <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:14}}>
                  <BigStat label="兑现率" v={Math.round(stats.fulfillment*100)+"%"} accent/>
                  <BigStat label="平均滞后" v={stats.avgLatency}/>
                  <div style={{textAlign:"right"}}>
                    <window.MonoMeta>FOLLOW-THROUGH</window.MonoMeta>
                    <div style={{fontFamily:"var(--serif)", fontSize:22, fontWeight:600, color:"var(--accent)", letterSpacing:"-0.01em"}}>
                      {stats.followThroughGrade}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{display:"flex", flexDirection:"column"}}>
                {items.map((c,i)=>{
                  const s = stateStyle[c.state];
                  return (
                    <div key={c.id} style={{
                      display:"grid", gridTemplateColumns:"88px 1fr 80px 120px 70px",
                      alignItems:"center", gap:12, padding:"10px 0",
                      borderTop: i===0 ? "none" : "1px solid var(--line-2)",
                    }}>
                      <window.MonoMeta>{c.id}</window.MonoMeta>
                      <div style={{fontSize:13, fontFamily:"var(--serif)", color:"var(--ink)"}}>{c.what}</div>
                      <div>
                        <div style={{height:3, background:"var(--line-2)", borderRadius:2}}>
                          <div style={{width:`${c.progress*100}%`, height:"100%", background:s.fg, borderRadius:2}}/>
                        </div>
                      </div>
                      <window.MonoMeta>{c.meeting} · {c.due}</window.MonoMeta>
                      <span style={{
                        fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99,
                        background:s.bg, color:s.fg, border:`1px solid ${s.bd}`, textAlign:"center",
                      }}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside style={{display:"flex", flexDirection:"column", gap:12}}>
        <CalloutCard title="这张表的价值">
          决策前看一眼：这个人历史上承诺过 {COMMITMENTS.length} 件事，平均兑现率 76%，滞后中位数 +1.8d。
          <b style={{color:"var(--ink)"}}>信号强度 = 发言权重 × 兑现率。</b>
        </CalloutCard>
        <CalloutCard title="批判提醒">
          兑现率 100% 的人未必最可信 —— 可能只承诺了他能轻松完成的事情。配合
          <i> 承诺难度 </i> 维度一起读。
        </CalloutCard>
        <div style={{
          background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"14px 16px",
        }}>
          <window.SectionLabel>团队整体</window.SectionLabel>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10}}>
            <StatCell l="团队兑现率" v="76%"/>
            <StatCell l="平均滞后" v="+1.8d"/>
            <StatCell l="跨会议承诺" v={COMMITMENTS.length}/>
            <StatCell l="逾期率" v="13%"/>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// P2 · 角色画像演化
// ────────────────────────────────────────────────────────────
const ROLE_TONES = {
  "提出者": { bg:"var(--accent-soft)",    fg:"oklch(0.32 0.1 40)" },
  "质疑者": { bg:"var(--teal-soft)",       fg:"oklch(0.28 0.08 200)" },
  "执行者": { bg:"oklch(0.93 0.06 140)",   fg:"oklch(0.32 0.12 140)" },
  "决策者": { bg:"var(--amber-soft)",      fg:"oklch(0.36 0.09 75)" },
  "旁观者": { bg:"var(--paper-3)",         fg:"var(--ink-3)" },
};
function PTrajectory() {
  return (
    <div style={{padding:"24px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        角色画像演化 · 6 个月
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:20, maxWidth:660}}>
        每场会议，系统按发言模式把参与者归类到一个功能角色。半年下来，<i>漂移</i> 本身就是信号：
        一个从"决策者"漂到"质疑者"的人，可能是在主动让位，也可能是在失去主导权。
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:6}}>
        <div style={{display:"grid", gridTemplateColumns:"200px 1fr 100px", padding:"8px 14px",
          fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)", letterSpacing:0.3, textTransform:"uppercase"}}>
          <span>PARTICIPANT</span><span>TRAJECTORY (2025-11 → 2026-04)</span><span style={{textAlign:"right"}}>DRIFT</span>
        </div>
        {PEOPLE_STATS.map(s=>{
          const p = window.P(s.who);
          const drift = s.roleTrajectory[0].role !== s.roleTrajectory[s.roleTrajectory.length-1].role;
          return (
            <div key={s.who} style={{
              display:"grid", gridTemplateColumns:"200px 1fr 100px", alignItems:"center", gap:14,
              padding:"14px 14px", background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6,
            }}>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <window.Avatar p={p} size={28}/>
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{p.name}</div>
                  <div style={{fontSize:10.5, color:"var(--ink-3)"}}>{p.role}</div>
                </div>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:0, position:"relative"}}>
                {s.roleTrajectory.map((r,i)=>{
                  const tone = ROLE_TONES[r.role];
                  return (
                    <React.Fragment key={i}>
                      <div style={{
                        padding:"5px 12px", background:tone.bg, color:tone.fg,
                        fontSize:12, fontWeight:600, borderRadius:5, whiteSpace:"nowrap",
                        border:`1px solid ${tone.fg}22`,
                      }}>{r.role}</div>
                      {i<s.roleTrajectory.length-1 && (
                        <div style={{
                          flex:1, maxWidth:60, height:1.5, background:"var(--line)", position:"relative",
                        }}>
                          <div style={{position:"absolute", left:"50%", top:-7, transform:"translateX(-50%)",
                            fontFamily:"var(--mono)", fontSize:9, color:"var(--ink-4)", whiteSpace:"nowrap"}}>
                            {s.roleTrajectory[i+1].m.slice(5)}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <div style={{textAlign:"right"}}>
                {drift ? (
                  <window.Chip tone="accent">漂移</window.Chip>
                ) : (
                  <window.Chip tone="ghost">稳定</window.Chip>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:22, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <CalloutCard title="读图示例 · 陈汀" tone="accent">
          提出者 → 质疑者 → <b>决策者</b>。从半年前在提方案，到现在专门做最终拍板。
          <i>团队正在把决策权上收给他</i>，这可能是健康的（抗干扰），也可能是不健康的（单点故障）。
        </CalloutCard>
        <CalloutCard title="读图示例 · Wei Tan" tone="teal">
          决策者 → 质疑者 → 质疑者。过去主导决策，近 4 个月固定在质疑者位置。
          需要问：他是在防守立场、还是在给别人让路？
        </CalloutCard>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// P3 · 发言质量
// ────────────────────────────────────────────────────────────
function PSpeech() {
  const max = Math.max(...PEOPLE_STATS.map(s=>s.claims));
  return (
    <div style={{padding:"24px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        发言质量 ≠ 发言数量
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:20, maxWidth:640}}>
        信息熵衡量"这句话提供了多少新信息"；被追问率衡量"这句话点燃了多少后续讨论"。
        高熵 + 高追问 = 真正的贡献。发言多但双低的人，可能只是在填充空气。
      </div>

      <div style={{
        display:"grid", gridTemplateColumns:"220px 1fr 110px 110px 110px",
        padding:"10px 14px", fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)",
        letterSpacing:0.3, textTransform:"uppercase",
      }}>
        <span>PARTICIPANT</span>
        <span>CLAIMS (VOLUME)</span>
        <span style={{textAlign:"right"}}>HIGH-ENTROPY %</span>
        <span style={{textAlign:"right"}}>FOLLOWED UP</span>
        <span style={{textAlign:"right"}}>QUALITY</span>
      </div>
      {PEOPLE_STATS.map((s,idx)=>{
        const p = window.P(s.who);
        const qualityScore = Math.round((s.speechHighEntropy*0.6 + (s.beingFollowedUp/30)*0.4)*100);
        return (
          <div key={s.who} style={{
            display:"grid", gridTemplateColumns:"220px 1fr 110px 110px 110px",
            alignItems:"center", gap:12, padding:"12px 14px",
            borderTop: idx===0 ? "1px solid var(--line-2)" : "1px solid var(--line-2)",
            background: idx%2===0 ? "var(--paper-2)" : "var(--paper)",
          }}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <window.Avatar p={p} size={26}/>
              <div>
                <div style={{fontSize:13, fontWeight:500}}>{p.name}</div>
                <div style={{fontSize:10.5, color:"var(--ink-3)"}}>{p.role}</div>
              </div>
            </div>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <div style={{flex:1, maxWidth:240, height:8, background:"var(--line-2)", borderRadius:2}}>
                <div style={{width:`${(s.claims/max)*100}%`, height:"100%", background:"var(--ink-3)", borderRadius:2}}/>
              </div>
              <window.MonoMeta style={{width:28}}>{s.claims}</window.MonoMeta>
            </div>
            <div style={{textAlign:"right"}}>
              <EntropyBar v={s.speechHighEntropy}/>
            </div>
            <div style={{textAlign:"right"}}>
              <window.MonoMeta style={{fontSize:12, color:"var(--ink)"}}>×{s.beingFollowedUp}</window.MonoMeta>
            </div>
            <div style={{textAlign:"right", fontFamily:"var(--serif)", fontSize:20, fontWeight:600,
              color: qualityScore>60 ? "var(--accent)" : "var(--ink-3)", letterSpacing:"-0.01em"}}>
              {qualityScore}
            </div>
          </div>
        );
      })}

      <div style={{marginTop:24, padding:"14px 18px", background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, maxWidth:720}}>
        <window.SectionLabel>批判提醒</window.SectionLabel>
        <div style={{fontFamily:"var(--serif)", fontSize:14, lineHeight:1.65, marginTop:8, color:"var(--ink-2)"}}>
          沈岚的发言量最高(51)、质量也最高(65)。但这不是对她的褒奖，而是对团队的
          <b style={{color:"var(--accent)"}}>警告</b>：她若离场，信息生产力下降的中位估计是 34%。
          分散信息生产是团队韧性的核心。
        </div>
      </div>
    </div>
  );
}

function EntropyBar({ v }) {
  const segs = 10;
  const filled = Math.round(v*segs);
  return (
    <div style={{display:"flex", gap:2, justifyContent:"flex-end"}}>
      {Array.from({length:segs}).map((_,i)=>(
        <div key={i} style={{
          width:4, height: 4 + (i<filled ? 6 : 0),
          background: i<filled ? "var(--accent)" : "var(--line)", borderRadius:1,
        }}/>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// P4 · 沉默信号
// ────────────────────────────────────────────────────────────
function PSilence() {
  // Build a sparse matrix: participant × topic, where silence is abnormal if
  // the person usually talks about that topic but didn't this time.
  const topics = ["推理层","训练层","估值方法","合规 / LP","退出路径","地缘 / 政策","技术路线"];
  const matrix = [
    // rows align to PEOPLE_STATS; value: "spoke" / "silent" / "absent" / "abnormalSilence" / "normalSilence"
    { who:"p1", vals:["spoke","spoke","spoke","abnormalSilence","spoke","normalSilence","normalSilence"] },
    { who:"p2", vals:["spoke","spoke","spoke","spoke","spoke","spoke","normalSilence"] },
    { who:"p3", vals:["spoke","spoke","spoke","abnormalSilence","spoke","normalSilence","spoke"] },
    { who:"p4", vals:["spoke","normalSilence","spoke","normalSilence","spoke","normalSilence","normalSilence"] },
    { who:"p5", vals:["normalSilence","normalSilence","abnormalSilence","spoke","normalSilence","normalSilence","normalSilence"] },
    { who:"p6", vals:["spoke","spoke","normalSilence","abnormalSilence","spoke","normalSilence","normalSilence"] },
  ];
  const cellStyle = {
    "spoke":            { bg:"var(--ink)", fg:"var(--paper)", symbol:"●", hint:"发言" },
    "normalSilence":    { bg:"var(--paper-3)", fg:"var(--ink-4)", symbol:"·", hint:"未涉及 · 符合常态" },
    "abnormalSilence":  { bg:"var(--accent-soft)", fg:"var(--accent)", symbol:"○", hint:"反常沉默" },
    "absent":           { bg:"transparent", fg:"var(--ink-4)", symbol:"—", hint:"缺席" },
    "silent":           { bg:"var(--line)", fg:"var(--ink-4)", symbol:"·", hint:"" },
  };
  return (
    <div style={{padding:"24px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        沉默信号 · Silence as signal
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:680}}>
        反常的沉默 = 这个议题他过去总会参与，但这次没有。可能是让步、回避、不适、不同意却不便说。
        <b> 最危险的信息往往藏在没说的话里。</b>
      </div>

      <div style={{display:"inline-grid", gridTemplateColumns:`200px repeat(${topics.length}, 1fr)`, gap:6, alignItems:"center", maxWidth:"100%"}}>
        <div/>
        {topics.map(t=>(
          <div key={t} style={{fontSize:11, color:"var(--ink-3)", textAlign:"center", padding:"0 4px", lineHeight:1.3, fontWeight:500}}>
            {t}
          </div>
        ))}
        {matrix.map(row=>{
          const p = window.P(row.who);
          return (
            <React.Fragment key={row.who}>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <window.Avatar p={p} size={24} radius={5}/>
                <span style={{fontSize:12.5}}>{p.name}</span>
              </div>
              {row.vals.map((v,i)=>{
                const s = cellStyle[v];
                return (
                  <div key={i} title={`${p.name} · ${topics[i]} · ${s.hint}`} style={{
                    height:42, background:s.bg, border: v==="abnormalSilence" ? "1.5px solid var(--accent)" : "1px solid var(--line-2)",
                    borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center",
                    color:s.fg, fontSize: v==="abnormalSilence" ? 18 : 14, fontWeight: v==="spoke" ? 700 : 500,
                    position:"relative",
                  }}>
                    {s.symbol}
                    {v==="abnormalSilence" && (
                      <span style={{position:"absolute", top:-5, right:-5, width:8, height:8, borderRadius:99, background:"var(--accent)"}}/>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{display:"flex", gap:14, marginTop:18, fontSize:11.5, color:"var(--ink-3)"}}>
        <LegendCell style={cellStyle.spoke} label="发言"/>
        <LegendCell style={cellStyle.normalSilence} label="未涉及 (常态)"/>
        <LegendCell style={cellStyle.abnormalSilence} label="反常沉默"/>
      </div>

      <div style={{marginTop:26, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <CalloutCard title="今日反常沉默 · 3 处" tone="accent">
          <div style={{display:"flex", flexDirection:"column", gap:8, marginTop:8}}>
            <SilenceFinding p={window.P("p1")} topic="合规 / LP"
              note="过去 4 场合规话题平均发言 5+ 次，今次 0。他可能已在会前与林雾达成默契。"/>
            <SilenceFinding p={window.P("p3")} topic="合规 / LP"
              note="Wei Tan 通常会反问合规的细节，今次未问。疑似回避单笔上限讨论。"/>
            <SilenceFinding p={window.P("p5")} topic="估值方法"
              note="LP 代表第一次在估值议题上表态。需要跟进沟通。"/>
          </div>
        </CalloutCard>
        <CalloutCard title="批判：沉默也会误报">
          不是所有沉默都值得深究。需要和<i>议程优先级、发言机会窗口</i>一起看 ——
          如果议题只谈了 3 分钟，没人来得及说话，那不是信号，那是噪声。
        </CalloutCard>
      </div>
    </div>
  );
}

function LegendCell({ style, label }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:6}}>
      <div style={{
        width:18, height:18, background:style.bg, color:style.fg, border:"1px solid var(--line-2)",
        borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600,
      }}>{style.symbol}</div>
      <span>{label}</span>
    </div>
  );
}

function SilenceFinding({ p, topic, note }) {
  return (
    <div style={{display:"grid", gridTemplateColumns:"28px 1fr", gap:10, alignItems:"start"}}>
      <window.Avatar p={p} size={24} radius={5}/>
      <div>
        <div style={{fontSize:12.5}}>
          <b>{p.name}</b> <span style={{color:"var(--ink-3)"}}>on</span> <span style={{color:"var(--accent)", fontWeight:500}}>{topic}</span>
        </div>
        <div style={{fontSize:11.5, color:"var(--ink-3)", lineHeight:1.5, marginTop:2, fontFamily:"var(--serif)"}}>{note}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared tiny primitives
// ────────────────────────────────────────────────────────────
function BigStat({ label, v, accent }) {
  return (
    <div style={{textAlign:"right"}}>
      <window.MonoMeta style={{fontSize:9.5}}>{label}</window.MonoMeta>
      <div style={{
        fontFamily:"var(--serif)", fontSize:22, fontWeight:600,
        color: accent ? "var(--accent)" : "var(--ink)", letterSpacing:"-0.01em",
      }}>{v}</div>
    </div>
  );
}
function StatCell({ l, v }) {
  return (
    <div style={{padding:"8px 10px", background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:5}}>
      <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:0.3}}>{l}</div>
      <div style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:600, marginTop:2, letterSpacing:"-0.01em"}}>{v}</div>
    </div>
  );
}
function CalloutCard({ title, children, tone="ink" }) {
  const bg = tone==="accent" ? "var(--accent-soft)" : tone==="teal" ? "var(--teal-soft)" : "var(--paper-2)";
  const bd = tone==="accent" ? "oklch(0.85 0.07 40)" : tone==="teal" ? "oklch(0.85 0.05 200)" : "var(--line-2)";
  return (
    <div style={{background:bg, border:`1px solid ${bd}`, borderRadius:6, padding:"14px 16px"}}>
      <window.SectionLabel>{title}</window.SectionLabel>
      <div style={{fontSize:13, lineHeight:1.6, marginTop:8, color:"var(--ink-2)", fontFamily:"var(--serif)"}}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { DimensionPeople, COMMITMENTS, PEOPLE_STATS, DimShell, CalloutCard });
