import { useState, useEffect } from 'react';
import { i18nApi, type Translation, type Terminology, type TranslationMemory } from '../api/client';
import './I18nManager.css';

export function I18nManager() {
  const [activeTab, setActiveTab] = useState<'translate' | 'terminology' | 'memory' | 'stats'>('translate');
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [terminologies, setTerminologies] = useState<Terminology[]>([]);
  const [memories, setMemories] = useState<TranslationMemory[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Translation form
  const [translateForm, setTranslateForm] = useState({
    content: '',
    sourceLanguage: 'zh-CN',
    targetLanguage: 'en',
    useMemory: true,
  });
  const [translationResult, setTranslationResult] = useState<any>(null);

  // Search forms
  const [termQuery, setTermQuery] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');

  useEffect(() => {
    if (activeTab === 'stats') {
      loadStats();
    }
  }, [activeTab]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await i18nApi.getTranslationStats();
      setStats(res);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMachineTranslate = async () => {
    if (!translateForm.content.trim()) return;
    setLoading(true);
    try {
      const res = await i18nApi.machineTranslate({
        content: translateForm.content,
        sourceLanguage: translateForm.sourceLanguage,
        targetLanguage: translateForm.targetLanguage,
        useMemory: translateForm.useMemory,
      });
      setTranslationResult(res);
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchTerminology = async () => {
    if (!termQuery.trim()) return;
    setLoading(true);
    try {
      const res = await i18nApi.searchTerminology(termQuery);
      setTerminologies(res.items || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchMemory = async () => {
    if (!memoryQuery.trim()) return;
    setLoading(true);
    try {
      const res = await i18nApi.searchTranslationMemory({
        text: memoryQuery,
        sourceLanguage: translateForm.sourceLanguage,
        targetLanguage: translateForm.targetLanguage,
      });
      setMemories(res.items || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLanguageName = (code: string) => {
    const map: Record<string, string> = {
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어',
      'fr': 'Français',
      'de': 'Deutsch',
      'es': 'Español',
      'ru': 'Русский',
      'ar': 'العربية',
    };
    return map[code] || code;
  };

  return (
    <div className="i18n-manager">
      <div className="page-header">
        <h1>🌍 国际化管理</h1>
        <p className="page-desc">翻译管理、术语库、翻译记忆库</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'translate' ? 'active' : ''}`} onClick={() => setActiveTab('translate')}>
          🌐 机器翻译
        </button>
        <button className={`tab ${activeTab === 'terminology' ? 'active' : ''}`} onClick={() => setActiveTab('terminology')}>
          📚 术语库
        </button>
        <button className={`tab ${activeTab === 'memory' ? 'active' : ''}`} onClick={() => setActiveTab('memory')}>
          💾 翻译记忆
        </button>
        <button className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
          📊 统计
        </button>
      </div>

      {activeTab === 'translate' && (
        <div className="translate-section">
          <div className="translate-panel">
            <div className="language-selector">
              <div className="form-group">
                <label>源语言</label>
                <select
                  value={translateForm.sourceLanguage}
                  onChange={(e) => setTranslateForm({ ...translateForm, sourceLanguage: e.target.value })}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                </select>
              </div>
              <div className="language-arrow">→</div>
              <div className="form-group">
                <label>目标语言</label>
                <select
                  value={translateForm.targetLanguage}
                  onChange={(e) => setTranslateForm({ ...translateForm, targetLanguage: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>源内容</label>
              <textarea
                value={translateForm.content}
                onChange={(e) => setTranslateForm({ ...translateForm, content: e.target.value })}
                placeholder="输入要翻译的内容..."
                rows={6}
              />
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={translateForm.useMemory}
                  onChange={(e) => setTranslateForm({ ...translateForm, useMemory: e.target.checked })}
                />
                使用翻译记忆库
              </label>
            </div>

            <button className="btn btn-primary" onClick={handleMachineTranslate} disabled={loading}>
              {loading ? '翻译中...' : '🌐 开始翻译'}
            </button>
          </div>

          {translationResult && (
            <div className="translation-result">
              <h3>翻译结果</h3>
              <div className="result-content">
                <div className="result-section">
                  <label>译文 ({getLanguageName(translationResult.targetLanguage)})</label>
                  <div className="translated-text">{translationResult.translatedContent}</div>
                </div>
                {translationResult.fromMemory && (
                  <div className="result-badge">来自翻译记忆库</div>
                )}
                {translationResult.terminologyReplacements && translationResult.terminologyReplacements.length > 0 && (
                  <div className="result-section">
                    <label>术语替换 ({translationResult.terminologyReplacements.length})</label>
                    <div className="terminology-list">
                      {translationResult.terminologyReplacements.map((item: any, idx: number) => (
                        <div key={idx} className="terminology-item">
                          <span className="term-source">{item.source}</span>
                          <span className="term-arrow">→</span>
                          <span className="term-target">{item.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'terminology' && (
        <div className="terminology-section">
          <div className="search-panel">
            <div className="form-group">
              <label>搜索术语</label>
              <div className="search-row">
                <input
                  type="text"
                  value={termQuery}
                  onChange={(e) => setTermQuery(e.target.value)}
                  placeholder="输入术语..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchTerminology()}
                />
                <button className="btn btn-primary" onClick={handleSearchTerminology} disabled={loading}>
                  搜索
                </button>
              </div>
            </div>
          </div>

          <div className="terminology-list-panel">
            {terminologies.length === 0 ? (
              <div className="empty-state">搜索术语查看结果</div>
            ) : (
              <div className="terminology-cards">
                {terminologies.map((term) => (
                  <div key={term.id} className="terminology-card">
                    <div className="term-header">
                      <span className="term-name">{term.term}</span>
                      <span className="term-language">{getLanguageName(term.language)}</span>
                      {term.category && <span className="term-category">{term.category}</span>}
                    </div>
                    {term.definition && (
                      <div className="term-definition">{term.definition}</div>
                    )}
                    <div className="term-translations">
                      {Object.entries(term.translations).map(([lang, text]) => (
                        <div key={lang} className="term-translation">
                          <span className="lang">{getLanguageName(lang)}:</span>
                          <span className="text">{text as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'memory' && (
        <div className="memory-section">
          <div className="search-panel">
            <div className="form-group">
              <label>搜索翻译记忆</label>
              <div className="search-row">
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="输入文本搜索相似翻译..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchMemory()}
                />
                <button className="btn btn-primary" onClick={handleSearchMemory} disabled={loading}>
                  搜索
                </button>
              </div>
            </div>
          </div>

          <div className="memory-list-panel">
            {memories.length === 0 ? (
              <div className="empty-state">搜索查看翻译记忆</div>
            ) : (
              <div className="memory-cards">
                {memories.map((mem) => (
                  <div key={mem.id} className="memory-card">
                    <div className="memory-languages">
                      {getLanguageName(mem.sourceLanguage)} → {getLanguageName(mem.targetLanguage)}
                    </div>
                    <div className="memory-text source">{mem.sourceText}</div>
                    <div className="memory-text target">{mem.targetText}</div>
                    <div className="memory-meta">
                      <span>相似度: {mem.similarity}%</span>
                      <span>使用次数: {mem.usageCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="stats-section">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : stats ? (
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{stats.totalTranslations || 0}</span>
                <span className="stat-label">总翻译数</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalTerminology || 0}</span>
                <span className="stat-label">术语数</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.totalMemoryEntries || 0}</span>
                <span className="stat-label">记忆条目</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.supportedLanguages || 0}</span>
                <span className="stat-label">支持语言</span>
              </div>

              {stats.byLanguage && (
                <div className="stats-detail">
                  <h3>按语言统计</h3>
                  <div className="language-stats">
                    {Object.entries(stats.byLanguage).map(([lang, count]: [string, any]) => (
                      <div key={lang} className="language-stat">
                        <span className="lang-name">{getLanguageName(lang)}</span>
                        <div className="lang-bar">
                          <div
                            className="lang-fill"
                            style={{ width: `${Math.min((count / (stats.totalTranslations || 1)) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="lang-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.byType && (
                <div className="stats-detail">
                  <h3>按类型统计</h3>
                  <div className="type-stats">
                    {Object.entries(stats.byType).map(([type, count]: [string, any]) => (
                      <div key={type} className="type-stat">
                        <span className="type-name">{type}</span>
                        <span className="type-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">暂无统计数据</div>
          )}
        </div>
      )}
    </div>
  );
}
