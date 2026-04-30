// Seed · 北上链家业务经营分析与预算规划 v2 (richer analysis) — 新建会议
// 分析: 用户在 prompt 里提供的 JSON (内联到本文件)
// 转写源: /Users/scubiry/Downloads/北上链家业务经营分析与预算规划.txt
//
// 用法: node scripts/seed-meeting-beishang-lianjia-v2.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const NEW_MEETING_ID = randomUUID();
const TRANSCRIPT_PATH = '/Users/scubiry/Downloads/北上链家业务经营分析与预算规划.txt';
const TRANSCRIPT = readFileSync(TRANSCRIPT_PATH, 'utf8').replace(/\r\n/g, '\n').trim();

const TITLE = '北上链家业务经营分析与预算规划';
const OCCURRED_AT = '2026-03-04T09:00:00+08:00';

const PARTICIPANTS = [
  { id: 'p1', name: '说话人1', role: '集团战略业务策略 · 经营分析(二手/租赁)', initials: 'S1', tone: 'neutral', speakingPct: 0.82 },
  { id: 'p2', name: '说话人2', role: '听众/质询者(关注 UE 与中后台成本)', initials: 'S2', tone: 'cool', speakingPct: 0.10 },
  { id: 'p3', name: '说话人3(珊珊)', role: '经营分析(新房/经销商)', initials: 'S3', tone: 'neutral', speakingPct: 0.08 },
];

const SUMMARY = {
  decision: '确立 26 年北上链家经营分析与预算审视的统一方法论:量(成交-网签-剔除经纪客户单)→价(套均价-费率)→优异(成本拆解到业务线/人员/管理岗) 三段式拆解;并对 26 年预算单量与套均价做出强提示——北京二手 62.2 亿与上海新房 12,000 单/套均价 610 万的目标在当前结构下大概率会 miss。',
  actionItems: [
    { id: 'A1', who: 'p1', what: '把北京同口径(同比含 24 年)爆盘率 / 爆盘成交效率拆到大区,补全『市场→自己→平台』三层验证', due: '—' },
    { id: 'A2', who: 'p1', what: '推动 26 年北京二手在 800-1200 万价格段的市占提升测算落地(系数法),给到城市侧做预算复核', due: '—' },
    { id: 'A3', who: 'p3', what: '盘点 26 年北京新房 41+40+16 个项目的开盘节奏与套均价(960 万级新盘占明年 49%),回写 GTV 弹性区间', due: '—' },
    { id: 'A4', who: 'p1', what: '把 9 分房『占比 vs 区划成交效率』背离指标做成产品级限制建议,反馈到二手战略项目组', due: '—' },
    { id: 'A5', who: 'p1', what: '建立月度版经营分析述职模板(收入/利润/单量/人效/UE)给 CEO 简报', due: '—' },
    { id: 'A6', who: 'p1', what: '把 8+2+25 城同口径 UE 对比模型扩到 26 年全年,定位『中后台成本刚性大于收入弹性』根因', due: '—' },
    { id: 'A7', who: 'p1', what: '和北上业策/财务再走一轮 UE 与套均价拆解的细颗粒数据沟通(此次因时间未细谈)', due: '—' },
  ],
  risks: [
    'R1 · 北京二手 62.2 亿预算口径风险 — p1:「北店现在目前对于明年的套中价的预估是 372 亿多,12 月的成交价是 373」,但中性乐观测算下仍会 miss',
    'R2 · 上海新房 12,000 单 × 610 万套均价矛盾 — p3:「我们这个 12,000 单和 600 亿的套均价在现在这个市场情况下有可能是会有点矛盾的」',
    'R3 · 800-1200 万价段市占下滑 2.6PP,正是中介机会窗 — p1:「项目很多,也就是说中介市场在这个地方的成交其实是挺多的,只是我们自己没有抓住这样的机会」',
    'R4 · 9 分房产品机制鼓励内卷 — p1:「9 分占比越来越高,那效率越来越低」,工具失去聚焦语义',
    'R5 · 中后台成本刚性大于收入弹性 — p1:「我们的成本刚性是大于了这个收入的弹性,所以导致其实我们收入降得很快的时候,其实成本还在出来」',
    'R6 · 高总价(1200 万+)爆盘率最低,改善型市场抓不住 — p1:「最低的其实是就是高端的这边 1,200 万以上的房子差不多爆盘率是偏低的」',
    'R7 · 北京低总价(<300 万)市占 37.3%,低于公司均值 47%,基本盘不稳',
    'R8 · 北京新房在昌平/朝新/朝阳高地价高总价区域市占同比降 4-8PP,正是新增供给集中地',
    'R9 · 新房商机转成交率从千 2.8 降到千 2.2,商机端漏斗效率退化',
    'R10 · 经纪人提点率与提佣率背离 — 业务一旦稳定『提佣体检率全部 60%+ 是优益的灾难』(p1原话)',
  ],
};

const TENSION = [
  {
    id: 'T1', between: ['p1', 'p2'], topic: '26 年北京二手 62.2 亿预算 — 单量结构性下滑下能否兑现', intensity: 0.78,
    summary: 'p1 反复强调北京二手 25 年自营成交同比下滑 8,400 多单(剔除亲属过户后),且下滑集中在 300-800 万与 800-1200 万两段(绝对单量与市占双降),按现有经营弹性,『北京链家中性乐观下还是会 miss 掉这个收入』。但 26 年北京二手收入预算挂在 62.2 亿,套均价预估 372 万、12 月实际值 373 万,等于把全部命悬在『单量必须兑现 + 800-1200 万市占必须补回』两件难事上。\n\np2 在数据层面持续质询这一目标的可信度:他先问『25 年跟 24 年市场少了多少单』,核对到『市场整体成交基本持平、刨去 70 多户后我们少了八千多单』这个口径冲突,直接挑战 p1 的『市场稳定 vs 自己掉单』叙事;之后又对北京 UE TR 值『为什么只有 1.8』再次发问,意在把 top line 的乐观假设钉到费率与提点的真实约束上。两人没有正面冲突,但整段对话呈现的是 p1 主动认输式『中性乐观也会 miss』的兜底,与 p2 不断让数据自我证伪的逼问之间的拉扯——p1 用结构性归因(『套均价下滑不一定是市场,是我们自己成交结构』)来软化目标,p2 则关心当结构变化必然发生时,目标到底要不要往下调或者把口径换一种。',
    moments: [
      'p1:「北京这边下滑比较厉害,就是绝对值上下降 8,400 多单」',
      'p2:「就市场整体的这个成交量是 25 年跟 24 年是基本持平的。是因我们刨去 70 多户之后,我们少了八千多单,是这个结论吗?」',
      'p1:「如果是保持这个北京链家的中性乐观的话,其实还是会 miss 掉这个收入」',
      'p1:「这个东西又要参考一个,就是理论上我们当时在给其他的城市做那个预算推演的时候,就是如果你的每个价格区间它的那个市占没有达到城市的中位数,我的要求就是你们这个值一定要往上提」',
      'p2:「北京为什么那个 TR 值只有 1.8?」',
    ],
  },
  {
    id: 'T2', between: ['p1', 'p3'], topic: '上海新房 12,000 单 vs 套均价 610 万 — 量价齐升机会还是结构性失守', intensity: 0.74,
    summary: 'p3 给出的口径很直接:25 年上海新房自营做了 1.08 万单,26 年要做 1.2 万单,套均价 610 万,但市场端 1,000-2,000 万段单量增加 1,419 套,而上海链家在该段是『几乎唯一下降超过 3PP 的』,80% 的成交还集中在 800 万以下。如果保持每段市占不变,p3 估算只能做 1 万单 / 套均价 660 万 / GTV 698 亿;只有把 800-3,000 万的市占硬拔到 30%,才能既保单量又拉到 800 万套均价、做到 900 多亿 GTV。p3 自己挑明:『我们这个 12,000 单和 600 亿的套均价在现在这个市场情况下有可能是会有点矛盾的』。\n\n这与 p1 的二手叙事形成一个隐性张力:二手在『结构下沉』(高总价段失守) 中找的是『把 800-1200 万拉回来』,新房则在『结构上移』(960 万级新盘占明年 49% 供给)中赌『把高总价段市占硬拔到 30%』。两人都同意『结构错位』是核心命题,但在风险方向上一个保下沿、一个抢上沿,本质是同一支铁路两个方向的对开列车。p1 在新房部分给 p3 让出讲台并未直接挑战其假设,但在 UE 段反向提示『所有的成本都在增加』——这是对 p3 量价齐升假设的隐含约束。',
    moments: [
      'p3:「我们如果在每一个总价段的行值不变的话,我们会出现没有便宜房子可卖的问题」',
      'p3:「如果我们把这个就是 800、1,000、2,000 到 3,000 这个的行值,就是对不起,我就先硬拔统一提升到 30% 的话,我们能够保证说即使那个低总价段的市场降低了,我们也能够保证我们这个单量可以达成我们的目标」',
      'p3:「我们这个 12,000 单和 600 亿的套均价在现在这个市场情况下有可能是会有点矛盾的」',
      'p3:「这一半的市场都是由这个新的相对偏改善和高总价产品为主的」',
    ],
  },
  {
    id: 'T3', between: ['p1'], topic: '9 分房机制 — 工具自我消解,聚焦 vs 内卷', intensity: 0.66,
    summary: '9 分房本应是『爆盘成交效率』的核心抓手,但 p1 在上海口径里观察到一个工具失效的画面:『今天他是 9 分,明天不是 9 分』,因为大家不停去和业主低价或调价,使得 30 天内成为过 9 分房的占比逼近极限——『1% 每天 × 30 天 = 30%』,导致 9 分房占比越高、区划成交效率越低,出现工具被流量稀释。\n\n张力来自抓手与产品定义的错位:p1 一面在二手经营分析里把 9 分房当核心 KPI 抓,一面又承认这是个『产品上的问题』、需要给 9 分房做限制以防过分内卷。这其实是把『追逐工具』与『工具失真后的反身性』摆到了同一桌——是该让一线继续刷 9 分,还是先冻结口径?未在本次拍板,但被 p1 自己点名。这种自我矛盾的呈现是会议中少见的『工具论 vs 内卷反身论』开放分歧,虽然只有 p1 一个声音,但他在不同段落呈现了支持与反对两种立场。',
    moments: [
      'p1:「就 30 天之内成为过九分房的数量,就是等他今天是,明天,不是,反正我就给你统计一个区间内,大家知道 9 分房那个比例就是全程比例的 1%」',
      'p1:「这个会带来一个问题,就是其实你很难拒绝,就今天是 9 分,明天不是 9 分」',
      'p1:「9 分占比越来越高,那效率越来越低」',
      'p1:「这个可能是个产品上的问题,就是怎么样去给九分房做一个限制,不要出现这种由于我过分内卷导致我的 9 分房其实想让它聚焦,但实际不是有这种状态」',
    ],
  },
  {
    id: 'T4', between: ['p1', 'p2'], topic: '中后台成本 — 北京『分项不差但摊销后差很多』', intensity: 0.62,
    summary: 'p2 在 UE 对比里观察到一个反直觉现象:北京二手分摊和租赁的中后台开销看起来都好于上海,但一摊到单上,北京整体反而比上海差。他自己提出一个解释假设:是不是房江湖影响了?p1 否定了这个解释——房江湖成本走在新房 UE 里。p1 的最终归因是:北京中后台职能的人均薪资、人数和单价都偏高,绝对成本虽然分项不大,但『所有 UE 都高,理论上就是总量,总量高有可能是人数,也有可能是租金这些成本』。\n\n张力是『分项漂亮但合计难看』的悖论——p2 怀疑某条业务线在偷偷吸成本(如房江湖、新房外渠),p1 把它定性为『职能侧整体偏贵』。p2 的反复追问(『单价高还是人数高?』)实质上是要把责任落到具体可治理对象,而 p1 在这一段没有给出可执行的根因——只承认『成本刚性大于收入弹性』。这暴露了一个治理断点:UE 模型可以诊断出问题,但本次会议没法下到『谁来削』。',
    moments: [
      'p2:「我看那个 UE 就是北京和上海比那个中后台那个成本,你说那个北京高,我感觉就是那两个,一个是新房的外渠影响,还有就是新房的中后台成本偏高」',
      'p2:「那个开销,那个就是中后台开销,跟那个上海比,那个还是略好于上海的,但一摊他就比上海差好多了。我感觉是不是那房疆服影响了?」',
      'p1:「房疆服的成本都是在新的卖手里的成本」',
      'p2:「人均薪资高,人数和单价都高」',
      'p1:「我们的成本刚性是大于了这个收入的弹性,所以导致其实我们收入降得很快的时候,其实成本还在出来」',
    ],
  },
  {
    id: 'T5', between: ['p1'], topic: '经纪人提佣率 — 高提佣是稳定器还是优益毒药', intensity: 0.58,
    summary: 'p1 在 UE 方法论部分对提佣率给出一个清醒但矛盾的判断:提佣率不能只看绝对值,得看『工资 vs 社平工资 vs 提佣率 vs 单量』四组数据共同评估。低单量时高提佣是『确保人员稳定的正确事情』;但工资已高、提点率也高,就有调整空间。\n\n更尖锐的画面是:p1 提了一个『最不好的状态』——所有高开单人员的占比非常高、且职级稳定,带来的副作用是『体检率非常非常高』,『一旦实现地点化经营,对优异可能是个灾难,哗一下,这个体检全部 60% 以上』。这意味着公司当前 UE 偏好的『业务好但级别不稳』反而是优益友好的;而我们追求的稳定经营本身会反噬利润率。这个张力在会议里没有展开,但 p1 自己同时承担了支持(短期稳定要高提佣)和反对(长期稳定害死优益)两种立场,是个潜在的系统性两难。',
    moments: [
      'p1:「但如果你的其实工资已经很高,然后提点率又很高的情况下,其实这是一个可以做一些调整的空间」',
      'p1:「最不好的状态是所有的高开单的人,然后占比非常高,且他的职级很稳定。所以带来一个问题,就是他体检率非常非常高」',
      'p1:「一旦是业务特别稳定,实现了我们地点化经营,对优益可能是个灾难」',
      'p1:「就是哗一下,这个体检全部 60% 以上」',
    ],
  },
  {
    id: 'T6', between: ['p1'], topic: '经营分析颗粒度 vs 月度述职可执行性', intensity: 0.45,
    summary: 'p1 反复提示这次时间只有 50 分钟、之前的完整版做了一整天 9:30-18:30,现在的口径是『更多的时间会说一下我们看待一个城市的二手房业务一些维度』,但『结论性东西、特别细致的经营分析,可能下来还需要跟大家再去讨论』。这构成方法论层与执行层的张力:他想把这个体系制度化为月度述职工具,又坦承当前颗粒度还需要和城市/业策共创、本次不细谈。\n\n会议尾声 p1 又说『未来也不会是只是北上,2+8 的城市会一块放在一块对比,然后还有 25 个城市也会去看一下这数据是不是有参考性』——把方法论扩展到全国本身就是另一个张力点:同口径在 35 个城市的可移植性目前是个假设,没有验证。',
    moments: [
      'p1:「之前汇报这个材料用了一整天时间,从早上 9 点半一直到下午 6 点半」',
      'p1:「对于这里面一些结论性东西,包括一些特别细致的经营分析,我觉得可能下来还需要跟大家再去讨论」',
      'p1:「这次是数据出的快,没有太多时间做深入的分析」',
      'p1:「我希望未来也可以跟城市有些共创的情况」',
    ],
  },
];

const NEW_COGNITION = [
  { id: 'N1', who: 'p1', before: '市场口径就是看成交单量同比', after: '看市场必须先剔除经纪客户单(亲属过户),否则会被『市占假性提升』骗,真实中介市场是在下滑的', trigger: 'p1:「未来其实我们可能会更关注的就是剔除经纪客户单,大家的一个绝对的单量的变化」' },
  { id: 'N2', who: 'p1', before: '套均价下滑约等于市场房价跌', after: '套均价下滑相当大比例是自己成交结构问题,不是市场因素', trigger: 'p1:「这个其实有时候会能解释一个问题,就是为什么我们的那个套均价会下滑?它有时候不一定是市场因素影响,它有可能是我们自己的成交结构」' },
  { id: 'N3', who: 'p1', before: '9 分房占比越高越好(代表房源池质量)', after: '9 分房占比越高、区划成交效率越低,反而是工具失真的信号', trigger: 'p1:「9 分占比越来越高,那效率越来越低」' },
  { id: 'N4', who: 'p1', before: '看人就看人均佣金', after: '市场整体下行时,佣金作为评估口径会失准,要切到『开单能力』', trigger: 'p1:「之前可能大家看的比较多的是佣金,但因为我们整个市场来讲的话都在下降,所以我们更看重的是一个开单能力」' },
  { id: 'N5', who: 'p1', before: '商机数据多就是好', after: '同一个客户产生多个商机,得切到『客』维度去重看,才能判断真实漏斗', trigger: 'p1:「商机的可能有一个问题,就是说同一个客户可能会产生多个商机。而这个现在多个越来越多,所以我们现在以课的维度再去重新去这个审视到底我们到底有多少商机」' },
  { id: 'N6', who: 'p3', before: '市场缩量是均匀的', after: '市场缩量集中在低价段,高价段反而在涨,我们如果只在低价段经营会被结构错位甩掉', trigger: 'p3:「市场缩量了,缩得很严重,但另一方面它缩量都缩在低价市场上,就是高价市场的那个价格段的那个增长特别严重」' },
  { id: 'N7', who: 'p1', before: '高提佣 = 经纪人稳定 = 公司好', after: '稳定的高开单 + 稳定职级会推体检率到 60%+,反而是优益的灾难', trigger: 'p1:「一旦是业务特别稳定,实现了我们地点化经营,对优益可能是个灾难。就是哗一下,这个体检全部 60% 以上」' },
  { id: 'N8', who: 'p2', before: '中后台成本北京和上海应该差不多', after: '北京中后台分项看似更好,但 UE 摊销后比上海差很多,病灶在职能成本', trigger: 'p2:「那个开销,那个就是中后台开销,跟那个上海比,那个还是略好于上海的,但一摊他就比上海差好多了」' },
];

const FOCUS_MAP = [
  { who: 'p1', themes: ['量价拆解(成交-网签-剔除)', '套均价结构归因', '9 分房抓手', 'UE 城市同口径', '提佣率与体检率', '中后台成本刚性'], returnsTo: 18 },
  { who: 'p2', themes: ['市场总单量口径', 'TR 值真伪', '中后台成本分摊', '新房外渠归因', '人均薪资 vs 人数'], returnsTo: 6 },
  { who: 'p3', themes: ['新房量价错位', '960 万新盘供给', '套均价 vs 单量矛盾', '房江湖增量', '新房商机漏斗'], returnsTo: 5 },
];

const CONSENSUS = [
  { id: 'C1', kind: 'consensus', text: '26 年经营分析必须三段式:量(剔除经纪客户单的真实中介市场)→价(套均价拆结构 + 费率)→优异(到业务线/人/管理岗)', supportedBy: ['p1', 'p2', 'p3'], sides: [] },
  { id: 'C2', kind: 'consensus', text: '市场分析的正确顺序是先看市场 → 再看自己 → 再看平台', supportedBy: ['p1'], sides: [] },
  { id: 'C3', kind: 'consensus', text: '北京二手套均价(372 万)与 12 月实际(373 万)接近,26 年要提价只能靠 800-1200 万段市占抢回', supportedBy: ['p1'], sides: [] },
  { id: 'C4', kind: 'consensus', text: '上海新房 25 年自营基本与市场持平甚至略好(月均 900+ 套 vs 市场 4000),但套均价比市场低 170 万', supportedBy: ['p3'], sides: [] },
  { id: 'C5', kind: 'consensus', text: '新房 25 年头中尾盘费率已经被『市场难度对齐』和管理动作合力拉到 3.5%,继续靠费率提利润空间已小', supportedBy: ['p3'], sides: [] },
  { id: 'C6', kind: 'consensus', text: '经纪人评估应同时看『工资 vs 社平 vs 提佣率 vs 开单量』四组数据,单看任何一项都会误判', supportedBy: ['p1'], sides: [] },
  { id: 'C7', kind: 'consensus', text: '『一单到账』(单均 UE)比『总收入』更适合做城市同口径对比', supportedBy: ['p1', 'p2'], sides: [] },
  { id: 'D1', kind: 'divergence', text: '26 年北京二手 62.2 亿是不是一个可达成的目标', supportedBy: [], sides: [
    { stance: '中性乐观也 miss,需向下修正', reason: '300-800 万绝对单量、800-1200 万市占双降,套均价升不动', by: ['p1'] },
    { stance: '目标已下达,需要靠系数法把每段市占往上拉', reason: '对其他城市做预算时强制要求每段市占≥城市中位数', by: ['p1'] },
  ]},
  { id: 'D2', kind: 'divergence', text: '9 分房机制是否需要产品级限制', supportedBy: [], sides: [
    { stance: '需要限制,不能让占比无限滚到 30%', reason: '工具失真,不再聚焦', by: ['p1'] },
    { stance: '现状先维持,靠经纪人多签来拉占比', reason: '上海一线已形成『不停低价 + 调价』的内卷路径依赖', by: ['p1'] },
  ]},
  { id: 'D3', kind: 'divergence', text: '中后台成本北京偏高的根因', supportedBy: [], sides: [
    { stance: '新房外渠 + 房江湖在吸成本', reason: '新房外渠和中后台都偏高', by: ['p2'] },
    { stance: '是职能侧整体绝对人数/单价高,不是某条业务线的特质', reason: '所有 UE 都在中后台行高,说明是总量问题', by: ['p1'] },
  ]},
  { id: 'D4', kind: 'divergence', text: '上海新房 12,000 单 + 套均价 610 万的预算可达性', supportedBy: [], sides: [
    { stance: '结构性矛盾,要么放单量要么调价', reason: '低总价段供给会萎缩,高总价段市占未补回', by: ['p3'] },
    { stance: '把 800-3,000 万每段市占硬拔到 30%,可量价齐升做到 900 亿 GTV', reason: '26 年新盘 49% 供给在改善型,正是抢市占窗口', by: ['p3'] },
  ]},
];

const CROSS_VIEW = [
  { id: 'V1', claimBy: 'p1', claim: '市场都从因为这是成交的概念的口径,如果从剔除了客户端的自己的行值来看,北京下滑 1.8PP、上海下滑 1.3PP', responses: [
    { who: 'p2', stance: 'partial', text: '市场整体的成交量是 25 年跟 24 年是基本持平的,我们刨去 70 多户之后才少了八千多单,口径要对清楚' },
    { who: 'p3', stance: 'support', text: '新房也是同样,你看北京自营月均 900+ 套同比降 8%,市场降 6%,刨去不合作那 2,000 多套后基本与市场持平甚至略好' },
  ]},
  { id: 'V2', claimBy: 'p3', claim: '如果各价段市占不变,我们会出现没有便宜房子可卖的问题,只能做 1 万单 / 套均价 660 万 / GTV 698 亿', responses: [
    { who: 'p3', stance: 'partial', text: '把 800-3000 万段市占硬拔到 30%,可以同时实现量与套均价齐升,GTV 到 900 多亿,但贵房子很难再加费率' },
    { who: 'p1', stance: 'support', text: '二手也类似,北京要实现 62.2 亿前提是 800-1200 万系数得增长,大部分得增长到这' },
  ]},
  { id: 'V3', claimBy: 'p1', claim: '9 分房占比越来越高,但区划成交效率越来越低,这是产品级要做限制的信号', responses: [
    { who: 'p1', stance: 'partial', text: '另一面,上海现在的内卷已经形成路径依赖,你今天是 9 分明天不是 9 分,反而难拒绝' },
  ]},
  { id: 'V4', claimBy: 'p2', claim: '北京中后台分项不比上海差,一摊到单上反而比上海差很多,可能是房江湖在吸', responses: [
    { who: 'p1', stance: 'against', text: '房疆服的成本都在新房卖手里,不在中后台,病灶是职能侧人数与单价均偏高' },
    { who: 'p2', stance: 'partial', text: '那就是人均薪资高,人数和单价都高' },
  ]},
  { id: 'V5', claimBy: 'p1', claim: '提佣率不能看绝对值,要四组数据(工资/社平/提佣/单量)联看', responses: [
    { who: 'p1', stance: 'partial', text: '但理论上业务越稳定、职级越稳,体检率越高,反而对优益是灾难' },
  ]},
];

const AXES = {
  people: {
    axis: 'people',
    commitments: [
      { id: 'K-D8E1-A1', who: 'p1', meeting: 'M-D8E1', what: '补全北京同比口径(含 24 年同期)的爆盘率与爆盘成交效率', due: '—', state: 'on-track', progress: 0.4 },
      { id: 'K-D8E1-A2', who: 'p1', meeting: 'M-D8E1', what: '对北京二手 800-1200 万价段做系数法市占测算并下发城市侧', due: '—', state: 'at-risk', progress: 0.3 },
      { id: 'K-D8E1-A3', who: 'p3', meeting: 'M-D8E1', what: '盘点 26 年北京新房 41+40+16 个项目开盘节奏与套均价(960 万级新盘占明年 49%)', due: '—', state: 'on-track', progress: 0.6 },
      { id: 'K-D8E1-A4', who: 'p1', meeting: 'M-D8E1', what: '9 分房占比 vs 区划成交效率的产品级限制建议', due: '—', state: 'at-risk', progress: 0.2 },
      { id: 'K-D8E1-A5', who: 'p1', meeting: 'M-D8E1', what: '建立月度版经营分析述职模板交 CEO 简报', due: '—', state: 'on-track', progress: 0.5 },
      { id: 'K-D8E1-A6', who: 'p1', meeting: 'M-D8E1', what: '8+2+25 城同口径 UE 模型扩展并诊断中后台成本刚性', due: '—', state: 'at-risk', progress: 0.25 },
    ],
    peopleStats: [
      { who: 'p1', fulfillment: null, avgLatency: '—', claims: 22, followThroughGrade: 'A', roleTrajectory: [{ m: 'M-2026-03', role: '提出者' }, { m: 'M-2026-03', role: '决策者' }], speechHighEntropy: 0.78, beingFollowedUp: 6, silentOnTopics: ['金融产品对高总价段成交的具体路径'] },
      { who: 'p2', fulfillment: null, avgLatency: '—', claims: 6, followThroughGrade: 'B+', roleTrajectory: [{ m: 'M-2026-03', role: '质疑者' }], speechHighEntropy: 0.62, beingFollowedUp: 2, silentOnTopics: ['9 分房机制', '提佣率体检率两难'] },
      { who: 'p3', fulfillment: null, avgLatency: '—', claims: 8, followThroughGrade: 'A-', roleTrajectory: [{ m: 'M-2026-03', role: '提出者' }], speechHighEntropy: 0.7, beingFollowedUp: 1, silentOnTopics: ['二手 9 分房', '管理岗 UE'] },
    ],
  },
  knowledge: {
    axis: 'knowledge',
    reusableJudgments: [
      { id: 'J-01', text: '市场分析顺序必须是『市场 → 自己 → 平台』,先用市场口径校准基线,再判自己经营好坏', abstractedFrom: 'p1 反复在二手与新房分析里坚持先看市场量再看自己市占', generalityScore: 0.85, reuseCount: 3, linkedMeetings: ['M-D8E1'], domain: '经营分析方法论', author: 'E01-MACRO 经营分析专家' },
      { id: 'J-02', text: '套均价同比下滑要先归因到自己的成交结构,再归因到市场房价', abstractedFrom: '300-1200 万绝对单量下滑直接拉低套均价', generalityScore: 0.8, reuseCount: 2, linkedMeetings: ['M-D8E1'], domain: '二手交易', author: 'E08.RESID 住宅' },
      { id: 'J-03', text: '市场口径必须剔除关联交易(亲属过户/经纪客户单)才能看到真实可服务市场', abstractedFrom: 'Q4 亲属过户北京 6.4 / 上海 8.5 ,远高于年均', generalityScore: 0.88, reuseCount: 4, linkedMeetings: ['M-D8E1'], domain: '市场度量', author: 'E08.POLICY 住房政策' },
      { id: 'J-04', text: '经纪人评估必须『工资/社平/提佣率/单量』四组数据联看,任何单一指标都会失真', abstractedFrom: 'p1 提佣率方法论段落', generalityScore: 0.78, reuseCount: 2, linkedMeetings: ['M-D8E1'], domain: '组织效能', author: 'E10.SW 工业软件' },
      { id: 'J-05', text: '工具占比与工具效率背离,是工具失真的早期信号', abstractedFrom: '9 分房占比上升、区划成交效率下降', generalityScore: 0.82, reuseCount: 1, linkedMeetings: ['M-D8E1'], domain: '产品/运营', author: 'E07.APP AI 应用' },
      { id: 'J-06', text: 'UE 视角下,业务稳定 + 职级稳定 = 体检率上升 = 利润恶化,稳定不是无成本的', abstractedFrom: 'p1 对地点化经营的反向判断', generalityScore: 0.7, reuseCount: 1, linkedMeetings: ['M-D8E1'], domain: '组织/财务', author: 'E11.GOV 公司治理' },
      { id: 'J-07', text: '中后台分项指标好不一定 UE 好,要看摊销后的总量是否高', abstractedFrom: 'p2 与 p1 关于北京中后台分摊后变差的对话', generalityScore: 0.83, reuseCount: 2, linkedMeetings: ['M-D8E1'], domain: '财务分析', author: 'E11.GOV' },
    ],
    mentalModels: [
      { id: 'MM-01', name: 'Addressable Market(可服务市场)', invokedBy: 'p1', invokedCount: 2, correctly: true, outcome: '用『真实中介市场』而非全市场作为分母,让市占讨论有意义', expert: 'E08.POLICY' },
      { id: 'MM-02', name: '结构归因优先于价格归因', invokedBy: 'p1', invokedCount: 4, correctly: true, outcome: '套均价下滑首先指向成交结构,再指向市场房价', expert: 'E08.RESID' },
      { id: 'MM-03', name: '漏斗稀释效应', invokedBy: 'p1', invokedCount: 2, correctly: true, outcome: '9 分房占比与效率背离 / 商机与课维度去重', expert: 'E07.APP' },
      { id: 'MM-04', name: '成本刚性 vs 收入弹性', invokedBy: 'p1', invokedCount: 1, correctly: true, outcome: '解释为什么收入下滑时利润恶化更快', expert: 'E11.GOV' },
      { id: 'MM-05', name: 'Unit Economics(单元经济)', invokedBy: 'p1', invokedCount: 5, correctly: true, outcome: '以单均 UE 替代总收入做城市同口径对比', expert: 'E11.GOV' },
      { id: 'MM-06', name: '二阶效应 — 稳定的副作用', invokedBy: 'p1', invokedCount: 1, correctly: true, outcome: '稳定 → 体检率高 → 优益恶化', expert: 'E11.GOV' },
    ],
    evidenceGrades: [
      { grade: 'A · 硬数据', count: 24, examples: ['北京 25 年自营成交同比降 8,400 单', '新房月均 3,000 套(北京) vs 4,000 套(上海)', '9 分房极限 30%(每天 1%×30 天)', '新房商机转成交从千 2.8 降到千 2.2', '北京二手预算 62.2 亿 / 套均价预估 372 万 / 12 月实际 373 万', '上海新房 25 年 1.08 万单、26 年预算 1.2 万单 / 套均价 610 万', '26 年新盘 41+40+16 个项目 / 套均价 960 万 / 占明年市场 49%', '新房费率头中尾盘对齐 3.5%'] },
      { grade: 'B · 类比 / 案例', count: 6, examples: ['上海做大店 793 家', '北京 GTV 与上海实体门店对比', '二手与新房同套量价拆解类比'] },
      { grade: 'C · 直觉 / 口述', count: 5, examples: ['『最不好的状态是体检率全部 60%+ 是优益的灾难』', '『系数法每段市占要拉到中位数』', '『成本刚性大于收入弹性』'] },
      { grade: 'D · 道听途说', count: 1, examples: ['『大家会有一个声音,租赁经纪人不稳定/不赚钱』'] },
    ],
    cognitiveBiases: [
      { id: 'B-01', name: '锚定效应', where: '26 年北京二手 62.2 亿预算紧贴 25 年实际收入', by: ['p1'], severity: 'med', mitigated: false, mitigation: 'p1 已在中性乐观下提示会 miss,但目标未调' },
      { id: 'B-02', name: '幸存者偏差', where: '看人均开单能力时只统计『年末在职 2,544 人』,离职人不计', by: ['p1'], severity: 'low', mitigated: true, mitigation: 'p1 主动声明取数逻辑' },
      { id: 'B-03', name: '确认偏误(归因)', where: 'p2 假设『北京中后台高 = 房江湖影响』', by: ['p2'], severity: 'low', mitigated: true, mitigation: 'p1 直接否定『房江湖在新房卖手里』' },
      { id: 'B-04', name: '口径混淆 / 框架效应', where: '市场口径成交 vs 网签错期 2-3 个月,易把不同口径数据并列', by: ['p1', 'p2'], severity: 'med', mitigated: true, mitigation: 'p1 在 p2 追问下澄清成交/网签错期' },
      { id: 'B-05', name: '过度自信', where: 'p3 假设把 800-3000 万段市占『硬拔到 30%』即可量价齐升', by: ['p3'], severity: 'high', mitigated: false, mitigation: '未对硬拔的可行性做敏感性分析' },
      { id: 'B-06', name: '工具崇拜偏误', where: '9 分房占比作为 KPI 在一线被追逐', by: ['p1'], severity: 'med', mitigated: false, mitigation: 'p1 提议产品级限制,但未拍板' },
    ],
    counterfactuals: [
      { id: 'CF-01', path: '26 年北京二手维持 24-25 年自然下滑曲线,不强拉 800-1200 万市占', rejectedAt: 'M-D8E1', rejectedBy: ['p1'], trackingNote: '若到 26Q2 仍未补回该价段,需重新评估 62.2 亿目标', validityCheckAt: '2026-07-31' },
      { id: 'CF-02', path: '上海新房保持每段市占不变 → 1 万单 / 套均价 660 万 / GTV 698 亿', rejectedAt: 'M-D8E1', rejectedBy: ['p3'], trackingNote: '若 26H1 高总价段市占无法硬拔,降到该路径', validityCheckAt: '2026-07-31' },
      { id: 'CF-03', path: '9 分房机制不限制,任由占比上探至 30% 极限', rejectedAt: 'M-D8E1', rejectedBy: ['p1'], trackingNote: '若产品端限制半年内未上线,工具语义失效', validityCheckAt: '2026-09-30' },
    ],
  },
  meta: {
    axis: 'meta',
    decisionQuality: {
      overall: 0.62,
      dims: [
        { id: 'clarity', label: '清晰度', score: 0.78, note: '三段式量价 UE 框架清晰,但 26 年目标到底改不改没拍板' },
        { id: 'actionable', label: '可执行', score: 0.55, note: '多数下一步是『未来再细谈』,缺时间锚点' },
        { id: 'traceable', label: '可追溯', score: 0.7, note: '每段都有具体口径与数字,但所有交付物 due 都是 —' },
        { id: 'falsifiable', label: '可证伪', score: 0.6, note: '62.2 亿 / 12,000 单 / 9 分房限制 都给了可证伪的预测' },
        { id: 'aligned', label: '对齐度', score: 0.5, note: 'p2 的 UE 质询和 p1 的方法论讲解,目标各异,未在本场对齐到拍板' },
      ],
    },
    necessity: {
      verdict: '现行时长合理但应缩减汇报、增加质询', score: 0.55,
      reasons: [
        { k: '只读汇报段过多', t: 'p1 占讲台超 80%,大量篇幅复述材料,可前置发文' },
        { k: '决策缺位', t: '26 年预算修正与 9 分房机制都未拍板' },
        { k: 'p2 的质询是高价值段', t: '应安排单独 30 分钟 UE Q&A' },
      ],
    },
    emotionCurve: [
      { t: 0, v: 0.1, i: 0.2, tag: '开场 · 问候 + 自我介绍' },
      { t: 5, v: 0.0, i: 0.4, tag: '二手量价框架展开' },
      { t: 13, v: -0.2, i: 0.65, tag: 'p2 首次追问『市场少多少单』' },
      { t: 18, v: -0.35, i: 0.7, tag: '中性乐观也会 miss 收入' },
      { t: 28, v: 0.0, i: 0.5, tag: '新房接棒,p3 开讲' },
      { t: 33, v: -0.3, i: 0.72, tag: '12,000 单 vs 套均价矛盾' },
      { t: 41, v: -0.5, i: 0.85, tag: '提佣率体检率灾难假设' },
      { t: 50, v: -0.4, i: 0.8, tag: 'p2 中后台成本刚性追问最激烈段' },
      { t: 54, v: 0.1, i: 0.3, tag: '收尾 · 休息 1 分钟' },
    ],
  },
  projects: {
    project: { id: 'P-LIANJIA-BJSH-2026', name: '北上链家 2026 经营分析与预算', status: 'active', meetings: 1, decisions: 3, openItems: 8 },
    decisionChain: [
      { id: 'D-01', at: 'M-D8E1', title: '采用『市场→自己→平台』三层验证 + 量(剔除经纪客户单)/价/UE 三段式分析框架', who: 'p1', basedOn: '经营分析在过去口径下被亲属过户与佣金均值掩盖结构问题', confidence: 0.85, superseded: false, current: true },
      { id: 'D-02', at: 'M-D8E1', title: '26 年北京二手收入达成必须依赖 800-1200 万段市占强拉(系数法)', who: 'p1', basedOn: '300-1200 万绝对单量与市占双降,套均价已贴 12 月底', confidence: 0.65, superseded: false, current: true },
      { id: 'D-03', at: 'M-D8E1', title: '上海新房『硬拔 800-3000 万段市占至 30%』为量价齐升的关键路径(默认主路径)', who: 'p3', basedOn: '26 年新盘 49% 在改善型 + 头中尾盘费率已对齐 3.5% 无空间', confidence: 0.55, superseded: false, current: true },
      { id: 'D-04', at: 'M-D8E1', title: '建立『一单到账(单均 UE)』作为 8+2+25 城同口径对比的主指标', who: 'p1', basedOn: '总收入受规模与结构影响大,无法横向', confidence: 0.8, superseded: false, current: true },
    ],
    assumptions: [
      { id: 'AS-01', text: '26 年市场各价段同比变动延续 25 年趋势(用于 p3 上海新房推演)', underpins: ['D-03'], introducedAt: 'M-D8E1', by: 'p3', evidenceGrade: 'C', verificationState: '未验证 · 高风险', verifier: 'p3', verifyDue: '持续', confidence: 0.5 },
      { id: 'AS-02', text: '高总价段(800-1200 万)是中介可抢市占的窗口而非天然守不住', underpins: ['D-02'], introducedAt: 'M-D8E1', by: 'p1', evidenceGrade: 'B', verificationState: '观察中', verifier: 'p1', verifyDue: '—', confidence: 0.6 },
      { id: 'AS-03', text: '9 分房产品级限制能恢复工具聚焦语义', underpins: ['D-01'], introducedAt: 'M-D8E1', by: 'p1', evidenceGrade: 'C', verificationState: '未验证', verifier: '—', verifyDue: '—', confidence: 0.5 },
      { id: 'AS-04', text: '中后台成本下降比收入下降更慢(成本刚性 > 收入弹性)是结构性而非周期性', underpins: ['D-04'], introducedAt: 'M-D8E1', by: 'p1', evidenceGrade: 'B', verificationState: '观察中', verifier: 'p1', verifyDue: '—', confidence: 0.65 },
      { id: 'AS-05', text: '经纪人开单能力提升至 1.8 单/人/年可支撑 26 年 9 万-3.6 万 = 5.4 万自营单', underpins: ['D-02'], introducedAt: 'M-D8E1', by: 'p1', evidenceGrade: 'B', verificationState: '测试中', verifier: 'p1', verifyDue: '—', confidence: 0.55 },
    ],
    openQuestions: [
      { id: 'Q-01', text: '北京二手 26 年 62.2 亿预算是否需要向下修正,以及修正后的口径是否含新主播单', raisedAt: 'M-D8E1', by: 'p1', timesRaised: 3, lastRaised: '2026-03-04', category: 'strategic', status: 'open', owner: 'p1', due: '—' },
      { id: 'Q-02', text: '9 分房机制如何在产品层做限制以避免内卷稀释', raisedAt: 'M-D8E1', by: 'p1', timesRaised: 2, lastRaised: '2026-03-04', category: 'operational', status: 'chronic', owner: '—', due: '—' },
      { id: 'Q-03', text: '北京中后台职能的人均薪资/人数/单价偏高根因到底落到哪条业务线/哪个职能', raisedAt: 'M-D8E1', by: 'p2', timesRaised: 4, lastRaised: '2026-03-04', category: 'governance', status: 'open', owner: 'p1', due: '—' },
      { id: 'Q-04', text: '上海新房『硬拔市占』是否可行 — 改善型客户与渠道能力是否到位', raisedAt: 'M-D8E1', by: 'p3', timesRaised: 2, lastRaised: '2026-03-04', category: 'analytical', status: 'open', owner: 'p3', due: '—' },
      { id: 'Q-05', text: '新房直销人员开单率仅 15-20% — 是否要重组角色/精准分发商机', raisedAt: 'M-D8E1', by: 'p3', timesRaised: 1, lastRaised: '2026-03-04', category: 'operational', status: 'open', owner: '—', due: '—' },
    ],
    risks: [
      { id: 'R-01', text: '北京二手 62.2 亿预算 miss 风险', mentions: 4, hasAction: true, action: 'p1 用系数法对 800-1200 万段做向上提升测算', severity: 'high', heat: 0.85, meetings: 1, trend: 'up' },
      { id: 'R-02', text: '上海新房 12,000 单 + 套均价 610 万矛盾', mentions: 3, hasAction: true, action: '硬拔市占 30% 或调单量/调费率', severity: 'high', heat: 0.78, meetings: 1, trend: 'up' },
      { id: 'R-03', text: '9 分房工具语义失真', mentions: 3, hasAction: false, severity: 'med', heat: 0.55, meetings: 1, trend: 'flat' },
      { id: 'R-04', text: '中后台成本刚性 > 收入弹性', mentions: 5, hasAction: false, severity: 'high', heat: 0.8, meetings: 1, trend: 'up' },
      { id: 'R-05', text: '新房商机转成交率从 0.28% 降到 0.22%', mentions: 1, hasAction: false, severity: 'med', heat: 0.5, meetings: 1, trend: 'down' },
      { id: 'R-06', text: '北京新房在昌平/朝新/朝阳高地价区域市占同比降 4-8PP', mentions: 1, hasAction: false, severity: 'high', heat: 0.7, meetings: 1, trend: 'down' },
      { id: 'R-07', text: '上海经纪人单经纪人 UE 损失约 8 万元 / 流动性高', mentions: 1, hasAction: false, severity: 'med', heat: 0.45, meetings: 1, trend: 'flat' },
    ],
  },
  tension: [
    { id: 'T-01', between: ['p1', 'p2'], topic: '26 年北京二手 62.2 亿可达成性', intensity: 0.78, summary: '见 analysis.tension.T1', moments: ['p1:「如果是保持这个北京链家的中性乐观的话,其实还是会 miss 掉这个收入」', 'p2:「北京为什么那个 TR 值只有 1.8?」'] },
    { id: 'T-02', between: ['p1', 'p3'], topic: '新房 12,000 单 vs 套均价 610 万', intensity: 0.74, summary: '见 analysis.tension.T2', moments: ['p3:「我们这个 12,000 单和 600 亿的套均价在现在这个市场情况下有可能是会有点矛盾的」'] },
    { id: 'T-03', between: ['p1'], topic: '9 分房机制内卷 vs 聚焦', intensity: 0.66, summary: '见 analysis.tension.T3', moments: ['p1:「9 分占比越来越高,那效率越来越低」'] },
    { id: 'T-04', between: ['p1', 'p2'], topic: '北京中后台 UE 摊销悖论', intensity: 0.62, summary: '见 analysis.tension.T4', moments: ['p2:「那个开销...略好于上海的,但一摊他就比上海差好多了」'] },
    { id: 'T-05', between: ['p1'], topic: '提佣率稳定器 vs 优益毒药', intensity: 0.58, summary: '见 analysis.tension.T5', moments: ['p1:「一旦是业务特别稳定,实现了我们地点化经营,对优益可能是个灾难」'] },
  ],
};

const FACTS = [
  { subject: '北京链家二手', predicate: '25年自营成交单量同比下滑(剔除亲属过户)', object: '下降 8,400 余单', confidence: 0.95, taxonomy_code: 'E08.RESID', context: { quote: 'p1:「就北京这边下滑比较厉害,就是绝对值上下降 8,400 多单」' } },
  { subject: '上海链家二手', predicate: 'Q4 亲属过户占比', object: '约 8.5%', confidence: 0.92, taxonomy_code: 'E08.POLICY', context: { quote: 'p1:「上海可能是 8.5」' } },
  { subject: '套均价', predicate: '下滑归因于', object: '成交结构而非市场房价', confidence: 0.88, taxonomy_code: 'E08.RESID', context: { quote: 'p1:「它有时候不一定是市场因素影响,它有可能是我们自己的成交结构」' } },
  { subject: '9 分房', predicate: '占比与区划成交效率背离', object: '工具语义失真', confidence: 0.85, taxonomy_code: 'E07.APP', context: { quote: 'p1:「9 分占比越来越高,那效率越来越低」' } },
  { subject: '北京二手 26 年预算', predicate: '锚定金额', object: '62.2 亿元', confidence: 0.95, taxonomy_code: 'E08.RESID', context: { quote: 'p1:「现在这个北京的这个二手的预算是 62.2 亿」' } },
  { subject: '北京二手 26 年套均价预估', predicate: '等于', object: '372 万(12 月实际 373 万)', confidence: 0.92, taxonomy_code: 'E08.RESID', context: { quote: 'p1:「北店现在目前对于明年的套中价的预估是 372 亿多,12 月的成交价是 373」' } },
  { subject: '上海新房 25 年自营单量', predicate: '等于', object: '1.08 万单 / 26 年预算 1.2 万单 / 套均价 610 万', confidence: 0.95, taxonomy_code: 'E08.RESID', context: { quote: 'p3:「我们自己的新房预算是我们今年做了 1.08 万单,然后明年的预算是 1.2 万单,然后我们的预算的套均价是 610 万」' } },
  { subject: '上海新房新供给', predicate: '26 年 41+40+16 个项目套均价', object: '约 960 万 / 占明年市场 49%', confidence: 0.92, taxonomy_code: 'E08.COMM', context: { quote: 'p3:「这些新项目的套均价大概是 960 万...全市场的 49% 差不多」' } },
  { subject: '新房费率', predicate: '头中尾部盘对齐', object: '约 3.5%', confidence: 0.9, taxonomy_code: 'E08.RESID', context: { quote: 'p3:「到了 25 年我们的头中尾部盘费率基本就拉齐在 3.5% 了」' } },
  { subject: '新房商机转成交率', predicate: '25 年北京由 24 年下降', object: '千 2.8 → 千 2.2', confidence: 0.93, taxonomy_code: 'E08.RESID', context: { quote: 'p3:「我们商机转成交率在 25 年北链是百分之,就是千二千 2.2,然后在 24 年的时候还是千 2.8」' } },
  { subject: '新房直销人员', predicate: '月均破蛋率', object: '15%-20%', confidence: 0.9, taxonomy_code: 'E08.RESID', context: { quote: 'p3:「我们现在新房的直销人员的开单比例,每个月就是这个破蛋率大概只有 15% ~ 20% 之间」' } },
  { subject: '北京中后台成本', predicate: '分摊到 UE 后', object: '高于上海(职能侧人数与单价均偏高)', confidence: 0.85, taxonomy_code: 'E11.GOV', context: { quote: 'p2:「那个开销...略好于上海的,但一摊他就比上海差好多了」' } },
  { subject: '上海经纪人', predicate: '单人年均 UE 损失', object: '约 8 万元', confidence: 0.85, taxonomy_code: 'E10.SW', context: { quote: 'p1:「一个经纪人一年带来的这个 UV 损失差不多是 8 万块钱」' } },
  { subject: '9 分房机制', predicate: '极限占比', object: '30%(每天 1% × 30 天)', confidence: 0.92, taxonomy_code: 'E07.APP', context: { quote: 'p1:「就 30 天之内成为过九分房的数量...全程比例的 1%」' } },
  { subject: '北京新房', predicate: '在昌平/朝新/朝阳同比', object: '市占降 4-8PP', confidence: 0.9, taxonomy_code: 'E08.RESID', context: { quote: 'p3:「我们在昌平、朝新和朝阳这三个出了比较高地价的那个高总价段的产品的地方,我们的行值同比是有 4 个点到 8 个点的下降」' } },
];

const WIKI_SOURCE_ENTRY = `---
type: source
subtype: meeting
meetingId: d8e1a13b-cbd0-47b3-a96a-ca08a6fb0046
date: 2026-03-04
title: 北上链家业务经营分析与预算规划
participants: [说话人1, 说话人2, 说话人3]
app: meeting-notes
generatedBy: claude-cli
lastEditedAt: 2026-04-29T00:00:00Z
---

## 一、决议

会议确立了 26 年北上链家经营分析与预算审视的统一方法论:量 → 价 → 优异(UE)三段式拆解。其中量的拆解坚持『市场 → 自己 → 平台』三层验证,且市场口径必须剔除经纪客户单(亲属过户)以还原真实可服务市场;价的拆解切到套均价结构归因 + 费率;UE 切到业务线/人员/管理岗的同口径对比。

会上对 26 年两个核心预算给出明确风险提示:北京二手 62.2 亿(套均价预估 372 万、12 月实际 373 万)在中性乐观下也会 miss,达成依赖 800-1200 万价段市占强拉;上海新房 12,000 单 / 套均价 610 万 / GTV 600 亿在当前市场结构下与套均价目标存在矛盾,主路径是把 800-3000 万段市占硬拔到 30% 以求量价齐升至 GTV 900 亿。

方法论本身将形成月度经营述职模板,未来扩展至 8+2+25 城同口径对比,并以单均 UE(一单到账)作为主指标。

## 二、主要张力 · Tensions

### T1 · 26 年北京二手 62.2 亿可达成性 — [[说话人1]] vs [[说话人2]] · 强度 0.78
p1 反复给出 25 年自营成交剔除亲属过户后同比下滑 8,400 余单、300-1200 万段绝对单量与市占双降的硬数据,自承『中性乐观下也会 miss 收入』;p2 在数据层不断追问:市场整体成交基本持平、刨去 70 多户后我们少了八千多单是吗?北京 TR 为什么只有 1.8?p1 用结构性归因软化目标,p2 把目标钉到费率与提点的真实约束上。
- 「就北京这边下滑比较厉害,就是绝对值上下降 8,400 多单」
- 「市场整体的成交量是 25 年跟 24 年是基本持平的...刨去 70 多户之后,我们少了八千多单」
- 「如果是保持这个北京链家的中性乐观的话,其实还是会 miss 掉这个收入」
- 「北京为什么那个 TR 值只有 1.8?」

### T2 · 上海新房 12,000 单 vs 套均价 610 万 — [[说话人3]] · 强度 0.74
p3 自承 12,000 单 + 600 亿 GTV 与 610 万套均价存在矛盾;若各价段市占不变只能做 1 万单 / 套均价 660 万 / GTV 698 亿;只有把 800-3000 万段市占硬拔到 30% 才能量价齐升到 900 亿,但贵房子已无费率空间。
- 「我们如果在每一个总价段的行值不变的话,我们会出现没有便宜房子可卖的问题」
- 「就是对不起,我就先硬拔统一提升到 30%」
- 「12,000 单和 600 亿的套均价在现在这个市场情况下有可能是会有点矛盾的」
- 「这一半的市场都是由这个新的相对偏改善和高总价产品为主的」

### T3 · 9 分房机制内卷 vs 聚焦 — [[说话人1]] · 强度 0.66
9 分房本应是爆盘成交效率核心抓手,上海一线靠不停低价 + 调价把 30 天内成为过 9 分房的占比逼近 30% 极限,导致 9 分房占比上升、区划成交效率下降,工具失真。
- 「30 天之内成为过九分房的数量...全程比例的 1%」
- 「9 分占比越来越高,那效率越来越低」
- 「这个可能是个产品上的问题」
- 「不要出现这种由于我过分内卷导致我的 9 分房其实想让它聚焦,但实际不是有这种状态」

### T4 · 北京中后台 UE 摊销悖论 — [[说话人2]] vs [[说话人1]] · 强度 0.62
北京中后台分项不比上海差,一摊到单上反而比上海差很多。p2 假设是房江湖在吸,p1 否认并归因到职能侧人均薪资 + 人数 + 单价均高,落入『成本刚性大于收入弹性』。
- 「那个开销...略好于上海的,但一摊他就比上海差好多了。我感觉是不是那房疆服影响了?」
- 「房疆服的成本都是在新的卖手里的成本」
- 「人均薪资高,人数和单价都高」
- 「我们的成本刚性是大于了这个收入的弹性」

### T5 · 提佣率稳定器 vs 优益毒药 — [[说话人1]] · 强度 0.58
提佣率不能看绝对值,要工资/社平/提佣/单量四组数据联看;但业务稳定 + 职级稳 → 体检率上 60%+,反而是优益的灾难。
- 「但如果你的其实工资已经很高,然后提点率又很高的情况下,其实这是一个可以做一些调整的空间」
- 「最不好的状态是所有的高开单的人,然后占比非常高,且他的职级很稳定」
- 「一旦是业务特别稳定,实现了我们地点化经营,对优益可能是个灾难」
- 「就是哗一下,这个体检全部 60% 以上」

## 三、共识 · Consensus

- C1 · 26 年经营分析坚持量(剔除经纪客户单)/价/UE 三段式拆解 · 支持: [[说话人1]] / [[说话人2]] / [[说话人3]]
- C2 · 市场分析顺序必须『市场 → 自己 → 平台』 · 支持: [[说话人1]]
- C3 · 北京二手套均价 12 月实际 373 万,26 年要提价只能靠 800-1200 万段市占抢回 · 支持: [[说话人1]]
- C4 · 上海新房 25 年自营月均 900+ 套与市场基本持平甚至略好 · 支持: [[说话人3]]
- C5 · 新房头中尾盘费率已对齐 3.5%,继续靠费率提利润空间已小 · 支持: [[说话人3]]
- C6 · 经纪人评估必须『工资 vs 社平 vs 提佣率 vs 开单量』四组数据联看 · 支持: [[说话人1]]
- C7 · 单均 UE(一单到账)是城市同口径对比主指标 · 支持: [[说话人1]] / [[说话人2]]

**分歧:**
- D1 · 26 年北京二手 62.2 亿是否可达成 · [[说话人1]]:中性乐观会 miss vs [[说话人1]]:用系数法强拉每段市占至中位数
- D2 · 9 分房是否需要产品级限制 · 支持限制 [[说话人1]] vs 维持现状 [[说话人1]]
- D3 · 北京中后台高的根因 · 房江湖吸 [[说话人2]] vs 职能侧绝对偏贵 [[说话人1]]
- D4 · 上海新房 12,000 单达成路径 · 放单量调价 [[说话人3]] vs 硬拔市占 30% [[说话人3]]

## 四、决策链 · Decision Chain

### D-01 · 三段式经营分析框架(量/价/UE)
- 提出: [[说话人1]]
- 基于: 过去口径下亲属过户与佣金均值掩盖结构问题
- 承接: 后续月度述职模板与 8+2+25 城同口径扩展

### D-02 · 26 年北京二手收入达成依赖 800-1200 万段市占强拉
- 提出: [[说话人1]]
- 基于: 300-1200 万绝对单量与市占双降,套均价已贴 12 月底
- 承接: 系数法(若市占未达城市中位数则强制上提)

### D-03 · 上海新房『硬拔 800-3000 万段市占至 30%』为量价齐升主路径
- 提出: [[说话人3]]
- 基于: 26 年新盘 49% 在改善型 + 头中尾盘费率已对齐 3.5%
- 承接: 可行性需后续敏感性分析

### D-04 · 单均 UE 为城市同口径对比主指标
- 提出: [[说话人1]]
- 基于: 总收入受规模与结构影响大,无法横向
- 承接: 8+2+25 城 26 年扩展

## 五、关键判断 · Reusable Judgments

- [[市场顺序判断]] · 市场分析必须先市场后自己后平台(通用度 0.85) — by [[说话人1]]
- [[套均价归因]] · 套均价下滑要先归因结构再归因房价(通用度 0.80) — by [[说话人1]]
- [[市场口径剔除]] · 市场口径必须剔除关联交易(亲属过户/经纪客户单)才能反映真实可服务市场(通用度 0.88) — by [[说话人1]]
- [[四数联看]] · 经纪人评估必须工资/社平/提佣/单量联看(通用度 0.78) — by [[说话人1]]
- [[工具失真]] · 工具占比与工具效率背离是工具失真的早期信号(通用度 0.82) — by [[说话人1]]
- [[稳定的副作用]] · 业务稳定+职级稳定=体检率上升=利润恶化(通用度 0.70) — by [[说话人1]]

## 六、假设 + 待决问题

**假设**:
- A1 · 26 年市场各价段同比变动延续 25 年趋势 · 证据等级 C(高风险未验证)
- A2 · 高总价段(800-1200 万)是中介可抢市占窗口 · 证据等级 B
- A3 · 9 分房产品级限制能恢复工具聚焦语义 · 证据等级 C
- A4 · 中后台成本下降比收入下降更慢是结构性而非周期性 · 证据等级 B
- A5 · 经纪人开单能力可提升至 1.8 单/人/年 · 证据等级 B

**待决**:
- Q1 · 北京二手 62.2 亿是否需要向下修正 · 类别: strategic · 状态: open
- Q2 · 9 分房如何在产品层做限制 · 类别: operational · 状态: chronic
- Q3 · 北京中后台职能高的根因落到哪条业务线 · 类别: governance · 状态: open
- Q4 · 上海新房硬拔市占可行性 · 类别: analytical · 状态: open
- Q5 · 新房直销人员开单率仅 15-20% 是否要重组角色 · 类别: operational · 状态: open

## 七、心智模型 · Mental Models

- [[Addressable Market]] · invoked by [[说话人1]] · 正确使用: ✓
- [[结构归因优先于价格归因]] · invoked by [[说话人1]] · 正确使用: ✓
- [[漏斗稀释效应]] · invoked by [[说话人1]] · 正确使用: ✓
- [[成本刚性 vs 收入弹性]] · invoked by [[说话人1]] · 正确使用: ✓
- [[Unit Economics]] · invoked by [[说话人1]] · 正确使用: ✓
- [[二阶效应]] · invoked by [[说话人1]] · 正确使用: ✓

## 八、认知偏误 · Cognitive Biases

- [[锚定效应]] · severity: med · 处: 26 年北京二手 62.2 亿紧贴 25 年实际 · by [[说话人1]]
- [[幸存者偏差]] · severity: low · 处: 经纪人开单只统计年末在职 2,544 人 · by [[说话人1]] · 已主动声明取数逻辑
- [[确认偏误]] · severity: low · 处: 北京中后台高 = 房江湖影响 · by [[说话人2]] · 已被 p1 反驳
- [[过度自信]] · severity: high · 处: 上海新房硬拔 30% 市占的可行性未做敏感性 · by [[说话人3]]
- [[工具崇拜偏误]] · severity: med · 处: 9 分房占比作为 KPI 被一线追逐 · by [[说话人1]]

## 九、反事实 · Counterfactuals

- [[bj-2s-自然下滑]] · 拒绝: 26 年北京二手维持 24-25 年自然下滑、不强拉 800-1200 万 · 跟踪: 若 26Q2 仍未补回该价段,需重估 62.2 亿
- [[sh-xf-保守路径]] · 拒绝: 上海新房保持每段市占不变 · 跟踪: 若高总价段市占无法硬拔,降到 1 万单 / 698 亿
- [[9-fang-不限制]] · 拒绝: 9 分房机制不限制让占比上探 30% · 跟踪: 若产品端限制半年内未上线,工具语义失效

## 引用关键人物
- [[说话人1]]
- [[说话人2]]
- [[说话人3]]

## Wiki 实体引用
- [[北京链家]] · 在 fact #1, #5, #6 中提及
- [[上海链家]] · 在 fact #2, #7, #8 中提及
- [[9 分房]] · 在 fact #4, #14 中提及
- [[Unit Economics]] · 在 fact #12, #13 中提及
- [[亲属过户]] · 在 fact #2 中提及
- [[房江湖]] · 在 T4 中提及
`;

const ENTITY_UPDATES = [
  { type: 'entity', subtype: 'person', canonicalName: '说话人1', aliases: ['集团战略业务策略经营分析负责人(二手/租赁)'],
    initialContent: '集团战略业务策略板块负责人,自 2025 年 10 月起从汇居商业分析转任,主要分管经营分析与战略,负责二手与租赁业务的全国与北上链家分析。',
    blockContent: `在本场会议
(speaking_pct≈82% · 主导话题: 量价拆解 / UE 模型 / 9 分房 / 中后台成本)

本次承诺
- 补全北京同比口径(含 24 年同期)的爆盘率与爆盘成交效率
- 推动 26 年北京二手 800-1200 万段系数法市占测算下发城市侧
- 9 分房产品级限制建议反馈到二手战略项目组
- 月度版经营分析述职模板交 CEO 简报
- 8+2+25 城同口径 UE 模型扩到 26 年

本次关键判断
- 市场分析必须『市场 → 自己 → 平台』三段验证
- 套均价下滑首先归因结构而非市场
- 工具占比与工具效率背离是工具失真信号

本次坦承的不确定
- 中性乐观下北京二手 62.2 亿仍 miss
- 9 分房限制方案未拍板` },
  { type: 'entity', subtype: 'person', canonicalName: '说话人2', aliases: ['UE 质询者'],
    initialContent: '本次会议中扮演关键质询者角色,关注口径一致性、UE 摊销与中后台成本的根因。',
    blockContent: `在本场会议
(speaking_pct≈10% · 主导话题: 市场口径 / TR 值 / 中后台分摊)

本次提出的关键问题
- 25 vs 24 年市场少了多少单 — 把口径拉直到『成交 vs 网签』错期 2-3 个月
- 北京 TR 为什么只有 1.8 — 把目标钉到费率与提点真实约束
- 北京中后台分项不差但摊销后差很多 — 是不是房江湖在吸

本次未追到底的事项
- 9 分房机制(未发声)
- 提佣率体检率两难(未追问)` },
  { type: 'entity', subtype: 'person', canonicalName: '说话人3', aliases: ['珊珊', '新房经销商经营分析'],
    initialContent: '经营分析组成员,与说话人1 同组,分管新房与经销商业务的全国分析。',
    blockContent: `在本场会议
(speaking_pct≈8% · 主导话题: 新房量价错位 / 套均价 vs 单量矛盾 / 房江湖增量)

本次承诺
- 盘点 26 年北京新房 41+40+16 个项目开盘节奏与 960 万级新盘占明年 49% 供给

本次关键判断
- 市场缩量集中在低价段,高价段在涨,我们若只在低价段经营会被结构错位甩掉
- 新房直销人员破蛋率仅 15-20%,角色重组与精准分发商机有空间
- 头中尾盘费率已对齐 3.5%,继续靠费率提利润空间已小

本次坦承的不确定
- 12,000 单 + 600 亿 GTV + 610 万套均价存在矛盾
- 硬拔 800-3000 万市占 30% 的可行性` },
  { type: 'entity', subtype: 'org', canonicalName: '北京链家', aliases: ['北链', '北京二手'],
    initialContent: '链家在北京的业务实体,本次会议聚焦其 25 年经营回顾与 26 年预算审视。',
    blockContent: `本次会议要点
- 25 年自营成交剔除亲属过户后同比降 8,400+ 单
- 300-1200 万段绝对单量与市占双降,套均价 12 月 373 万
- 26 年二手预算 62.2 亿,中性乐观下仍 miss
- 中后台职能成本人均薪资 + 人数 + 单价均高
- 新房在昌平 / 朝新 / 朝阳同比市占降 4-8PP` },
  { type: 'entity', subtype: 'org', canonicalName: '上海链家', aliases: ['沪链', '上海二手'],
    initialContent: '链家在上海的业务实体,以大店模式为主(793 家)。',
    blockContent: `本次会议要点
- 25 年新房自营 1.08 万单,26 年预算 1.2 万单 / 套均价 610 万
- 在 1,000-2,000 万市场单量 +1,419 套,但我们是几乎唯一下降超 3PP 的
- 9 分房内卷已形成路径依赖(占比 ↑ 区划效率 ↓)
- 经纪人 25 年清退低效带来零开单人数变化大
- 单经纪人年均 UE 损失约 8 万元` },
  { type: 'concept', subtype: 'mental-model', canonicalName: 'Unit Economics(单均 UE)', aliases: ['单元经济', '一单到账'],
    initialContent: '把所有成本(直接 + 中后台分摊)归到每单经济利润,作为城市同口径对比的主指标。',
    blockContent: `本次会议中的应用
- 用『一单到账』替代总收入做 8+2+25 城同口径对比
- 拆解到外渠/内渠/二手/租赁,以及买卖/新房/租赁经纪人
- 揭示北京中后台分项不差但摊销后比上海差很多
- 提示成本刚性 > 收入弹性的结构性风险` },
  { type: 'concept', subtype: 'product', canonicalName: '9 分房', aliases: ['九分房', '九中房'],
    initialContent: '链家用于标注高质量房源的产品概念,设计目的是让爆盘成交效率聚焦在最优房源。',
    blockContent: `本次会议中的关键张力
- 30 天内成为过 9 分房的极限占比 ≈ 30%(每天 1% × 30 天)
- 一线靠『不停低价 + 调价』推占比,导致 9 分房占比 ↑ 区划成交效率 ↓
- 工具语义失真,需要产品级限制
- 限制方案本次未拍板` },
  { type: 'concept', subtype: 'metric', canonicalName: '套均价', aliases: ['套均价 / Avg-ticket'],
    initialContent: '单笔交易的平均成交价,二手与新房分析中的 top-line 关键拆解项。',
    blockContent: `本次会议中的关键判断
- 套均价同比下滑首先归因到自己的成交结构,再归因到市场房价
- 北京二手 26 年套均价预估 372 万,12 月实际 373 万,极其紧绷
- 上海新房 25 年套均价比市场低 170 万
- 12,000 单 + 610 万套均价的矛盾构成上海新房核心张力` },
  { type: 'concept', subtype: 'metric', canonicalName: '爆盘率', aliases: ['爆盘率 × 爆盘成交效率'],
    initialContent: '房源被点击/进入流量池的比例 × 进入后转化为成交的效率,房端核心抓手。',
    blockContent: `本次会议中的关键判断
- 高总价段(1,200 万+)爆盘率最低,改善型市场抓不住
- 25 年绝对值掉的与失淡掉的部分,基本都是爆盘率 + 爆盘成交双降
- 9 分房与九中房是爆盘成交效率的核心抓手` },
  { type: 'concept', subtype: 'metric', canonicalName: '中后台成本刚性', aliases: ['成本刚性 vs 收入弹性'],
    initialContent: '中后台职能成本下降速度落后于收入下降速度的现象,本次会议命名为关键风险。',
    blockContent: `本次会议中的关键判断
- 北京中后台成本所有 UE 行均高,病灶是职能侧人均薪资 + 人数 + 单价偏高
- 房江湖成本走在新房卖手里,不在中后台
- 是结构性而非周期性,假设需后续验证
- 26 年全公司口径同口径模型扩展时是核心诊断项` },
  { type: 'entity', subtype: 'product', canonicalName: '房江湖', aliases: ['房疆服'],
    initialContent: '链家新房业务下的合作渠道平台,成本归在新房卖手 UE。',
    blockContent: `本次会议中的关键判断
- p2 怀疑房江湖是北京中后台成本偏高的吸成本源,被 p1 否认
- 在外围区域和深度合作盘上 25 年增量比较明显
- 是新房控盘能力较强带来的渠道增量` },
  { type: 'concept', subtype: 'demographic', canonicalName: '亲属过户(经纪客户单)', aliases: ['关联交易单', '经纪客户单'],
    initialContent: '通过经纪人内部完成的关联交易,在市占口径上需剔除以反映真实可服务市场。',
    blockContent: `本次会议中的关键数据
- 北京 Q4 单月达 6.4%,上海 Q4 达 8.5%(全年均值北京 4.7% / 全国 4.9%)
- 不能直接带来高 UE 或好的利润,是『识别登录』而非真实创收
- 26 年市占口径会强制剔除` },
];

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'business_review',
  duration_min: 54 + 22 / 60,
  duration_label: '54分22秒',
  room: '—',
  source_note: 'transcript',
  source_filename: '北上链家业务经营分析与预算规划.txt',
  off_topic_pct: 0.0,
  tokens_estimate: null,
  participants: PARTICIPANTS,
  analysis: {
    summary: SUMMARY,
    tension: TENSION,
    newCognition: NEW_COGNITION,
    focusMap: FOCUS_MAP,
    consensus: CONSENSUS,
    crossView: CROSS_VIEW,
  },
  axes: AXES,
  facts: FACTS,
  wiki_markdown: { sourceEntry: WIKI_SOURCE_ENTRY, entityUpdates: ENTITY_UPDATES },
};

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
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
    `SELECT id, title, length(content) AS content_chars,
            jsonb_array_length(COALESCE(metadata->'participants','[]'::jsonb))             AS n_participants,
            jsonb_array_length(COALESCE(metadata->'analysis'->'tension','[]'::jsonb))       AS n_tensions,
            jsonb_array_length(COALESCE(metadata->'analysis'->'newCognition','[]'::jsonb))  AS n_new_cognition,
            jsonb_array_length(COALESCE(metadata->'analysis'->'consensus','[]'::jsonb))     AS n_consensus,
            jsonb_array_length(COALESCE(metadata->'analysis'->'crossView','[]'::jsonb))     AS n_cross_view,
            jsonb_array_length(COALESCE(metadata->'axes'->'knowledge'->'reusableJudgments','[]'::jsonb)) AS n_judgments,
            jsonb_array_length(COALESCE(metadata->'axes'->'knowledge'->'mentalModels','[]'::jsonb))      AS n_mental_models,
            jsonb_array_length(COALESCE(metadata->'axes'->'projects'->'decisionChain','[]'::jsonb))      AS n_decisions,
            jsonb_array_length(COALESCE(metadata->'axes'->'projects'->'assumptions','[]'::jsonb))        AS n_assumptions,
            jsonb_array_length(COALESCE(metadata->'axes'->'projects'->'openQuestions','[]'::jsonb))      AS n_open_q,
            jsonb_array_length(COALESCE(metadata->'axes'->'projects'->'risks','[]'::jsonb))              AS n_risks,
            jsonb_array_length(COALESCE(metadata->'facts','[]'::jsonb))                                  AS n_facts,
            jsonb_array_length(COALESCE(metadata->'wiki_markdown'->'entityUpdates','[]'::jsonb))         AS n_entities,
            length(metadata->'wiki_markdown'->>'sourceEntry')                                            AS wiki_chars
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
