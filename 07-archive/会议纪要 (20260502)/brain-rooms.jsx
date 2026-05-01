// brain-rooms.jsx — 外脑图书馆的 6 个子页面(阅览室)
// tasks / content-library / expert-library / assets / hot-topics

// ────────────────────────────────────────
// 共享外壳:深色基调 + 顶部面包屑 + 返回
// ────────────────────────────────────────
function RoomShell({ title, slug, section, tone, icon, children }) {
  return (
    <div style={{
      minHeight:"100vh", background:"#0F0E15", color:"#E8E3D8",
      fontFamily:"var(--sans)",
    }}>
      {/* 顶部 */}
      <div style={{
        padding:"18px 44px 14px", display:"flex", alignItems:"center", gap:18,
        borderBottom:"1px solid rgba(217,184,142,0.1)",
        background:"linear-gradient(180deg, rgba(217,184,142,0.04), transparent)",
      }}>
        <a href="index.html" style={{
          fontFamily:"var(--mono)", fontSize:11, color:"rgba(232,227,216,0.55)",
          textDecoration:"none", display:"flex", alignItems:"center", gap:6,
        }}>
          ← 外脑图书馆
        </a>
        <span style={{color:"rgba(232,227,216,0.2)"}}>/</span>
        <span style={{fontFamily:"var(--mono)", fontSize:11, color:tone, letterSpacing:0.3}}>
          {section}
        </span>
        <span style={{color:"rgba(232,227,216,0.2)"}}>/</span>
        <span style={{fontFamily:"var(--mono)", fontSize:11, color:"rgba(232,227,216,0.75)", letterSpacing:0.3}}>
          /{slug}
        </span>
        <div style={{flex:1}}/>
        <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.4)"}}>
          独立标签页 · Brain Room
        </div>
      </div>

      {/* 标题区 */}
      <div style={{padding:"28px 44px 20px", display:"flex", alignItems:"center", gap:16}}>
        <div style={{
          width:52, height:52, borderRadius:8, background:`${tone}22`, border:`1px solid ${tone}55`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:tone,
        }}>{icon}</div>
        <div>
          <div style={{fontFamily:"var(--mono)", fontSize:10, color:tone, letterSpacing:"0.18em", textTransform:"uppercase", opacity:0.85}}>
            {section} · /{slug}
          </div>
          <h1 style={{
            fontFamily:"var(--serif)", fontStyle:"italic", fontSize:34, fontWeight:600,
            margin:"4px 0 0", color:"#F3ECDD", letterSpacing:"-0.015em",
          }}>{title}</h1>
        </div>
      </div>

      {/* 内容 */}
      <div style={{padding:"0 44px 80px"}}>
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// /tasks · 任务队列
// ────────────────────────────────────────
function TasksRoom() {
  const tone = "#7BA7C4";
  const tasks = [
    { id:1, kind:"专家批注", status:"运行中", progress:68,  title:"为「Q3 定价讨论会」生成《理性博弈论》视角批注", expert:"博弈论学派", eta:"~ 3 min", started:"09:31" },
    { id:2, kind:"专家批注", status:"运行中", progress:24,  title:"为「客户投诉专题会」生成《消费心理学》批注", expert:"Kahneman 学派", eta:"~ 8 min", started:"09:34" },
    { id:3, kind:"定时",    status:"运行中", progress:89,  title:"周日认知盘点 · 本周被接受 vs 被反驳汇总", expert:"系统", eta:"~ 1 min", started:"09:40" },
    { id:4, kind:"批注",    status:"待审",   progress:100, title:"《组织行为学》对「阵型分析」的批注 #87",        expert:"Edgar Schein 学派", eta:"已完成", started:"08:50" },
    { id:5, kind:"批注",    status:"待审",   progress:100, title:"《战略反转》对「定价决策」的反驳意见",           expert:"Hamilton Helmer",   eta:"已完成", started:"08:22" },
    { id:6, kind:"批注",    status:"待审",   progress:100, title:"《博弈论》对「供应商谈判」的下一步建议",         expert:"博弈论学派",         eta:"已完成", started:"07:55" },
    { id:7, kind:"批注",    status:"待审",   progress:100, title:"《认知偏差》对「决策会议质量」评分",              expert:"Kahneman 学派",     eta:"已完成", started:"07:12" },
    { id:8, kind:"批注",    status:"待审",   progress:100, title:"《系统思考》对「组织结构调整」长期影响分析",      expert:"Peter Senge",       eta:"已完成", started:"昨 22:48" },
    { id:9, kind:"批注",    status:"失败",   progress:0,   title:"《第一性原理》对「产品定位」批注 · 原文不足",      expert:"First Principles",  eta:"需重试", started:"昨 19:30" },
    { id:10, kind:"定时",  status:"计划中", progress:0,   title:"每周一 09:00 · 董事会预读包自动生成",              expert:"系统",              eta:"下次 周一",  started:"-" },
    { id:11, kind:"定时",  status:"计划中", progress:0,   title:"每月 1 日 · 心智模型命中率盘点",                   expert:"系统",              eta:"下次 12/01", started:"-" },
  ];

  const groups = [
    { label:"运行中", key:"运行中", tone:"#7BA7C4" },
    { label:"待审",   key:"待审",   tone:"#D9B88E" },
    { label:"失败",   key:"失败",   tone:"#E6A6A6" },
    { label:"计划中", key:"计划中", tone:"#A8A0D9" },
  ];

  return (
    <RoomShell title="任务队列" slug="tasks" section="生产" tone={tone} icon="⏳">
      {/* 汇总条 */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:22, maxWidth:900}}>
        {groups.map(g=>{
          const n = tasks.filter(t=>t.status===g.key).length;
          return (
            <div key={g.key} style={{
              padding:"14px 18px", background:"rgba(0,0,0,0.25)",
              border:`1px solid ${g.tone}33`, borderLeft:`3px solid ${g.tone}`, borderRadius:4,
            }}>
              <div style={{fontFamily:"var(--mono)", fontSize:10, color:g.tone, letterSpacing:0.3, textTransform:"uppercase"}}>{g.label}</div>
              <div style={{fontFamily:"var(--serif)", fontSize:26, fontWeight:600, color:"#F3ECDD", marginTop:3}}>{n}</div>
            </div>
          );
        })}
      </div>

      {/* 任务列表 */}
      <div style={{display:"flex", flexDirection:"column", gap:8, maxWidth:1200}}>
        {groups.map(g=>{
          const list = tasks.filter(t=>t.status===g.key);
          if(!list.length) return null;
          return (
            <React.Fragment key={g.key}>
              <div style={{
                fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14, color:g.tone,
                margin:"14px 0 4px", paddingLeft:4,
              }}>{g.label} · {list.length}</div>
              {list.map(t=><TaskRow key={t.id} t={t} tone={g.tone}/>)}
            </React.Fragment>
          );
        })}
      </div>
    </RoomShell>
  );
}
function TaskRow({ t, tone }) {
  return (
    <div style={{
      padding:"12px 16px", background:"rgba(0,0,0,0.22)",
      border:`1px solid rgba(217,184,142,0.1)`, borderRadius:4,
      display:"grid", gridTemplateColumns:"60px 1fr 170px 90px 110px", gap:14, alignItems:"center",
    }}>
      <span style={{
        fontFamily:"var(--mono)", fontSize:9.5, color:tone,
        padding:"3px 7px", background:`${tone}18`, border:`1px solid ${tone}44`, borderRadius:3,
        textAlign:"center", letterSpacing:0.3,
      }}>{t.kind}</span>
      <div>
        <div style={{fontFamily:"var(--serif)", fontSize:13.5, color:"#F3ECDD", lineHeight:1.4}}>{t.title}</div>
        {t.status==="运行中" && (
          <div style={{marginTop:8, height:3, background:"rgba(217,184,142,0.1)", borderRadius:99, overflow:"hidden"}}>
            <div style={{width:`${t.progress}%`, height:"100%", background:tone, transition:"width 200ms"}}/>
          </div>
        )}
      </div>
      <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"rgba(232,227,216,0.6)", letterSpacing:0.2}}>
        {t.expert}
      </div>
      <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.5)"}}>
        {t.eta}
      </div>
      <div style={{display:"flex", gap:6, justifyContent:"flex-end"}}>
        {t.status==="待审" && <BtnGhost tone={tone}>查看</BtnGhost>}
        {t.status==="失败" && <BtnGhost tone="#E6A6A6">重试</BtnGhost>}
        {t.status==="运行中" && <BtnGhost tone="rgba(232,227,216,0.5)">取消</BtnGhost>}
        {t.status==="计划中" && <BtnGhost tone="#A8A0D9">编辑</BtnGhost>}
      </div>
    </div>
  );
}
function BtnGhost({ tone, children }) {
  return (
    <button style={{
      background:"transparent", border:`1px solid ${tone}55`, color:tone,
      padding:"4px 10px", borderRadius:3, cursor:"pointer",
      fontFamily:"var(--mono)", fontSize:10, letterSpacing:0.2,
    }}>{children}</button>
  );
}

// ────────────────────────────────────────
// /content-library · 素材库
// ────────────────────────────────────────
function ContentLibraryRoom() {
  const tone = "#7BA7C4";
  const [filter, setFilter] = React.useState("all");
  const clips = [
    { type:"转写", meeting:"Q3 定价讨论会", speaker:"Chen Yi", time:"14:32", text:"如果我们把基础版定在 99,Pro 版定在 299,其实是在告诉市场我们不相信自己的 Pro 版值 4 倍。", refs:3, heat:"高" },
    { type:"证据", meeting:"客户投诉专题",   speaker:"系统截图", time:"09:18", text:"[图表] 近 30 天客户满意度从 4.2 降至 3.7 · 主要流失在「响应速度」维度", refs:5, heat:"高" },
    { type:"引用", meeting:"董事会月度",     speaker:"张董",    time:"10:44", text:"增长放缓不是病,是药。真正的病是你为了掩盖放缓而做的那些动作。", refs:8, heat:"极高" },
    { type:"转写", meeting:"供应商谈判",     speaker:"Liu Qing", time:"16:02", text:"他们最担心的不是价格,是失去我们这个客户后对他们产能利用率的影响。", refs:2, heat:"中" },
    { type:"转写", meeting:"组织调整会",     speaker:"CEO",     time:"11:05", text:"我承认上半年的结构调整没有达到预期,主要原因是我高估了中层的适应速度。", refs:4, heat:"高" },
    { type:"证据", meeting:"Q3 定价讨论会",  speaker:"数据表",   time:"14:20", text:"[表格] 竞品价格带分布 · 89/199/399/899 四档,我们预设的 99/299 错开了主流带", refs:3, heat:"中" },
    { type:"引用", meeting:"产品战略会",     speaker:"Wang Lei", time:"15:30", text:"我们不是在做一个功能更多的产品,我们是在做一个让用户思考更少的产品。", refs:6, heat:"高" },
    { type:"转写", meeting:"客户投诉专题",   speaker:"Zhao",    time:"09:42", text:"客户的情绪不是因为问题本身,而是因为他们感觉我们没听见。", refs:4, heat:"高" },
  ];
  const list = filter==="all" ? clips : clips.filter(c=>c.type===filter);
  return (
    <RoomShell title="素材库" slug="content-library" section="生产" tone={tone} icon="📁">
      {/* 筛选条 */}
      <div style={{display:"flex", gap:10, marginBottom:20, alignItems:"center"}}>
        {["all","转写","证据","引用"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:"6px 14px", borderRadius:4, cursor:"pointer",
            background: filter===f ? `${tone}22` : "transparent",
            border:`1px solid ${filter===f?tone:"rgba(217,184,142,0.2)"}`,
            color: filter===f?tone:"rgba(232,227,216,0.6)",
            fontFamily:"var(--mono)", fontSize:11, letterSpacing:0.3,
          }}>{f==="all"?"全部":f}</button>
        ))}
        <div style={{flex:1}}/>
        <input placeholder="搜索素材..." style={{
          padding:"6px 12px", borderRadius:4, background:"rgba(0,0,0,0.3)",
          border:"1px solid rgba(217,184,142,0.2)", color:"#E8E3D8",
          fontFamily:"var(--sans)", fontSize:12, width:220,
        }}/>
      </div>

      {/* 卡片网格 */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:14, maxWidth:1200}}>
        {list.map((c,i)=>(
          <div key={i} style={{
            padding:"16px 20px", background:"rgba(0,0,0,0.22)",
            border:`1px solid rgba(217,184,142,0.12)`, borderRadius:5,
            borderLeft: c.heat==="极高"?`3px solid #E6A6A6`: c.heat==="高"?`3px solid ${tone}`:`3px solid rgba(217,184,142,0.2)`,
          }}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
              <span style={{
                fontFamily:"var(--mono)", fontSize:9, letterSpacing:0.3,
                padding:"2px 6px", borderRadius:2,
                background:`${tone}22`, color:tone, border:`1px solid ${tone}44`,
              }}>{c.type}</span>
              <span style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.55)"}}>
                {c.meeting} · {c.speaker} · {c.time}
              </span>
              <div style={{flex:1}}/>
              <span style={{fontFamily:"var(--mono)", fontSize:9.5, color:"rgba(232,227,216,0.5)"}}>
                被引 {c.refs} 次
              </span>
            </div>
            <div style={{
              fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14,
              color:"#F3ECDD", lineHeight:1.55,
              borderLeft:`2px solid ${tone}55`, paddingLeft:10, marginTop:4,
            }}>
              "{c.text}"
            </div>
          </div>
        ))}
      </div>
    </RoomShell>
  );
}

// ────────────────────────────────────────
// /expert-library · 专家库(核心)
// ────────────────────────────────────────
function ExpertLibraryRoom() {
  const tone = "#D9B88E";
  const [view, setView] = React.useState("experts"); // experts | models | audit
  const experts = [
    { name:"博弈论学派",       school:"Nash · Schelling",   annotations:18, accept:0.72, hit:["囚徒困境","信号博弈","承诺机制"], color:"#D9B88E" },
    { name:"Kahneman 学派",    school:"行为经济学",          annotations:15, accept:0.80, hit:["系统1/2","锚定效应","损失厌恶"], color:"#C8A15C" },
    { name:"Edgar Schein",    school:"组织行为学",          annotations:12, accept:0.67, hit:["组织文化三层","人为文物"], color:"#A8A0D9" },
    { name:"Hamilton Helmer", school:"7 Powers · 战略",    annotations:10, accept:0.60, hit:["Counter-positioning","规模经济"], color:"#7BA7C4" },
    { name:"Peter Senge",     school:"系统思考",            annotations:11, accept:0.75, hit:["系统回路","心智模型"], color:"#C8E1D2" },
    { name:"First Principles", school:"第一性原理",         annotations:8,  accept:0.55, hit:["回到本源","拆解假设"], color:"#E6A6A6" },
    { name:"Clayton Christensen", school:"破坏式创新",     annotations:7,  accept:0.71, hit:["颠覆理论","用户要完成的任务"], color:"#FFC857" },
    { name:"Stoicism",        school:"斯多葛哲学",         annotations:6,  accept:0.65, hit:["控制二分","负面想象"], color:"#D9B88E" },
  ];
  const models = [
    { name:"系统1 vs 系统2",    expert:"Kahneman",  hits:24, wins:16, losses:3 },
    { name:"Counter-positioning", expert:"Helmer",  hits:18, wins:12, losses:5 },
    { name:"组织文化三层",      expert:"Schein",    hits:15, wins:10, losses:2 },
    { name:"颠覆理论",          expert:"Christensen",hits:14, wins:9, losses:3 },
    { name:"信号博弈",          expert:"博弈论",    hits:13, wins:8, losses:4 },
    { name:"控制二分",          expert:"Stoicism",  hits:12, wins:9, losses:1 },
    { name:"锚定效应",          expert:"Kahneman",  hits:11, wins:7, losses:3 },
    { name:"第一性原理",        expert:"FP",        hits:10, wins:5, losses:4 },
  ];

  return (
    <RoomShell title="专家库" slug="expert-library" section="核心" tone={tone} icon="🧠">
      {/* 三视图切换 */}
      <div style={{display:"flex", gap:2, marginBottom:24, borderBottom:`1px solid ${tone}22`, paddingBottom:1}}>
        {[
          { id:"experts", label:"按专家浏览", count:"12" },
          { id:"models",  label:"按心智模型", count:"34" },
          { id:"audit",   label:"认知盘点",   count:"接受 68%" },
        ].map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} style={{
            padding:"10px 18px", border:0, cursor:"pointer", background:"transparent",
            borderBottom: view===v.id ? `2px solid ${tone}` : "2px solid transparent",
            color: view===v.id ? tone : "rgba(232,227,216,0.55)",
            fontFamily:"var(--serif)", fontStyle:"italic", fontSize:15, fontWeight:600,
            display:"flex", alignItems:"center", gap:8,
          }}>
            {v.label}
            <span style={{fontFamily:"var(--mono)", fontSize:10, opacity:0.7, fontStyle:"normal", fontWeight:400}}>{v.count}</span>
          </button>
        ))}
      </div>

      {view==="experts" && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:14, maxWidth:1200}}>
          {experts.map((e,i)=>(
            <div key={i} style={{
              padding:"16px 20px", background:"rgba(0,0,0,0.25)",
              border:`1px solid ${e.color}33`, borderLeft:`3px solid ${e.color}`, borderRadius:5,
            }}>
              <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4}}>
                <div>
                  <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:18, fontWeight:600, color:"#F3ECDD"}}>{e.name}</div>
                  <div style={{fontFamily:"var(--mono)", fontSize:10, color:e.color, letterSpacing:0.3, marginTop:2}}>{e.school}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.5)", letterSpacing:0.3}}>批注</div>
                  <div style={{fontFamily:"var(--serif)", fontSize:22, fontWeight:600, color:e.color, lineHeight:1}}>{e.annotations}</div>
                </div>
              </div>
              {/* 接受率条 */}
              <div style={{marginTop:10}}>
                <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--mono)", fontSize:9.5, color:"rgba(232,227,216,0.5)", marginBottom:3, letterSpacing:0.3}}>
                  <span>接受率</span><span>{Math.round(e.accept*100)}%</span>
                </div>
                <div style={{height:3, background:"rgba(217,184,142,0.1)", borderRadius:99, overflow:"hidden"}}>
                  <div style={{width:`${e.accept*100}%`, height:"100%", background:e.color}}/>
                </div>
              </div>
              {/* 代表模型 */}
              <div style={{display:"flex", flexWrap:"wrap", gap:5, marginTop:10}}>
                {e.hit.map((h,hi)=>(
                  <span key={hi} style={{
                    fontFamily:"var(--mono)", fontSize:9.5, color:e.color,
                    padding:"2px 7px", background:`${e.color}18`, border:`1px solid ${e.color}33`,
                    borderRadius:3, letterSpacing:0.2,
                  }}>{h}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="models" && (
        <div style={{maxWidth:1200}}>
          <div style={{
            display:"grid", gridTemplateColumns:"2fr 1.5fr 90px 90px 90px 100px",
            gap:14, padding:"8px 16px",
            fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.45)", letterSpacing:0.3, textTransform:"uppercase",
          }}>
            <span>心智模型</span><span>来源学派</span><span>命中</span><span>赢</span><span>输</span><span>胜率</span>
          </div>
          {models.map((m,i)=>{
            const rate = m.wins/(m.wins+m.losses);
            return (
              <div key={i} style={{
                display:"grid", gridTemplateColumns:"2fr 1.5fr 90px 90px 90px 100px", gap:14,
                padding:"14px 16px", background:"rgba(0,0,0,0.18)",
                borderTop:"1px solid rgba(217,184,142,0.08)", alignItems:"center",
              }}>
                <span style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14, color:"#F3ECDD"}}>{m.name}</span>
                <span style={{fontFamily:"var(--mono)", fontSize:11, color:tone}}>{m.expert}</span>
                <span style={{fontFamily:"var(--mono)", fontSize:13, color:"#F3ECDD"}}>{m.hits}</span>
                <span style={{fontFamily:"var(--mono)", fontSize:13, color:"#C8E1D2"}}>{m.wins}</span>
                <span style={{fontFamily:"var(--mono)", fontSize:13, color:"#E6A6A6"}}>{m.losses}</span>
                <div>
                  <div style={{height:4, background:"rgba(217,184,142,0.12)", borderRadius:99, overflow:"hidden"}}>
                    <div style={{width:`${rate*100}%`, height:"100%", background:rate>0.7?"#C8E1D2":rate>0.5?tone:"#E6A6A6"}}/>
                  </div>
                  <div style={{fontFamily:"var(--mono)", fontSize:9.5, color:"rgba(232,227,216,0.55)", marginTop:3}}>{Math.round(rate*100)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view==="audit" && (
        <div style={{maxWidth:1200}}>
          {/* 三个大数字 */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:16, marginBottom:28}}>
            {[
              { l:"总批注", v:"87", c:tone },
              { l:"接受率", v:"68%", c:"#C8E1D2" },
              { l:"反驳率", v:"12%", c:"#E6A6A6" },
              { l:"悬置",  v:"20%", c:"#A8A0D9" },
            ].map((s,i)=>(
              <div key={i} style={{
                padding:"18px 22px", background:"rgba(0,0,0,0.25)",
                border:`1px solid ${s.c}33`, borderLeft:`3px solid ${s.c}`, borderRadius:5,
              }}>
                <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.5)", letterSpacing:0.3, textTransform:"uppercase"}}>{s.l}</div>
                <div style={{fontFamily:"var(--serif)", fontSize:34, fontWeight:600, color:s.c, marginTop:4, lineHeight:1}}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* 盲区 */}
          <div style={{
            padding:"18px 22px", background:"rgba(230,166,166,0.06)",
            border:"1px solid rgba(230,166,166,0.3)", borderRadius:5,
          }}>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:"#E6A6A6", letterSpacing:0.3, textTransform:"uppercase"}}>盲区识别 · Blind Spots</div>
            <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:16, color:"#F3ECDD", marginTop:4, marginBottom:12}}>
              近 30 天,你可能低估了这些视角
            </div>
            {[
              { t:"客户心理路径(Jobs to be Done)", reason:"相关议题 8 次,但 Christensen 学派仅被召唤 1 次" },
              { t:"长期系统动力学", reason:"短期决策被反复接受,但 Senge 视角的长期反馈回路仅被采纳 20%" },
              { t:"监管视角(利益相关方)",          reason:"外部议题中,政策/合规维度专家调用 0 次" },
            ].map((b,i)=>(
              <div key={i} style={{
                padding:"10px 14px", marginTop:8,
                background:"rgba(0,0,0,0.2)", border:"1px solid rgba(230,166,166,0.2)", borderRadius:3,
              }}>
                <div style={{fontFamily:"var(--serif)", fontSize:14, color:"#F3ECDD", fontWeight:500}}>{b.t}</div>
                <div style={{fontFamily:"var(--sans)", fontSize:12, color:"rgba(232,227,216,0.55)", marginTop:3, fontStyle:"italic"}}>{b.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </RoomShell>
  );
}

// ────────────────────────────────────────
// /assets · 资产市集
// ────────────────────────────────────────
function AssetsRoom() {
  const tone = "#A8A0D9";
  const assets = [
    { kind:"框架", title:"定价决策三问",     subtitle:"锚 / 位 / 守",         uses:14, success:0.79, born:"Q3 定价讨论会",      author:"CEO × 博弈论",    variant:"经典" },
    { kind:"框架", title:"客户异议五阶",     subtitle:"听 · 复述 · 认 · 补 · 约", uses:22, success:0.83, born:"客户投诉专题",    author:"CEO × Kahneman",    variant:"经典" },
    { kind:"模板", title:"董事会预读包",     subtitle:"前瞻 / 回顾 / 决策点",   uses:8,  success:0.88, born:"董事会月度",          author:"CEO",              variant:"每月更新" },
    { kind:"模板", title:"会议开场 7 分钟",   subtitle:"对齐 · 风险 · 假设",     uses:31, success:0.71, born:"多次会议沉淀",        author:"系统汇总",          variant:"V3" },
    { kind:"晶体", title:"「增长放缓是药」", subtitle:"张董反复强调的判断",     uses:6,  success:0.92, born:"董事会月度",          author:"张董",              variant:"原话保留" },
    { kind:"晶体", title:"「用户思考更少」", subtitle:"Wang Lei 的产品哲学",    uses:9,  success:0.74, born:"产品战略会",          author:"Wang Lei",         variant:"原话保留" },
    { kind:"框架", title:"承诺追踪三问",    subtitle:"谁 · 什么 · 何时验证",    uses:19, success:0.68, born:"多次项目会议",        author:"系统汇总",          variant:"V2" },
    { kind:"模板", title:"周日认知盘点",     subtitle:"接受 · 反驳 · 悬置 · 盲区", uses:4, success:0.85, born:"阳台时光",          author:"CEO",              variant:"本周" },
  ];
  return (
    <RoomShell title="资产市集" slug="assets" section="消费" tone={tone} icon="◆">
      <div style={{display:"flex", gap:10, marginBottom:20, alignItems:"center"}}>
        {["全部","框架","模板","晶体"].map((f,i)=>(
          <button key={i} style={{
            padding:"6px 14px", borderRadius:4, cursor:"pointer",
            background: i===0 ? `${tone}22` : "transparent",
            border:`1px solid ${i===0?tone:"rgba(217,184,142,0.2)"}`,
            color: i===0?tone:"rgba(232,227,216,0.6)",
            fontFamily:"var(--mono)", fontSize:11, letterSpacing:0.3,
          }}>{f}</button>
        ))}
        <div style={{flex:1}}/>
        <span style={{fontFamily:"var(--mono)", fontSize:10.5, color:"rgba(232,227,216,0.5)"}}>
          按使用次数排序 ▾
        </span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, maxWidth:1240}}>
        {assets.map((a,i)=>(
          <div key={i} style={{
            padding:"18px 20px", background:"rgba(0,0,0,0.25)",
            border:`1px solid ${tone}33`, borderLeft:`3px solid ${tone}`, borderRadius:5,
            position:"relative",
          }}>
            <div style={{
              position:"absolute", top:12, right:14,
              fontFamily:"var(--mono)", fontSize:9, color:tone,
              padding:"2px 6px", background:`${tone}18`, borderRadius:2, border:`1px solid ${tone}33`,
              letterSpacing:0.3,
            }}>{a.kind}</div>
            <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:17, fontWeight:600, color:"#F3ECDD", paddingRight:50}}>
              {a.title}
            </div>
            <div style={{fontFamily:"var(--serif)", fontSize:12.5, color:"rgba(232,227,216,0.65)", fontStyle:"italic", marginTop:4, lineHeight:1.45}}>
              {a.subtitle}
            </div>
            <div style={{
              marginTop:14, paddingTop:12,
              borderTop:"1px solid rgba(217,184,142,0.12)",
              display:"flex", alignItems:"center", justifyContent:"space-between",
            }}>
              <div>
                <div style={{fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.5)", letterSpacing:0.3}}>使用</div>
                <div style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, color:tone, lineHeight:1}}>{a.uses}</div>
              </div>
              <div>
                <div style={{fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.5)", letterSpacing:0.3}}>有效率</div>
                <div style={{fontFamily:"var(--mono)", fontSize:14, color: a.success>0.8?"#C8E1D2":a.success>0.65?tone:"#E6A6A6", marginTop:3}}>
                  {Math.round(a.success*100)}%
                </div>
              </div>
              <div style={{textAlign:"right", maxWidth:110}}>
                <div style={{fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.5)", letterSpacing:0.3}}>来源</div>
                <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.7)", marginTop:3, lineHeight:1.3}}>
                  {a.born}
                </div>
              </div>
            </div>
            <div style={{
              marginTop:10, fontFamily:"var(--mono)", fontSize:9.5, color:"rgba(232,227,216,0.45)",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <span>{a.author}</span>
              <span style={{color:tone, opacity:0.7}}>· {a.variant}</span>
            </div>
          </div>
        ))}
      </div>
    </RoomShell>
  );
}

// ────────────────────────────────────────
// /hot-topics · 热议题
// ────────────────────────────────────────
function HotTopicsRoom() {
  const tone = "#A8A0D9";
  const topics = [
    { t:"定价策略 Q3-Q4", heat:92, trend:"升", mtgs:8, experts:["博弈论","Helmer"], models:["Counter-positioning","信号博弈"], status:"悬置", curve:[30,45,60,55,70,80,85,92] },
    { t:"客户流失与满意度", heat:78, trend:"升", mtgs:6, experts:["Kahneman"], models:["锚定","损失厌恶"], status:"恶化", curve:[40,45,50,60,65,72,75,78] },
    { t:"供应链谈判",     heat:55, trend:"平", mtgs:4, experts:["博弈论"], models:["承诺机制"], status:"进展", curve:[40,50,55,60,55,50,55,55] },
    { t:"组织结构调整",   heat:82, trend:"降", mtgs:5, experts:["Schein"], models:["文化三层"], status:"进展", curve:[50,65,82,90,88,85,84,82] },
    { t:"产品战略聚焦",   heat:68, trend:"升", mtgs:5, experts:["Christensen","FP"], models:["JTBD","颠覆理论"], status:"讨论中", curve:[35,42,48,55,58,62,65,68] },
    { t:"董事会关切",     heat:45, trend:"平", mtgs:3, experts:["Stoicism"], models:["控制二分"], status:"悬置", curve:[40,42,45,48,45,42,43,45] },
  ];
  return (
    <RoomShell title="热议题" slug="hot-topics" section="消费" tone={tone} icon="◉">
      <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:14, color:"rgba(232,227,216,0.6)", marginBottom:20, maxWidth:760}}>
        近 30 天被反复召唤的主题。热度 = 跨会议被提及次数 × 当前讨论密度;状态 = 解决 / 讨论中 / 悬置 / 恶化。
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:10, maxWidth:1240}}>
        {topics.map((t,i)=>{
          const statusColor = t.status==="进展" ? "#C8E1D2" : t.status==="恶化" ? "#E6A6A6" : t.status==="悬置" ? "#FFC857" : tone;
          const trendIcon = t.trend==="升" ? "▲" : t.trend==="降" ? "▼" : "■";
          const trendColor = t.trend==="升" ? "#E6A6A6" : t.trend==="降" ? "#C8E1D2" : "rgba(232,227,216,0.5)";
          return (
            <div key={i} style={{
              padding:"14px 18px", background:"rgba(0,0,0,0.22)",
              border:`1px solid rgba(217,184,142,0.14)`, borderLeft:`3px solid ${statusColor}`, borderRadius:5,
              display:"grid", gridTemplateColumns:"1.4fr 120px 80px 1fr 80px 90px", gap:18, alignItems:"center",
            }}>
              {/* 主题 */}
              <div>
                <div style={{fontFamily:"var(--serif)", fontStyle:"italic", fontSize:17, fontWeight:600, color:"#F3ECDD"}}>{t.t}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:10, color:"rgba(232,227,216,0.5)", marginTop:3}}>
                  {t.mtgs} 场会议
                </div>
              </div>
              {/* 热度曲线 */}
              <svg width="110" height="32" viewBox="0 0 110 32">
                <polyline
                  points={t.curve.map((v,ci)=>`${ci*15+2},${32-v/100*28}`).join(" ")}
                  fill="none" stroke={tone} strokeWidth="1.5"
                />
                {t.curve.map((v,ci)=>(
                  <circle key={ci} cx={ci*15+2} cy={32-v/100*28} r="1.2" fill={tone}/>
                ))}
              </svg>
              {/* 趋势 */}
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"var(--mono)", fontSize:15, color:trendColor, fontWeight:600}}>{trendIcon} {t.heat}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:9, color:"rgba(232,227,216,0.4)", letterSpacing:0.3, marginTop:2}}>热度</div>
              </div>
              {/* 专家/模型 */}
              <div>
                <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:4}}>
                  {t.experts.map((e,ei)=>(
                    <span key={ei} style={{
                      fontFamily:"var(--mono)", fontSize:9.5, color:tone,
                      padding:"1px 6px", background:`${tone}18`, borderRadius:2, letterSpacing:0.2,
                    }}>{e}</span>
                  ))}
                </div>
                <div style={{display:"flex", flexWrap:"wrap", gap:4}}>
                  {t.models.map((m,mi)=>(
                    <span key={mi} style={{
                      fontFamily:"var(--serif)", fontStyle:"italic", fontSize:10.5,
                      color:"rgba(232,227,216,0.65)",
                    }}>· {m}</span>
                  ))}
                </div>
              </div>
              {/* 状态 */}
              <div style={{
                fontFamily:"var(--mono)", fontSize:10.5, color:statusColor,
                padding:"3px 8px", background:`${statusColor}18`, border:`1px solid ${statusColor}44`,
                borderRadius:3, textAlign:"center", letterSpacing:0.3,
              }}>{t.status}</div>
              <div style={{textAlign:"right"}}>
                <button style={{
                  background:"transparent", border:`1px solid ${tone}55`, color:tone,
                  padding:"5px 10px", borderRadius:3, cursor:"pointer",
                  fontFamily:"var(--mono)", fontSize:10, letterSpacing:0.2,
                }}>展开 ↗</button>
              </div>
            </div>
          );
        })}
      </div>
    </RoomShell>
  );
}

// ────────────────────────────────────────
// Router
// ────────────────────────────────────────
function BrainRoomRouter() {
  const p = new URLSearchParams(window.location.search).get("p") || "expert-library";
  switch(p) {
    case "tasks": return <TasksRoom/>;
    case "content-library": return <ContentLibraryRoom/>;
    case "expert-library": return <ExpertLibraryRoom/>;
    case "assets": return <AssetsRoom/>;
    case "hot-topics": return <HotTopicsRoom/>;
    default: return <ExpertLibraryRoom/>;
  }
}

Object.assign(window, {
  BrainRoomRouter,
  TasksRoom, ContentLibraryRoom, ExpertLibraryRoom, AssetsRoom, HotTopicsRoom,
});
