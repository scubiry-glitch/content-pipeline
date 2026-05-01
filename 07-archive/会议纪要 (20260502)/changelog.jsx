// changelog.jsx — 修改说明卡片
// 每次重构后在这里留一张「设计决策」卡 —— 给 reviewer 看清「为什么改」

const CHANGES = [
  {
    id: 'C-2026-04-24-d',
    date: '2026-04-24',
    title: '顶部 DimShell header 密度优化 · 暴露为 Tweaks 让用户自选',
    status: '已完成',
    principle: '优先级不明时，让用户选 —— 把「最好」这个判断推给真实使用场景',
    before: [
      '64px header 挤了 6 组元素：轴身份块 + 5 tab + 动态副标题 + CrossAxisLink + TimeRangePill + ScopePill + 重算按钮 + RunBadge',
      '副标题文字和 tab label 高度重复 · 图标在 12px 几乎不可辨',
      '重算按钮 和 RunBadge 是相关动作 · 却各占一格',
      '选项很多 · 但设计师无法单方面判断哪种组合最适合 Damon 的真实使用',
    ],
    after: [
      '4 个 header 预设（Tweaks 可切）：当前 64px · Minimal 48px · Two-row 88px · Underline',
      '5 个细粒度调整（当前预设下生效）：Tab 样式 · 轴身份 · 描述文字 · 次要操作 · 收纳菜单',
      'Minimal 预设：48px + 仅文字 tab + 圆点身份 + ⋯ 菜单收纳 CrossAxisLink / 重算',
      'Two-row：88px 双行 · 第一行身份+工具 · 第二行 tabs + 描述',
      'Underline：tab 变下划线样式 · 去掉胶囊背景 · 节省 ~80px 横向空间',
      'OverflowMenu（⋯）封装次要操作 · 需要时再展开',
    ],
    rationale: [
      '先做不可逆的坏选择，就是在赌 —— 把决策推迟到使用时，让用户用 Tweaks 切一圈，形成直觉后再定',
      '四个预设是"粗颗粒"选择（体感完全不同）；五个细粒度是"微调"（同一家族内微差）',
      'Minimal 默认不破坏 —— 只是把"重算/跨轴"这种低频操作移到 ⋯ · 不等于删除',
      '副标题独立于预设 toggle · 可单独关闭 · 因为它是最常被吐槽"挤"的罪魁',
    ],
    affected: [
      { file: 'dimensions-people.jsx', change: 'DimShell 读 window.__headerTweaks · 4 预设 × 5 toggle 的布局逻辑' },
      { file: 'index.html',            change: '挂 TweaksPanel · useTweaks + 事件驱动重渲 · 默认全部保持当前样式' },
      { file: 'tweaks-panel.jsx',      change: '新增（starter component）· 面板壳子 + 表单控件' },
    ],
    open: [
      '当前 Tweaks 只改 DimShell · MainShell 和 Library 的顶部导航也有类似问题，可同样处理',
      '下一轮：把选中的组合固化为默认值 · 拆掉没选中的分支',
      '是否给 Damon 做一键「小屏」预设（笔记本视口下 header 自动转 Minimal）？',
    ],
  },
  {
    id: 'C-2026-04-24-c',
    date: '2026-04-24',
    title: '三个时间维度子视图真正接上 range · 信念轨迹 / 决策溯源树 / 心智命中',
    status: '已完成',
    principle: '修饰符不响应 = 虚假修饰符 · 让 Pill 切换真的改变每一张图',
    before: [
      'TimeRangePill 可以切，Context 可以下发',
      '但三个子视图都用硬编码数据 · 切 7d 和切"全部"看起来一样',
      'Pill 等于"只是个好看的摆设"',
    ],
    after: [
      '新增 useTimeRange() hook + RANGE_CUTOFF 映射（锚点 2026-04-24）',
      '新增 <RangeStrip> —— 每张图顶部挂一条小信息带：命中数 · 范围 · 样本过小提示',
      '信念轨迹：按日期过滤数据点，< 2 条时自动回退到最近 2 个 + 提示',
      '决策溯源树：超出范围的节点不删除，透明度降到 0.32 —— 保留树形上下文',
      '心智命中：按 scale 缩放激活次数（7d × 0.08 / 30d × 0.32 / 90d × 0.72），短区间加噪声 · invoked < 8 打"样本不足"标',
    ],
    rationale: [
      '三种响应方式各不相同 —— 折线图过滤、树图降透明度、表格缩放 —— 按每种图的数据特性选最合理的',
      '决策树不能"过滤掉"父节点 · 否则儿子变孤岛 · 降透明度保留因果链',
      '7d 窗口样本本就少 · 显式打"样本不足"比硬算一个假数更诚实',
      'RangeStrip 放在 h3 描述和图之间 · 让"当前看的是哪段"始终在视线里',
    ],
    affected: [
      { file: 'longitudinal.jsx', change: '新增 useTimeRange / RANGE_CUTOFF / RangeStrip · 三个子组件全部接入' },
    ],
    open: [
      '人物轴的其他 4 个 tab（承诺兑现 / 角色演化 / 发言质量 / 沉默信号）也应响应 range —— 下一轮',
      '项目轴的决策溯源链、风险热度 应响应 range',
      '知识轴的判断库、偏差列表 应响应 range',
      '考虑让 range 影响 ScopePill 的候选项（近 7d 只出现当期活跃项目）',
    ],
  },
  {
    id: 'C-2026-04-24-b',
    date: '2026-04-24',
    title: '时间滑块胶囊进 DimShell header · 时间真正成为「每条轴的修饰符」',
    status: '已完成',
    principle: '修饰符要可见 · 否则就只是承诺 —— 把「时间是每条轴的维度」从口号变成 UI 默认态',
    before: [
      '上一轮说清了「时间是每条轴的修饰符」，但 header 上没有实际控件',
      '用户看人物轴的信念轨迹时，不能当场收窄到「近 7 天」',
      '每条轴的 run 实际只有一个隐含的「全部时间」口径',
    ],
    after: [
      'DimShell header 右上角新增 TimeRangePill · 在 ScopePill 左侧',
      '4 档切换：7d · 30d · 90d · 全部（默认 30d，覆盖一个正常决策周期）',
      'TimeRangeContext 下发给所有子 tab —— 子维度可自行决定是否响应',
      '每档显示本 scope 下的会议数（如 30d · 11 场），让决策者心里有底',
    ],
    rationale: [
      'ScopePill 回答「看哪些会议」；TimeRangePill 回答「看多长时间」—— 两者正交，都是轴的修饰符',
      '默认 30d 而不是「全部」：日常决策需要的是近况，全景是汇报用',
      '用 Context 而非 prop drilling：子维度可按需消费，未响应的 tab 不会报错',
      '在下拉里展示 "n 场" 辅助量：避免切到 7d 后发现样本太少才意识到',
    ],
    affected: [
      { file: 'main-shell.jsx',        change: '末尾新增 TimeRangeContext / TimeRangePill / TIME_RANGES' },
      { file: 'dimensions-people.jsx', change: 'DimShell 包 Provider · header 挂 TimeRangePill（ScopePill 左侧）' },
    ],
    open: [
      '各子维度尚未真实响应 range —— 下一轮给「信念轨迹」「决策溯源树」「心智命中」接上真实过滤',
      '是否支持自定义区间（date range picker）？日常用 4 档够了，汇报时可能需要',
      '极短区间（7d 仅 3 场）时，要不要给出「样本过小」提示？',
    ],
  },
  {
    id: 'C-2026-04-24-a',
    date: '2026-04-24',
    title: '把「纵向视图」拆回三条主轴 · 时间从「轴」降级为「修饰符」',
    status: '已完成',
    principle: '一库多视图 —— 时间是每条轴的维度，不是独立的轴',
    before: [
      '顶层 5 条并列导航: 人物 / 项目 / 知识 / 会议 / 纵向视图',
      '纵向视图下挂 3 个子维度：信念漂移 · 决策树 · 心智命中率',
      '用户查某个人的信念轨迹要跳到「纵向视图」 → 再选人 → 再选议题，动线跨 3 次',
    ],
    after: [
      '顶层 4 条主轴 + 1 条辅助视图',
      '信念漂移 → 人物轴 · 新子维度「信念轨迹」',
      '决策树   → 项目轴 · 新子维度「决策溯源树」',
      '心智命中 → 知识轴 · 新子维度「心智命中」',
      '原「纵向视图」改名为「时间维度 · 一览」，仅保留汇报/外发场景下的横向总图',
    ],
    rationale: [
      '漂移的主语永远是「某个人」——陈汀对推理层的判断轨迹。天然挂人物。',
      '决策树永远挂在项目上——D-07 是 AI 基础设施方向的决议。天然挂项目。',
      '命中率是对心智模型本身的评估——完全属于知识。',
      '拆完后，用户查某个人的同时看到其信念轨迹（同屏，零跳转）。',
    ],
    affected: [
      { file: 'dimensions-people.jsx',    change: '新增 tab「信念轨迹」(第 5 个)' },
      { file: 'dimensions-projects.jsx',  change: '新增 tab「决策溯源树」(第 5 个)' },
      { file: 'dimensions-knowledge.jsx', change: '新增 tab「心智命中」(第 6 个)' },
      { file: 'longitudinal.jsx',         change: '重定位为「时间维度 · 一览」，顶部加说明条' },
      { file: 'index.html',               change: 'Section 标题改为「时间维度 · 汇报用横向总图」并下移' },
    ],
    open: [
      '时间滑块 (7d / 30d / 全部) 尚未加到 DimShell header —— 下一轮做',
      '「时间维度 · 一览」的主要消费场景（外发/汇报）是否还需要更长格式？',
    ],
  },
];

function ChangelogView() {
  return (
    <div style={{
      height:'100%', padding:'38px 56px 60px', overflow:'auto',
      background:'var(--paper)', fontFamily:'var(--sans)',
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:14, marginBottom:8}}>
        <window.MonoMeta style={{fontSize:10}}>CHANGELOG · 修改说明</window.MonoMeta>
        <div style={{flex:1, height:1, background:'var(--line-2)'}}/>
        <window.MonoMeta>{CHANGES.length} 条</window.MonoMeta>
      </div>
      <h1 style={{
        fontFamily:'var(--serif)', fontSize:28, fontWeight:600,
        margin:'0 0 6px', letterSpacing:'-0.015em',
      }}>
        设计决策日志
      </h1>
      <p style={{fontSize:13, color:'var(--ink-3)', margin:'0 0 32px', maxWidth:680, lineHeight:1.65}}>
        每一次重构都写一张这样的卡。给 reviewer 看「为什么改」，给未来的自己看「那时候怎么想的」。
      </p>

      {CHANGES.map(c => (
        <article key={c.id} style={{
          background:'var(--paper-2)', border:'1px solid var(--line-2)',
          borderRadius:8, padding:'28px 32px', marginBottom:20,
        }}>
          <header style={{
            display:'flex', alignItems:'baseline', gap:12, paddingBottom:14,
            marginBottom:22, borderBottom:'1px solid var(--line-2)',
          }}>
            <window.MonoMeta>{c.id}</window.MonoMeta>
            <window.MonoMeta>{c.date}</window.MonoMeta>
            <window.Chip tone="teal">{c.status}</window.Chip>
            <div style={{flex:1}}/>
            <window.MonoMeta style={{color:'var(--accent)'}}>— Damon × Claude</window.MonoMeta>
          </header>

          <h2 style={{
            fontFamily:'var(--serif)', fontSize:22, fontWeight:600,
            margin:'0 0 14px', letterSpacing:'-0.01em', lineHeight:1.35,
          }}>
            {c.title}
          </h2>

          <div style={{
            display:'inline-block', padding:'8px 14px', background:'var(--accent-soft)',
            border:'1px solid oklch(0.85 0.07 40)', borderRadius:4,
            fontFamily:'var(--serif)', fontSize:13.5, fontStyle:'italic',
            color:'var(--ink)', marginBottom:28,
          }}>
            第一性原理 · {c.principle}
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:26}}>
            <Side title="改之前" tone="muted" items={c.before}/>
            <Side title="改之后" tone="accent" items={c.after}/>
          </div>

          <div style={{marginBottom:26}}>
            <window.SectionLabel>为什么这样改 · Rationale</window.SectionLabel>
            <ol style={{
              margin:'10px 0 0', padding:'0 0 0 20px',
              fontFamily:'var(--serif)', fontSize:14, lineHeight:1.75, color:'var(--ink-2)',
            }}>
              {c.rationale.map((r,i) => <li key={i} style={{marginBottom:6}}>{r}</li>)}
            </ol>
          </div>

          <div style={{marginBottom:26}}>
            <window.SectionLabel>受影响文件</window.SectionLabel>
            <div style={{
              marginTop:10, border:'1px solid var(--line-2)', borderRadius:4, overflow:'hidden',
            }}>
              {c.affected.map((a,i) => (
                <div key={i} style={{
                  display:'grid', gridTemplateColumns:'240px 1fr',
                  padding:'10px 14px', fontSize:12.5,
                  background: i%2===0 ? 'var(--paper)' : 'var(--paper-2)',
                  borderBottom: i < c.affected.length - 1 ? '1px solid var(--line-2)' : 'none',
                }}>
                  <window.MonoMeta style={{color:'var(--ink)'}}>{a.file}</window.MonoMeta>
                  <span style={{color:'var(--ink-2)'}}>{a.change}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <window.SectionLabel>下一步 / 未决</window.SectionLabel>
            <ul style={{
              margin:'10px 0 0', padding:'0 0 0 20px',
              fontSize:13, lineHeight:1.75, color:'var(--ink-3)', fontFamily:'var(--serif)',
            }}>
              {c.open.map((o,i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        </article>
      ))}

      <div style={{
        marginTop:30, padding:'18px 22px', background:'var(--paper-2)',
        border:'1px dashed var(--line-2)', borderRadius:6,
        fontSize:12, color:'var(--ink-4)', textAlign:'center', fontFamily:'var(--mono)',
      }}>
        ← 更早的修改记录将追加在此 ↓
      </div>
    </div>
  );
}

function Side({ title, tone, items }) {
  const isAccent = tone === 'accent';
  return (
    <div style={{
      border: '1px solid ' + (isAccent ? 'oklch(0.85 0.07 40)' : 'var(--line-2)'),
      borderRadius:6, padding:'14px 18px',
      background: isAccent ? 'var(--accent-soft)' : 'var(--paper)',
    }}>
      <div style={{
        fontFamily:'var(--mono)', fontSize:10, letterSpacing:0.5, textTransform:'uppercase',
        color: isAccent ? 'oklch(0.38 0.1 40)' : 'var(--ink-4)', marginBottom:10,
      }}>
        {title}
      </div>
      <ul style={{
        margin:0, padding:'0 0 0 18px',
        fontFamily:'var(--serif)', fontSize:13, lineHeight:1.7,
        color: isAccent ? 'var(--ink)' : 'var(--ink-3)',
        textDecoration: isAccent ? 'none' : 'line-through',
        textDecorationColor: isAccent ? 'inherit' : 'var(--ink-4)',
      }}>
        {items.map((t,i) => <li key={i} style={{marginBottom:4}}>{t}</li>)}
      </ul>
    </div>
  );
}

Object.assign(window, { ChangelogView });
