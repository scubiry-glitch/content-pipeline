// 情感分析中心 v4.0 — 整合 MSI 仪表盘 / 趋势 / 话题 / 文本分析器
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSentimentCenter } from './sentiment/useSentimentCenter';
import { KpiStrip } from './sentiment/KpiStrip';
import { MSIGauge } from './sentiment/MSIGauge';
import { AlertsGrid } from './sentiment/AlertsGrid';
import { SentimentTrendChart } from './sentiment/SentimentTrendChart';
import { TopicHeatmap } from './sentiment/TopicHeatmap';
import { KeywordCloud } from './sentiment/KeywordCloud';
import { TextAnalyzer } from './sentiment/TextAnalyzer';
import { SentimentList } from './sentiment/SentimentList';
import { POLARITY_COLORS } from './sentiment/colors';
import './SentimentAnalysis.css';

// 热点洞察 Tab 导航（与其它页面保持一致）
function HotTopicsTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { id: 'topics', label: '热点列表', icon: '🔥', path: '/hot-topics' },
    { id: 'insights', label: '专家解读', icon: '👨‍💼', path: '/hot-topics/insights' },
    { id: 'sentiment', label: '情感分析', icon: '😊', path: '/sentiment' },
    { id: 'prediction', label: '预测分析', icon: '🔮', path: '/prediction' },
  ];
  const activeTab = tabs.find((t) => location.pathname.startsWith(t.path))?.id || 'sentiment';
  return (
    <div className="hot-topics-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

type SubTab = 'overview' | 'trend' | 'topics' | 'analyzer';

export function SentimentAnalysisPage() {
  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
    autoRefresh,
    setAutoRefresh,
    trendDays,
    setTrendDays,
  } = useSentimentCenter();
  const [tab, setTab] = useState<SubTab>('overview');

  const { msi, stats, alerts, trend, list } = data;

  return (
    <div className="sentiment-analysis sentiment-center">
      <HotTopicsTabs />

      <div className="page-header">
        <div>
          <h1>😊 情感分析中心</h1>
          <p className="page-subtitle">
            实时监控市场情绪 · 识别投资风险与机遇 · v4.0
          </p>
        </div>
        <div className="header-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>自动刷新 (60s)</span>
          </label>
          <button
            className="btn btn-secondary"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? '🔄 刷新中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      {error && <div className="inline-banner">{error}</div>}

      {loading ? (
        <div className="loading">
          <span className="loading-spinner" />
          加载情感分析数据...
        </div>
      ) : (
        <>
          <KpiStrip msi={msi} stats={stats} alerts={alerts} />

          <div className="sub-tabs">
            {([
              { id: 'overview', label: '📈 概览' },
              { id: 'trend', label: '📉 趋势' },
              { id: 'topics', label: '🗂 话题 / 关键词' },
              { id: 'analyzer', label: '🔍 文本分析器' },
            ] as const).map((t) => (
              <button
                key={t.id}
                className={`sub-tab-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="sub-tab-content">
            {tab === 'overview' && (
              <>
                <div className="panel panel-hero">
                  <h2 className="section-title">市场情绪指数 (MSI)</h2>
                  <MSIGauge msi={msi} fallbackValue={stats?.msiIndex} />
                </div>

                {stats && (
                  <div className="distribution-grid">
                    <DistCard
                      label="正面"
                      emoji="😊"
                      color={POLARITY_COLORS.positive}
                      count={stats.positive}
                      total={stats.total}
                    />
                    <DistCard
                      label="中性"
                      emoji="😐"
                      color={POLARITY_COLORS.neutral}
                      count={stats.neutral}
                      total={stats.total}
                    />
                    <DistCard
                      label="负面"
                      emoji="😔"
                      color={POLARITY_COLORS.negative}
                      count={stats.negative}
                      total={stats.total}
                    />
                  </div>
                )}

                <div className="panel">
                  <h2 className="section-title">⚠️ 情感异常预警</h2>
                  <AlertsGrid alerts={alerts} />
                </div>

                <details className="panel panel-collapsible">
                  <summary>
                    <h2 className="section-title">📋 原始分析记录 ({list.length})</h2>
                  </summary>
                  <SentimentList items={list} />
                </details>
              </>
            )}

            {tab === 'trend' && (
              <div className="panel">
                <SentimentTrendChart
                  data={trend}
                  days={trendDays}
                  onDaysChange={setTrendDays}
                />
              </div>
            )}

            {tab === 'topics' && (
              <>
                <div className="panel">
                  <h2 className="section-title">来源 × 情感分布热力图</h2>
                  <p className="section-hint">
                    基于近期 {list.length} 条分析，按来源类型与情感极性聚合
                  </p>
                  <TopicHeatmap list={list} />
                </div>
                <div className="panel">
                  <h2 className="section-title">关键词云</h2>
                  <p className="section-hint">字号代表频次，颜色代表平均情感</p>
                  <KeywordCloud list={list} />
                </div>
              </>
            )}

            {tab === 'analyzer' && (
              <div className="panel">
                <h2 className="section-title">文本情感分析器</h2>
                <TextAnalyzer />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DistCard({
  label,
  emoji,
  color,
  count,
  total,
}: {
  label: string;
  emoji: string;
  color: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="dist-card" style={{ borderTopColor: color }}>
      <div className="dist-emoji">{emoji}</div>
      <div className="dist-meta">
        <div className="dist-label">{label}</div>
        <div className="dist-value" style={{ color }}>
          {count}
          <span className="dist-pct">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="dist-bar">
        <div
          className="dist-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
