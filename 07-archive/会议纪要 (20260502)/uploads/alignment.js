// ===== 战略对齐模块 (Attention Layer) v2 =====
// BLM: Build → Measure → Learn
// 三个核心约束：
//   1. 线下数据失真（指标博弈、回收不全）→ 需要鲁棒性分析
//   2. 线上化高成本（需要标准化摊薄）→ 只采集关键变量
//   3. 规模个性化悖论（标品vs非标）→ 混合模型参数化
// 解法：不追求数据精确，追求弹性方向一致

// ========== 准实验类型定义 ==========

const EXPERIMENT_TYPES = {
    city_contrast: {
        label: '城市对照',
        icon: 'city',
        color: '#6366f1',
        desc: '实验城市执行策略，对照城市维持现状，对比UE差异',
        example: '北京执行标品85%，上海维持80%',
        suitableFor: '参数在城市间可独立控制的策略',
        dataReqLevel: 'low',  // 数据要求等级
        sampleReq: '2个城市×1个月',
        riskNote: '城市基础差异可能混淆结果',
    },
    time_contrast: {
        label: '时段对照',
        icon: 'clock',
        color: '#2f9668',
        desc: '同一城市Before-After对比，用弹性系数预测"应该变多少"',
        example: '3月执行新策略，对比2月→4月UE变化',
        suitableFor: '只有一个城市或策略不可分城市的情况',
        dataReqLevel: 'medium',
        sampleReq: '1个城市×3个月(前1+执行1+后1)',
        riskNote: '季节性、市场波动可能混淆',
    },
    staged_rollout: {
        label: '阶梯投放',
        icon: 'layer-group',
        color: '#f59e0b',
        desc: '10%→30%→50%逐步放量，观察UE曲线是否沿预测斜率走',
        example: '第1月10%房源新标品→第2月30%→第3月50%',
        suitableFor: '高风险/高投入策略，需控制损失边界',
        dataReqLevel: 'high',
        sampleReq: '1个城市×3个月×3个阶段',
        riskNote: '需要追踪各阶段独立UE，数据颗粒度要求最高',
    }
};

// ========== 数据失真约束模型 ==========

// 数据质量评估：线下→线上回收的数据可信度
const DATA_FIDELITY_FACTORS = [
    { key: 'gaming_risk', label: '指标博弈风险', desc: '一线人员是否有动机美化数据', weight: 0.30,
      high_risk: ['monthly_target_units', 'conversion_rate', 'seven_day_occupancy_rate'],
      assessment: '签约量、转化率、去化率容易被前线"做数据"' },
    { key: 'collection_cost', label: '采集成本', desc: '获取真实数据需要多少额外人力/系统投入', weight: 0.25,
      high_cost: ['material_cost_ratio', 'labor_cost_ratio', 'vacancy_days'],
      assessment: '物料成本需逐单核对，人工成本需工时系统，空置天数需线下巡检' },
    { key: 'completeness', label: '数据完整性', desc: '有多少数据能被系统自动采集vs人工填报', weight: 0.25,
      auto_capture: ['gtv_per_unit', 'service_fee_rate', 'monthly_target_units'],
      manual_only: ['renovation_cost', 'material_cost_ratio', 'labor_cost_ratio', 'management_fee_ratio'],
      assessment: 'GTV和服务费率可从合同系统自动获取，装修成本只能人工录入' },
    { key: 'timeliness', label: '时效性', desc: '数据从发生到可用需要多长时间', weight: 0.20,
      realtime: ['service_fee_rate', 'gtv_per_unit'],
      delayed: ['renovation_cost', 'gross_margin', 'payback_period_months'],
      assessment: '利润需要完工+出租后才能确认，延迟2-8个月' }
];

// 计算某个UE参数的数据可信度 (0-100)
function getParamFidelityScore(paramKey) {
    let score = 80; // 基础分

    DATA_FIDELITY_FACTORS.forEach(f => {
        if (f.high_risk && f.high_risk.includes(paramKey)) score -= 15 * f.weight;
        if (f.high_cost && f.high_cost.includes(paramKey)) score -= 12 * f.weight;
        if (f.manual_only && f.manual_only.includes(paramKey)) score -= 10 * f.weight;
        if (f.auto_capture && f.auto_capture.includes(paramKey)) score += 8 * f.weight;
        if (f.delayed && f.delayed.includes(paramKey)) score -= 10 * f.weight;
        if (f.realtime && f.realtime.includes(paramKey)) score += 5 * f.weight;
    });

    return Math.max(10, Math.min(100, Math.round(score)));
}

// ========== 线上化成本模型 ==========

// 每个UE参数的线上化采集成本（相对值）
function getDigitizationCost(paramKey) {
    const costs = {
        // 低成本：合同系统自动生成
        gtv_per_unit: { cost: 10, source: '合同系统', auto: true },
        service_fee_rate: { cost: 10, source: '合同系统', auto: true },
        monthly_target_units: { cost: 15, source: '签约系统', auto: true },
        avg_rent_before: { cost: 20, source: '市场数据', auto: true },
        avg_rent_after: { cost: 20, source: '租约系统', auto: true },
        rent_premium_rate: { cost: 10, source: '计算字段', auto: true },

        // 中等成本：需要额外系统或人工辅助
        standardized_ratio: { cost: 40, source: '产品分类系统', auto: false },
        conversion_rate: { cost: 45, source: '带看记录+签约关联', auto: false },
        seven_day_occupancy_rate: { cost: 50, source: '出租时间追踪', auto: false },
        vacancy_days: { cost: 55, source: '房态管理系统', auto: false },

        // 高成本：需要深度线下数据采集
        renovation_cost: { cost: 70, source: '逐单造价核算系统', auto: false },
        material_cost_ratio: { cost: 80, source: '供应链+BOM系统', auto: false },
        labor_cost_ratio: { cost: 75, source: '工时管理系统', auto: false },
        management_fee_ratio: { cost: 60, source: '项目管理系统', auto: false },
        insurance_cost: { cost: 25, source: '保单系统', auto: true },
        smart_device_cost: { cost: 30, source: '采购系统', auto: true },
        gross_margin: { cost: 85, source: '全链路成本归集', auto: false },
        payback_period_months: { cost: 90, source: '全生命周期追踪', auto: false },
        a_class_material_ratio: { cost: 65, source: '物料分级系统', auto: false },
    };
    return costs[paramKey] || { cost: 50, source: '未知', auto: false };
}

// ========== 鲁棒性分析 ==========

// 检测结论在±N%数据噪声下是否稳定
function robustnessTest(baseModel, lever, noiseRange = 20) {
    const results = [];
    const steps = [-noiseRange, -noiseRange/2, 0, noiseRange/2, noiseRange];

    steps.forEach(noisePct => {
        const noisyModel = JSON.parse(JSON.stringify(baseModel));
        // 给所有成本参数加噪声
        ['renovation_cost', 'material_cost_ratio', 'labor_cost_ratio', 'vacancy_days'].forEach(k => {
            if (noisyModel[k] !== undefined) {
                noisyModel[k] = noisyModel[k] * (1 + noisePct / 100);
            }
        });
        noisyModel.avg_rent_after = noisyModel.avg_rent_before * (1 + noisyModel.rent_premium_rate / 100);
        noisyModel.revenue_per_unit = noisyModel.gtv_per_unit * (noisyModel.service_fee_rate / 100);

        const elasticity = calculateElasticity(noisyModel, lever, lever.adjustStep);
        results.push({
            noisePct,
            profitDelta: elasticity.profitDelta,
            direction: elasticity.profitDelta >= 0 ? 'up' : 'down'
        });
    });

    // 方向一致性：所有噪声水平下利润变化方向是否相同
    const directions = results.map(r => r.direction);
    const allSame = directions.every(d => d === directions[0]);
    const consistency = allSame ? 100 : (directions.filter(d => d === directions[0]).length / directions.length * 100);

    // 幅度稳定性：利润变化的变异系数
    const deltas = results.map(r => Math.abs(r.profitDelta));
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
    const cv = mean > 0 ? (Math.sqrt(variance) / mean * 100) : 0;
    const stability = Math.max(0, 100 - cv);

    return {
        results,
        directionConsistency: consistency,
        magnitudeStability: stability,
        overallRobustness: Math.round(consistency * 0.6 + stability * 0.4),
        isRobust: consistency >= 80 && stability >= 60,
        verdict: consistency >= 80 && stability >= 60 ? '结论可靠' :
            consistency >= 60 ? '方向可信，幅度不确定' : '结论不可靠，需更精确数据'
    };
}

// ========== Attention权重计算 (含失真校正) ==========

function calculateAttentionMatrix() {
    const model = AppState.baselineModels[AppState.currentCity];
    const baseUE = calculateUE(model);
    const baseProfit = baseUE.grossProfit;
    const assumptions = AppState.assumptions.filter(a => a.is_active);

    const matrix = [];
    let maxImpact = 0;

    assumptions.forEach(asmp => {
        const row = { assumption: asmp, impacts: {} };

        if (asmp.param_adjustments) {
            Object.entries(asmp.param_adjustments).forEach(([paramKey, adjustValue]) => {
                const adjType = asmp.adjustment_type?.[paramKey] || 'multiply';
                const adjusted = JSON.parse(JSON.stringify(model));

                if (adjusted[paramKey] !== undefined) {
                    if (adjType === 'multiply') adjusted[paramKey] *= adjustValue;
                    else if (adjType === 'add') adjusted[paramKey] += adjustValue;
                    else if (adjType === 'set') adjusted[paramKey] = adjustValue;

                    adjusted.avg_rent_after = adjusted.avg_rent_before * (1 + adjusted.rent_premium_rate / 100);
                    adjusted.revenue_per_unit = adjusted.gtv_per_unit * (adjusted.service_fee_rate / 100);

                    const adjUE = calculateUE(adjusted);
                    const impact = Math.abs(adjUE.grossProfit - baseProfit);
                    const fidelity = getParamFidelityScore(paramKey);
                    const digitCost = getDigitizationCost(paramKey);

                    row.impacts[paramKey] = {
                        impact,
                        profitDelta: adjUE.grossProfit - baseProfit,
                        adjustType: adjType,
                        adjustValue,
                        isDirect: true,
                        fidelity,
                        digitizationCost: digitCost.cost,
                        dataSource: digitCost.source,
                        autoCapture: digitCost.auto,
                        // 有效注意力 = 利润影响 × 数据可信度修正
                        effectiveWeight: impact * (fidelity / 100),
                    };
                    maxImpact = Math.max(maxImpact, impact);
                }
            });
        }

        matrix.push(row);
    });

    // 归一化
    if (maxImpact > 0) {
        matrix.forEach(row => {
            Object.entries(row.impacts).forEach(([k, v]) => {
                v.weight = v.impact / maxImpact;
                v.effectiveWeightNorm = v.effectiveWeight / maxImpact;
            });
        });
    }

    return { matrix, assumptions, maxImpact };
}

// ========== 对齐度评分 ==========

function calculateAlignmentScore() {
    const assumptions = AppState.assumptions.filter(a => a.is_active);
    const crossData = typeof calculateCrossMatrix === 'function' ?
        calculateCrossMatrix(AppState.baselineModels[AppState.currentCity]) : null;
    const crossAnalysis = crossData ? findArchimedesPoint(crossData) : null;

    let scores = {
        strategic_clarity: 0,
        parameter_coverage: 0,
        leverage_alignment: 0,
        execution_readiness: 0,
        data_feasibility: 0,   // NEW: 数据可行性
        overall: 0
    };

    const withParams = assumptions.filter(a => a.param_adjustments && Object.keys(a.param_adjustments).length > 0);
    scores.strategic_clarity = assumptions.length > 0 ? (withParams.length / assumptions.length * 100) : 0;

    const allAdjustedParams = new Set();
    assumptions.forEach(a => {
        if (a.param_adjustments) Object.keys(a.param_adjustments).forEach(k => allAdjustedParams.add(k));
    });
    const totalParams = typeof UE_PARAM_DEFINITIONS !== 'undefined' ? Object.keys(UE_PARAM_DEFINITIONS).length : 19;
    scores.parameter_coverage = Math.min(100, allAdjustedParams.size / totalParams * 100);

    if (crossAnalysis && crossAnalysis.top10) {
        const top10Levers = crossAnalysis.top10.map(m => m.eKey);
        const adjustedLevers = [...allAdjustedParams];
        const overlap = adjustedLevers.filter(k => top10Levers.includes(k)).length;
        scores.leverage_alignment = top10Levers.length > 0 ? (overlap / Math.min(adjustedLevers.length || 1, top10Levers.length) * 100) : 0;
    } else {
        scores.leverage_alignment = 50;
    }

    const validated = assumptions.filter(a => a.validation_status === '已验证' || a.validation_status === 'validated');
    const inProgress = assumptions.filter(a => a.validation_status === '验证中' || a.validation_status === 'in_progress');
    scores.execution_readiness = assumptions.length > 0 ?
        ((validated.length * 100 + inProgress.length * 50) / assumptions.length) : 0;

    // NEW: 数据可行性 — 调整的参数中有多少是低成本可采集的
    const paramList = [...allAdjustedParams];
    if (paramList.length > 0) {
        const avgFidelity = paramList.reduce((s, k) => s + getParamFidelityScore(k), 0) / paramList.length;
        const avgCost = paramList.reduce((s, k) => s + getDigitizationCost(k).cost, 0) / paramList.length;
        scores.data_feasibility = Math.round(avgFidelity * 0.5 + (100 - avgCost) * 0.5);
    } else {
        scores.data_feasibility = 50;
    }

    scores.overall = Math.round(
        scores.strategic_clarity * 0.20 +
        scores.parameter_coverage * 0.15 +
        scores.leverage_alignment * 0.30 +
        scores.execution_readiness * 0.15 +
        scores.data_feasibility * 0.20
    );

    // === 新增：按主题维度打分 ===
    const themes = AppState.themes || [];
    if (themes.length > 0) {
        scores.themes = {};
        themes.forEach(theme => {
            const themeExps = assumptions.filter(a => (theme.experiment_ids || []).includes(a.id));
            const total = themeExps.length;
            if (total === 0) {
                scores.themes[theme.id] = { name: theme.theme_name, color: theme.color, score: 0, clarity: 0, readiness: 0, coverage: 0 };
                return;
            }

            // 清晰度：有参数调整的比例
            const withP = themeExps.filter(a => a.param_adjustments && Object.keys(a.param_adjustments).length > 0).length;
            const clarity = withP / total * 100;

            // 就绪度：验证进度
            const validated = themeExps.filter(a => a.validation_status === '已验证' || a.validation_status === 'validated').length;
            const inProg = themeExps.filter(a => a.validation_status === '验证中' || a.validation_status === 'in_progress').length;
            const readiness = (validated * 100 + inProg * 50) / total;

            // 参数覆盖度
            const themeParams = new Set();
            themeExps.forEach(a => {
                if (a.param_adjustments) Object.keys(a.param_adjustments).forEach(k => {
                    if (typeof a.param_adjustments[k] !== 'object') themeParams.add(k);
                    else Object.keys(a.param_adjustments[k]).forEach(kk => themeParams.add(kk));
                });
            });
            const coverage = Math.min(100, themeParams.size / Math.max(totalParams * 0.25, 1) * 100);

            const themeScore = Math.round(clarity * 0.4 + readiness * 0.3 + coverage * 0.3);
            scores.themes[theme.id] = { name: theme.theme_name, color: theme.color, icon: theme.icon, score: themeScore, clarity: Math.round(clarity), readiness: Math.round(readiness), coverage: Math.round(coverage), expCount: total };
        });
    }

    return scores;
}

// ========== 实验管理 ==========

if (!AppState.experiments) AppState.experiments = [];

function createNewExperiment() {
    const assumptions = AppState.assumptions.filter(a => a.is_active);
    if (assumptions.length === 0) {
        showToast('请先在"战略假设"页面创建并激活假设', 'warning');
        return;
    }

    let html = `<div class="space-y-4">
        <!-- 实验类型 -->
        <div>
            <label class="text-sm font-bold text-gray-700">实验类型（准实验设计）</label>
            <div class="grid grid-cols-3 gap-2 mt-2" id="exp-type-selector">
                ${Object.entries(EXPERIMENT_TYPES).map(([key, t]) => `
                <div class="border-2 rounded-xl p-3 cursor-pointer transition-all hover:shadow-md exp-type-card ${key === 'city_contrast' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}"
                    data-type="${key}" onclick="selectExpType('${key}')">
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas fa-${t.icon}" style="color:${t.color}"></i>
                        <span class="text-sm font-bold">${t.label}</span>
                    </div>
                    <div class="text-[10px] text-gray-500">${t.desc}</div>
                    <div class="mt-2 flex gap-1 flex-wrap">
                        <span class="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">数据要求: ${t.dataReqLevel}</span>
                        <span class="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">${t.sampleReq}</span>
                    </div>
                </div>`).join('')}
            </div>
            <input type="hidden" id="exp-type" value="city_contrast" />
        </div>

        <!-- 类型特定提示 -->
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700" id="exp-type-hint">
            <i class="fas fa-exclamation-triangle mr-1"></i>
            <strong>城市对照提示：</strong>${EXPERIMENT_TYPES.city_contrast.riskNote}
        </div>

        <!-- 基本信息 -->
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="text-sm font-bold text-gray-700">战略假设</label>
                <select id="exp-assumption" class="input-field w-full mt-1">
                    ${assumptions.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-sm font-bold text-gray-700">实验名称</label>
                <input id="exp-name" class="input-field w-full mt-1" placeholder="如：北京标品占比提升至85%" />
            </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
            <div>
                <label class="text-sm font-bold text-gray-700">验证周期</label>
                <div class="flex gap-1 mt-1">
                    <input id="exp-duration" type="number" class="input-field w-full" value="30" min="7" max="180" />
                    <span class="text-xs text-gray-400 self-center">天</span>
                </div>
            </div>
            <div>
                <label class="text-sm font-bold text-gray-700">实验城市</label>
                <select id="exp-city" class="input-field w-full mt-1">
                    <option value="beijing">北京（实验组）</option>
                    <option value="shanghai">上海（实验组）</option>
                </select>
            </div>
            <div>
                <label class="text-sm font-bold text-gray-700">对照</label>
                <select id="exp-control" class="input-field w-full mt-1">
                    <option value="shanghai">上海（对照组）</option>
                    <option value="beijing">北京（对照组）</option>
                    <option value="self_before">自身前期（Before）</option>
                </select>
            </div>
        </div>

        <!-- 阶梯投放参数 -->
        <div class="hidden" id="staged-params">
            <label class="text-sm font-bold text-gray-700">阶梯投放比例</label>
            <div class="flex gap-2 mt-1 items-center text-sm">
                <span class="text-gray-500">第1阶段</span>
                <input id="stage1-pct" type="number" class="input-field w-16" value="10" />%
                <span class="text-gray-500 ml-2">第2阶段</span>
                <input id="stage2-pct" type="number" class="input-field w-16" value="30" />%
                <span class="text-gray-500 ml-2">第3阶段</span>
                <input id="stage3-pct" type="number" class="input-field w-16" value="50" />%
            </div>
        </div>

        <div>
            <label class="text-sm font-bold text-gray-700">成功标准</label>
            <input id="exp-criteria" class="input-field w-full mt-1" placeholder="如：单套毛利提升≥500元，7日去化率≥65%" />
        </div>

        <!-- 数据可信度预警 -->
        <div id="exp-fidelity-warning"></div>

        <!-- 预测 + 鲁棒性 -->
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="text-sm font-bold text-gray-700">预测利润变化</label>
                <div class="bg-gray-50 rounded-lg p-3 mt-1" id="exp-prediction">选择假设后自动计算...</div>
            </div>
            <div>
                <label class="text-sm font-bold text-gray-700">鲁棒性检验 <span class="font-normal text-gray-400">（数据±20%噪声下）</span></label>
                <div class="bg-gray-50 rounded-lg p-3 mt-1" id="exp-robustness">选择假设后自动检验...</div>
            </div>
        </div>
    </div>`;

    document.getElementById('modal-title').textContent = '🧪 新建BLM准实验';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-footer').innerHTML = `
        <button class="btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn-primary" onclick="submitExperiment()"><i class="fas fa-rocket mr-1"></i>启动实验</button>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');

    document.getElementById('exp-assumption').addEventListener('change', updateExpPrediction);
    updateExpPrediction();
}

function selectExpType(type) {
    document.getElementById('exp-type').value = type;
    document.querySelectorAll('.exp-type-card').forEach(c => {
        c.classList.remove('border-indigo-400', 'bg-indigo-50');
        c.classList.add('border-gray-200');
    });
    document.querySelector(`.exp-type-card[data-type="${type}"]`).classList.remove('border-gray-200');
    document.querySelector(`.exp-type-card[data-type="${type}"]`).classList.add('border-indigo-400', 'bg-indigo-50');

    const hint = document.getElementById('exp-type-hint');
    const t = EXPERIMENT_TYPES[type];
    hint.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i><strong>${t.label}提示：</strong>${t.riskNote}`;

    // 阶梯投放参数显隐
    const staged = document.getElementById('staged-params');
    staged.classList.toggle('hidden', type !== 'staged_rollout');

    // 对照组调整
    const control = document.getElementById('exp-control');
    if (type === 'time_contrast') {
        control.value = 'self_before';
    } else if (type === 'city_contrast') {
        control.value = document.getElementById('exp-city').value === 'beijing' ? 'shanghai' : 'beijing';
    }
}

function updateExpPrediction() {
    const asmpId = document.getElementById('exp-assumption')?.value;
    const asmp = AppState.assumptions.find(a => a.id === asmpId);
    const model = AppState.baselineModels[AppState.currentCity];
    if (!asmp || !model) return;

    const baseUE = calculateUE(model);
    const adjustedModel = typeof applyAssumption === 'function' ? applyAssumption(model, asmp) : model;
    const adjustedUE = calculateUE(adjustedModel);
    const profitDelta = adjustedUE.grossProfit - baseUE.grossProfit;

    // 预测面板
    const predContainer = document.getElementById('exp-prediction');
    if (predContainer) {
        predContainer.innerHTML = `<div class="grid grid-cols-3 gap-2 text-center text-xs">
            <div><div class="text-gray-400">基准利润</div><div class="font-bold">¥${formatNumber(Math.round(baseUE.grossProfit))}</div></div>
            <div><div class="text-gray-400">预测利润</div><div class="font-bold text-indigo-600">¥${formatNumber(Math.round(adjustedUE.grossProfit))}</div></div>
            <div><div class="text-gray-400">变化</div><div class="font-bold ${profitDelta >= 0 ? 'text-green-600' : 'text-red-600'}">${profitDelta >= 0 ? '+' : ''}¥${formatNumber(Math.round(profitDelta))}</div></div>
        </div>`;
    }

    // 鲁棒性面板
    const robContainer = document.getElementById('exp-robustness');
    if (robContainer && asmp.param_adjustments) {
        const paramKeys = Object.keys(asmp.param_adjustments);
        const mainParam = paramKeys[0];
        const lever = typeof E_LEVERS !== 'undefined' ? E_LEVERS.find(l => l.baseField === mainParam || l.key === mainParam) : null;

        if (lever) {
            const rob = robustnessTest(model, lever);
            const robColor = rob.isRobust ? '#10b981' : rob.directionConsistency >= 60 ? '#f59e0b' : '#ef4444';
            robContainer.innerHTML = `<div class="text-center">
                <div class="text-2xl font-black" style="color:${robColor}">${rob.overallRobustness}</div>
                <div class="text-[10px] text-gray-400">鲁棒性评分</div>
                <div class="text-[10px] mt-1" style="color:${robColor}">${rob.verdict}</div>
                <div class="text-[10px] text-gray-400 mt-1">方向一致性${rob.directionConsistency.toFixed(0)}% · 幅度稳定性${rob.magnitudeStability.toFixed(0)}%</div>
            </div>`;
        } else {
            robContainer.innerHTML = `<div class="text-center text-xs text-gray-400 py-2">该参数无对应E杠杆，跳过鲁棒性检验</div>`;
        }
    }

    // 数据可信度预警
    const fidelityContainer = document.getElementById('exp-fidelity-warning');
    if (fidelityContainer && asmp.param_adjustments) {
        const lowFidelityParams = [];
        const highCostParams = [];
        Object.keys(asmp.param_adjustments).forEach(k => {
            const f = getParamFidelityScore(k);
            const c = getDigitizationCost(k);
            const label = typeof UE_PARAM_DEFINITIONS !== 'undefined' && UE_PARAM_DEFINITIONS[k] ? UE_PARAM_DEFINITIONS[k].label : k;
            if (f < 70) lowFidelityParams.push({ key: k, label, fidelity: f });
            if (c.cost > 60) highCostParams.push({ key: k, label, cost: c.cost, source: c.source });
        });

        let fhtml = '';
        if (lowFidelityParams.length > 0) {
            fhtml += `<div class="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 mb-2">
                <i class="fas fa-shield-alt mr-1"></i><strong>数据失真预警：</strong>
                ${lowFidelityParams.map(p => `${p.label}(可信度${p.fidelity}%)`).join('、')}
                <span class="text-red-500">可能存在指标博弈或采集不全</span>
            </div>`;
        }
        if (highCostParams.length > 0) {
            fhtml += `<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700">
                <i class="fas fa-coins mr-1"></i><strong>线上化成本预警：</strong>
                ${highCostParams.map(p => `${p.label}(成本${p.cost}/100, 需${p.source})`).join('、')}
            </div>`;
        }
        if (lowFidelityParams.length === 0 && highCostParams.length === 0) {
            fhtml = `<div class="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700">
                <i class="fas fa-check-circle mr-1"></i>该假设涉及的参数数据可信度高、采集成本低，适合快速验证。
            </div>`;
        }
        fidelityContainer.innerHTML = fhtml;
    }
}

function submitExperiment() {
    const asmpId = document.getElementById('exp-assumption').value;
    const name = document.getElementById('exp-name').value || '未命名实验';
    const duration = parseInt(document.getElementById('exp-duration').value) || 30;
    const criteria = document.getElementById('exp-criteria').value || '';
    const expType = document.getElementById('exp-type').value;
    const expCity = document.getElementById('exp-city').value;
    const controlGroup = document.getElementById('exp-control').value;

    const asmp = AppState.assumptions.find(a => a.id === asmpId);
    const model = AppState.baselineModels[AppState.currentCity];
    const baseUE = calculateUE(model);
    const adjustedModel = typeof applyAssumption === 'function' ? applyAssumption(model, asmp) : model;
    const adjustedUE = calculateUE(adjustedModel);

    // 阶梯投放参数
    let stages = null;
    if (expType === 'staged_rollout') {
        stages = [
            parseInt(document.getElementById('stage1-pct')?.value) || 10,
            parseInt(document.getElementById('stage2-pct')?.value) || 30,
            parseInt(document.getElementById('stage3-pct')?.value) || 50,
        ];
    }

    const experiment = {
        id: 'exp_' + Date.now(),
        name,
        experiment_type: expType,
        experiment_type_label: EXPERIMENT_TYPES[expType]?.label || expType,
        assumption_id: asmpId,
        assumption_name: asmp ? asmp.name : '',
        city: expCity,
        control_group: controlGroup,
        duration_days: duration,
        success_criteria: criteria,
        stages,
        status: 'running',
        created_at: new Date().toISOString(),
        end_date: new Date(Date.now() + duration * 86400000).toISOString(),
        prediction: {
            base_profit: baseUE.grossProfit,
            predicted_profit: adjustedUE.grossProfit,
            profit_delta: adjustedUE.grossProfit - baseUE.grossProfit,
            base_revenue: baseUE.totalRevenue,
            predicted_revenue: adjustedUE.totalRevenue,
        },
        // 保存数据可信度信息
        data_fidelity: asmp.param_adjustments ? Object.keys(asmp.param_adjustments).map(k => ({
            param: k, fidelity: getParamFidelityScore(k), digitCost: getDigitizationCost(k).cost
        })) : [],
        actual: null,
        verdict: null,
    };

    AppState.experiments.push(experiment);
    closeModal();
    showToast(`${EXPERIMENT_TYPES[expType]?.label || ''}实验「${name}」已启动！验证周期${duration}天`, 'success');
    renderAlignmentPage();
    saveExperimentToCloud(experiment);
}

async function saveExperimentToCloud(exp) {
    // 纯前端模式：使用localStorage替代后端API
    try {
        const experiments = JSON.parse(localStorage.getItem('ue_experiments') || '[]');
        const idx = experiments.findIndex(e => e.id === exp.id);
        if (idx >= 0) experiments[idx] = exp;
        else experiments.push(exp);
        localStorage.setItem('ue_experiments', JSON.stringify(experiments));
    } catch (e) { console.warn('Save experiment failed:', e); }
}

// 录入实际结果
function recordActualResult(expId) {
    const exp = AppState.experiments.find(e => e.id === expId);
    if (!exp) return;

    const isStaged = exp.experiment_type === 'staged_rollout';

    let html = `<div class="space-y-4">
        <div class="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            <strong>实验：</strong>${exp.name}
            <span class="tag text-[10px] ml-1" style="background:${EXPERIMENT_TYPES[exp.experiment_type]?.color || '#666'}20;color:${EXPERIMENT_TYPES[exp.experiment_type]?.color || '#666'}">${exp.experiment_type_label}</span><br/>
            <strong>假设：</strong>${exp.assumption_name}<br/>
            <strong>预测利润变化：</strong>${exp.prediction.profit_delta >= 0 ? '+' : ''}¥${formatNumber(Math.round(exp.prediction.profit_delta))}
            ${exp.data_fidelity && exp.data_fidelity.some(d => d.fidelity < 70) ?
                `<br/><span class="text-amber-600"><i class="fas fa-exclamation-triangle mr-1"></i>注意：部分参数数据可信度<70%，建议放宽评判标准</span>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="text-sm font-bold text-gray-700">实际单位利润</label>
                <input id="actual-profit" type="number" class="input-field w-full mt-1" placeholder="元" />
            </div>
            <div>
                <label class="text-sm font-bold text-gray-700">实际单位收入</label>
                <input id="actual-revenue" type="number" class="input-field w-full mt-1" placeholder="元" />
            </div>
        </div>
        ${isStaged ? `
        <div>
            <label class="text-sm font-bold text-gray-700">各阶段实际利润</label>
            <div class="grid grid-cols-3 gap-2 mt-1">
                ${(exp.stages || [10,30,50]).map((s, i) => `
                <div>
                    <span class="text-xs text-gray-500">阶段${i+1}(${s}%)</span>
                    <input id="stage-profit-${i}" type="number" class="input-field w-full mt-0.5" placeholder="元/套" />
                </div>`).join('')}
            </div>
        </div>` : ''}
        <div>
            <label class="text-sm font-bold text-gray-700">数据置信度自评</label>
            <select id="actual-confidence" class="input-field w-full mt-1">
                <option value="high">高 — 数据来自系统自动采集，抽检一致</option>
                <option value="medium" selected>中 — 部分人工填报，抽检基本一致</option>
                <option value="low">低 — 大量人工填报，未做抽检</option>
            </select>
        </div>
        <div>
            <label class="text-sm font-bold text-gray-700">备注</label>
            <textarea id="actual-notes" class="input-field w-full mt-1" rows="2" placeholder="实际执行观察、干扰因素、数据异常..."></textarea>
        </div>
    </div>`;

    document.getElementById('modal-title').textContent = '📊 录入实际结果';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-footer').innerHTML = `
        <button class="btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn-primary" onclick="submitActualResult('${expId}')"><i class="fas fa-check mr-1"></i>提交评价</button>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function submitActualResult(expId) {
    const exp = AppState.experiments.find(e => e.id === expId);
    if (!exp) return;

    const actualProfit = parseFloat(document.getElementById('actual-profit').value) || 0;
    const actualRevenue = parseFloat(document.getElementById('actual-revenue').value) || 0;
    const confidence = document.getElementById('actual-confidence').value;
    const notes = document.getElementById('actual-notes').value || '';

    // 阶梯投放各阶段利润
    let stageResults = null;
    if (exp.experiment_type === 'staged_rollout' && exp.stages) {
        stageResults = exp.stages.map((s, i) => ({
            pct: s,
            profit: parseFloat(document.getElementById(`stage-profit-${i}`)?.value) || 0
        }));
    }

    exp.actual = { profit: actualProfit, revenue: actualRevenue, confidence, notes, stageResults, recorded_at: new Date().toISOString() };

    // 评判逻辑——根据数据置信度动态调整阈值
    const predictedProfit = exp.prediction.predicted_profit;
    const predictionError = predictedProfit !== 0 ? Math.abs((actualProfit - predictedProfit) / predictedProfit * 100) : 100;
    const directionMatch = (actualProfit - exp.prediction.base_profit) * exp.prediction.profit_delta >= 0;

    // 低置信度数据放宽阈值
    const confirmThreshold = confidence === 'low' ? 35 : confidence === 'medium' ? 25 : 20;

    if (directionMatch && predictionError < confirmThreshold) {
        exp.verdict = 'confirmed';
        exp.status = 'completed';
    } else if (directionMatch) {
        exp.verdict = 'partial';
        exp.status = 'completed';
    } else {
        exp.verdict = 'rejected';
        exp.status = 'failed';
    }

    exp.prediction_error = predictionError;
    exp.data_confidence = confidence;

    closeModal();
    const verdictText = exp.verdict === 'confirmed' ? '✅ 假设验证' : exp.verdict === 'partial' ? '⚠️ 部分验证' : '❌ 假设否定';
    showToast(`实验「${exp.name}」已评价：${verdictText}`, exp.verdict === 'confirmed' ? 'success' : 'warning');
    renderAlignmentPage();
}

// ========== 页面渲染 ==========

function renderAlignmentPage() {
    renderAttentionHeatmap();
    renderAttentionSankey();
    renderAlignmentScorePanel();
    renderDataConstraintPanel();
    renderExperimentPanel();
    renderExperimentHistory();
}

// 获取最敏感的 UE 参数（基于 U×E 交叉分析排名靠前的）
function getTopSensitiveParams(limit = 10) {
    const city = AppState.currentCity;
    const model = AppState.baselineModels[city];
    const baseUE = calculateBeikeUE(model);
    const baseProfit = baseUE.operatingProfit;
    
    // 计算所有参数的利润敏感度
    const paramSensitivities = [];
    
    // 遍历所有 UE 参数定义
    const allParams = [
        ...UE_PARAMS.map(p => ({ key: p.key, label: p.label, category: p.category })),
        { key: 'rent_premium', label: '月租金溢价', category: '收入' },
        { key: 'renovation_total', label: '装修总价', category: '成本' },
        { key: 'foreman', label: '工长成本', category: '成本' },
        { key: 'furniture', label: '家具成本', category: '成本' }
    ];
    
    allParams.forEach(param => {
        if (model[param.key] === undefined) return;
        
        const adjusted = JSON.parse(JSON.stringify(model));
        // 测试 ±10% 变化的影响
        const testValue = adjusted[param.key] * 1.1;
        adjusted[param.key] = testValue;
        
        try {
            const adjUE = calculateBeikeUE(adjusted);
            const profitChange = Math.abs(adjUE.operatingProfit - baseProfit);
            
            if (profitChange > 50) { // 只保留有显著影响的
                paramSensitivities.push({
                    key: param.key,
                    label: param.label,
                    sensitivity: profitChange,
                    category: param.category
                });
            }
        } catch (e) {
            // 忽略计算错误的参数
        }
    });
    
    // 按敏感度排序并返回前 N 个
    paramSensitivities.sort((a, b) => b.sensitivity - a.sensitivity);
    return paramSensitivities.slice(0, limit);
}

// --- E杠杆按利润弹性排序，取Top N ---
function getTopELevers(limit = 10) {
    if (typeof E_LEVERS === 'undefined' || !E_LEVERS.length) return [];

    const city = AppState.currentCity;
    const model = AppState.baselineModels[city];
    if (!model) return [];

    const baseUE = typeof calculateBeikeUE === 'function' ? calculateBeikeUE(model) : calculateUE(model);
    const baseProfit = baseUE.operatingProfit !== undefined ? baseUE.operatingProfit : baseUE.grossProfit;

    const results = [];

    E_LEVERS.forEach(lever => {
        const paramKey = lever.baseField || lever.key;
        if (model[paramKey] === undefined) return;

        const adjusted = JSON.parse(JSON.stringify(model));
        // 用杠杆自带的 adjustStep 做弹性测试
        adjusted[paramKey] = adjusted[paramKey] + (lever.adjustStep || adjusted[paramKey] * 0.1);

        try {
            const adjUE = typeof calculateBeikeUE === 'function' ? calculateBeikeUE(adjusted) : calculateUE(adjusted);
            const adjProfit = adjUE.operatingProfit !== undefined ? adjUE.operatingProfit : adjUE.grossProfit;
            const delta = Math.abs(adjProfit - baseProfit);

            if (delta > 0) {
                results.push({
                    key: paramKey,
                    leverKey: lever.key,
                    label: lever.label,
                    group: lever.group,       // '收入↑' / '效率↑' / '成本↓'
                    type: lever.type,         // 'price' / 'efficiency' / 'cost'
                    color: lever.color,       // 杠杆自带颜色
                    unit: lever.unit,
                    sensitivity: delta,
                    profitDelta: adjProfit - baseProfit,
                    adjustStep: lever.adjustStep
                });
            }
        } catch(e) { /* skip */ }
    });

    results.sort((a, b) => b.sensitivity - a.sensitivity);
    return results.slice(0, limit);
}

// --- Attention 热力图（含失真修正） ---
// 升级：Y轴从14个假设 → 4个战略主题（聚合子实验参数影响）
function renderAttentionHeatmap() {
    const chart = getOrCreateChart('chart-attention-heatmap');
    if (!chart) return;

    const themes = AppState.themes || [];
    const assumptions = AppState.assumptions.filter(a => a.is_active);

    if (assumptions.length === 0) {
        chart.setOption({ title: { text: '请先激活战略假设', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } }, series: [] });
        return;
    }

    const model = AppState.baselineModels[AppState.currentCity];
    const baseUE = calculateUE(model);
    const baseProfit = baseUE.grossProfit;

    // X轴：E杠杆按利润弹性从大到小取Top 10
    const topELevers = getTopELevers(10);
    // 回退：如果E_LEVERS不可用，用getTopSensitiveParams
    const topLeverages = topELevers.length > 0
        ? topELevers
        : getTopSensitiveParams(10).map(p => ({ key: p.key, label: p.label, group: '综合', color: '#666', sensitivity: p.sensitivity }));

    const paramList = topLeverages.map(p => p.key);
    const paramLabels = topLeverages.map(p => p.label);

    // === 主题模式（4行）vs 回退扁平模式（14行）===
    const useThemes = themes.length > 0 && typeof aggregateThemeParamAdjustments === 'function';

    if (useThemes) {
        // --- 4个战略主题作为Y轴 ---
        const themeLabels = themes.map(t => `${t.theme_name}(${(t.experiment_ids || []).length})`);
        const data = [];
        let maxWeight = 0;

        themes.forEach((theme, yi) => {
            // 获取该主题下所有激活的实验
            const themeExps = assumptions.filter(a => (theme.experiment_ids || []).includes(a.id));

            paramList.forEach((paramKey, xi) => {
                // 聚合主题下所有实验对该参数的影响
                let totalImpact = 0;
                let hitCount = 0;

                themeExps.forEach(asmp => {
                    if (!asmp.param_adjustments) return;
                    let adjValue = null;
                    let adjType = 'multiply';

                    // 检查扁平结构
                    if (asmp.param_adjustments[paramKey] !== undefined && typeof asmp.param_adjustments[paramKey] !== 'object') {
                        adjValue = asmp.param_adjustments[paramKey];
                        adjType = asmp.adjustment_type?.[paramKey] || 'multiply';
                    }
                    // 检查三视角嵌套结构
                    Object.entries(asmp.param_adjustments).forEach(([ueType, params]) => {
                        if (typeof params === 'object' && params !== null && params[paramKey] !== undefined) {
                            adjValue = params[paramKey];
                            adjType = asmp.adjustment_type?.[ueType]?.[paramKey] || 'multiply';
                        }
                    });

                    if (adjValue !== null && model[paramKey] !== undefined) {
                        const adjusted = JSON.parse(JSON.stringify(model));
                        if (adjType === 'multiply') adjusted[paramKey] *= adjValue;
                        else if (adjType === 'add') adjusted[paramKey] += adjValue;
                        else if (adjType === 'set') adjusted[paramKey] = adjValue;
                        adjusted.avg_rent_after = adjusted.avg_rent_before * (1 + adjusted.rent_premium_rate / 100);
                        adjusted.revenue_per_unit = adjusted.gtv_per_unit * (adjusted.service_fee_rate / 100);

                        const adjUE = calculateUE(adjusted);
                        const impact = Math.abs(adjUE.grossProfit - baseProfit);
                        const fidelity = getParamFidelityScore(paramKey);
                        totalImpact += impact * (fidelity / 100);
                        hitCount++;
                    }
                });

                maxWeight = Math.max(maxWeight, totalImpact);
                data.push([xi, yi, +totalImpact.toFixed(0)]);
            });
        });

        chart.setOption({
            title: {
                text: 'Attention权重矩阵（4主题 × E杠杆Top10）',
                subtext: '获客·产品·转化·交付 → E杠杆利润弹性排序',
                left: 'center',
                textStyle: { fontSize: 12, color: '#666' },
                subtextStyle: { fontSize: 10, color: '#999' }
            },
            tooltip: {
                formatter: p => {
                    const param = paramLabels[p.data[0]] || '';
                    const theme = themes[p.data[1]];
                    const themeName = theme ? theme.theme_name : '';
                    const paramKey = paramList[p.data[0]];
                    const lever = topLeverages[p.data[0]];
                    const fidelity = getParamFidelityScore(paramKey);
                    const cost = getDigitizationCost(paramKey);
                    const expCount = theme ? (theme.experiment_ids || []).length : 0;
                    const groupInfo = lever?.group ? `<br/>分组: ${lever.group}` : '';
                    const sensInfo = lever?.sensitivity ? `<br/>弹性(¥): ${formatNumber(Math.round(lever.sensitivity))}` : '';
                    return `<b style="color:${theme?.color || '#333'}">${themeName}</b>(${expCount}个实验) → <b style="color:${lever?.color || '#333'}">${param}</b>${groupInfo}${sensInfo}<br/>
                        聚合注意力: ¥${formatNumber(p.data[2])} <span style="color:#999">(失真修正后)</span><br/>
                        数据可信度: ${fidelity}% · 线上化成本: ${cost.cost}/100`;
                }
            },
            grid: { left: 90, right: 60, top: 55, bottom: 80 },
            xAxis: {
                type: 'category', data: paramLabels,
                axisLabel: {
                    fontSize: 10, rotate: 30, fontWeight: 'bold',
                    formatter: (val, idx) => val,
                    color: (val, idx) => {
                        const lev = topLeverages[idx];
                        return lev?.color || '#333';
                    }
                },
                splitArea: { show: true },
                name: 'E杠杆（按利润弹性↓排序）', nameLocation: 'middle', nameGap: 50,
                nameTextStyle: { color: '#666', fontSize: 11, fontWeight: 'bold' }
            },
            yAxis: {
                type: 'category', data: themeLabels,
                axisLabel: {
                    fontSize: 11, fontWeight: 'bold',
                    formatter: (val, idx) => {
                        const theme = themes[idx];
                        return theme ? `{${theme.id}|${val}}` : val;
                    },
                    rich: themes.reduce((acc, t) => {
                        acc[t.id] = { color: t.color, fontWeight: 'bold', fontSize: 11 };
                        return acc;
                    }, {})
                },
                splitArea: { show: true }
            },
            visualMap: {
                min: 0, max: Math.max(maxWeight, 1), calculable: true, orient: 'vertical', right: 5, top: 'center',
                inRange: { color: ['#f5f5f5', '#c4b5fd', '#8b5cf6', '#7c3aed', '#5b21b6'] },
                textStyle: { fontSize: 10 }, text: ['高注意力', '低']
            },
            series: [{
                type: 'heatmap', data,
                label: { show: true, fontSize: 10, fontWeight: 'bold', formatter: p => p.data[2] > 0 ? '¥' + formatNumber(p.data[2]) : '' },
                itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
            }]
        });
    } else {
        // --- 回退：原始14个假设扁平模式 ---
        const asmpLabels = assumptions.map(a => {
            const name = a.assumption_name || a.name || '未命名';
            return name.length > 8 ? name.slice(0, 8) + '...' : name;
        });
        const data = [];
        let maxWeight = 0;

        assumptions.forEach((asmp, yi) => {
            paramList.forEach((paramKey, xi) => {
                let adjValue = null;
                let adjType = 'multiply';
                if (asmp.param_adjustments) {
                    Object.entries(asmp.param_adjustments).forEach(([ueType, params]) => {
                        if (typeof params === 'object' && params !== null && params[paramKey] !== undefined) {
                            adjValue = params[paramKey];
                            adjType = asmp.adjustment_type?.[ueType]?.[paramKey] || 'multiply';
                        }
                    });
                }
                if (adjValue !== null && model[paramKey] !== undefined) {
                    const adjusted = JSON.parse(JSON.stringify(model));
                    if (adjType === 'multiply') adjusted[paramKey] *= adjValue;
                    else if (adjType === 'add') adjusted[paramKey] += adjValue;
                    else if (adjType === 'set') adjusted[paramKey] = adjValue;
                    adjusted.avg_rent_after = adjusted.avg_rent_before * (1 + adjusted.rent_premium_rate / 100);
                    adjusted.revenue_per_unit = adjusted.gtv_per_unit * (adjusted.service_fee_rate / 100);
                    const adjUE = calculateUE(adjusted);
                    const impact = Math.abs(adjUE.grossProfit - baseProfit);
                    const fidelity = getParamFidelityScore(paramKey);
                    const effectiveImpact = impact * (fidelity / 100);
                    maxWeight = Math.max(maxWeight, effectiveImpact);
                    data.push([xi, yi, +effectiveImpact.toFixed(0)]);
                } else {
                    data.push([xi, yi, 0]);
                }
            });
        });

        chart.setOption({
            title: { text: 'Attention权重矩阵（E杠杆Top10）', left: 'center', textStyle: { fontSize: 12, color: '#666' } },
            tooltip: {
                formatter: p => {
                    const param = paramLabels[p.data[0]] || '';
                    const asmpName = asmpLabels[p.data[1]] || '';
                    const paramKey = paramList[p.data[0]];
                    const lever = topLeverages[p.data[0]];
                    const fidelity = getParamFidelityScore(paramKey);
                    const cost = getDigitizationCost(paramKey);
                    return `<b>${asmpName}</b> → <b style="color:${lever?.color || '#333'}">${param}</b>${lever?.group ? ' [' + lever.group + ']' : ''}<br/>有效注意力: ¥${formatNumber(p.data[2])}<br/>可信度: ${fidelity}% · 成本: ${cost.cost}/100`;
                }
            },
            grid: { left: 100, right: 60, top: 40, bottom: 80 },
            xAxis: { type: 'category', data: paramLabels, axisLabel: { fontSize: 10, rotate: 30, fontWeight: 'bold', color: (val, idx) => topLeverages[idx]?.color || '#333' }, splitArea: { show: true }, name: 'E杠杆（按利润弹性↓排序）', nameLocation: 'middle', nameGap: 50, nameTextStyle: { color: '#666', fontSize: 11, fontWeight: 'bold' } },
            yAxis: { type: 'category', data: asmpLabels, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
            visualMap: { min: 0, max: Math.max(maxWeight, 1), calculable: true, orient: 'vertical', right: 5, top: 'center', inRange: { color: ['#f5f5f5', '#c4b5fd', '#8b5cf6', '#7c3aed', '#5b21b6'] }, textStyle: { fontSize: 10 }, text: ['高注意力', '低'] },
            series: [{ type: 'heatmap', data, label: { show: true, fontSize: 9, formatter: p => p.data[2] > 0 ? '¥' + formatNumber(p.data[2]) : '' }, itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 2 } }]
        });
    }
}

// --- Sankey: UE信息流（双视图切换） ---
// 概览模式: 4主题 → Top杠杆（极简，与热力图对齐）
// 详情模式: 点击某主题标签 → 展开该主题(0) → 实验(1) → 杠杆(2)，其余主题淡化虚线直连杠杆

let _sankeyViewMode = 'overview';   // 'overview' | 'detail'
let _sankeyExpandedTheme = null;    // theme.id or null

function switchSankeyView(mode, themeId) {
    _sankeyViewMode = mode;
    _sankeyExpandedTheme = themeId || null;
    renderAttentionSankey();
}

function renderAttentionSankey() {
    const chart = getOrCreateChart('chart-attention-sankey');
    if (!chart) return;

    const themes = AppState.themes || [];
    const assumptions = AppState.assumptions.filter(a => a.is_active);

    if (assumptions.length === 0) {
        chart.setOption({ title: { text: '请先激活战略假设', left: 'center', top: 'center', textStyle: { color: '#999' } }, series: [] });
        return;
    }

    const model = AppState.baselineModels[AppState.currentCity];
    const baseUE = calculateUE(model);
    const baseProfit = baseUE.grossProfit;

    // E杠杆按利润弹性排序取Top 10
    const topELevers = getTopELevers(10);
    const topLeverages = topELevers.length > 0
        ? topELevers
        : getTopSensitiveParams(10).map(p => ({ key: p.key, label: p.label, group: '综合', color: '#666', sensitivity: p.sensitivity }));
    const statusColors = { '已验证': '#10b981', '验证中': '#f59e0b', '待验证': '#6b7280', '已否定': '#ef4444' };

    // === 工具栏渲染 ===
    const toolbar = document.getElementById('sankey-toolbar');
    if (toolbar && themes.length > 0) {
        const isOv = _sankeyViewMode === 'overview';
        let tb = `<button onclick="switchSankeyView('overview')"
            class="px-3 py-1 rounded-full text-xs font-bold transition-all ${isOv ? 'bg-gray-800 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
            <i class="fas fa-th-large mr-1"></i>概览</button>`;
        themes.forEach(t => {
            const isAct = _sankeyViewMode === 'detail' && _sankeyExpandedTheme === t.id;
            const cnt = (t.experiment_ids || []).length;
            tb += `<button onclick="switchSankeyView('detail','${t.id}')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all ${isAct ? 'text-white shadow' : 'hover:shadow'}"
                style="${isAct ? `background:${t.color}` : `background:${t.color}15;color:${t.color}`}">
                <i class="fas fa-${t.icon} mr-1"></i>${t.theme_name}(${cnt})</button>`;
        });
        toolbar.innerHTML = tb;
    }

    // === 辅助函数 ===
    const nodes = [], links = [], nodeSet = new Set();
    function addNode(n) { if (!nodeSet.has(n.name)) { nodes.push(n); nodeSet.add(n.name); } }

    function calcParamImpact(asmp, paramKey) {
        let adjValue = null, adjType = 'multiply';
        if (!asmp.param_adjustments) return 0;
        if (asmp.param_adjustments[paramKey] !== undefined && typeof asmp.param_adjustments[paramKey] !== 'object') {
            adjValue = asmp.param_adjustments[paramKey];
            adjType = asmp.adjustment_type?.[paramKey] || 'multiply';
        }
        Object.entries(asmp.param_adjustments).forEach(([k, v]) => {
            if (typeof v === 'object' && v !== null && v[paramKey] !== undefined) {
                adjValue = v[paramKey]; adjType = asmp.adjustment_type?.[k]?.[paramKey] || 'multiply';
            }
        });
        if (adjValue === null || model[paramKey] === undefined) return 0;
        const adj = JSON.parse(JSON.stringify(model));
        if (adjType === 'multiply') adj[paramKey] *= adjValue;
        else if (adjType === 'add') adj[paramKey] += adjValue;
        else if (adjType === 'set') adj[paramKey] = adjValue;
        adj.avg_rent_after = adj.avg_rent_before * (1 + adj.rent_premium_rate / 100);
        adj.revenue_per_unit = adj.gtv_per_unit * (adj.service_fee_rate / 100);
        try { return Math.abs(calculateUE(adj).grossProfit - baseProfit); } catch(e) { return 0; }
    }

    // === 归一化 link value，防止节点高度极端失衡 ===
    // 将 raw values 映射到 [minVis, maxVis]，保留 _impact 给 tooltip
    function normalizeLinks(links, minVis, maxVis) {
        if (links.length === 0) return;
        const rawValues = links.map(l => l.value);
        const rawMin = Math.min(...rawValues);
        const rawMax = Math.max(...rawValues);
        const range = rawMax - rawMin || 1;
        links.forEach(l => {
            if (!l._impact) l._impact = l.value;
            l.value = minVis + (l.value - rawMin) / range * (maxVis - minVis);
        });
    }

    // 无主题回退
    if (themes.length === 0) {
        _renderFlatSankey(chart, assumptions, topLeverages, statusColors, nodes, links, nodeSet, addNode);
        return;
    }

    // ===================================================================
    //  概览模式: 主题(depth=0) → 杠杆(depth=1)
    // ===================================================================
    if (_sankeyViewMode === 'overview') {

        themes.forEach(theme => {
            const cnt = (theme.experiment_ids || []).length;
            addNode({ name: `📋${theme.theme_name}`, itemStyle: { color: theme.color }, depth: 0,
                _type: 'theme', _theme: theme, _expCount: cnt });
        });

        topLeverages.forEach(lev => {
            addNode({ name: `⚡${lev.label}`, itemStyle: { color: lev.color || '#7c3aed' }, depth: 1,
                _lever: lev });
        });

        themes.forEach(theme => {
            const themeExps = assumptions.filter(a => (theme.experiment_ids || []).includes(a.id));
            const tn = `📋${theme.theme_name}`;
            topLeverages.forEach(lev => {
                let total = 0;
                themeExps.forEach(a => { total += calcParamImpact(a, lev.key); });
                if (total > 0) {
                    links.push({ source: tn, target: `⚡${lev.label}`, value: Math.max(20, total),
                        lineStyle: { opacity: 0.55, color: theme.color }, _impact: total });
                }
            });
        });

        if (links.length === 0 && nodes.length >= 2) links.push({ source: nodes[0].name, target: nodes[1].name, value: 10 });

        // 归一化link高度，防止极端失衡
        normalizeLinks(links, 25, 150);

        chart.setOption({
            title: { text: '战略主题 → E杠杆对齐（概览）',
                subtext: '点击上方主题标签查看实验详情 | 宽度=聚合利润影响(¥)',
                left: 'center', textStyle: { fontSize: 13, fontWeight: 'bold' },
                subtextStyle: { fontSize: 10, color: '#999' } },
            tooltip: { trigger: 'item', triggerOn: 'mousemove',
                formatter: function(p) {
                    if (p.dataType === 'edge') { const _s = s => { const c = s.codePointAt(0); return s.slice(c > 0xFFFF ? 2 : 1); }; return `${_s(p.data.source)} → ${_s(p.data.target)}<br/>聚合利润影响: ¥${formatNumber(Math.round(p.data._impact || p.value))}`; }
                    const d = p.data;
                    if (d._type === 'theme') return `<b style="color:${d._theme.color}"><i class="fas fa-${d._theme.icon}"></i> ${d._theme.theme_name}</b><br/>实验: ${d._expCount}个<br/><span style="color:#999">点击上方标签查看详情</span>`;
                    if (d._lever) { const lev = d._lever; const inflows = links.filter(l => l.target === p.name).length; return `<b style="color:${lev.color}">${lev.label}</b><br/>分组: ${lev.group || '—'}<br/>弹性(¥): ${formatNumber(Math.round(lev.sensitivity || 0))}${inflows > 1 ? `<br/><span style="color:#f59e0b">⚠ ${inflows}个主题共振此杠杆</span>` : ''}`; }
                    return p.name;
                } },
            series: [{ type: 'sankey', emphasis: { focus: 'adjacency' }, data: nodes, links: links,
                lineStyle: { color: 'source', curveness: 0.4, opacity: 0.6 },
                label: { fontSize: 11, color: '#333', fontWeight: 'bold',
                    formatter: p => { const c = p.name.codePointAt(0); return p.name.slice(c > 0xFFFF ? 2 : 1); } },
                nodeWidth: 28, nodeGap: 16, layoutIterations: 32, draggable: false,
                levels: [
                    { depth: 0, itemStyle: { borderWidth: 3, borderColor: '#333' }, label: { fontSize: 12, fontWeight: 'bold' } },
                    { depth: 1, itemStyle: { borderWidth: 2, borderColor: '#7c3aed' } }
                ] }]
        });

    // ===================================================================
    //  详情模式: 主题(0) → 实验(1) → 杠杆(2)，其余主题淡化
    // ===================================================================
    } else {
        const expandedTheme = themes.find(t => t.id === _sankeyExpandedTheme);
        if (!expandedTheme) { _sankeyViewMode = 'overview'; renderAttentionSankey(); return; }

        // Layer 0: 所有主题（展开的高亮，其余淡化）
        themes.forEach(theme => {
            const isExp = theme.id === _sankeyExpandedTheme;
            const cnt = (theme.experiment_ids || []).length;
            addNode({ name: `📋${theme.theme_name}`, itemStyle: { color: theme.color, opacity: isExp ? 1 : 0.3 }, depth: 0,
                _type: 'theme', _theme: theme, _expCount: cnt, _expanded: isExp });
        });

        // Layer 1: 展开主题的实验
        const expandedExps = assumptions.filter(a => (expandedTheme.experiment_ids || []).includes(a.id));
        expandedExps.forEach((a, idx) => {
            const name = a.assumption_name || a.name || '未命名';
            let sn = name.length > 12 ? name.slice(0, 12) + '..' : name;
            const orig = sn; let sfx = '';
            while (nodeSet.has(`🧪${sn}${sfx}`)) { sfx = `(${idx})`; }
            sn = `${orig}${sfx}`;
            const status = a.validation_status || '待验证';
            addNode({ name: `🧪${sn}`, itemStyle: { color: statusColors[status] || '#6b7280' }, depth: 1,
                _type: 'experiment_asmp', _status: status, _fullName: name, _id: a.id });
        });

        // Layer 2: E杠杆
        topLeverages.forEach(lev => {
            addNode({ name: `⚡${lev.label}`, itemStyle: { color: lev.color || '#7c3aed' }, depth: 2,
                _lever: lev });
        });

        // 连接1: 展开主题 → 实验
        const tn = `📋${expandedTheme.theme_name}`;
        expandedExps.forEach(a => {
            const en = nodes.find(n => n._type === 'experiment_asmp' && n._id === a.id);
            if (en) links.push({ source: tn, target: en.name, value: 80, lineStyle: { opacity: 0.6, color: expandedTheme.color } });
        });

        // 连接2: 实验 → 杠杆
        expandedExps.forEach(a => {
            const en = nodes.find(n => n._type === 'experiment_asmp' && n._id === a.id);
            if (!en) return;
            topLeverages.forEach(lev => {
                const impact = calcParamImpact(a, lev.key);
                if (impact > 0) {
                    links.push({ source: en.name, target: `⚡${lev.label}`, value: Math.max(15, impact),
                        lineStyle: { opacity: 0.45, color: statusColors[a.validation_status] || '#6b7280' }, _impact: impact });
                }
            });
        });

        // 连接3: 折叠主题 → 杠杆（淡化虚线）
        themes.filter(t => t.id !== _sankeyExpandedTheme).forEach(theme => {
            const otn = `📋${theme.theme_name}`;
            const otherExps = assumptions.filter(a => (theme.experiment_ids || []).includes(a.id));
            topLeverages.forEach(lev => {
                let total = 0;
                otherExps.forEach(a => { total += calcParamImpact(a, lev.key); });
                if (total > 0) {
                    links.push({ source: otn, target: `⚡${lev.label}`, value: Math.max(8, total * 0.3),
                        lineStyle: { opacity: 0.12, color: theme.color, type: 'dashed' }, _impact: total });
                }
            });
        });

        if (links.length === 0 && nodes.length >= 2) links.push({ source: nodes[0].name, target: nodes[1].name, value: 10 });

        // 归一化link高度，防止极端失衡（详情模式范围略小）
        normalizeLinks(links, 15, 120);

        chart.setOption({
            title: { text: `${expandedTheme.theme_name} — 实验 → UE杠杆（详情）`,
                subtext: `${expandedExps.length}个实验 | 其余主题淡化虚线 | 宽度=利润影响(¥)`,
                left: 'center', textStyle: { fontSize: 13, fontWeight: 'bold', color: expandedTheme.color },
                subtextStyle: { fontSize: 10, color: '#999' } },
            tooltip: { trigger: 'item', triggerOn: 'mousemove',
                formatter: function(p) {
                    if (p.dataType === 'edge') { const _s = s => { const c = s.codePointAt(0); return s.slice(c > 0xFFFF ? 2 : 1); }; return `${_s(p.data.source)} → ${_s(p.data.target)}<br/>利润影响: ¥${formatNumber(Math.round(p.data._impact || p.value))}`; }
                    const d = p.data;
                    if (d._type === 'theme') { const hint = d._expanded ? '' : '<br/><span style="color:#999">点击上方标签展开</span>'; return `<b style="color:${d._theme.color}">${d._theme.theme_name}</b><br/>实验: ${d._expCount}个${hint}`; }
                    if (d._type === 'experiment_asmp') { return `<b>${d._fullName}</b><br/>状态: <span style="color:${statusColors[d._status] || '#666'}">${d._status}</span>`; }
                    if (d._lever) { const lev = d._lever; const inflows = links.filter(l => l.target === p.name && !l.lineStyle?.type).length; return `<b style="color:${lev.color}">${lev.label}</b><br/>分组: ${lev.group || '—'}<br/>弹性(¥): ${formatNumber(Math.round(lev.sensitivity || 0))}<br/>${inflows}个实验影响此杠杆`; }
                    return p.name;
                } },
            series: [{ type: 'sankey', emphasis: { focus: 'adjacency' }, data: nodes, links: links,
                lineStyle: { color: 'source', curveness: 0.35, opacity: 0.5 },
                label: { fontSize: 10, color: '#333',
                    formatter: p => { const c = p.name.codePointAt(0); return p.name.slice(c > 0xFFFF ? 2 : 1); } },
                nodeWidth: 24, nodeGap: 12, layoutIterations: 32, draggable: false,
                levels: [
                    { depth: 0, itemStyle: { borderWidth: 2, borderColor: '#333' } },
                    { depth: 1, itemStyle: { borderWidth: 2, borderColor: expandedTheme.color } },
                    { depth: 2, itemStyle: { borderWidth: 2, borderColor: '#7c3aed' } }
                ] }]
        });
    }
}

// 无主题时的回退Sankey
function _renderFlatSankey(chart, assumptions, topLeverages, statusColors, nodes, links, nodeSet, addNode) {
    const experiments = AppState.experiments || [];
    topLeverages.forEach(lev => { addNode({ name: `⚡${lev.label}`, itemStyle: { color: lev.color || '#7c3aed' }, depth: 0 }); });
    assumptions.forEach((a, idx) => {
        const name = (a.assumption_name || a.name || '未命名');
        let sn = name.length > 10 ? name.slice(0, 10) + '..' : name;
        const orig = sn; let sfx = '';
        while (nodeSet.has(`🎯${sn}${sfx}`)) { sfx = `(${idx})`; }
        sn = `${orig}${sfx}`;
        const status = a.validation_status || '待验证';
        addNode({ name: `🎯${sn}`, itemStyle: { color: statusColors[status] || '#6b7280' }, depth: 1, _type: 'assumption', _fullName: name });
    });
    experiments.forEach((exp, idx) => {
        const en = exp.name || '未命名'; let sn = en.length > 10 ? en.slice(0, 10) + '..' : en;
        const orig = sn; let sfx = '';
        while (nodeSet.has(`🧪${sn}${sfx}`)) { sfx = `(${idx})`; }
        sn = `${orig}${sfx}`;
        addNode({ name: `🧪${sn}`, itemStyle: { color: exp.status === 'running' ? '#8b5cf6' : '#10b981' }, depth: 2, _type: 'experiment' });
    });
    assumptions.forEach(a => {
        const an = nodes.find(n => n._type === 'assumption' && n._fullName === (a.assumption_name || a.name));
        if (!an || !a.param_adjustments) return;
        Object.entries(a.param_adjustments).forEach(([k, v]) => {
            if (typeof v !== 'object' || v === null) return;
            Object.keys(v).forEach(pk => {
                const ml = topLeverages.find(l => l.key === pk);
                if (ml) { const ln = `⚡${ml.label}`; if (nodeSet.has(ln) && !links.find(l => l.source === ln && l.target === an.name)) links.push({ source: ln, target: an.name, value: 100, lineStyle: { opacity: 0.4 } }); }
            });
        });
    });
    if (nodes.length === 0) addNode({ name: '暂无数据', itemStyle: { color: '#ccc' }, depth: 1 });
    if (links.length === 0 && nodes.length >= 2) links.push({ source: nodes[0].name, target: nodes[1].name, value: 10 });
    chart.setOption({
        title: { text: 'UE信息流：杠杆 → 假设 → 实验', left: 'center', textStyle: { fontSize: 13, fontWeight: 'bold' } },
        tooltip: { trigger: 'item' },
        series: [{ type: 'sankey', emphasis: { focus: 'adjacency' }, data: nodes, links: links, lineStyle: { color: 'source', curveness: 0.3, opacity: 0.5 }, label: { fontSize: 10, formatter: p => { const c = p.name.codePointAt(0); return p.name.slice(c > 0xFFFF ? 2 : 1); } }, nodeWidth: 24, nodeGap: 14, layoutIterations: 32, draggable: false }]
    });
}

// --- 对齐度评分面板 ---
function renderAlignmentScorePanel() {
    const container = document.getElementById('alignment-score-panel');
    if (!container) return;

    const scores = calculateAlignmentScore();
    const grade = scores.overall >= 80 ? { label: 'A', color: '#10b981', text: '高度对齐' } :
        scores.overall >= 60 ? { label: 'B', color: '#f59e0b', text: '部分对齐' } :
        scores.overall >= 40 ? { label: 'C', color: '#ef4444', text: '需要加强' } :
        { label: 'D', color: '#7f1d1d', text: '严重失焦' };

    const dimensions = [
        { key: 'strategic_clarity', label: '战略清晰度', desc: '假设是否有明确参数调整', icon: '🎯' },
        { key: 'leverage_alignment', label: '杠杆对齐度', desc: '是否瞄准最强杠杆(×U×E支点)', icon: '⚡' },
        { key: 'data_feasibility', label: '数据可行性', desc: '数据可信度×线上化成本', icon: '📡' },
        { key: 'parameter_coverage', label: '参数覆盖度', desc: '覆盖关键UE参数', icon: '📐' },
        { key: 'execution_readiness', label: '执行就绪度', desc: '验证进度', icon: '🚀' },
    ];

    // 主题子分数
    const themeScoresHtml = scores.themes ? Object.values(scores.themes).map(t => `
        <div class="flex items-center gap-2 p-2 rounded-lg" style="background:${t.color}08;border:1px solid ${t.color}22">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style="background:${t.color}">
                <i class="fas fa-${t.icon || 'tag'}"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold" style="color:${t.color}">${t.name}</span>
                    <span class="text-xs font-black" style="color:${t.score >= 70 ? '#10b981' : t.score >= 40 ? '#f59e0b' : '#ef4444'}">${t.score}分</span>
                </div>
                <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                    <div class="h-full rounded-full" style="width:${t.score}%;background:${t.color}"></div>
                </div>
                <div class="text-[9px] text-gray-400 mt-0.5">${t.expCount || 0}个实验 · 清晰${t.clarity}% · 就绪${t.readiness}%</div>
            </div>
        </div>`).join('') : '';

    let html = `<div class="card-header"><h3><i class="fas fa-shield-alt mr-2 text-indigo-500"></i>组织对齐度</h3></div>
        <div class="p-5">
            <div class="text-center mb-5">
                <div class="inline-flex items-center justify-center w-24 h-24 rounded-full border-4" style="border-color:${grade.color}">
                    <div>
                        <div class="text-3xl font-black" style="color:${grade.color}">${grade.label}</div>
                        <div class="text-xs text-gray-500">${scores.overall}分</div>
                    </div>
                </div>
                <div class="text-sm font-bold mt-2" style="color:${grade.color}">${grade.text}</div>
            </div>
            ${themeScoresHtml ? `<div class="mb-4">
                <div class="text-xs font-bold text-gray-500 uppercase mb-2">📋 主题维度评分</div>
                <div class="space-y-2">${themeScoresHtml}</div>
            </div>
            <hr class="border-gray-100 my-3"/>` : ''}
            <div class="space-y-3">
                ${dimensions.map(d => `<div>
                    <div class="flex items-center justify-between text-sm mb-1">
                        <span>${d.icon} ${d.label}</span>
                        <span class="font-bold" style="color:${scores[d.key] >= 70 ? '#10b981' : scores[d.key] >= 40 ? '#f59e0b' : '#ef4444'}">${Math.round(scores[d.key])}%</span>
                    </div>
                    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-700" style="width:${scores[d.key]}%;background:${scores[d.key] >= 70 ? '#10b981' : scores[d.key] >= 40 ? '#f59e0b' : '#ef4444'}"></div>
                    </div>
                    <div class="text-[10px] text-gray-400 mt-0.5">${d.desc}</div>
                </div>`).join('')}
            </div>
        </div>`;
    container.innerHTML = html;
}

// --- 数据约束面板 (NEW) ---
function renderDataConstraintPanel() {
    // 渲染到experiment-panel的上方
    const expPanel = document.getElementById('experiment-panel');
    if (!expPanel) return;

    // 数据约束摘要
    const model = AppState.baselineModels[AppState.currentCity];
    const allParams = typeof UE_PARAM_DEFINITIONS !== 'undefined' ? Object.keys(UE_PARAM_DEFINITIONS) : [];

    const paramGroups = {
        high_fidelity: [], // 可信度≥80
        medium_fidelity: [], // 60-79
        low_fidelity: [], // <60
        auto_capture: [], // 可自动采集
        manual_only: [], // 只能人工
    };

    allParams.forEach(k => {
        const f = getParamFidelityScore(k);
        const c = getDigitizationCost(k);
        const label = UE_PARAM_DEFINITIONS[k]?.label || k;
        const item = { key: k, label, fidelity: f, cost: c.cost, auto: c.auto, source: c.source };

        if (f >= 80) paramGroups.high_fidelity.push(item);
        else if (f >= 60) paramGroups.medium_fidelity.push(item);
        else paramGroups.low_fidelity.push(item);

        if (c.auto) paramGroups.auto_capture.push(item);
        else paramGroups.manual_only.push(item);
    });

    // 注入到页面
    let constraintHtml = `
    <div class="card mb-4" id="data-constraint-card">
        <div class="card-header">
            <h3><i class="fas fa-database mr-2 text-red-500"></i>数据约束地图</h3>
            <span class="text-[10px] text-gray-400">线下数据失真 × 线上化成本 → 决定实验可行性边界</span>
        </div>
        <div class="p-4">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <!-- 失真约束 -->
                <div>
                    <div class="text-xs font-bold text-gray-600 mb-2"><i class="fas fa-shield-alt mr-1 text-red-400"></i>数据失真风险</div>
                    <div class="text-[10px] text-gray-400 mb-2">指标博弈、回收不全、时效性差→部分参数的数据"不可信"</div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            <span class="text-xs text-gray-600">高可信(≥80%)：</span>
                            <span class="text-xs text-gray-500">${paramGroups.high_fidelity.map(p => p.label).join('、') || '无'}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
                            <span class="text-xs text-gray-600">中可信(60-79%)：</span>
                            <span class="text-xs text-gray-500">${paramGroups.medium_fidelity.map(p => p.label).join('、') || '无'}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-red-500"></span>
                            <span class="text-xs text-gray-600">低可信(<60%)：</span>
                            <span class="text-xs text-red-500 font-medium">${paramGroups.low_fidelity.map(p => p.label).join('、') || '无'}</span>
                        </div>
                    </div>
                </div>
                <!-- 成本约束 -->
                <div>
                    <div class="text-xs font-bold text-gray-600 mb-2"><i class="fas fa-coins mr-1 text-yellow-400"></i>线上化成本分布</div>
                    <div class="text-[10px] text-gray-400 mb-2">高额开发成本需一致性摊薄，很难支持规模个性化</div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-500"></span>
                            <span class="text-xs text-gray-600">自动采集(${paramGroups.auto_capture.length}项)：</span>
                            <span class="text-xs text-gray-500">${paramGroups.auto_capture.map(p => p.label).join('、')}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-red-500"></span>
                            <span class="text-xs text-gray-600">人工采集(${paramGroups.manual_only.length}项)：</span>
                            <span class="text-xs text-red-500">${paramGroups.manual_only.map(p => p.label).join('、')}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-200">
                <div class="text-xs font-bold text-indigo-700 mb-1">💡 系统解法：不追求数据精确，追求弹性方向一致</div>
                <div class="text-[10px] text-indigo-600">即使成本数据有±20%偏差，只要弹性分析的<strong>利润变化方向</strong>一致，结论就可靠。系统已在Attention权重中加入失真修正（可信度加权），并在新建实验时自动做鲁棒性检验。</div>
            </div>
        </div>
    </div>`;

    // 插入到实验面板前面
    const existing = document.getElementById('data-constraint-card');
    if (existing) existing.remove();
    expPanel.insertAdjacentHTML('beforebegin', constraintHtml);
}

// --- 实验面板 ---
function renderExperimentPanel() {
    const container = document.getElementById('experiment-panel');
    if (!container) return;

    const running = AppState.experiments.filter(e => e.status === 'running');
    const completed = AppState.experiments.filter(e => e.status === 'completed' || e.status === 'failed');

    let html = `<div class="card-header">
            <h3><i class="fas fa-flask mr-2 text-purple-500"></i>BLM 准实验面板</h3>
            <span class="text-[10px] text-gray-400">城市对照 · 时段对照 · 阶梯投放 — 不争论只评价</span>
        </div><div class="p-4">`;

    if (running.length === 0 && completed.length === 0) {
        html += `<div class="text-center py-8 text-gray-400">
            <div class="text-4xl mb-3">🧪</div>
            <div class="text-sm">暂无实验</div>
            <div class="text-xs mt-1">点击右上角「新建实验」开始第一个BLM循环</div>
            <div class="text-[10px] mt-2 text-gray-300">支持三种准实验设计：城市对照、时段对照(Before-After)、阶梯投放</div>
        </div>`;
    } else {
        if (running.length > 0) {
            html += `<div class="text-xs font-bold text-gray-500 uppercase mb-2">🔬 运行中 (${running.length})</div>`;
            running.forEach(exp => {
                const daysLeft = Math.max(0, Math.ceil((new Date(exp.end_date) - new Date()) / 86400000));
                const progress = Math.min(100, ((exp.duration_days - daysLeft) / exp.duration_days * 100));
                const typeInfo = EXPERIMENT_TYPES[exp.experiment_type] || {};
                html += `<div class="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-${typeInfo.icon || 'flask'}" style="color:${typeInfo.color || '#8b5cf6'}"></i>
                            <span class="font-bold text-gray-800 text-sm">${exp.name}</span>
                            <span class="tag text-[10px]" style="background:${typeInfo.color || '#8b5cf6'}20;color:${typeInfo.color || '#8b5cf6'}">${exp.experiment_type_label || exp.experiment_type}</span>
                        </div>
                        <span class="tag tag-purple text-[10px]">${daysLeft}天剩余</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-2">
                        假设：${exp.assumption_name} · 
                        ${exp.city === 'beijing' ? '北京' : '上海'}${exp.control_group === 'self_before' ? '(自身前期对照)' : ` vs ${exp.control_group === 'beijing' ? '北京' : '上海'}(对照)`} · 
                        预测：<span class="font-bold ${exp.prediction.profit_delta >= 0 ? 'text-green-600' : 'text-red-600'}">${exp.prediction.profit_delta >= 0 ? '+' : ''}¥${formatNumber(Math.round(exp.prediction.profit_delta))}</span>
                    </div>
                    ${exp.experiment_type === 'staged_rollout' && exp.stages ? `<div class="text-[10px] text-gray-400 mb-2">阶梯：${exp.stages.map((s,i) => `阶段${i+1}:${s}%`).join(' → ')}</div>` : ''}
                    <div class="h-2 bg-purple-100 rounded-full overflow-hidden mb-2">
                        <div class="h-full bg-purple-500 rounded-full" style="width:${progress}%"></div>
                    </div>
                    <button class="text-xs text-purple-600 hover:text-purple-800" onclick="recordActualResult('${exp.id}')"><i class="fas fa-edit mr-1"></i>录入结果</button>
                </div>`;
            });
        }

        if (completed.length > 0) {
            html += `<div class="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">✅ 已完成 (${completed.length})</div>`;
            completed.forEach(exp => {
                const v = { confirmed: { icon: '✅', label: '假设验证', bg: 'green' }, partial: { icon: '⚠️', label: '部分验证', bg: 'yellow' }, rejected: { icon: '❌', label: '假设否定', bg: 'red' } }[exp.verdict] || { icon: '❓', label: '待评', bg: 'gray' };
                html += `<div class="bg-${v.bg}-50 border border-${v.bg}-200 rounded-xl p-3 mb-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">${v.icon}</span>
                            <div>
                                <div class="font-medium text-sm text-gray-800">${exp.name} <span class="text-[10px] text-gray-400">${exp.experiment_type_label || ''}</span></div>
                                <div class="text-[10px] text-gray-400">预测${exp.prediction.profit_delta >= 0 ? '+' : ''}¥${formatNumber(Math.round(exp.prediction.profit_delta))} → 实际¥${exp.actual ? formatNumber(Math.round(exp.actual.profit)) : '-'}${exp.data_confidence ? ` · 数据置信:${exp.data_confidence}` : ''}</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="tag tag-${v.bg} text-[10px]">${v.label}</div>
                            ${exp.prediction_error !== undefined ? `<div class="text-[10px] text-gray-400 mt-0.5">偏差${exp.prediction_error.toFixed(0)}%</div>` : ''}
                        </div>
                    </div>
                </div>`;
            });
        }
    }

    html += '</div>';
    container.innerHTML = html;
}

// --- 实验历史 ---
function renderExperimentHistory() {
    const container = document.getElementById('experiment-history-panel');
    if (!container) return;

    const all = AppState.experiments;
    const confirmed = all.filter(e => e.verdict === 'confirmed').length;
    const partial = all.filter(e => e.verdict === 'partial').length;
    const rejected = all.filter(e => e.verdict === 'rejected').length;
    const running = all.filter(e => e.status === 'running').length;
    const total = all.length;
    const done = total - running;

    let html = `<div class="card-header">
            <h3><i class="fas fa-history mr-2 text-gray-500"></i>组织学习追踪</h3>
            <span class="text-[10px] text-gray-400">BLM循环次数↑ → 认知偏差↓ → 决策精度↑</span>
        </div><div class="p-4">
            <div class="grid grid-cols-5 gap-3 mb-4">
                <div class="text-center p-3 bg-gray-50 rounded-xl"><div class="text-2xl font-black text-gray-700">${total}</div><div class="text-xs text-gray-500">总实验</div></div>
                <div class="text-center p-3 bg-blue-50 rounded-xl"><div class="text-2xl font-black text-blue-600">${running}</div><div class="text-xs text-gray-500">进行中</div></div>
                <div class="text-center p-3 bg-green-50 rounded-xl"><div class="text-2xl font-black text-green-600">${confirmed}</div><div class="text-xs text-gray-500">已验证</div></div>
                <div class="text-center p-3 bg-yellow-50 rounded-xl"><div class="text-2xl font-black text-yellow-600">${partial}</div><div class="text-xs text-gray-500">部分验证</div></div>
                <div class="text-center p-3 bg-red-50 rounded-xl"><div class="text-2xl font-black text-red-600">${rejected}</div><div class="text-xs text-gray-500">已否定</div></div>
            </div>
            <div class="bg-gradient-to-r from-gray-50 to-indigo-50 rounded-xl p-4 border border-gray-200">
                <div class="flex items-center gap-2 mb-2"><span class="text-lg">🧠</span><span class="text-sm font-bold text-gray-700">组织学习洞察</span></div>
                <p class="text-sm text-gray-600">${
                    done > 0 ? `${confirmed + partial}/${done}个实验方向正确（验证率${(done > 0 ? (confirmed + partial) / done * 100 : 0).toFixed(0)}%）。` +
                        (rejected > 0 ? `${rejected}个假设被数据否定——避免了错误方向的持续投入。` : '') +
                        ` 每一次BLM循环都在缩小模型与真实业务之间的认知偏差。` :
                    total > 0 ? '实验运行中。数据回收后将自动评判，无需人工争论。' :
                    '启动第一个准实验，让数据代替辩论。'
                }</p>
            </div>
        </div>`;
    container.innerHTML = html;
}

// ========== 持久化 ==========
async function saveCurrentState() {
    try {
        const state = { id: 'state_' + AppState.currentCity, city: AppState.currentCity,
            baseline_model: JSON.stringify(AppState.baselineModels[AppState.currentCity]),
            scale_params: JSON.stringify(AppState.scaleParams),
            u_params: JSON.stringify(U_DIMENSION_PARAMS),
            saved_at: new Date().toISOString() };
        // 纯前端模式：使用localStorage替代后端API
        localStorage.setItem(`ue_saved_state_${AppState.currentCity}`, JSON.stringify(state));
        showToast('状态已保存到本地', 'success');
    } catch (e) { showToast('保存失败', 'error'); }
}

async function loadSavedState() {
    // 纯前端模式：使用localStorage替代后端API
    try {
        const saved = localStorage.getItem(`ue_saved_state_${AppState.currentCity}`);
        if (saved) {
            const latest = JSON.parse(saved);
            if (latest.baseline_model) AppState.baselineModels[AppState.currentCity] = JSON.parse(latest.baseline_model);
            if (latest.scale_params) Object.assign(AppState.scaleParams, JSON.parse(latest.scale_params));
            showToast('已加载本地状态', 'info');
        }
    } catch (e) {}
}

async function saveAssumptionsToCloud() {
    // 纯前端模式：使用localStorage替代后端API
    try {
        localStorage.setItem('ue_assumptions', JSON.stringify(AppState.assumptions));
        showToast('假设已同步到本地', 'success');
    } catch (e) {}
}
