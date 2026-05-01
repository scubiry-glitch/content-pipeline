// axis-regenerate.jsx
// 方案 C — 两个入口：
//   1) AxisRegeneratePanel       : 在轴视图内打开的快捷重算浮层（最小参数）
//   2) GenerationCenter          : 独立的生成中心（任务队列 + 历史版本 + 定时 + 对比）
// 触发策略：project 层自动增量 · library 层全量手动

// ─────────────────────────────────────────────────────────
// 轴 · 子维度定义（每条轴可单独重算的最小单元）
// ─────────────────────────────────────────────────────────
const AXIS_SUB = {
  people: {
    label:"人物轴", color:"var(--accent)",
    subs:[
      { id:"commit",   label:"承诺兑现",      cost:"medium", depsOn:["commitment_trace","track_record_verify"] },
      { id:"role",     label:"角色演化",      cost:"low",    depsOn:["evidence_anchored"] },
      { id:"voice",    label:"发言质量",      cost:"low",    depsOn:["rubric_anchored_output"] },
      { id:"silence",  label:"沉默信号",      cost:"medium", depsOn:["failure_check"] },
    ],
  },
  projects: {
    label:"项目轴", color:"var(--teal)",
    subs:[
      { id:"decision", label:"决议溯源",      cost:"high",   depsOn:["knowledge_grounded","evidence_anchored"] },
      { id:"hypo",     label:"假设清单",      cost:"medium", depsOn:["contradictions_surface"] },
      { id:"open",     label:"开放问题",      cost:"low",    depsOn:["chronic_question_surface"] },
      { id:"risk",     label:"风险热度",      cost:"medium", depsOn:["calibrated_confidence"] },
    ],
  },
  knowledge: {
    label:"知识轴", color:"oklch(0.55 0.08 280)",
    subs:[
      { id:"judgement",label:"可复用判断",    cost:"medium", depsOn:["knowledge_grounded"] },
      { id:"mmodel",   label:"心智模型命中率", cost:"high",   depsOn:["model_hitrate_audit"] },
      { id:"bias",     label:"认知偏误",      cost:"medium", depsOn:["drift_detect"] },
      { id:"counter",  label:"反事实",        cost:"high",   depsOn:["contradictions_surface","debate"] },
    ],
  },
  meta: {
    label:"会议本身", color:"var(--amber)",
    subs:[
      { id:"quality",  label:"质量分",        cost:"low",    depsOn:["rubric_anchored_output"] },
      { id:"need",     label:"必要性评估",    cost:"low",    depsOn:["failure_check"] },
      { id:"heat",     label:"情绪热力图",    cost:"medium", depsOn:["evidence_anchored"] },
    ],
  },
};

const COST_TABLE = { low:{ tok:"~4k",  time:"20-40s" }, medium:{ tok:"~12k", time:"1-2m" }, high:{ tok:"~30k", time:"3-6m" } };

// ─────────────────────────────────────────────────────────
// 1) AxisRegeneratePanel — 轴视图内的快捷面板
// ─────────────────────────────────────────────────────────
function AxisRegeneratePanel() {
  const [axis, setAxis] = React.useState("knowledge");
  const [selected, setSelected] = React.useState(["mmodel","bias"]);
  const [preset, setPreset] = React.useState("standard");
  const [scope, setScope] = React.useState("project"); // project | library
  const axisMeta = AXIS_SUB[axis];

  const total = selected.reduce((acc,id)=>{
    const sub = axisMeta.subs.find(s=>s.id===id);
    const tk = { low:4, medium:12, high:30 }[sub.cost];
    return acc + tk * (preset==="lite"?0.5:preset==="max"?2.5:1) * (scope==="library"?3:1);
  },0);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper-2)", padding:"36px 44px",
      fontFamily:"var(--sans)", color:"var(--ink)", display:"flex", flexDirection:"column",
      overflow:"hidden",
    }}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:6}}>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:26, margin:0, letterSpacing:"-0.01em"}}>
          重新生成 · 轴视图
        </h2>
        <window.MonoMeta>axis.regenerate · inline</window.MonoMeta>
      </div>
      <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:22, maxWidth:720, lineHeight:1.55}}>
        从轴视图右上角「↻ 重算」打开。只暴露核心参数：选哪些子维度 · 用什么 preset · 在什么 scope 下。
        <b style={{color:"var(--ink-2)"}}>project 层自动增量</b>，你只在需要更深分析时手动覆盖；
        <b style={{color:"var(--ink-2)"}}>library 层全量手动</b>，每次都在这里决定。
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:22, flex:1, overflow:"hidden"}}>
        {/* 主区：选轴 + 勾子维度 */}
        <div style={{display:"flex", flexDirection:"column", gap:16, overflow:"auto"}}>
          {/* Axis picker */}
          <div>
            <window.SectionLabel>① 选择轴</window.SectionLabel>
            <div style={{marginTop:10, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8}}>
              {Object.entries(AXIS_SUB).map(([id,a])=>{
                const active = id===axis;
                return (
                  <button key={id} onClick={()=>{setAxis(id); setSelected([]);}} style={{
                    border:0, cursor:"pointer", padding:"12px 14px", borderRadius:7, textAlign:"left",
                    background: active ? "var(--paper)" : "var(--paper)",
                    boxShadow: active ? `inset 0 0 0 2px ${a.color}` : "inset 0 0 0 1px var(--line-2)",
                    display:"flex", flexDirection:"column", gap:4,
                  }}>
                    <div style={{display:"flex", alignItems:"center", gap:7}}>
                      <span style={{width:8, height:8, borderRadius:99, background:a.color}}/>
                      <span style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600}}>{a.label}</span>
                    </div>
                    <span style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)"}}>{a.subs.length} sub</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-dimension checklist */}
          <div>
            <window.SectionLabel>② 勾选要重算的子维度（可多选）</window.SectionLabel>
            <div style={{
              marginTop:10, display:"flex", flexDirection:"column", gap:5,
              border:"1px solid var(--line-2)", borderRadius:8, overflow:"hidden", background:"var(--paper)",
            }}>
              {axisMeta.subs.map((sub,i)=>{
                const on = selected.includes(sub.id);
                const cost = COST_TABLE[sub.cost];
                return (
                  <div key={sub.id} onClick={()=>toggle(sub.id)} style={{
                    display:"grid", gridTemplateColumns:"20px 1fr 100px 80px 80px", gap:14, alignItems:"center",
                    padding:"12px 16px", cursor:"pointer",
                    background: on ? "var(--accent-soft)" : "transparent",
                    borderTop: i===0 ? "none" : "1px solid var(--line-2)",
                  }}>
                    <div style={{
                      width:18, height:18, borderRadius:4,
                      background: on ? "var(--accent)" : "transparent",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
                      display:"flex", alignItems:"center", justifyContent:"center", color:"var(--paper)",
                    }}>
                      {on && <window.Icon name="check" size={11} stroke={2.5}/>}
                    </div>
                    <div>
                      <div style={{fontFamily:"var(--serif)", fontSize:14, fontWeight: on ? 600 : 500}}>{sub.label}</div>
                      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)", marginTop:3}}>
                        deps: {sub.depsOn.slice(0,2).join(" · ")}{sub.depsOn.length>2 && " …"}
                      </div>
                    </div>
                    <span style={{
                      fontFamily:"var(--mono)", fontSize:10.5, padding:"2px 8px", borderRadius:3,
                      background: sub.cost==="high" ? "var(--amber-soft)" : sub.cost==="medium" ? "var(--teal-soft)" : "var(--paper-2)",
                      color:"var(--ink-2)", justifySelf:"start",
                    }}>{sub.cost}</span>
                    <window.MonoMeta>{cost.tok}</window.MonoMeta>
                    <window.MonoMeta>{cost.time}</window.MonoMeta>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex", gap:8, marginTop:8}}>
              <button onClick={()=>setSelected(axisMeta.subs.map(s=>s.id))} style={linkBtn}>全选</button>
              <button onClick={()=>setSelected([])} style={linkBtn}>清空</button>
            </div>
          </div>
        </div>

        {/* 右侧：参数 + 预览 */}
        <aside style={{display:"flex", flexDirection:"column", gap:14, overflow:"auto"}}>
          {/* Scope */}
          <div style={cardBase}>
            <window.SectionLabel>③ 作用 scope</window.SectionLabel>
            <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:4}}>
              {[
                { id:"project", label:"项目层", auto:true,  sub:"当前项目内跨会议增量" },
                { id:"library", label:"库层",   auto:false, sub:"全库跨项目重扫 · 慢且贵" },
              ].map(s=>{
                const active = s.id===scope;
                return (
                  <button key={s.id} onClick={()=>setScope(s.id)} style={{
                    border:0, textAlign:"left", cursor:"pointer", padding:"10px 12px", borderRadius:5,
                    background: active ? "var(--paper-2)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "inset 0 0 0 1px var(--line-2)",
                  }}>
                    <div style={{display:"flex", alignItems:"center", gap:6}}>
                      <span style={{fontFamily:"var(--serif)", fontSize:13, fontWeight: active?600:500}}>{s.label}</span>
                      <window.Chip tone={s.auto?"accent":"ghost"} style={{padding:"1px 6px", fontSize:9.5}}>
                        {s.auto ? "auto · 默认自动增量" : "manual · 每次手动"}
                      </window.Chip>
                    </div>
                    <div style={{fontSize:11, color:"var(--ink-3)", marginTop:3}}>{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset */}
          <div style={cardBase}>
            <window.SectionLabel>④ Preset</window.SectionLabel>
            <div style={{marginTop:10, display:"flex", gap:4, background:"var(--paper-2)", padding:3, borderRadius:6}}>
              {["lite","standard","max"].map(p=>{
                const active = p===preset;
                return (
                  <button key={p} onClick={()=>setPreset(p)} style={{
                    flex:1, border:0, padding:"7px 6px", borderRadius:4, cursor:"pointer", fontSize:12,
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink-2)",
                    fontFamily:"var(--mono)", fontWeight: active ? 600 : 500,
                  }}>{p}</button>
                );
              })}
            </div>
            <div style={{fontSize:11.5, color:"var(--ink-3)", marginTop:8, lineHeight:1.5}}>
              {preset==="lite" && "只跑核心装饰器 · 快速刷新"}
              {preset==="standard" && "默认 · 案例锚定 + 校准 + 知识接地"}
              {preset==="max" && "全装饰器堆叠 · 成本 ×2.5"}
            </div>
          </div>

          {/* Estimate */}
          <div style={cardBase}>
            <window.SectionLabel>预估</window.SectionLabel>
            <div style={{
              marginTop:10, padding:"14px 12px", background:"var(--paper-2)", borderRadius:6,
              display:"grid", gridTemplateColumns:"1fr 1fr", gap:10,
            }}>
              <Stat label="子维度" v={`${selected.length} / ${axisMeta.subs.length}`}/>
              <Stat label="tokens (估)" v={`${total.toFixed(0)}k`}/>
              <Stat label="preset" v={preset}/>
              <Stat label="scope" v={scope}/>
            </div>
          </div>

          <div style={{display:"flex", gap:8, marginTop:"auto"}}>
            <button style={linkBtn}>取消</button>
            <button style={{
              flex:1, padding:"11px 18px", border:"1px solid var(--ink)", background:"var(--ink)",
              color:"var(--paper)", borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer",
              opacity: selected.length===0 ? 0.4 : 1,
            }} disabled={selected.length===0}>
              入队 · 开始重算 →
            </button>
          </div>
          <div style={{fontSize:10.5, color:"var(--ink-3)", textAlign:"center"}}>
            任务进入<a style={{color:"var(--accent)"}}>生成中心</a>后台执行，可继续其他操作
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 2) GenerationCenter — 独立的生成中心
// ─────────────────────────────────────────────────────────
const MOCK_RUNS = [
  { id:"run-237", state:"running", axis:"knowledge", subs:["mmodel","bias"],   preset:"standard", scope:"project", scopeLabel:"AI 基础设施 · Q2",
    started:"09:41:22", eta:"预计 1m 40s", pct:48, triggeredBy:"auto · 新增 1 场会议", cost:"~16k tok" },
  { id:"run-236", state:"queued",  axis:"people",    subs:["commit","silence"], preset:"standard", scope:"project", scopeLabel:"AI 基础设施 · Q2",
    started:"09:42:11", eta:"排队中 · 前面 1 个",   pct:0,  triggeredBy:"auto",          cost:"~10k tok" },
  { id:"run-235", state:"done",    axis:"people",    subs:["commit","role","voice"], preset:"standard", scope:"library", scopeLabel:"全库 48 meetings",
    started:"08:03:14", eta:"用时 4m 18s",            pct:100, triggeredBy:"manual · 陈汀", cost:"42k tok", version:"v14" },
  { id:"run-234", state:"done",    axis:"knowledge", subs:["mmodel"],           preset:"max",      scope:"library", scopeLabel:"全库 48 meetings",
    started:"昨天 22:11",eta:"用时 11m 04s",          pct:100, triggeredBy:"schedule · 月度", cost:"88k tok", version:"v8" },
  { id:"run-233", state:"failed",  axis:"projects",  subs:["decision"],         preset:"max",      scope:"library", scopeLabel:"全库 48 meetings",
    started:"昨天 21:02",eta:"失败 · evidence_anchored 未命中",  pct:34, triggeredBy:"manual", cost:"12k tok" },
  { id:"run-232", state:"done",    axis:"knowledge", subs:["mmodel","bias","counter"], preset:"standard", scope:"project", scopeLabel:"消费硬件 · H1",
    started:"2 天前",   eta:"用时 2m 50s",            pct:100, triggeredBy:"auto",          cost:"21k tok", version:"v12" },
];

const MOCK_VERSIONS = [
  { v:"v14", axis:"people · 承诺兑现",    when:"今天 08:03", preset:"standard", scope:"library", diff:"+3 verified · -1 failed · 1 new at-risk" },
  { v:"v13", axis:"people · 承诺兑现",    when:"昨天 07:45", preset:"standard", scope:"library", diff:"+2 verified · 0 failed" },
  { v:"v12", axis:"people · 承诺兑现",    when:"3 天前",     preset:"lite",     scope:"library", diff:"+1 verified · 1 failed" },
  { v:"v11", axis:"people · 承诺兑现",    when:"1 周前",     preset:"standard", scope:"library", diff:"初次全量" },
];

const MOCK_SCHEDULES = [
  { id:"s1", name:"每次会议上传后",          target:"project · 所有轴 · standard",  next:"auto · trigger",       on:true },
  { id:"s2", name:"每周一 09:00",             target:"project · 知识轴 · max",        next:"下周一 09:00",         on:true },
  { id:"s3", name:"每月 1 号 02:00",         target:"library · 全轴 · standard",     next:"05-01 02:00",          on:true },
  { id:"s4", name:"每季度 · 团队能力盘点",    target:"library · 知识轴 · max",        next:"2026-07-01",           on:false },
];

function GenerationCenter() {
  const [tab, setTab] = React.useState("queue"); // queue | versions | schedule
  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)", color:"var(--ink)",
      display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"var(--sans)",
    }}>
      <header style={{padding:"28px 36px 0", borderBottom:"1px solid var(--line-2)"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:14}}>
          <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:28, margin:0, letterSpacing:"-0.01em"}}>
            生成中心
          </h2>
          <window.MonoMeta>generation.center</window.MonoMeta>
        </div>
        <div style={{fontSize:13, color:"var(--ink-3)", marginTop:6, maxWidth:820, lineHeight:1.55}}>
          所有跨会议生成任务的统一入口。queue 看当前队列 · versions 对比历史版本 · schedule 配置定时任务。
        </div>

        <div style={{display:"flex", gap:2, marginTop:18, borderBottom:"1px solid transparent"}}>
          {[
            { id:"queue",    label:"队列 · Queue",        count:MOCK_RUNS.filter(r=>r.state!=="done"&&r.state!=="failed").length },
            { id:"versions", label:"历史版本 · Versions",  count:MOCK_VERSIONS.length },
            { id:"schedule", label:"定时 · Schedule",      count:MOCK_SCHEDULES.filter(s=>s.on).length },
          ].map(t=>{
            const active = t.id===tab;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                border:0, background:"transparent", padding:"10px 16px", cursor:"pointer",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                color: active ? "var(--ink)" : "var(--ink-3)", fontSize:13,
                fontWeight: active ? 600 : 500, fontFamily:"var(--sans)",
                display:"flex", alignItems:"center", gap:7,
              }}>
                {t.label}
                <window.MonoMeta style={{fontSize:9.5}}>{t.count}</window.MonoMeta>
              </button>
            );
          })}
        </div>
      </header>

      <div style={{flex:1, overflow:"auto", padding:"22px 36px 32px"}}>
        {tab==="queue"    && <QueueView/>}
        {tab==="versions" && <VersionsView/>}
        {tab==="schedule" && <ScheduleView/>}
      </div>
    </div>
  );
}

function QueueView(){
  return (
    <div>
      {/* Quick stats */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18}}>
        {[
          { l:"running", v:"1", c:"var(--teal)" },
          { l:"queued",  v:"1", c:"var(--amber)" },
          { l:"done · 24h", v:"7", c:"var(--accent)" },
          { l:"failed · 24h", v:"1", c:"oklch(0.55 0.16 25)" },
        ].map(s=>(
          <div key={s.l} style={{
            padding:"14px 16px", background:"var(--paper-2)", border:"1px solid var(--line-2)",
            borderRadius:6, display:"flex", flexDirection:"column", gap:4,
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:0.3}}>{s.l}</div>
            <div style={{fontFamily:"var(--serif)", fontSize:24, fontWeight:600, color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      <window.SectionLabel>所有任务 · 近 48 小时</window.SectionLabel>
      <div style={{marginTop:10, border:"1px solid var(--line-2)", borderRadius:8, overflow:"hidden", background:"var(--paper-2)"}}>
        {MOCK_RUNS.map((r,i)=>{
          const color = r.state==="running" ? "var(--teal)" : r.state==="done" ? "var(--accent)" : r.state==="failed" ? "oklch(0.55 0.16 25)" : "var(--amber)";
          const axisMeta = AXIS_SUB[r.axis];
          return (
            <div key={r.id} style={{
              padding:"14px 18px", display:"grid",
              gridTemplateColumns:"90px 1fr 180px 160px 180px 60px",
              gap:14, alignItems:"center",
              borderTop: i===0 ? "none" : "1px solid var(--line-2)",
              background: r.state==="running" ? "var(--teal-soft)" : "transparent",
            }}>
              <div style={{display:"flex", alignItems:"center", gap:6}}>
                <span style={{width:7, height:7, borderRadius:99, background:color, animation: r.state==="running" ? "blink 1.4s infinite" : "none"}}/>
                <style>{`@keyframes blink{50%{opacity:.3}}`}</style>
                <window.MonoMeta>{r.state}</window.MonoMeta>
              </div>
              <div>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span style={{width:8, height:8, borderRadius:99, background:axisMeta.color}}/>
                  <span style={{fontFamily:"var(--serif)", fontSize:14, fontWeight:600}}>{axisMeta.label}</span>
                  <span style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)"}}>
                    · {r.subs.map(s=>axisMeta.subs.find(x=>x.id===s)?.label).join(" / ")}
                  </span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:8, marginTop:4, fontSize:11, color:"var(--ink-3)"}}>
                  <window.MonoMeta>{r.id}</window.MonoMeta>
                  <span>·</span>
                  <span>{r.triggeredBy}</span>
                </div>
              </div>
              <div>
                <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-2)"}}>
                  {r.scope} · {r.preset}
                </div>
                <div style={{fontSize:11, color:"var(--ink-3)", marginTop:2}}>{r.scopeLabel}</div>
              </div>
              <div>
                <window.MonoMeta>{r.started}</window.MonoMeta>
                <div style={{fontSize:11, color:r.state==="failed"?"oklch(0.55 0.16 25)":"var(--ink-3)", marginTop:2}}>{r.eta}</div>
              </div>
              <div>
                {r.state==="running" || r.state==="queued" ? (
                  <div>
                    <div style={{height:3, background:"var(--line-2)", borderRadius:2, overflow:"hidden"}}>
                      <div style={{width:`${r.pct}%`, height:"100%", background:color}}/>
                    </div>
                    <div style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)", marginTop:4}}>
                      {r.pct}% · {r.cost}
                    </div>
                  </div>
                ) : (
                  <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)"}}>
                    {r.cost}{r.version && ` · ${r.version}`}
                  </div>
                )}
              </div>
              <button style={{
                border:"1px solid var(--line)", background:"var(--paper)", borderRadius:4,
                padding:"5px 9px", fontSize:11, cursor:"pointer", color:"var(--ink-2)",
              }}>
                {r.state==="running" ? "暂停" : r.state==="failed" ? "重试" : r.state==="queued" ? "取消" : "查看"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionsView(){
  const [sel, setSel] = React.useState(["v14","v13"]);
  return (
    <div style={{display:"grid", gridTemplateColumns:"340px 1fr", gap:22}}>
      {/* Version list */}
      <div>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:10}}>
          <window.SectionLabel>版本列表</window.SectionLabel>
          <span style={{fontSize:11, color:"var(--ink-3)"}}>勾选 2 个对比</span>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          {MOCK_VERSIONS.map(v=>{
            const on = sel.includes(v.v);
            return (
              <button key={v.v} onClick={()=>{
                setSel(prev => prev.includes(v.v) ? prev.filter(x=>x!==v.v) : (prev.length>=2 ? [prev[1], v.v] : [...prev, v.v]));
              }} style={{
                border:0, textAlign:"left", cursor:"pointer", padding:"12px 14px", borderRadius:6,
                background: on ? "var(--accent-soft)" : "var(--paper-2)",
                boxShadow: on ? "inset 0 0 0 1px var(--accent)" : "inset 0 0 0 1px var(--line-2)",
                display:"grid", gridTemplateColumns:"22px 1fr", gap:10, alignItems:"center",
              }}>
                <div style={{
                  width:20, height:20, borderRadius:4,
                  background: on ? "var(--accent)" : "transparent",
                  border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
                  display:"flex", alignItems:"center", justifyContent:"center", color:"var(--paper)",
                }}>
                  {on && <window.Icon name="check" size={11} stroke={2.5}/>}
                </div>
                <div>
                  <div style={{display:"flex", alignItems:"baseline", gap:8}}>
                    <span style={{fontFamily:"var(--mono)", fontSize:13, fontWeight:600}}>{v.v}</span>
                    <window.MonoMeta>{v.when}</window.MonoMeta>
                  </div>
                  <div style={{fontFamily:"var(--serif)", fontSize:13, marginTop:3}}>{v.axis}</div>
                  <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)", marginTop:3}}>
                    {v.preset} · {v.scope}
                  </div>
                  <div style={{fontSize:11, color:"var(--ink-2)", marginTop:5, lineHeight:1.5}}>{v.diff}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compare view */}
      <div>
        <window.SectionLabel>对比 · {sel.join("  ↔  ")}</window.SectionLabel>
        <div style={{
          marginTop:10, border:"1px solid var(--line-2)", borderRadius:8, overflow:"hidden",
          background:"var(--paper-2)",
        }}>
          <div style={{
            display:"grid", gridTemplateColumns:"1fr 1fr", gap:0, borderBottom:"1px solid var(--line-2)",
            background:"var(--paper)",
          }}>
            {sel.map((v,i)=>(
              <div key={v} style={{padding:"12px 16px", borderLeft: i===0 ? "none" : "1px solid var(--line-2)"}}>
                <div style={{fontFamily:"var(--mono)", fontSize:13, fontWeight:600}}>{v}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)", marginTop:2}}>
                  {MOCK_VERSIONS.find(x=>x.v===v)?.when}
                </div>
              </div>
            ))}
          </div>
          {[
            { k:"承诺 · 已兑现",      a:"14", b:"11",  d:"+3" },
            { k:"承诺 · 已违约",      a:"2",  b:"3",   d:"-1" },
            { k:"承诺 · 风险",        a:"5",  b:"4",   d:"+1" },
            { k:"新增 at-risk 人物",  a:"Wei Tan (0.56)",  b:"—",      d:"new" },
            { k:"整体置信度",         a:"0.72",           b:"0.69",   d:"+0.03" },
          ].map((row,i)=>(
            <div key={i} style={{
              display:"grid", gridTemplateColumns:"220px 1fr 1fr 80px", gap:0, alignItems:"center",
              padding:"12px 16px", borderTop:"1px solid var(--line-2)",
            }}>
              <div style={{fontFamily:"var(--serif)", fontSize:13, color:"var(--ink-2)"}}>{row.k}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:12.5, color:"var(--ink)"}}>{row.a}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:12.5, color:"var(--ink-3)", borderLeft:"1px solid var(--line-2)", paddingLeft:16}}>{row.b}</div>
              <div style={{
                fontFamily:"var(--mono)", fontSize:11.5, fontWeight:600, justifySelf:"end",
                padding:"2px 8px", borderRadius:3,
                background: row.d.startsWith("+") || row.d==="new" ? "var(--accent-soft)" : row.d.startsWith("-") ? "var(--teal-soft)" : "var(--paper)",
                color: row.d.startsWith("+") || row.d==="new" ? "oklch(0.3 0.1 40)" : row.d.startsWith("-") ? "oklch(0.3 0.08 200)" : "var(--ink-3)",
              }}>{row.d}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex", gap:8, marginTop:14}}>
          <button style={linkBtn}>回滚到 v13</button>
          <button style={linkBtn}>标记 v14 为基线</button>
          <button style={linkBtn}>导出 diff</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleView(){
  return (
    <div>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
        <window.SectionLabel>定时与触发规则</window.SectionLabel>
        <button style={{
          padding:"7px 14px", border:"1px solid var(--ink)", background:"var(--ink)",
          color:"var(--paper)", borderRadius:5, fontSize:12, cursor:"pointer", fontWeight:500,
          display:"flex", alignItems:"center", gap:6,
        }}>
          <window.Icon name="plus" size={12} stroke={2}/>
          新建规则
        </button>
      </div>
      <div style={{border:"1px solid var(--line-2)", borderRadius:8, overflow:"hidden", background:"var(--paper-2)"}}>
        {MOCK_SCHEDULES.map((s,i)=>(
          <div key={s.id} style={{
            display:"grid", gridTemplateColumns:"44px 1fr 1fr 180px 80px",
            gap:16, alignItems:"center", padding:"14px 18px",
            borderTop: i===0 ? "none" : "1px solid var(--line-2)",
          }}>
            <div style={{
              width:36, height:20, borderRadius:99,
              background: s.on ? "var(--accent)" : "var(--line)",
              position:"relative", cursor:"pointer", transition:".2s",
            }}>
              <div style={{
                position:"absolute", top:2, left: s.on ? 18 : 2,
                width:16, height:16, borderRadius:99, background:"var(--paper)",
                transition:".2s",
              }}/>
            </div>
            <div>
              <div style={{fontFamily:"var(--serif)", fontSize:14, fontWeight:600}}>{s.name}</div>
              <window.MonoMeta>{s.id}</window.MonoMeta>
            </div>
            <div style={{fontFamily:"var(--mono)", fontSize:11.5, color:"var(--ink-2)"}}>{s.target}</div>
            <div>
              <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)"}}>NEXT</div>
              <div style={{fontSize:12.5, color:"var(--ink-2)"}}>{s.next}</div>
            </div>
            <button style={{
              border:"1px solid var(--line)", background:"var(--paper)", borderRadius:4,
              padding:"5px 9px", fontSize:11, cursor:"pointer", color:"var(--ink-2)",
            }}>编辑</button>
          </div>
        ))}
      </div>

      <div style={{
        marginTop:22, padding:"18px 22px", background:"var(--amber-soft)",
        border:"1px solid oklch(0.85 0.08 75)", borderRadius:8,
      }}>
        <window.SectionLabel>默认触发策略</window.SectionLabel>
        <div style={{marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
          {[
            { k:"project 层", v:"自动增量", sub:"每次新会议上传后自动触发；可在这里关闭" },
            { k:"library 层", v:"手动为主", sub:"默认不自动 · 通过按钮或月度定时任务触发" },
          ].map((r,i)=>(
            <div key={i}>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontFamily:"var(--serif)", fontSize:14, fontWeight:600}}>{r.k}</span>
                <window.Chip tone={r.v==="自动增量"?"accent":"ghost"}>{r.v}</window.Chip>
              </div>
              <div style={{fontSize:12, color:"var(--ink-2)", marginTop:5, lineHeight:1.5}}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({label, v}){
  return (
    <div>
      <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:0.4}}>{label}</div>
      <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600, marginTop:2}}>{v}</div>
    </div>
  );
}

const cardBase = {
  background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8,
  padding:"14px 16px",
};
const linkBtn = {
  padding:"6px 12px", border:"1px solid var(--line)", background:"var(--paper)",
  color:"var(--ink-2)", borderRadius:4, fontSize:11.5, cursor:"pointer",
};

Object.assign(window, { AxisRegeneratePanel, GenerationCenter });
