// Bindings.tsx - 目录绑定独立页面
import { useState, useEffect } from 'react';
import { bindingsApi, themesApi } from '../api/client';
import type { AssetTheme } from '../types';
import type { DirectoryBinding } from '../api/client';
import './Bindings.css';

export function Bindings() {
  const [bindings, setBindings] = useState<DirectoryBinding[]>([]);
  const [themes, setThemes] = useState<AssetTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);
  
  // 创建表单
  const [form, setForm] = useState({
    name: '',
    path: '',
    themeId: '',
    autoSync: true,
  });

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [bindingsRes, themesRes] = await Promise.all([
        bindingsApi.getAll(),
        themesApi.getAll(),
      ]);
      setBindings(bindingsRes || []);
      setThemes(themesRes || []);
    } catch (err) {
      console.error('Failed to load bindings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 扫描目录
  const handleScan = async (id: string) => {
    setScanning(id);
    try {
      const result = await bindingsApi.scan(id);
      alert(`扫描完成: 发现 ${result.scanned} 个文件，新增 ${result.added} 个素材`);
      loadData();
    } catch (err) {
      alert('扫描失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setScanning(null);
    }
  };

  // 删除绑定
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个目录绑定吗？')) return;
    try {
      await bindingsApi.delete(id);
      loadData();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 创建绑定
  const handleCreate = async () => {
    if (!form.name.trim() || !form.path.trim()) return;
    try {
      await bindingsApi.create({
        name: form.name,
        path: form.path,
        theme_id: form.themeId || undefined,
        auto_import: form.autoSync,
      } as Partial<DirectoryBinding>);
      setShowCreateModal(false);
      setForm({ name: '', path: '', themeId: '', autoSync: true });
      loadData();
    } catch (err) {
      alert('创建失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 获取主题名称
  const getThemeName = (themeId?: string) => {
    if (!themeId) return null;
    return themes.find(t => t.id === themeId)?.name;
  };

  return (
    <div className="bindings-page">
      {/* 页面标题 */}
      <div className="page-header">
        <h1>📁 目录绑定</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + 添加绑定
        </button>
      </div>

      {/* 说明文字 */}
      <div className="info-banner">
        <p>📋 目录绑定可以自动将本地文件夹中的文件同步到素材库。设置后，系统会定期扫描目录并将新文件自动导入。</p>
      </div>

      {/* 绑定列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : bindings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <div className="empty-title">暂无目录绑定</div>
          <p>点击"添加绑定"按钮创建第一个目录绑定</p>
        </div>
      ) : (
        <div className="bindings-list">
          {bindings.map(binding => (
            <div key={binding.id} className="binding-card">
              <div className="binding-header">
                <h3 className="binding-name">{binding.name}</h3>
                {(binding.auto_import || binding.autoSync) && <span className="auto-sync-badge">🔄 自动同步</span>}
              </div>
              
              <div className="binding-path">
                <span className="path-label">路径:</span>
                <code className="path-value">{binding.path}</code>
              </div>
              
              <div className="binding-meta">
                {getThemeName(binding.theme_id) && (
                  <span className="theme-tag">
                    📁 {getThemeName(binding.theme_id)}
                  </span>
                )}
                <span className="file-count">
                  📄 {(binding.total_imported !== undefined ? binding.total_imported : binding.fileCount) || 0} 个文件
                </span>
                {(binding.last_scan_at || binding.lastScannedAt) && (
                  <span className="last-scan">
                    上次扫描: {new Date(binding.last_scan_at || binding.lastScannedAt || '').toLocaleString()}
                  </span>
                )}
              </div>
              
              <div className="binding-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleScan(binding.id)}
                  disabled={scanning === binding.id}
                >
                  {scanning === binding.id ? '⏳ 扫描中...' : '🔍 立即扫描'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(binding.id)}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加目录绑定</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>绑定名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：研究报告目录"
                />
              </div>
              <div className="form-group">
                <label>目录路径 *</label>
                <input
                  type="text"
                  value={form.path}
                  onChange={e => setForm({ ...form, path: e.target.value })}
                  placeholder="例如：/Users/用户名/文档/研究"
                />
                <p className="form-hint">请输入绝对路径</p>
              </div>
              <div className="form-group">
                <label>关联主题（可选）</label>
                <select
                  value={form.themeId}
                  onChange={e => setForm({ ...form, themeId: e.target.value })}
                >
                  <option value="">-- 不关联主题 --</option>
                  {themes.map(theme => (
                    <option key={theme.id} value={theme.id}>
                      {theme.icon || '📁'} {theme.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={form.autoSync}
                    onChange={e => setForm({ ...form, autoSync: e.target.checked })}
                  />
                  启用自动同步
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!form.name.trim() || !form.path.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
