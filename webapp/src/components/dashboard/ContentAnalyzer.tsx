import { useState } from 'react';
import './Dashboard.css';

interface AnalysisResult {
  score: number;
  wordCount: number;
  readingTime: number;
  issues: string[];
  suggestions: string[];
}

interface ContentAnalyzerProps {
  onAnalyze: (content: string) => Promise<AnalysisResult>;
}

export function ContentAnalyzer({ onAnalyze }: ContentAnalyzerProps) {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!content.trim()) {
      alert('请输入内容');
      return;
    }

    setLoading(true);
    try {
      const analysis = await onAnalyze(content);
      setResult(analysis);
    } catch (error) {
      console.error('分析失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreClass = (score: number) => {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-medium';
    return 'score-low';
  };

  return (
    <div className="content-analyzer">
      <textarea
        id="content-input"
        placeholder="粘贴文章内容进行分析..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
      />
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? '分析中...' : '分析内容'}
      </button>

      {result && (
        <div id="analysis-result" className="analysis-result show">
          <h3>分析结果</h3>
          <p>
            <strong>质量分数:</strong>{' '}
            <span className={getScoreClass(result.score)}>{result.score}</span>
          </p>
          <p>
            <strong>字数:</strong> {result.wordCount}
          </p>
          <p>
            <strong>预估阅读时间:</strong> {result.readingTime} 分钟
          </p>

          {result.issues.length > 0 ? (
            <>
              <p>
                <strong>问题:</strong>
              </p>
              <ul>
                {result.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>✅ 无明显问题</p>
          )}

          {result.suggestions.length > 0 && (
            <>
              <p>
                <strong>建议:</strong>
              </p>
              <ul>
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
