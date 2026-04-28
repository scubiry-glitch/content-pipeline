// Seed · 美租续约 · 三方案技术对齐会 — 新建会议
// 转写源: /Users/scubiry/Downloads/会议纪要-续约沟通.docx
// 分析参考: /Users/scubiry/Downloads/meizu-renewal-align__analysis.ts
//
// 用法: node scripts/seed-meeting-meizu-renewal.mjs
// INSERT 新建, 每次跑会拿到新 UUID。

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

const DOCX_PATH = '/Users/scubiry/Downloads/会议纪要-续约沟通.docx';
const NEW_MEETING_ID = randomUUID();

const TITLE = '美租续约 · 三方案技术对齐会';
// 转写文件本身没有时间戳起点; 用 docx 修改时间作为占位
const OCCURRED_AT = '2026-04-27T18:09:00+08:00';

const PARTICIPANTS = [
  { id: 'pA', name: '东莲',  role: '收房合同 / 续约模块产品 · 主持人 (说话人 A)',  initials: '东', tone: 'neutral', speakingPct: 33 },
  { id: 'pB', name: '全鑫',  role: '美租业务方产品 · 二期需求负责人 (说话人 B)',   initials: '全', tone: 'warm',    speakingPct: 30 },
  { id: 'pC', name: '小萌',  role: '测算 / 订单侧产品 · 跨模块协调 (说话人 C)',    initials: '萌', tone: 'cool',    speakingPct: 16 },
  { id: 'pD', name: '静静',  role: '合同模块 owner · 资深技术声音 (说话人 D)',     initials: '静', tone: 'cool',    speakingPct: 18 },
  { id: 'pE', name: '辅助者', role: '工单 / 流程协助, 非核心讨论参与者 (说话人 E)', initials: '辅', tone: 'neutral', speakingPct: 3  },
];

const ANALYSIS = {
  summary: {
    decision:
      '本场未当场拍板, 决策上抛给业务老板. 但完成了三件关键收敛: ' +
      '①明确了三个方案的真实成本结构 — 方案 1/2 系统改造成本巨大(合同侧)、方案 3 系统改动小但运营成本高(业务侧 5 个子问题待解); ' +
      '②业务方 B 的偏好从初始的"奔着方案三"动摇到"听完 5 个问题反而觉得方案二可能更友好", 但 D 提示"先 3 后想换 1/2 比现在直接做 1/2 更痛", B 最后没有直接换边, 决定带着完整成本信息回去找业务老板汇报; ' +
      '③方案三若选定, 5 个子问题分别确定了改造路径 — 完工/招租时间校验改由测算收口、定金应付日加测算字段、外展上下架由房源-美租跨模块交互解决、招租结束日推迟走白名单、合同里灵活字段不可行(必须是确定参数). ' +
      '此外二期还有三个并行需求 (产品协议差异化 / 09 美化包 / 出房侧差异化) 走各自归属人.',
    actionItems: [
      { id: 'A1', who: 'pB', what: '回去找业务老板汇报三方案与各自成本, 包括方案 1/2 系统恶心 + 方案 3 运营恶心的对比', due: '本周 / 节后' },
      { id: 'A2', who: 'pD', what: '拉韩美进群, 提供方案 1/2 在已做项目(周期截断)上的实际开发成本与周期数据',          due: '即刻' },
      { id: 'A3', who: 'pB', what: '若选方案 3, 输出 5 个子问题的具体业务规则(签约校验/定金/外展/延期/合同灵活字段)',  due: '方案选定后' },
      { id: 'A4', who: 'pA', what: '同步问业绩侧 — 方案二非连续场景下, 业绩计算是否会有影响',                            due: '与 A1 并行' },
      { id: 'A5', who: 'pB', what: '联系大可, 推进出房侧差异化(09 子版本与 09 标准版分开配置), 出自郝总上期明确诉求',  due: '与 A1 并行' },
      { id: 'A6', who: 'pC', what: '把出房侧差异化登记到需求池, 由欣荣盘各城市优先级',                                  due: '近期' },
      { id: 'A7', who: 'pD', what: '在方案三下沉淀: 测算字段(首次定金应付日期) + 招租期内可切割装修段的支持能力评估',     due: '方案三若选定后' },
      { id: 'A8', who: 'pB', what: '继续推进合并签约方向, 确认是否只续 09 美租 / 还是其他版本一起拓',                    due: '与业务老板对齐' },
    ],
    risks: [
      'R1 · 方案三的 5 个子问题运营成本高 — 招租定金时间不确定、装修期房源外展上下架要手动、装修延期免费延长不支持只能走白名单, 业务老板可能听完劝退',
      'R2 · 方案 1/2 在合同侧改动巨大 — D 直言"系统很恶心", 因为打破了原合同与续约合同租期连续的核心假设, 所有周期阶段联动逻辑都要改, 影响财务/业绩/各下游板块',
      'R3 · 历史包袱叠加 — 周期截断那个项目"还没做完, 一直在迭代", 又要叠加美租续约的需求, D 警告"难度和周期会更大"',
      'R4 · 切换路径成本 — D 的关键预警: "你后边把 3 切到 1 和 2 上, 比你现在做 1 和 2 的难度会更大" — 决策不是单点最优, 是路径依赖最优',
      'R5 · 业务老板沟通壁垒 — B 自己承认: "我 get 不到一二的难, 老板也是业务老板, 我怕讲完之后他们就翻不过身了" — 复杂度信息从技术侧到业务老板有损耗',
      'R6 · 09 标准版 vs 09 美租子版本不能差异化 — 当前系统从合同往下没有拆分, 影响定金应付时间 / 出房侧策略 / 协议差异化 等多处, 是横切问题',
      'R7 · 方案三下灵活字段不可行 — 合同里的定金应付日不能做成动态参数(法务无法解释), 必须落到确定值; 这把 B 提议的"动态打钱"路径堵死了',
      'R8 · 美租续约只支持 09 — 业务量边界尚未确认是否够大到值得改造, B 自己也承认"如果只是试一试的话, 不必要花太大成本"',
      'R9 · 合并签约的范围歧义 — 续约美租到底是只 09、还是含 0507 也要支持, B 当场无法回复, 须二次跟业务老板确认',
    ],
  },
  tension: [
    {
      id: 'T1', between: ['pA', 'pC'], intensity: 0.50,
      topic: '方案三的整体可行性: 简单包入 vs 下游改造太多',
      summary:
        'pA 进入会议时的预设是"方案三最简单, 我们之前评估三个方案下来, 业务作业难度上方案三最简单, 所以希望往方案三推"; ' +
        'pC 在会议第 4 分钟即明确反对:「我不建议选方案三」, 给出技术理由 — 包含关系导致后续校验/联动复杂、装修工期延一天招租期就要往后延、灵活处置空间被吃掉. ' +
        '这条张力贯穿全场, pC 在 22 分附近再次重申:「我到现在为止都不是很认同方案三」. ' +
        '直到 D 给出"方案 1/2 合同侧成本巨大"的判断后, pC 的立场才软化为"如果非要选, 我都行".',
      moments: [
        'pC: 「就是如果是这样的话, 等于我们装修的工期跟招租期是一个包含的关系, 后面如果去做一些什么校验就会比较麻烦。」',
        'pC: 「是不是装修工期一旦延了一天招租期就要往后延?所以他其实就包不住中间已预留时间, 后面开发再改造的成本也挺高的, 我不建议这么改。」',
        'pC (后段): 「我到现在为止都不是很认同方案三, 所以基于方案三去定我的方案的话, 我觉得没什么意义。」',
        'pC (软化): 「如果非要选..我这边其实对合同的依赖只有那一个校验, 我都可以, 只是我觉得反正 3 需要线下处理的东西太多了, 你们判断吧, 我都行。」',
      ],
    },
    {
      id: 'T2', between: ['pD', 'pB'], intensity: 0.55,
      topic: '方案 1/2 的合同侧实际成本: 抽象警告 vs 业务方需要可量化',
      summary:
        'D 在 30 分附近给出强警告:「方案 1/2 对于合同来说是一样的, 成本都是非常高的、巨大」, 理由是打破了原合同与续约合同的连续性核心假设, 所有周期阶段联动逻辑都要改. ' +
        'B 不是不接受, 而是无法用业务语言把这件事讲给业务老板:「我 get 不到一二的难、我担心我讲完之后老板就翻不过身了、是不是会影响业绩或其他?」 ' +
        'D 承认:「我没有在项目里面、我现在连对合同有什么影响我都给不到、就这个我给不到」, 只能用"和韩美做的周期截断项目还没做完一直在迭代"做类比, 并主动提出"我把韩美拉群里"补齐数据. ' +
        '这是一条"技术成本无法落到业务语言"的张力, 不对立, 但暴露了汇报链路上的结构性损耗.',
      moments: [
        'pD: 「东野 12 对于合同来说是一样的, 成本都是非常高的、巨大。」',
        'pB: 「我 get 不到一二的难..老板也都是业务的老板, 我担心我讲完之后他们就翻不过身了。」',
        'pB: 「这个复杂的校验它会影响到什么?会关联到业绩, 可能会关联到其他的?」',
        'pD: 「这个我给不到你, 因为我没有在项目里面..我现在能给到的就是这边的, 需要很大的资源投入和成本投入。」',
        'pD (兜底): 「我一会把韩美拉群里, 让韩美帮你解答一下。」',
      ],
    },
    {
      id: 'T3', between: ['pD', 'pB'], intensity: 0.60,
      topic: '方案选择的路径依赖: 临时跑通 vs 长期切换更痛',
      summary:
        '本场最有杀伤力的一条张力, 由 D 在 56 分附近给出. ' +
        'B 听完方案三的 5 个子问题后, 偏好从"奔着方案三"动摇到"反而觉得方案二比较友好"; ' +
        'D 立刻反向劝阻 — 不是劝他选方案三, 而是劝他想清楚:「你后边把 3 切到 1 和 2 上, 比你现在做 1 和 2 的难度会更大」. ' +
        '理由是: 方案三跑了一段时间会产生"恶心的历史数据", 后续做规范方案时既要做新增又要清理历史包袱, 跟招录底项目当年的教训一样. ' +
        '这条预警逼 B 思考的不是"哪个方案最简单", 而是"这事的价值大不大、能不能取舍". B 没立刻表态, 收下了这个判断.',
      moments: [
        'pB: 「听完方案三之后, 我反而觉得方案二可能会对我们来讲就是相对来讲比较友好, 或者方案一就是说我今天就是在续约场景里下面增加一个美租的续约。」',
        'pD: 「你后边你再想把 3 切到 1 和 2 上, 比你现在做 1 和 2 的难度会更大。」',
        'pD: 「就跟我们做招录底比较像, 我们可能就是开始的时候可能觉得有一些东西我们舍弃一下, 跑了一段时间发现不行..给的同时还要把前面跑的一些最恶心的东西的历史数据要给你处理掉, 对于我们来说这个负担也是非常重的。」',
        'pD: 「你们可能要想清楚咱这个东西是不是有价值的?是不是价值非常大?以及这些东西你到底能不能接受?能不能取舍?如果实在接受不了的话, 也不要强硬的接受。」',
      ],
    },
    {
      id: 'T4', between: ['pB', 'pD'], intensity: 0.40,
      topic: '续约美租该走"续约流程"还是"打标的新签流程"',
      summary:
        '一条具体的实现路径分歧, 出现在方案二的细节展开里. ' +
        'B 的业务直觉:「从业务的视角来讲, 它就是一个续约合同, 只不过校验规则有一条不给渠道佣金」; ' +
        'D 的合同侧立场:「你认为它是续约合同的话, 那你就往方案三上靠 — 你要走续约的逻辑, 那它就是续约现在的这一套东西; 如果你不想用续约逻辑, 那它就必须走新签的流程, 给这个合同打个标」. ' +
        '这条分歧把"业务概念"和"系统实现路径"分开了 — D 表达的是: 走续约流程就要承担续约的全部约束(租期连续等), 想绕开就必须改名叫新签. B 没有立刻接受, 但开始理解"业务感知"和"系统路径"是两回事.',
      moments: [
        'pB: 「从业务的视角来讲的话, 它不是不给渠道佣金, 它的核心就是说我要允许不连续签约, 但是从业务的视角来讲, 对我们来讲就是一个续约合同。」',
        'pD: 「你认为它是续约合同的话, 那你就往方案三上靠吧?你要走续约的逻辑, 那它就是续约现在的这一套东西。」',
        'pD: 「我们现在新签合同和续约合同它的路径是完全不一样的, 新签合同是从房源开始录入然后做测算, 但是续约的话它的发起是基于现在的原合同。」',
        'pD: 「如果说你要用我们的续约功能的话, 你就会走到现在合同的续约框架里边去, 比如说租期连续, 这都是必须要走的。」',
      ],
    },
    {
      id: 'T5', between: ['pA', 'pD'], intensity: 0.30,
      topic: '定金应付日做成"动态参数"是否可行',
      summary:
        '方案三下的具体子问题. ' +
        'D 起初提出可以走动态:「打钱的时间是测算的一个数据吗?作为一个测算字段, 然后后边的话带到合同里边」; ' +
        'A 立刻打断反对:「打定金这个事, 如果它是一个动态的话, 但是合同里面不体现这个装修工期或者它的结束日的话, 合同里面写的这个东西就是一个灵活的, 我感觉合同上也会有问题, 没法解释清楚」. ' +
        'D 接受 A 的判断, 转而给出折中:「如果是动态的, 协议里边怎么把这个事情讲清楚..你们再想一想这个事情多么的重要」. ' +
        '最终落到只能选两条确定路径: 签约日 + N 天 / 招租开始日 + N 天. 这是一条快速消解的合规边界张力.',
      moments: [
        'pD (一开始): 「那意思是说这个打钱的时间是测算的一个数据..作为一个测算字段, 然后后边的话带到合同里边, 不走我们的配置。」',
        'pA: 「打定金这个事, 如果它是一个动态的话, 但是咱们合同里面不体现装修工期或它的结束日的话, 合同里面写的这个东西它就是一个灵活的, 我感觉合同上也会有问题。」',
        'pA: 「我觉得这个它应该不是一个非常灵活的东西, 不然没有解释不清楚。」',
        'pD (转折中): 「就是行, 协议里边怎么把这个事情讲清楚?系统实际上来说我们可以让他填一个动态的进来, 但是如果填完了之后, 你的完工时间再变的话..你评估一下这个东西多么的重要。」',
      ],
    },
  ],
  newCognition: [
    { id: 'N1', who: 'pA',
      before: '方案三业务作业讲解最简单, 沟通了财法税觉得问题不大, 应该奔着方案三',
      after:  '方案三系统改动小, 但运营成本高 — 5 个子问题(校验/定金/外展/延期/灵活字段)都需要业务侧手动兜底',
      trigger: 'pC 第一时间打回"包含关系导致下游改造太多" + 在线展开 5 个子问题逐项暴露' },
    { id: 'N2', who: 'pB',
      before: '方案三系统改动小、看起来对业务最友好, 应该选方案三',
      after:  '方案三让业务侧承担 5 个手动兜底场景(招租定金、外展上下架、延期成本、合同灵活字段不可行), 反而方案二可能对业务更友好',
      trigger: 'A + D 把 5 个子问题展开后, B 自己说出:「听完方案三之后, 我反而觉得方案二可能会对我们来讲比较友好」' },
    { id: 'N3', who: 'pB',
      before: '方案二就是续约场景里加一个不连续标签, 业务概念上还是续约',
      after:  '业务概念是续约 ≠ 系统路径走续约 — 走续约流程就承担续约的全部约束(租期连续), 想绕开就必须改名走新签流程',
      trigger: 'pD:「你认为它是续约合同的话, 那你就往方案三上靠 — 你要走续约的逻辑, 那它就是续约现在的这一套东西」' },
    { id: 'N4', who: 'pB',
      before: '方案的优劣比较是: 看哪个系统改动小 / 业务运营轻',
      after:  '方案的优劣比较还有第三维: 路径依赖 — 现在选 3, 后面想换回 1/2, 比现在直接做 1/2 更痛(招录底项目教训)',
      trigger: 'pD:「你后边你再想把 3 切到 1 和 2 上, 比你现在做 1 和 2 的难度会更大..前面跑的最恶心的历史数据要给你处理掉」' },
    { id: 'N5', who: 'pA',
      before: '把定金应付日做成动态参数挺灵活的, 系统也能支持',
      after:  '动态参数在合同协议层无法解释, 法务讲不通; 必须落到确定值(签约日+N 或 招租开始日+N)',
      trigger: 'pA 自己反过来打断 pD 的动态方案:「合同里面写的这个东西就是一个灵活的, 法务也讲不通」, 把可行域收窄' },
    { id: 'N6', who: 'pB',
      before: '在合同里能取到装修结束日就行, 用合同侧字段控制外展上下架',
      after:  '合同侧的装修结束日是签约时约定值, 不是实际完工日; 实际完工日只能从美租订单端取, 必须靠房源-美租跨模块交互(房源问美租"完了吗"、美租通知房源"可以上了")',
      trigger: 'pA 三次追问"实际完工 vs 签约约定", pD 接力给出跨模块交互方案: 房源到美租做接口对账' },
    { id: 'N7', who: 'pB',
      before: '美租是个独立产品, 出房侧策略可以靠 09 主版本规则一致就够',
      after:  '09 子版本和 09 标准版从合同往下都没有拆分配置, 出房侧差异化、定金应付时间差异化、协议差异化都受限 — 这是个横切问题, 不是单点',
      trigger: 'pA 在二期需求段:「现在其实从客户, 从合同往下都没有把标准版和子版本拆出来做配置化」, 让 pB 意识到差异化要找大可走供应链需求池' },
    { id: 'N8', who: 'pD',
      before: '美租续约只是个孤立的需求',
      after:  '其他业务也有"通过解约+新签"绕过续约逻辑的诉求, 美租续约的本质和它们是一类问题, 应该一起考虑而不是单点解',
      trigger: 'pD 主动归类:「我们现在不光是美租, 还有一些其他场景, 也不想要去做这个渠道佣金..跟你这个情况其实蛮像的」' },
  ],
  focusMap: [
    { who: 'pA', themes: ['三方案陈述', '招租定金问题', '产品标准版/子版本配置缺位', '动态字段不可行', '业绩影响兜底', '主持串场'],         returnsTo: 14 },
    { who: 'pB', themes: ['方案三业务可行性', '5 个子问题逐项确认', '业务概念 vs 系统路径', '汇报老板的语言转化', '二期其他三个需求'],      returnsTo: 12 },
    { who: 'pC', themes: ['反对方案三 (包含关系/下游改造)', '完工 vs 招租时间校验', '续约规则补齐(开工 vs 原合同到期)', '业绩侧影响'],     returnsTo: 8  },
    { who: 'pD', themes: ['方案 1/2 合同侧巨大成本', '路径依赖警告(招录底教训)', '动态字段折中', '跨模块交互(房源 vs 美租)', '类问题归类'], returnsTo: 11 },
    { who: 'pE', themes: ['工单流程协助', '看板链接同步'],                                                                                  returnsTo: 2  },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '方案 1/2 在合同侧成本"巨大", 因为打破了原合同与续约合同租期连续的核心假设',          supportedBy: ['pA','pC','pD'],     sides: [] },
    { id: 'C2', kind: 'consensus',  text: '方案三系统改动小, 但有 5 个业务运营子问题必须解决',                                  supportedBy: ['pA','pB','pC','pD'], sides: [] },
    { id: 'C3', kind: 'consensus',  text: '5 个子问题之一: 完工/招租时间的校验由测算侧统一收口, 不在美租或合同各自做',          supportedBy: ['pA','pC','pD'],     sides: [] },
    { id: 'C4', kind: 'consensus',  text: '5 个子问题之二: 定金应付日不做动态参数, 只能落到确定值(签约日+N 或 招租开始日+N)',  supportedBy: ['pA','pB','pD'],     sides: [] },
    { id: 'C5', kind: 'consensus',  text: '5 个子问题之三: 外展上下架走房源-美租跨模块交互(房源问美租, 美租给房源发通知)',     supportedBy: ['pB','pD'],          sides: [] },
    { id: 'C6', kind: 'consensus',  text: '5 个子问题之四: 装修延期推招租结束日只能走单合同白名单(合同维度), 没有批量免费延长',supportedBy: ['pA','pD'],          sides: [] },
    { id: 'C7', kind: 'consensus',  text: '5 个子问题之五: 续约场景下需补齐 "开工时间晚于原合同到期" 校验(当前不允许两租场景)', supportedBy: ['pA','pC'],          sides: [] },
    { id: 'C8', kind: 'consensus',  text: '决策不当场拍, 由 B 带完整成本信息回去找业务老板汇报后再定',                          supportedBy: ['pA','pB','pC','pD'], sides: [] },
    { id: 'C9', kind: 'consensus',  text: 'D 拉韩美进群提供方案 1/2 在周期截断项目上的实际开发成本与周期数据, 给 B 的汇报增体感', supportedBy: ['pA','pD'],          sides: [] },
    { id: 'C10', kind: 'consensus', text: '二期并行三个需求(产品协议差异化、09 美化包、出房侧差异化)各走各自归属人路径',         supportedBy: ['pA','pB','pC','pE'], sides: [] },

    { id: 'D1', kind: 'divergence', text: '方案三 vs 方案二, 哪个对业务侧总成本更低?', supportedBy: [], sides: [
      { stance: '方案三',  reason: '系统改动最小, 跑得快, 5 个子问题逐项可解',                                                by: ['pA'] },
      { stance: '方案二',  reason: '听完 5 个子问题后, 对业务运营反而更友好, 不存在差异化运营场景',                            by: ['pB'] },
      { stance: '都不优',  reason: '方案三需要线下处理的东西太多, 方案 1/2 系统侧又巨贵, 价值是不是大需要先评估',             by: ['pC','pD'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '续约美租走"续约流程"还是"打标新签流程"?', supportedBy: [], sides: [
      { stance: '走续约流程', reason: '业务感知就是续约, 业务方天然把它理解成续约合同',          by: ['pB'] },
      { stance: '打标新签',   reason: '想绕开租期连续约束就必须走新签路径, 否则就是方案三',     by: ['pD'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '定金应付日: 静态 vs 动态', supportedBy: [], sides: [
      { stance: '动态可考虑', reason: '通过测算字段带给合同, 反映装修结束的实际灵活度',         by: ['pD'] },
      { stance: '必须静态',   reason: '合同协议必须能解释清楚, 法务和业主沟通都需要确定值',     by: ['pA'] },
    ]},
    { id: 'D4', kind: 'divergence', text: '续约美租做的范围: 只 09 / 还是含 0507', supportedBy: [], sides: [
      { stance: '只 09',     reason: 'B 自己的核心诉求是把 09 量做起来, 美租所有都收敛到 09', by: ['pB'] },
      { stance: '含合并签约', reason: '0507 也可以做美租, 看业务老板要不要拓',                 by: ['pC','pD'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'pC',
      claim:
        '方案三看起来简单, 但下游要改的东西不少 — 装修工期延一天招租期就要往后延, 包含关系导致后续校验/联动复杂, ' +
        '我们预留的灵活处置空间被吃掉, 后面开发再改造的成本也挺高。',
      responses: [
        { who: 'pA', stance: 'partial', text: '部分接受 — 不否认下游改造, 但用"如果选方案 1/2 改造也蛮大"作平衡, 把全场拉回三方案对比。' },
        { who: 'pD', stance: 'support', text: '间接支持 — 后续给出方案 1/2 合同侧巨大成本的判断, 反向印证了"下游改造"在 1/2 上更糟, 让 pC 软化为"我都行"。' },
        { who: 'pB', stance: 'partial', text: '一开始没接, 但听完 5 个子问题后立场翻转, 从"奔着方案三"变成"反而觉得方案二友好"。' },
      ],
    },
    {
      id: 'V2', claimBy: 'pD',
      claim:
        '方案 1/2 对合同来说成本是非常高、巨大的, 因为打破了原合同和续约合同连续的核心假设; ' +
        '同时考虑到下游财务/业绩/各板块联动, 对所有人都有影响; 我们之前做的周期截断那个项目还没做完, 一直在迭代, 你叠加这个事难度会更大。',
      responses: [
        { who: 'pA', stance: 'support', text: '完整接受, 多次复述给 pB 帮他理解:「相当于是一个还没有完全结束的类似方案, 你又要去做一个」。' },
        { who: 'pB', stance: 'partial', text: '不质疑技术判断, 但承认无法用业务语言传达给业务老板, 主动请 pD 拉韩美补量化数据。' },
      ],
    },
    {
      id: 'V3', claimBy: 'pD',
      claim:
        '决策不是"哪个方案现在最简单", 是路径依赖 — 你后边把 3 切到 1 和 2 上, 比你现在做 1 和 2 的难度会更大, ' +
        '因为前面跑的"最恶心的历史数据要给你处理掉", 这是招录底项目当年的教训。',
      responses: [
        { who: 'pB', stance: 'support', text: '直接接受这个框架 — 决定不立即换边到方案二, 而是带完整信息回去汇报, 让业务老板做"价值是否够大"的取舍判断。' },
        { who: 'pA', stance: 'support', text: '复述强化:「相当于是一个还没有完全结束的类似方案, 你又要去做一个」, 把痛感再放大一层。' },
      ],
    },
    {
      id: 'V4', claimBy: 'pA',
      claim:
        '打定金日做成动态字段, 合同里写的就是一个灵活的, 法务讲不通, 业主沟通也讲不通; ' +
        '必须落到一个确定的"签约日+N"或者"招租开始日+N", 不能解释的东西不能放进合同。',
      responses: [
        { who: 'pD', stance: 'support', text: '从一开始的"作为测算字段动态带过来"快速调整为"如果一定要动态, 协议里边怎么把这个事情讲清楚..你们再想想这个事多么的重要"。' },
        { who: 'pB', stance: 'support', text: '提出折中执行方案:「招租开始第十个工作日反正业主已经付装修款了, 这个钱也可以提前打给业主, 但是这个钱就是半个月租金, 不受招租时间长短影响」, 给静态参数找业务包装。' },
      ],
    },
    {
      id: 'V5', claimBy: 'pB',
      claim:
        '从业务视角来讲, 续约美租就是续约合同, 只不过校验规则有一条不给渠道佣金 — ' +
        '我希望就是在续约场景里增加一个标签, 这个标签从教研视角看就是不给渠道佣金, 对业务来讲就是一个续约合同。',
      responses: [
        { who: 'pD', stance: 'oppose',  text: '直接打回:「你认为它是续约合同的话, 那你就往方案三上靠 — 你要走续约的逻辑, 那它就是续约现在的这一套东西; 想绕开就必须打标新签」, 把"业务概念"和"系统路径"分开。' },
        { who: 'pA', stance: 'partial', text: '居中接住:「从业务的理解, 包括从现有系统它的合理性来说, 它一定是一个走续约这一块的流程」, 同时承认走续约流程会引发系统侧巨大改造。' },
      ],
    },
    {
      id: 'V6', claimBy: 'pD',
      claim:
        '美租续约的本质和"业务通过解约+新签去绕开续约逻辑"的其他场景是一类问题, ' +
        '都不想给渠道佣金、都不想走续约连续约束 — 应该一起考虑, 不是单点解。',
      responses: [
        { who: 'pA', stance: 'partial', text: '承认相似但不在团队范围内:「这个是你说的, 金姐, 你说的这个场景不在我们团队的范围内」, 暂不合并。' },
        { who: 'pB', stance: 'neutral', text: '没正面接, 但二期需求里依然把美租续约作为独立工单推进, 等于事实上拒绝了合并解。' },
      ],
    },
  ],
};

const PLAN3_SUBPROBLEMS = [
  { id: 'SP-1', label: '签约校验: 完工 vs 招租 vs 原合同到期',
    detail: '续约场景下需补齐 — (a)完工时间 < 招租开始时间 (b)开工时间 ≥ 原合同到期时间 (c)招租天数 = 工期 + 实际招租期',
    owner: 'pC (测算收口)',                  status: 'AGREED' },
  { id: 'SP-2', label: '招租定金应付日',
    detail: '不做动态字段 (法务/业主沟通讲不通); 落到确定规则 — 签约日+N 或 招租开始日+N. B 提议: 招租开始第 N 个工作日, 业主付装修款后再打半个月租金',
    owner: 'pD (合同) + pB (业务规则)',      status: 'AGREED' },
  { id: 'SP-3', label: '装修期房源外展上下架',
    detail: '当前自动上架会在装修期错误外显; 解决路径 — 房源询问美租"是否完工", 美租侧标记完工后通知房源上架. 实际完工时间从美租订单端取, 不依赖合同字段',
    owner: 'pB (美租) + 房源团队',           status: 'CROSS-MOD' },
  { id: 'SP-4', label: '装修延期 → 招租结束日往后推',
    detail: '北京无批量免费延长能力; 走单合同白名单(合同维度, 不是房源维度)免费延; 否则走操作兜底产生成本',
    owner: 'pA + PA',                        status: 'AGREED' },
  { id: 'SP-5', label: '合同灵活字段不可行的兜底',
    detail: '所有"装修工期"概念不进合同(合同协议讲不通); 工期信息只在测算/订单端存在, 合同侧只感知确定参数(招租开始/结束日)',
    owner: 'pD',                             status: 'AGREED' },
];

const PHASE2_OTHER_NEEDS = [
  { id: 'NP-1', label: '产品协议差异化',
    detail: '09 子版本美租产品的装修协议要支持城市级差异化(当前全国统一)',
    owner: 'pB → 待对接', status: 'OPEN' },
  { id: 'NP-2', label: '09 美化包(0.5 天置换)',
    detail: '一期未做, 二期补齐 — 0507 已有, 09 标准版 + 子版本都要加上',
    owner: '已在开发', status: 'IN-DEV' },
  { id: 'NP-3', label: '出房侧差异化(09 子版本 vs 09 标准版)',
    detail: '郝总上期明确诉求 — 业主掏钱了, 客户端服务费应至少不比 0507 贵; 当前从合同往下没拆分子版本, 要改横切',
    owner: 'pB → 大可 (供应链需求池, 欣荣盘优先级)', status: 'OPEN' },
];

const META_INFO = {
  asrQuality: 'mid — 主要噪声在产品代号("0507/09/09 美租")与人名同音替换, 业务术语整体可还原',
  signalDensity: 'very high — 跑题率 < 3%, 全程在产品决策路径上',
  meetingStructure: '"三方案陈述 → 反对意见 → 子问题展开 → 路径依赖警告 → 决策上抛业务老板 → 二期并行需求" 六段式',
  asymmetricInfo: 'pD 掌握的"招录底项目历史教训 / 周期截断项目当前迭代状态"是本场最稀缺的信息',
  followUps: [
    'B 节后/本周 → 业务老板汇报(带完整成本信息) → 方案选定',
    'D 拉韩美进群 → 提供方案 1/2 的实际开发周期/资源投入量化数据',
    'A 私下问业绩侧 → 方案二非连续场景对业绩计算的影响',
    'B 找大可 → 出房侧差异化需求池登记',
    'C 同步欣荣 → 各城市需求优先级排序',
  ],
};

// ── 抽 docx 文本 ──
const { value: rawText } = await mammoth.extractRawText({ path: DOCX_PATH });
const transcriptText = (rawText ?? '').trim();
console.log(`[seed] docx → ${transcriptText.length} chars (${transcriptText.split('\n').length} lines)`);

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'tech_alignment',
  duration_min: 85.93,
  duration_label: '约 01:25:56',
  room: '线上会议 (开场: "我投个屏能听到", 结尾: "再发工单"; 多模块协作)',
  source_note: '会议自动转写 (噪声中等, 关键术语基本可还原)',
  source_filename: '会议纪要-续约沟通.docx',
  off_topic_pct: 0.03,
  tokens_estimate: 32000,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  plan3_subproblems: PLAN3_SUBPROBLEMS,
  phase2_other_needs: PHASE2_OTHER_NEEDS,
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
            jsonb_array_length(COALESCE((metadata->'plan3_subproblems'), '[]'::jsonb))        AS n_subproblems,
            jsonb_array_length(COALESCE((metadata->'phase2_other_needs'), '[]'::jsonb))       AS n_phase2_needs
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
