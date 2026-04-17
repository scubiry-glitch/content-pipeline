// 专家知识图谱 - Expert Knowledge Graph
// 可视化展示专家、领域、话题、观点之间的关系

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useExperts } from '../hooks/useExpertApi';
import './ExpertKnowledgeGraph.css';

interface KnowledgeNode {
  id: string;
  name: string;
  value: number;
  category: number;
  symbolSize: number;
  itemStyle?: {
    color?: string;
  };
  label?: {
    show?: boolean;
  };
  // 节点类型标识
  nodeType: 'expert' | 'domain' | 'concept' | 'topic';
  // 原始数据引用
  data?: any;
}

interface KnowledgeLink {
  source: string;
  target: string;
  value: number;
  label?: {
    show?: boolean;
    formatter?: string;
  };
  lineStyle?: {
    width?: number;
    curveness?: number;
    opacity?: number;
    type?: 'solid' | 'dashed' | 'dotted';
  };
}

// 领域配置
const DOMAIN_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  S: { name: '特级专家', color: '#f59e0b', icon: '⭐' },
  E01: { name: '宏观经济', color: '#6366f1', icon: '📊' },
  E02: { name: '金融科技', color: '#8b5cf6', icon: '💰' },
  E03: { name: '新能源', color: '#22c55e', icon: '⚡' },
  E04: { name: '医疗健康', color: '#ef4444', icon: '🏥' },
  E05: { name: '消费零售', color: '#ec4899', icon: '🛍️' },
  E06: { name: '半导体', color: '#14b8a6', icon: '🔷' },
  E07: { name: '人工智能', color: '#3b82f6', icon: '🤖' },
  E08: { name: '房地产', color: '#f97316', icon: '🏢' },
  E09: { name: '文化传媒', color: '#a855f7', icon: '🎬' },
  E10: { name: '先进制造', color: '#64748b', icon: '🏭' },
  E11: { name: 'ESG可持续', color: '#10b981', icon: '🌱' },
  E12: { name: '跨境出海', color: '#0ea5e9', icon: '🚢' },
};

// 示例热点话题
const HOT_TOPICS = [
  { id: 'topic-1', name: '央行降准', keywords: ['货币政策', '流动性', '房地产'] },
  { id: 'topic-2', name: '新能源出海', keywords: ['本地化', '品牌', '政策合规'] },
  { id: 'topic-3', name: 'AI大模型', keywords: ['智能投顾', '风控', '金融科技'] },
  { id: 'topic-4', name: '消费分级', keywords: ['性价比', '品牌', '下沉市场'] },
  { id: 'topic-5', name: '半导体国产替代', keywords: ['产业链', '芯片', '设备材料'] },
];

export function ExpertKnowledgeGraph() {
  const navigate = useNavigate();
  const { experts, isLoading: loading } = useExperts();
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [viewType, setViewType] = useState<'full' | 'domain' | 'topic'>('full');

  // 构建知识图谱数据
  const { nodes, links, categories } = useMemo(() => {
    const knowledgeNodes: KnowledgeNode[] = [];
    const knowledgeLinks: KnowledgeLink[] = [];

    // 按领域过滤
    const filteredExperts =
      filterDomain === 'all'
        ? experts
        : experts.filter((e) => e.domainCode === filterDomain);

    // 1. 添加领域节点（中心节点）
    const domainsToShow =
      filterDomain === 'all'
        ? Object.keys(DOMAIN_CONFIG)
        : [filterDomain];

    domainsToShow.forEach((domainCode, index) => {
      const config = DOMAIN_CONFIG[domainCode];
      knowledgeNodes.push({
        id: `domain-${domainCode}`,
        name: config.name,
        value: 100,
        category: index,
        symbolSize: 60,
        itemStyle: { color: config.color },
        label: { show: true },
        nodeType: 'domain',
        data: { code: domainCode, ...config },
      });
    });

    // 2. 添加专家节点
    filteredExperts.forEach((expert, index) => {
      const domainIndex = domainsToShow.indexOf(expert.domainCode);

      knowledgeNodes.push({
        id: expert.id,
        name: expert.name,
        value: Math.round(expert.acceptanceRate * 100),
        category: domainIndex >= 0 ? domainIndex : 0,
        symbolSize: expert.level === 'senior' ? 45 : 30,
        itemStyle: {
          color: DOMAIN_CONFIG[expert.domainCode]?.color || '#6366f1',
        },
        label: { show: expert.level === 'senior' },
        nodeType: 'expert',
        data: expert,
      });

      // 连接专家到领域
      knowledgeLinks.push({
        source: `domain-${expert.domainCode}`,
        target: expert.id,
        value: 50,
        lineStyle: {
          width: 2,
          curveness: 0.1,
          opacity: 0.4,
          type: 'solid',
        },
      });
    });

    // 3. 添加概念节点（从专家哲学思想提取）
    const conceptSet = new Set<string>();
    filteredExperts.forEach((expert) => {
      expert.philosophy.core.forEach((p) => {
        // 提取关键词（简化处理）
        const keywords = p.split(/[，,、]/).map((k) => k.trim()).filter((k) => k.length > 2);
        keywords.forEach((k) => conceptSet.add(k));
      });
    });

    const concepts = Array.from(conceptSet).slice(0, 20); // 限制概念数量
    concepts.forEach((concept, index) => {
      const conceptId = `concept-${index}`;
      knowledgeNodes.push({
        id: conceptId,
        name: concept,
        value: 30,
        category: domainsToShow.length, // 单独类别
        symbolSize: 20,
        itemStyle: { color: '#94a3b8' },
        label: { show: false },
        nodeType: 'concept',
      });

      // 连接相关专家
      filteredExperts.forEach((expert) => {
        if (
          expert.philosophy.core.some((p) =>
            p.toLowerCase().includes(concept.toLowerCase())
          )
        ) {
          knowledgeLinks.push({
            source: expert.id,
            target: conceptId,
            value: 20,
            lineStyle: {
              width: 1,
              curveness: 0.2,
              opacity: 0.2,
              type: 'dashed',
            },
          });
        }
      });
    });

    // 4. 添加话题节点（如果视图类型包含话题）
    if (viewType === 'topic' || viewType === 'full') {
      HOT_TOPICS.forEach((topic, index) => {
        const topicId = `topic-${topic.id}`;
        knowledgeNodes.push({
          id: topicId,
          name: topic.name,
          value: 40,
          category: domainsToShow.length + 1,
          symbolSize: 35,
          itemStyle: { color: '#f472b6' },
          label: { show: true },
          nodeType: 'topic',
          data: topic,
        });

        // 模拟话题与专家的关联
        filteredExperts.slice(0, 5).forEach((expert) => {
          knowledgeLinks.push({
            source: topicId,
            target: expert.id,
            value: 25,
            lineStyle: {
              width: 1.5,
              curveness: 0.15,
              opacity: 0.3,
              type: 'dotted',
            },
          });
        });
      });
    }

    // 构建类别
    const categories = domainsToShow.map((code) => ({
      name: DOMAIN_CONFIG[code].name,
      itemStyle: { color: DOMAIN_CONFIG[code].color },
    }));

    categories.push({ name: '核心概念', itemStyle: { color: '#94a3b8' } });
    if (viewType === 'topic' || viewType === 'full') {
      categories.push({ name: '热点话题', itemStyle: { color: '#f472b6' } });
    }

    return { nodes: knowledgeNodes, links: knowledgeLinks, categories };
  }, [experts, filterDomain, viewType]);

  // ECharts 配置
  const chartOption = useMemo(
    () => ({
      title: {
        text: '专家知识图谱',
        subtext: `${nodes.length} 个节点，${links.length} 条关系`,
        left: 'center',
        top: 10,
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const node = params.data as KnowledgeNode;
            const typeLabels: Record<string, string> = {
              expert: '专家',
              domain: '领域',
              concept: '核心概念',
              topic: '热点话题',
            };

            let html = `
              <div style="padding: 8px;">
                <strong>${node.name}</strong>
                <br/>
                <span style="color: #666;">${typeLabels[node.nodeType]}</span>
            `;

            if (node.nodeType === 'expert' && node.data) {
              html += `
                <br/>
                <span>采纳率: ${(node.data.acceptanceRate * 100).toFixed(0)}%</span>
                <br/>
                <span>${node.data.profile.title}</span>
              `;
            }

            html += '</div>';
            return html;
          }
          return `${params.name}: ${params.value}`;
        },
      },
      legend: {
        data: categories.map((c) => c.name),
        orient: 'vertical',
        left: 10,
        top: 60,
        type: 'scroll',
      },
      series: [
        {
          name: '知识图谱',
          type: 'graph',
          layout: 'force',
          data: nodes,
          links: links,
          categories: categories,
          roam: true,
          draggable: true,
          focusNodeAdjacency: true,
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.2)',
          },
          label: {
            show: true,
            position: 'bottom',
            formatter: '{b}',
            fontSize: 11,
            color: '#333',
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
            },
            label: {
              show: true,
            },
          },
          force: {
            repulsion: 400,
            gravity: 0.05,
            edgeLength: [80, 250],
            layoutAnimation: true,
          },
          lineStyle: {
            color: 'source',
            curveness: 0.2,
          },
        },
      ],
    }),
    [nodes, links, categories]
  );

  // 处理节点点击
  const handleChartClick = (params: any) => {
    if (params.dataType === 'node') {
      setSelectedNode(params.data);
    }
  };

  if (loading) {
    return (
      <div className="expert-knowledge-graph-page loading">
        <div className="loading-spinner"></div>
        <p>加载知识图谱...</p>
      </div>
    );
  }

  return (
    <div className="expert-knowledge-graph-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1>🧠 专家知识图谱</h1>
        <p className="subtitle">可视化展示专家知识体系与概念关联</p>
      </div>

      {/* 控制面板 */}
      <div className="control-panel">
        <div className="filter-section">
          <span className="label">领域筛选:</span>
          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            className="domain-select"
          >
            <option value="all">全部领域</option>
            {Object.entries(DOMAIN_CONFIG).map(([code, config]) => (
              <option key={code} value={code}>
                {config.icon} {config.name}
              </option>
            ))}
          </select>
        </div>

        <div className="view-toggle">
          <span className="label">视图模式:</span>
          <div className="toggle-group">
            <button
              className={viewType === 'full' ? 'active' : ''}
              onClick={() => setViewType('full')}
            >
              完整
            </button>
            <button
              className={viewType === 'domain' ? 'active' : ''}
              onClick={() => setViewType('domain')}
            >
              领域
            </button>
            <button
              className={viewType === 'topic' ? 'active' : ''}
              onClick={() => setViewType('topic')}
            >
              话题
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="graph-content">
        {/* 知识图谱 */}
        <div className="chart-container">
          <ReactECharts
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            onEvents={{
              click: handleChartClick,
            }}
          />
        </div>

        {/* 信息面板 */}
        <div className="info-panel">
          {selectedNode ? (
            <div className="node-detail-card">
              <div
                className="card-header"
                style={{
                  background:
                    selectedNode.nodeType === 'expert'
                      ? `linear-gradient(135deg, ${selectedNode.itemStyle?.color} 0%, ${selectedNode.itemStyle?.color}dd 100%)`
                      : 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
                }}
              >
                <span className="node-type">{selectedNode.nodeType}</span>
                <h3>{selectedNode.name}</h3>
              </div>

              <div className="card-body">
                {selectedNode.nodeType === 'expert' && selectedNode.data && (
                  <>
                    <p className="expert-title">
                      {selectedNode.data.profile.title}
                    </p>
                    <div className="expert-stats">
                      <div className="stat">
                        <span className="stat-value">
                          {(selectedNode.data.acceptanceRate * 100).toFixed(0)}%
                        </span>
                        <span className="stat-label">采纳率</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">
                          {selectedNode.data.totalReviews}
                        </span>
                        <span className="stat-label">评审次数</span>
                      </div>
                    </div>
                    <div className="expert-philosophy">
                      <h4>核心思想</h4>
                      <ul>
                        {selectedNode.data.philosophy.core
                          .slice(0, 3)
                          .map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                          ))}
                      </ul>
                    </div>
                  </>
                )}

                {selectedNode.nodeType === 'domain' && (
                  <p className="description">
                    {DOMAIN_CONFIG[selectedNode.data?.code]?.icon}{' '}
                    {selectedNode.name}领域专家群体
                  </p>
                )}

                {selectedNode.nodeType === 'concept' && (
                  <p className="description">
                    核心投资理念与思想概念
                  </p>
                )}

                {selectedNode.nodeType === 'topic' && selectedNode.data && (
                  <div className="topic-keywords">
                    <h4>相关关键词</h4>
                    <div className="keyword-tags">
                      {selectedNode.data.keywords.map((kw: string, i: number) => (
                        <span key={i} className="keyword-tag">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedNode.nodeType === 'expert' && (
                <div className="card-actions">
                  <button
                    className="btn-primary"
                    onClick={() => navigate(`/experts?highlight=${selectedNode.id}`)}
                  >
                    查看详情
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-panel">
              <div className="empty-icon">🧠</div>
              <p>点击图谱节点</p>
              <span>查看专家、领域或话题详情</span>
            </div>
          )}

          {/* 图例说明 */}
          <div className="legend-panel">
            <h4>📊 图谱说明</h4>
            <div className="legend-items">
              <div className="legend-item">
                <span
                  className="symbol"
                  style={{ background: '#f59e0b', borderRadius: '50%' }}
                ></span>
                <span>大圆 = 领域中心</span>
              </div>
              <div className="legend-item">
                <span
                  className="symbol"
                  style={{ background: '#6366f1', borderRadius: '50%' }}
                ></span>
                <span>中圆 = 专家</span>
              </div>
              <div className="legend-item">
                <span
                  className="symbol"
                  style={{ background: '#94a3b8', borderRadius: '50%' }}
                ></span>
                <span>小圆 = 核心概念</span>
              </div>
              <div className="legend-item">
                <span
                  className="symbol"
                  style={{ background: '#f472b6', borderRadius: '50%' }}
                ></span>
                <span>粉色 = 热点话题</span>
              </div>
              <div className="legend-item">
                <span className="line solid"></span>
                <span>实线 = 归属关系</span>
              </div>
              <div className="legend-item">
                <span className="line dashed"></span>
                <span>虚线 = 概念关联</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
