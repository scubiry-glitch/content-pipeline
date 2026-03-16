// 仪表盘应用逻辑

// 模拟数据
const mockData = {
    overallScore: 78,
    trend: '+5%',
    freshness: 85,
    credibility: 72,
    differentiation: 80,
    audienceMatch: 75,
    hotTopics: [
        { title: 'GPT-5即将发布，AI能力再突破', score: 96, source: '36氪' },
        { title: '新能源汽车补贴政策调整', score: 88, source: '财新' },
        { title: '央行降准0.5个百分点', score: 85, source: '第一财经' },
        { title: '苹果Vision Pro国行发售', score: 82, source: '极客公园' }
    ],
    alerts: [
        { type: 'credibility', severity: 'warning', message: '部分数据缺少官方来源', suggestion: '引用统计局或央行官方数据' },
        { type: 'freshness', severity: 'info', message: '3篇文章超过48小时未更新', suggestion: '考虑更新最新数据' }
    ],
    rssSources: [
        { name: '36氪', status: 'active', lastFetch: '2分钟前' },
        { name: '财新', status: 'active', lastFetch: '5分钟前' },
        { name: '机器之心', status: 'error', lastFetch: '1小时前' }
    ],
    suggestions: [
        { area: '可信度', suggestion: '为"市场增长30%"添加数据来源链接', priority: 'high', impact: '增强读者信任' },
        { area: '差异化', suggestion: '补充独家观点，与竞品文章区分', priority: 'medium', impact: '提高内容竞争力' },
        { area: '时效性', suggestion: '更新2024年Q1最新数据', priority: 'medium', impact: '提升内容价值' }
    ]
};

// 初始化仪表盘
function initDashboard() {
    updateTime();
    renderScores(mockData);
    renderHotTopics(mockData.hotTopics);
    renderAlerts(mockData.alerts);
    renderRSSStatus(mockData.rssSources);
    renderSuggestions(mockData.suggestions);
}

// 更新时间
function updateTime() {
    const now = new Date();
    document.getElementById('update-time').textContent = now.toLocaleString('zh-CN');
}

// 渲染分数
function renderScores(data) {
    document.getElementById('overall-score').textContent = data.overallScore;
    document.getElementById('score-trend').textContent = `较上周 ${data.trend}`;

    updateProgressBar('freshness-bar', data.freshness);
    updateProgressBar('credibility-bar', data.credibility);
    updateProgressBar('differentiation-bar', data.differentiation);
    updateProgressBar('audience-bar', data.audienceMatch);
}

// 更新进度条
function updateProgressBar(id, value) {
    const bar = document.getElementById(id);
    const fill = bar.querySelector('.progress-fill');
    const label = bar.querySelector('.progress-label');

    fill.style.width = `${value}%`;
    label.textContent = `${value}%`;

    // 更新颜色类
    bar.className = 'progress-bar';
    if (value >= 80) bar.classList.add('progress-high');
    else if (value >= 60) bar.classList.add('progress-medium');
    else bar.classList.add('progress-low');
}

// 渲染热点话题
function renderHotTopics(topics) {
    const container = document.getElementById('hot-topics');
    if (!topics || topics.length === 0) {
        container.innerHTML = '<div class="alert-placeholder">暂无热点数据</div>';
        return;
    }

    container.innerHTML = `
        <ul class="hot-topics-list">
            ${topics.map(t => `
                <li class="hot-topic-item">
                    <span class="topic-title">${t.title}</span>
                    <span class="topic-score">${t.score}</span>
                    <span class="topic-source">${t.source}</span>
                </li>
            `).join('')}
        </ul>
    `;
}

// 渲染预警
function renderAlerts(alerts) {
    const container = document.getElementById('alerts');
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="alert-placeholder">✅ 暂无预警</div>';
        return;
    }

    container.innerHTML = alerts.map(a => `
        <div class="alert alert-${a.severity}">
            <span class="alert-type">${getAlertTypeName(a.type)}</span>
            <span class="alert-message">${a.message}</span>
            <span class="alert-suggestion">💡 建议: ${a.suggestion}</span>
        </div>
    `).join('');
}

// 获取预警类型中文名
function getAlertTypeName(type) {
    const names = {
        freshness: '时效性',
        credibility: '可信度',
        differentiation: '差异化',
        audience: '受众匹配'
    };
    return names[type] || type;
}

// 渲染RSS状态
function renderRSSStatus(sources) {
    const container = document.getElementById('rss-status');
    container.innerHTML = sources.map(s => `
        <div class="rss-status-item">
            <span>${s.name}</span>
            <span>
                <span class="status-badge status-${s.status}">${s.status === 'active' ? '正常' : '异常'}</span>
                <span style="color: #999; font-size: 12px; margin-left: 8px;">${s.lastFetch}</span>
            </span>
        </div>
    `).join('');
}

// 渲染建议
function renderSuggestions(suggestions) {
    const container = document.getElementById('suggestions');
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = '<div class="alert-placeholder">暂无优化建议</div>';
        return;
    }

    // 按优先级排序
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...suggestions].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    container.innerHTML = sorted.map(s => `
        <div class="suggestion-item priority-${s.priority}">
            <span class="suggestion-area">${s.area}</span>
            <span class="suggestion-text">${s.suggestion}</span>
            <span class="suggestion-impact">📈 ${s.impact}</span>
        </div>
    `).join('');
}

// 刷新数据
function refreshData() {
    const btn = document.querySelector('.refresh-btn');
    btn.textContent = '⏳ 刷新中...';
    btn.disabled = true;

    // 模拟API调用
    setTimeout(() => {
        // 随机更新一些数据
        mockData.overallScore = Math.floor(70 + Math.random() * 20);
        mockData.freshness = Math.floor(70 + Math.random() * 25);
        mockData.credibility = Math.floor(60 + Math.random() * 30);

        initDashboard();

        btn.textContent = '🔄 刷新';
        btn.disabled = false;
    }, 1000);
}

// 分析内容
function analyzeContent() {
    const input = document.getElementById('content-input');
    const result = document.getElementById('analysis-result');
    const content = input.value.trim();

    if (!content) {
        alert('请输入内容');
        return;
    }

    // 模拟分析
    const analysis = {
        score: Math.floor(60 + Math.random() * 30),
        wordCount: content.length,
        readingTime: Math.ceil(content.length / 500),
        issues: [],
        suggestions: []
    };

    if (content.length < 100) {
        analysis.issues.push('内容过短');
        analysis.suggestions.push('建议扩展到500字以上');
    }

    if (!content.includes('http') && !content.includes('来源')) {
        analysis.issues.push('缺少来源引用');
        analysis.suggestions.push('添加数据来源增强可信度');
    }

    result.innerHTML = `
        <h3>分析结果</h3>
        <p><strong>质量分数:</strong> <span class="score-${analysis.score >= 80 ? 'high' : analysis.score >= 60 ? 'medium' : 'low'}">${analysis.score}</span></p>
        <p><strong>字数:</strong> ${analysis.wordCount}</p>
        <p><strong>预估阅读时间:</strong> ${analysis.readingTime} 分钟</p>
        ${analysis.issues.length > 0 ? `
            <p><strong>问题:</strong></p>
            <ul>${analysis.issues.map(i => `<li>${i}</li>`).join('')}</ul>
        ` : '<p>✅ 无明显问题</p>'}
        ${analysis.suggestions.length > 0 ? `
            <p><strong>建议:</strong></p>
            <ul>${analysis.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
        ` : ''}
    `;
    result.classList.add('show');
}

// WebSocket连接（预留）
function initWebSocket() {
    // const ws = new WebSocket('ws://localhost:8080');
    // ws.onmessage = (event) => {
    //     const data = JSON.parse(event.data);
    //     updateDashboard(data);
    // };
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initDashboard);

// 自动刷新（每5分钟）
setInterval(refreshData, 5 * 60 * 1000);
