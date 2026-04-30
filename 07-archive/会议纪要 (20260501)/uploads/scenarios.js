// ===== Scenario Comparison Module =====

function renderScenarioSelector() {
    const container = document.getElementById('scenario-selector');
    if (!container) return;

    let html = '';
    AppState.themes.forEach(theme => {
        const experiments = getThemeExperiments(theme.id);
        if (experiments.length === 0) return;

        html += `
        <div class="w-full">
            <div class="flex items-center gap-2 mb-2 mt-2 first:mt-0">
                <i class="fas fa-${theme.icon} text-sm" style="color: ${theme.color}"></i>
                <span class="text-sm font-bold" style="color: ${theme.color}">${theme.theme_name}</span>
                <div class="flex-1 h-px bg-gray-200"></div>
            </div>
            <div class="flex flex-wrap gap-2 ml-4">`;

        experiments.forEach(asmp => {
            const isSelected = AppState.selectedAssumptions.includes(asmp.id);
            const statusTag = getStatusTag(asmp.validation_status);
            html += `<label class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-ke-400 bg-ke-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleScenarioSelection('${asmp.id}')" class="rounded text-ke-500 focus:ring-ke-500">
                <span class="text-sm font-medium text-gray-700">${asmp.assumption_name}</span>
                ${statusTag}
                <span class="text-xs text-gray-400">(P${asmp.priority})</span>
            </label>`;
        });

        html += `</div></div>`;
    });
    container.innerHTML = html;
}

function toggleScenarioSelection(id) {
    const idx = AppState.selectedAssumptions.indexOf(id);
    if (idx >= 0) {
        AppState.selectedAssumptions.splice(idx, 1);
    } else {
        AppState.selectedAssumptions.push(id);
    }
    renderScenarioSelector();
    // 自动重新运行推演对比，更新图表和表格
    runScenarioComparison();
}

function selectAllAssumptions() {
    if (AppState.selectedAssumptions.length === AppState.assumptions.length) {
        AppState.selectedAssumptions = [];
    } else {
        AppState.selectedAssumptions = AppState.assumptions.map(a => a.id);
    }
    renderScenarioSelector();
    // 自动重新运行推演对比，更新图表和表格
    runScenarioComparison();
}

function runScenarioComparison() {
    if (AppState.selectedAssumptions.length === 0) {
        showToast('请至少选择一个战略假设进行推演', 'error');
        return;
    }

    // 获取三视角基准模型
    const city = AppState.currentCity;
    const product = AppState.currentProduct;
    const baselineModels = {
        beike: AppState.baselineModels[city] || AppState.baselineModels.beike,
        owner: AppState.ownerModels?.[city]?.[product] || DEFAULT_OWNER_MODELS[city]?.[product],
        supplier: product === 'standard' ? (AppState.baselineModels.supplier?.standard || DEFAULT_SUPPLIER_MODELS.standard) : null
    };
    
    const scenarios = [];

    AppState.selectedAssumptions.forEach(id => {
        const asmp = AppState.assumptions.find(a => a.id === id);
        if (asmp) {
            // 获取目标场景的参数（优先使用scenarios.target中的参数）
            const targetScenario = asmp.scenarios?.target || {};
            const scenarioParams = {
                param_adjustments: targetScenario.param_adjustments || asmp.param_adjustments || {},
                adjustment_type: targetScenario.adjustment_type || asmp.adjustment_type || {}
            };
            
            // DEBUG: 检查供应商参数
            if (scenarioParams.param_adjustments.foreman || scenarioParams.param_adjustments.furniture) {
                console.log(`[DEBUG] ${asmp.id} 供应商参数:`, scenarioParams.param_adjustments);
            }
            
            // 应用假设到三视角模型
            const adjustedModels = applyAssumption(baselineModels, scenarioParams);
            
            // DEBUG: 检查调整后的供应商模型
            if (adjustedModels.supplier) {
                console.log(`[DEBUG] ${asmp.id} 调整后工长成本:`, adjustedModels.supplier.foreman);
            }
            
            scenarios.push({
                id: asmp.id,
                name: asmp.assumption_name,
                assumption: asmp,
                models: adjustedModels,
                // 贝壳UE计算
                ue: adjustedModels.beike ? calculateBeikeUE(adjustedModels.beike) : null,
                // 业主UE计算
                ownerUE: adjustedModels.owner ? calculateOwnerUE(adjustedModels.owner) : null,
                // 供应商UE计算
                supplierUE: adjustedModels.supplier ? calculateSupplierUE(adjustedModels.supplier) : null,
                // 财务推演（基于贝壳模型）
                projection: adjustedModels.beike ? generateFinancialProjection(adjustedModels.beike, AppState.scaleParams, AppState.scaleParams.projectionMonths) : null
            });
        }
    });

    // Render comparison
    if (baselineModels.beike) {
        renderScenarioParamsChart(baselineModels.beike, scenarios);
        renderScenarioFinancialChart(baselineModels.beike, scenarios);
        renderScenarioComparisonTable(baselineModels, scenarios);
    }

    showToast(`已完成 ${scenarios.length} 个假设的三视角推演对比`);
}

function renderScenarioComparisonTable(baselineModels, scenarios) {
    const thead = document.getElementById('scenario-table-head');
    const tbody = document.getElementById('scenario-table-body');
    if (!thead || !tbody) return;

    // 获取三视角基准模型
    const baselineBeike = baselineModels.beike || baselineModels;
    const baselineOwner = baselineModels.owner;
    const baselineSupplier = baselineModels.supplier;
    
    // 计算三视角UE
    const baseUE = baselineBeike ? calculateBeikeUE(baselineBeike) : null;
    const baseOwnerUE = baselineOwner ? calculateOwnerUE(baselineOwner) : null;
    const baseSupplierUE = baselineSupplier ? calculateSupplierUE(baselineSupplier) : null;
    
    const baseProj = baselineBeike ? generateFinancialProjection(baselineBeike, AppState.scaleParams, AppState.scaleParams.projectionMonths) : null;
    const baseAnnual = baseProj ? aggregateAnnual(baseProj) : null;

    // Table header
    let headerHtml = '<th class="text-left px-4 py-2 text-gray-500 font-medium">指标</th>';
    headerHtml += '<th class="text-right px-4 py-2 text-gray-500 font-medium bg-ke-50">基准模型</th>';
    scenarios.forEach(s => {
        headerHtml += `<th class="text-right px-4 py-2 text-gray-500 font-medium">${s.name}</th>`;
        headerHtml += `<th class="text-right px-4 py-2 text-gray-400 font-medium text-xs">vs基准</th>`;
    });
    thead.innerHTML = headerHtml;

    // Rows definition - 三视角UE对比
    const rows = [
        { label: '🐚 贝壳UE（P&L视角）', isSection: true },
        { label: '单套GTV', format: v => formatCurrency(v), getBase: () => baseUE?.gtv, getScenario: s => s.ue?.gtv },
        { label: '单套净收入', format: v => formatCurrency(v), getBase: () => baseUE?.netRevenue, getScenario: s => s.ue?.netRevenue },
        { label: '单套运营利润', format: v => formatCurrency(v), getBase: () => baseUE?.operatingProfit, getScenario: s => s.ue?.operatingProfit },
        { label: '利润率', format: v => formatPercent(v), getBase: () => baseUE?.profitMargin, getScenario: s => s.ue?.profitMargin },
        { label: '月目标单量', format: v => v + '套', getBase: () => baselineBeike?.monthly_target_units, getScenario: s => s.models?.beike?.monthly_target_units },
        
        { label: '🏠 业主UE（投资回报视角）', isSection: true },
        { label: '月租金溢价', format: v => formatCurrency(v), getBase: () => baseOwnerUE?.fullMonthRent, getScenario: s => s.ownerUE?.fullMonthRent },
        { label: '装修总投资', format: v => formatCurrency(v), getBase: () => baseOwnerUE?.renovationTotal, getScenario: s => s.ownerUE?.renovationTotal },
        { label: '回本月数', format: v => v + '月', getBase: () => baseOwnerUE?.paybackMonths, getScenario: s => s.ownerUE?.paybackMonths },
        { label: '年化收益率', format: v => v.toFixed(1) + '%', getBase: () => baseOwnerUE?.annualYield, getScenario: s => s.ownerUE?.annualYield },
        
        { label: '🔧 供应商UE（成本结构视角）', isSection: true },
        { label: '供应商总成本', format: v => formatCurrency(v), getBase: () => baseSupplierUE?.totalCost, getScenario: s => s.supplierUE?.totalCost },
        { label: '工长成本', format: v => formatCurrency(v), getBase: () => baseSupplierUE?.laborCost, getScenario: s => s.supplierUE?.laborCost },
        { label: '主材成本', format: v => formatCurrency(v), getBase: () => baseSupplierUE?.materialCost, getScenario: s => s.supplierUE?.materialCost },
        { label: '贝壳荐客费', format: v => formatCurrency(v), getBase: () => baseSupplierUE?.beikeFee, getScenario: s => s.supplierUE?.beikeFee },
    ];
    
    // 只有基础数据存在时才显示年度财务指标
    if (baseAnnual) {
        rows.push(
            { label: '📈 年度财务指标（贝壳）', isSection: true },
            { label: '年度签约量', format: v => Math.round(v) + '套', getBase: () => baseAnnual.units, getScenario: s => s.projection ? aggregateAnnual(s.projection).units : 0 },
            { label: '年度GTV', format: v => (v/10000).toFixed(0) + '万', getBase: () => baseAnnual.gtv * 10000, getScenario: s => s.projection ? aggregateAnnual(s.projection).gtv * 10000 : 0 },
            { label: '年度经营利润', format: v => v.toFixed(0) + '万', getBase: () => baseAnnual.operatingProfit, getScenario: s => s.projection ? aggregateAnnual(s.projection).operatingProfit : 0 }
        );
    }

    let bodyHtml = '';
    rows.forEach(row => {
        if (row.isSection) {
            bodyHtml += `<tr><td colspan="${2 + scenarios.length * 2}" class="px-4 py-2 font-bold text-gray-800 bg-gray-50 text-sm">${row.label}</td></tr>`;
            return;
        }
        
        const baseVal = row.getBase();
        // 如果基准值为null/undefined，显示"-"
        if (baseVal === null || baseVal === undefined) {
            bodyHtml += '<tr>';
            bodyHtml += `<td class="text-left px-4 py-2 text-sm font-medium text-gray-600">${row.label}</td>`;
            bodyHtml += `<td class="text-right px-4 py-2 font-mono text-sm bg-ke-50">-</td>`;
            scenarios.forEach(() => {
                bodyHtml += `<td class="text-right px-4 py-2 font-mono text-sm">-</td>`;
                bodyHtml += `<td class="text-right px-3 py-2 text-xs">-</td>`;
            });
            bodyHtml += '</tr>';
            return;
        }
        
        bodyHtml += '<tr>';
        bodyHtml += `<td class="text-left px-4 py-2 text-sm font-medium text-gray-600">${row.label}</td>`;
        bodyHtml += `<td class="text-right px-4 py-2 font-mono text-sm bg-ke-50 font-semibold">${row.format(baseVal)}</td>`;

        scenarios.forEach(s => {
            const sVal = row.getScenario(s);
            if (sVal === null || sVal === undefined) {
                bodyHtml += `<td class="text-right px-4 py-2 font-mono text-sm">-</td>`;
                bodyHtml += `<td class="text-right px-3 py-2 text-xs">-</td>`;
            } else {
                const diff = baseVal !== 0 ? ((sVal - baseVal) / Math.abs(baseVal) * 100) : 0;
                const diffClass = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : '';
                const diffIcon = diff > 0 ? '↑' : diff < 0 ? '↓' : '-';
                bodyHtml += `<td class="text-right px-4 py-2 font-mono text-sm">${row.format(sVal)}</td>`;
                bodyHtml += `<td class="text-right px-3 py-2 text-xs ${diffClass}">${diffIcon}${Math.abs(diff).toFixed(1)}%</td>`;
            }
        });

        bodyHtml += '</tr>';
    });

    tbody.innerHTML = bodyHtml;
}

function aggregateAnnual(projections) {
    if (!projections || projections.length === 0) {
        return { units: 0, gtv: 0, revenue: 0, grossProfit: 0, operatingProfit: 0, netProfit: 0, directCost: 0, personnelCost: 0 };
    }
    return {
        units: projections.reduce((s, p) => s + (p.units || 0), 0),
        gtv: projections.reduce((s, p) => s + (p.gtv || 0), 0),
        revenue: projections.reduce((s, p) => s + (p.revenue || 0), 0),
        grossProfit: projections.reduce((s, p) => s + (p.grossProfit || 0), 0),
        operatingProfit: projections.reduce((s, p) => s + (p.operatingProfit || 0), 0),
        netProfit: projections.reduce((s, p) => s + (p.netProfit || 0), 0),
        directCost: projections.reduce((s, p) => s + (p.directCost || 0), 0),
        personnelCost: projections.reduce((s, p) => s + (p.personnelCost || 0), 0),
    };
}