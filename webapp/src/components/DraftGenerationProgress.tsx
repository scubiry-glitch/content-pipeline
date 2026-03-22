// 文稿生成进度面板 - 实时显示分段生成进度
import { useState, useEffect, useCallback } from 'react';
import type { DraftProgress } from '../api/client';
import './DraftGenerationProgress.css';

interface DraftGenerationProgressProps {
  taskId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function DraftGenerationProgress({ taskId, onComplete, onError }: DraftGenerationProgressProps) {
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [accumulatedContent, setAccumulatedContent] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 连接 SSE 获取实时进度
  useEffect(() => {
    const connectSSE = () => {
      const eventSource = new EventSource(
        `${import.meta.env.VITE_API_URL}/production/${taskId}/draft/generate-stream`,
        { withCredentials: true }
      );

      eventSource.addEventListener('start', (event) => {
        setIsConnected(true);
        const data = JSON.parse(event.data);
        console.log('[DraftGen] Started:', data);
      });

      eventSource.addEventListener('progress', (event) => {
        const data: DraftProgress = JSON.parse(event.data);
        setProgress(data);
        if (data.accumulatedContent) {
          setAccumulatedContent(data.accumulatedContent);
        }
      });

      eventSource.addEventListener('complete', (event) => {
        setIsConnected(false);
        eventSource.close();
        onComplete?.();
      });

      eventSource.addEventListener('error', (event) => {
        const data = JSON.parse((event as any).data || '{}');
        setError(data.error || '生成失败');
        setIsConnected(false);
        eventSource.close();
        onError?.(data.error || '生成失败');
      });

      return () => {
        eventSource.close();
      };
    };

    // 先查询当前进度
    const fetchCurrentProgress = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/production/${taskId}/draft/progress`,
          { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY } }
        );
        const data = await response.json();
        if (data.status !== 'not_started') {
          setProgress(data);
          if (data.accumulatedContent) {
            setAccumulatedContent(data.accumulatedContent);
          }
        }
      } catch (err) {
        console.error('[DraftGen] Failed to fetch progress:', err);
      }
    };

    fetchCurrentProgress();
    const cleanup = connectSSE();

    return cleanup;
  }, [taskId, onComplete, onError]);

  // 计算进度百分比
  const progressPercent = progress
    ? Math.round((progress.currentIndex / progress.total) * 100)
    : 0;

  // 渲染段落状态列表
  const renderSections = () => {
    if (!progress?.sections) return null;

    return (
      <div className="sections-list">
        {progress.sections.map((section, index) => (
          <div key={section.id} className={`section-item ${section.status}`}>
            <span className="section-index">{index + 1}</span>
            <span className="section-title" title={section.title}>
              {section.title.length > 30 ? section.title.slice(0, 30) + '...' : section.title}
            </span>
            <span className="section-status">
              {section.status === 'pending' && '⏳'}
              {section.status === 'processing' && <Spinner />}
              {section.status === 'done' && '✓'}
              {section.status === 'error' && '✗'}
            </span>
            {section.wordCount && (
              <span className="section-wordcount">{section.wordCount}字</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 渲染实时预览
  const renderPreview = () => {
    if (!accumulatedContent) return null;

    return (
      <div className="live-preview">
        <h4>实时预览</h4>
        <div className="preview-content">
          <pre>{accumulatedContent.slice(-2000)}...</pre>
        </div>
      </div>
    );
  };

  return (
    <div className="draft-generation-progress">
      {/* 连接状态 */}
      <div className="connection-status">
        <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        {isConnected ? '生成中...' : error ? '生成失败' : '已连接'}
      </div>

      {/* 总体进度 */}
      <div className="overall-progress">
        <div className="progress-header">
          <span className="progress-title">
            {progress?.status === 'completed'
              ? '✅ 生成完成'
              : progress?.currentSection
              ? `正在生成：${progress.currentSection.title}`
              : '准备生成...'}
          </span>
          <span className="progress-percent">{progressPercent}%</span>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="progress-stats">
          <span>段落：{progress?.currentIndex || 0} / {progress?.total || 0}</span>
          <span>字数：{progress?.generatedWordCount || 0} / {progress?.estimatedTotalWordCount || 0}</span>
        </div>
      </div>

      {/* 段落列表 */}
      <div className="sections-panel">
        <h4>生成进度</h4>
        {renderSections()}
      </div>

      {/* 实时预览 */}
      {renderPreview()}

      {/* 错误信息 */}
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}
    </div>
  );
}

// 加载动画组件
function Spinner() {
  return <span className="spinner">◐</span>;
}
