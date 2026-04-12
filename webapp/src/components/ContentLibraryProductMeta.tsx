// 内容库产出物元数据组件
// 每个产出物页面头部统一展示: 上游来源 + 下游被引用场景 + 范围选择器
//
// v7.2: 满足用户要求 — "每个产出物页面都要说明上游来源和下游被引用场景"

import { useState, useEffect } from 'react';

const API_BASE = '/api/v1/content-library';

// ============================================================
// 产出物元数据定义 (15 个产出物的上游/下游)
// ============================================================

export interface ProductMetaDef {
  id: string;          // ① ② ③ ...
  name: string;
  upstream: string[];  // 上游数据来源
  downstream: string[]; // 下游被引用场景
  /** v7.3: 独立页面路由 */
  page?: string;
  /** v7.3: 所属阶段 */
  phase?: '选题' | '研究' | '写作' | '审核';
  /** v7.3: 用于获取数量的 API 路径 (相对于 /api/v1/content-library) */
  countEndpoint?: string;
}

export const PRODUCT_META: Record<string, ProductMetaDef> = {
  topics: {
    id: '①', name: '议题推荐',
    upstream: ['L1 实体注册表 (content_entities)', 'L1 事实三元组 (content_facts)', 'L4 趋势分析'],
    downstream: ['Planner Agent 选题推荐输入', '选题会决策参考', '任务创建 (预填标题)'],
    page: '/content-library/topics', phase: '选题', countEndpoint: '/topics/recommended',
  },
  trends: {
    id: '②', name: '趋势信号',
    upstream: ['L1 事实时序 (content_facts.created_at)', '实体注册表'],
    downstream: ['① 议题推荐的时效性评估', 'Planner Agent 时机窗口判断'],
    page: '/content-library/trends', phase: '选题',
  },
  angles: {
    id: '③', name: '差异化角度',
    upstream: ['① 议题推荐的覆盖率分析', '⑤ 关键事实 (按主题分组)'],
    downstream: ['写作任务的独特视角选择', 'Planner Agent 角度建议'],
    page: '/content-library/topics', phase: '选题',
  },
  gaps: {
    id: '④', name: '知识空白',
    upstream: ['实体覆盖率反向分析', '⑤ 关键事实密度评估'],
    downstream: ['① 议题推荐补充', '研究方向建议'],
    page: '/content-library/topics', phase: '选题',
  },
  facts: {
    id: '⑤', name: '关键事实',
    upstream: ['L1 FactExtractor 提取 (importAsset 自动触发)', 'DeltaCompressor 去重'],
    downstream: ['⑥ 实体图谱的边权计算', '⑨ 知识卡片聚合', '⑩ 认知综合', 'Researcher Agent 论据'],
    page: '/content-library/facts', phase: '研究', countEndpoint: '/facts?limit=1',
  },
  entities: {
    id: '⑥', name: '实体图谱',
    upstream: ['L1 EntityResolver 归一化', '⑤ 关键事实共现关系', 'v7.1 四信号加权 (direct/source-overlap/type-affinity)'],
    downstream: ['② 趋势信号查询', '⑨ 知识卡片关联实体', '⑮ 跨域关联', 'Louvain 社区发现'],
    page: '/content-library/entities', phase: '研究', countEndpoint: '/entities?limit=1',
  },
  delta: {
    id: '⑦', name: '信息增量',
    upstream: ['content_facts 时间窗口查询', 'DeltaCompressor superseded_by 链'],
    downstream: ['定时推送 (scheduler 每 6h)', '选题会周报', 'BlueTeam Agent 变化提醒'],
    page: '/content-library/delta', phase: '研究',
  },
  freshness: {
    id: '⑧', name: '事实保鲜度',
    upstream: ['content_facts.created_at 时效计算', '可配置 maxAgeDays 阈值'],
    downstream: ['BlueTeam Agent 过期数据预警', '定时推送 (scheduler 每 24h)', '编辑更新提醒'],
    page: '/content-library/freshness', phase: '研究',
  },
  cards: {
    id: '⑨', name: '知识卡片',
    upstream: ['⑤ 关键事实 (按实体聚合)', '⑥ 实体图谱 (关联实体)', 'L2 层级加载 (L1 级摘要)'],
    downstream: ['快速 briefing / 会议准备', 'Researcher Agent L1 速查', 'Writer Agent 背景信息'],
    page: '/content-library/cards', phase: '研究',
  },
  synthesis: {
    id: '⑩', name: '有价值的认知',
    upstream: ['⑤ 高置信度事实 (confidence > 0.5)', 'LLM 综合提炼 (completeWithSystem)'],
    downstream: ['Writer Agent 核心论点来源', '文章"我们发现了什么"段落'],
    page: '/content-library/synthesis', phase: '写作', countEndpoint: '/synthesize/cache/stats',
  },
  materials: {
    id: '⑪', name: '素材组合推荐',
    upstream: ['⑤ 关键事实', 'assets 元数据 (quality_score, theme_id)', '任务上下文'],
    downstream: ['Writer Agent 素材注入', '任务创建预填素材'],
    page: '/content-library/cards', phase: '写作',
  },
  consensus: {
    id: '⑫', name: '专家共识图',
    upstream: ['⑤ 事实按主题聚合', '专家库 (Expert Library) 联动'],
    downstream: ['Writer Agent 多元视角呈现', '"业界对此分为两派"叙事框架'],
    page: '/content-library/consensus', phase: '写作',
  },
  contradictions: {
    id: '⑬', name: '争议话题',
    upstream: ['L4 ContradictionDetector (同 subject+predicate 不同 object)', '双方置信度评估'],
    downstream: ['BlueTeam Agent 审核重点', '争议选题灵感', '风险点定位'],
    page: '/content-library/contradictions', phase: '审核', countEndpoint: '/contradictions?limit=1',
  },
  beliefs: {
    id: '⑭', name: '观点演化',
    upstream: ['L4 BeliefTracker (content_beliefs 状态机)', '事实版本链 (superseded_by)'],
    downstream: ['复盘类/演变类文章骨架', 'BlueTeam Agent 历史对比'],
    page: '/content-library/beliefs', phase: '审核',
  },
  crossDomain: {
    id: '⑮', name: '跨领域关联',
    upstream: ['v7.2 Adamic-Adar 跨域评分', '实体共同邻居度数分析', 'taxonomy_domain_id 分域'],
    downstream: ['发现意外关联 (如"芯片短缺→新能源交付延迟")', '选题创新角度'],
    page: '/content-library/cross-domain', phase: '审核',
  },
  wiki: {
    id: 'Wiki', name: 'Wiki 物化视图',
    upstream: ['全部 content_entities + content_facts', 'asset_library L0 摘要', '.obsidian 配置'],
    downstream: ['Obsidian vault 直接打开', '人类离线浏览', '备份归档'],
    page: '/content-library/wiki',
  },
};

// ============================================================
// 组件: ProductMetaBar (每个页面头部都嵌入)
// ============================================================

export function ProductMetaBar({ productKey }: { productKey: string }) {
  const meta = PRODUCT_META[productKey];
  const [show, setShow] = useState(false);

  if (!meta) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setShow(v => !v)}
        className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">{show ? 'expand_less' : 'info'}</span>
        {meta.id} {meta.name} — 数据流说明
      </button>
      {show && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1.5">⬆️ 上游来源</div>
            <ul className="space-y-1 text-blue-600 dark:text-blue-400">
              {meta.upstream.map((s, i) => <li key={i}>· {s}</li>)}
            </ul>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="font-semibold text-green-700 dark:text-green-300 mb-1.5">⬇️ 下游引用</div>
            <ul className="space-y-1 text-green-600 dark:text-green-400">
              {meta.downstream.map((s, i) => <li key={i}>· {s}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Hook: 加载下拉选项 (domains / entities / beliefs)
// ============================================================

export function useDropdownOptions() {
  const [domains, setDomains] = useState<string[]>([]);
  const [entities, setEntities] = useState<Array<{ id: string; name: string; type: string; factCount: number }>>([]);
  const [beliefs, setBeliefs] = useState<Array<{ id: string; subject: string; state: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_BASE}/dropdown/domains`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/dropdown/entities?limit=50`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/dropdown/beliefs`).then(r => r.ok ? r.json() : []),
    ]).then(([domainsRes, entitiesRes, beliefsRes]) => {
      if (domainsRes.status === 'fulfilled') setDomains(Array.isArray(domainsRes.value) ? domainsRes.value : []);
      if (entitiesRes.status === 'fulfilled') setEntities(Array.isArray(entitiesRes.value) ? entitiesRes.value : []);
      if (beliefsRes.status === 'fulfilled') setBeliefs(Array.isArray(beliefsRes.value) ? beliefsRes.value : []);
      setLoaded(true);
    });
  }, []);

  return { domains, entities, beliefs, loaded };
}

// ============================================================
// 组件: DomainSelect 下拉
// ============================================================

export function DomainSelect({ value, onChange, domains }: {
  value: string;
  onChange: (v: string) => void;
  domains: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
    >
      <option value="">全部领域</option>
      {domains.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  );
}

// ============================================================
// 组件: EntitySelect 下拉 (带事实数量)
// ============================================================

export function EntitySelect({ value, onChange, entities, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  entities: Array<{ id: string; name: string; type: string; factCount: number }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-w-[200px]"
    >
      <option value="">{placeholder || '选择实体...'}</option>
      {entities.map(e => (
        <option key={e.id} value={e.id}>{e.name} ({e.type}, {e.factCount}条)</option>
      ))}
    </select>
  );
}

// ============================================================
// 组件: BeliefSelect 下拉
// ============================================================

export function BeliefSelect({ value, onChange, beliefs }: {
  value: string;
  onChange: (v: string) => void;
  beliefs: Array<{ id: string; subject: string; state: string }>;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-w-[200px]"
    >
      <option value="">选择观点...</option>
      {beliefs.map(b => (
        <option key={b.id} value={b.id}>{b.subject} [{b.state}]</option>
      ))}
    </select>
  );
}
