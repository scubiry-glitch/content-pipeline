// Streaming BlueTeam Review Hook
// 流式蓝军评审 Hook - 支持实时接收评审评论

import { useState, useCallback, useRef, useEffect } from 'react';

export interface StreamingComment {
  id: string;
  expertRole: string;
  expertName: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  location?: string;
  rationale?: string;
  round: number;
  timestamp: string;
  hasDecision?: boolean;
}

export interface StreamingProgress {
  status: 'pending' | 'processing' | 'completed' | 'error';
  currentRound: number;
  totalRounds: number;
  currentExpert: string;
  completedComments: number;
  totalComments: number;
  comments: StreamingComment[];
}

interface UseStreamingBlueTeamOptions {
  onComment?: (comment: StreamingComment) => void;
  onProgress?: (progress: StreamingProgress) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useStreamingBlueTeam(options: UseStreamingBlueTeamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<StreamingProgress | null>(null);
  const [comments, setComments] = useState<StreamingComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  
  // 保持 options 引用最新
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  /**
   * 启动流式蓝军评审
   */
  const startStreaming = useCallback(async (
    taskId: string,
    config?: {
      mode?: 'parallel' | 'serial';
      rounds?: number;
      experts?: string[];
    }
  ) => {
    try {
      setError(null);
      setIsStreaming(true);
      
      // 1. 先调用启动接口
      const response = await fetch(`/api/v1/streaming/blue-team/${taskId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {})
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start streaming review');
      }
      
      const result = await response.json();
      console.log('[StreamingBlueTeam] Started:', result);
      
      // 2. 建立 SSE 连接
      connectSSE(taskId);
      
      return result;
    } catch (err: any) {
      setError(err.message);
      setIsStreaming(false);
      optionsRef.current.onError?.(err.message);
      throw err;
    }
  }, []);
  
  /**
   * 建立 SSE 连接
   */
  const connectSSE = useCallback((taskId: string) => {
    // 关闭已有连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const sseUrl = `/api/v1/streaming/blue-team/${taskId}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;
    
    es.onopen = () => {
      console.log('[StreamingBlueTeam] SSE connected');
      setIsConnected(true);
    };
    
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[StreamingBlueTeam] Received:', data.type);
        
        switch (data.type) {
          case 'connected':
            console.log('[StreamingBlueTeam] Connection confirmed');
            break;
            
          case 'comment':
            // 新评论
            setComments(prev => [...prev, data.data]);
            optionsRef.current.onComment?.(data.data);
            break;
            
          case 'progress':
            // 进度更新
            setProgress(data.data);
            setComments(data.data.comments || []);
            optionsRef.current.onProgress?.(data.data);
            
            // 检查是否完成
            if (data.data.status === 'completed') {
              setIsStreaming(false);
              optionsRef.current.onComplete?.();
            }
            break;
            
          case 'error':
            setError(data.data.message || 'Streaming error');
            setIsStreaming(false);
            optionsRef.current.onError?.(data.data.message);
            break;
        }
      } catch (e) {
        console.error('[StreamingBlueTeam] Parse error:', e);
      }
    };
    
    es.onerror = (err) => {
      console.error('[StreamingBlueTeam] SSE error:', err);
      setIsConnected(false);
      
      // 自动重连（如果仍在流式处理中）
      if (isStreaming) {
        setTimeout(() => {
          console.log('[StreamingBlueTeam] Reconnecting...');
          connectSSE(taskId);
        }, 3000);
      }
    };
  }, [isStreaming]);
  
  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsStreaming(false);
  }, []);
  
  /**
   * 获取当前状态（用于重连恢复）
   */
  const fetchStatus = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/v1/streaming/blue-team/${taskId}/status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      
      const status = await response.json();
      setComments(status.comments || []);
      
      // 如果仍在评审中，自动连接 SSE
      if (status.taskStatus === 'reviewing' && status.isStreamingActive) {
        connectSSE(taskId);
      }
      
      return status;
    } catch (err) {
      console.error('[StreamingBlueTeam] Fetch status failed:', err);
      return null;
    }
  }, [connectSSE]);
  
  /**
   * 清理
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    isConnected,
    isStreaming,
    progress,
    comments,
    error,
    startStreaming,
    disconnect,
    fetchStatus,
    connectSSE
  };
}
