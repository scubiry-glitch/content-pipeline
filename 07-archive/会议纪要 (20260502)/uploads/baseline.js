// ===== Baseline UE Model Module =====

let dragState = { dragging: false, dragEl: null, startY: 0, placeholder: null };

function renderBaselineEditor() {
    const city = AppState.currentCity;
    const model = AppState.baselineModels[city];
    renderBaselineParams(model);
    updateBaselineMetrics(model);
    renderUEWaterfallChart(model);
    renderUEDetailTable(model);
    renderScaleParams();
    generateFinancialFromBaseline();
}

function renderBaselineParams(model) {
    const container = document.getElementById('baseline-params-container');
    if (!container) return;

    const categories = {};
    UE_PARAMS.forEach(p => {
        if (!categories[p.category]) categories[p.category] = [];
        categories[p.category].push(p);
    });

    let html = '';
    for (const [cat, params] of Object.entries(categories)) {
        const catColors = { '收入': 'text-green-600 bg-green-50', '成本': 'text-red-600 bg-red-50', '利润': 'text-blue-600 bg-blue-50', '运营': 'text-purple-600 bg-purple-50' };
        html += `<div class="mb-3">
            <div class="text-xs font-bold ${catColors[cat] || 'text-gray-600 bg-gray-50'} px-3 py-1.5 rounded-lg mb-1 inline-block">${cat}参数</div>`;

        params.forEach(p => {
            const val = model[p.key];
            html += `
            <div class="param-slider-group" draggable="true" data-param-key="${p.key}"
                 ondragstart="onParamDragStart(event)" ondragover="onParamDragOver(event)" 
                 ondrop="onParamDrop(event)" ondragend="onParamDragEnd(event)">
                <div class="param-label">
                    <i class="fas fa-grip-vertical text-gray-300 mr-1.5 cursor-grab"></i>${p.label}
                </div>
                <div class="param-slider flex-1">
                    <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
                        data-key="${p.key}" oninput="onBaselineParamChange(this)">
                </div>
                <div class="param-value" id="pval-${p.key}">${formatParamValue(val, p)}</div>
            </div>`;
        });
        html += '</div>';
    }
    container.innerHTML = html;
}

function formatParamValue(val, param) {
    if (param.unit === '%') return formatPercent(val);
    if (param.unit.includes('元')) return formatCurrency(val);
    return val + param.unit.replace('/', '/');
}

function onBaselineParamChange(input) {
    const key = input.dataset.key;
    const val = parseFloat(input.value);
    const model = AppState.baselineModels[AppState.currentCity];
    model[key] = val;

    // Auto-calculate dependent fields
    if (key === 'avg_rent_before' || key === 'rent_premium_rate') {
        model.avg_rent_after = Math.round(model.avg_rent_before * (1 + model.rent_premium_rate / 100));
        const afterSlider = document.querySelector(`input[data-key="avg_rent_after"]`);
        if (afterSlider) afterSlider.value = model.avg_rent_after;
        const afterLabel = document.getElementById('pval-avg_rent_after');
        if (afterLabel) afterLabel.textContent = formatCurrency(model.avg_rent_after);
    }
    if (key === 'avg_rent_after') {
        model.rent_premium_rate = ((model.avg_rent_after / model.avg_rent_before - 1) * 100);
        const rateSlider = document.querySelector(`input[data-key="rent_premium_rate"]`);
        if (rateSlider) rateSlider.value = model.rent_premium_rate;
        const rateLabel = document.getElementById('pval-rent_premium_rate');
        if (rateLabel) rateLabel.textContent = formatPercent(model.rent_premium_rate);
    }
    if (key === 'gtv_per_unit' || key === 'service_fee_rate') {
        model.revenue_per_unit = model.gtv_per_unit * (model.service_fee_rate / 100);
    }

    // Update display
    const param = UE_PARAMS.find(p => p.key === key);
    const label = document.getElementById(`pval-${key}`);
    if (label && param) label.textContent = formatParamValue(val, param);

    updateBaselineMetrics(model);
    renderUEWaterfallChart(model);
    renderUEDetailTable(model);

    // Debounce financial update
    clearTimeout(window._finPreviewTimer);
    window._finPreviewTimer = setTimeout(() => generateFinancialFromBaseline(), 300);
}

function updateBaselineMetrics(model) {
    const ue = calculateUE(model);
    document.getElementById('metric-gtv').textContent = formatCurrency(ue.gtv);
    document.getElementById('metric-revenue').textContent = formatCurrency(ue.totalRevenue);
    document.getElementById('metric-profit').textContent = formatCurrency(ue.grossProfit);
}

function renderUEDetailTable(model) {
    const tbody = document.getElementById('ue-detail-tbody');
    if (!tbody) return;

    const ue = calculateUE(model);
    let html = '';
    ue.lineItems.forEach(item => {
        const rowClass = item.isTotal ? 'row-total' : item.isSubtotal ? 'row-subtotal' : '';
        const valClass = item.value < 0 ? 'negative' : item.value > 0 ? 'positive' : '';
        const displayVal = item.isPercent ? formatPercent(item.value) : formatCurrency(Math.abs(Math.round(item.value)));
        const pctDisplay = item.isPercent ? '-' : (item.pct ? formatPercent(item.pct) : '-');
        html += `<tr class="${rowClass}">
            <td class="text-left px-4 ${item.name.startsWith('├') ? 'pl-8 text-gray-500' : 'font-medium'}">${item.name}</td>
            <td class="text-right px-4 ${valClass} font-mono">${item.value < 0 ? '-' : ''}${displayVal}</td>
            <td class="text-right px-4 text-gray-400">${pctDisplay}</td>
            <td class="text-right px-4 text-xs text-gray-400">${item.isTotal ? '= 总收入 × 毛利率' : item.isSubtotal ? '合计' : ''}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function renderScaleParams() {
    const container = document.getElementById('scale-params');
    if (!container) return;

    let html = '';
    SCALE_PARAMS.forEach(p => {
        const val = AppState.scaleParams[p.key];
        html += `<div>
            <label class="text-xs font-medium text-gray-500 block mb-1">${p.label}</label>
            <div class="flex items-center gap-2">
                <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
                    data-scale-key="${p.key}" oninput="onScaleParamChange(this)" class="flex-1">
                <span class="text-xs font-bold text-gray-700 w-16 text-right tabular-nums" id="sval-${p.key}">${val}${p.unit}</span>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function onScaleParamChange(input) {
    const key = input.dataset.scaleKey;
    const val = parseFloat(input.value);
    AppState.scaleParams[key] = val;
    const param = SCALE_PARAMS.find(p => p.key === key);
    document.getElementById(`sval-${key}`).textContent = val + param.unit;

    clearTimeout(window._finPreviewTimer);
    window._finPreviewTimer = setTimeout(() => generateFinancialFromBaseline(), 300);
}

function generateFinancialFromBaseline() {
    const model = AppState.baselineModels[AppState.currentCity];
    const projections = generateFinancialProjection(model, AppState.scaleParams, AppState.scaleParams.projectionMonths);
    AppState.financialData.baseline = projections;
    renderFinancialPreviewChart(projections);
}

function switchBaselineCity(city) {
    AppState.currentCity = city === 'shanghai' ? 'shanghai' : 'beijing';
    renderBaselineEditor();
}

function resetBaselineParams() {
    const city = AppState.currentCity;
    AppState.baselineModels[city] = JSON.parse(JSON.stringify(DEFAULT_BASELINES[city]));
    renderBaselineEditor();
    showToast('参数已重置为默认值');
}

function addNewBaselineModel() {
    showToast('新模型创建功能 - 请在参数面板中调整后保存', 'info');
}

function exportBaselineData() {
    const model = AppState.baselineModels[AppState.currentCity];
    const ue = calculateUE(model);
    let csv = 'BOM: \uFEFF';
    csv = '科目,金额(元),占比(%)\n';
    ue.lineItems.forEach(item => {
        csv += `${item.name.replace('├ ', '')},${Math.round(item.value)},${item.pct || ''}\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `UE基准模型_${model.city}_${new Date().toLocaleDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功');
}

// Drag & Drop for param reordering
function onParamDragStart(e) {
    const el = e.target.closest('.param-slider-group');
    if (!el) return;
    dragState.dragEl = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.paramKey);
}

function onParamDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.param-slider-group');
    if (target && target !== dragState.dragEl) {
        const container = target.parentNode;
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            container.insertBefore(dragState.dragEl, target);
        } else {
            container.insertBefore(dragState.dragEl, target.nextSibling);
        }
    }
}

function onParamDrop(e) {
    e.preventDefault();
}

function onParamDragEnd(e) {
    if (dragState.dragEl) {
        dragState.dragEl.classList.remove('dragging');
    }
    dragState.dragEl = null;
}