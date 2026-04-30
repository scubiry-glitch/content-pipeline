// panorama.jsx — 全景画板 · 一套数据 × 三视图（时间轴 / 熔炉 / 冰山）
// v2: 按六棱镜切扇区 · 步骤聚合 · 连线与层级增强

// ─────────────────────────────────────────────────────────
// 六棱镜扇区 · 贯穿四层（源→步骤→产出→应用）
// 每个扇区的底色（很淡，仅做区分）
// ─────────────────────────────────────────────────────────
const PRISMS = [
  { id:"direction", icon:"🧭", label:"方向",    color:"#7BA7C4", tint:"rgba(123,167,196,0.07)", room:"Compass" },
  { id:"board",     icon:"🏛️", label:"董事会",  color:"#C8A15C", tint:"rgba(200,161,92,0.07)",  room:"Boardroom" },
  { id:"coord",     icon:"🎯", label:"协调",    color:"#7FD6A0", tint:"rgba(127,214,160,0.07)", room:"Tower" },
  { id:"team",      icon:"⚔️", label:"团队",    color:"#E6A6A6", tint:"rgba(230,166,166,0.07)", room:"War Room" },
  { id:"ext",       icon:"🌐", label:"各方",    color:"#A8A0D9", tint:"rgba(168,160,217,0.07)", room:"Situation" },
  { id:"self",      icon:"🧘", label:"个人",    color:"#D9B88E", tint:"rgba(217,184,142,0.07)", room:"Balcony" },
];

// 每个扇区在四层中的代表节点（源/步骤组/产出/应用）
const SECTORS = {
  direction: {
    source: "历史纪要",
    step:   "跨会联动",
    output: "一页纸摘要",
    app:    "战略对齐度 / 破坏浣熊",
  },
  board: {
    source: "专家库",
    step:   "外脑批注",
    output: "外脑批注资产",
    app:    "董事关切雷达 / 预读包",
  },
  coord: {
    source: "会议原材料",
    step:   "实体 & 承诺抽取",
    output: "承诺清单",
    app:    "责任盘点 / 会后 10 分钟卡",
  },
  team: {
    source: "会议原材料",
    step:   "矛盾识别",
    output: "盲区档案",
    app:    "阵型 / 兵棋推演",
  },
  ext: {
    source: "内容库 assets",
    step:   "Rubric 评分",
    output: "Rubric 矩阵",
    app:    "利益相关方热力图",
  },
  self: {
    source: "历史纪要",
    step:   "棱镜聚合",
    output: "六棱镜指标",
    app:    "时间 ROI / 阳台时光",
  },
};

// 五组聚合后的加工步骤（原 11 步 → 5 组，降密度）
const STEP_GROUPS = [
  { id:"g1", label:"ASR & 实体",     sub:"转写 · diarize · 承诺抽取",       members:"01·02" },
  { id:"g2", label:"评分 & 信念",    sub:"Rubric · 信念提取",               members:"03·04·05" },
  { id:"g3", label:"矛盾 & 专家",    sub:"自认/外识 · 互补专家匹配",         members:"06·07·08" },
  { id:"g4", label:"跨会 & 批注",    sub:"rehash · 外脑批注生成",            members:"09·10" },
  { id:"g5", label:"棱镜聚合",       sub:"六面指标合成",                     members:"11" },
];

const SOURCES = [
  { id:"src-rec",  label:"会议原材料",   sub:"录音 / 录像 / 文档" },
  { id:"src-lib",  label:"内容库 assets", sub:"RSS · 手动 · 深度分析" },
  { id:"src-exp",  label:"专家库",       sub:"S 级 · 心智模型" },
  { id:"src-hist", label:"历史纪要",     sub:"信念 · 决策链" },
];

const OUTPUTS_ALL = [
  "转写", "承诺清单", "张力清单", "Rubric 矩阵", "信念轨迹",
  "心智模型命中", "盲区档案", "互补专家组", "rehash 指数",
  "外脑批注", "六棱镜指标", "一页纸摘要",
];

function PanoramaBoard() {
  const [view, setView] = React.useState("furnace"); // furnace | timeline | iceberg
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(t);
  }, [view]);

  const views = [
    { id:"furnace",  label:"熔炉",   sub:"六棱镜切扇区 · CEO 中心" },
    { id:"timeline", label:"时间轴", sub:"源 → 加工 → 产出 → 应用" },
    { id:"iceberg",  label:"冰山",   sub:"水面之上 · 水下支撑" },
  ];

  return (
    <div style={{
      width:"100%", height:"100%", background:"#0F0E15",
      color:"#E8E3D8", fontFamily:"var(--sans)", overflow:"hidden",
      display:"flex", flexDirection:"column", position:"relative",
    }}>
      <StarDust/>

      <header style={{
        padding:"16px 28px 12px", borderBottom:"1px solid rgba(217,184,142,0.12)",
        display:"flex", alignItems:"center", gap:20, zIndex:2,
      }}>
        <div>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#D9B88E", letterSpacing:"0.2em", textTransform:"uppercase", opacity:0.75}}>
            System · 全景画板
          </div>
          <h1 style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:22, fontWeight:500, margin:"2px 0 0", color:"#F3ECDD", letterSpacing:"-0.01em"}}>
            从一场会议,到一生积累
          </h1>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex", gap:4, background:"rgba(217,184,142,0.08)", border:"1px solid rgba(217,184,142,0.2)", borderRadius:8, padding:4}}>
          {views.map(v=>{
            const active = v.id===view;
            return (
              <button key={v.id} onClick={()=>setView(v.id)} style={{
                padding:"7px 13px", border:0, borderRadius:5, cursor:"pointer",
                background: active ? "#D9B88E" : "transparent",
                color: active ? "#0F0E15" : "#D9B88E",
                fontFamily:"var(--serif)", fontStyle: active?"normal":"italic",
                fontSize:12.5, fontWeight: active?600:500, lineHeight:1.15,
                display:"flex", flexDirection:"column", alignItems:"flex-start",
              }}>
                <span>{v.label}</span>
                <span style={{fontSize:9, opacity:0.65, fontFamily:"var(--mono)", fontStyle:"normal", letterSpacing:0.3}}>
                  {v.sub}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div style={{flex:1, minHeight:0, position:"relative", zIndex:1}}>
        {view==="furnace"  && <FurnaceView revealed={revealed}/>}
        {view==="timeline" && <TimelineView revealed={revealed}/>}
        {view==="iceberg"  && <IcebergView revealed={revealed}/>}
      </div>

      <footer style={{
        padding:"8px 28px", borderTop:"1px solid rgba(217,184,142,0.12)",
        display:"flex", gap:18, fontSize:10, color:"rgba(232,227,216,0.5)",
        fontFamily:"var(--mono)", letterSpacing:0.3,
      }}>
        {PRISMS.map(p=>(
          <span key={p.id} style={{display:"inline-flex", alignItems:"center", gap:5}}>
            <span style={{width:6, height:6, borderRadius:99, background:p.color}}/>
            {p.label}
          </span>
        ))}
        <div style={{marginLeft:"auto"}}>4 源 · 5 组步骤 · 12 产出 · 6 棱镜</div>
      </footer>
    </div>
  );
}

function StarDust() {
  return (
    <svg style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", opacity:0.35, zIndex:0}}>
      {[...Array(40)].map((_,i)=>{
        const x = (i*97)%100, y = (i*53)%100;
        return (
          <circle key={i} cx={`${x}%`} cy={`${y}%`} r={0.5+(i%3)*0.3} fill="#E8E3D8" opacity={0.2+(i%5)*0.1}>
            <animate attributeName="opacity" values="0.1;0.4;0.1" dur={`${3+i%4}s`} repeatCount="indefinite" begin={`${i*0.1}s`}/>
          </circle>
        );
      })}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════
// View A · 熔炉（六棱镜切扇区 · CEO 为心）
// ═════════════════════════════════════════════════════════
function FurnaceView({ revealed }) {
  const size = 680;
  const cx = size/2, cy = size/2;
  // 四层半径（从外到内：数据源 / 加工 / 产出 / 应用 / 核心）
  const rings = [
    { key:"app",    outer: 130, inner:  70, label:"应用",       z:4, field:"app" },
    { key:"output", outer: 205, inner: 135, label:"产出",       z:3, field:"output" },
    { key:"step",   outer: 280, inner: 210, label:"加工",       z:2, field:"step" },
    { key:"source", outer: 340, inner: 285, label:"数据源",     z:1, field:"source" },
  ];

  // 扇区角度（6 份）
  const sectorAngle = (2*Math.PI) / 6;

  return (
    <div style={{height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:10, overflow:"auto"}}>
      <div style={{
        position:"relative", width:size, height:size,
        opacity: revealed?1:0, transform: revealed?"scale(1)":"scale(0.92)",
        transition:"opacity 700ms ease, transform 900ms cubic-bezier(.2,.7,.3,1)",
      }}>
        <svg width={size} height={size} style={{position:"absolute", inset:0}}>
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F3ECDD" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#F3ECDD" stopOpacity="0"/>
            </radialGradient>
          </defs>

          {/* 6 扇区底色（淡） — 从最内到最外画一层 */}
          {PRISMS.map((p, si)=>{
            const a0 = si*sectorAngle - Math.PI/2;
            const a1 = (si+1)*sectorAngle - Math.PI/2;
            const rOuter = 340, rInner = 68;
            const path = sectorPath(cx, cy, rInner, rOuter, a0, a1);
            return (
              <path key={p.id} d={path} fill={p.tint} stroke={p.color} strokeOpacity="0.25" strokeWidth="1"/>
            );
          })}

          {/* 环分隔线（4 圈） */}
          {rings.map((r,i)=>(
            <circle key={i} cx={cx} cy={cy} r={r.outer} fill="none"
              stroke="#F3ECDD" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 3"/>
          ))}

          {/* 径向分隔线（6 条） */}
          {PRISMS.map((p, si)=>{
            const a = si*sectorAngle - Math.PI/2;
            const x1 = cx + Math.cos(a)*70;
            const y1 = cy + Math.sin(a)*70;
            const x2 = cx + Math.cos(a)*340;
            const y2 = cy + Math.sin(a)*340;
            return (
              <line key={p.id} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#F3ECDD" strokeOpacity="0.1" strokeWidth="1"/>
            );
          })}

          {/* 中心光晕 */}
          <circle cx={cx} cy={cy} r="60" fill="url(#core-glow)"/>
        </svg>

        {/* 核心 · CEO */}
        <div style={{
          position:"absolute", left:cx-50, top:cy-50, width:100, height:100, borderRadius:"50%",
          background:"linear-gradient(135deg, #D9B88E, #C89A6B)", color:"#0F0E15",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          boxShadow:"0 0 40px rgba(217,184,142,0.5)", zIndex:5,
        }}>
          <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13, fontWeight:600}}>CEO</div>
          <div style={{fontSize:8.5, fontFamily:"var(--mono)", letterSpacing:0.5, marginTop:2, opacity:0.75}}>决策与认知</div>
        </div>

        {/* 每个扇区 × 每一环的代表节点 */}
        {PRISMS.map((p, si)=>{
          const midAngle = (si + 0.5)*sectorAngle - Math.PI/2;
          return rings.map((ring, ri)=>{
            const r = (ring.outer + ring.inner)/2;
            const x = cx + Math.cos(midAngle)*r;
            const y = cy + Math.sin(midAngle)*r;
            const txt = SECTORS[p.id][ring.field];
            return (
              <div key={`${p.id}-${ring.key}`} style={{
                position:"absolute", left:x-52, top:y-16, width:104, minHeight:32,
                padding:"4px 6px", borderRadius:4,
                background:"rgba(15,14,21,0.88)",
                border:`1px solid ${p.color}55`,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                opacity:revealed?1:0,
                transform:revealed?"scale(1)":"scale(0.7)",
                transition:`opacity 500ms ${(4-ri)*180 + si*30}ms ease, transform 500ms ${(4-ri)*180 + si*30}ms ease`,
                zIndex: 4,
                textAlign:"center",
              }}>
                {ring.key==="app" && (
                  <span style={{fontSize:14, marginBottom:2}}>{p.icon}</span>
                )}
                <div style={{fontSize:9.5, color:"#F3ECDD", fontWeight:500, lineHeight:1.25,
                  whiteSpace:"normal", overflow:"hidden"}}>
                  {txt}
                </div>
              </div>
            );
          });
        })}

        {/* 环名标签 · 右侧 */}
        {rings.map((r,i)=>(
          <div key={`lbl-${i}`} style={{
            position:"absolute", left:cx + (r.outer+r.inner)/2 - 18, top:cy + r.outer - 6,
            fontFamily:"var(--mono)", fontSize:9, letterSpacing:0.4,
            color:"rgba(232,227,216,0.55)", textTransform:"uppercase",
            padding:"1px 5px", background:"#0F0E15", borderRadius:2,
          }}>{r.label}</div>
        ))}

        {/* 扇区名 · 外围 */}
        {PRISMS.map((p, si)=>{
          const midAngle = (si + 0.5)*sectorAngle - Math.PI/2;
          const x = cx + Math.cos(midAngle)*(340+16);
          const y = cy + Math.sin(midAngle)*(340+16);
          return (
            <div key={`pname-${p.id}`} style={{
              position:"absolute", left:x-40, top:y-12, width:80, textAlign:"center",
              fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13, color:p.color, fontWeight:600,
              textShadow:"0 0 8px #0F0E15",
            }}>
              {p.icon} {p.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sectorPath(cx, cy, rIn, rOut, a0, a1){
  const large = (a1-a0) > Math.PI ? 1 : 0;
  const x0 = cx + Math.cos(a0)*rOut, y0 = cy + Math.sin(a0)*rOut;
  const x1 = cx + Math.cos(a1)*rOut, y1 = cy + Math.sin(a1)*rOut;
  const x2 = cx + Math.cos(a1)*rIn,  y2 = cy + Math.sin(a1)*rIn;
  const x3 = cx + Math.cos(a0)*rIn,  y3 = cy + Math.sin(a0)*rIn;
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}

// ═════════════════════════════════════════════════════════
// View B · 时间轴（四列 × 三行结构 · 列内列间有连线）
// ═════════════════════════════════════════════════════════
function TimelineView({ revealed }) {
  const columns = [
    { title:"T+0 · 瞬间",        sub:"会议发生",        color:"#7BA7C4",
      rows:{ step:null, output:null, source: SOURCES.map(s=>s.label) } },
    { title:"T+20min · 解析",     sub:"加工与产出",      color:"#D9B88E",
      rows:{ step: STEP_GROUPS.slice(0,3).map(s=>s.label), output: OUTPUTS_ALL.slice(0,5), source:null } },
    { title:"T+1 周 · 阅读",      sub:"六棱镜读法",      color:"#C8E1D2",
      rows:{ step: STEP_GROUPS.slice(3).map(s=>s.label), output: OUTPUTS_ALL.slice(5,9), source:null } },
    { title:"T+1 年 · 积累",      sub:"永久资产",        color:"#E6A6A6",
      rows:{ step:null, output: OUTPUTS_ALL.slice(9), source:null, app: PRISMS.map(p=>`${p.icon} ${p.label} · ${p.room}`) } },
  ];

  return (
    <div style={{
      height:"100%", padding:"20px 28px 16px",
      display:"flex", flexDirection:"column", gap:10, position:"relative",
    }}>
      {/* 时间之河 */}
      <div style={{
        position:"absolute", top:10, left:28, right:28, height:2,
        background:"linear-gradient(90deg, #7BA7C4, #D9B88E 33%, #C8E1D2 66%, #E6A6A6)",
        opacity:revealed?0.7:0, transition:"opacity 1.2s ease",
        boxShadow:"0 0 12px rgba(217,184,142,0.4)", zIndex:1,
      }}>
        <div style={{
          position:"absolute", top:-3, left:0, width:8, height:8, borderRadius:99,
          background:"#F3ECDD", boxShadow:"0 0 10px #F3ECDD",
          animation:"river-flow 10s linear infinite",
        }}/>
        <style>{`@keyframes river-flow { 0%{left:0;} 100%{left:calc(100% - 8px);} }`}</style>
      </div>

      {/* 列标题 */}
      <div style={{display:"grid", gridTemplateColumns:"80px repeat(4, 1fr)", gap:14, marginTop:18}}>
        <div/>
        {columns.map((c,i)=>(
          <div key={i} style={{
            opacity: revealed?1:0, transform: revealed?"translateY(0)":"translateY(-8px)",
            transition:`all 500ms ${i*100}ms ease`,
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:c.color, letterSpacing:"0.2em", textTransform:"uppercase"}}>
              {c.sub}
            </div>
            <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:15, color:"#F3ECDD", marginTop:2}}>
              {c.title}
            </div>
          </div>
        ))}
      </div>

      {/* 三行 × 四列网格 */}
      <div style={{flex:1, minHeight:0, display:"grid", gridTemplateRows:"1fr 1fr 1fr 1fr", gap:10, overflow:"hidden"}}>
        <TimelineRow label="数据源" field="source" columns={columns} revealed={revealed} delay={200}/>
        <TimelineRow label="加工" field="step" columns={columns} revealed={revealed} delay={350}/>
        <TimelineRow label="产出" field="output" columns={columns} revealed={revealed} delay={500}/>
        <TimelineRow label="应用" field="app" columns={columns} revealed={revealed} delay={650}/>
      </div>
    </div>
  );
}

function TimelineRow({ label, field, columns, revealed, delay }) {
  const rowColor = {
    source:"#7BA7C4", step:"#D9B88E", output:"#C8E1D2", app:"#E6A6A6",
  }[field];
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"80px repeat(4, 1fr)", gap:14,
      borderTop:"1px dashed rgba(232,227,216,0.08)", paddingTop:8,
      opacity: revealed?1:0, transition:`opacity 600ms ${delay}ms ease`,
    }}>
      <div style={{
        fontFamily:"var(--mono)", fontSize:10, color:rowColor, letterSpacing:"0.2em", textTransform:"uppercase",
        display:"flex", alignItems:"flex-start", paddingTop:6,
      }}>
        {label}
      </div>
      {columns.map((col, ci)=>{
        const items = col.rows[field];
        if (!items) return <div key={ci} style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.2)",
        }}>—</div>;
        return (
          <div key={ci} style={{display:"flex", flexDirection:"column", gap:5, overflowY:"auto"}}>
            {items.map((it,ii)=>(
              <div key={ii} style={{
                padding:"5px 8px", borderRadius:3,
                background:"rgba(232,227,216,0.04)",
                borderLeft:`2px solid ${rowColor}`,
                fontSize:11, color:"#F3ECDD", lineHeight:1.35,
              }}>{it}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// View C · 冰山
// ═════════════════════════════════════════════════════════
function IcebergView({ revealed }) {
  return (
    <div style={{height:"100%", display:"flex", flexDirection:"column", padding:"20px 28px", overflow:"auto"}}>
      <div style={{flex:"0 0 auto", marginBottom:6, opacity:revealed?1:0, transform:revealed?"translateY(0)":"translateY(-12px)", transition:"all 700ms ease"}}>
        <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#C8E1D2", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6}}>
          水面以上 · CEO 看见的（6 个棱镜房间）
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:8}}>
          {PRISMS.map(p=>(
            <div key={p.id} style={{
              padding:"10px 8px", background:p.tint,
              border:`1px solid ${p.color}55`, borderRadius:4, textAlign:"center",
            }}>
              <div style={{fontSize:18}}>{p.icon}</div>
              <div style={{fontSize:11, color:"#F3ECDD", marginTop:4, lineHeight:1.3, fontWeight:500}}>{p.label}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:8.5, color:p.color, marginTop:2, opacity:0.8}}>
                {p.room}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        height:6, background:"linear-gradient(180deg, rgba(123,167,196,0.05), rgba(123,167,196,0.4), rgba(123,167,196,0.05))",
        borderRadius:99, margin:"6px 0", position:"relative",
        opacity:revealed?1:0, transition:"opacity 800ms 400ms ease",
      }}>
        <div style={{position:"absolute", top:-8, left:0, right:0, textAlign:"center",
          fontFamily:"var(--serif)", fontStyle:"italic", fontSize:10,
          color:"rgba(123,167,196,0.8)", letterSpacing:0.5,
        }}>≈ 水面 · surface ≈</div>
      </div>

      <div style={{flex:1, minHeight:0, display:"flex", flexDirection:"column", gap:10,
        opacity:revealed?1:0, transform:revealed?"translateY(0)":"translateY(12px)",
        transition:"all 800ms 500ms ease"}}>
        <IcebergLayer label="产出层 · 12 物" items={OUTPUTS_ALL} color="#C8E1D2" depth={0.75}/>
        <IcebergLayer label="加工层 · 5 组 / 11 步" items={STEP_GROUPS.map(s=>`${s.members} · ${s.label}`)} color="#D9B88E" depth={0.55}/>
        <IcebergLayer label="数据源 · 4 类" items={SOURCES.map(s=>s.label)} color="#7BA7C4" depth={0.35}/>
      </div>
    </div>
  );
}

function IcebergLayer({ label, items, color, depth }) {
  return (
    <div>
      <div style={{fontFamily:"var(--mono)", fontSize:9.5, color, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:5, opacity:depth+0.3}}>
        {label}
      </div>
      <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
        {items.map((x,i)=>(
          <div key={i} style={{
            padding:"5px 9px", borderRadius:3,
            background:`rgba(15,14,21,${0.2+(1-depth)*0.4})`,
            border:`1px solid ${color}${Math.floor(depth*255).toString(16).padStart(2,'0')}`,
            fontSize:10.5, color:"#F3ECDD", opacity: depth+0.3,
          }}>{x}</div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { PanoramaBoard });
