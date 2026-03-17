import { useSettings } from '../contexts/SettingsContext';
import { useTheme, themes, type ThemeId } from '../themes';
import './Settings.css';

export function Settings() {
  const { settings, updateSetting, updateNestedSetting, resetSettings } = useSettings();
  const { currentTheme, setTheme } = useTheme();

  const themeOptions = [
    { key: 'light', label: '☀️ 浅色', description: '明亮的界面风格' },
    { key: 'dark', label: '🌙 深色', description: '护眼的暗色主题' },
    { key: 'system', label: '💻 跟随系统', description: '自动匹配系统设置' },
  ];

  const themeStyleOptions = themes.map(t => ({
    key: t.id,
    label: `${t.preview} ${t.name}`,
    description: t.description,
  }));

  const intervalOptions = [
    { key: 10, label: '10秒' },
    { key: 30, label: '30秒' },
    { key: 60, label: '1分钟' },
    { key: 300, label: '5分钟' },
  ];

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">⚙️ 偏好设置</h1>
        <button className="btn btn-secondary" onClick={resetSettings}>
          恢复默认
        </button>
      </div>

      <div className="settings-sections">
        {/* 外观设置 */}
        <section className="settings-section">
          <h2 className="section-title">🎨 外观</h2>

          {/* 主题风格选择 */}
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">主题风格</label>
              <p className="setting-desc">选择界面整体风格</p>
            </div>
            <div className="theme-style-options">
              {themeStyleOptions.map((option) => (
                <label
                  key={option.key}
                  className={`theme-style-option ${currentTheme.id === option.key ? 'active' : ''}`}
                  onClick={() => setTheme(option.key as ThemeId)}
                >
                  <span className="theme-style-label">{option.label}</span>
                  <span className="theme-style-desc">{option.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 明暗模式选择 */}
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">显示模式</label>
              <p className="setting-desc">选择您喜欢的界面明暗模式</p>
            </div>
            <div className="theme-options">
              {themeOptions.map((option) => (
                <label
                  key={option.key}
                  className={`theme-option ${settings.theme === option.key ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.key}
                    checked={settings.theme === option.key}
                    onChange={(e) => updateSetting('theme', e.target.value as 'light' | 'dark' | 'system')}
                  />
                  <span className="theme-label">{option.label}</span>
                  <span className="theme-desc">{option.description}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 数据刷新设置 */}
        <section className="settings-section">
          <h2 className="section-title">🔄 数据刷新</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">自动刷新</label>
              <p className="setting-desc">自动获取最新数据</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) => updateSetting('autoRefresh', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          {settings.autoRefresh && (
            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">刷新间隔</label>
                <p className="setting-desc">自动刷新的时间间隔</p>
              </div>
              <select
                className="setting-select"
                value={settings.refreshInterval}
                onChange={(e) => updateSetting('refreshInterval', Number(e.target.value))}
              >
                {intervalOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* 通知设置 */}
        <section className="settings-section">
          <h2 className="section-title">🔔 通知</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">任务逾期提醒</label>
              <p className="setting-desc">当任务即将逾期或已逾期时通知</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.notifications.taskDue}
                onChange={(e) =>
                  updateNestedSetting('notifications', 'taskDue', e.target.checked)
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">任务完成通知</label>
              <p className="setting-desc">当任务被标记为完成时通知</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.notifications.taskCompleted}
                onChange={(e) =>
                  updateNestedSetting('notifications', 'taskCompleted', e.target.checked)
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">热点推送</label>
              <p className="setting-desc">当发现新的热门话题时通知</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.notifications.hotTopics}
                onChange={(e) =>
                  updateNestedSetting('notifications', 'hotTopics', e.target.checked)
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* 默认设置 */}
        <section className="settings-section">
          <h2 className="section-title">⚡ 快捷设置</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label">默认筛选</label>
              <p className="setting-desc">任务列表的默认筛选条件</p>
            </div>
            <select
              className="setting-select"
              value={settings.defaultFilter}
              onChange={(e) => updateSetting('defaultFilter', e.target.value)}
            >
              <option value="all">全部</option>
              <option value="pending">待处理</option>
              <option value="planning">选题中</option>
              <option value="researching">研究中</option>
              <option value="writing">写作中</option>
              <option value="reviewing">评审中</option>
              <option value="completed">已完成</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
