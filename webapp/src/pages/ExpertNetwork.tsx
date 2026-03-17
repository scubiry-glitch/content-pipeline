// 专家协作网络分析 - Expert Collaboration Network
// 可视化展示专家影响力网络和领域关联

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import {
  getAllExperts,
  getExpertFeedbackStats,
  type Expert,
} from '../services/expertService';
import './ExpertNetwork.css';

interface NetworkNode {
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
  // 扩展属性
  domainCode: string;
  domainName: string;
  level: string;
  acceptanceRate: number;
  totalReviews: number;
}

interface NetworkLink {
  source: string;
  target: string;
  value: number;
  lineStyle?: {
    width?: number;
    curveness?: number;
    opacity?: number;
  };
}

const DOMAIN_COLORS: Record<string, string> = {
  S: '#f59e0b',
  E01: '#6366f1',
  E02: '#8b5cf6',
  E03: '#22c55e',
  E04: '#ef4444',
  E05: '#ec4899',
  E06: '#14b8a6',
  E07: '#3b82f6',
  E08: '#f97316',
  E09: '#a855f7',
  E10: '#64748b',
  E11: '#10b981',
  E12: '#0ea5e9',
};

const DOMAIN_NAMES: Record<string, string> = {
  S: '特级专家',
  E01: '宏观经济',
  E02: '金融科技',
  E03: '新能源',
  E04: '医疗健康',
  E05: '消费零售',
  E06: '半导体',
  E07: '人工智能',
  E08: '房地产',
  E09: '文化传媒',
  E10: '先进制造',
  E11: 'ESG可持续',
  E12: '跨境出海',
};

export function ExpertNetwork() {
  const navigate = useNavigate();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'senior' | 'domain'>('all');

  useEffect(() => {
    loadExperts();
  }, []);

  const loadExperts = () => {
    setLoading(true);
    const allExperts = getAllExperts();
    setExperts(allExperts);
    setLoading(false);
  };

  // 构建网络图数据
  const { nodes, links, categories } = useMemo(() => {
    const domainList = Object.keys(DOMAIN_NAMES);

    // 按视图模式过滤
    const filteredExperts =
      viewMode === 'all'
        ? experts
        : viewMode === 'senior'
          ? experts.filter((e) => e.level === 'senior')
          : experts.filter((e) => e.level === 'domain');

    // 构建节点
    const networkNodes: NetworkNode[] = filteredExperts.map((expert) => {
      const stats = getExpertFeedbackStats(expert.id);
      const value = Math.round(stats.acceptanceRate * 100);

      return {
        id: expert.id,
        name: expert.name,
        value,
        category: domainList.indexOf(expert.domainCode),
        symbolSize: expert.level === 'senior' ? 50 : 30 + value * 0.2,
        itemStyle: {
          color: DOMAIN_COLORS[expert.domainCode] || '#6366f1',
        },
        label: {
          show: expert.level === 'senior' || value > 80,
        },
        domainCode: expert.domainCode,
        domainName: expert.domainName,
        level: expert.level,
        acceptanceRate: stats.acceptanceRate,
        totalReviews: stats.totalReviews,
      };
    });

    // 构建连接（基于领域关联）
    const networkLinks: NetworkLink[] = [];
    for (let i = 0; i < filteredExperts.length; i++) {
      for (let j = i + 1; j < filteredExperts.length; j++) {
        const expertA = filteredExperts[i];
        const expertB = filteredExperts[j];

        // 计算关联强度
        let strength = 0;

        // 同领域关联强
        if (expertA.domainCode === expertB.domainCode) {
          strength += 0.5;
        }

        // 特级专家与领域专家关联
        if (
          (expertA.level === 'senior' && expertB.level === 'domain') ||
          (expertA.level === 'domain' && expertB.level === 'senior')
        ) {
          strength += 0.3;
        }

        // 哲学思想相似度
        const commonPhilosophy = expertA.philosophy.core.filter((p) =>
          expertB.philosophy.core.some((bp) =>
            p.toLowerCase().includes(bp.toLowerCase()) ||
            bp.toLowerCase().includes(p.toLowerCase())
          )
        ).length;
        strength += commonPhilosophy * 0.1;

        if (strength > 0.3) {
          networkLinks.push({
            source: expertA.id,
            target: expertB.id,
            value: Math.round(strength * 100),
            lineStyle: {
              width: strength * 3,
              curveness: 0.2,
              opacity: 0.3 + strength * 0.5,
            },
          });
        }
      }
    }

    const categories = domainList.map((code) => ({
      name: DOMAIN_NAMES[code],
      itemStyle: {
        color: DOMAIN_COLORS[code],
      },
    }));

    return { nodes: networkNodes, links: networkLinks, categories };
  }, [experts, viewMode]);

  // ECharts 配置
  const chartOption = useMemo(
    () => ({
      title: {
        text: '专家协作网络',
        subtext: `共 ${nodes.length} 位专家，${links.length} 条关联`,
        left: 'center',
        top: 10,
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const node = params.data as NetworkNode;
            return `
              <div style="padding: 8px;">
                <strong>${node.name}</strong>
                <br/>
                <span style="color: #666;">${node.domainName}</span>
                <br/>
                <span>采纳率: ${(node.acceptanceRate * 100).toFixed(0)}%</span>
                <br/>
                <span>评审次数: ${node.totalReviews}</span>
                ${node.level === 'senior' ? '<br/><span style="color: #f59e0b;">⭐ 特级专家</span>' : ''}
              </div>
            `;
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
          name: '专家网络',
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
            shadowColor: 'rgba(0, 0, 0, 0.3)',
          },
          label: {
            show: true,
            position: 'bottom',
            formatter: '{b}',
            fontSize: 12,
            color: '#333',
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 4,
            },
          },
          force: {
            repulsion: 300,
            gravity: 0.1,
            edgeLength: [50, 200],
            layoutAnimation: true,
          },
          lineStyle: {
            color: 'source',
            curveness: 0.2,
          },
          edgeSymbol: ['circle', 'arrow'],
          edgeSymbolSize: [4, 10],
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
      <div className="expert-network-page loading">
        <div className="loading-spinner"></div>
        <p>加载专家网络...</p>
      </div>
    );
  }

  return (
    <div className="expert-network-page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1>🕸️ 专家协作网络</h1>
        <p className="subtitle">可视化展示专家影响力关系和领域协作</p>
      </div>

      {/* 视图控制 */}
      <div className="view-controls">
        <div className="control-group">
          <span className="label">视图模式:</span>
          <div className="btn-group">
            <button
              className={viewMode === 'all' ? 'active' : ''}
              onClick={() => setViewMode('all')}
            >
              全部专家
            </button>
            <button
              className={viewMode === 'senior' ? 'active' : ''}
              onClick={() => setViewMode('senior')}
            >
              特级专家
            </button>
            <button
              className={viewMode === 'domain' ? 'active' : ''}
              onClick={() => setViewMode('domain')}
            >
              领域专家
            </button>
          </div>
        </div>

        <div className="stats-summary">
          <span className="stat-item">
            <strong>{nodes.length}</strong> 位专家
          </span>
          <span className="stat-item">
            <strong>{links.length}</strong> 条关联
          </span>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="network-content">
        {/* 网络图 */}
        <div className="chart-container">
          <ReactECharts
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            onEvents={{
              click: handleChartClick,
            }}
          />
        </div>

        {/* 侧边信息面板 */}
        <div className="info-panel">
          {selectedNode ? (
            <div className="expert-detail-card">
              <div
                className="expert-header"
                style={{
                  background: `linear-gradient(135deg, ${DOMAIN_COLORS[selectedNode.domainCode]} 0%, ${DOMAIN_COLORS[selectedNode.domainCode]}dd 100%)`,
                }}
              >
                <div className="expert-avatar-large">
                  {selectedNode.name.charAt(0)}
                </div>
                <div className="expert-title">
                  <h3>{selectedNode.name}</h3>
                  <span>{selectedNode.domainName}</span>
                </div>
              </div>

              <div className="expert-stats">
                <div className="stat-row">
                  <span className="stat-label">采纳率</span>
                  <span className="stat-value">
                    {(selectedNode.acceptanceRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">评审次数</span>
                  <span className="stat-value">
                    {selectedNode.totalReviews}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">专家级别</span>
                  <span className="stat-value">
                    {selectedNode.level === 'senior' ? '特级专家' : '领域专家'}
                  </span>
                </div>
              </div>

              <div className="expert-actions">
                <button
                  className="btn-primary"
                  onClick={() => navigate(`/experts?highlight=${selectedNode.id}`)}
                >
                  查看详情
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`/expert-comparison?experts=${selectedNode.id}`)}
                >
                  加入对比
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <div className="empty-icon">👆</div>
              <p>点击网络图中的节点</p>
              <span>查看专家详细信息</span>
            </div>
          )}

          {/* 网络说明 */}
          <div className="network-legend">
            <h4>📊 图表说明</h4>
            <ul>
              <li>
                <span className="dot senior"></span>
                大圆 = 特级专家
              </li>
              <li>
                <span className="dot domain"></span>
                小圆 = 领域专家
              </li>
              <li>
                <span className="line"></span>
                连线 = 协作关系
              </li>
              <li>
                <span className="color-bar"></span>
                颜色 = 不同领域
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
