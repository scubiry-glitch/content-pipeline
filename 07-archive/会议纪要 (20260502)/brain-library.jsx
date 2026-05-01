// brain-library.jsx — 外脑图书馆 · 三分区大厅 + 子页面跳转
// 分区: 生产(tasks+content-library) / 核心(expert-library) / 消费(assets+hot-topics)

const BRAIN_SECTIONS = [
  {
    id: "production", label: "生产", en: "Production",
    tone: "#7BA7C4", icon: "⚙️",
    subtitle: "资产从哪来 · 任务与原始素材",
    subpages: [
      { id:"tasks", slug:"tasks", icon:"⏳", title:"任务队列", en:"Tasks",
        metric:{ label:"运行中", value:"3" },
        desc:"专家批注生成中 / 待审 / 失败重试 / 定时任务",
        tags:["生成中 3", "待审 5", "失败 1", "定时 2"] },
      { id:"content", slug:"content-library", icon:"📁", title:"素材库", en:"Content Library",
        metric:{ label:"片段", value:"1,284" },
        desc:"原始转写切片 / 证据快照 / 被反复引用的对话",
        tags:["转写 892", "证据 312", "引用 80"] },
    ]
  },
  {
    id: "core", label: "核心", en: "Core",
    tone: "#D9B88E", icon: "★",
    subtitle: "资产本身 · 外脑与心智",
    subpages: [
      { id:"experts", slug:"expert-library", icon:"🧠", title:"专家库", en:"Expert Library",
        metric:{ label:"专家 × 批注", value:"12 · 87" },
        desc:"按专家浏览 / 按心智模型 / 画像 · 调用历史 · 风格指纹 / 认知盘点",
        tags:["12 专家", "34 模型", "168 命中", "盘点 68%"],
        highlight: true },
    ]
  },
  {
    id: "consumption", label: "消费", en: "Consumption",
    tone: "#A8A0D9", icon: "◑",
    subtitle: "资产被如何使用 · 市集与热议",
    subpages: [
      { id:"assets", slug:"assets", icon:"◆", title:"资产市集", en:"Assets Market",
        metric:{ label:"可复用卡片", value:"42" },
        desc:"判断框架 / 决策模板 / 被反复调用的知识晶体",
        tags:["框架 18", "模板 14", "晶体 10"] },
      { id:"hot", slug:"hot-topics", icon:"◉", title:"热议题", en:"Hot Topics",
        metric:{ label:"跨会联动", value:"14" },
        desc:"近 30 天被反复提及 · 热度曲线 · 进展追踪",
        tags:["升温 8", "悬置 4", "降温 2"] },
    ]
  },
];

function BrainLibraryPane() {
  const [hovered, setHovered] = React.useState(null);
  const openSubpage = (slug) => {
    window.open(`brain-room.html?p=${slug}`, `brain-${slug}`, "noopener");
  };
  return (
    <div style={{padding:"34px 44px 80px", minHeight:"100%", position:"relative"}}>
      {/* 月光 */}
      <div style={{
        position:"absolute", top:20, right:70, width:90, height:90, borderRadius:"50%",
        background:"radial-gradient(circle, rgba(217,184,142,0.2), transparent 70%)",
        filter:"blur(6px)", pointerEvents:"none",
      }}/>

      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"#D9B88E", letterSpacing:"0.18em", textTransform:"uppercase", opacity:0.8}}>
        Internal · 外脑图书馆
      </div>
      <h1 style={{
        fontFamily:"var(--serif)", fontStyle:"italic", fontSize:38, fontWeight:500,
        margin:"4px 0 6px", letterSpacing:"-0.015em", color:"#F3ECDD",
      }}>
        你的永久认知资产
      </h1>
      <p style={{color:"rgba(232,227,216,0.55)", fontSize:14, maxWidth:760, lineHeight:1.65, marginBottom:30, fontStyle:"italic"}}>
        每一次召唤专家留下的批注、每一个被激活的心智模型、每一张被反复使用的判断卡片 —— 都在这里沉淀。
        <br/>资产像一条河:<span style={{color:"#7BA7C4"}}> 上游生产 </span>→ <span style={{color:"#D9B88E"}}> 核心沉淀 </span>→ <span style={{color:"#A8A0D9"}}> 下游消费</span>。
      </p>

      {/* 河流导航条 */}
      <RiverNav/>

      {/* 三分区 */}
      <div style={{display:"flex", flexDirection:"column", gap:24, maxWidth:1280, marginTop:28}}>
        {BRAIN_SECTIONS.map(section=>(
          <SectionBlock
            key={section.id}
            section={section}
            hovered={hovered}
            onHover={setHovered}
            onOpen={openSubpage}
          />
        ))}
      </div>

      {/* 底部总计 */}
      <div style={{
        marginTop:32, padding:"18px 22px",
        background:"rgba(217,184,142,0.04)", border:"1px solid rgba(217,184,142,0.12)", borderRadius:6,
        maxWidth:1280, display:"flex", alignItems:"center", gap:30,
      }}>
        <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14, color:"rgba(232,227,216,0.7)"}}>
          本月净沉淀
        </div>
        {[
          { l:"新批注", v:"+12", c:"#D9B88E" },
          { l:"新模型", v:"+3", c:"#A8A0D9" },
          { l:"复用次数", v:"+48", c:"#7BA7C4" },
          { l:"被反驳", v:"-2", c:"#E6A6A6" },
        ].map((s,i)=>(
          <div key={i} style={{display:"flex", alignItems:"baseline", gap:6}}>
            <span style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.5)", letterSpacing:0.3}}>
              {s.l}
            </span>
            <span style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:600, color:s.c}}>
              {s.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiverNav() {
  return (
    <div style={{
      position:"relative", height:44, maxWidth:1280,
      display:"flex", alignItems:"center",
    }}>
      {/* 河流底色 */}
      <svg style={{position:"absolute", inset:0, width:"100%", height:"100%"}} preserveAspectRatio="none">
        <defs>
          <linearGradient id="river" x1="0" x2="1">
            <stop offset="0%"  stopColor="#7BA7C4" stopOpacity="0.35"/>
            <stop offset="50%" stopColor="#D9B88E" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="#A8A0D9" stopOpacity="0.35"/>
          </linearGradient>
        </defs>
        <path d="M 20 22 Q 300 14, 620 22 T 1260 22" stroke="url(#river)" strokeWidth="2" fill="none"/>
        <path d="M 20 22 Q 300 30, 620 22 T 1260 22" stroke="url(#river)" strokeWidth="1" fill="none" opacity="0.5"/>
      </svg>
      {BRAIN_SECTIONS.map((s,i)=>{
        const left = i===0 ? "3%" : i===1 ? "47%" : "92%";
        return (
          <div key={s.id} style={{
            position:"absolute", left, top:"50%", transform:"translate(-50%,-50%)",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{
              width:10, height:10, borderRadius:"50%", background:s.tone,
              boxShadow:`0 0 14px ${s.tone}88`,
            }}/>
            <span style={{
              fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13, color:s.tone, fontWeight:600,
              whiteSpace:"nowrap",
            }}>
              {s.label} <span style={{fontFamily:"var(--mono)", fontSize:9, opacity:0.6, fontStyle:"normal", fontWeight:400, marginLeft:4}}>{s.en}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionBlock({ section, hovered, onHover, onOpen }) {
  const isCore = section.id === "core";
  return (
    <div style={{
      position:"relative",
      padding:"22px 26px 24px",
      background: isCore ? `linear-gradient(135deg, ${section.tone}12 0%, transparent 70%)` : "rgba(255,255,255,0.02)",
      border:`1px solid ${section.tone}30`,
      borderLeft:`3px solid ${section.tone}`,
      borderRadius:6,
    }}>
      <div style={{display:"flex", alignItems:"baseline", gap:12, marginBottom:4}}>
        <span style={{fontSize:16, color:section.tone}}>{section.icon}</span>
        <h2 style={{
          fontFamily:"var(--serif)", fontStyle:"italic", fontSize:22, fontWeight:600,
          color:"#F3ECDD", margin:0, letterSpacing:"-0.01em",
        }}>
          {section.label}
        </h2>
        <span style={{fontFamily:"var(--mono)", fontSize:10, color:section.tone, letterSpacing:"0.2em", textTransform:"uppercase"}}>
          {section.en}
        </span>
        <span style={{flex:1}}/>
        <span style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:12, color:"rgba(232,227,216,0.5)"}}>
          {section.subtitle}
        </span>
      </div>

      <div style={{
        display:"grid",
        gridTemplateColumns: section.subpages.length===1 ? "1fr" : "1fr 1fr",
        gap:14, marginTop:14,
      }}>
        {section.subpages.map(sub=>(
          <SubpageCard
            key={sub.id}
            sub={sub}
            tone={section.tone}
            hovered={hovered===sub.id}
            onHover={()=>onHover(sub.id)}
            onLeave={()=>onHover(null)}
            onClick={()=>onOpen(sub.slug)}
            large={section.subpages.length===1}
          />
        ))}
      </div>
    </div>
  );
}

function SubpageCard({ sub, tone, hovered, onHover, onLeave, onClick, large }) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        position:"relative", overflow:"hidden",
        padding: large ? "22px 26px" : "18px 22px",
        background: hovered ? `${tone}14` : "rgba(0,0,0,0.18)",
        border:`1px solid ${tone}${hovered?"66":"30"}`,
        borderRadius:5, cursor:"pointer",
        transition:"all 240ms cubic-bezier(.2,.7,.3,1)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? `0 8px 20px -8px ${tone}66` : "none",
      }}>
      <div style={{display:"flex", alignItems:"flex-start", gap:14}}>
        <div style={{
          width: large?44:36, height: large?44:36, borderRadius:6,
          background: `${tone}22`, border:`1px solid ${tone}44`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize: large?20:17, color:tone, flexShrink:0,
        }}>
          {sub.icon}
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap"}}>
            <span style={{
              fontFamily:"var(--serif)", fontStyle:"italic", fontSize: large?22:18,
              fontWeight:600, color:"#F3ECDD",
            }}>
              {sub.title}
            </span>
            <span style={{
              fontFamily:"var(--mono)", fontSize:9.5, color:tone, letterSpacing:"0.2em",
              textTransform:"uppercase", opacity:0.8,
            }}>
              /{sub.slug}
            </span>
          </div>
          <div style={{
            fontFamily:"var(--serif)", fontSize:13, fontStyle:"italic",
            color:"rgba(232,227,216,0.7)", marginTop:6, lineHeight:1.5,
          }}>
            {sub.desc}
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:12}}>
            {sub.tags.map((t,i)=>(
              <span key={i} style={{
                fontFamily:"var(--mono)", fontSize:10, color:tone,
                padding:"2px 8px", background:`${tone}18`,
                border:`1px solid ${tone}33`, borderRadius:3,
                letterSpacing:0.3,
              }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{
          flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6,
        }}>
          <div style={{
            fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.45)",
            letterSpacing:0.3, textTransform:"uppercase",
          }}>
            {sub.metric.label}
          </div>
          <div style={{
            fontFamily:"var(--serif)", fontSize: large?26:22, fontWeight:600, color:tone,
            lineHeight:1,
          }}>
            {sub.metric.value}
          </div>
          <div style={{
            fontFamily:"var(--mono)", fontSize:9.5, color: hovered ? tone : "rgba(232,227,216,0.4)",
            marginTop:"auto", letterSpacing:0.3,
            transition:"color 200ms",
          }}>
            打开 ↗
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BrainLibraryPane, BRAIN_SECTIONS });
