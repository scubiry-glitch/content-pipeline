// library.jsx — 会议纪要库 · 支持不同的文件夹分组
// A browsable library of meeting minutes organized into folder groups.
// 支持三种分组维度：按项目 · 按客户 · 按主题标签
// 左侧是文件夹树，中间是某一分组下的会议纪要卡片，右侧是所选会议的详情预览。

function Library() {
  const [groupBy, setGroupBy] = React.useState("project"); // project | client | topic
  const [activeGroup, setActiveGroup] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState("M-2026-04-11-0237");
  const [renaming, setRenaming] = React.useState(null);

  // Group definitions — same meetings, different folder trees
  const GROUP_TREES = {
    project: [
      { id:"p-yuanling-q2", name:"远翎资本 · Q2 2026", color:"accent", count:8,
        children:[
          { id:"p-yuanling-q2-infra", name:"AI 基础设施", count:5 },
          { id:"p-yuanling-q2-consumer", name:"消费科技", count:3 },
        ]},
      { id:"p-yuanling-q1", name:"远翎资本 · Q1 2026", color:"ghost", count:12 },
      { id:"p-internal", name:"内部团队会",  color:"amber", count:6 },
      { id:"p-lp", name:"LP 沟通",  color:"teal", count:4 },
      { id:"p-archive", name:"归档",    color:"ghost", count:47 },
    ],
    client: [
      { id:"c-yuanling", name:"远翎资本",   color:"accent", count:20 },
      { id:"c-hengxin", name:"恒信创投",   color:"teal", count:7 },
      { id:"c-starwave", name:"星浪科技",  color:"amber", count:4 },
      { id:"c-unassigned", name:"未分配",  color:"ghost", count:3 },
    ],
    topic: [
      { id:"t-ai-infra", name:"AI 基础设施",  color:"accent", count:9 },
      { id:"t-valuation", name:"估值方法",    color:"teal", count:6 },
      { id:"t-compliance", name:"合规与 LP",  color:"amber", count:5 },
      { id:"t-exit", name:"退出路径",          color:"ghost", count:4 },
      { id:"t-geo", name:"地缘与政策",         color:"ghost", count:3 },
    ],
  };

  // Meetings (sample) — every meeting is mapped into each grouping scheme
  const MEETINGS = [
    { id:"M-2026-04-11-0237", title:"2026 Q2 远翎资本 · AI 基础设施投资策略评审",
      date:"2026-04-11", duration:"118m", attendees:6,
      groups:{ project:"p-yuanling-q2-infra", client:"c-yuanling", topic:"t-ai-infra" },
      status:"analyzed", tension:3, consensus:2, divergence:2, starred:true,
      preset:"standard", tags:["投资策略","基础设施","Q2"] },
    { id:"M-2026-04-04-0214", title:"推理层 candidate 尽调 · 闭门评估",
      date:"2026-04-04", duration:"74m", attendees:4,
      groups:{ project:"p-yuanling-q2-infra", client:"c-yuanling", topic:"t-ai-infra" },
      status:"analyzed", tension:1, consensus:3, divergence:1, starred:false,
      preset:"standard", tags:["尽调","推理层"] },
    { id:"M-2026-03-28-0201", title:"远翎资本 · Q1 复盘 · 基础设施方向",
      date:"2026-03-28", duration:"142m", attendees:8,
      groups:{ project:"p-yuanling-q1", client:"c-yuanling", topic:"t-ai-infra" },
      status:"analyzed", tension:5, consensus:4, divergence:3, starred:true,
      preset:"max", tags:["Q1 复盘"] },
    { id:"M-2026-03-22-0188", title:"估值模型校准 · 工程侧 + 产品侧",
      date:"2026-03-22", duration:"56m", attendees:5,
      groups:{ project:"p-internal", client:"c-yuanling", topic:"t-valuation" },
      status:"analyzed", tension:2, consensus:3, divergence:1, starred:false,
      preset:"standard", tags:["估值","内部"] },
    { id:"M-2026-03-14-0173", title:"团队内部 · 推理层 subadvisor 选择讨论",
      date:"2026-03-14", duration:"68m", attendees:4,
      groups:{ project:"p-internal", client:"c-yuanling", topic:"t-ai-infra" },
      status:"analyzed", tension:2, consensus:2, divergence:2, starred:false,
      preset:"standard", tags:["subadvisor","推理层"] },
    { id:"M-2026-03-08-0166", title:"恒信创投 · 半导体中游联合投资路演",
      date:"2026-03-08", duration:"92m", attendees:7,
      groups:{ project:"p-yuanling-q1", client:"c-hengxin", topic:"t-ai-infra" },
      status:"analyzed", tension:4, consensus:2, divergence:3, starred:false,
      preset:"standard", tags:["联合投资","半导体"] },
    { id:"M-2026-02-22-0149", title:"LP 沟通会 · Q1 进度披露",
      date:"2026-02-22", duration:"95m", attendees:12,
      groups:{ project:"p-lp", client:"c-yuanling", topic:"t-compliance" },
      status:"analyzed", tension:3, consensus:5, divergence:1, starred:true,
      preset:"standard", tags:["LP","披露"] },
    { id:"M-2026-02-15-0138", title:"星浪科技 · 产品路径与 AI 基建选型",
      date:"2026-02-15", duration:"81m", attendees:5,
      groups:{ project:"p-yuanling-q1", client:"c-starwave", topic:"t-ai-infra" },
      status:"analyzed", tension:2, consensus:4, divergence:2, starred:false,
      preset:"lite", tags:["产品","基建选型"] },
    { id:"M-2026-02-08-0121", title:"H-chip 进口配额 · 应急预案研讨",
      date:"2026-02-08", duration:"47m", attendees:4,
      groups:{ project:"p-internal", client:"c-yuanling", topic:"t-geo" },
      status:"analyzed", tension:4, consensus:1, divergence:3, starred:false,
      preset:"max", tags:["地缘","H-chip"] },
    { id:"M-2026-01-30-0107", title:"2026 退出路径预演 · 头部 3 家",
      date:"2026-01-30", duration:"103m", attendees:6,
      groups:{ project:"p-yuanling-q1", client:"c-yuanling", topic:"t-exit" },
      status:"analyzed", tension:3, consensus:2, divergence:3, starred:false,
      preset:"standard", tags:["退出","预演"] },
    { id:"M-2026-01-18-0093", title:"合规边界 · 信息披露颗粒度讨论",
      date:"2026-01-18", duration:"38m", attendees:3,
      groups:{ project:"p-internal", client:"c-yuanling", topic:"t-compliance" },
      status:"draft", tension:1, consensus:1, divergence:1, starred:false,
      preset:"lite", tags:["合规","披露"] },
  ];

  const tree = GROUP_TREES[groupBy];
  const allGroupIds = React.useMemo(()=>{
    const collect = (nodes) => nodes.flatMap(n => [n.id, ...(n.children ? collect(n.children) : [])]);
    return collect(tree);
  }, [tree]);

  const matchGroup = (m, gid) => {
    if (!gid) return true;
    const mid = m.groups[groupBy];
    if (mid === gid) return true;
    // If gid is a parent, match its children
    const node = findNode(tree, gid);
    if (node && node.children) return node.children.some(c => c.id === mid);
    return false;
  };
  function findNode(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const r = findNode(n.children, id); if (r) return r; }
    }
    return null;
  }

  const visible = MEETINGS.filter(m => matchGroup(m, activeGroup));
  const selected = MEETINGS.find(m => m.id === selectedId) || visible[0];

  const groupTabs = [
    { id:"project", label:"按项目" },
    { id:"client",  label:"按客户" },
    { id:"topic",   label:"按主题" },
  ];

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      display:"grid", gridTemplateRows:"56px 1fr", color:"var(--ink)",
      fontFamily:"var(--sans)", overflow:"hidden",
    }}>
      {/* Top bar */}
      <header style={{
        display:"flex", alignItems:"center", gap:16, padding:"0 24px",
        borderBottom:"1px solid var(--line-2)", background:"var(--paper)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <div style={{
            width:24, height:24, borderRadius:6, background:"var(--ink)",
            color:"var(--paper)", display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"var(--serif)", fontStyle:"italic", fontWeight:600, fontSize:14,
          }}>M</div>
          <span style={{fontWeight:600, fontSize:14}}>会议纪要库</span>
          <window.MonoMeta>/ library</window.MonoMeta>
        </div>

        {/* Group-by tabs */}
        <div style={{height:24, width:1, background:"var(--line)"}}/>
        <div style={{fontSize:11.5, color:"var(--ink-3)"}}>分组方式</div>
        <div style={{display:"flex", gap:2, border:"1px solid var(--line)", borderRadius:6, padding:2}}>
          {groupTabs.map(g=>(
            <button key={g.id} onClick={()=>{setGroupBy(g.id); setActiveGroup(null);}} style={{
              padding:"4px 12px", border:0, borderRadius:4, fontSize:12,
              background: groupBy===g.id ? "var(--ink)" : "transparent",
              color: groupBy===g.id ? "var(--paper)" : "var(--ink-2)",
              cursor:"pointer", fontWeight: groupBy===g.id ? 600 : 450,
              fontFamily:"var(--sans)",
            }}>{g.label}</button>
          ))}
        </div>

        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
          <window.Chip tone="ghost">{MEETINGS.length} 条会议 · {allGroupIds.length} 个分组</window.Chip>
          <button style={{
            padding:"6px 14px", border:"1px solid var(--line)", background:"var(--paper)",
            color:"var(--ink-2)", fontSize:12, borderRadius:5, cursor:"pointer",
            display:"flex", alignItems:"center", gap:6, fontFamily:"var(--sans)",
          }}>
            <window.Icon name="search" size={12}/> 搜索
          </button>
          <button style={{
            padding:"6px 14px", border:"1px solid var(--ink)", background:"var(--ink)",
            color:"var(--paper)", fontSize:12, borderRadius:5, cursor:"pointer",
            display:"flex", alignItems:"center", gap:6, fontFamily:"var(--sans)", fontWeight:500,
          }}>
            <window.Icon name="plus" size={12}/> 新建纪要
          </button>
        </div>
      </header>

      <div style={{display:"grid", gridTemplateColumns:"240px 1fr 380px", overflow:"hidden"}}>
        {/* Left: folder tree */}
        <aside style={{
          borderRight:"1px solid var(--line-2)", background:"var(--paper-2)",
          padding:"18px 14px", overflowY:"auto",
        }}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, padding:"0 4px"}}>
            <window.SectionLabel>{groupBy==="project"?"项目":groupBy==="client"?"客户":"主题"}</window.SectionLabel>
            <button style={{
              border:0, background:"transparent", cursor:"pointer", color:"var(--ink-3)",
              padding:2, borderRadius:3, display:"flex",
            }} title="新建分组">
              <window.Icon name="plus" size={13}/>
            </button>
          </div>

          <button
            onClick={()=>setActiveGroup(null)}
            style={folderRowStyle(activeGroup===null)}
          >
            <window.Icon name="layers" size={13}/>
            <span style={{flex:1, textAlign:"left"}}>全部</span>
            <window.MonoMeta style={{fontSize:10}}>{MEETINGS.length}</window.MonoMeta>
          </button>

          <div style={{height:8}}/>

          {tree.map(node => (
            <FolderNode key={node.id} node={node} active={activeGroup}
              onSelect={setActiveGroup} onRename={setRenaming} renaming={renaming}
            />
          ))}

          <div style={{height:18}}/>
          <div style={{
            padding:"10px 10px", border:"1px dashed var(--line)", borderRadius:5,
            color:"var(--ink-3)", fontSize:11.5, lineHeight:1.5,
          }}>
            <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:4}}>
              <window.Icon name="folder" size={12}/>
              <span style={{fontFamily:"var(--mono)", fontSize:10}}>TIP</span>
            </div>
            拖拽会议到分组，或右键批量移动。分组可叠加标签与权限。
          </div>
        </aside>

        {/* Middle: meeting cards */}
        <main style={{overflow:"auto", padding:"20px 28px"}}>
          <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:4}}>
            <h2 style={{fontFamily:"var(--serif)", fontSize:22, fontWeight:600, margin:0, letterSpacing:"-0.01em"}}>
              {activeGroup ? (findNode(tree, activeGroup)?.name || "—") : "全部会议"}
            </h2>
            <window.MonoMeta>{visible.length} 条</window.MonoMeta>
          </div>
          <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:16}}>
            按生成时间倒序 · 点击卡片预览 · 拖拽到左侧分组移动
          </div>

          {/* Sub-folders if current group has children */}
          {activeGroup && (()=>{ const node = findNode(tree, activeGroup); if (node?.children) return (
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14}}>
              {node.children.map(c=>(
                <button key={c.id} onClick={()=>setActiveGroup(c.id)} style={{
                  padding:"6px 12px", border:"1px solid var(--line-2)", background:"var(--paper)",
                  borderRadius:5, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                  fontFamily:"var(--sans)", color:"var(--ink-2)",
                }}>
                  <window.Icon name="folder" size={11}/>
                  {c.name}
                  <window.MonoMeta style={{fontSize:10}}>{c.count}</window.MonoMeta>
                </button>
              ))}
            </div>
          ); return null; })()}

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            {visible.map(m => (
              <MeetingCard key={m.id} m={m}
                active={m.id===selectedId}
                onClick={()=>setSelectedId(m.id)}
                groupName={findNode(tree, m.groups[groupBy])?.name || ""}
              />
            ))}
            {visible.length===0 && (
              <div style={{
                gridColumn:"1 / -1", padding:"40px 20px",
                textAlign:"center", color:"var(--ink-3)", fontSize:13,
                background:"var(--paper-2)", borderRadius:6, border:"1px dashed var(--line)",
              }}>
                这个分组里还没有会议纪要
              </div>
            )}
          </div>
        </main>

        {/* Right: preview panel */}
        <aside style={{
          borderLeft:"1px solid var(--line-2)", background:"var(--paper)",
          overflow:"auto", padding:"22px 22px",
        }}>
          {selected && <PreviewPanel m={selected} tree={tree} groupBy={groupBy} findNode={findNode}/>}
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Folder row — one entry in the left tree
// ─────────────────────────────────────────────
function FolderNode({ node, active, onSelect, onRename, renaming, depth=0 }) {
  const [open, setOpen] = React.useState(true);
  const isActive = active === node.id;
  const dotColor = {
    accent:"var(--accent)", teal:"var(--teal)", amber:"var(--amber)", ghost:"var(--ink-4)",
  }[node.color || "ghost"];
  return (
    <div>
      <button onClick={()=>onSelect(node.id)} style={{
        ...folderRowStyle(isActive), paddingLeft: 8 + depth*14,
      }}>
        {node.children ? (
          <span onClick={e=>{e.stopPropagation(); setOpen(o=>!o);}} style={{display:"flex", cursor:"pointer", color:"var(--ink-3)"}}>
            <window.Icon name="chevronDown" size={12} style={{transform: open ? "none" : "rotate(-90deg)", transition:"transform 0.15s"}}/>
          </span>
        ) : (
          <span style={{width:12, display:"inline-block"}}/>
        )}
        <window.Dot color={dotColor} size={7}/>
        {renaming===node.id ? (
          <input autoFocus defaultValue={node.name}
            onBlur={()=>onRename(null)}
            onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape") onRename(null); }}
            style={{
              flex:1, border:"1px solid var(--accent)", borderRadius:3, padding:"1px 5px",
              fontSize:12.5, fontFamily:"var(--sans)", outline:"none", background:"var(--paper)",
            }}
          />
        ) : (
          <span
            onDoubleClick={e=>{ e.stopPropagation(); onRename(node.id); }}
            style={{flex:1, textAlign:"left", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}
          >{node.name}</span>
        )}
        <window.MonoMeta style={{fontSize:10}}>{node.count}</window.MonoMeta>
      </button>
      {node.children && open && (
        <div>
          {node.children.map(c => (
            <FolderNode key={c.id} node={c} active={active} onSelect={onSelect}
              onRename={onRename} renaming={renaming} depth={depth+1}/>
          ))}
        </div>
      )}
    </div>
  );
}

function folderRowStyle(active) {
  return {
    display:"flex", alignItems:"center", gap:8, width:"100%",
    padding:"6px 10px", border:0, borderRadius:5, cursor:"pointer",
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "oklch(0.32 0.1 40)" : "var(--ink-2)",
    fontWeight: active ? 600 : 450, fontSize:12.5, fontFamily:"var(--sans)",
    textAlign:"left", margin:"1px 0",
  };
}

// ─────────────────────────────────────────────
// Meeting card
// ─────────────────────────────────────────────
function MeetingCard({ m, active, onClick, groupName }) {
  return (
    <button onClick={onClick} style={{
      textAlign:"left", background:"var(--paper)",
      border: active ? "1px solid var(--accent)" : "1px solid var(--line-2)",
      borderRadius:8, padding:"14px 16px", cursor:"pointer",
      display:"flex", flexDirection:"column", gap:10,
      boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none",
      fontFamily:"var(--sans)", color:"var(--ink)",
    }}>
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <window.MonoMeta>{m.date}</window.MonoMeta>
        <window.Chip tone="ghost" style={{fontSize:10, padding:"1px 6px"}}>{m.preset}</window.Chip>
        <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:6}}>
          {m.starred && <window.Dot color="var(--amber)" size={7}/>}
          <window.MonoMeta style={{fontSize:10}}>{m.id.split("-").pop()}</window.MonoMeta>
        </div>
      </div>
      <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600, lineHeight:1.35, letterSpacing:"-0.005em"}}>
        {m.title}
      </div>
      <div style={{display:"flex", alignItems:"center", gap:8, fontSize:11.5, color:"var(--ink-3)"}}>
        <window.Icon name="clock" size={11}/> {m.duration}
        <window.Icon name="users" size={11} style={{marginLeft:4}}/> {m.attendees}
        {groupName && <>
          <span style={{color:"var(--ink-4)"}}>·</span>
          <span>{groupName}</span>
        </>}
      </div>
      <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
        <MiniStat icon="bolt"    color="var(--accent)" v={m.tension}    label="张力"/>
        <MiniStat icon="check"   color="oklch(0.5 0.1 140)" v={m.consensus}  label="共识"/>
        <MiniStat icon="git"     color="var(--teal)" v={m.divergence} label="分歧"/>
        {m.status==="draft" && <window.Chip tone="amber" style={{marginLeft:"auto"}}>草稿</window.Chip>}
      </div>
    </button>
  );
}

function MiniStat({ icon, color, v, label }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:4,
      padding:"2px 8px", background:"var(--paper-2)", border:"1px solid var(--line-2)",
      borderRadius:99, fontSize:10.5, color:"var(--ink-2)",
    }}>
      <window.Icon name={icon} size={10} style={{color}}/>
      <span style={{fontWeight:600, color:"var(--ink)"}}>{v}</span>
      <span style={{color:"var(--ink-3)"}}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Preview panel — right-side detail for selected meeting
// ─────────────────────────────────────────────
function PreviewPanel({ m, tree, groupBy, findNode }) {
  const groupName = findNode(tree, m.groups[groupBy])?.name || "—";
  return (
    <div style={{display:"flex", flexDirection:"column", gap:16}}>
      <div>
        <window.SectionLabel>预览</window.SectionLabel>
        <div style={{
          fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-4)", letterSpacing:0.3, marginTop:8,
        }}>{m.id}</div>
        <h3 style={{
          fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"6px 0 10px",
          letterSpacing:"-0.005em", lineHeight:1.25,
        }}>{m.title}</h3>
        <div style={{fontSize:12, color:"var(--ink-3)", lineHeight:1.7}}>
          {m.date} · {m.duration} · {m.attendees} 人 · preset: {m.preset}
        </div>
      </div>

      <div style={{height:1, background:"var(--line-2)"}}/>

      <div>
        <window.SectionLabel>归属分组</window.SectionLabel>
        <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:6}}>
          <GroupRow label="项目" v={groupBy==="project" ? (findNode(tree, m.groups.project)?.name || m.groups.project) : m.groups.project}/>
          <GroupRow label="客户" v={groupBy==="client"  ? (findNode(tree, m.groups.client)?.name  || m.groups.client)  : m.groups.client}/>
          <GroupRow label="主题" v={groupBy==="topic"   ? (findNode(tree, m.groups.topic)?.name   || m.groups.topic)   : m.groups.topic}/>
        </div>
        <div style={{marginTop:10, display:"flex", flexWrap:"wrap", gap:4}}>
          {m.tags.map((t,i)=>(
            <window.Chip key={i} tone="ghost">{t}</window.Chip>
          ))}
        </div>
      </div>

      <div style={{height:1, background:"var(--line-2)"}}/>

      <div>
        <window.SectionLabel>解析摘要</window.SectionLabel>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:10}}>
          <StatBox label="张力" v={m.tension} tone="accent"/>
          <StatBox label="共识" v={m.consensus} tone="amber"/>
          <StatBox label="分歧" v={m.divergence} tone="teal"/>
        </div>
      </div>

      <div style={{
        padding:"12px 14px", background:"var(--paper-2)",
        border:"1px solid var(--line-2)", borderRadius:6,
      }}>
        <window.SectionLabel>快速动作</window.SectionLabel>
        <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:6}}>
          {[
            { icon:"book",    label:"打开 Editorial 视图" },
            { icon:"layers",  label:"打开 Workbench" },
            { icon:"network", label:"打开 Threads" },
            { icon:"folder",  label:"移动到其他分组…" },
            { icon:"upload",  label:"导出为 PDF / Markdown" },
          ].map((x,i)=>(
            <button key={i} style={{
              display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
              border:"1px solid var(--line-2)", background:"var(--paper)", borderRadius:5,
              cursor:"pointer", fontSize:12.5, fontFamily:"var(--sans)", color:"var(--ink-2)",
            }}>
              <window.Icon name={x.icon} size={13}/>
              {x.label}
              <window.Icon name="chevron" size={11} style={{marginLeft:"auto", color:"var(--ink-4)"}}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ label, v }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:8, fontSize:12.5}}>
      <window.MonoMeta style={{width:36}}>{label}</window.MonoMeta>
      <span style={{color:"var(--ink)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{v}</span>
      <window.Icon name="chevron" size={11} style={{color:"var(--ink-4)"}}/>
    </div>
  );
}

function StatBox({ label, v, tone }) {
  const colors = {
    accent:{ bg:"var(--accent-soft)", fg:"oklch(0.32 0.1 40)", bd:"oklch(0.85 0.07 40)" },
    teal:{ bg:"var(--teal-soft)",     fg:"oklch(0.3 0.08 200)", bd:"oklch(0.85 0.05 200)" },
    amber:{ bg:"var(--amber-soft)",   fg:"oklch(0.38 0.09 75)", bd:"oklch(0.85 0.07 75)" },
  }[tone];
  return (
    <div style={{
      background:colors.bg, border:`1px solid ${colors.bd}`, borderRadius:6,
      padding:"10px 12px",
    }}>
      <div style={{fontFamily:"var(--mono)", fontSize:10, color:colors.fg, letterSpacing:0.3, textTransform:"uppercase"}}>{label}</div>
      <div style={{fontFamily:"var(--serif)", fontSize:22, fontWeight:600, color:colors.fg, marginTop:2, letterSpacing:"-0.01em"}}>{v}</div>
    </div>
  );
}

Object.assign(window, { Library });
