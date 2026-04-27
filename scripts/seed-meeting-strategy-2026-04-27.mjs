// Seed · 内部战略碰头 · 项目推进与高管协调路径 — 新建会议
// 转写源: /Users/scubiry/Downloads/探讨装修贷款与分期付款的定价策略_2026年04月27日11时18分07秒(1).docx
//          (用户指定: 用同一份 docx 作为 content, 但用不同 analysis 重新落一条会议)
// 分析参考: /Users/scubiry/Downloads/strategy-meeting-2026-04-27__analysis.ts
//
// 用法: node scripts/seed-meeting-strategy-2026-04-27.mjs
// 这是 INSERT(新建), 每次跑会拿到新 UUID。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import mammoth from 'mammoth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
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

const DOCX_PATH = '/Users/scubiry/Downloads/探讨装修贷款与分期付款的定价策略_2026年04月27日11时18分07秒(1).docx';
const NEW_MEETING_ID = randomUUID();

const TITLE = '内部战略碰头 · 项目推进与高管协调路径';
const OCCURRED_AT = '2026-04-27T13:55:00+08:00';

const PARTICIPANTS = [
  { id: 'p1', name: '战略主持人',  role: '内部战略 / 项目主推 (说话人 1)',                initials: '主', tone: 'neutral', speakingPct: 40 },
  { id: 'p2', name: '业务推进方',  role: '项目业务负责人 (说话人 2)',                     initials: '业', tone: 'warm',    speakingPct: 30 },
  { id: 'p3', name: '执行/造价线', role: '资深项目执行 · 排房-造价-调研 (说话人 3)',      initials: '执', tone: 'cool',    speakingPct: 28 },
  { id: 'p4', name: '外围者',      role: '非核心参与者 · 仅 3 次极简发言 (说话人 4)',     initials: '外', tone: 'neutral', speakingPct: 2  },
];

const ANALYSIS = {
  summary: {
    decision:
      '本场达成的核心动作三件: ' +
      '①p2 去找星云只谈"三个递进诉求" — (a)支持把 p2 主体做全国项目 / (b)让星云清投资准入标准 / ' +
      '(c)直接背指标 — 答应第一个就算没白去, 不耗、不奢望。' +
      '②先拿"工控蓝领项目"(广州, 45 套/240 床位, 年底开通地铁 3 站到天河东、4 站到珠江新城) ' +
      '作为第一批跑通项目 — 因为小才快、两个月就能开业、慈善基金 150 万属性匹配, 必要时直接上集团会, 绕过本地审会。' +
      '③准备 3-4 个项目摆给戴维选, 试他的画像偏好(老国企更新 / 青年人 / 服务者补贴), ' +
      'p1 用自己的项目去推, 风险自担。资方变量已经稳定, 关键变量收窄到"业主 + 高管"。',
    actionItems: [
      { id: 'A1', who: 'p2', what: '去见星云, 只谈"三个递进诉求", 一二三任意一个落地都接受',                              due: '本场后下一程' },
      { id: 'A2', who: 'p2', what: '准备 3-4 个项目摆出来, 找戴维试偏好(青年人 / 服务者 / 老国企更新), 不要正式汇报', due: '与 A1 并行' },
      { id: 'A3', who: 'p2', what: '推动工控蓝领项目(45 套/240 床位)落地, 必要时绕过本地审会直接上集团',                due: '近 2 个月' },
      { id: 'A4', who: 'p2', what: '兜底预案: 如本地审会不通过, 自己出钱跑通, 把样子做出来',                            due: '兜底' },
      { id: 'A5', who: 'p3', what: '把过往项目报告/造价测算/调研模板发给 p1, 用作 AI 模板的训练素材',                  due: '即刻' },
      { id: 'A6', who: 'p1', what: '把 p3 的报告做成 AI 生成模板, 减少 p3 的 PPT 与重复测算工作量',                     due: 'A5 之后' },
      { id: 'A7', who: 'p1', what: '若蓝领"必须直招企业"卡死, 协调把"对赌"条款去掉, 否则渠道-对赌双约束跑不通',         due: '与 A3 并行' },
      { id: 'A8', who: 'p1', what: '当晚跟齐玉龙碰面, 但只回复"角度不同", 不再展开进度细节(进度由道一直接对)',          due: '当晚' },
      { id: 'A9', who: 'p2', what: '到西安看项目(两条腿走路: 业主谈 + 项目侧推进, 不互为前置)',                       due: '近期' },
    ],
    risks: [
      'R1 · 团队内在机制鼓励"不做成" — 干成了增加工作量、引入未知风险, 个人理性下没人愿意推, p3 主动诊断:「这个内在的机制是鼓励大家不做成就」',
      'R2 · 中层"无知拦路虎" — 张珊姐式在最后会上提"零醛"等物理上不可达的要求, 把项目卡死在最后一关, 提议人是老板而非张珊姐, 更难处理',
      'R3 · 星云的不可推动性 — p3 直言:「他一年拿 300 多万, 啥也不用管, 啥也不用做, 然后又在成都, 他不会改变」, 三个递进诉求第一个能拿到就算赢',
      'R4 · 算账周期硬约束 — p3 给出工作量底线: 排房+设计+造价+调研一套两周, 加西安差旅一个月, 西安本地没有会做这套的人',
      'R5 · 蓝领 to-b vs to-c 边界 — 蓝领必须直招企业不能直招个人, 这与"省心租"客户结构存在结构性冲突, 必须协调对赌条款才能跑通',
      'R6 · 推黄风险 — p3 内部经验:「在过会的过程中,因各种原因不是项目问题的导弄黄的太多」, 这是 p1 主张"绕过本地会、直接上云端"的根本原因',
      'R7 · 山总式风险厌恶 — "物理世界不存在的东西怎么做到", 风险不讲道理, 当前所幸该模块"跟他没关系了"才能干',
      'R8 · 业主预期错配 — 业主可能误以为"你全投呢", 必须早期讲清"我要投一半儿", 否则方案做完业主翻脸',
      'R9 · 贝壳币流量被收口 — 老杨控份额、份额内排序竞争, 为月度 1 万贝壳币去给老杨开口"有点过度", 不开口又办不成 — 卡在尴尬区间',
    ],
  },
  tension: [
    {
      id: 'T1', between: ['p1', 'p3'], intensity: 0.55,
      topic: '内部协调难度: 程序乐观 vs 经验悲观',
      summary:
        'p1 的初始范式是"流程快速过, 该 say no 也不会 say no, 资方判断放款、省心租判断价格, 不需要中间方判断什么"; ' +
        'p3 第一句话就直接打回:「你不要那么乐观, 审计都干不了这活, 你光一汇报, 这关就过不去」。' +
        '后续 p3 反复用"推黄太多"、"星云一年 300 多万他不会改变"、"中层无知拦路虎"把 p1 的程序乐观拉回到组织实情。' +
        'p1 没有反对, 而是把策略从"流程跑通"切到"绕过本地、上升到云端"。',
      moments: [
        'p1: 「资方判断放款, 价格是省心租判断的。需要他判断啥吗?只需要他不 say no, 他的工作是 say no 肯定也不是嘛。」',
        'p3: 「但是你不要那么乐观, 审计都干不了这活, 你光一汇报, 这关就过不去。」',
        'p3: 「你想一年拿 300 多万, 啥也不用管, 啥也不用做, 然后又在成都轻易, 他不会改变的。」',
        'p1 (转向): 「咱不过他的会, 不过你们这个会。我审这个会, 我直接拉到云总部去, 在许昌直接支持。」',
      ],
    },
    {
      id: 'T2', between: ['p1', 'p3'], intensity: 0.42,
      topic: 'AI 替代分析师工作量的边界',
      summary:
        'p1 主动提出帮 p3 把过往报告做成 AI 生成模板:「参数往里一说, 能出个七七八八」; ' +
        'p3 第一时间接受素材共享, 但紧接着把边界划清:「写 PPT 的周时间没有你想象的长, 主要算账是最麻烦的, 因为很多东西要靠经验去下值」。' +
        '不是反对 AI, 是反对用 AI 替代"实地工程量改造的查"; 这是一条价值观差异, 不是冲突 — ' +
        'p3 给出的最终判断是「能省 PPT, 能省点时间, 但是现在我 PPT 越写越简单, 复杂东西我都不行」。',
      moments: [
        'p1: 「我们都帮你帮点忙, 把你的报告都给我, 我都弄成一个那个 AI 的生成模板, 大体上来讲就是参数往里一说能出个七七八八。」',
        'p3: 「他这个其实写 PPT 的周时间没有你想象的长, 主要算账是最麻烦的, 因为很多东西要靠经验去下值。」',
        'p3: 「你做多少立方, 做多少平方, 你就是得实际去看, 该干的事儿一点都省不了, 能省 PPT, 能省点时间。」',
        'p1: 「他只能做测算, 给你算敏感性, 给你设算 100 个组合, 给你分析哪个组合最好, 就他做到这份上。」(部分接受边界)',
      ],
    },
    {
      id: 'T3', between: ['p2', 'p3'], intensity: 0.30,
      topic: '第一个跑通项目: 嫌小 vs 因小才快',
      summary:
        'p2 第一反应「太小了」(45 套 / 240 床位 / 慈善基金 150 万投资); ' +
        'p3 反向定调「正儿八经那是最快的, 就是因为小才快, 大的项目都要走流程」。' +
        'p1 不在 p2 那一侧, 而是接住 p3:「咱不是为了跑通吗?干呗?」并补一刀「百套也没事, 真的走通就强」。' +
        '这是一条快速消解的张力 — p2 看到地铁线"3 站到天河东、4 站到珠江新城"后立刻翻转: ' +
        '「位置老好了, 那位置绝对不是说筹租的问题」, 立场反转。',
      moments: [
        'p2: 「太小, 那个项目。」',
        'p3: 「但是正儿八经那是最快的。就因为小才快, 大的项目都要走流程。」',
        'p1: 「咱别纠结小了, 这不是, 咱不是为了跑通吗?」',
        'p3: 「你这个项目你知道吗?今年年底开通地铁线, 3 站到天河东站, 4 站到珠江新城。」',
        'p2 (翻转): 「位置老好了, 那位置绝对不是说筹租的问题。」',
      ],
    },
    {
      id: 'T4', between: ['p1', 'p3'], intensity: 0.38,
      topic: '"拿我的项目去推" vs "推黄风险太高"',
      summary:
        'p1 主动提供项目兜底担保:「拿我的项目推没问题, 既不沾省心租, 也不沾公寓, 自己项目我怕啥?」; ' +
        'p3 不接受这种"沾染外部风险"的好意:「但是你那个东西你连半成品都算不上, 你至少去两趟才能把东西工作全做完」。' +
        '这条张力是 T1 的延伸 — p3 长期处在"推一个黄一个"的环境, 他对 p1 自带项目的"成熟度"持高度怀疑。' +
        '本场未明确解决, 但 p1 用"咱不过他的会, 我直接拉到云总部"这个动作绕开了 p3 的担忧。',
      moments: [
        'p1: 「拿我的项目推没问题, 可以的, 不用担心这个事。这我都充分理解, 因为这事我不沾, 既不沾省心租, 也不沾公寓, 自己项目我怕啥?」',
        'p3: 「可以推, 但是你知道, 因为我们推上你的项目, 在过会的过程中, 因为各种原因就不是什么项目问题的, 那导弄黄的太多了。」',
        'p3: 「你那个, 你连半成品都算不上, 关于线索你想完成半成品, 太多工作要做了。」',
      ],
    },
    {
      id: 'T5', between: ['p1', 'p3'], intensity: 0.25,
      topic: '蓝领项目 to-b 边界(技术争点)',
      summary:
        '末段技术性争议: p1 认为"省心租能签 to-b 的客户(企业租)", 蓝领的限制只是"不能承诺直招企业"; ' +
        'p3 直接打断:「啥叫不能承诺?蓝领是必须跟企业签, 不能跟个人签」。' +
        '这条是合规边界争议, 没有展开, 但暴露了"蓝领 + 省心租"组合落地需要更细的合规澄清。' +
        'p1 退一步给出折中:「如果影响的无非是因为你让我少了一部分客户, 把对赌去掉不就好了」 — 把战术问题切换为合同条款问题。',
      moments: [
        'p1: 「我知道, 他只是说不能怎么说, 不能承诺, 但不是不能。」',
        'p3: 「啥叫不能承诺?蓝领是必须跟企业签, 不能跟个人签。」',
        'p1: 「把对赌去掉其实就无所谓了, 城市是说你不让我搞渠道, 你还让我对赌, 那肯定。」',
      ],
    },
  ],
  newCognition: [
    { id: 'N1', who: 'p2',
      before: '要去见星云这事到底做不做, 卡着',
      after:  '只谈三个递进诉求(主体/标准/指标), 答应第一个就够, 不耗',
      trigger: 'p1 三句话:「他答应你第一个也行, 也没白去, 他给你画一个饼」 + 「咱没必要跟他耗」+「他帮咱们说一句好话也行」' },
    { id: 'N2', who: 'p2',
      before: '星云这事是钱的问题, 投不投是个数字判断',
      after:  '不是钱的问题, 是态度问题 — 他投不投钱无所谓, 关键是态度积极不积极',
      trigger: 'p2 自我推导出来的结论:「他投不投那点钱我无所谓, 这是态度问题, 一句话的事」, p1/p3 都接住了' },
    { id: 'N3', who: 'p3',
      before: '团队"做事难"是因为流程复杂或人手不够',
      after:  '内在机制鼓励"不做成" — 干成了引入未知风险、增加工作量, 个人理性下没人推',
      trigger: 'p3 提出原始诊断:「内在的这种机制是鼓励大家不要把这事干成, 因为干成了有风险, 你增加了工作量」 — 全场沉默式认同' },
    { id: 'N4', who: 'p2',
      before: '高管的风险厌恶是同质的, 都是不愿担责',
      after:  '风险厌恶分层级 — 云端讲逻辑可推理(把项目+风险点讲通就 ok), 山总极端不讲道理(物理世界不存在的事都怕)',
      trigger: 'p3 把"沈明珠那段山总怕一点小事把项目耽误"的具体经历摆出来, 让 p2 区分"可沟通的风险厌恶"和"不可沟通的风险厌恶"' },
    { id: 'N5', who: 'p2',
      before: '要靠把方案做对、走流程跑通项目',
      after:  '大不了自己兜底投钱跑通 — 最差结果是自己挂牌、自己投, 这反而把战术自由度拉满',
      trigger: '从 p3 的"推黄太多"和 p1 的"拿我项目去推"两侧获得授权感, p2 自己说出:「自己兜底投钱呗, 最差的结果」' },
    { id: 'N6', who: 'p1',
      before: 'AI 模板可以替代分析师 80% 的工作',
      after:  'AI 能省 PPT, 能做测算敏感性 100 个组合, 但工程量改造排房定价必须靠经验值人工下',
      trigger: 'p3 给出的反向校准:「该干的事儿一点都省不了, 你做多少立方多少平方就是得实际去看」, p1 自动收敛到"100 组合敏感性分析"作为合理边界' },
    { id: 'N7', who: 'p2',
      before: '工控项目太小不值得做',
      after:  '因小才快, 45 套两个月开业 + 地铁年底通 + 慈善基金 150 万属性匹配 = 跑通 sample 的最优解',
      trigger: 'p3 的"地铁线 3 站到天河东、4 站到珠江新城"一句话, p2 立刻翻转「位置老好了」' },
    { id: 'N8', who: 'p1',
      before: '走流程, 一关一关过',
      after:  '推黄风险太高 — 不过本地会, 直接拉到云端总部 / 上升到集团会',
      trigger: 'p3 反复强调"推黄太多"、"内部各种原因弄黄的", p1 接住后转换路径:「咱不过他的会, 我直接拉到云总部去, 在许昌直接支持」' },
  ],
  focusMap: [
    { who: 'p1', themes: ['三个递进诉求设计', '关键变量识别(业主+高管)', '上升路径(云端/集团/许昌)', '拿自己项目兜底', 'AI 模板替代', '阿甘退路'],          returnsTo: 9  },
    { who: 'p2', themes: ['要不要见星云', '态度 vs 金钱', '挂牌 / 自己投钱兜底', '方向偏好测试', '工控 vs 西安选哪个', '集团会上升'],                       returnsTo: 8  },
    { who: 'p3', themes: ['推黄风险', '排房-造价-调研工作量底线', '中层无知拦路虎', '风险厌恶分层(云端/山总)', '工控蓝领项目细节', '组织疲劳'],            returnsTo: 11 },
    { who: 'p4', themes: ['(几乎不发言, 仅短促应答)'],                                                                                                       returnsTo: 0  },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '关键变量是业主 + 高管, 资方已稳定不用管, 星云既非帮助也非阻力',           supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C2', kind: 'consensus',  text: '找星云只谈三个递进诉求(主体/标准/指标), 第一个落地就算赢, 不耗',          supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C3', kind: 'consensus',  text: '第一批跑通项目锁定工控蓝领(45 套/240 床位/广州/年底通地铁/2 月开业)',     supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C4', kind: 'consensus',  text: '准备 3-4 个项目摆给戴维选, 试他偏好(青年人/服务者/老国企更新), 不正式汇报',supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C5', kind: 'consensus',  text: '兜底预案: 必要时绕过本地审会, 直接上云端总部 / 集团会, 不耗在中层',         supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C6', kind: 'consensus',  text: '兜底预案 II: 必要时 p2 自己挂牌 / 自己投钱跑通, 最差结果可控',              supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C7', kind: 'consensus',  text: '业主预期早期管理: 早讲清"我们投一半儿", 不让业主以为我们全投',              supportedBy: ['p1','p3'],      sides: [] },
    { id: 'C8', kind: 'consensus',  text: 'p3 的报告/造价模板交给 p1 做成 AI 生成模板, 减少重复 PPT 工作量',           supportedBy: ['p1','p3'],      sides: [] },
    { id: 'C9', kind: 'consensus',  text: '业主谈和项目侧推进"两条腿走路", 不互为前置',                                supportedBy: ['p1','p2'],      sides: [] },

    { id: 'D1', kind: 'divergence', text: 'AI 模板能替代分析师工作量到什么程度?', supportedBy: [], sides: [
      { stance: '能替代多数', reason: '参数往里一说出个七七八八, 100 组合敏感性分析也能做',                                  by: ['p1'] },
      { stance: '边界明确',   reason: 'PPT 可以省, 但实际工程量改造排房必须人工到现场, AI 无法假设没经验值的参数',           by: ['p3'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '走通流程靠现有项目还是地方 GR 重新发动?', supportedBy: [], sides: [
      { stance: '现有项目', reason: 'p1 的项目即拿即推, 风险自担, 时间优先',                                                by: ['p1'] },
      { stance: '从上而下', reason: '他们不会主动报项目, 必须跟单位沟通, 自上而下推, 否则地方动不起来',                     by: ['p3'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '蓝领项目能否走 to-b 客户(企业租)?', supportedBy: [], sides: [
      { stance: '可以签 to-b',   reason: '客户是企业即可, 只是不能承诺直招个人',                                            by: ['p1'] },
      { stance: '必须直招企业', reason: '蓝领合规要求是直招企业不能直招个人, "不能承诺"和"不能直招"是两回事',              by: ['p3'] },
    ]},
    { id: 'D4', kind: 'divergence', text: '推上去的项目"成熟度"够不够?', supportedBy: [], sides: [
      { stance: '我项目可推',   reason: 'p1 自己的项目自担风险, 不沾省心租也不沾公寓',                                        by: ['p1'] },
      { stance: '半成品都不算', reason: '排房-设计-造价-调研不全, 至少去两趟才能完成基础工作',                               by: ['p3'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p3',
      claim:
        '我们团队的内在机制是鼓励大家"不做成事" — 干成了有风险、增加工作量, ' +
        '从个人理性出发没人愿意推, 这是组织最深层的问题。' +
        '同时还有"无知拦路虎"在最后会上提"环保部要求零醛"这种物理上不可达的要求, 把好项目卡死。',
      responses: [
        { who: 'p1', stance: 'support', text: '完全接受 — 直接转为策略调整:「咱没必要跟他耗, 耗不起」+「咱不过他的会, 直接上云端总部」。' },
        { who: 'p2', stance: 'support', text: '把诊断转为情绪能量:「就可怕这种无知的拦路虎, 跟他们没智商一样, 弱智」, 由此产生兜底投钱的决心。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p2',
      claim:
        '不是钱的问题, 是态度问题 — 星云投不投钱我根本无所谓, ' +
        '关键是他积不积极, 一句话的事; 他不积极, 这事就有结构性麻烦。',
      responses: [
        { who: 'p1', stance: 'support', text: '直接接住:「支持就行了」, 没有再展开。' },
        { who: 'p3', stance: 'partial', text: '同意态度重要, 但泼冷水:「他要的不是这个, 他也不想做」 — 提示态度也未必能争取到。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p1',
      claim:
        '三个递进诉求: (a)支持 p2 拿主体做全国项目 / (b)清投资准入标准 / (c)直接背指标。' +
        '他答应第一个就算没白去, 哪怕只是画一个饼、说句好话, 都比"耗着"强。',
      responses: [
        { who: 'p2', stance: 'support', text: '直接执行:「我觉得有可能第一个能做到」, 把动作具体化。' },
        { who: 'p3', stance: 'support', text: '提供反差锚定:「他什么时候能想做?从他想做到做, 还有很大的一块路要走」 — 替"低预期"提供论据。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p3',
      claim:
        '排房 + 设计 + 造价 + 调研一套两周, 加西安差旅干一个月, ' +
        '西安本地没有会做这套的人; 算账靠经验值不能省, AI 替代不了。',
      responses: [
        { who: 'p1', stance: 'partial', text: '部分接受 — 把 AI 期待收敛到"100 组合敏感性分析", 但仍坚持模板化报告以减负。' },
        { who: 'p2', stance: 'neutral', text: '没有正面反应 — 但 A2/A3 动作是回避了西安从零启动, 改用工控蓝领跑通, 间接接受 p3 的工作量底线。' },
      ],
    },
    {
      id: 'V5', claimBy: 'p2',
      claim:
        '最差结果我可以挂牌 + 自己兜底投钱, 拿这个项目试试看能不能跑通。 ' +
        '即使经过那个关键的 (中层) 人物没过, 也有上升路径。',
      responses: [
        { who: 'p1', stance: 'support', text: '正面授权:「拿我的项目推没问题, 这事我不沾」+「之后也就是打个招呼, 然后回来」。' },
        { who: 'p3', stance: 'partial', text: '不反对兜底, 但提醒蓝领合规边界(必须直招企业), 把"可以兜底"和"合规可行"分开。' },
      ],
    },
    {
      id: 'V6', claimBy: 'p1',
      claim:
        '云端是终极上升路径 — 他是非常理性的人, 把项目和风险点讲通了, 他就 ok; ' +
        '不像山总那种极端风险厌恶, 物理世界做不到的事都怕, 风险又不讲道理。',
      responses: [
        { who: 'p3', stance: 'support', text: '完全认同:「云端这人特别讲逻辑, 你要把这个事项目东西都讲通了, 风险点讲通了, 他是 ok 的」。' },
        { who: 'p2', stance: 'support', text: '直接转为兜底战术:「最后大不了把所有东西方案拿过来之后回北京, 直接上升嘛」。' },
      ],
    },
  ],
};

const PROJECT_POOL = [
  { id: 'P1', label: '工控蓝领项目',   desc: '广州 · 45 套 / 240 床位 / 慈善基金 150 万 / 年底通地铁 3 站天河东 4 站珠江新城 / 2 月开业 / 只换软装不报建委',                  owner: 'p3', priority: 'PRIMARY' },
  { id: 'P2', label: '西安项目',       desc: '需 p2 现场看, 山东/南京同类(政府推保租房压力大), 排房+造价+调研走完需一个月, 本地无懂行执行人',                                owner: 'p2', priority: 'BACKUP'  },
  { id: 'P3', label: '武康路改造',     desc: '上海老城区改造概念, 用作 PROBE 之一摆给戴维选, 不一定真要做',                                                                  owner: 'p1', priority: 'PROBE'   },
  { id: 'P4', label: '大学城项目',     desc: '只要账算得过来即可走, 与"青年人/学生公寓"画像匹配, 是 PROBE 之一',                                                            owner: 'p1', priority: 'PROBE'   },
  { id: 'P5', label: '黄埔项目',       desc: '过往参照: p3 算下来"最后只能做 100 来套高端", 客群不支撑, 周五给的方案, 8 号才看完, 反映典型周期',                              owner: 'p3', priority: 'PAST'    },
  { id: 'P6', label: '沈明珠项目',     desc: '过往参照: 山总当时做的, "怕一点小事把这事耽误了", 山总极端风险厌恶的代表案例',                                                  owner: '-',  priority: 'PAST'    },
  { id: 'P7', label: '皇甫山姆项目',   desc: '过往参照: "看之前觉得能做, 看之后一算账, 硬装得做一半才能进场" — 凡过案前必须算账完整的反面教材',                              owner: 'p3', priority: 'PAST'    },
];

const META_INFO = {
  asrQuality: 'mid-high — 噪声有限, 数字基本准确; 个别人名疑为同音替换("江山"可能为"张珊"、"齐玉龙"为"齐宇龙"等)',
  signalDensity: 'high — 业务议题密度集中, 跑题不超过 12%; 主要"非业务"段是组织文化吐槽与个人岗位讨论, 但仍服务于核心议题',
  emotionalTone: '前段冷静策略、中段共愤吐槽(p3 主导)、末段决策落地。p3 出现明显职业倦怠信号「我都待够了, 在这边我都服了」',
  structuralPattern: '"高管协调路径 → 组织文化诊断 → 项目跑通选择 → 兜底预案确认" 四段式',
  followUps: [
    'p1 当晚与齐玉龙碰面 (建议: 只回"角度不同", 进度由道一直接对)',
    'p3 当天下午去振炎',
    'p2 见星云 + 准备 3-4 项目 PROBE + 推工控蓝领',
    'A5 报告模板交付 → A6 AI 模板搭建',
  ],
  refToOtherCase: '与同日上午 11:18 的 renovation-loan 那场是同一天但不同议题, 同一组织语境下的内部线 vs 对外洽谈线',
};

// ── 抽 docx 文本 (复用上一份转写) ──
const { value: rawText } = await mammoth.extractRawText({ path: DOCX_PATH });
const transcriptText = (rawText ?? '').trim();
console.log(`[seed] docx → ${transcriptText.length} chars (${transcriptText.split('\n').length} lines)`);

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'internal_strategy',
  duration_min: 38.42,
  duration_label: '38 分 25 秒',
  room: '内部场所(线索: 中途有人 "再来个杯", 4 号短暂入座, 推断为线下办公室或会议室)',
  source_note: '会议自动转写 (含 ASR 噪声, 但整体可读性高)',
  source_filename: '探讨装修贷款与分期付款的定价策略_2026年04月27日11时18分07秒(1).docx (用户指定复用)',
  off_topic_pct: 0.12,
  tokens_estimate: 14500,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  project_pool: PROJECT_POOL,
  meta: META_INFO,
};

// ── 写库 (INSERT 新建) ──
const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await client.connect();
try {
  await client.query(
    `INSERT INTO assets (id, type, title, content, content_type, metadata)
     VALUES ($1, 'meeting_note', $2, $3, 'meeting_note', $4::jsonb)`,
    [NEW_MEETING_ID, TITLE, transcriptText, JSON.stringify(metadata)],
  );
  console.log(`[seed] INSERTed new meeting ${NEW_MEETING_ID}`);

  const r = await client.query(
    `SELECT id, title, type,
            length(content) AS content_chars,
            metadata->>'occurred_at'  AS occurred_at,
            jsonb_array_length(COALESCE((metadata->'participants'), '[]'::jsonb))            AS n_participants,
            jsonb_typeof(metadata->'analysis')                                                AS analysis_typeof,
            jsonb_array_length(COALESCE((metadata->'analysis'->'tension'), '[]'::jsonb))      AS n_tensions,
            jsonb_array_length(COALESCE((metadata->'analysis'->'newCognition'), '[]'::jsonb)) AS n_new_cognition,
            jsonb_array_length(COALESCE((metadata->'analysis'->'consensus'), '[]'::jsonb))    AS n_consensus,
            jsonb_array_length(COALESCE((metadata->'analysis'->'crossView'), '[]'::jsonb))    AS n_cross_view,
            jsonb_array_length(COALESCE((metadata->'project_pool'), '[]'::jsonb))             AS n_projects
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
