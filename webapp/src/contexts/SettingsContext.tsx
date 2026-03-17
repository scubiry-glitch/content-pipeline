import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  defaultFilter: string;
  notifications: {
    taskDue: boolean;
    taskCompleted: boolean;
    hotTopics: boolean;
    email: boolean;
  };
  language: string;
}

const defaultSettings: UserSettings = {
  theme: 'system',
  sidebarCollapsed: false,
  autoRefresh: true,
  refreshInterval: 30,
  defaultFilter: 'all',
  notifications: {
    taskDue: true,
    taskCompleted: true,
    hotTopics: true,
    email: false,
  },
  language: 'zh-CN',
};

interface SettingsContextType {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => void;
  updateNestedSetting: <K extends keyof UserSettings>(
    parentKey: K,
    childKey: keyof UserSettings[K],
    value: boolean
  ) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

const STORAGE_KEY = 'content-pipeline-settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => {
    // 从 localStorage 加载设置
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return { ...defaultSettings, ...JSON.parse(saved) };
        } catch {
          return defaultSettings;
        }
      }
    }
    return defaultSettings;
  });

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // 应用主题
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      let effectiveTheme = settings.theme;

      if (effectiveTheme === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }

      if (effectiveTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme();
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, [settings.theme]);

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateNestedSetting = <K extends keyof UserSettings>(
    parentKey: K,
    childKey: keyof UserSettings[K],
    value: boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      [parentKey]: {
        ...(prev[parentKey] as Record<string, unknown>),
        [childKey]: value,
      },
    }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider
      value={{ settings, updateSetting, updateNestedSetting, resetSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
