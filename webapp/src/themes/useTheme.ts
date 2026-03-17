import { useState, useEffect, useCallback } from 'react';
import type { Theme, ThemeId } from './types';
import { getThemeById, themes, defaultTheme } from './config';
import { applyTheme, getStoredTheme, storeTheme } from './utils';

interface UseThemeReturn {
  currentTheme: Theme;
  setTheme: (themeId: ThemeId) => void;
  themes: Theme[];
  isReady: boolean;
}

export function useTheme(): UseThemeReturn {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);
  const [isReady, setIsReady] = useState(false);

  // 初始化时从localStorage读取主题
  useEffect(() => {
    const storedTheme = getStoredTheme();
    setCurrentTheme(storedTheme);
    applyTheme(storedTheme);
    setIsReady(true);
  }, []);

  // 切换主题
  const setTheme = useCallback((themeId: ThemeId) => {
    const newTheme = getThemeById(themeId);
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    storeTheme(themeId);
  }, []);

  return {
    currentTheme,
    setTheme,
    themes,
    isReady,
  };
}
