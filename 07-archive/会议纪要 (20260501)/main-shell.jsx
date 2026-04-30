// main-shell.jsx — 应用主壳 · 三 tab: 今天 / 库 / 轴

// ─────────────────────────────────────────────────────────
// Scope switcher — 定义"看的范围"
// ─────────────────────────────────────────────────────────
const SCOPES = {
  all:      { id:"all",     label:"全库",      kind:"LIBRARY",  meta:"48 meetings · 14 projects · 9 people" },
  project:  { id:"project", label:"项目",      kind:"PROJECT",
    instances:[
      { id:"p-ai-q2",   label:"AI 基础设施 · Q2 加配",   meta:"11 meetings · 42 days" },
      { id:"p-hw-h1",   label:"消费硬件 · 2026 H1",     meta:"8 meetings · 88 days" },
      { id:"p-ic",      label:"投委会 · 周例会",         meta:"14 meetings · 14 weeks" },
    ]
  },
  client:   { id:"client",  label:"客户",      kind:"CLIENT",
    instances:[
      { id:"c-lpA",     label:"远翎资本 LP-A",           meta:"6 meetings" },
      { id:"c-lpB",     label:"鼎蓝家办 LP-B",           meta:"4 meetings" },
    ]
  },
  topic:    { id:"topic",   label:"主题",      kind:"TOPIC",
    instances:[
      { id:"t-infer",   label:"推理层加码",               meta:"9 meetings · 跨 3 项目" },
      { id:"t-lp-comm", label:"LP 沟通节奏",              meta:"7 meetings · 跨 2 客户" },
    ]
  },
};

const ScopeContext = React.createContext(null);

function MainShell() {
  const [tab, setTab] = React.useState("today");
  const [scopeKind, setScopeKind] = React.useState("all");
  const [scopeInst, setScopeInst] = React.useState({
    project:"p-ai-q2", client:"c-lpA", topic:"t-infer",
  });

  const scope = SCOPES[scopeKind];
  const currentInst = scope.instances?.find(x=>x.id===scopeInst[scopeKind]);
  const scopeSummary = scopeKind==="all"
    ? scope
    : { ...scope, label: currentInst?.label, meta: currentInst?.meta };

  const tabs = [
    { id:"today", label:"今天",  sub:"今日待看的会议与未决事项" },
    { id:"lib",   label:"库",    sub:"所有会议纪要，按分组维度浏览" },
    { id:"axes",  label:"轴",    sub:"人物 / 项目 / 知识 / 会议本身" },
  ];
  return (
    <ScopeContext.Provider value={scopeSummary}>
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)", color:"var(--ink)",
      fontFamily:"var(--sans)", display:"flex", overflow:"hidden",
    }}>
      {/* Left rail */}
      <aside style={{
        width:244, flexShrink:0, borderRight:"1px solid var(--line-2)",
        padding:"22px 16px", display:"flex", flexDirection:"column", gap:20,
        background:"var(--paper-2)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <div style={{
            width:26, height:26, borderRadius:6, background:"var(--ink)",
            color:"var(--paper)", display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"var(--serif)", fontStyle:"italic", fontSize:15, fontWeight:600,
          }}>M</div>
          <div>
            <div style={{fontWeight:600, fontSize:14}}>Minutes</div>
            <div style={{fontSize:10, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>v0.4 · paper.morning</div>
          </div>
        </div>

        <div>
          <window.SectionLabel>Navigation · 做什么</window.SectionLabel>
          <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:2}}>
            {tabs.map(t=>{
              const active = t.id===tab;
              return (
                <button key={t.id} onClick={()=>setTab(t.id)} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                  border:0, borderRadius:6, cursor:"pointer", textAlign:"left",
                  background: active ? "var(--paper)" : "transparent",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.05), inset 0 0 0 1px var(--line-2)" : "none",
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  fontFamily:"var(--serif)", fontSize:15, fontWeight: active? 600 : 450,
                }}>
                  <span style={{
                    width:6, height:6, borderRadius:99,
                    background: active ? "var(--accent)" : "var(--line)",
                  }}/>
                  {t.label}
                  <window.MonoMeta style={{marginLeft:"auto", fontSize:9.5}}>
                    {t.id==="today" && "3"}
                    {t.id==="lib" && "48"}
                    {t.id==="axes" && "4"}
                  </window.MonoMeta>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scope switcher — 只在「轴」tab 下可用 */}
        <ScopeSwitcher
          scopeKind={scopeKind}
          scopeInst={scopeInst}
          currentInst={currentInst}
          onChangeKind={setScopeKind}
          onChangeInst={(kind, id)=>setScopeInst(prev=>({...prev, [kind]:id}))}
          enabled={tab==="axes"}
          currentTab={tab}
        />

        <div>
          <window.SectionLabel>快捷</window.SectionLabel>
          <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:4}}>
            {["新建会议","绑定目录","导入 Zoom"].map(x=>(
              <button key={x} style={{
                border:0, background:"transparent", textAlign:"left",
                padding:"7px 10px", borderRadius:5, fontSize:12.5,
                color:"var(--ink-2)", cursor:"pointer",
                display:"flex", alignItems:"center", gap:8,
              }}>
                <window.Icon name="plus" size={12}/> {x}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginTop:"auto", fontSize:10.5, color:"var(--ink-3)", lineHeight:1.6}}>
          <div style={{fontFamily:"var(--mono)"}}>preset: standard</div>
          <div>3 experts · 知识锚定 on</div>
        </div>
      </aside>

      {/* Main area */}
      <main style={{flex:1, overflow:"auto"}}>
        {tab==="today" && <TodayPane />}
        {tab==="lib"   && <LibraryPaneMini />}
        {tab==="axes"  && <AxesPane />}
      </main>
    </div>
    </ScopeContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Scope switcher UI
// ─────────────────────────────────────────────────────────
function ScopeSwitcher({ scopeKind, scopeInst, currentInst, onChangeKind, onChangeInst, enabled, currentTab }) {
  const kinds = [
    { id:"all",     label:"全库",   kind:"LIBRARY" },
    { id:"project", label:"项目",   kind:"PROJECT" },
    { id:"client",  label:"客户",   kind:"CLIENT"  },
    { id:"topic",   label:"主题",   kind:"TOPIC"   },
  ];
  const scope = SCOPES[scopeKind];
  const disabled = !enabled;
  const reasonByTab = {
    today: "「今天」聚焦今日未决事项，不受 scope 影响",
    lib:   "「库」内已有分组维度 (项目/客户/主题) 自带分组切换",
  };
  return (
    <div style={{
      opacity: disabled ? 0.45 : 1,
      pointerEvents: disabled ? "none" : "auto",
      transition:"opacity .2s",
    }}>
      <div style={{display:"flex", alignItems:"center", gap:6}}>
        <window.SectionLabel>作用域 · scope</window.SectionLabel>
        {disabled && (
          <span style={{
            fontFamily:"var(--mono)", fontSize:8.5, letterSpacing:0.4,
            padding:"1px 5px", borderRadius:2, background:"var(--paper-3)",
            color:"var(--ink-3)", textTransform:"uppercase",
          }}>dim</span>
        )}
      </div>
      {/* Level 1: kind */}
      <div style={{
        marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:3,
        background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:6, padding:3,
      }}>
        {kinds.map(k=>{
          const active = k.id===scopeKind;
          return (
            <button key={k.id} onClick={()=>onChangeKind(k.id)} style={{
              border:0, padding:"6px 4px", borderRadius:4, cursor:"pointer",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-2)",
              fontSize:11.5, fontWeight: active ? 600 : 500, fontFamily:"var(--sans)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            }}>
              <span style={{
                fontFamily:"var(--mono)", fontSize:8.5, opacity:.7, letterSpacing:0.4,
              }}>{k.kind.slice(0,3)}</span>
              {k.label}
            </button>
          );
        })}
      </div>

      {/* Level 2: instance (or summary) */}
      <div style={{marginTop:6}}>
        {scopeKind==="all" ? (
          <div style={{
            padding:"9px 11px", background:"var(--paper)", border:"1px solid var(--line-2)",
            borderRadius:5, fontSize:11.5, color:"var(--ink-3)", lineHeight:1.5,
          }}>
            <div style={{fontFamily:"var(--serif)", fontSize:13, color:"var(--ink)", fontWeight:500}}>
              所有会议
            </div>
            <div style={{fontFamily:"var(--mono)", fontSize:10, marginTop:2}}>
              48 meetings · 14 projects
            </div>
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:3}}>
            {scope.instances.map(inst=>{
              const active = scopeInst[scopeKind]===inst.id;
              return (
                <button key={inst.id}
                  onClick={()=>onChangeInst(scopeKind, inst.id)}
                  style={{
                    border:0, background: active ? "var(--paper)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "inset 0 0 0 1px var(--line-2)",
                    textAlign:"left", padding:"8px 10px", borderRadius:5, cursor:"pointer",
                    display:"flex", flexDirection:"column", gap:2,
                  }}>
                  <span style={{
                    fontFamily:"var(--serif)", fontSize:12.5, fontWeight: active ? 600 : 500,
                    color:"var(--ink)",
                  }}>{inst.label}</span>
                  <span style={{fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-3)"}}>
                    {inst.meta}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hint — 说明 scope 与 nav 的关系 */}
      <div style={{
        marginTop:8, padding:"7px 10px",
        background: disabled ? "var(--paper-3)" : "var(--accent-soft)",
        borderRadius:4,
        fontSize:10.5, color:"var(--ink-2)", lineHeight:1.5,
      }}>
        {disabled
          ? (reasonByTab[currentTab] || "切到「轴」tab 启用")
          : "轴视图按此 scope 重新投射数据"}
      </div>
    </div>
  );
}

function TodayPane() {
  return (
    <div style={{padding:"40px 48px 60px", maxWidth:1100}}>
      <div style={{
        fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)", letterSpacing:"0.14em",
        textTransform:"uppercase",
      }}>2026 · 04 · 11 · 星期六 · 09:42</div>
      <h1 style={{
        fontFamily:"var(--serif)", fontSize:40, fontWeight:500,
        letterSpacing:"-0.02em", margin:"8px 0 28px", lineHeight:1.12,
      }}>
        今天，3 件事值得你的注意。
      </h1>

      {[
        { kind:"new", title:"昨晚的「2026 Q2 AI 基础设施策略评审」已完成解析",
          sub:"标记出 3 条张力 · 3 条信念更新 · 2 条分歧 · 14 个 warm intro 数据点",
          meta:"M-2026-04-11 · 118 分钟 · 3 experts · 98 秒完成" },
        { kind:"due", title:"AS-04 「LP 对 6000 万不会反弹」今天需要验证",
          sub:"证据等级 D · 置信度 0.55 · 关联决策 D-07（3 天前刚作出）",
          meta:"负责：陈汀 · 已逾期 0 天" },
        { kind:"drift", title:"Wei Tan 的「训练层规模效应」信念 14 天内出现明显松动",
          sub:"从 0.78 降至 0.56 · 触发点：沈岚展示的客户报价曲线",
          meta:"6 次会议的纵向观察 · 建议下次会议定向追问" },
      ].map((it,i)=>(
        <article key={i} style={{
          background:"var(--paper-2)", border:"1px solid var(--line-2)",
          borderLeft: `2px solid ${it.kind==="new"?"var(--accent)":it.kind==="due"?"var(--amber)":"var(--teal)"}`,
          borderRadius:4, padding:"22px 26px", marginBottom:12,
          display:"grid", gridTemplateColumns:"1fr auto", gap:20, alignItems:"center",
        }}>
          <div>
            <div style={{
              display:"flex", alignItems:"center", gap:8, marginBottom:8,
              fontFamily:"var(--mono)", fontSize:10.5, letterSpacing:0.3, color:"var(--ink-3)",
              textTransform:"uppercase",
            }}>
              <window.Dot color={it.kind==="new"?"var(--accent)":it.kind==="due"?"var(--amber)":"var(--teal)"} />
              {it.kind==="new"?"New · 新解析":it.kind==="due"?"Due · 待验证":"Drift · 信念漂移"}
            </div>
            <h2 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 8px", letterSpacing:"-0.005em"}}>
              {it.title}
            </h2>
            <p style={{fontSize:13.5, color:"var(--ink-2)", margin:"0 0 8px", lineHeight:1.55}}>{it.sub}</p>
            <window.MonoMeta>{it.meta}</window.MonoMeta>
          </div>
          <button style={{
            padding:"8px 14px", border:"1px solid var(--line)", background:"var(--paper)",
            borderRadius:5, cursor:"pointer", fontSize:12.5, color:"var(--ink)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            打开 <window.Icon name="arrow" size={12}/>
          </button>
        </article>
      ))}
    </div>
  );
}

function LibraryPaneMini() {
  return (
    <div style={{padding:"40px 48px 60px"}}>
      <h1 style={{fontFamily:"var(--serif)", fontSize:32, fontWeight:500, margin:"0 0 6px", letterSpacing:"-0.015em"}}>
        会议纪要库
      </h1>
      <p style={{color:"var(--ink-2)", margin:"0 0 28px", fontSize:14}}>
        48 场会议 · 按项目 / 客户 / 主题 三种分组维度切换。跳转至「库」完整视图。
      </p>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, maxWidth:1000}}>
        {[
          { t:"AI 基础设施 · Q2 加配", n:11, c:"var(--accent)" },
          { t:"消费硬件 · 2026 H1", n:8, c:"var(--teal)" },
          { t:"投委会 · 周例会", n:14, c:"var(--amber)" },
        ].map((g,i)=>(
          <div key={i} style={{
            background:"var(--paper-2)", border:"1px solid var(--line-2)", borderLeft:`2px solid ${g.c}`,
            borderRadius:4, padding:"18px 20px",
          }}>
            <window.MonoMeta>PROJECT · {g.n} meetings</window.MonoMeta>
            <div style={{fontFamily:"var(--serif)", fontSize:16, fontWeight:500, marginTop:6}}>{g.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AxesPane() {
  const scope = React.useContext(ScopeContext);
  return (
    <div style={{padding:"40px 48px 60px"}}>
      {/* Scope banner */}
      <div style={{
        display:"inline-flex", alignItems:"center", gap:10, padding:"8px 14px",
        background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:99,
        marginBottom:18,
      }}>
        <span style={{
          fontFamily:"var(--mono)", fontSize:9.5, letterSpacing:0.5, textTransform:"uppercase",
          color:"var(--ink-3)", padding:"2px 7px", background:"var(--paper)", borderRadius:3,
          border:"1px solid var(--line-2)",
        }}>{scope.kind}</span>
        <span style={{fontFamily:"var(--serif)", fontSize:13, fontWeight:600, color:"var(--ink)"}}>
          {scope.label}
        </span>
        <span style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)"}}>
          {scope.meta}
        </span>
      </div>
      <h1 style={{fontFamily:"var(--serif)", fontSize:32, fontWeight:500, margin:"0 0 6px", letterSpacing:"-0.015em"}}>
        轴视图
      </h1>
      <p style={{color:"var(--ink-2)", margin:"0 0 28px", fontSize:14, maxWidth:720}}>
        同一批会议数据的四种投射 · 数据范围受左侧 scope 控制。切换作用域即可重新投射。
      </p>
      <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:14, maxWidth:920}}>
        {[
          { t:"人物轴", sub:"承诺兑现 · 角色演化 · 发言质量 · 沉默信号", icon:"users" },
          { t:"项目轴", sub:"决议溯源 · 假设清单 · 开放问题 · 风险热度", icon:"layers" },
          { t:"知识轴", sub:"可复用判断 · 心智模型激活 · 认知偏误 · 反事实", icon:"book" },
          { t:"会议本身", sub:"质量分 · 必要性评估 · 情绪热力图", icon:"ledger" },
        ].map((x,i)=>(
          <div key={i} style={{
            background:"var(--paper-2)", border:"1px solid var(--line-2)",
            borderRadius:4, padding:"22px 24px", cursor:"pointer",
          }}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <window.Icon name={x.icon} size={18} style={{color:"var(--accent)"}}/>
              <span style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:600}}>{x.t}</span>
            </div>
            <div style={{fontSize:13, color:"var(--ink-2)", marginTop:8, lineHeight:1.55}}>{x.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Meeting detail hub — wraps the three variants with a switcher header
function MeetingHub() {
  const [view, setView] = React.useState("editorial");
  const views = [
    { id:"editorial", label:"A · Editorial",  sub:"文档精读" },
    { id:"workbench", label:"B · Workbench",  sub:"三栏工作台" },
    { id:"threads",   label:"C · Threads",    sub:"人物编织" },
  ];
  return (
    <div style={{width:"100%", height:"100%", display:"flex", flexDirection:"column", background:"var(--paper)", overflow:"hidden"}}>
      <header style={{
        display:"flex", alignItems:"center", gap:16,
        padding:"0 22px", height:48, borderBottom:"1px solid var(--line)",
        background:"var(--paper-2)", flexShrink:0,
      }}>
        <button style={{
          display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
          border:"1px solid var(--line)", borderRadius:5, background:"var(--paper)",
          fontSize:12, color:"var(--ink-2)", cursor:"pointer",
        }}>
          <span style={{transform:"rotate(180deg)"}}><window.Icon name="arrow" size={12}/></span>
          返回库
        </button>
        <div style={{
          fontFamily:"var(--serif)", fontSize:15, fontWeight:600, letterSpacing:"-0.005em",
        }}>{window.MEETING.title}</div>
        <window.MonoMeta>{window.MEETING.id}</window.MonoMeta>
        <div style={{
          marginLeft:"auto", display:"flex", alignItems:"center", gap:4,
          background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:6, padding:2,
        }}>
          {views.map(v=>{
            const active = v.id===view;
            return (
              <button key={v.id} onClick={()=>setView(v.id)} style={{
                border:0, padding:"5px 12px", borderRadius:4,
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--paper)" : "var(--ink-2)",
                fontSize:12, fontWeight: active ? 600 : 500, cursor:"pointer",
                fontFamily:"var(--sans)",
              }}>
                {v.label}
              </button>
            );
          })}
        </div>
        <button style={{
          padding:"5px 12px", border:"1px solid var(--line)", background:"var(--paper)",
          borderRadius:5, fontSize:12, cursor:"pointer", color:"var(--ink-2)",
        }}>导出</button>
      </header>
      <div style={{flex:1, minHeight:0}}>
        {view==="editorial" && <window.VariantEditorial />}
        {view==="workbench" && <window.VariantWorkbench />}
        {view==="threads"   && <window.VariantThreads />}
      </div>
    </div>
  );
}

Object.assign(window, { MainShell, MeetingHub, ScopeContext, SCOPES, ScopePill });

// ─────────────────────────────────────────────────────────
// ScopePill · compact scope 指示 + 切换（用于轴视图 header）
// 读 ScopeContext；若无 provider，使用 local 默认（all）
// ─────────────────────────────────────────────────────────
function ScopePill() {
  const ctx = React.useContext(ScopeContext);
  const [open, setOpen] = React.useState(false);
  const [localKind, setLocalKind] = React.useState("all");
  const [localInst, setLocalInst] = React.useState({
    project:"p-ai-q2", client:"c-lpA", topic:"t-infer",
  });
  const [toast, setToast] = React.useState(null); // { kind: 'auto'|'manual', label }
  const toastTimer = React.useRef(null);

  // 决定当前 scope 显示内容
  const scope = SCOPES[localKind];
  const inst = scope.instances?.find(x=>x.id===localInst[localKind]);
  const current = ctx || (localKind==="all" ? scope : { ...scope, label: inst?.label, meta: inst?.meta });

  // 切换 scope 时弹 toast
  function fireToast(nextKind, nextLabel){
    const isAuto = nextKind==="project";
    const isLibrary = nextKind==="all";
    const toastData = isAuto
      ? { kind:"auto", label: nextLabel, msg: "后台已入队增量", meta: "run-240 · queued · ~45s" }
      : isLibrary
      ? { kind:"manual-lib", label: nextLabel, msg: "全库重算需手动触发", meta: "预计 18 min · ~320k tokens · 上次 14 天前" }
      : { kind:"manual", label: nextLabel, msg: "此 scope 需手动触发重算", meta: "数据显示上一次 run 的结果" };
    setToast(toastData);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast(null), 6000);
  }

  React.useEffect(()=>()=>clearTimeout(toastTimer.current), []);

  const kindTone = {
    LIBRARY:"var(--ink)",
    PROJECT:"var(--teal)",
    CLIENT: "var(--accent)",
    TOPIC:  "var(--amber)",
  }[current.kind] || "var(--ink)";

  const kinds = [
    { id:"all",     label:"全库",   kind:"LIBRARY" },
    { id:"project", label:"项目",   kind:"PROJECT" },
    { id:"client",  label:"客户",   kind:"CLIENT"  },
    { id:"topic",   label:"主题",   kind:"TOPIC"   },
  ];

  return (
    <div style={{position:"relative"}}>
      {toast && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", right:0, zIndex:38,
          minWidth:320, maxWidth:380,
          background:"var(--paper)", border:"1px solid var(--line)", borderRadius:8,
          boxShadow:"0 10px 28px -10px rgba(0,0,0,0.18)",
          padding:"12px 14px",
          display:"flex", gap:12, alignItems:"flex-start",
          fontFamily:"var(--sans)",
          animation:"scope-toast-in 240ms ease",
        }}>
          <style>{`@keyframes scope-toast-in { from{transform:translateY(-6px); opacity:0;} to{transform:none; opacity:1;} }`}</style>
          <div style={{
            width:26, height:26, borderRadius:5, flexShrink:0,
            background: toast.kind==="auto" ? "var(--teal-soft)" : toast.kind==="manual-lib" ? "var(--amber-soft)" : "var(--paper-2)",
            border:`1px solid ${toast.kind==="auto" ? "var(--teal)" : toast.kind==="manual-lib" ? "var(--amber)" : "var(--line)"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color: toast.kind==="auto" ? "var(--teal)" : toast.kind==="manual-lib" ? "var(--amber)" : "var(--ink-2)",
            fontSize:13,
          }}>
            {toast.kind==="auto" ? "↻" : "⏸"}
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:12.5, fontWeight:600, color:"var(--ink)", letterSpacing:"-0.003em"}}>
              已切到「{toast.label}」 · {toast.msg}
            </div>
            <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-3)", marginTop:3}}>
              {toast.meta}
            </div>
            {toast.kind !== "auto" && (
              <button
                onClick={()=>setToast(null)}
                style={{
                  marginTop:8, padding:"5px 10px", fontSize:11,
                  border:"1px solid var(--ink)", background:"var(--ink)", color:"var(--paper)",
                  borderRadius:4, cursor:"pointer", fontFamily:"var(--sans)",
                }}
              >去生成中心手动触发 →</button>
            )}
          </div>
          <button onClick={()=>setToast(null)} style={{
            border:0, background:"transparent", color:"var(--ink-4)", cursor:"pointer",
            padding:0, lineHeight:1, fontSize:14,
          }}>×</button>
        </div>
      )}
      <button
        onClick={()=>setOpen(o=>!o)}
        title="当前作用域 · 点击切换"
        style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"5px 10px 5px 8px", border:"1px solid var(--line)",
          background:"var(--paper)", borderRadius:999, cursor:"pointer",
          fontFamily:"var(--sans)", color:"var(--ink-2)", fontSize:11.5,
        }}
      >
        <span style={{
          fontFamily:"var(--mono)", fontSize:9.5, letterSpacing:0.4,
          padding:"2px 6px", borderRadius:3, background:kindTone, color:"var(--paper)",
        }}>{current.kind}</span>
        <span style={{fontWeight:600, color:"var(--ink)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
          {current.label}
        </span>
        <span style={{color:"var(--ink-4)", fontSize:10.5}}>{current.meta}</span>
        <window.Icon name="chevron" size={11} style={{color:"var(--ink-4)", transform: open?"rotate(180deg)":"none", transition:"transform 160ms"}}/>
      </button>

      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{
            position:"fixed", inset:0, zIndex:40,
          }}/>
          <div style={{
            position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:41,
            background:"var(--paper)", border:"1px solid var(--line)", borderRadius:8,
            boxShadow:"0 12px 32px -12px rgba(0,0,0,0.18)",
            minWidth:320, padding:10, fontFamily:"var(--sans)",
          }}>
            <div style={{
              fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)",
              letterSpacing:0.4, textTransform:"uppercase", padding:"4px 6px 8px",
            }}>切换作用域 · 同一批数据的不同投射</div>

            {/* kind picker */}
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:4}}>
              {kinds.map(k=>{
                const active = k.id===localKind;
                const tone = { LIBRARY:"var(--ink)", PROJECT:"var(--teal)", CLIENT:"var(--accent)", TOPIC:"var(--amber)" }[k.kind];
                return (
                  <button key={k.id} onClick={()=>{ setLocalKind(k.id); fireToast(k.id, k.label); setOpen(false); }} style={{
                    display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
                    border: active ? `1px solid ${tone}` : "1px solid var(--line-2)",
                    background: active ? "var(--paper-2)" : "transparent",
                    borderRadius:5, cursor:"pointer", fontFamily:"var(--sans)",
                    textAlign:"left",
                  }}>
                    <span style={{width:6, height:6, borderRadius:99, background:tone}}/>
                    <span style={{fontSize:12.5, fontWeight: active?600:500, color:"var(--ink)"}}>{k.label}</span>
                    <span style={{marginLeft:"auto", fontFamily:"var(--mono)", fontSize:9, color:"var(--ink-4)"}}>{k.kind}</span>
                  </button>
                );
              })}
            </div>

            {/* instance picker（当非全库时） */}
            {localKind!=="all" && SCOPES[localKind].instances && (
              <div style={{marginTop:10, borderTop:"1px solid var(--line-2)", paddingTop:10}}>
                <div style={{
                  fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)",
                  letterSpacing:0.4, textTransform:"uppercase", padding:"0 6px 6px",
                }}>选择{SCOPES[localKind].label}</div>
                <div style={{display:"flex", flexDirection:"column", gap:2}}>
                  {SCOPES[localKind].instances.map(x=>{
                    const active = localInst[localKind]===x.id;
                    return (
                      <button key={x.id} onClick={()=>{ setLocalInst(s=>({...s, [localKind]:x.id})); fireToast(localKind, x.label); setOpen(false); }} style={{
                        display:"flex", alignItems:"center", gap:10, padding:"7px 10px",
                        border:0, borderRadius:4, cursor:"pointer",
                        background: active ? "var(--paper-2)" : "transparent",
                        textAlign:"left", fontFamily:"var(--sans)",
                      }}>
                        <span style={{
                          width:12, height:12, borderRadius:99, flexShrink:0,
                          border: active ? `3.5px solid ${kindTone}` : "1px solid var(--line)",
                        }}/>
                        <div style={{minWidth:0, flex:1}}>
                          <div style={{fontSize:12.5, fontWeight: active?600:500, color:"var(--ink)"}}>{x.label}</div>
                          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)", marginTop:1}}>{x.meta}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{
              marginTop:10, padding:"8px 10px", background:"var(--paper-2)",
              borderRadius:5, fontSize:10.5, color:"var(--ink-3)", lineHeight:1.55,
            }}>
              <b style={{color:"var(--ink-2)"}}>提示</b>：切换作用域会重新计算此轴 —— project 自动 · library 手动触发。当前 run-237 基于 <i>全库</i>。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { ScopePill });

// ─────────────────────────────────────────────────────────
// RunBadge · 轴 header 右上 · 点击跳生成中心 versions · hover 展开 popover
// ─────────────────────────────────────────────────────────
function RunBadge({ run="run-237", version="v14", time="08:03", axis }) {
  const [open, setOpen] = React.useState(false);
  const hoverTimer = React.useRef(null);

  function mouseEnter(){ clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(()=>setOpen(true), 180); }
  function mouseLeave(){ clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(()=>setOpen(false), 260); }
  React.useEffect(()=>()=>clearTimeout(hoverTimer.current), []);

  return (
    <div
      style={{position:"relative"}}
      onMouseEnter={mouseEnter}
      onMouseLeave={mouseLeave}
    >
      <button
        title="点击进入生成中心 · 查看此轴的 run 详情与历史版本"
        style={{
          display:"flex", alignItems:"center", gap:6,
          padding:"4px 8px", border:"1px solid var(--line-2)",
          background:"var(--paper)", borderRadius:4, cursor:"pointer",
          fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)",
          letterSpacing:0.3,
        }}
      >
        <span style={{
          width:6, height:6, borderRadius:99, background:"var(--teal)",
          boxShadow:"0 0 0 2px var(--teal-soft)",
        }}/>
        {version} · {time}
      </button>

      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:39,
          minWidth:300, background:"var(--paper)", border:"1px solid var(--line)",
          borderRadius:8, boxShadow:"0 12px 28px -12px rgba(0,0,0,0.2)",
          padding:"14px 16px", fontFamily:"var(--sans)",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
            <div style={{
              fontFamily:"var(--mono)", fontSize:10, letterSpacing:0.4,
              padding:"2px 7px", borderRadius:3, background:"var(--ink)", color:"var(--paper)",
            }}>{run}</div>
            <div style={{fontFamily:"var(--serif)", fontSize:14, fontWeight:600, letterSpacing:"-0.003em"}}>
              {axis || "人物轴"} · {version}
            </div>
          </div>

          <div style={{
            display:"grid", gridTemplateColumns:"auto 1fr", gap:"6px 12px",
            fontSize:11.5, lineHeight:1.55,
          }}>
            <span style={{color:"var(--ink-4)", fontFamily:"var(--mono)", fontSize:10}}>strategy</span>
            <span style={{color:"var(--ink)"}}>debate · 3 experts</span>
            <span style={{color:"var(--ink-4)", fontFamily:"var(--mono)", fontSize:10}}>preset</span>
            <span style={{color:"var(--ink)"}}>standard</span>
            <span style={{color:"var(--ink-4)", fontFamily:"var(--mono)", fontSize:10}}>scope</span>
            <span style={{color:"var(--ink)"}}>LIBRARY · 全库 48 meetings</span>
            <span style={{color:"var(--ink-4)", fontFamily:"var(--mono)", fontSize:10}}>cost</span>
            <span style={{color:"var(--ink)"}}>49,622 tokens · 2m 08s</span>
          </div>

          <div style={{
            marginTop:12, paddingTop:10, borderTop:"1px solid var(--line-2)",
            display:"flex", flexDirection:"column", gap:6, fontSize:11.5,
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)", letterSpacing:0.4, textTransform:"uppercase"}}>
              VS 上版 v13
            </div>
            <div style={{display:"flex", gap:10, color:"var(--ink-2)"}}>
              <span>承诺 <b style={{color:"var(--teal)"}}>+3</b></span>
              <span>at-risk <b style={{color:"var(--accent)"}}>+1</b></span>
              <span>置信度 <b style={{color:"var(--ink)"}}>0.78 → 0.81</b></span>
            </div>
          </div>

          <div style={{marginTop:12, display:"flex", gap:6}}>
            <button style={{
              flex:1, padding:"7px 10px", fontSize:11.5, fontFamily:"var(--sans)",
              border:"1px solid var(--ink)", background:"var(--ink)", color:"var(--paper)",
              borderRadius:4, cursor:"pointer",
            }}>生成中心 · versions →</button>
            <button style={{
              padding:"7px 10px", fontSize:11.5, fontFamily:"var(--sans)",
              border:"1px solid var(--line)", background:"var(--paper)", color:"var(--ink-2)",
              borderRadius:4, cursor:"pointer",
            }}>diff v13</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RunBadge });

// ─────────────────────────────────────────────────────────
// CrossAxisLink · 相关轴跳转 · 单条跨轴线索
// ─────────────────────────────────────────────────────────
function CrossAxisLink({ axis }) {
  const [open, setOpen] = React.useState(false);

  // 每条轴有 2-3 条"相关"线索（演示数据）
  const relatedByAxis = {
    "人物":   [
      { targetAxis:"项目", targetLabel:"项目轴 · 风险热度", detail:"张总 3 个挂名项目全部亮红灯", count:3 },
      { targetAxis:"知识", targetLabel:"知识轴 · 认知偏差",  detail:"其发言触发 4 次 anchoring bias", count:4 },
      { targetAxis:"纵向", targetLabel:"纵向 · 信念漂移",    detail:"对『推理层』的判断从 +0.7 降到 −0.2", count:1 },
    ],
    "项目":   [
      { targetAxis:"人物", targetLabel:"人物轴 · 承诺兑现",  detail:"3 位 steward 兑现率均 <50%", count:3 },
      { targetAxis:"知识", targetLabel:"知识轴 · 反事实",    detail:"2 条被否决的路径现在重新相关", count:2 },
      { targetAxis:"会议", targetLabel:"会议轴 · 必要性",    detail:"最近 4 场会议中 2 场标记『低必要』", count:2 },
    ],
    "知识":   [
      { targetAxis:"人物", targetLabel:"人物轴 · 发言质量",  detail:"引用率最高的 3 位的心智模型覆盖", count:3 },
      { targetAxis:"项目", targetLabel:"项目轴 · 假设清单",  detail:"J-01 判断关联 5 条未验证假设", count:5 },
    ],
    "会议本身": [
      { targetAxis:"人物", targetLabel:"人物轴 · 沉默信号",  detail:"低质量会议中的普遍沉默者", count:2 },
      { targetAxis:"项目", targetLabel:"项目轴 · 开放问题",  detail:"高情绪温度 → 12 条未决问题", count:12 },
    ],
    "纵向视图 · 跨会议": [
      { targetAxis:"人物", targetLabel:"人物轴 · 角色演化",  detail:"角色切换最频繁的 2 位", count:2 },
      { targetAxis:"知识", targetLabel:"知识轴 · 心智命中",  detail:"命中率 >70% 的 3 个心智模型", count:3 },
    ],
  };

  const related = relatedByAxis[axis] || relatedByAxis["人物"];
  const toneByAxis = {
    "人物":"var(--accent)", "项目":"var(--teal)", "知识":"var(--amber)",
    "会议":"var(--ink)", "纵向":"var(--ink-2)",
  };

  return (
    <div style={{position:"relative"}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        title="此轴与其他轴的跨维线索"
        style={{
          display:"flex", alignItems:"center", gap:5,
          padding:"4px 9px", border:"1px solid var(--line-2)",
          background:"var(--paper-2)", borderRadius:4, cursor:"pointer",
          fontFamily:"var(--sans)", fontSize:11, color:"var(--ink-2)",
        }}
      >
        <window.Icon name="git" size={11}/>
        相关
        <span style={{
          fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)",
          marginLeft:2,
        }}>{related.length}</span>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed", inset:0, zIndex:40}}/>
          <div style={{
            position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:41,
            minWidth:340, background:"var(--paper)", border:"1px solid var(--line)",
            borderRadius:8, boxShadow:"0 12px 28px -12px rgba(0,0,0,0.18)",
            padding:10, fontFamily:"var(--sans)",
          }}>
            <div style={{
              fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-4)",
              letterSpacing:0.4, textTransform:"uppercase", padding:"4px 6px 8px",
            }}>跨轴线索 · 此轴发现的问题在别处的映射</div>
            <div style={{display:"flex", flexDirection:"column", gap:2}}>
              {related.map((r,i)=>{
                const tone = toneByAxis[r.targetAxis] || "var(--ink)";
                return (
                  <button key={i} onClick={()=>setOpen(false)} style={{
                    display:"flex", alignItems:"flex-start", gap:10, padding:"10px 10px",
                    border:0, background:"transparent", borderRadius:5, cursor:"pointer",
                    textAlign:"left", fontFamily:"var(--sans)",
                    transition:"background 140ms",
                  }} onMouseEnter={e=>e.currentTarget.style.background="var(--paper-2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span style={{
                      width:3, alignSelf:"stretch", background:tone, borderRadius:2, flexShrink:0, marginTop:2,
                    }}/>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:12.5, fontWeight:600, color:"var(--ink)"}}>{r.targetLabel}</div>
                      <div style={{fontSize:11.5, color:"var(--ink-2)", marginTop:2, lineHeight:1.45}}>{r.detail}</div>
                    </div>
                    <div style={{
                      display:"flex", alignItems:"center", gap:4, marginLeft:8, flexShrink:0,
                    }}>
                      <span style={{
                        fontFamily:"var(--mono)", fontSize:10, color:tone, fontWeight:600,
                      }}>{r.count}</span>
                      <span style={{color:"var(--ink-4)", fontSize:11}}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { CrossAxisLink });

// ─────────────────────────────────────────────────────────
// TimeRangeContext · TimeRangePill · 时间维度修饰符
// 每条轴都能在 header 上切 7d / 30d / all · 默认 30d
// ─────────────────────────────────────────────────────────
const TimeRangeContext = React.createContext({ range: "30d", setRange: () => {} });

const TIME_RANGES = [
  { id: "7d",   label: "7d",   sub: "近 7 天",    meetings: 3  },
  { id: "30d",  label: "30d",  sub: "近 30 天",   meetings: 11 },
  { id: "90d",  label: "90d",  sub: "近 3 个月",  meetings: 28 },
  { id: "all",  label: "全部", sub: "6 个月+",    meetings: 47 },
];

function TimeRangePill() {
  const ctx = React.useContext(TimeRangeContext);
  const [open, setOpen] = React.useState(false);
  const current = TIME_RANGES.find(r => r.id === ctx.range) || TIME_RANGES[1];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="时间范围 · 每条轴通用的修饰符"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px", border: "1px solid var(--line)",
          background: open ? "var(--paper-2)" : "var(--paper)",
          borderRadius: 5, cursor: "pointer",
          fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--ink-2)",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 4.5 V8 L10.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 600 }}>
          {current.label}
        </span>
        <span style={{ fontSize: 9, color: "var(--ink-4)", marginLeft: -2 }}>▾</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41,
            minWidth: 200, background: "var(--paper)",
            border: "1px solid var(--line)", borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,.08)", padding: 6,
          }}>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 9, letterSpacing: 0.4,
              textTransform: "uppercase", color: "var(--ink-4)",
              padding: "8px 10px 6px",
            }}>
              时间范围 · Time scope
            </div>
            {TIME_RANGES.map(r => {
              const active = r.id === ctx.range;
              return (
                <button
                  key={r.id}
                  onClick={() => { ctx.setRange(r.id); setOpen(false); }}
                  style={{
                    display: "grid", gridTemplateColumns: "38px 1fr auto", alignItems: "center",
                    gap: 8, width: "100%", padding: "8px 10px",
                    border: 0, borderRadius: 4, cursor: "pointer", textAlign: "left",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--ink)" : "var(--ink-2)",
                    fontFamily: "var(--sans)",
                  }}
                >
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                    color: active ? "var(--accent)" : "var(--ink)",
                  }}>
                    {r.label}
                  </span>
                  <span style={{ fontSize: 12 }}>{r.sub}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-4)" }}>
                    {r.meetings} 场
                  </span>
                </button>
              );
            })}
            <div style={{
              borderTop: "1px solid var(--line-2)", marginTop: 4, padding: "8px 10px 4px",
              fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--serif)", fontStyle: "italic",
              lineHeight: 1.5,
            }}>
              时间是每条轴的 <b>修饰符</b>，不是独立的轴。<br/>
              子维度（如信念轨迹）会按此范围过滤数据点。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { TimeRangeContext, TimeRangePill, TIME_RANGES });

