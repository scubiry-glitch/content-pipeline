// Seed · 贝壳 × 宁波银行 · 美租信托资金端对接会 — 新建会议
// 分析参考: /Users/scubiry/Downloads/beike-ningbo-bank-meizu__analysis.ts
// 转写源:   /Users/scubiry/Downloads/新录音 (1).txt
//
// 用法: node scripts/seed-meeting-beike-ningbo-bank.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

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

const NEW_MEETING_ID = randomUUID();

const TITLE = '贝壳 × 宁波银行 · 美租信托资金端对接会';
const OCCURRED_AT = '2026-04-29T09:31:00+08:00';

const TRANSCRIPT = readFileSync('/Users/scubiry/Downloads/新录音 (1).txt', 'utf8').replace(/\r\n/g, '\n').trim();

const PARTICIPANTS = [
  { id: 'p1', name: '宁波银行介绍人', role: '宁波银行 · 介绍 / 主持 (说话人 1, 女)',                  initials: '宁介', tone: 'neutral', speakingPct: 7  },
  { id: 'p2', name: '徐行长',         role: '宁波银行 · 核心决策者 (说话人 2, 徐总, 男)',              initials: '徐',   tone: 'warm',    speakingPct: 18 },
  { id: 'p3', name: '赵总',           role: '贝壳 · 战略/资产方主谈 (说话人 3)',                       initials: '赵',   tone: 'cool',    speakingPct: 30 },
  { id: 'p4', name: '宁波银行厂长',   role: '宁波银行 · 资深 ABS / 证券化负责人 (说话人 4, 女)',       initials: '厂',   tone: 'cool',    speakingPct: 3  },
  { id: 'p5', name: '苏总',           role: '贝壳 · 北京美租负责人 (说话人 5)',                        initials: '苏',   tone: 'neutral', speakingPct: 4  },
  { id: 'p6', name: '肖华(陈总)',     role: '贝壳 · 产品/风控解释员 (说话人 6)',                       initials: '肖',   tone: 'neutral', speakingPct: 26 },
  { id: 'p7', name: '宁波银行业务',   role: '宁波银行 · 业务执行 (说话人 7, 女)',                      initials: '宁业', tone: 'neutral', speakingPct: 4  },
  { id: 'p8', name: '杨总',           role: '久阳资管 · 劣后级出资方 / 产品架构 (说话人 8, 贝阳)',     initials: '杨',   tone: 'cool',    speakingPct: 8  },
];

const ANALYSIS = {
  summary: {
    decision:
      '本场是首次实质对接, 不当场拍板, 但完成了三件关键事: ' +
      '①贝壳侧把"省心租 80 万套主体 + 美租掐尖资产"的商业模式 + 信托结构(承接池 / 放款池 / 优先 75% 苏银 + 劣后 25% 久阳)讲透; ' +
      '②宁波银行徐行长当场点出了真正的拦路虎 — 宁波监管局口头指导"谨慎与互联网平台合作", 但同时定性"贝壳跟其他平台不一样, 是重平台, 几十万线下队伍"; ' +
      '③双方达成战略级方向共识 — 不只做美租信托资金, 还要往财富管理/私行/不动产信托/不良资产处置 多线协同, 类似苏银今天的覆盖广度. ' +
      '具体动作: 宁波银行回去推方案; 贝壳重申"今年能合作的银行就 3 家(已有苏银/北银 + 1)", 把宁波银行作为第三家候选锚定; ' +
      '私行代销 / 平层资金 / 放款池资金 都是后续探索方向.',
    actionItems: [
      { id: 'A1', who: 'p2',     what: '回总行讨论方案, 重点处理"宁波监管局口头指导谨慎与互联网平台合作"的合规口径, 把"贝壳是重平台不是普通平台"做实成内部说法', due: '近期(本周内)' },
      { id: 'A2', who: 'p3',     what: '会后给宁波银行发完整 PPT 与方案材料 (徐行明确说"明天有时间可以看一下")',                                                          due: '会后即刻' },
      { id: 'A3', who: 'p3',     what: '推进将宁波银行锁定为今年 3 家合作行之一 (与苏银/北银并列), 不再主动找新行 — 资产生成速度有限',                                  due: '中期' },
      { id: 'A4', who: 'p3+p2',  what: '推进"战略协议"的协议文本细节, 包括财富代销 / 私行 / 不动产信托 / 不良资产 多线协同, 不局限于美租信托资金',                       due: '与 A1 并行' },
      { id: 'A5', who: 'p6',     what: '节后赴宁波, 与北仑/还是处对接政府以旧换新房源(集中式 + 分散式混合)的托管 + 装修模式',                                            due: '五一节后' },
      { id: 'A6', who: 'p8',     what: '把放款池现行的"单一委托人结构"改造成"集合信托"结构, 引入更多理财方平层 / 劣后投资',                                              due: '后半年' },
      { id: 'A7', who: 'p3',     what: '推进 APEC 平行论坛(副国级)的"租赁好房子"议题 + 清华五道口白皮书 + 房协行业标准立项 + 集中式项目, 即"四个一"对外动作',           due: '今年内' },
      { id: 'A8', who: 'p1+p3',  what: '宁波银行 toB/toC 数字化产品(财资大管家/美好生活等)与贝壳集团的赋能合作探索',                                                  due: '战略协议中' },
    ],
    risks: [
      'R1 · 监管口风风险 — 宁波监管局已口头指导"谨慎与互联网平台合作", 是徐行最后才点出的真正拦路虎, 必须在内部把"贝壳不是普通平台"的定性做实',
      'R2 · 收入口径问题 — 贝壳省心租表面收入 200-300 亿但财报口径是亏的, 这是"中后台甩给经纪体系"的成本分摊方式; p3 自陈"反垄断箭一直插着, 我们坐立难安, 要把全额法改净额法"',
      'R3 · 集中度风险 — 一个亿规模、1000 多套底层、第一期发行 2025 年 9 月, 仅经过 7 个月 / 2 个还款周期, 历史数据被 p3 主动加压"按 10 倍违约率算还好"; 但绝对运行时间偏短',
      'R4 · 名义零违约的真实性 — p6 自承:「同行问真不真实, 苏银也问过, 感觉听上去不太像」, 给出的解释是"违约成本高 + 优质客户天然不违约"; 但需经过完整周期验证',
      'R5 · 平台模式 vs 直营模式的法律穿透 — 装修协议是房东直接和装修公司签两方协议, 贝壳只做平台管理; 监管真要穿透, 责任分摊会有挑战',
      'R6 · "省心租 vs 美租"管理费定位差异 — 省心租公募逻辑长期亏钱, 美租是私募掐尖; 表面 10%+10% 共 20%, 实质成本被拆出, 客户感知与监管识别不一致',
      'R7 · 业务规模上限 vs 资金端供给 — 贝壳长期目标每年 2000 亿装修美租量, 短期目标 50 亿/年, 需要稳定资金方支撑; 但 p3 自陈"搞快了有很多别的问题, 维护不掉也不好改"',
      'R8 · 政府国企房源 (以旧换新 / 工抵房) 的真实运营难度 — p4 直接点出:「这量很大, 但有问题就是他知道房东是政府, 有的人就不付钱了」, 政府背书反而带来逆向选择风险',
      'R9 · 长三角私行客户对"金融工具不熟悉"的认知壁垒 — p3 提苏州合作伙伴打 3 折 10 年租金 IRR 12%, 业主能接受; 但宁波银行客群与产品的契合度还需验证',
      'R10 · 苏银理财非标流程的拖累示范 — 现承接池 75% 优先级走苏银, 但要过北分尽调, "总行希望直接做, 北分老拖后腿"; 宁波银行进场后会面临同类流程问题',
      'R11 · 数据真实性核验 — p3 / p8 都强调"贝壳信息化体系 + 抽样穿行测试"是核验方式, 但需宁波银行自己做实尽调, 不能完全信赖贝壳字段',
      'R12 · 业务可持续性的"伦理选择" — p3 主动表态"不做小贷不挣金融差价、不做滴滴司机式刺激客群"; 这是主动收窄的边界, 但意味着规模天花板会比纯金融机构更低',
    ],
  },
  tension: [
    {
      id: 'T1', between: ['p2', 'p3'], intensity: 0.40,
      topic: '监管口径: 互联网平台 vs 重平台',
      summary:
        '末段(01:25:00 附近)徐行长才点出本场最关键的隐藏约束: ' +
        '「宁波监管局给了我们一个口头的指导, 让我们谨慎的和平台、互联网平台合作」. ' +
        '同时自己给出解药:「我们觉得贝壳可能跟其他平台不一样..你是相当于很重的平台, 有几十万人的线下队伍」. ' +
        'p3 / p8 全场已经有意无意为这个定性做了铺垫: ' +
        '"我们不做小贷"、"贝壳不亲自下场是金融机构的附庸而非附庸"、"商业伦理决定我们不挣金融差价"、"贝壳是把金融机构当资金批发商的角色"等. ' +
        '这是双方共谋达成的"叙事对齐", 不是对立性张力, 但揭示了贝壳整场对话的核心战略定位 — 主动反复"自证不是普通互联网平台".',
      moments: [
        'p2: 「宁波监管局给了我们一个口头的指导, 让我们谨慎的和平台、互联网平台合作」',
        'p2: 「我们觉得贝壳可能跟其他平台不一样..你是相当于很重的平台, 有几十万人的线下队伍, 完全是不一样」',
        'p3: 「贝壳搞小贷是个很简单的事情, 我们不这么做有好几个原因」',
        'p3: 「站在贝壳的角度如果我们再挣太多金融的钱, 我们的体量会过大, 我们我们 12 万亿之前可能就掉了」',
        'p8: 「任何一家其他互联网巨头是亲自下场亲自干的, 所有金融机构是它的附庸..贝壳有一点价值观伦理观的区别点」',
      ],
    },
    {
      id: 'T2', between: ['p2', 'p3'], intensity: 0.35,
      topic: '管理费 10%+10% 的合理性 vs 实际成本结构',
      summary:
        '中段(17:00 附近)徐行长直接质问:「就相当于 20%, 每个月租金的 20% 收益」, 语气带有"这不少了"的疑问; ' +
        '后段又算大账:「50 万套, 平均 1 万一套, 3000 多亿..10% 那 700 多亿..这收益不得了」, 直接把账本摊出来. ' +
        'p3 / p6 / p8 三人接力解释: ①国外 35% 都不包维修保洁, 中国是大包大揽; ②净利率 5% 以下, 财报亏的; ' +
        '③"中国人对价格敏感对价值不敏感, 像美团把配送费拆出来"; ④为什么坐立难安要把全额法改净额法. ' +
        'p2 没有当场表态认同与否, 只是把问题摆出来. 这是一条"账本被摊开后的尴尬时刻", 双方都清楚这个数字在反垄断/合规层面是敏感的.',
      moments: [
        'p2: 「这是一个点, 第二个点那个赵总, 就是你这个管理费的这个标准是多少?」',
        'p2: 「就相当于 20%, 对, 每个月租金的 20%, 这个收益」',
        'p2: 「3000 多亿, 10%, 700 多, 我天呐, 这收益不得了」',
        'p2: 「300 多亿的营收啊」',
        'p3: 「您感受到他的收益蛮好, 但实际上从租客的感觉..他自己可以付一个月的租金, 但是他跟省心租合作可能每个月只付百十」',
        'p3: 「我们一直也是坐立难安..赶紧把收入还原成分项成本就得了, 别过我们..反垄断的什么东西永远是一根箭在那插着」',
      ],
    },
    {
      id: 'T3', between: ['p7', 'p3'], intensity: 0.25,
      topic: '装修公司是体系内还是体系外',
      summary:
        '一条快速消解的对话张力, 但揭示了贝壳模式的核心选择. ' +
        'p7 直接问:「平台上的这些美租资产, 装修公司是会是贝壳体系内的公司吗? 还是完全就是我纯体系外的?」 ' +
        'p3 直接答:「它是贝壳白名单的公司, 没有关系, 是市场化的」. ' +
        '徐行长接力追问:「为什么圣都(贝壳旗下整装品牌)都不做?」 ' +
        'p3 给出了一长段商业逻辑解释: 圣都是 toC 个性化产品, 一上来 40% 营销成本就上去了, 美租是 toB 标准化, 一个监理看 200 个工地, 圣都监理只看 50 个; "装修是负反馈很多的行业, 没必要亲自下场". ' +
        '这条张力的本质是"为什么贝壳要把核心施工环节甩给体系外", 答案揭示了贝壳的平台底层哲学.',
      moments: [
        'p7: 「平台上的这些美租资产, 它会是贝壳体系内的公司吗? 还是完全就是我纯体系外的?」',
        'p3: 「它是贝壳白名单的公司, 没有关系, 是市场化的」',
        'p2: 「那你这个我在总, 为什么圣都都不做?」',
        'p3: 「圣都它是个 toC 产品, 一做就 40% 的成本就上去了, 营销成本」',
        'p3: 「装修是负反馈很多的行业, 没必要亲自下场..出了问题我干掉」',
        'p6: 「站在租金的客户, 他从 ROI 角度算账, 不需要慕思床垫, 他无所谓」',
      ],
    },
    {
      id: 'T4', between: ['p2', 'p6'], intensity: 0.30,
      topic: '"零违约"数据真实性',
      summary:
        '中段(53:00 附近)徐行长不断逐个追问"第一期发的过了多久了 / 实际经历了几个还款周期 / 有没有出现租金问题"; ' +
        'p3 / p6 给出的具体数字是: 第一期 2025/9/12 发, 但底层资产形成时间最早到 2024 年, 实际经过 15 个月 / 5 个还款周期, 1000 多套零违约. ' +
        'p6 主动揭过同行质疑:「也有很多同行问真不真实, 包括苏银当时也问过我们这个问题, 感觉听上去不太像」, ' +
        '然后给出解释:「这个房子违约成本对房东没有必要性, 没有违约欲望」; ' +
        'p8 补强:「我们更积极主动嵌入到更前端, 看的是底层资产服务报告, 不是兑付报告」. ' +
        '这条张力是"资金方对零违约的天然怀疑 vs 资产方提前给出的反质疑解释", 没有立刻解决, 留待宁波银行做自己的尽调.',
      moments: [
        'p2: 「第一期发的过了多久了?」',
        'p3: 「我们第一期是在 2025 年的 9 月 12 号..然后 7 个月..两个还款周期是吧」',
        'p3: 「虽然这个发行是 9 月份, 但是这笔资产的形成时间是可能最早都到 2024 年」',
        'p6: 「真不真实, 就是感觉听上去不太像是这样一个状况, 我们也回头复盘了这个场景」',
        'p6: 「其实就是因为本身这个房子它的违约成本对于这个房东来说没有太大的必要性」',
        'p8: 「我们更积极主动地嵌入到更前端, 看的是底层资产服务报告, 不是看兑付报告」',
      ],
    },
    {
      id: 'T5', between: ['p6', 'p3'], intensity: 0.20,
      topic: '"招租对赌"承诺方向: 一直加 vs 不停减',
      summary:
        '一条贝壳内部的小调整, 但被双方在场捕捉到了. ' +
        'p6 详细介绍承接池下面的"招租对赌": 第二个月开始如果没租出去, 贝壳承诺 30 天租出去, 如果没租出去贝壳付一半租金给房东; ' +
        'p3 立刻在 58:42 插话:「我们这个承诺在不停往下减哈, 就没有往上增..比例可能 30% 而不是 50%, 周期也可能不是一直垫」. ' +
        '本质是 p3 担心 p6 把承诺讲得太满, 给宁波银行一个"贝壳兜底很厚"的错误印象, 影响后续真质保金/质保金/风险准备金的层次设计. ' +
        'p3 接力补充:「不影响, 因为综合来看你还有别的安全垫 — 供应商质保金 + 风险准备金」, 把多层安全垫的真实结构讲清楚.',
      moments: [
        'p6: 「贝壳会和房东对赌, 我在 30 天之内把你这个房子给租出去, 如果他会以一半的租金作为对赌的金额」',
        'p3 (插话): 「我们这个承诺在不停往下减哈, 就没有往上增..比例可能不是 50, 可能 30」',
        'p3: 「其次周期也可能也不是一直垫, 也可能就只有第一个月, 但是没关系」',
        'p3: 「招租失败的几种可能原因..有专门的供应商质保金, 从百分之质保金里去解决这个问题」',
      ],
    },
  ],
  newCognition: [
    { id: 'N1', who: 'p2',
      before: '互联网平台合作要按宁波监管局口头指导谨慎处理',
      after:  '贝壳不是普通互联网平台, 是"重平台 + 几十万线下队伍", 可以作为豁免的特例进行内部说服',
      trigger: 'p3 全场反复铺垫"我们不做小贷 + 不挣金融差价 + 不亲自下场" + p8 给出"贝壳价值观伦理观区别点"的论证' },
    { id: 'N2', who: 'p2',
      before: '美租是个分期装修业务, 关注的是装修款回收',
      after:  '美租是省心租大资产池里的"掐尖" — 高地段老房 + 家庭长租客群 + 房东已有房产 (财富客户), 风控本质是"好人 + 好房 + 好现金流"',
      trigger: 'p8 多角度论证:「先定位人群再定价, 这跟当年宁波白领通的扫楼逻辑一致」+ p5 北京内城地段锁死优质客群的物理论证' },
    { id: 'N3', who: 'p2',
      before: '装修公司是贝壳体系内会更可控',
      after:  '体系外 + 白名单 + 3% 质保金 + 6-9 个月垫资能力 = 比体系内更有效, 因为亲自下场会被绑死成本和负反馈',
      trigger: 'p3 用圣都/抖音电商/达人逻辑做类比, p6 补充"租金客户从 ROI 角度算账, 不需要品牌"' },
    { id: 'N4', who: 'p2',
      before: '管理费 20% 看着挺多, 收入应该可观',
      after:  '财报口径是亏的(中后台成本甩到经纪体系), 净利率 < 5%; 同时正在把全额法改净额法应对反垄断关注',
      trigger: 'p3 / p6 / p8 三人接力解释:「您说的反垄断箭一直插着, 我们坐立难安」' },
    { id: 'N5', who: 'p2',
      before: '资金合作 = 美租信托优先级承接',
      after:  '战略协议要包括财富代销 / 私行 / 不动产信托 / 不良资产处置 / 数字化产品互联 等多线 — 学苏银的覆盖广度',
      trigger: 'p3 末段战略宣告:「这是启动集团向未来的一个重要的钥匙, 董事长讲我们要往贝莱德方向走」' },
    { id: 'N6', who: 'p3',
      before: '宁波银行作为新行接触, 节奏可以推',
      after:  '今年能合作的城商行就 3 家(苏银/北银/宁波), 不能当渣男 — 资产生成速度有限, 不需要更多',
      trigger: 'p2 末段表达"早日把战略协议推一推"的诚意 + p3 现场算账"撑死三家就差不多"' },
    { id: 'N7', who: 'p2',
      before: '政府国企房源(以旧换新/工抵房)是块大蛋糕, 自己可以接',
      after:  '量大但难做 — "他知道房东是政府, 有的人就不付钱了"; 必须由贝壳这种市场化主体去市场化定价 + 真伺候租客',
      trigger: 'p4 (厂长)第一句长发言之前的短问:「但我觉得这量很大, 有个问题就是他知道房东是政府, 有的人就不付钱了」 + p3 用申山赵董事长亲历回应' },
    { id: 'N8', who: 'p3 / p8',
      before: '苏银 75% 优先级 + 久阳 25% 劣后是当前结构, 已经稳定',
      after:  '现已有 2 家其他理财子在询价"承接池劣后 / 平层", 表明结构本身可以让资金方往下渗透 — 宁波银行也可以选择不只是优先级',
      trigger: 'p6 自己揭过:「现在已经有两家理财子在跟我们探讨, 甚至有一家说能不能投承接池劣后或者平层」, 给宁波银行多档参与选项' },
  ],
  focusMap: [
    { who: 'p1', themes: ['宁波银行 12 利润中心 PPT 介绍', '永盈基金/金租/理财/消金子公司亮点', 'toB/toC 数字化产品赋能', '北京客群画像追问'],                returnsTo: 4 },
    { who: 'p2', themes: ['管理费收益结构追问', '风控细节(违约/招租)追问', '苏银现行操作细节', '监管口径/平台合作合规', '战略协议推进', '集中式房源量级'], returnsTo: 12 },
    { who: 'p3', themes: ['多元化业务结构', '行业标准/APEC/白皮书 四个一', '不做小贷的伦理选择', '50 亿/年 → 2000 亿/年 长期规划', '战略合作钥匙', '不挣金融差价'], returnsTo: 14 },
    { who: 'p4', themes: ['宁波银行 ABS 经验 (白领通)', '政府房源逆向选择风险'],                                                                            returnsTo: 2  },
    { who: 'p5', themes: ['北京内城老房地段锁死客群', '托装一体化产品 5/21 上线'],                                                                           returnsTo: 2  },
    { who: 'p6', themes: ['平台模式两方协议结构', '质保金 3% / 6-9 个月垫资', '租客逾期 vs 房东逾期定义', '招租对赌机制', '放款池 vs 承接池关系', '上海信托不动产信托'], returnsTo: 13 },
    { who: 'p7', themes: ['美租 vs 省心租具体套数', '放款池规模追问', '装修公司体系内外', '主笔审核谁做'],                                                  returnsTo: 5  },
    { who: 'p8', themes: ['好人群定义(财富客户)', '场景风控 vs 信用风控', 'ABS 标品化路径', '资金来源多样化重要性'],                                       returnsTo: 6  },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '贝壳与普通互联网平台的本质区别 — "重平台 + 线下队伍"足以构成与"亲自下场"金融科技公司的差异定性', supportedBy: ['p2','p3','p8'],          sides: [] },
    { id: 'C2', kind: 'consensus',  text: '美租信托底层风控核心是"好人(房东多套房) + 好房(内城地段锁死) + 好现金流(租金代扣过手摊还)"',     supportedBy: ['p2','p3','p6','p8'],     sides: [] },
    { id: 'C3', kind: 'consensus',  text: '装修公司走"体系外 + 白名单 + 质保金"模式比贝壳亲自下场更优 — 类比抖音电商达人 vs 平台',           supportedBy: ['p2','p3','p6'],          sides: [] },
    { id: 'C4', kind: 'consensus',  text: '"招租对赌"等承诺机制处于"不停往下减"的趋势 — 用多层质保金 + 风险准备金替代单一兜底',              supportedBy: ['p3','p6'],                sides: [] },
    { id: 'C5', kind: 'consensus',  text: '战略合作不局限于美租信托资金, 涵盖财富代销 / 私行 / 不动产信托 / 不良资产处置 / 数字化产品互联',  supportedBy: ['p1','p2','p3','p6'],     sides: [] },
    { id: 'C6', kind: 'consensus',  text: '今年能合作的城商行就 3 家(苏银/北银 + 1), 宁波银行作为第三家候选锚定; 不当渣男',                  supportedBy: ['p2','p3'],                sides: [] },
    { id: 'C7', kind: 'consensus',  text: '政府国企房源(以旧换新/工抵房)是大场景但有"政府背书逆向选择"风险, 必须市场化主体接管',             supportedBy: ['p3','p4','p6'],          sides: [] },
    { id: 'C8', kind: 'consensus',  text: '资金来源多样化是业务持续性第一位 — 宁波银行可参与的不只优先级, 还有平层 / 放款池 / 私行代销',     supportedBy: ['p3','p6','p8'],          sides: [] },
    { id: 'C9', kind: 'consensus',  text: '会后流程: 贝壳发完整材料 → 宁波银行内部讨论方案 → 双方再约方案细节会面 → 战略协议推进',          supportedBy: ['p2','p3','p4'],          sides: [] },

    { id: 'D1', kind: 'divergence', text: '宁波银行参与档位选择', supportedBy: [], sides: [
      { stance: '只投承接池优先级', reason: '类比苏银当前模式, 风险最低, 类似国债级信用风险', by: ['p2 (默认起点)'] },
      { stance: '可考虑平层 / 劣后', reason: '已有两家理财子在询价, 资产足够安全, 收益可向下要', by: ['p3','p6','p8'] },
      { stance: '放款池(过桥)',     reason: '是另一个独立池子, 宁波银行可分两条腿走', by: ['p3','p7'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '苏银理财非标走总行 vs 走北分尽调', supportedBy: [], sides: [
      { stance: '总行直接做',  reason: '苏银星总希望直接, 因北分尽调老拖后腿', by: ['p3'] },
      { stance: '走北分流程', reason: '现行框架, 因为最早是北分接触, 流程惯性', by: ['p2 (问到时无明确表态)'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '业务发展速度: 50 亿/年 vs 长期 2000 亿/年', supportedBy: [], sides: [
      { stance: '稳定 50 亿/年', reason: '搞快了维护不掉也不好改, 资产端要做上下游真实风控', by: ['p3'] },
      { stance: '理论 2000 亿', reason: '核心城市核心商圈 20 年以上房 × 5 年装修周期 × 渗透率 = 长期空间', by: ['p3 (长期规划)'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p3',
      claim:
        '贝壳的商业模式是"做一个超级大的贝塔, 几十万亿人民币 AUM, 收非常薄的管理费" — ' +
        '类似贝莱德, 不挣阿尔法; 资产波动不影响经营; 不挣金融差价 ' +
        '(否则我们 12 万亿之前就被监管掉了)。',
      responses: [
        { who: 'p2', stance: 'support', text: '完整接受这个叙事, 末段直接转化为"贝壳跟其他平台不一样"的合规说服基础。' },
        { who: 'p8', stance: 'support', text: '从资金方角度补强:「贝壳不亲自下场, 金融机构不是它的附庸」 — 把这个伦理叙事打透。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p8',
      claim:
        '消费信贷业务核心是"先定位人群, 再定位定价和风险" — 当年宁波白领通扫楼写字楼是范例; ' +
        '美租客群天然是"好人群"(有 2+ 套房 + 不着急处置), 但好人群天生借贷意愿弱, ' +
        '所以美租的巧妙在于"把有息借贷转化成无息应收账款保理关系", 让客户感知不是欠债。',
      responses: [
        { who: 'p2', stance: 'support', text: '完全接受 — 自己当年正是白领通的产品方, 一句话就听懂了「我们大名当年的白领通是绝对打爆了打透了这个市场的」。' },
        { who: 'p4', stance: 'support', text: '末段补充:「我们行资产证券化比较早, 白领通也是当时在主导, 整套程序比较完整」, 表态是这个逻辑的内行。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p3',
      claim:
        '宁波监管局的"谨慎与互联网平台合作"指导对贝壳不应适用 — ' +
        '我们不做小贷, 不挣金融差价, 不亲自下场, 是把金融机构当合作伙伴而非资金批发商; ' +
        '体量管理上也是主动收窄(否则 12 万亿之前就掉了)。',
      responses: [
        { who: 'p2', stance: 'support', text: '本场最关键的接受 — 末段直接说出「我们觉得贝壳可能跟其他平台不一样, 真不一样」, 把内部说服路径打开。' },
        { who: 'p8', stance: 'support', text: '从外部投资人角度补强:「这是个有价值观伦理观的区别点, 是这个生态当中的核心价值」。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p6',
      claim:
        '租客逾期 ≠ 房东逾期 — 租客逾期 30 天贝壳全额垫付 + 60 天恢复在租状态; ' +
        '房东逾期(解约/经营不能)由放款池受让置换, 由质保金 + 风险准备金 + 法律诉讼分层兜底; ' +
        '到目前 80 万套千亿级租金规模, 房东累计违约只有千万级数字。',
      responses: [
        { who: 'p2', stance: 'partial', text: '逐项追问"两周完成吗"、"画像怎么样", 接受了细节但保留对"零违约真实性"的怀疑, 留待自己尽调。' },
        { who: 'p3', stance: 'support', text: '补强多层安全垫的真实结构, 提示"承诺往下减不增"避免给资金方虚假信心。' },
        { who: 'p8', stance: 'support', text: '提示资金方:「我们更积极主动嵌入前端, 看的是底层资产服务报告, 不是兑付报告」, 数据透明性背书。' },
      ],
    },
    {
      id: 'V5', claimBy: 'p2',
      claim:
        '管理费 20%(房东 10% + 租客 10%) × 50 万套/年 × 1 万平均月租 = 700 多亿收益; ' +
        '账面上看"这收益不得了, 300 多亿营收"。',
      responses: [
        { who: 'p3', stance: 'partial', text: '接住但调整口径:「您感受到他的收益蛮好, 但实际上从租客感觉是省心服务..净利率 5% 以下..财报口径是亏的」, 主动揭过反垄断风险。' },
        { who: 'p8', stance: 'support', text: '补强:「这是基于他把所有的中后台甩给了经纪, 成本分摊的方式」, 解释会计现象。' },
      ],
    },
    {
      id: 'V6', claimBy: 'p3',
      claim:
        '宏观三个变量(基准利率 / 租金 / 房价)都已经刚性, 内在矛盾必须有出口 — ' +
        '需要用"市场化方式界定各方可行的市场化定价", 类似 CAPM 的基准锚 ' +
        '(三星基准, 四星 +15%, 五星 +30%); 这是行业标准要做的事, 也是 APEC 平行论坛 + 清华白皮书 + 集中式项目"四个一"的底层逻辑。',
      responses: [
        { who: 'p2', stance: 'support', text: '接受但没在本场展开 — 末段把这个上升到了"集团向未来的钥匙、贝莱德方向"的战略叙事。' },
        { who: 'p8', stance: 'support', text: '没接这条具体, 但全场配合"贝塔 + 现金流闭环"的产品架构论证, 即在这个叙事下做的产品设计。' },
      ],
    },
  ],
};

// 双池信托结构关键参数
const TRUST_STRUCTURE = [
  { id: 'TS-1',  layer: '承接池',   param: '已发期数 / 累计规模',     value: '3 期 / 累计约 1 亿',                    state: 'CURR', note: '每期 3000-4000 万' },
  { id: 'TS-2',  layer: '承接池',   param: '底层资产',                value: '约 1000+ 套, 装修总额 10 万/套',         state: 'CURR', note: '88 折扣受让, 每单还款总额约 8 万' },
  { id: 'TS-3',  layer: '承接池',   param: '分层结构',                value: '苏银理财优先 75% + 久阳劣后 25%',        state: 'CURR', note: '过手摊还, 每 3 个月清分一次' },
  { id: 'TS-4',  layer: '承接池',   param: '优先级利率',              value: '3.0%-3.5% (略低于 4)',                  state: 'CURR', note: '看苏银发行周期匹配' },
  { id: 'TS-5',  layer: '承接池',   param: '优先级期限',              value: '24 个月内, 平均 18-20 个月',             state: 'CURR', note: '底层加权平均 30 期, 75% 摊还完即结束' },
  { id: 'TS-6',  layer: '承接池',   param: '受托方',                  value: '外贸信托 (主动管理 + 主笔审核)',          state: 'CURR', note: '加快所/律所/北京信托三方中介' },
  { id: 'TS-7',  layer: '承接池',   param: '加压模型',                value: '历史违约率按 10 倍上限算波倍仍可承受',     state: 'CURR', note: '到目前实际零违约' },
  { id: 'TS-8',  layer: '放款池',   param: '现规模 / 关系',           value: '约 1000 万 (与承接池 1:5 比例)',          state: 'CURR', note: '苏银批的是 1:10 优先级 / 加劣后 1:12.5' },
  { id: 'TS-9',  layer: '放款池',   param: '受托结构',                value: '单一委托人 (久阳唯一, 信托被动管理)',     state: 'CURR', note: '快速过桥过渡库使用' },
  { id: 'TS-10', layer: '放款池',   param: '改造演进',                value: '后半年改成集合信托',                      state: 'EVOL', note: '已有理财子在谈进场' },
  { id: 'TS-11', layer: '业务规模', param: '近期目标 / 长期空间',     value: '50 亿/年 (近 2 年) / 2000 亿/年 (长期)',  state: 'TGT' , note: '核心城市核心商圈 20 年以上房 × 5 年装修周期 × 贝壳渗透率' },
  { id: 'TS-12', layer: '历史数据', param: '逾期率 / 损失规模',       value: '0.2%-0.3% (2/3 是租客逾期) / 千万级',     state: 'CURR', note: '基于 80 万套省心租千亿级租金规模' },
  { id: 'TS-13', layer: '历史数据', param: '本场信托第一期数据',     value: '2025/9/12 发行, 实际资产形成 2024 年',    state: 'CURR', note: '截至本场 1000+ 套零违约' },
];

// 风控分层 (现金流回款的多层安全垫)
const RISK_LAYERS = [
  { id: 'RL-1', level: '1st',  layer: '租客逾期 → 贝壳全额垫付',         period: '当月',           who: '贝壳' },
  { id: 'RL-2', level: '2nd',  layer: '招租对赌 → 贝壳付一半租金',       period: '次月起 30 天',   who: '贝壳' , note: '比例承诺在不停往下减' },
  { id: 'RL-3', level: '3rd',  layer: '60 天未恢复在租 → 放款池置换承接池', period: '60 天后',     who: '放款池' },
  { id: 'RL-4', level: '4th',  layer: '装修公司质保金 (3% 总规模 + 6-9 月垫资能力)',                who: '装修公司' },
  { id: 'RL-5', level: '5th',  layer: '风险准备金 (贝壳收入抽出, 设计中)',                          who: '贝壳' },
  { id: 'RL-6', level: '6th',  layer: '房东端兜底义务 (合同约定经营性债务偿付)',                    who: '房东' },
  { id: 'RL-7', level: '7th',  layer: '诉讼 / 争议处理 → 房东 30 天内还款率 50%-60%',                who: '法律' },
  { id: 'RL-8', level: 'meta', layer: '贝壳信息化体系 + 抽样穿行测试 + 资产端真实风控',             who: '贝壳' , note: '不在券端加风控, 在资产端做上下游管理' },
];

// 业务总图: 省心租 vs 美租
const PRODUCT_MAP = [
  { id: 'PM-1', product: '省心租',     nature: '公募逻辑', scale: '80 万套整租 + 200 万间(按间)', revenue: '200-300 亿/年', netMargin: '< 5% (财报口径是亏的)', clientType: '家庭整租 (35-45 岁家庭客群为主)', mgmtFee: '房东 10% + 租客 10% (空置期不收)' },
  { id: 'PM-2', product: '美租',       nature: '私募逻辑', scale: '广义几万套', revenue: '掐尖资产, 增信改造装修款', netMargin: '可以挣一些', clientType: '财富客户 (有 2+ 套房, 不着急处置, 500 万+ 房产价值)', mgmtFee: '同 10% + 10%, 但增装修分期场景' },
  { id: 'PM-3', product: '托装一体化', nature: '最新升级', scale: '北京 5/21 上线', revenue: '签约时一起签托管 + 装修 + 租金代扣三合一', netMargin: '降业主二次签约成本', clientType: '同上', mgmtFee: '同上' },
  { id: 'PM-4', product: '不动产信托', nature: '探索方向', scale: '上海信托试点', revenue: '所有权 + 租赁权剥离, 租赁权折扣前置卖给银行', netMargin: 'IRR 12% 左右(类比苏州 10 年 3 折)', clientType: '长三角私行客户 (老人养老 + 财富管理)', mgmtFee: 'TBD' },
  { id: 'PM-5', product: '集中式项目', nature: '探索方向', scale: '宁波北仑 / 南京浦口 / 城投房源', revenue: '政府以旧换新/工抵房托管', netMargin: 'TBD', clientType: '地方城投 + 安居公司', mgmtFee: 'TBD' },
];

// 战略合作蓝图
const STRATEGIC_PILLARS = [
  { id: 'SP-1', pillar: '美租信托资金',             desc: '承接池优先级 + 平层 + 放款池 三档可选',                        priority: 'PRIMARY'  , expectedSize: '今年规模与苏银/北银相当' },
  { id: 'SP-2', pillar: '私行代销',                 desc: '永盈基金 / 宁银理财产品在贝壳客群中分销',                       priority: 'STRATEGIC', expectedSize: 'TBD'                       },
  { id: 'SP-3', pillar: '不动产信托 + 财富管理',    desc: '长三角私行客户房产证券化 / 养老配套, 类比上海信托模式',         priority: 'EXPLORE'  , expectedSize: 'TBD'                       },
  { id: 'SP-4', pillar: '不良资产处置',             desc: '银行 + AMC 手中存量不良房产 → 贝壳市场化托管/装修/出租',         priority: 'EXPLORE'  , expectedSize: '量大但难度高'              },
  { id: 'SP-5', pillar: '集中式房源 (城投合作)',    desc: '宁波北仑 / 政府以旧换新房源, 5 月节后赴宁波对接',                priority: 'EXECUTE'  , expectedSize: 'TBD'                       },
  { id: 'SP-6', pillar: '数字化产品互联',           desc: '宁波银行 toB(资料是大管家)/toC(美好生活) × 贝壳集团 / 经纪人体系', priority: 'STRATEGIC', expectedSize: 'TBD'                       },
  { id: 'SP-7', pillar: '消费贷 (基于现金流授信)',  desc: '基于美租稳定现金流, 银行可对租客直接授信',                     priority: 'EXPLORE'  , expectedSize: 'TBD, 由 p6 在末段提及'     },
];

const META_INFO = {
  asrQuality: 'mid — 业务术语清晰("省心租 / 美租 / 承接池 / 放款池 / 招租对赌 / 质保金"等); 人名同音替换问题较多 ("徐航/徐行长", "苏莹/苏银", "肖华/陈总", "袁朗才和袁康"等需校对)',
  signalDensity: 'very high — 跑题率 ~5%, 1.5 小时内完成机构尽调 + 战略对齐 + 监管预警 + 行动收口, 信息密度可对标产品技术对齐会',
  meetingShape: '"宁波银行 PPT 介绍 → 贝壳商业模式陈述 → 信托结构展开 → 风控细节 Q&A → 监管预警 → 战略协议推进 → 行动锁定" 七段式',
  asymmetricInfo: 'p4 (厂长) 是宁波银行内部对 ABS / 证券化最熟的人, 但全场只在末段才说话 — 这是中国国企/银行常见的"资深判断者后置发言"结构, 但她的发言成为 p2 决策的最重要内部背书',
  emotionalTone: '专业 + 互相试探 + 偶有黑色幽默("我天呐这收益不得了"、"我们就坐立难安"); p8 用"自己金融街租房 + 自装修"的个人体验给商业模式背书是本场最人性化的瞬间',
  notableMoments: [
    '04:32 徐行长一句"咱们那个也专门有那个 PPT, 这样我们那个材料其实也有, 但是比较多, 回头我给会后发给咱们" — 第一次切换到深度对话节奏',
    '17:27 徐行长"就相当于 20%, 每个月租金的 20%" — 全场最锋利的质问, 把 p3 的管理费叙事打到墙上',
    '46:34 "贝壳不想作恶, 这个事情一般就" — p2 自己说出本场最重要的判断, 为后续监管对话打开通路',
    '01:17:25 "3000 多个亿, 10%, 700 多, 我天呐, 这收益不得了" — p2 第二次把账本摊开, p3 以"反垄断箭一直插着"应对',
    '01:25:00 "宁波监管局给了我们一个口头的指导让我们谨慎和互联网平台合作" — 全场最关键的隐藏约束, 直到最后才点出',
    '01:26:43 "贝壳可能跟其他平台不一样, 真不一样" — p2 给出本场最有分量的内部说服路径',
  ],
  followUps: [
    '会后立即: p3 给宁波银行发完整 PPT 与方案材料',
    '近期: p2 回总行讨论方案, 处理监管口径问题',
    '与 A1 并行: p3 + p2 推进战略协议文本协商, 涵盖财富 / 私行 / 不动产 / 不良 多线',
    '5 月节后: p6 赴宁波与北仑还是处对接城投房源',
    '后半年: p8 把放款池单一委托人结构改造为集合信托, 引入更多理财方',
    '今年内: 贝壳 APEC 平行论坛 + 清华白皮书 + 房协行业标准立项 + 集中式项目 "四个一" 完成',
  ],
};

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'business_alignment',
  duration_min: 90 + 32 / 60,
  duration_label: '01:30:32',
  room: '线下面谈(线索: PPT 投屏 + 多人轮发 + 末段"也欢迎到宁波来指导工作", 推测在贝壳/宁波银行其中一方办公室)',
  source_note: '会议自动转写 (噪声中等, 业务术语可还原, 人名需校对)',
  source_filename: '新录音 (1).txt',
  off_topic_pct: 0.05,
  tokens_estimate: 36000,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  trust_structure: TRUST_STRUCTURE,
  risk_layers: RISK_LAYERS,
  product_map: PRODUCT_MAP,
  strategic_pillars: STRATEGIC_PILLARS,
  meta: META_INFO,
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
  await client.query(
    `INSERT INTO assets (id, type, title, content, content_type, metadata)
     VALUES ($1, 'meeting_note', $2, $3, 'meeting_note', $4::jsonb)`,
    [NEW_MEETING_ID, TITLE, TRANSCRIPT, JSON.stringify(metadata)],
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
            jsonb_array_length(COALESCE((metadata->'trust_structure'), '[]'::jsonb))          AS n_trust_structure,
            jsonb_array_length(COALESCE((metadata->'risk_layers'), '[]'::jsonb))              AS n_risk_layers,
            jsonb_array_length(COALESCE((metadata->'product_map'), '[]'::jsonb))              AS n_product_map,
            jsonb_array_length(COALESCE((metadata->'strategic_pillars'), '[]'::jsonb))        AS n_strategic_pillars
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
