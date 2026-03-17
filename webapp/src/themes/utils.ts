import type { Theme, ThemeId } from './types';
import { getThemeById, defaultTheme, themes } from './config';
import { THEME_STORAGE_KEY } from './types';

// 将主题应用到文档根元素
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // 应用颜色变量
  root.style.setProperty('--primary', theme.colors.primary);
  root.style.setProperty('--primary-dark', theme.colors.primaryDark);
  root.style.setProperty('--primary-light', theme.colors.primaryLight);
  root.style.setProperty('--secondary', theme.colors.secondary);
  root.style.setProperty('--secondary-dark', theme.colors.secondaryDark);
  root.style.setProperty('--accent', theme.colors.accent);
  root.style.setProperty('--background', theme.colors.background);
  root.style.setProperty('--surface', theme.colors.surface);
  root.style.setProperty('--surface-elevated', theme.colors.surfaceElevated);
  root.style.setProperty('--text', theme.colors.text);
  root.style.setProperty('--text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--text-muted', theme.colors.textMuted);
  root.style.setProperty('--border', theme.colors.border);
  root.style.setProperty('--divider', theme.colors.divider);
  root.style.setProperty('--success', theme.colors.success);
  root.style.setProperty('--warning', theme.colors.warning);
  root.style.setProperty('--danger', theme.colors.danger);
  root.style.setProperty('--info', theme.colors.info);
  root.style.setProperty('--stage-1', theme.colors.stage1);
  root.style.setProperty('--stage-2', theme.colors.stage2);
  root.style.setProperty('--stage-3', theme.colors.stage3);
  root.style.setProperty('--stage-4', theme.colors.stage4);

  // 应用阴影变量
  root.style.setProperty('--shadow-sm', theme.shadows.sm);
  root.style.setProperty('--shadow', theme.shadows.md);
  root.style.setProperty('--shadow-md', theme.shadows.lg);
  root.style.setProperty('--shadow-lg', theme.shadows.xl);

  // 应用圆角变量
  root.style.setProperty('--radius-sm', theme.radius.sm);
  root.style.setProperty('--radius', theme.radius.md);
  root.style.setProperty('--radius-lg', theme.radius.lg);
  root.style.setProperty('--radius-xl', theme.radius.xl);
  root.style.setProperty('--radius-full', theme.radius.full);

  // 应用字体变量
  root.style.setProperty('--font-heading', theme.fonts.heading);
  root.style.setProperty('--font-body', theme.fonts.body);
  root.style.setProperty('--font-mono', theme.fonts.mono);

  // 设置data-theme属性用于CSS选择器
  root.setAttribute('data-theme', theme.id);

  // 设置暗色模式类
  if (theme.isDark) {
    root.classList.add('dark-theme');
    root.classList.remove('light-theme');
  } else {
    root.classList.add('light-theme');
    root.classList.remove('dark-theme');
  }

  // 更新body背景色
  document.body.style.background = theme.colors.background;
  document.body.style.color = theme.colors.text;
  document.body.style.fontFamily = theme.fonts.body;
}

// 从localStorage获取存储的主题
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return defaultTheme;

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      return getThemeById(stored);
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e);
  }

  // 尝试检测系统主题偏好
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // 如果系统偏好深色，返回科技主题
    return themes.find(t => t.id === 'tech') || defaultTheme;
  }

  return defaultTheme;
}

// 存储主题到localStorage
export function storeTheme(themeId: ThemeId): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (e) {
    console.warn('Failed to store theme to localStorage:', e);
  }
}

// 初始化主题
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
