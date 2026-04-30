// ===== v5.0 飞轮机制模块 (flywheel.js) =====
// 五大闭环机制，从「测算推演看盘」升级为「日常运转操作系统」
//
// ① 熔断与红线机制（L2 对 L3 硬阻断）+ 灰度让利额度
// ② 数据溯源标签（取数节点 + 可信度源头标注）
// ③ 月度复盘对撞机（实际 P&L vs 假设 UE 自动对比 = RNN 反向传播）
// ④ 执行摩擦系数（理论弹性 vs 预期真实弹性）+ 一线收入联动
// ⑤ 实验舱（门店级灰度测试 + 自动对比大盘 UE）

// ========================================================
// ① 熔断与红线机制 + 灰度让利额度
// ========================================================

const CIRCUIT_BREAKER_RULES = {
    // 硬红线：触发即锁定，必须 L2 特批
    hardRedLines: [
        { id: 'ltv_negative', label: 'LTV < 0（预计终身亏损）', field: 'ltv', operator: '<', threshold: 0, severity: 'block', approver: '城市总', color: '#7f1d1d' },
        { id: 'margin_collapse', label: '毛利率 < 5%', field: 'gross_margin', operator: '<', threshold: 5, severity: 'block', approver: '城市总', color: '#991b1b' },
        { id: 'cost_runaway', label: '造价超 GTV 的 95%', field: 'cost_to_gtv', operator: '>', threshold: 95, severity: 'block', approver: '城市总', color: '#b91c1c' },
        { id: 'vacancy_extreme', label: '空置天数 > 45天', field: 'vacancy_days', operator: '>', threshold: 45, severity: 'block', approver: '片区经理', color: '#dc2626' },
    ],
    // 软红线：触发提示警告，不锁定但记录
    softWarnings: [
        { id: 'margin_low', label: '毛利率 < 15%（低于安全线）', field: 'gross_margin', operator: '<', threshold: 15, severity: 'warn', color: '#f59e0b' },
        { id: 'payback_long', label: '回本周期 > 12月', field: 'payback_months', operator: '>', threshold: 12, severity: 'warn', color: '#f59e0b' },
        { id: 'allowance_over', label: '让利额度已用完', field: 'allowance_remaining', operator: '<=', threshold: 0, severity: 'warn', color: '#f59e0b' },
    ],
    // 灰度让利额度
    allowance: {
        perUnit: 3000,  // 每套房单均总让利额度
        label: '单均总让利额度',
        description: '前线可自由分配：免租期、设备升级、保洁补贴、押金减免等。只要整体利润不破红线，系统不干预具体分配方式。',
        usageExamples: [
            { label: '延长免租期 15 天', cost: 1800, icon: '🗓' },
            { label: '加配洗衣机', cost: 1200, icon: '🧺' },
            { label: '加配空调升级', cost: 2000, icon: '❄️' },
            { label: '保洁补贴 2 次', cost: 600, icon: '🧹' },
            { label: '押金减免 1000', cost: 1000, icon: '💰' },
            { label: '软装升级包', cost: 1500, icon: '🛋' },
        ],
    }
};

// 模拟熔断检测
function checkCircuitBreaker(dealParams) {
    const {
        gtv = 52000,
        renovationCost = 42000,
        grossMargin = 20,
        vacancyDays = 15,
        paybackMonths = 8,
        allowanceUsed = 0,
        freeRentDays = 0,
    } = dealParams;

    const costToGtv = gtv > 0 ? (renovationCost / gtv * 100) : 100;
    const serviceFee = gtv * 0.1;
    const rentPremium = gtv * 0.3 / 12 * 3;
    const totalRevenue = serviceFee + rentPremium;
    const totalCost = renovationCost * (1 - grossMargin / 100);
    const ltv = totalRevenue - totalCost - allowanceUsed;
    const allowanceRemaining = CIRCUIT_BREAKER_RULES.allowance.perUnit - allowanceUsed;

    const values = { ltv, gross_margin: grossMargin, cost_to_gtv: costToGtv, vacancy_days: vacancyDays, payback_months: paybackMonths, allowance_remaining: allowanceRemaining };
    const results = [];
    let blocked = false;

    // 检查硬红线
    CIRCUIT_BREAKER_RULES.hardRedLines.forEach(rule => {
        const val = values[rule.field];
        const triggered = rule.operator === '<' ? val < rule.threshold : val > rule.threshold;
        results.push({ ...rule, currentValue: val, triggered });
        if (triggered) blocked = true;
    });

    // 检查软警告
    CIRCUIT_BREAKER_RULES.softWarnings.forEach(rule => {
        const val = values[rule.field];
        const triggered = rule.operator === '<' ? val < rule.threshold : (rule.operator === '<=' ? val <= rule.threshold : val > rule.threshold);
        results.push({ ...rule, currentValue: val, triggered });
    });

    return { results, blocked, ltv, costToGtv, allowanceRemaining, values };
}

// ========================================================
// ② 数据溯源标签
// ========================================================

const DATA_PROVENANCE = {
    // 每个 UE 参数的取数节点和溯源信息
    gtv_per_unit: {
        label: '单套GTV',
        sourceSystem: '合同签约系统',
        sourceField: 'contract.total_amount',
        captureMethod: 'auto',
        captureNode: '合同签署时自动写入',
        verifyMethod: '与银行回款流水交叉验证',
        tamperRisk: 'low',
        tamperNote: '合同金额有双方签字+银行流水佐证，篡改成本极高',
        fidelity: 95,
        costToCapture: 5,
        icon: '🤖',
    },
    service_fee_rate: {
        label: '服务费率',
        sourceSystem: '合同签约系统',
        sourceField: 'contract.service_fee_rate',
        captureMethod: 'auto',
        captureNode: '合同模板字段，不可手动修改',
        verifyMethod: '费率 = 服务费总额 / GTV',
        tamperRisk: 'low',
        tamperNote: '费率写死在合同模板中，修改需审批',
        fidelity: 98,
        costToCapture: 2,
        icon: '🤖',
    },
    avg_rent_before: {
        label: '装修前月租',
        sourceSystem: '市场数据系统',
        sourceField: 'market.comparable_rent',
        captureMethod: 'semi-auto',
        captureNode: '系统自动抓取同小区近3月成交均价，资管可微调±10%',
        verifyMethod: '与贝壳成交数据交叉验证',
        tamperRisk: 'medium',
        tamperNote: '资管有±10%微调权限，超出需审批',
        fidelity: 82,
        costToCapture: 15,
        icon: '🔄',
    },
    avg_rent_after: {
        label: '装修后月租',
        sourceSystem: '租约系统',
        sourceField: 'lease.monthly_rent',
        captureMethod: 'auto',
        captureNode: '租约签署后自动写入',
        verifyMethod: '与租户银行转账流水交叉验证',
        tamperRisk: 'low',
        tamperNote: '出租后真实成交价，无法篡改',
        fidelity: 96,
        costToCapture: 5,
        icon: '🤖',
    },
    renovation_cost: {
        label: '装修造价',
        sourceSystem: 'SRM 供应商结算系统',
        sourceField: 'srm.settlement.actual_payment',
        captureMethod: 'auto',
        captureNode: '供应商结算单自动同步，T+1日结算数据',
        verifyMethod: '与供应商银行收款流水交叉验证',
        tamperRisk: 'low',
        tamperNote: '资金流闭环：贝壳付款 → SRM结算 → 供应商收款，篡改成本极高',
        fidelity: 92,
        costToCapture: 15,
        icon: '🤖',
    },
    material_cost_ratio: {
        label: '物料成本占比',
        sourceSystem: 'SRM 采购订单系统',
        sourceField: 'srm.procurement.material_total',
        captureMethod: 'auto',
        captureNode: '采购订单自动生成，与供应商结算自动匹配',
        verifyMethod: '采购订单金额 = 供应商结算金额 = 银行付款金额，三方对账',
        tamperRisk: 'low',
        tamperNote: 'SRM系统全程留痕：下单→收货→结算→付款，资金流完整闭环',
        fidelity: 90,
        costToCapture: 12,
        icon: '🤖',
    },
    labor_cost_ratio: {
        label: '人工成本占比',
        sourceSystem: '工人发薪结算系统',
        sourceField: 'payroll.worker_settlement.actual_payment',
        captureMethod: 'auto',
        captureNode: '工人工时自动统计 → 工资自动计算 → 银行代发',
        verifyMethod: '与工人银行卡收款流水交叉验证',
        tamperRisk: 'low',
        tamperNote: '资金闭环：系统算薪 → 银行代发 → 工人实收，数据由银行流水佐证',
        fidelity: 94,
        costToCapture: 10,
        icon: '🤖',
    },
    conversion_rate: {
        label: '推荐转化率',
        sourceSystem: '签约系统',
        sourceField: 'calculated: signs / recommendations',
        captureMethod: 'semi-auto',
        captureNode: '签约数自动（合同系统），推荐数半人工（CRM录入）',
        verifyMethod: '签约数可信，推荐数存在博弈（可能多报推荐以降低转化率预期）',
        tamperRisk: 'medium',
        tamperNote: '分子可信、分母有水分',
        fidelity: 65,
        costToCapture: 40,
        icon: '🔄',
    },
    vacancy_days: {
        label: '空置天数',
        sourceSystem: '房态管理系统',
        sourceField: 'calculated: lease.start_date - renovation.end_date',
        captureMethod: 'semi-auto',
        captureNode: '完工日期半人工（验收录入），出租日期自动（租约生效）',
        verifyMethod: '应取自：装修完工验收时间戳 → 租约生效时间戳',
        tamperRisk: 'medium',
        tamperNote: '完工日期可能提前录入以缩短账面空置',
        fidelity: 68,
        costToCapture: 50,
        icon: '🔄',
    },
    monthly_target_units: {
        label: '月签约量',
        sourceSystem: '合同签约系统',
        sourceField: 'count(contracts.month)',
        captureMethod: 'auto',
        captureNode: '每月合同签署数量自动统计',
        verifyMethod: '与财务到账数交叉验证',
        tamperRisk: 'low',
        tamperNote: '合同数可直接从签约系统 count，但注意区分有效/无效合同',
        fidelity: 90,
        costToCapture: 10,
        icon: '🤖',
    },
    standardized_ratio: {
        label: '标准化占比',
        sourceSystem: '产品分类系统',
        sourceField: 'count(standard_products) / count(all_products)',
        captureMethod: 'semi-auto',
        captureNode: '需要产品分类标签系统，当前靠人工标注',
        verifyMethod: '应与标品方案库 SKU 匹配率交叉验证',
        tamperRisk: 'medium',
        tamperNote: '标准化定义模糊时，分类结果有弹性',
        fidelity: 70,
        costToCapture: 40,
        icon: '🔄',
    },
    gross_margin: {
        label: '毛利率',
        sourceSystem: '⚠️ 计算字段',
        sourceField: 'calculated: (revenue - cost) / revenue',
        captureMethod: 'calculated',
        captureNode: '依赖收入和成本两个输入的准确性',
        verifyMethod: '收入端可信（合同+流水），成本端不可信（手工填报）→ 毛利率整体可信度取决于短板',
        tamperRisk: 'high',
        tamperNote: '分子可信、分母不可信 → 计算结果不可信',
        fidelity: 55,
        costToCapture: 85,
        icon: '⚠️',
        recommendedSource: '全部用资金流反推：银行回款 - 供应链付款 = 真实毛利',
    },
};

// ========================================================
// ③ 月度复盘对撞机（RNN 反向传播）
// ========================================================

// 模拟月度实际数据（实际部署时从财务系统 API 拉取）
const MONTHLY_ACTUAL_DATA = {
    '2026-01': {
        month: '2026-01', label: '1月',
        actual: { revenue_per_unit: 15200, gross_profit: 2800, renovation_cost: 43500, vacancy_days: 18, conversion_rate: 32, monthly_units: 105, gross_margin: 18.4 },
        forecast: { revenue_per_unit: 15800, gross_profit: 3160, renovation_cost: 42000, vacancy_days: 15, conversion_rate: 35, monthly_units: 120, gross_margin: 20 },
    },
    '2026-02': {
        month: '2026-02', label: '2月',
        actual: { revenue_per_unit: 14800, gross_profit: 2500, renovation_cost: 44200, vacancy_days: 20, conversion_rate: 30, monthly_units: 88, gross_margin: 16.9 },
        forecast: { revenue_per_unit: 15800, gross_profit: 3160, renovation_cost: 42000, vacancy_days: 15, conversion_rate: 35, monthly_units: 120, gross_margin: 20 },
    },
    '2026-03': {
        month: '2026-03', label: '3月(预)',
        actual: null, // 本月尚未出
        forecast: { revenue_per_unit: 16200, gross_profit: 3400, renovation_cost: 41000, vacancy_days: 13, conversion_rate: 37, monthly_units: 130, gross_margin: 21 },
    }
};

function calculateCollisionReport(monthKey) {
    const data = MONTHLY_ACTUAL_DATA[monthKey];
    if (!data || !data.actual) return null;

    const { actual, forecast } = data;
    const fields = Object.keys(forecast);
    const collisions = [];

    fields.forEach(field => {
        const a = actual[field];
        const f = forecast[field];
        const delta = a - f;
        const deviationPct = f !== 0 ? ((a - f) / Math.abs(f) * 100) : 0;
        const isGoodDirection = field === 'renovation_cost' || field === 'vacancy_days' ? delta < 0 : delta > 0;
        const severity = Math.abs(deviationPct) > 20 ? 'critical' : Math.abs(deviationPct) > 10 ? 'warning' : 'ok';

        const fieldLabels = {
            revenue_per_unit: '单套收入', gross_profit: '单套利润', renovation_cost: '装修造价',
            vacancy_days: '空置天数', conversion_rate: '转化率', monthly_units: '月签约量', gross_margin: '毛利率'
        };

        collisions.push({
            field, label: fieldLabels[field] || field,
            actual: a, forecast: f, delta, deviationPct, isGoodDirection, severity,
        });
    });

    const criticalAlerts = collisions.filter(c => c.severity === 'critical');
    const overallDeviation = collisions.reduce((s, c) => s + Math.abs(c.deviationPct), 0) / collisions.length;

    return {
        month: data.month, label: data.label,
        collisions, criticalAlerts, overallDeviation,
        verdict: overallDeviation < 10 ? '模型精准' : overallDeviation < 20 ? '偏差可控' : '需要重新校准',
        verdictColor: overallDeviation < 10 ? '#10b981' : overallDeviation < 20 ? '#f59e0b' : '#ef4444',
    };
}

// ========================================================
// ④ 执行摩擦系数 + 一线收入联动
// ========================================================

// 团队历史执行兑现率（实际部署时从实验历史数据中学习）
const EXECUTION_FRICTION = {
    beijing: {
        overall: 0.65,  // 整体兑现率 65%
        byLever: {
            service_fee_rate: { friction: 0.75, note: '费率调整执行力较强，合同模板可锁定' },
            rent_premium_rate: { friction: 0.60, note: '溢价定价受市场竞争影响，一线经常打折' },
            standardized_ratio: { friction: 0.70, note: '标品推广有抗性，但产品库可强制约束' },
            renovation_cost: { friction: 0.55, note: '造价控制最难执行，工长有动机超支' },
            material_cost_ratio: { friction: 0.50, note: '物料管控依赖供应链系统，目前不完善' },
            conversion_rate: { friction: 0.60, note: '转化率提升依赖培训+激励，见效周期长' },
            vacancy_days: { friction: 0.65, note: '去化速度受市场供需影响较大' },
            monthly_target_units: { friction: 0.55, note: '签约量受组织扩张和培训进度制约' },
        },
        historySource: '基于 2025Q3-Q4 共 6 个月的假设-实际偏差统计',
    },
    shanghai: {
        overall: 0.60,
        byLever: {
            service_fee_rate: { friction: 0.70, note: '上海市场竞争更激烈，费率空间较小' },
            rent_premium_rate: { friction: 0.55, note: '租客对溢价敏感度更高' },
            standardized_ratio: { friction: 0.65, note: '上海团队对标品接受度较好' },
            renovation_cost: { friction: 0.50, note: '上海人工成本高且波动大' },
            material_cost_ratio: { friction: 0.48, note: '供应链体系在上海尚未完善' },
            conversion_rate: { friction: 0.58, note: '上海资管经验值较低' },
            vacancy_days: { friction: 0.62, note: '上海去化速度较好' },
            monthly_target_units: { friction: 0.52, note: '上海团队规模较小，产能受限' },
        },
        historySource: '基于 2025Q3-Q4 共 6 个月的假设-实际偏差统计',
    }
};

function applyFriction(leverKey, theoreticalImpact, city = 'beijing') {
    const cityData = EXECUTION_FRICTION[city] || EXECUTION_FRICTION.beijing;
    const leverData = cityData.byLever[leverKey];
    const friction = leverData ? leverData.friction : cityData.overall;
    const note = leverData ? leverData.note : '使用整体兑现率';

    return {
        theoretical: theoreticalImpact,
        friction,
        realistic: theoreticalImpact * friction,
        discount: theoreticalImpact * (1 - friction),
        note,
        frictionPct: Math.round(friction * 100),
    };
}

// 一线收入联动计算
const FRONTLINE_COMP = {
    base_salary: 8000,         // 底薪
    commission_per_unit: 800,  // 每单提成
    bonus_threshold: 4,        // 月签≥4单触发奖金
    bonus_per_extra: 500,      // 超出部分每单额外奖金
    upsell_commission_rate: 0.05, // 增值服务提成比例
};

function calculateFrontlineImpact(leverKey, adjustValue, city = 'beijing') {
    const model = AppState.baselineModels[city] || DEFAULT_BASELINES[city];
    const lever = E_LEVERS.find(l => l.key === leverKey);
    if (!lever) return null;

    // 计算杠杆调整对公司UE的影响
    const elasticity = calculateElasticity(model, lever, adjustValue);

    // 估算对一线工作量和收入的影响
    let workloadChange = 0; // 工作量变化(%)
    let incomeChange = 0;   // 收入变化(元/月)
    let incomeChangeNote = '';

    switch (leverKey) {
        case 'service_fee_rate':
            workloadChange = 5;  // 需要多跟业主解释
            incomeChange = adjustValue > 0 ? adjustValue * 80 : adjustValue * 120; // 提费后提成微增
            incomeChangeNote = adjustValue > 0 ? '费率↑→业主谈判难度↑，但单均提成基数↑' : '费率↓→成单更容易，但单均提成↓';
            break;
        case 'standardized_ratio':
            workloadChange = -10; // 标品减少沟通成本
            incomeChange = 200;   // 标品成单更快→月签量↑→总提成↑
            incomeChangeNote = '标品方案降低沟通成本，月签约量有望提升';
            break;
        case 'renovation_cost':
            workloadChange = 15;  // 需要更严格的成本管控
            incomeChange = -100;  // 控成本增加监督工作
            incomeChangeNote = '⚠️ 造价管控增加工长监督工作量，但不增加收入';
            break;
        case 'rent_premium_rate':
            workloadChange = 10;
            incomeChange = adjustValue > 0 ? -50 : 100;
            incomeChangeNote = adjustValue > 0 ? '⚠️ 溢价↑→租客抗性↑→成单周期↑，收入可能反降' : '溢价↓→快速成单，但单均收益↓';
            break;
        case 'conversion_rate':
            workloadChange = 0;
            incomeChange = adjustValue * 30;
            incomeChangeNote = '转化率提升 = 技能提升 = 单量↑ → 收入正循环';
            break;
        default:
            workloadChange = 5;
            incomeChange = 0;
            incomeChangeNote = '该杠杆对一线收入影响需进一步评估';
    }

    const monthlyIncome = FRONTLINE_COMP.base_salary + FRONTLINE_COMP.commission_per_unit * 3; // 假设月签3单
    const alignmentScore = incomeChange >= 0 ? (workloadChange <= 0 ? 'perfect' : 'acceptable') : 'conflict';

    return {
        leverKey, leverLabel: lever.label, adjustValue,
        companyImpact: { profitDelta: elasticity.profitDelta, revenueDelta: elasticity.revenueDelta },
        frontlineImpact: { workloadChange, incomeChange, incomeChangeNote, monthlyIncome, newMonthlyIncome: monthlyIncome + incomeChange },
        alignmentScore,
        alignmentLabel: alignmentScore === 'perfect' ? '✅ 利益完全对齐' : alignmentScore === 'acceptable' ? '⚠️ 可接受' : '🚨 利益冲突，大概率推不动',
        alignmentColor: alignmentScore === 'perfect' ? '#10b981' : alignmentScore === 'acceptable' ? '#f59e0b' : '#ef4444',
    };
}

// ========================================================
// ⑤ 实验舱（门店级灰度测试）
// ========================================================

const EXPERIMENT_CHAMBER = {
    stores: {
        beijing: [
            { id: 'bj_chaoyang_01', name: '朝阳CBD店', district: '朝阳', headcount: 8, monthlyUnits: 18, avgGTV: 58000 },
            { id: 'bj_haidian_01', name: '海淀上地店', district: '海淀', headcount: 6, monthlyUnits: 12, avgGTV: 48000 },
            { id: 'bj_fengtai_01', name: '丰台科技园店', district: '丰台', headcount: 5, monthlyUnits: 9, avgGTV: 42000 },
            { id: 'bj_chaoyang_02', name: '朝阳望京店', district: '朝阳', headcount: 7, monthlyUnits: 15, avgGTV: 55000 },
            { id: 'bj_xicheng_01', name: '西城金融街店', district: '西城', headcount: 4, monthlyUnits: 8, avgGTV: 62000 },
            { id: 'bj_dongcheng_01', name: '东城安定门店', district: '东城', headcount: 5, monthlyUnits: 10, avgGTV: 45000 },
        ],
        shanghai: [
            { id: 'sh_pudong_01', name: '浦东陆家嘴店', district: '浦东', headcount: 7, monthlyUnits: 14, avgGTV: 65000 },
            { id: 'sh_xuhui_01', name: '徐汇漕河泾店', district: '徐汇', headcount: 5, monthlyUnits: 10, avgGTV: 52000 },
            { id: 'sh_jing_an_01', name: '静安寺店', district: '静安', headcount: 6, monthlyUnits: 11, avgGTV: 60000 },
            { id: 'sh_minhang_01', name: '闵行莘庄店', district: '闵行', headcount: 4, monthlyUnits: 8, avgGTV: 45000 },
        ],
    }
};

if (!AppState.chamberExperiments) AppState.chamberExperiments = [];

function createChamberExperiment(params) {
    const {
        name = '',
        city = 'beijing',
        testStoreIds = [],
        leverKey = '',
        leverAdjust = 0,
        durationWeeks = 2,
        hypothesis = '',
    } = params;

    const allStores = EXPERIMENT_CHAMBER.stores[city] || [];
    const testStores = allStores.filter(s => testStoreIds.includes(s.id));
    const controlStores = allStores.filter(s => !testStoreIds.includes(s.id));

    const model = AppState.baselineModels[city] || DEFAULT_BASELINES[city];
    const lever = E_LEVERS.find(l => l.key === leverKey);
    const theoreticalImpact = lever ? calculateElasticity(model, lever, leverAdjust) : null;
    const friction = lever ? applyFriction(leverKey, theoreticalImpact?.profitDelta || 0, city) : null;
    const frontlineImpact = lever ? calculateFrontlineImpact(leverKey, leverAdjust, city) : null;

    const experiment = {
        id: 'chamber_' + Date.now(),
        name,
        city,
        testStores,
        controlStores,
        leverKey,
        leverLabel: lever?.label || leverKey,
        leverAdjust,
        durationWeeks,
        hypothesis,
        status: 'running',
        created_at: new Date().toISOString(),
        end_date: new Date(Date.now() + durationWeeks * 7 * 86400000).toISOString(),
        prediction: {
            theoretical: theoreticalImpact?.profitDelta || 0,
            friction: friction?.friction || 0.65,
            realistic: friction?.realistic || 0,
            frictionNote: friction?.note || '',
        },
        frontlineImpact,
        // 实际结果（待回填）
        actualResults: null,
    };

    AppState.chamberExperiments.push(experiment);
    return experiment;
}

// ========================================================
// 页面渲染：v5.0 飞轮机制总览
// ========================================================

function renderFlywheelPage() {
    const container = document.getElementById('flywheel-content');
    if (!container) return;

    const model = AppState.baselineModels[AppState.currentCity] || DEFAULT_BASELINES[AppState.currentCity];
    const city = AppState.currentCity;

    let html = '';

    // ===== Hero =====
    html += `<div class="bg-gradient-to-br from-gray-900 via-indigo-900 to-purple-900 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div class="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full -mr-40 -mt-40"></div>
        <div class="relative z-10">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">⚙️</div>
                <div>
                    <div class="text-xs font-bold uppercase tracking-widest text-purple-300">v5.0 Flywheel Mechanisms</div>
                    <div class="text-xl font-bold">五大飞轮机制 — 从测算推演到日常操作系统</div>
                </div>
            </div>
            <div class="grid grid-cols-5 gap-3 mt-4">
                ${[
                    { icon: '🚧', label: '熔断红线', desc: 'L2→L3 硬阻断', color: '#ef4444' },
                    { icon: '🔍', label: '数据溯源', desc: '取数节点标注', color: '#8b5cf6' },
                    { icon: '💥', label: '对撞复盘', desc: '实际vs假设', color: '#f59e0b' },
                    { icon: '🏋️', label: '摩擦系数', desc: '理论vs真实弹性', color: '#2f9668' },
                    { icon: '🧫', label: '实验舱', desc: '门店级灰度', color: '#6366f1' },
                ].map(m => `
                <div class="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-center">
                    <div class="text-2xl mb-1">${m.icon}</div>
                    <div class="text-xs font-bold">${m.label}</div>
                    <div class="text-[10px] text-gray-400">${m.desc}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;

    // ===== 机制① 熔断与红线 + 灰度让利 =====
    html += renderCircuitBreakerSection(model);

    // ===== 机制② 数据溯源 =====
    html += renderDataProvenanceSection();

    // ===== 机制③ 月度对撞机 =====
    html += renderCollisionSection();

    // ===== 机制④ 摩擦系数 + 一线收入联动 =====
    html += renderFrictionSection(model, city);

    // ===== 机制⑤ 实验舱 =====
    html += renderChamberSection(city);

    container.innerHTML = html;
}

// ===== 渲染：底线管理 + UE护栏看板（合并版） =====
function renderCircuitBreakerSection(model) {
    // 获取UE护栏数据
    const guardrails = checkGuardrails(model);
    const statusColors = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
    const statusLabels = { green: '全部达标', yellow: '部分预警', red: '有突破线' };
    const statusEmoji = { green: '✅', yellow: '⚠️', red: '🚨' };
    
    // 底线管理工具数据
    const BASELINE_TOOLS = [
        { id: 'ue_guardrail', name: 'UE护栏看板', desc: '6大关键指标实时监控与预警', level: 'P0', icon: 'shield-alt', color: '#dc2626' },
        { id: 'material_control', name: 'A类物资管控', desc: '关键材料库存/质量/供应商监控', level: 'P0', icon: 'box', color: '#dc2626' },
        { id: 'sentiment_monitor', name: '舆情监测', desc: '客户投诉/社交媒体/口碑监控', level: 'P1', icon: 'bullhorn', color: '#f59e0b' },
        { id: 'compliance_check', name: '合规检查', desc: '合同合规、用工合规、资金合规', level: 'P1', icon: 'check-double', color: '#f59e0b' }
    ];

    return `<div class="card mb-4">
        <div class="card-header bg-gradient-to-r from-red-600 to-red-700 !border-b-0">
            <h3 class="!text-white"><i class="fas fa-shield-alt mr-2"></i>① 底线管理 + UE护栏看板</h3>
            <span class="text-[10px] text-white/60">UE护栏、风险管控、合规监测 — 贯穿三层的风险防控体系</span>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-2 gap-6">
                <!-- 左：UE护栏看板（合并硬红线） -->
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <div class="text-xs font-bold text-gray-500">📊 UE护栏看板 — 6大关键指标</div>
                        <span class="text-xs font-bold" style="color:${statusColors[guardrails.overallStatus]}">${statusEmoji[guardrails.overallStatus]} ${statusLabels[guardrails.overallStatus]} · 健康度 ${guardrails.score}%</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        ${guardrails.results.map(r => {
                            // 装修造价上限特殊显示：添加每平米说明
                            const thresholdNote = r.key === 'renovationCostMax' && r.perSqm 
                                ? ` (¥${r.perSqm}/㎡)` 
                                : '';
                            // 数值显示：阈值为主，当前值在括号中
                            const displayValue = r.unit === '元' 
                                ? '¥' + formatNumber(Math.round(r.value)) + thresholdNote
                                : r.value + r.unit;
                            const currentDisplay = r.unit === '元'
                                ? '¥' + formatNumber(Math.round(r.current))
                                : r.current + r.unit;
                            return `
                        <div class="rounded-lg p-3 border-2 ${r.status === 'ok' ? 'border-green-200 bg-green-50' : r.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}">
                            <div class="flex items-center gap-1.5 mb-1">
                                <span class="text-sm">${r.icon}</span>
                                <span class="text-[10px] text-gray-500">${r.label}</span>
                            </div>
                            <div class="text-lg font-bold ${r.status === 'ok' ? 'text-green-700' : r.severity === 'critical' ? 'text-red-700' : 'text-yellow-700'}">${displayValue}</div>
                            <div class="text-[10px] ${r.status === 'ok' ? 'text-green-600' : 'text-red-500'}">${r.status === 'ok' ? '✅ 达标' : '🚨 突破'} (当前${currentDisplay})</div>
                        </div>`}).join('')}
                    </div>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div class="text-xs font-bold text-red-700 mb-1"><i class="fas fa-exclamation-circle mr-1"></i>硬红线规则</div>
                        <div class="text-[10px] text-red-600">P0级指标（毛利率、空置天数）触发即锁定合同，需城市总特批后方可继续推进。</div>
                    </div>
                </div>
                <!-- 右：底线管理工具 -->
                <div>
                    <div class="text-xs font-bold text-gray-500 mb-3">🛡️ 底线管理工具矩阵</div>
                    <div class="grid grid-cols-2 gap-3">
                        ${BASELINE_TOOLS.map(tool => `
                        <div class="bg-white rounded-xl p-3 border hover:shadow-md transition-shadow cursor-pointer" style="border-color: ${tool.color}30">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs" style="background: ${tool.color}">
                                    <i class="fas fa-${tool.icon}"></i>
                                </div>
                                <div>
                                    <div class="text-xs font-bold text-gray-800">${tool.name}</div>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded text-white" style="background: ${tool.color}">${tool.level}级风险</span>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-500">${tool.desc}</div>
                        </div>`).join('')}
                    </div>
                    <div class="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div class="text-xs font-bold text-gray-700 mb-1"><i class="fas fa-info-circle mr-1"></i>风险防控原则</div>
                        <div class="text-[10px] text-gray-600">P0级风险不可逾越，系统实时监控自动预警；P1级风险需定期审查，人工介入处理。底线管理贯穿Consumer→Server→Provider三层架构。</div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ===== 渲染：数据溯源 =====
function renderDataProvenanceSection() {
    const params = Object.entries(DATA_PROVENANCE);
    const groups = {
        auto: params.filter(([k, v]) => v.captureMethod === 'auto'),
        semi: params.filter(([k, v]) => v.captureMethod === 'semi-auto'),
        manual: params.filter(([k, v]) => v.captureMethod === 'manual' || v.captureMethod === 'calculated'),
    };

    return `<div class="card mb-4">
        <div class="card-header bg-gradient-to-r from-purple-600 to-indigo-700 !border-b-0">
            <h3 class="!text-white"><i class="fas fa-fingerprint mr-2"></i>② 数据溯源标签 — 用资金流消灭主观造假</h3>
            <span class="text-[10px] text-white/60">每个参数标注取数节点、验证方法、篡改风险</span>
        </div>
        <div class="p-5">
            <div class="overflow-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-3 py-2 text-left">参数</th>
                            <th class="px-3 py-2 text-left">取数系统</th>
                            <th class="px-3 py-2 text-left">采集方式</th>
                            <th class="px-3 py-2 text-left">验证方法</th>
                            <th class="px-3 py-2 text-center">篡改风险</th>
                            <th class="px-3 py-2 text-center">可信度</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${params.map(([key, p]) => {
                            const riskColor = p.tamperRisk === 'low' ? '#10b981' : p.tamperRisk === 'medium' ? '#f59e0b' : '#ef4444';
                            const riskLabel = p.tamperRisk === 'low' ? '低' : p.tamperRisk === 'medium' ? '中' : '高';
                            const fidColor = p.fidelity >= 80 ? '#10b981' : p.fidelity >= 60 ? '#f59e0b' : '#ef4444';
                            return `<tr class="border-t border-gray-100 hover:bg-gray-50">
                                <td class="px-3 py-2 font-medium">${p.icon} ${p.label}</td>
                                <td class="px-3 py-2 text-gray-600">${p.sourceSystem}</td>
                                <td class="px-3 py-2">
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${p.captureMethod === 'auto' ? 'bg-green-100 text-green-700' : p.captureMethod === 'semi-auto' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">
                                        ${p.captureMethod === 'auto' ? '自动' : p.captureMethod === 'semi-auto' ? '半自动' : '手工'}
                                    </span>
                                    <span class="text-[10px] text-gray-400 ml-1">${p.captureNode.slice(0, 30)}...</span>
                                </td>
                                <td class="px-3 py-2 text-gray-500 text-[10px]">${p.verifyMethod.slice(0, 40)}...</td>
                                <td class="px-3 py-2 text-center"><span class="font-bold" style="color:${riskColor}">${riskLabel}</span></td>
                                <td class="px-3 py-2 text-center"><span class="font-bold" style="color:${fidColor}">${p.fidelity}%</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                <i class="fas fa-lightbulb mr-1"></i><strong>关键原则：</strong>凡是标 ⚠️ 的参数（手工填报），其可信度评分已自动降权。系统在 Attention 矩阵和弹性分析中，均已乘以可信度系数，确保「不可信的数据不会驱动重要决策」。
                ${Object.values(DATA_PROVENANCE).some(p => p.recommendedSource) ?
                    `<br/><strong>改进建议：</strong>${Object.values(DATA_PROVENANCE).filter(p => p.recommendedSource).map(p => `${p.label} → ${p.recommendedSource}`).join('；')}` : ''}
            </div>
        </div>
    </div>`;
}

// ===== 渲染：月度对撞机 =====
function renderCollisionSection() {
    const months = Object.keys(MONTHLY_ACTUAL_DATA);
    const reports = months.map(m => ({ key: m, report: calculateCollisionReport(m), data: MONTHLY_ACTUAL_DATA[m] })).filter(r => r.report || r.data);

    return `<div class="card mb-4">
        <div class="card-header bg-gradient-to-r from-amber-500 to-orange-600 !border-b-0">
            <h3 class="!text-white"><i class="fas fa-atom mr-2"></i>③ 月度复盘对撞机 — RNN 真实反向传播</h3>
            <span class="text-[10px] text-white/60">每月将实际 P&L 拆解的「真实单套 UE」与假设 UE 重叠对比</span>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-${reports.length} gap-4">
                ${reports.map(({ key, report, data }) => {
                    if (!report) {
                        return `<div class="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300 text-center">
                            <div class="text-xs text-gray-400 font-bold mb-2">${data.label}</div>
                            <div class="text-3xl text-gray-300 mb-2">📊</div>
                            <div class="text-[10px] text-gray-400">数据尚未回收</div>
                            <div class="text-[10px] text-gray-400 mt-1">预测利润: ¥${formatNumber(Math.round(data.forecast.gross_profit))}</div>
                        </div>`;
                    }
                    return `<div class="bg-white rounded-xl p-4 border-2" style="border-color:${report.verdictColor}">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-bold text-gray-700">${report.label}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${report.verdictColor}20;color:${report.verdictColor}">${report.verdict}</span>
                        </div>
                        <div class="text-center mb-3">
                            <div class="text-2xl font-black" style="color:${report.verdictColor}">${report.overallDeviation.toFixed(1)}%</div>
                            <div class="text-[10px] text-gray-400">平均偏差</div>
                        </div>
                        <div class="space-y-1.5">
                            ${report.collisions.map(c => {
                                const arrow = c.isGoodDirection ? '↑' : '↓';
                                const color = c.severity === 'ok' ? '#10b981' : c.severity === 'warning' ? '#f59e0b' : '#ef4444';
                                return `<div class="flex items-center justify-between px-2 py-1 rounded" style="background:${color}08">
                                    <span class="text-[10px] text-gray-600">${c.label}</span>
                                    <div class="flex items-center gap-2">
                                        <span class="text-[10px] text-gray-400">${typeof c.actual === 'number' && c.field !== 'gross_margin' ? (c.actual > 1000 ? '¥' + formatNumber(Math.round(c.actual)) : c.actual) : c.actual?.toFixed?.(1) || '-'}</span>
                                        <span class="text-[10px] font-bold" style="color:${color}">${c.deviationPct >= 0 ? '+' : ''}${c.deviationPct.toFixed(1)}%</span>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                        ${report.criticalAlerts.length > 0 ? `
                        <div class="mt-2 bg-red-50 rounded-lg p-2 text-[10px] text-red-600">
                            <i class="fas fa-exclamation-circle mr-1"></i>严重偏差(>20%)：${report.criticalAlerts.map(a => a.label).join('、')}
                            <br/>→ 系统强制要求 L2 重新调整 E 杠杆策略
                        </div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>
    </div>`;
}

// ===== 渲染：摩擦系数 + 一线收入联动 =====
function renderFrictionSection(model, city) {
    const cityFriction = EXECUTION_FRICTION[city] || EXECUTION_FRICTION.beijing;
    const sensitivities = calculateAllSensitivities(model);
    const topLevers = sensitivities.slice(0, 6);

    return `<div class="card mb-4">
        <div class="card-header bg-gradient-to-r from-ke-600 to-ke-800 !border-b-0">
            <h3 class="!text-white"><i class="fas fa-weight-hanging mr-2"></i>④ 执行摩擦系数 + 一线收入联动</h3>
            <span class="text-[10px] text-white/60">理论弹性 × 历史兑现率 = 预期真实弹性 ｜ ${cityFriction.historySource}</span>
        </div>
        <div class="p-5">
            <div class="grid grid-cols-12 gap-4">
                <!-- 左：摩擦系数表 -->
                <div class="col-span-7">
                    <div class="text-xs font-bold text-gray-500 mb-2">杠杆利润影响：理论 vs 预期真实（含摩擦系数）</div>
                    <div class="space-y-2">
                        ${topLevers.map(s => {
                            const fr = applyFriction(s.lever.key, s.positiveResult.profitDelta, city);
                            const frontline = calculateFrontlineImpact(s.lever.key, s.step, city);
                            return `<div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-800">${s.lever.label}</span>
                                        <span class="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">${s.lever.group}</span>
                                    </div>
                                    <span class="text-[10px] text-gray-400">兑现率 <span class="font-bold" style="color:${fr.friction >= 0.7 ? '#10b981' : fr.friction >= 0.55 ? '#f59e0b' : '#ef4444'}">${fr.frictionPct}%</span></span>
                                </div>
                                <div class="flex items-center gap-2 mb-1">
                                    <div class="flex-1">
                                        <div class="flex items-center justify-between text-[10px] mb-0.5">
                                            <span class="text-gray-400">理论</span>
                                            <span class="text-gray-600">¥${formatNumber(Math.round(fr.theoretical))}</span>
                                        </div>
                                        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div class="h-full bg-blue-400 rounded-full" style="width:100%"></div>
                                        </div>
                                    </div>
                                    <div class="text-gray-300">→</div>
                                    <div class="flex-1">
                                        <div class="flex items-center justify-between text-[10px] mb-0.5">
                                            <span class="text-gray-400">预期真实</span>
                                            <span class="font-bold text-ke-600">¥${formatNumber(Math.round(fr.realistic))}</span>
                                        </div>
                                        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div class="h-full bg-ke-500 rounded-full" style="width:${fr.frictionPct}%"></div>
                                        </div>
                                    </div>
                                </div>
                                ${frontline ? `<div class="flex items-center justify-between mt-1 pt-1 border-t border-gray-200">
                                    <span class="text-[10px] text-gray-400">${frontline.frontlineImpact.incomeChangeNote.slice(0, 40)}</span>
                                    <span class="text-[10px] font-bold" style="color:${frontline.alignmentColor}">${frontline.alignmentLabel}</span>
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                <!-- 右：一线收入联动 -->
                <div class="col-span-5">
                    <div class="text-xs font-bold text-gray-500 mb-2">💰 一线人员单月收入联动模拟</div>
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
                        <div class="text-center mb-2">
                            <div class="text-[10px] text-blue-500">当前月均收入（3单/月）</div>
                            <div class="text-2xl font-black text-blue-700">¥${formatNumber(FRONTLINE_COMP.base_salary + FRONTLINE_COMP.commission_per_unit * 3)}</div>
                            <div class="text-[10px] text-blue-400">底薪 ¥${formatNumber(FRONTLINE_COMP.base_salary)} + 提成 ¥${formatNumber(FRONTLINE_COMP.commission_per_unit * 3)}</div>
                        </div>
                    </div>
                    <div class="text-xs font-bold text-gray-500 mb-2">各杠杆对一线收入的影响</div>
                    <div class="space-y-1.5">
                        ${topLevers.slice(0, 5).map(s => {
                            const fl = calculateFrontlineImpact(s.lever.key, s.step, city);
                            if (!fl) return '';
                            return `<div class="flex items-center justify-between px-3 py-2 rounded-lg border" style="border-color:${fl.alignmentColor}40;background:${fl.alignmentColor}08">
                                <div>
                                    <div class="text-[10px] font-medium text-gray-700">${s.lever.label}</div>
                                    <div class="text-[10px] text-gray-400">工作量 ${fl.frontlineImpact.workloadChange >= 0 ? '+' : ''}${fl.frontlineImpact.workloadChange}%</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-xs font-bold" style="color:${fl.alignmentColor}">${fl.frontlineImpact.incomeChange >= 0 ? '+' : ''}¥${formatNumber(fl.frontlineImpact.incomeChange)}</div>
                                    <div class="text-[10px]" style="color:${fl.alignmentColor}">${fl.alignmentLabel.replace(/[✅⚠️🚨]\s?/, '')}</div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="mt-3 bg-red-50 border border-red-200 rounded-lg p-2 text-[10px] text-red-600">
                        <i class="fas fa-exclamation-triangle mr-1"></i><strong>利益对齐原则：</strong>任何 E 杠杆调整，如果导致一线收入下降且工作量增加（🚨），该策略大概率因一线阻力而失效。系统会在推演时直接高亮警告。
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ===== 渲染：实验舱 =====
function renderChamberSection(city) {
    const stores = EXPERIMENT_CHAMBER.stores[city] || [];
    const experiments = AppState.chamberExperiments.filter(e => e.city === city);

    return `<div class="card mb-4">
        <div class="card-header bg-gradient-to-r from-indigo-600 to-violet-700 !border-b-0">
            <h3 class="!text-white"><i class="fas fa-flask mr-2"></i>⑤ 实验舱 — 门店级灰度测试</h3>
            <span class="text-[10px] text-white/60">选 N 个门店上线新策略，跑 2 周，自动对比大盘 UE</span>
        </div>
        <div class="p-5">
            <!-- 门店列表 -->
            <div class="text-xs font-bold text-gray-500 mb-2">${city === 'beijing' ? '北京' : '上海'}门店（${stores.length} 家）</div>
            <div class="grid grid-cols-3 gap-2 mb-4">
                ${stores.map(s => `
                <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">${s.name.slice(0, 1)}</div>
                    <div class="flex-1">
                        <div class="text-xs font-medium text-gray-700">${s.name}</div>
                        <div class="text-[10px] text-gray-400">${s.headcount}人 · ${s.monthlyUnits}单/月 · GTV ¥${formatNumber(s.avgGTV)}</div>
                    </div>
                </div>`).join('')}
            </div>
            <!-- 实验列表 -->
            <div class="text-xs font-bold text-gray-500 mb-2">实验记录</div>
            ${experiments.length === 0 ? `
            <div class="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <div class="text-3xl mb-2">🧫</div>
                <div class="text-sm text-gray-400">暂无门店级实验</div>
                <div class="text-[10px] text-gray-300 mt-1">在"战略对齐"页面新建实验时，选择"阶梯投放"类型可指定门店</div>
            </div>` : experiments.map(exp => `
            <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-2">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-bold text-gray-800">${exp.name}</span>
                    <span class="text-[10px] bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">${exp.status}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-[10px]">
                    <div class="bg-white rounded-lg p-2">
                        <div class="text-gray-400">实验门店</div>
                        <div class="font-medium">${exp.testStores.map(s => s.name).join('、')}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2">
                        <div class="text-gray-400">理论利润影响</div>
                        <div class="font-bold text-blue-600">¥${formatNumber(Math.round(exp.prediction.theoretical))}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2">
                        <div class="text-gray-400">预期真实影响(×${(exp.prediction.friction * 100).toFixed(0)}%)</div>
                        <div class="font-bold text-ke-600">¥${formatNumber(Math.round(exp.prediction.realistic))}</div>
                    </div>
                </div>
            </div>`).join('')}
            <div class="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-700">
                <i class="fas fa-info-circle mr-1"></i><strong>实验舱逻辑：</strong>选 3 个门店上线新策略 → 跑 2 周 → 系统自动对比这 3 个店的「真实 UE」与「大盘 UE」→ 用真实财务数据验证「人的主观能动性」在该策略下是积极还是消极 → 验证成功再全盘推广。
            </div>
        </div>
    </div>`;
}
