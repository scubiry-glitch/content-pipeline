import './ShortcutsPanel.css';

interface ShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: '⌘/Ctrl + K', description: '打开全局搜索' },
  { key: '⌘/Ctrl + N', description: '新建任务' },
  { key: '⌘/Ctrl + R', description: '刷新数据' },
  { key: '⌘/Ctrl + ,', description: '打开设置' },
  { key: 'Shift + ?', description: '显示快捷键帮助' },
  { key: 'Esc', description: '关闭弹窗/返回' },
  { key: '↑/↓', description: '列表导航' },
  { key: 'Enter', description: '确认/打开' },
];

export function ShortcutsPanel({ isOpen, onClose }: ShortcutsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>⌨️ 键盘快捷键</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="shortcuts-list">
          {SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="shortcut-item">
              <kbd>{key}</kbd>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
