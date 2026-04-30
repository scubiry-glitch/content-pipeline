// ===== U×E 交叉分析模块 (重构版) =====
// 核心：计算每个U维度（房/单/客/人）对每个E杠杆的弹性矩阵，找到阿基米德支点
// 阿基米德支点 = 某个U维度 × 某个E杠杆的组合，利润撬动力最大
// 弹性 = (U维度利润变化%) / (E参数变化%)

// ========== U维度标签映射 ==========

const U_DIM_META = {
    unit: { label: '房(套)', color: '#6366f1', icon: 'home' },
    order: { label: '漏斗(单)', color: '#2f9668', icon: 'filter' },
    customer: { label: '业主(客)', color: '#f59e0b', icon: 'user-tie' },
    staff: { label: '美租顾问(人)', color: '#ec4899', icon: 'user-shield' }
};

const U_DIM_KEYS = ['unit', 'order', 'customer', 'staff'];

// ========== U维度评分 → E杠杆权重联动引擎 ==========
// 核心逻辑：U评分越低的维度 → 对应E杠杆的优先权重越高（短板驱动优先修复）
function calculateUWeightedEPriority(perspective) {
    const dims = calculateAllUDimensions();
    const levers = getELeversForPerspective(perspective);
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const model = getModelForPerspective(perspective, city, prod);
    const sensitivities = calculateAll3VSensitivities(perspective, model);

    // U维度评分 → 权重（反比：分数越低权重越高）
    const totalScore = Object.values(dims).reduce((s, d) => s + d.score, 0);
    const uWeights = {};
    Object.entries(dims).forEach(([key, dim]) => {
        // 反比权重：(100 - score) / sum(100 - score)
        uWeights[key] = {
            score: dim.score,
            weight: 100 - dim.score,
            label: dim.label,
            color: dim.color,
            highlight: dim.highlight,
        };
    });
    const totalWeight = Object.values(uWeights).reduce((s, w) => s + w.weight, 0);
    Object.values(uWeights).forEach(w => { w.normalizedWeight = totalWeight > 0 ? (w.weight / totalWeight) : 0.25; });

    // E杠杆 → U维度映射（哪些杠杆影响哪些U维度）
    const leverToUMapping = buildLeverToUMapping(perspective);

    // 计算加权优先级
    const weightedLevers = sensitivities.map(s => {
        const affectedUs = leverToUMapping[s.lever.key] || ['unit'];
        let uPriorityScore = 0;
        affectedUs.forEach(uKey => {
            if (uWeights[uKey]) {
                uPriorityScore += uWeights[uKey].normalizedWeight;
            }
        });
        // 综合优先级 = 弹性 × 龙卷风范围 × U维度权重
        const compositePriority = s.elasticity * (s.tornadoRange / 1000) * (1 + uPriorityScore);
        return {
            ...s,
            affectedUs,
            uPriorityScore,
            compositePriority,
            affectedULabels: affectedUs.map(k => uWeights[k]?.label || k).join('+'),
            weakestU: affectedUs.reduce((weak, k) => (!weak || (uWeights[k]?.score < uWeights[weak]?.score)) ? k : weak, null),
        };
    });

    weightedLevers.sort((a, b) => b.compositePriority - a.compositePriority);

    return { uWeights, weightedLevers, dims, sensitivities, perspective };
}

// E杠杆 → U维度影响映射表 (v2.2 适配美租顾问+圈盘漏斗)
function buildLeverToUMapping(perspective) {
    const map = {};
    if (perspective === 'beike') {
        // 收入类杠杆 — 影响产品力+客户LTV
        map.commission_rate = ['unit', 'customer', 'staff'];
        map.gtv_per_unit = ['unit', 'customer'];
        map.monthly_target_units = ['order', 'staff'];
        // 渠道成本 — 影响漏斗CAC+客户CAC
        map.channel_manager = ['order', 'customer', 'staff'];
        map.channel_broker = ['order', 'customer'];
        map.channel_director = ['order'];
        map.channel_incentive = ['order', 'staff'];
        // 费用摊销 — 影响产品力+人效
        map.expense_city_hr = ['unit', 'staff'];
        map.expense_brand = ['customer'];
        map.expense_system = ['unit'];
        // 效率杠杆 — 影响三方共赢+漏斗
        map.rental_success_rate = ['unit', 'order'];
        map.referral_rate = ['customer', 'order'];
    } else if (perspective === 'owner') {
        map.rent_premium = ['unit', 'customer'];
        map.avg_lease_months = ['customer', 'staff'];
        map.vacancy_days = ['unit', 'customer'];
        map.renovation_total = ['unit', 'customer'];
        map.beike_service_fee = ['customer'];
        map.vacancy_reduction_days = ['unit'];
    } else {
        map.foreman = ['unit'];
        map.furniture = ['unit'];
        map.appliances = ['unit'];
        map.system_fee = ['unit'];
        map.designer = ['unit'];
        map.soft_furnishing = ['unit'];
        map.beike_fee = ['unit', 'customer'];
        map.invoicing = ['unit'];
    }
    return map;
}

// ========== 交叉弹性计算引擎 v2.0 ==========
// 使用 calculateAllUDimensions() (v2.0) 代替旧的 U_DIMENSION_PARAMS

function extractUProfit(baseModel, uDimKey, overrides) {
    // v2.0: 直接使用新引擎计算，传入overrides让模型微调生效
    try {
        const dims = calculateAllUDimensions(overrides);
        const dim = dims[uDimKey];
        if (!dim) return { profit: 0, revenue: 0, score: 0 };
        return {
            profit: dim.profitPerUnit,
            revenue: dim.revenuePerUnit,
            roi: dim.roi,
            score: dim.score,
            volume: dim.monthlyVolume,
            monthlyProfit: dim.profitPerUnit * dim.monthlyVolume,
            monthlyRevenue: dim.revenuePerUnit * dim.monthlyVolume,
            label: dim.label,
            color: dim.color,
            icon: dim.icon,
        };
    } catch(e) {
        return { profit: 0, revenue: 0, score: 0, volume: 0, monthlyProfit: 0, monthlyRevenue: 0, label: U_DIM_META[uDimKey]?.label || uDimKey, color: '#999', icon: 'question' };
    }
}

// 计算完整的U×E弹性矩阵 (4U × nE 组合)
function calculateCrossMatrix(baseModel) {
    const allLevers = E_LEVERS_3V.beike || [];
    const eLevers = allLevers.filter(l => l.baseField && baseModel[l.baseField] !== undefined);

    const matrix = [];
    const uBaselines = {};

    // 基准U利润（使用默认模型）
    U_DIM_KEYS.forEach(uKey => {
        uBaselines[uKey] = extractUProfit(baseModel, uKey, { beikeModel: baseModel });
    });

    // 对每个E杠杆做+1step微调
    eLevers.forEach(lever => {
        const step = lever.adjustStep;
        const adjustedModel = JSON.parse(JSON.stringify(baseModel));
        adjustedModel[lever.baseField] += step;

        // 联动计算
        if (lever.baseField === 'commission_rate' || lever.baseField === 'gtv_per_unit') {
            adjustedModel.net_revenue = adjustedModel.gtv_per_unit * (adjustedModel.commission_rate / 100);
        }

        U_DIM_KEYS.forEach(uKey => {
            const basePt = uBaselines[uKey];
            const adjustedPt = extractUProfit(adjustedModel, uKey, { beikeModel: adjustedModel });

            const profitDelta = adjustedPt.profit - basePt.profit;
            const scoreDelta = adjustedPt.score - basePt.score;
            const monthlyProfitDelta = adjustedPt.monthlyProfit - basePt.monthlyProfit;

            const baseVal = baseModel[lever.baseField];
            const paramChangePct = baseVal !== 0 ? (step / Math.abs(baseVal) * 100) : step;
            const profitChangePct = basePt.profit !== 0 ? (profitDelta / Math.abs(basePt.profit) * 100) : 0;
            const elasticity = paramChangePct !== 0 ? Math.abs(profitChangePct / paramChangePct) : 0;

            const monthlyImpact = Math.abs(monthlyProfitDelta);

            matrix.push({
                uKey, eKey: lever.key,
                uLabel: U_DIM_META[uKey].label, eLabel: lever.label,
                eGroup: lever.group, eType: lever.type,
                uColor: U_DIM_META[uKey].color, eColor: lever.color,
                uIcon: U_DIM_META[uKey].icon,
                elasticity, elasticityRaw: profitChangePct / (paramChangePct || 1),
                profitDelta, profitChangePct, scoreDelta,
                monthlyProfitDelta, monthlyImpact,
                baseProfit: basePt.profit, adjustedProfit: adjustedPt.profit,
                paramStep: step, paramUnit: lever.unit, baseParamValue: baseVal,
            });
        });
    });

    return { matrix, uDims: U_DIM_KEYS, eLevers, uLabels: Object.fromEntries(U_DIM_KEYS.map(k => [k, U_DIM_META[k].label])), uColors: Object.fromEntries(U_DIM_KEYS.map(k => [k, U_DIM_META[k].color])), uIcons: Object.fromEntries(U_DIM_KEYS.map(k => [k, U_DIM_META[k].icon])), uBaselines };
}

// 找到阿基米德支点 (弹性×月度影响最大的U×E组合)
function findArchimedesPoint(crossData) {
    const { matrix } = crossData;

    const maxElasticity = Math.max(...matrix.map(m => m.elasticity), 0.001);
    const maxMonthlyImpact = Math.max(...matrix.map(m => m.monthlyImpact), 1);

    const scored = matrix.map(m => ({
        ...m,
        compositeScore: (m.elasticity / maxElasticity * 0.5 + m.monthlyImpact / maxMonthlyImpact * 0.5) * 100
    }));

    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    const archimedes = scored[0];
    const top5 = scored.slice(0, 5);
    const top10 = scored.slice(0, 10);
    const bottom3 = scored.slice(-3).reverse();

    // 按U维度汇总最强杠杆
    const bestLeverPerU = {};
    U_DIM_KEYS.forEach(uKey => {
        const uEntries = scored.filter(m => m.uKey === uKey);
        if (uEntries.length > 0) bestLeverPerU[uKey] = uEntries[0];
    });

    // 按E杠杆汇总最敏感U维度
    const bestUPerE = {};
    crossData.eLevers.forEach(lever => {
        const eEntries = scored.filter(m => m.eKey === lever.key);
        if (eEntries.length > 0) bestUPerE[lever.key] = eEntries[0];
    });

    // 按U维度×E类型汇总弹性
    const uTypeElasticity = {};
    U_DIM_KEYS.forEach(uKey => {
        uTypeElasticity[uKey] = {
            price: scored.filter(m => m.uKey === uKey && m.eType === 'price').reduce((s, m) => s + m.elasticity, 0),
            cost: scored.filter(m => m.uKey === uKey && m.eType === 'cost').reduce((s, m) => s + m.elasticity, 0),
            efficiency: scored.filter(m => m.uKey === uKey && m.eType === 'efficiency').reduce((s, m) => s + m.elasticity, 0),
        };
    });

    return { scored, archimedes, top5, top10, bottom3, bestLeverPerU, bestUPerE, uTypeElasticity };
}

// ========== 页面渲染 ==========

function renderCrossAnalysisPage() {
    const model = AppState.baselineModels[AppState.currentCity] ||
                  DEFAULT_BEIKE_MODELS[AppState.currentCity]?.standard ||
                  DEFAULT_BEIKE_MODELS.beijing.standard;
    const crossData = calculateCrossMatrix(model);
    const analysis = findArchimedesPoint(crossData);

    renderArchimedesHero(analysis, crossData);
    renderUWeightedEPanel();
    renderCrossHeatmap(crossData, analysis);
    renderStrategicPathway(analysis, crossData);
    renderTop5Combos(analysis);
    renderBestLeverPerU(analysis, crossData);
    renderBestUPerE(analysis, crossData);
    renderCrossRadar(analysis, crossData);
}

// --- U维度评分→E杠杆权重联动面板 ---
function renderUWeightedEPanel() {
    const container = document.getElementById('cross-ue-weighted-panel');
    if (!container) return;

    const p = AppState.currentPerspective || 'beike';
    const result = calculateUWeightedEPriority(p);
    const { uWeights, weightedLevers, dims } = result;
    const pm = PERSPECTIVES[p] || PERSPECTIVES.beike;

    // 找出最弱U维度
    const weakestU = Object.entries(uWeights).sort((a, b) => a[1].score - b[1].score)[0];
    const strongestU = Object.entries(uWeights).sort((a, b) => b[1].score - a[1].score)[0];

    let html = `<div class="card"><div class="p-5">
        <div class="flex items-center gap-3 mb-4">
            <span class="text-2xl">🔗</span>
            <div>
                <h3 class="text-lg font-bold text-gray-800">U维度评分 → E杠杆优先级联动</h3>
                <p class="text-sm text-gray-500">U评分越低 → 对应E杠杆的修复权重越高（短板驱动策略）</p>
            </div>
            <div class="ml-auto flex items-center gap-2">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background:${pm.color}15;color:${pm.color}">${pm.label}视角</span>
            </div>
        </div>

        <!-- U维度评分 → 权重可视化 -->
        <div class="grid grid-cols-4 gap-3 mb-5">
            ${Object.entries(uWeights).map(([key, w]) => {
                const isWeakest = key === weakestU[0];
                const borderCls = isWeakest ? 'border-2 border-red-400 bg-red-50' : 'border border-gray-200';
                const dim = dims[key];
                return `<div class="rounded-xl ${borderCls} p-4 text-center relative">
                    ${isWeakest ? '<span class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">🔧 最需修复</span>' : ''}
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm mx-auto mb-2" style="background:${w.color}">
                        <i class="fas fa-${dim.icon}"></i>
                    </div>
                    <div class="font-bold text-sm text-gray-800">${w.label}</div>
                    <div class="text-2xl font-black mt-1" style="color:${w.color}">${w.score}</div>
                    <div class="text-[10px] text-gray-400">评分</div>
                    <div class="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full" style="width:${(w.normalizedWeight * 100).toFixed(0)}%;background:${w.color}"></div>
                    </div>
                    <div class="text-xs font-bold mt-1" style="color:${w.color}">${(w.normalizedWeight * 100).toFixed(0)}%</div>
                    <div class="text-[9px] text-gray-400">E杠杆权重</div>
                </div>`;
            }).join('')}
        </div>

        <!-- 权重调整后的E杠杆优先级排名 -->
        <div class="bg-gray-50 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-bold text-gray-500 uppercase"><i class="fas fa-sort-amount-down mr-1"></i>U加权后E杠杆优先级（TOP 8）</h4>
                <span class="text-[10px] text-gray-400">优先级 = 弹性 × 波动范围 × (1 + U短板权重)</span>
            </div>
            <div class="space-y-2">
                ${weightedLevers.slice(0, 8).map((wl, idx) => {
                    const maxPriority = weightedLevers[0].compositePriority;
                    const barW = maxPriority > 0 ? (wl.compositePriority / maxPriority * 100) : 0;
                    const medal = idx < 3 ? ['🥇', '🥈', '🥉'][idx] : '';
                    const isNew = wl.lever.key === 'rental_success_rate' || wl.lever.key === 'referral_rate';
                    return `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-white border ${idx === 0 ? 'border-green-300 shadow-sm' : 'border-gray-100'} hover:shadow-sm transition-all">
                        <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}">${medal || (idx + 1)}</span>
                        <span class="tag ${wl.lever.type === 'price' ? 'tag-green' : wl.lever.type === 'cost' ? 'tag-red' : 'tag-purple'} text-[9px] w-10 text-center">${wl.lever.type === 'price' ? '收入' : wl.lever.type === 'cost' ? '成本' : '效率'}</span>
                        <span class="text-sm font-bold text-gray-700 w-32">${wl.lever.label}${isNew ? ' <span class="text-[9px] bg-green-100 text-green-700 px-1 rounded">NEW</span>' : ''}</span>
                        <span class="text-[10px] text-gray-400 w-24">影响: ${wl.affectedULabels}</span>
                        <span class="text-[10px] font-medium w-20 ${wl.weakestU && uWeights[wl.weakestU]?.score < 40 ? 'text-red-500' : 'text-gray-500'}">弱项: ${uWeights[wl.weakestU]?.label || '-'}</span>
                        <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full" style="width:${barW.toFixed(0)}%;background:${wl.lever.color}"></div>
                        </div>
                        <span class="text-xs font-black w-14 text-right tabular-nums" style="color:${wl.lever.color}">${wl.compositePriority.toFixed(1)}</span>
                        <span class="text-[10px] text-gray-400 w-16 text-right">弹性 ${wl.elasticity.toFixed(2)}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <!-- 战略洞察 -->
        <div class="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">💡</span>
                <span class="font-bold text-blue-800">联动洞察</span>
            </div>
            <p class="text-sm text-blue-700 leading-relaxed">
                当前<strong>${weakestU[1].label}</strong>维度（${weakestU[1].score}分）是最短的木桶板，
                对应的E杠杆修复权重为<strong>${(weakestU[1].normalizedWeight * 100).toFixed(0)}%</strong>。
                加权优先级TOP1为<strong>${weightedLevers[0].lever.label}</strong>
                （弹性${weightedLevers[0].elasticity.toFixed(2)}，影响${weightedLevers[0].affectedULabels}），
                ${weightedLevers[0].lever.key === 'rental_success_rate' || weightedLevers[0].lever.key === 'referral_rate'
                    ? '这是本次新增的效率杠杆——建议优先试点。'
                    : `建议将其作为Q2战略优先级#1。`}
                最强维度<strong>${strongestU[1].label}</strong>（${strongestU[1].score}分）可适当减少投入。
            </p>
        </div>
    </div></div>`;

    container.innerHTML = html;
}

// --- 1. 阿基米德支点英雄区 ---
function renderArchimedesHero(analysis, crossData) {
    const container = document.getElementById('cross-archimedes-hero');
    if (!container) return;

    const a = analysis.archimedes;
    const second = analysis.top5[1];

    // 战略洞察文案
    const insightText = generateStrategicInsight(a, analysis, crossData);

    container.innerHTML = `
    <div class="mb-6">
        <div class="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200 rounded-2xl p-6 relative overflow-hidden">
            <div class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-indigo-200/30 to-transparent rounded-bl-full"></div>
            <div class="relative">
                <div class="flex items-center gap-3 mb-3">
                    <span class="text-4xl">⚡</span>
                    <div>
                        <div class="text-xs font-bold text-indigo-500 uppercase tracking-wider">阿基米德支点 · ARCHIMEDES LEVERAGE POINT</div>
                        <div class="text-2xl font-black text-gray-900 mt-0.5">
                            <span style="color:${a.uColor}"><i class="fas fa-${a.uIcon} mr-1"></i>${a.uLabel}</span>
                            <span class="text-gray-400 mx-2">×</span>
                            <span style="color:${a.eColor}">${a.eLabel}</span>
                        </div>
                    </div>
                    <div class="ml-auto text-right">
                        <div class="text-xs text-gray-400">综合撬动力</div>
                        <div class="text-4xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">${a.compositeScore.toFixed(0)}</div>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mt-3 max-w-3xl leading-relaxed">${insightText}</p>
                <div class="flex gap-3 mt-4 flex-wrap">
                    <div class="bg-white/80 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm">
                        <div class="text-[10px] text-gray-400 uppercase">弹性系数</div>
                        <div class="text-lg font-black text-indigo-600">${a.elasticity.toFixed(3)}</div>
                    </div>
                    <div class="bg-white/80 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm">
                        <div class="text-[10px] text-gray-400 uppercase">单位利润变化</div>
                        <div class="text-lg font-black ${a.profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${a.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(a.profitDelta))}</div>
                    </div>
                    <div class="bg-white/80 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm">
                        <div class="text-[10px] text-gray-400 uppercase">月度利润影响</div>
                        <div class="text-lg font-black ${a.monthlyProfitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${a.monthlyProfitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(a.monthlyProfitDelta))}</div>
                    </div>
                    <div class="bg-white/80 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm">
                        <div class="text-[10px] text-gray-400 uppercase">评分变化</div>
                        <div class="text-lg font-black text-purple-600">${a.scoreDelta >= 0 ? '+' : ''}${a.scoreDelta.toFixed(1)}分</div>
                    </div>
                    <div class="bg-white/80 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm">
                        <div class="text-[10px] text-gray-400 uppercase">参数基准值</div>
                        <div class="text-lg font-black text-gray-700">${a.baseParamValue}${a.paramUnit}</div>
                    </div>
                </div>
                ${second ? `
                <div class="mt-4 pt-3 border-t border-indigo-100 flex items-center gap-2 text-sm text-gray-500">
                    <span class="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">次优组合</span>
                    <span style="color:${second.uColor}">${second.uLabel}</span>×<span style="color:${second.eColor}">${second.eLabel}</span>
                    <span class="text-gray-400">撬动力 ${second.compositeScore.toFixed(0)}，弹性 ${second.elasticity.toFixed(3)}</span>
                </div>` : ''}
            </div>
        </div>
    </div>`;
}

// 生成战略洞察文案
function generateStrategicInsight(archimedes, analysis, crossData) {
    const a = archimedes;
    const uType = analysis.uTypeElasticity[a.uKey];
    const dominantType = uType.price > uType.cost && uType.price > uType.efficiency ? '价格' :
        uType.cost > uType.efficiency ? '成本' : '效率';

    let insight = `当<strong style="color:${a.eColor}">${a.eLabel}</strong>每变动<strong>${a.paramStep}${a.paramUnit}</strong>时，`;
    insight += `<strong style="color:${a.uColor}">${a.uLabel}</strong>维度利润变动 `;
    insight += `<strong class="${a.profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${a.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(a.profitDelta))}</strong>`;
    insight += `（弹性系数 ${a.elasticity.toFixed(2)}），月度总利润影响 `;
    insight += `<strong class="${a.monthlyProfitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${a.monthlyProfitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(a.monthlyProfitDelta))}</strong>。`;
    insight += `<br/><br/>💡 <strong>战略建议</strong>：${a.uLabel}维度整体更偏${dominantType}端敏感，`;

    if (a.uKey === 'unit') {
        insight += `说明<em>每套房</em>的三方共赢指数最具杠杆效应（装组比+溢价率+招租成功率+返修率+如期交付率），战略资源应投入标品化率提升和交付品控。`;
    } else if (a.uKey === 'order') {
        insight += `说明<em>漏斗转化效率</em>是获客瓶颈，应优先提升推房→量房→签约全链路转化率，降低每单获客成本。`;
    } else if (a.uKey === 'customer') {
        insight += `说明<em>业主获客</em>的效率和LTV是利润放大器，应优化渠道结构、提升复购率和转介绍裂变效率。`;
    } else if (a.uKey === 'staff') {
        insight += `说明<em>人效+租期+续租率</em>是整个UE的放大器，应优先提升人均签约量、延长平均租期、提高续租率。`;
    }

    return insight;
}

// --- 2. 交叉弹性热力图 ---
function renderCrossHeatmap(crossData, analysis) {
    const chart = getOrCreateChart('chart-cross-heatmap');
    if (!chart) return;

    const { uDims, eLevers, uLabels, matrix } = crossData;
    const uAxisLabels = uDims.map(k => uLabels[k]);
    const eAxisLabels = eLevers.map(l => l.label);

    const data = [];
    let maxComposite = 0;
    matrix.forEach(m => {
        const xi = uDims.indexOf(m.uKey);
        const yi = eLevers.findIndex(l => l.key === m.eKey);
        const scored = analysis.scored.find(s => s.uKey === m.uKey && s.eKey === m.eKey);
        const val = scored ? scored.compositeScore : 0;
        maxComposite = Math.max(maxComposite, val);
        data.push([xi, yi, +val.toFixed(1)]);
    });

    chart.setOption({
        tooltip: {
            formatter: p => {
                const entry = matrix.find(m => uDims.indexOf(m.uKey) === p.data[0] && eLevers.findIndex(l => l.key === m.eKey) === p.data[1]);
                if (!entry) return '';
                return `<b>${entry.uLabel} × ${entry.eLabel}</b><br/>
                    综合撬动力: <b>${p.data[2]}</b><br/>
                    弹性系数: ${entry.elasticity.toFixed(3)}<br/>
                    利润变化: ${entry.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(entry.profitDelta))}<br/>
                    月度影响: ${entry.monthlyProfitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(entry.monthlyProfitDelta))}`;
            }
        },
        grid: { left: 90, right: 60, top: 10, bottom: 60 },
        xAxis: { type: 'category', data: uAxisLabels, position: 'top', axisLabel: { fontSize: 11, fontWeight: 'bold' }, splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0)'] } } },
        yAxis: { type: 'category', data: eAxisLabels, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
        visualMap: {
            min: 0, max: Math.ceil(maxComposite), calculable: true, orient: 'vertical', right: 5, top: 'center',
            inRange: { color: ['#f0fdf4', '#86efac', '#22c55e', '#f59e0b', '#ef4444', '#7c2d12'] },
            textStyle: { fontSize: 10 }, text: ['高撬动', '低撬动']
        },
        series: [{
            type: 'heatmap', data,
            label: { show: true, fontSize: 10, fontWeight: 'bold', formatter: p => p.data[2].toFixed(0) },
            itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 2 },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } }
        }]
    });
}

// --- 3. 战略路线图：散点图 (弹性 vs 月度影响) ---
function renderStrategicPathway(analysis, crossData) {
    const chart = getOrCreateChart('chart-cross-strategic');
    if (!chart) return;

    const seriesData = {};
    U_DIM_KEYS.forEach(uKey => { seriesData[uKey] = []; });

    analysis.scored.forEach(m => {
        seriesData[m.uKey].push({
            name: `${m.uLabel}×${m.eLabel}`,
            value: [m.elasticity, Math.abs(m.monthlyProfitDelta), m.compositeScore],
            uLabel: m.uLabel,
            eLabel: m.eLabel,
            compositeScore: m.compositeScore,
        });
    });

    const series = U_DIM_KEYS.map(uKey => ({
        name: U_DIM_META[uKey].label,
        type: 'scatter',
        data: seriesData[uKey],
        symbolSize: p => Math.max(8, p[2] / 3),
        itemStyle: { color: U_DIM_META[uKey].color, opacity: 0.8 },
        emphasis: { itemStyle: { opacity: 1, borderColor: '#333', borderWidth: 2 } },
        label: { show: false }
    }));

    // 阿基米德支点标记
    const a = analysis.archimedes;
    series.push({
        name: '⚡支点',
        type: 'effectScatter',
        data: [{ name: `${a.uLabel}×${a.eLabel}`, value: [a.elasticity, Math.abs(a.monthlyProfitDelta), a.compositeScore] }],
        symbolSize: 25,
        itemStyle: { color: '#f59e0b', shadowBlur: 15, shadowColor: '#f59e0b80' },
        rippleEffect: { brushType: 'stroke', scale: 3 },
        label: { show: true, formatter: '⚡支点', fontSize: 10, fontWeight: 'bold', position: 'top' }
    });

    chart.setOption({
        tooltip: {
            formatter: p => `<b>${p.data.name || p.name}</b><br/>弹性: ${p.value[0].toFixed(3)}<br/>月度利润影响: ¥${formatNumber(Math.round(p.value[1]))}<br/>综合撬动力: ${(p.value[2] || 0).toFixed(0)}`
        },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 60, right: 20, top: 30, bottom: 50 },
        xAxis: {
            type: 'value', name: '弹性系数', nameLocation: 'center', nameGap: 25, axisLabel: { fontSize: 10 },
            splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
        },
        yAxis: {
            type: 'value', name: '月度利润影响(元)', nameLocation: 'center', nameGap: 45,
            axisLabel: { fontSize: 10, formatter: v => '¥' + (v / 1000).toFixed(0) + 'k' },
            splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
        },
        series: [
            ...series,
            {
                type: 'line', markArea: { silent: true, data: [[{}, {}]], itemStyle: { color: 'transparent' } },
                markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#ddd' }, data: [{ xAxis: 'average' }, { yAxis: 'average' }] }
            }
        ]
    });
}

// --- 4. TOP5 U×E组合 ---
function renderTop5Combos(analysis) {
    const container = document.getElementById('cross-top5');
    if (!container) return;

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    let html = `<div class="card-header"><h3><i class="fas fa-crown mr-2 text-yellow-500"></i>TOP 5 撬动力组合</h3></div><div class="p-4 space-y-2">`;

    analysis.top5.forEach((m, i) => {
        const barW = Math.round(m.compositeScore);
        html += `<div class="flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200' : 'bg-gray-50 hover:bg-gray-100'} transition-all">
            <span class="text-xl w-8">${medals[i]}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-1">
                    <i class="fas fa-${m.uIcon} text-xs" style="color:${m.uColor}"></i>
                    <span class="text-sm font-bold" style="color:${m.uColor}">${m.uLabel}</span>
                    <span class="text-gray-300">×</span>
                    <span class="text-sm font-bold" style="color:${m.eColor}">${m.eLabel}</span>
                    <span class="tag text-[10px] ${m.eType === 'price' ? 'tag-green' : m.eType === 'cost' ? 'tag-red' : 'tag-purple'} ml-1">${m.eGroup}</span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700" style="width:${barW}%;background:linear-gradient(90deg,${m.uColor},${m.eColor})"></div>
                </div>
                <div class="text-[10px] text-gray-400 mt-1">
                    弹性 <span class="font-bold text-indigo-600">${m.elasticity.toFixed(2)}</span> ·
                    利润Δ <span class="font-bold ${m.profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${m.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(m.profitDelta))}</span> ·
                    月度 <span class="font-bold">${m.monthlyProfitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(m.monthlyProfitDelta))}</span>
                </div>
            </div>
            <div class="text-right flex-shrink-0 w-16">
                <div class="text-xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">${m.compositeScore.toFixed(0)}</div>
                <div class="text-[10px] text-gray-400">撬动力</div>
            </div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// --- 5. 每个U维度的最强杠杆 ---
function renderBestLeverPerU(analysis, crossData) {
    const container = document.getElementById('cross-best-lever-per-u');
    if (!container) return;

    let html = `<div class="card-header"><h3><i class="fas fa-crosshairs mr-2 text-indigo-500"></i>每个U维度的最强E杠杆</h3>
        <span class="text-[10px] text-gray-400">回答：签约维度对服务费率的弹性是多少？人效维度对标准化占比的弹性是多少？</span>
    </div><div class="p-4 grid grid-cols-2 gap-3">`;

    U_DIM_KEYS.forEach(uKey => {
        const best = analysis.bestLeverPerU[uKey];
        if (!best) return;

        // 获取该U的所有杠杆弹性前3
        const uEntries = analysis.scored.filter(m => m.uKey === uKey).slice(0, 3);

        html += `<div class="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-md transition-all">
            <div class="flex items-center gap-2 mb-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style="background:${best.uColor}"><i class="fas fa-${best.uIcon}"></i></div>
                <div>
                    <div class="text-sm font-bold text-gray-800">${best.uLabel}</div>
                    <div class="text-[10px] text-gray-400">最敏感于</div>
                </div>
                <div class="ml-auto text-right">
                    <div class="text-xs px-2 py-0.5 rounded-full font-bold text-white" style="background:${best.eColor}">${best.eLabel}</div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                <div><div class="text-gray-400">弹性</div><div class="font-bold text-indigo-600">${best.elasticity.toFixed(3)}</div></div>
                <div><div class="text-gray-400">利润Δ</div><div class="font-bold ${best.profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${best.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(best.profitDelta))}</div></div>
                <div><div class="text-gray-400">撬动力</div><div class="font-bold text-purple-600">${best.compositeScore.toFixed(0)}</div></div>
            </div>
            <div class="border-t border-gray-200 pt-2 space-y-1">
                ${uEntries.map((e, i) => `
                <div class="flex items-center gap-2 text-[11px]">
                    <span class="w-4 text-center font-bold ${i === 0 ? 'text-yellow-600' : 'text-gray-400'}">${i + 1}</span>
                    <span class="text-gray-600">${e.eLabel}</span>
                    <span class="ml-auto font-mono font-bold text-indigo-500">${e.elasticity.toFixed(3)}</span>
                </div>`).join('')}
            </div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// --- 6. 每个E杠杆的最敏感U维度 ---
function renderBestUPerE(analysis, crossData) {
    const container = document.getElementById('cross-best-u-per-e');
    if (!container) return;

    const entries = Object.entries(analysis.bestUPerE).filter(([k, v]) => v.elasticity > 0);
    entries.sort((a, b) => b[1].compositeScore - a[1].compositeScore);

    let html = `<div class="card-header"><h3><i class="fas fa-bullseye mr-2 text-red-500"></i>每个E杠杆的最敏感U维度</h3></div>
    <div class="overflow-auto"><table class="w-full text-sm">
        <thead class="bg-gray-50"><tr>
            <th class="text-left px-4 py-2 text-gray-500 font-medium">E杠杆</th>
            <th class="text-left px-4 py-2 text-gray-500 font-medium">类型</th>
            <th class="text-left px-4 py-2 text-gray-500 font-medium">最敏感U</th>
            <th class="text-right px-4 py-2 text-gray-500 font-medium">弹性</th>
            <th class="text-right px-4 py-2 text-gray-500 font-medium">利润Δ</th>
            <th class="text-right px-4 py-2 text-gray-500 font-medium">撬动力</th>
        </tr></thead><tbody>`;

    entries.forEach(([eKey, m]) => {
        const typeTag = m.eType === 'price' ? 'tag-green' : m.eType === 'cost' ? 'tag-red' : 'tag-purple';
        html += `<tr class="hover:bg-gray-50 border-b border-gray-50">
            <td class="px-4 py-2 font-medium" style="color:${m.eColor}">${m.eLabel}</td>
            <td class="px-4 py-2"><span class="tag ${typeTag} text-[10px]">${m.eGroup}</span></td>
            <td class="px-4 py-2"><i class="fas fa-${m.uIcon} mr-1" style="color:${m.uColor}"></i><span class="font-medium" style="color:${m.uColor}">${m.uLabel}</span></td>
            <td class="px-4 py-2 text-right font-mono font-bold text-indigo-600">${m.elasticity.toFixed(3)}</td>
            <td class="px-4 py-2 text-right font-mono ${m.profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${m.profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(m.profitDelta))}</td>
            <td class="px-4 py-2 text-right"><span class="text-sm font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">${m.compositeScore.toFixed(0)}</span></td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// --- 7. U维度×杠杆类型弹性雷达 ---
function renderCrossRadar(analysis, crossData) {
    const chart = getOrCreateChart('chart-cross-radar');
    if (!chart) return;

    const eTypes = ['price', 'cost', 'efficiency'];
    const eTypeLabels = ['价格杠杆弹性', '成本杠杆弹性', '效率杠杆弹性'];

    const maxVals = [0, 0, 0];
    U_DIM_KEYS.forEach(uKey => {
        eTypes.forEach((et, i) => {
            const sum = analysis.uTypeElasticity[uKey][et];
            maxVals[i] = Math.max(maxVals[i], sum);
        });
    });

    const indicators = eTypeLabels.map((label, i) => ({ name: label, max: Math.max(maxVals[i] * 1.2, 1) }));

    const seriesData = U_DIM_KEYS.map(uKey => ({
        name: U_DIM_META[uKey].label,
        value: eTypes.map(et => +analysis.uTypeElasticity[uKey][et].toFixed(3)),
        lineStyle: { color: U_DIM_META[uKey].color, width: 2 },
        areaStyle: { color: U_DIM_META[uKey].color, opacity: 0.1 },
        itemStyle: { color: U_DIM_META[uKey].color }
    }));

    chart.setOption({
        tooltip: {},
        legend: { data: U_DIM_KEYS.map(k => U_DIM_META[k].label), bottom: 0, textStyle: { fontSize: 11 } },
        radar: { indicator: indicators, shape: 'polygon', splitNumber: 4, radius: '65%', axisName: { fontSize: 11, color: '#555' } },
        series: [{ type: 'radar', data: seriesData }]
    });
}

// ========== 持久化能力 (Table API) ==========

async function saveCurrentState() {
    try {
        const state = {
            id: 'state_' + AppState.currentCity,
            city: AppState.currentCity,
            baseline_model: JSON.stringify(AppState.baselineModels[AppState.currentCity]),
            scale_params: JSON.stringify(AppState.scaleParams),
            u_params: JSON.stringify({}),  // v2.0: U维度由实时计算引擎驱动，无需持久化参数
            saved_at: new Date().toISOString(),
        };

        // 纯前端模式：使用localStorage替代后端API
        const key = `ue_saved_state_${AppState.currentCity}`;
        localStorage.setItem(key, JSON.stringify(state));
        showToast('状态已保存到本地', 'success');
    } catch (e) {
        console.warn('Save state failed:', e);
        showToast('保存失败', 'error');
    }
}

async function loadSavedState() {
    // 纯前端模式：使用localStorage替代后端API
    try {
        const key = `ue_saved_state_${AppState.currentCity}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const latest = JSON.parse(saved);
            if (latest.baseline_model) {
                AppState.baselineModels[AppState.currentCity] = JSON.parse(latest.baseline_model);
            }
            if (latest.scale_params) {
                Object.assign(AppState.scaleParams, JSON.parse(latest.scale_params));
            }
            showToast('已加载本地保存的状态', 'info');
            return true;
        }
    } catch (e) {
        console.warn('Load state failed:', e);
    }
    return false;
}

async function saveAssumptionsToCloud() {
    // 纯前端模式：使用localStorage替代后端API
    try {
        localStorage.setItem('ue_assumptions', JSON.stringify(AppState.assumptions));
        showToast('战略假设已同步到本地', 'success');
    } catch (e) {
        console.warn('Save assumptions failed:', e);
    }
}
