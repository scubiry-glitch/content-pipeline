// ===== 三层治理架构模块 (governance.js) =====
// L1 战略层：损益为主，倒推 UE —— 财务硬账驱动
// L2 假设验证层：盯住 UE，只采集关键弹性变量，准实验验证
// L3 执行层：AI 工具库，核心 UE 不变、底层数据不变、工具路径随便搞

// ========== 治理层级定义 ==========

const GOVERNANCE_LAYERS = {
    L1: {
        id: 'L1',
        label: '战略层',
        subtitle: '损益为主 → 倒推 UE',
        icon: 'chess-king',
        color: '#6366f1',
        gradient: 'from-indigo-600 to-purple-700',
        description: '从 P&L 目标出发，反推每套房、每单合约、每个业主、每个美租顾问需要达到的 UE 健康指标。只看财务硬账，不碰过程数据。',
        audience: ['CEO', '城市总', '战略规划'],
        frequency: '月/季',
        dataSource: '财务系统（银行流水+合同）',
        dataRisk: '极低（造假成本极高）',
        fidelityScore: 95,
        tabs: ['dashboard', 'baseline', 'financial', 'crossanalysis'],
        tabLabels: ['仪表盘', '基准UE模型', '财务报表', 'U×E支点'],
        keyActions: [
            { action: '设定年度 P&L 目标', desc: '营收、毛利率、净利润目标' },
            { action: '倒推 UE 参数边界', desc: '单套 GTV ≥ X、毛利率 ≥ Y%、回本 ≤ Z月' },
            { action: '识别阿基米德支点', desc: '利润弹性最高的 U×E 组合' },
            { action: '决定 Attention 权重', desc: '资源应该流向哪个 UE 参数' },
        ],
        analogy: {
            ml: 'Loss Function',
            desc: '定义利润目标 = 定义损失函数，反向传播到所有层',
        },
        coreQuestion: '今年 P&L 要达标，每套房至少要赚多少？',
    },
    L2: {
        id: 'L2',
        label: '假设验证层',
        subtitle: '盯住 UE → 准实验验证',
        icon: 'microscope',
        color: '#2f9668',
        gradient: 'from-ke-500 to-ke-700',
        description: '城市总/片区经理层。基于 L1 的 UE 目标，设定战略假设，用准实验（城市对照/时段对照/阶梯投放）快速验证。只采集影响弹性的关键变量，不追求全量数据。',
        audience: ['城市总', '片区经理', '美租顾问主管'],
        frequency: '周',
        dataSource: '签约系统 + 合同系统 + 租约系统',
        dataRisk: '中等（短期可造假，跨周期暴露）',
        fidelityScore: 72,
        tabs: ['assumptions', 'scenarios', 'udimension', 'eanalysis', 'alignment'],
        tabLabels: ['战略假设', '假设UE推演', 'U维度洞察', 'E杠杆分析', '战略对齐'],
        keyActions: [
            { action: '创建战略假设', desc: '标品占比提升至85%→UE变化多少？' },
            { action: '启动准实验', desc: '城市对照/时段对照/阶梯投放' },
            { action: '录入实际结果', desc: '系统自动评判，不争论只评价' },
            { action: '盯住 UE 护栏', desc: '毛利 ≥ X、空置 ≤ Y天、回本 ≤ Z月' },
        ],
        typicalScenarios: [
            {
                title: '标品占比提升',
                question: '标品从 20% → 80%，UE 到底改善多少？',
                method: '城市对照：北京 85% vs 上海 80%，观察 3 月 UE 差异',
                keyVars: ['standardized_ratio', 'material_cost_ratio', 'gross_margin'],
                expectedImpact: '单套利润 +¥800~1,500',
            },
            {
                title: '服务费率调整',
                question: '费率从 10% → 12%，签约量是否会下降？',
                method: '时段对照：3月执行，对比 2月→4月 UE 变化',
                keyVars: ['service_fee_rate', 'conversion_rate', 'monthly_target_units'],
                expectedImpact: '单套收入 +¥1,040（如签约量不跌）',
            },
            {
                title: '交付管理升级',
                question: '供应商集约化后，装修造价降多少？',
                method: '阶梯投放：10%→30%→50% 房源接入新供应链',
                keyVars: ['renovation_cost', 'material_cost_ratio', 'vacancy_days'],
                expectedImpact: '单套成本 -¥2,000~4,000',
            },
            {
                title: '美租顾问人效提升',
                question: '资深占比从 30% → 50%，人均签约提多少？',
                method: '时段对照：培训批次前后对比，弹性系数预测偏差',
                keyVars: ['monthly_target_units', 'conversion_rate'],
                expectedImpact: '人均月签 +0.8~1.5 单',
            },
        ],
        analogy: {
            ml: 'CNN卷积核 + RNN时间展开',
            desc: '每个准实验 = 一次梯度更新，缩小模型与真实业务的认知偏差',
        },
        coreQuestion: '这个假设对不对？用数据说话，不用嘴说。',
    },
    L3: {
        id: 'L3',
        label: '执行层',
        subtitle: '核心 UE 不变 · 工具路径随便搞',
        icon: 'toolbox',
        color: '#f59e0b',
        gradient: 'from-amber-500 to-orange-600',
        description: '美租顾问/工长层。不管过程，只提供赋能工具库。前线可以自由选择执行路径——用什么方案、怎么定价、怎么跟业主谈，系统只提供建议，不强制执行。核心 UE 底线不变，工具怎么用随你。',
        audience: ['美租顾问', '工长', '设计师'],
        frequency: '日',
        dataSource: '不主动采集过程数据',
        dataRisk: '零（不采集 = 不失真）',
        fidelityScore: 100,
        tabs: ['l1tools'],
        tabLabels: ['AI 工具库'],
        keyActions: [
            { action: '查询标品方案库', desc: '输入户型+面积，推荐 TOP3 标品方案' },
            { action: '智能定价建议', desc: '基于同小区历史+UE底线，推荐定价区间' },
            { action: '成本预警器', desc: '录入造价后，系统实时提示是否超出 UE 安全线' },
            { action: '同小区 UE 基准线', desc: '查看同区域同户型的平均 UE，自我对标' },
        ],
        analogy: {
            ml: '推理阶段（Inference）',
            desc: '训练好的模型部署到前线，用户只用结果，不管内部权重',
        },
        coreQuestion: '这套房怎么做能赚钱？系统给建议，你来决定。',
    }
};

// ========== L3 损益倒推 UE ==========

function calculatePLToUE(plTarget) {
    // 从 P&L 目标反推需要的 UE 参数
    const {
        annualRevenue = 0,       // 年营收目标
        grossMarginTarget = 20,  // 毛利率目标 %
        netMarginTarget = 8,     // 净利率目标 %
        monthlyUnits = 220,      // 月签约目标
        opexRate = 12,           // 运营费用率 %
        marketingRate = 5,       // 营销费用率 %
    } = plTarget;

    const monthlyRevenue = annualRevenue / 12;
    const requiredUnitRevenue = monthlyUnits > 0 ? monthlyRevenue / monthlyUnits : 0;
    const requiredGrossProfit = requiredUnitRevenue * (grossMarginTarget / 100);
    const maxCost = requiredUnitRevenue - requiredGrossProfit;

    // 反推装修造价上限
    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES.beijing;
    const serviceFeeRevenue = model.gtv_per_unit * (model.service_fee_rate / 100);
    const rentPremiumRevenue = (model.avg_rent_after - model.avg_rent_before) * 3;
    const currentTotalRevenue = serviceFeeRevenue + rentPremiumRevenue;

    // 要达到目标营收，需要多少签约量或多少单位收入
    const requiredMonthlyUnits = currentTotalRevenue > 0 ? Math.ceil(monthlyRevenue / currentTotalRevenue) : monthlyUnits;
    const maxRenovationCost = currentTotalRevenue * (1 - grossMarginTarget / 100) / (1 - model.gross_margin / 100) * model.renovation_cost / (model.renovation_cost * (1 - model.gross_margin / 100) || 1);

    // 各科目反推
    const requiredGTV = requiredUnitRevenue / (model.service_fee_rate / 100 + (model.rent_premium_rate / 100) * 3 / (model.gtv_per_unit / model.avg_rent_before));

    return {
        // P&L 目标
        annualRevenue,
        grossMarginTarget,
        netMarginTarget,
        monthlyUnits,
        // 反推结果
        requiredUnitRevenue: Math.round(requiredUnitRevenue),
        requiredGrossProfit: Math.round(requiredGrossProfit),
        maxCostPerUnit: Math.round(maxCost),
        requiredMonthlyUnits,
        // UE 护栏
        guardrails: {
            minGrossMargin: grossMarginTarget,
            maxVacancyDays: Math.round(30 * (1 - grossMarginTarget / 100) * 0.5),
            maxPaybackMonths: Math.ceil(12 / (grossMarginTarget / 10)),
            minServiceFeeRate: Math.max(8, Math.round((requiredUnitRevenue * 0.6) / model.gtv_per_unit * 100 * 10) / 10),
            maxRenovationCost: Math.round(currentTotalRevenue * (1 - grossMarginTarget / 100)),
        },
        // 当前 vs 目标差距
        gap: {
            currentUnitRevenue: Math.round(currentTotalRevenue),
            currentMonthlyUnits: model.monthly_target_units,
            revenueGap: Math.round(requiredUnitRevenue - currentTotalRevenue),
            unitsGap: requiredMonthlyUnits - model.monthly_target_units,
        }
    };
}

// ========== L2 护栏引擎 ==========

const UE_GUARDRAILS = {
    grossMarginMin: { value: 15, unit: '%', label: '最低毛利率', severity: 'critical', icon: '🔴' },
    vacancyDaysMax: { value: 20, unit: '天', label: '最大空置天数', severity: 'critical', icon: '🔴' },
    paybackMonthsMax: { value: 18, unit: '月', label: '最长回本周期', severity: 'warning', icon: '🟡' },
    renovationCostMax: { value: 90000, unit: '元', label: '装修造价上限', severity: 'warning', icon: '🟡', perSqm: 1500, note: '按60㎡均价' },
    conversionRateMin: { value: 10, unit: '%', label: '最低推荐转化率', severity: 'info', icon: '🔵' },
    sevenDayRateMin: { value: 75, unit: '%', label: '最低7日去化率', severity: 'info', icon: '🔵' },
    healthScoreThreshold: 10,  // 健康度阈值（%）
};

function checkGuardrails(model) {
    // 从calculateUE获取计算值，并设置合理的默认值
    const ue = calculateUE(model);
    
    // 获取业主模型用于业主相关指标（如空置天数、回本月数）
    const city = AppState.currentCity;
    const product = AppState.currentProduct;
    const ownerModel = DEFAULT_OWNER_MODELS[city]?.[product] || DEFAULT_OWNER_MODELS.beijing.standard;
    
    // 计算/获取各项指标（带合理默认值）
    // 注意：以下当前值为演示数据，实际应从业务系统获取
    const grossMargin = 15;  // 当前毛利率15% (阈值15%)
    const vacancyDays = 10;  // 当前空置天数10天 (阈值20天)
    const paybackMonths = 17.8;  // 当前回本月数17.8月 (阈值18月)
    const renovationCost = 90000;  // 当前装修造价¥90,000 (≈¥1500/㎡，阈值¥1500/㎡)
    const conversionRate = 14;  // 当前转化率14% (阈值10%)
    const sevenDayRate = 90;  // 当前7日去化率90% (阈值75%)
    
    const results = [];

    // 毛利率
    if (grossMargin < UE_GUARDRAILS.grossMarginMin.value) {
        results.push({ key: 'grossMarginMin', ...UE_GUARDRAILS.grossMarginMin, current: Math.round(grossMargin * 10) / 10, status: 'breach', delta: Math.round((grossMargin - UE_GUARDRAILS.grossMarginMin.value) * 10) / 10 });
    } else {
        results.push({ key: 'grossMarginMin', ...UE_GUARDRAILS.grossMarginMin, current: Math.round(grossMargin * 10) / 10, status: 'ok', delta: Math.round((grossMargin - UE_GUARDRAILS.grossMarginMin.value) * 10) / 10 });
    }

    // 空置天数
    if (vacancyDays > UE_GUARDRAILS.vacancyDaysMax.value) {
        results.push({ key: 'vacancyDaysMax', ...UE_GUARDRAILS.vacancyDaysMax, current: vacancyDays, status: 'breach', delta: vacancyDays - UE_GUARDRAILS.vacancyDaysMax.value });
    } else {
        results.push({ key: 'vacancyDaysMax', ...UE_GUARDRAILS.vacancyDaysMax, current: vacancyDays, status: 'ok', delta: vacancyDays - UE_GUARDRAILS.vacancyDaysMax.value });
    }

    // 回本周期
    if (paybackMonths > UE_GUARDRAILS.paybackMonthsMax.value) {
        results.push({ key: 'paybackMonthsMax', ...UE_GUARDRAILS.paybackMonthsMax, current: paybackMonths, status: 'breach', delta: paybackMonths - UE_GUARDRAILS.paybackMonthsMax.value });
    } else {
        results.push({ key: 'paybackMonthsMax', ...UE_GUARDRAILS.paybackMonthsMax, current: paybackMonths, status: 'ok', delta: paybackMonths - UE_GUARDRAILS.paybackMonthsMax.value });
    }

    // 装修造价
    if (renovationCost > UE_GUARDRAILS.renovationCostMax.value) {
        results.push({ key: 'renovationCostMax', ...UE_GUARDRAILS.renovationCostMax, current: Math.round(renovationCost), status: 'breach', delta: Math.round(renovationCost - UE_GUARDRAILS.renovationCostMax.value) });
    } else {
        results.push({ key: 'renovationCostMax', ...UE_GUARDRAILS.renovationCostMax, current: Math.round(renovationCost), status: 'ok', delta: Math.round(renovationCost - UE_GUARDRAILS.renovationCostMax.value) });
    }

    // 转化率
    if (conversionRate < UE_GUARDRAILS.conversionRateMin.value) {
        results.push({ key: 'conversionRateMin', ...UE_GUARDRAILS.conversionRateMin, current: conversionRate, status: 'breach', delta: conversionRate - UE_GUARDRAILS.conversionRateMin.value });
    } else {
        results.push({ key: 'conversionRateMin', ...UE_GUARDRAILS.conversionRateMin, current: conversionRate, status: 'ok', delta: conversionRate - UE_GUARDRAILS.conversionRateMin.value });
    }

    // 7日去化率
    if (sevenDayRate < UE_GUARDRAILS.sevenDayRateMin.value) {
        results.push({ key: 'sevenDayRateMin', ...UE_GUARDRAILS.sevenDayRateMin, current: sevenDayRate, status: 'breach', delta: sevenDayRate - UE_GUARDRAILS.sevenDayRateMin.value });
    } else {
        results.push({ key: 'sevenDayRateMin', ...UE_GUARDRAILS.sevenDayRateMin, current: sevenDayRate, status: 'ok', delta: sevenDayRate - UE_GUARDRAILS.sevenDayRateMin.value });
    }

    const breaches = results.filter(r => r.status === 'breach');
    const score = Math.round((results.length - breaches.length) / results.length * 100);
    // 使用配置的阈值判断整体状态
    const threshold = UE_GUARDRAILS.healthScoreThreshold || 10;
    const overallStatus = score < threshold ? 'red' :
        score < 50 ? 'yellow' : 'green';

    return { results, breaches, overallStatus, score };
}

// ========== L1 AI 工具库 ==========

// 标品方案库
const STANDARD_PRODUCT_LIBRARY = [
    { id: 'SP-1R-35', name: '一居经典', roomType: '1室', area: '30-40㎡', budget: '28,000-35,000', cycle: '15天', style: '简约现代', gtvRange: [28000, 35000], targetMargin: 22 },
    { id: 'SP-1R-45', name: '一居轻奢', roomType: '1室', area: '35-50㎡', budget: '35,000-42,000', cycle: '18天', style: '轻奢风', gtvRange: [35000, 42000], targetMargin: 20 },
    { id: 'SP-2R-60', name: '两居标准', roomType: '2室', area: '50-70㎡', budget: '42,000-55,000', cycle: '20天', style: '简约现代', gtvRange: [42000, 55000], targetMargin: 20 },
    { id: 'SP-2R-80', name: '两居精装', roomType: '2室', area: '65-85㎡', budget: '55,000-68,000', cycle: '22天', style: '现代简约', gtvRange: [55000, 68000], targetMargin: 18 },
    { id: 'SP-3R-90', name: '三居家庭', roomType: '3室', area: '80-100㎡', budget: '65,000-82,000', cycle: '25天', style: '北欧温馨', gtvRange: [65000, 82000], targetMargin: 18 },
    { id: 'SP-3R-120', name: '三居品质', roomType: '3室', area: '100-130㎡', budget: '82,000-105,000', cycle: '30天', style: '现代轻奢', gtvRange: [82000, 105000], targetMargin: 16 },
];

// 智能定价建议
function calculatePricingSuggestion(params) {
    const { area = 60, roomType = '2室', district = '', currentRent = 5000 } = params;
    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES.beijing;

    // 基于面积估算 GTV
    const gtvPerSqm = model.gtv_per_unit / 60; // 假设基准面积60㎡
    const estimatedGTV = Math.round(gtvPerSqm * area);

    // 溢价率建议
    const premiumRate = model.rent_premium_rate;
    const suggestedRentAfter = Math.round(currentRent * (1 + premiumRate / 100));

    // 服务费
    const serviceFee = Math.round(estimatedGTV * (model.service_fee_rate / 100));

    // UE 安全线检查
    const estimatedCost = Math.round(estimatedGTV * (1 - model.gross_margin / 100));
    const estimatedRevenue = serviceFee + (suggestedRentAfter - currentRent) * 3;
    const estimatedProfit = estimatedRevenue - estimatedCost;
    const isHealthy = estimatedProfit > 0 && (estimatedProfit / estimatedRevenue * 100) >= UE_GUARDRAILS.grossMarginMin.value;

    return {
        estimatedGTV,
        suggestedRentAfter,
        premiumRate,
        serviceFee,
        estimatedCost,
        estimatedRevenue,
        estimatedProfit,
        isHealthy,
        rentRange: {
            min: Math.round(currentRent * (1 + premiumRate * 0.7 / 100)),
            max: Math.round(currentRent * (1 + premiumRate * 1.3 / 100)),
        },
        gtvRange: {
            min: Math.round(estimatedGTV * 0.85),
            max: Math.round(estimatedGTV * 1.15),
        }
    };
}

// 成本预警器
function costAlertCheck(inputCost, gtv) {
    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES.beijing;
    const maxCostRatio = 1 - model.gross_margin / 100;
    const maxAllowedCost = gtv * maxCostRatio;
    const ratio = inputCost / gtv;

    let status, message, color;
    if (inputCost <= maxAllowedCost * 0.9) {
        status = 'safe'; message = '成本健康，在 UE 安全线内'; color = '#10b981';
    } else if (inputCost <= maxAllowedCost) {
        status = 'caution'; message = '接近 UE 安全线边缘，注意控制'; color = '#f59e0b';
    } else {
        status = 'danger'; message = '超出 UE 安全线！该单将亏损'; color = '#ef4444';
    }

    return {
        inputCost, gtv, ratio: (ratio * 100).toFixed(1),
        maxAllowedCost: Math.round(maxAllowedCost),
        overrun: Math.round(inputCost - maxAllowedCost),
        status, message, color,
        breakdown: {
            materialMax: Math.round(maxAllowedCost * model.material_cost_ratio / 100),
            laborMax: Math.round(maxAllowedCost * model.labor_cost_ratio / 100),
            managementMax: Math.round(maxAllowedCost * model.management_fee_ratio / 100),
        }
    };
}

// ========== 页面渲染 ==========

function renderGovernancePage() {
    const container = document.getElementById('governance-content');
    if (!container) return;

    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES[AppState.currentCity];
    const ue = calculateUE(model);
    const guardrails = checkGuardrails(model);

    let html = '';

    // ===== 总览 Hero =====
    html += `<div class="bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32"></div>
        <div class="relative z-10">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">🏛</div>
                <div>
                    <div class="text-xs font-bold uppercase tracking-widest text-indigo-300">Three-Layer Governance</div>
                    <div class="text-xl font-bold">分层自治 + 硬性边界</div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4">
                ${Object.values(GOVERNANCE_LAYERS).map(layer => `
                <div class="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all cursor-pointer group"
                     onclick="switchTab('${layer.tabs[0] === 'l1tools' ? 'l1tools' : layer.tabs[0]}')">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${layer.gradient} flex items-center justify-center">
                            <i class="fas fa-${layer.icon} text-white text-sm"></i>
                        </div>
                        <div>
                            <div class="text-sm font-bold">${layer.id} ${layer.label}</div>
                            <div class="text-[10px] text-gray-400">${layer.subtitle}</div>
                        </div>
                    </div>
                    <div class="text-xs text-gray-300 mb-3">${layer.description.slice(0, 60)}...</div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-gray-400"><i class="fas fa-users mr-1"></i>${layer.audience.join('、')}</span>
                        <span class="text-gray-400"><i class="fas fa-clock mr-1"></i>${layer.frequency}</span>
                    </div>
                    <div class="mt-2 flex items-center gap-2">
                        <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full rounded-full" style="width:${layer.fidelityScore}%;background:${layer.color}"></div>
                        </div>
                        <span class="text-[10px] text-gray-400">数据可信 ${layer.fidelityScore}%</span>
                    </div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;

    // ===== 核心哲学 =====
    html += `<div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card border-l-4 border-l-red-500">
            <div class="p-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">💀</span>
                    <span class="text-sm font-bold text-red-700">死路一：全面数字化</span>
                </div>
                <div class="text-xs text-gray-500 leading-relaxed">
                    无限卷积核覆盖无限非标场景 → 系统复杂度 O(n²)↑ → 成本↑ → 数据失真（Garbage In/Out）→ 系统沉重、用户反感
                </div>
                <div class="mt-2 px-2 py-1 bg-red-50 rounded text-[10px] text-red-600 font-medium">
                    线下数据回收到线上，未必真实、未必全面
                </div>
            </div>
        </div>
        <div class="card border-l-4 border-l-red-500">
            <div class="p-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">💀</span>
                    <span class="text-sm font-bold text-red-700">死路二：只管大账</span>
                </div>
                <div class="text-xs text-gray-500 leading-relaxed">
                    只有全局 Loss → 没有中间信号 → UE 结果滞后 8 个月 → 组织学习慢 → 竞争劣势
                </div>
                <div class="mt-2 px-2 py-1 bg-red-50 rounded text-[10px] text-red-600 font-medium">
                    线上化的高额成本，难以支持规模个性化
                </div>
            </div>
        </div>
        <div class="card border-l-4 border-l-green-500">
            <div class="p-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">✅</span>
                    <span class="text-sm font-bold text-green-700">第三条路：分层自治</span>
                </div>
                <div class="text-xs text-gray-500 leading-relaxed">
                    柔性支持 + 硬性核算。前端保留灵活性（黑盒），后台坚持 UE 边界。责权利对等。
                </div>
                <div class="mt-2 px-2 py-1 bg-green-50 rounded text-[10px] text-green-600 font-medium">
                    不追求数据精确，追求弹性方向一致
                </div>
            </div>
        </div>
    </div>`;

    // ===== 三层详情卡片 =====
    Object.values(GOVERNANCE_LAYERS).forEach(layer => {
        html += `<div class="card mb-4">
            <div class="card-header bg-gradient-to-r ${layer.gradient} !border-b-0">
                <h3 class="!text-white"><i class="fas fa-${layer.icon} mr-2"></i>${layer.id} ${layer.label} — ${layer.subtitle}</h3>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-white/60">${layer.audience.join(' · ')}</span>
                    <span class="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">${layer.frequency}</span>
                </div>
            </div>
            <div class="p-5">
                <div class="grid grid-cols-12 gap-6">
                    <!-- 左：核心问题 + 动作 -->
                    <div class="col-span-5">
                        <div class="bg-gray-50 rounded-xl p-4 mb-4">
                            <div class="text-xs font-bold text-gray-500 mb-1">核心问题</div>
                            <div class="text-sm font-bold text-gray-800">${layer.coreQuestion}</div>
                        </div>
                        <div class="text-xs font-bold text-gray-500 mb-2">关键动作</div>
                        <div class="space-y-2">
                            ${layer.keyActions.map((a, i) => `
                            <div class="flex items-start gap-2">
                                <div class="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style="background:${layer.color}">${i + 1}</div>
                                <div>
                                    <div class="text-xs font-medium text-gray-700">${a.action}</div>
                                    <div class="text-[10px] text-gray-400">${a.desc}</div>
                                </div>
                            </div>`).join('')}
                        </div>
                    </div>
                    <!-- 中：数据流 -->
                    <div class="col-span-4">
                        <div class="text-xs font-bold text-gray-500 mb-2">数据特征</div>
                        <div class="space-y-2 mb-4">
                            <div class="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                <span class="text-xs text-gray-600"><i class="fas fa-database mr-1"></i>数据来源</span>
                                <span class="text-xs font-medium text-gray-800">${layer.dataSource}</span>
                            </div>
                            <div class="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                <span class="text-xs text-gray-600"><i class="fas fa-shield-alt mr-1"></i>数据失真风险</span>
                                <span class="text-xs font-medium" style="color:${layer.fidelityScore >= 90 ? '#10b981' : layer.fidelityScore >= 70 ? '#f59e0b' : '#ef4444'}">${layer.dataRisk}</span>
                            </div>
                            <div class="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                <span class="text-xs text-gray-600"><i class="fas fa-tachometer-alt mr-1"></i>可信度评分</span>
                                <span class="text-xs font-bold" style="color:${layer.color}">${layer.fidelityScore}%</span>
                            </div>
                        </div>
                        <div class="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                            <div class="text-[10px] font-bold text-indigo-600 mb-1"><i class="fas fa-robot mr-1"></i>ML 类比</div>
                            <div class="text-[10px] text-indigo-500"><strong>${layer.analogy.ml}</strong>：${layer.analogy.desc}</div>
                        </div>
                    </div>
                    <!-- 右：对应 Tab -->
                    <div class="col-span-3">
                        <div class="text-xs font-bold text-gray-500 mb-2">系统模块</div>
                        <div class="space-y-1.5">
                            ${layer.tabs.map((tab, i) => `
                            <button class="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-ke-300 hover:bg-ke-50 transition-all text-xs group"
                                    onclick="switchTab('${tab}')">
                                <div class="flex items-center justify-between">
                                    <span class="text-gray-700 group-hover:text-ke-600 font-medium">${layer.tabLabels[i]}</span>
                                    <i class="fas fa-arrow-right text-[10px] text-gray-300 group-hover:text-ke-500"></i>
                                </div>
                            </button>`).join('')}
                        </div>
                    </div>
                </div>
                ${layer.id === 'L2' && layer.typicalScenarios ? renderTypicalScenarios(layer.typicalScenarios) : ''}
            </div>
        </div>`;
    });

    // ===== 数据信任度矩阵 =====
    html += renderDataTrustMatrix();

    // ===== 信息流 =====
    html += `<div class="card mb-4">
        <div class="card-header">
            <h3><i class="fas fa-project-diagram mr-2 text-indigo-500"></i>三层数据流</h3>
            <span class="text-[10px] text-gray-400">上层定规则 → 中层验假设 → 下层用工具</span>
        </div>
        <div class="p-5">
            <div class="flex items-center justify-center gap-6">
                ${Object.values(GOVERNANCE_LAYERS).map((layer, i) => `
                <div class="text-center flex-1">
                    <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${layer.gradient} flex items-center justify-center text-white text-2xl shadow-lg mb-3">
                        <i class="fas fa-${layer.icon}"></i>
                    </div>
                    <div class="text-sm font-bold text-gray-800">${layer.id}</div>
                    <div class="text-xs text-gray-500">${layer.label}</div>
                    <div class="text-[10px] text-gray-400 mt-1">${layer.frequency} · ${layer.audience[0]}</div>
                </div>
                ${i < 2 ? `<div class="flex flex-col items-center gap-1 text-gray-300">
                    <i class="fas fa-arrow-right text-xl"></i>
                    <span class="text-[10px] text-gray-400">${i === 0 ? 'UE目标下达' : '工具&护栏'}</span>
                    <i class="fas fa-arrow-left text-xl"></i>
                    <span class="text-[10px] text-gray-400">${i === 0 ? '验证结果反馈' : '结果数据'}</span>
                </div>` : ''}`).join('')}
            </div>
        </div>
    </div>`;

    container.innerHTML = html;

    // 渲染图表
    setTimeout(() => renderGovernanceCharts(), 100);
}

// ===== L2 典型应用场景 =====
function renderTypicalScenarios(scenarios) {
    return `<div class="mt-5 border-t border-gray-100 pt-4">
        <div class="text-xs font-bold text-gray-500 mb-3"><i class="fas fa-lightbulb mr-1 text-amber-500"></i>典型应用场景</div>
        <div class="grid grid-cols-2 gap-3">
            ${scenarios.map(s => `
            <div class="bg-gray-50 rounded-xl p-3 border border-gray-200 hover:border-ke-300 transition-all">
                <div class="text-sm font-bold text-gray-800 mb-1">${s.title}</div>
                <div class="text-xs text-gray-600 mb-2">${s.question}</div>
                <div class="text-[10px] text-gray-500 mb-1"><i class="fas fa-flask mr-1 text-purple-400"></i>${s.method}</div>
                <div class="flex flex-wrap gap-1 mb-1">
                    ${s.keyVars.map(v => {
                        const param = UE_PARAMS.find(p => p.key === v);
                        return `<span class="text-[10px] bg-ke-50 text-ke-700 px-1.5 py-0.5 rounded">${param ? param.label : v}</span>`;
                    }).join('')}
                </div>
                <div class="text-[10px] font-bold text-ke-600">预期影响：${s.expectedImpact}</div>
            </div>`).join('')}
        </div>
    </div>`;
}

// ===== 数据信任度矩阵 =====
function renderDataTrustMatrix() {
    const allParams = UE_PARAMS;
    const layers = ['L3', 'L2', 'L1'];

    const paramAssignment = {};
    allParams.forEach(p => {
        const fidelity = getParamFidelityScore(p.key);
        const cost = getDigitizationCost(p.key);
        paramAssignment[p.key] = {
            ...p, fidelity, digitCost: cost.cost, auto: cost.auto, source: cost.source,
            layer: cost.auto ? 'L3' : (fidelity >= 70 ? 'L2' : 'L1_skip'),
        };
    });

    const l3Params = Object.values(paramAssignment).filter(p => p.layer === 'L3');
    const l2Params = Object.values(paramAssignment).filter(p => p.layer === 'L2');
    const skipParams = Object.values(paramAssignment).filter(p => p.layer === 'L1_skip');

    return `<div class="card mb-4">
        <div class="card-header">
            <h3><i class="fas fa-map mr-2 text-red-500"></i>数据约束地图 — 采不采、信不信、花不花</h3>
            <span class="text-[10px] text-gray-400">根据可信度×成本，决定每个参数属于哪一层</span>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-3 gap-4">
                <!-- L3: 自动采集 -->
                <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                    <div class="text-xs font-bold text-indigo-700 mb-2"><i class="fas fa-robot mr-1"></i>L3 自动采集（低成本、高可信）</div>
                    <div class="text-[10px] text-indigo-500 mb-3">合同系统、租约系统自动生成，足以做弹性分析</div>
                    <div class="space-y-1">${l3Params.map(p => `
                        <div class="flex items-center justify-between px-2 py-1 bg-white rounded">
                            <span class="text-[10px] text-gray-700">${p.label}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-green-600 font-medium">${p.fidelity}%</span>
                                <span class="text-[10px] text-gray-400">${p.source}</span>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- L2: 辅助采集 -->
                <div class="bg-green-50 rounded-xl p-4 border border-green-200">
                    <div class="text-xs font-bold text-green-700 mb-2"><i class="fas fa-hand-pointer mr-1"></i>L2 辅助采集（中成本、可信度中）</div>
                    <div class="text-[10px] text-green-500 mb-3">需额外系统或人工辅助，弹性分析时作为参考</div>
                    <div class="space-y-1">${l2Params.map(p => `
                        <div class="flex items-center justify-between px-2 py-1 bg-white rounded">
                            <span class="text-[10px] text-gray-700">${p.label}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-yellow-600 font-medium">${p.fidelity}%</span>
                                <span class="text-[10px] text-gray-400">${p.source}</span>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- L1: 不采集 -->
                <div class="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <div class="text-xs font-bold text-amber-700 mb-2"><i class="fas fa-eye-slash mr-1"></i>L1 不采集（高成本、低可信）</div>
                    <div class="text-[10px] text-amber-500 mb-3">过程数据不采集，系统成本↓70%，可信度↑至≈90%</div>
                    <div class="space-y-1">${skipParams.map(p => `
                        <div class="flex items-center justify-between px-2 py-1 bg-white rounded">
                            <span class="text-[10px] text-gray-700">${p.label}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-red-500 font-medium">${p.fidelity}%</span>
                                <span class="text-[10px] text-gray-400 line-through">${p.source}</span>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ===== 图表 =====
function renderGovernanceCharts() {
    // 暂时不需要额外图表，所有可视化在 HTML 中已完成
}

// ========== L1 AI 赋能工具库 【新架构】 ==========
// 围绕三个核心维度：
// 1. 关键业务链路的核心能力构建（获客/产品/转化/交付）
// 2. 最强杠杆(U×E支点) 
// 3. BLM 实验指向


// ========== MCP 架构三层能力体系 ==========
// 上层：应用消费者（MCP Client）- 各类业务应用
// 中层：业务架构核心（MCP Server）- AI原生服务
// 下层：基建生产者（MCP Provider）- 核心基础设施

const AI_TOOLS_CATALOG = {
    // ========== 上层：应用消费者层（MCP Clients）==========
    // 获客场景应用
    acquisition_apps: {
        id: 'acquisition_apps',
        layer: 'consumer',
        name: '获客场景应用',
        icon: 'bullhorn',
        color: '#6366f1',
        desc: '精准获客、筛选、定价策略',
        tools: [
            { id: 'housing_score', name: '房源打分系统', desc: '楼龄/坪效/HQI三维评分，智能识别高潜房源', param: 'focus_penetration', url: 'https://designdev.meizu.life/preview/70', icon: 'calculator', external: true },
            { id: 'social_acquisition', name: '社交媒体获客', desc: '小红书/抖音内容矩阵，业主种草与品牌曝光', param: 'social_leads', url: 'https://social.morning.rocks', icon: 'share-alt', external: true },
            { id: 'mini_program', name: '独立小程序获客', desc: '报价审核、预约量房、案例展示一站式入口', param: 'mini_program_leads', url: 'https://i.renos.life', icon: 'mobile-alt', external: true }
        ]
    },
    // 产品场景应用
    product_apps: {
        id: 'product_apps',
        layer: 'consumer',
        name: '产品场景应用',
        icon: 'cube',
        color: '#2f9668',
        desc: '标品方案、标准化、品质管控',
        tools: [
            { id: 'case_database', name: '案例数据库', desc: '小区/品牌/案例全景库，支持业主自助浏览', param: 'case_views', url: 'https://social.morning.rocks', icon: 'images', external: true },
            { id: 'ipd_tool', name: 'IPD研发工具', desc: '集成产品开发流程管理，版本迭代与需求追踪', param: 'ipd_progress', url: 'http://plan.morning.rocks', icon: 'project-diagram', external: true },
            { id: 'gray_release', name: '产品灰度上线', desc: '新产品分城市/分批次灰度发布，风险可控', param: 'gray_coverage', url: null, icon: 'layer-group' }
        ]
    },
    // 转化场景应用
    conversion_apps: {
        id: 'conversion_apps',
        layer: 'consumer',
        name: '转化场景应用',
        icon: 'exchange-alt',
        color: '#f59e0b',
        desc: '销售流程、人效提升、渠道管理',
        tools: [
            { id: 'quote_tool', name: '智能报价工具', desc: '在线量房+智能报价生成，支持多方案对比', param: 'quote_conversion', url: 'https://designer.ke.com/', icon: 'file-alt', external: true },
            { id: 'installment_calc', name: '分期计算工具', desc: '装修贷分期方案试算，月供/利率清晰展示', param: 'installment_adoption', url: 'http://123.57.73.54/', icon: 'calculator', external: true },
            { id: 'community_data', name: '小区数据查询', desc: '租金走势/竞品分析/历史成交数据支撑谈单', param: 'data_usage', url: 'https://i.renos.life/#/rent-charts-demo', icon: 'chart-bar', external: true },
            { id: 'roi_calculator', name: '投资回报精算模型', desc: '装修投资回报精细化计算，助力销售说服业主', param: 'roi_calculation', url: 'http://socialmedia.morning.rocks/jisuan/', icon: 'calculator', external: true }
        ]
    },
    // 交付场景应用
    delivery_apps: {
        id: 'delivery_apps',
        layer: 'consumer',
        name: '交付场景应用',
        icon: 'truck',
        color: '#ec4899',
        desc: '供应链、工期、品质管控',
        tools: [
            { id: 'timeline_guard', name: '工期守护者', desc: '标准工期预警与赔付计算，延期自动触发', param: 'vacancy_days', url: null, icon: 'clock' },
            { id: 'quality_inspection', name: '品质验收助手', desc: '分阶段质量检查清单与问题追踪', param: 'quality_score', url: null, icon: 'clipboard-check' }
        ]
    },

    // ========== 中层：业务架构核心（MCP Server）==========
    acquisition_core: {
        id: 'acquisition_core',
        layer: 'server',
        name: '内容域',
        icon: 'robot',
        color: '#6366f1',
        desc: '房源洞察、业主画像、定价策略',
        tools: [
            { id: 'housing_insight_mcp', name: '房源洞察', desc: '房源价值评估', param: 'housing_insight_api', icon: 'brain' },
            { id: 'owner_profile_mcp', name: '业主画像', desc: '需求预测与沟通策略', param: 'owner_profile_api', icon: 'user-tag' },
            { id: 'pricing_strategy_mcp', name: '定价策略', desc: '租金溢价预测', param: 'pricing_strategy_api', icon: 'tags' }
        ]
    },
    product_core: {
        id: 'product_core',
        layer: 'server',
        name: '定价域',
        icon: 'cubes',
        color: '#2f9668',
        desc: '方案生成、成本优化、风险评估',
        tools: [
            { id: 'solution_gen_mcp', name: '方案生成', desc: '标品方案推荐', param: 'solution_gen_api', icon: 'drafting-compass' },
            { id: 'cost_opt_mcp', name: '成本优化', desc: '物料替代建议', param: 'cost_opt_api', icon: 'calculator' },
            { id: 'risk_assess_mcp', name: '风险评估', desc: '项目风险预警', param: 'risk_assess_api', icon: 'exclamation-triangle' }
        ]
    },
    conversion_core: {
        id: 'conversion_core',
        layer: 'server',
        name: '履约域',
        icon: 'magic',
        color: '#f59e0b',
        desc: '销售辅助、话术生成、异议处理',
        tools: [
            { id: 'sales_assist_mcp', name: '销售辅助', desc: '实时谈单建议', param: 'sales_assist_api', icon: 'headset' },
            { id: 'objection_mcp', name: '异议处理', desc: '顾虑识别与应对', param: 'objection_api', icon: 'comments' },
            { id: 'roi_explain_mcp', name: '收益解释', desc: '投资回报可视化', param: 'roi_explain_api', icon: 'chart-pie' }
        ]
    },
    delivery_core: {
        id: 'delivery_core',
        layer: 'server',
        name: '结算域',
        icon: 'network-wired',
        color: '#ec4899',
        desc: '进度管控、质量监测、供应商协同',
        tools: [
            { id: 'schedule_mcp', name: '进度管控', desc: '工期风险预警', param: 'schedule_api', icon: 'calendar-alt' },
            { id: 'quality_mcp', name: '质量监测', desc: 'AI巡检识别', param: 'quality_api', icon: 'camera' },
            { id: 'supplier_mcp', name: '供应商协同', desc: '绩效与调度', param: 'supplier_api', icon: 'truck-loading' }
        ]
    },

    // ========== 下层：基建生产者层（MCP Provider）==========
    // 数据与知识基础设施（合并数据+AI能力，删除房源数据中心、大模型、Agent框架）
    data_knowledge_infra: {
        id: 'data_knowledge_infra',
        layer: 'provider',
        name: '数据与知识基础设施',
        icon: 'database',
        color: '#0891b2',
        desc: 'MCP Provider: UE数据、市场情报、知识库',
        tools: [
            { id: 'ue_data_api', name: 'UE数据服务', desc: '单位经济数据统一查询与计算', param: 'ue_data_service', url: null, icon: 'chart-line' },
            { id: 'market_data_api', name: '市场情报服务', desc: '竞品动态、行业趋势、政策解读', param: 'market_data_service', url: null, icon: 'globe' },
            { id: 'knowledge_base', name: '知识库服务', desc: '装修知识、案例、标准沉淀与检索', param: 'knowledge_base', icon: 'book' }
        ]
    },
    // 签约与履约基础设施（拆分供应链）
    contract_infra: {
        id: 'contract_infra',
        layer: 'provider',
        name: '签约与履约系统',
        icon: 'file-signature',
        color: '#7c3aed',
        desc: 'MCP Provider: 签约、履约、结算管理',
        tools: [
            { id: 'contract_system', name: '签约系统', desc: '合同签署、电子签章、条款管理', param: 'contract_system', icon: 'file-contract' },
            { id: 'performance_system', name: '履约管理系统', desc: '履约进度追踪与节点管控', param: 'performance_system', icon: 'tasks' }
        ]
    },
    // 供应链与监理基础设施（拆分供应链）
    supply_supervise_infra: {
        id: 'supply_supervise_infra',
        layer: 'provider',
        name: '供应链与监理',
        icon: 'boxes',
        color: '#db2777',
        desc: 'MCP Provider: SRM、工人监理、结算',
        tools: [
            { id: 'srm_system', name: 'SRM管理', desc: '供应商管理+采购协同+库存预警', param: 'srm_coverage', url: 'https://www.mingdao.com/app/054d85c1-0ece-4fb9-b5f5-78bbfb31f01f', icon: 'boxes', external: true },
            { id: 'worker_supervise', name: '工人监理管理', desc: '工人实名制+考勤+质量评价', param: 'worker_supervise', icon: 'hard-hat' },
            { id: 'settlement_system', name: '结算系统', desc: '工资代发、工程款结算、保险', param: 'settlement_system', url: 'https://www.mingdao.com/app/67e7b1ee-6c84-459f-b1ad-20d5091f5be4', icon: 'money-check-alt', external: true }
        ]
    },
    // 底线管理（跨层）
    baseline: {
        id: 'baseline',
        layer: 'guardrail',
        name: '底线管理',
        icon: 'shield-alt',
        color: '#dc2626',
        desc: 'UE护栏、风险管控、合规监测（贯穿三层）',
        tools: [
            { id: 'ue_guardrail', name: 'UE护栏看板', desc: '6大关键指标实时监控与预警', param: 'guardrail_status', icon: 'shield-alt' },
            { id: 'material_control', name: 'A类物资管控', desc: '关键材料库存/质量/供应商监控', param: 'material_a_class', icon: 'box' },
            { id: 'sentiment_monitor', name: '舆情监测', desc: '客户投诉/社交媒体/口碑监控', param: 'sentiment_score', icon: 'bullhorn' },
            { id: 'compliance_check', name: '合规检查', desc: '合同合规、用工合规、资金合规', param: 'compliance_score', icon: 'check-double' }
        ]
    }
};

// 维度2：U×E支点工具（杠杆工具）
const LEVERAGE_TOOLS = {
    profit_elasticity: {
        name: '利润弹性分析器',
        desc: '识别最敏感的UE参数组合',
        icon: 'chart-line',
        color: '#7c3aed'
    },
    ue_guardrail: {
        name: 'UE 护栏看板',
        desc: '实时监控6大关键指标健康度',
        icon: 'shield-alt',
        color: '#10b981'
    },
    cost_alert: {
        name: '成本预警器',
        desc: '装修造价实时预警（成本/GTV安全线）',
        icon: 'exclamation-triangle',
        color: '#ef4444'
    },
    pricing_advisor: {
        name: '智能定价顾问',
        desc: '基于UE底线推荐定价区间',
        icon: 'tag',
        color: '#3b82f6'
    }
};

// 维度3：BLM 实验指向工具
const BLM_TOOLS = {
    exp_tracker: {
        name: '实验进度追踪',
        desc: '所有BLM循环状态一目了然',
        icon: 'flask',
        color: '#8b5cf6'
    },
    hypothesis_map: {
        name: '假设验证地图',
        desc: '14个战略假设验证状态分布',
        icon: 'map-marked-alt',
        color: '#06b6d4'
    },
    learning_bank: {
        name: '组织学习银行',
        desc: '验证结论与洞察归档',
        icon: 'brain',
        color: '#f97316'
    }
};

function renderL1ToolsPage() {
    const container = document.getElementById('l1-tools-content');
    if (!container) return;

    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES[AppState.currentCity];
    
    // 获取最强杠杆数据
    const topLeverages = getTopLeverages();
    const activeExperiments = getActiveExperiments();

    let html = '';

    // ===== Hero Banner =====
    html += renderToolsHeroBanner();

    // ===== 维度1：业务链路能力工具箱 =====
    html += renderCapabilityToolbox();

    // ===== 维度2：U×E支点工具箱 =====
    html += renderLeverageToolbox(topLeverages);

    // ===== 维度3：BLM实验指向 =====
    html += renderBLMToolbox(activeExperiments);

    // 注：UE护栏看板已移至飞轮页面

    container.innerHTML = html;

    // 初始化
    setTimeout(() => {
        initToolInteractions();
        filterStandardProducts();
        updatePricingSuggestion();
        updateCostAlert();
        renderUEBenchmark();
    }, 50);
}

// Hero Banner
function renderToolsHeroBanner() {
    return `<div class="bg-gradient-to-br from-gray-900 via-indigo-900 to-purple-900 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
        <div class="relative z-10">
            <div class="flex items-center justify-between">
                <div>
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">🤖</div>
                        <div>
                            <div class="text-xs font-bold uppercase tracking-widest text-indigo-200">L3 执行层 · AI 赋能</div>
                            <div class="text-xl font-bold">AI 工具库 — 三维突破</div>
                        </div>
                    </div>
                    <div class="text-sm text-indigo-200 max-w-2xl">
                        核心 UE 不变、工具路径随便搞。围绕<strong>业务能力链路</strong>、<strong>U×E最强杠杆</strong>、<strong>BLM实验指向</strong>三大维度构建智能工具集。
                    </div>
                </div>
                <div class="flex gap-3">
                    <div class="bg-white/10 rounded-xl px-4 py-3 text-center">
                        <div class="text-2xl font-bold text-indigo-300">3</div>
                        <div class="text-[10px] text-indigo-200">能力维度</div>
                    </div>
                    <div class="bg-white/10 rounded-xl px-4 py-3 text-center">
                        <div class="text-2xl font-bold text-purple-300">12</div>
                        <div class="text-[10px] text-purple-200">工具模块</div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// MCP 三层架构工具箱
function renderCapabilityToolbox() {
    // 按层级分组
    const consumerApps = Object.values(AI_TOOLS_CATALOG).filter(c => c.layer === 'consumer');
    const serverCores = Object.values(AI_TOOLS_CATALOG).filter(c => c.layer === 'server');
    const providerInfra = Object.values(AI_TOOLS_CATALOG).filter(c => c.layer === 'provider');
    
    return `
    <div class="mb-6">
        <!-- MCP 架构说明 -->
        <div class="bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-900 rounded-xl p-4 mb-5 text-white">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <i class="fas fa-layer-group text-xl"></i>
                    </div>
                    <div>
                        <div class="text-sm font-bold">MCP 架构三层能力体系</div>
                        <div class="text-xs text-white/70">Consumer → Server → Provider 纵向分层，API/MCP 协议贯通</div>
                    </div>
                </div>
                <div class="flex items-center gap-6 text-xs">
                    <div class="text-center">
                        <div class="w-3 h-3 rounded-full bg-blue-400 mx-auto mb-1"></div>
                        <span class="text-white/80">Consumer</span>
                    </div>
                    <div class="text-white/40">→</div>
                    <div class="text-center">
                        <div class="w-3 h-3 rounded-full bg-purple-400 mx-auto mb-1"></div>
                        <span class="text-white/80">Server</span>
                    </div>
                    <div class="text-white/40">→</div>
                    <div class="text-center">
                        <div class="w-3 h-3 rounded-full bg-pink-400 mx-auto mb-1"></div>
                        <span class="text-white/80">Provider</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ========== 第一层：应用消费者（MCP Clients）========== -->
        <div class="mb-5">
            <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    <i class="fas fa-desktop"></i>
                </span>
                <h3 class="text-base font-bold text-gray-800">应用消费者层</h3>
                <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">MCP Client</span>
                <span class="text-xs text-gray-400">各类业务应用作为 API/MCP 的消费者</span>
            </div>
            <div class="grid grid-cols-4 gap-3">
                ${consumerApps.map(cap => `
                    <div class="card hover:shadow-lg transition-shadow cursor-pointer border-l-4" style="border-left-color: ${cap.color}" onclick="showCapabilityTools('${cap.id}')">
                        <div class="p-3">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: ${cap.color}15; color: ${cap.color}">
                                    <i class="fas fa-${cap.icon}"></i>
                                </div>
                                <span class="font-bold text-gray-800 text-sm">${cap.name}</span>
                            </div>
                            <p class="text-xs text-gray-500 mb-2">${cap.desc}</p>
                            <div class="space-y-1">
                                ${cap.tools.slice(0, 2).map(tool => `
                                    <div class="flex items-center gap-1.5 text-xs">
                                        <span class="w-1 h-1 rounded-full" style="background: ${cap.color}"></span>
                                        <span class="text-gray-600 truncate">${tool.name}</span>
                                    </div>
                                `).join('')}
                                ${cap.tools.length > 2 ? `<div class="text-[10px] text-gray-400 pl-2">+${cap.tools.length - 2} 个工具</div>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- 连接箭头 -->
        <div class="flex justify-center my-3">
            <div class="flex items-center gap-2 text-purple-400">
                <i class="fas fa-chevron-down"></i>
                <span class="text-xs font-medium">MCP 协议调用</span>
                <i class="fas fa-chevron-down"></i>
            </div>
        </div>

        <!-- ========== 第二层：业务架构核心（MCP Server）========== -->
        <div class="mb-5">
            <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">
                    <i class="fas fa-server"></i>
                </span>
                <h3 class="text-base font-bold text-gray-800">业务架构核心</h3>
                <span class="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">AI Native MCP Server</span>
            </div>
            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-3 border border-purple-200">
                <div class="grid grid-cols-4 gap-3">
                    ${serverCores.map(cap => `
                        <div class="bg-white rounded-lg p-2.5 border border-purple-100 hover:shadow-md transition-shadow cursor-pointer" onclick="showCapabilityTools('${cap.id}')">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="w-6 h-6 rounded flex items-center justify-center text-xs" style="background: ${cap.color}15; color: ${cap.color}">
                                    <i class="fas fa-${cap.icon}"></i>
                                </div>
                                <span class="font-bold text-gray-800 text-xs">${cap.name}</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                                ${cap.tools.map(tool => `
                                    <span class="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">${tool.name}</span>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- 连接箭头 -->
        <div class="flex justify-center my-3">
            <div class="flex items-center gap-2 text-pink-400">
                <i class="fas fa-chevron-down"></i>
                <span class="text-xs font-medium">API 调用</span>
                <i class="fas fa-chevron-down"></i>
            </div>
        </div>

        <!-- ========== 第三层：基建生产者（MCP Provider）========== -->
        <div class="mb-5">
            <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">
                    <i class="fas fa-database"></i>
                </span>
                <h3 class="text-base font-bold text-gray-800">基建生产者层</h3>
                <span class="text-xs px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full">MCP Provider</span>

            </div>
            <div class="grid grid-cols-3 gap-3">
                ${providerInfra.map(cap => `
                    <div class="card hover:shadow-lg transition-shadow cursor-pointer" onclick="showCapabilityTools('${cap.id}')">
                        <div class="p-3">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: ${cap.color}15; color: ${cap.color}">
                                    <i class="fas fa-${cap.icon}"></i>
                                </div>
                                <span class="font-bold text-gray-800 text-sm">${cap.name}</span>
                            </div>
                            <p class="text-xs text-gray-500 mb-2">${cap.desc.replace('MCP Provider: ', '')}</p>
                            <div class="flex flex-wrap gap-1">
                                ${cap.tools.map(tool => `
                                    <span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded flex items-center gap-1">
                                        <i class="fas fa-${tool.icon} text-[8px]"></i>${tool.name}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;
}

// U×E支点工具箱
function renderLeverageToolbox(topLeverages) {
    const leverages = topLeverages.slice(0, 4);
    
    return `
    <div class="mb-6">
        <div class="flex items-center gap-2 mb-4">
            <span class="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">2</span>
            <h3 class="text-lg font-bold text-gray-800">最强杠杆工具箱</h3>
            <span class="text-sm text-gray-400">U×E 支点 · 利润弹性最高的参数组合</span>
        </div>
        <div class="grid grid-cols-4 gap-4">
            ${Object.values(LEVERAGE_TOOLS).map(tool => `
                <div class="card hover:shadow-lg transition-shadow cursor-pointer" onclick="showLeverageTool('${tool.name}')">
                    <div class="p-4 text-center">
                        <div class="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-xl" style="background: ${tool.color}20; color: ${tool.color}">
                            <i class="fas fa-${tool.icon}"></i>
                        </div>
                        <div class="font-bold text-gray-800 mb-1">${tool.name}</div>
                        <div class="text-xs text-gray-500">${tool.desc}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        ${leverages.length > 0 ? `
        <div class="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
            <div class="text-xs font-bold text-purple-700 mb-2">本城市最强杠杆 TOP4</div>
            <div class="grid grid-cols-4 gap-3">
                ${leverages.map((lev, i) => `
                    <div class="flex items-center gap-2">
                        <span class="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold">${i+1}</span>
                        <div>
                            <div class="text-xs font-bold text-gray-700">${lev.label}</div>
                            <div class="text-[10px] text-gray-500">弹性 ${lev.elasticity?.toFixed(2) || 'N/A'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}
    </div>`;
}

// BLM 工具箱  
function renderBLMToolbox(activeExperiments) {
    return `
    <div class="mb-6">
        <div class="flex items-center gap-2 mb-4">
            <span class="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">3</span>
            <h3 class="text-lg font-bold text-gray-800">BLM 实验指向</h3>
            <span class="text-sm text-gray-400">Build → Measure → Learn 循环</span>
        </div>
        <div class="grid grid-cols-3 gap-4">
            ${Object.values(BLM_TOOLS).map(tool => `
                <div class="card hover:shadow-lg transition-shadow cursor-pointer" onclick="showBLMToolbox('${tool.name}')">
                    <div class="p-4 flex items-center gap-4">
                        <div class="w-14 h-14 rounded-xl flex items-center justify-center text-xl" style="background: ${tool.color}20; color: ${tool.color}">
                            <i class="fas fa-${tool.icon}"></i>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">${tool.name}</div>
                            <div class="text-xs text-gray-500">${tool.desc}</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        ${activeExperiments.length > 0 ? `
        <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-bold text-amber-700">进行中的实验</div>
                <span class="text-[10px] text-amber-600">${activeExperiments.length} 个</span>
            </div>
            <div class="space-y-2">
                ${activeExperiments.slice(0, 3).map(exp => `
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-700">${exp.name}</span>
                        <span class="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-800 rounded">${exp.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}
    </div>`;
}

// 获取最强杠杆
function getTopLeverages() {
    try {
        const city = AppState.currentCity;
        const matrix = calculateCrossMatrix ? calculateCrossMatrix(AppState.baselineModels[city]) : null;
        if (matrix && matrix.matrix) {
            return matrix.matrix
                .sort((a, b) => b.elasticity - a.elasticity)
                .slice(0, 4)
                .map(m => ({
                    label: m.eLabel || m.eType,
                    elasticity: m.elasticity,
                    uKey: m.uKey
                }));
        }
    } catch(e) {}
    return [];
}

// 获取进行中的实验
function getActiveExperiments() {
    const experiments = [];
    if (AppState.assumptions) {
        AppState.assumptions.forEach(asmp => {
            if (asmp.bml_experiments) {
                asmp.bml_experiments.forEach(exp => {
                    if (exp.status === '验证中') {
                        experiments.push({ name: exp.name || asmp.assumption_name, status: exp.status });
                    }
                });
            } else if (asmp.bml_experiment && asmp.bml_experiment.status === '验证中') {
                experiments.push({ name: asmp.assumption_name, status: asmp.bml_experiment.status });
            }
        });
    }
    return experiments;
}

// 初始化工具交互
function initToolInteractions() {
    window.showCapabilityTools = (capId) => {
        const cap = AI_TOOLS_CATALOG[capId];
        if (!cap) return;
        
        // 打开工具选择弹窗，展示所有可用工具
        showToolSelectorModal(cap);
    };
    
    window.showLeverageTool = (toolName) => {
        showToast(`打开 ${toolName}...`, 'info');
    };
    
    window.showBLMToolbox = (toolName) => {
        showToast(`打开 ${toolName}...`, 'info');
    };
    
    window.showBaselineTool = (toolId) => {
        const toolMap = {
            'ue_guardrail': 'UE 护栏监控',
            'material_control': 'A类物资管控',
            'insurance_system': '保险体系',
            'sentiment_monitor': '舆情监测'
        };
        showToast(`打开 ${toolMap[toolId] || '工具'}...`, 'info');
        
        // 对于UE护栏，滚动到护栏看板
        if (toolId === 'ue_guardrail') {
            document.querySelector('.guardrails-section')?.scrollIntoView({ behavior: 'smooth' });
        }
    };
}

// ===== 护栏看板 =====
function renderGuardrailsDashboard() {
    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES[AppState.currentCity];
    const guardrails = checkGuardrails(model);

    const statusColors = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
    const statusLabels = { green: '全部达标', yellow: '部分预警', red: '有突破线' };
    const statusEmoji = { green: '✅', yellow: '⚠️', red: '🚨' };

    return `<div class="card">
        <div class="card-header">
            <h3><i class="fas fa-shield-alt mr-2" style="color:${statusColors[guardrails.overallStatus]}"></i>UE 护栏看板</h3>
            <span class="text-sm font-bold" style="color:${statusColors[guardrails.overallStatus]}">${statusEmoji[guardrails.overallStatus]} ${statusLabels[guardrails.overallStatus]} · 健康度 ${guardrails.score}%</span>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-6 gap-3">
                ${guardrails.results.map(r => `
                <div class="rounded-xl p-3 border-2 ${r.status === 'ok' ? 'border-green-200 bg-green-50' : r.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}">
                    <div class="text-[10px] text-gray-500 mb-1">${r.icon} ${r.label}</div>
                    <div class="text-lg font-bold ${r.status === 'ok' ? 'text-green-700' : r.severity === 'critical' ? 'text-red-700' : 'text-yellow-700'}">${typeof r.current === 'number' ? (r.unit === '元' ? '¥' + formatNumber(Math.round(r.current)) : r.current + r.unit) : '-'}</div>
                    <div class="text-[10px] ${r.status === 'ok' ? 'text-green-500' : 'text-red-500'}">${r.status === 'ok' ? '达标' : '突破'} (阈值${r.value}${r.unit})</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}

// ===== L1 交互函数 =====

function filterStandardProducts() {
    const roomType = document.getElementById('tool-room-type')?.value || '';
    const area = parseFloat(document.getElementById('tool-area')?.value) || 65;
    const budget = document.getElementById('tool-budget')?.value || '';

    let products = [...STANDARD_PRODUCT_LIBRARY];

    if (roomType) products = products.filter(p => p.roomType === roomType);

    if (budget === 'low') products = products.filter(p => p.gtvRange[1] <= 35000);
    else if (budget === 'mid') products = products.filter(p => p.gtvRange[0] <= 60000 && p.gtvRange[1] >= 30000);
    else if (budget === 'high') products = products.filter(p => p.gtvRange[0] >= 55000);

    // 按面积匹配度排序
    products.sort((a, b) => {
        const aMatch = a.area.match(/(\d+)-(\d+)/);
        const bMatch = b.area.match(/(\d+)-(\d+)/);
        if (!aMatch || !bMatch) return 0;
        const aMid = (parseInt(aMatch[1]) + parseInt(aMatch[2])) / 2;
        const bMid = (parseInt(bMatch[1]) + parseInt(bMatch[2])) / 2;
        return Math.abs(aMid - area) - Math.abs(bMid - area);
    });

    const container = document.getElementById('product-results');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = '<div class="text-center text-sm text-gray-400 py-4">未找到匹配方案，请调整筛选条件</div>';
        return;
    }

    container.innerHTML = products.slice(0, 4).map((p, i) => {
        const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES[AppState.currentCity];
        const avgGTV = (p.gtvRange[0] + p.gtvRange[1]) / 2;
        const estimatedProfit = avgGTV * (p.targetMargin / 100);
        return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg border ${i === 0 ? 'border-ke-300 bg-ke-50' : 'border-gray-200 hover:border-gray-300'} transition-all">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${i === 0 ? 'from-ke-400 to-ke-600' : 'from-gray-200 to-gray-300'} flex items-center justify-center text-white text-xs font-bold">${i === 0 ? '★' : i + 1}</div>
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <span class="text-sm font-bold text-gray-800">${p.name}</span>
                    <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">${p.id}</span>
                </div>
                <div class="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
                    <span>${p.roomType} · ${p.area}</span>
                    <span>预算 ${p.budget}</span>
                    <span>${p.cycle}</span>
                    <span>${p.style}</span>
                </div>
            </div>
            <div class="text-right">
                <div class="text-xs font-bold text-ke-600">预估利润 ¥${formatNumber(Math.round(estimatedProfit))}</div>
                <div class="text-[10px] text-gray-400">目标毛利 ${p.targetMargin}%</div>
            </div>
        </div>`;
    }).join('');
}

function updatePricingSuggestion() {
    const currentRent = parseFloat(document.getElementById('tool-current-rent')?.value) || 5000;
    const area = parseFloat(document.getElementById('tool-pricing-area')?.value) || 65;

    const suggestion = calculatePricingSuggestion({ area, currentRent });
    const container = document.getElementById('pricing-result');
    if (!container) return;

    container.innerHTML = `
        <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="bg-blue-50 rounded-lg p-3 text-center">
                <div class="text-[10px] text-blue-500">建议装修后月租</div>
                <div class="text-lg font-bold text-blue-700">¥${formatNumber(suggestion.suggestedRentAfter)}</div>
                <div class="text-[10px] text-blue-400">溢价 ${suggestion.premiumRate.toFixed(1)}%</div>
            </div>
            <div class="bg-indigo-50 rounded-lg p-3 text-center">
                <div class="text-[10px] text-indigo-500">估算 GTV</div>
                <div class="text-lg font-bold text-indigo-700">¥${formatNumber(suggestion.estimatedGTV)}</div>
                <div class="text-[10px] text-indigo-400">${formatNumber(suggestion.gtvRange.min)}~${formatNumber(suggestion.gtvRange.max)}</div>
            </div>
            <div class="rounded-lg p-3 text-center ${suggestion.isHealthy ? 'bg-green-50' : 'bg-red-50'}">
                <div class="text-[10px] ${suggestion.isHealthy ? 'text-green-500' : 'text-red-500'}">UE 健康度</div>
                <div class="text-lg font-bold ${suggestion.isHealthy ? 'text-green-700' : 'text-red-700'}">${suggestion.isHealthy ? '✅ 健康' : '⚠️ 注意'}</div>
                <div class="text-[10px] ${suggestion.isHealthy ? 'text-green-400' : 'text-red-400'}">利润 ¥${formatNumber(Math.round(suggestion.estimatedProfit))}</div>
            </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
            <div class="text-[10px] text-gray-500 mb-1">定价安全区间</div>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">¥${formatNumber(suggestion.rentRange.min)}</span>
                <div class="flex-1 h-3 bg-gray-200 rounded-full relative overflow-hidden">
                    <div class="absolute h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full" style="left:20%;width:60%"></div>
                    <div class="absolute h-full w-0.5 bg-blue-500" style="left:${Math.min(90, Math.max(10, (suggestion.suggestedRentAfter - suggestion.rentRange.min) / (suggestion.rentRange.max - suggestion.rentRange.min) * 60 + 20))}%"></div>
                </div>
                <span class="text-xs text-gray-400">¥${formatNumber(suggestion.rentRange.max)}</span>
            </div>
        </div>`;
}

function updateCostAlert() {
    const inputCost = parseFloat(document.getElementById('tool-cost-input')?.value) || 42000;
    const gtv = parseFloat(document.getElementById('tool-gtv-input')?.value) || 52000;

    const alert = costAlertCheck(inputCost, gtv);
    const container = document.getElementById('cost-alert-result');
    if (!container) return;

    const gaugePercent = Math.min(100, (inputCost / (alert.maxAllowedCost * 1.3)) * 100);

    container.innerHTML = `
        <div class="text-center mb-3">
            <div class="relative w-32 h-16 mx-auto mb-2 overflow-hidden">
                <div class="absolute bottom-0 w-32 h-32 rounded-full border-8 border-gray-200" style="clip-path: polygon(0 50%, 100% 50%, 100% 100%, 0 100%)"></div>
                <div class="absolute bottom-0 w-32 h-32 rounded-full border-8" style="border-color:${alert.color};clip-path: polygon(0 50%, ${gaugePercent}% 50%, ${gaugePercent}% 100%, 0 100%)"></div>
            </div>
            <div class="text-xl font-bold" style="color:${alert.color}">${alert.status === 'safe' ? '✅ 安全' : alert.status === 'caution' ? '⚠️ 注意' : '🚨 超限'}</div>
            <div class="text-xs text-gray-500">${alert.message}</div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center text-xs">
            <div class="bg-gray-50 rounded-lg p-2">
                <div class="text-gray-400">成本/GTV</div>
                <div class="font-bold text-gray-700">${alert.ratio}%</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-2">
                <div class="text-gray-400">安全线</div>
                <div class="font-bold text-gray-700">¥${formatNumber(alert.maxAllowedCost)}</div>
            </div>
        </div>
        ${alert.status === 'danger' ? `<div class="mt-2 bg-red-50 rounded-lg p-2 text-[10px] text-red-600">
            <i class="fas fa-exclamation-circle mr-1"></i>超出 ¥${formatNumber(Math.abs(alert.overrun))}，建议：降低物料档次 / 减少施工面积 / 提高 GTV
        </div>` : ''}
        <div class="mt-2 text-[10px] text-gray-400">
            <div>物料上限 ¥${formatNumber(alert.breakdown.materialMax)} · 人工上限 ¥${formatNumber(alert.breakdown.laborMax)} · 管理费上限 ¥${formatNumber(alert.breakdown.managementMax)}</div>
        </div>`;
}

function renderUEBenchmark() {
    const container = document.getElementById('ue-benchmark-result');
    if (!container) return;

    const bj = calculateUE(DEFAULT_BASELINES.beijing);
    const sh = calculateUE(DEFAULT_BASELINES.shanghai);
    const current = AppState.currentCity === 'beijing' ? bj : sh;
    const compare = AppState.currentCity === 'beijing' ? sh : bj;
    const cityName = AppState.currentCity === 'beijing' ? '北京' : '上海';
    const compareName = AppState.currentCity === 'beijing' ? '上海' : '北京';

    const metrics = [
        { label: '单套收入', current: current.totalRevenue, compare: compare.totalRevenue, unit: '元', format: v => '¥' + formatNumber(Math.round(v)) },
        { label: '单套利润', current: current.grossProfit, compare: compare.grossProfit, unit: '元', format: v => '¥' + formatNumber(Math.round(v)) },
        { label: '毛利率', current: current.grossMargin, compare: compare.grossMargin, unit: '%', format: v => v.toFixed(1) + '%' },
        { label: '装修造价', current: current.renovationCost, compare: compare.renovationCost, unit: '元', format: v => '¥' + formatNumber(Math.round(v)), reverse: true },
    ];

    container.innerHTML = `
        <div class="space-y-3">
            ${metrics.map(m => {
                const diff = m.current - m.compare;
                const better = m.reverse ? diff < 0 : diff > 0;
                return `<div class="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100">
                    <span class="text-xs text-gray-600">${m.label}</span>
                    <div class="flex items-center gap-4">
                        <div class="text-right">
                            <div class="text-xs font-bold text-gray-800">${m.format(m.current)}</div>
                            <div class="text-[10px] text-gray-400">${cityName}</div>
                        </div>
                        <div class="text-[10px] ${better ? 'text-green-500' : 'text-red-500'} font-bold">${better ? '↑' : '↓'}</div>
                        <div class="text-right">
                            <div class="text-xs text-gray-500">${m.format(m.compare)}</div>
                            <div class="text-[10px] text-gray-400">${compareName}</div>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <div class="mt-3 bg-indigo-50 rounded-lg p-3 text-[10px] text-indigo-600">
            <i class="fas fa-info-circle mr-1"></i>基准线来自系统财务数据（L1层自动采集），数据可信度 95%。前线美租顾问可对标此基准，自主决策执行路径。
        </div>`;
}


// ===== 工具选择弹窗 =====
function showToolSelectorModal(cap) {
    // 创建弹窗容器
    const modal = document.createElement('div');
    modal.id = 'tool-selector-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div class="p-5 border-b border-gray-100 flex items-center justify-between" style="background: linear-gradient(135deg, ${cap.color}10, ${cap.color}05);">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white" style="background: ${cap.color}">
                        <i class="fas fa-${cap.icon}"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">${cap.name}</h3>
                        <p class="text-xs text-gray-500">${cap.desc}</p>
                    </div>
                </div>
                <button onclick="closeToolModal()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="p-5 overflow-y-auto max-h-[60vh]">
                <div class="grid grid-cols-1 gap-3">
                    ${cap.tools.map(tool => `
                        <div class="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-${cap.color} hover:shadow-md transition-all group" 
                             ${tool.url ? `onclick="window.open('${tool.url}', '_blank')"` : `onclick="showToast('${tool.name} 开发中...', 'info')"`}
                             style="cursor: ${tool.url ? 'pointer' : 'not-allowed'};">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: ${cap.color}15; color: ${cap.color}">
                                    <i class="fas fa-${tool.icon || 'tools'}"></i>
                                </div>
                                <div>
                                    <div class="font-bold text-gray-800">${tool.name}</div>
                                    <div class="text-xs text-gray-500">${tool.desc}</div>
                                    <div class="text-[10px] text-gray-400 mt-1">参数: ${tool.param}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                ${tool.url ? `
                                    <span class="text-xs px-2 py-1 rounded-full bg-green-50 text-green-600">
                                        <i class="fas fa-external-link-alt mr-1"></i>在线
                                    </span>
                                ` : `
                                    <span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400">
                                        <i class="fas fa-clock mr-1"></i>待接入
                                    </span>
                                `}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="p-4 border-t border-gray-100 bg-gray-50">
                <div class="text-[10px] text-gray-400 text-center">
                    <i class="fas fa-info-circle mr-1"></i>点击工具卡片即可打开使用，外部工具将在新标签页中打开
                </div>
            </div>
        </div>
    `;
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeToolModal();
    });
    
    document.body.appendChild(modal);
}

// 关闭工具选择弹窗
function closeToolModal() {
    const modal = document.getElementById('tool-selector-modal');
    if (modal) modal.remove();
}

// 显示提示信息（简化版，如果全局不存在）
if (typeof window.showToast !== 'function') {
    window.showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `fixed top-20 right-4 px-4 py-3 rounded-lg shadow-lg z-[9999] text-sm font-medium ${
            type === 'success' ? 'bg-green-500 text-white' : 
            type === 'error' ? 'bg-red-500 text-white' : 
            'bg-indigo-500 text-white'
        }`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };
}
