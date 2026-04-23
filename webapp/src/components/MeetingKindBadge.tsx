// v7.6 会议性质徽章
// 轻量展示 asset.metadata.meeting_kind；未知 / 缺省时渲染 null（不占位）。
import { MEETING_KIND_META, type MeetingKind } from '../types';
import './MeetingKindBadge.css';

interface Props {
  kind: string | undefined | null;
  /** compact=true 时只显示图标 + 短 label，用于卡片；false 时显示完整 tooltip hint */
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

function isKnown(v: string): v is MeetingKind {
  return v in MEETING_KIND_META;
}

export function MeetingKindBadge({ kind, compact = true, onClick, className = '' }: Props) {
  if (!kind || !isKnown(kind)) return null;
  const meta = MEETING_KIND_META[kind];
  return (
    <span
      className={`mkb-badge ${onClick ? 'mkb-clickable' : ''} ${className}`}
      style={{ ['--mkb-color' as any]: meta.color }}
      title={compact ? `${meta.label} — ${meta.hint}` : meta.hint}
      onClick={onClick}
      data-kind={kind}
    >
      <span className="mkb-icon" aria-hidden>{meta.icon}</span>
      <span className="mkb-label">{meta.label}</span>
    </span>
  );
}

export default MeetingKindBadge;
