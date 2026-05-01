// Panorama 客户端 API + 类型

export type PrismKind = 'direction' | 'board' | 'coord' | 'team' | 'ext' | 'self';

export interface PanoramaPrism {
  id: PrismKind;
  icon: string;
  label: string;
  color: string;
  room: string;
  metric: { label: string; value: string };
  sector: { source: string; step: string; output: string; app: string };
}

export interface PanoramaStepGroup {
  id: 'g1' | 'g2' | 'g3' | 'g4' | 'g5';
  label: string;
  sub: string;
  members: string;
  runCount: number;
}

export interface PanoramaData {
  prisms: PanoramaPrism[];
  stepGroups: PanoramaStepGroup[];
  sources: Array<{ id: string; label: string; sub: string }>;
  outputs: string[];
  meta: {
    sourceCount: number;
    stepGroupCount: number;
    outputCount: number;
    prismCount: number;
  };
}

// Fixture 兜底（API 不可用时）
export const PANORAMA_FALLBACK: PanoramaData = {
  prisms: [
    { id: 'direction', icon: '🧭', label: '方向', color: '#7BA7C4', room: 'Compass', metric: { label: '战略对齐度', value: '0.72' }, sector: { source: '历史纪要', step: '跨会联动', output: '一页纸摘要', app: '战略对齐度' } },
    { id: 'board', icon: '🏛️', label: '董事会', color: '#C8A15C', room: 'Boardroom', metric: { label: '前瞻占比', value: '58%' }, sector: { source: '专家库', step: '外脑批注', output: '外脑批注资产', app: '董事关切雷达' } },
    { id: 'coord', icon: '🎯', label: '协调', color: '#7FD6A0', room: 'Tower', metric: { label: '责任清晰度', value: '78%' }, sector: { source: '会议原材料', step: '实体 & 承诺抽取', output: '承诺清单', app: '责任盘点' } },
    { id: 'team', icon: '⚔️', label: '团队', color: '#E6A6A6', room: 'War Room', metric: { label: '阵型健康', value: '72' }, sector: { source: '会议原材料', step: '矛盾识别', output: '盲区档案', app: '阵型 / 兵棋' } },
    { id: 'ext', icon: '🌐', label: '各方', color: '#A8A0D9', room: 'Situation', metric: { label: '覆盖度', value: '3/4' }, sector: { source: '内容库 assets', step: 'Rubric 评分', output: 'Rubric 矩阵', app: '利益相关方热力图' } },
    { id: 'self', icon: '🧘', label: '个人', color: '#D9B88E', room: 'Balcony', metric: { label: '本周 ROI', value: '0.64' }, sector: { source: '历史纪要', step: '棱镜聚合', output: '六棱镜指标', app: '时间 ROI / 阳台时光' } },
  ],
  stepGroups: [
    { id: 'g1', label: 'ASR & 实体', sub: '转写 · diarize · 承诺抽取', members: '01·02', runCount: 0 },
    { id: 'g2', label: '评分 & 信念', sub: 'Rubric · 信念提取', members: '03·04·05', runCount: 0 },
    { id: 'g3', label: '矛盾 & 专家', sub: '自认/外识 · 互补专家匹配', members: '06·07·08', runCount: 0 },
    { id: 'g4', label: '跨会 & 批注', sub: 'rehash · 外脑批注生成', members: '09·10', runCount: 0 },
    { id: 'g5', label: '棱镜聚合', sub: '六面指标合成', members: '11', runCount: 0 },
  ],
  sources: [
    { id: 'src-rec', label: '会议原材料', sub: '录音 / 录像 / 文档' },
    { id: 'src-lib', label: '内容库 assets', sub: 'RSS · 手动 · 深度分析' },
    { id: 'src-exp', label: '专家库', sub: 'S 级 · 心智模型' },
    { id: 'src-hist', label: '历史纪要', sub: '信念 · 决策链' },
  ],
  outputs: ['转写', '承诺清单', '张力清单', 'Rubric 矩阵', '信念轨迹', '心智模型命中', '盲区档案', '互补专家组', 'rehash 指数', '外脑批注', '六棱镜指标', '一页纸摘要'],
  meta: { sourceCount: 4, stepGroupCount: 5, outputCount: 12, prismCount: 6 },
};

export async function fetchPanoramaData(scopeId?: string): Promise<PanoramaData> {
  try {
    const url = scopeId ? `/api/v1/ceo/panorama?scopeId=${encodeURIComponent(scopeId)}` : '/api/v1/ceo/panorama';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as PanoramaData;
  } catch {
    return PANORAMA_FALLBACK;
  }
}
