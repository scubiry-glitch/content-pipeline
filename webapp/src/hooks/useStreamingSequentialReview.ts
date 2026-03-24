// Streaming Sequential Review Hook
// 串行评审流式 Hook - 实时接收评审进度和评论

import { useState, useCallback, useRef, useEffect } from 'react';

export interface SequentialReviewComment {
  id: string;
  index: number;
  total: number;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  category?: string;
  location?: string;
  expertName: string;
  expertRole: string;
  round: number;
}

export interface SequentialReviewEvent {
  type: 'connected' | 'round_started' | 'expert_reviewing' | 'comment_generated' | 'draft_revised' | 'round_completed' | 'review_completed' | 'error';
  round?: number;
  totalRounds?: number;
  expertName?: string;
  expertRole?: string;
  comment?: SequentialReviewComment;
  draftId?: string;
  progress?: {
    currentRound: number;
    totalRounds: number;
    currentExpert: string;
    status: string;
  };
  message?: string;
  error?: string;
}

interface UseStreamingSequentialReviewOptions {
  onEvent?: (event: SequentialReviewEvent) => void;
  onComment?: (comment: SequentialReviewComment) => void;
  onRoundComplete?: (round: number) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useStreamingSequentialReview(options: UseStreamingSequentialReviewOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [currentExpert, setCurrentExpert] = useState<string>('');
  const [comments, setComments] = useState<SequentialReviewComment[]>([]);
  const [events, setEvents] = useState<SequentialReviewEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  /**
   * 连接到串行评审 SSE
   */
  const connect = useCallback((taskId: string) => {
    // 关闭已有连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const sseUrl = `/api/v1/streaming/sequential/${taskId}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;
    
    es.onopen = () => {
      console.log('[StreamingSequential] SSE connected');
      setIsConnected(true);
      setError(null);
    };
    
    es.onmessage = (event) => {
      try {
        const data: SequentialReviewEvent = JSON.parse(event.data);
        console.log('[StreamingSequential] Event:', data.type, data.message);
        
        // 存储事件
        setEvents(prev => [...prev, data]);
        
        // 调用全局事件回调
        optionsRef.current.onEvent?.(data);
        
        switch (data.type) {
          case 'connected':
            setIsConnected(true);
            break;
            
          case 'round_started':
            setIsReviewing(true);
            if (data.round) setCurrentRound(data.round);
            if (data.totalRounds) setTotalRounds(data.totalRounds);
            if (data.expertName) setCurrentExpert(data.expertName);
            break;
            
          case 'expert_reviewing':
            if (data.expertName) setCurrentExpert(data.expertName);
            break;
            
          case 'comment_generated':
            if (data.comment) {
              setComments(prev => [...prev, data.comment!]);
              optionsRef.current.onComment?.(data.comment);
            }
            break;
            
          case 'draft_revised':
            // 修订稿生成中
            break;
            
          case 'round_completed':
            if (data.round) {
              optionsRef.current.onRoundComplete?.(data.round);
            }
            break;
            
          case 'review_completed':
            setIsReviewing(false);
            optionsRef.current.onComplete?.();
            break;
            
          case 'error':
            setError(data.error || 'Unknown error');
            setIsReviewing(false);
            optionsRef.current.onError?.(data.error || 'Unknown error');
            break;
        }
      } catch (e) {
        console.error('[StreamingSequential] Parse error:', e);
      }
    };
    
    es.onerror = (err) => {
      console.error('[StreamingSequential] SSE error:', err);
      setIsConnected(false);
      
      // 自动重连
      setTimeout(() => {
        if (isReviewing) {
          console.log('[StreamingSequential] Reconnecting...');
          connect(taskId);
        }
      }, 3000);
    };
  }, [isReviewing]);
  
  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);
  
  /**
   * 获取状态（用于重连恢复）
   */
  const fetchStatus = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/v1/streaming/sequential/${taskId}/status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      
      const status = await response.json();
      setCurrentRound(status.currentRound);
      setTotalRounds(status.totalRounds);
      
      // 如果正在评审中，自动连接
      if (status.status === 'processing') {
        connect(taskId);
      }
      
      return status;
    } catch (err) {
      console.error('[StreamingSequential] Fetch status failed:', err);
      return null;
    }
  }, [connect]);
  
  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setComments([]);
    setEvents([]);
    setCurrentRound(0);
    setTotalRounds(0);
    setCurrentExpert('');
    setError(null);
  }, []);
  
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
    isReviewing,
    currentRound,
    totalRounds,
    currentExpert,
    comments,
    events,
    error,
    connect,
    disconnect,
    fetchStatus,
    reset
  };
}
