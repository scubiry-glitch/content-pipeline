import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme, themes, type ThemeId } from '../themes';
import { llmConfigApi, type ModelConfigResponse, type ModelRoutingRule, type TestProviderResult } from '../api/client';
import './Settings.css';

// Provider 友好名称映射
const PROVIDER_LABELS: Record<string, string> = {
  'siliconflow': 'SiliconFlow',
  'volcano-engine': '火山引擎',
  'kimi': 'Kimi',
  'claude': 'Claude',
  'openai': 'OpenAI',
  'dashboard-llm': 'Dashboard LLM',
  'claude-code': 'Claude Code',
};

// 任务类型友好名称
const TASK_TYPE_LABELS: Record<string, string> = {
  'planning': '选题规划',
  'analysis': '数据分析',
  'blue_team_review': '蓝军评审',
  'writing': '正文写作',
  'content_library': '内容库解析',
  'expert_library': '专家库生成',
  'summarization': '摘要生成',
  'tagging': '标签分类',
  'embedding': '向量嵌入',
  'health_check': '健康检查',
};

export function Settings() {
  const { settings, updateSetting, updateNestedSetting, resetSettings } = useSettings();
  const { currentTheme, setTheme } = useTheme();

  // ===== 模型配置状态 =====
  const [modelConfig, setModelConfig] = useState<ModelConfigResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestProviderResult | 'testing'>>({});
  const [editedRules, setEditedRules] = useState<ModelRoutingRule[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadModelConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const config = await llmConfigApi.getConfig();
      setModelConfig(config);
      setEditedRules(config.routingRules);
    } catch (err: any) {
      setConfigError(err.message || '加载模型配置失败');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModelConfig();
  }, [loadModelConfig]);

  const handleTestProvider = async (providerName: string) => {
    setTestResults(prev => ({ ...prev, [providerName]: 'testing' }));
    try {
      const result = await llmConfigApi.testProvider(providerName);
      setTestResults(prev => ({ ...prev, [providerName]: result }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [providerName]: { provider: providerName, success: false, error: err.message || '测试失败' },
      }));
    }
  };

  const handleRuleChange = (taskType: string, field: keyof ModelRoutingRule, value: string) => {
    setEditedRules(prev =>
      prev.map(rule =>
        rule.taskType === taskType ? { ...rule, [field]: value } : rule
      )
    );
    setSaveStatus(null);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await llmConfigApi.updateConfig({
        routingRules: editedRules.map(r => ({
          taskType: r.taskType,
          preferredProvider: r.preferredProvider,
          fallbackProvider: r.fallbackProvider,
          priority: r.priority,
        })),
      });
      setSaveStatus('已保存');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 所有可用 provider 名称
  const allProviderNames = modelConfig ? Object.keys(modelConfig.providers) : [];

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

        {/* 模型配置 */}
        <section className="settings-section">
          <h2 className="section-title">🤖 模型配置</h2>

          {configLoading && <p className="setting-desc">加载中...</p>}
          {configError && <p className="setting-desc" style={{ color: '#ef4444' }}>{configError}</p>}

          {modelConfig && (
            <>
              {/* 全局默认模型 */}
              <div className="setting-item">
                <div className="setting-info">
                  <label className="setting-label">全局默认模型</label>
                  <p className="setting-desc">DEFAULT_LLM_MODEL 环境变量</p>
                </div>
                <span className="env-value">
                  {modelConfig.env.DEFAULT_LLM_MODEL || '未设置 (kimi-for-coding)'}
                </span>
              </div>

              {/* Provider 状态 */}
              <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="setting-info" style={{ marginBottom: 12 }}>
                  <label className="setting-label">Provider 状态</label>
                  <p className="setting-desc">已注册的 LLM 服务提供商，点击"测试"验证连通性</p>
                </div>
                <div className="provider-grid">
                  {allProviderNames.map(name => {
                    const info = modelConfig.providers[name];
                    const testResult = testResults[name];
                    const isTesting = testResult === 'testing';
                    const result = typeof testResult === 'object' ? testResult : null;

                    return (
                      <div key={name} className={`provider-card ${result?.success ? 'online' : 'offline'}`}>
                        <div className="provider-card-header">
                          <span className="provider-name">{PROVIDER_LABELS[name] || name}</span>
                          <span className={`provider-status ${result ? (result.success ? 'online' : 'offline') : isTesting ? 'testing' : 'offline'}`}>
                            {result ? (result.success ? '在线' : '离线') : isTesting ? '测试中...' : '未测试'}
                          </span>
                        </div>
                        <span className="provider-model">
                          {info.models.length > 0 ? info.models[0] : '无模型'}
                          {info.models.length > 1 && ` +${info.models.length - 1}`}
                        </span>
                        <button
                          className="provider-test-btn"
                          onClick={() => handleTestProvider(name)}
                          disabled={isTesting}
                        >
                          {isTesting ? '测试中...' : '测试连通'}
                        </button>
                        {result && (
                          <span className={`provider-test-result ${result.success ? 'success' : 'error'}`}>
                            {result.success
                              ? `${result.latencyMs}ms | ${result.model} | ${result.content?.substring(0, 60)}...`
                              : result.error}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 任务路由配置 */}
              <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="setting-info" style={{ marginBottom: 12 }}>
                  <label className="setting-label">任务路由配置</label>
                  <p className="setting-desc">按任务类型配置主 Provider 和备选 Provider（运行时修改，重启后还原）</p>
                </div>
                <table className="routing-table">
                  <thead>
                    <tr>
                      <th>任务类型</th>
                      <th>主 Provider</th>
                      <th>备选 Provider</th>
                      <th>优先级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editedRules.map(rule => (
                      <tr key={rule.taskType}>
                        <td className="task-type">{TASK_TYPE_LABELS[rule.taskType] || rule.taskType}</td>
                        <td>
                          <select
                            value={rule.preferredProvider}
                            onChange={(e) => handleRuleChange(rule.taskType, 'preferredProvider', e.target.value)}
                          >
                            {allProviderNames.map(p => (
                              <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={rule.fallbackProvider || ''}
                            onChange={(e) => handleRuleChange(rule.taskType, 'fallbackProvider', e.target.value)}
                          >
                            <option value="">无</option>
                            {allProviderNames
                              .filter(p => p !== rule.preferredProvider)
                              .map(p => (
                                <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                              ))}
                          </select>
                        </td>
                        <td>
                          <span className={`priority-badge ${rule.priority}`}>{rule.priority}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="config-actions">
                  {saveStatus && <span className="save-status">{saveStatus}</span>}
                  <button
                    className="btn-save"
                    onClick={handleSaveConfig}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
