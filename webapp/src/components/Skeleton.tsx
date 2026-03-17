import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '20px',
  circle = false,
  className = '',
}: SkeletonProps) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: circle ? '50%' : '4px',
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={style}
    />
  );
}

// 卡片骨架屏
export function CardSkeleton() {
  return (
    <div className="card-skeleton">
      <Skeleton width={60} height={60} circle />
      <div className="card-skeleton-content">
        <Skeleton width="70%" height={20} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="50%" height={14} />
      </div>
    </div>
  );
}

// 列表骨架屏
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// 表格骨架屏
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-skeleton">
      <div className="table-header-skeleton">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100 / cols}%`} height={40} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="table-row-skeleton">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} width={`${100 / cols}%`} height={50} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 图表骨架屏
export function ChartSkeleton() {
  return (
    <div className="chart-skeleton">
      <Skeleton width="100%" height={250} />
      <div className="chart-skeleton-legend">
        <Skeleton width={80} height={16} />
        <Skeleton width={80} height={16} />
        <Skeleton width={80} height={16} />
      </div>
    </div>
  );
}

// 仪表盘骨架屏
export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="stats-row-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="23%" height={100} />
        ))}
      </div>
      <div className="charts-row-skeleton">
        <Skeleton width="48%" height={300} />
        <Skeleton width="48%" height={300} />
      </div>
    </div>
  );
}

// 通用加载状态组件
interface LoadingStateProps {
  type?: 'spinner' | 'skeleton' | 'dots';
  text?: string;
  skeletonType?: 'card' | 'list' | 'table' | 'chart' | 'dashboard';
  skeletonCount?: number;
}

export function LoadingState({
  type = 'spinner',
  text = '加载中...',
  skeletonType = 'list',
  skeletonCount = 5,
}: LoadingStateProps) {
  if (type === 'skeleton') {
    switch (skeletonType) {
      case 'card':
        return <CardSkeleton />;
      case 'list':
        return <ListSkeleton count={skeletonCount} />;
      case 'table':
        return <TableSkeleton rows={skeletonCount} />;
      case 'chart':
        return <ChartSkeleton />;
      case 'dashboard':
        return <DashboardSkeleton />;
      default:
        return <ListSkeleton count={skeletonCount} />;
    }
  }

  if (type === 'dots') {
    return (
      <div className="loading-dots">
        <span></span>
        <span></span>
        <span></span>
        {text && <p>{text}</p>}
      </div>
    );
  }

  return (
    <div className="loading-spinner">
      <div className="spinner"></div>
      {text && <p>{text}</p>}
    </div>
  );
}
