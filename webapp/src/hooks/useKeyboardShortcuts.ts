import { useEffect, useCallback, useState } from 'react';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const matched = shortcuts.find((shortcut) => {
        if (shortcut.key.toLowerCase() !== event.key.toLowerCase()) return false;
        if (shortcut.ctrl && !event.ctrlKey) return false;
        if (shortcut.shift && !event.shiftKey) return false;
        if (shortcut.alt && !event.altKey) return false;
        if (shortcut.meta && !event.metaKey) return false;
        return true;
      });

      if (matched) {
        event.preventDefault();
        matched.action();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// 快捷键提示面板
export function useShortcutsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
}

// 全局快捷键配置
export const GLOBAL_SHORTCUTS = {
  SEARCH: { key: 'k', ctrl: true, description: '打开搜索' },
  NEW_TASK: { key: 'n', ctrl: true, description: '新建任务' },
  REFRESH: { key: 'r', ctrl: true, description: '刷新数据' },
  SETTINGS: { key: ',', ctrl: true, description: '打开设置' },
  HELP: { key: '?', shift: true, description: '快捷键帮助' },
  ESCAPE: { key: 'Escape', description: '关闭弹窗/返回' },
};
