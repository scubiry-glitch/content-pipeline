// Seed · 探讨装修贷款与分期付款的定价策略 — 新建会议
// 转写源文件: /Users/scubiry/Downloads/探讨装修贷款与分期付款的定价策略_2026年04月27日11时18分07秒(1).docx
// 分析参考  : /Users/scubiry/Downloads/renovation-loan-pricing__analysis.ts
//
// 与之前 seed 脚本不同 — 这次是 INSERT 新建（生成新 UUID），不是 UPDATE 现有 row。
// 转写正文用 mammoth 从 docx 抽出, 写到 assets.content; 分析对象写到 metadata.analysis。
//
// 用法: node scripts/seed-meeting-renovation-loan.mjs

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

const TITLE = '探讨装修贷款与分期付款的定价策略';
const OCCURRED_AT = '2026-04-27T11:18:07+08:00';

const PARTICIPANTS = [
  { id: 'p1', name: '银行业务对接人', role: '江苏银行 北京分行 · 消费贷线条 (说话人 1, 女)',           initials: '银', tone: 'warm',    speakingPct: 38 },
  { id: 'p2', name: '装修业务方',     role: '贝壳供应链合作 / 自营装修公司 (说话人 2, 男, 95后, 张总)', initials: '装', tone: 'neutral', speakingPct: 47 },
  { id: 'p3', name: '资深顾问',       role: '渠道方 / 跨界战略顾问 (说话人 3)',                          initials: '顾', tone: 'cool',    speakingPct: 15 },
];

const ANALYSIS = {
  summary: {
    decision:
      '就「装修贷款 + 免息分期」产品打法达成多项操作级共识: ' +
      '①利息以 2~3 个点形式嵌入装修包单项报价, 客户体感"完全免息"; ' +
      '②先做白名单试点 5~6 人 (李杰对接), 数据回流后再调总行政策; ' +
      '③物料弱化银行品牌、突出"免息+权益+保险"整包; ' +
      '④营销奖品走总行专项预算 (基础 100 元苏宁豆 + 项目专项大奖), 不挤占贷款利率空间; ' +
      '⑤产品差异化卖点新增"中断还款支持"(36 月→可延至 38 月, 次数尽量不限); ' +
      '⑥范围限定家装个人客户, 不给装修公司本身/二房东/资管放贷。' +
      '次日 10:00 民族饭店续谈, 把延续两月条款敲定。',
    actionItems: [
      { id: 'A1', who: 'p2', what: '把"产品策略 + 流程 + 卖点"整理成给业主的电子化物料, 经设计师对客时一并呈现',                  due: '本周内' },
      { id: 'A2', who: 'p1', what: '与总行确认: 100 元苏宁豆基础权益 + 项目专项大奖的预算口径与会签流程',                          due: '次周内' },
      { id: 'A3', who: 'p1', what: '推动白名单加 5~6 人 (李杰执行), 校验"大数据反出收入"vs"客户经理填报"两套数据是否一致',         due: '即刻' },
      { id: 'A4', who: 'p2', what: '次日 10:00 民族饭店续谈, 落实中断还款条款 (是否限次)、单项调价幅度上限',                       due: '次日 (T+1)' },
      { id: 'A5', who: 'p3', what: '牵线 黎明总 / 陈华总监 / 季总 等横向资源, 探资产服务机构 / 老人养老 等场景的合作可能',          due: '与 A4 并行' },
      { id: 'A6', who: 'p1', what: '对比研究: 上海农商行 / 上海信托 在监管谈判后获得的全国展业政策, 评估江苏银行复制路径',          due: '中期 (项目跑通后)' },
      { id: 'A7', who: '*',  what: '把"产品 / 流程 / 定价 / 营销"四件套打包成可复制模板, 不再一城一议',                            due: '试点跑出 30 单后' },
    ],
    risks: [
      'R1 · 助贷骗贷 — p2 主动揭过同业案例: 助贷找到客户, 装修公司转手套钱; 银行风控基于"还款能力"识别不出"行为风险"',
      'R2 · 收入数据二源不一 — 6 个白名单中 4 人 36,000 月入是大数据反出来, 不是客户经理填; 总行政策可能不批的隐患',
      'R3 · 客群边界扩散 — p2 反复想把二房东/资管/装修公司经营贷/老人养老资产代管 都纳入, 与 p1 的"个人征信 + 受托支付"框架冲突',
      'R4 · 业务员"张不开嘴" — 销售员是否愿意去推、能不能讲清楚"哪些能说哪些不能说", 是项目能否落地的关键, p2 自陈培训压力大',
      'R5 · 北京 vs 宿迁同金额贷款门槛逻辑 — p1 自己也接受不了"北京 1 万 = 宿迁 1 万 → 同样批 20 万", 客户经理推不下去',
      'R6 · 体感弱化 vs 合规边界 — p2 想做到"像车贷一样无感", p1 提醒签合同瞬间体感无法消除, p3 折中"模糊不了别去模糊"',
      'R7 · 装修公司业务员"张不开嘴"的另一面 — 不培训等于"别的银行替代我们也行", 项目高度依赖前端 know-how 沉淀',
      'R8 · 转写本身 ASR 噪声极重 — 关键数字(出租率/利率/收入档)出现明显错位, 本输出所引数字均需二次校对',
      'R9 · 跑题率 ~37% — 这场对话的真实"业务议题密度"低于上海汇聚 AI 那场, 决策需通过多轮回收(参考 returnsTo 字段)',
    ],
  },
  tension: [
    {
      id: 'T1', between: ['p2', 'p1'], intensity: 0.45,
      topic: '客户感知: 完全免息体感 vs 合规底线',
      summary:
        'p2 主张把利息嵌入装修单项调价(2~3 个点), 客户体感"我没在贷款"; ' +
        'p1 提醒"签合同那一刻他能感受到我们是金融贷款", 体感无法被完全消除, 而且培训压力大 — ' +
        '业务员要清楚"哪些能说哪些不能说"; ' +
        'p3 折中态度: "咱不是说要我们模糊法律的边界也模糊不了, 只是体感越弱越好"。',
      moments: [
        'p2: 「反正体感越弱, 当时的就贷款这个题干的, 当时对。」',
        'p1: 「但是前提是你得告诉我就是哪些东西能说, 哪些不能说的我不知道。」',
        'p3: 「咱不是说要我们模糊法律的边界也模糊不了。」',
        'p2: 「再弱我跟他签合同的那一刻, 他也能感受到我们是一个金融贷款。」(自我承认底线)',
      ],
    },
    {
      id: 'T2', between: ['p2', 'p1'], intensity: 0.52,
      topic: '客群扩张 vs 风险边界',
      summary:
        'p2 反复试探: 二房东/资管/装修公司经营贷/烟商贷/老人养老资产代管, 都想纳入合作范围; ' +
        'p1 一以贯之"看个人征信 + 还款能力 + 受托支付", 直接说"不建议给别人公司贷款"; ' +
        'p3 偏 p1 立场, 给出风控视角的反向信号判断: "这些人本来挣钱不挣了, 是一个类似的信号"。',
      moments: [
        'p2: 「我们大客户很多是这种(二房东/资管), 然后其实我觉得这种需求还挺大的, 但是这种其实信用是有问题的。」',
        'p1: 「他肯定有还款能力, 但是他这种行为他是一个欺诈风险, 他不是个信用。」',
        'p2: 「我们做的烟商贷他做了一些比如说电商平台…装修的商户我们也可以尝试。」',
        'p1: 「首先我不建议你去给别人公司贷款。」',
        'p3: 「从风控上来讲, 如果这些人本来就挣钱不挣了, 意味着这是一个类似的信号。」',
      ],
    },
    {
      id: 'T3', between: ['p2', 'p1'], intensity: 0.30,
      topic: '中断还款次数: 不限 vs 限次',
      summary:
        'p2 主张"能少限就少限", 把中断还款支持(36 月→可延 38 月)作为核心差异化卖点; ' +
        'p1 默认风控视角, 偏向"一年一次"; ' +
        'p3 偏 p2: "中断次数风险有限, 我觉得还好, 把它包装成企业能享受到的一个其他产品也有一个服务"。',
      moments: [
        'p2: 「我觉得最好是你现在走次数最好能不限的不限, 能少限能少限就少少限, 因为这个东西它是随机的。」',
        'p1: 「你就像总市场, 比如说一年允许他有一次机会。」',
        'p3: 「中间因为有第三方签证(贝壳的文件)…一个风险有限。」',
      ],
    },
    {
      id: 'T4', between: ['p1', 'p2'], intensity: 0.25,
      topic: '北京 vs 宿迁同金额贷款门槛 (p1 单方面困惑)',
      summary:
        'p1 在车上对 p2 说出全程最强烈的认知冲突: ' +
        '同样批 20 万贷款, 北京要求月入 1 万、宿迁也要求月入 1 万 — ' +
        '"北京 1 万根本不是高收入, 我逻辑上接受不了"; ' +
        'p2 用"等级划分概念"敷衍带过, 没有正面回应。这是一个被搁置的张力。',
      moments: [
        'p1: 「他的高收入 1 万甚至 10 万, 我批 20 万我也能理解。」',
        'p1: 「我在北京 2 万就不是高收入了, 你比如说都是批 30 万贷款, 为什么我在北京要求我 30 万?」',
        'p1: 「但是大家都是批 20 万的贷款, 我还要求我贷款要求你 1 万…我逻辑上我有点接受不了。」',
        'p2: 「你等级划分那个概念, 就是在你北京 1 万块钱…」(只接半句, 没解决)',
      ],
    },
    {
      id: 'T5', between: ['p3', 'p1'], intensity: 0.20,
      topic: '颠覆式管理范式 vs 银行体制实情 (远端张力, 不展开)',
      summary:
        'p3 抛出"民企 1 号都在用滴滴派单管理, 中层全没了"、"我们机器人(风控)比人类更快更广", ' +
        'p1 用银行扁平化的亲身经历部分认同 — 但语气透出抗拒: ' +
        '"中级岗位一弄出来一下全没了, 你后面自己就走了"; ' +
        '这条张力本场没展开, 但与上海汇聚 AI 那场的"管理 A→B 点"主题遥相呼应, 是同一时代议题在不同行业的折射。',
      moments: [
        'p3: 「民企现在是…你肯定是想跟他们跟滴滴一样直接派单, 你中间一层全没了, 就那一串人全没了。」',
        'p3: 「我们机器人只会从坏的时候从尾往后看…它的时效性它的覆盖面比我们(人类风控)更广。」',
        'p1: 「严格什么部门总的工资, 如果是这一级底下员工, 不管你资历多深, 不允许给他考核一级一级往下排…设计师很好, 自由干忽悠。」(隐含吐槽)',
      ],
    },
  ],
  newCognition: [
    { id: 'N1', who: 'p2',
      before: '客户对利率敏感, 利率低就有竞争力',
      after:  '业主有钱不在乎便宜 — 4.5% 和 3% 没意义, 真跟我聊便宜你就没那么大量, 关键是把权益做好',
      trigger: 'p3 一句:「权益敏感性的, 我一直看他们不用我们讲价格, 所以你对我们而言 3% 4.5% 没有区别…不如把权益做好。」' },
    { id: 'N2', who: 'p2',
      before: '装修贷就是装修贷, 单点产品',
      after:  '不是卖贷款, 是卖一个产品 — 免息分期 + 中断还款支持 + 保险 + 权益 整包, 体感像车贷分期',
      trigger: 'p3 反复举汽车金融案例:「客户、4S 店、银行三方愿意做」+ 自己抛出「卖一个产品, 这个产品的一些叫免息分期付」。' },
    { id: 'N3', who: 'p2',
      before: '业主真正担心的是利率/总价/会不会被坑',
      after:  '业主真正担心的是"如果中间断租, 我还得还钱怎么办" — 这才是核心痛点',
      trigger: 'p3:「他的痛点本身不是价格, 他是担心如果我贷的款中间断了租, 你是不是还得让我还钱?」' },
    { id: 'N4', who: 'p1',
      before: '高风险客群(二房东/资管)如果有还款能力可以试试',
      after:  '行为风险 ≠ 信用风险 — 不能光看还款能力, 要看资金最终去向; 装修公司本身贷款不建议做',
      trigger: 'p2 主动揭过助贷骗贷案例 + p3 用"反向信号"理论补刀("挣钱的人不挣了 = 风险信号")。' },
    { id: 'N5', who: 'p1',
      before: '北京客户 1 万收入 = 宿迁客户 1 万收入, 同档贷款应该一致',
      after:  '(无法接受, 未解决) 等级划分逻辑在跨城市时本质失效, 客户经理推不下去',
      trigger: '车上自言自语 — 没人正面回应, 是被搁置的认知冲突, 但已经被她说出来了。' },
    { id: 'N6', who: 'p2',
      before: '民企管理就是 KPI/数值/培训/淘汰, 跟我装修业务关系不大',
      after:  '民企 1 号们都在用滴滴派单替换中层管理; AI 让管理边界从 10 个人放大; 我们公司也在研究给员工做派单',
      trigger: 'p3 抛出"董事长第一次给你开单就完了" + 对小米核心是"老板测试他的管理边界到底从 10 个人掌握了多少"的总结。' },
    { id: 'N7', who: 'p1',
      before: '在北京要不要买房还在犹豫',
      after:  '10 年期一定涨, 三年期可能跌 15%, 到孩子要上学时再算账; 27 年(贝壳首席预测)是底',
      trigger: 'p3 给出"现金流账本"思考模型: 利息成本 vs 房租 vs 资本利得 vs 摩擦成本, 把决策结构化。' },
    { id: 'N8', who: 'p3',
      before: '上海信托/工行养老 模式 30 万门槛, 复制路径清晰',
      after:  '门槛在监管谈判, 不在产品设计 — 上海农商行能全国展业是政府跟监管去谈出来的, 不是产品好',
      trigger: 'p1 提:「上海银行上海农商行可以全国展业」+ p2 接:「我也找到了上海的监管…监管同意他们全国展业」。' },
  ],
  focusMap: [
    { who: 'p1', themes: ['白名单流程', '大数据收入 vs 客户经理填报', '总行预算 vs 项目预算', '物料合规边界', '风控: 行为风险 vs 信用风险', '同金额跨城市门槛'],            returnsTo: 8  },
    { who: 'p2', themes: ['客户分群 (贝壳/c端公寓/二房东资管)', '装修包单项调价吸收利息', '免息体感', '中断还款机制', '设计师/业务员激励', '客群扩张 (经营贷/养老)'],       returnsTo: 12 },
    { who: 'p3', themes: ['权益 > 利率', '"卖产品"框架', '风险信号反向逻辑', '民企派单管理范式', '现金流账本', '场景嵌入 (养老/资管/扩展)'],                                returnsTo: 7  },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '装修贷款先做白名单试点 5~6 人, 数据回流后再调总行政策',                supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C2', kind: 'consensus',  text: '贷款利息以 2~3 个点形式嵌入装修包单项报价, 不直接收客户利息',          supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C3', kind: 'consensus',  text: '物料弱化银行品牌, 突出"免息 + 权益 + 保险"整包体感',                  supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C4', kind: 'consensus',  text: '营销奖品走总行专项预算 (100 元苏宁豆基础 + 项目专项大奖), 不挤占贷款利率', supportedBy: ['p1','p2'],      sides: [] },
    { id: 'C5', kind: 'consensus',  text: '中断还款支持 (36 月→可延 38 月) 作为差异化卖点, 次数尽量不限',          supportedBy: ['p2','p3'],      sides: [] },
    { id: 'C6', kind: 'consensus',  text: '范围限定家装个人客户, 不给装修公司本身/二房东资管放贷',                  supportedBy: ['p1','p3'],      sides: [] },
    { id: 'C7', kind: 'consensus',  text: '"产品 / 流程 / 定价 / 营销" 四件套要做成可复制模板, 不一城一议',          supportedBy: ['p1','p2','p3'], sides: [] },
    { id: 'C8', kind: 'consensus',  text: '业务员激励/培训是隐性瓶颈 — 不是产品本身的问题, "销售员愿不愿意去"才是关键', supportedBy: ['p2','p3'],      sides: [] },

    { id: 'D1', kind: 'divergence', text: '是否给装修公司本身/二房东资管放贷?', supportedBy: [], sides: [
      { stance: '可以试一试', reason: '需求大, 类似烟商贷思路可借鉴, 装修商户也可以尝试',                                       by: ['p2'] },
      { stance: '不建议',     reason: '他们信用是有问题的; 风控逻辑不一样; 挣钱的人不挣了反而是反向信号',                       by: ['p1','p3'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '客户感知: 完全免息 vs 合规体感不能消除', supportedBy: [], sides: [
      { stance: '完全免息', reason: '客户感受像车贷, 利息直接打到装修包, 体感越弱越好',                                       by: ['p2'] },
      { stance: '合规边界', reason: '签合同那一刻体感无法消除; 业务员培训压力大, "哪些能说"必须先讲清',                        by: ['p1'] },
      { stance: '折中包装', reason: '不模糊法律边界, 但用"产品包装" + 保险 + 权益 让贷款属性沉淀到背景',                        by: ['p3'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '中断还款次数: 不限 vs 限次', supportedBy: [], sides: [
      { stance: '不限/少限', reason: '场景随机 (开工首月 + 退租重找), 限次破坏卖点; 风险有限, 第三方(贝壳)有签证兜底',          by: ['p2','p3'] },
      { stance: '一年一次', reason: '风控视角默认偏紧, 怕滥用',                                                                 by: ['p1'] },
    ]},
    { id: 'D4', kind: 'divergence', text: '同金额贷款的城市间收入门槛逻辑 (悬而未决)', supportedBy: [], sides: [
      { stance: '逻辑失效', reason: '北京 1 万根本不算高收入, 但和宿迁 1 万一样批 20 万 — 客户经理都接受不了',                  by: ['p1'] },
      { stance: '等级机制', reason: '只看额度等级, 不看城市生活成本, 这是政策',                                                 by: ['p2'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p3',
      claim: '客户的痛点不是价格, 是"中间断租还不上怎么办" — 业主有钱不在乎贵 200 块, 4.5% 和 3% 没区别; 真跟我聊便宜你就没那么大量, 不如把权益做好。',
      responses: [
        { who: 'p2', stance: 'support', text: '完全接收 — 当场把它转化为产品逻辑: "卖一个免息分期付的产品, 这样的话体感跟联系买车分期一样"。' },
        { who: 'p1', stance: 'partial', text: '同意权益思路, 但仍把"一年一次/几次"的限次思维带进来, 没完全切换到"产品而非贷款"的范式。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p2',
      claim: '把贷款利息以 2~3 个点形式加到装修包单项报价里, 客户体感是"完全免息"; 业主砍价时只砍方案/单项, 不动我利润 — 影响不到金融服务的附加金额。',
      responses: [
        { who: 'p1', stance: 'partial', text: '原则同意, 但反复强调"业务员培训压力大", 担心"哪些能说哪些不能说"边界推不下去。' },
        { who: 'p3', stance: 'support', text: '"体感越弱越好, 但合规底线不能模糊" — 给出折中而非反对。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p1',
      claim: '我不建议给装修公司贷款 — 看的还是个人征信、可持续性、还款路径, 不是装修公司业务火不火热; 二房东/资管的"行为风险"识别不出来。',
      responses: [
        { who: 'p3', stance: 'support', text: '从风控视角补强: "这些人本来挣钱不挣了, 意味着这是一个反向信号"。' },
        { who: 'p2', stance: 'partial', text: '没完全放弃 — 后续仍提"装修商户也可以尝试", 但语气从主张降为试探。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p3',
      claim: '民企 1 号都在用滴滴派单替换中层管理, AI 让管理边界从 10 个人放大; 银行风控也在被"机器人"替代 — 我们机器人只会从坏的时候从尾往后看, 比人类更快更广。',
      responses: [
        { who: 'p2', stance: 'support', text: '"我们公司也在研究给员工做派单" — 直接落到自己业务上。' },
        { who: 'p1', stance: 'partial', text: '用银行扁平化亲身经历回应, 既认同又透出抗拒: "中级岗位一弄出来一下全没了, 你后面自己就走了"。' },
      ],
    },
    {
      id: 'V5', claimBy: 'p1',
      claim: '北京月入 1 万 vs 宿迁月入 1 万, 同档批 20 万贷款 — 这逻辑客户经理都接受不了。',
      responses: [
        { who: 'p2', stance: 'partial', text: '只接了半句"等级划分那个概念", 没正面回应跨城市生活成本差异。' },
        { who: 'p3', stance: 'neutral', text: '没接话 — 此时已经在车上闲聊房价了, 这条张力被环境淹没。' },
      ],
    },
    {
      id: 'V6', claimBy: 'p3',
      claim: '资金成本和价格不是核心 — 核心是把"贷款"包装成"产品": 免息分期 + 中断还款保障 + 保险 + 权益, 让客户感觉像买车分期一样。',
      responses: [
        { who: 'p2', stance: 'support', text: '"是卖一个产品, 这个产品的一些叫免息分期付" — 直接复述吸收, 是本场最大认知交付点。' },
        { who: 'p1', stance: 'support', text: '同意整包思路, 主动接"100 元苏宁豆 + 大奖 + 体验权益"作为产品组件。' },
      ],
    },
  ],
};

const DELIVERABLES = [
  { id: 'D-1', label: '白名单 5~6 人',           desc: '李杰对接, 大数据反查收入与客户经理填报双源校验, 通过即加入',          owner: 'p1', status: 'AGREED'  },
  { id: 'D-2', label: '单项调价 2~3 个点',       desc: '把 3 年分期利息按 2~3 个点系统性加到装修包所有单项, 砍价不动利润',     owner: 'p2', status: 'AGREED'  },
  { id: 'D-3', label: '电子化业主物料',          desc: '设计师对客时呈现, 弱化银行品牌, 突出"免息 + 权益 + 保险" 整包',         owner: 'p2', status: 'AGREED'  },
  { id: 'D-4', label: '基础权益 + 项目大奖',     desc: '100 元苏宁豆兑换 (手机银行商城) + 项目专项大奖, 走总行专项预算',         owner: 'p1', status: 'AGREED'  },
  { id: 'D-5', label: '中断还款条款',            desc: '36 月可延至 38 月; 次数倾向不限或少限; 续谈敲定',                       owner: 'p2', status: 'PENDING' },
  { id: 'D-6', label: '三类配套保险',            desc: '①家财险(自然灾害) ②建筑质量险(交付3年) ③建筑期一切险, 嵌入产品',       owner: 'p2', status: 'PENDING' },
  { id: 'D-7', label: '资产服务机构(B端)接入',   desc: '二房东/资管类客户的金融服务边界 — 当前共识为"不放贷", 但 IDEA 待澄清',  owner: 'p3', status: 'IDEA'    },
  { id: 'D-8', label: '老人养老 + 房产代管',     desc: '私行业务路径 (上海信托/工行养老对标), 30 万门槛过高, 探政府监管谈判',   owner: 'p3', status: 'IDEA'    },
  { id: 'D-9', label: '可复制产品模板',          desc: '"产品/流程/定价/营销" 四件套, 试点跑通后输出',                          owner: '*',  status: 'IDEA'    },
];

const META_INFO = {
  asrQuality: 'low — 数字/专有名词错位严重',
  signalDensity: '中前段较密 (0:00-0:20 + 1:14-1:30 + 2:00-2:40 业务议题集中); 中后段稀疏',
  refToOtherCase: '与 sh-ai-kickoff-2026-03-31 在 T5 / N6 处隔空呼应',
  offTopicSegments: [
    { range: '00:39 ~ 00:50', topic: '北京贝壳份额变迁 70% → 20%, 装修业务规模发展史' },
    { range: '01:01 ~ 01:13', topic: '潮汕/汕头美食 + 投行实习 + 京东方履历 + 国企vs私企' },
    { range: '01:23 ~ 01:30', topic: '银行扁平化裁员吐槽 + 上海银行/上海信托 全国展业政策' },
    { range: '01:55 ~ 02:01', topic: '私募/软件行业/美国 SARS + 一二线房价对比 + 县城躺平' },
    { range: '02:38 ~ 02:46', topic: '北京房价何时见底 (贝壳首席27年说) + 一手二手选择' },
    { range: '03:15 ~ 03:42', topic: '车上送客 + 找酒店 + 第二天行程安排' },
  ],
};

// ── 抽 docx 文本 ──
const { value: rawText } = await mammoth.extractRawText({ path: DOCX_PATH });
const transcriptText = (rawText ?? '').trim();
console.log(`[seed] docx → ${transcriptText.length} chars (${transcriptText.split('\n').length} lines)`);

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'business_negotiation',
  duration_min: 222.08,
  duration_label: '3 小时 42 分 05 秒',
  room: '北京 (经济街/二龙路一带, 国贸→西单线索), 多场景串场',
  source_note: '腾讯/类似 ASR 自动转写 (噪声重, 末尾自标注 "AI 生成仅供参考")',
  source_filename: '探讨装修贷款与分期付款的定价策略_2026年04月27日11时18分07秒(1).docx',
  off_topic_pct: 0.37,
  tokens_estimate: 38000,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  deliverables: DELIVERABLES,
  meta: META_INFO,
};

// ── 写库 ──
const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 用 INSERT 而非 UPSERT — 这是新建会议
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
            jsonb_array_length(COALESCE((metadata->'deliverables'), '[]'::jsonb))             AS n_deliverables
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
