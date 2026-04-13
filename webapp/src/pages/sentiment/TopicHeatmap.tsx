// 按来源类型 × 极性聚合的热力图
// 说明：后端暂未提供"全部话题情感"列表接口，这里基于当前已拉取的 sentiment 列表，
// 按 sourceType 聚合，形成 [来源 × 极性] 的二维统计，作为 Tab 3 的数据可视化。
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import type { SentimentAnalysis as SentimentListItem } from '../../api/client';
import { POLARITY_COLORS } from './colors';

interface Props {
  list: SentimentListItem[];
}

const POLARITIES: Array<'positive' | 'neutral' | 'negative'> = [
  'positive',
  'neutral',
  'negative',
];
const POLARITY_LABEL: Record<string, string> = {
  positive: '正面',
  neutral: '中性',
  negative: '负面',
};

export function TopicHeatmap({ list }: Props) {
  const { sources, matrix, max } = useMemo(() => {
    const bySource = new Map<string, Record<string, number>>();
    for (const s of list) {
      const src = s.sourceType || '未知';
      if (!bySource.has(src)) {
        bySource.set(src, { positive: 0, neutral: 0, negative: 0 });
      }
      const bucket = bySource.get(src)!;
      bucket[s.polarity] = (bucket[s.polarity] || 0) + 1;
    }
    const sources = Array.from(bySource.keys()).sort();
    const data: Array<[number, number, number]> = [];
    let max = 0;
    sources.forEach((src, y) => {
      POLARITIES.forEach((p, x) => {
        const v = bySource.get(src)![p];
        data.push([x, y, v]);
        if (v > max) max = v;
      });
    });
    return { sources, matrix: data, max };
  }, [list]);

  if (sources.length === 0) {
    return <div className="empty-mini">暂无数据，请先采集内容</div>;
  }

  const option = {
    tooltip: {
      position: 'top',
      formatter: (p: any) =>
        `${sources[p.value[1]]}<br/>${POLARITY_LABEL[POLARITIES[p.value[0]]]}: ${p.value[2]}`,
    },
    grid: { height: '70%', top: '10%', left: 100, right: 40 },
    xAxis: {
      type: 'category',
      data: POLARITIES.map((p) => POLARITY_LABEL[p]),
      splitArea: { show: true },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { fontSize: 12 },
    },
    yAxis: {
      type: 'category',
      data: sources,
      splitArea: { show: true },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { fontSize: 12 },
    },
    visualMap: {
      min: 0,
      max: max || 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '2%',
      inRange: {
        color: ['#f5f5f5', POLARITY_COLORS.neutral, POLARITY_COLORS.positive],
      },
      textStyle: { fontSize: 11 },
    },
    series: [
      {
        name: '情感分布',
        type: 'heatmap',
        data: matrix,
        label: { show: true, fontSize: 12, fontWeight: 600 },
        itemStyle: { borderRadius: 4, borderWidth: 1, borderColor: '#fff' },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)',
          },
        },
      },
    ],
  };

  return (
    <div className="topic-heatmap-wrap">
      <ReactECharts option={option} style={{ height: Math.max(260, sources.length * 40 + 100) }} />
    </div>
  );
}
