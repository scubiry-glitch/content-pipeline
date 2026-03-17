import { calculatePriority, getPriorityStyle } from '../utils/priority';
import type { Task } from '../types';
import './PriorityBadge.css';

interface PriorityBadgeProps {
  task: Task;
  showScore?: boolean;
  showTooltip?: boolean;
}

export function PriorityBadge({ task, showScore = false, showTooltip = true }: PriorityBadgeProps) {
  const priority = calculatePriority(task);
  const style = getPriorityStyle(priority.level);

  return (
    <div
      className="priority-badge-wrapper"
      title={showTooltip ? `优先级: ${style.label}\n原因: ${priority.reason}${showScore ? `\n分数: ${priority.score}` : ''}` : undefined}
    >
      <span
        className={`priority-badge priority-${priority.level}`}
        style={{
          backgroundColor: style.bg,
          color: style.color
        }}
      >
        <span className="priority-icon">{style.icon}</span>
        <span className="priority-label">{style.label}</span>
        {showScore && (
          <span className="priority-score">{priority.score}</span>
        )}
      </span>
    </div>
  );
}

interface PriorityFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  const options = [
    { key: 'all', label: '全部优先级', icon: '📋' },
    { key: 'urgent', label: '紧急', icon: '🔴' },
    { key: 'high', label: '高', icon: '🟠' },
    { key: 'medium', label: '中', icon: '🔵' },
    { key: 'low', label: '低', icon: '🟢' },
  ];

  return (
    <div className="priority-filter">
      <label className="filter-label">优先级:</label>
      <select
        className="priority-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.icon} {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface PrioritySortButtonProps {
  onSort: () => void;
  isActive: boolean;
}

export function PrioritySortButton({ onSort, isActive }: PrioritySortButtonProps) {
  return (
    <button
      className={`priority-sort-btn ${isActive ? 'active' : ''}`}
      onClick={onSort}
      title="按智能优先级排序"
    >
      {isActive ? '🔽' : '🔃'} 智能排序
    </button>
  );
}
