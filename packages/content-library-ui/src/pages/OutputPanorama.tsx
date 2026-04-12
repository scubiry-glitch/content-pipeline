// 产出物全景页 — 独立查看页面
// 追踪 15 类产出物的状态 + 内容二次创作情况
import React, { useState, useEffect } from 'react';
import { useContentLibrary } from '../hooks/useContentLibrary.js';
import { apiGet } from '../api-client.js';
import type { ContentFact, TopicRecommendation, Contradiction, DeltaReportData } from '../types.js';

interface OutputCategory {
  id: string;
  number: string;
  name: string;
  phase: '选题' | '研究' | '写作' | '审核';
  status: 'live' | 'preview' | 'planned';
  count: number | null;
  description: string;
}

interface ReuseRecord {
  outputType: string;
  assetId?: string;
  entityId?: string;
  usedInTaskId: string;
  usedAt: string;
  outcome?: string;
}

export function OutputPanorama() {
  const {
    topics, fetchTopics,
    facts, fetchFacts,
    contradictions, fetchContradictions,
    staleFacts, fetchStaleFacts,
    delta, fetchDelta,
    entities, fetchEntities,
  } = useContentLibrary();

  const [reuseRecords, setReuseRecords] = useState<ReuseRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [view, setView] = useState<'panorama' | 'reuse'>('panorama');

  // 初始加载全部产出物概览数据
  useEffect(() => {
    fetchTopics();
    fetchFacts();
    fetchContradictions();
    fetchStaleFacts(90);
    fetchDelta();
    fetchEntities();
    loadReuseRecords();
  }, []);

  const loadReuseRecords = async () => {
    try {
      // 从生产经验记录中获取二次创作追踪
      const result = await apiGet<ReuseRecord[]>('/recommendations/reuse-log');
      setReuseRecords(result);
    } catch {
      // API 可能尚未实现，使用空数组
      setReuseRecords([]);
    }
  };

  // 15 类产出物状态汇总
  const categories: OutputCategory[] = [
    // 选题阶段
    { id: 'topics', number: '①', name: '有价值的议题', phase: '选题', status: 'live', count: topics.data?.total ?? null, description: '基于实体趋势和信息密度推荐的选题' },
    { id: 'trends', number: '②', name: '趋势信号', phase: '选题', status: 'live', count: null, description: '实体/指标的方向性变化检测' },
    { id: 'differentiation', number: '③', name: '差异化角度建议', phase: '选题', status: 'planned', count: null, description: '竞品未覆盖的独特切入点' },
    { id: 'gaps', number: '④', name: '知识空白/盲区', phase: '选题', status: 'planned', count: null, description: '有实体但缺事实支撑的领域' },
    // 研究阶段
    { id: 'facts', number: '⑤', name: '关键事实', phase: '研究', status: 'live', count: facts.data?.total ?? null, description: '高置信度结构化事实三元组' },
    { id: 'entityGraph', number: '⑥', name: '实体关系图谱', phase: '研究', status: 'live', count: entities.data?.total ?? null, description: '实体间关联网络可视化' },
    { id: 'delta', number: '⑦', name: '信息增量报告', phase: '研究', status: 'live', count: delta.data ? (delta.data.newFacts.length + delta.data.updatedFacts.length + delta.data.refutedFacts.length) : null, description: '按时间窗口的事实变化统计' },
    { id: 'freshness', number: '⑧', name: '事实保鲜度报告', phase: '研究', status: 'live', count: staleFacts.data?.length ?? null, description: '过期数据预警' },
    { id: 'cards', number: '⑨', name: '高密度知识卡片', phase: '研究', status: 'live', count: null, description: '单实体 L1 级精华浓缩' },
    // 写作阶段
    { id: 'cognition', number: '⑩', name: '有价值的认知', phase: '写作', status: 'planned', count: null, description: '跨内容综合提炼的深层洞察' },
    { id: 'recommendations', number: '⑪', name: '最佳素材组合推荐', phase: '写作', status: 'preview', count: null, description: '历史高分素材+专家组合模式' },
    { id: 'consensus', number: '⑫', name: '专家共识/分歧图', phase: '写作', status: 'planned', count: null, description: '多专家对同一议题的评判汇总' },
    // 审核阶段
    { id: 'contradictions', number: '⑬', name: '争议话题', phase: '审核', status: 'live', count: contradictions.data?.length ?? null, description: '不同来源的事实对立' },
    { id: 'beliefs', number: '⑭', name: '观点演化脉络', phase: '审核', status: 'preview', count: null, description: '命题状态变更历史时间线' },
    { id: 'crossDomain', number: '⑮', name: '跨领域关联洞察', phase: '审核', status: 'planned', count: null, description: '不同行业间的意外关联' },
  ];

  const phaseColors: Record<string, string> = {
    '选题': '#4299e1',
    '研究': '#48bb78',
    '写作': '#ed8936',
    '审核': '#e53e3e',
  };

  const statusLabel: Record<string, string> = {
    live: '已上线',
    preview: '预览版',
    planned: '规划中',
  };

  const statusColor: Record<string, string> = {
    live: '#38a169',
    preview: '#d69e2e',
    planned: '#a0aec0',
  };

  // 统计二次创作情况
  const reuseByType = reuseRecords.reduce((acc, r) => {
    acc[r.outputType] = (acc[r.outputType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalLive = categories.filter(c => c.status === 'live').length;
  const totalWithData = categories.filter(c => c.count !== null && c.count > 0).length;

  return React.createElement('div', { className: 'output-panorama' },
    // 头部
    React.createElement('div', { className: 'header' },
      React.createElement('h1', null, '产出物全景'),
      React.createElement('p', { className: 'subtitle' },
        '四层模型驱动的 15 类可消费产出物 · 追踪内容二次创作'
      ),
      React.createElement('div', { className: 'view-toggle' },
        React.createElement('button', {
          className: view === 'panorama' ? 'active' : '',
          onClick: () => setView('panorama'),
        }, '全景总览'),
        React.createElement('button', {
          className: view === 'reuse' ? 'active' : '',
          onClick: () => setView('reuse'),
        }, '二次创作追踪'),
      ),
    ),

    // 统计卡片
    React.createElement('div', { className: 'stats-bar' },
      React.createElement('div', { className: 'stat' },
        React.createElement('span', { className: 'stat-value' }, `${totalLive}/15`),
        React.createElement('span', { className: 'stat-label' }, '已上线'),
      ),
      React.createElement('div', { className: 'stat' },
        React.createElement('span', { className: 'stat-value' }, String(totalWithData)),
        React.createElement('span', { className: 'stat-label' }, '有数据'),
      ),
      React.createElement('div', { className: 'stat' },
        React.createElement('span', { className: 'stat-value' }, String(reuseRecords.length)),
        React.createElement('span', { className: 'stat-label' }, '二次创作'),
      ),
    ),

    // 全景视图
    view === 'panorama' && React.createElement('div', { className: 'panorama-grid' },
      ['选题', '研究', '写作', '审核'].map(phase =>
        React.createElement('div', { key: phase, className: 'phase-column' },
          React.createElement('h2', {
            style: { color: phaseColors[phase], borderBottom: `2px solid ${phaseColors[phase]}` },
          }, `${phase}阶段`),
          categories.filter(c => c.phase === phase).map(cat =>
            React.createElement('div', {
              key: cat.id,
              className: `output-card ${selectedCategory === cat.id ? 'selected' : ''} status-${cat.status}`,
              onClick: () => setSelectedCategory(cat.id === selectedCategory ? null : cat.id),
            },
              React.createElement('div', { className: 'card-header' },
                React.createElement('span', { className: 'number' }, cat.number),
                React.createElement('span', { className: 'name' }, cat.name),
                React.createElement('span', {
                  className: 'status-badge',
                  style: { color: statusColor[cat.status], fontSize: '12px' },
                }, statusLabel[cat.status]),
              ),
              cat.count !== null && React.createElement('div', { className: 'card-count' },
                React.createElement('strong', null, String(cat.count)),
                React.createElement('span', null, ' 条'),
              ),
              reuseByType[cat.id] && React.createElement('div', { className: 'reuse-count' },
                `被引用 ${reuseByType[cat.id]} 次`
              ),
              selectedCategory === cat.id && React.createElement('p', { className: 'description' },
                cat.description
              ),
            )
          )
        )
      )
    ),

    // 二次创作追踪视图
    view === 'reuse' && React.createElement('div', { className: 'reuse-tracking' },
      React.createElement('h2', null, '二次创作追踪'),
      reuseRecords.length === 0
        ? React.createElement('p', { className: 'empty' },
            '暂无二次创作记录。产出物被 Agent 或编辑引用时将自动记录。'
          )
        : React.createElement('table', { className: 'reuse-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, '产出物类型'),
                React.createElement('th', null, '来源'),
                React.createElement('th', null, '使用任务'),
                React.createElement('th', null, '使用时间'),
                React.createElement('th', null, '效果'),
              )
            ),
            React.createElement('tbody', null,
              reuseRecords.map((r, i) =>
                React.createElement('tr', { key: i },
                  React.createElement('td', null, r.outputType),
                  React.createElement('td', null, r.assetId || r.entityId || '-'),
                  React.createElement('td', null, r.usedInTaskId),
                  React.createElement('td', null, new Date(r.usedAt).toLocaleDateString()),
                  React.createElement('td', null, r.outcome || '-'),
                )
              )
            )
          ),
    ),
  );
}
