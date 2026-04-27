// Seed script · 上海汇聚 AI 项目 · 启动会 · 2026-03-31
// 目标：把 /Users/scubiry/Downloads/sh-ai-kickoff-2026-03-31__analysis.ts 的内容
// 写入 assets.id = db866879-228b-47e1-8e52-c0430ed9a034 这一行的
// metadata.analysis / metadata.participants / title / occurred_at 字段。
//
// 复用「方案 A 解决根因」改造后的链路：
//   - api/src/modules/meeting-notes/MeetingNotesEngine.ts → metadata.analysis fast-path
//   - webapp/src/prototype/meeting/VariantEditorial.tsx   → P() 优先用 apiMeta.participants
//
// 用法：
//   node scripts/seed-meeting-sh-ai-kickoff-2026-03-31.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, 'api/.env');
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const MEETING_ID = 'db866879-228b-47e1-8e52-c0430ed9a034';
const TITLE = '上海汇聚 AI 项目 · 启动 · 管理模式 A→B 点规划';
const OCCURRED_AT = '2026-03-31T11:45:00+08:00';
const MEETING_KIND = 'kickoff';

const PARTICIPANTS = [
  { id: 'p1', name: '永邦',     role: '上海汇聚总经理 · 主持 (说话人 2)',                 initials: '永', tone: 'neutral', speakingPct: 62 },
  { id: 'p2', name: '赵一濛',   role: 'AI/产品顾问 · 千丈松 (说话人 1)',                 initials: '濛', tone: 'cool',    speakingPct: 18 },
  { id: 'p3', name: '团队成员', role: '项目协调 · 新资产业务线 · 名字未出现 (说话人 3)', initials: '?', tone: 'neutral', speakingPct: 8  },
  { id: 'p4', name: '王丽',     role: '服务运营 [推断] · 中途加入项目 (说话人 4)',       initials: '王', tone: 'warm',    speakingPct: 12 },
];

const ANALYSIS = {
  summary: {
    decision:
      '正式立项「上海汇聚 AI 项目」: 半年期, 起步阶段 1 个月「写剧本 / 场景化」。' +
      '目标是把管理范式从 A 点 (人治: 数值/培训/淘汰/激励) 切到 B 点 (AI 治: 机制确定末端行为)。' +
      '核心团队从「永邦 + 一濛 + 团队协调」三人组扩为加入王丽的四人组。' +
      '6 个月内拿到 2-3 个可对外讲的 AI 提效成果, 把上海汇聚从「AI 应用基本为 0」推到全国头部。',
    actionItems: [
      { id: 'A1', who: 'p2', what: '与永邦共同「写剧本」: 把房源评价 / 资管经理末端行为 / 租户管家看板等场景拆成具体 B 点画面', due: '2026-04 月内 (1 个月窗口)' },
      { id: 'A2', who: 'p2', what: '搭桥数据源: 三毛 / 人力 / 法务 / 财务 跨部门数据接入',                                       due: '与剧本并行' },
      { id: 'A3', who: 'p1', what: '把「管一套房 / 管一个人 / 管每个指标」三个画面收敛为可对外讲的 demo',                       due: '2026-09 (半年节点)' },
      { id: 'A4', who: 'p3', what: '梳理「一阶段 → 二阶段 → 管理者层级」的执行路径, 提出验证机制',                              due: '与剧本同步' },
      { id: 'A5', who: 'p4', what: '正式加入项目组; 提供多城市 (上海/成都) 末端激励对比与业务交互场景画像',                      due: '即刻' },
      { id: 'A6', who: 'p2', what: '复用现成 AI 工具栈: 飞书会议纪要 + 待办、小红书舆情爬虫、Cursor 类 PPT/看板生成',           due: '已可用, 持续推广' },
    ],
    risks: [
      'R1 · 业务非原子化 — 王丽明确指出「我们今天业务场景当中有很多交叉和交互配合的」, 不能直接照搬美团/滴滴的末端激励模型',
      'R2 · 跨部门数据源对接难度大 (三毛/人力/法务/财务), 是项目最关键的一道坎, 不是「代码值不值钱」能解决的',
      'R3 · 「颠覆式」vs「提效式」路线尚未对齐 — 永邦明确要颠覆, 王丽暗示部分场景应保留传统管理',
      'R4 · 三人组规模过小, 而上海汇聚整体「AI 应用基本上是 0」, 团队带宽不足以同时撑起场景定义 + 数据对接 + demo 落地',
      'R5 · 永邦自评目标「太宏观」(王丽原话: 「你这个想要的稍微有点太宏观啊」), 若不在月内收敛到具体场景, 项目会停留在意愿层',
      'R6 · 行业管理层"草根/经纪人出身"为主 — 永邦自陈, 这意味着方案越复杂、越难推到末端落地',
    ],
  },
  tension: [
    {
      id: 'T1',
      between: ['p1', 'p4'],
      topic: '颠覆传统管理 vs 业务场景的交互复杂性',
      intensity: 0.62,
      summary:
        '永邦主张「全部推翻、重新洗牌」, 把美团式末端激励 (按单计费 + 响应率) 全套搬过来;' +
        ' 王丽指出供应链、商机分配等环节是「交叉和交互配合」的协作场景,' +
        ' 「我很努力, 我供应商, 他签单我还需要激励吗?」 — 个人努力无法直接兑现, 美团模型只是参考、不是模板。' +
        ' 永邦回应「有些东西你该传统管理」, 部分接受了王丽的边界。',
      moments: [
        '永邦: 「我要把所有推翻。反正我觉得现在不太, 这个墙也没修多高。」',
        '王丽: 「今天业务场景当中有很多交叉和交互配合的…他是一种和别人是在交互合作的场景下。」',
        '永邦: 「有些东西你该传统管理。整体来讲, 你肯定在 AI 上, 我觉得今天必须得踏上这一步了。」',
      ],
    },
    {
      id: 'T2',
      between: ['p1', 'p4'],
      topic: '宏观目标 vs 落地画面感',
      intensity: 0.41,
      summary:
        '永邦反复回到"颠覆 / 推翻 / 秒杀集团"等宏观叙事;' +
        ' 王丽 + 一濛 共同把球拉回到「画面感 / 维度 / 具体场景」 —' +
        ' 王丽直白「你这个想要的稍微有点太宏观」, 一濛补「demo 出来你看是不是你想要的」。' +
        ' 永邦最终把"两个阶段、第一阶段写剧本"作为收敛动作。',
      moments: [
        '王丽: 「其实最缺的是画面感。就你到底想实现什么?」',
        '一濛: 「我们可以讨论讨论, 比如说这个人大概有哪几个维度?…demo 出来, 你看是不是你想要的。」',
        '永邦: 「两个阶段。第一个阶段就是写剧本…一个月时间。」',
      ],
    },
    {
      id: 'T3',
      between: ['p1', 'p3'],
      topic: '先穷尽场景 vs 先定阶段验证',
      intensity: 0.32,
      summary:
        '永邦希望第一阶段「场景化弄出来」、把好/差/大/小都列, 砍掉差的小的, 大的先做;' +
        ' 团队协调 (说话人 3) 反复追问"一阶段 → 二阶段 → 管理者怎么管管理者"的执行路径与验证逻辑。' +
        ' 这条张力低烈度, 但代表了"愿景驱动 vs 工程驱动"两种节奏的拉扯。',
      moments: [
        '说话人 3: 「假如说我们出来一阶段, 这个东西出来之后, 那个一线的人我们知道他在干嘛, 所有的都有, 然后最终二阶段实现的就是…接下来的管理。」',
        '永邦: 「(没有正面回答阶段问题, 而是转到)我不知道, 我总觉得今天下级的动力是靠上级逼出来的, 我想把这座墙推掉。」',
      ],
    },
    {
      id: 'T4',
      between: ['p1', 'p2'],
      topic: '需求驱动 vs demo 驱动的工作流',
      intensity: 0.18,
      summary:
        '永邦的范式: "我抛宏观目标, 你帮我算"。一濛的范式: "把维度抛进群, AI 帮你补全, demo 先出, 数据后补"。' +
        ' 二人没有正面对抗 — 一濛只是温和示范"代码不值钱、想法值钱", 永邦当场被打动 (N1)。',
      moments: [
        '一濛: 「代码不值钱, 现在代码不值钱主要是…有帮我们很多想法。主要是想法, 你把它想清楚, 它很快就做完了。」',
        '一濛: 「最后一步再把数据放进去, 数据不用马上弄。你那数据是为了你的目的服务的。」',
      ],
    },
  ],
  newCognition: [
    {
      id: 'N1',
      who: 'p1',
      before: 'AI 是高大上的、得有专门人手才能搞',
      after: '代码不值钱, 想法才值钱; 一天就能出 demo',
      trigger: '一濛现场展示装修评分 demo + 透露"其实一天"做完, 加上王丽点出"最缺的是画面感"。',
    },
    {
      id: 'N2',
      who: 'p1',
      before: '我做了 20 年, 行业人效没什么变化, 也不觉得有救',
      after: '2005 年我就能做 10 万人效, 20 年没变 — AI 是颠覆这堵墙的真希望',
      trigger: '一濛的两 3 小时分享震撼, 永邦自陈「解决了很多困惑」。',
    },
    {
      id: 'N3',
      who: 'p1',
      before: '调利润命题 (13 万套→12.6 万套→12.7 万套) 业测要算两天',
      after: 'AI 几分钟就出来, 把编程编好就行 — 业测/财务的算力是可被替代的',
      trigger: '一濛的参数化看板 demo (左边调参、右边联动) 直接让永邦看到替代路径。',
    },
    {
      id: 'N4',
      who: 'p1',
      before: '述职是必要的管理动作 (尽管我讨厌)',
      after: '述职让我和被述职者都讨厌, 应该被推翻 — 用机制流程取代上级逼下级',
      trigger: '麦当劳薯条机器自动升降的隐喻 + "下级动力靠上级逼"的反思。',
    },
    {
      id: 'N5',
      who: 'p1',
      before: '管理 = 给压力 / 给培训 / 给激励 / 给淘汰',
      after: '管理 = 能确定末端行为 — 不论用压力、机制还是流程, 关键是「确定」',
      trigger: '永邦自己当场重新定义"管理": "我的认知是管理, 就是能确定你能控制末端行为"。',
    },
    {
      id: 'N6',
      who: 'p1',
      before: 'AI 会议纪要不靠谱 (几年前的判断)',
      after: '今年一看真不错, 比秘书高阶多了, 不需要书记员',
      trigger: '现场对比飞书 / 腾讯会议的会议纪要 + 待办自动生成功能。',
    },
    {
      id: 'N7',
      who: 'p4',
      before: '美团/滴滴的末端激励范式可以全套搬过来',
      after: '我们业务有交叉协作场景 (供应链、商机分配), 美团模型只是参考、不是模板',
      trigger: '王丽自己反思 — 在永邦反复举美团例后, 主动指出业务非原子化的边界。',
    },
    {
      id: 'N8',
      who: 'p1',
      before: '设计师会下岗 (AI 替代)',
      after: '设计师不会下岗, 而是转销售/转型 — 工具升级带来的是角色重塑',
      trigger: '王丽的细化 (「这是设计师的工具, 下岗总要有个人说」) + 一濛补刀 (「销售就是设计师没了, 变成销售了」)。',
    },
  ],
  focusMap: [
    { who: 'p1', themes: ['推翻传统管理', '末端可见 (美团/滴滴对标)', '机制取代人治', '颠覆 vs 提效', '秒杀集团', '管房 / 管人 / 管指标 三画面', '述职反感'], returnsTo: 11 },
    { who: 'p2', themes: ['demo 先于数据', '想法 > 代码', '画面感是真稀缺', '工具栈展示 (飞书/会议纪要/舆情爬虫/参数看板)'],                                  returnsTo: 6 },
    { who: 'p3', themes: ['一阶段/二阶段', '验证机制', '管理者怎么管管理者'],                                                                                  returnsTo: 3 },
    { who: 'p4', themes: ['业务非原子化', '交叉协作场景', '上海 vs 成都按单计费对比', '画面感稀缺', '宏观目标边界'],                                            returnsTo: 5 },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '项目正式立项: 「上海汇聚 AI 项目」, 半年期, 第一阶段 1 个月「写剧本 / 场景化」', supportedBy: ['p1','p2','p3','p4'], sides: [] },
    { id: 'C2', kind: 'consensus',  text: '三个 B 点画面: 管一套房 / 管一个人 / 管每个指标 — 微观切入而非全面铺开',         supportedBy: ['p1','p2'],           sides: [] },
    { id: 'C3', kind: 'consensus',  text: '团队从三人组 (永邦 + 一濛 + 团队协调) 扩展为加入王丽的四人组',                  supportedBy: ['p1','p4'],           sides: [] },
    { id: 'C4', kind: 'consensus',  text: '关键瓶颈不在代码, 而在「画面感 / 维度 / 想法」 — 想清楚再做',                   supportedBy: ['p1','p2','p4'],      sides: [] },
    { id: 'C5', kind: 'consensus',  text: '数据源对接 (三毛/人力/法务/财务) 是绕不开的工程动作',                          supportedBy: ['p1','p2','p3'],      sides: [] },
    { id: 'C6', kind: 'consensus',  text: '现成 AI 工具 (会议纪要/待办/舆情爬虫/参数看板) 立即可用, 不必等',               supportedBy: ['p1','p2'],           sides: [] },
    { id: 'C7', kind: 'consensus',  text: '6 个月目标: 把上海汇聚从「AI 应用基本为 0」推到全国头部, 拿出 2-3 个可讲案例',  supportedBy: ['p1','p2'],           sides: [] },

    { id: 'D1', kind: 'divergence', text: '路线: 颠覆式 还是 提效式?', supportedBy: [], sides: [
      { stance: '颠覆式', reason: '现有"墙也没修多高", 直接推翻重洗牌, 提效只是表面',                  by: ['p1'] },
      { stance: '提效式', reason: '业务有交互协作, 部分场景该保留传统管理, 渐进改更稳',                by: ['p4'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '末端激励: 美团/滴滴模式能不能全套照搬?', supportedBy: [], sides: [
      { stance: '可以全套', reason: '直接按单计费, 把激励放到末端, 同行已验证',                          by: ['p1'] },
      { stance: '只能参考', reason: '我们的业务场景有交叉协作, 个人努力无法直接兑现',                    by: ['p4'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '推进节奏: 先穷尽场景 vs 先定阶段验证', supportedBy: [], sides: [
      { stance: '先穷尽',   reason: '场景化先列好, 大的先做、差的砍掉',                                  by: ['p1'] },
      { stance: '先定阶段', reason: '一阶段交付什么、怎么验证、二阶段如何扩展, 先讲清',                  by: ['p3'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p1',
      claim:
        '管理 = 能确定末端行为。像麦当劳薯条机 10 秒自动升起来一样, 用机制取代上级监督;' +
        ' 像美团能管到每个外卖骑手当下在哪、在送还是在取, 我们也应该能看到每个租户管家此刻在房子里、在路上、还是在发呆。',
      responses: [
        { who: 'p2', stance: 'support', text: '认同 — 这正是"代码不值钱、想法值钱"的产品方向, demo 一周就能出。' },
        { who: 'p4', stance: 'partial', text: '末端可见的画面同意, 但激励机制不能全套美团化 — 我们有交互协作场景。' },
        { who: 'p3', stance: 'neutral', text: '画面是清晰的; 但接下来"管理者怎么管管理者"这一层的设计还没说清。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p2',
      claim:
        '代码不值钱, 想法才值钱 — 把维度抛进群, AI 帮你补全, demo 一天出, 数据是为目的服务的, 最后再补。',
      responses: [
        { who: 'p1', stance: 'support', text: '"代码不值钱"被永邦当场吸收 (见 N1), 直接拿去对内布道。' },
        { who: 'p4', stance: 'support', text: '更激进地补刀: 「最缺的是画面感」, 把瓶颈定位在 leader 端。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p1',
      claim:
        '我要把传统管理这座墙推翻 — 述职我自己也讨厌, 头部要靠机制提效让其多挣, 优秀的人才会进来, 行业才会真改变。',
      responses: [
        { who: 'p3', stance: 'partial', text: '「或者说没有激发他的内驱力的」 — 同情式补全, 但未给出替代方案。' },
        { who: 'p4', stance: 'partial', text: '同意激励是关键 (「其实就是钱」), 但提醒交互场景里激励兑现机制不一样。' },
        { who: 'p2', stance: 'neutral', text: '没有直接表态, 改用工具展示 (飞书协作、舆情爬虫) 让永邦"看见"可能性。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p1',
      claim:
        '半年时间, 上海汇聚从 AI 应用基本为 0 直接达到全国头部, 秒杀集团。',
      responses: [
        { who: 'p2', stance: 'support', text: '「完全可以」 — 直接接稳目标, 并随即展示飞书自动议题总结作为路径证明。' },
        { who: 'p3', stance: 'neutral', text: '没有反对, 但保留"我们怎么验证这个东西出来"的工程视角。' },
        { who: 'p4', stance: 'neutral', text: '没有正面回应宏大目标, 但对工具效用 (会议纪要、PPT 一键) 持同意态度。' },
      ],
    },
  ],
};

const B_POINTS = [
  { id: 'B1', label: '管到一套房',           desc: '房源前后改造对比 + 多维度评分 (改造前 3.5 → 改造后 8.5), 每套房可评可比', owner: 'p2', priority: 'P0' },
  { id: 'B2', label: '管到一个人 (末端可视)', desc: '资管经理 / 租户管家此刻在哪、在做什么、效率如何 — 美团骑手画面对标',     owner: 'p1', priority: 'P0' },
  { id: 'B3', label: '管到每个指标',         desc: '所有数据线上跑, AI 实时洞察问题、给方案、生成待办、自动推动',             owner: 'p1', priority: 'P0' },
  { id: 'B4', label: '租户管家智能派单',     desc: '类美团/滴滴的接单 + 响应率 + 差评率机制, 兼职化可行性评估',                owner: 'p4', priority: 'P1' },
  { id: 'B5', label: '利润测算自动化',       desc: '替代财务/业测的多参数测算 (13 万套 → 12.6/12.7 万套优异和利润推演)',      owner: 'p2', priority: 'P1' },
  { id: 'B6', label: '小红书舆情爬虫',       desc: '已上线: 自动每日抓上海负向舆情, 飞书推送 — 替代"天天问文博"',             owner: 'p2', priority: 'DONE' },
  { id: 'B7', label: '飞书协作议题总结',     desc: '已上线: 长对话自动识别议题/上下文/决策/各方观点, 解决长短记忆问题',       owner: 'p2', priority: 'DONE' },
];

const SERIES_CONTEXT = {
  prevMeetings: [
    { id: '(无明确转写)', desc: '永邦自述"我多次在会上说我对述职很讨厌"; 王丽自述"你上次说的那个美团" — 启动会前已有非正式铺垫' },
  ],
  nextMeetings: [
    { id: 'M-SH-2026-04-AI-01 (推断)', desc: '4 月份 119 分钟 B 点研讨首轮 — 把这次的"管房/管人/管指标"展开为 8 个候选 B 点' },
  ],
  motif: '本场是项目"立项 + 范式宣告", 非穷尽 — 决策密度高, 张力相对低; 4 月场是"穷尽 + 候选筛选", 张力上升。',
};

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: MEETING_KIND,
  duration_min: 23.25,
  room: '腾讯会议 (含屏幕共享; 现场+远端混合, 转写未标注具体地点)',
  source_note: '腾讯会议自动转写 (含 ASR 噪声, 一濛偶被识别为"易萌/伊萌/翼龙/益梦/一萌")',
  tokens_estimate: 7200,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  b_points: B_POINTS,
  series_context: SERIES_CONTEXT,
};

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

await client.connect();
try {
  const exists = await client.query('SELECT 1 FROM assets WHERE id = $1 LIMIT 1', [MEETING_ID]);
  if (exists.rowCount === 0) {
    await client.query(
      `INSERT INTO assets (id, type, title, content, content_type, metadata)
       VALUES ($1, 'meeting_note', $2, '', 'meeting_note', $3::jsonb)`,
      [MEETING_ID, TITLE, JSON.stringify(metadata)],
    );
    console.log(`[seed] INSERTed meeting ${MEETING_ID}`);
  } else {
    await client.query(
      `UPDATE assets
          SET title = $2,
              type = COALESCE(NULLIF(type, ''), 'meeting_note'),
              metadata = (COALESCE(metadata, '{}'::jsonb)) || $3::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [MEETING_ID, TITLE, JSON.stringify(metadata)],
    );
    console.log(`[seed] UPDATEd meeting ${MEETING_ID}`);
  }

  const r = await client.query(
    `SELECT id, title, type,
            metadata->>'occurred_at'  AS occurred_at,
            jsonb_array_length(COALESCE((metadata->'participants'), '[]'::jsonb))            AS n_participants,
            jsonb_typeof(metadata->'analysis')                                                AS analysis_typeof,
            jsonb_array_length(COALESCE((metadata->'analysis'->'tension'), '[]'::jsonb))      AS n_tensions,
            jsonb_array_length(COALESCE((metadata->'analysis'->'newCognition'), '[]'::jsonb)) AS n_new_cognition,
            jsonb_array_length(COALESCE((metadata->'analysis'->'consensus'), '[]'::jsonb))    AS n_consensus,
            jsonb_array_length(COALESCE((metadata->'analysis'->'crossView'), '[]'::jsonb))    AS n_cross_view,
            jsonb_array_length(COALESCE((metadata->'b_points'), '[]'::jsonb))                 AS n_b_points
       FROM assets WHERE id = $1`,
    [MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
} finally {
  await client.end();
}
