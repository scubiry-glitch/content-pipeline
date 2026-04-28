// Seed · 租赁住房标准 · 专家评审会议题片段 — 新建会议
// 分析参考: /Users/scubiry/Downloads/rental-housing-standard-review__analysis.ts
// 注: 本次用户只给了分析文件, 没指定 docx; content 字段留空 (转写源是"新录音.txt", 未提供)
//
// 用法: node scripts/seed-meeting-rental-housing-standard.mjs

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

const TITLE = '租赁住房标准 · 专家评审会议题片段';
const OCCURRED_AT = '2026-04-28T13:49:00+08:00';

const PARTICIPANTS = [
  { id: 'p1', name: '评审专家(主持)', role: '议题主持人 / 第一评审人 (说话人 1)',                  initials: '审一', tone: 'neutral', speakingPct: 22 },
  { id: 'p2', name: '标准编制方',     role: '草案汇报人 / 申报单位代表 (说话人 2)',                  initials: '编',   tone: 'warm',    speakingPct: 2  },
  { id: 'p3', name: '资深专家',       role: '主笔评审人 (说话人 3) — 引用国家最新提法, 收束议题',    initials: '审三', tone: 'cool',    speakingPct: 76 },
];

const ANALYSIS = {
  summary: {
    decision:
      '本场是评审会一个议题片段, 未做"通过/不通过"形式投票, 但形成了对草案的系统性修改意见集合: ' +
      '①标准命名建议从隐含的"好房子"改为"租赁住房"; ' +
      '②必须做分级分类 (p1 反复强调, p3 二次确认), 必备项 + 优选 / 优良中差结构待编制方自选; ' +
      '③核心维度顺序按国家最新提法调整为「安全 — 舒适 — 绿色 — 智慧」, 草案当前"舒适"在前需调; ' +
      '④"安全"维度细化为静态(结构、装修构件牢固、污染)和动态(管线、电线老化)两条线; ' +
      '⑤删除不在"房子本体可控"范围的检测项 — 包括 5.4.2(室内温度因人而异)和 5.5(自来水水质); ' +
      '⑥标准以"硬件本体"为主, 服务/物业作为辅助维度, 但占比"再琢磨琢磨"; ' +
      '⑦明确编制目的、申报目标和样本覆盖范围 (50%? 80%? 全量?); ' +
      '⑧参考协会等其他已发布的评价标准, 校准本草案的指标比例.',
    actionItems: [
      { id: 'A1', who: 'p2', what: '修改标准名称, 去掉/隐去"好房子"字样, 改为以"租赁住房"为主的命名',                       due: '修订稿提交前' },
      { id: 'A2', who: 'p2', what: '明确编制目的与申报单位的目标, 写清"为什么编、给谁用、覆盖什么范围"',                  due: '修订稿提交前' },
      { id: 'A3', who: 'p2', what: '设定研究样本覆盖率 (50% / 80% / 更高), 据此反推标准的适用边界 (是否真"涵盖全国")',     due: '修订稿提交前' },
      { id: 'A4', who: 'p2', what: '把"安全"维度拆为静态(结构 + 装修构件 + 污染)和动态(管线 + 电线老化)两条线, 文本细化', due: '修订稿提交前' },
      { id: 'A5', who: 'p2', what: '把四个维度顺序调整为「安全 — 舒适 — 绿色 — 智慧」(对齐国家最新官方提法)',              due: '修订稿提交前' },
      { id: 'A6', who: 'p2', what: '删除 5.4.2 (室内温度) 与 5.5 (室内水质检测) — 这两项不在房子本体可控范围',              due: '修订稿提交前' },
      { id: 'A7', who: 'p2', what: '充实"服务"维度内容(草案此处单薄), 但服务/物业的整体占分比例需斟酌, 不宜过高',           due: '修订稿提交前' },
      { id: 'A8', who: 'p2', what: '在评级结构上, 明确选择"分级 vs 分等"、"基本+优选 vs 优良中差"中的一种, 给出清晰逻辑',   due: '修订稿提交前' },
      { id: 'A9', who: 'p2', what: '调研并参考协会等已发布的同类评价标准, 校准本草案的指标比例',                            due: '修订稿提交前' },
    ],
    risks: [
      'R1 · 标准范围过宽 — 草案声称"涵盖全国", p1 直接质疑可操作性: 老破小、无电梯、公共空间小这些结构性问题户内装修解决不了, 不分级即"打不及格"',
      'R2 · 标题与内容错位 — 当前标题/概念隐含"好房子", 但样本里大量是改造后的老旧住宅, p3 直言"老房子, 你要原则的说他有住宅、有公建, 改造以后住人的, 那就是租赁住房"',
      'R3 · 越界检测项 — 草案把室内水质、室内温度纳入指标, p3 明确反对: "你跟自来水公司供水较上劲了"、温度因人而异控制不住',
      'R4 · 维度顺序与国家最新提法不一致 — 草案"舒适在前", 但当前官方提法是"安全、舒适、绿色、智慧", 需要调头',
      'R5 · 服务维度占比未定 — 服务跟不上时硬件再好也无用, 但占多少分值"再琢磨琢磨", p3 留作开放题',
      'R6 · 评级形态未定 — 是分级还是分等? 是按分数还是按"优良中差"? 草案未交代清晰逻辑',
      'R7 · 经费自筹 — p1 注意到经费自筹, 反向追问编制目的, 暗指若无明确诉求则编制动力存疑',
      'R8 · 议题本身只用了 10 分钟 — 反馈量极大, 编制方仅一句"好的, 谢谢您的建议", 反馈是否真正落到修订稿仍有不确定性',
    ],
  },
  tension: [
    {
      id: 'T1', between: ['p1', 'p2'], intensity: 0.30,
      topic: '范围广度 vs 编制可行性 (单向质询, 编制方未即时回应)',
      summary:
        'p1 用层层追问质疑草案的"涵盖全国"野心: ' +
        '老破小有电梯/公共空间这些"户内装修动不了"的硬约束, 不做分级就等于把它们一刀打不及格; ' +
        '研究样本是 50% 量、80% 量还是更多? 这个边界不定, 标准就没有"针对性". ' +
        'p2 全程没有正面回应, 只一句「好的, 谢谢您的建议」收下; ' +
        'p3 后段加入支持立场:「几位专家说的这个分级非常重要」, 实质把 p1 的质疑升级为评审共识.',
      moments: [
        'p1: 「即使我户内做的比较彻底的装修, 但是就没有电梯, 公共空间小这种问题都还是存在的, 那我们这个就是不及格了吗?」',
        'p1: 「你这个面向就是你的样本数是涵盖多少?是 50% 的量还是 80% 的量, 还是更多的量?」',
        'p1: 「我看你这里还要准备涵盖全国, 这个范围就更大了, 编制难度就更大了。」',
        'p3 (背书): 「另外刚才几位专家说的这个分级非常重要。」',
      ],
    },
    {
      id: 'T2', between: ['p3', 'p2'], intensity: 0.35,
      topic: '检测项目边界: 房子本体可控 vs 第三方/个人因素',
      summary:
        'p3 单方面提出删除草案中的两类指标: ' +
        '5.4.2 室内温度 — 因人而异不可强制, 不能像宾馆那样自动停机; ' +
        '5.5 室内水质检测 — 自来水公司管出厂水(108 项指标), 出厂到龙头的管线污染不是房子能控制的, ' +
        '"你跟自来水公司供水较上劲了". ' +
        '这是 p3 的明确判断, p2 未对峙未辩护, 接受性沉默. ' +
        '判断本身揭示了一个边界原则: 标准只管房子本体能解释、能改的指标, 不管使用者偏好和上游主管事项.',
      moments: [
        'p3: 「水质检测, 你可以检测, 你检测出自来水公司有时候出毛病..他那个 108 项指标是出厂水的指标, 问题就在于出厂以后到龙头这一段出问题了。」',
        'p3: 「夏天我们规定别低于 26 度, 他就愿意打到 22 度, 你说你怎么限制他?」',
        'p3: 「这种不是由房子本身来定的, 是使用者因个人而异的, 那你就别弄。」',
        'p3: 「我们现在要解决的就是从出厂到龙头这一段管线污染, 谁控制的住, 对不对?所以我觉得就像这种事儿别这么弄, 把它简化一下, 你等于给自己添麻烦。」',
      ],
    },
    {
      id: 'T3', between: ['p3', 'p2'], intensity: 0.20,
      topic: '标准命名: 隐含"好房子"vs 据实"租赁住房"',
      summary:
        'p3 指出草案的概念漂移: 标准里没直接说"好房子", 但用了"好房子"对应的指标; ' +
        '又因为样本里多是改造后住人的老旧住宅, 不该用"好房子"做标题, 而该叫"租赁住房". ' +
        '这是术语精确性的修整, 非对立性张力. p2 默认接受, 不展开.',
      moments: [
        'p3: 「这个名字得改改, 标准里头没有直接说好房子, 你要想说好房子, 你就把好房子对应的那个指标, 把那个概念变成数写在里面就行了。」',
        'p3: 「老房子, 你要原则的说他有住宅、有公建, 改造以后住人的, 那就是租赁住房了, 是不是?」',
      ],
    },
  ],
  newCognition: [
    { id: 'N1', who: 'p2',
      before: '标准面向"好房子 + 好服务"两维, 涵盖全国',
      after:  '标题去"好房子", 主名称回到"租赁住房"; 范围必须分级分类, 样本覆盖率要写清',
      trigger: 'p1 反复以"老破小不及格吗"质疑泛覆盖 + p3 直接给出命名建议' },
    { id: 'N2', who: 'p2',
      before: '维度顺序按"舒适、安全、绿色、智慧"',
      after:  '调头为"安全、舒适、绿色、智慧" — 对齐国家最新官方提法',
      trigger: 'p3 明确点出:「现在官方的提法, 安全舒适、绿色智慧, 这个可以倒过来, 安全是第一位的」' },
    { id: 'N3', who: 'p2',
      before: '安全维度作为单一项',
      after:  '安全分静态(结构、装修构件牢固、污染)和动态(管线、电线老化)两条线分别细化',
      trigger: 'p3 拆解:「这个安全分两种状态, 一个是静态的, 那包括结构安全, 还有装修以后的安全..第二个功能, 包括布局上的功能和管线运行中的功能, 那电线都老化了, 那也不行」' },
    { id: 'N4', who: 'p2',
      before: '检测项越全越好, 包括室内温度和水质检测',
      after:  '剔除非房子本体可控的检测项 — 5.4.2(温度因人而异)、5.5(水质属上游管线问题), "把它简化一下, 你等于给自己添麻烦"',
      trigger: 'p3 用"跟自来水公司较上劲"的反问把这条原则讲透' },
    { id: 'N5', who: 'p2',
      before: '硬件 + 服务并列, 占比未定',
      after:  '硬件为主, 服务为辅, 占比"再琢磨琢磨" — 因为"房子改造也挺好或建的也挺好, 服务跟不上"是常见错位',
      trigger: 'p3 给出场景化的判断:「评价的时候应该着重在房子本体的功能, 那物业可以打分儿, 但是究竟占多少分值再琢磨琢磨」' },
    { id: 'N6', who: 'p2',
      before: '评级形态可以隐式由分数体现',
      after:  '必须明确选一: 分级 vs 分等 / 按分数 vs 按"优良中差" / 基本级 + 优选 — 选定后才好做',
      trigger: 'p3 抛出选择:「分等还是分级?是按分儿说呀?还是按优良中差说呀?你们再弄弄..基本级是不是在基本级之上再加这个优选的?」' },
    { id: 'N7', who: 'p2',
      before: '编制目的可以从标准内容里隐含读出',
      after:  '必须显式写出申报单位目标和编制目的 — 自筹经费的标准更需要把"为什么编、给谁用"讲清楚',
      trigger: 'p1 注意到自筹经费后追问:「我们不是为了编这个标准而编这个规范..编这个规范的目的是什么?」' },
  ],
  focusMap: [
    { who: 'p1', themes: ['分级分类必要性', '样本覆盖率 (50/80/全量)', '全国适用性', '编制目的与申报目标', '老破小不及格质疑'],                    returnsTo: 5 },
    { who: 'p2', themes: ['(几乎不发言, 仅一次"谢谢您的建议")'],                                                                                  returnsTo: 0 },
    { who: 'p3', themes: ['标准命名(去"好房子")', '安全静态/动态拆解', '功能维度三层(布局/管线/使用)', '剔除越界检测项', '4 维顺序对齐国家提法',
                          '硬件主-服务辅占比', '评级形态选择', '参考协会标准比例'],                                                              returnsTo: 8 },
  ],
  consensus: [
    { id: 'C1', kind: 'consensus',  text: '必须做分级分类 — 不分级不分类则老破小直接被打不及格, 不可行',                supportedBy: ['p1','p3'], sides: [] },
    { id: 'C2', kind: 'consensus',  text: '安全是第一位 — 现行国家提法是"安全、舒适、绿色、智慧", 草案需调头',           supportedBy: ['p3'],      sides: [] },
    { id: 'C3', kind: 'consensus',  text: '标准聚焦房子本体功能, 服务/物业作为辅助维度, 占比待定',                       supportedBy: ['p3'],      sides: [] },
    { id: 'C4', kind: 'consensus',  text: '编制目的与申报单位目标必须写清楚, 经费自筹的情况下尤其需要明确',              supportedBy: ['p1'],      sides: [] },
    { id: 'C5', kind: 'consensus',  text: '应参考协会等已发布的同类评价标准, 校准本草案的指标比例',                      supportedBy: ['p3'],      sides: [] },

    { id: 'D1', kind: 'divergence', text: '标准命名: "好房子" vs "租赁住房"', supportedBy: [], sides: [
      { stance: '"好房子"',   reason: '草案现状暗含此概念',                                  by: ['p2 (默认)'] },
      { stance: '"租赁住房"', reason: '样本中多为改造后住人的老旧住宅, 名实相符',          by: ['p3'] },
    ]},
    { id: 'D2', kind: 'divergence', text: '评级形态: 分级 vs 分等 / 分数 vs 优良中差', supportedBy: [], sides: [
      { stance: '由编制方自选',   reason: 'p3 提出选项让编制方根据指标特性自行决定',                              by: ['p3'] },
      { stance: '"基本级+优选"', reason: 'p3 提示:"基本级是不是在基本级之上再加这个优选的, 这样的清晰"',          by: ['p3 (倾向)'] },
    ]},
    { id: 'D3', kind: 'divergence', text: '是否纳入"非房子本体"检测项 (水质/温度)', supportedBy: [], sides: [
      { stance: '纳入', reason: '草案当前位置 5.4.2 / 5.5',                                                                  by: ['p2 (默认)'] },
      { stance: '剔除', reason: '水质属上游管线问题, 温度因人而异, 不在房子本体可控范围, "等于给自己添麻烦"',                by: ['p3'] },
    ]},
  ],
  crossView: [
    {
      id: 'V1', claimBy: 'p3',
      claim:
        '安全要拆静态/动态 — 静态包含结构安全 + 装修后构件牢固 + 不能有污染; ' +
        '动态包含管线运行(电线老化等); 第三层使用功能要同时对租户和硬件提要求, ' +
        '"他要是不注意, 你那个东西再稳定也不行"。',
      responses: [
        { who: 'p2', stance: 'support', text: '默认接受 — 全场仅一句"好的, 谢谢您的建议", 修改进入待办。' },
        { who: 'p1', stance: 'neutral', text: '未直接回应这条, 但前段反复强调"分级分类", 与拆解逻辑同向。' },
      ],
    },
    {
      id: 'V2', claimBy: 'p3',
      claim:
        '检测项要瘦身 — 室内水质、室内温度等"上游管线问题或个人因素"不该写进房子标准, ' +
        '强行写就是"跟自来水公司较上劲"或"控制不住租户偏好"。',
      responses: [
        { who: 'p2', stance: 'support', text: '默认接受, 进入待办 A6。' },
        { who: 'p1', stance: 'neutral', text: '未直接评论, 但与 p1 早段"研究目标和范围必须有针对性"的主张一致 — 收窄范围。' },
      ],
    },
    {
      id: 'V3', claimBy: 'p1',
      claim:
        '研究样本数必须明确 — 50% 量? 80% 量? 还是更多? ' +
        '不限定范围, 标准就没法对老破小、无电梯、公共空间小这些"户内装修动不了"的硬约束分级, ' +
        '一刀切就把它们打不及格。',
      responses: [
        { who: 'p3', stance: 'support', text: '后段背书:「几位专家说的这个分级非常重要」, 把 p1 的方法论质疑升格为评审共识。' },
        { who: 'p2', stance: 'support', text: '默认接受, 进入待办 A3 / A8。' },
      ],
    },
    {
      id: 'V4', claimBy: 'p3',
      claim:
        '4 个维度顺序当前是"舒适、安全、绿色、智慧", 但国家官方最新提法是' +
        '"安全、舒适、绿色、智慧" — 草案要倒过来, 安全在前。',
      responses: [
        { who: 'p2', stance: 'support', text: '默认接受, 进入待办 A5。' },
      ],
    },
    {
      id: 'V5', claimBy: 'p1',
      claim:
        '编制目的与申报单位目标必须显式写出 — 经费自筹的情况下, ' +
        '"我们不是为了编标准而编规范", 没有明确预期目标的标准, 编制动力存疑。',
      responses: [
        { who: 'p3', stance: 'partial', text: '未直接接住目的论, 但用"参考其他评价标准比例"间接给出"借由对标找定位"的可操作路径。' },
        { who: 'p2', stance: 'support', text: '默认接受, 进入待办 A2。' },
      ],
    },
  ],
};

const REVIEW_RECS = [
  { id: 'R-1',  label: '改名: 去"好房子", 主称"租赁住房"',         kind: 'STRUCTURAL', by: 'p3', section: '标题',         detail: '"好房子"概念变成指标值写到正文即可, 标题不必直挂' },
  { id: 'R-2',  label: '4 维顺序调头: 安全→舒适→绿色→智慧',       kind: 'STRUCTURAL', by: 'p3', section: '维度框架',     detail: '对齐国家官方最新提法' },
  { id: 'R-3',  label: '安全维度: 静态(结构/装修构件/污染)+动态(管线/电线老化)+使用(对租户和硬件双要求)', kind: 'STRUCTURAL', by: 'p3', section: '安全章节', detail: '明确三层结构, 不能只写"安全"两字' },
  { id: 'R-4',  label: '功能维度: 布局功能 + 管线运行功能 + 使用功能', kind: 'STRUCTURAL', by: 'p3', section: '功能章节', detail: '与安全维度的"动态/使用"两层有耦合, 需要彼此互参' },
  { id: 'R-5',  label: '删除 5.4.2 (室内温度)',                       kind: 'CONTENT',    by: 'p3', section: '5.4.2',       detail: '因人而异不可控, 房子本体管不到使用者偏好' },
  { id: 'R-6',  label: '删除 5.5 (室内水质检测)',                     kind: 'CONTENT',    by: 'p3', section: '5.5',         detail: '管线污染是自来水公司主管, 不是房子标准能管的事' },
  { id: 'R-7',  label: '充实"服务"维度内容(草案此处单薄)',            kind: 'CONTENT',    by: 'p3', section: '服务章节',     detail: '硬件已比较全面, 但服务部分需要再补' },
  { id: 'R-8',  label: '服务/物业占分比例需"再琢磨琢磨", 不宜过高',   kind: 'STRUCTURAL', by: 'p3', section: '权重设计',     detail: '硬件本体功能为主, 服务为辅 — 房子建得好但服务跟不上是常见' },
  { id: 'R-9',  label: '评级形态: 分级 vs 分等 / 基本+优选 vs 优良中差', kind: 'STRUCTURAL', by: 'p3', section: '评级框架', detail: '必须显式选定一种逻辑并交代清晰' },
  { id: 'R-10', label: '必备项 + 加分项 双层结构',                    kind: 'STRUCTURAL', by: 'p3', section: '评级框架',     detail: '必备不达标"别往外租", 基本满足后再有加分提档' },
  { id: 'R-11', label: '明确分级分类(老破小要可分类被评)',           kind: 'SCOPE',      by: 'p1', section: '适用范围',     detail: 'p3 后段确认 — 涉及全文方法论, 优先级最高' },
  { id: 'R-12', label: '明确样本覆盖率 (50%/80%/全量)',                kind: 'SCOPE',      by: 'p1', section: '适用范围',     detail: '据此反推标准的真实适用边界' },
  { id: 'R-13', label: '明确"涵盖全国"的可行性 — 范围越大编制越难',   kind: 'SCOPE',      by: 'p1', section: '适用范围',     detail: '与 R-11 / R-12 联动审视' },
  { id: 'R-14', label: '显式写出编制目的与申报单位目标',              kind: 'SCOPE',      by: 'p1', section: '前言/总则',   detail: '经费自筹的情况下, 目的不清编制动力存疑' },
  { id: 'R-15', label: '参考协会等已发布的同类评价标准',              kind: 'REFERENCE',  by: 'p3', section: '指标比例',     detail: '对标既有标准的指标分布, 校准本草案权重' },
];

const META_INFO = {
  asrQuality: 'high — 短录音+口语化但清晰; 个别词需校对: "室内机器人"应为"室内空气质量"或近义; "无障碍社化物业服务员"应为下一议题的"无障碍/适老化物业服务"类名称',
  signalDensity: 'extreme — 跑题率为 0%, 单位时间产出修改要点的密度极高; p3 一人在 ~7 分钟内系统输出 ≥10 条结构化建议',
  meetingShape: '"质询(p1) → 申报方应答(p2) → 系统建议(p3) → 议题切换(p1)" 四段式; 是评审会议的标准范式',
  speakingPctNote: 'p3 占 76%、p1 占 22%、p2 仅 2% — 这是评审会的典型分布, 编制方处于"听+收"模式, 不是辩护型对话',
  asymmetricInfo: 'p3 掌握"国家最新维度提法"和"自来水 108 项指标 vs 龙头管线"的具体规则知识, 这两条是编制方在场内不可能反驳的硬信息, 因此修改建议落地概率高',
  unresolved: [
    '编制方未当场对任何一条建议给出"接受/不接受/保留"的实质性回应, 仅有"好的, 谢谢您的建议"; 修订稿中实际采纳哪几条仍待观察',
    '服务/物业占比的具体数字, p3 留作开放题',
    '评级形态(分级 vs 分等)的最终选择, p3 让编制方自定',
    '本议题之后还有"无障碍 / 适老化物业服务"等多个议题, 本输出不覆盖',
  ],
};

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'expert_review',
  duration_min: 10.22,
  duration_label: '10 分 13 秒 (本议题, 隶属一场更长的评审会)',
  room: '线下评审会场(线索: "各位领导, 各位专家下午好" 类开场, 多议题轮转)',
  source_note: '会议自动转写 (噪声轻, 个别词需校对)',
  source_filename: '新录音.txt (用户未提供)',
  off_topic_pct: 0.0,
  tokens_estimate: 3000,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  review_recs: REVIEW_RECS,
  meta: META_INFO,
};

// 用户没传 docx, content 留空字符串(API 允许)
const TRANSCRIPT_PLACEHOLDER = '';

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
    [NEW_MEETING_ID, TITLE, TRANSCRIPT_PLACEHOLDER, JSON.stringify(metadata)],
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
            jsonb_array_length(COALESCE((metadata->'review_recs'), '[]'::jsonb))              AS n_review_recs
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}
