// variant-c.jsx — Threads direction
// 「人物与观点」为中心：6 条 belief thread，分歧点以可视化的 fork 呈现

function VariantThreads() {
  const [view, setView] = React.useState("threads"); // threads | consensus | focus
  const a = window.ANALYSIS;

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      display:"grid", gridTemplateRows:"56px 1fr", color:"var(--ink)",
      fontFamily:"var(--sans)", overflow:"hidden",
    }}>
      {/* Top */}
      <header style={{
        display:"flex", alignItems:"center", padding:"0 28px", gap:18,
        borderBottom:"1px solid var(--line-2)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{
            fontFamily:"var(--serif)", fontStyle:"italic", fontWeight:600, fontSize:22, letterSpacing:"-0.01em",
          }}>Threads</div>
          <window.MonoMeta>· 会议编织视图</window.MonoMeta>
        </div>
        <div style={{display:"flex", gap:2, border:"1px solid var(--line)", borderRadius:6, padding:2}}>
          {[
            { id:"threads",   label:"信念线" },
            { id:"consensus", label:"共识 / 分歧图" },
            { id:"focus",     label:"关注点星云" },
          ].map(v=>(
            <button key={v.id} onClick={()=>setView(v.id)} style={{
              padding:"5px 12px", border:0, borderRadius:4, fontSize:12,
              background: view===v.id ? "var(--ink)" : "transparent",
              color: view===v.id ? "var(--paper)" : "var(--ink-2)",
              cursor:"pointer", fontWeight: view===v.id ? 600 : 450,
            }}>{v.label}</button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <window.Chip tone="ghost"><window.Icon name="clock" size={11}/> {window.MEETING.duration}</window.Chip>
        <window.Chip tone="ghost"><window.Icon name="users" size={11}/> 6 人</window.Chip>
        <window.Chip tone="accent">3 experts · standard</window.Chip>
      </header>

      {view==="threads"   && <ThreadView a={a}/>}
      {view==="consensus" && <ConsensusGraph a={a}/>}
      {view==="focus"     && <FocusNebula a={a}/>}
    </div>
  );
}

// ──────────────────────────────────────
// Belief threads — 6 horizontal lanes, time-axis 0-120min, fork events
// ──────────────────────────────────────
function ThreadView({ a }) {
  const W = 1440 - 56*2;   // art width - margin
  const laneH = 72;
  const startX = 170;
  const endX = W - 60;
  // Dummy events: belief revisions and tension moments, positioned by minute
  const events = {
    p1: [
      { t:42, kind:"listen" }, { t:54, kind:"fork", label:"6000万 / 8000万" },
      { t:78, kind:"update", ref:"N1" }, { t:108, kind:"decide" },
    ],
    p2: [
      { t:18, kind:"claim", label:"推理层主张" }, { t:39, kind:"clash", label:"vs Wei Tan" },
      { t:74, kind:"update", ref:"N3" }, { t:95, kind:"commit" },
    ],
    p3: [
      { t:22, kind:"claim", label:"训练层护城河" }, { t:39, kind:"clash" },
      { t:72, kind:"update", ref:"N2" }, { t:105, kind:"yield" },
    ],
    p4: [{ t:30, kind:"listen" }, { t:85, kind:"data", label:"基础利率 38%" }],
    p5: [{ t:55, kind:"flag", label:"合规边界" }],
    p6: [{ t:72, kind:"data", label:"18 warm intro" }, { t:96, kind:"listen" }],
  };
  const MIN = 118;
  const xFor = min => startX + (min/MIN)*(endX-startX);

  return (
    <div style={{padding:"26px 56px 32px", overflowY:"auto"}}>
      <div style={{marginBottom:18, display:"flex", alignItems:"baseline", gap:18}}>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:26, margin:0, letterSpacing:"-0.01em"}}>
          信念演化 · Belief threads
        </h2>
        <div style={{fontSize:13, color:"var(--ink-3)", maxWidth:560}}>
          每条横轴是一个人的信念轨迹。标记点是：主张 · 冲击 · 更新 · 让步 · 决断。读图就像看一场辩论的 MRI。
        </div>
      </div>

      {/* Legend */}
      <div style={{display:"flex", gap:14, marginBottom:18, fontSize:11.5, color:"var(--ink-3)"}}>
        <LegendDot color="var(--ink)" label="主张 / claim"/>
        <LegendDot color="var(--accent)" label="冲击 / clash" ring/>
        <LegendDot color="var(--teal)" label="信念更新 / update"/>
        <LegendDot color="var(--amber)" label="数据 / evidence"/>
        <LegendDot color="var(--ink-3)" label="倾听 / listen" small/>
        <LegendDot color="var(--ink-2)" label="让步 · 决断" square/>
      </div>

      {/* The chart */}
      <div style={{
        position:"relative", background:"var(--paper-2)", border:"1px solid var(--line-2)",
        borderRadius:8, padding:"18px 0 30px",
      }}>
        {/* Time axis */}
        <div style={{position:"relative", height:20, marginLeft:startX, marginRight:60, marginBottom:6}}>
          {[0,30,60,90,118].map(m=>(
            <div key={m} style={{
              position:"absolute", left: ((m/MIN)*(endX-startX-0)) + "px", top:0,
            }}>
              <div style={{width:1, height:8, background:"var(--line)"}}/>
              <window.MonoMeta style={{fontSize:10, transform:"translateX(-50%)", display:"inline-block"}}>{m}m</window.MonoMeta>
            </div>
          ))}
        </div>

        {/* Lanes */}
        {window.PARTICIPANTS.map((p, i)=>(
          <div key={p.id} style={{
            position:"relative", height:laneH, borderTop: i===0 ? "none" : "1px dashed var(--line-2)",
            display:"flex", alignItems:"center",
          }}>
            <div style={{
              width:startX-14, padding:"0 14px", display:"flex", alignItems:"center", gap:10,
            }}>
              <window.Avatar p={p} size={28}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12.5, fontWeight:500}}>{p.name}</div>
                <div style={{fontSize:10.5, color:"var(--ink-3)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{p.role}</div>
              </div>
            </div>
            {/* The belief track */}
            <div style={{position:"absolute", left:startX, right:60, top:"50%",
              height:2, background:"linear-gradient(to right, var(--line) 0%, var(--line) 100%)",
              transform:"translateY(-50%)",
            }}/>
            {/* Speaking density shaded region */}
            <div style={{
              position:"absolute", left:startX, right:60, top:"50%",
              height: 22, transform:"translateY(-50%)",
              background:`linear-gradient(to right, transparent, ${p.tone==="warm"?"oklch(0.9 0.04 40 / 0.4)":p.tone==="cool"?"oklch(0.9 0.035 200 / 0.4)":"oklch(0.9 0.005 75 / 0.35)"} ${Math.min(95, p.speakingPct*2)}%, transparent)`,
              borderRadius:11, pointerEvents:"none",
            }}/>
            {/* Events */}
            {(events[p.id] || []).map((e,j)=>(
              <EventMark key={j} e={e} x={xFor(e.t)} />
            ))}
          </div>
        ))}

        {/* Clash vertical line between p2 and p3 at t=39 */}
        <div style={{
          position:"absolute", left: xFor(39)+56, top: 30 + 20,
          height: laneH*2 + 10, width:0,
          borderLeft:"1.5px dashed var(--accent)", opacity:0.5,
        }}/>

        {/* Decision moment */}
        <div style={{
          position:"absolute", left: xFor(108)+56, top: 20,
          bottom: 10, width:0, borderLeft:"1.5px solid var(--accent)", opacity:0.3,
        }}/>
        <div style={{
          position:"absolute", left: xFor(108)+56, top: -4,
          transform:"translateX(-50%)",
          fontFamily:"var(--mono)", fontSize:10, color:"var(--accent)", letterSpacing:0.3,
          background:"var(--paper)", padding:"1px 6px", borderRadius:3,
        }}>DECISION · 108m</div>
      </div>

      {/* Below the chart: the narrative of the 3 key updates */}
      <div style={{
        marginTop:22, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14,
      }}>
        {a.newCognition.map(n=>{
          const p = window.P(n.who);
          return (
            <div key={n.id} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6,
              padding:"14px 16px",
            }}>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                <window.Avatar p={p} size={22}/>
                <span style={{fontSize:12, fontWeight:500}}>{p.name}</span>
                <window.Chip tone="teal" style={{marginLeft:"auto", padding:"1px 6px", fontSize:10}}>update</window.Chip>
              </div>
              <div style={{fontSize:12, color:"var(--ink-3)", fontFamily:"var(--serif)", fontStyle:"italic", marginBottom:6, textDecoration:"line-through"}}>
                {n.before}
              </div>
              <div style={{fontSize:13, color:"oklch(0.28 0.08 200)", fontFamily:"var(--serif)", fontWeight:500, lineHeight:1.5}}>
                → {n.after}
              </div>
              <div style={{fontSize:11, color:"var(--ink-3)", marginTop:10, display:"flex", gap:4, alignItems:"baseline"}}>
                <span style={{color:"var(--ink-4)"}}>触发</span>{n.trigger}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label, ring, small, square }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:6}}>
      {square ? (
        <div style={{width:9, height:9, background:color, transform:"rotate(45deg)"}}/>
      ) : ring ? (
        <div style={{width:10, height:10, border:`1.5px solid ${color}`, borderRadius:99}}/>
      ) : (
        <div style={{width: small ? 5 : 9, height: small ? 5 : 9, background:color, borderRadius:99}}/>
      )}
      <span>{label}</span>
    </div>
  );
}

function EventMark({ e, x }) {
  const base = { position:"absolute", left: x, top:"50%", transform:"translate(-50%,-50%)", zIndex:2 };
  switch(e.kind) {
    case "claim":
      return <div style={{...base, display:"flex", alignItems:"center", gap:6}}>
        <div style={{width:10, height:10, background:"var(--ink)", borderRadius:99, boxShadow:"0 0 0 3px var(--paper-2)"}}/>
        {e.label && <span style={{fontSize:10.5, whiteSpace:"nowrap", color:"var(--ink)", fontWeight:500}}>{e.label}</span>}
      </div>;
    case "clash":
      return <div style={{...base, display:"flex", alignItems:"center", gap:6}}>
        <div style={{width:14, height:14, border:"2px solid var(--accent)", borderRadius:99, background:"var(--paper-2)"}}/>
        {e.label && <span style={{fontSize:10.5, whiteSpace:"nowrap", color:"var(--accent)", fontWeight:500, marginLeft:2}}>{e.label}</span>}
      </div>;
    case "update":
      return <div style={{...base, display:"flex", alignItems:"center", gap:5}}>
        <div style={{width:12, height:12, background:"var(--teal)", borderRadius:99, boxShadow:"0 0 0 3px var(--paper-2)"}}/>
        <window.MonoMeta style={{fontSize:9.5, color:"oklch(0.3 0.08 200)"}}>{e.ref}</window.MonoMeta>
      </div>;
    case "data":
      return <div style={{...base, display:"flex", alignItems:"center", gap:5}}>
        <div style={{width:9, height:9, background:"var(--amber)", borderRadius:99, boxShadow:"0 0 0 3px var(--paper-2)"}}/>
        {e.label && <span style={{fontSize:10, whiteSpace:"nowrap", color:"oklch(0.42 0.09 75)"}}>{e.label}</span>}
      </div>;
    case "listen":
      return <div style={{...base}}>
        <div style={{width:5, height:5, background:"var(--ink-3)", borderRadius:99, boxShadow:"0 0 0 2px var(--paper-2)"}}/>
      </div>;
    case "fork":
      return <div style={{...base, display:"flex", alignItems:"center", gap:5}}>
        <window.Icon name="git" size={14} style={{color:"var(--accent)", background:"var(--paper-2)", borderRadius:99, padding:1}}/>
        {e.label && <span style={{fontSize:10, whiteSpace:"nowrap", color:"var(--accent)", fontWeight:500}}>{e.label}</span>}
      </div>;
    case "flag":
      return <div style={{...base, display:"flex", alignItems:"center", gap:5}}>
        <div style={{width:0, height:0, borderLeft:"5px solid transparent", borderRight:"5px solid transparent", borderBottom:"9px solid var(--amber)"}}/>
        {e.label && <span style={{fontSize:10, whiteSpace:"nowrap", color:"oklch(0.4 0.09 75)"}}>{e.label}</span>}
      </div>;
    case "yield":
    case "commit":
    case "decide":
      return <div style={{...base}}>
        <div style={{width:10, height:10, background:"var(--ink-2)", transform:"rotate(45deg)", boxShadow:"0 0 0 3px var(--paper-2)"}}/>
      </div>;
    default: return null;
  }
}

// ──────────────────────────────────────
// Consensus / divergence graph — radial layout
// ──────────────────────────────────────
function ConsensusGraph({ a }) {
  const cons = a.consensus.filter(x=>x.kind==="consensus");
  const divs = a.consensus.filter(x=>x.kind==="divergence");

  // Layout: center = meeting, ring of participants, then cards orbiting
  const cx = 450, cy = 360, ringR = 180;
  const participants = window.PARTICIPANTS;
  const nodePos = {};
  participants.forEach((p,i)=>{
    const angle = (i / participants.length) * Math.PI * 2 - Math.PI/2;
    nodePos[p.id] = { x: cx + Math.cos(angle)*ringR, y: cy + Math.sin(angle)*ringR };
  });

  // For each consensus, draw lines from ring to a card position
  const consPositions = cons.map((_,i)=>{
    const angle = Math.PI/2 + (i - (cons.length-1)/2) * 0.22;
    return { x: cx - 290, y: cy + Math.sin(angle)*80 + i*10 };
  });

  return (
    <div style={{padding:"22px 56px 26px", display:"grid", gridTemplateColumns:"900px 1fr", gap:26, overflow:"auto"}}>
      <div style={{position:"relative", height:720}}>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:24, margin:"0 0 14px", letterSpacing:"-0.01em"}}>
          共识 · 分歧 · 图谱
        </h2>
        <svg width={900} height={680} style={{position:"absolute", left:0, top:40}}>
          <defs>
            <pattern id="dots" patternUnits="userSpaceOnUse" width="16" height="16">
              <circle cx="2" cy="2" r="0.8" fill="oklch(0.85 0.01 75)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" opacity="0.5"/>
          {/* Ring */}
          <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--line)" strokeDasharray="2 4" />
          {/* Center */}
          <circle cx={cx} cy={cy} r={44} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5}/>
          <text x={cx} y={cy-4} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="600" fill="var(--ink)">会议</text>
          <text x={cx} y={cy+12} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">M-237</text>

          {/* Divergence cards on the right with branching lines */}
          {divs.map((d, idx) => {
            const dy = 80 + idx*250;
            const dx = cx + 240;
            return (
              <g key={d.id}>
                {d.sides.map((s, sIdx) => (
                  s.by.map(pid => {
                    const from = nodePos[pid];
                    const toX = dx;
                    const toY = dy + 50 + sIdx*70;
                    return (
                      <path
                        key={pid+sIdx}
                        d={`M ${from.x} ${from.y} C ${(from.x+toX)/2} ${from.y}, ${(from.x+toX)/2} ${toY}, ${toX} ${toY}`}
                        fill="none"
                        stroke={sIdx===0 ? "var(--teal)" : "oklch(0.6 0.1 40)"}
                        strokeWidth={1.3}
                        opacity={0.55}
                      />
                    );
                  })
                ))}
              </g>
            );
          })}

          {/* Consensus cards on the left */}
          {cons.map((c, idx) => {
            const dy = 110 + idx*150;
            const dx = cx - 250;
            return (
              <g key={c.id}>
                {c.supportedBy.map(pid => {
                  const from = nodePos[pid];
                  return (
                    <path
                      key={pid}
                      d={`M ${from.x} ${from.y} C ${(from.x+dx)/2} ${from.y}, ${(from.x+dx)/2} ${dy+30}, ${dx} ${dy+30}`}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.2}
                      opacity={0.5}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Participant nodes */}
          {participants.map(p=>{
            const {x,y} = nodePos[p.id];
            const fill = p.tone==="warm"?"oklch(0.88 0.06 40)":p.tone==="cool"?"oklch(0.9 0.05 200)":"oklch(0.92 0.01 75)";
            return (
              <g key={p.id}>
                <circle cx={x} cy={y} r={22} fill={fill} stroke="var(--paper)" strokeWidth={3}/>
                <text x={x} y={y+4} textAnchor="middle" fontFamily="var(--sans)" fontSize="11" fontWeight="600" fill="var(--ink)">{p.initials}</text>
                <text x={x} y={y+38} textAnchor="middle" fontFamily="var(--sans)" fontSize="10.5" fill="var(--ink-2)">{p.name}</text>
              </g>
            );
          })}
        </svg>

        {/* Overlaid HTML cards for consensus */}
        {cons.map((c, idx) => (
          <div key={c.id} style={{
            position:"absolute", left:10, top: 150 + idx*150, width:180,
            background:"var(--accent-soft)", border:"1px solid oklch(0.85 0.07 40)",
            borderRadius:5, padding:"10px 12px",
          }}>
            <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:4}}>
              <window.Icon name="check" size={11} style={{color:"oklch(0.4 0.1 40)"}}/>
              <window.MonoMeta style={{fontSize:10}}>{c.id}</window.MonoMeta>
            </div>
            <div style={{fontFamily:"var(--serif)", fontSize:12.5, lineHeight:1.45, color:"oklch(0.28 0.08 40)"}}>
              {c.text}
            </div>
          </div>
        ))}

        {/* Overlaid divergence cards */}
        {divs.map((d, idx) => (
          <div key={d.id} style={{
            position:"absolute", right:10, top: 120 + idx*250, width:220,
            background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:6,
          }}>
            <div style={{padding:"8px 12px", borderBottom:"1px solid var(--line-2)", display:"flex", alignItems:"center", gap:6}}>
              <window.Icon name="git" size={11} style={{color:"var(--teal)"}}/>
              <window.MonoMeta style={{fontSize:10}}>{d.id}</window.MonoMeta>
            </div>
            <div style={{padding:"10px 12px", fontFamily:"var(--serif)", fontSize:12.5, lineHeight:1.4, borderBottom:"1px solid var(--line-2)"}}>
              {d.text}
            </div>
            {d.sides.map((s,i)=>(
              <div key={i} style={{
                padding:"6px 12px", fontSize:11, display:"flex", justifyContent:"space-between",
                background: i===0 ? "var(--teal-soft)" : "oklch(0.96 0.02 40)",
                borderTop: i>0 ? "1px solid var(--line-2)" : "none",
              }}>
                <span style={{fontWeight:600}}>{s.stance}</span>
                <div style={{display:"flex", gap:2}}>
                  {s.by.map(pid=><window.Avatar key={pid} p={window.P(pid)} size={14} radius={3}/>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right panel: stats */}
      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"16px 18px"}}>
          <window.SectionLabel>对齐度</window.SectionLabel>
          <div style={{fontFamily:"var(--serif)", fontSize:34, fontWeight:500, marginTop:8, letterSpacing:"-0.02em"}}>
            0.62
          </div>
          <div style={{fontSize:12, color:"var(--ink-3)", marginTop:4}}>
            共识条目 {cons.length} / 分歧条目 {divs.length} · 基线 0.48
          </div>
        </div>
        <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"16px 18px"}}>
          <window.SectionLabel>分歧结构</window.SectionLabel>
          <div style={{fontSize:13, lineHeight:1.65, color:"var(--ink-2)", marginTop:8}}>
            主要分歧集中在 <b style={{color:"var(--ink)"}}>陈汀 ↔ 林雾</b> 的风险偏好轴，
            以及 <b style={{color:"var(--ink)"}}>沈岚 ↔ Wei Tan</b> 的产业判断轴。两者在决议时点汇合。
          </div>
        </div>
        <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"16px 18px"}}>
          <window.SectionLabel>专家附议 · E09-09</window.SectionLabel>
          <div style={{fontSize:13, lineHeight:1.7, color:"var(--ink-2)", marginTop:8, fontFamily:"var(--serif)"}}>
            分歧 D1 并非真正的分歧，而是 <i>风险预算谁承担</i> 的代理争论。建议把单笔上限的讨论
            挪到 LP 委员会层面，而不是投决会层面。
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────
// Focus nebula — per-participant themes laid out as a star field
// ──────────────────────────────────────
function FocusNebula({ a }) {
  // Collect all (participant, theme, returns) tuples; position them in clusters
  const W = 900, H = 620;
  const clusters = a.focusMap.map((f,i)=>{
    const angle = (i / a.focusMap.length) * Math.PI*2 - Math.PI/2;
    return {
      who: f.who,
      cx: W/2 + Math.cos(angle)*240,
      cy: H/2 + Math.sin(angle)*180,
      themes: f.themes,
      returnsTo: f.returnsTo,
    };
  });

  return (
    <div style={{padding:"22px 56px 26px", display:"grid", gridTemplateColumns:"1fr 340px", gap:26, overflow:"auto"}}>
      <div>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:24, margin:"0 0 14px", letterSpacing:"-0.01em"}}>
          关注点星云 · Focus nebula
        </h2>
        <div style={{
          position:"relative", background:"var(--paper-2)", border:"1px solid var(--line-2)",
          borderRadius:8, width:W, height:H, overflow:"hidden",
        }}>
          <svg width={W} height={H} style={{position:"absolute", inset:0}}>
            <defs>
              <pattern id="dots2" patternUnits="userSpaceOnUse" width="20" height="20">
                <circle cx="2" cy="2" r="0.7" fill="oklch(0.85 0.01 75)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots2)" opacity="0.6"/>
            {/* Soft cluster auras */}
            {clusters.map(c=>(
              <circle key={c.who} cx={c.cx} cy={c.cy} r={52+c.returnsTo*6}
                fill={window.P(c.who).tone==="warm"?"oklch(0.9 0.04 40 / 0.35)":window.P(c.who).tone==="cool"?"oklch(0.9 0.035 200 / 0.3)":"oklch(0.9 0.008 75 / 0.5)"}/>
            ))}
          </svg>
          {/* Participant node + orbiting themes */}
          {clusters.map(c=>{
            const p = window.P(c.who);
            return (
              <div key={c.who}>
                <div style={{
                  position:"absolute", left:c.cx-22, top:c.cy-22, width:44, height:44,
                  borderRadius:99, background:"var(--paper)", border:"1.5px solid var(--ink-2)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"var(--sans)", fontWeight:600, fontSize:13,
                }}>{p.initials}</div>
                <div style={{
                  position:"absolute", left:c.cx-60, top:c.cy+26, width:120, textAlign:"center",
                  fontSize:11, color:"var(--ink-3)",
                }}>{p.name}</div>
                {c.themes.map((th,i)=>{
                  const angle = (i/c.themes.length)*Math.PI*2 - Math.PI/4;
                  const r = 90;
                  const tx = c.cx + Math.cos(angle)*r;
                  const ty = c.cy + Math.sin(angle)*r;
                  return (
                    <div key={i} style={{
                      position:"absolute", left:tx, top:ty, transform:"translate(-50%,-50%)",
                      padding:"3px 8px", background:"var(--paper)",
                      border:"1px solid oklch(0.85 0.07 75)",
                      color:"oklch(0.38 0.09 75)", fontSize:11, fontWeight:500,
                      borderRadius:99, whiteSpace:"nowrap",
                    }}>{th}</div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:12}}>
        <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"14px 16px"}}>
          <window.SectionLabel>重叠主题</window.SectionLabel>
          <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:8}}>
            {[
              { theme:"推理层", who:["p1","p2"] },
              { theme:"毛利", who:["p2"] },
              { theme:"合规 / LP", who:["p1","p5"] },
              { theme:"退出路径", who:["p3"] },
            ].map((x,i)=>(
              <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:12}}>
                <window.Chip tone="amber">{x.theme}</window.Chip>
                <div style={{display:"flex", gap:3}}>
                  {x.who.map(id=><window.Avatar key={id} p={window.P(id)} size={18} radius={4}/>)}
                </div>
                <window.MonoMeta style={{marginLeft:"auto"}}>×{x.who.length}</window.MonoMeta>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:6, padding:"14px 16px"}}>
          <window.SectionLabel>沉默 / Under-spoken</window.SectionLabel>
          <div style={{fontSize:12.5, color:"var(--ink-2)", marginTop:8, lineHeight:1.6, fontFamily:"var(--serif)"}}>
            「估值模型校准」是所有人在口头上都认同、但没有一人将其作为关注主题反复回归的议题。
            这是一个典型的 <i style={{color:"var(--accent)"}}>伪共识</i>。
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VariantThreads });
