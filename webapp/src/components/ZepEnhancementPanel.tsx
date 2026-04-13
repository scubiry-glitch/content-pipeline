// Zep 增强统一占位：无数据时也展示「为何看不到」与连接状态，避免误以为前端未覆盖
import { useEffect, useState } from 'react';

const API_BASE = '/api/v1/content-library';

export type ZepStatus = { enabled: boolean; connected: boolean; graphUserId?: string };

export function useZepStatus(): ZepStatus | null {
  const [status, setStatus] = useState<ZepStatus | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/zep/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d && typeof d.enabled === 'boolean' ? d : { enabled: false, connected: false }))
      .catch(() => setStatus({ enabled: false, connected: false }));
  }, []);
  return status;
}

interface ZepEnhancementPanelProps {
  /** 无查询上下文时不展示（例如未选实体） */
  visible: boolean;
  title: string;
  loading: boolean;
  hasData: boolean;
  zepStatus: ZepStatus | null;
  children: React.ReactNode;
}

export function ZepEnhancementPanel({
  visible,
  title,
  loading,
  hasData,
  zepStatus,
  children,
}: ZepEnhancementPanelProps) {
  if (!visible) return null;

  return (
    <div className="mt-4 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/25 p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 rounded font-medium text-purple-800 dark:text-purple-200">
          Zep 增强
        </span>
        <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">{title}</span>
      </div>

      {zepStatus === null && (
        <p className="text-xs text-purple-700/90 dark:text-purple-300/90">正在检查 Zep 服务状态…</p>
      )}

      {zepStatus && !zepStatus.enabled && (
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          未启用 Zep（需配置 <code className="text-[11px] bg-white/60 dark:bg-black/20 px-1 rounded">ZEP_API_KEY</code>
          等）。下方仅本地库数据，无图谱遍历增强。
        </p>
      )}

      {zepStatus?.enabled && !zepStatus.connected && (
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Zep 已配置但 API 未连通，请检查密钥、<code className="text-[11px] px-1 rounded bg-amber-100/80 dark:bg-amber-900/40">ZEP_BASE_URL</code>
          与网络。增强区暂无数据。
        </p>
      )}

      {zepStatus?.enabled && zepStatus.connected && loading && (
        <p className="text-xs text-purple-700 dark:text-purple-300 animate-pulse">正在查询 Zep 图谱…</p>
      )}

      {zepStatus?.enabled && zepStatus.connected && !loading && !hasData && (
        <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
          当前无 Zep 增强结果。请先在「内容库 → 批量操作」执行 <strong>Zep 知识回填</strong>，再重试；或更换实体/关键词。
        </p>
      )}

      {hasData && <div className="space-y-2 mt-2">{children}</div>}
    </div>
  );
}
