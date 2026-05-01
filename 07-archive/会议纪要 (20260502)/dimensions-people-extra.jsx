// dimensions-people-extra.jsx — 人物轴新增 ⑥ 阵型 · ⑦ 盲区档案

// ─────────────────────────────────────────────────────────
// ⑥ 阵型 · Formation
// 团队当前的「人 × 角色」配置图：谁在打哪个位置 · 谁该是质疑者但缺位
// 像球队首发名单 + 缺位预警
// ─────────────────────────────────────────────────────────
const FORMATION_ROLES = [
  { id:"proposer",  label:"提出者",   need:"≥1", desc:"把新方向、新假设端上桌" },
  { id:"questioner",label:"质疑者",   need:"≥1", desc:"逼提出者把假设说清楚" },
  { id:"executor",  label:"执行者",   need:"≥1", desc:"把决议翻译成可交付物" },
  { id:"decider",   label:"决策者",   need:"=1", desc:"在分歧不收敛时拍板" },
  { id:"steward",   label:"治理者",   need:"≥1", desc:"提醒边界、合规、长期" },
  { id:"observer",  label:"旁观者",   need:"可选", desc:"低参与的信号收集者" },
];

// 当前阵型 —— 把 PEOPLE_STATS 的最近角色映射到 4-3-3 球场上
const FORMATION_LINEUP = [
  { who:"p1", role:"decider",    fit:0.92, note:"最近 3 场都拍板",          alt:["proposer"] },
  { who:"p2", role:"proposer",   fit:0.88, note:"半年内 2 次提出新方向",     alt:["executor"] },
  { who:"p3", role:"questioner", fit:0.74, note:"反问质量稳定但偶尔变防守",  alt:["decider"] },
  { who:"p4", role:"executor",   fit:0.95, note:"兑现 A+ · 是阵型的稳定脚",  alt:[] },
  { who:"p5", role:"steward",    fit:0.62, note:"作为 LP 旁听承担治理眼睛",  alt:["observer"] },
  { who:"p6", role:"executor",   fit:0.71, note:"近期从旁观者上升到执行者",  alt:["proposer"] },
];

// 缺位预警 · 哪些角色压力过大、谁该补位
const FORMATION_GAPS = [
  { role:"questioner", severity:"high",
    why:"仅 Wei Tan 一人 · 他若让步，质疑链立刻断。本月 4 次决议中 3 次他被孤立。",
    suggest:["让 p4 在数据议题上兼任","引入外脑 E07-18 · 基础利率检察官 作为常驻虚拟质疑者"] },
  { role:"steward", severity:"med",
    why:"林雾旁听身份决定她不能直接打断。治理覆盖度仅 62%。",
    suggest:["指定 p1 在每次决议前 3 分钟主动询问治理影响","引入外脑 E02-41"] },
];

function PFormation() {
  const cap = (id) => FORMATION_ROLES.find(r=>r.id===id);
  const byRole = (rid) => FORMATION_LINEUP.filter(l=>l.role===rid);
  return (
    <div style={{padding:"24px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        阵型 · Formation
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:680}}>
        把团队当一支球队看：谁在打提出者?谁该是质疑者但缺位?
        <b> 阵型不是组织架构,是会议室里实际承担的功能位置。</b>
      </div>

      {/* 阵型图 · 6 格 */}
      <div style={{
        display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14,
        background:"linear-gradient(180deg, var(--paper-2), var(--paper))",
        border:"1px solid var(--line-2)", borderRadius:8, padding:18,
      }}>
        {FORMATION_ROLES.map(r=>{
          const players = byRole(r.id);
          const empty = players.length===0;
          const gap = FORMATION_GAPS.find(g=>g.role===r.id);
          return (
            <div key={r.id} style={{
              background: empty ? "var(--accent-soft)" : "var(--paper)",
              border: empty ? "1.5px dashed oklch(0.85 0.07 40)" : `1px solid var(--line-2)`,
              borderRadius:6, padding:"14px 16px", minHeight:140,
            }}>
              <div style={{display:"flex", alignItems:"baseline", gap:8}}>
                <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600}}>{r.label}</div>
                <window.MonoMeta style={{fontSize:9.5}}>{r.need}</window.MonoMeta>
                {gap && <window.Chip tone={gap.severity==="high"?"accent":"amber"} style={{marginLeft:"auto"}}>压力 {gap.severity==="high"?"高":"中"}</window.Chip>}
              </div>
              <div style={{fontSize:11, color:"var(--ink-3)", marginTop:3, fontStyle:"italic"}}>{r.desc}</div>

              <div style={{display:"flex", flexDirection:"column", gap:6, marginTop:12}}>
                {players.map(pl=>{
                  const p = window.P(pl.who);
                  return (
                    <div key={pl.who} style={{display:"grid", gridTemplateColumns:"24px 1fr 50px", gap:8, alignItems:"center"}}>
                      <window.Avatar p={p} size={22} radius={4}/>
                      <div>
                        <div style={{fontSize:12, fontWeight:500}}>{p.name}</div>
                        <div style={{fontSize:10, color:"var(--ink-3)"}}>{pl.note}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{height:3, background:"var(--line-2)", borderRadius:2}}>
                          <div style={{width:`${pl.fit*100}%`, height:"100%", background:"var(--accent)", borderRadius:2}}/>
                        </div>
                        <window.MonoMeta style={{fontSize:9.5}}>{pl.fit.toFixed(2)}</window.MonoMeta>
                      </div>
                    </div>
                  );
                })}
                {empty && (
                  <div style={{fontSize:12, color:"oklch(0.32 0.1 40)", fontStyle:"italic", fontFamily:"var(--serif)"}}>
                    缺位 · 该位置无人承担
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 缺位预警 */}
      <div style={{marginTop:22, display:"flex", flexDirection:"column", gap:10}}>
        <window.SectionLabel>缺位预警 · {FORMATION_GAPS.length} 处</window.SectionLabel>
        {FORMATION_GAPS.map(g=>{
          const r = cap(g.role);
          return (
            <div key={g.role} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)",
              borderLeft:`3px solid ${g.severity==="high"?"var(--accent)":"var(--amber)"}`,
              borderRadius:6, padding:"14px 18px",
              display:"grid", gridTemplateColumns:"180px 1fr", gap:18, alignItems:"start",
            }}>
              <div>
                <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600}}>{r.label}</div>
                <window.Chip tone={g.severity==="high"?"accent":"amber"}>压力 {g.severity==="high"?"高":"中"}</window.Chip>
              </div>
              <div>
                <div style={{fontSize:13, fontFamily:"var(--serif)", lineHeight:1.55}}>{g.why}</div>
                <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:4}}>
                  {g.suggest.map((s,i)=>(
                    <div key={i} style={{fontSize:11.5, color:"var(--ink-2)"}}>
                      <span style={{color:"var(--ink-4)", fontFamily:"var(--mono)", marginRight:6}}>→</span>{s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:18}}>
        <window.CalloutCard title="为什么阵型重要" tone="ink">
          组织架构告诉你「谁向谁汇报」。阵型告诉你「这场会里谁在替谁做功能性工作」——
          <b>当一支队伍只有 1 个质疑者时,它和没有质疑者的距离只差 1 次他生病。</b>
        </window.CalloutCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ⑦ 盲区档案 · Blind Spots
// 每个人系统性低估什么、对什么过度自信
// ─────────────────────────────────────────────────────────
const BLIND_SPOTS = [
  { who:"p1",
    underestimates:[
      { topic:"LP 真实容忍度", evidence:"6 次预测中 4 次低估反弹强度", confidence:0.78 },
      { topic:"地缘政策外生性", evidence:"3 次把政策风险口头描述为「短期扰动」", confidence:0.61 },
    ],
    overconfident:[
      { topic:"自身判断的可移植性", evidence:"把成功的 PE 经验直接套用到 VC 决策 · 4 处", confidence:0.72 },
    ],
    note:"决策者最危险的盲区:把成功经验当成普适规律。" },
  { who:"p2",
    underestimates:[
      { topic:"团队 ramp-up 周期", evidence:"承诺时间普遍乐观 1.6×",         confidence:0.85 },
      { topic:"竞争对手反应速度",  evidence:"3 次把对手的策略反应估为 2-3 季,实际 1 季", confidence:0.69 },
    ],
    overconfident:[
      { topic:"细分赛道毛利可持续性", evidence:"主推数据多来自其拥护的 thesis",         confidence:0.74 },
    ],
    note:"提出者容易爱上自己的 thesis · 需要外部 stress test。" },
  { who:"p3",
    underestimates:[
      { topic:"国内团队的执行半径", evidence:"反复假设北美 deal 必须靠北美人", confidence:0.66 },
    ],
    overconfident:[
      { topic:"规模效应的普适性", evidence:"在 5 次讨论里默认规模 = 护城河",   confidence:0.71 },
      { topic:"硅谷 pattern 的可迁移", evidence:"把 SaaS 估值范式直接迁到推理层", confidence:0.68 },
    ],
    note:"被「过去管用过的模型」锚定 —— 反身性误用就源于此。" },
  { who:"p4",
    underestimates:[
      { topic:"非定量信号的预测力", evidence:"对叙事/情绪类信号给出系统性低权重", confidence:0.64 },
    ],
    overconfident:[],
    note:"基础利率使用得当,但对「这次确实不一样」的真情况识别率偏低。" },
  { who:"p6",
    underestimates:[
      { topic:"远程协作的隐性成本", evidence:"在 3 个 subadvisor 项目中低估了沟通延迟", confidence:0.58 },
    ],
    overconfident:[
      { topic:"warm intro → allocation 转化率", evidence:"4 次预测平均高于实际 1.8×", confidence:0.76 },
    ],
    note:"" },
];

function PBlindSpots() {
  return (
    <div style={{padding:"24px 32px 36px"}}>
      <h3 style={{fontFamily:"var(--serif)", fontSize:20, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.005em"}}>
        盲区档案 · Blind spots
      </h3>
      <div style={{fontSize:12.5, color:"var(--ink-3)", marginBottom:22, maxWidth:720}}>
        每个人都有系统性的认知盲点 —— 长期低估什么、对什么过度自信。
        <b>这不是给人贴标签,是给 future self 留一份「读这个人的话时的折扣表」。</b>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {BLIND_SPOTS.map(bs=>{
          const p = window.P(bs.who);
          return (
            <div key={bs.who} style={{
              background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:8,
              padding:"16px 20px",
            }}>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:14}}>
                <window.Avatar p={p} size={36} radius={7}/>
                <div>
                  <div style={{fontSize:14, fontWeight:600}}>{p.name}</div>
                  <div style={{fontSize:11.5, color:"var(--ink-3)"}}>{p.role}</div>
                </div>
                {bs.note && (
                  <div style={{
                    marginLeft:"auto", maxWidth:380, fontFamily:"var(--serif)", fontStyle:"italic",
                    fontSize:12, color:"var(--ink-2)", lineHeight:1.5,
                    borderLeft:"2px solid var(--accent)", paddingLeft:10,
                  }}>{bs.note}</div>
                )}
              </div>

              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                <BSColumn title="系统性低估" tone="teal" items={bs.underestimates}/>
                <BSColumn title="过度自信" tone="accent" items={bs.overconfident}/>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:22}}>
        <window.CalloutCard title="使用方式" tone="ink">
          决策前对照这张表:他正在发言的话题,是否落在他的盲区里?
          <b>盲区不是缺点 —— 不知道自己有盲区才是。</b>
          这份档案 6 个月会自动重算,带过去预测命中率作为校准。
        </window.CalloutCard>
      </div>
    </div>
  );
}

function BSColumn({ title, tone, items }) {
  const fg = tone==="accent" ? "oklch(0.32 0.1 40)" : "oklch(0.3 0.08 200)";
  const bg = tone==="accent" ? "var(--accent-soft)" : "var(--teal-soft)";
  return (
    <div>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <window.Chip tone={tone}>{title}</window.Chip>
        <window.MonoMeta style={{fontSize:10}}>{items.length} 项</window.MonoMeta>
      </div>
      {items.length===0 ? (
        <div style={{fontSize:11.5, color:"var(--ink-4)", fontStyle:"italic"}}>暂无显著模式</div>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {items.map((it,i)=>(
            <div key={i} style={{padding:"9px 12px", background:bg, borderRadius:5, border:`1px solid ${fg}22`}}>
              <div style={{fontSize:13, fontFamily:"var(--serif)", fontWeight:600, color:fg}}>{it.topic}</div>
              <div style={{fontSize:11, color:"var(--ink-2)", marginTop:3, lineHeight:1.5}}>{it.evidence}</div>
              <div style={{display:"flex", alignItems:"center", gap:6, marginTop:6}}>
                <window.MonoMeta style={{fontSize:9.5}}>校准置信</window.MonoMeta>
                <div style={{flex:1, height:3, background:"var(--line-2)", borderRadius:2, maxWidth:100}}>
                  <div style={{width:`${it.confidence*100}%`, height:"100%", background:fg, borderRadius:2}}/>
                </div>
                <window.MonoMeta style={{fontSize:10}}>{it.confidence.toFixed(2)}</window.MonoMeta>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PFormation, PBlindSpots });
