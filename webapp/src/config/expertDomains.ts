// 专家领域常量 — 全局唯一的领域元数据
// 前端展示所用的 code/name/color/icon；与后端 api/src/modules/expert-library/types.ts 保持对齐

export interface ExpertDomain {
  code: string;
  name: string;
  color: string;
  icon: string;
}

export const EXPERT_DOMAINS: ExpertDomain[] = [
  { code: 'S', name: '特级专家', color: '#f59e0b', icon: '⭐' },
  { code: 'E01', name: '宏观经济', color: '#6366f1', icon: '📊' },
  { code: 'E02', name: '金融科技', color: '#8b5cf6', icon: '💰' },
  { code: 'E03', name: '新能源', color: '#22c55e', icon: '⚡' },
  { code: 'E04', name: '医疗健康', color: '#ef4444', icon: '🏥' },
  { code: 'E05', name: '消费零售', color: '#ec4899', icon: '🛍️' },
  { code: 'E06', name: '半导体', color: '#14b8a6', icon: '🔷' },
  { code: 'E07', name: '人工智能', color: '#3b82f6', icon: '🤖' },
  { code: 'E08', name: '房地产', color: '#f97316', icon: '🏢' },
  { code: 'E09', name: '文化传媒', color: '#a855f7', icon: '🎬' },
  { code: 'E10', name: '先进制造', color: '#64748b', icon: '🏭' },
  { code: 'E11', name: 'ESG可持续', color: '#10b981', icon: '🌱' },
  { code: 'E12', name: '跨境出海', color: '#0ea5e9', icon: '🚢' },
];

export function findDomainByCode(code: string): ExpertDomain {
  return EXPERT_DOMAINS.find((d) => d.code === code) || EXPERT_DOMAINS[0];
}
