// 主题类型定义

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  divider: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  // 阶段颜色
  stage1: string;
  stage2: string;
  stage3: string;
  stage4: string;
}

export interface ThemeFonts {
  heading: string;
  body: string;
  mono: string;
}

export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ThemeRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  preview: string; // emoji
  colors: ThemeColors;
  fonts: ThemeFonts;
  shadows: ThemeShadows;
  radius: ThemeRadius;
  isDark: boolean;
}

export type ThemeId = 'terracotta' | 'mckinsey' | 'tech' | 'business';

export const THEME_STORAGE_KEY = 'content-pipeline-theme';
