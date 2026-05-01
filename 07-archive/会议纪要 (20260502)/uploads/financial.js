// ===== Financial Statements Module =====

function renderFinancialPage() {
    populateFinancialModelSelect();
    refreshFinancialStatements();
}

function populateFinancialModelSelect() {
    const select = document.getElementById('financial-model-select');
    if (!select) return;

    let html = '<option value="baseline_beijing">基准模型 - 北京</option>';
    html += '<option value="baseline_shanghai">基准模型 - 上海</option>';
    AppState.assumptions.forEach(asmp => {
        html += `<option value="asmp_${asmp.id}">假设: ${asmp.assumption_name}</option>`;
    });
    select.innerHTML = html;
}

function switchFinancialModel(value) {
    refreshFinancialStatements();
}

function refreshFinancialStatements() {
    const modelSelect = document.getElementById('financial-model-select');
    const periodSelect = document.getElementById('financial-period-select');
    if (!modelSelect) return;

    const modelValue = modelSelect.value;
    const period = periodSelect ? periodSelect.value : 'annual';

    let model;
    let modelLabel = '';

    if (modelValue === 'baseline_beijing') {
        model = AppState.baselineModels.beijing;
        modelLabel = '基准-北京';
    } else if (modelValue === 'baseline_shanghai') {
        model = AppState.baselineModels.shanghai;
        modelLabel = '基准-上海';
    } else if (modelValue.startsWith('asmp_')) {
        const asmpId = modelValue.replace('asmp_', '');
        const asmp = AppState.assumptions.find(a => a.id === asmpId);
        if (asmp) {
            model = applyAssumption(AppState.baselineModels[AppState.currentCity], asmp);
            modelLabel = asmp.assumption_name;
        } else {
            model = AppState.baselineModels.beijing;
            modelLabel = '基准-北京';
        }
    } else {
        model = AppState.baselineModels.beijing;
        modelLabel = '基准-北京';
    }

    let months = 12;
    if (period === 'monthly') months = 12;
    else if (period === 'quarterly') months = 12;
    else months = 36;

    const projections = generateFinancialProjection(model, AppState.scaleParams, months);

    // Aggregate by period
    let aggregated;
    if (period === 'quarterly') {
        aggregated = aggregateByQuarter(projections);
    } else if (period === 'annual') {
        aggregated = aggregateByYear(projections);
    } else {
        aggregated = projections;
    }

    renderFinancialKPIs(aggregated, modelLabel);
    renderRevenueTrendChart(projections, modelLabel);
    renderCostBreakdownChart(projections);
    renderIncomeStatementTable(aggregated, period);
}

function aggregateByQuarter(projections) {
    const quarters = [];
    for (let q = 0; q < Math.ceil(projections.length / 3); q++) {
        const slice = projections.slice(q * 3, (q + 1) * 3);
        if (slice.length === 0) continue;
        quarters.push({
            month: `Q${q + 1}`,
            units: slice.reduce((s, p) => s + p.units, 0),
            gtv: slice.reduce((s, p) => s + p.gtv, 0),
            revenue: slice.reduce((s, p) => s + p.revenue, 0),
            directCost: slice.reduce((s, p) => s + p.directCost, 0),
            grossProfit: slice.reduce((s, p) => s + p.grossProfit, 0),
            grossMargin: slice[0].grossMargin,
            personnelCost: slice.reduce((s, p) => s + p.personnelCost, 0),
            operatingExpense: slice.reduce((s, p) => s + p.operatingExpense, 0),
            marketingExpense: slice.reduce((s, p) => s + p.marketingExpense, 0),
            totalExpense: slice.reduce((s, p) => s + p.totalExpense, 0),
            operatingProfit: slice.reduce((s, p) => s + p.operatingProfit, 0),
            operatingMargin: 0,
            netProfit: slice.reduce((s, p) => s + p.netProfit, 0),
            headcount: slice[0].headcount,
            perCapitaRevenue: 0,
            perCapitaUnits: 0,
            cashFlow: slice.reduce((s, p) => s + p.cashFlow, 0)
        });
        const last = quarters[quarters.length - 1];
        last.operatingMargin = last.revenue > 0 ? (last.operatingProfit / last.revenue * 100) : 0;
        last.perCapitaRevenue = last.revenue / last.headcount;
        last.perCapitaUnits = last.units / last.headcount;
    }
    return quarters;
}

function aggregateByYear(projections) {
    const years = [];
    for (let y = 0; y < Math.ceil(projections.length / 12); y++) {
        const slice = projections.slice(y * 12, (y + 1) * 12);
        if (slice.length === 0) continue;
        years.push({
            month: `Y${y + 1}`,
            units: slice.reduce((s, p) => s + p.units, 0),
            gtv: slice.reduce((s, p) => s + p.gtv, 0),
            revenue: slice.reduce((s, p) => s + p.revenue, 0),
            directCost: slice.reduce((s, p) => s + p.directCost, 0),
            grossProfit: slice.reduce((s, p) => s + p.grossProfit, 0),
            grossMargin: slice[0].grossMargin,
            personnelCost: slice.reduce((s, p) => s + p.personnelCost, 0),
            operatingExpense: slice.reduce((s, p) => s + p.operatingExpense, 0),
            marketingExpense: slice.reduce((s, p) => s + p.marketingExpense, 0),
            totalExpense: slice.reduce((s, p) => s + p.totalExpense, 0),
            operatingProfit: slice.reduce((s, p) => s + p.operatingProfit, 0),
            operatingMargin: 0,
            netProfit: slice.reduce((s, p) => s + p.netProfit, 0),
            headcount: slice[0].headcount,
            perCapitaRevenue: 0,
            perCapitaUnits: 0,
            cashFlow: slice.reduce((s, p) => s + p.cashFlow, 0)
        });
        const last = years[years.length - 1];
        last.operatingMargin = last.revenue > 0 ? (last.operatingProfit / last.revenue * 100) : 0;
        last.perCapitaRevenue = last.revenue / last.headcount;
        last.perCapitaUnits = last.units / last.headcount;
    }
    return years;
}

function renderFinancialKPIs(data, label) {
    const container = document.getElementById('financial-kpis');
    if (!container) return;

    const total = {
        revenue: data.reduce((s, d) => s + d.revenue, 0),
        grossProfit: data.reduce((s, d) => s + d.grossProfit, 0),
        operatingProfit: data.reduce((s, d) => s + d.operatingProfit, 0),
        netProfit: data.reduce((s, d) => s + d.netProfit, 0),
        units: data.reduce((s, d) => s + d.units, 0),
        gtv: data.reduce((s, d) => s + d.gtv, 0)
    };

    const kpis = [
        { label: '总GTV', value: total.gtv.toFixed(0) + '万', color: 'ke', icon: 'chart-bar' },
        { label: '总收入', value: total.revenue.toFixed(0) + '万', color: 'blue', icon: 'coins' },
        { label: '毛利润', value: total.grossProfit.toFixed(0) + '万', color: 'green', icon: 'chart-line' },
        { label: '经营利润', value: total.operatingProfit.toFixed(0) + '万', color: 'purple', icon: 'trending-up' },
        { label: '净利润', value: total.netProfit.toFixed(0) + '万', color: total.netProfit >= 0 ? 'teal' : 'red', icon: 'wallet' },
        { label: '总签约', value: total.units + '套', color: 'amber', icon: 'file-signature' }
    ];

    const colorMap = {
        ke: 'from-ke-50 to-ke-100 border-ke-200 text-ke-700',
        blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
        green: 'from-green-50 to-green-100 border-green-200 text-green-700',
        purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
        teal: 'from-teal-50 to-teal-100 border-teal-200 text-teal-700',
        amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
        red: 'from-red-50 to-red-100 border-red-200 text-red-700'
    };

    container.innerHTML = kpis.map(k => `
        <div class="metric-card bg-gradient-to-br ${colorMap[k.color]}">
            <div class="text-xs font-medium opacity-70">${k.label}</div>
            <div class="text-xl font-bold mt-1">${k.value}</div>
        </div>`).join('');
}

function renderIncomeStatementTable(data, period) {
    const thead = document.getElementById('income-table-head');
    const tbody = document.getElementById('income-table-body');
    if (!thead || !tbody) return;

    const periodLabel = period === 'monthly' ? 'M' : period === 'quarterly' ? 'Q' : 'Y';

    // Header
    let headerHtml = '<th class="text-left px-4 py-2 text-gray-500 font-medium sticky left-0 bg-gray-50 z-10">科目</th>';
    data.forEach(d => {
        headerHtml += `<th class="text-right px-4 py-2 text-gray-500 font-medium min-w-[100px]">${typeof d.month === 'string' ? d.month : periodLabel + d.month}</th>`;
    });
    headerHtml += '<th class="text-right px-4 py-2 text-gray-500 font-medium bg-ke-50 min-w-[100px]">合计</th>';
    thead.innerHTML = headerHtml;

    // Row definitions
    const rowDefs = [
        { label: '签约套数', key: 'units', format: v => Math.round(v), isHeader: false },
        { label: 'GTV', key: 'gtv', format: v => v.toFixed(1), isHeader: false },
        { label: '总收入', key: 'revenue', format: v => v.toFixed(1), isHeader: true, cls: 'row-subtotal' },
        { label: '直接成本', key: 'directCost', format: v => '-' + v.toFixed(1), isNegative: true },
        { label: '毛利润', key: 'grossProfit', format: v => v.toFixed(1), cls: 'row-subtotal' },
        { label: '毛利率(%)', key: 'grossMargin', format: v => v.toFixed(1) + '%', isPercent: true },
        { label: '人员成本', key: 'personnelCost', format: v => '-' + v.toFixed(1), isNegative: true },
        { label: '运营费用', key: 'operatingExpense', format: v => '-' + v.toFixed(1), isNegative: true },
        { label: '营销费用', key: 'marketingExpense', format: v => '-' + v.toFixed(1), isNegative: true },
        { label: '经营利润', key: 'operatingProfit', format: v => v.toFixed(1), cls: 'row-subtotal' },
        { label: '经营利润率(%)', key: 'operatingMargin', format: v => v.toFixed(1) + '%', isPercent: true },
        { label: '净利润', key: 'netProfit', format: v => v.toFixed(1), cls: 'row-total' },
        { label: '人均产出(万)', key: 'perCapitaRevenue', format: v => v.toFixed(2) },
        { label: '人均签约(套)', key: 'perCapitaUnits', format: v => v.toFixed(1) },
    ];

    let bodyHtml = '';
    rowDefs.forEach(row => {
        bodyHtml += `<tr class="${row.cls || ''}">`;
        bodyHtml += `<td class="text-left px-4 font-medium sticky left-0 bg-white z-10 ${row.cls || ''}">${row.label}</td>`;

        let total = 0;
        data.forEach(d => {
            const val = d[row.key] || 0;
            if (!row.isPercent) total += val;
            const valClass = val < 0 ? 'negative' : '';
            bodyHtml += `<td class="text-right px-4 font-mono text-sm ${valClass}">${row.format(val)}</td>`;
        });

        // Total column
        if (row.isPercent) {
            const avg = data.length > 0 ? data.reduce((s, d) => s + (d[row.key] || 0), 0) / data.length : 0;
            bodyHtml += `<td class="text-right px-4 font-mono text-sm font-bold bg-ke-50">${avg.toFixed(1)}%</td>`;
        } else {
            const totalClass = total < 0 ? 'negative' : '';
            bodyHtml += `<td class="text-right px-4 font-mono text-sm font-bold bg-ke-50 ${totalClass}">${row.format(total)}</td>`;
        }
        bodyHtml += '</tr>';
    });

    tbody.innerHTML = bodyHtml;
}

function exportFinancialData() {
    const table = document.getElementById('income-statement-table');
    if (!table) return;

    let csv = '';
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('th, td');
        const rowData = Array.from(cells).map(c => c.textContent.trim());
        csv += rowData.join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `美租财务报表_${new Date().toLocaleDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('财务报表导出成功');
}