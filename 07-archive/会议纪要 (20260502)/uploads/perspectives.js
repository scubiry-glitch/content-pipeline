// ===== perspectives.js — 三视角切换器 + 仪表盘/基准UE/财务渲染 =====
// v6.0: 贝壳UE(默认) · 业主UE · 供应商UE
// 每个视角有独立的 KPI、瀑布图、明细表、E杠杆

const PERSPECTIVES = {
    beike:    { label: '贝壳UE', icon: 'building', color: '#059669', desc: '平台运营视角 · P&L真实结构' },
    owner:    { label: '业主UE', icon: 'home', color: '#d97706', desc: '房东投资视角 · 回本与收益' },
    supplier: { label: '供应商UE', icon: 'hard-hat', color: '#7c3aed', desc: '施工成本视角 · 成本结构拆解' },
};

const PRODUCTS = {
    standard: { label: '标准化', icon: 'cubes', color: '#2563eb' },
    custom:   { label: '个性化', icon: 'paint-brush', color: '#e11d48' },
};

// ==================== 通用：视角/产品/城市切换器 HTML ====================

function renderPerspectiveSwitcher(containerId, opts = {}) {
    const { showProduct = true, showCity = true, onChange = '' } = opts;
    const p = AppState.currentPerspective;
    const prod = AppState.currentProduct;
    const city = AppState.currentCity;

    let html = `<div class="flex items-center gap-3 flex-wrap">`;

    // 视角切换
    html += `<div class="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">`;
    for (const [key, meta] of Object.entries(PERSPECTIVES)) {
        const active = key === p;
        html += `<button onclick="switchPerspective('${key}','${onChange}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}">
            <i class="fas fa-${meta.icon} mr-1" ${active ? `style="color:${meta.color}"` : ''}></i>${meta.label}
        </button>`;
    }
    html += `</div>`;

    // 产品线切换
    if (showProduct && p !== 'supplier') {
        html += `<div class="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">`;
        for (const [key, meta] of Object.entries(PRODUCTS)) {
            const active = key === prod;
            html += `<button onclick="switchProduct('${key}','${onChange}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}">
                <i class="fas fa-${meta.icon} mr-1" ${active ? `style="color:${meta.color}"` : ''}></i>${meta.label}
            </button>`;
        }
        html += `</div>`;
    }

    // 城市切换
    if (showCity && p !== 'supplier') {
        html += `<select class="input-field text-sm w-28" onchange="switchCity(this.value,'${onChange}')">
            <option value="beijing" ${city==='beijing'?'selected':''}>北京</option>
            <option value="shanghai" ${city==='shanghai'?'selected':''}>上海</option>
        </select>`;
    }

    // 当前视角标签
    const pm = PERSPECTIVES[p];
    html += `<span class="text-[10px] px-2 py-1 rounded-full font-medium" style="background:${pm.color}15;color:${pm.color}"><i class="fas fa-${pm.icon} mr-1"></i>${pm.desc}</span>`;

    html += `</div>`;
    return html;
}

function switchPerspective(key, callback) {
    AppState.currentPerspective = key;
    if (callback && typeof window[callback] === 'function') window[callback]();
}
function switchProduct(key, callback) {
    AppState.currentProduct = key;
    if (callback && typeof window[callback] === 'function') window[callback]();
}
function switchCity(val, callback) {
    AppState.currentCity = val;
    if (callback && typeof window[callback] === 'function') window[callback]();
}

// ==================== 仪表盘 ====================

function renderDashboard3V() {
    const container = document.getElementById('dashboard-3v-content');
    if (!container) return;

    const p = AppState.currentPerspective;
    let html = '';

    // 切换器
    html += `<div class="mb-5">${renderPerspectiveSwitcher('dashboard-switcher', { onChange: 'renderDashboard3V' })}</div>`;

    if (p === 'beike') html += renderDashboardBeike();
    else if (p === 'owner') html += renderDashboardOwner();
    else html += renderDashboardSupplier();

    container.innerHTML = html;

    // 渲染图表
    setTimeout(() => {
        if (p === 'beike') renderDashboardBeikeCharts();
        else if (p === 'owner') renderDashboardOwnerCharts();
        else renderDashboardSupplierCharts();
    }, 50);
}

function renderDashboardBeike() {
    const bj = calculateBeikeUE(DEFAULT_BEIKE_MODELS.beijing.standard);
    const bjC = calculateBeikeUE(DEFAULT_BEIKE_MODELS.beijing.custom);
    const sh = calculateBeikeUE(DEFAULT_BEIKE_MODELS.shanghai.standard);
    const bjScale = AppState.scaleParams.beijing;
    const shScale = AppState.scaleParams.shanghai;

    const bjMonthlyProfit = bj.operatingProfit * bjScale.standard.monthlyUnits + bjC.operatingProfit * bjScale.custom.monthlyUnits;
    const shMonthlyProfit = sh.operatingProfit * shScale.standard.monthlyUnits;
    const totalMonthlyUnits = bjScale.standard.monthlyUnits + bjScale.custom.monthlyUnits + shScale.standard.monthlyUnits;

    return `
    <div class="grid grid-cols-5 gap-4 mb-6">
        <div class="kpi-card">
            <div class="kpi-label">北京标准化·单均利润</div>
            <div class="kpi-value ${bj.operatingProfit >= 0 ? 'text-green-600' : 'text-red-500'}">¥${formatNumber(bj.operatingProfit)}</div>
            <div class="kpi-change ${bj.operatingProfit >= 0 ? 'up' : 'down'}">净收入利润率 ${bj.profitMargin.toFixed(0)}%</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">北京个性化·单均利润</div>
            <div class="kpi-value ${bjC.operatingProfit >= 0 ? 'text-green-600' : 'text-red-500'}">¥${formatNumber(bjC.operatingProfit)}</div>
            <div class="kpi-change down">⚠️ 亏损 · 费用占比${bjC.revRatios.expense.toFixed(0)}%</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">上海标准化·单均利润</div>
            <div class="kpi-value text-green-600">¥${formatNumber(sh.operatingProfit)}</div>
            <div class="kpi-change up">净收入利润率 ${sh.profitMargin.toFixed(0)}%</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">H2月均单量合计</div>
            <div class="kpi-value text-blue-600">${totalMonthlyUnits}<span class="text-sm font-normal text-gray-400"> 单/月</span></div>
            <div class="kpi-change neutral">北京${bjScale.standard.monthlyUnits + bjScale.custom.monthlyUnits} + 上海${shScale.standard.monthlyUnits}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">双城月利润预估</div>
            <div class="kpi-value ${bjMonthlyProfit + shMonthlyProfit >= 0 ? 'text-green-600' : 'text-red-500'}">¥${formatNumber(Math.round((bjMonthlyProfit + shMonthlyProfit) / 10000))}万</div>
            <div class="kpi-change ${bjMonthlyProfit >= 0 ? 'up' : 'down'}">北京¥${formatNumber(Math.round(bjMonthlyProfit/10000))}万 + 上海¥${formatNumber(Math.round(shMonthlyProfit/10000))}万</div>
        </div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-bar mr-2 text-green-600"></i>贝壳UE对比 — 城市×产品线</h3></div><div id="chart-beike-compare" style="height:380px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-pie mr-2 text-blue-500"></i>成本结构（净收入占比）</h3></div><div id="chart-beike-cost" style="height:380px;"></div></div>
    </div>
    <div class="grid grid-cols-3 gap-4">
        <div class="card col-span-2"><div class="card-header"><h3><i class="fas fa-chart-line mr-2 text-purple-500"></i>H2月度收入趋势</h3></div><div id="chart-beike-trend" style="height:320px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-users mr-2 text-amber-500"></i>人效对比</h3></div><div id="chart-beike-efficiency" style="height:320px;"></div></div>
    </div>`;
}

function renderDashboardBeikeCharts() {
    // UE对比柱状图
    const chart1 = getOrCreateChart('chart-beike-compare');
    if (chart1) {
        const models = [
            { name: '北京标准化', ue: calculateBeikeUE(DEFAULT_BEIKE_MODELS.beijing.standard) },
            { name: '北京个性化', ue: calculateBeikeUE(DEFAULT_BEIKE_MODELS.beijing.custom) },
            { name: '上海标准化', ue: calculateBeikeUE(DEFAULT_BEIKE_MODELS.shanghai.standard) },
        ];
        chart1.setOption({
            tooltip: { trigger: 'axis', formatter: p => p.map(s => `${s.seriesName}: ¥${formatNumber(s.value)}`).join('<br/>') },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 60, right: 20, top: 20, bottom: 40 },
            xAxis: { type: 'category', data: models.map(m => m.name), axisLabel: { fontSize: 11 } },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            series: [
                { name: '净收入', type: 'bar', data: models.map(m => m.ue.netRevenue), color: '#059669', barGap: '10%' },
                { name: '渠道成本', type: 'bar', data: models.map(m => -m.ue.channelCost), color: '#ef4444', stack: 'cost' },
                { name: '费用摊销', type: 'bar', data: models.map(m => -m.ue.expenseTotal), color: '#f59e0b', stack: 'cost' },
                { name: '运营利润', type: 'bar', data: models.map(m => m.ue.operatingProfit), color: models.map(m => m.ue.operatingProfit >= 0 ? '#22c55e' : '#ef4444') },
            ]
        });
    }

    // 成本结构饼图
    const chart2 = getOrCreateChart('chart-beike-cost');
    if (chart2) {
        const city = AppState.currentCity;
        const prod = AppState.currentProduct;
        const m = DEFAULT_BEIKE_MODELS[city]?.[prod] || DEFAULT_BEIKE_MODELS.beijing.standard;
        const ue = calculateBeikeUE(m);
        chart2.setOption({
            tooltip: { formatter: p => `${p.name}: ¥${formatNumber(p.value)} (${p.percent}%)` },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            series: [{
                type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
                label: { fontSize: 10, formatter: '{b}\n¥{c}' },
                data: [
                    { name: '经纪人', value: ue.channelDetail.broker, itemStyle: { color: '#ef4444' } },
                    { name: '资管提佣', value: ue.channelDetail.manager, itemStyle: { color: '#f97316' } },
                    { name: '总监', value: ue.channelDetail.director, itemStyle: { color: '#f59e0b' } },
                    { name: '业务激励', value: ue.channelDetail.incentive, itemStyle: { color: '#eab308' } },
                    { name: '城市人工', value: ue.expenseDetail.cityHR, itemStyle: { color: '#8b5cf6' } },
                    { name: '平台人工', value: ue.expenseDetail.platformHR, itemStyle: { color: '#a78bfa' } },
                    { name: '品牌营销', value: ue.expenseDetail.brand, itemStyle: { color: '#6366f1' } },
                    { name: '系统建设', value: ue.expenseDetail.system, itemStyle: { color: '#818cf8' } },
                    { name: '其他运营', value: ue.expenseDetail.other, itemStyle: { color: '#c4b5fd' } },
                ].filter(d => d.value > 0)
            }]
        });
    }

    // 月度趋势
    const chart3 = getOrCreateChart('chart-beike-trend');
    if (chart3) {
        const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const bjStd = MONTHLY_TARGETS.beijing.standard.revenue;
        const bjCust = MONTHLY_TARGETS.beijing.custom.revenue;
        const shStd = MONTHLY_TARGETS.shanghai.standard.revenue;
        chart3.setOption({
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 60, right: 20, top: 20, bottom: 40 },
            xAxis: { type: 'category', data: months },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => (v/10000).toFixed(0) + '万' } },
            series: [
                { name: '北京标准化', type: 'line', data: bjStd, color: '#2563eb', smooth: true },
                { name: '北京个性化', type: 'line', data: bjCust, color: '#e11d48', smooth: true, lineStyle: { type: 'dashed' } },
                { name: '上海标准化', type: 'line', data: shStd, color: '#059669', smooth: true },
            ]
        });
    }

    // 人效
    const chart4 = getOrCreateChart('chart-beike-efficiency');
    if (chart4) {
        const bjTeam = TEAM_STRUCTURE.beijing;
        const shTeam = TEAM_STRUCTURE.shanghai;
        chart4.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 80, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
            yAxis: { type: 'category', data: ['北京区域运营', '上海区域运营', '北京团队', '上海团队'], axisLabel: { fontSize: 10 } },
            series: [{
                type: 'bar', color: ['#2563eb', '#059669', '#6366f1', '#8b5cf6'],
                data: [
                    { value: bjTeam.h2_monthly_efficiency.regional_ops, itemStyle: { color: '#2563eb' } },
                    { value: shTeam.h2_monthly_efficiency.regional_ops, itemStyle: { color: '#059669' } },
                    { value: (bjTeam.h2_monthly_efficiency.regional_ops * 9 / bjTeam.h2_headcount).toFixed(1), itemStyle: { color: '#6366f1' } },
                    { value: (shTeam.h2_monthly_efficiency.regional_ops * 10 / shTeam.h2_headcount).toFixed(1), itemStyle: { color: '#8b5cf6' } },
                ],
                label: { show: true, position: 'right', fontSize: 10, formatter: '{c} 单/人/月' },
            }]
        });
    }
}

function renderDashboardOwner() {
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const m = DEFAULT_OWNER_MODELS[city]?.[prod] || DEFAULT_OWNER_MODELS.beijing.standard;
    const ue = calculateOwnerUE(m);
    const cityLabel = city === 'beijing' ? '北京' : '上海';
    const prodLabel = prod === 'standard' ? '标准化' : '个性化';

    return `
    <div class="grid grid-cols-5 gap-4 mb-6">
        <div class="kpi-card"><div class="kpi-label">装修总款(GTV)</div><div class="kpi-value text-red-500">¥${formatNumber(m.renovation_total)}</div><div class="kpi-change neutral">${cityLabel}${prodLabel}</div></div>
        <div class="kpi-card"><div class="kpi-label">装修后全月租金</div><div class="kpi-value text-blue-600">¥${formatNumber(m.avg_rent_after)}<span class="text-sm font-normal text-gray-400">/月</span></div><div class="kpi-change up">装修前 ¥${formatNumber(m.avg_rent_before)}</div></div>
        <div class="kpi-card"><div class="kpi-label">装修/租金倍数 ⭐</div><div class="kpi-value ${ue.renovationToRentRatio > 15 ? 'text-red-500' : 'text-amber-500'}">${ue.renovationToRentRatio.toFixed(1)}<span class="text-sm font-normal text-gray-400"> 月租金</span></div><div class="kpi-change ${ue.renovationToRentRatio > 15 ? 'down' : 'neutral'}">= GTV÷全月租金</div></div>
        <div class="kpi-card"><div class="kpi-label">辅助：月溢价</div><div class="kpi-value text-green-600">+¥${formatNumber(m.rent_premium)}/月</div><div class="kpi-change up">溢价率 ${m.rent_premium_rate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">辅助：溢价回本</div><div class="kpi-value ${m.payback_months > 48 ? 'text-red-500' : 'text-amber-500'}">${m.payback_months}<span class="text-sm font-normal text-gray-400"> 月</span></div><div class="kpi-change ${m.payback_months > 48 ? 'down' : 'neutral'}">≈${(m.payback_months/12).toFixed(1)}年</div></div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card"><div class="card-header"><h3><i class="fas fa-balance-scale mr-2 text-amber-500"></i>业主投资回报拆解</h3></div><div id="chart-owner-waterfall" style="height:380px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-bar mr-2 text-green-600"></i>装修/租金倍数 — 城市×产品对比</h3></div><div id="chart-owner-compare" style="height:380px;"></div></div>
    </div>
    <div class="card"><div class="card-header"><h3><i class="fas fa-clock mr-2 text-blue-500"></i>回本曲线（累计净现金流）</h3><span class="text-[10px] text-gray-400">辅助视角：按溢价回本</span></div><div id="chart-owner-payback" style="height:300px;"></div></div>`;
}

function renderDashboardOwnerCharts() {
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const m = DEFAULT_OWNER_MODELS[city]?.[prod] || DEFAULT_OWNER_MODELS.beijing.standard;

    // 瀑布图
    const chart1 = getOrCreateChart('chart-owner-waterfall');
    if (chart1) {
        chart1.setOption({
            tooltip: {},
            grid: { left: 80, right: 20, top: 20, bottom: 40 },
            xAxis: { type: 'category', data: ['装修总款', '贝壳荐客费', '供应商执行', '空置损失', '首年溢价收入', '空置减少价值', '首年净回报'], axisLabel: { fontSize: 9, rotate: 20 } },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            series: [{
                type: 'bar', color: '#d97706',
                data: [
                    { value: -m.renovation_total, itemStyle: { color: '#ef4444' } },
                    { value: -m.beike_service_fee, itemStyle: { color: '#f97316' } },
                    { value: -m.supplier_cost, itemStyle: { color: '#f59e0b' } },
                    { value: -m.vacancy_cost, itemStyle: { color: '#eab308' } },
                    { value: m.total_premium_income, itemStyle: { color: '#22c55e' } },
                    { value: m.vacancy_reduction_value, itemStyle: { color: '#86efac' } },
                    { value: m.first_year_return - m.renovation_total - m.vacancy_cost, itemStyle: { color: m.first_year_return - m.renovation_total - m.vacancy_cost >= 0 ? '#059669' : '#dc2626' } },
                ],
                label: { show: true, position: 'top', fontSize: 9, formatter: p => '¥' + formatNumber(p.value) },
            }]
        });
    }

    // 4模型对比 — 装修/租金倍数为主
    const chart2 = getOrCreateChart('chart-owner-compare');
    if (chart2) {
        const allModels = [
            { name: '北京标', m: DEFAULT_OWNER_MODELS.beijing.standard },
            { name: '北京个', m: DEFAULT_OWNER_MODELS.beijing.custom },
            { name: '上海标', m: DEFAULT_OWNER_MODELS.shanghai.standard },
            { name: '上海个', m: DEFAULT_OWNER_MODELS.shanghai.custom },
        ];
        chart2.setOption({
            tooltip: {
                trigger: 'axis',
                formatter: ps => {
                    const idx = ps[0].dataIndex;
                    const am = allModels[idx];
                    const ue = calculateOwnerUE(am.m);
                    return `<b>${am.name}</b><br/>装修/租金倍数: <b>${ue.renovationToRentRatio.toFixed(1)}x</b><br/>辅助：回本 ${am.m.payback_months}月 · 年化 ${am.m.annual_yield}%`;
                }
            },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 60, right: 40, top: 30, bottom: 40 },
            xAxis: { type: 'category', data: allModels.map(x => x.name), axisLabel: { fontSize: 11 } },
            yAxis: [
                { type: 'value', name: '装修/租金倍数', axisLabel: { fontSize: 10, formatter: v => v + 'x' }, min: 0 },
                { type: 'value', name: '辅助：回本月数', axisLabel: { fontSize: 10 }, splitLine: { show: false } },
            ],
            series: [
                {
                    name: '装修/租金倍数', type: 'bar', barWidth: 30,
                    data: allModels.map(x => {
                        const ue = calculateOwnerUE(x.m);
                        const r = ue.renovationToRentRatio;
                        return { value: parseFloat(r.toFixed(1)), itemStyle: { color: r > 15 ? '#ef4444' : r > 12 ? '#f59e0b' : '#22c55e' } };
                    }),
                    label: { show: true, position: 'top', fontSize: 10, fontWeight: 'bold', formatter: p => p.value + 'x' },
                    markLine: { silent: true, data: [{ yAxis: 12, lineStyle: { color: '#22c55e', type: 'dashed', width: 2 }, label: { formatter: '合理线 12x', fontSize: 9 } }] }
                },
                {
                    name: '辅助：回本月数', type: 'line', yAxisIndex: 1,
                    data: allModels.map(x => x.m.payback_months),
                    color: '#8b5cf6', symbol: 'diamond', symbolSize: 8, lineStyle: { type: 'dashed', width: 2 },
                },
            ]
        });
    }

    // 回本曲线
    const chart3 = getOrCreateChart('chart-owner-payback');
    if (chart3) {
        const months = [];
        const cashflow = [];
        let cumulative = -m.renovation_total - m.vacancy_cost;
        for (let i = 0; i <= 72; i++) {
            months.push(i + '月');
            cashflow.push(Math.round(cumulative));
            cumulative += m.rent_premium;
        }
        chart3.setOption({
            tooltip: { trigger: 'axis', formatter: p => `${p[0].name}: ¥${formatNumber(p[0].value)}` },
            grid: { left: 70, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'category', data: months, axisLabel: { fontSize: 9, interval: 5 } },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            visualMap: { show: false, pieces: [{ lte: 0, color: '#ef4444' }, { gt: 0, color: '#22c55e' }] },
            series: [{
                type: 'line', data: cashflow, smooth: true, areaStyle: { opacity: 0.15 },
                markLine: { data: [{ yAxis: 0, lineStyle: { color: '#999', type: 'dashed' } }], label: { formatter: '回本线' } },
            }]
        });
    }
}

function renderDashboardSupplier() {
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    return `
    <div class="grid grid-cols-5 gap-4 mb-6">
        <div class="kpi-card"><div class="kpi-label">每单总支出</div><div class="kpi-value text-purple-600">¥${formatNumber(m.total_cost)}</div><div class="kpi-change neutral">占GTV ${m.gtv_ratio}%</div></div>
        <div class="kpi-card"><div class="kpi-label">贝壳荐客费</div><div class="kpi-value text-green-600">¥${formatNumber(m.beike_fee)}</div><div class="kpi-change neutral">占比 ${m.beike_fee_pct}%</div></div>
        <div class="kpi-card"><div class="kpi-label">工长（最大项）</div><div class="kpi-value text-red-500">¥${formatNumber(m.foreman)}</div><div class="kpi-change down">占比 ${m.foreman_pct}% · 优化空间大</div></div>
        <div class="kpi-card"><div class="kpi-label">系统费用</div><div class="kpi-value text-amber-500">¥${formatNumber(m.system_fee || 0)}</div><div class="kpi-change neutral">占比 ${m.system_fee_pct || 0}%</div></div>
        <div class="kpi-card"><div class="kpi-label">主材合计(家具+家电+软装)</div><div class="kpi-value text-blue-500">¥${formatNumber(m.furniture + m.appliances + m.soft_furnishing)}</div><div class="kpi-change neutral">${(m.furniture_pct + m.appliances_pct + m.soft_furnishing_pct).toFixed(1)}%</div></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-pie mr-2 text-purple-500"></i>供应商成本结构</h3></div><div id="chart-supplier-pie" style="height:420px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-sort-amount-down mr-2 text-red-500"></i>成本排名（降序）</h3></div><div id="chart-supplier-bar" style="height:420px;"></div></div>
    </div>`;
}

function renderDashboardSupplierCharts() {
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    const ue = calculateSupplierUE(m);

    const chart1 = getOrCreateChart('chart-supplier-pie');
    if (chart1) {
        const colorMap = { '平台': '#059669', '资金': '#f59e0b', '施工': '#ef4444', '主材': '#3b82f6', '其他': '#8b5cf6' };
        chart1.setOption({
            tooltip: { formatter: p => `${p.name}: ¥${formatNumber(p.value)} (${p.percent}%)` },
            legend: { bottom: 0, textStyle: { fontSize: 10 }, type: 'scroll' },
            series: [{
                type: 'pie', radius: ['30%', '60%'], center: ['50%', '42%'],
                label: { fontSize: 9, formatter: '{b}\n¥{c}' },
                data: ue.lineItems.filter(i => i.value > 0).map(i => ({
                    name: i.name, value: i.value, itemStyle: { color: colorMap[i.category] || '#999' }
                }))
            }]
        });
    }

    const chart2 = getOrCreateChart('chart-supplier-bar');
    if (chart2) {
        const sorted = ue.lineItems.filter(i => Math.abs(i.value) > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        chart2.setOption({
            tooltip: { formatter: p => `${p.name}: ¥${formatNumber(p.value)} (${p.data.pct}%)` },
            grid: { left: 80, right: 40, top: 10, bottom: 10 },
            xAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            yAxis: { type: 'category', data: sorted.map(i => i.name).reverse(), axisLabel: { fontSize: 10 } },
            series: [{
                type: 'bar',
                data: sorted.map(i => ({
                    value: i.value, pct: i.pct,
                    itemStyle: { color: i.value < 0 ? '#22c55e' : i.pct > 10 ? '#ef4444' : i.pct > 5 ? '#f59e0b' : '#6366f1' }
                })).reverse(),
                label: { show: true, position: 'right', fontSize: 9, formatter: p => p.data.pct + '%' },
            }]
        });
    }
}

// ==================== 基准UE页面 ====================

function renderBaseline3V() {
    const container = document.getElementById('baseline-3v-content');
    if (!container) return;

    const p = AppState.currentPerspective;
    let html = `<div class="mb-5 flex items-center justify-between">
        <div>${renderPerspectiveSwitcher('baseline-switcher', { onChange: 'renderBaseline3V' })}</div>
    </div>`;

    if (p === 'beike') html += renderBaselineBeike();
    else if (p === 'owner') html += renderBaselineOwner();
    else html += renderBaselineSupplier();

    container.innerHTML = html;

    setTimeout(() => {
        if (p === 'beike') renderBaselineBeikeChart();
        else if (p === 'owner') renderBaselineOwnerChart();
        else renderBaselineSupplierChart();
    }, 50);
}

function renderBaselineBeike() {
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const m = AppState.baselineModels.beike?.[city]?.[prod] || DEFAULT_BEIKE_MODELS.beijing.standard;
    const ue = calculateBeikeUE(m);
    const label = `${m.city} · ${m.product}`;

    // KPI卡片
    let html = `
    <div class="grid grid-cols-4 gap-3 mb-5">
        <div class="metric-card bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <div class="text-xs text-gray-500 font-medium">单套GTV</div>
            <div class="text-2xl font-bold text-gray-800">¥${formatNumber(ue.gtv)}</div>
        </div>
        <div class="metric-card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div class="text-xs text-green-600 font-medium">净收入 (GTV×${m.commission_rate}%)</div>
            <div class="text-2xl font-bold text-green-700">¥${formatNumber(ue.netRevenue)}</div>
        </div>
        <div class="metric-card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <div class="text-xs text-red-600 font-medium">总成本</div>
            <div class="text-2xl font-bold text-red-700">¥${formatNumber(ue.channelCost + ue.expenseTotal)}</div>
        </div>
        <div class="metric-card bg-gradient-to-br ${ue.operatingProfit >= 0 ? 'from-emerald-50 to-emerald-100 border-emerald-200' : 'from-red-50 to-red-100 border-red-200'}">
            <div class="text-xs ${ue.operatingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} font-medium">运营利润</div>
            <div class="text-2xl font-bold ${ue.operatingProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}">¥${formatNumber(ue.operatingProfit)}</div>
        </div>
    </div>`;

    // 瀑布图 + 明细表
    html += `
    <div class="grid grid-cols-12 gap-4">
        <div class="col-span-7">
            <div class="card mb-4"><div class="card-header"><h3><i class="fas fa-water mr-2 text-green-600"></i>贝壳UE瀑布图 — ${label}</h3></div><div id="chart-baseline-waterfall" style="height:360px;"></div></div>
        </div>
        <div class="col-span-5">
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-table mr-2 text-purple-500"></i>UE明细表</h3>
                    <div class="flex gap-1">
                        <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded">GTV比率</span>
                        <span class="text-[10px] bg-green-50 px-2 py-0.5 rounded">净收比率</span>
                    </div>
                </div>
                <div class="overflow-auto max-h-[420px]"><table class="w-full text-sm">
                    <thead class="bg-gray-50 sticky top-0"><tr>
                        <th class="text-left px-3 py-2 text-gray-500 font-medium text-xs">科目</th>
                        <th class="text-right px-3 py-2 text-gray-500 font-medium text-xs">金额</th>
                        <th class="text-right px-3 py-2 text-gray-500 font-medium text-xs">GTV比率</th>
                        <th class="text-right px-3 py-2 text-gray-500 font-medium text-xs">净收比率</th>
                    </tr></thead><tbody>`;

    ue.lineItems.forEach(item => {
        const isTotal = item.isTotal || item.isSubtotal;
        const cls = isTotal ? 'font-bold bg-gray-50' : item.name.startsWith('├') ? 'text-gray-500 text-xs' : '';
        const gtvR = item.value !== 0 && ue.gtv > 0 ? (Math.abs(item.value) / ue.gtv * 100).toFixed(1) + '%' : '';
        const revR = item.value !== 0 && ue.netRevenue > 0 ? (Math.abs(item.value) / ue.netRevenue * 100).toFixed(1) + '%' : '';
        html += `<tr class="${cls} border-b border-gray-50 hover:bg-gray-50">
            <td class="px-3 py-1.5">${item.name}</td>
            <td class="px-3 py-1.5 text-right font-mono ${item.value >= 0 ? 'text-green-600' : 'text-red-500'}">${item.value >= 0 ? '' : ''}¥${formatNumber(Math.abs(item.value))}</td>
            <td class="px-3 py-1.5 text-right text-gray-400 text-xs">${gtvR}</td>
            <td class="px-3 py-1.5 text-right text-green-500 text-xs">${revR}</td>
        </tr>`;
    });

    html += `</tbody></table></div></div></div></div>`;
    return html;
}

function renderBaselineBeikeChart() {
    const chart = getOrCreateChart('chart-baseline-waterfall');
    if (!chart) return;
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const m = AppState.baselineModels.beike?.[city]?.[prod] || DEFAULT_BEIKE_MODELS.beijing.standard;
    const ue = calculateBeikeUE(m);

    // 隐藏GTV柱子，从净收入开始
    const categories = ['净收入', '经纪人', '资管提佣', '总监', '激励', '城市人工', '平台人工', '品牌', '系统', '其他', '运营利润'];
    const values = [ue.netRevenue, -ue.channelDetail.broker, -ue.channelDetail.manager, -ue.channelDetail.director, -ue.channelDetail.incentive, -ue.expenseDetail.cityHR, -ue.expenseDetail.platformHR, -ue.expenseDetail.brand, -ue.expenseDetail.system, -ue.expenseDetail.other, ue.operatingProfit];

    // 构建瀑布数据
    let cumulative = 0;
    const baseData = [], posData = [], negData = [];
    values.forEach((v, i) => {
        if (i === 0) { baseData.push(0); posData.push(v); negData.push(0); cumulative = v; }
        else if (i === categories.length - 1) { baseData.push(0); if (v >= 0) { posData.push(v); negData.push(0); } else { posData.push(0); negData.push(-v); } }
        else { cumulative += v; if (v >= 0) { baseData.push(cumulative - v); posData.push(v); negData.push(0); } else { baseData.push(cumulative); posData.push(0); negData.push(-v); } }
    });

    chart.setOption({
        tooltip: { trigger: 'axis', formatter: p => { const idx = p[0].dataIndex; return `${categories[idx]}: ¥${formatNumber(values[idx])}`; } },
        grid: { left: 60, right: 20, top: 20, bottom: 50 },
        xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 9, rotate: 25 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
        series: [
            { name: 'base', type: 'bar', stack: 'wf', data: baseData, itemStyle: { color: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } } },
            { name: '正向', type: 'bar', stack: 'wf', data: posData.map((v,i) => ({ value: v, itemStyle: { color: i === 0 ? '#059669' : i === categories.length-1 ? (values[i] >= 0 ? '#22c55e' : '#ef4444') : '#86efac' } })), label: { show: true, position: 'top', fontSize: 8, formatter: p => p.value > 0 ? '¥' + formatNumber(p.value) : '' } },
            { name: '负向', type: 'bar', stack: 'wf', data: negData.map(v => ({ value: v, itemStyle: { color: '#ef4444' } })), label: { show: true, position: 'bottom', fontSize: 8, formatter: p => p.value > 0 ? '-¥' + formatNumber(p.value) : '' } },
        ]
    });
}

function renderBaselineOwner() {
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const m = DEFAULT_OWNER_MODELS[city]?.[prod] || DEFAULT_OWNER_MODELS.beijing.standard;
    const ue = calculateOwnerUE(m);
    const ratio = ue.renovationToRentRatio;
    const ratingColor = ratio > 15 ? 'red' : ratio > 12 ? 'amber' : 'green';
    const ratingText = ratio > 15 ? '⚠️ 偏高' : ratio > 12 ? '中等' : '✅ 合理';

    let html = `
    <div class="grid grid-cols-5 gap-3 mb-5">
        <div class="metric-card bg-gradient-to-br from-${ratingColor}-50 to-${ratingColor}-100 border-${ratingColor}-200">
            <div class="text-xs text-${ratingColor}-600 font-semibold">⭐ 装修/租金倍数（核心）</div>
            <div class="text-2xl font-bold text-${ratingColor}-700">${ratio.toFixed(1)}<span class="text-sm font-normal text-gray-400"> 月租金</span></div>
            <div class="text-[10px] text-${ratingColor}-500">${ratingText} · GTV¥${formatNumber(m.renovation_total)} ÷ 月租¥${formatNumber(m.avg_rent_after)}</div>
        </div>
        <div class="metric-card bg-gradient-to-br from-red-50 to-red-100 border-red-200"><div class="text-xs text-red-600">装修总款(GTV)</div><div class="text-2xl font-bold text-red-700">¥${formatNumber(m.renovation_total)}</div></div>
        <div class="metric-card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"><div class="text-xs text-blue-600">装修后全月租金</div><div class="text-2xl font-bold text-blue-700">¥${formatNumber(m.avg_rent_after)}<span class="text-sm font-normal text-gray-400">/月</span></div></div>
        <div class="metric-card bg-gradient-to-br from-green-50 to-green-100 border-green-200"><div class="text-xs text-green-600">辅助：月溢价</div><div class="text-2xl font-bold text-green-700">+¥${formatNumber(m.rent_premium)}/月</div><div class="text-[10px] text-gray-400">溢价率 ${m.rent_premium_rate}%</div></div>
        <div class="metric-card bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200"><div class="text-xs text-amber-600">辅助：溢价回本</div><div class="text-2xl font-bold text-amber-700">${m.payback_months}<span class="text-sm font-normal text-gray-400">月</span></div><div class="text-[10px] text-gray-400">年化 ${m.annual_yield}%</div></div>
    </div>
    <div class="grid grid-cols-12 gap-4">
        <div class="col-span-7"><div class="card"><div class="card-header"><h3><i class="fas fa-balance-scale mr-2 text-amber-500"></i>装修/租金倍数对比</h3><span class="text-[10px] text-gray-400">核心 · 倍数越低性价比越高</span></div><div id="chart-baseline-waterfall" style="height:360px;"></div></div></div>
        <div class="col-span-5"><div class="card">
            <div class="card-header"><h3><i class="fas fa-table mr-2 text-amber-500"></i>业主UE明细</h3></div>
            <div class="p-4 space-y-2">`;

    ue.lineItems.forEach(item => {
        const isTotal = item.isTotal;
        html += `<div class="flex items-center justify-between py-1.5 ${isTotal ? 'border-t-2 border-gray-200 pt-3 font-bold' : item.name.startsWith('├') ? 'pl-4 text-sm text-gray-500' : ''}">
            <span>${item.name}</span>
            <span class="font-mono font-semibold ${item.value >= 0 ? 'text-green-600' : 'text-red-500'}">¥${formatNumber(item.value)}</span>
        </div>`;
    });

    html += `</div></div></div></div>`;
    return html;
}

function renderBaselineOwnerChart() {
    const chart = getOrCreateChart('chart-baseline-waterfall');
    if (!chart) return;

    // 核心图：装修/租金倍数 across all 4 models
    const allModels = [
        { name: '北京标准化', m: DEFAULT_OWNER_MODELS.beijing.standard },
        { name: '北京个性化', m: DEFAULT_OWNER_MODELS.beijing.custom },
        { name: '上海标准化', m: DEFAULT_OWNER_MODELS.shanghai.standard },
        { name: '上海个性化', m: DEFAULT_OWNER_MODELS.shanghai.custom },
    ];
    const currentCity = AppState.currentCity;
    const currentProd = AppState.currentProduct;

    chart.setOption({
        tooltip: {
            trigger: 'axis',
            formatter: ps => {
                const idx = ps[0].dataIndex;
                const am = allModels[idx];
                const ue = calculateOwnerUE(am.m);
                return `<b>${am.name}</b><br/>`
                    + `装修/租金倍数: <b>${ue.renovationToRentRatio.toFixed(1)}</b> 月租金<br/>`
                    + `GTV: ¥${formatNumber(am.m.renovation_total)}<br/>`
                    + `全月租金: ¥${formatNumber(am.m.avg_rent_after)}/月<br/>`
                    + `<span style="color:#999">辅助：溢价回本 ${am.m.payback_months}月</span>`;
            }
        },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 60, right: 40, top: 30, bottom: 40 },
        xAxis: { type: 'category', data: allModels.map(x => x.name), axisLabel: { fontSize: 11 } },
        yAxis: [
            { type: 'value', name: '装修/租金倍数', axisLabel: { fontSize: 10, formatter: v => v.toFixed(0) + 'x' }, splitLine: { lineStyle: { type: 'dashed' } }, min: 0 },
            { type: 'value', name: '辅助：回本月数', axisLabel: { fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
            {
                name: '装修/租金倍数', type: 'bar', barWidth: 36,
                data: allModels.map(x => {
                    const ue = calculateOwnerUE(x.m);
                    const isActive = (x.m.city === (currentCity === 'beijing' ? '北京' : '上海'))
                        && x.m.product === (currentProd === 'standard' ? '标准化' : '个性化');
                    return {
                        value: parseFloat(ue.renovationToRentRatio.toFixed(1)),
                        itemStyle: {
                            color: ue.renovationToRentRatio > 15 ? '#ef4444' : ue.renovationToRentRatio > 12 ? '#f59e0b' : '#22c55e',
                            borderWidth: isActive ? 3 : 0, borderColor: '#1f2937'
                        }
                    };
                }),
                label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold', formatter: p => p.value + 'x' },
                markLine: { silent: true, data: [{ yAxis: 12, lineStyle: { color: '#22c55e', type: 'dashed', width: 2 }, label: { formatter: '合理线 12x', fontSize: 10 } }] }
            },
            {
                name: '辅助：回本月数', type: 'line', yAxisIndex: 1,
                data: allModels.map(x => x.m.payback_months),
                color: '#8b5cf6', symbol: 'diamond', symbolSize: 10,
                lineStyle: { type: 'dashed', width: 2 },
                label: { show: true, position: 'top', fontSize: 9, formatter: p => p.value + '月', color: '#8b5cf6' },
            }
        ]
    });
}

function renderBaselineSupplier() {
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    const ue = calculateSupplierUE(m);

    let html = `
    <div class="grid grid-cols-4 gap-3 mb-5">
        <div class="metric-card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200"><div class="text-xs text-purple-600">每单总成本</div><div class="text-2xl font-bold text-purple-700">¥${formatNumber(m.total_cost)}</div></div>
        <div class="metric-card bg-gradient-to-br from-green-50 to-green-100 border-green-200"><div class="text-xs text-green-600">贝壳荐客费</div><div class="text-2xl font-bold text-green-700">¥${formatNumber(m.beike_fee)}</div></div>
        <div class="metric-card bg-gradient-to-br from-red-50 to-red-100 border-red-200"><div class="text-xs text-red-600">工长(最大项)</div><div class="text-2xl font-bold text-red-700">¥${formatNumber(m.foreman)}</div></div>
        <div class="metric-card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"><div class="text-xs text-blue-600">主材合计</div><div class="text-2xl font-bold text-blue-700">¥${formatNumber(m.furniture+m.appliances+m.soft_furnishing)}</div></div>
    </div>
    <div class="grid grid-cols-12 gap-4">
        <div class="col-span-7"><div class="card"><div class="card-header"><h3><i class="fas fa-chart-bar mr-2 text-purple-500"></i>供应商成本瀑布</h3></div><div id="chart-baseline-waterfall" style="height:400px;"></div></div></div>
        <div class="col-span-5"><div class="card">
            <div class="card-header"><h3><i class="fas fa-table mr-2 text-purple-500"></i>供应商成本明细</h3></div>
            <div class="overflow-auto max-h-[420px]"><table class="w-full text-sm">
                <thead class="bg-gray-50 sticky top-0"><tr>
                    <th class="text-left px-3 py-2 text-gray-500 font-medium text-xs">项目</th>
                    <th class="text-right px-3 py-2 text-gray-500 font-medium text-xs">金额</th>
                    <th class="text-right px-3 py-2 text-gray-500 font-medium text-xs">占比</th>
                    <th class="text-left px-3 py-2 text-gray-500 font-medium text-xs">类别</th>
                </tr></thead><tbody>`;

    ue.lineItems.sort((a,b) => Math.abs(b.value) - Math.abs(a.value)).forEach(item => {
        const catColor = { '平台':'green', '施工':'red', '主材':'blue', '资金':'amber', '其他':'purple' }[item.category] || 'gray';
        html += `<tr class="border-b border-gray-50 hover:bg-gray-50">
            <td class="px-3 py-1.5 font-medium">${item.name}</td>
            <td class="px-3 py-1.5 text-right font-mono ${item.value >= 0 ? '' : 'text-green-600'}">¥${formatNumber(item.value)}</td>
            <td class="px-3 py-1.5 text-right font-mono text-gray-500">${item.pct}%</td>
            <td class="px-3 py-1.5"><span class="text-[10px] px-2 py-0.5 rounded-full bg-${catColor}-50 text-${catColor}-600">${item.category}</span></td>
        </tr>`;
    });

    html += `</tbody></table></div></div></div></div>`;
    return html;
}

function renderBaselineSupplierChart() {
    const chart = getOrCreateChart('chart-baseline-waterfall');
    if (!chart) return;
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    const ue = calculateSupplierUE(m);
    const sorted = ue.lineItems.filter(i => Math.abs(i.value) > 0).sort((a,b) => b.value - a.value);
    const colorMap = { '平台':'#059669', '施工':'#ef4444', '主材':'#3b82f6', '资金':'#f59e0b', '其他':'#8b5cf6' };

    chart.setOption({
        tooltip: { formatter: p => `${p.name}: ¥${formatNumber(p.value)} (${sorted[p.dataIndex]?.pct || 0}%)` },
        grid: { left: 80, right: 40, top: 10, bottom: 10 },
        xAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
        yAxis: { type: 'category', data: sorted.map(i => i.name).reverse(), axisLabel: { fontSize: 10 } },
        series: [{
            type: 'bar',
            data: sorted.map(i => ({ value: i.value, itemStyle: { color: colorMap[i.category] || '#999' } })).reverse(),
            label: { show: true, position: 'right', fontSize: 9, formatter: p => '¥' + formatNumber(p.value) },
        }]
    });
}

// ==================== 财务报表页面（三视角） ====================

function renderFinancial3V() {
    const container = document.getElementById('financial-3v-content');
    if (!container) return;

    const p = AppState.currentPerspective;
    let html = `<div class="mb-5 flex items-center justify-between">
        <div>${renderPerspectiveSwitcher('financial-switcher', { onChange: 'renderFinancial3V' })}</div>
    </div>`;

    if (p === 'beike') html += renderFinancialBeike();
    else if (p === 'owner') html += renderFinancialOwner();
    else html += renderFinancialSupplier();

    container.innerHTML = html;

    setTimeout(() => {
        if (p === 'beike') renderFinancialBeikeCharts();
        else if (p === 'owner') renderFinancialOwnerCharts();
        else renderFinancialSupplierCharts();
    }, 50);
}

function renderFinancialBeike() {
    const bjStd = DEFAULT_BEIKE_MODELS.beijing.standard;
    const bjCust = DEFAULT_BEIKE_MODELS.beijing.custom;
    const shStd = DEFAULT_BEIKE_MODELS.shanghai.standard;
    const bjScale = AppState.scaleParams.beijing;
    const shScale = AppState.scaleParams.shanghai;
    const bjTeam = TEAM_STRUCTURE.beijing;
    const shTeam = TEAM_STRUCTURE.shanghai;

    // H2 half-year P&L rollup
    const bjStdRevH2 = bjScale.standard.h2TotalRevenue;
    const bjCustRevH2 = bjScale.custom.h2TotalRevenue;
    const shStdRevH2 = shScale.standard.h2TotalRevenue;
    const shCustRevH2 = shScale.custom.h2TotalRevenue;
    const totalRevH2 = bjStdRevH2 + bjCustRevH2 + shStdRevH2 + shCustRevH2;
    const bjHrCost = bjTeam.h2_total_hr_cost;
    const shHrCost = shTeam.h2_total_hr_cost;

    const bjStdProfit = bjStd.operating_profit * bjScale.standard.h2TotalUnits;
    const bjCustProfit = bjCust.operating_profit * bjScale.custom.h2TotalUnits;
    const shStdProfit = shStd.operating_profit * shScale.standard.h2TotalUnits;

    return `
    <div class="grid grid-cols-5 gap-4 mb-6">
        <div class="kpi-card"><div class="kpi-label">H2总营收(净收入)</div><div class="kpi-value text-green-600">¥${(totalRevH2/10000).toFixed(0)}万</div><div class="kpi-change up">北京+上海 合计</div></div>
        <div class="kpi-card"><div class="kpi-label">H2总GTV</div><div class="kpi-value text-blue-600">¥${((bjScale.standard.h2TotalGTV + bjScale.custom.h2TotalGTV + shScale.standard.h2TotalGTV + shScale.custom.h2TotalGTV)/100000000).toFixed(2)}亿</div><div class="kpi-change up">标准化+个性化</div></div>
        <div class="kpi-card"><div class="kpi-label">北京H2运营利润</div><div class="kpi-value ${(bjStdProfit+bjCustProfit) >= 0 ? 'text-green-600' : 'text-red-500'}">¥${((bjStdProfit+bjCustProfit)/10000).toFixed(0)}万</div><div class="kpi-change ${bjCustProfit < 0 ? 'down' : 'up'}">个性化拖累 ¥${(bjCustProfit/10000).toFixed(0)}万</div></div>
        <div class="kpi-card"><div class="kpi-label">上海H2运营利润</div><div class="kpi-value text-green-600">¥${(shStdProfit/10000).toFixed(0)}万</div><div class="kpi-change up">标准化主力</div></div>
        <div class="kpi-card"><div class="kpi-label">双城H2人力成本</div><div class="kpi-value text-red-500">¥${((bjHrCost+shHrCost)/10000).toFixed(0)}万</div><div class="kpi-change neutral">北京${bjTeam.h2_headcount}人 + 上海${shTeam.h2_headcount}人</div></div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-bar mr-2 text-green-600"></i>H2月度P&L走势</h3></div><div id="chart-fin-beike-trend" style="height:360px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-pie mr-2 text-blue-500"></i>城市×产品线收入结构</h3></div><div id="chart-fin-beike-mix" style="height:360px;"></div></div>
    </div>
    <div class="card">
        <div class="card-header"><h3><i class="fas fa-table mr-2 text-purple-500"></i>H2半年度损益表 (贝壳视角)</h3></div>
        <div class="overflow-auto"><table class="w-full text-sm">
            <thead class="bg-gray-50 sticky top-0"><tr>
                <th class="text-left px-4 py-2 text-gray-500">科目</th>
                <th class="text-right px-4 py-2 text-gray-500">北京标准化</th>
                <th class="text-right px-4 py-2 text-gray-500">北京个性化</th>
                <th class="text-right px-4 py-2 text-gray-500">上海标准化</th>
                <th class="text-right px-4 py-2 text-gray-500 font-bold">合计</th>
            </tr></thead>
            <tbody>
                ${buildPLRow('H2单量', bjScale.standard.h2TotalUnits, bjScale.custom.h2TotalUnits, shScale.standard.h2TotalUnits, '单', false)}
                ${buildPLRow('H2 GTV', bjScale.standard.h2TotalGTV, bjScale.custom.h2TotalGTV, shScale.standard.h2TotalGTV, '元')}
                ${buildPLRow('净收入(GTV×提点)', bjStdRevH2, bjCustRevH2, shStdRevH2, '元', true, 'bg-green-50')}
                ${buildPLRow('渠道成本', -bjStd.channel_cost * bjScale.standard.h2TotalUnits, -bjCust.channel_cost * bjScale.custom.h2TotalUnits, -shStd.channel_cost * shScale.standard.h2TotalUnits, '元')}
                ${buildPLRow('费用摊销', -bjStd.expense_total * bjScale.standard.h2TotalUnits, -bjCust.expense_total * bjScale.custom.h2TotalUnits, -shStd.expense_total * shScale.standard.h2TotalUnits, '元')}
                ${buildPLRow('运营利润', bjStdProfit, bjCustProfit, shStdProfit, '元', true, bjStdProfit + bjCustProfit + shStdProfit >= 0 ? 'bg-green-50' : 'bg-red-50')}
                ${buildPLRow('利润率(%)', bjStdRevH2>0?(bjStdProfit/bjStdRevH2*100):0, bjCustRevH2>0?(bjCustProfit/bjCustRevH2*100):0, shStdRevH2>0?(shStdProfit/shStdRevH2*100):0, '%', true, '', true)}
            </tbody>
        </table></div>
    </div>`;
}

function buildPLRow(label, bjStd, bjCust, shStd, unit, isBold = false, bgClass = '', isPercent = false) {
    const total = bjStd + bjCust + shStd;
    const fmt = (v) => {
        if (isPercent) return v.toFixed(1) + '%';
        if (unit === '单') return formatNumber(v);
        return '¥' + formatNumber(Math.round(v/10000)) + '万';
    };
    const cls = isBold ? 'font-bold' : '';
    const colorFn = (v) => v >= 0 ? 'text-gray-800' : 'text-red-500';
    return `<tr class="${cls} ${bgClass} border-b border-gray-50 hover:bg-gray-50/50">
        <td class="px-4 py-2 ${cls}">${label}</td>
        <td class="px-4 py-2 text-right font-mono ${colorFn(bjStd)}">${fmt(bjStd)}</td>
        <td class="px-4 py-2 text-right font-mono ${colorFn(bjCust)}">${fmt(bjCust)}</td>
        <td class="px-4 py-2 text-right font-mono ${colorFn(shStd)}">${fmt(shStd)}</td>
        <td class="px-4 py-2 text-right font-mono font-bold ${colorFn(total)}">${isPercent ? '' : fmt(total)}</td>
    </tr>`;
}

function renderFinancialBeikeCharts() {
    // Monthly P&L trend
    const chart1 = getOrCreateChart('chart-fin-beike-trend');
    if (chart1) {
        const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const bjStdRev = MONTHLY_TARGETS.beijing.standard.revenue;
        const bjCustRev = MONTHLY_TARGETS.beijing.custom.revenue;
        const shStdRev = MONTHLY_TARGETS.shanghai.standard.revenue;
        const bjStdUnits = MONTHLY_TARGETS.beijing.standard.units;
        const bjCustUnits = MONTHLY_TARGETS.beijing.custom.units;
        const shStdUnits = MONTHLY_TARGETS.shanghai.standard.units;

        const bjStdProfitM = bjStdUnits.map(u => u * DEFAULT_BEIKE_MODELS.beijing.standard.operating_profit);
        const bjCustProfitM = bjCustUnits.map(u => u * DEFAULT_BEIKE_MODELS.beijing.custom.operating_profit);
        const shStdProfitM = shStdUnits.map(u => u * DEFAULT_BEIKE_MODELS.shanghai.standard.operating_profit);
        const totalProfitM = bjStdProfitM.map((v, i) => v + bjCustProfitM[i] + shStdProfitM[i]);

        chart1.setOption({
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 60, right: 20, top: 20, bottom: 40 },
            xAxis: { type: 'category', data: months },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => (v/10000).toFixed(0) + '万' } },
            series: [
                { name: '北京标准化收入', type: 'bar', stack: 'revenue', data: bjStdRev, color: '#2563eb', barWidth: 18 },
                { name: '北京个性化收入', type: 'bar', stack: 'revenue', data: bjCustRev, color: '#e11d48' },
                { name: '上海标准化收入', type: 'bar', stack: 'revenue', data: shStdRev, color: '#059669' },
                { name: '合计运营利润', type: 'line', data: totalProfitM, color: '#f59e0b', smooth: true, lineStyle: { width: 3 }, symbol: 'circle', symbolSize: 6 },
            ]
        });
    }

    // Revenue mix pie
    const chart2 = getOrCreateChart('chart-fin-beike-mix');
    if (chart2) {
        const bjS = AppState.scaleParams.beijing;
        const shS = AppState.scaleParams.shanghai;
        chart2.setOption({
            tooltip: { formatter: p => `${p.name}: ¥${(p.value/10000).toFixed(0)}万 (${p.percent}%)` },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            series: [{
                type: 'pie', radius: ['35%', '65%'], center: ['50%', '42%'],
                label: { fontSize: 10, formatter: '{b}\n{d}%' },
                data: [
                    { name: '北京标准化', value: bjS.standard.h2TotalRevenue, itemStyle: { color: '#2563eb' } },
                    { name: '北京个性化', value: bjS.custom.h2TotalRevenue, itemStyle: { color: '#e11d48' } },
                    { name: '上海标准化', value: shS.standard.h2TotalRevenue, itemStyle: { color: '#059669' } },
                    { name: '上海个性化', value: shS.custom.h2TotalRevenue, itemStyle: { color: '#8b5cf6' } },
                ].filter(d => d.value > 0)
            }]
        });
    }
}

function renderFinancialOwner() {
    const models = [
        { name: '北京标准化', m: DEFAULT_OWNER_MODELS.beijing.standard, scale: AppState.scaleParams.beijing.standard },
        { name: '北京个性化', m: DEFAULT_OWNER_MODELS.beijing.custom, scale: AppState.scaleParams.beijing.custom },
        { name: '上海标准化', m: DEFAULT_OWNER_MODELS.shanghai.standard, scale: AppState.scaleParams.shanghai.standard },
        { name: '上海个性化', m: DEFAULT_OWNER_MODELS.shanghai.custom, scale: AppState.scaleParams.shanghai.custom },
    ];

    let html = `
    <div class="grid grid-cols-4 gap-4 mb-6">`;
    models.forEach(item => {
        const ueItem = calculateOwnerUE(item.m);
        const ratio = ueItem.renovationToRentRatio;
        const ratioColor = ratio > 15 ? 'text-red-500' : ratio > 12 ? 'text-amber-600' : 'text-green-600';
        html += `
        <div class="kpi-card">
            <div class="kpi-label">${item.name}</div>
            <div class="kpi-value ${ratioColor}">${ratio.toFixed(1)}<span class="text-sm font-normal text-gray-400">x 月租金</span></div>
            <div class="kpi-change neutral">辅助：${item.m.payback_months}月回本 · 年化 ${item.m.annual_yield}%</div>
        </div>`;
    });
    html += `</div>
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card"><div class="card-header"><h3><i class="fas fa-balance-scale mr-2 text-amber-500"></i>装修/租金倍数 × 回本对比</h3></div><div id="chart-fin-owner-compare" style="height:360px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-line mr-2 text-green-600"></i>5年累计净现金流</h3></div><div id="chart-fin-owner-cashflow" style="height:360px;"></div></div>
    </div>
    <div class="card">
        <div class="card-header"><h3><i class="fas fa-table mr-2 text-amber-500"></i>业主UE对比表</h3></div>
        <div class="overflow-auto"><table class="w-full text-sm">
            <thead class="bg-gray-50 sticky top-0"><tr>
                <th class="text-left px-4 py-2 text-gray-500">指标</th>
                ${models.map(m => `<th class="text-right px-4 py-2 text-gray-500">${m.name}</th>`).join('')}
            </tr></thead>
            <tbody>
                ${buildOwnerRow('装修总款(GTV)', models.map(m => m.m.renovation_total))}
                ${buildOwnerRow('装修后全月租金', models.map(m => m.m.avg_rent_after))}
                ${buildOwnerRow('⭐ 装修/租金倍数', models.map(m => parseFloat(calculateOwnerUE(m.m).renovationToRentRatio.toFixed(1))), true)}
                ${buildOwnerRow('月溢价收入', models.map(m => m.m.rent_premium))}
                ${buildOwnerRow('年溢价收入', models.map(m => m.m.total_premium_income))}
                ${buildOwnerRow('空置天数(天)', models.map(m => m.m.vacancy_days), true)}
                ${buildOwnerRow('空置损失', models.map(m => -m.m.vacancy_cost))}
                ${buildOwnerRow('贝壳荐客费', models.map(m => -m.m.beike_service_fee))}
                ${buildOwnerRow('回本月数', models.map(m => m.m.payback_months), true)}
                ${buildOwnerRow('年化收益率(%)', models.map(m => m.m.annual_yield), true)}
                ${buildOwnerRow('3年ROI(%)', models.map(m => m.m.roi_3year), true)}
                ${buildOwnerRow('5年ROI(%)', models.map(m => m.m.roi_5year), true)}
            </tbody>
        </table></div>
    </div>`;
    return html;
}

function buildOwnerRow(label, values, isRaw = false) {
    return `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
        <td class="px-4 py-2 font-medium">${label}</td>
        ${values.map(v => `<td class="px-4 py-2 text-right font-mono ${v >= 0 ? 'text-gray-800' : 'text-red-500'}">${isRaw ? (typeof v === 'number' ? v.toFixed(1) : v) : '¥' + formatNumber(Math.round(v))}</td>`).join('')}
    </tr>`;
}

function renderFinancialOwnerCharts() {
    const models = [
        { name: '北京标', m: DEFAULT_OWNER_MODELS.beijing.standard },
        { name: '北京个', m: DEFAULT_OWNER_MODELS.beijing.custom },
        { name: '上海标', m: DEFAULT_OWNER_MODELS.shanghai.standard },
        { name: '上海个', m: DEFAULT_OWNER_MODELS.shanghai.custom },
    ];

    // Compare bar — 核心：装修/租金倍数
    const chart1 = getOrCreateChart('chart-fin-owner-compare');
    if (chart1) {
        chart1.setOption({
            tooltip: {
                trigger: 'axis',
                formatter: ps => {
                    const idx = ps[0].dataIndex;
                    const am = models[idx];
                    const ue = calculateOwnerUE(am.m);
                    return `<b>${am.name}</b><br/>`
                        + `装修/租金倍数: <b>${ue.renovationToRentRatio.toFixed(1)}x</b><br/>`
                        + `辅助：回本 ${am.m.payback_months}月 · 年化 ${am.m.annual_yield}%`;
                }
            },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 60, right: 40, top: 30, bottom: 40 },
            xAxis: { type: 'category', data: models.map(m => m.name) },
            yAxis: [
                { type: 'value', name: '装修/租金倍数', axisLabel: { fontSize: 10, formatter: v => v + 'x' }, min: 0 },
                { type: 'value', name: '辅助：回本月数', axisLabel: { fontSize: 10 } },
            ],
            series: [
                {
                    name: '装修/租金倍数', type: 'bar', barWidth: 36,
                    data: models.map(m => {
                        const ue = calculateOwnerUE(m.m);
                        const r = ue.renovationToRentRatio;
                        return { value: parseFloat(r.toFixed(1)), itemStyle: { color: r > 15 ? '#ef4444' : r > 12 ? '#f59e0b' : '#22c55e' } };
                    }),
                    label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold', formatter: p => p.value + 'x' },
                    markLine: { silent: true, data: [{ yAxis: 12, lineStyle: { color: '#22c55e', type: 'dashed', width: 2 }, label: { formatter: '合理线 12x', fontSize: 10 } }] }
                },
                {
                    name: '辅助：回本月数', type: 'line', yAxisIndex: 1,
                    data: models.map(m => m.m.payback_months),
                    color: '#8b5cf6', symbol: 'diamond', symbolSize: 10, lineStyle: { type: 'dashed', width: 2 },
                },
            ]
        });
    }

    // Multi-model cashflow curves
    const chart2 = getOrCreateChart('chart-fin-owner-cashflow');
    if (chart2) {
        const months = Array.from({ length: 61 }, (_, i) => i + '月');
        const series = models.map((item, idx) => {
            const colors = ['#2563eb', '#e11d48', '#059669', '#8b5cf6'];
            const cashflow = [];
            let cum = -item.m.renovation_total - item.m.vacancy_cost;
            for (let i = 0; i <= 60; i++) {
                cashflow.push(Math.round(cum));
                cum += item.m.rent_premium;
            }
            return {
                name: item.name, type: 'line', data: cashflow,
                color: colors[idx], smooth: true, lineStyle: { width: idx === 0 || idx === 2 ? 2.5 : 1.5, type: idx % 2 === 1 ? 'dashed' : 'solid' },
            };
        });
        chart2.setOption({
            tooltip: { trigger: 'axis', formatter: ps => ps.map(p => `${p.seriesName}: ¥${formatNumber(p.value)}`).join('<br/>') },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { left: 70, right: 20, top: 20, bottom: 40 },
            xAxis: { type: 'category', data: months, axisLabel: { fontSize: 9, interval: 5 } },
            yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            visualMap: { show: false, pieces: [{ lte: 0, color: '#ef4444' }, { gt: 0, color: '#22c55e' }] },
            series
        });
    }
}

function renderFinancialSupplier() {
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    const ue = calculateSupplierUE(m);
    const materialTotal = m.furniture + m.appliances + m.soft_furnishing;
    const laborTotal = m.foreman + m.designer + m.supervisor + m.admin + m.gc_boss;

    return `
    <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="kpi-card"><div class="kpi-label">每单总成本</div><div class="kpi-value text-purple-600">¥${formatNumber(m.total_cost)}</div><div class="kpi-change neutral">占GTV ${m.gtv_ratio}%</div></div>
        <div class="kpi-card"><div class="kpi-label">施工人力合计</div><div class="kpi-value text-red-500">¥${formatNumber(laborTotal)}</div><div class="kpi-change down">工长 ${m.foreman_pct}% 为最大项</div></div>
        <div class="kpi-card"><div class="kpi-label">主材合计</div><div class="kpi-value text-blue-500">¥${formatNumber(materialTotal)}</div><div class="kpi-change neutral">${(m.furniture_pct + m.appliances_pct + m.soft_furnishing_pct).toFixed(1)}%</div></div>
        <div class="kpi-card"><div class="kpi-label">贝壳荐客费(供应商出)</div><div class="kpi-value text-green-600">¥${formatNumber(m.beike_fee)}</div><div class="kpi-change neutral">${m.beike_fee_pct}%</div></div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-pie mr-2 text-purple-500"></i>供应商成本分类构成</h3></div><div id="chart-fin-supplier-pie" style="height:380px;"></div></div>
        <div class="card"><div class="card-header"><h3><i class="fas fa-chart-bar mr-2 text-red-500"></i>成本优化空间分析</h3></div><div id="chart-fin-supplier-opt" style="height:380px;"></div></div>
    </div>
    <div class="card">
        <div class="card-header"><h3><i class="fas fa-table mr-2 text-purple-500"></i>供应商每单成本明细</h3></div>
        <div class="overflow-auto"><table class="w-full text-sm">
            <thead class="bg-gray-50 sticky top-0"><tr>
                <th class="text-left px-4 py-2 text-gray-500">项目</th>
                <th class="text-right px-4 py-2 text-gray-500">金额(元)</th>
                <th class="text-right px-4 py-2 text-gray-500">GTV占比</th>
                <th class="text-left px-4 py-2 text-gray-500">类别</th>
                <th class="text-left px-4 py-2 text-gray-500">优化建议</th>
            </tr></thead>
            <tbody>${ue.lineItems.sort((a,b) => Math.abs(b.value) - Math.abs(a.value)).map(item => {
                const opt = item.pct > 10 ? '🔴 重点压缩' : item.pct > 5 ? '🟡 有空间' : item.value < 0 ? '🟢 已反哺' : '⚪ 维持';
                return `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
                    <td class="px-4 py-2 font-medium">${item.name}</td>
                    <td class="px-4 py-2 text-right font-mono ${item.value >= 0 ? '' : 'text-green-600'}">¥${formatNumber(item.value)}</td>
                    <td class="px-4 py-2 text-right font-mono text-gray-500">${item.pct}%</td>
                    <td class="px-4 py-2"><span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${item.category}</span></td>
                    <td class="px-4 py-2 text-xs">${opt}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>
    </div>`;
}

function renderFinancialSupplierCharts() {
    const m = DEFAULT_SUPPLIER_MODELS.standard;
    const ue = calculateSupplierUE(m);

    // Grouped pie by category
    const chart1 = getOrCreateChart('chart-fin-supplier-pie');
    if (chart1) {
        const catTotals = {};
        ue.lineItems.forEach(item => {
            if (item.value > 0) {
                catTotals[item.category] = (catTotals[item.category] || 0) + item.value;
            }
        });
        const colorMap = { '平台': '#059669', '资金': '#f59e0b', '施工': '#ef4444', '主材': '#3b82f6', '其他': '#8b5cf6' };
        chart1.setOption({
            tooltip: { formatter: p => `${p.name}: ¥${formatNumber(p.value)} (${p.percent}%)` },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            series: [{
                type: 'pie', radius: ['30%', '60%'], center: ['50%', '42%'],
                label: { fontSize: 10, formatter: '{b}\n¥{c}' },
                data: Object.entries(catTotals).map(([cat, val]) => ({
                    name: cat, value: val, itemStyle: { color: colorMap[cat] || '#999' }
                }))
            }]
        });
    }

    // Optimization space bar
    const chart2 = getOrCreateChart('chart-fin-supplier-opt');
    if (chart2) {
        const items = ue.lineItems.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
        const optSavings = items.map(i => {
            if (i.pct > 10) return { ...i, saving: Math.round(i.value * 0.15), label: '可压15%' };
            if (i.pct > 5) return { ...i, saving: Math.round(i.value * 0.08), label: '可压8%' };
            return { ...i, saving: 0, label: '维持' };
        });
        chart2.setOption({
            tooltip: { formatter: p => `${p.name}: 可节省 ¥${formatNumber(p.value)}/单` },
            grid: { left: 80, right: 40, top: 10, bottom: 10 },
            xAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
            yAxis: { type: 'category', data: optSavings.filter(i => i.saving > 0).map(i => i.name).reverse(), axisLabel: { fontSize: 10 } },
            series: [{
                type: 'bar',
                data: optSavings.filter(i => i.saving > 0).map(i => ({
                    value: i.saving, itemStyle: { color: i.pct > 10 ? '#ef4444' : '#f59e0b' }
                })).reverse(),
                label: { show: true, position: 'right', fontSize: 9, formatter: p => '¥' + formatNumber(p.value) + '/单' },
            }]
        });
    }
}

// ==================== 版本标识栏（全局底部） ====================
function renderPerspectiveVersionBar() {
    const p = AppState.currentPerspective;
    const pm = PERSPECTIVES[p];
    const city = AppState.currentCity === 'beijing' ? '北京' : '上海';
    const prod = AppState.currentProduct === 'standard' ? '标准化' : '个性化';
    return `<div class="fixed bottom-0 left-0 right-0 bg-dark-900/90 backdrop-blur-sm text-xs text-gray-400 py-1.5 px-4 flex items-center justify-between z-40">
        <span>美租UE管理系统 v6.0 — 三视角模式</span>
        <span><i class="fas fa-${pm.icon} mr-1" style="color:${pm.color}"></i>${pm.label} · ${city} · ${prod}</span>
    </div>`;
}
