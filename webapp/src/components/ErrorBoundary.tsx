import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

// 错误日志存储
const ERROR_STORAGE_KEY = 'app_error_logs';

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    this.setState({ errorInfo });

    // 保存错误日志到localStorage
    this.saveErrorLog(error, errorInfo);

    // 调用外部错误处理
    this.props.onError?.(error, errorInfo);
  }

  saveErrorLog = (error: Error, errorInfo: React.ErrorInfo) => {
    try {
      const existingLogs = JSON.parse(localStorage.getItem(ERROR_STORAGE_KEY) || '[]');
      const newLog = {
        id: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      const updatedLogs = [newLog, ...existingLogs].slice(0, 50); // 保留最近50条
      localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch {
      // 忽略存储错误
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  handleCopyError = () => {
    const { error, errorInfo, errorId } = this.state;
    const errorText = `
错误ID: ${errorId}
错误信息: ${error?.message}
错误堆栈: ${error?.stack}
组件堆栈: ${errorInfo?.componentStack}
时间: ${new Date().toISOString()}
页面: ${window.location.href}
    `.trim();

    navigator.clipboard.writeText(errorText).then(() => {
      alert('错误信息已复制到剪贴板');
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">🔧</div>
            <h2>页面出错了</h2>
            <p className="error-message">
              {this.state.error?.message || '发生未知错误'}
            </p>
            <div className="error-id">
              错误ID: <code>{this.state.errorId}</code>
            </div>
            <div className="error-actions">
              <button className="btn btn-primary" onClick={this.handleReset}>
                🔄 重试
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                📄 刷新页面
              </button>
              <button
                className="btn btn-info"
                onClick={this.handleCopyError}
              >
                📋 复制错误信息
              </button>
            </div>
            <details className="error-details">
              <summary>查看技术详情</summary>
              <pre>{this.state.error?.stack}</pre>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 小型错误边界组件
export function MiniErrorBoundary({
  children,
  fallback = <div className="mini-error">加载失败</div>
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
