// ===== E杠杆分析模块 v6.0 — 三视角弹性引擎 =====
// 贝壳: 运营利润弹性 · 业主: 回本月数/年化收益弹性 · 供应商: 成本结构弹性
// 每个视角使用独立的E杠杆组(E_LEVERS_3V)和计算引擎

// ========== 兼容旧 E_LEVERS (cross-analysis/alignment/flywheel 使用) ==========
const E_LEVERS = E_LEVERS_3V.beike.filter(l => !l.future);

// ========== 三视角弹性计算引擎 ==========

function getELeversForPerspective(perspective) {
    const levers = E_LEVERS_3V[perspective] || E_LEVERS_3V.beike;
    return levers.filter(l => !l.future);
}

function getModelForPerspective(perspective, city, product) {
    if (perspective === 'beike') {
        return AppState.baselineModels.beike?.[city]?.[product] || DEFAULT_BEIKE_MODELS[city]?.[product] || DEFAULT_BEIKE_MODELS.beijing.standard;
    } else if (perspective === 'owner') {
        return DEFAULT_OWNER_MODELS[city]?.[product] || DEFAULT_OWNER_MODELS.beijing.standard;
    } else {
        return DEFAULT_SUPPLIER_MODELS.standard;
    }
}

function calcProfitForPerspective(perspective, model) {
    if (perspective === 'beike') {
        return calculateBeikeUE(model).operatingProfit;
    } else if (perspective === 'owner') {
        const ue = calculateOwnerUE(model);
        return ue.totalIncome - ue.totalCost; // first year net
    } else {
        // Supplier: negative = total cost (lower = better)
        return -calculateSupplierUE(model).totalIncBeike;
    }
}

function calcMetricsForPerspective(perspective, model) {
    if (perspective === 'beike') {
        const ue = calculateBeikeUE(model);
        return { profit: ue.operatingProfit, revenue: ue.netRevenue, margin: ue.profitMargin, label: '运营利润' };
    } else if (perspective === 'owner') {
        const ue = calculateOwnerUE(model);
        const payback = model.rent_premium > 0 ? Math.ceil(model.renovation_total / model.rent_premium) : 999;
        const annualYield = model.renovation_total > 0 ? (model.first_year_return / model.renovation_total * 100) : 0;
        return { profit: ue.totalIncome - ue.totalCost, revenue: ue.totalIncome, margin: annualYield, payback, label: '首年净回报' };
    } else {
        const ue = calculateSupplierUE(model);
        return { profit: -ue.totalIncBeike, revenue: 0, margin: 0, totalCost: ue.totalIncBeike, label: '每单总成本' };
    }
}

// 对单个E杠杆计算弹性（三视角通用）
function calculate3VElasticity(perspective, baseModel, lever, adjustValue) {
    const baseProfit = calcProfitForPerspective(perspective, baseModel);

    const adjusted = JSON.parse(JSON.stringify(baseModel));
    if (lever.baseField && adjusted[lever.baseField] !== undefined) {
        adjusted[lever.baseField] = adjusted[lever.baseField] + adjustValue;
    }

    // 联动（贝壳视角）
    if (perspective === 'beike') {
        if (lever.baseField === 'commission_rate' || lever.baseField === 'gtv_per_unit') {
            adjusted.net_revenue = adjusted.gtv_per_unit * (adjusted.commission_rate / 100);
        }
    }
    // 联动（业主视角）
    if (perspective === 'owner') {
        if (lever.baseField === 'rent_premium') {
            adjusted.total_premium_income = adjusted.rent_premium * adjusted.avg_lease_months;
            adjusted.first_year_return = adjusted.total_premium_income;
        }
        if (lever.baseField === 'avg_lease_months') {
            adjusted.total_premium_income = adjusted.rent_premium * adjusted.avg_lease_months;
            adjusted.first_year_return = adjusted.rent_premium * 12;
        }
        if (lever.baseField === 'vacancy_days') {
            const dailyRent = adjusted.avg_rent_after ? adjusted.avg_rent_after / 30 : 240;
            adjusted.vacancy_cost = adjusted.vacancy_days * dailyRent;
        }
        if (lever.baseField === 'renovation_total') {
            adjusted.beike_service_fee = adjusted.renovation_total * 0.12;
            adjusted.supplier_cost = adjusted.renovation_total - adjusted.beike_service_fee;
        }
        if (lever.baseField === 'vacancy_reduction_days') {
            const dailyRent = adjusted.avg_rent_after ? adjusted.avg_rent_after / 30 : 240;
            adjusted.vacancy_reduction_value = adjusted.vacancy_reduction_days * dailyRent;
        }
    }

    const adjustedProfit = calcProfitForPerspective(perspective, adjusted);
    const profitDelta = adjustedProfit - baseProfit;
    const profitChangeRate = baseProfit !== 0 ? (profitDelta / Math.abs(baseProfit) * 100) : 0;

    return { lever, adjustValue, baseProfit, adjustedProfit, profitDelta, profitChangeRate };
}

// 计算所有杠杆的全面敏感性
function calculateAll3VSensitivities(perspective, model) {
    const levers = getELeversForPerspective(perspective);
    const results = [];

    levers.forEach(lever => {
        const step = Math.abs(lever.adjustStep);
        const positive = calculate3VElasticity(perspective, model, lever, step);
        const negative = calculate3VElasticity(perspective, model, lever, -step);

        const baseValue = lever.baseField && model[lever.baseField] !== undefined ? model[lever.baseField] : 0;
        const paramChangePct = baseValue !== 0 ? (step / Math.abs(baseValue) * 100) : (step > 0 ? step : 1);
        const elasticity = paramChangePct !== 0 ? (positive.profitChangeRate / paramChangePct) : 0;

        // 龙卷风图: 范围上下限
        const upAdj = lever.max !== undefined && lever.min !== undefined ? Math.min(step * 5, lever.max - baseValue) : step * 5;
        const downAdj = lever.max !== undefined && lever.min !== undefined ? Math.max(-step * 5, lever.min - baseValue) : -step * 5;
        const upResult = calculate3VElasticity(perspective, model, lever, upAdj);
        const downResult = calculate3VElasticity(perspective, model, lever, downAdj);

        results.push({
            lever, baseValue, step,
            positiveResult: positive,
            negativeResult: negative,
            elasticity: Math.abs(elasticity),
            elasticityRaw: elasticity,
            tornadoUp: upResult.profitDelta,
            tornadoDown: downResult.profitDelta,
            tornadoRange: Math.abs(upResult.profitDelta) + Math.abs(downResult.profitDelta),
            upProfitImpact: positive.profitDelta,
            downProfitImpact: negative.profitDelta,
        });
    });

    results.sort((a, b) => b.tornadoRange - a.tornadoRange);
    return results;
}

// ========== 兼容旧接口 ==========
function calculateElasticity(baseModel, lever, adjustValue) {
    return calculate3VElasticity('beike', baseModel, lever, adjustValue);
}
function calculateAllSensitivities(baseModel) {
    return calculateAll3VSensitivities('beike', baseModel);
}

// ========== 三视角页面入口 ==========

function renderEAnalysis3V() {
    const container = document.getElementById('e-3v-content');
    if (!container) return;

    const p = AppState.currentPerspective;
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const model = getModelForPerspective(p, city, prod);
    const sensitivities = calculateAll3VSensitivities(p, model);

    let html = `<div class="mb-5">${renderPerspectiveSwitcher('e-switcher', { onChange: 'renderEAnalysis3V' })}</div>`;

    // 策略推荐卡
    html += render3VStrategyRecommendation(p, sensitivities, model);

    // 龙卷风 + 杠杆对比
    html += `<div class="grid grid-cols-2 gap-4 mb-4">
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-tornado mr-2 text-red-500"></i>${PERSPECTIVES[p].label} 敏感性龙卷风图</h3><span class="text-[10px] text-gray-400">${p === 'owner' ? '回报' : p === 'supplier' ? '成本' : '利润'}随参数变化的上下波动</span></div>
            <div id="chart-e-tornado" style="height:420px;"></div>
        </div>
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-exchange-alt mr-2 text-ke-500"></i>${p === 'beike' ? '提费 vs 降本 vs 混合' : p === 'owner' ? '溢价↑ vs 成本↓ vs 混合' : '人力↓ vs 主材↓ vs 混合'}</h3></div>
            <div id="chart-e-fee-vs-price" style="height:260px;"></div>
            <div class="border-t border-gray-100">
                <div class="card-header"><h3><i class="fas fa-water mr-2 text-purple-500"></i>策略增量瀑布</h3></div>
                <div id="chart-e-waterfall-delta" style="height:160px;"></div>
            </div>
        </div>
    </div>`;

    // 弹性排名 + 模拟器
    html += `<div class="grid grid-cols-2 gap-4">
        <div class="card" id="e-elasticity-ranking"></div>
        <div class="card" id="e-lever-simulator"></div>
    </div>`;

    container.innerHTML = html;

    // 渲染图表和组件
    setTimeout(() => {
        render3VTornadoChart(sensitivities, p);
        render3VElasticityRanking(sensitivities, p);
        render3VFeeVsPrice(p, model);
        render3VWaterfallDelta(p, model);
        render3VLeverSimulator(p, model);
    }, 50);
}

// 兼容旧路由
function renderEAnalysisPage() {
    renderEAnalysis3V();
}

// ========== 龙卷风图 ==========
function render3VTornadoChart(sensitivities, perspective) {
    const chart = getOrCreateChart('chart-e-tornado');
    if (!chart) return;

    const top = sensitivities.slice(0, 10);
    const labels = top.map(s => s.lever.label).reverse();
    const upData = top.map(s => Math.round(s.tornadoUp)).reverse();
    const downData = top.map(s => Math.round(s.tornadoDown)).reverse();
    const unit = perspective === 'supplier' ? '成本' : perspective === 'owner' ? '回报' : '利润';

    chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: params => {
            const name = params[0].name;
            return `<b>${name}</b><br/>上行: ¥${formatNumber(params[0].value)}<br/>下行: ¥${formatNumber(params[1].value)}`;
        }},
        legend: { data: [`${unit}上行空间`, `${unit}下行风险`], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 110, right: 30, top: 10, bottom: 40 },
        xAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + (v / 1000).toFixed(1) + 'k' } },
        yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 }, inverse: false },
        series: [
            { name: `${unit}上行空间`, type: 'bar', stack: 'total', data: upData, itemStyle: { color: '#10b981', borderRadius: [0, 4, 4, 0] }, barMaxWidth: 22 },
            { name: `${unit}下行风险`, type: 'bar', stack: 'total', data: downData, itemStyle: { color: '#ef4444', borderRadius: [4, 0, 0, 4] }, barMaxWidth: 22 }
        ]
    });
}

// ========== 弹性排名 ==========
function render3VElasticityRanking(sensitivities, perspective) {
    const container = document.getElementById('e-elasticity-ranking');
    if (!container) return;

    const metricLabel = perspective === 'supplier' ? '成本弹性' : perspective === 'owner' ? '回报弹性' : '利润弹性';
    let html = `<div class="p-4"><h4 class="text-xs font-bold text-gray-500 uppercase mb-3"><i class="fas fa-${PERSPECTIVES[perspective].icon} mr-1" style="color:${PERSPECTIVES[perspective].color}"></i>杠杆弹性排名 <span class="font-normal text-gray-400">（${metricLabel}系数 = 输出变化% / 参数变化%）</span></h4>`;
    html += '<div class="space-y-2">';

    sensitivities.forEach((s, idx) => {
        const leverType = s.lever.type || 'cost';
        const typeLabel = leverType === 'price' ? '收入' : leverType === 'cost' ? '成本' : '效率';
        const typeColor = leverType === 'price' ? 'tag-green' : leverType === 'cost' ? 'tag-red' : 'tag-purple';
        const barWidth = Math.min(100, s.elasticity * 30);
        const impactLabel = s.tornadoRange > 2000 ? '高杠杆' : s.tornadoRange > 800 ? '中杠杆' : '低杠杆';
        const impactColor = s.tornadoRange > 2000 ? 'text-red-600' : s.tornadoRange > 800 ? 'text-yellow-600' : 'text-gray-400';

        html += `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx < 3 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}">${idx + 1}</span>
            <span class="tag ${typeColor} text-[10px] w-10 text-center">${typeLabel}</span>
            <span class="text-sm font-medium text-gray-700 w-28">${s.lever.label}</span>
            <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all group-hover:opacity-80" style="width:${barWidth}%;background:${s.lever.color}"></div>
            </div>
            <span class="text-xs font-bold w-12 text-right" style="color:${s.lever.color}">${s.elasticity.toFixed(2)}</span>
            <span class="text-[10px] font-semibold w-14 text-right ${impactColor}">${impactLabel}</span>
            <span class="text-xs text-gray-400 w-24 text-right">±¥${formatNumber(Math.round(s.tornadoRange / 2))}</span>
        </div>`;
    });

    html += '</div></div>';
    container.innerHTML = html;
}

// ========== 提费 vs 降本 (三视角) ==========
function render3VFeeVsPrice(perspective, model) {
    const chart = getOrCreateChart('chart-e-fee-vs-price');
    if (!chart) return;

    const strategies = build3VStrategies(perspective, model);
    const labels = strategies.map(s => s.label);

    chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: ['基准/调整值', '利润/回报变化'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 40, top: 20, bottom: 45 },
        xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11 } },
        yAxis: { type: 'value', name: '元', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
        series: [
            { name: '基准/调整值', type: 'bar', data: strategies.map(s => Math.round(s.profit)), barMaxWidth: 35,
              itemStyle: { color: p => strategies[p.dataIndex].color, borderRadius: [4, 4, 0, 0] } },
            { name: '利润/回报变化', type: 'bar', data: strategies.map(s => Math.round(s.profitDelta || 0)), barMaxWidth: 35,
              itemStyle: { color: p => { const v = strategies[p.dataIndex].profitDelta || 0; return v >= 0 ? '#22c55e80' : '#ef444480'; }, borderRadius: [4, 4, 0, 0] } },
        ]
    });
}

function build3VStrategies(perspective, model) {
    if (perspective === 'beike') {
        const base = calcMetricsForPerspective('beike', model);
        // 策略1: 提费（提点+2pp）
        const m1 = JSON.parse(JSON.stringify(model));
        m1.commission_rate += 2; m1.net_revenue = m1.gtv_per_unit * (m1.commission_rate / 100);
        const s1 = calcMetricsForPerspective('beike', m1);
        // 策略2: 降本（渠道-300，城市人工-500）
        const m2 = JSON.parse(JSON.stringify(model));
        m2.channel_manager = Math.max(0, m2.channel_manager - 300);
        m2.expense_city_hr = Math.max(0, m2.expense_city_hr - 500);
        const s2 = calcMetricsForPerspective('beike', m2);
        // 策略3: 混合
        const m3 = JSON.parse(JSON.stringify(model));
        m3.commission_rate += 1; m3.net_revenue = m3.gtv_per_unit * (m3.commission_rate / 100);
        m3.channel_manager = Math.max(0, m3.channel_manager - 150);
        m3.expense_city_hr = Math.max(0, m3.expense_city_hr - 250);
        const s3 = calcMetricsForPerspective('beike', m3);
        return [
            { label: '基准', profit: base.profit, profitDelta: 0, color: '#6b7280' },
            { label: '提费+2pp', profit: s1.profit, profitDelta: s1.profit - base.profit, color: '#059669' },
            { label: '渠道-300\n人工-500', profit: s2.profit, profitDelta: s2.profit - base.profit, color: '#ef4444' },
            { label: '混合策略', profit: s3.profit, profitDelta: s3.profit - base.profit, color: '#8b5cf6' },
        ];
    } else if (perspective === 'owner') {
        const base = calcMetricsForPerspective('owner', model);
        // 策略1: 溢价+300/月
        const m1 = JSON.parse(JSON.stringify(model));
        m1.rent_premium += 300; m1.total_premium_income = m1.rent_premium * m1.avg_lease_months; m1.first_year_return = m1.rent_premium * 12;
        const s1 = calcMetricsForPerspective('owner', m1);
        // 策略2: 降GTV-10000
        const m2 = JSON.parse(JSON.stringify(model));
        m2.renovation_total -= 10000; m2.beike_service_fee = m2.renovation_total * 0.12; m2.supplier_cost = m2.renovation_total - m2.beike_service_fee;
        const s2 = calcMetricsForPerspective('owner', m2);
        // 策略3: 混合
        const m3 = JSON.parse(JSON.stringify(model));
        m3.rent_premium += 150; m3.total_premium_income = m3.rent_premium * m3.avg_lease_months; m3.first_year_return = m3.rent_premium * 12;
        m3.renovation_total -= 5000; m3.beike_service_fee = m3.renovation_total * 0.12; m3.supplier_cost = m3.renovation_total - m3.beike_service_fee;
        const s3 = calcMetricsForPerspective('owner', m3);
        return [
            { label: '基准', profit: base.profit, profitDelta: 0, color: '#6b7280' },
            { label: '溢价+300/月', profit: s1.profit, profitDelta: s1.profit - base.profit, color: '#059669' },
            { label: 'GTV-1万', profit: s2.profit, profitDelta: s2.profit - base.profit, color: '#ef4444' },
            { label: '混合策略', profit: s3.profit, profitDelta: s3.profit - base.profit, color: '#8b5cf6' },
        ];
    } else {
        const base = calcMetricsForPerspective('supplier', model);
        // 策略1: 工长-15%
        const m1 = JSON.parse(JSON.stringify(model));
        m1.foreman = Math.round(m1.foreman * 0.85);
        const s1 = calcMetricsForPerspective('supplier', m1);
        // 策略2: 主材-10%
        const m2 = JSON.parse(JSON.stringify(model));
        m2.furniture = Math.round(m2.furniture * 0.9); m2.appliances = Math.round(m2.appliances * 0.9); m2.soft_furnishing = Math.round(m2.soft_furnishing * 0.9);
        const s2 = calcMetricsForPerspective('supplier', m2);
        // 策略3: 混合
        const m3 = JSON.parse(JSON.stringify(model));
        m3.foreman = Math.round(m3.foreman * 0.92); m3.furniture = Math.round(m3.furniture * 0.95); m3.appliances = Math.round(m3.appliances * 0.95);
        const s3 = calcMetricsForPerspective('supplier', m3);
        return [
            { label: '基准成本', profit: base.profit, profitDelta: 0, color: '#6b7280' },
            { label: '工长-15%', profit: s1.profit, profitDelta: s1.profit - base.profit, color: '#059669' },
            { label: '主材-10%', profit: s2.profit, profitDelta: s2.profit - base.profit, color: '#ef4444' },
            { label: '混合优化', profit: s3.profit, profitDelta: s3.profit - base.profit, color: '#8b5cf6' },
        ];
    }
}

// ========== 增量瀑布 ==========
function render3VWaterfallDelta(perspective, model) {
    const chart = getOrCreateChart('chart-e-waterfall-delta');
    if (!chart) return;

    const strategies = build3VStrategies(perspective, model);
    const base = Math.round(strategies[0].profit);
    const categories = strategies.map(s => s.label);
    const deltas = strategies.map(s => Math.round(s.profitDelta || 0));

    chart.setOption({
        tooltip: { trigger: 'axis', formatter: params => {
            let val = 0;
            params.forEach(p => { if (p.seriesName !== '辅助' && p.value !== '-') val += p.value; });
            return `${params[0].name}: ¥${formatNumber(val)}`;
        }},
        grid: { left: 60, right: 20, top: 15, bottom: 25 },
        xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => '¥' + formatNumber(v) } },
        series: [
            { name: '辅助', type: 'bar', stack: 'total', itemStyle: { borderColor: 'transparent', color: 'transparent' }, emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
              data: [0, base, base, base] },
            { name: '利润', type: 'bar', stack: 'total', barMaxWidth: 45,
              data: [base, deltas[1], deltas[2], deltas[3]],
              itemStyle: { color: p => strategies[p.dataIndex].color, borderRadius: [4, 4, 0, 0] },
              label: { show: true, position: 'top', fontSize: 10, fontWeight: 'bold', formatter: p => (p.value >= 0 ? '+' : '') + '¥' + formatNumber(p.value) }
            }
        ]
    });
}

// ========== 策略推荐卡 ==========
function render3VStrategyRecommendation(perspective, sensitivities, model) {
    const top3 = sensitivities.slice(0, 3);
    const pm = PERSPECTIVES[perspective];

    // 按杠杆分组
    const groups = {};
    sensitivities.forEach(s => {
        const g = s.lever.group || '其他';
        if (!groups[g]) groups[g] = { items: [], totalRange: 0 };
        groups[g].items.push(s);
        groups[g].totalRange += s.tornadoRange;
    });
    const totalRange = sensitivities.reduce((s, i) => s + i.tornadoRange, 0);

    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].totalRange - a[1].totalRange);
    const bestGroup = sortedGroups[0];

    // 最佳策略判断
    const strategies = build3VStrategies(perspective, model);
    const bestStrat = strategies.slice(1).sort((a, b) => (b.profitDelta || 0) - (a.profitDelta || 0))[0];

    const metricLabel = perspective === 'supplier' ? '每单可节省' : perspective === 'owner' ? '回报提升' : '利润提升';

    return `<div class="card mb-4"><div class="p-5">
        <div class="bg-gradient-to-r from-gray-50 to-gray-100 border rounded-xl p-5 mb-5">
            <div class="flex items-start gap-3">
                <span class="text-3xl">${perspective === 'beike' ? '💰' : perspective === 'owner' ? '🏠' : '🔧'}</span>
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-lg font-bold text-gray-800">${pm.label}视角推荐：${bestStrat.label}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background:${pm.color}15;color:${pm.color}">${pm.label}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-3">最强杠杆组 <b>${bestGroup[0]}</b>，总影响力占比 ${(bestGroup[1].totalRange / totalRange * 100).toFixed(0)}%。TOP1杠杆 <b>${top3[0].lever.label}</b>，弹性系数 ${top3[0].elasticity.toFixed(2)}</p>
                    <div class="flex gap-4 text-xs flex-wrap">
                        <div class="bg-white rounded-lg px-3 py-2 shadow-sm">
                            <span class="text-gray-500">${metricLabel}</span>
                            <span class="font-bold text-green-600 ml-1">${bestStrat.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.abs(Math.round(bestStrat.profitDelta)))}/单</span>
                        </div>
                        <div class="bg-white rounded-lg px-3 py-2 shadow-sm">
                            <span class="text-gray-500">最强杠杆</span>
                            <span class="font-bold ml-1" style="color:${top3[0].lever.color}">${top3[0].lever.label}</span>
                        </div>
                        <div class="bg-white rounded-lg px-3 py-2 shadow-sm">
                            <span class="text-gray-500">弹性系数</span>
                            <span class="font-bold text-purple-600 ml-1">${top3[0].elasticity.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <h4 class="text-xs font-bold text-gray-500 uppercase mb-3">杠杆分组影响力</h4>
        <div class="grid grid-cols-${Math.min(sortedGroups.length, 4)} gap-3 mb-5">
            ${sortedGroups.slice(0, 4).map((g, i) => {
                const pct = (g[1].totalRange / totalRange * 100).toFixed(0);
                const isBest = i === 0;
                const borderCls = isBest ? 'border-2 border-green-400 bg-green-50' : 'border border-gray-200 bg-gray-50';
                const icon = g[0].includes('收入') ? '💰' : g[0].includes('成本') ? '📉' : '⚡';
                return `<div class="rounded-xl ${borderCls} p-4 text-center">
                    <div class="text-2xl mb-1">${icon}</div>
                    <div class="text-sm font-bold text-gray-700">${g[0]}</div>
                    <div class="text-xl font-black ${isBest ? 'text-green-600' : 'text-gray-600'} mt-1">${pct}%</div>
                    <div class="text-xs text-gray-400 mt-1">${g[1].items.length}个杠杆</div>
                    <div class="text-xs text-gray-400">TOP: ${g[1].items[0].lever.label}</div>
                </div>`;
            }).join('')}
        </div>

        <h4 class="text-xs font-bold text-gray-500 uppercase mb-3">TOP3 关键杠杆</h4>
        <div class="space-y-3">
            ${top3.map((s, i) => {
                const medal = ['🥇', '🥈', '🥉'][i];
                return `<div class="bg-white border rounded-xl p-4">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="text-xl">${medal}</span>
                        <span class="font-bold text-gray-800">${s.lever.label}</span>
                        <span class="tag ${s.lever.type === 'price' ? 'tag-green' : s.lever.type === 'cost' ? 'tag-red' : 'tag-purple'}">${s.lever.group}</span>
                        <span class="text-xs text-gray-400 ml-auto">弹性 ${s.elasticity.toFixed(2)}</span>
                    </div>
                    <div class="grid grid-cols-4 gap-3 text-xs">
                        <div><span class="text-gray-500">基准值</span><br/><span class="font-semibold">${s.baseValue}${s.lever.unit}</span></div>
                        <div><span class="text-gray-500">每+${s.step}${s.lever.unit}</span><br/><span class="font-semibold text-green-600">+¥${formatNumber(Math.abs(Math.round(s.upProfitImpact)))}</span></div>
                        <div><span class="text-gray-500">每-${s.step}${s.lever.unit}</span><br/><span class="font-semibold text-red-600">-¥${formatNumber(Math.abs(Math.round(s.downProfitImpact)))}</span></div>
                        <div><span class="text-gray-500">最大波动</span><br/><span class="font-semibold">±¥${formatNumber(Math.round(s.tornadoRange / 2))}</span></div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div></div>`;
}

// ========== 杠杆模拟器 (三视角) ==========
function render3VLeverSimulator(perspective, model) {
    const container = document.getElementById('e-lever-simulator');
    if (!container) return;

    const levers = getELeversForPerspective(perspective);
    const baseMetrics = calcMetricsForPerspective(perspective, model);
    const pm = PERSPECTIVES[perspective];

    let html = `<div class="p-4">
        <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold text-gray-500 uppercase"><i class="fas fa-${pm.icon} mr-1" style="color:${pm.color}"></i>${pm.label} 杠杆模拟器</h4>
            <button class="text-xs text-ke-500 hover:text-ke-600" onclick="resetELevers()"><i class="fas fa-undo mr-1"></i>重置</button>
        </div>
        <div class="space-y-1 max-h-[400px] overflow-auto" id="e-lever-sliders" data-perspective="${perspective}">`;

    levers.forEach(lever => {
        const baseVal = lever.baseField && model[lever.baseField] !== undefined ? model[lever.baseField] : 0;
        const min = lever.min !== undefined ? lever.min : baseVal - Math.abs(lever.adjustStep) * 10;
        const max = lever.max !== undefined ? lever.max : baseVal + Math.abs(lever.adjustStep) * 10;
        const step = Math.abs(lever.adjustStep);
        const typeIcon = lever.type === 'price' ? '💰' : lever.type === 'cost' ? '📉' : '⚡';

        html += `<div class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50">
            <span class="text-sm">${typeIcon}</span>
            <span class="text-xs font-medium text-gray-600 w-28">${lever.label}</span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${baseVal}"
                data-lever-key="${lever.key}" data-base-value="${baseVal}" data-base-field="${lever.baseField || ''}"
                oninput="on3VLeverChange(this)" class="flex-1">
            <span class="text-xs font-bold w-20 text-right tabular-nums" id="elval-${lever.key}"
                style="color:${lever.color}">${typeof baseVal === 'number' ? (Number.isInteger(baseVal) ? baseVal : baseVal.toFixed(1)) : baseVal}${lever.unit}</span>
            <span class="text-xs w-16 text-right tabular-nums text-gray-400" id="eldelta-${lever.key}">+0</span>
        </div>`;
    });

    const outputLabel = perspective === 'supplier' ? '调整后总成本' : perspective === 'owner' ? '首年净回报' : '运营利润';
    const baseVal = Math.round(perspective === 'supplier' ? -baseMetrics.profit : baseMetrics.profit);

    html += `</div>
        <div class="mt-4 grid grid-cols-3 gap-3" id="e-lever-result">
            <div class="bg-gray-50 rounded-xl p-3 text-center">
                <div class="text-xs text-gray-500">${outputLabel}</div>
                <div class="text-xl font-bold text-gray-800" id="e-sim-profit">¥${formatNumber(baseVal)}</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 text-center">
                <div class="text-xs text-gray-500">变化金额</div>
                <div class="text-xl font-bold text-gray-400" id="e-sim-delta">¥0</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 text-center">
                <div class="text-xs text-gray-500">变化幅度</div>
                <div class="text-xl font-bold text-gray-400" id="e-sim-pct">0%</div>
            </div>
        </div>
    </div>`;
    container.innerHTML = html;
}

function on3VLeverChange(input) {
    const key = input.dataset.leverKey;
    const baseVal = parseFloat(input.dataset.baseValue);
    const newVal = parseFloat(input.value);
    const delta = newVal - baseVal;
    const perspective = AppState.currentPerspective;
    const levers = getELeversForPerspective(perspective);
    const lever = levers.find(l => l.key === key);

    const valEl = document.getElementById(`elval-${key}`);
    const deltaEl = document.getElementById(`eldelta-${key}`);
    if (valEl) valEl.textContent = (Number.isInteger(newVal) ? newVal : newVal.toFixed(1)) + (lever ? lever.unit : '');
    if (deltaEl) {
        deltaEl.textContent = (delta >= 0 ? '+' : '') + (Number.isInteger(delta) ? delta : delta.toFixed(1));
        const isGood = lever && lever.type === 'cost' ? delta < 0 : delta > 0;
        deltaEl.style.color = delta === 0 ? '#9ca3af' : isGood ? '#10b981' : '#ef4444';
    }

    recalculate3VSimulation();
}

function recalculate3VSimulation() {
    const perspective = AppState.currentPerspective;
    const city = AppState.currentCity;
    const product = AppState.currentProduct;
    const baseModel = getModelForPerspective(perspective, city, product);
    const model = JSON.parse(JSON.stringify(baseModel));
    const baseProfit = calcProfitForPerspective(perspective, baseModel);

    document.querySelectorAll('#e-lever-sliders input[type="range"]').forEach(input => {
        const field = input.dataset.baseField;
        if (field && model[field] !== undefined) {
            model[field] = parseFloat(input.value);
        }
    });

    // 联动
    if (perspective === 'beike') {
        model.net_revenue = model.gtv_per_unit * (model.commission_rate / 100);
    } else if (perspective === 'owner') {
        model.total_premium_income = model.rent_premium * model.avg_lease_months;
        model.first_year_return = model.rent_premium * 12;
        const dailyRent = model.avg_rent_after ? model.avg_rent_after / 30 : 240;
        model.vacancy_cost = model.vacancy_days * dailyRent;
        model.vacancy_reduction_value = (model.vacancy_reduction_days || 0) * dailyRent;
        model.beike_service_fee = model.renovation_total * 0.12;
        model.supplier_cost = model.renovation_total - model.beike_service_fee;
    }

    const adjustedProfit = calcProfitForPerspective(perspective, model);
    const delta = adjustedProfit - baseProfit;
    const pct = baseProfit !== 0 ? (delta / Math.abs(baseProfit) * 100) : 0;

    const displayProfit = perspective === 'supplier' ? -adjustedProfit : adjustedProfit;
    const displayDelta = perspective === 'supplier' ? -delta : delta;

    const profitEl = document.getElementById('e-sim-profit');
    const deltaEl = document.getElementById('e-sim-delta');
    const pctEl = document.getElementById('e-sim-pct');

    if (profitEl) profitEl.textContent = '¥' + formatNumber(Math.round(displayProfit));
    if (deltaEl) {
        deltaEl.textContent = (displayDelta >= 0 ? '+¥' : '-¥') + formatNumber(Math.abs(Math.round(displayDelta)));
        deltaEl.className = 'text-xl font-bold ' + (displayDelta > 0 ? 'text-green-600' : displayDelta < 0 ? 'text-red-600' : 'text-gray-400');
    }
    if (pctEl) {
        const displayPct = perspective === 'supplier' ? -pct : pct;
        pctEl.textContent = (displayPct >= 0 ? '+' : '') + displayPct.toFixed(1) + '%';
        pctEl.className = 'text-xl font-bold ' + (displayPct > 0 ? 'text-green-600' : displayPct < 0 ? 'text-red-600' : 'text-gray-400');
    }
}

// 兼容旧接口
function onELeverChange(input) { on3VLeverChange(input); }

function resetELevers() {
    const perspective = AppState.currentPerspective;
    const model = getModelForPerspective(perspective, AppState.currentCity, AppState.currentProduct);
    const levers = getELeversForPerspective(perspective);

    document.querySelectorAll('#e-lever-sliders input[type="range"]').forEach(input => {
        const baseVal = parseFloat(input.dataset.baseValue);
        input.value = baseVal;
        const key = input.dataset.leverKey;
        const lever = levers.find(l => l.key === key);
        const valEl = document.getElementById(`elval-${key}`);
        const deltaEl = document.getElementById(`eldelta-${key}`);
        if (valEl) valEl.textContent = (Number.isInteger(baseVal) ? baseVal : baseVal.toFixed(1)) + (lever ? lever.unit : '');
        if (deltaEl) { deltaEl.textContent = '+0'; deltaEl.style.color = '#9ca3af'; }
    });
    recalculate3VSimulation();
    showToast('杠杆已重置');
}

// ========== 旧函数兼容层（cross-analysis/alignment/flywheel 可能调用）==========
function calculateFeeVsPriceAnalysis(baseModel) {
    const strategies = build3VStrategies('beike', baseModel);
    return {
        baseline: { label: strategies[0].label, revenue: 0, profit: strategies[0].profit, margin: 0, color: strategies[0].color },
        feeUp: { label: strategies[1].label, profit: strategies[1].profit, profitDelta: strategies[1].profitDelta, color: strategies[1].color },
        costDown: { label: strategies[2].label, profit: strategies[2].profit, profitDelta: strategies[2].profitDelta, color: strategies[2].color },
        mix: { label: strategies[3].label, profit: strategies[3].profit, profitDelta: strategies[3].profitDelta, color: strategies[3].color },
    };
}
