import { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
  retryCount?: number;
}

export function LazyImage({
  src,
  alt,
  className = '',
  placeholder,
  retryCount = 3,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retries, setRetries] = useState(0);
  const imgRef = useRef<HTMLDivElement>(null);

  // 使用 Intersection Observer 检测元素是否进入视口
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // 提前50px开始加载
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 重试加载
  const handleRetry = () => {
    if (retries < retryCount) {
      setRetries((prev) => prev + 1);
      setError(null);
      setIsLoaded(false);
    }
  };

  // 占位符组件
  const defaultPlaceholder = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gray-100)',
        color: 'var(--gray-400)',
        fontSize: '24px',
      }}
    >
      🖼️
    </div>
  );

  return (
    <div
      ref={imgRef}
      className={`lazy-image-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* 加载占位符 */}
      {!isLoaded && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {placeholder || defaultPlaceholder}
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--gray-100)',
            color: 'var(--gray-500)',
            gap: '8px',
          }}
        >
          <span>❌</span>
          <span style={{ fontSize: '12px' }}>加载失败</span>
          {retries < retryCount && (
            <button
              onClick={handleRetry}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                border: '1px solid var(--gray-300)',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              重试 ({retries + 1}/{retryCount})
            </button>
          )}
        </div>
      )}

      {/* 实际图片 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(new Error('Failed to load image'))}
        />
      )}
    </div>
  );
}
