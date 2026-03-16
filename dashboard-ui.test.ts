import { describe, it, expect, beforeEach } from 'vitest';

// ==================== DashboardUI 测试 ====================

describe('DashboardUI', () => {
  let ui: DashboardUI;

  beforeEach(() => {
    ui = new DashboardUI();
  });

  describe('仪表盘布局', () => {
    it('应该生成仪表盘HTML结构', () => {
      const html = ui.renderDashboard();
      expect(html).toContain('<div class="dashboard">');
      expect(html).toContain('<div class="score-card">');
      expect(html).toContain('<div class="metrics-grid">');
    });

    it('应该包含所有核心指标卡片', () => {
      const html = ui.renderDashboard();
      expect(html).toContain('综合质量分数');
      expect(html).toContain('时效性');
      expect(html).toContain('可信度');
      expect(html).toContain('差异化');
      expect(html).toContain('受众匹配');
    });

    it('应该渲染热点话题列表', () => {
      const hotTopics = [
        { title: 'AI突破', score: 95, source: '36氪' },
        { title: '新能源政策', score: 88, source: '财新' }
      ];
      const html = ui.renderHotTopics(hotTopics);
      expect(html).toContain('AI突破');
      expect(html).toContain('新能源政策');
      expect(html).toContain('95');
    });

    it('应该渲染预警列表', () => {
      const alerts = [
        { type: 'credibility', severity: 'error', message: '缺少来源', suggestion: '添加引用' }
      ];
      const html = ui.renderAlerts(alerts);
      expect(html).toContain('缺少来源');
      expect(html).toContain('error');
    });
  });

  describe('质量分数可视化', () => {
    it('应该生成进度条HTML', () => {
      const html = ui.renderProgressBar(75, '质量分数');
      expect(html).toContain('progress-bar');
      expect(html).toContain('75%');
    });

    it('应该根据分数显示不同颜色', () => {
      const low = ui.renderScoreBadge(45);
      const medium = ui.renderScoreBadge(65);
      const high = ui.renderScoreBadge(85);

      expect(low).toContain('score-low');
      expect(medium).toContain('score-medium');
      expect(high).toContain('score-high');
    });

    it('应该生成仪表盘图表数据', () => {
      const data = ui.generateChartData({
        freshness: 80,
        credibility: 70,
        differentiation: 90,
        audienceMatch: 75
      });
      expect(data.labels).toContain('时效性');
      expect(data.values).toContain(80);
      expect(data.values.length).toBe(4);
    });
  });

  describe('交互组件', () => {
    it('应该生成RSS源管理界面', () => {
      const sources = [
        { id: '1', name: '36氪', url: 'https://36kr.com/feed', status: 'active' },
        { id: '2', name: '财新', url: 'https://caixin.com/feed', status: 'error' }
      ];
      const html = ui.renderRSSManager(sources);
      expect(html).toContain('36氪');
      expect(html).toContain('财新');
      expect(html).toContain('active');
      expect(html).toContain('error');
    });

    it('应该生成内容分析详情页', () => {
      const content = {
        title: '测试文章',
        score: 78,
        issues: ['缺少数据支持'],
        suggestions: ['添加官方引用']
      };
      const html = ui.renderContentDetail(content);
      expect(html).toContain('测试文章');
      expect(html).toContain('78');
      expect(html).toContain('缺少数据支持');
    });

    it('应该生成优化建议列表', () => {
      const suggestions = [
        { area: '时效性', suggestion: '更新数据', priority: 'high', impact: '提升可信度' },
        { area: '可信度', suggestion: '添加来源', priority: 'high', impact: '增强信任' }
      ];
      const html = ui.renderSuggestions(suggestions);
      expect(html).toContain('更新数据');
      expect(html).toContain('high');
      expect(html).toContain('提升可信度');
    });
  });

  describe('响应式设计', () => {
    it('应该包含移动端适配样式', () => {
      const css = ui.getResponsiveStyles();
      expect(css).toContain('@media');
      expect(css).toContain('max-width');
    });

    it('应该生成适配不同屏幕的布局', () => {
      const desktop = ui.renderLayout('desktop');
      const mobile = ui.renderLayout('mobile');

      expect(desktop).toContain('grid-cols-4');
      expect(mobile).toContain('grid-cols-1');
    });
  });

  describe('实时更新', () => {
    it('应该生成WebSocket连接代码', () => {
      const code = ui.getRealtimeUpdateScript();
      expect(code).toContain('WebSocket');
      expect(code).toContain('onmessage');
    });

    it('应该支持手动刷新功能', () => {
      const html = ui.renderRefreshButton();
      expect(html).toContain('refresh');
      expect(html).toContain('onclick');
    });
  });
});

// ==================== 类型定义 ====================

interface HotTopic {
  title: string;
  score: number;
  source: string;
}

interface Alert {
  type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
}

interface Suggestion {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
}

interface RSSSource {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'paused' | 'error';
}

// ==================== 实现 ====================

class DashboardUI {
  renderDashboard(): string {
    return `
<div class="dashboard">
  <header class="dashboard-header">
    <h1>内容质量仪表盘</h1>
    <span class="last-updated">最后更新: ${new Date().toLocaleString()}</span>
  </header>

  <div class="score-cards">
    <div class="score-card">
      <h3>综合质量分数</h3>
      ${this.renderScoreBadge(75)}
    </div>
    <div class="score-card">
      <h3>时效性</h3>
      ${this.renderProgressBar(80, '时效性')}
    </div>
    <div class="score-card">
      <h3>可信度</h3>
      ${this.renderProgressBar(70, '可信度')}
    </div>
    <div class="score-card">
      <h3>差异化</h3>
      ${this.renderProgressBar(90, '差异化')}
    </div>
    <div class="score-card">
      <h3>受众匹配</h3>
      ${this.renderProgressBar(75, '受众匹配')}
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-section">
      <h2>热点话题</h2>
      <div id="hot-topics"></div>
    </div>
    <div class="metric-section">
      <h2>实时预警</h2>
      <div id="alerts"></div>
    </div>
  </div>
</div>
    `.trim();
  }

  renderProgressBar(value: number, label: string): string {
    const colorClass = value >= 80 ? 'progress-high' : value >= 60 ? 'progress-medium' : 'progress-low';
    return `
<div class="progress-bar ${colorClass}">
  <div class="progress-fill" style="width: ${value}%"></div>
  <span class="progress-label">${label}: ${value}%</span>
</div>
    `.trim();
  }

  renderScoreBadge(score: number): string {
    const className = score >= 80 ? 'score-high' : score >= 60 ? 'score-medium' : 'score-low';
    return `<span class="score-badge ${className}">${score}</span>`;
  }

  renderHotTopics(topics: HotTopic[]): string {
    return `
<ul class="hot-topics-list">
  ${topics.map(t => `
    <li class="hot-topic-item">
      <span class="topic-title">${t.title}</span>
      <span class="topic-score">${t.score}</span>
      <span class="topic-source">${t.source}</span>
    </li>
  `).join('')}
</ul>
    `.trim();
  }

  renderAlerts(alerts: Alert[]): string {
    return `
<div class="alerts-container">
  ${alerts.map(a => `
    <div class="alert alert-${a.severity}">
      <span class="alert-type">${a.type}</span>
      <span class="alert-message">${a.message}</span>
      <span class="alert-suggestion">建议: ${a.suggestion}</span>
    </div>
  `).join('')}
</div>
    `.trim();
  }

  generateChartData(metrics: Record<string, number>): { labels: string[]; values: number[] } {
    return {
      labels: ['时效性', '可信度', '差异化', '受众匹配'],
      values: [metrics.freshness, metrics.credibility, metrics.differentiation, metrics.audienceMatch]
    };
  }

  renderRSSManager(sources: RSSSource[]): string {
    return `
<div class="rss-manager">
  <h2>RSS源管理</h2>
  <table class="rss-table">
    <thead>
      <tr><th>名称</th><th>URL</th><th>状态</th><th>操作</th></tr>
    </thead>
    <tbody>
      ${sources.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.url}</td>
          <td><span class="status-${s.status}">${s.status}</span></td>
          <td><button>编辑</button><button>删除</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>
    `.trim();
  }

  renderContentDetail(content: any): string {
    return `
<div class="content-detail">
  <h2>${content.title}</h2>
  <div class="content-score">质量分数: ${this.renderScoreBadge(content.score)}</div>
  <div class="content-issues">
    <h3>问题</h3>
    <ul>${content.issues.map((i: string) => `<li>${i}</li>`).join('')}</ul>
  </div>
</div>
    `.trim();
  }

  renderSuggestions(suggestions: Suggestion[]): string {
    return `
<div class="suggestions-list">
  ${suggestions.map(s => `
    <div class="suggestion-item priority-${s.priority}">
      <span class="suggestion-area">${s.area}</span>
      <span class="suggestion-text">${s.suggestion}</span>
      <span class="suggestion-impact">${s.impact}</span>
    </div>
  `).join('')}
</div>
    `.trim();
  }

  getResponsiveStyles(): string {
    return `
@media (max-width: 768px) {
  .dashboard { padding: 10px; }
  .score-cards { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: 1fr; }
}
@media (min-width: 769px) {
  .score-cards { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
}
    `.trim();
  }

  renderLayout(type: 'desktop' | 'mobile'): string {
    const cols = type === 'desktop' ? 'grid-cols-4' : 'grid-cols-1';
    return `<div class="layout ${cols}"></div>`;
  }

  getRealtimeUpdateScript(): string {
    return `
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateDashboard(data);
};
function updateDashboard(data) {
  document.querySelector('#hot-topics').innerHTML = renderHotTopics(data.hotTopics);
  document.querySelector('#alerts').innerHTML = renderAlerts(data.alerts);
}
    `.trim();
  }

  renderRefreshButton(): string {
    return `<button class="refresh-btn" onclick="location.reload()">刷新数据</button>`;
  }
}
