// 外部链接引用列表组件
import type { ResearchAnnotation } from '../api/client';

interface ExternalLinksListProps {
  annotations: ResearchAnnotation[];
}

const levelColors: Record<string, { bg: string; color: string }> = {
  A: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  B: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  C: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  D: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
};

function getCredibilityLevel(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 0.9) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.5) return 'C';
  return 'D';
}

export function ExternalLinksList({ annotations }: ExternalLinksListProps) {
  const urlAnnotations = annotations.filter(a => a.type === 'url');

  if (urlAnnotations.length === 0) return null;

  return (
    <div className="info-card">
      <h3 className="card-title">🔗 外部链接引用</h3>
      <div className="annotation-list">
        {urlAnnotations.map((annotation) => {
          const cred = annotation.credibility?.overall || 0.6;
          const level = getCredibilityLevel(cred);
          const style = levelColors[level];
          return (
            <div key={annotation.id} className="annotation-item">
              <span className="annotation-icon">🔗</span>
              <div className="annotation-content">
                <div className="annotation-title">
                  {annotation.title}
                  <span className="credibility-tag" style={{ background: style.bg, color: style.color }}>
                    {level}级 · {(cred * 100).toFixed(0)}%
                  </span>
                </div>
                <a href={annotation.url} target="_blank" rel="noopener noreferrer" className="annotation-url">
                  {annotation.url}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
