import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './GlobalSearch.css';

interface SearchResult {
  id: string;
  title: string;
  type: 'task' | 'asset' | 'report' | 'topic';
  subtitle?: string;
  path: string;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 模拟搜索结果 - 实际应调用API
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    // 模拟搜索延迟
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 模拟搜索结果
    const mockResults = ([
      {
        id: '1',
        title: `任务: "${searchQuery}" 相关研究`,
        type: 'task' as const,
        subtitle: '状态: 进行中',
        path: '/tasks',
      },
      {
        id: '2',
        title: `素材: ${searchQuery} 数据`,
        type: 'asset' as const,
        subtitle: 'PDF · 高质量',
        path: '/assets',
      },
      {
        id: '3',
        title: `研报: ${searchQuery} 分析报告`,
        type: 'report' as const,
        subtitle: '平安证券 · 2026',
        path: '/assets/reports',
      },
      {
        id: '4',
        title: `热点: ${searchQuery} 最新动态`,
        type: 'topic' as const,
        subtitle: '热度: 85 · 上升',
        path: '/hot-topics',
      },
    ].filter((_, index) => searchQuery.length > 2 || index < 2)) as SearchResult[];

    setResults(mockResults);
    setSelectedIndex(0);
    setIsSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K 打开搜索
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }

      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            navigate(results[selectedIndex].path);
            onClose();
            setQuery('');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, results, selectedIndex, navigate]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'task':
        return '📋';
      case 'asset':
        return '📄';
      case 'report':
        return '📊';
      case 'topic':
        return '🔥';
      default:
        return '📄';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'task':
        return '任务';
      case 'asset':
        return '素材';
      case 'report':
        return '研报';
      case 'topic':
        return '热点';
      default:
        return '其他';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="搜索任务、素材、研报、热点..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="keyboard-hint">ESC 关闭</span>
        </div>

        <div className="search-results">
          {isSearching ? (
            <div className="search-loading">
              <div className="loading-spinner"></div>
              <span>搜索中...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="results-list">
              {results.map((result, index) => (
                <div
                  key={result.id}
                  className={`result-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => {
                    navigate(result.path);
                    onClose();
                    setQuery('');
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="result-icon">{getTypeIcon(result.type)}</span>
                  <div className="result-content">
                    <div className="result-title">{result.title}</div>
                    {result.subtitle && (
                      <div className="result-subtitle">{result.subtitle}</div>
                    )}
                  </div>
                  <span className="result-type-badge">{getTypeLabel(result.type)}</span>
                </div>
              ))}
            </div>
          ) : query.length > 0 ? (
            <div className="search-empty">
              <span>😕</span>
              <p>未找到 "{query}" 相关结果</p>
            </div>
          ) : (
            <div className="search-hints">
              <div className="hint-section">
                <span className="hint-title">快捷操作</span>
                <div className="hint-items">
                  <div className="hint-item">
                    <span>↑↓</span>
                    <span>导航</span>
                  </div>
                  <div className="hint-item">
                    <span>↵</span>
                    <span>打开</span>
                  </div>
                  <div className="hint-item">
                    <span>ESC</span>
                    <span>关闭</span>
                  </div>
                </div>
              </div>
              <div className="hint-section">
                <span className="hint-title">搜索范围</span>
                <div className="hint-tags">
                  <span className="hint-tag">📋 任务</span>
                  <span className="hint-tag">📄 素材</span>
                  <span className="hint-tag">📊 研报</span>
                  <span className="hint-tag">🔥 热点</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="search-footer">
          <span>按 Enter 打开 · ↑↓ 选择</span>
        </div>
      </div>
    </div>
  );
}
