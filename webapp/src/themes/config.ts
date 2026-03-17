import type { Theme } from './types';

// 麦肯锡主题 - 专业咨询风格
export const mckinseyTheme: Theme = {
  id: 'mckinsey',
  name: '麦肯锡',
  description: '专业咨询报告风格，严谨权威',
  preview: '💼',
  isDark: false,
  colors: {
    primary: '#002B49',
    primaryDark: '#001B2E',
    primaryLight: '#003D66',
    secondary: '#6C757D',
    secondaryDark: '#495057',
    accent: '#C5A572',
    background: '#FFFFFF',
    surface: '#F8F9FA',
    surfaceElevated: '#FFFFFF',
    text: '#212529',
    textSecondary: '#495057',
    textMuted: '#6C757D',
    border: '#DEE2E6',
    divider: '#E9ECEF',
    success: '#2E7D32',
    warning: '#ED6C02',
    danger: '#C62828',
    info: '#0277BD',
    stage1: '#002B49',
    stage2: '#4A6741',
    stage3: '#7B5E3C',
    stage4: '#5C4B7A',
  },
  fonts: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", monospace',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 43, 73, 0.04)',
    md: '0 4px 6px rgba(0, 43, 73, 0.06), 0 2px 4px rgba(0, 43, 73, 0.04)',
    lg: '0 10px 15px rgba(0, 43, 73, 0.08), 0 4px 6px rgba(0, 43, 73, 0.04)',
    xl: '0 20px 25px rgba(0, 43, 73, 0.1), 0 10px 10px rgba(0, 43, 73, 0.04)',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
};

// 科技主题 - 现代科技风格
export const techTheme: Theme = {
  id: 'tech',
  name: '科技',
  description: '现代科技风格，活力创新',
  preview: '⚡',
  isDark: true,
  colors: {
    primary: '#6366F1',
    primaryDark: '#4F46E5',
    primaryLight: '#818CF8',
    secondary: '#06B6D4',
    secondaryDark: '#0891B2',
    accent: '#10B981',
    background: '#0F172A',
    surface: '#1E293B',
    surfaceElevated: '#334155',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    border: '#334155',
    divider: '#475569',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    stage1: '#6366F1',
    stage2: '#10B981',
    stage3: '#F59E0B',
    stage4: '#EC4899',
  },
  fonts: {
    heading: '"Inter", "SF Pro Display", -apple-system, sans-serif',
    body: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4), 0 0 20px rgba(99, 102, 241, 0.15)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.2)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.25)',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
    full: '9999px',
  },
};

// 商务主题 - 经典商务风格
export const businessTheme: Theme = {
  id: 'business',
  name: '商务',
  description: '经典商务风格，稳重专业',
  preview: '🏢',
  isDark: false,
  colors: {
    primary: '#1E3A5F',
    primaryDark: '#152A45',
    primaryLight: '#2A4A73',
    secondary: '#94A3B8',
    secondaryDark: '#64748B',
    accent: '#B8860B',
    background: '#FAFAF8',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#1E293B',
    textSecondary: '#475569',
    textMuted: '#64748B',
    border: '#E2E8F0',
    divider: '#F1F5F9',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#2563EB',
    stage1: '#1E3A5F',
    stage2: '#059669',
    stage3: '#D97706',
    stage4: '#7C3AED',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    mono: '"SF Mono", Consolas, "Liberation Mono", monospace',
  },
  shadows: {
    sm: '0 1px 2px rgba(30, 58, 95, 0.05)',
    md: '0 4px 6px rgba(30, 58, 95, 0.07), 0 2px 4px rgba(30, 58, 95, 0.05)',
    lg: '0 10px 15px rgba(30, 58, 95, 0.1), 0 4px 6px rgba(30, 58, 95, 0.05)',
    xl: '0 20px 25px rgba(30, 58, 95, 0.12), 0 10px 10px rgba(30, 58, 95, 0.04)',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '18px',
    full: '9999px',
  },
};

// 陶土主题 - 原主题
export const terracottaTheme: Theme = {
  id: 'terracotta',
  name: '陶土',
  description: '温暖陶土风格，舒适自然',
  preview: '🏺',
  isDark: false,
  colors: {
    primary: '#E07A5F',
    primaryDark: '#C85A3E',
    primaryLight: '#F0947A',
    secondary: '#8A9A5B',
    secondaryDark: '#6B7B47',
    accent: '#C67B5C',
    background: '#FDF8F3',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#5E4B35',
    textSecondary: '#8B7355',
    textMuted: '#B8A89A',
    border: '#E8DDD4',
    divider: '#F2E8DF',
    success: '#7A9E6B',
    warning: '#D4A574',
    danger: '#C75B5B',
    info: '#6B9FB8',
    stage1: '#D46648',
    stage2: '#8A9A5B',
    stage3: '#C67B5C',
    stage4: '#B88A6B',
  },
  fonts: {
    heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", monospace',
  },
  shadows: {
    sm: '0 1px 2px rgba(94, 75, 53, 0.06)',
    md: '0 4px 6px rgba(94, 75, 53, 0.08), 0 2px 4px rgba(94, 75, 53, 0.04)',
    lg: '0 10px 15px rgba(94, 75, 53, 0.1), 0 4px 6px rgba(94, 75, 53, 0.05)',
    xl: '0 20px 25px rgba(94, 75, 53, 0.12), 0 10px 10px rgba(94, 75, 53, 0.04)',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    full: '9999px',
  },
};

// 所有主题列表
export const themes: Theme[] = [
  terracottaTheme,
  mckinseyTheme,
  techTheme,
  businessTheme,
];

// 默认主题
export const defaultTheme: Theme = terracottaTheme;

// 通过ID获取主题
export function getThemeById(id: string): Theme {
  return themes.find(t => t.id === id) || defaultTheme;
}
