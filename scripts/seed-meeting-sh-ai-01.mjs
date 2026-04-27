// Seed script · 上海 AI 元年 B 点研讨 · 首轮
// 目标：把 /Users/scubiry/Downloads/sh-ai-meeting-01__analysis.ts 的内容
// 写入数据库 assets 表 id = eff87d6c-efdd-4dc9-92a4-a8585b62a53c 这一行的
// metadata.analysis / metadata.participants / metadata.occurred_at / title / type 字段。
//
// 这是「方案 A 解决根因」的数据写入步骤，配套：
//   - api/src/modules/meeting-notes/MeetingNotesEngine.ts
//       getMeetingDetail(view='A') 读 metadata.analysis 直出 sections（schema 对齐 adapter）
//   - webapp/src/prototype/meeting/VariantEditorial.tsx
//       P() 优先用 apiMeta.participants（带 id）解析人物，避免回落到 mock
//
// 用法：
//   node scripts/seed-meeting-sh-ai-01.mjs
// 凭据从 api/.env 读取（DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD）。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// ── 读取 api/.env ──
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

const MEETING_ID = 'eff87d6c-efdd-4dc9-92a4-a8585b62a53c';

// ── 数据 payload（与 sh-ai-meeting-01__analysis.ts 一致） ──
const TITLE = '上海汇聚 · 2026 AI 元年 · B 点研讨 · 首轮';
const OCCURRED_AT = '2026-04-15T10:05:07+08:00'; // 转写未注明具体日期，按 4 月中预估
const MEETING_KIND = 'workshop';

const PARTICIPANTS = [
  { id: 'p1', name: '永邦',   role: '上海汇聚总经理 · 主持',                 initials: '永', tone: 'neutral', speakingPct: 64 },
  { id: 'p2', name: '赵一濛', role: 'AI/产品顾问 · 千丈松',                  initials: '濛', tone: 'cool',    speakingPct: 24 },
  { id: 'p3', name: '王丽',   role: '服务运营 (转写偶被识别为"王林")',         initials: '王', tone: 'warm',    speakingPct: 9  },
  { id: 'p4', name: '洱海',   role: '资管/收房线 · 在场较少发言',             initials: '洱', tone: 'neutral', speakingPct: 3  },
];

const ANALYSIS = {
  summary: {
    decision:
      '将 2026 年定位为「上海汇聚 AI 元年」: 9 个月内分阶段把 AI 嵌入管理与一线作业。' +
      '本次会议定位为 B 点 (目标画面) 头脑风暴第 1 轮, 月底再开 2 轮收敛, ' +
      '5/1 正式启动 2-3 个「low 但实用」的项目, 不追求高大上。',
    actionItems: [
      { id: 'A1', who: 'p2', what: '汇总本轮抛出的所有 AI 应用方向, 形成清单, 含跨城市/跨行业案例素材',                    due: '2026-04-20' },
      { id: 'A2', who: 'p2', what: '联系保险/理财等外部行业的 AI 实践分享 (真人/视频/报告均可), 启发框架',                  due: '2026-04-30' },
      { id: 'A3', who: 'p3', what: '整理租户管家 / 维修保洁端的 AI 助手 + 调度需求清单',                                    due: '2026-04-20' },
      { id: 'A4', who: 'p2', what: '调研 NFC + 摄像头空看/巡检方案的硬件成本与法务边界 (集团合规先做问询)',                  due: '2026-04-25' },
      { id: 'A5', who: 'p1', what: '在 4 月内组织第 2、3 次研讨, 收敛到 2-3 个 B 点候选并落地分工',                          due: '2026-04-30' },
      { id: 'A6', who: 'p1', what: '在团队内部对齐「商品 (07/09 对外销售物)」与「产品 (内部工具)」的概念区分',              due: '—' },
    ],
    risks: [
      'R1 · 集团法务/合规对摄像头/录音方案大概率不批 — 永邦原话:「这风口浪尖的时候, 谁敢在这种灰色地带给你同意」',
      'R2 · 自建数据通路存在权限与外泄风险, 集团接口开放程度未明',
      'R3 · 数据口径会随业务持续迭代, 需要新增「写 scale (规则编排)」角色, 成本明显高于「写 SQL」',
      'R4 · 集团产品线进度滞后 (驾驶舱 / 人对人排班已等半年), 自建会增加维护负担',
      'R5 · 销售型岗位强行上 AI 行程管控可能反向降效 — 王丽明确反对一刀切',
      'R6 · 团队多数成员是「AI 小白」, 永邦自评「我和洱海、秀敏是传统不能再传统」, 复杂方案落地能力不足',
    ],
  },
  tension: [
    {
      id: 'T1',
      between: ['p1', 'p3'],
      topic: '销售型岗位是否需要 AI 行程强管控',
      intensity: 0.72,
      summary:
        '永邦希望「看清楚每个末端的人此刻在做什么」, 包括客户经理和资管;' +
        ' 王丽明确反对把 AI 套用到销售 — 销售本身有自然淘汰机制, 强行上行程监控反而是负向,' +
        ' AI 应聚焦在「标准化可派单」的服务型岗位 (维修/保洁/租户管家)。',
      moments: [
        '永邦:「客户经理现在此时此刻正在带看的, 正在带看的有多少个你也不知道。」',
        '王丽:「一旦涉及到销售维度, 我没有那么建议说现在就上什么 AI…销售自然会去淘汰那些跟不上效率的人。」',
      ],
    },
    {
      id: 'T2',
      between: ['p1', 'p2'],
      topic: '空看/巡检凭证介质: NFC vs 摄像头 vs 录音',
      intensity: 0.55,
      summary:
        '一濛主推「NFC + 摄像头 + 随机巡检」三选二风控, 成本低、可落地;' +
        ' 永邦更偏好摄像头 (人脸识别后台直接出结果, 比 NFC 强), 但承认成本与隐私顾虑;' +
        ' 王丽抛出「录音 + 模板报告」(参考北京销冠习惯) 作为第三条路。三人未收敛。',
      moments: [
        '一濛:「NFC 是第一个, 摄像头是第二个, 再加上随机巡检就是人工三选二。」',
        '永邦:「摄像头比 NFC 强太多了, NFC 这个事我还是只能解决一点的问题。」',
        '王丽:「录完音之后回来按照一个模板生成一个报告, 现在其实还是比较轻松的。」',
      ],
    },
    {
      id: 'T3',
      between: ['p1', 'p2'],
      topic: '头脑风暴方法论: 先穷尽还是先归类',
      intensity: 0.38,
      summary:
        '一濛建议按「自上而下 (服务) / 自下而上 (一线)」两条线各挑代表性项目;' +
        ' 永邦否决, 主张第一轮先穷尽不分类, 第二、三轮再收敛。',
      moments: [
        '一濛:「要不然从维度上一个是自上而下…另外一类就是自下而上, 看看解决一线的, 各挑一个。」',
        '永邦:「现在我们还不要去归类的, 就继续下次研讨…先风暴, 先穷尽。」',
      ],
    },
    {
      id: 'T4',
      between: ['p1'],
      topic: '永邦的内在张力: 理想商业模式 vs 现行考核',
      intensity: 0.61,
      summary:
        '永邦反复表达理想模式: 每个资管交 2 万毛利就自由经营, 1000 人 × 2 万 × 12 ≈ 2.4 亿;' +
        ' 但现行考核仍卡「人均 8 套」, 他承认理想逻辑「已被否掉」。这条张力没有指向他人,' +
        ' 而是永邦自我对话里的一条主线 — 它间接驱动了他对 AI 的诉求:' +
        ' 用 AI 释放精力, 倒逼分工, 慢慢把考核改回到「利润导向」。',
      moments: [
        '永邦:「我觉得每个资管经理是个独立性主体, 我们应该帮他打造一个看清自己的一套工具。」',
        '永邦:「现在这逻辑否掉了, 因为我必须要达标人效, 我必要看人均收房, 怎么做?」',
      ],
    },
    {
      id: 'T5',
      between: ['p1', 'p2'],
      topic: '数据基础设施: 自建 vs 走集团',
      intensity: 0.31,
      summary:
        '永邦担心数据放上去的安全和权限问题, 倾向自建服务器;' +
        ' 一濛认为走集团 c1-c4 敏感字段分级即可, 不必重复造轮子;' +
        ' 但永邦同时抱怨集团进度太慢 (驾驶舱/人对人排班半年未交付), 隐含着「等不及」的反向拉力。',
      moments: [
        '永邦:「我把数据放上去嘛…能不能自建服务器?」',
        '一濛:「按照那套集团的统一规则做好底线管理, 就没有什么大问题。」',
        '永邦:「这事它涉及到后面毛总那边人力要做排班…集团不接, 我们自己搞。」',
      ],
    },
  ],
  newCognition: [
    {
      id: 'N1',
      who: 'p1',
      before: 'AI 是高大上的东西, 我们团队接不住',
      after: '我要的 AI 都是很 low 的 AI — 就这种已经能秒杀全国 99% 的城市',
      trigger: '现场用豆包做「上海人口/上海北京经济对比」演示, 5 秒出图表 + 折线趋势, 永邦立刻代入「我要的就这样」。',
    },
    {
      id: 'N2',
      who: 'p1',
      before: '末端人手不够就加人 (300→400 还能再加)',
      after: '加到 400 已经接不动, AI 介入是必然 — 不上 AI, 上海无法和其他赛道比',
      trigger: '成都向上服务管家 400+ 人接不过来的真实案例, 加上对行业「工作密度」不足以倒逼 AI 的反思。',
    },
    {
      id: 'N3',
      who: 'p1',
      before: '能力应该长在资管经理身上 (资管看长看远)',
      after: '能力既长不到资管身上, 也长不到职能后台身上, 必须长在系统/AI 上',
      trigger: '一濛指出过去几年「看长看远」的口号实际未沉淀, 房子被分配化、资管能力没立住, 永邦当场承认。',
    },
    {
      id: 'N4',
      who: 'p1',
      before: '看一套房 = 看去化指数 (能不能租出去)',
      after: '看一套房 = 去化指数 + 负向指数 + 成本指数, 三轴综合评分',
      trigger: '1987 项目复盘 — 租得快不等于赚钱, 客诉成本和维修成本被严重低估。',
    },
    {
      id: 'N5',
      who: 'p1',
      before: '取数 = 雇个写 SQL 的人就够',
      after: '取数 = 需要「写 scale (规则编排)」的角色, 因为口径本身在迭代',
      trigger: '一濛解释大模型应用时口径不稳定的工程现实, 永邦立刻代入「小花、小胖」加班赶数据的现状。',
    },
    {
      id: 'N6',
      who: 'p1',
      before: '排班/驾驶舱/人对人这些等集团做',
      after: '集团已经拖了半年, 等不了 — 该自建就自建, 接受由此带来的合规风险',
      trigger: '当场指出集团人对人排班半年未交付 + 一濛回执「产品没接需求」, 永邦决定自启动。',
    },
    {
      id: 'N7',
      who: 'p1',
      before: '管理 = 上级发现下级问题 (传统打鸡血)',
      after: '管理 = 每个独立个体看清自己 (体检报告范式), AI 替代上级做监督',
      trigger: '从自己手表的「昨日睡眠 6.5h, 打败 87% 的人」类比迁移到资管经理的日体检报告画面。',
    },
    {
      id: 'N8',
      who: 'p2',
      before: 'AI 应用 ≈ 推荐算法 (堆数据训练特定场景, 美团式)',
      after: '大模型路径 ≠ 推荐算法 — 在数据不足时也能拿到 60-70% 可用性, 不必先攒到美团那种数据量级',
      trigger: '王丽和永邦质疑「大模型和推荐算法有什么区别」, 一濛被迫现场重新表达, 借此澄清自己的判断。',
    },
  ],
  focusMap: [
    { who: 'p1', themes: ['AI 私人助理 (查数+对比+策略+PPT)', '末端体检报告', '看清一套房 (三指数)', '商品/产品概念分离', '集团进度焦虑', '理想商业模式 (2 万毛利)'], returnsTo: 12 },
    { who: 'p2', themes: ['量×质 双维度衡量', '集团 c1-c4 数据分级', '大模型 vs 算法', '系统赋能 vs 资管赋能', '一单一结算 + 平台兜底'],                                  returnsTo: 7 },
    { who: 'p3', themes: ['末端服务者负担过重', '美团式情绪/路径感知', 'AI 分身回消息 + 排日程', '调度系统 (类滴滴)', '隐私边界 (录音先告知)'],                            returnsTo: 5 },
    { who: 'p4', themes: ['(被举例: 收房节奏 / 工作量倒数)'],                                                                                                              returnsTo: 0 },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '2026 = 上海汇聚 AI 元年, 9 个月内推动 AI 介入管理与一线作业',          supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C2', kind: 'consensus',  text: '4 月内再开 2 次研讨 (4/20、4/30 之前), 5/1 正式启动',                  supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C3', kind: 'consensus',  text: '一期重点收敛到 2-3 个「low 但实用」的 B 点, 不追求高大上',             supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C4', kind: 'consensus',  text: 'AI 取数链路需要「写 scale」角色, 不再仅是「写 SQL」',                  supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C5', kind: 'consensus',  text: '商品 (对外销售物 07/09) 与 产品 (内部工具) 概念应明确区分',            supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C6', kind: 'consensus',  text: '末端服务者 (维修/保洁/租户管家) 是 AI 调度的最优先级场景',             supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'D1', kind: 'divergence', text: '销售型岗位是否需要 AI 强行程管控?', supportedBy: [], sides: [
      { stance: '需要',   reason: '末端可见性差, 不上 AI 只能靠开会打鸡血',                       by: ['p1'] },
      { stance: '不需要', reason: '销售有自然淘汰, AI 强管控反向降效, 应只用于服务型岗位',         by: ['p3'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '空看/巡检凭证介质应选什么?', supportedBy: [], sides: [
      { stance: '摄像头优先',                 reason: '人脸识别精度高, 一次部署多场景复用',         by: ['p1'] },
      { stance: 'NFC + 摄像头 + 巡检 三选二', reason: '成本低、可立即落地、绕开法务死角',           by: ['p2'] },
      { stance: '录音 + 模板报告',            reason: '与销冠习惯一致, 隐私可前置告知',             by: ['p3'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '本次风暴是否就该归类?', supportedBy: [], sides: [
      { stance: '现在归类', reason: '自上而下/自下而上两条线各挑代表更高效',                       by: ['p2'] },
      { stance: '继续穷尽', reason: '第一轮先把可能性铺满, 第二、三轮再收敛',                       by: ['p1'] },
    ]},
    { id: 'D4', kind: 'divergence', text: '数据基础设施: 自建 vs 走集团?', supportedBy: [], sides: [
      { stance: '倾向自建',   reason: '集团已拖半年, 接不住上海的紧迫节奏',                       by: ['p1'] },
      { stance: '走集团规范', reason: 'c1-c4 数据分级足够, 不必重复造轮子',                       by: ['p2'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p1',
      claim: '我的 B 点画面就是要一个 AI 私人助理: 能跨城市拉数据、做对比、给策略、最后形成 PPT — 一上午让我能拿着 PPT 去和包总喝咖啡。',
      responses: [
        { who: 'p2', stance: 'support', text: '大模型本身就是干这个的, 全量上线一个城市每月几万块就够。' },
        { who: 'p3', stance: 'support', text: '美团式服务视角可借鉴 (情绪、路径、调度), 提效空间很大。' },
        { who: 'p2', stance: 'partial', text: '安全/权限按集团 c1-c4 分级即可, 但口径迭代需要新增「写 scale」角色。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p3',
      claim: '每个末端服务者 (租户管家/维修/保洁) 应该有一个 AI 分身: 接消息、生成任务清单、自动排日程 — 把他从「600 个群里追信息」中解放出来。',
      responses: [
        { who: 'p1', stance: 'support', text: '「这是第三个记下来」 — 直接进入候选 B 点。' },
        { who: 'p2', stance: 'partial', text: '同意, 但前提是先建立「量 × 质」两维度衡量框架, 否则 AI 助手只是堆功能。' },
        { who: 'p1', stance: 'partial', text: '同意服务侧, 但销售岗不要套用 — 销售自然有淘汰, 不需要 AI 强管控。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p1',
      claim: '理想商业模式: 每个资管交 2 万毛利就自由经营, 不再卡「人均收 8 套」; 1000 人 × 2 万 × 12 ≈ 2.4 亿利润。',
      responses: [
        { who: 'p2', stance: 'support', text: '「包干模式本身没错, 错在人性」; 应一单一结算 + 平台兜底标准。' },
        { who: 'p2', stance: 'partial', text: '需要把「什么不该收」算进来, 偏远房型在新目标下根本不该入库。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p1',
      claim: '管理范式应从「上级指出下级问题」切到「每个个体看清自己」 — 像晨起体检报告一样, 资管/租户管家每天都能看到自己的位次、副项、节奏偏离。',
      responses: [
        { who: 'p2', stance: 'support', text: '认同 — 这正是「能力长在系统身上」的具象产品形态。' },
        { who: 'p2', stance: 'partial', text: '前提是要「末端可达」; 集团驾驶舱目前只服务管理层, 未抵末端, 需自建。' },
      ],
    },
    {
      id: 'V5', claimBy: 'p1',
      claim: '一套房应有三个指数: 去化指数 (能不能租) + 负向指数 (租客投诉密度) + 成本指数 (维修+客诉) — 事后追踪也行, 总比「租出去就算赢」强。',
      responses: [
        { who: 'p2', stance: 'support', text: '认同, 三轴可以直接接进收房决策与资管考核。' },
        { who: 'p2', stance: 'partial', text: '历史小区数据能支持负向指数 — 漏水/噪音/换管这类高频小区可一票圈出。' },
      ],
    },
    {
      id: 'V6', claimBy: 'p2',
      claim: '能力既不可能长在资管身上, 也不可能长在职能后台身上, 必须长在系统身上 — 过去几年「看长看远」的资管赋能口号已被证伪。',
      responses: [
        { who: 'p1', stance: 'support', text: '同意 — 这正是 2026 把 AI 抬到元年地位的根本理由。' },
        { who: 'p1', stance: 'partial', text: '但系统能力如何沉淀仍是问题: 等集团等不及, 自建有合规风险。' },
      ],
    },
  ],
};

const B_POINTS = [
  { id: 'B1', label: 'AI 私人助理',         desc: '跨 7 城拉数 + 对比 + 策略输出 + PPT 一键生成',           owner: 'p1', priority: 'P0' },
  { id: 'B2', label: '7 城统一数据看板',    desc: '日看板 / 日分析 / 日反馈; 大区对比; 个人体检报告',       owner: 'p1', priority: 'P0' },
  { id: 'B3', label: '末端服务者 AI 分身',  desc: '消息整理 + 任务 list + 日程自动排, 解放「600 群追信息」', owner: 'p3', priority: 'P0' },
  { id: 'B4', label: '维修保洁智能调度',    desc: '类滴滴/美团动态派单, 实时位置 + 工时预估 + 偏差检测',    owner: 'p3', priority: 'P1' },
  { id: 'B5', label: '空看打卡风控',        desc: 'NFC + 摄像头 + 随机巡检 三选二; GPS/重复打卡异常',       owner: 'p2', priority: 'P1' },
  { id: 'B6', label: '一房三指数评分',      desc: '去化指数 + 负向指数 + 成本指数, 替代单一「租出去即成功」', owner: 'p1', priority: 'P1' },
  { id: 'B7', label: '资管成长曲线',        desc: '入职 1/2/3 年标准曲线, AI 自动判断偏离与预警',           owner: 'p1', priority: 'P2' },
  { id: 'B8', label: '商业模式重构沙盘',    desc: '「2 万毛利自由经营」模型可落地路径推演',                 owner: 'p1', priority: 'P2' },
];

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: MEETING_KIND,
  duration_min: 119,
  room: '上海 · 四方城 · 6 层 · 会议室 606',
  source_note: 'zoom-transcript-606.txt (Zoom 自动转写, 含 ASR 噪声)',
  tokens_estimate: 28500,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  b_points: B_POINTS,
};

// ── 写入 DB ──
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
            jsonb_array_length(COALESCE((metadata->'participants'), '[]'::jsonb)) AS n_participants,
            jsonb_typeof(metadata->'analysis')                                    AS analysis_typeof,
            jsonb_array_length(COALESCE((metadata->'analysis'->'tension'), '[]'::jsonb)) AS n_tensions
       FROM assets WHERE id = $1`,
    [MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
} finally {
  await client.end();
}
