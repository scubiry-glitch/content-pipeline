// 文稿生成进度面板 - 实时显示分段生成进度
import { useState, useEffect, useCallback, useRef } from 'react';
import type { DraftProgress } from '../api/client';
import { BASE_URL, API_KEY } from '../api/client';
import './DraftGenerationProgress.css';

interface DraftGenerationProgressProps {
  taskId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1s
const MAX_RECONNECT_DELAY = 30000; // 30s

export function DraftGenerationProgress({ taskId, onComplete, onError }: DraftGenerationProgressProps) {
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [accumulatedContent, setAccumulatedContent] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompletedRef = useRef(false);

  // 从服务端恢复当前进度
  const fetchCurrentProgress = useCallback(async () => {
    try {
      const response = await fetch(
        `${BASE_URL}/production/${taskId}/draft/progress`,
        { headers: { 'X-API-Key': API_KEY } }
      );
      const data = await response.json();
      if (data.status !== 'not_started') {
        setProgress(data);
        if (data.accumulatedContent) {
          setAccumulatedContent(data.accumulatedContent);
        }
      }
      if (data.status === 'completed') {
        isCompletedRef.current = true;
        onComplete?.();
      }
      return data;
    } catch (err) {
      console.error('[DraftGen] Failed to fetch progress:', err);
      return null;
    }
  }, [taskId, onComplete]);

  // 连接 SSE 获取实时进度（带自动重连）
  useEffect(() => {
    isCompletedRef.current = false;

    const connectSSE = () => {
      if (isCompletedRef.current) return;

      const eventSource = new EventSource(
        `${BASE_URL}/production/${taskId}/draft/generate-stream`,
        { withCredentials: true }
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('start', (event) => {
        setIsConnected(true);
        setReconnectCount(0);
        setError(null);
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
        isCompletedRef.current = true;
        setIsConnected(false);
        eventSource.close();
        onComplete?.();
      });

      // 服务端主动发送的错误事件
      eventSource.addEventListener('error', (event: any) => {
        if (event.data) {
          // 服务端错误事件（有 data）
          const data = JSON.parse(event.data || '{}');
          setError(data.error || '生成失败');
          setIsConnected(false);
          eventSource.close();
          onError?.(data.error || '生成失败');
        }
      });

      // 连接级别错误（网络中断）
      eventSource.onerror = () => {
        if (isCompletedRef.current) return;
        setIsConnected(false);
        eventSource.close();

        setReconnectCount(prev => {
          const next = prev + 1;
          if (next <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, prev), MAX_RECONNECT_DELAY);
            console.log(`[DraftGen] Connection lost, reconnecting in ${delay}ms (attempt ${next}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimerRef.current = setTimeout(async () => {
              // 先恢复进度状态，再重连 SSE
              await fetchCurrentProgress();
              if (!isCompletedRef.current) {
                connectSSE();
              }
            }, delay);
          } else {
            setError('连接已断开，请点击重新连接');
          }
          return next;
        });
      };
    };

    fetchCurrentProgress().then(() => {
      if (!isCompletedRef.current) {
        connectSSE();
      }
    });

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [taskId, onComplete, onError, fetchCurrentProgress]);

  // 手动重连
  const handleReconnect = useCallback(() => {
    setReconnectCount(0);
    setError(null);
    eventSourceRef.current?.close();
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    fetchCurrentProgress();
  }, [fetchCurrentProgress]);

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
        {isConnected
          ? '生成中...'
          : reconnectCount > 0 && reconnectCount <= MAX_RECONNECT_ATTEMPTS
          ? `重新连接中 (${reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`
          : error
          ? '生成失败'
          : '已连接'}
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
          {reconnectCount > MAX_RECONNECT_ATTEMPTS && (
            <button className="reconnect-btn" onClick={handleReconnect}>
              重新连接
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 加载动画组件
function Spinner() {
  return <span className="spinner">◐</span>;
}
