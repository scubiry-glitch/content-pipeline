// 情感趋势图（Recharts 面积+折线复合图）
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from './useSentimentCenter';
import { POLARITY_COLORS } from './colors';

interface Props {
  data: TrendPoint[];
  days: number;
  onDaysChange: (d: number) => void;
}

export function SentimentTrendChart({ data, days, onDaysChange }: Props) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    score: d.score,
  }));

  return (
    <div className="trend-chart-wrap">
      <div className="trend-toolbar">
        <h3 className="section-subtitle">MSI 历史趋势</h3>
        <div className="trend-range-toggle">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={`range-btn ${days === d ? 'active' : ''}`}
              onClick={() => onDaysChange(d)}
            >
              {d} 天
            </button>
          ))}
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="empty-mini">暂无趋势数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={POLARITY_COLORS.positive} stopOpacity={0.4} />
                <stop offset="100%" stopColor={POLARITY_COLORS.positive} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            <Legend />
            <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: '中性线', fontSize: 11, fill: '#94a3b8' }} />
            <Area
              type="monotone"
              dataKey="score"
              name="情感得分"
              stroke={POLARITY_COLORS.positive}
              strokeWidth={2}
              fill="url(#scoreFill)"
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={POLARITY_COLORS.positive}
              strokeWidth={0}
              dot={{ r: 3, fill: POLARITY_COLORS.positive }}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
