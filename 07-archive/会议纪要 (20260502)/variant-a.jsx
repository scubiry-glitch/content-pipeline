// variant-a.jsx — Editorial direction
// 「文档为中心」 — 单列长读，适合外发、精读、归档
// 左侧细节栏(目录+元数据) + 主体文章流 + 右侧边注(专家意见/他人观点)

function VariantEditorial() {
  const [dim, setDim] = React.useState("minutes");
  const [hoveredClaim, setHoveredClaim] = React.useState(null);
  const a = window.ANALYSIS;

  const navItems = [
    { id:"minutes",       label:"一、常规纪要",     num:"01" },
    { id:"tension",       label:"二、张力",         num:"02" },
    { id:"new_cognition", label:"三、新认知",       num:"03" },
    { id:"focus_map",     label:"四、各自关注点",   num:"04" },
    { id:"consensus",     label:"五、共识与分歧",   num:"05" },
    { id:"cross_view",    label:"六、观点对位",     num:"06" },
  ];

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      color:"var(--ink)", overflow:"hidden", display:"flex",
      fontFamily:"var(--sans)",
    }}>
      {/* ── Left rail ──────────────────────────── */}
      <aside style={{
        width:260, flexShrink:0, padding:"32px 24px 24px 32px",
        borderRight:"1px solid var(--line-2)",
        display:"flex", flexDirection:"column", gap:28, overflowY:"auto",
      }}>
        <div>
          <window.SectionLabel>Meeting · 会议</window.SectionLabel>
          <div style={{
            fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)",
            marginTop:10, letterSpacing:0.3,
          }}>{window.MEETING.id}</div>
          <div style={{
            fontFamily:"var(--serif)", fontSize:20, lineHeight:1.25, fontWeight:500,
            color:"var(--ink)", marginTop:8, letterSpacing:"-0.005em",
          }}>
            {window.MEETING.title}
          </div>
          <div style={{
            fontSize:11, color:"var(--ink-3)", marginTop:12, lineHeight:1.7,
          }}>
            {window.MEETING.date} · {window.MEETING.duration}<br/>
            {window.MEETING.room}
          </div>
        </div>

        <div>
          <window.SectionLabel>Contents</window.SectionLabel>
          <nav style={{marginTop:12, display:"flex", flexDirection:"column"}}>
            {navItems.map(n => {
              const active = n.id===dim;
              return (
                <button key={n.id} onClick={()=>setDim(n.id)} style={{
                  textAlign:"left", padding:"9px 10px", border:0, background:"transparent",
                  cursor:"pointer", borderRadius:6, marginLeft:-10,
                  display:"flex", alignItems:"baseline", gap:10,
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: active ? 600 : 400,
                  fontFamily:"var(--serif)", fontSize:14,
                  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                }}>
                  <span style={{
                    fontFamily:"var(--mono)", fontSize:10, color: active ? "var(--accent)" : "var(--ink-4)",
                    width:18,
                  }}>{n.num}</span>
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          <window.SectionLabel>Experts · 在场</window.SectionLabel>
          <div style={{marginTop:12, display:"flex", flexDirection:"column", gap:10}}>
            {window.EXPERTS.filter(e=>e.selected).map(e=>(
              <div key={e.id} style={{display:"flex", gap:10, alignItems:"flex-start"}}>
                <div style={{
                  width:28, height:28, borderRadius:6, background:"var(--paper-3)",
                  color:"var(--ink-2)", fontFamily:"var(--mono)", fontSize:10, fontWeight:600,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>{e.id.split("-")[0]}</div>
                <div>
                  <div style={{fontSize:12, fontWeight:500, lineHeight:1.3}}>{e.name}</div>
                  <div style={{fontSize:10.5, color:"var(--ink-3)", marginTop:2}}>{e.field}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Article body ───────────────────────── */}
      <main style={{
        flex:1, overflowY:"auto", padding:"48px 56px 80px",
        position:"relative",
      }}>
        {/* Header */}
        <div style={{maxWidth:720}}>
          <div style={{
            display:"flex", alignItems:"center", gap:10, color:"var(--ink-3)",
            fontFamily:"var(--mono)", fontSize:11, letterSpacing:0.5,
          }}>
            <window.Dot color="var(--accent)" />
            会议纪要 · 深度解析版
            <span style={{color:"var(--ink-4)"}}>|</span>
            由 3 位专家并行分析 · preset: standard
          </div>
          <h1 style={{
            fontFamily:"var(--serif)", fontWeight:500, fontSize:44, lineHeight:1.12,
            letterSpacing:"-0.02em", margin:"14px 0 8px",
          }}>
            {window.MEETING.title}
          </h1>
          <div style={{fontSize:13, color:"var(--ink-3)", marginTop:8}}>
            参与者 6 人 · 发言 237 段 · 处理 41,382 tokens · 生成用时 98 秒
          </div>
        </div>

        <div style={{height:1, background:"var(--line-2)", margin:"36px 0 44px", maxWidth:860}}/>

        {/* Dimension content */}
        {dim==="minutes"       && <SecMinutes a={a} />}
        {dim==="tension"       && <SecTension a={a} />}
        {dim==="new_cognition" && <SecNewCognition a={a} />}
        {dim==="focus_map"     && <SecFocusMap a={a} />}
        {dim==="consensus"     && <SecConsensus a={a} />}
        {dim==="cross_view"    && <SecCrossView a={a} hovered={hoveredClaim} setHovered={setHoveredClaim} />}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// Section components
// ──────────────────────────────────────────────
const sectionHeader = (num, title, sub) => (
  <header style={{marginBottom:28, maxWidth:720}}>
    <div style={{
      fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-4)", letterSpacing:"0.14em",
      textTransform:"uppercase",
    }}>§ {num}</div>
    <h2 style={{
      fontFamily:"var(--serif)", fontWeight:500, fontSize:30, letterSpacing:"-0.01em",
      margin:"6px 0 10px",
    }}>{title}</h2>
    <p style={{fontSize:14, color:"var(--ink-2)", lineHeight:1.55, margin:0, maxWidth:620}}>{sub}</p>
  </header>
);

function SecMinutes({ a }) {
  return (
    <section>
      {sectionHeader("01", "常规会议纪要", "以事实与行动为主干的标准纪要，保留决议链条。")}
      <div style={{
        background:"var(--paper-2)", border:"1px solid var(--line-2)",
        borderLeft:"2px solid var(--accent)",
        padding:"18px 22px", borderRadius:4, maxWidth:720, marginBottom:28,
      }}>
        <div style={{
          fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:0.3,
        }}>DECISION</div>
        <p style={{
          fontFamily:"var(--serif)", fontSize:18, lineHeight:1.55, margin:"6px 0 0",
          color:"var(--ink)",
        }}>{a.summary.decision}</p>
      </div>

      <h3 style={{fontFamily:"var(--serif)", fontWeight:600, fontSize:16, margin:"0 0 14px"}}>Action Items</h3>
      <div style={{display:"flex", flexDirection:"column", maxWidth:720}}>
        {a.summary.actionItems.map(it=>(
          <div key={it.id} style={{
            display:"grid", gridTemplateColumns:"42px 100px 1fr 92px", alignItems:"center",
            padding:"14px 0", borderTop:"1px solid var(--line-2)", gap:16,
          }}>
            <window.MonoMeta>{it.id}</window.MonoMeta>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <window.Avatar p={window.P(it.who)} size={22} />
              <span style={{fontSize:13}}>{window.P(it.who).name}</span>
            </div>
            <div style={{fontSize:14, lineHeight:1.5, color:"var(--ink)"}}>{it.what}</div>
            <window.MonoMeta style={{textAlign:"right"}}>{it.due}</window.MonoMeta>
          </div>
        ))}
        <div style={{height:1, background:"var(--line-2)"}}/>
      </div>

      <h3 style={{fontFamily:"var(--serif)", fontWeight:600, fontSize:16, margin:"32px 0 14px"}}>
        Open Risks
      </h3>
      <ul style={{margin:0, paddingLeft:18, maxWidth:720, color:"var(--ink)", fontSize:14, lineHeight:1.75}}>
        {a.summary.risks.map((r,i)=><li key={i}>{r}</li>)}
      </ul>
    </section>
  );
}

function SecTension({ a }) {
  return (
    <section>
      {sectionHeader("02", "张力", "不是冲突 —— 是未解的推拉。每一条张力附带触发点、强度与未化解的残留。")}
      <div style={{display:"flex", flexDirection:"column", gap:24, maxWidth:760}}>
        {a.tension.map(t=>{
          const [a1,a2] = t.between.map(window.P);
          return (
            <article key={t.id} style={{
              border:"1px solid var(--line-2)", borderRadius:6, padding:"20px 22px",
              background:"var(--paper-2)",
            }}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <window.Avatar p={a1} size={26} />
                  <span style={{fontSize:13, color:"var(--ink-2)"}}>{a1.name}</span>
                  <TensionArrow intensity={t.intensity} />
                  <span style={{fontSize:13, color:"var(--ink-2)"}}>{a2.name}</span>
                  <window.Avatar p={a2} size={26} />
                </div>
                <window.MonoMeta>强度 {(t.intensity*100).toFixed(0)}</window.MonoMeta>
              </div>
              <div style={{
                fontFamily:"var(--serif)", fontWeight:600, fontSize:17, letterSpacing:"-0.005em",
              }}>{t.topic}</div>
              <p style={{fontSize:14, color:"var(--ink-2)", lineHeight:1.65, marginTop:8}}>{t.summary}</p>
              {t.moments.length>0 && (
                <div style={{marginTop:14, display:"flex", flexDirection:"column", gap:8}}>
                  {t.moments.map((m,i)=>(
                    <div key={i} style={{
                      fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14,
                      color:"var(--ink-2)", paddingLeft:14, borderLeft:"2px solid var(--accent-soft)",
                    }}>{m}</div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TensionArrow({ intensity }) {
  // Render intensity as a segmented bar between two participants
  const segs = 12;
  const filled = Math.round(intensity*segs);
  return (
    <div style={{display:"flex", gap:2, alignItems:"center", padding:"0 6px"}}>
      {Array.from({length:segs}).map((_,i)=>(
        <div key={i} style={{
          width:5, height: 2 + Math.abs(i-segs/2)*0.5,
          background: i<filled ? "var(--accent)" : "var(--line)",
          borderRadius:1,
        }}/>
      ))}
    </div>
  );
}

function SecNewCognition({ a }) {
  return (
    <section>
      {sectionHeader("03", "新认知", "会议前后，谁的信念被更新？谁被什么触发？")}
      <div style={{display:"flex", flexDirection:"column", maxWidth:800}}>
        {a.newCognition.map((n,idx)=>{
          const p = window.P(n.who);
          return (
            <div key={n.id} style={{
              display:"grid", gridTemplateColumns:"80px 1fr", gap:24,
              padding:"28px 0", borderTop: idx===0 ? "none" : "1px solid var(--line-2)",
            }}>
              <div>
                <window.Avatar p={p} size={48} radius={8} />
                <div style={{fontSize:12, fontWeight:500, marginTop:8}}>{p.name}</div>
                <div style={{fontSize:10.5, color:"var(--ink-3)", marginTop:2}}>{p.role}</div>
              </div>
              <div>
                <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:14, alignItems:"stretch"}}>
                  <div style={{
                    background:"var(--paper-2)", border:"1px solid var(--line-2)",
                    padding:"12px 14px", borderRadius:4,
                  }}>
                    <window.MonoMeta>BEFORE</window.MonoMeta>
                    <div style={{fontFamily:"var(--serif)", fontSize:15, marginTop:4, lineHeight:1.5, color:"var(--ink-2)"}}>{n.before}</div>
                  </div>
                  <div style={{display:"flex", alignItems:"center", color:"var(--accent)"}}>
                    <window.Icon name="arrow" size={22} stroke={1.3}/>
                  </div>
                  <div style={{
                    background:"var(--accent-soft)", border:"1px solid oklch(0.85 0.07 40)",
                    padding:"12px 14px", borderRadius:4,
                  }}>
                    <window.MonoMeta style={{color:"oklch(0.4 0.1 40)"}}>AFTER</window.MonoMeta>
                    <div style={{fontFamily:"var(--serif)", fontSize:15, marginTop:4, lineHeight:1.5, color:"oklch(0.28 0.08 40)"}}>{n.after}</div>
                  </div>
                </div>
                <div style={{fontSize:12.5, color:"var(--ink-3)", marginTop:12, display:"flex", gap:6, alignItems:"baseline"}}>
                  <span style={{color:"var(--ink-4)"}}>触发</span>
                  <span>{n.trigger}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SecFocusMap({ a }) {
  const maxR = Math.max(...a.focusMap.map(x=>x.returnsTo));
  return (
    <section>
      {sectionHeader("04", "各自关注点", "每人反复回到的主题 · 圆点尺寸为回归次数。")}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, maxWidth:820}}>
        {a.focusMap.map(f=>{
          const p = window.P(f.who);
          return (
            <div key={f.who} style={{
              border:"1px solid var(--line-2)", borderRadius:6, padding:"16px 18px", background:"var(--paper-2)",
            }}>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <window.Avatar p={p} size={32} />
                <div>
                  <div style={{fontSize:13, fontWeight:500}}>{p.name}</div>
                  <div style={{fontSize:10.5, color:"var(--ink-3)"}}>{p.role}</div>
                </div>
                <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:4}}>
                  <window.Dot color="var(--amber)" size={8+ (f.returnsTo/maxR)*8} />
                  <window.MonoMeta>×{f.returnsTo}</window.MonoMeta>
                </div>
              </div>
              <div style={{marginTop:14, display:"flex", flexWrap:"wrap", gap:6}}>
                {f.themes.map((t,i)=><window.Chip key={i} tone="amber">{t}</window.Chip>)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SecConsensus({ a }) {
  const cons = a.consensus.filter(x=>x.kind==="consensus");
  const divs = a.consensus.filter(x=>x.kind==="divergence");
  return (
    <section>
      {sectionHeader("05", "共识与分歧", "已对齐的默认共识 vs 仍在分岔的判断。")}

      <div style={{
        display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, maxWidth:820, marginTop:4,
      }}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
            <window.Icon name="check" size={16} style={{color:"var(--accent)"}}/>
            <span style={{fontSize:13, fontWeight:600, color:"var(--ink)"}}>共识 · Consensus</span>
            <window.MonoMeta>{cons.length}</window.MonoMeta>
          </div>
          {cons.map(c=>(
            <div key={c.id} style={{
              padding:"12px 14px", background:"var(--accent-soft)",
              border:"1px solid oklch(0.87 0.06 40)", borderRadius:4, marginBottom:10,
            }}>
              <div style={{fontFamily:"var(--serif)", fontSize:14.5, lineHeight:1.55, color:"oklch(0.28 0.08 40)"}}>
                {c.text}
              </div>
              <div style={{display:"flex", gap:4, marginTop:10}}>
                {c.supportedBy.map(id=>(
                  <window.Avatar key={id} p={window.P(id)} size={20} radius={4} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
            <window.Icon name="git" size={16} style={{color:"var(--teal)"}}/>
            <span style={{fontSize:13, fontWeight:600, color:"var(--ink)"}}>分歧 · Divergence</span>
            <window.MonoMeta>{divs.length}</window.MonoMeta>
          </div>
          {divs.map(d=>(
            <div key={d.id} style={{
              padding:"12px 14px", background:"var(--paper-2)",
              border:"1px solid var(--line-2)", borderRadius:4, marginBottom:10,
            }}>
              <div style={{fontFamily:"var(--serif)", fontSize:14.5, lineHeight:1.45, color:"var(--ink)", marginBottom:10}}>
                {d.text}
              </div>
              {d.sides.map((s,i)=>(
                <div key={i} style={{
                  display:"grid", gridTemplateColumns:"80px 1fr auto", gap:10, alignItems:"center",
                  padding:"8px 10px", marginTop: i===0 ? 0 : 4,
                  background: i===0 ? "var(--teal-soft)" : "oklch(0.95 0.02 200)",
                  borderRadius:3, fontSize:12.5,
                }}>
                  <span style={{fontWeight:600, color:"oklch(0.3 0.08 200)"}}>{s.stance}</span>
                  <span style={{color:"var(--ink-2)"}}>{s.reason}</span>
                  <div style={{display:"flex", gap:3}}>
                    {s.by.map(id=><window.Avatar key={id} p={window.P(id)} size={18} radius={3} />)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecCrossView({ a }) {
  const stanceTone = { support:"accent", oppose:"teal", partial:"amber", neutral:"ghost" };
  const stanceLabel = { support:"附议", oppose:"反对", partial:"部分认同", neutral:"中性" };
  return (
    <section>
      {sectionHeader("06", "观点对位 · Cross-view", "对一条关键主张，其他人如何回应？")}
      <div style={{display:"flex", flexDirection:"column", gap:30, maxWidth:800}}>
        {a.crossView.map(v=>{
          const claimer = window.P(v.claimBy);
          return (
            <article key={v.id}>
              <div style={{
                background:"var(--paper-2)", border:"1px solid var(--line-2)",
                borderLeft:"2px solid var(--accent)", padding:"16px 20px", borderRadius:4,
              }}>
                <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                  <window.Avatar p={claimer} size={24} />
                  <span style={{fontSize:12.5, color:"var(--ink-2)"}}>{claimer.name} 主张</span>
                </div>
                <div style={{
                  fontFamily:"var(--serif)", fontSize:19, lineHeight:1.45, fontWeight:500,
                }}>{v.claim}</div>
              </div>
              <div style={{marginTop:14, display:"flex", flexDirection:"column"}}>
                {v.responses.map((r,i)=>{
                  const p = window.P(r.who);
                  return (
                    <div key={i} style={{
                      display:"grid", gridTemplateColumns:"110px 72px 1fr", gap:16, alignItems:"center",
                      padding:"12px 0", borderTop:"1px solid var(--line-2)",
                    }}>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <window.Avatar p={p} size={22} />
                        <span style={{fontSize:12.5}}>{p.name}</span>
                      </div>
                      <window.Chip tone={stanceTone[r.stance]}>{stanceLabel[r.stance]}</window.Chip>
                      <div style={{fontSize:13.5, lineHeight:1.55, fontFamily:"var(--serif)", color:"var(--ink-2)"}}>{r.text}</div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

Object.assign(window, { VariantEditorial });
