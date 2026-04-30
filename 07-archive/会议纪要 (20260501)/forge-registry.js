/* ============================================================
   FORGE REGISTRY  ·  熔炉资源清单
   ------------------------------------------------------------
   把"原始 → 中间 → 成品"三层资产用统一 ID 串起来。
   被以下房间消费:
     - war-room.html       (团队侧入口)
     - project-atlas.html  (项目侧入口)
     - knowledge-forge.html(知识侧出口) — 待建
   每条按钮的 data-forge-ref 指向这里的某个 ID。
   ============================================================ */

window.FORGE_REGISTRY = {

  /* ── 第一层:原始素材(会议纪要) ─────────────────── */
  meetings: {
    "m-2026-03-15-ic":    { date:"2026-03-15", title:"Crucible IC 评审",   project:"crucible", attendees:["chen","shen","zhou","wei"], duration:"73 min" },
    "m-2026-04-22-eme":   { date:"2026-04-22", title:"Crucible 紧急讨论",  project:"crucible", attendees:["chen","shen","zhou"],       duration:"41 min" },
    "m-2026-02-25-dd":    { date:"2026-02-25", title:"Stellar 尽调启动",   project:"stellar",  attendees:["chen","shen","wei","zhou"], duration:"58 min" },
    "m-2026-04-12-clar":  { date:"2026-04-12", title:"Stellar 分歧澄清",   project:"stellar",  attendees:["chen","shen","wei"],        duration:"49 min" },
    "m-2026-04-10-retro": { date:"2026-04-10", title:"Halycon 复盘会",     project:"halycon",  attendees:["chen","shen","zhou","omar"],duration:"66 min" },
    "m-2026-02-08-ic":    { date:"2026-02-08", title:"Halycon IC 评审 #1", project:"halycon",  attendees:["chen","shen","wei"],        duration:"55 min" },
    "m-2026-04-18-fire":  { date:"2026-04-18", title:"Pyre 救火会",        project:"pyre",     attendees:["chen","zhou"],              duration:"38 min" },
    "m-2026-04-15-ic":    { date:"2026-04-15", title:"Beacon IC 评审",     project:"beacon",   attendees:["chen","shen","wei","zhou"], duration:"52 min" },
  },

  /* ── 第二层:中间产出(13 根轴的读数) ──────────────
     轴 ID 规范:axis-<语义键>
     每个 reading 是某条轴在某个项目/团队上的快照
  ─────────────────────────────────────────── */
  axes: {
    "axis-belief-coherence":  { name:"信念一致性",      group:"团队" },
    "axis-commit-action-gap": { name:"承诺-行动差距",   group:"项目" },
    "axis-silence-avoid":     { name:"沉默回避",        group:"团队" },
    "axis-belief-drift":      { name:"信念背离/漂移",   group:"团队" },
    "axis-attention-flow":    { name:"注意力流向",      group:"项目" },
    "axis-milestone-deviation": { name:"里程碑偏离",    group:"项目" },
    "axis-tension-flow":      { name:"张力流",          group:"团队" },
    "axis-info-entropy":      { name:"发言信息熵",      group:"团队" },
    "axis-calibration":       { name:"校准度",          group:"个人" },
    "axis-counterfactual":    { name:"反事实命中率",    group:"个人" },
    "axis-decision-rhythm":   { name:"决策节奏",        group:"元" },
    "axis-energy-budget":     { name:"精力预算",        group:"元" },
    "axis-outside-view":      { name:"外部视角接入",    group:"元" },
  },

  readings: {
    "r-crucible-cag":   { axis:"axis-commit-action-gap", project:"crucible", value:"+312%", trend:"↑↑", meetings:["m-2026-03-15-ic","m-2026-04-22-eme"] },
    "r-crucible-sa":    { axis:"axis-silence-avoid",     project:"crucible", value:"6/8",   trend:"→",  meetings:["m-2026-04-22-eme"] },
    "r-stellar-bc":     { axis:"axis-belief-coherence",  project:"stellar",  value:"0.41",  trend:"↓",  meetings:["m-2026-02-25-dd","m-2026-04-12-clar"] },
    "r-stellar-cag":    { axis:"axis-commit-action-gap", project:"stellar",  value:"+85%",  trend:"→",  meetings:["m-2026-02-25-dd"] },
    "r-halycon-bc":     { axis:"axis-belief-coherence",  project:"halycon",  value:"0.84",  trend:"→",  meetings:["m-2026-04-10-retro"] },
    "r-halycon-cag":    { axis:"axis-commit-action-gap", project:"halycon",  value:"-5%",   trend:"→",  meetings:["m-2026-04-10-retro"] },
    "r-pyre-md":        { axis:"axis-milestone-deviation", project:"pyre",   value:"+21d",  trend:"↑",  meetings:["m-2026-04-18-fire"] },
    "r-pyre-sa":        { axis:"axis-silence-avoid",     project:"pyre",     value:"6/8",   trend:"↑",  meetings:["m-2026-04-18-fire"] },
    "r-team-tension":   { axis:"axis-tension-flow",      scope:"team",       value:"9 次/月", trend:"→", meetings:["m-2026-04-12-clar","m-2026-04-22-eme"] },
    "r-shen-attention": { axis:"axis-attention-flow",    person:"shen",      value:"沈岚 80% (Halycon+Stellar)", trend:"→" },
    "r-wei-cal":        { axis:"axis-calibration",       person:"wei",       value:"0.78",  trend:"→" },
    "r-omar-cf":        { axis:"axis-counterfactual",    person:"omar",      value:"14 提 / 12 未应", trend:"↑" },
  },

  /* ── 第三层:成品(已固化的心智资产) ────────────────
     types: law(法则) | model(模型) | lesson(教训) | hypothesis(候补)
  ─────────────────────────────────────────── */
  artifacts: {
    "law-distance-cap":   { type:"law", text:"我们不投距离主战场 > 0.7 的项目",
                            confidence:0.86, supporters:7, counterexamples:1,
                            born:"2025-09",  evidence:["r-shen-attention"] },
    "law-founder-silence":{ type:"law", text:"创始人 3 周不回应 = 实质放弃,不再等",
                            confidence:0.78, supporters:4, counterexamples:0,
                            born:"2026-04",  evidence:["r-crucible-cag","m-2026-04-22-eme"] },
    "lesson-dd-split":    { type:"lesson", text:"估值分歧不该卡 TS,而该变成尽调标准",
                            confidence:0.72, recurred:3,
                            born:"2026-02", evidence:["r-stellar-bc","m-2026-04-12-clar"] },
    "lesson-silence-cost":{ type:"lesson", text:"上次评审 6/8 问题没答 = 项目已死,只是没人宣布",
                            confidence:0.81, recurred:2,
                            born:"2026-04", evidence:["r-pyre-sa","r-crucible-sa"] },
    "hypothesis-omar":    { type:"hypothesis", text:"外部视角的反事实命中率,可能高于内部尽调",
                            confidence:0.51, mentions:6,
                            born:"2026-03", evidence:["r-omar-cf"] },
    "model-conflict-temp":{ type:"model", text:"建设性冲突 7 / 破坏性 2 = 健康区间",
                            confidence:0.68,
                            born:"2026-01", evidence:["r-team-tension"] },
  },
};

/* ── 跳转辅助:把 data-forge-ref 变成实际行为 ──────────────
   用法:<a class="forge-ref" data-forge-ref="m-2026-03-15-ic">→ 跳到纪要</a>
   现在弹一个 toast 占位;后续接到 Knowledge Forge 的 panorama 视图。
─────────────────────────────────────────── */
window.FORGE_GOTO = function(ref) {
  const reg = window.FORGE_REGISTRY;
  let kind = null, item = null;
  for (const k of ["meetings","axes","readings","artifacts"]) {
    if (reg[k] && reg[k][ref]) { kind = k; item = reg[k][ref]; break; }
  }
  let t = document.getElementById("__forge_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "__forge_toast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(10,10,12,0.95);color:#E8EEF2;padding:12px 18px;border:1px solid rgba(200,161,92,0.6);border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:12px;z-index:9999;letter-spacing:0.05em;max-width:420px;line-height:1.5;box-shadow:0 8px 30px rgba(0,0,0,0.5);";
    document.body.appendChild(t);
  }
  if (item) {
    const head = `[${kind}]  ${ref}`;
    const body = item.title || item.text || item.name || "";
    t.innerHTML = `<div style="color:#C8A15C;font-size:9.5px;letter-spacing:0.2em;margin-bottom:4px">${head}</div><div style="color:#E8EEF2">${body}</div><div style="color:rgba(232,238,242,0.5);font-size:10px;margin-top:6px">→ 将在 Knowledge Forge 中打开完整视图</div>`;
  } else {
    t.innerHTML = `<div style="color:#D85A5A">未知引用: ${ref}</div>`;
  }
  t.style.opacity = "1";
  clearTimeout(window.__forge_toast_t);
  window.__forge_toast_t = setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .4s"; }, 2800);
};

/* 自动绑定:任何带 data-forge-ref 的元素被点击时,触发 FORGE_GOTO */
document.addEventListener("click", function(e){
  const a = e.target.closest("[data-forge-ref]");
  if (!a) return;
  e.preventDefault();
  window.FORGE_GOTO(a.getAttribute("data-forge-ref"));
});
