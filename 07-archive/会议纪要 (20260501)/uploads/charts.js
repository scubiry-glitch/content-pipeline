// ===== Charts Module =====
let chartInstances = {};

function getOrCreateChart(containerId) {
    if (chartInstances[containerId]) {
        chartInstances[containerId].dispose();
    }
    const dom = document.getElementById(containerId);
    if (!dom) return null;
    const chart = echarts.init(dom);
    chartInstances[containerId] = chart;
    return chart;
}

// Color palette
const COLORS = {
    primary: '#2f9668',
    secondary: '#4b9fe1',
    warning: '#f59e0b',
    danger: '#ef4444',
    purple: '#8b5cf6',
    teal: '#14b8a6',
    indigo: '#6366f1',
    pink: '#ec4899',
    palette: ['#2f9668', '#4b9fe1', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1', '#ec4899']
};

// Dashboard Charts
function renderDashboardCharts() {
    renderUEOverviewChart();
    renderAssumptionStatusChart();
    renderCityCompareChart();
    renderCostStructureChart();
}

function renderUEOverviewChart() {
    const chart = getOrCreateChart('chart-ue-overview');
    if (!chart) return;

    const bjModel = AppState.baselineModels.beijing;
    const shModel = AppState.baselineModels.shanghai;
    const bjUE = calculateUE(bjModel);
    const shUE = calculateUE(shModel);

    // Also calculate assumption models
    const categories = ['基准-北京', '基准-上海'];
    const gtvData = [bjUE.gtv / 10000, shUE.gtv / 10000];
    const revenueData = [bjUE.totalRevenue / 10000, shUE.totalRevenue / 10000];
    const costData = [bjUE.renovationCost / 10000, shUE.renovationCost / 10000];
    const profitData = [bjUE.grossProfit / 10000, shUE.grossProfit / 10000];

    AppState.assumptions.filter(a => a.is_active).forEach(asmp => {
        const adjusted = applyAssumption(bjModel, asmp);
        const ue = calculateUE(adjusted);
        categories.push(asmp.assumption_name.substring(0, 6));
        gtvData.push(ue.gtv / 10000);
        revenueData.push(ue.totalRevenue / 10000);
        costData.push(ue.renovationCost / 10000);
        profitData.push(ue.grossProfit / 10000);
    });

    chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: ['GTV', '总收入', '总成本', '毛利润'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 20, top: 20, bottom: 40 },
        xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10, rotate: 15 } },
        yAxis: { type: 'value', name: '万元', axisLabel: { fontSize: 10 } },
        series: [
            { name: 'GTV', type: 'bar', data: gtvData, color: COLORS.primary, barMaxWidth: 30 },
            { name: '总收入', type: 'bar', data: revenueData, color: COLORS.secondary, barMaxWidth: 30 },
            { name: '总成本', type: 'bar', data: costData, color: COLORS.warning, barMaxWidth: 30 },
            { name: '毛利润', type: 'bar', data: profitData, color: COLORS.purple, barMaxWidth: 30 }
        ]
    });
}

function renderAssumptionStatusChart() {
    const chart = getOrCreateChart('chart-assumption-status');
    if (!chart) return;

    const themes = AppState.themes || [];

    if (themes.length > 0) {
        // --- 按主题分组的嵌套饼图 ---
        // 外环：每个主题下各状态的实验数量
        // 内环：4个主题的实验总数占比
        const statusColors = { '已验证': '#10b981', '验证中': '#f59e0b', '待验证': '#6b7280', '已否定': '#ef4444' };
        const innerData = [];
        const outerData = [];

        themes.forEach(theme => {
            const experiments = typeof getThemeExperiments === 'function'
                ? getThemeExperiments(theme.id)
                : AppState.assumptions.filter(a => theme.experiment_ids.includes(a.id));
            const total = experiments.length;
            if (total === 0) return;

            innerData.push({ name: theme.theme_name, value: total, itemStyle: { color: theme.color } });

            const statusCount = { '已验证': 0, '验证中': 0, '待验证': 0, '已否定': 0 };
            experiments.forEach(a => { statusCount[a.validation_status] = (statusCount[a.validation_status] || 0) + 1; });
            Object.entries(statusCount).forEach(([status, count]) => {
                if (count > 0) {
                    outerData.push({
                        name: `${theme.theme_name}-${status}`,
                        value: count,
                        itemStyle: { color: statusColors[status] || '#6b7280' },
                        _theme: theme.theme_name,
                        _status: status
                    });
                }
            });
        });

        chart.setOption({
            tooltip: {
                trigger: 'item',
                formatter: p => {
                    if (p.data._theme) return `<b>${p.data._theme}</b><br/>${p.data._status}: ${p.value}个实验`;
                    return `<b>${p.name}</b>: ${p.value}个实验`;
                }
            },
            legend: { bottom: 0, textStyle: { fontSize: 10 }, data: themes.map(t => t.theme_name) },
            series: [
                {
                    type: 'pie', name: '主题',
                    radius: ['0%', '40%'], center: ['50%', '45%'],
                    label: { show: true, position: 'inner', fontSize: 10, formatter: '{b}\n{c}', color: '#fff', fontWeight: 'bold' },
                    data: innerData,
                    padAngle: 2, itemStyle: { borderRadius: 4 }
                },
                {
                    type: 'pie', name: '状态',
                    radius: ['50%', '70%'], center: ['50%', '45%'],
                    label: { show: true, fontSize: 9, formatter: p => p.data._status ? `${p.data._status}\n${p.value}` : '' },
                    data: outerData,
                    padAngle: 1, itemStyle: { borderRadius: 4 }
                }
            ]
        });
    } else {
        // 回退：原始饼图逻辑
        const statusCount = { '已验证': 0, '验证中': 0, '待验证': 0, '已否定': 0 };
        AppState.assumptions.forEach(a => { statusCount[a.validation_status] = (statusCount[a.validation_status] || 0) + 1; });
        const data = Object.entries(statusCount).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
        chart.setOption({
            tooltip: { trigger: 'item' },
            legend: { bottom: 0, textStyle: { fontSize: 11 } },
            series: [{
                type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
                avoidLabelOverlap: false, padAngle: 3, itemStyle: { borderRadius: 6 },
                label: { show: true, formatter: '{b}\n{c}个', fontSize: 11 },
                data: data, color: [COLORS.primary, COLORS.secondary, COLORS.warning, COLORS.danger]
            }]
        });
    }
}

function renderCityCompareChart() {
    const chart = getOrCreateChart('chart-city-compare');
    if (!chart) return;

    const bjUE = calculateUE(AppState.baselineModels.beijing);
    const shUE = calculateUE(AppState.baselineModels.shanghai);

    const indicators = [
        { name: '单套GTV(万)', max: 8 },
        { name: '总收入(万)', max: 3 },
        { name: '毛利率(%)', max: 35 },
        { name: '转化率(%)', max: 50 },
        { name: '7日去化(%)', max: 80 },
        { name: '月目标(百套)', max: 2 }
    ];

    chart.setOption({
        tooltip: {},
        legend: { data: ['北京', '上海'], bottom: 0, textStyle: { fontSize: 11 } },
        radar: {
            indicator: indicators,
            shape: 'polygon',
            splitNumber: 4,
            axisName: { fontSize: 10, color: '#666' }
        },
        series: [{
            type: 'radar',
            data: [
                {
                    name: '北京',
                    value: [bjUE.gtv/10000, bjUE.totalRevenue/10000, AppState.baselineModels.beijing.gross_margin, AppState.baselineModels.beijing.conversion_rate, AppState.baselineModels.beijing.seven_day_occupancy_rate, AppState.baselineModels.beijing.monthly_target_units/100],
                    lineStyle: { color: COLORS.primary },
                    areaStyle: { color: COLORS.primary, opacity: 0.15 },
                    itemStyle: { color: COLORS.primary }
                },
                {
                    name: '上海',
                    value: [shUE.gtv/10000, shUE.totalRevenue/10000, AppState.baselineModels.shanghai.gross_margin, AppState.baselineModels.shanghai.conversion_rate, AppState.baselineModels.shanghai.seven_day_occupancy_rate, AppState.baselineModels.shanghai.monthly_target_units/100],
                    lineStyle: { color: COLORS.secondary },
                    areaStyle: { color: COLORS.secondary, opacity: 0.15 },
                    itemStyle: { color: COLORS.secondary }
                }
            ]
        }]
    });
}

function renderCostStructureChart() {
    const chart = getOrCreateChart('chart-cost-structure');
    if (!chart) return;

    const model = AppState.baselineModels[AppState.currentCity];
    const ue = calculateUE(model);

    chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [{
            type: 'pie',
            radius: ['35%', '65%'],
            center: ['50%', '43%'],
            roseType: 'radius',
            itemStyle: { borderRadius: 6 },
            label: { fontSize: 10, formatter: '{b}\n{d}%' },
            data: [
                { name: '物料成本', value: Math.round(ue.materialCost), itemStyle: { color: COLORS.primary } },
                { name: '人工成本', value: Math.round(ue.laborCost), itemStyle: { color: COLORS.secondary } },
                { name: '管理费', value: Math.round(ue.managementFee), itemStyle: { color: COLORS.warning } },
                { name: '保险成本', value: ue.insuranceCost, itemStyle: { color: COLORS.purple } },
                { name: '智能设备', value: ue.smartDeviceCost, itemStyle: { color: COLORS.teal } },
                { name: '空置损失', value: Math.round(ue.vacancyLoss), itemStyle: { color: COLORS.danger } }
            ]
        }]
    });
}

// UE Waterfall Chart
function renderUEWaterfallChart(model) {
    const chart = getOrCreateChart('chart-ue-waterfall');
    if (!chart) return;

    const ue = calculateUE(model);

    const categories = ['服务费收入', '溢价收入', '总收入', '物料成本', '人工成本', '管理费', '其他成本', '毛利润'];
    const positive = [ue.serviceFee, ue.rentPremiumRevenue, '-', 0, 0, 0, 0, '-'];
    const negative = [0, 0, '-', ue.materialCost, ue.laborCost, ue.managementFee, ue.insuranceCost + ue.smartDeviceCost + ue.vacancyLoss, '-'];
    const total = ['-', '-', ue.totalRevenue, '-', '-', '-', '-', ue.grossProfit];
    const transparent = [0, ue.serviceFee, 0, ue.totalRevenue - ue.materialCost, ue.totalRevenue - ue.materialCost - ue.laborCost, ue.totalRevenue - ue.materialCost - ue.laborCost - ue.managementFee, ue.grossProfit + (ue.insuranceCost + ue.smartDeviceCost + ue.vacancyLoss), 0];

    chart.setOption({
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
                const name = params[0].name;
                let val = 0;
                params.forEach(p => { if (p.seriesName !== '辅助' && p.value !== '-') val += p.value; });
                return `${name}<br/>¥${formatNumber(Math.round(val))}`;
            }
        },
        grid: { left: 60, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + (v/1000) + 'k' } },
        series: [
            { name: '辅助', type: 'bar', stack: 'total', itemStyle: { borderColor: 'transparent', color: 'transparent' }, emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } }, data: transparent.map(v => Math.max(0, Math.round(v))) },
            { name: '收入', type: 'bar', stack: 'total', data: positive.map(v => v === '-' ? '-' : Math.round(v)), itemStyle: { color: '#2f9668', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 40 },
            { name: '成本', type: 'bar', stack: 'total', data: negative.map(v => v === '-' ? '-' : Math.round(v)), itemStyle: { color: '#ef4444', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 40 },
            { name: '合计', type: 'bar', stack: 'total', data: total.map(v => v === '-' ? '-' : Math.round(v)), itemStyle: { color: '#4b9fe1', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 40 }
        ]
    });
}

// Financial Preview Chart
function renderFinancialPreviewChart(projections) {
    const chart = getOrCreateChart('chart-financial-preview');
    if (!chart) return;

    const months = projections.map(p => `M${p.month}`);

    chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['收入', '成本', '毛利润', '签约套数'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 60, top: 30, bottom: 40 },
        xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10 } },
        yAxis: [
            { type: 'value', name: '万元', axisLabel: { fontSize: 10 } },
            { type: 'value', name: '套', axisLabel: { fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
            { name: '收入', type: 'bar', data: projections.map(p => p.revenue.toFixed(1)), color: COLORS.primary, barMaxWidth: 25 },
            { name: '成本', type: 'bar', data: projections.map(p => p.directCost.toFixed(1)), color: COLORS.danger, barMaxWidth: 25 },
            { name: '毛利润', type: 'line', data: projections.map(p => p.grossProfit.toFixed(1)), color: COLORS.secondary, smooth: true, lineStyle: { width: 2 } },
            { name: '签约套数', type: 'line', yAxisIndex: 1, data: projections.map(p => p.units), color: COLORS.purple, smooth: true, lineStyle: { width: 2, type: 'dashed' } }
        ]
    });
}

// Scenario Comparison Charts
function renderScenarioParamsChart(baseline, scenarios) {
    const chart = getOrCreateChart('chart-scenario-params');
    if (!chart) return;

    const paramKeys = ['gtv_per_unit', 'commission_rate', 'monthly_target_units', 'standardized_gtv_ratio', 'operating_profit'];
    const paramLabels = ['单套GTV', '提点率', '月目标单量', '标准化占比', '运营利润'];

    const series = [{
        name: '基准模型',
        type: 'bar',
        data: paramKeys.map(k => baseline[k]),
        color: COLORS.primary,
        barMaxWidth: 20
    }];

    scenarios.forEach((s, i) => {
        series.push({
            name: s.name,
            type: 'bar',
            data: paramKeys.map(k => s.models?.beike?.[k] || 0),
            color: COLORS.palette[(i + 1) % COLORS.palette.length],
            barMaxWidth: 20
        });
    });

    chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 60, right: 20, top: 20, bottom: 50 },
        xAxis: { type: 'category', data: paramLabels, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
        series
    });
}

function renderScenarioFinancialChart(baseline, scenarios) {
    const chart = getOrCreateChart('chart-scenario-financial');
    if (!chart) return;

    const metrics = ['年度收入(万)', '年度毛利(万)', '毛利率(%)', '年度签约(套)'];
    const baseProjection = generateFinancialProjection(baseline, AppState.scaleParams, 12);
    const baseAnnual = {
        revenue: baseProjection.reduce((s, p) => s + p.revenue, 0),
        grossProfit: baseProjection.reduce((s, p) => s + p.grossProfit, 0),
        grossMargin: baseline.gross_margin,
        units: baseProjection.reduce((s, p) => s + p.units, 0)
    };

    const series = [{
        name: '基准模型',
        type: 'bar',
        data: [baseAnnual.revenue.toFixed(0), baseAnnual.grossProfit.toFixed(0), baseAnnual.grossMargin, baseAnnual.units],
        color: COLORS.primary,
        barMaxWidth: 25
    }];

    scenarios.forEach((s, i) => {
        const model = s.models?.beike || s.model;
        const proj = generateFinancialProjection(model, AppState.scaleParams, 12);
        const annual = {
            revenue: proj.reduce((sum, p) => sum + p.revenue, 0),
            grossProfit: proj.reduce((sum, p) => sum + p.grossProfit, 0),
            grossMargin: model?.gross_margin || 0,
            units: proj.reduce((sum, p) => sum + p.units, 0)
        };
        series.push({
            name: s.name,
            type: 'bar',
            data: [annual.revenue.toFixed(0), annual.grossProfit.toFixed(0), annual.grossMargin, annual.units],
            color: COLORS.palette[(i + 1) % COLORS.palette.length],
            barMaxWidth: 25
        });
    });

    chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 60, right: 20, top: 20, bottom: 50 },
        xAxis: { type: 'category', data: metrics, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
        series
    });
}

// Revenue Trend Chart (Financial page)
function renderRevenueTrendChart(projections, label) {
    const chart = getOrCreateChart('chart-revenue-trend');
    if (!chart) return;

    const months = projections.map(p => `M${p.month}`);

    chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['总收入', '毛利润', '经营利润', '净利润'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 20, top: 30, bottom: 40 },
        xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', name: '万元', axisLabel: { fontSize: 10 } },
        series: [
            { name: '总收入', type: 'bar', data: projections.map(p => p.revenue.toFixed(1)), color: COLORS.primary, barMaxWidth: 25, stack: 'revenue' },
            { name: '毛利润', type: 'line', data: projections.map(p => p.grossProfit.toFixed(1)), color: COLORS.secondary, smooth: true, lineStyle: { width: 2 } },
            { name: '经营利润', type: 'line', data: projections.map(p => p.operatingProfit.toFixed(1)), color: COLORS.warning, smooth: true, lineStyle: { width: 2 } },
            { name: '净利润', type: 'line', data: projections.map(p => p.netProfit.toFixed(1)), color: COLORS.purple, smooth: true, lineStyle: { width: 2, type: 'dashed' } }
        ]
    });
}

function renderCostBreakdownChart(projections) {
    const chart = getOrCreateChart('chart-cost-breakdown');
    if (!chart) return;

    const totalPersonnel = projections.reduce((s, p) => s + p.personnelCost, 0);
    const totalOperating = projections.reduce((s, p) => s + p.operatingExpense, 0);
    const totalMarketing = projections.reduce((s, p) => s + p.marketingExpense, 0);
    const totalDirect = projections.reduce((s, p) => s + p.directCost, 0);

    chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}万 ({d}%)' },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [{
            type: 'pie',
            radius: ['35%', '65%'],
            center: ['50%', '43%'],
            padAngle: 2,
            itemStyle: { borderRadius: 6 },
            label: { fontSize: 10, formatter: '{b}\n{d}%' },
            data: [
                { name: '直接成本', value: totalDirect.toFixed(0), itemStyle: { color: COLORS.danger } },
                { name: '人员成本', value: totalPersonnel.toFixed(0), itemStyle: { color: COLORS.secondary } },
                { name: '运营费用', value: totalOperating.toFixed(0), itemStyle: { color: COLORS.warning } },
                { name: '营销费用', value: totalMarketing.toFixed(0), itemStyle: { color: COLORS.purple } }
            ]
        }]
    });
}

// Responsive resize
window.addEventListener('resize', () => {
    Object.values(chartInstances).forEach(chart => {
        if (chart && !chart.isDisposed()) chart.resize();
    });
});