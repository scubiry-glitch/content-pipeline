// ⑫ 专家共识/分歧图表组件
import React from 'react';

interface ConsensusData {
  topic: string;
  experts: Array<{
    expertId: string;
    expertName: string;
    stance: string;
    keyArguments: string[];
  }>;
  consensusPoints: string[];
  divergencePoints: string[];
}

interface ConsensusChartProps {
  data: ConsensusData;
}

export function ConsensusChart({ data }: ConsensusChartProps) {
  return React.createElement('div', { className: 'consensus-chart' },
    React.createElement('h2', null, `共识/分歧: ${data.topic}`),

    // 共识点
    data.consensusPoints.length > 0 && React.createElement('section', { className: 'consensus' },
      React.createElement('h3', { style: { color: '#38a169' } }, '共识'),
      React.createElement('ul', null,
        data.consensusPoints.map((p, i) => React.createElement('li', { key: i }, p))
      )
    ),

    // 分歧点
    data.divergencePoints.length > 0 && React.createElement('section', { className: 'divergence' },
      React.createElement('h3', { style: { color: '#e53e3e' } }, '分歧'),
      React.createElement('ul', null,
        data.divergencePoints.map((p, i) => React.createElement('li', { key: i }, p))
      )
    ),

    // 专家立场
    React.createElement('section', { className: 'expert-stances' },
      React.createElement('h3', null, '专家立场'),
      data.experts.map((e, i) =>
        React.createElement('div', { key: i, className: 'expert-stance' },
          React.createElement('strong', null, e.expertName),
          React.createElement('span', { className: 'stance' }, e.stance),
          React.createElement('ul', null,
            e.keyArguments.map((a, j) => React.createElement('li', { key: j }, a))
          )
        )
      )
    )
  );
}
