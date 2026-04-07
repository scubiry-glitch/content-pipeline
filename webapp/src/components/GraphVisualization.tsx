// Graph Visualization Component
// 渲染 LangGraph Mermaid 流程图，高亮当前活跃节点

import { useState, useEffect, useRef } from 'react';

interface GraphVisualizationProps {
  mermaidCode: string;
  currentNode?: string;
  className?: string;
}

// 节点状态到颜色的映射
const NODE_COLORS: Record<string, string> = {
  planner: '#D46648',
  human_outline: '#C5A572',
  researcher: '#8A9A5B',
  writer: '#5B8A9A',
  blue_team: '#9A5B8A',
  human_approve: '#C5A572',
  output: '#5B9A6B',
};

/**
 * 使用 SVG 渲染简化的 pipeline 图
 * 无需 mermaid.js 依赖，直接用 HTML/CSS 渲染
 */
export function GraphVisualization({ mermaidCode, currentNode, className }: GraphVisualizationProps) {
  const [showRaw, setShowRaw] = useState(false);

  const nodes = [
    { id: 'planner', label: '选题策划', icon: '📋' },
    { id: 'human_outline', label: '大纲确认', icon: '👤' },
    { id: 'researcher', label: '数据研究', icon: '🔍' },
    { id: 'writer', label: '内容写作', icon: '✍️' },
    { id: 'blue_team', label: '蓝军评审', icon: '🛡️' },
    { id: 'human_approve', label: '最终审批', icon: '✅' },
    { id: 'output', label: '输出发布', icon: '📤' },
  ];

  const getNodeStatus = (nodeId: string) => {
    if (!currentNode) return 'pending';
    const currentIdx = nodes.findIndex(n => n.id === currentNode);
    const nodeIdx = nodes.findIndex(n => n.id === nodeId);
    if (nodeIdx < currentIdx) return 'completed';
    if (nodeIdx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <div className={`graph-visualization ${className || ''}`}>
      <div className="graph-header">
        <h3 className="graph-title">Pipeline 流程图</h3>
        <button
          className="graph-toggle-btn"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? '可视化' : 'Mermaid 源码'}
        </button>
      </div>

      {showRaw ? (
        <pre className="graph-mermaid-raw">{mermaidCode}</pre>
      ) : (
        <div className="graph-pipeline">
          {nodes.map((node, idx) => {
            const status = getNodeStatus(node.id);
            return (
              <div key={node.id} className="graph-node-wrapper">
                <div className={`graph-node graph-node--${status}`}
                     style={{
                       borderColor: status === 'active' ? NODE_COLORS[node.id] : undefined,
                       backgroundColor: status === 'active' ? `${NODE_COLORS[node.id]}15` : undefined,
                     }}
                >
                  <span className="graph-node-icon">{node.icon}</span>
                  <span className="graph-node-label">{node.label}</span>
                  {status === 'active' && <span className="graph-node-pulse" />}
                  {status === 'completed' && <span className="graph-node-check">✓</span>}
                </div>
                {idx < nodes.length - 1 && (
                  <div className={`graph-edge graph-edge--${
                    getNodeStatus(nodes[idx + 1].id) === 'pending' ? 'pending' : 'active'
                  }`}>
                    <span className="graph-edge-arrow">→</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* 蓝军评审循环指示 */}
          <div className="graph-loop-indicator">
            <span className="graph-loop-label">评审循环 (writer ↔ blue_team)</span>
          </div>
        </div>
      )}
    </div>
  );
}
