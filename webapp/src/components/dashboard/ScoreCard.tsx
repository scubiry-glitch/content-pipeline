import './Dashboard.css';

interface ScoreCardProps {
  title: string;
  score: number | string;
  trend?: string;
  isMain?: boolean;
}

export function ScoreCard({ title, score, trend, isMain = false }: ScoreCardProps) {
  return (
    <div className={`score-card ${isMain ? 'main' : ''}`}>
      <h3>{title}</h3>
      <div className="score-value">{score}</div>
      {trend && <div className="score-trend">{trend}</div>}
    </div>
  );
}
