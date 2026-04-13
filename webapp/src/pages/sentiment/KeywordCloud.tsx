// 关键词云：聚合当前 sentiment 列表中所有 keywords，按频次渲染
import ReactECharts from 'echarts-for-react';
import { useEffect, useMemo, useState } from 'react';
import type { SentimentAnalysis as SentimentListItem } from '../../api/client';
import { POLARITY_COLORS } from './colors';

interface Props {
  list: SentimentListItem[];
}

export function KeywordCloud({ list }: Props) {
  const [wordcloudReady, setWordcloudReady] = useState(false);

  // 延迟加载 echarts-wordcloud 扩展（无类型声明，运行时注册）
  useEffect(() => {
    // @ts-ignore 无类型声明包
    import('echarts-wordcloud')
      .then(() => setWordcloudReady(true))
      .catch(() => setWordcloudReady(false));
  }, []);

  const words = useMemo(() => {
    const freq = new Map<string, { count: number; polaritySum: number }>();
    for (const s of list) {
      const score = s.polarity === 'positive' ? 1 : s.polarity === 'negative' ? -1 : 0;
      for (const kw of s.keywords || []) {
        const cur = freq.get(kw) || { count: 0, polaritySum: 0 };
        cur.count += 1;
        cur.polaritySum += score;
        freq.set(kw, cur);
      }
    }
    return Array.from(freq.entries())
      .map(([name, v]) => ({
        name,
        value: v.count,
        avg: v.count ? v.polaritySum / v.count : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 80);
  }, [list]);

  if (words.length === 0) {
    return <div className="empty-mini">暂无关键词</div>;
  }

  if (!wordcloudReady) {
    // 降级：标签云
    return (
      <div className="keyword-fallback">
        {words.slice(0, 40).map((w) => {
          const color =
            w.avg > 0.3
              ? POLARITY_COLORS.positive
              : w.avg < -0.3
                ? POLARITY_COLORS.negative
                : POLARITY_COLORS.neutral;
          return (
            <span
              key={w.name}
              className="kw-chip"
              style={{
                fontSize: `${12 + Math.min(20, w.value * 2)}px`,
                color,
                borderColor: color,
              }}
            >
              {w.name}
              <em>{w.value}</em>
            </span>
          );
        })}
      </div>
    );
  }

  const option = {
    tooltip: {
      formatter: (p: any) => `${p.data.name}: ${p.data.value}`,
    },
    series: [
      {
        type: 'wordCloud',
        shape: 'circle',
        sizeRange: [14, 56],
        rotationRange: [-30, 30],
        rotationStep: 15,
        gridSize: 8,
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: {
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          color: (p: any) => {
            const avg = p.data.avg ?? 0;
            if (avg > 0.3) return POLARITY_COLORS.positive;
            if (avg < -0.3) return POLARITY_COLORS.negative;
            return POLARITY_COLORS.neutral;
          },
        },
        emphasis: {
          textStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.2)',
          },
        },
        data: words,
      },
    ],
  };

  return (
    <ReactECharts option={option} style={{ height: 340, width: '100%' }} />
  );
}
