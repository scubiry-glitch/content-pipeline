// Brain 子页 stub - 通用占位
// PR11 各自实装

import { useParams } from 'react-router-dom';

const SUB_META: Record<string, { icon: string; title: string; desc: string }> = {
  tasks: {
    icon: '📋',
    title: '任务队列',
    desc: '聚合 mn_runs (module IN \'mn\',\'ceo\') 跨模块运行任务',
  },
  'content-library': {
    icon: '📚',
    title: '内容库视图',
    desc: '内嵌 content-library 摘要 — 事实 / 实体 / 综合',
  },
  'expert-library': {
    icon: '👥',
    title: '专家库视图',
    desc: '三视图: 按专家 / 按模型 / 认知盘点',
  },
  assets: {
    icon: '📦',
    title: '素材市集',
    desc: '资产市集 — 研报 / 报告 / 简报快照',
  },
  'hot-topics': {
    icon: '🔥',
    title: '热议题',
    desc: '议题谱系 — 热度 / 趋势 / 跨域',
  },
};

export function BrainStub() {
  const { sub } = useParams<{ sub: string }>();
  const meta = sub ? SUB_META[sub] : undefined;

  if (!meta) {
    return (
      <div style={{ color: 'rgba(232,227,216,0.6)', fontFamily: 'var(--serif)' }}>
        未知子页: {sub}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(217,184,142,0.05)',
        border: '1px solid rgba(217,184,142,0.18)',
        borderRadius: 8,
        padding: '40px 44px',
        textAlign: 'center',
        color: '#F3ECDD',
        maxWidth: 800,
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>{meta.icon}</div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 28,
          fontWeight: 500,
          marginBottom: 10,
        }}
      >
        {meta.title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(232,227,216,0.55)',
          marginBottom: 24,
          lineHeight: 1.6,
        }}
      >
        {meta.desc}
      </div>
      <div
        style={{
          display: 'inline-block',
          padding: '6px 14px',
          background: 'rgba(217,184,142,0.12)',
          border: '1px solid rgba(217,184,142,0.3)',
          borderRadius: 99,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: '#D9B88E',
          letterSpacing: 0.3,
        }}
      >
        建设中 · 完整实现见 PR11
      </div>
    </div>
  );
}

export default BrainStub;
