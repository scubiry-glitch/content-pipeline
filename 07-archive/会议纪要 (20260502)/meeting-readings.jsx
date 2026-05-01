// meeting-readings.jsx — 单场纪要 · 4 读法切换器
// 概览(继承 A) / 时间线(工作台) / 决策树(工作台) / 张力流(对话)
// 4 读法 = 同一份数据的 4 种目录结构,风格内化

const READINGS = [
  { id:"overview", label:"概览",     en:"Overview",   icon:"◫", tone:"#1F1B16",
    hint:"这场会发生了什么 · 三段式" },
  { id:"timeline", label:"时间线",   en:"Timeline",   icon:"│", tone:"#2C5F7F",
    hint:"这场会怎么展开的 · 按时序" },
  { id:"tree",     label:"决策树",   en:"Decision",   icon:"⊢", tone:"#8A5A1A",
    hint:"这场会决定了什么 · 以决策为根" },
  { id:"threads",  label:"张力流",   en:"Threads",    icon:"≋", tone:"#B54545",
    hint:"这场会争了什么 · 以分歧为线" },
];

// ──────────────────────────────────────────────
// 顶部切换器 · Reading Switcher
// ──────────────────────────────────────────────
function ReadingSwitcher({ active, onChange }) {
  return (
    <div style={{
      padding:"14px 24px", background:"linear-gradient(180deg, #FDFBF5 0%, #F5F0E5 100%)",
      borderBottom:"1px solid rgba(31,27,22,0.1)",
      display:"flex", alignItems:"center", gap:2,
    }}>
      <div style={{marginRight:20}}>
        <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"#8A7C6A", letterSpacing:"0.22em", textTransform:"uppercase"}}>
          读法 · Reading
        </div>
        <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13, color:"#3A3228", marginTop:2}}>
          换一个角度看这场会
        </div>
      </div>
      <div style={{display:"flex", gap:4}}>
        {READINGS.map(r=>{
          const isActive = r.id===active;
          return (
            <button key={r.id} onClick={()=>onChange(r.id)} style={{
              padding:"8px 14px 8px 12px", borderRadius:5, cursor:"pointer",
              background: isActive ? r.tone : "transparent",
              color: isActive ? "#FDFBF5" : "#5A5146",
              border: isActive ? `1px solid ${r.tone}` : "1px solid rgba(31,27,22,0.15)",
              fontFamily:"var(--serif)", fontSize:13.5, fontWeight: isActive?600:500,
              fontStyle: isActive?"normal":"italic",
              display:"flex", alignItems:"center", gap:8,
              transition:"all 200ms",
            }}>
              <span style={{fontFamily:"var(--mono)", fontSize:15, fontWeight:600}}>{r.icon}</span>
              {r.label}
              <span style={{
                fontFamily:"var(--mono)", fontSize:9, fontWeight:400, opacity: isActive?0.7:0.5,
                letterSpacing:0.3, fontStyle:"normal",
              }}>
                {r.en}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{flex:1}}/>
      <div style={{
        fontFamily:"var(--serif)", fontStyle:"italic", fontSize:12, color:"#8A7C6A",
        paddingLeft:14, borderLeft:"1px solid rgba(31,27,22,0.1)",
      }}>
        {READINGS.find(r=>r.id===active)?.hint}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Reading #1 · 概览 (轻量版 Editorial)
// ──────────────────────────────────────────────
function ReadingOverview() {
  return (
    <div style={{padding:"32px 48px 56px", background:"#FDFBF5", color:"#1F1B16", fontFamily:"var(--serif)"}}>
      <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:"0.2em", textTransform:"uppercase"}}>
        2026-04-11 · 118 分钟 · 6 人
      </div>
      <h1 style={{fontSize:34, fontWeight:500, margin:"8px 0 8px", letterSpacing:"-0.015em", maxWidth:820, lineHeight:1.2}}>
        2026 Q2 远翎资本 · AI 基础设施投资策略评审
      </h1>
      <p style={{fontSize:15, fontStyle:"italic", color:"#5A5146", maxWidth:740, lineHeight:1.6, margin:"0 0 28px"}}>
        陈汀与沈岚在会议中途显露出不同的优先级 —— 前者担心 10 亿美金头部项目的估值泡沫,后者坚持"在 AI 基础层必须有一笔重仓"。
        Wei Tan 以二阶思考者的身份三次打断讨论,追问"如果英伟达持续垄断,我们今天的押注在 5 年后意味着什么"。
      </p>

      {/* 三段式卡片 */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:18, maxWidth:1120}}>
        {[
          { k:"决策", en:"Decisions", n:3, tone:"#8A5A1A",
            items:["暂缓 $1B+ 明星项目的跟投(3:1 支持)", "在基础模型层保留 1 个 $200M 级仓位", "下月起 GPU 供应研究转为常驻议题"] },
          { k:"张力", en:"Tensions", n:4, tone:"#B54545",
            items:["陈汀 vs 沈岚: 估值风险 vs 错过机会", "Wei Tan vs 全体: 二阶思考 vs 行动偏向", "林雾(LP)沉默 · 未表态", "是否接受垂直模型败退的假设"] },
          { k:"承诺", en:"Commitments", n:5, tone:"#2C5F7F",
            items:["沈岚 4/18 前给出 2 个具体标的", "Wei Tan 4/25 前提交垄断风险分析", "周劭然 会后 48h 内 v2 纪要", "Omar K. 5/1 前行业会议代表参加", "林雾 下次会议前与 LP 对齐"] },
        ].map((c,i)=>(
          <div key={i} style={{
            padding:"18px 22px", background:"#F5F0E5",
            border:`1px solid ${c.tone}30`, borderLeft:`3px solid ${c.tone}`, borderRadius:3,
          }}>
            <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"var(--mono)", fontSize:10, color:c.tone, letterSpacing:"0.25em", textTransform:"uppercase"}}>{c.en}</div>
                <div style={{fontSize:22, fontWeight:600, marginTop:4, color:c.tone}}>{c.k}</div>
              </div>
              <div style={{fontSize:36, fontWeight:500, color:c.tone, lineHeight:1, fontStyle:"italic"}}>{c.n}</div>
            </div>
            <div style={{marginTop:14, paddingTop:12, borderTop:`1px dashed ${c.tone}33`}}>
              {c.items.map((t,ti)=>(
                <div key={ti} style={{fontSize:13, color:"#3A3228", padding:"6px 0", borderBottom:ti<c.items.length-1?"1px dotted rgba(31,27,22,0.1)":"none", lineHeight:1.5}}>
                  <span style={{fontFamily:"var(--mono)", fontSize:10, color:c.tone, marginRight:6}}>{String(ti+1).padStart(2,"0")}</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 底部元信息 */}
      <div style={{
        marginTop:26, padding:"14px 20px", background:"#F5F0E5",
        border:"1px solid rgba(31,27,22,0.08)", borderRadius:3, maxWidth:1120,
        display:"flex", alignItems:"center", gap:28, fontFamily:"var(--mono)", fontSize:11, color:"#5A5146",
      }}>
        <span>📎 zoom-recording-237.m4a · 118 min</span>
        <span>📝 会议纪要初稿.docx</span>
        <span>🎯 召唤专家 3 位 · 已接受 2</span>
        <span style={{color:"#B54545"}}>⚠ 2 个承诺逾期风险</span>
        <span style={{flex:1}}/>
        <span style={{color:"#8A5A1A"}}>切换读法获取不同角度 →</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Reading #2 · 时间线 (Workbench 风)
// ──────────────────────────────────────────────
const TIMELINE = [
  { t:"00:00", kind:"启动",  sp:"陈汀",    tone:"#2C5F7F", text:"今天评审 AI 基础设施的仓位配置,核心议题是头部项目的估值问题",  tag:"议程" },
  { t:"00:12", kind:"数据",  sp:"周劭然",  tone:"#8A7C6A", text:"过去 6 个月头部项目估值中位数从 $4.8B 升至 $11.2B",       tag:"背景" },
  { t:"00:28", kind:"主张",  sp:"沈岚",    tone:"#8A5A1A", text:"在基础模型层我们必须有一笔重仓,否则五年后会后悔",          tag:"核心立场" },
  { t:"00:34", kind:"反驳",  sp:"陈汀",    tone:"#B54545", text:"后悔比亏钱便宜。现在入场等于在泡沫顶部",                  tag:"张力 #1" },
  { t:"00:41", kind:"追问",  sp:"Wei Tan", tone:"#4A5563", text:"如果英伟达持续垄断,我们今天的押注 5 年后意味着什么?",    tag:"二阶思考" },
  { t:"00:55", kind:"沉默",  sp:"林雾",    tone:"#8A7C6A", text:"[LP 代表全程未表态 · 会后私下问陈汀]",                    tag:"沉默信号" },
  { t:"01:08", kind:"假设",  sp:"Omar K.", tone:"#2C5F7F", text:"假设垂直模型的商业化在 2027 前不兑现,我们的 portfolio…",    tag:"反事实" },
  { t:"01:22", kind:"共识",  sp:"全体",    tone:"#4D7C4D", text:"至少在头部 $1B+ 项目上暂缓跟投 —— 3 票支持 1 票反对",       tag:"决策 #1" },
  { t:"01:38", kind:"承诺",  sp:"沈岚",    tone:"#2C5F7F", text:"4/18 前提交 2 个具体标的,带竞品对位分析",                 tag:"承诺" },
  { t:"01:45", kind:"承诺",  sp:"Wei Tan", tone:"#2C5F7F", text:"4/25 前提交《英伟达垄断下的风险分析》白皮书",             tag:"承诺" },
  { t:"01:52", kind:"悬置",  sp:"陈汀",    tone:"#8A5A1A", text:"LP 的预期沟通这件事,下次会之前定",                        tag:"未解问题" },
  { t:"01:58", kind:"结束",  sp:"陈汀",    tone:"#8A7C6A", text:"谢谢大家。下周二同一时间继续。",                          tag:"收束" },
];

function ReadingTimeline() {
  return (
    <div style={{padding:"28px 48px 60px", background:"#F9F7F1", color:"#1F1B16", fontFamily:"var(--sans)"}}>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:20, maxWidth:1120}}>
        <div>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:"0.2em", textTransform:"uppercase"}}>
            Timeline · 118 分钟 · 12 个关键节点
          </div>
          <h2 style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:24, fontWeight:600, margin:"4px 0 0", color:"#1F1B16"}}>
            这场会是怎么展开的
          </h2>
        </div>
        <div style={{display:"flex", gap:6}}>
          {["全部","张力","决策","承诺","沉默"].map((f,i)=>(
            <button key={f} style={{
              padding:"5px 11px", borderRadius:3, cursor:"pointer",
              background: i===0 ? "#1F1B16" : "transparent",
              color: i===0 ? "#FDFBF5" : "#5A5146",
              border: i===0 ? 0 : "1px solid rgba(31,27,22,0.2)",
              fontFamily:"var(--mono)", fontSize:10.5, letterSpacing:0.3,
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* 垂直时间轴 */}
      <div style={{position:"relative", maxWidth:1120, paddingLeft:100}}>
        {/* 竖线 */}
        <div style={{position:"absolute", left:98, top:0, bottom:0, width:1, background:"rgba(31,27,22,0.15)"}}/>

        {TIMELINE.map((e,i)=>(
          <div key={i} style={{position:"relative", padding:"0 0 14px 22px"}}>
            {/* 时间戳 */}
            <div style={{
              position:"absolute", left:-100, top:6, width:74, textAlign:"right",
              fontFamily:"var(--mono)", fontSize:11, color:"#8A7C6A",
            }}>
              {e.t}
            </div>
            {/* 节点 */}
            <div style={{
              position:"absolute", left:-6, top:8, width:12, height:12, borderRadius:"50%",
              background:e.tone, border:"2px solid #F9F7F1", boxShadow:`0 0 0 1px ${e.tone}`,
            }}/>

            {/* 卡片 */}
            <div style={{
              background:"#FDFBF5", border:"1px solid rgba(31,27,22,0.1)", borderLeft:`3px solid ${e.tone}`,
              padding:"10px 14px 12px", borderRadius:3,
            }}>
              <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:4}}>
                <span style={{
                  fontFamily:"var(--mono)", fontSize:9, color:e.tone, letterSpacing:0.3, textTransform:"uppercase",
                  padding:"2px 7px", background:`${e.tone}18`, border:`1px solid ${e.tone}44`, borderRadius:2,
                }}>{e.kind}</span>
                <span style={{fontFamily:"var(--serif)", fontSize:13, color:"#3A3228", fontWeight:600}}>{e.sp}</span>
                <div style={{flex:1}}/>
                <span style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A"}}>{e.tag}</span>
              </div>
              <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14, color:"#1F1B16", lineHeight:1.55}}>
                "{e.text}"
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Reading #3 · 决策树 (Workbench · SVG 图)
// ──────────────────────────────────────────────
function ReadingTree() {
  // 决策树:1 个根 → 3 个分支(采纳/否决/悬置) → 各自的子节点
  return (
    <div style={{padding:"28px 48px 60px", background:"#FCFAF4", color:"#1F1B16", fontFamily:"var(--sans)"}}>
      <div style={{marginBottom:20, maxWidth:1120}}>
        <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:"0.2em", textTransform:"uppercase"}}>
          Decision Tree · 1 个主决策 · 3 分支 · 2 悬置
        </div>
        <h2 style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:24, fontWeight:600, margin:"4px 0 0", color:"#1F1B16"}}>
          这场会决定了什么
        </h2>
      </div>

      {/* 决策树 SVG + DOM 叠加 */}
      <div style={{
        position:"relative", background:"#FDFBF5", border:"1px solid rgba(31,27,22,0.1)", borderRadius:5,
        padding:"32px 28px 40px", maxWidth:1140,
      }}>
        {/* SVG 连线 */}
        <svg style={{position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none"}} viewBox="0 0 1080 500" preserveAspectRatio="none">
          {/* 主干 → 3 分支 */}
          <path d="M 540 85 Q 540 130 260 170" stroke="#4D7C4D" strokeWidth="2" fill="none"/>
          <path d="M 540 85 Q 540 130 540 170" stroke="#8A5A1A" strokeWidth="2" fill="none"/>
          <path d="M 540 85 Q 540 130 820 170" stroke="#B54545" strokeWidth="2" fill="none"/>
          {/* 采纳分支 2 个子 */}
          <path d="M 260 225 Q 260 270 150 310" stroke="#4D7C4D" strokeWidth="1.5" fill="none" opacity="0.7"/>
          <path d="M 260 225 Q 260 270 370 310" stroke="#4D7C4D" strokeWidth="1.5" fill="none" opacity="0.7"/>
          {/* 悬置分支 2 个子 */}
          <path d="M 540 225 Q 540 270 540 310" stroke="#8A5A1A" strokeWidth="1.5" fill="none" opacity="0.7" strokeDasharray="4 3"/>
          {/* 否决分支 1 个 */}
          <path d="M 820 225 Q 820 270 820 310" stroke="#B54545" strokeWidth="1.5" fill="none" opacity="0.7"/>
        </svg>

        {/* 根节点 · 主决策 */}
        <TreeNode x="50%" y={30} kind="root"  title="AI 基础设施该不该在 Q2 重仓?"
          sub="主决策 · 由沈岚在 00:28 提出 · 118 分钟讨论" tone="#1F1B16"/>

        {/* 3 分支 */}
        <TreeNode x="24%" y={170} kind="branch" title="采纳" tone="#4D7C4D"
          sub="3:1 通过" meta="基础模型层保留 $200M"/>
        <TreeNode x="50%" y={170} kind="branch" title="悬置" tone="#8A5A1A"
          sub="未表决" meta="LP 预期沟通"/>
        <TreeNode x="76%" y={170} kind="branch" title="否决" tone="#B54545"
          sub="3:1 否决" meta="$1B+ 明星项目暂缓跟投"/>

        {/* 采纳子节点 */}
        <TreeNode x="14%" y={310} kind="leaf" title="沈岚承诺" tone="#4D7C4D"
          sub="4/18 · 2 个具体标的"/>
        <TreeNode x="34%" y={310} kind="leaf" title="GPU 供应" tone="#4D7C4D"
          sub="下月起常驻议题"/>

        {/* 悬置子节点 */}
        <TreeNode x="50%" y={310} kind="leaf" title="未解问题" tone="#8A5A1A"
          sub="LP 是否接受垂直模型败退假设"/>

        {/* 否决子节点 */}
        <TreeNode x="76%" y={310} kind="leaf" title="Wei Tan 任务" tone="#B54545"
          sub="4/25 · 英伟达垄断白皮书"/>

        {/* 图例 */}
        <div style={{
          position:"absolute", right:16, bottom:12, display:"flex", gap:14,
          fontFamily:"var(--mono)", fontSize:10, color:"#5A5146",
        }}>
          <span style={{display:"flex", alignItems:"center", gap:5}}>
            <div style={{width:8, height:8, borderRadius:99, background:"#4D7C4D"}}/> 采纳
          </span>
          <span style={{display:"flex", alignItems:"center", gap:5}}>
            <div style={{width:8, height:8, borderRadius:99, background:"#8A5A1A"}}/> 悬置 (虚线)
          </span>
          <span style={{display:"flex", alignItems:"center", gap:5}}>
            <div style={{width:8, height:8, borderRadius:99, background:"#B54545"}}/> 否决
          </span>
        </div>
      </div>

      {/* 下方补充 · 未走的路 */}
      <div style={{
        marginTop:20, padding:"16px 20px", background:"#F5F0E5",
        border:"1px solid rgba(31,27,22,0.08)", borderLeft:"3px solid #8A5A1A", borderRadius:3,
        maxWidth:1140,
      }}>
        <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A5A1A", letterSpacing:"0.2em", textTransform:"uppercase"}}>
          未走的路 · Counterfactual
        </div>
        <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:15, color:"#1F1B16", marginTop:4, lineHeight:1.55}}>
          Omar K. 提出的"假设垂直模型商业化在 2027 前不兑现" —— 未被展开讨论就被陈汀带回主议题。
          <span style={{color:"#8A7C6A", fontSize:12.5}}> Wei Tan 的白皮书可能会回答这个分支。</span>
        </div>
      </div>
    </div>
  );
}
function TreeNode({ x, y, kind, title, sub, meta, tone }) {
  const isRoot = kind==="root";
  const isBranch = kind==="branch";
  return (
    <div style={{
      position:"absolute", left:x, top:y, transform:"translate(-50%, 0)",
      minWidth: isRoot?360: isBranch?170:160,
      padding: isRoot?"10px 18px": isBranch?"8px 14px":"7px 12px",
      background:"#FDFBF5",
      border:`${isRoot?2:1.5}px solid ${tone}`,
      borderRadius: isRoot?4:3,
      textAlign:"center", zIndex:2,
      boxShadow: isRoot ? `0 2px 6px ${tone}22` : "0 1px 3px rgba(31,27,22,0.06)",
    }}>
      <div style={{
        fontFamily:"var(--serif)", fontSize: isRoot?16: isBranch?14:12.5,
        fontWeight:600, color: tone, letterSpacing: isRoot?-0.3:0,
        fontStyle: isRoot?"italic":"normal",
      }}>
        {title}
      </div>
      {sub && <div style={{
        fontFamily:"var(--mono)", fontSize: isRoot?10.5:10, color:"#5A5146",
        marginTop:3, letterSpacing:0.2,
      }}>{sub}</div>}
      {meta && <div style={{
        fontFamily:"var(--serif)", fontStyle:"italic", fontSize:11.5, color:"#3A3228",
        marginTop:4, paddingTop:4, borderTop:`1px dashed ${tone}44`,
      }}>{meta}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────
// Reading #4 · 张力流 (Threads 风)
// ──────────────────────────────────────────────
const TENSIONS = [
  {
    id:1, title:"估值风险 vs 错过机会",
    tension:0.82, between:["陈汀","沈岚"], resolution:"部分采纳沈岚",
    arc:[
      { sp:"沈岚", tone:"#8A5A1A", text:"在基础模型层我们必须有一笔重仓,否则五年后会后悔", t:"00:28" },
      { sp:"陈汀", tone:"#B54545", text:"后悔比亏钱便宜。现在入场等于在泡沫顶部", t:"00:34" },
      { sp:"Wei Tan", tone:"#4A5563", text:"[打断] 我们在讨论什么问题 —— 要不要投,还是要不要在头部投?", t:"00:41" },
      { sp:"沈岚", tone:"#8A5A1A", text:"好吧。那就 $200M 在基础层,不追头部", t:"01:14" },
      { sp:"全体", tone:"#4D7C4D", text:"3 票支持这个切分 · 1 票反对(陈汀仍坚持零仓位)", t:"01:22", kind:"consensus" },
    ]
  },
  {
    id:2, title:"二阶思考 vs 行动偏向",
    tension:0.68, between:["Wei Tan","全场"], resolution:"接受 Wei Tan 的风险问题作为独立研究",
    arc:[
      { sp:"Wei Tan", tone:"#4A5563", text:"如果英伟达持续垄断,我们今天的押注在 5 年后意味着什么?", t:"00:41" },
      { sp:"陈汀", tone:"#B54545", text:"这个问题每次都问,每次都没答案,但每次都让讨论慢下来", t:"00:44" },
      { sp:"Omar K.", tone:"#2C5F7F", text:"也许慢下来是对的 · 这个问题值得一份白皮书", t:"00:52" },
      { sp:"Wei Tan", tone:"#4A5563", text:"我 4/25 前交", t:"01:45", kind:"commit" },
    ]
  },
  {
    id:3, title:"LP 代表的沉默 · 是否该追问",
    tension:0.54, between:["林雾","陈汀"], resolution:"悬置 · 会后私下沟通",
    arc:[
      { sp:"林雾", tone:"#8A7C6A", text:"[全场未发言 · 但在关键投票前交换了眼神]", t:"00:55", kind:"silence" },
      { sp:"陈汀", tone:"#B54545", text:"林,你这边有什么要补充的?", t:"01:30" },
      { sp:"林雾", tone:"#8A7C6A", text:"我还在听。会后找你聊。", t:"01:31" },
      { sp:"—", tone:"#8A5A1A", text:"[未解 · 转为私下对齐]", t:"—", kind:"unresolved" },
    ]
  },
  {
    id:4, title:`是否接受"垂直模型败退"的假设`,
    tension:0.48, between:["Omar K.","全场"], resolution:"未展开 · 被带回主议题",
    arc:[
      { sp:"Omar K.", tone:"#2C5F7F", text:"假设垂直模型的商业化在 2027 前不兑现,我们的 portfolio…", t:"01:08" },
      { sp:"陈汀", tone:"#B54545", text:"我们先把今天这个决定敲定,这个假设下次单独讨论", t:"01:09" },
      { sp:"—", tone:"#8A5A1A", text:"[被带回主议题 · 未展开]", t:"—", kind:"unresolved" },
    ]
  },
];

function ReadingThreads() {
  return (
    <div style={{padding:"28px 48px 60px", background:"#FBF7EF", color:"#1F1B16", fontFamily:"var(--sans)"}}>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:20, maxWidth:1200}}>
        <div>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:"0.2em", textTransform:"uppercase"}}>
            Threads · 4 条张力线 · 2 解 / 1 悬置 / 1 未展开
          </div>
          <h2 style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:24, fontWeight:600, margin:"4px 0 0", color:"#1F1B16"}}>
            这场会到底在争什么
          </h2>
        </div>
        {/* 张力总量条 */}
        <div style={{minWidth:280}}>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:0.3, marginBottom:4}}>张力总指数</div>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <div style={{flex:1, height:4, background:"rgba(31,27,22,0.08)", borderRadius:99, overflow:"hidden"}}>
              <div style={{width:"63%", height:"100%", background:"linear-gradient(90deg, #4D7C4D, #8A5A1A, #B54545)"}}/>
            </div>
            <span style={{fontFamily:"var(--mono)", fontSize:13, color:"#8A5A1A", fontWeight:600}}>0.63</span>
          </div>
          <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:11, color:"#8A7C6A", marginTop:3}}>
            略高 · 但有建设性
          </div>
        </div>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:16, maxWidth:1200}}>
        {TENSIONS.map(t=>(
          <TensionThread key={t.id} t={t}/>
        ))}
      </div>
    </div>
  );
}
function TensionThread({ t }) {
  const resolved = t.resolution.includes("悬置") || t.resolution.includes("未展开");
  return (
    <div style={{
      background:"#FDFBF5", border:"1px solid rgba(31,27,22,0.1)",
      borderLeft:`3px solid ${resolved?"#8A5A1A":"#B54545"}`,
      borderRadius:5, padding:"16px 20px",
    }}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap"}}>
        <div style={{
          width:26, height:26, borderRadius:"50%",
          background:resolved?"#8A5A1A22":"#B5454522",
          border:`1px solid ${resolved?"#8A5A1A":"#B54545"}`,
          color:resolved?"#8A5A1A":"#B54545",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"var(--mono)", fontSize:12, fontWeight:600,
        }}>{t.id}</div>
        <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:18, fontWeight:600, color:"#1F1B16"}}>
          {t.title}
        </div>
        <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#5A5146", padding:"2px 8px", background:"rgba(31,27,22,0.05)", borderRadius:2, letterSpacing:0.3}}>
          {t.between.join(" ⇄ ")}
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:0.3}}>强度</span>
          <div style={{width:60, height:3, background:"rgba(31,27,22,0.1)", borderRadius:99, overflow:"hidden"}}>
            <div style={{width:`${t.tension*100}%`, height:"100%", background: t.tension>0.75?"#B54545":t.tension>0.5?"#8A5A1A":"#4D7C4D"}}/>
          </div>
          <span style={{fontFamily:"var(--mono)", fontSize:11, color:"#1F1B16", fontWeight:600}}>{t.tension.toFixed(2)}</span>
        </div>
      </div>

      {/* arc · 按时间线呈现的对话流 */}
      <div style={{display:"flex", flexDirection:"column", gap:6, marginLeft:8}}>
        {t.arc.map((a,ai)=>(
          <div key={ai} style={{
            display:"grid", gridTemplateColumns:"60px 90px 1fr", gap:12, alignItems:"baseline",
            padding:"6px 10px", borderLeft:`2px solid ${a.tone}`,
            background: a.kind==="consensus" ? "rgba(77,124,77,0.06)" :
                         a.kind==="commit" ? "rgba(44,95,127,0.06)" :
                         a.kind==="silence" ? "rgba(138,124,106,0.08)" :
                         a.kind==="unresolved" ? "rgba(138,90,26,0.06)" :
                         "transparent",
          }}>
            <span style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A"}}>{a.t}</span>
            <span style={{fontFamily:"var(--serif)", fontSize:13, fontWeight:600, color:a.tone}}>{a.sp}</span>
            <span style={{fontFamily:"var(--serif)", fontStyle: a.kind==="silence"||a.kind==="unresolved" ? "italic":"normal", fontSize:13.5, color:"#1F1B16", lineHeight:1.5}}>
              {(a.kind==="silence"||a.kind==="unresolved") ? a.text : `"${a.text}"`}
              {a.kind==="consensus" && <span style={{marginLeft:8, fontFamily:"var(--mono)", fontSize:10, color:"#4D7C4D"}}>· 达成共识</span>}
              {a.kind==="commit" && <span style={{marginLeft:8, fontFamily:"var(--mono)", fontSize:10, color:"#2C5F7F"}}>· 承诺</span>}
            </span>
          </div>
        ))}
      </div>

      {/* 结局 */}
      <div style={{
        marginTop:12, paddingTop:10, borderTop:"1px dashed rgba(31,27,22,0.15)",
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:0.3, textTransform:"uppercase"}}>结局</span>
        <span style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13, color:"#3A3228", fontWeight:500}}>
          {t.resolution}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 总容器 · ReadingPlayground
// ──────────────────────────────────────────────
function ReadingPlayground() {
  const [active, setActive] = React.useState("overview");
  return (
    <div style={{background:"#1F1B16", minHeight:"100%"}}>
      {/* 假的单场纪要顶栏 */}
      <div style={{
        padding:"14px 24px", background:"#1F1B16", color:"#FDFBF5",
        borderBottom:"1px solid rgba(253,251,245,0.1)",
        display:"flex", alignItems:"center", gap:14,
      }}>
        <a href="#" style={{fontFamily:"var(--mono)", fontSize:11, color:"rgba(253,251,245,0.55)", textDecoration:"none"}}>← 会议列表</a>
        <span style={{color:"rgba(253,251,245,0.25)"}}>/</span>
        <div>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(253,251,245,0.5)", letterSpacing:0.3}}>2026-04-11 · 118 min</div>
          <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600, fontStyle:"italic"}}>远翎资本 · AI 基础设施投资策略评审</div>
        </div>
        <div style={{flex:1}}/>
        <span style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(253,251,245,0.55)"}}>6 人 · 3 决策 · 4 张力 · 5 承诺</span>
      </div>

      <ReadingSwitcher active={active} onChange={setActive}/>
      {active==="overview" && <ReadingOverview/>}
      {active==="timeline" && <ReadingTimeline/>}
      {active==="tree"     && <ReadingTree/>}
      {active==="threads"  && <ReadingThreads/>}

      {/* 底部 · 三轴入口 */}
      <AxisFooter/>
    </div>
  );
}

function AxisFooter() {
  return (
    <div style={{
      padding:"22px 48px 28px", background:"#2A2420", color:"#FDFBF5",
      borderTop:"1px solid rgba(253,251,245,0.1)",
    }}>
      <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(253,251,245,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:12}}>
        继续深入 · 三轴 (Library View)
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, maxWidth:1200}}>
        {[
          { axis:"人物轴", c:"#D64545", tabs:["承诺与兑现","角色画像演化","发言质量","沉默信号(+RASIC)","信念轨迹","阵型 · 新","盲区档案 · 新"] },
          { axis:"项目轴", c:"#7BA7C4", tabs:["决策溯源(链+树)","假设清单(强化)","未解问题","风险与收益","责任盘点 · 新","对外影响 · 新"] },
          { axis:"知识轴", c:"#D9B88E", tabs:["认知沉淀","心智模型","证据层级","反事实","共识与分歧 · 新","概念辨析 · 新","议题谱系与健康 · 新","外脑批注 · 新"] },
        ].map((a,i)=>(
          <div key={i} style={{
            padding:"14px 18px", background:"rgba(253,251,245,0.04)",
            border:"1px solid rgba(253,251,245,0.08)", borderLeft:`3px solid ${a.c}`, borderRadius:3,
          }}>
            <div style={{display:"flex", alignItems:"baseline", gap:8, marginBottom:10}}>
              <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:16, fontWeight:600}}>{a.axis}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:10, color:a.c, letterSpacing:0.3}}>{a.tabs.length} 个子 tab</div>
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:4}}>
              {a.tabs.map((t,ti)=>{
                const isNew = t.includes("新") || t.includes("RASIC") || t.includes("强化");
                return (
                  <span key={ti} style={{
                    fontFamily:"var(--sans)", fontSize:10.5, color: isNew?a.c:"rgba(253,251,245,0.7)",
                    padding:"3px 8px", borderRadius:2,
                    background: isNew ? `${a.c}22` : "rgba(253,251,245,0.05)",
                    border: `1px solid ${isNew ? a.c+"44" : "rgba(253,251,245,0.08)"}`,
                    letterSpacing:0.2,
                  }}>{t}</span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ReadingPlayground, READINGS });
