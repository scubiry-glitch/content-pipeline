// Sequential Streaming Review Panel
// 串行评审流式面板 - 实时显示评审进度和评论

import React, { useEffect, useRef, useState } from 'react';
import { useStreamingSequentialReview, SequentialReviewComment } from '../hooks/useStreamingSequentialReview';
import { Loader2, CheckCircle, AlertCircle, MessageSquare, FileEdit, Sparkles, GitCommit } from 'lucide-react';

interface SequentialStreamingPanelProps {
  taskId: string;
  initialStatus?: {
    status: string;
    currentRound: number;
    totalRounds: number;
    currentExpert: string | null;
  };
}

export function SequentialStreamingPanel({ taskId, initialStatus }: SequentialStreamingPanelProps) {
  const [showDetails, setShowDetails] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const {
    isConnected,
    isReviewing,
    currentRound,
    totalRounds,
    currentExpert,
    comments,
    events,
    connect,
    fetchStatus
  } = useStreamingSequentialReview({
    onComment: () => {
      // 新评论到达时滚动
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  });
  
  // 初始化连接
  useEffect(() => {
    fetchStatus(taskId);
  }, [taskId, fetchStatus]);
  
  // 自动滚动
  useEffect(() => {
    if (scrollRef.current && showDetails) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length, events.length, showDetails]);
  
  const getExpertColor = (role?: string) => {
    switch (role) {
      case 'challenger': return 'bg-red-100 text-red-700 border-red-200';
      case 'expander': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'synthesizer': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  
  const getExpertIcon = (role?: string) => {
    switch (role) {
      case 'challenger': return <AlertCircle className="w-4 h-4" />;
      case 'expander': return <Sparkles className="w-4 h-4" />;
      case 'synthesizer': return <CheckCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'low': return 'bg-blue-100 text-blue-700';
      case 'praise': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };
  
  // 按轮次分组评论
  const commentsByRound = comments.reduce((acc, comment) => {
    if (!acc[comment.round]) acc[comment.round] = [];
    acc[comment.round].push(comment);
    return acc;
  }, {} as Record<number, SequentialReviewComment[]>);
  
  return (
    <div className="h-full flex flex-col bg-white rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <GitCommit className="w-5 h-5 text-purple-500" />
          <h3 className="font-medium">串行评审进度</h3>
          {isReviewing && (
            <span className="flex items-center gap-1 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              进行中
            </span>
          )}
          {isConnected && !isReviewing && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
              已连接
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            第 {currentRound} / {totalRounds} 轮
          </span>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showDetails ? '收起' : '展开'}
          </button>
        </div>
      </div>
      
      {/* Progress Bar */}
      {(isReviewing || currentRound > 0) && totalRounds > 0 && (
        <div className="px-4 py-3 bg-purple-50 border-b">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex items-center gap-2">
              {currentExpert && (
                <>
                  <span className="text-purple-700 font-medium">
                    {currentExpert}
                  </span>
                  <span className="text-purple-500">
                    {isReviewing ? '正在评审...' : '等待中'}
                  </span>
                </>
              )}
            </div>
            <span className="text-purple-600">
              {Math.round(((currentRound - (isReviewing ? 1 : 0)) / totalRounds) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 transition-all duration-500"
              style={{ width: `${((currentRound - (isReviewing ? 1 : 0)) / totalRounds) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Events & Comments */}
      {showDetails && (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {/* 事件流 */}
          <div className="space-y-2">
            {events.map((event, idx) => (
              <EventItem key={idx} event={event} />
            ))}
          </div>
          
          {/* 评论流 */}
          {Object.entries(commentsByRound).map(([round, roundComments]) => (
            <div key={round} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
                <GitCommit className="w-4 h-4" />
                第 {round} 轮评审
                <span className="text-gray-400">({roundComments.length} 条评论)</span>
              </div>
              
              <div className="space-y-2">
                {roundComments.map((comment, idx) => (
                  <CommentCard key={`${round}-${idx}`} comment={comment} />
                ))}
              </div>
            </div>
          ))}
          
          {/* 空状态 */}
          {events.length === 0 && comments.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {isReviewing ? (
                <div className="space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500" />
                  <p>等待评审开始...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <GitCommit className="w-8 h-8 mx-auto" />
                  <p>暂无评审活动</p>
                </div>
              )}
            </div>
          )}
          
          {/* 底部加载指示器 */}
          {isReviewing && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>等待更多更新...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 事件项
function EventItem({ event }: { event: any }) {
  const getEventIcon = () => {
    switch (event.type) {
      case 'round_started': return <GitCommit className="w-4 h-4 text-blue-500" />;
      case 'expert_reviewing': return <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />;
      case 'comment_generated': return <MessageSquare className="w-4 h-4 text-yellow-500" />;
      case 'draft_revised': return <FileEdit className="w-4 h-4 text-green-500" />;
      case 'round_completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'review_completed': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };
  
  const getEventColor = () => {
    switch (event.type) {
      case 'round_started': return 'bg-blue-50 border-blue-200';
      case 'expert_reviewing': return 'bg-purple-50 border-purple-200';
      case 'comment_generated': return 'bg-yellow-50 border-yellow-200';
      case 'draft_revised': return 'bg-green-50 border-green-200';
      case 'round_completed': return 'bg-green-50 border-green-200';
      case 'review_completed': return 'bg-blue-50 border-blue-200';
      case 'error': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };
  
  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${getEventColor()}`}>
      {getEventIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">{event.message}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

// 评论卡片
function CommentCard({ comment }: { comment: SequentialReviewComment }) {
  const [expanded, setExpanded] = useState(false);
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'praise': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  
  const getExpertColor = (role?: string) => {
    switch (role) {
      case 'challenger': return 'bg-red-50 text-red-600';
      case 'expander': return 'bg-blue-50 text-blue-600';
      case 'synthesizer': return 'bg-green-50 text-green-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  };
  
  return (
    <div className="bg-white rounded border p-3">
      <div className="flex items-start gap-2">
        <span className={`text-xs px-2 py-0.5 rounded ${getExpertColor(comment.expertRole)}`}>
          {comment.expertName}
        </span>
        
        <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(comment.severity)}`}>
          {comment.severity === 'high' ? '严重' : 
           comment.severity === 'medium' ? '中等' :
           comment.severity === 'low' ? '轻微' : '赞赏'}
        </span>
        
        <span className="text-xs text-gray-400 ml-auto">
          {comment.index + 1}/{comment.total}
        </span>
      </div>
      
      <p className="mt-2 text-sm text-gray-900">{comment.question}</p>
      
      {comment.suggestion && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {expanded ? '收起建议' : '查看建议'}
          </button>
          
          {expanded && (
            <p className="mt-1 text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {comment.suggestion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
