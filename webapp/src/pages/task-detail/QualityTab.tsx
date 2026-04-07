// 任务详情 - 质量分析 Tab (v5.0 - Material Design 3)
// 布局逻辑: 1.输入 2.加工 3.输出 4.辅助工具
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Task, BlueTeamReview } from '../../types';
import { DeepAnalysisPanel } from '../../components/DeepAnalysisPanel';

interface TaskContext {
  task: Task;
  reviews: BlueTeamReview[];
  getDraftFromTask: () => { content: string; version?: number } | null;
  sentiment: {
    msiIndex: number;
    trendDirection: string;
    positive: number;
    negative: number;
    neutral: number;
  } | null;
  hotTopics: any[];
  suggestions: Array<{
    area: string;
    suggestion: string;
    priority: string;
    impact: string;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion?: string;
  }>;
}

export function QualityTab() {
  const { task, reviews, getDraftFromTask, sentiment, hotTopics, suggestions, alerts } = useOutletContext<TaskContext>();
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

  // Helper to get sentiment level color
  const getSentimentColor = (msi: number) => {
    if (msi >= 70) return 'text-green-600 bg-green-50 border-green-200';
    if (msi >= 40) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  // Helper to get trend icon
  const getTrendIcon = (direction: string) => {
    if (direction === 'up') return 'trending_up';
    if (direction === 'down') return 'trending_down';
    return 'trending_flat';
  };

  // Helper to get trend color
  const getTrendColor = (direction: string) => {
    if (direction === 'up') return 'text-green-600 bg-green-100';
    if (direction === 'down') return 'text-red-600 bg-red-100';
    return 'text-slate-600 bg-slate-100';
  };

  // Helper to get priority badge style
  const getPriorityStyle = (priority: string) => {
    if (priority === 'high') return 'bg-red-100 text-red-700 border-red-200';
    if (priority === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  // Helper to get severity style
  const getSeverityStyle = (severity: string) => {
    if (severity === 'high' || severity === 'critical') return 'border-l-red-500 bg-red-50/50';
    if (severity === 'warning') return 'border-l-amber-500 bg-amber-50/50';
    return 'border-l-blue-500 bg-blue-50/50';
  };

  // Helper to get alert type icon
  const getAlertTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      freshness: 'schedule',
      review: 'fact_check',
      quality: 'warning',
      info: 'info'
    };
    return icons[type] || 'notifications';
  };

  return (
    <div className="tab-panel quality-panel animate-fade-in pb-32">
      {/* ========== Header ========== */}
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Stage Analysis</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-xs font-bold uppercase tracking-wider">Quality Assessment</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-slate-900 dark:text-white mb-2">Quality Analysis</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl">Multi-dimensional quality assessment including sentiment analysis, topic trends, and intelligent recommendations.</p>
          </div>
          {task.evaluation?.score && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{task.evaluation.score}</span>
                <span className="text-sm text-slate-500 ml-1">/ 100</span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quality Score</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${task.evaluation.score >= 80 ? 'bg-green-100 text-green-600' : task.evaluation.score >= 60 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                <span className="material-symbols-outlined text-2xl">verified</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ========== Stepper Container ========== */}
      <div className="space-y-16">
        
        {/* ========== Section 1: Input ========== */}
        <section className="relative step-line step-line-active pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">input</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Input: Market Intelligence</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {sentiment ? 'Live Data Stream' : 'Data Unavailable'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sentiment Analysis Card */}
            <div className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-500">sentiment_satisfied</span>
                  Market Sentiment Index (MSI)
                </h4>
                {sentiment && (
                  <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getSentimentColor(sentiment.msiIndex)}`}>
                    {sentiment.msiIndex >= 70 ? 'Positive' : sentiment.msiIndex >= 40 ? 'Neutral' : 'Negative'}
                  </span>
                )}
              </div>

              {sentiment ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* MSI Gauge */}
                  <div className="flex items-center gap-6">
                    <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${getSentimentColor(sentiment.msiIndex).replace('bg-', 'bg-opacity-20 ').replace('border-', 'border-opacity-50 ')}`}>
                      <div className="text-center">
                        <span className="text-3xl font-black text-slate-800 dark:text-white">{sentiment.msiIndex}</span>
                        <span className="text-xs text-slate-500 block">MSI</span>
                      </div>
                    </div>
                    <div>
                      <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold ${getTrendColor(sentiment.trendDirection)}`}>
                        <span className="material-symbols-outlined text-sm">{getTrendIcon(sentiment.trendDirection)}</span>
                        {sentiment.trendDirection === 'up' ? 'Rising' : sentiment.trendDirection === 'down' ? 'Falling' : 'Stable'}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Market trend analysis</p>
                    </div>
                  </div>

                  {/* Distribution Bars */}
                  <div className="space-y-3">
                    {[
                      { label: 'Positive', value: sentiment.positive, color: 'bg-green-500', icon: 'sentiment_very_satisfied' },
                      { label: 'Neutral', value: sentiment.neutral, color: 'bg-slate-400', icon: 'sentiment_neutral' },
                      { label: 'Negative', value: sentiment.negative, color: 'bg-red-500', icon: 'sentiment_dissatisfied' }
                    ].map((item) => {
                      const total = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
                      const percentage = Math.round((item.value / total) * 100);
                      return (
                        <div key={item.label} className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 text-lg">{item.icon}</span>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-16">{item.label}</span>
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-10 text-right">{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">analytics</span>
                  <p className="text-slate-500">Sentiment data not available for this task.</p>
                </div>
              )}
            </div>

            {/* Hot Topics Card */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-orange-500">local_fire_department</span>
                  Hot Topics
                </h4>
                <span className="text-[10px] font-bold uppercase text-orange-600 px-2 py-0.5 bg-orange-100 rounded">Trending</span>
              </div>

              {hotTopics.length > 0 ? (
                <div className="space-y-3">
                  {hotTopics.slice(0, 5).map((topic, idx) => (
                    <div key={topic.id} className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl hover:bg-surface-container transition-colors group cursor-pointer">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-red-500 text-white' : 
                        idx === 1 ? 'bg-orange-500 text-white' : 
                        idx === 2 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-on-surface truncate">{topic.title}</span>
                      <span className="text-xs font-bold text-orange-600">{topic.hotScore || 0}°</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">search_off</span>
                  <p className="text-sm text-slate-500">No trending topics available.</p>
                </div>
              )}
            </div>
          </div>

          {/* Topic Evaluation Summary */}
          {task.evaluation && (
            <div className="mt-6 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">assessment</span>
                Topic Evaluation Summary
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-container-low p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Overall Score</span>
                  <span className="text-2xl font-black text-slate-800 dark:text-white">{task.evaluation.score}</span>
                </div>
                <div className="bg-surface-container-low p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Risk Level</span>
                  <span className={`text-sm font-bold px-2 py-1 rounded ${
                    task.evaluation.riskLevel === 'low' ? 'bg-green-100 text-green-700' :
                    task.evaluation.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {task.evaluation.riskLevel === 'low' ? 'Low Risk' :
                     task.evaluation.riskLevel === 'medium' ? 'Medium Risk' : 'High Risk'}
                  </span>
                </div>
                <div className="bg-surface-container-low p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Recommended</span>
                  <span className={`text-lg ${task.evaluation.stronglyRecommended ? 'text-green-600' : 'text-slate-400'}`}>
                    {task.evaluation.stronglyRecommended ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="bg-surface-container-low p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Dimensions</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {Object.keys(task.evaluation.dimensions || {}).length} Metrics
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ========== Section 2: Process ========== */}
        {suggestions.length > 0 && (
          <section className="relative step-line step-line-active pl-12">
            <div className="absolute left-0 top-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
              <span className="material-symbols-outlined">psychology</span>
            </div>
            <div className="flex items-baseline justify-between mb-6">
              <h3 className="text-xl font-bold font-headline">Process: AI Optimization</h3>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {suggestions.length} Recommendations
              </span>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestions.map((s, idx) => (
                  <div key={idx} className={`p-5 rounded-xl border-l-4 bg-surface-container-low hover:shadow-md transition-all ${
                    s.priority === 'high' ? 'border-l-red-500' :
                    s.priority === 'medium' ? 'border-l-amber-500' : 'border-l-blue-500'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded border ${getPriorityStyle(s.priority)}`}>
                        {s.priority}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{s.area}</span>
                    </div>
                    <p className="text-sm text-on-surface font-medium mb-3 leading-relaxed">{s.suggestion}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      <span>Impact: {s.impact}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ========== Section 3: Output ========== */}
        <section className="relative pl-12">
          <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center z-10 shadow-lg ${
            alerts.length > 0 ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
          }`}>
            <span className="material-symbols-outlined">output</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Output: Quality Report</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {alerts.length > 0 ? `${alerts.length} Alerts` : 'All Clear'}
            </span>
          </div>

          <div className="space-y-6">
            {/* Quality Alerts */}
            {alerts.length > 0 && (
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
                <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">warning</span>
                  Quality Alerts
                </h4>
                <div className="space-y-3">
                  {alerts.map((alert, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border-l-4 ${getSeverityStyle(alert.severity)}`}>
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-slate-400">
                          {getAlertTypeIcon(alert.type)}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-on-surface">{alert.message}</p>
                          {alert.suggestion && (
                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">lightbulb</span>
                              {alert.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dimension Scores */}
            {task.evaluation?.dimensions && (
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
                <h4 className="font-bold text-on-surface mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">bar_chart</span>
                  Dimension Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(task.evaluation.dimensions).map(([key, value]: [string, any]) => {
                    const labels: Record<string, string> = {
                      dataAvailability: 'Data Availability',
                      topicHeat: 'Topic Heat',
                      differentiation: 'Differentiation',
                      timeliness: 'Timeliness'
                    };
                    const icons: Record<string, string> = {
                      dataAvailability: 'database',
                      topicHeat: 'local_fire_department',
                      differentiation: 'auto_awesome',
                      timeliness: 'schedule'
                    };
                    const colors: Record<string, string> = {
                      dataAvailability: 'bg-blue-500',
                      topicHeat: 'bg-orange-500',
                      differentiation: 'bg-purple-500',
                      timeliness: 'bg-green-500'
                    };
                    return (
                      <div key={key} className="bg-surface-container-low p-4 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`material-symbols-outlined text-slate-500`}>{icons[key] || 'analytics'}</span>
                          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{labels[key] || key}</span>
                          <span className="ml-auto text-lg font-bold text-slate-800 dark:text-white">{value}</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[key] || 'bg-slate-500'} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Analysis Text */}
            {task.evaluation?.analysis && (
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
                <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-tertiary">description</span>
                  Detailed Analysis
                </h4>
                <div className="bg-surface-container-low p-5 rounded-xl">
                  <p className="text-sm text-on-surface leading-relaxed">{task.evaluation.analysis}</p>
                </div>
              </div>
            )}

            {/* Empty State */}
            {alerts.length === 0 && !task.evaluation?.dimensions && !task.evaluation?.analysis && (
              <div className="bg-surface-container-lowest p-12 rounded-2xl border border-outline-variant/30 shadow-sm text-center">
                <span className="material-symbols-outlined text-6xl text-green-500 mb-4">check_circle</span>
                <h4 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Quality Check Passed</h4>
                <p className="text-slate-500 max-w-md mx-auto">No quality issues detected. The task meets all quality standards.</p>
              </div>
            )}
          </div>
        </section>

        {/* ========== Expert Review Quality ========== */}
        <section className="relative step-line pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-violet-500 text-white rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">psychology</span>
          </div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Expert Review Quality</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 评审质量分析 */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-violet-500">fact_check</span>
                评审覆盖度
              </h4>
              {reviews.length > 0 ? (() => {
                const allQuestions = reviews.flatMap(r => r.questions || []);
                const critical = allQuestions.filter(q => q.severity === 'critical' || q.severity === 'high');
                const warning = allQuestions.filter(q => q.severity === 'warning' || q.severity === 'medium');
                const praise = allQuestions.filter(q => q.severity === 'praise' || q.severity === 'low');

                // 问题分类
                const structural = allQuestions.filter(q => {
                  const text = (q.question || '').toLowerCase();
                  return text.includes('结构') || text.includes('框架') || text.includes('逻辑') || text.includes('论点');
                });
                const methodological = allQuestions.filter(q => {
                  const text = (q.question || '').toLowerCase();
                  return text.includes('数据') || text.includes('来源') || text.includes('证据') || text.includes('引用');
                });

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-red-50 rounded-xl">
                        <div className="text-2xl font-black text-red-600">{critical.length}</div>
                        <div className="text-xs text-red-500">严重问题</div>
                      </div>
                      <div className="text-center p-3 bg-amber-50 rounded-xl">
                        <div className="text-2xl font-black text-amber-600">{warning.length}</div>
                        <div className="text-xs text-amber-500">一般警告</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-xl">
                        <div className="text-2xl font-black text-green-600">{praise.length}</div>
                        <div className="text-xs text-green-500">亮点肯定</div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-outline-variant/20 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-on-surface-variant">结构性问题</span>
                        <span className="font-bold text-on-surface">{structural.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-on-surface-variant">方法论问题</span>
                        <span className="font-bold text-on-surface">{methodological.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-on-surface-variant">参与专家数</span>
                        <span className="font-bold text-on-surface">{reviews.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-6 text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">pending</span>
                  <p className="text-sm">尚未进行蓝军评审</p>
                </div>
              )}
            </div>

            {/* 发布就绪检查 */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
              <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-500">verified</span>
                发布就绪检查
              </h4>
              {(() => {
                const checks = [
                  {
                    label: '选题评分 ≥ 60',
                    passed: (task.evaluation?.score || 0) >= 60,
                    value: task.evaluation?.score ? `${task.evaluation.score}分` : '未评估',
                  },
                  {
                    label: '严重问题全部处理',
                    passed: reviews.length === 0 || reviews.every(r =>
                      (r.questions || []).filter(q => q.severity === 'critical' || q.severity === 'high')
                        .every(q => (q as any).decision === 'accept' || (q as any).decision === 'manual_resolved')
                    ),
                    value: reviews.length === 0 ? '无评审' : '已检查',
                  },
                  {
                    label: '大纲评审得分 ≥ 70',
                    passed: ((task as any).metadata?.expertOutlineReview?.consensus?.overallScore ||
                             (task as any).metadata?.expertOutlineReview?.overallScore || 0) >= 70,
                    value: (() => {
                      const score = (task as any).metadata?.expertOutlineReview?.consensus?.overallScore ||
                                    (task as any).metadata?.expertOutlineReview?.overallScore;
                      return score ? `${score}分` : '未评审';
                    })(),
                  },
                  {
                    label: '已生成文稿',
                    passed: !!getDraftFromTask()?.content,
                    value: getDraftFromTask()?.content ? '已生成' : '未生成',
                  },
                ];
                const allPassed = checks.every(c => c.passed);
                return (
                  <div className="space-y-3">
                    {checks.map((check, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-sm ${check.passed ? 'text-green-500' : 'text-red-400'}`}>
                            {check.passed ? 'check_circle' : 'cancel'}
                          </span>
                          <span className="text-sm text-on-surface">{check.label}</span>
                        </div>
                        <span className={`text-xs font-bold ${check.passed ? 'text-green-600' : 'text-red-500'}`}>
                          {check.value}
                        </span>
                      </div>
                    ))}
                    <div className={`mt-4 p-3 rounded-xl text-center font-bold text-sm ${
                      allPassed ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {allPassed ? '✓ 可发布' : '✗ 尚未满足发布条件'}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* ========== Section 4: Tools ========== */}
        <section className="relative pl-12">
          <div className="absolute left-0 top-0 w-10 h-10 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full flex items-center justify-center z-10 shadow-lg">
            <span className="material-symbols-outlined">build</span>
          </div>
          <h3 className="text-xl font-bold font-headline mb-6">Tools & Actions</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">refresh</span>
              </div>
              <div>
                <h4 className="font-bold text-on-surface">Refresh Data</h4>
                <p className="text-xs text-slate-500 mt-1">Update sentiment and topic data</p>
              </div>
            </button>

            {task.evaluation && (
              <button
                onClick={() => alert('Export feature coming soon')}
                className="flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 hover:shadow-md transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">download</span>
                </div>
                <div>
                  <h4 className="font-bold text-on-surface">Export Report</h4>
                  <p className="text-xs text-slate-500 mt-1">Download quality assessment PDF</p>
                </div>
              </button>
            )}

            <button
              onClick={() => setShowDeepAnalysis(prev => !prev)}
              className={`flex items-center gap-4 p-5 rounded-2xl border hover:shadow-md transition-all text-left group ${
                showDeepAnalysis
                  ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-700 ring-2 ring-violet-200 dark:ring-violet-800'
                  : 'bg-surface-container-lowest border-outline-variant/30'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                showDeepAnalysis ? 'bg-violet-200 text-violet-700' : 'bg-violet-100 text-violet-600'
              }`}>
                <span className="material-symbols-outlined text-2xl">psychology</span>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-on-surface">深度问题分析</h4>
                <p className="text-xs text-slate-500 mt-1">AI专家团队诊断文章核心问题</p>
              </div>
              <span className={`material-symbols-outlined text-slate-400 transition-transform ${showDeepAnalysis ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>
          </div>

          {/* Deep Analysis Panel */}
          {showDeepAnalysis && (
            <DeepAnalysisPanel
              task={task}
              reviews={reviews || []}
              draftContent={getDraftFromTask?.()?.content || null}
            />
          )}
        </section>
      </div>

      {/* ========== Bottom Global Action Bar ========== */}
      <div className="fixed bottom-0 left-[256px] right-0 h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-center px-8 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500">
              Status: <span className="uppercase font-bold text-slate-700 dark:text-slate-300">{task.status.replace('_', ' ')}</span>
            </span>
            {alerts.length > 0 && (
              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                {alerts.length} Alerts
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              className="px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2"
              onClick={() => window.location.reload()}
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
