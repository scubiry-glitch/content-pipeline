// ===== U维度分析模块 v2.2 — 真实数据驱动 + 0922报告融合 =====
// "U" = Unit Economics 的计量单位
// 四个U维度：房(套)、漏斗(单)、业主(客)、美租顾问(人)
// v2.2: 三方共赢指数用A+B加权溢价率、装租比基准15-18、漏斗加圈盘上游+分层
//        资管→美租顾问、租期18月/续租率70%（来源0922报告）

// ========== 漏斗数据（来源：业务看板CSV 2024.10–2026.03） ==========
// 取最近3个月(2025.12–2026.02)均值
const FUNNEL_DATA = {
    beijing: {
        push_to_survey_rate: 0.00307,       // 推房→量房商机率 ~0.31%
        survey_to_sign_rate: 0.754,          // 量房→焕新签约率 ~75.4%
        push_to_effective_rate: 0.00186,     // 推房→有效率 ~0.186%
        sign_to_effective_rate: 0.962,       // 焕新签约→有效率 ~96.2%
        trend: 'stable',
        latest_month: '2026-03',
        monthly_data: [
            { month: '2024-10', push_survey: 0.000512, survey_sign: 0.694, push_eff: 0.000356, sign_eff: 1.0 },
            { month: '2024-11', push_survey: 0.000846, survey_sign: 0.661, push_eff: 0.000559, sign_eff: 1.0 },
            { month: '2024-12', push_survey: 0.001582, survey_sign: 0.755, push_eff: 0.001195, sign_eff: 1.0 },
            { month: '2025-01', push_survey: 0.002136, survey_sign: 0.738, push_eff: 0.001576, sign_eff: 1.0 },
            { month: '2025-02', push_survey: 0.004511, survey_sign: 0.678, push_eff: 0.003058, sign_eff: 1.0 },
            { month: '2025-03', push_survey: 0.009084, survey_sign: 0.748, push_eff: 0.006798, sign_eff: 1.0 },
            { month: '2025-04', push_survey: 0.009074, survey_sign: 0.784, push_eff: 0.007111, sign_eff: 1.0 },
            { month: '2025-05', push_survey: 0.007782, survey_sign: 0.761, push_eff: 0.005918, sign_eff: 1.0 },
            { month: '2025-06', push_survey: 0.006204, survey_sign: 0.740, push_eff: 0.004591, sign_eff: 1.0 },
            { month: '2025-07', push_survey: 0.005244, survey_sign: 0.736, push_eff: 0.003859, sign_eff: 1.0 },
            { month: '2025-08', push_survey: 0.004955, survey_sign: 0.742, push_eff: 0.003677, sign_eff: 1.0 },
            { month: '2025-09', push_survey: 0.004867, survey_sign: 0.773, push_eff: 0.003762, sign_eff: 1.0 },
            { month: '2025-10', push_survey: 0.005589, survey_sign: 0.736, push_eff: 0.004102, sign_eff: 0.997 },
            { month: '2025-11', push_survey: 0.005098, survey_sign: 0.727, push_eff: 0.003694, sign_eff: 0.996 },
            { month: '2025-12', push_survey: 0.004349, survey_sign: 0.640, push_eff: 0.002746, sign_eff: 0.986 },
            { month: '2026-01', push_survey: 0.002891, survey_sign: 0.718, push_eff: 0.001982, sign_eff: 0.955 },
            { month: '2026-02', push_survey: 0.001872, survey_sign: 0.737, push_eff: 0.001305, sign_eff: 0.945 },
            { month: '2026-03', push_survey: 0.001977, survey_sign: 0.779, push_eff: 0.001338, sign_eff: 0.868 },
        ]
    },
    shanghai: {
        push_to_survey_rate: 0.00649,       // 推房→量房商机率 ~0.65%
        survey_to_sign_rate: 0.675,          // 量房→焕新签约率 ~67.5%
        push_to_effective_rate: 0.00360,     // 推房→有效率 ~0.36%
        sign_to_effective_rate: 0.956,       // 焕新签约→有效率 ~95.6%
        trend: 'up',
        latest_month: '2026-03',
        monthly_data: [
            { month: '2024-10', push_survey: 0.001484, survey_sign: 0.489, push_eff: 0.000624, sign_eff: 0.860 },
            { month: '2024-11', push_survey: 0.006328, survey_sign: 0.510, push_eff: 0.002826, sign_eff: 0.876 },
            { month: '2024-12', push_survey: 0.008432, survey_sign: 0.699, push_eff: 0.005593, sign_eff: 0.949 },
            { month: '2025-01', push_survey: 0.005064, survey_sign: 0.774, push_eff: 0.003791, sign_eff: 0.967 },
            { month: '2025-02', push_survey: 0.005868, survey_sign: 0.770, push_eff: 0.004397, sign_eff: 0.973 },
            { month: '2025-03', push_survey: 0.006450, survey_sign: 0.740, push_eff: 0.004657, sign_eff: 0.975 },
            { month: '2025-04', push_survey: 0.007132, survey_sign: 0.751, push_eff: 0.005188, sign_eff: 0.969 },
            { month: '2025-05', push_survey: 0.008132, survey_sign: 0.658, push_eff: 0.005266, sign_eff: 0.984 },
            { month: '2025-06', push_survey: 0.006907, survey_sign: 0.607, push_eff: 0.003994, sign_eff: 0.953 },
            { month: '2025-07', push_survey: 0.009264, survey_sign: 0.514, push_eff: 0.004470, sign_eff: 0.938 },
            { month: '2025-08', push_survey: 0.015162, survey_sign: 0.302, push_eff: 0.004437, sign_eff: 0.970 },
            { month: '2025-09', push_survey: 0.015761, survey_sign: 0.322, push_eff: 0.004889, sign_eff: 0.963 },
            { month: '2025-10', push_survey: 0.017728, survey_sign: 0.396, push_eff: 0.006726, sign_eff: 0.959 },
            { month: '2025-11', push_survey: 0.013287, survey_sign: 0.459, push_eff: 0.005611, sign_eff: 0.920 },
            { month: '2025-12', push_survey: 0.008380, survey_sign: 0.595, push_eff: 0.004799, sign_eff: 0.962 },
            { month: '2026-01', push_survey: 0.006673, survey_sign: 0.620, push_eff: 0.003983, sign_eff: 0.963 },
            { month: '2026-02', push_survey: 0.004458, survey_sign: 0.785, push_eff: 0.003307, sign_eff: 0.945 },
            { month: '2026-03', push_survey: 0.004346, survey_sign: 0.622, push_eff: 0.002544, sign_eff: 0.941 },
        ]
    },
};

// ========== 补充业务参数（用户确认的真实值 + 标注假设） ==========
const U_BIZ_PARAMS = {
    beijing: {
        cac_channel_cost: 1920,          // CAC = 渠道提点(真实)
        cac_extra_online: 2000,          // 线上额外投放(真实)
        online_lead_ratio: 0.05,         // 线上占比 5%(真实)
        cancel_rate: 0.03,               // 退单率 3%(真实)
        bad_debt_rate: 0.015,            // 坏账率 1.5%(真实)
        referral_rate: 0.15,             // 转介绍率 15%(真实)
        repeat_rate: 0.08,               // ⚠️ 假设：复购率 8%
        upsell_rate: 0,                  // 增值服务：暂无(真实)
        nps_score: null,                 // NPS：无数据
        avg_lease_months: 12,            // 平均租期(真实)
        // ===== 美租顾问运营指标(v2.2 来源:0922报告) =====
        rework_rate: 0.072,              // 0922报告：中退率7.2%(含返修上界)
        ontime_delivery_rate: 0.82,      // ⚠️ 假设：如期交付率82%
        avg_lease_months_actual: 18,     // 0922报告：美租整装平均租期18月(vs仅托管10月)
        renewal_rate: 0.70,              // 0922报告：美租整装续租率70%(vs仅托管55%)
    },
    shanghai: {
        cac_channel_cost: 7020,          // CAC = 渠道提点(真实)
        cac_extra_online: 2000,          // ⚠️ 假设与北京相同
        online_lead_ratio: 0.05,         // ⚠️ 假设与北京相同
        cancel_rate: 0.03,
        bad_debt_rate: 0.015,
        referral_rate: 0.15,
        repeat_rate: 0.08,
        upsell_rate: 0,
        nps_score: null,
        avg_lease_months: 12,
        // ===== 美租顾问运营指标(v2.2 来源:0922报告) =====
        rework_rate: 0.05,               // 上海标准化品控较好
        ontime_delivery_rate: 0.88,      // ⚠️ 假设：如期交付率88%
        avg_lease_months_actual: 18,     // 0922报告：美租整装平均租期18月
        renewal_rate: 0.70,              // 0922报告：美租整装续租率70%
    }
};

// ========== U维度参数定义 v2.2（四维度+0922报告融合） ==========
// 房(套)=产品力+三方共赢指数(A+B加权溢价率)  漏斗(单)=圈盘→推房→量房→签约→有效(+分层)
// 业主(客)=LTV/CAC+转介绍  美租顾问(人)=人效+租期18月+续租率70%
// overrides: { beikeModel, ownerModel, supplierModel } — 可选，用于交叉分析微调
function buildUDimensionParams(city, overrides) {
    const ov = overrides || {};
    const bm = ov.beikeModel || DEFAULT_BEIKE_MODELS[city]?.standard || DEFAULT_BEIKE_MODELS.beijing.standard;
    const om = ov.ownerModel  || DEFAULT_OWNER_MODELS[city]?.standard || DEFAULT_OWNER_MODELS.beijing.standard;
    const sm = ov.supplierModel || DEFAULT_SUPPLIER_MODELS.standard;
    const team = TEAM_STRUCTURE[city] || TEAM_STRUCTURE.beijing;
    const funnel = FUNNEL_DATA[city] || FUNNEL_DATA.beijing;
    const biz = U_BIZ_PARAMS[city] || U_BIZ_PARAMS.beijing;
    const scale = AppState.scaleParams[city] || AppState.scaleParams.beijing;
    // 0922报告数据
    const rpt = typeof REPORT_0922 !== 'undefined' ? REPORT_0922 : null;
    const advisorData = rpt?.advisor_metrics || null;

    return {
        // ===== 1. 房(套)维度 — 产品力 + 三方共赢指数(A+B加权溢价率) =====
        unit: {
            label: '房(套)', icon: 'home', color: '#6366f1',
            desc: '产品力 · 三方共赢指数 = 装租比 + 溢价率(A+B加权) + 招租成功率 + 返修率 + 如期交付率',
            params: {
                gtv_per_unit:         { label: '单套GTV', value: bm.gtv_per_unit, unit: '元', min: 20000, max: 200000, step: 5000 },
                rent_after:           { label: '装修后月租', value: om.avg_rent_after, unit: '元/月', min: 3000, max: 20000, step: 100 },
                rent_before:          { label: '装修前月租', value: om.avg_rent_before, unit: '元/月', min: 2000, max: 15000, step: 100 },
                commission_rate:      { label: '贝壳提点率', value: bm.commission_rate, unit: '%', min: 5, max: 30, step: 0.5 },
                rental_success_rate:  { label: '招租成功率', value: bm.rental_success_rate, unit: '%', min: 50, max: 100, step: 1 },
                rework_rate:          { label: '返修率(中退率)', value: biz.rework_rate * 100, unit: '%', min: 0, max: 30, step: 1, tag: rpt ? '📊' : '⚠️' },
                ontime_delivery_rate: { label: '如期交付率', value: biz.ontime_delivery_rate * 100, unit: '%', min: 50, max: 100, step: 1, tag: '⚠️' },
                supplier_cost:        { label: '供应商成本', value: sm.total_cost, unit: '元', min: 20000, max: 80000, step: 1000 },
                // 0922报告：装租比月度均值17.9 (品牌化≥1000/㎡口径)
                report_renov_to_rent: { label: '📊 装租比(报告口径)', value: rpt ? rpt.renovation_to_rent.avg_1_to_8 : 17.9, unit: '月', min: 8, max: 30, step: 0.5, tag: '📊' },
                // 0922报告：溢价率口径B (vs省心租) 4.17%
                report_premium_b:     { label: '📊 溢价率B(vs省心租)', value: rpt ? rpt.premium.relative.overall : 4.17, unit: '%', min: 0, max: 30, step: 0.5, tag: '📊' },
            }
        },
        // ===== 2. 漏斗(单)维度 — 圈盘→推房→量房→签约→有效(+分层) =====
        order: {
            label: '漏斗(单)', icon: 'filter', color: '#2f9668',
            desc: '全链路转化效率 · 圈盘→推房→量房→签约→有效签约→(退房) · 分层：聚焦盘 vs 全量',
            params: {
                // 新增：圈盘为漏斗最上游
                focus_push_eff:     { label: '🎯 聚焦盘推房有效率', value: rpt ? rpt.focus_criteria.target_conversion : 1.0, unit: '%', min: 0, max: 3, step: 0.1, tag: '📊' },
                push_to_survey:     { label: '全量推房→量房率', value: parseFloat((funnel.push_to_survey_rate * 100).toFixed(3)), unit: '%', min: 0, max: 5, step: 0.01 },
                survey_to_sign:     { label: '量房→签约率', value: parseFloat((funnel.survey_to_sign_rate * 100).toFixed(1)), unit: '%', min: 10, max: 100, step: 1 },
                sign_to_effective:  { label: '签约→有效率', value: parseFloat((funnel.sign_to_effective_rate * 100).toFixed(1)), unit: '%', min: 50, max: 100, step: 1 },
                cancel_rate:        { label: '退单率', value: biz.cancel_rate * 100, unit: '%', min: 0, max: 15, step: 0.5 },
                mid_term_rate:      { label: '中退率', value: rpt ? rpt.quality.mid_termination_rate : 7.2, unit: '%', min: 0, max: 20, step: 0.5, tag: '📊' },
                bad_debt_rate:      { label: '坏账率', value: biz.bad_debt_rate * 100, unit: '%', min: 0, max: 10, step: 0.5 },
                monthly_orders:     { label: '月签约量', value: scale.standard.monthlyUnits, unit: '单', min: 10, max: 2000, step: 10 },
                cac_per_order:      { label: '每单CAC', value: biz.cac_channel_cost, unit: '元', min: 0, max: 20000, step: 200 },
            }
        },
        // ===== 3. 业主(客)维度 — LTV/CAC + 转介绍 =====
        customer: {
            label: '业主(客)', icon: 'user-tie', color: '#f59e0b',
            desc: '客户价值 · LTV/CAC比值 + 转介绍率 + 装修/租金倍数',
            params: {
                cac:              { label: 'CAC(渠道提点)', value: biz.cac_channel_cost, unit: '元', min: 500, max: 20000, step: 200 },
                online_extra:     { label: '线上投放额外', value: biz.cac_extra_online, unit: '元', min: 0, max: 10000, step: 200, tag: '⚠️' },
                referral_rate:    { label: '转介绍率', value: biz.referral_rate * 100, unit: '%', min: 0, max: 50, step: 1 },
                repeat_rate:      { label: '复购率', value: biz.repeat_rate * 100, unit: '%', min: 0, max: 40, step: 1, tag: '⚠️' },
                renovation_total: { label: '装修总款(GTV)', value: om.renovation_total, unit: '元', min: 20000, max: 200000, step: 5000 },
                full_month_rent:  { label: '全月租金', value: om.avg_rent_after, unit: '元/月', min: 3000, max: 20000, step: 100 },
                rent_premium:     { label: '月租金溢价', value: om.rent_premium, unit: '元/月', min: 0, max: 5000, step: 100 },
            }
        },
        // ===== 4. 美租顾问(人)维度 — 人效 + 平均租期18月 + 续租率70% =====
        staff: {
            label: '美租顾问(人)', icon: 'user-shield', color: '#ec4899',
            desc: '人效产出 · 人均签约 + 平均租期(18月vs仅托管10月) + 续租率(70%vs55%) + 流失影响',
            params: {
                total_staff:          { label: '团队人数', value: team.h2_headcount, unit: '人', min: 5, max: 200, step: 1 },
                avg_salary:           { label: '平均薪资', value: team.avg_salary, unit: '元', min: 10000, max: 60000, step: 1000 },
                monthly_units_total:  { label: '团队月总签约', value: scale.standard.monthlyUnits, unit: '单', min: 10, max: 2000, step: 10 },
                revenue_per_unit:     { label: '单均净收入', value: bm.net_revenue, unit: '元', min: 1000, max: 50000, step: 500 },
                channel_cost_unit:    { label: '单均渠道成本', value: bm.channel_cost, unit: '元', min: 0, max: 20000, step: 200 },
                hr_cost_per_unit:     { label: '单均人力摊销', value: team.hr_cost_per_unit, unit: '元', min: 0, max: 20000, step: 200 },
                avg_lease_months:     { label: '美租平均租期', value: advisorData ? advisorData.lease_term.meizu : biz.avg_lease_months_actual, unit: '月', min: 3, max: 36, step: 1, tag: '📊' },
                plain_lease_months:   { label: '仅托管平均租期', value: advisorData ? advisorData.lease_term.plain_hosting : 10, unit: '月', min: 3, max: 24, step: 1, tag: '📊' },
                renewal_rate:         { label: '美租续租率', value: advisorData ? advisorData.renewal_rate.meizu : biz.renewal_rate * 100, unit: '%', min: 0, max: 100, step: 5, tag: '📊' },
                plain_renewal_rate:   { label: '仅托管续租率', value: advisorData ? advisorData.renewal_rate.plain_hosting : 55, unit: '%', min: 0, max: 100, step: 5, tag: '📊' },
                turnover_rate:        { label: '年流失率', value: 25, unit: '%', min: 0, max: 60, step: 5, tag: '⚠️' },
            }
        }
    };
}

// 当前城市的参数缓存
let _uDimParams = null;
function getUDimParams() {
    if (!_uDimParams) _uDimParams = buildUDimensionParams(AppState.currentCity);
    return _uDimParams;
}

// ========== U维度计算引擎 v2.2（0922报告融合+A/B溢价加权+圈盘漏斗+美租顾问） ==========
// 房(套)=产品力+三方共赢指数(A+B加权)  漏斗(单)=圈盘→推房→量房→签约→有效(+分层)
// 业主(客)=LTV/CAC  美租顾问(人)=人效+租期18月+续租率70%
function calculateAllUDimensions(overrides) {
    const city = AppState.currentCity;
    const prod = AppState.currentProduct;
    const ov = overrides || {};
    const p = ov.beikeModel ? buildUDimensionParams(city, ov) : getUDimParams();
    const bm = ov.beikeModel || DEFAULT_BEIKE_MODELS[city]?.[prod] || DEFAULT_BEIKE_MODELS.beijing.standard;
    const om = ov.ownerModel  || DEFAULT_OWNER_MODELS[city]?.[prod] || DEFAULT_OWNER_MODELS.beijing.standard;
    const sm = ov.supplierModel || DEFAULT_SUPPLIER_MODELS.standard;
    const team = TEAM_STRUCTURE[city] || TEAM_STRUCTURE.beijing;
    const funnel = FUNNEL_DATA[city] || FUNNEL_DATA.beijing;
    const biz = U_BIZ_PARAMS[city] || U_BIZ_PARAMS.beijing;
    const ue = calculateBeikeUE(bm);
    const oue = calculateOwnerUE(om);
    const sue = calculateSupplierUE(sm);
    // 0922报告
    const rpt = typeof REPORT_0922 !== 'undefined' ? REPORT_0922 : null;

    const dims = {};

    // ╔══════════════════════════════════════════════════════════════╗
    // ║  1. 房(套)维度 — 产品力 + 三方共赢指数(A+B加权溢价率)         ║
    // ║  装租比基准15-18月  溢价率=60%×口径A + 40%×口径B              ║
    // ╚══════════════════════════════════════════════════════════════╝
    const up = p.unit.params;
    const gtv = up.gtv_per_unit.value;
    const rentAfter = up.rent_after.value;
    const rentBefore = up.rent_before.value;
    const commRate = up.commission_rate.value;
    const supplierCost = up.supplier_cost.value;

    // 三方共赢指数 — 6项子指标（含双口径溢价率）
    const renovToRentSystem = rentAfter > 0 ? (gtv / rentAfter) : 999;    // 系统口径装租比
    const reportRenovToRent = up.report_renov_to_rent?.value || 17.9;      // 报告口径装租比
    const premiumRateA = rentBefore > 0 ? ((rentAfter - rentBefore) / rentBefore * 100) : 0;  // 口径A：装修前后
    const premiumRateB = up.report_premium_b?.value || 4.17;               // 口径B：vs省心租
    const rentalSuccessRate = up.rental_success_rate.value;
    const reworkRate = up.rework_rate.value;
    const ontimeDeliveryRate = up.ontime_delivery_rate.value;

    // 溢价率加权：60%×A + 40%×B（用户确认方案）
    const weightedPremiumRate = premiumRateA * 0.6 + premiumRateB * 0.4;

    const netRev = gtv * (commRate / 100);
    const premium = rentAfter - rentBefore;
    const payback = premium > 0 ? Math.ceil(gtv / premium) : 999;

    // 装租比评分：基准区间15-18月为满分，超出递减
    // 报告口径装租比 (月) — 15为100分，18为80分，25为0分
    const renovScore = reportRenovToRent <= 15 ? 100 :
                       reportRenovToRent <= 18 ? Math.round(100 - (reportRenovToRent - 15) / 3 * 20) :
                       Math.max(0, Math.round(80 - (reportRenovToRent - 18) / 7 * 80));
    // 加权溢价率评分：20%为满分(0-40%映射到0-100)
    const premiumScore = Math.min(100, Math.max(0, weightedPremiumRate / 40 * 100));
    // 招租成功率：50%-100%映射到0-100分
    const rentalSuccessScore = Math.min(100, Math.max(0, (rentalSuccessRate - 50) * 2));
    // 返修率(中退率)：越低越好 0%-20%映射到100-0
    const reworkScore = Math.min(100, Math.max(0, (20 - reworkRate) / 20 * 100));
    // 如期交付率：50%-100%映射到0-100
    const ontimeScore = Math.min(100, Math.max(0, (ontimeDeliveryRate - 50) * 2));

    // 三方共赢指数 = 加权
    const winWinIndex = Math.round(
        renovScore * 0.25 +
        premiumScore * 0.20 +
        rentalSuccessScore * 0.20 +
        reworkScore * 0.20 +
        ontimeScore * 0.15
    );

    dims.unit = {
        label: '房(套)', icon: 'home', color: '#6366f1',
        desc: '产品力 — 三方共赢指数(A+B加权)',
        monthlyVolume: bm.monthly_target_units,
        monthlyRevenue: bm.monthly_target_units * netRev,
        revenuePerUnit: netRev,
        costPerUnit: ue.channelCost + ue.expenseTotal,
        profitPerUnit: ue.operatingProfit,
        roi: (ue.channelCost + ue.expenseTotal) > 0 ? (ue.operatingProfit / (ue.channelCost + ue.expenseTotal) * 100) : 0,
        conversionRate: rentalSuccessRate,
        efficiency: renovToRentSystem,
        highlight: winWinIndex >= 60 ? '三方共赢' : winWinIndex >= 40 ? '部分失衡' : '需重构',
        winWinIndex,
        details: [
            { label: '【⭐ 三方共赢指数】', value: '', unit: '', isSeparator: true },
            { label: '综合共赢指数', value: winWinIndex, unit: '分(满100)', important: true },
            { label: '📊 装租比(报告口径)', value: reportRenovToRent.toFixed(1), unit: `月 (${renovScore}分) 基准15-18`, important: true, tag: '📊' },
            { label: '装租比(系统口径GTV÷月租)', value: renovToRentSystem.toFixed(1), unit: 'x' },
            { label: '加权溢价率(60%A+40%B)', value: weightedPremiumRate.toFixed(1), unit: `% (${premiumScore.toFixed(0)}分)`, important: true },
            { label: '├ 口径A(装修前后)', value: premiumRateA.toFixed(1), unit: '%' },
            { label: '├ 口径B(vs省心租)', value: premiumRateB.toFixed(1), unit: '%', tag: '📊' },
            { label: '招租成功率', value: rentalSuccessRate.toFixed(0), unit: `% (${rentalSuccessScore.toFixed(0)}分)` },
            { label: '返修率(中退率)', value: reworkRate.toFixed(1), unit: `% (${reworkScore.toFixed(0)}分)`, tag: rpt ? '📊' : '⚠️' },
            { label: '如期交付率', value: ontimeDeliveryRate.toFixed(0), unit: `% (${ontimeScore.toFixed(0)}分)`, tag: '⚠️' },
            { label: '【贝壳视角】', value: '', unit: '', isSeparator: true },
            { label: '单套GTV', value: gtv, unit: '元' },
            { label: '提点率', value: commRate, unit: '%' },
            { label: '净收入', value: Math.round(netRev), unit: '元', important: true },
            { label: '运营利润', value: Math.round(ue.operatingProfit), unit: '元' },
            { label: '利润率', value: ue.profitMargin.toFixed(1), unit: '%' },
            { label: '【业主视角】', value: '', unit: '', isSeparator: true },
            { label: '装修前→后月租', value: `${formatNumber(rentBefore)} → ${formatNumber(rentAfter)}`, unit: '元/月' },
            { label: '溢价回本', value: payback, unit: '月' },
            { label: '【供应商视角】', value: '', unit: '', isSeparator: true },
            { label: '供应商成本', value: Math.round(supplierCost), unit: '元' },
            { label: '工长(最大项)', value: sm.foreman, unit: `元(${sm.foreman_pct}%)` },
        ],
        score: winWinIndex
    };

    // ╔══════════════════════════════════════════════════════════════╗
    // ║  2. 漏斗(单)维度 — 圈盘→推房→量房→签约→有效→(中退)           ║
    // ║  新增：圈盘(聚焦盘)为最上游 + 中退率在退房之前 + 分层视图     ║
    // ╚══════════════════════════════════════════════════════════════╝
    const op = p.order.params;
    const focusPushEff = op.focus_push_eff.value;              // 聚焦盘推房有效率(%)
    const pushSurveyPct = op.push_to_survey.value;
    const surveySignPct = op.survey_to_sign.value;
    const signEffectivePct = op.sign_to_effective.value;
    const cancelRate = op.cancel_rate.value;
    const midTermRate = op.mid_term_rate.value;                // 中退率(%)
    const badDebtRate = op.bad_debt_rate.value;
    const monthlyOrders = op.monthly_orders.value;
    const cacPerOrder = op.cac_per_order.value;

    const pushSurvey = pushSurveyPct / 100;
    const surveySign = surveySignPct / 100;
    const signEffective = signEffectivePct / 100;
    const fullFunnelRate = pushSurvey * surveySign * signEffective;
    const pushesPerOrder = fullFunnelRate > 0 ? Math.round(1 / fullFunnelRate) : 99999;
    // 净有效签约率 = 扣退单 × 扣坏账 × 扣中退
    const netEffectiveRate = (1 - cancelRate / 100) * (1 - badDebtRate / 100) * (1 - midTermRate / 100) * 100;
    const cacEfficiency = cacPerOrder > 0 ? (ue.netRevenue / cacPerOrder) : 0;

    // 聚焦盘 vs 全量对比数据
    const funnelLayers = rpt ? rpt.funnel_by_age : [];
    const bestAge = funnelLayers.length > 0 ? funnelLayers.reduce((best, f) => f.push_eff > best.push_eff ? f : best, funnelLayers[0]) : null;

    // 评分子项
    const focusScore = Math.min(100, Math.max(0, focusPushEff / 1.5 * 100));   // 1.5%为满分
    const pushSurveyScore = Math.min(100, Math.max(0, pushSurveyPct / 1 * 100));
    const surveySignScore = Math.min(100, Math.max(0, surveySignPct * 1.2));
    const signEffScore = Math.min(100, Math.max(0, (signEffectivePct - 80) * 5));
    const midTermScore = Math.max(0, 100 - midTermRate * 10);     // 中退越低越好
    const cancelScore = Math.max(0, 100 - cancelRate * 20);

    // 漏斗维度利润：使用完整UE运营利润（含渠道成本+费用摊销的变化传导）
    const orderCostPerUnit = ue.channelCost + ue.expenseTotal;
    const orderProfitPerUnit = ue.operatingProfit;

    dims.order = {
        label: '漏斗(单)', icon: 'filter', color: '#2f9668',
        desc: '圈盘→推房→量房→签约→有效→(中退)',
        monthlyVolume: monthlyOrders,
        monthlyRevenue: monthlyOrders * ue.netRevenue,
        revenuePerUnit: ue.netRevenue,
        costPerUnit: orderCostPerUnit,
        profitPerUnit: orderProfitPerUnit,
        roi: orderCostPerUnit > 0 ? (orderProfitPerUnit / orderCostPerUnit * 100) : 0,
        conversionRate: fullFunnelRate * 100,
        efficiency: cacEfficiency,
        highlight: fullFunnelRate * 100 > 0.3 ? '高效漏斗' : fullFunnelRate * 100 > 0.1 ? '中等漏斗' : '低效漏斗',
        details: [
            { label: '【🎯 圈盘(聚焦盘) — 漏斗最上游】', value: '', unit: '', isSeparator: true },
            { label: '聚焦盘推房有效率(目标)', value: focusPushEff.toFixed(1), unit: '%', important: true, tag: '📊' },
            { label: '聚焦盘定义', value: '高楼龄(20+)+高坪效(60+)+房况差(HQI<60)', unit: '', tag: '📊' },
            ...(bestAge ? [
                { label: `最优楼龄段(${bestAge.tier}年)`, value: bestAge.push_eff.toFixed(1), unit: `% 有效率(${bestAge.eff_units}单)`, tag: '📊' },
            ] : []),
            { label: '【漏斗全链路(全量)】', value: '', unit: '', isSeparator: true },
            { label: '推房→量房商机率', value: pushSurveyPct.toFixed(3), unit: '%', important: true },
            { label: '量房→焕新签约率', value: surveySignPct.toFixed(1), unit: '%', important: true },
            { label: '签约→有效率', value: signEffectivePct.toFixed(1), unit: '%', important: true },
            { label: '全链路转化率', value: (fullFunnelRate * 100).toFixed(4), unit: '%', important: true },
            { label: '每单需推房数', value: pushesPerOrder.toLocaleString(), unit: '套房源' },
            { label: '【质量指标(退房前)】', value: '', unit: '', isSeparator: true },
            { label: '中退率', value: midTermRate.toFixed(1), unit: '%', important: true, tag: '📊' },
            { label: '退单率', value: cancelRate.toFixed(1), unit: '%' },
            { label: '坏账率', value: badDebtRate.toFixed(1), unit: '%' },
            { label: '净有效签约率(扣退单+坏账+中退)', value: netEffectiveRate.toFixed(1), unit: '%' },
            { label: '【效率指标】', value: '', unit: '', isSeparator: true },
            { label: '月签约量', value: monthlyOrders, unit: '单' },
            { label: '每单CAC', value: Math.round(cacPerOrder), unit: '元' },
            { label: '每单净收入', value: Math.round(ue.netRevenue), unit: '元' },
            { label: '收入/CAC比', value: cacEfficiency.toFixed(1), unit: '倍' },
            { label: '漏斗趋势', value: funnel.trend === 'up' ? '📈 上升' : funnel.trend === 'down' ? '📉 下降' : '➡️ 稳定', unit: '' },
            ...(funnelLayers.length > 0 ? [
                { label: '【📊 分层漏斗(按楼龄)】', value: '', unit: '', isSeparator: true },
                ...funnelLayers.slice(0, 4).map(f => ({
                    label: `${f.tier}年`, value: f.push_eff.toFixed(1), unit: `% 有效(${f.eff_units}单,¥${Math.round(f.avg_price/10000)}万/套)`, tag: '📊'
                })),
            ] : []),
        ],
        // 评分：圈盘15% + 推房量房25% + 量房签约25% + 签约有效率10% + 中退率10% + 退单率10% + CAC效率5%
        score: Math.min(100, Math.round(
            focusScore * 0.15 +
            pushSurveyScore * 0.25 +
            surveySignScore * 0.25 +
            signEffScore * 0.10 +
            midTermScore * 0.10 +
            cancelScore * 0.10 +
            Math.min(100, cacEfficiency * 15) * 0.05
        ))
    };

    // ╔══════════════════════════════════════════════════════════════╗
    // ║  3. 业主(客)维度 — LTV/CAC + 转介绍                         ║
    // ╚══════════════════════════════════════════════════════════════╝
    const cp = p.customer.params;
    const cac = cp.cac.value;
    const onlineExtra = cp.online_extra.value;
    const effectiveCAC = cac + onlineExtra * biz.online_lead_ratio;
    const referralRate = cp.referral_rate.value / 100;
    const repeatRate = cp.repeat_rate.value / 100;
    const rTotal = cp.renovation_total.value;
    const fullRent = cp.full_month_rent.value;
    const mPremium = cp.rent_premium.value;
    const ownerRenovToRent = fullRent > 0 ? (rTotal / fullRent) : 999;
    // 使用UE运营利润而非仅净收入，让渠道成本/费用变化能传导到客户维度
    const firstOrderNetRev = ue.netRevenue;
    const firstOrderProfit = ue.operatingProfit;
    const referralLTV = firstOrderNetRev * referralRate * 0.5;
    const repeatLTV = firstOrderNetRev * repeatRate;
    const ltv = firstOrderNetRev + referralLTV * 2 + repeatLTV * 2;
    const ltvCacRatio = effectiveCAC > 0 ? (ltv / effectiveCAC) : 0;
    const cacPaybackMonths = firstOrderNetRev > 0 ? (effectiveCAC / (firstOrderNetRev / 12)) : 999;
    const ownerPayback = mPremium > 0 ? Math.ceil(rTotal / mPremium) : 999;
    // 客户维度利润：利润口径LTV（含渠道+费用变化传导）
    const profitLTV = firstOrderProfit + (firstOrderProfit * referralRate * 0.5) * 2 + (firstOrderProfit * repeatRate) * 2;
    const customerProfitPerUnit = profitLTV - effectiveCAC;

    dims.customer = {
        label: '业主(客)', icon: 'user-tie', color: '#f59e0b',
        desc: '客户价值 — LTV/CAC+转介绍',
        monthlyVolume: monthlyOrders,
        monthlyRevenue: monthlyOrders * firstOrderNetRev,
        revenuePerUnit: ltv,
        costPerUnit: effectiveCAC,
        profitPerUnit: customerProfitPerUnit,
        roi: effectiveCAC > 0 ? (customerProfitPerUnit / effectiveCAC * 100) : 0,
        conversionRate: funnel.push_to_survey_rate * 100,
        efficiency: ltvCacRatio,
        highlight: ltvCacRatio > 5 ? '高效' : ltvCacRatio > 3 ? '中等' : '需优化',
        details: [
            { label: '【获客成本(CAC)】', value: '', unit: '', isSeparator: true },
            { label: 'CAC(渠道提点)', value: Math.round(cac), unit: '元', important: true },
            { label: '线上投放额外', value: Math.round(onlineExtra), unit: `元(线上占比${(biz.online_lead_ratio*100).toFixed(0)}%)`, tag: '⚠️' },
            { label: '加权有效CAC', value: Math.round(effectiveCAC), unit: '元', important: true },
            { label: '【客户价值(LTV)】', value: '', unit: '', isSeparator: true },
            { label: '首单净收入', value: Math.round(firstOrderNetRev), unit: '元', important: true },
            { label: '转介绍率', value: (referralRate * 100).toFixed(0), unit: '%', important: true },
            { label: '转介绍价值(2年)', value: Math.round(referralLTV * 2), unit: `元(率${(referralRate*100).toFixed(0)}%)` },
            { label: '复购率', value: (repeatRate * 100).toFixed(0), unit: '%', tag: '⚠️' },
            { label: '复购价值(2年)', value: Math.round(repeatLTV * 2), unit: `元(率${(repeatRate*100).toFixed(0)}%)`, tag: '⚠️' },
            { label: 'LTV(2年周期)', value: Math.round(ltv), unit: '元', important: true },
            { label: 'LTV/CAC比值', value: ltvCacRatio.toFixed(1), unit: '倍', important: true },
            { label: 'CAC回收期', value: cacPaybackMonths.toFixed(1), unit: '月' },
            { label: '【业主投资视角】', value: '', unit: '', isSeparator: true },
            { label: '装修/租金倍数 ⭐', value: ownerRenovToRent.toFixed(1), unit: 'x 月租金' },
            { label: '装修总款(GTV)', value: rTotal, unit: '元' },
            { label: '全月租金', value: fullRent, unit: '元/月' },
            { label: '月租金溢价', value: mPremium, unit: '元/月' },
            { label: '溢价回本', value: ownerPayback, unit: '月' },
            { label: 'NPS评分', value: biz.nps_score !== null ? biz.nps_score : '无数据', unit: '', tag: biz.nps_score === null ? '待采集' : '' },
        ],
        score: Math.min(100, Math.round(
            Math.min(100, ltvCacRatio * 12) * 0.30 +
            Math.min(100, Math.max(0, (20 - ownerRenovToRent) / 20 * 100)) * 0.25 +
            Math.min(100, referralRate * 100 * 2.5) * 0.20 +
            Math.min(100, funnel.push_to_survey_rate * 100 * 50) * 0.15 +
            Math.min(100, repeatRate * 100 * 2.5) * 0.10
        ))
    };

    // ╔══════════════════════════════════════════════════════════════╗
    // ║  4. 美租顾问(人)维度 — 人效 + 平均租期18月 + 续租率70%       ║
    // ║  对比维度：美租整装 vs 仅托管不美化                           ║
    // ╚══════════════════════════════════════════════════════════════╝
    const sp = p.staff.params;
    const totalStaff = sp.total_staff.value;
    const avgSalary = sp.avg_salary.value;
    const teamMonthlyUnits = sp.monthly_units_total.value;
    const perCapitaUnits = totalStaff > 0 ? (teamMonthlyUnits / totalStaff) : 0;
    // 使用动态UE计算值（而非静态模型字段），让E杠杆变化传导到人效维度
    const revPerUnit = ue.netRevenue;
    const chCostUnit = ue.channelCost;
    const hrCostUnit = sp.hr_cost_per_unit.value;
    const avgLease = sp.avg_lease_months.value;              // 美租18月
    const plainLease = sp.plain_lease_months?.value || 10;   // 仅托管10月
    const renewalRate = sp.renewal_rate.value / 100;         // 美租70%
    const plainRenewal = (sp.plain_renewal_rate?.value || 55) / 100; // 仅托管55%
    const turnoverRate = sp.turnover_rate.value / 100;

    const revenuePerStaff = perCapitaUnits * revPerUnit;
    const channelCostPerStaff = perCapitaUnits * chCostUnit;
    // 人效利润：使用UE运营利润口径，确保渠道/费用E杠杆变化传导
    const perUnitProfit = ue.operatingProfit;
    const profitContribPerStaff = perCapitaUnits * perUnitProfit;
    const costPerStaff = avgSalary;
    const netProfitPerStaff = profitContribPerStaff - costPerStaff;
    const staffROI = costPerStaff > 0 ? (profitContribPerStaff / costPerStaff * 100) : 0;

    // 流失隐性成本
    const trainingMonths = 3;
    const trainingCost = avgSalary * trainingMonths;
    const annualTurnoverCost = trainingCost * turnoverRate;
    const effectivePerCapita = perCapitaUnits * (1 - turnoverRate * trainingMonths / 12 * 0.5);

    // 美租 vs 仅托管的价值差异
    const leaseValue = avgLease * revPerUnit;
    const plainLeaseValue = plainLease * revPerUnit;
    const leaseUplift = leaseValue - plainLeaseValue;
    const renewalValue = renewalRate * revPerUnit * avgLease * 0.5;
    const plainRenewalValue = plainRenewal * revPerUnit * plainLease * 0.5;
    const renewalUplift = renewalValue - plainRenewalValue;
    const totalPerStaffLTV = (leaseValue + renewalValue) * perCapitaUnits / 12;

    // 北京vs上海人效对比
    const bjTeam = TEAM_STRUCTURE.beijing;
    const shTeam = TEAM_STRUCTURE.shanghai;
    const bjPerCapita = AppState.scaleParams.beijing.standard.monthlyUnits / bjTeam.h2_headcount;
    const shPerCapita = AppState.scaleParams.shanghai.standard.monthlyUnits / shTeam.h2_headcount;

    dims.staff = {
        label: '美租顾问(人)', icon: 'user-shield', color: '#ec4899',
        desc: '人效 + 租期(18月vs10月) + 续租率(70%vs55%)',
        monthlyVolume: totalStaff,
        monthlyRevenue: totalStaff * revenuePerStaff,
        revenuePerUnit: revenuePerStaff,
        costPerUnit: costPerStaff,
        profitPerUnit: netProfitPerStaff,
        roi: staffROI,
        conversionRate: perCapitaUnits,
        efficiency: revenuePerStaff / (costPerStaff + 1),
        highlight: netProfitPerStaff > 10000 ? '高效' : netProfitPerStaff > 0 ? '中等' : '需优化',
        details: [
            { label: '团队人数', value: totalStaff, unit: '人', important: true },
            { label: '团队月总签约', value: teamMonthlyUnits, unit: '单' },
            { label: '人均月签约', value: perCapitaUnits.toFixed(1), unit: '单/人/月', important: true },
            { label: '人均月收入贡献', value: Math.round(revenuePerStaff), unit: '元', important: true },
            { label: '├ 人均渠道成本', value: Math.round(channelCostPerStaff), unit: '元' },
            { label: '├ 人均人力摊销', value: Math.round(perCapitaUnits * hrCostUnit), unit: '元' },
            { label: '人均利润贡献', value: Math.round(profitContribPerStaff), unit: '元' },
            { label: '平均薪资', value: Math.round(avgSalary), unit: '元' },
            { label: '人均净利润', value: Math.round(netProfitPerStaff), unit: '元', important: true },
            { label: '人效ROI', value: staffROI.toFixed(0), unit: '%' },
            { label: '【⭐ 美租顾问运营指标 — 美租 vs 仅托管】', value: '', unit: '', isSeparator: true },
            { label: '美租平均租期', value: avgLease, unit: '月', important: true, tag: '📊' },
            { label: '仅托管平均租期', value: plainLease, unit: '月', tag: '📊' },
            { label: '租期提升', value: `+${Math.round((avgLease / plainLease - 1) * 100)}%`, unit: `(${plainLease}→${avgLease}月)`, important: true, tag: '📊' },
            { label: '美租续租率', value: (renewalRate * 100).toFixed(0), unit: '%', important: true, tag: '📊' },
            { label: '仅托管续租率', value: (plainRenewal * 100).toFixed(0), unit: '%', tag: '📊' },
            { label: '续租率提升', value: `+${Math.round((renewalRate - plainRenewal) * 100)}pp`, unit: `(${(plainRenewal*100).toFixed(0)}→${(renewalRate*100).toFixed(0)}%)`, tag: '📊' },
            { label: '租期价值增量', value: Math.round(leaseUplift), unit: '元/单', tag: '📊' },
            { label: '续租价值增量', value: Math.round(renewalUplift), unit: '元/单', tag: '📊' },
            { label: '人均管理LTV(月)', value: Math.round(totalPerStaffLTV), unit: '元' },
            { label: '【流失影响】', value: '', unit: '', isSeparator: true },
            { label: '年流失率', value: (turnoverRate * 100).toFixed(0), unit: '%', tag: '⚠️' },
            { label: '培训期', value: trainingMonths, unit: '月', tag: '⚠️' },
            { label: '流失隐性成本', value: Math.round(annualTurnoverCost), unit: '元/人/年' },
            { label: '有效人效(扣流失)', value: effectivePerCapita.toFixed(1), unit: '单/人/月' },
            { label: '【城市对比】', value: '', unit: '', isSeparator: true },
            { label: '北京人效', value: bjPerCapita.toFixed(1), unit: `单/人/月(${bjTeam.h2_headcount}人)` },
            { label: '上海人效', value: shPerCapita.toFixed(1), unit: `单/人/月(${shTeam.h2_headcount}人)` },
            { label: '人效差距', value: (shPerCapita / bjPerCapita).toFixed(1), unit: '倍(上海/北京)' },
        ],
        // 评分：人效ROI 15% + 人均签约10% + 低流失率10% + 利润贡献10% + 平均租期20% + 续租率20% + 城市人效5% + 美租增量10%
        score: Math.min(100, Math.round(
            Math.min(100, Math.max(0, staffROI * 0.3)) * 0.15 +
            Math.min(100, perCapitaUnits * 8) * 0.10 +
            Math.max(0, (100 - turnoverRate * 100 * 2)) * 0.10 +
            Math.min(100, Math.max(0, netProfitPerStaff / 500)) * 0.10 +
            Math.min(100, avgLease / 24 * 100) * 0.20 +
            Math.min(100, renewalRate * 100 * 1.3) * 0.20 +
            Math.min(100, perCapitaUnits / Math.max(bjPerCapita, shPerCapita) * 100) * 0.05 +
            Math.min(100, Math.max(0, (avgLease - plainLease) / plainLease * 100)) * 0.10
        ))
    };

    return dims;
}

// ========== 找出最优U ==========

function findBestU(dims) {
    const entries = Object.entries(dims);
    const ranked = entries.sort((a, b) => b[1].score - a[1].score);
    return {
        ranked,
        best: ranked[0],
        worst: ranked[ranked.length - 1],
        avgScore: entries.reduce((s, [, d]) => s + d.score, 0) / entries.length
    };
}

// ========== U维度页面渲染 ==========

function renderUDimensionPage() {
    // 刷新参数缓存
    _uDimParams = buildUDimensionParams(AppState.currentCity);

    const dims = calculateAllUDimensions();
    const ranking = findBestU(dims);

    renderUDimensionScoreboard(dims, ranking);
    renderUDimensionRadar(dims);
    renderUDimensionHeatmap(dims);
    renderUDimensionDetailCards(dims, ranking);
    renderUDimensionRanking(dims, ranking);
}

// --- 记分牌 ---
function renderUDimensionScoreboard(dims, ranking) {
    const container = document.getElementById('u-scoreboard');
    if (!container) return;

    let html = '';
    ranking.ranked.forEach(([key, dim], idx) => {
        const isBest = idx === 0;
        const borderColor = isBest ? 'border-2 border-yellow-400 shadow-yellow-100' : 'border border-gray-100';
        const badge = isBest ? '<span class="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">👑 最优U</span>' : '';
        const highlightClass = dim.highlight === '高效' ? 'tag-green' : dim.highlight === '中等' ? 'tag-yellow' : 'tag-red';

        html += `<div class="relative bg-white rounded-xl ${borderColor} shadow-sm p-4 hover:shadow-md transition-all cursor-pointer" onclick="scrollToUDetail('${key}')">
            ${badge}
            <div class="flex items-center gap-2 mb-3">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm" style="background:${dim.color}">
                    <i class="fas fa-${dim.icon}"></i>
                </div>
                <div>
                    <div class="font-bold text-gray-800 text-sm">${dim.label}</div>
                    <span class="tag ${highlightClass} text-[10px]">${dim.highlight}</span>
                </div>
            </div>
            <div class="text-center mb-2">
                <div class="text-3xl font-black" style="color:${dim.color}">${dim.score}</div>
                <div class="text-[10px] text-gray-400 font-medium">综合评分</div>
            </div>
            <div class="space-y-1.5 text-xs">
                <div class="flex justify-between"><span class="text-gray-500">单位收入</span><span class="font-semibold text-gray-700">¥${formatNumber(Math.round(dim.revenuePerUnit))}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">单位利润</span><span class="font-semibold ${dim.profitPerUnit > 0 ? 'text-green-600' : 'text-red-600'}">¥${formatNumber(Math.round(dim.profitPerUnit))}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">ROI</span><span class="font-semibold text-gray-700">${dim.roi.toFixed(0)}%</span></div>
            </div>
            <div class="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-1000" style="width:${dim.score}%;background:${dim.color}"></div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- 雷达图 v2.1 ---
function renderUDimensionRadar(dims) {
    const chart = getOrCreateChart('chart-u-radar');
    if (!chart) return;

    const indicators = [
        { name: '产品力/共赢', max: 100 },
        { name: '圈盘+转化', max: 100 },
        { name: '客户价值', max: 100 },
        { name: '美租顾问', max: 100 },
        { name: '综合评分', max: 100 }
    ];

    const series = [];
    const legend = [];

    Object.entries(dims).forEach(([key, dim]) => {
        // 各维度的特色指标归一化
        let metricVal;
        if (key === 'unit') {
            metricVal = dim.winWinIndex || dim.score;
        } else if (key === 'order') {
            metricVal = Math.min(100, dim.conversionRate * 200);  // 全链路转化率归一化
        } else if (key === 'customer') {
            metricVal = Math.min(100, dim.efficiency * 12);  // LTV/CAC归一化
        } else {
            metricVal = Math.min(100, dim.roi * 0.3);  // ROI归一化
        }

        series.push({
            name: dim.label,
            value: [
                key === 'unit' ? metricVal : (dim.score * 0.8),
                key === 'order' ? metricVal : (dim.score * 0.7),
                key === 'customer' ? metricVal : (dim.score * 0.6),
                key === 'staff' ? metricVal : (dim.score * 0.5),
                dim.score
            ],
            lineStyle: { color: dim.color, width: 2 },
            areaStyle: { color: dim.color, opacity: 0.1 },
            itemStyle: { color: dim.color }
        });
        legend.push(dim.label);
    });

    chart.setOption({
        tooltip: {},
        legend: { data: legend, bottom: 0, textStyle: { fontSize: 11 } },
        radar: { indicator: indicators, shape: 'polygon', splitNumber: 4, radius: '65%', axisName: { fontSize: 10, color: '#666' } },
        series: [{ type: 'radar', data: series }]
    });
}

// --- 热力图 v2.1 ---
function renderUDimensionHeatmap(dims) {
    const chart = getOrCreateChart('chart-u-heatmap');
    if (!chart) return;

    const dimKeys = Object.keys(dims);
    const metrics = ['产品力/共赢', '圈盘+转化', '客户价值', '美租顾问', '综合评分'];
    const data = [];

    dimKeys.forEach((key, xi) => {
        const dim = dims[key];
        let vals;
        if (key === 'unit') {
            vals = [dim.winWinIndex || dim.score, 0, 0, 0, dim.score];
        } else if (key === 'order') {
            vals = [0, Math.min(100, dim.conversionRate * 200), 0, 0, dim.score];
        } else if (key === 'customer') {
            vals = [0, 0, Math.min(100, dim.efficiency * 12), 0, dim.score];
        } else {
            vals = [0, 0, 0, Math.min(100, dim.roi * 0.3), dim.score];
        }
        // Cross-fill from score
        for (let i = 0; i < 4; i++) {
            if (vals[i] === 0) vals[i] = Math.round(dim.score * 0.6);
        }
        vals.forEach((v, yi) => { data.push([xi, yi, Math.round(v)]); });
    });

    chart.setOption({
        tooltip: { formatter: p => `${dimKeys.map(k => dims[k].label)[p.data[0]]} × ${metrics[p.data[1]]}<br/>评分: <b>${p.data[2]}</b>` },
        grid: { left: 80, right: 30, top: 10, bottom: 50 },
        xAxis: { type: 'category', data: dimKeys.map(k => dims[k].label), axisLabel: { fontSize: 11 }, splitArea: { show: true } },
        yAxis: { type: 'category', data: metrics, axisLabel: { fontSize: 11 }, splitArea: { show: true } },
        visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#fee2e2', '#fef3c7', '#d1fae5', '#059669'] }, textStyle: { fontSize: 10 } },
        series: [{ type: 'heatmap', data, label: { show: true, fontSize: 11, fontWeight: 'bold' }, itemStyle: { borderRadius: 4 } }]
    });
}

// --- 详细卡片 ---
function renderUDimensionDetailCards(dims, ranking) {
    const container = document.getElementById('u-detail-cards');
    if (!container) return;

    const udp = getUDimParams();

    let html = '';
    Object.entries(dims).forEach(([key, dim]) => {
        const params = udp[key]?.params || {};
        html += `<div class="card" id="u-detail-${key}">
            <div class="card-header" style="border-left: 4px solid ${dim.color}">
                <h3><i class="fas fa-${dim.icon} mr-2" style="color:${dim.color}"></i>${dim.label}维度 — ${dim.desc}</h3>
                <div class="flex items-center gap-2">
                    <span class="text-2xl font-black" style="color:${dim.color}">${dim.score}分</span>
                </div>
            </div>
            <div class="p-4">
                <!-- 核心指标卡 -->
                <div class="grid grid-cols-4 gap-3 mb-4">
                    ${dim.details.filter(d => d.important).slice(0, 4).map(d => `
                    <div class="bg-gray-50 rounded-lg p-3 text-center">
                        <div class="text-xs text-gray-500">${d.label}${d.tag ? ` <span class="text-[9px] text-amber-500">${d.tag}</span>` : ''}</div>
                        <div class="text-lg font-bold mt-1" style="color:${dim.color}">${typeof d.value === 'number' ? formatNumber(d.value) : d.value}<span class="text-xs font-normal text-gray-400 ml-0.5">${d.unit || ''}</span></div>
                    </div>`).join('')}
                </div>
                <!-- 参数调节器 -->
                <div class="bg-gray-50 rounded-lg p-3 mb-4">
                    <div class="text-xs font-bold text-gray-500 mb-2"><i class="fas fa-sliders-h mr-1"></i>参数调节 <span class="text-[9px] text-amber-400 font-normal">⚠️ = 假设值，可调整</span></div>
                    <div class="grid grid-cols-3 gap-x-4 gap-y-1">
                        ${Object.entries(params).map(([pk, pv]) => `
                        <div class="flex items-center gap-2 py-1">
                            <span class="text-[11px] text-gray-500 w-28 flex-shrink-0">${pv.tag ? `<span class="text-amber-400">${pv.tag}</span> ` : ''}${pv.label}</span>
                            <input type="range" min="${pv.min}" max="${pv.max}" step="${pv.step}" value="${pv.value}"
                                class="flex-1 h-1.5" oninput="onUParamChange('${key}','${pk}',this.value)">
                            <span class="text-[11px] font-bold w-16 text-right tabular-nums" id="upval-${key}-${pk}" style="color:${dim.color}">${pv.unit === '元' || pv.unit === '元/月' ? formatCurrency(pv.value) : (typeof pv.value === 'number' ? pv.value : pv.value) + (pv.unit || '')}</span>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- 明细表 -->
                <table class="w-full text-sm">
                    <tbody>
                        ${dim.details.map(d => {
                            if (d.isSeparator) return `<tr><td colspan="2" class="py-2 px-3 text-xs font-bold text-gray-400 bg-gray-50/50 border-t border-b border-gray-100">${d.label}</td></tr>`;
                            return `<tr class="border-b border-gray-50 ${d.important ? 'bg-gray-50/50' : ''}">
                            <td class="py-1.5 px-3 text-gray-500 font-medium">${d.label}${d.tag ? ` <span class="text-[9px] text-amber-500 bg-amber-50 px-1 rounded">${d.tag}</span>` : ''}</td>
                            <td class="py-1.5 px-3 text-right font-mono font-semibold text-gray-700">${typeof d.value === 'number' ? formatNumber(d.value) : d.value}<span class="text-xs text-gray-400 ml-1">${d.unit}</span></td>
                        </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- 排名面板 ---
function renderUDimensionRanking(dims, ranking) {
    const container = document.getElementById('u-ranking-panel');
    if (!container) return;

    const best = ranking.best;
    const worst = ranking.worst;
    let html = `<div class="p-4">
        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-2xl">👑</span>
                <span class="font-bold text-yellow-800">最优U维度：${best[1].label}</span>
                <span class="text-yellow-600 font-black text-xl ml-auto">${best[1].score}分</span>
            </div>
            <p class="text-sm text-yellow-700">${getURecommendation(best[0], best[1])}</p>
            <div class="mt-2 flex gap-2 flex-wrap">
                <span class="tag tag-green">单位利润 ¥${formatNumber(Math.round(best[1].profitPerUnit))}</span>
                <span class="tag tag-blue">ROI ${best[1].roi.toFixed(0)}%</span>
                <span class="tag tag-purple">月度规模 ${best[1].monthlyVolume}</span>
            </div>
        </div>
        <div class="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 mb-4">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-2xl">⚠️</span>
                <span class="font-bold text-red-800">最需优化：${worst[1].label}</span>
                <span class="text-red-600 font-black text-xl ml-auto">${worst[1].score}分</span>
            </div>
            <p class="text-sm text-red-700">${getUWeakness(worst[0], worst[1])}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-3 mb-4 text-[10px] text-gray-400">
            <i class="fas fa-info-circle mr-1"></i>数据来源：贝壳UE模型 + 业主UE模型 + 供应商成本 + 漏斗CSV(2024.10–2026.03) · <span class="text-amber-400">⚠️</span> 标注为假设值
        </div>
        <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">完整排名</h4>
        <div class="space-y-2">
            ${ranking.ranked.map(([key, dim], idx) => `
            <div class="flex items-center gap-3 p-2 rounded-lg ${idx === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-700' : 'bg-gray-100 text-gray-500'}">${idx + 1}</span>
                <i class="fas fa-${dim.icon} text-sm" style="color:${dim.color}"></i>
                <span class="text-sm font-medium text-gray-700 flex-1">${dim.label}</span>
                <div class="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" style="width:${dim.score}%;background:${dim.color}"></div>
                </div>
                <span class="text-sm font-bold w-8 text-right" style="color:${dim.color}">${dim.score}</span>
            </div>`).join('')}
        </div>
    </div>`;
    container.innerHTML = html;
}

// --- 智能建议文案 v2.2 ---
function getURecommendation(key, dim) {
    const tips = {
        unit: `房(套)维度表现最强——三方共赢指数${dim.winWinIndex || dim.score}分。装租比基准15-18月，加权溢价率(60%A+40%B)驱动共赢。建议以「三方共赢指数」为核心KPI，聚焦装租比管控（目标≤18月）+ 溢价率提升（目标15-20%）。`,
        order: `漏斗(单)维度领先——全链路转化率${(dim.conversionRate || 0).toFixed(4)}%，每单需推房${dim.details?.find(d => d.label?.includes('需推房'))?.value || '?'}套。建议以「圈盘→有效签约」为核心KPI，重点提升聚焦盘(两高一差)推房有效率至1%。`,
        customer: `业主(客)维度最优——LTV/CAC=${dim.efficiency?.toFixed?.(1) || '?'}倍，转介绍率15%贡献显著。建议以「LTV/CAC比值」为核心KPI，强化口碑运营和转介绍激励机制。`,
        staff: `美租顾问(人)维度最强——美租平均租期18月(vs仅托管10月提升+80%)，续租率70%(vs55%+15pp)。建议以「美租增量价值」为核心KPI，打通美租顾问从签约到续租的全生命周期管理。`
    };
    return tips[key] || '综合表现最优，建议作为战略重点维度。';
}

function getUWeakness(key, dim) {
    const tips = {
        unit: `房(套)维度评分较低：三方共赢指数仅${dim.winWinIndex || dim.score}分，可能是装租比偏高(>18月)或溢价率未达目标(15-20%)。建议聚焦返修率/中退率管控 + 如期交付能力建设。`,
        order: `漏斗(单)维度偏弱：推房→量房转化率仅${(dim.details?.find(d => d.label?.includes('推房→量房'))?.value || '?')}%。建议重点提升圈盘精准度，在聚焦盘(两高一差)上实现推房有效率1%目标。`,
        customer: `业主(客)维度需关注：CAC = ¥${formatNumber(Math.round(dim.costPerUnit || 0))}，LTV/CAC比值${dim.efficiency?.toFixed?.(1) || '?'}。复购率为假设值，建议尽快采集真实数据。`,
        staff: `美租顾问(人)维度需优化：人效ROI ${dim.roi?.toFixed?.(0) || '?'}%。建议提升人均签约量、缩小京沪人效差距，充分发挥美租整装的租期(18月)和续租率(70%)优势。`
    };
    return tips[key] || '该维度评分相对较低，存在较大优化空间。';
}

// --- 滚动定位 ---
function scrollToUDetail(key) {
    const el = document.getElementById(`u-detail-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- 参数变更 ---
function onUParamChange(dimKey, paramKey, value) {
    const udp = getUDimParams();
    if (udp[dimKey]?.params?.[paramKey]) {
        udp[dimKey].params[paramKey].value = parseFloat(value);
        const paramDef = udp[dimKey].params[paramKey];
        const label = document.getElementById(`upval-${dimKey}-${paramKey}`);
        if (label) {
            label.textContent = (paramDef.unit === '元' || paramDef.unit === '元/月') ? formatCurrency(parseFloat(value)) : value + (paramDef.unit || '');
        }
    }
    clearTimeout(window._uDimTimer);
    window._uDimTimer = setTimeout(() => {
        const dims = calculateAllUDimensions();
        const ranking = findBestU(dims);
        renderUDimensionScoreboard(dims, ranking);
        renderUDimensionRadar(dims);
        renderUDimensionHeatmap(dims);
        renderUDimensionDetailCards(dims, ranking);
        renderUDimensionRanking(dims, ranking);
    }, 200);
}
