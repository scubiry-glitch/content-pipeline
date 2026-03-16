import './Dashboard.css';

interface RSSSource {
  name: string;
  status: 'active' | 'error';
  lastFetch: string;
}

interface RssStatusProps {
  sources: RSSSource[];
}

export function RssStatus({ sources }: RssStatusProps) {
  if (!sources || sources.length === 0) {
    return <div className="alert-placeholder">暂无 RSS 源数据</div>;
  }

  return (
    <div className="rss-status-list">
      {sources.map((source, index) => (
        <div key={index} className="rss-status-item">
          <span>{source.name}</span>
          <span>
            <span className={`status-badge status-${source.status}`}>
              {source.status === 'active' ? '正常' : '异常'}
            </span>
            <span className="last-fetch">{source.lastFetch}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
