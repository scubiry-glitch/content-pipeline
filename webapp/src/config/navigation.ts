// 主导航/系统菜单配置 — 全局唯一的导航数据源
// Layout 组件只消费此配置，新增/调整导航项在此处修改

import { ROUTES } from './routes';

export interface NavItem {
  to: string;
  label: string;
  icon?: string;
  children?: NavItem[];
  matchPrefixes?: string[]; // 额外的路径前缀匹配（用于无 children 但需高亮的导航组）
}

export const mainNavItems: NavItem[] = [
  {
    to: ROUTES.ceo.internal.home,
    label: 'CEO 应用',
    icon: '👤',
    matchPrefixes: ['/ceo'],
    children: [
      { to: ROUTES.ceo.internal.home,        label: '六棱镜主页',     icon: '🪞' },
      { to: ROUTES.ceo.internal.panorama,    label: '全景画板',       icon: '🌐' },
      { to: ROUTES.ceo.internal.compass,     label: '方向 · Compass',   icon: '🧭' },
      { to: ROUTES.ceo.internal.boardroom,   label: '董事会 · Boardroom', icon: '🏛️' },
      { to: ROUTES.ceo.internal.tower,       label: '协调 · Tower',     icon: '🎯' },
      { to: ROUTES.ceo.internal.warRoom,     label: '团队 · War Room',  icon: '⚔️' },
      { to: ROUTES.ceo.internal.situation,   label: '各方 · Situation', icon: '🌍' },
      { to: ROUTES.ceo.internal.balcony,     label: '个人 · Balcony',   icon: '🧘' },
      { to: ROUTES.ceo.brain.expertLibrary,  label: '外脑 · 专家库',    icon: '🧠' },
      { to: ROUTES.ceo.brain.tasks,          label: '外脑 · 任务',      icon: '📋' },
      { to: ROUTES.ceo.external.meetings,    label: '外部 · 会议',      icon: '📅' },
      { to: ROUTES.ceo.external.library,     label: '外部 · 库',        icon: '📚' },
    ],
  },
  { to: ROUTES.dashboard, label: '仪表盘', icon: '📊' },
  {
    to: ROUTES.tasks.list,
    label: '任务中心',
    icon: '📋',
    children: [
      { to: ROUTES.tasks.list, label: '任务列表', icon: '📋' },
      { to: ROUTES.tasks.langGraph, label: 'LangGraph任务', icon: '🧠' },
    ],
  },
  {
    to: ROUTES.assets.library,
    label: '内容资产',
    icon: '📚',
    children: [
      { to: ROUTES.assets.library, label: '素材库', icon: '📁' },
      { to: ROUTES.assets.reports, label: '研报', icon: '📊' },
      { to: ROUTES.assets.popular, label: '热门素材', icon: '🔥' },
      { to: ROUTES.assets.rss, label: 'RSS订阅', icon: '📡' },
      { to: ROUTES.assets.meetingNoteSources, label: '会议纪要', icon: '🎙️' },
      { to: ROUTES.assets.bindings, label: '目录绑定', icon: '📂' },
    ],
  },
  {
    to: ROUTES.expert.library,
    label: '专家体系',
    icon: '👥',
    matchPrefixes: [
      ROUTES.expert.library,
      ROUTES.expert.panorama,
      ROUTES.expert.chat,
      ROUTES.expert.comparison,
      ROUTES.expert.network,
      ROUTES.expert.scheduling,
      ROUTES.expert.debate,
      ROUTES.expert.knowledgeGraph,
      '/expert-admin',
      ROUTES.mentalModels,
    ],
    children: [
      { to: ROUTES.expert.library, label: '专家库', icon: '👥' },
      { to: ROUTES.expert.panorama, label: '专家全景图', icon: '🗺️' },
      { to: ROUTES.expert.chat, label: '专家对话', icon: '💬' },
      { to: ROUTES.expert.comparison, label: '专家对比', icon: '⚖️' },
      { to: ROUTES.expert.debate, label: '专家辩论', icon: '🔥' },
      { to: ROUTES.expert.network, label: '专家网络', icon: '🕸️' },
      { to: ROUTES.expert.scheduling, label: '专家调度', icon: '📋' },
      { to: ROUTES.expert.knowledgeGraph, label: '知识图谱', icon: '🧠' },
      { to: ROUTES.mentalModels, label: '心智模型', icon: '🧩' },
    ],
  },
  {
    to: ROUTES.contentLibrary.overview,
    label: '内容库',
    icon: '📚',
    children: [
      { to: ROUTES.contentLibrary.overview, label: '产出物总览', icon: '📊' },
      { to: ROUTES.contentLibrary.topics, label: '①③④ 议题推荐', icon: '🎯' },
      { to: ROUTES.contentLibrary.trends, label: '② 趋势信号', icon: '📈' },
      { to: ROUTES.contentLibrary.facts, label: '⑤ 事实浏览', icon: '📋' },
      { to: ROUTES.contentLibrary.entities, label: '⑥ 实体图谱', icon: '🔗' },
      { to: ROUTES.contentLibrary.delta, label: '⑦ 信息增量', icon: '🔄' },
      { to: ROUTES.contentLibrary.freshness, label: '⑧ 保鲜度', icon: '⏱️' },
      { to: ROUTES.contentLibrary.cards, label: '⑨ 知识卡片', icon: '🃏' },
      { to: ROUTES.contentLibrary.synthesis, label: '⑩ 认知综合', icon: '💡' },
      { to: ROUTES.contentLibrary.materials, label: '⑪ 素材推荐', icon: '📦' },
      { to: ROUTES.contentLibrary.consensus, label: '⑫ 专家共识', icon: '🤝' },
      { to: ROUTES.contentLibrary.contradictions, label: '⑬ 争议话题', icon: '⚡' },
      { to: ROUTES.contentLibrary.beliefs, label: '⑭ 观点演化', icon: '🔀' },
      { to: ROUTES.contentLibrary.crossDomain, label: '⑮ 跨域关联', icon: '🌐' },
      { to: ROUTES.contentLibrary.wiki, label: 'Wiki 物化', icon: '📖' },
      { to: ROUTES.contentLibrary.batchOps, label: '批量操作', icon: '⚡' },
      { to: ROUTES.contentLibrary.pipeline, label: '生产流水线', icon: '🔀' },
    ],
  },
  {
    to: '/meeting/today',
    label: '会议纪要 v2',
    icon: '🗂️',
    matchPrefixes: ['/meeting'],
    children: [
      { to: '/meeting/today',             label: '今天',          icon: '✨' },
      { to: '/meeting/library',           label: '库',            icon: '📁' },
      { to: '/meeting/axes/people',       label: '人物轴',        icon: '👥' },
      { to: '/meeting/axes/projects',     label: '项目轴',        icon: '🕸️' },
      { to: '/meeting/axes/knowledge',    label: '知识轴',        icon: '📘' },
      { to: '/meeting/axes/meta',         label: '会议本身',      icon: '🎯' },
      { to: '/meeting/longitudinal',      label: '纵向视图',      icon: '📈' },
      { to: '/meeting/scopes',            label: '调用配置',      icon: '⚖️' },
      { to: '/meeting/strategies',        label: '策略 / 装饰器', icon: '🔀' },
      { to: '/meeting/generation-center', label: '生成中心',      icon: '▶️' },
      { to: '/meeting/new',               label: '新建',          icon: '➕' },
    ],
  },
  {
    to: ROUTES.hotTopics.list,
    label: '热点洞察',
    icon: '🔥',
    children: [
      { to: ROUTES.hotTopics.list, label: '热点列表', icon: '📋' },
      { to: ROUTES.hotTopics.insights, label: '洞察分析', icon: '💡' },
    ],
  },
  {
    to: ROUTES.aiRecommendations,
    label: 'AI推荐',
    icon: '🤖',
  },
];

export const systemNavItems: NavItem[] = [
  { to: ROUTES.system.settings, label: '设置', icon: '⚙️' },
  { to: ROUTES.system.notifications, label: '通知', icon: '🔔' },
  { to: ROUTES.system.copilot, label: 'Copilot', icon: '🤖' },
  { to: ROUTES.system.compliance, label: '合规', icon: '🛡️' },
  { to: ROUTES.system.i18n, label: '国际化', icon: '🌍' },
];

// 检查当前路径是否匹配导航项
export function isActivePath(pathname: string, item: NavItem): boolean {
  if (pathname === item.to) return true;
  if (item.children) {
    return item.children.some((child) => pathname.startsWith(child.to));
  }
  if (item.matchPrefixes) {
    return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  }
  return false;
}
