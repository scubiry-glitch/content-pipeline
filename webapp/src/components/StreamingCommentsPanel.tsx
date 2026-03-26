// Streaming Comments Panel
// 流式评论面板 - 实时显示蓝军评审评论

import React, { useEffect, useRef, useState } from 'react';
import { useStreamingBlueTeam, StreamingComment } from '../hooks/useStreamingBlueTeam';
import { ExpertBadge } from './ExpertBadge';
import { MessageSquare, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

interface StreamingCommentsPanelProps {
  taskId: string;
  existingComments?: StreamingComment[];
  onCommentAction?: (commentId: string, action: 'accept' | 'reject' | 'modify') => void;
}

export function StreamingCommentsPanel({ 
  taskId, 
  existingComments = [],
  onCommentAction 
}: StreamingCommentsPanelProps) {
  const [showStreaming, setShowStreaming] = useState(true);
  const [localComments, setLocalComments] = useState<StreamingComment[]>(existingComments);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const {
    isConnected,
    isStreaming,
    progress,
    comments: streamingComments,
    startStreaming,
    fetchStatus
  } = useStreamingBlueTeam({
    onComment: (comment) => {
      // 新评论到达时滚动到底部
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  });
  
  // 合并现有评论和流式评论
  useEffect(() => {
    if (streamingComments.length > 0) {
      setLocalComments(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newComments = streamingComments.filter(c => !existingIds.has(c.id));
        return [...prev, ...newComments];
      });
    }
  }, [streamingComments]);
  
  // 初始化时获取状态
  useEffect(() => {
    fetchStatus(taskId);
  }, [taskId, fetchStatus]);
  
  // 自动滚动
  useEffect(() => {
    if (scrollRef.current && showStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localComments.length, showStreaming]);
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'praise': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertCircle className="w-4 h-4" />;
      case 'praise': return <CheckCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h3 className="font-medium">AI 蓝军评审</h3>
          {isStreaming && (
            <span className="flex items-center gap-1 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </span>
          )}
          {isConnected && !isStreaming && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
              已连接
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            共 {localComments.length} 条评论
          </span>
          <button
            onClick={() => setShowStreaming(!showStreaming)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showStreaming ? '收起' : '展开'}
          </button>
        </div>
      </div>
      
      {/* Progress Bar */}
      {isStreaming && progress && (
        <div className="px-4 py-2 bg-blue-50 border-b">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-blue-700">
              第 {progress.currentRound}/{progress.totalRounds} 轮
            </span>
            {progress.currentExpert && (
              <>
                <span className="text-gray-400">·</span>
                <LocalExpertBadge role={progress.currentExpert} size="sm" />
              </>
            )}
          </div>
          <div className="mt-1 h-1 bg-blue-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ 
                width: `${(progress.completedComments / Math.max(progress.totalComments, 1)) * 100}%` 
              }}
            />
          </div>
        </div>
      )}
      
      {/* Comments List */}
      {showStreaming && (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {localComments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {isStreaming ? (
                <div className="space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                  <p>AI 正在生成评审意见...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <MessageSquare className="w-8 h-8 mx-auto" />
                  <p>暂无评论</p>
                  <button
                    onClick={() => startStreaming(taskId)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    启动 AI 评审
                  </button>
                </div>
              )}
            </div>
          ) : (
            localComments.map((comment, index) => (
              <StreamingCommentCard
                key={comment.id || index}
                comment={comment}
                isNew={index >= localComments.length - streamingComments.length}
                onAction={onCommentAction}
              />
            ))
          )}
          
          {/* 底部加载指示器 */}
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>等待更多评论...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 单条评论卡片
interface StreamingCommentCardProps {
  comment: StreamingComment;
  isNew?: boolean;
  onAction?: (commentId: string, action: 'accept' | 'reject' | 'modify') => void;
}

function StreamingCommentCard({ comment, isNew, onAction }: StreamingCommentCardProps) {
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
  
  return (
    <div 
      className={`border rounded-lg p-3 transition-all ${
        isNew ? 'bg-blue-50 border-blue-200 animate-in slide-in-from-bottom-2' : 'bg-white'
      }`}
    >
      <div className="flex items-start gap-2">
        <LocalExpertBadge role={comment.expertRole} size="sm" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(comment.severity)}`}>
              {comment.severity === 'high' ? '严重' : 
               comment.severity === 'medium' ? '中等' :
               comment.severity === 'low' ? '轻微' : '赞赏'}
            </span>
            <span className="text-xs text-gray-400">
              第{comment.round}轮
            </span>
          </div>
          
          <p className="mt-2 text-sm font-medium text-gray-900">
            {comment.question}
          </p>
          
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
          
          {/* Action Buttons */}
          {onAction && !comment.hasDecision && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onAction(comment.id, 'accept')}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                接受
              </button>
              <button
                onClick={() => onAction(comment.id, 'reject')}
                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                拒绝
              </button>
              <button
                onClick={() => onAction(comment.id, 'modify')}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                修改
              </button>
            </div>
          )}
          
          {comment.hasDecision && (
            <span className="text-xs text-green-600 flex items-center gap-1 mt-2">
              <CheckCircle className="w-3 h-3" />
              已处理
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 简单的 ExpertBadge 组件
function LocalExpertBadge({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' | 'lg' }) {
  const config: Record<string, { name: string; color: string }> = {
    challenger: { name: '批判者', color: 'bg-red-100 text-red-700' },
    expander: { name: '拓展者', color: 'bg-blue-100 text-blue-700' },
    synthesizer: { name: '提炼者', color: 'bg-green-100 text-green-700' },
    factChecker: { name: '事实核查', color: 'bg-purple-100 text-purple-700' },
    logicChecker: { name: '逻辑检查', color: 'bg-orange-100 text-orange-700' },
    industryExpert: { name: '行业专家', color: 'bg-teal-100 text-teal-700' }
  };
  
  const { name, color } = config[role] || { name: role, color: 'bg-gray-100 text-gray-700' };
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : size === 'lg' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5';
  
  return (
    <span className={`${color} ${sizeClass} rounded font-medium shrink-0`}>
      {name}
    </span>
  );
}
