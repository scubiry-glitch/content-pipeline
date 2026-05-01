// world-shell.jsx — 外部/内部世界双模主壳 + CEO 六房间入口

const PRISM_ROOMS = [
  { id:"direction", icon:"🧭", label:"方向",   room:"Compass",     tone:"#7BA7C4",
    bg:"#F4F1EC", ink:"#1A2E3D",
    question:"我把时间花在战略主线上了吗?", visual:"星盘/指南针",
    metric:{ label:"战略对齐度", value:"0.72", delta:"+0.04" } },
  { id:"board",     icon:"🏛️", label:"董事会", room:"Boardroom",   tone:"#C8A15C",
    bg:"#1A1410", ink:"#F3ECDD",
    question:"下次董事会我要带什么?", visual:"金线圆桌",
    metric:{ label:"前瞻占比", value:"58%", delta:"+12%" } },
  { id:"coord",     icon:"🎯", label:"协调",   room:"Tower",       tone:"#4ADE80",
    bg:"#0A1410", ink:"#C8E1D2",
    question:"谁欠谁什么? 卡在哪?", visual:"雷达扫描",
    metric:{ label:"责任清晰度", value:"78%", delta:"-3%" } },
  { id:"team",      icon:"⚔️", label:"团队",   room:"War Room",    tone:"#D64545",
    bg:"#1A0E0E", ink:"#F5D9D9",
    question:"团队健康吗? 有建设性冲突吗?", visual:"阵型力场",
    metric:{ label:"阵型健康", value:"72", delta:"+5" } },
  { id:"ext",       icon:"🌐", label:"各方",   room:"Situation",   tone:"#FFC857",
    bg:"#0E1428", ink:"#FDF3D4",
    question:"外部世界怎么看我?", visual:"世界热力",
    metric:{ label:"覆盖度",   value:"3/4", delta:"缺监管" } },
  { id:"self",      icon:"🧘", label:"个人",   room:"Balcony",     tone:"#D9B88E",
    bg:"#0F0E15", ink:"#E8E3D8",
    question:"我还是我想成为的那个 CEO 吗?", visual:"云月远山",
    metric:{ label:"本周 ROI", value:"0.64", delta:"-0.08" } },
];

function WorldShell() {
  const [mode, setMode] = React.useState("external"); // external | internal
  const [external, setExternal] = React.useState("meetings"); // meetings | library
  const [internal, setInternal] = React.useState("ceo"); // ceo | brain

  const isExternal = mode==="external";
  const themeBg = isExternal ? "#FAF7F0" : "#0F0E15";
  const themeInk = isExternal ? "#1F1B16" : "#E8E3D8";
  const themeAccent = isExternal ? "#D64545" : "#D9B88E";

  return (
    <div style={{
      width:"100%", height:"100%", background:themeBg, color:themeInk,
      fontFamily:"var(--sans)", display:"flex", flexDirection:"column", overflow:"hidden",
      transition:"background 600ms ease, color 600ms ease",
    }}>
      <WorldSwitcher mode={mode} setMode={setMode}/>

      {isExternal ? (
        <>
          <SubNav
            items={[
              { id:"meetings", label:"📅 会议", sub:"与世界的会面" },
              { id:"library",  label:"📚 库",   sub:"人物 · 项目 · 知识" },
            ]}
            active={external}
            onChange={setExternal}
            tone={themeAccent}
            ink={themeInk}
            bg={themeBg}
          />
          <div style={{flex:1, minHeight:0, overflow:"auto"}}>
            {external==="meetings" && <ExternalMeetingsPane/>}
            {external==="library"  && <ExternalLibraryPane/>}
          </div>
        </>
      ) : (
        <>
          <SubNav
            items={[
              { id:"ceo",   label:"👤 CEO 主页",     sub:"六棱镜六房间" },
              { id:"brain", label:"🧠 外脑图书馆",   sub:"永久的认知资产" },
            ]}
            active={internal}
            onChange={setInternal}
            tone={themeAccent}
            ink={themeInk}
            bg={themeBg}
          />
          <div style={{flex:1, minHeight:0, overflow:"auto"}}>
            {internal==="ceo"   && <CEOHomePane/>}
            {internal==="brain" && <BrainLibraryPane/>}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// World switcher · 昼夜滑块
// ─────────────────────────────────────────────────────────
function WorldSwitcher({ mode, setMode }) {
  const isEx = mode==="external";
  return (
    <div style={{
      display:"flex", alignItems:"stretch", flexShrink:0,
      borderBottom: isEx ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(217,184,142,0.15)",
      background: isEx ? "linear-gradient(90deg, #FAF7F0 0%, #F0E9DC 100%)"
                       : "linear-gradient(90deg, #1A1420 0%, #0F0E15 100%)",
      transition:"background 600ms ease",
    }}>
      <div style={{
        padding:"12px 20px", display:"flex", alignItems:"center", gap:10,
        borderRight: isEx ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(217,184,142,0.1)",
      }}>
        <div style={{
          width:30, height:30, borderRadius:7,
          background: isEx ? "#D64545" : "#D9B88E", color: isEx ? "#FAF7F0" : "#0F0E15",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"var(--serif)", fontStyle:"italic", fontSize:15, fontWeight:600,
        }}>M</div>
        <div>
          <div style={{fontWeight:600, fontSize:13, color:isEx?"#1F1B16":"#F3ECDD"}}>Minutes</div>
          <div style={{fontSize:10, color: isEx?"#7A6E5E":"rgba(232,227,216,0.55)", fontFamily:"var(--mono)"}}>
            v0.5 · {isEx ? "外部世界" : "内部世界"}
          </div>
        </div>
      </div>

      <div style={{flex:1}}/>

      {/* 滑块 */}
      <div
        onClick={()=>setMode(isEx?"internal":"external")}
        style={{
          alignSelf:"center", margin:"0 20px",
          position:"relative", display:"flex", alignItems:"center",
          width:360, height:44, borderRadius:99,
          background: isEx
            ? "linear-gradient(90deg, #FFF5D9 0%, #EBDBAE 100%)"
            : "linear-gradient(90deg, #1C1A2A 0%, #0A0912 100%)",
          border: isEx ? "1px solid #D9C07F" : "1px solid rgba(217,184,142,0.3)",
          cursor:"pointer", boxShadow: isEx ? "inset 0 1px 2px rgba(0,0,0,0.05)" : "inset 0 1px 2px rgba(0,0,0,0.5)",
          transition:"all 600ms ease", overflow:"hidden",
        }}
      >
        {/* 星 */}
        {!isEx && [...Array(12)].map((_,i)=>(
          <span key={i} style={{
            position:"absolute", left:`${(i*29)%100}%`, top:`${(i*17)%100}%`,
            width:1.5, height:1.5, background:"#F3ECDD", borderRadius:99, opacity:0.5,
          }}/>
        ))}

        {/* 左端 · 日 */}
        <div style={{
          padding:"0 16px 0 18px", display:"flex", alignItems:"center", gap:8,
          color: isEx ? "#8A5A1A" : "rgba(217,184,142,0.4)", fontFamily:"var(--serif)",
          fontStyle: isEx ? "normal" : "italic", fontWeight: isEx?600:500, fontSize:13,
          zIndex:2, position:"relative",
        }}>
          <span style={{fontSize:16}}>☀️</span> 外部世界
        </div>
        <div style={{flex:1}}/>
        {/* 右端 · 月 */}
        <div style={{
          padding:"0 18px 0 16px", display:"flex", alignItems:"center", gap:8,
          color: !isEx ? "#D9B88E" : "rgba(120,90,40,0.4)", fontFamily:"var(--serif)",
          fontStyle: !isEx ? "italic" : "normal", fontWeight: !isEx?600:500, fontSize:13,
          zIndex:2, position:"relative",
        }}>
          内部世界 <span style={{fontSize:16}}>🌙</span>
        </div>

        {/* 滑钮 */}
        <div style={{
          position:"absolute", top:3, bottom:3,
          left: isEx ? 3 : "calc(50% + 3px)", right: isEx ? "calc(50% + 3px)" : 3,
          borderRadius:99,
          background: isEx
            ? "linear-gradient(135deg, #FFE08A, #FFB545)"
            : "linear-gradient(135deg, #3A3555, #1A1628)",
          boxShadow: isEx
            ? "0 2px 8px rgba(255,181,69,0.4), inset 0 -1px 2px rgba(0,0,0,0.1)"
            : "0 2px 8px rgba(217,184,142,0.3), inset 0 -1px 2px rgba(217,184,142,0.2)",
          transition:"all 500ms cubic-bezier(.5,.1,.3,1)",
          zIndex:1,
        }}/>
      </div>

      <div style={{flex:1}}/>

      <div style={{padding:"12px 22px", display:"flex", alignItems:"center", gap:12}}>
        <div style={{fontSize:11, color:isEx?"#7A6E5E":"rgba(232,227,216,0.55)", fontFamily:"var(--mono)", letterSpacing:0.3}}>
          {isEx ? "09:42 · 周六" : "晚安 · 本周已亮灯"}
        </div>
        <button style={{
          width:30, height:30, borderRadius:99, border:0, cursor:"pointer",
          background: isEx ? "rgba(0,0,0,0.05)" : "rgba(217,184,142,0.15)",
          color: isEx?"#1F1B16":"#D9B88E", fontSize:14,
        }}>🦉</button>
      </div>
    </div>
  );
}

function SubNav({ items, active, onChange, tone, ink, bg }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:2, padding:"10px 22px",
      borderBottom: bg==="#FAF7F0" ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(217,184,142,0.1)",
    }}>
      {items.map(it=>{
        const isActive = it.id===active;
        return (
          <button key={it.id} onClick={()=>onChange(it.id)} style={{
            padding:"7px 14px", border:0, borderRadius:6, cursor:"pointer",
            background: isActive ? (bg==="#FAF7F0" ? "rgba(0,0,0,0.05)" : "rgba(217,184,142,0.1)") : "transparent",
            color: isActive ? ink : (bg==="#FAF7F0" ? "#7A6E5E" : "rgba(232,227,216,0.55)"),
            fontFamily:"var(--serif)", fontSize:14, fontWeight: isActive?600:500, fontStyle: isActive?"normal":"italic",
            display:"flex", alignItems:"center", gap:8,
          }}>
            {it.label}
            <span style={{
              fontFamily:"var(--mono)", fontSize:9.5, letterSpacing:0.3, opacity:0.7,
              fontStyle:"normal", fontWeight:400,
            }}>{it.sub}</span>
            {isActive && <span style={{width:5, height:5, borderRadius:99, background:tone, marginLeft:4}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// External · Meetings (占位指向现有功能)
// ─────────────────────────────────────────────────────────
function ExternalMeetingsPane() {
  return (
    <div style={{padding:"32px 44px", maxWidth:1100}}>
      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"#8A7C6A", letterSpacing:"0.18em", textTransform:"uppercase"}}>
        External · 会议
      </div>
      <h1 style={{fontFamily:"var(--serif)", fontSize:34, fontWeight:500, margin:"4px 0 18px", letterSpacing:"-0.015em"}}>
        与世界的会面
      </h1>
      <p style={{color:"#5A5146", fontSize:14, maxWidth:600, lineHeight:1.6, marginBottom:28}}>
        今天值得关注的会议 / 本周关键会面 / 最近 48 场 —— 从时间维度进入单场纪要。
        <br/><span style={{fontStyle:"italic", color:"#9A8C78"}}>(三轴/库视图请切换到右侧「📚 库」tab)</span>
      </p>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, maxWidth:900}}>
        {[
          { t:"今天", sub:"3 件事值得注意 · 待回复 2 / 待审批 1", c:"#D64545", n:"3" },
          { t:"本周关键会面", sub:"5 场高权重会议 · 2 场董事级", c:"#D9B88E", n:"5" },
          { t:"最近 48 场", sub:"可按项目 / 客户 / 主题分组筛选", c:"#7BA7C4", n:"48" },
        ].map((g,i)=>(
          <div key={i} style={{
            background:"rgba(0,0,0,0.03)", border:"1px solid rgba(0,0,0,0.08)",
            borderLeft:`2px solid ${g.c}`, borderRadius:4, padding:"18px 20px",
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#8A7C6A", letterSpacing:0.3}}>{g.n}</div>
            <div style={{fontFamily:"var(--serif)", fontSize:17, fontWeight:500, marginTop:6}}>{g.t}</div>
            <div style={{fontSize:12.5, color:"#5A5146", marginTop:4, lineHeight:1.5}}>{g.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExternalLibraryPane() {
  return (
    <div style={{padding:"32px 44px"}}>
      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"#8A7C6A", letterSpacing:"0.18em", textTransform:"uppercase"}}>
        External · 库
      </div>
      <h1 style={{fontFamily:"var(--serif)", fontSize:34, fontWeight:500, margin:"4px 0 18px", letterSpacing:"-0.015em"}}>
        人物 · 项目 · 知识
      </h1>
      <p style={{color:"#5A5146", fontSize:14, maxWidth:720, lineHeight:1.6, marginBottom:24}}>
        同一批会议数据的三种投射。子 tab 清单 7 / 6 / 8 已就位。
      </p>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18, maxWidth:1100}}>
        {[
          { axis:"人物轴", sub:"7 个子 tab", c:"#D64545",
            tabs:["承诺与兑现","角色画像演化","发言质量","沉默信号(+RASIC)","信念轨迹","阵型 · 新","盲区档案 · 新"] },
          { axis:"项目轴", sub:"6 个子 tab", c:"#7BA7C4",
            tabs:["决策溯源(链+树)","假设清单(强化)","未解问题","风险与收益","责任盘点 · 新","对外影响 · 新"] },
          { axis:"知识轴", sub:"8 个子 tab", c:"#D9B88E",
            tabs:["认知沉淀","心智模型","证据层级","反事实/未走的路","共识与分歧 · 新","概念辨析 · 新","议题谱系与健康 · 新","外脑批注 · 新"] },
        ].map((a,i)=>(
          <div key={i} style={{
            background:"rgba(0,0,0,0.03)", border:"1px solid rgba(0,0,0,0.08)",
            borderLeft:`3px solid ${a.c}`, borderRadius:5, padding:"18px 20px",
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:a.c, letterSpacing:0.3}}>{a.sub}</div>
            <div style={{fontFamily:"var(--serif)", fontSize:19, fontWeight:600, marginTop:6, marginBottom:12}}>{a.axis}</div>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              {a.tabs.map((t,ti)=>{
                const isNew = t.includes("新") || t.includes("RASIC") || t.includes("强化");
                return (
                  <div key={ti} style={{
                    fontSize:12, color:"#3A3228", padding:"5px 9px",
                    background: isNew ? "rgba(214,69,69,0.06)" : "rgba(0,0,0,0.02)",
                    borderRadius:3, borderLeft: isNew ? `2px solid ${a.c}` : "2px solid transparent",
                  }}>{t}</div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Internal · CEO 主页 · 六棱镜六房间入口
// ─────────────────────────────────────────────────────────
function CEOHomePane() {
  const [hovered, setHovered] = React.useState(null);
  return (
    <div style={{padding:"34px 44px 60px", minHeight:"100%", position:"relative"}}>
      {/* 月光 */}
      <div style={{
        position:"absolute", top:20, right:50, width:80, height:80, borderRadius:"50%",
        background:"radial-gradient(circle, rgba(217,184,142,0.25), transparent 70%)",
        filter:"blur(4px)", pointerEvents:"none",
      }}/>
      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"#D9B88E", letterSpacing:"0.18em", textTransform:"uppercase", opacity:0.8}}>
        Internal · CEO 主页
      </div>
      <h1 style={{
        fontFamily:"var(--serif)", fontStyle:"italic", fontSize:38, fontWeight:500,
        margin:"4px 0 6px", letterSpacing:"-0.015em", color:"#F3ECDD",
      }}>
        欢迎回来,这是你本周的棱镜。
      </h1>
      <p style={{color:"rgba(232,227,216,0.55)", fontSize:14, maxWidth:640, lineHeight:1.6, marginBottom:30, fontStyle:"italic"}}>
        六个房间,六种问题。选择今天你想用哪种方式看世界。
      </p>

      {/* 六房间网格 */}
      <div style={{
        display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18,
        maxWidth:1200,
      }}>
        {PRISM_ROOMS.map(room=>(
          <RoomCard key={room.id} room={room} hovered={hovered===room.id} onHover={()=>setHovered(room.id)} onLeave={()=>setHovered(null)}/>
        ))}
      </div>

      {/* 底部 · 棱镜权重设置 */}
      <div style={{
        marginTop:30, padding:"20px 24px",
        background:"rgba(217,184,142,0.05)", border:"1px solid rgba(217,184,142,0.15)", borderRadius:8,
        maxWidth:1200,
      }}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
          <div>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#D9B88E", letterSpacing:0.3, textTransform:"uppercase", opacity:0.8}}>
              棱镜权重 · Prism Weights
            </div>
            <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:16, color:"#F3ECDD", marginTop:3}}>
              你希望自己花多少时间在每个棱镜上?
            </div>
          </div>
          <div style={{fontSize:11, color:"rgba(232,227,216,0.5)", fontFamily:"var(--mono)"}}>
            本周实际 vs 你设定的权重
          </div>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:12}}>
          {PRISM_ROOMS.map((r,i)=>{
            const actual = [22, 18, 15, 20, 10, 15][i];
            const target = [20, 15, 20, 20, 10, 15][i];
            return (
              <div key={r.id} style={{textAlign:"center"}}>
                <div style={{fontSize:11, color:r.tone, fontWeight:600, marginBottom:4}}>{r.icon} {r.label}</div>
                <div style={{position:"relative", height:5, background:"rgba(217,184,142,0.1)", borderRadius:99, overflow:"hidden"}}>
                  <div style={{position:"absolute", left:0, top:0, bottom:0, width:`${actual}%`, background:r.tone, opacity:0.8}}/>
                  <div style={{position:"absolute", left:`${target}%`, top:-2, bottom:-2, width:2, background:"#F3ECDD"}}/>
                </div>
                <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"rgba(232,227,216,0.55)", marginTop:3}}>
                  {actual}% · 标 {target}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ROOM_LINKS = {
  direction: "compass.html",
  board:     "boardroom.html",
  coord:     "tower.html",
  team:      "war-room.html",
  ext:       "situation.html",
  self:      "balcony.html",
};
function RoomCard({ room, hovered, onHover, onLeave }) {
  const href = ROOM_LINKS[room.id];
  const onClick = () => {
    if (href) window.open(href, "_blank", "noopener");
    else {
      // 临时提示 — 该房间正在建设
      const toast = document.createElement("div");
      toast.textContent = `${room.icon} ${room.label} · ${room.room} —— 建设中`;
      toast.style.cssText = `position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:${room.bg};color:${room.ink};border:1px solid ${room.tone};padding:10px 18px;border-radius:4px;font-family:var(--serif);font-style:italic;font-size:13px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.3);`;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(), 2000);
    }
  };
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{
        position:"relative", minHeight:180,
        background: room.bg, color: room.ink,
        border:`1px solid ${room.tone}40`,
        borderRadius:8, padding:"20px 22px",
        cursor:"pointer", overflow:"hidden",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered ? `0 12px 28px -8px ${room.tone}66` : `0 4px 12px -4px rgba(0,0,0,0.3)`,
        transition:"all 300ms cubic-bezier(.2,.7,.3,1)",
      }}>
      {/* 装饰 · 对应房间的 visual 隐喻,用 SVG 叠在右下角 */}
      <RoomVisual kind={room.id} color={room.tone}/>

      <div style={{position:"relative", zIndex:2}}>
        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:6}}>
          <span style={{fontSize:24}}>{room.icon}</span>
          <div>
            <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:20, fontWeight:600, lineHeight:1.2}}>
              {room.label}
            </div>
            <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:room.tone, letterSpacing:0.3, textTransform:"uppercase", marginTop:2}}>
              {room.room}
            </div>
          </div>
        </div>

        <div style={{
          fontFamily:"var(--serif)", fontStyle:"italic", fontSize:13.5, lineHeight:1.55,
          color: room.ink, opacity:0.88, marginTop:12, marginBottom:16,
          borderLeft:`2px solid ${room.tone}`, paddingLeft:10,
        }}>
          "{room.question}"
        </div>

        <div style={{
          display:"flex", alignItems:"flex-end", justifyContent:"space-between",
          paddingTop:10, borderTop:`1px solid ${room.tone}30`,
        }}>
          <div>
            <div style={{fontFamily:"var(--mono)", fontSize:9, letterSpacing:0.4, color:room.ink, opacity:0.55, textTransform:"uppercase"}}>
              {room.metric.label}
            </div>
            <div style={{fontFamily:"var(--serif)", fontSize:22, fontWeight:600, color:room.tone, marginTop:2}}>
              {room.metric.value}
            </div>
          </div>
          <div style={{
            fontFamily:"var(--mono)", fontSize:10.5, color:room.ink, opacity:0.55,
            padding:"3px 8px", borderRadius:3, background:`${room.tone}22`,
          }}>
            Δ {room.metric.delta}
          </div>
        </div>

        {hovered && (
          <div style={{
            position:"absolute", bottom:-2, right:-2,
            fontFamily:"var(--serif)", fontStyle:"italic", fontSize:11,
            color:room.tone, opacity:0.9,
          }}>
            进入 {room.visual} →
          </div>
        )}
      </div>
    </div>
  );
}

function RoomVisual({ kind, color }) {
  const shared = {
    position:"absolute", right:-20, bottom:-20, width:120, height:120,
    opacity:0.16, pointerEvents:"none", zIndex:1,
  };
  if (kind==="direction") return (
    <svg style={shared} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="1"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="0.6"/>
      <path d="M 50 10 L 54 50 L 50 90 L 46 50 Z" fill={color}/>
      <path d="M 10 50 L 50 46 L 90 50 L 50 54 Z" fill={color} opacity="0.5"/>
    </svg>
  );
  if (kind==="board") return (
    <svg style={shared} viewBox="0 0 100 100">
      <ellipse cx="50" cy="55" rx="38" ry="22" fill="none" stroke={color} strokeWidth="1.2"/>
      {[0,60,120,180,240,300].map((a,i)=>{
        const x = 50+Math.cos(a*Math.PI/180)*38, y=55+Math.sin(a*Math.PI/180)*22;
        return <rect key={i} x={x-3} y={y-6} width="6" height="12" fill={color} rx="1"/>;
      })}
    </svg>
  );
  if (kind==="coord") return (
    <svg style={shared} viewBox="0 0 100 100">
      {[15,28,40].map(r=><circle key={r} cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="0.6"/>)}
      <line x1="50" y1="50" x2="85" y2="30" stroke={color} strokeWidth="1.5"/>
      <circle cx="50" cy="50" r="2" fill={color}/>
    </svg>
  );
  if (kind==="team") return (
    <svg style={shared} viewBox="0 0 100 100">
      {[[50,20],[25,55],[75,55],[38,80],[62,80]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r="5" fill={color}/>
      ))}
      <path d="M 50 20 L 25 55 L 38 80 L 62 80 L 75 55 Z" fill="none" stroke={color} strokeWidth="0.8"/>
    </svg>
  );
  if (kind==="ext") return (
    <svg style={shared} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="0.8"/>
      {[[30,35,8],[65,40,12],[40,65,10],[70,70,6]].map(([x,y,r],i)=>(
        <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.3+i*0.15}/>
      ))}
    </svg>
  );
  if (kind==="self") return (
    <svg style={shared} viewBox="0 0 100 100">
      <circle cx="72" cy="28" r="14" fill={color} opacity="0.5"/>
      <path d="M 5 80 Q 30 65, 50 75 T 95 72 L 95 100 L 5 100 Z" fill={color} opacity="0.3"/>
      <path d="M 0 90 Q 25 85, 50 88 T 100 86" fill="none" stroke={color} strokeWidth="0.6"/>
    </svg>
  );
  return null;
}

// ─────────────────────────────────────────────────────────
Object.assign(window, { WorldShell, PRISM_ROOMS });
