import React from 'react';

export interface ActionButtonProps {
  label: string;
  onClick: () => void;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}

interface GlobalActionBarProps {
  primaryAction?: ActionButtonProps;
  secondaryAction?: ActionButtonProps;
  extraActions?: ActionButtonProps[];
  customLeftContent?: React.ReactNode;
}

export function GlobalActionBar({
  primaryAction,
  secondaryAction,
  extraActions = [],
  customLeftContent
}: GlobalActionBarProps) {
  const renderButton = (action: ActionButtonProps, isPrimary: boolean) => {
    const baseClass = isPrimary ? 'btn-primary' : (action.variant ? `btn-${action.variant}` : 'btn-secondary');
    return (
      <button
        key={action.label}
        className={`btn ${baseClass} px-6 py-2 shadow-sm flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95`}
        onClick={action.onClick}
        disabled={action.disabled || action.loading}
        style={{ opacity: action.disabled ? 0.6 : 1, cursor: action.disabled ? 'not-allowed' : 'pointer' }}
      >
        {action.loading ? (
          <span className="material-symbols-outlined animate-spin text-sm">sync</span>
        ) : action.icon ? (
          <span className="material-symbols-outlined text-sm">{action.icon}</span>
        ) : null}
        {action.loading ? '正在处理...' : action.label}
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-64 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-4 px-8 flex justify-between items-center z-50 transition-colors duration-300">
      <div className="flex-1 flex items-center gap-4">
        {customLeftContent}
      </div>
      <div className="flex items-center gap-3">
        {extraActions.map(action => renderButton(action, false))}
        {secondaryAction && renderButton(secondaryAction, false)}
        {primaryAction && renderButton(primaryAction, true)}
      </div>
    </div>
  );
}
