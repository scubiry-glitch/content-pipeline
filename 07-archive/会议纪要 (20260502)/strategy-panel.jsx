// strategy-panel.jsx — system tables (§6.3 / §6.4 / §6.5) + 3 flow screens

// ─────────────────────────────────────────────────────────
// Shared table shell
// ─────────────────────────────────────────────────────────
function TableShell({ title, subtitle, fileHint, cols, children }) {
  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      color:"var(--ink)", display:"flex", flexDirection:"column", overflow:"hidden",
      fontFamily:"var(--sans)",
    }}>
      <header style={{padding:"28px 36px 18px", borderBottom:"1px solid var(--line-2)"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:14}}>
          <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:26, margin:0, letterSpacing:"-0.01em"}}>
            {title}
          </h2>
          {fileHint && <window.MonoMeta>{fileHint}</window.MonoMeta>}
        </div>
        <div style={{fontSize:13, color:"var(--ink-3)", marginTop:6, maxWidth:760}}>{subtitle}</div>
      </header>
      <div style={{padding:"0 36px", overflow:"auto", flex:1}}>
        <div style={{
          display:"grid", gridTemplateColumns: cols,
          padding:"14px 0", borderBottom:"1px solid var(--line-2)",
          fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-4)",
          letterSpacing:0.3, textTransform:"uppercase", gap:14, position:"sticky", top:0, background:"var(--paper)",
        }}>
          {children[0]}
        </div>
        {children.slice(1)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// §6.3 Base strategies
// ─────────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id:"single", desc:"单专家直接调用（baseline）", experts:"≥1",
    task:["analysis","evaluation","generation"],
    meta:["modelApplications","rubricScores"],
    file:"strategies/single.ts",
    note:"作为 fallback 链的基座。低成本、高可预测性。",
  },
  {
    id:"debate", desc:"正反方 + 裁判（三段式）", experts:"≥2（推荐 3）",
    task:["analysis","evaluation"],
    meta:["debate.expertAId / BId / judgeId"],
    file:"strategies/debate.ts",
    note:"≥3 人时效果最佳；1 人时 fallback 到 single。",
  },
  {
    id:"mental_model_rotation", desc:"专家心智模型逐个应用 + 跨模型综合", experts:"1（需模型）",
    task:["analysis","generation"],
    meta:["mentalModelRotation.modelsUsed"],
    file:"strategies/mentalModelRotation.ts",
    note:"MAX_MODELS_PER_ROUND = 4。适合多模型交叉查验。",
  },
  {
    id:"heuristic_trigger_first", desc:"关键词触发专家决策启发式", experts:"1（需启发式）",
    task:["analysis","evaluation","generation"],
    meta:["heuristicsTriggered"],
    file:"strategies/heuristicTriggerFirst.ts",
    note:"先触发启发式，再决定是否走完整推理路径。",
  },
];

function StrategiesTable() {
  return (
    <TableShell
      title="Base Strategies · 4 种调用策略"
      subtitle="§6.3 · 每一次专家调用都会被分派到下述策略之一；策略决定了专家数、任务形态与产出的元数据键。"
      fileHint="api/src/services/expert-application/strategies/"
      cols="180px 1fr 120px 1fr 1fr"
    >
      <>
        <span>ID</span><span>描述</span><span>专家数</span><span>TaskType</span><span>关键 meta</span>
      </>
      {STRATEGIES.map((s, i)=>(
        <div key={s.id} style={{
          display:"grid", gridTemplateColumns:"180px 1fr 120px 1fr 1fr",
          gap:14, padding:"16px 0", alignItems:"start",
          borderBottom: i===STRATEGIES.length-1 ? "none" : "1px solid var(--line-2)",
        }}>
          <div>
            <div style={{
              fontFamily:"var(--mono)", fontSize:12, fontWeight:600, color:"var(--ink)",
            }}>{s.id}</div>
            <div style={{fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-4)", marginTop:4}}>
              {s.file}
            </div>
          </div>
          <div>
            <div style={{fontSize:13.5, lineHeight:1.55, color:"var(--ink)", fontWeight:500}}>{s.desc}</div>
            <div style={{fontSize:12, color:"var(--ink-3)", marginTop:6, lineHeight:1.55}}>{s.note}</div>
          </div>
          <div style={{fontSize:12.5, fontFamily:"var(--mono)", color:"var(--ink-2)"}}>{s.experts}</div>
          <div style={{display:"flex", flexDirection:"column", gap:4}}>
            {s.task.map((t,j)=><window.Chip key={j} tone="ghost" style={{alignSelf:"flex-start"}}>{t}</window.Chip>)}
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:4}}>
            {s.meta.map((m,j)=>(
              <span key={j} style={{
                fontFamily:"var(--mono)", fontSize:11, color:"oklch(0.3 0.1 40)",
                background:"var(--accent-soft)", padding:"2px 8px", borderRadius:3, alignSelf:"flex-start",
              }}>{m}</span>
            ))}
          </div>
        </div>
      ))}
    </TableShell>
  );
}

// ─────────────────────────────────────────────────────────
// §6.4 Decorators
// ─────────────────────────────────────────────────────────
const DECORATORS = [
  { id:"failure_check", role:"针对 mentalModels[].failureCondition 自检，命中则 confidence ×0.5",
    needs:"expert.mentalModels[].failureCondition", meta:"confidence ×0.5 on hit" },
  { id:"emm_iterative", role:"EMM 门禁不通过则迭代重跑，最多 2 轮，选最佳",
    needs:"—", meta:"emmRounds ∈ [1,2]" },
  { id:"evidence_anchored", role:"从 knowledgeService.retrieveKnowledge() 注入 3 条相似案例作 few-shot",
    needs:"knowledge-index", meta:"evidenceAnchored.refs[3]" },
  { id:"calibrated_confidence", role:"读 expert_calibration (Brier + overbias) 调整 confidence",
    needs:"expert_calibration table", meta:"factor ∈ [0.3, 1.2]" },
  { id:"track_record_verify", role:"拉取近 180 天 ≤3 条预测，强制专家回顾是否一致",
    needs:"trackRecord index", meta:"consistencyFlag" },
  { id:"signature_style", role:"注入 expressionDNA + signature_phrases + 风格样本",
    needs:"expert.expressionDNA", meta:"styleHash" },
  { id:"knowledge_grounded", role:"强制 [M#n] 引用；无引用段落会被过滤",
    needs:"memory-index", meta:"citationRate" },
  { id:"contradictions_surface", role:"要求专家明确激活哪条内部矛盾并表态",
    needs:"expert.contradictions[]", meta:"activatedContradictionId" },
  { id:"rubric_anchored_output", role:"强制输出 rubric_scores JSON，对齐 output_schema.rubrics",
    needs:"output_schema.rubrics", meta:"rubricScores{}" },
];

function DecoratorsTable() {
  return (
    <TableShell
      title="Decorators · 9 个装饰器"
      subtitle="§6.4 · 装饰器以 pipeline 形式叠加在策略外层，按顺序注入证据、校准 confidence、强制引用格式。每条都有明确的对 expert profile 的要求。"
      fileHint="api/src/services/expert-application/decorators/<name>.ts"
      cols="210px 1fr 180px 180px"
    >
      <>
        <span>ID</span><span>作用</span><span>对 profile 的要求</span><span>主要副作用 / meta</span>
      </>
      {DECORATORS.map((d,i)=>(
        <div key={d.id} style={{
          display:"grid", gridTemplateColumns:"210px 1fr 180px 180px",
          gap:14, padding:"14px 0", alignItems:"start",
          borderBottom: i===DECORATORS.length-1 ? "none" : "1px solid var(--line-2)",
        }}>
          <div>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <div style={{
                width:18, height:18, background:"var(--paper-2)", border:"1px solid var(--line)",
                borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:"var(--mono)", fontSize:9.5, color:"var(--ink-3)", fontWeight:600,
              }}>{String(i+1).padStart(2,"0")}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:12, fontWeight:600}}>{d.id}</div>
            </div>
            <div style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-4)", marginTop:6, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
              decorators/{d.id}.ts
            </div>
          </div>
          <div style={{fontSize:13, lineHeight:1.6, color:"var(--ink)"}}>{d.role}</div>
          <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)"}}>{d.needs}</div>
          <div>
            <span style={{
              fontFamily:"var(--mono)", fontSize:11, color:"oklch(0.3 0.08 200)",
              background:"var(--teal-soft)", padding:"2px 8px", borderRadius:3,
            }}>{d.meta}</span>
          </div>
        </div>
      ))}
    </TableShell>
  );
}

// ─────────────────────────────────────────────────────────
// §6.5 Presets
// ─────────────────────────────────────────────────────────
const PRESETS = [
  {
    id:"lite", title:"lite · 精简模式",
    position:"日常批量处理；failure_check|emm_iterative|single（2 装饰器 + 单专家）",
    cost:"最低 · 约为 standard 的 1/5",
    decorators:["failure_check","emm_iterative"],
    strategy:"single",
    tone:"ghost",
  },
  {
    id:"standard", title:"standard · 深度模式（默认）",
    position:"案例锚定 + 校准 + 心智模型；争议走 debate 中",
    cost:"均衡",
    decorators:["failure_check","evidence_anchored","calibrated_confidence","knowledge_grounded","rubric_anchored_output"],
    strategy:"debate (→ single fallback)",
    tone:"accent",
  },
  {
    id:"max", title:"max · 极致模式",
    position:"7-8 装饰器全量堆叠；每条产出都带专家 DNA",
    cost:"慢 5-8×",
    decorators:["failure_check","emm_iterative","evidence_anchored","calibrated_confidence","track_record_verify","signature_style","knowledge_grounded","contradictions_surface","rubric_anchored_output"],
    strategy:"mental_model_rotation + debate",
    tone:"teal",
  },
];

// Deliverable mapping for each preset — directly referenced from presets.ts
const DELIVERABLES = [
  { key:"⑩ insights",          lite:"single · failure_check",                 standard:"debate · evidence+calibrated+grounded", max:"mmr · ALL decorators" },
  { key:"⑫ consensus",         lite:"single",                                  standard:"single · evidence_anchored",             max:"debate · evidence+calibrated+contradictions" },
  { key:"⑬ controversy",       lite:"—",                                       standard:"debate · evidence+contradictions",       max:"debate · ALL" },
  { key:"⑭ beliefEvolution",   lite:"—",                                       standard:"single · track_record_verify",           max:"mmr · track_record+signature" },
  { key:"① topic-enrich",      lite:"single",                                  standard:"heuristic_first · evidence_anchored",    max:"heuristic_first · ALL" },
  { key:"step3-fact-review",   lite:"single · failure_check",                  standard:"single · evidence+calibrated+grounded",  max:"debate · ALL" },
  { key:"step5-synthesis",     lite:"single · emm_iterative",                  standard:"mmr · evidence+rubric",                  max:"mmr · ALL" },
];

function PresetsTable() {
  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)", color:"var(--ink)",
      overflow:"hidden", display:"flex", flexDirection:"column", fontFamily:"var(--sans)",
    }}>
      <header style={{padding:"28px 36px 18px", borderBottom:"1px solid var(--line-2)"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:14}}>
          <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:26, margin:0, letterSpacing:"-0.01em"}}>
            Presets · 3 个预设
          </h2>
          <window.MonoMeta>api/src/services/expert-application/presets.ts</window.MonoMeta>
        </div>
        <div style={{fontSize:13, color:"var(--ink-3)", marginTop:6, maxWidth:800}}>
          §6.5 · 预设将策略 + 装饰器打包。用户选择 preset，系统决定每条 deliverable 的组合方式。
        </div>
      </header>

      <div style={{padding:"22px 36px", overflow:"auto", flex:1}}>
        {/* Top row: preset cards */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:28}}>
          {PRESETS.map(p=>{
            const bg = p.tone==="accent" ? "var(--accent-soft)" : p.tone==="teal" ? "var(--teal-soft)" : "var(--paper-2)";
            const accentBd = p.tone==="accent" ? "oklch(0.85 0.07 40)" : p.tone==="teal" ? "oklch(0.85 0.05 200)" : "var(--line-2)";
            return (
              <div key={p.id} style={{
                background:bg, border:`1px solid ${accentBd}`, borderRadius:8,
                padding:"18px 20px",
              }}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
                  <div style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:600, letterSpacing:"-0.005em"}}>
                    {p.title}
                  </div>
                  {p.id==="standard" && <window.Chip tone="accent">default</window.Chip>}
                </div>
                <div style={{fontSize:12.5, lineHeight:1.5, color:"var(--ink-2)"}}>{p.position}</div>
                <div style={{fontSize:11.5, color:"var(--ink-3)", marginTop:10, fontFamily:"var(--mono)"}}>
                  strategy: {p.strategy}
                </div>
                <div style={{fontSize:11.5, color:"var(--ink-3)", marginTop:4, fontFamily:"var(--mono)"}}>
                  cost: {p.cost}
                </div>
                <div style={{marginTop:12, display:"flex", flexWrap:"wrap", gap:4}}>
                  {p.decorators.map(d=>(
                    <span key={d} style={{
                      fontFamily:"var(--mono)", fontSize:10, padding:"2px 7px",
                      background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:3,
                      color:"var(--ink-2)",
                    }}>{d}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deliverables mapping table */}
        <div>
          <window.SectionLabel>每个 preset × 7 条 deliverable 的映射</window.SectionLabel>
          <div style={{
            marginTop:10, border:"1px solid var(--line-2)", borderRadius:6, overflow:"hidden",
            background:"var(--paper)",
          }}>
            <div style={{
              display:"grid", gridTemplateColumns:"200px 1fr 1fr 1fr",
              padding:"10px 16px", background:"var(--paper-2)", borderBottom:"1px solid var(--line-2)",
              fontFamily:"var(--mono)", fontSize:10.5, color:"var(--ink-4)", letterSpacing:0.3, textTransform:"uppercase",
            }}>
              <span>Deliverable</span><span>lite</span><span>standard</span><span>max</span>
            </div>
            {DELIVERABLES.map((d,i)=>(
              <div key={d.key} style={{
                display:"grid", gridTemplateColumns:"200px 1fr 1fr 1fr",
                padding:"11px 16px", borderTop: i===0 ? "none" : "1px solid var(--line-2)",
                fontSize:12.5, alignItems:"center",
              }}>
                <div style={{fontFamily:"var(--serif)", fontSize:13, fontWeight:500}}>{d.key}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)"}}>{d.lite}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:11.5, color:"oklch(0.3 0.1 40)", fontWeight:500}}>{d.standard}</div>
                <div style={{fontFamily:"var(--mono)", fontSize:11.5, color:"oklch(0.3 0.08 200)"}}>{d.max}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Flow screens: Upload / Experts / Processing
// ─────────────────────────────────────────────────────────
function FlowUpload() {
  const [mode, setMode] = React.useState("files"); // files | folder | recent
  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper-2)", padding:"36px 48px",
      display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"var(--sans)",
    }}>
      <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:6}}>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:24, margin:0, letterSpacing:"-0.01em"}}>
          新建会议纪要
        </h2>
        <window.MonoMeta>step 1 / 3</window.MonoMeta>
      </div>
      <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:22, maxWidth:640}}>
        上传录音 / 文字稿 / 笔记，或绑定一个目录（目录中的文件将持续作为原始素材被索引）。
      </div>

      <div style={{display:"flex", gap:3, border:"1px solid var(--line)", borderRadius:6, padding:3, alignSelf:"flex-start", marginBottom:18, background:"var(--paper)"}}>
        {[
          { id:"files", label:"上传文件" },
          { id:"folder", label:"绑定目录" },
          { id:"recent", label:"从历史中选" },
        ].map(x=>(
          <button key={x.id} onClick={()=>setMode(x.id)} style={{
            padding:"6px 14px", border:0, borderRadius:4, fontSize:12.5,
            background: mode===x.id ? "var(--ink)" : "transparent",
            color: mode===x.id ? "var(--paper)" : "var(--ink-2)", cursor:"pointer",
            fontWeight: mode===x.id ? 600 : 450,
          }}>{x.label}</button>
        ))}
      </div>

      {mode==="files" && (
        <div style={{
          flex:1, border:"1.5px dashed var(--line)", borderRadius:8, background:"var(--paper)",
          display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14,
          position:"relative", overflow:"hidden",
        }}>
          <div style={{
            width:64, height:64, borderRadius:14, background:"var(--paper-2)",
            border:"1px solid var(--line-2)", display:"flex", alignItems:"center", justifyContent:"center",
            color:"var(--ink-2)",
          }}>
            <window.Icon name="upload" size={26} stroke={1.3}/>
          </div>
          <div style={{fontFamily:"var(--serif)", fontSize:18, fontWeight:500}}>
            拖拽文件到此处 · 或点击上传
          </div>
          <div style={{fontSize:12.5, color:"var(--ink-3)"}}>
            支持 m4a / mp3 / wav · docx / md / txt · pdf · vtt / srt
          </div>
          <div style={{
            display:"flex", gap:10, marginTop:10, padding:"10px 14px",
            background:"var(--paper-2)", borderRadius:6, border:"1px solid var(--line-2)",
            fontSize:12, color:"var(--ink-2)",
          }}>
            <window.Icon name="folder" size={14}/>
            已识别项目目录: <span style={{fontFamily:"var(--mono)", color:"var(--ink)"}}>/assets/meetings/2026-Q2/</span>
          </div>

          {/* Pretend files in the drop zone */}
          <div style={{position:"absolute", left:48, bottom:28, display:"flex", gap:10}}>
            {[
              { name:"zoom-recording-237.m4a", size:"48.2 MB" },
              { name:"会议纪要初稿.docx", size:"23 KB" },
              { name:"尽调包-推理层.xlsx", size:"180 KB" },
            ].map((f,i)=>(
              <div key={i} style={{
                padding:"8px 12px", background:"var(--paper-2)",
                border:"1px solid var(--line-2)", borderRadius:5,
                display:"flex", alignItems:"center", gap:8, fontSize:12,
              }}>
                <window.Icon name="ledger" size={13}/>
                <span>{f.name}</span>
                <window.MonoMeta>{f.size}</window.MonoMeta>
                <window.Icon name="check" size={12} style={{color:"var(--accent)"}}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode==="folder" && (
        <div style={{flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:18}}>
          <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"18px 20px"}}>
            <window.SectionLabel>目录绑定</window.SectionLabel>
            <div style={{marginTop:12, padding:"12px 14px", background:"var(--paper-2)", borderRadius:6, fontFamily:"var(--mono)", fontSize:12, border:"1px solid var(--line-2)"}}>
              paper.morning.rocks/assets/meetings/
            </div>
            <div style={{fontSize:12, color:"var(--ink-3)", marginTop:10, lineHeight:1.6}}>
              目录中任何新增文件都会被持续索引，并按同一套原始素参考规则挂载到下一次会议纪要。
            </div>
            <div style={{marginTop:14, display:"flex", gap:8}}>
              <window.Chip tone="accent">自动索引</window.Chip>
              <window.Chip tone="ghost">Webhook: on</window.Chip>
              <window.Chip tone="ghost">最新同步 · 2 分钟前</window.Chip>
            </div>
          </div>
          <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"18px 20px"}}>
            <window.SectionLabel>目录内容 · 预览</window.SectionLabel>
            <div style={{marginTop:10, display:"flex", flexDirection:"column"}}>
              {["audio/zoom-237.m4a","notes/纪要初稿.docx","notes/纪要补丁.md","attachments/尽调包.xlsx","attachments/推理层-候选.pdf"].map((f,i)=>(
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"8px 4px",
                  borderTop: i===0?"none":"1px solid var(--line-2)", fontSize:12.5,
                }}>
                  <window.Icon name="ledger" size={13} style={{color:"var(--ink-3)"}}/>
                  <span style={{fontFamily:"var(--mono)", fontSize:11.5}}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode==="recent" && (
        <div style={{flex:1, background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"4px 0"}}>
          {[
            { t:"2026-03-28", title:"远翎资本 · Q1 复盘 · 基础设施方向", n:"8 人 · 142 分钟" },
            { t:"2026-03-14", title:"团队内部 · 推理层 subadvisor 选择讨论", n:"4 人 · 68 分钟" },
            { t:"2026-02-22", title:"LP 沟通会 · Q1 进度披露", n:"12 人 · 95 分钟" },
          ].map((x,i)=>(
            <div key={i} style={{
              display:"grid", gridTemplateColumns:"120px 1fr 200px 24px", gap:14, alignItems:"center",
              padding:"14px 20px", borderTop: i===0?"none":"1px solid var(--line-2)",
            }}>
              <window.MonoMeta>{x.t}</window.MonoMeta>
              <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:500}}>{x.title}</div>
              <div style={{fontSize:12, color:"var(--ink-3)"}}>{x.n}</div>
              <window.Icon name="chevron" size={14} style={{color:"var(--ink-4)"}}/>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex", gap:10, justifyContent:"flex-end", marginTop:22}}>
        <button style={btnGhost}>稍后</button>
        <button style={btnPrimary}>继续 · 选择专家</button>
      </div>
    </div>
  );
}

function FlowExperts() {
  const [selectedIds, setSelectedIds] = React.useState(window.EXPERTS.filter(e=>e.selected).map(e=>e.id));
  const toggle = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper-2)", padding:"32px 48px",
      display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"var(--sans)",
    }}>
      <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:6}}>
        <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:24, margin:0, letterSpacing:"-0.01em"}}>
          选择专家
        </h2>
        <window.MonoMeta>step 2 / 3</window.MonoMeta>
      </div>
      <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:18, maxWidth:720}}>
        基于 batch-ops 的深度分析逻辑：系统读取会议文本特征（叙事密度、争议性、术语分布、参与者风格），
        从专家库中推荐匹配度最高的几位。你也可以手动追加。
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:18, flex:1, overflow:"hidden"}}>
        <div style={{overflow:"auto", display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:4}}>
            <window.SectionLabel>推荐</window.SectionLabel>
            <span style={{fontSize:11.5, color:"var(--ink-3)"}}>按 match 降序 · 根据话题、风格与校准分</span>
          </div>
          {window.EXPERTS.map(e => {
            const on = selectedIds.includes(e.id);
            return (
              <div key={e.id} onClick={()=>toggle(e.id)} style={{
                background:"var(--paper)", border:`1px solid ${on ? "var(--accent)" : "var(--line-2)"}`,
                borderRadius:8, padding:"16px 18px", cursor:"pointer", display:"grid",
                gridTemplateColumns:"44px 1fr 120px 24px", gap:14, alignItems:"center",
              }}>
                <div style={{
                  width:44, height:44, borderRadius:8, background:"var(--paper-2)",
                  border:"1px solid var(--line-2)", display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"var(--mono)", fontSize:11, fontWeight:600, color:"var(--ink-2)",
                }}>{e.id}</div>
                <div>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600}}>{e.name}</div>
                    <window.MonoMeta>{e.calibration}</window.MonoMeta>
                  </div>
                  <div style={{fontSize:12, color:"var(--ink-3)", marginTop:2}}>
                    {e.field} · <i>{e.style}</i>
                  </div>
                  <div style={{marginTop:8, display:"flex", flexWrap:"wrap", gap:4}}>
                    {e.mentalModels.slice(0,3).map((m,i)=>(
                      <span key={i} style={{
                        fontFamily:"var(--mono)", fontSize:10.5, padding:"2px 7px",
                        background:"var(--paper-2)", border:"1px solid var(--line-2)", borderRadius:3,
                        color:"var(--ink-2)",
                      }}>{m}</span>
                    ))}
                    {e.mentalModels.length>3 && <window.MonoMeta>+{e.mentalModels.length-3}</window.MonoMeta>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"var(--serif)", fontSize:24, fontWeight:600, color:"var(--accent)", letterSpacing:"-0.01em"}}>
                    {(e.match*100).toFixed(0)}<span style={{fontSize:13, color:"var(--ink-3)"}}>%</span>
                  </div>
                  <div style={{fontSize:10.5, color:"var(--ink-3)"}}>match</div>
                </div>
                <div style={{
                  width:20, height:20, borderRadius:5,
                  background: on ? "var(--accent)" : "transparent",
                  border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"var(--paper)",
                }}>
                  {on && <window.Icon name="check" size={12} stroke={2.5}/>}
                </div>
              </div>
            );
          })}
        </div>

        <aside style={{display:"flex", flexDirection:"column", gap:14}}>
          <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
            <window.SectionLabel>已选 · {selectedIds.length} 位</window.SectionLabel>
            <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:8}}>
              {selectedIds.map(id=>{
                const e = window.EXPERTS.find(x=>x.id===id);
                return (
                  <div key={id} style={{
                    display:"flex", alignItems:"center", gap:8, fontSize:12.5,
                    padding:"6px 8px", background:"var(--paper-2)", borderRadius:4,
                  }}>
                    <window.MonoMeta>{e.id}</window.MonoMeta>
                    <span style={{fontWeight:500}}>{e.name.split(" · ")[0]}</span>
                    <window.Icon name="x" size={12} style={{marginLeft:"auto", color:"var(--ink-4)", cursor:"pointer"}}/>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
            <window.SectionLabel>调用预设</window.SectionLabel>
            <div style={{marginTop:10, display:"flex", flexDirection:"column", gap:6}}>
              {PRESETS.map(p=>{
                const active = p.id==="standard";
                return (
                  <div key={p.id} style={{
                    padding:"10px 12px", borderRadius:6,
                    border: active ? "1px solid var(--accent)" : "1px solid var(--line-2)",
                    background: active ? "var(--accent-soft)" : "transparent", cursor:"pointer",
                  }}>
                    <div style={{fontFamily:"var(--serif)", fontSize:13.5, fontWeight:600}}>{p.id}</div>
                    <div style={{fontSize:11, color:"var(--ink-3)", marginTop:2, lineHeight:1.4}}>{p.position}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button style={{...btnPrimary, marginTop:"auto"}}>生成会议纪要 →</button>
        </aside>
      </div>
    </div>
  );
}

function FlowProcessing() {
  const [tick, setTick] = React.useState(0);
  const [done, setDone] = React.useState(false);
  React.useEffect(()=>{ const t = setInterval(()=>setTick(x=>x+1), 900); return ()=>clearInterval(t); }, []);
  const steps = [
    { id:"ingest",          label:"原始素材解析 · ASR + 文档清洗",   pct: 100, state:"done" },
    { id:"segment",         label:"发言切分 + 参与者归并",             pct: 100, state:"done" },
    { id:"expert-dispatch", label:"分派给 3 位专家 · preset: standard", pct: 100, state:"done" },
    { id:"decorators",      label:"装饰器 stack · 注入证据 / 校准 confidence", pct: done?100:78, state: done?"done":"running", sub:"evidence_anchored → calibrated_confidence → knowledge_grounded" },
    { id:"synthesis",       label:"跨专家综合 · 7 条 deliverable 映射", pct: done?100:12, state: done?"done":"queued" },
    { id:"render",          label:"多维度组装 · 张力 / 新认知 / 共识 / 观点对位", pct: done?100:0,  state: done?"done":"queued" },
  ];

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper-2)",
      display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"var(--sans)",
    }}>
    <div style={{
      flex:1, minHeight:0, padding:"32px 48px 18px",
      display:"grid", gridTemplateColumns:"1fr 380px", gap:22, overflow:"hidden",
    }}>
      <div style={{display:"flex", flexDirection:"column", overflow:"hidden"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:6}}>
          <h2 style={{fontFamily:"var(--serif)", fontWeight:500, fontSize:24, margin:0, letterSpacing:"-0.01em"}}>
            {done ? "解析完成" : "正在生成"}
          </h2>
          <window.MonoMeta>step 3 / 3 · standard preset {done && "· run-237"}</window.MonoMeta>
          <div style={{marginLeft:"auto"}}>
            <button onClick={()=>setDone(d=>!d)} style={{
              padding:"5px 12px", fontSize:11, border:"1px dashed var(--line)",
              background:"transparent", borderRadius:4, color:"var(--ink-3)",
              cursor:"pointer", fontFamily:"var(--mono)",
            }}>{done ? "↺ 重置演示" : "⇢ 演示完成态"}</button>
          </div>
        </div>
        <div style={{fontSize:13, color:"var(--ink-3)", marginBottom:18, maxWidth:720}}>
          每一步可观察 · 每一次专家调用都记录 strategy + decorator stack + cost。中途可暂停或切换到 lite。
        </div>

        <div style={{
          flex:1, background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8,
          overflow:"auto",
        }}>
          {steps.map((s,i)=>(
            <div key={s.id} style={{
              padding:"16px 22px", borderTop: i===0?"none":"1px solid var(--line-2)",
              display:"grid", gridTemplateColumns:"22px 1fr 60px", gap:14, alignItems:"center",
            }}>
              <StepDot state={s.state} tick={tick}/>
              <div>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <span style={{fontSize:13.5, fontWeight:500, color: s.state==="queued"?"var(--ink-3)":"var(--ink)"}}>
                    {s.label}
                  </span>
                  {s.state==="running" && <window.Chip tone="accent" style={{padding:"1px 7px", fontSize:10}}>running</window.Chip>}
                </div>
                {s.sub && (
                  <div style={{fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)", marginTop:6}}>
                    {s.sub}
                  </div>
                )}
                <div style={{height:3, background:"var(--line-2)", borderRadius:2, marginTop:10, overflow:"hidden"}}>
                  <div style={{
                    width:`${s.pct}%`, height:"100%",
                    background: s.state==="done" ? "var(--accent)" : s.state==="running" ? "var(--teal)" : "var(--line)",
                  }}/>
                </div>
              </div>
              <window.MonoMeta style={{textAlign:"right"}}>{s.pct}%</window.MonoMeta>
            </div>
          ))}
        </div>
      </div>

      <aside style={{display:"flex", flexDirection:"column", gap:14, overflow:"auto"}}>
        <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
          <window.SectionLabel>当前调用</window.SectionLabel>
          <div style={{fontFamily:"var(--mono)", fontSize:11.5, lineHeight:1.8, marginTop:10, color:"var(--ink-2)"}}>
            <div><span style={{color:"var(--ink-4)"}}>strategy </span>debate</div>
            <div><span style={{color:"var(--ink-4)"}}>expertA   </span>E09-09 · 二阶思考者</div>
            <div><span style={{color:"var(--ink-4)"}}>expertB   </span>E11-03 · 叙事追踪者</div>
            <div><span style={{color:"var(--ink-4)"}}>judge     </span>E04-12 · 产业链测绘师</div>
            <div><span style={{color:"var(--ink-4)"}}>decorators</span></div>
            {["failure_check","evidence_anchored","calibrated_confidence","knowledge_grounded","rubric_anchored_output"].map((d,i)=>(
              <div key={d} style={{paddingLeft:12, color:i===1?"var(--teal)":"var(--ink-2)"}}>
                {i===1 ? "▸ " : "· "}{d}
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
          <window.SectionLabel>实时开销</window.SectionLabel>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10}}>
            {[
              { l:"input tokens", v:"41,382" },
              { l:"output tokens", v:"8,240" },
              { l:"experts called", v:"3" },
              { l:"elapsed", v:"1m 32s" },
            ].map(x=>(
              <div key={x.l} style={{padding:"8px 10px", background:"var(--paper-2)", borderRadius:5, border:"1px solid var(--line-2)"}}>
                <div style={{fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:0.3}}>{x.l}</div>
                <div style={{fontFamily:"var(--serif)", fontSize:17, fontWeight:600, marginTop:2}}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"var(--paper)", border:"1px solid var(--line-2)", borderRadius:8, padding:"16px 18px"}}>
          <window.SectionLabel>已产出 · 2 / 7</window.SectionLabel>
          <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:6}}>
            {[
              { k:"① topic-enrich", done:true },
              { k:"step3-fact-review", done:true },
              { k:"⑫ consensus", done:false },
              { k:"⑬ controversy", done:false },
              { k:"⑩ insights", done:false },
              { k:"⑭ beliefEvolution", done:false },
              { k:"step5-synthesis", done:false },
            ].map(d=>(
              <div key={d.k} style={{display:"flex", alignItems:"center", gap:8, fontSize:12}}>
                {d.done
                  ? <window.Icon name="check" size={13} style={{color:"var(--accent)"}}/>
                  : <div style={{width:13, height:13, borderRadius:99, border:"1.2px solid var(--line)"}}/>}
                <span style={{color: d.done ? "var(--ink)" : "var(--ink-3)", fontFamily:"var(--serif)"}}>{d.k}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>

    {/* 底部过渡条 · 解析完成后出现 */}
    <div style={{
      flex:"0 0 auto",
      borderTop:"1px solid var(--line-2)",
      background: done ? "var(--accent-soft)" : "var(--paper)",
      padding:"14px 48px",
      display:"flex", alignItems:"center", gap:18,
      transition:"background 260ms ease",
    }}>
      {done ? (
        <>
          <div style={{
            width:28, height:28, borderRadius:99, background:"var(--accent)",
            display:"flex", alignItems:"center", justifyContent:"center", color:"var(--paper)",
            flexShrink:0,
          }}><window.Icon name="check" size={15} stroke={2.5}/></div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontFamily:"var(--serif)", fontSize:15, fontWeight:600, letterSpacing:"-0.005em"}}>
              解析完成 · 6 维度产出 已就绪
            </div>
            <div style={{fontSize:12, color:"var(--ink-2)", marginTop:3, display:"flex", gap:14, flexWrap:"wrap"}}>
              <span>承诺 <b style={{color:"var(--ink)"}}>12</b></span>
              <span>at-risk <b style={{color:"var(--ink)"}}>3</b></span>
              <span>开放问题 <b style={{color:"var(--ink)"}}>5</b></span>
              <span>新判断入库 <b style={{color:"var(--ink)"}}>4</b></span>
              <span style={{color:"var(--ink-3)"}}>· run-237 · 2m 08s · 49,622 tokens</span>
            </div>
          </div>
          <div style={{display:"flex", gap:10}}>
            <button style={btnGhost}>查看本次 run</button>
            <button style={btnPrimary}>进入多维视图 →</button>
          </div>
          <div style={{
            position:"absolute", fontSize:0,
          }}>
            {/* auto-advance 3s */}
            <AutoAdvance />
          </div>
        </>
      ) : (
        <>
          <div style={{
            width:22, height:22, borderRadius:99,
            border:"2px solid var(--teal)", borderTopColor:"transparent",
            animation:"spin 1s linear infinite",
          }}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13, color:"var(--ink-2)"}}>
              解析进行中 · 约 <b>48 秒</b> 后可进入多维视图
            </div>
          </div>
          <button style={{...btnGhost, opacity:0.6}}>取消</button>
        </>
      )}
    </div>
    </div>
  );
}

function AutoAdvance() {
  // 占位 — 原型无实际跳转
  return null;
}

const btnPrimary = {
  padding:"9px 18px", border:"1px solid var(--ink)", background:"var(--ink)",
  color:"var(--paper)", borderRadius:5, fontSize:13, fontWeight:500, cursor:"pointer",
  fontFamily:"var(--sans)",
};

function StepDot({ state, tick }) {
  if (state==="done") return <div style={{
    width:18, height:18, borderRadius:99, background:"var(--accent)",
    display:"flex", alignItems:"center", justifyContent:"center", color:"var(--paper)",
  }}><window.Icon name="check" size={11} stroke={2.5}/></div>;
  if (state==="running") return <div style={{
    width:18, height:18, borderRadius:99,
    border:"2px solid var(--teal)", borderTopColor:"transparent",
    animation:"spin 1s linear infinite",
  }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
  return <div style={{width:14, height:14, borderRadius:99, border:"1.5px solid var(--line)", marginLeft:2}}/>;
}

const btnGhost = {
  padding:"9px 18px", border:"1px solid var(--line)", background:"var(--paper)",
  color:"var(--ink-2)", borderRadius:5, fontSize:13, cursor:"pointer", fontFamily:"var(--sans)",
};

// ─────────────────────────────────────────────────────────
// FlowMultiView · 关键流程终点 · 解析完成后的多维视图
// 复用 DimensionPeople（4 个轴的默认入口是人物轴）；
// 顶部 banner 承接 Processing 的 run-237，给出"下游联动"与轴切换入口
// ─────────────────────────────────────────────────────────
function FlowMultiView() {
  const [axis, setAxis] = React.useState("people");
  const [bannerOpen, setBannerOpen] = React.useState(true);
  const AxisBody = {
    people:    window.DimensionPeople,
    projects:  window.DimensionProjects,
    knowledge: window.DimensionKnowledge,
    meta:      window.DimensionMeta,
  }[axis];

  return (
    <div style={{
      width:"100%", height:"100%", background:"var(--paper)",
      display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"var(--sans)",
    }}>
      {/* 承接 Processing 的 "刚刚完成" banner */}
      {bannerOpen && (
        <div style={{
          flex:"0 0 auto",
          background:"linear-gradient(to right, var(--accent-soft), var(--paper-2) 70%)",
          borderBottom:"1px solid var(--line-2)",
          padding:"14px 28px",
          display:"flex", alignItems:"center", gap:18,
        }}>
          <div style={{
            width:26, height:26, borderRadius:99, background:"var(--accent)",
            display:"flex", alignItems:"center", justifyContent:"center", color:"var(--paper)", flexShrink:0,
          }}><window.Icon name="check" size={13} stroke={2.5}/></div>
          <div style={{minWidth:0, flex:"0 0 auto"}}>
            <div style={{fontSize:13, fontWeight:600, color:"var(--ink)"}}>
              「Q4 规划 · 核心市场复盘」解析完成
            </div>
            <div style={{fontSize:11.5, color:"var(--ink-2)", marginTop:2, fontFamily:"var(--mono)"}}>
              run-237 · 2m 08s · 49,622 tokens · 08:03
            </div>
          </div>

          <div style={{width:1, height:28, background:"var(--line-2)"}}/>

          <div style={{flex:1, minWidth:0, fontSize:12, color:"var(--ink-2)", lineHeight:1.55}}>
            <div><b style={{color:"var(--ink)"}}>下游已自动入队：</b>项目轴增量（run-238 · queued） · 人物轴 承诺追踪（run-239 · queued）</div>
            <div style={{color:"var(--ink-3)", marginTop:2}}>
              library 轴（全库判断库 / 心智命中率）需手动触发 —— <span style={{color:"var(--accent)", cursor:"pointer", textDecoration:"underline", textUnderlineOffset:2}}>去生成中心 →</span>
            </div>
          </div>

          <button style={{
            padding:"6px 11px", fontSize:11.5, border:"1px solid var(--line)",
            background:"var(--paper)", borderRadius:4, color:"var(--ink-2)", cursor:"pointer",
            fontFamily:"var(--sans)", flexShrink:0,
          }}>查看本场详情 · Editorial</button>
          <button onClick={()=>setBannerOpen(false)} style={{
            border:0, background:"transparent", color:"var(--ink-4)", cursor:"pointer",
            padding:4, display:"flex", alignItems:"center",
          }}><window.Icon name="x" size={13}/></button>
        </div>
      )}

      {/* 轴切换条 · 4 维一屏可达 */}
      <div style={{
        flex:"0 0 auto", borderBottom:"1px solid var(--line-2)",
        padding:"10px 28px", display:"flex", alignItems:"center", gap:12,
        background:"var(--paper-2)",
      }}>
        <window.MonoMeta style={{fontSize:10}}>MULTI-VIEW · 4 轴</window.MonoMeta>
        <div style={{display:"flex", gap:4, border:"1px solid var(--line)", borderRadius:6, padding:2, background:"var(--paper)"}}>
          {[
            { id:"people",    label:"人物",    tone:"var(--accent)" },
            { id:"projects",  label:"项目",    tone:"var(--teal)" },
            { id:"knowledge", label:"知识",    tone:"var(--amber)" },
            { id:"meta",      label:"会议本身", tone:"var(--ink)" },
          ].map(a=>{
            const active = a.id===axis;
            return (
              <button key={a.id} onClick={()=>setAxis(a.id)} style={{
                padding:"5px 14px", border:0, borderRadius:4, fontSize:12.5,
                fontWeight: active?600:450, cursor:"pointer", fontFamily:"var(--sans)",
                background: active ? a.tone : "transparent",
                color: active ? "var(--paper)" : "var(--ink-2)",
                display:"flex", alignItems:"center", gap:6,
              }}>
                <span style={{
                  width:6, height:6, borderRadius:99,
                  background: active ? "var(--paper)" : a.tone,
                }}/>
                {a.label}轴
              </button>
            );
          })}
        </div>
        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center", fontSize:11, color:"var(--ink-3)"}}>
          <window.Icon name="info" size={12}/>
          <span>首次解析 · 所有轴使用 run-237 的产出；后续会议将走 project 自动增量</span>
        </div>
      </div>

      {/* 轴体本身 */}
      <div style={{flex:1, minHeight:0, overflow:"hidden"}}>
        <AxisBody />
      </div>
    </div>
  );
}

Object.assign(window, { StrategiesTable, DecoratorsTable, PresetsTable, FlowUpload, FlowExperts, FlowProcessing, FlowMultiView });
