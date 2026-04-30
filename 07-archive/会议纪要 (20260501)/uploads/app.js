// ===== App Entry Point v6.0 — 三视角路由 =====

document.addEventListener('DOMContentLoaded', async () => {
    initializeState();
    initNavigation();
    // Try loading saved state from cloud
    try { await loadSavedState(); } catch(e) {}
    renderGovernancePage();
});

function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update nav
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.nav-tab[data-tab="${tabId}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('active');

    AppState.activeTab = tabId;

    // Render tab content — 三视角路由
    switch (tabId) {
        case 'governance': renderGovernancePage(); break;
        case 'marketopportunity': renderMarketOpportunityPage(); break;
        // ===== 三视角页面 =====
        case 'dashboard': renderDashboard3V(); break;
        case 'baseline': renderBaseline3V(); break;
        case 'financial': renderFinancial3V(); break;
        // ===== 战略假设 (Original) =====
        case 'assumptions': renderAssumptions(); break;
        case 'scenarios':
            renderScenarioSelector();
            if (AppState.selectedAssumptions.length === 0) {
                AppState.selectedAssumptions = AppState.assumptions.map(a => a.id);
                renderScenarioSelector();
            }
            break;
        // ===== 实践验证+BLM验证 (Extended Advanced View) =====
        case 'strategy': renderStrategyHypothesisPage(); break;
        case 'udimension': renderUDimensionPage(); break;
        case 'eanalysis': renderEAnalysisPage(); break;
        case 'crossanalysis': renderCrossAnalysisPage(); break;
        case 'alignment': renderAlignmentPage(); break;
        case 'l1tools': renderL1ToolsPage(); break;
        case 'flywheel': renderFlywheelPage(); break;
    }

    // Resize charts after tab switch
    setTimeout(() => {
        Object.values(chartInstances).forEach(chart => {
            if (chart && !chart.isDisposed()) chart.resize();
        });
    }, 100);
}

// ===== 兼容旧代码：renderDashboard / updateDashboardKPIs =====
function renderDashboard() {
    renderDashboard3V();
}
function updateDashboardKPIs() {
    // 旧KPI逻辑已被三视角仪表盘替代
}
