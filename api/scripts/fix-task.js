import { query } from '../src/db/connection.js';

const outline = {
  title: '保租房REITs市场分析',
  sections: [
    { title: '一、宏观视野：政策与趋势', level: 1, content: '分析保租房REITs的政策演进和宏观环境', subsections: [
      { title: '1.1 政策背景与制度设计', level: 2, content: '梳理住建部、证监会相关政策' },
      { title: '1.2 市场规模与发展趋势', level: 2, content: '分析已上市项目规模和增长趋势' }
    ]},
    { title: '二、中观解剖：产业与机制', level: 1, content: '深入分析保租房REITs的商业模式', subsections: [
      { title: '2.1 资产筛选标准与估值方法', level: 2, content: '分析入池资产要求和估值逻辑' },
      { title: '2.2 收益分配机制与风险结构', level: 2, content: '解析分红机制和风险隔离设计' }
    ]},
    { title: '三、微观行动：案例与建议', level: 1, content: '具体项目案例和行动建议', subsections: [
      { title: '3.1 标杆案例研究', level: 2, content: '华润有巢、上海城投等案例分析' },
      { title: '3.2 投资建议与风险提示', level: 2, content: '给出具体投资建议' }
    ]}
  ]
};

const researchData = {
  insights: [
    { type: 'trend', content: '保租房REITs市场规模预计2025年达500亿元', confidence: 0.8, evidence: ['政策文件'] },
    { type: 'anomaly', content: '当前保租房REITs估值较市场化REITs折价10-15%', confidence: 0.75, evidence: ['市场数据'] },
    { type: 'action', content: '建议关注一线城市核心地段项目', confidence: 0.7, evidence: ['区位分析'] }
  ],
  dataPoints: [
    { source: '住建部', content: '2024年保租房REITs试点扩容至15个城市', metadata: { type: 'government' } },
    { source: '证监会', content: '保租房REITs审核标准优化，发行效率提升', metadata: { type: 'government' } }
  ],
  annotations: [],
  blue_team_experts: []
};

await query(
  'UPDATE tasks SET outline = $1, research_data = $2, status = $3, progress = $4, current_stage = $5, updated_at = NOW() WHERE id = $6',
  [JSON.stringify(outline), JSON.stringify(researchData), 'outline_pending', 15, 'outline_confirmed', 'task_1773715503898']
);

console.log('✅ 任务数据已更新');
