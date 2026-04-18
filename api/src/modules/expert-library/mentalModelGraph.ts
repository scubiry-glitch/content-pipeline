// Mental Model Graph — 跨专家 mentalModel 共享索引 (Phase 8)
// 把分散在各个 ExpertProfile 里的 mentalModels 聚合为 Map<modelName, entry>
// 支持反向查询："哪些专家提到了'飞轮效应'"，以及用于下游 mental model catalog (Phase 10)

import type { ExpertEngine } from './ExpertEngine.js';
import type { ExpertProfile, MentalModel } from './types.js';

export interface MentalModelGraphEntry {
  /** 模型名称（唯一 key）*/
  name: string;
  /** 提及此模型的专家汇总 */
  experts: Array<{
    expert_id: string;
    expert_name: string;
    summary: string;
    evidence: string[];
    applicationContext: string;
    failureCondition: string;
  }>;
  /** 该模型被多少位专家提及 */
  expertCount: number;
  /** 是否跨多位专家共享（>=2）*/
  isShared: boolean;
}

/**
 * 构建全局 mental model 图谱
 *
 * 实现说明：
 * - 调用 engine.listExperts() 拉取所有专家
 * - 遍历每个专家的 persona.cognition.mentalModels
 * - 按 name 聚合
 * - 同 name 不同细节也会合并到同一个 entry 下
 *
 * 性能：O(专家数 × 每位专家心智模型数)，在 ~30 位专家下可忽略
 *
 * 注意：本函数每次调用都重新扫描，由调用方负责缓存。
 * router.ts 中的端点应该在 engine 初始化后构建一次并缓存。
 */
export async function buildMentalModelGraph(
  engine: ExpertEngine,
): Promise<Map<string, MentalModelGraphEntry>> {
  const allExperts = await engine.listExperts();
  const graph = new Map<string, MentalModelGraphEntry>();

  for (const expert of allExperts) {
    const models = expert.persona.cognition?.mentalModels;
    if (!models || models.length === 0) continue;

    for (const m of models) {
      const normalized = normalizeName(m.name);
      if (!normalized) continue;

      let entry = graph.get(normalized);
      if (!entry) {
        entry = {
          name: m.name,
          experts: [],
          expertCount: 0,
          isShared: false,
        };
        graph.set(normalized, entry);
      }

      entry.experts.push({
        expert_id: expert.expert_id,
        expert_name: expert.name,
        summary: m.summary,
        evidence: [...m.evidence],
        applicationContext: m.applicationContext,
        failureCondition: m.failureCondition,
      });
      entry.expertCount = entry.experts.length;
      entry.isShared = entry.expertCount >= 2;
    }
  }

  return graph;
}

/**
 * 根据模型名查找相关专家（精确匹配，大小写敏感但空格不敏感）
 */
export function findExpertsByModel(
  graph: Map<string, MentalModelGraphEntry>,
  modelName: string,
): MentalModelGraphEntry | undefined {
  const normalized = normalizeName(modelName);
  return graph.get(normalized);
}

/**
 * 列出所有被 >=2 位专家共享的模型（即 isShared=true 的 entries）
 * 按被引用次数降序
 */
export function listSharedModels(
  graph: Map<string, MentalModelGraphEntry>,
): MentalModelGraphEntry[] {
  return Array.from(graph.values())
    .filter(e => e.isShared)
    .sort((a, b) => b.expertCount - a.expertCount);
}

/**
 * 列出所有模型（含独有和共享）
 */
export function listAllModels(
  graph: Map<string, MentalModelGraphEntry>,
): MentalModelGraphEntry[] {
  return Array.from(graph.values()).sort((a, b) => b.expertCount - a.expertCount);
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, '');
}

// ============================================================
// Canonical Shared Mental Models — 通用心智模型共享库
// 没有自己 mentalModels 的专家可以根据 domain 匹配获得这些模型
// ============================================================

export interface CanonicalModel {
  name: string;
  summary: string;
  evidence: string[];
  applicationContext: string;
  failureCondition: string;
  domainTags: string[];
}

export const CANONICAL_MODELS: CanonicalModel[] = [
  {
    name: '飞轮效应',
    summary: '找到一个自我强化的正循环，每一圈都比上一圈容易——低价→更多客户→更多卖家→更低成本',
    evidence: ['Amazon: 低价→流量→卖家→品类→更低价', '字节跳动: 更多用户→更多数据→更好推荐→更长停留'],
    applicationContext: '评估平台型/网络效应型商业模式的增长可持续性',
    failureCondition: '飞轮依赖补贴而非自然行为；单边市场无网络效应',
    domainTags: ['平台', '增长', '电商', '内容', '社交', '本地生活'],
  },
  {
    name: '第一性原理',
    summary: '把问题拆到最基本的物理/逻辑层面重新推导，不接受"行业一直这么做"作为理由',
    evidence: ['SpaceX: 火箭材料成本仅占售价2%', 'Tesla: 电池包从$250→理论极限$60/kWh'],
    applicationContext: '评估产品/技术的成本优化潜力或挑战行业共识',
    failureCondition: '纯服务/创意行业；成本瓶颈在监管或人力而非物理',
    domainTags: ['科技', '制造', '新能源', '硬件', '航天', '成本'],
  },
  {
    name: '护城河',
    summary: '企业最重要的特质是可持续的竞争优势——品牌/网络效应/成本/转换成本/规模',
    evidence: ['可口可乐: 品牌护城河100+年', 'Apple: 生态锁定构成转换成本护城河'],
    applicationContext: '评估企业的长期投资价值和竞争壁垒',
    failureCondition: '技术颠覆可以摧毁看似坚固的护城河（如报纸行业）',
    domainTags: ['投资', '价值投资', '企业分析', '竞争策略', '消费品', '金融'],
  },
  {
    name: '反脆弱',
    summary: '不仅能抵抗冲击，还能从冲击中变强——这才是真正的韧性',
    evidence: ['进化: 物种通过变异从环境压力中获益', '创业生态: 单个公司失败但整体生态更强'],
    applicationContext: '评估系统/策略在极端压力下是变强还是变弱',
    failureCondition: '压力超过系统承受极限导致崩溃',
    domainTags: ['风险', '投资', '战略', '组织', '危机管理', '保险'],
  },
  {
    name: '长期主义',
    summary: '愿意用短期利润换长期市场地位——7年规划周期，不被季度财报绑架',
    evidence: ['Amazon: 前7年持续亏损但飞轮加速', '华为: 10年投入海思芯片'],
    applicationContext: '评估企业战略是否为短期指标牺牲长期价值',
    failureCondition: '现金流不支持延迟满足；竞争窗口即将关闭',
    domainTags: ['战略', '投资', '创业', '组织', '技术'],
  },
  {
    name: '供给侧密度',
    summary: '在本地/垂直市场中，谁先建立高密度供给网络，谁就有不可逆的壁垒',
    evidence: ['美团: 骑手密度是竞品2-3倍', '贝壳: ACN网络的经纪人密度决定体验'],
    applicationContext: '评估O2O/本地生活/中介平台的竞争优势',
    failureCondition: '纯线上业务；供给不受地理限制',
    domainTags: ['本地生活', '平台', 'O2O', '房产', '物流', '零售'],
  },
  {
    name: '极致性价比',
    summary: '用低毛利+高效率+大销量形成正循环——价格必须让用户第一反应是"太便宜了"',
    evidence: ['小米: 硬件净利润率不超5%但靠生态盈利', 'Costco: 会员制+极低毛利'],
    applicationContext: '评估消费产品的定价策略和规模化路径',
    failureCondition: '品类毛利天然很低无法做差异化；用户不在意价格',
    domainTags: ['消费', '电商', '零售', '性价比', '供应链'],
  },
  {
    name: '多学科思维格栅',
    summary: '用来自不同学科的心智模型交叉验证——单一框架有盲区，多框架才能看到全貌',
    evidence: ['芒格: 100+模型从物理/生物/心理学', '费曼: 多重表征加深理解'],
    applicationContext: '评估复杂决策时避免单一框架偏见',
    failureCondition: '需要快速决策的场景没时间做多框架分析',
    domainTags: ['投资', '决策', '教育', '分析', '研究'],
  },
  {
    name: '用户体验至上',
    summary: '从用户需求出发往回倒推，而非从技术/能力出发往前推',
    evidence: ['Apple: 从体验倒推技术', 'Amazon: 逆向工作法写PR后再开发', '微信: 用完即走'],
    applicationContext: '评估产品设计是否真正以用户为中心',
    failureCondition: '用户不知道自己想要什么的颠覆性创新场景',
    domainTags: ['产品', '设计', '用户体验', '社交', '消费品'],
  },
  {
    name: '组织即战略',
    summary: '组织架构决定信息流动方式，信息流动决定决策质量——改组织就是改战略',
    evidence: ['阿里"大中台小前台"', '字节BU制', '华为轮岗制'],
    applicationContext: '评估企业组织架构是否匹配战略目标',
    failureCondition: '早期创业公司组织简单，不需要复杂架构',
    domainTags: ['组织', '管理', '战略', '人力资源', '企业文化'],
  },
  {
    name: '技术S曲线',
    summary: '每项技术都经历缓慢起步→快速增长→成熟平台期，在拐点前布局才能乘浪',
    evidence: ['AI: 2023-2024正处于S曲线陡峭上升段', 'EV: 2020后进入快速增长期'],
    applicationContext: '判断技术趋势拐点和投资/创业时机',
    failureCondition: '技术浪潮判断错误或时机太早/太晚',
    domainTags: ['科技', 'AI', '投资', '创业', '研发'],
  },
  {
    name: '安全边际',
    summary: '只在价格远低于内在价值时行动——为判断错误留足缓冲',
    evidence: ['巴菲特: 以远低于资产价值时买入华盛顿邮报', '建筑工程: 承重设计留3倍余量'],
    applicationContext: '任何投资/重大决策的风险纪律',
    failureCondition: '优质资产极少打折；过度等待可能错过好机会',
    domainTags: ['投资', '风险', '金融', '决策', '工程'],
  },
];

/**
 * 为没有自己 mentalModels 的专家动态分配共享心智模型
 * 匹配逻辑：专家 domain[] 中的关键词与 canonical model 的 domainTags 做交集
 * 返回匹配度最高的 2-3 个 canonical models，转换为 MentalModel 格式
 *
 * 如果专家已有自己的 mentalModels，直接返回自己的（不混入共享的）
 */
export function getModelsForExpert(expert: ExpertProfile): MentalModel[] {
  const ownModels = expert.persona.cognition?.mentalModels;
  if (ownModels && ownModels.length > 0) return ownModels;

  const expertDomains = new Set(
    expert.domain
      .flatMap(d => d.toLowerCase().split(/[/、,，\s]+/))
      .filter(t => t.length >= 2)
  );
  // 也从 bias 和 frameworks 中提取关键词
  for (const b of expert.persona.bias || []) {
    for (const t of b.toLowerCase().split(/[/、,，\s]+/)) {
      if (t.length >= 2) expertDomains.add(t);
    }
  }
  for (const f of expert.method.frameworks || []) {
    for (const t of f.toLowerCase().split(/[/、,，\s]+/)) {
      if (t.length >= 2) expertDomains.add(t);
    }
  }

  const scored = CANONICAL_MODELS.map(cm => {
    let score = 0;
    for (const tag of cm.domainTags) {
      if (expertDomains.has(tag.toLowerCase())) score += 10;
      // 子串匹配（如 expert domain 含"投资分析"，tag 含"投资"）
      for (const ed of expertDomains) {
        if (ed.includes(tag.toLowerCase()) || tag.toLowerCase().includes(ed)) score += 3;
      }
    }
    return { cm, score };
  });

  const matched = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => canonicalToMentalModel(s.cm));

  // 至少返回 1 个通用模型
  if (matched.length === 0) {
    return [canonicalToMentalModel(CANONICAL_MODELS[0])]; // 飞轮效应作为万能兜底
  }

  return matched;
}

function canonicalToMentalModel(cm: CanonicalModel): MentalModel {
  return {
    name: cm.name,
    summary: cm.summary,
    evidence: cm.evidence,
    applicationContext: cm.applicationContext,
    failureCondition: cm.failureCondition,
  };
}
