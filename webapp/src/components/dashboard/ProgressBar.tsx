import './Dashboard.css';

interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const getColorClass = () => {
    if (value >= 80) return 'progress-high';
    if (value >= 60) return 'progress-medium';
    return 'progress-low';
  };

  return (
    <div className={`progress-bar ${getColorClass()}`}>
      <div className="progress-fill" style={{ width: `${value}%` }}></div>
      <span className="progress-label">{label || `${value}%`}</span>
    </div>
  );
}
