// 文本情感分析器：输入 → 调用 analyze API → 展示结果 + 本地历史
import { useEffect, useState } from 'react';
import { sentimentApi as v2Api, type SentimentResult } from '../../api/sentiment';
import { POLARITY_COLORS, polarityEmoji, polarityLabel } from './colors';

const HISTORY_KEY = 'sentiment-analyzer-history';
const MAX_HISTORY = 5;

interface HistoryItem {
  text: string;
  result: SentimentResult;
  at: string;
}

export function TextAnalyzer() {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 加载本地历史
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await v2Api.analyze(text);
      const data = (res as any).data as SentimentResult;
      setResult(data);
      const next = [
        { text: text.trim().slice(0, 80), result: data, at: new Date().toISOString() },
        ...history,
      ].slice(0, MAX_HISTORY);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (e: any) {
      setError(e?.message || '分析失败，请检查后端服务 /sentiment/analyze');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  return (
    <div className="analyzer-section">
      <div className="analyzer-card">
        <textarea
          className="analyze-input"
          placeholder="输入要分析的文本，例如：公司业绩增长强劲，市场前景乐观..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
        />
        <div className="analyzer-actions">
          <button
            className="btn btn-primary analyze-btn"
            onClick={handleAnalyze}
            disabled={analyzing || !text.trim()}
          >
            {analyzing ? '分析中...' : '🔍 分析情感'}
          </button>
          {text && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setText('');
                setResult(null);
                setError(null);
              }}
            >
              清空
            </button>
          )}
        </div>

        {error && <div className="analyzer-error">{error}</div>}

        {result && (
          <div className="analyze-result">
            <h3 className="result-title">分析结果</h3>
            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">情感极性</span>
                <span
                  className="result-value result-polarity"
                  style={{ color: POLARITY_COLORS[result.polarity] }}
                >
                  {polarityEmoji(result.polarity)} {polarityLabel(result.polarity)}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">情感强度</span>
                <div className="intensity-bar">
                  <div
                    className="intensity-fill"
                    style={{
                      width: `${result.intensity}%`,
                      background: POLARITY_COLORS[result.polarity],
                    }}
                  />
                </div>
                <span className="intensity-value">{result.intensity}%</span>
              </div>
              <div className="result-item">
                <span className="result-label">置信度</span>
                <span className="result-value">
                  {(result.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {result.keywords?.length > 0 && (
              <div className="keywords-section">
                <span className="keywords-label">关键词：</span>
                <div className="keywords-list">
                  {result.keywords.map((kw, i) => (
                    <span key={i} className="keyword-tag">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="analyzer-history">
          <div className="history-header">
            <h4>近 {history.length} 次分析</h4>
            <button className="btn-link" onClick={handleClearHistory}>
              清空历史
            </button>
          </div>
          <ul className="history-list">
            {history.map((h, i) => (
              <li key={i} className="history-item">
                <span
                  className="history-dot"
                  style={{ background: POLARITY_COLORS[h.result.polarity] }}
                />
                <div className="history-text">
                  <p>{h.text}</p>
                  <span className="history-meta">
                    {polarityLabel(h.result.polarity)} · 强度 {h.result.intensity}% ·{' '}
                    {new Date(h.at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
