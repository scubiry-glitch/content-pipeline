import { useState, useEffect, useCallback, useRef } from 'react';
import './ThemeSwitcher.css';
import type { Theme, ThemeId } from '../themes';
import { themes } from '../themes';

interface ThemeSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onThemeChange: (themeId: ThemeId) => void;
}

export function ThemeSwitcher({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
}: ThemeSwitcherProps) {
  const handleThemeSelect = useCallback(
    (themeId: ThemeId) => {
      onThemeChange(themeId);
      onClose();
    },
    [onThemeChange, onClose]
  );

  // ESC键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="theme-switcher-overlay" onClick={onClose}>
      <div className="theme-switcher-panel" onClick={(e) => e.stopPropagation()}>
        <div className="theme-switcher-header">
          <h3>选择主题</h3>
          <button className="theme-switcher-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="theme-list">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`theme-card ${currentTheme.id === theme.id ? 'active' : ''}`}
              onClick={() => handleThemeSelect(theme.id)}
            >
              <div className={`theme-preview ${theme.id}`}>{theme.preview}</div>
              <div className="theme-info">
                <h4>{theme.name}</h4>
                <p>{theme.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="theme-switcher-footer">
          <span className="theme-shortcut-hint">
            快捷键: <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

// 小型主题切换器（用于导航栏）
interface ThemeSwitcherMiniProps {
  currentTheme: Theme;
  onThemeChange: (themeId: ThemeId) => void;
}

export function ThemeSwitcherMini({ currentTheme, onThemeChange }: ThemeSwitcherMiniProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <div className="theme-switcher-mini" ref={containerRef}>
      <button className="theme-trigger" onClick={toggle} title="切换主题">
        <span className="theme-trigger-icon">{currentTheme.preview}</span>
        <span className="theme-trigger-name">{currentTheme.name}</span>
      </button>

      {isOpen && (
        <div className="theme-switcher-dropdown">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`theme-option ${currentTheme.id === theme.id ? 'active' : ''}`}
              onClick={() => {
                onThemeChange(theme.id);
                setIsOpen(false);
              }}
            >
              <span className="theme-option-icon">{theme.preview}</span>
              <span className="theme-option-name">{theme.name}</span>
              {currentTheme.id === theme.id && (
                <span className="theme-option-check">✓</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 主题切换触发按钮
interface ThemeTriggerProps {
  currentTheme: Theme;
  onClick: () => void;
}

export function ThemeTrigger({ currentTheme, onClick }: ThemeTriggerProps) {
  return (
    <button className="theme-trigger" onClick={onClick} title="切换主题">
      <span className="theme-trigger-icon">{currentTheme.preview}</span>
      <span className="theme-trigger-name">{currentTheme.name}</span>
    </button>
  );
}
