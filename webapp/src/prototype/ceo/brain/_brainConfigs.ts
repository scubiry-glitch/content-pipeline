// Brain 5 子页配置（除 tasks 外，其他都是摘要 + 深链跳现有页）
// 来源: 07-archive/会议纪要 (20260501)/brain-rooms.jsx

import type { SummaryCardConfig } from './SummaryRoom';

export const CONTENT_LIBRARY_INTRO =
  '内容库：结构化记忆 · 事实 / 实体 / 综合 / 共识 / 争议 / 信念演化。CEO 视角只取需要决策的高价值条目；完整管理在 /content-library。';

export const CONTENT_LIBRARY_CARDS: SummaryCardConfig[] = [
  {
    title: '事实 + 实体',
    subtitle: 'fact / entity',
    color: '#7BA7C4',
    bullets: ['结构化抽取的事实', '人物/项目/概念实体图谱', 'PR12 LLM g3 接入后自动联通 CEO Boardroom'],
    link: { label: '进入完整事实库', to: '/content-library/facts' },
  },
  {
    title: '认知综合 + 共识',
    subtitle: 'synthesis / consensus',
    color: '#D9B88E',
    bullets: ['LLM 综合多源', '专家共识图', '可作为 Boardroom 预读包素材'],
    link: { label: '进入综合视图', to: '/content-library/synthesis' },
  },
  {
    title: '争议 + 信念演化',
    subtitle: 'contradictions / beliefs',
    color: '#FFB89A',
    bullets: ['跨源矛盾自动检测', '信念时间轴', 'Compass 战略回响 ⑤ 数据源'],
    link: { label: '进入争议监控', to: '/content-library/contradictions' },
  },
  {
    title: '保鲜度 + 增量',
    subtitle: 'freshness / delta',
    color: '#A6CC9A',
    bullets: ['过时事实标记', '6 小时增量报告', 'War Room 沙盘 Q2 推演输入'],
    link: { label: '进入保鲜度看板', to: '/content-library/freshness' },
  },
];

export const EXPERT_LIBRARY_INTRO =
  '专家库：S 级认知数字孪生 · 心智模型 · 认知盘点。CEO 视角看专家活跃度、互补组合、判断历史命中率。';

export const EXPERT_LIBRARY_CARDS: SummaryCardConfig[] = [
  {
    title: '专家全景图',
    subtitle: 'panorama',
    color: '#7BA7C4',
    bullets: ['12 位 S 级 + 候选名单', '关注领域 / 互补关系网络', 'Boardroom 关切雷达背景'],
    link: { label: '打开专家全景图', to: '/expert-panorama' },
  },
  {
    title: '辩论 / 对比',
    subtitle: 'debate / comparison',
    color: '#FFB89A',
    bullets: ['两两观点对垒', '同议题多专家立场对比', 'Boardroom 反方演练 ⑤ 数据源'],
    link: { label: '打开专家辩论', to: '/expert-debate' },
  },
  {
    title: '心智模型 / 知识图谱',
    subtitle: 'mental models',
    color: '#D9B88E',
    bullets: ['专家常用心智模型清单', '34 个模型命中率追踪', 'Compass 战略漂移检测器'],
    link: { label: '打开心智模型', to: '/mental-models' },
  },
  {
    title: '调度 + 对话',
    subtitle: 'scheduling / chat',
    color: '#A6CC9A',
    bullets: ['专家调度排期 / 邀请回复', '一对一对话历史', 'War Room 阵型缺口建议'],
    link: { label: '打开专家调度', to: '/expert-scheduling' },
  },
];

export const ASSETS_INTRO =
  '资产市集：研报 / 报告 / 简报快照。CEO 视角看可对外发布、可重复使用、可绑定生产任务的资产。';

export const ASSETS_CARDS: SummaryCardConfig[] = [
  {
    title: '研报库',
    subtitle: 'reports',
    color: '#D9B88E',
    bullets: ['全部生产输出研报', '版本管理 / 引用追踪', 'Boardroom 预读包 ② 数据源'],
    link: { label: '打开研报库', to: '/assets/reports' },
  },
  {
    title: '热门资产',
    subtitle: 'popular',
    color: '#FFC857',
    bullets: ['热度排序', '最近 30 天 top'],
    link: { label: '查看热门', to: '/assets/popular' },
  },
  {
    title: 'RSS 订阅',
    subtitle: 'rss feeds',
    color: '#7BA7C4',
    bullets: ['外部信号源', 'Situation 信号墙 ② 来源', '6h 增量入库'],
    link: { label: '打开 RSS', to: '/assets/rss' },
  },
];

export const HOT_TOPICS_INTRO =
  '热议题：议题谱系 + 热度雷达。CEO 视角抓最值得发声、最可能影响利益相关方的话题。';

export const HOT_TOPICS_CARDS: SummaryCardConfig[] = [
  {
    title: '热点列表',
    subtitle: 'list',
    color: '#FFC857',
    bullets: ['当下高热议题', '按 scope/topic 过滤'],
    link: { label: '打开热点列表', to: '/hot-topics' },
  },
  {
    title: '洞察分析',
    subtitle: 'insights',
    color: '#FFB89A',
    bullets: ['议题深度报告', '专家立场聚类', 'Situation 媒体口的素材源'],
    link: { label: '查看洞察', to: '/hot-topics/insights' },
  },
];
