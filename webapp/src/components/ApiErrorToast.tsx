import { useState, useEffect } from 'react';
import './ApiErrorToast.css';

interface ErrorToast {
  id: string;
  title: string;
  message: string;
  retry?: () => void;
}

// Global error handler
let errorHandler: ((error: ErrorToast) => void) | null = null;

export function showApiError(title: string, message: string, retry?: () => void) {
  if (errorHandler) {
    errorHandler({
      id: Date.now().toString(),
      title,
      message,
      retry
    });
  }
}

export function ApiErrorContainer() {
  const [errors, setErrors] = useState<ErrorToast[]>([]);

  useEffect(() => {
    errorHandler = (error) => {
      setErrors(prev => [...prev, error]);
      // Auto remove after 5 seconds
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e.id !== error.id));
      }, 5000);
    };
    return () => {
      errorHandler = null;
    };
  }, []);

  const removeError = (id: string) => {
    setErrors(prev => prev.filter(e => e.id !== id));
  };

  if (errors.length === 0) return null;

  return (
    <div className="api-error-container">
      {errors.map(error => (
        <div key={error.id} className="api-error-toast">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <div className="error-title">{error.title}</div>
            <div className="error-message">{error.message}</div>
          </div>
          {error.retry && (
            <button
              className="error-retry"
              onClick={() => {
                error.retry?.();
                removeError(error.id);
              }}
            >
              重试
            </button>
          )}
          <button
            className="error-close"
            onClick={() => removeError(error.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
