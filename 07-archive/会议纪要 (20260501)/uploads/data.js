// ===== Data Layer v6.0 — 三视角 UE 模型 =====
// 贝壳UE（P&L真实结构）· 业主UE（投资回报视角）· 供应商UE（施工成本结构）
// 双城市（北京/上海）× 双产品线（标准化/个性化）

// ==================== 全局状态 ====================
const AppState = {
    activeTab: 'governance',
    currentCity: 'beijing',
    currentProduct: 'standard',   // standard | custom
    currentPerspective: 'beike',  // beike | owner | supplier
    selectedAssumptions: [],
    baselineModels: {},
    assumptions: [],
    themes: [],      // 4个战略主题（获客/产品/转化/交付）
    hypotheses: [],  // 战略实践验证数据（合并 assumptions + scenarios + BLM）
    financialData: {},
    scaleParams: {
        // 兼容旧代码的平面字段
        monthlyUnits: 115,
        growthRate: 0,
        projectionMonths: 6,
        // 新增：按城市×产品的详细规模
        beijing: {
            standard: { monthlyUnits: 115, h2TotalUnits: 690, h2TotalGTV: 69000000, h2TotalRevenue: 8280000 },
            custom:   { monthlyUnits: 203, h2TotalUnits: 1220, h2TotalGTV: 28060000, h2TotalRevenue: 3367200 },
        },
        shanghai: {
            standard: { monthlyUnits: 733, h2TotalUnits: 4400, h2TotalGTV: 368750000, h2TotalRevenue: 80756250 },
            custom:   { monthlyUnits: 0, h2TotalUnits: 0, h2TotalGTV: 55589717, h2TotalRevenue: 12174148 },
        },
        headcount: { beijing: 20, shanghai: 34 },
        avgSalary: { beijing: 29000, shanghai: 30305 },
    },
};

// ==================== 贝壳 UE 基准模型 ====================
// 数据来源：2025H2美租UE.xlsx 京北/上海 sheet，①UE模型区域
const DEFAULT_BEIKE_MODELS = {
    beijing: {
        standard: {
            id: 'beike_bj_std',
            city: '北京', product: '标准化', label: '北京标准化',
            gtv_per_unit: 100000,
            commission_rate: 12,           // 业务提点 (%)
            net_revenue: 12000,            // 净收入 = GTV × 提点
            // --- 渠道成本 ---
            channel_cost: 1920,            // 渠道成本合计
            channel_broker: 0,             // 链家经纪人
            channel_manager: 1920,         // 资管经理 (6000/单×32%提佣)
            channel_director: 0,           // 资管总监
            channel_incentive: 0,          // 业务激励
            // --- 费用摊销 ---
            expense_total: 8043,           // 费用摊销合计
            expense_city_hr: 5043,         // 城市人工成本
            expense_platform_hr: 1000,     // 平台人工成本
            expense_brand: 1000,           // 品牌营销费用
            expense_system: 1000,          // 平台建设费用
            expense_other: 0,             // 其他运营费用
            // --- 利润 ---
            operating_profit: 2037,        // 运营利润
            // --- GTV 比率 ---
            gtv_ratio_commission: 0.12,
            gtv_ratio_channel: 0.0192,
            gtv_ratio_expense: 0.0804,
            gtv_ratio_profit: 0.0204,
            // --- 净收比率 ---
            rev_ratio_channel: 0.16,
            rev_ratio_expense: 0.67,
            rev_ratio_profit: 0.17,
            // --- 运营指标 ---
            monthly_target_units: 115,
            standardized_gtv_ratio: 71.1,  // 标准化GTV占比(%)
            rental_success_rate: 75,       // 招租成功率(%)
            referral_rate: 15,             // 口碑回单率(%)
            // --- 三方共赢 & 美租顾问运营 ---
            rework_rate: 7.2,              // 来源：0922报告 中退率7.2%(含返修上界)
            ontime_delivery_rate: 82,      // ⚠️ 假设：如期交付率(%) — 待采集
            avg_lease_months_actual: 18,   // 来源：0922报告 美租整装平均租期18月(vs仅托管10月)
            renewal_rate: 70,              // 来源：0922报告 美租整装续租率70%(vs仅托管55%)
        },
        custom: {
            id: 'beike_bj_cust',
            city: '北京', product: '个性化', label: '北京个性化',
            gtv_per_unit: 40000,
            commission_rate: 12,
            net_revenue: 4800,
            channel_cost: 960,
            channel_broker: 0,
            channel_manager: 960,
            channel_director: 0,
            channel_incentive: 0,
            expense_total: 8043,
            expense_city_hr: 5043,
            expense_platform_hr: 1000,
            expense_brand: 1000,
            expense_system: 1000,
            expense_other: 0,
            operating_profit: -4203,        // ⚠️ 亏损
            gtv_ratio_commission: 0.12,
            gtv_ratio_channel: 0.024,
            gtv_ratio_expense: 0.201,
            gtv_ratio_profit: -0.105,
            rev_ratio_channel: 0.20,
            rev_ratio_expense: 1.68,        // 费用超过收入
            rev_ratio_profit: -0.876,
            monthly_target_units: 203,
            standardized_gtv_ratio: 0,
            rental_success_rate: 70,       // 个性化招租难度稍高
            referral_rate: 10,             // 个性化转介绍率偏低
            rework_rate: 10,               // 个性化返修率较高(基于7.2%上调)
            ontime_delivery_rate: 72,      // ⚠️ 个性化交付不确定性高
            avg_lease_months_actual: 14,   // 个性化租期较标准化短(18×0.78)
            renewal_rate: 55,              // 个性化续租率偏低(基于70%下调)
        },
    },
    shanghai: {
        standard: {
            id: 'beike_sh_std',
            city: '上海', product: '标准化', label: '上海标准化',
            gtv_per_unit: 108000,
            commission_rate: 21.9,
            net_revenue: 23652,
            channel_cost: 7020,
            channel_broker: 1080,
            channel_manager: 4320,
            channel_director: 540,
            channel_incentive: 1080,
            expense_total: 5185,
            expense_city_hr: 1405,
            expense_platform_hr: 1080,
            expense_brand: 1080,
            expense_system: 1080,
            expense_other: 540,
            operating_profit: 11447,
            gtv_ratio_commission: 0.219,
            gtv_ratio_channel: 0.065,
            gtv_ratio_expense: 0.048,
            gtv_ratio_profit: 0.106,
            rev_ratio_channel: 0.297,
            rev_ratio_expense: 0.219,
            rev_ratio_profit: 0.484,
            monthly_target_units: 733,
            standardized_gtv_ratio: 86.9,
            rental_success_rate: 80,       // 上海标准化招租较好
            referral_rate: 15,
            rework_rate: 5,                // 上海标准化品控较好
            ontime_delivery_rate: 88,      // ⚠️ 假设
            avg_lease_months_actual: 18,   // 来源：0922报告 美租整装平均租期18月
            renewal_rate: 70,              // 来源：0922报告 美租整装续租率70%
        },
        custom: {
            id: 'beike_sh_cust',
            city: '上海', product: '个性化', label: '上海个性化',
            // 上海个性化无独立UE拆分，使用整体提点率估算
            gtv_per_unit: 96441,            // 个性化平均客单价 (H2 55589717/GTV总量)
            commission_rate: 21.9,
            net_revenue: 21121,
            channel_cost: 7020,
            channel_broker: 1080,
            channel_manager: 4320,
            channel_director: 540,
            channel_incentive: 1080,
            expense_total: 5185,
            expense_city_hr: 1405,
            expense_platform_hr: 1080,
            expense_brand: 1080,
            expense_system: 1080,
            expense_other: 540,
            operating_profit: 8916,
            gtv_ratio_commission: 0.219,
            gtv_ratio_channel: 0.073,
            gtv_ratio_expense: 0.054,
            gtv_ratio_profit: 0.092,
            rev_ratio_channel: 0.332,
            rev_ratio_expense: 0.245,
            rev_ratio_profit: 0.422,
            monthly_target_units: 0,         // 上海个性化由被壳家装提供
            standardized_gtv_ratio: 0,
            rental_success_rate: 75,
            referral_rate: 12,
            rework_rate: 8,                // 上海个性化(基于7.2%微调)
            ontime_delivery_rate: 78,      // ⚠️ 假设
            avg_lease_months_actual: 15,   // 个性化租期较标准化短
            renewal_rate: 58,              // 个性化续租率(基于70%下调)
        },
    },
};

// ==================== 兼容层：DEFAULT_BASELINES (旧代码使用) ====================
// 为兼容governance.js等旧代码，提供扁平化的城市级别基准数据
const DEFAULT_BASELINES = {
    beijing: DEFAULT_BEIKE_MODELS.beijing.standard,
    shanghai: DEFAULT_BEIKE_MODELS.shanghai.standard,
};

// ==================== 供应商 UE 基准模型 ====================
// 数据来源：供应商成本结构截图，每单 GTV ¥72,000 对应的成本拆分
// 供应商总支出 ¥50,367/单 + 贝壳荐客费 ¥11,750/单 = 行业参考
const DEFAULT_SUPPLIER_MODELS = {
    // 供应商成本拆解（适用于标准化产品，基于北京数据）
    standard: {
        id: 'supplier_std',
        label: '标准化供应商UE',
        total_cost: 50367,          // 供应商每单总支出（不含贝壳荐客费）
        gtv_ratio: 69.9,           // 占GTV比率(%)
        // --- 支付给贝壳 ---
        beike_fee: 11750,           // 贝壳荐客费
        beike_fee_pct: 16.3,
        // --- 系统（原酒管 → 系统费用）---
        system_fee: 1320,
        system_fee_pct: 1.8,
        // --- 主材 ---
        furniture: 5094,            // 家具
        furniture_pct: 7.1,
        appliances: 5050,           // 家电
        appliances_pct: 7.0,
        soft_furnishing: 2255,      // 软装
        soft_furnishing_pct: 3.1,
        // --- 施工人力 ---
        gc_boss: -532,              // 总包老板（负值=返利/抵扣）
        gc_boss_pct: -0.7,
        foreman: 28476,             // 工长
        foreman_pct: 39.5,
        designer: 3319,             // 设计师
        designer_pct: 4.6,
        supervisor: 880,            // 监理
        supervisor_pct: 1.2,
        admin: 480,                 // 职能
        admin_pct: 0.7,
        // --- 其他 ---
        formaldehyde: 1050,         // 甲醛治理
        formaldehyde_pct: 1.5,
        invoicing: 2308,            // 开票成本
        invoicing_pct: 3.2,
        capital_invoice: 788,       // 资金票
        capital_invoice_pct: 1.1,
        marketing: 1200,            // 营销费用
        marketing_pct: 1.7,
    },
};

// ==================== 业主 UE 基准模型 ====================
// 业主视角(主)：装修金额 / 全月租金 = 投入产出比
// 业主视角(辅)：租金溢价回本分析
// 成本 = 装修款(含贝壳荐客费+供应商支出) + 空置损失
const DEFAULT_OWNER_MODELS = {
    beijing: {
        standard: {
            id: 'owner_bj_std',
            city: '北京', product: '标准化', label: '北京标准化业主',
            // --- 收入侧 ---
            avg_rent_before: 5500,       // 装修前月租金
            avg_rent_after: 7200,        // 装修后月租金
            rent_premium: 1700,          // 月租金溢价 = after - before
            rent_premium_rate: 30.9,     // 溢价率(%)
            avg_lease_months: 12,        // 平均租期
            total_premium_income: 20400, // 租期总溢价收入 = 1700×12
            vacancy_reduction_days: 10,  // 相比未装修减少的空置天数
            vacancy_reduction_value: 2400, // 减少空置的价值 = (7200/30)×10
            // --- 成本侧 ---
            renovation_total: 100000,    // 装修总款(GTV) = 业主掏的钱
            beike_service_fee: 12000,    // 其中：贝壳荐客费(=GTV×12%)
            supplier_cost: 50367,        // 其中：供应商执行成本
            supplier_margin: 37633,      // 其中：供应商利润/管理费
            vacancy_days: 25,            // 装修期+招租空置天数
            vacancy_cost: 6000,          // 空置损失 = (7200/30)×25
            // --- 回报 ---
            first_year_return: 20400,    // 首年租金溢价收入
            payback_months: 59,          // 回本月数 = 装修总款/月溢价(不考虑空置)
            annual_yield: 20.4,          // 年化收益率 = 20400/100000
            roi_3year: -38.8,            // 3年ROI = (20400×3 - 100000 - 6000) / 100000
            roi_5year: 2.0,              // 5年ROI
        },
        custom: {
            id: 'owner_bj_cust',
            city: '北京', product: '个性化', label: '北京个性化业主',
            avg_rent_before: 4200,
            avg_rent_after: 5000,
            rent_premium: 800,
            rent_premium_rate: 19.0,
            avg_lease_months: 12,
            total_premium_income: 9600,
            vacancy_reduction_days: 5,
            vacancy_reduction_value: 833,
            renovation_total: 40000,
            beike_service_fee: 4800,
            supplier_cost: 28000,
            supplier_margin: 7200,
            vacancy_days: 20,
            vacancy_cost: 3333,
            first_year_return: 9600,
            payback_months: 50,
            annual_yield: 24.0,
            roi_3year: -28.0,
            roi_5year: 20.0,
        },
    },
    shanghai: {
        standard: {
            id: 'owner_sh_std',
            city: '上海', product: '标准化', label: '上海标准化业主',
            avg_rent_before: 6200,
            avg_rent_after: 8100,
            rent_premium: 1900,
            rent_premium_rate: 30.6,
            avg_lease_months: 12,
            total_premium_income: 22800,
            vacancy_reduction_days: 10,
            vacancy_reduction_value: 2700,
            renovation_total: 108000,
            beike_service_fee: 23652,    // GTV×21.9%
            supplier_cost: 55000,
            supplier_margin: 29348,
            vacancy_days: 20,
            vacancy_cost: 5400,
            first_year_return: 22800,
            payback_months: 57,
            annual_yield: 21.1,
            roi_3year: -36.7,
            roi_5year: 5.6,
        },
        custom: {
            id: 'owner_sh_cust',
            city: '上海', product: '个性化', label: '上海个性化业主',
            avg_rent_before: 5800,
            avg_rent_after: 7200,
            rent_premium: 1400,
            rent_premium_rate: 24.1,
            avg_lease_months: 12,
            total_premium_income: 16800,
            vacancy_reduction_days: 5,
            vacancy_reduction_value: 1200,
            renovation_total: 96441,
            beike_service_fee: 21121,
            supplier_cost: 48000,
            supplier_margin: 27320,
            vacancy_days: 18,
            vacancy_cost: 4320,
            first_year_return: 16800,
            payback_months: 69,
            annual_yield: 17.4,
            roi_3year: -47.7,
            roi_5year: -13.0,
        },
    },
};

// ==================== 人力规划数据 ====================
const TEAM_STRUCTURE = {
    beijing: {
        h2_headcount: 20,
        avg_salary: 29000,
        h2_total_hr_cost: 3480000,
        hr_cost_per_unit: 5043,
        roles: {
            regional_ops: 9, product_design: 1, engineering: 3,
            supply_chain: 4, strategy: 1, settlement: 1, leader: 1
        },
        h2_monthly_efficiency: {
            regional_ops: 12.78, product_design: 115, engineering: 38.33,
            supply_chain: 28.75
        },
    },
    shanghai: {
        h2_headcount: 34,
        avg_salary: 30305,
        h2_total_hr_cost: 6182220,
        hr_cost_per_unit: 1405,
        roles: {
            regional_ops: 10, product_design: 3, engineering: 10,
            procurement: 3, supply_chain: 3, strategy: 4, leader: 1
        },
        h2_monthly_efficiency: {
            regional_ops: 73.33, product_design: 244.44, engineering: 73.33,
            procurement: 244.44, supply_chain: 244.44
        },
    },
};

// ==================== 业务目标（月度）====================
const MONTHLY_TARGETS = {
    beijing: {
        standard: {
            units:   [0, 7, 68, 49, 59, 100, 100, 120, 100, 120, 150, 100],
            gtv:     [0, 878017, 5981839, 4486235, 5305382, 10000000, 10000000, 12000000, 10000000, 12000000, 15000000, 10000000],
            revenue: [0, 105362, 717821, 538348, 636646, 1200000, 1200000, 1440000, 1200000, 1440000, 1800000, 1200000],
        },
        custom: {
            units:   [0, 0, 0, 6, 38, 50, 200, 200, 200, 200, 220, 200],
            gtv:     [0, 0, 0, 142560, 1002480, 1150000, 4600000, 4600000, 4600000, 4600000, 5060000, 4600000],
            revenue: [0, 0, 0, 17107, 120298, 138000, 552000, 552000, 552000, 552000, 607200, 552000],
        },
    },
    shanghai: {
        standard: {
            units:   [6, 13, 136, 150, 300, 400, 450, 600, 700, 750, 900, 1000],
            gtv:     [651642, 1040000, 11790384, 12750000, 25500000, 32000000, 36000000, 48000000, 59500000, 63750000, 76500000, 85000000],
            revenue: [142710, 227760, 2582094, 2792250, 5584500, 7008000, 7884000, 10512000, 13030500, 13961250, 16753500, 18615000],
        },
        custom: {
            units:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 上海个性化由被壳家装提供
            gtv:     [3922140, 4235243, 8184548, 8512410, 9130168, 8579312, 8060081, 9217244, 9258307, 8884152, 10074753, 10095180],
            revenue: [858949, 927518, 1792416, 1864218, 1999507, 1878869, 1765158, 2018576, 2027569, 1945629, 2206371, 2210844],
        },
    },
};

// ==================== E 杠杆定义（三视角）====================
const E_LEVERS_3V = {
    // --- 贝壳视角 E 杠杆 ---
    beike: [
        // 收入侧
        { key: 'commission_rate', label: '业务提点率', unit: '%', group: '收入↑', type: 'price', color: '#2f9668', baseField: 'commission_rate', adjustStep: 1, min: 5, max: 30 },
        { key: 'gtv_per_unit', label: '单套GTV', unit: '元', group: '收入↑', type: 'price', color: '#2f9668', baseField: 'gtv_per_unit', adjustStep: 5000, min: 20000, max: 200000 },
        { key: 'monthly_target_units', label: '月签约单量', unit: '单', group: '效率↑', type: 'efficiency', color: '#8b5cf6', baseField: 'monthly_target_units', adjustStep: 20, min: 0, max: 2000 },
        // 渠道成本
        { key: 'channel_manager', label: '美租顾问提佣', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'channel_manager', adjustStep: -200, min: 0, max: 10000 },
        { key: 'channel_broker', label: '经纪人佣金', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'channel_broker', adjustStep: -200, min: 0, max: 5000 },
        { key: 'channel_director', label: '总监提佣', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'channel_director', adjustStep: -100, min: 0, max: 3000 },
        { key: 'channel_incentive', label: '业务激励', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'channel_incentive', adjustStep: -200, min: 0, max: 5000 },
        // 费用摊销
        { key: 'expense_city_hr', label: '城市人工摊销', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'expense_city_hr', adjustStep: -500, min: 0, max: 20000 },
        { key: 'expense_brand', label: '品牌营销摊销', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'expense_brand', adjustStep: -200, min: 0, max: 5000 },
        { key: 'expense_system', label: '系统建设摊销', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'expense_system', adjustStep: -200, min: 0, max: 5000 },
        // 预留杠杆
        { key: 'rental_success_rate', label: '招租成功率', unit: '%', group: '效率↑', type: 'efficiency', color: '#8b5cf6', baseField: 'rental_success_rate', adjustStep: 5, min: 50, max: 100 },
        { key: 'referral_rate', label: '口碑回单率', unit: '%', group: '效率↑', type: 'efficiency', color: '#8b5cf6', baseField: 'referral_rate', adjustStep: 3, min: 0, max: 50 },
    ],
    // --- 业主视角 E 杠杆 ---
    owner: [
        { key: 'rent_premium', label: '月租金溢价', unit: '元', group: '收入↑', type: 'price', color: '#2f9668', baseField: 'rent_premium', adjustStep: 200, min: 0, max: 5000 },
        { key: 'avg_lease_months', label: '平均租期', unit: '月', group: '收入↑', type: 'price', color: '#2f9668', baseField: 'avg_lease_months', adjustStep: 3, min: 6, max: 36 },
        { key: 'vacancy_days', label: '空置天数', unit: '天', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'vacancy_days', adjustStep: -5, min: 0, max: 60 },
        { key: 'renovation_total', label: '装修总价(GTV)', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'renovation_total', adjustStep: -5000, min: 20000, max: 200000 },
        { key: 'beike_service_fee', label: '贝壳荐客费', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'beike_service_fee', adjustStep: -1000, min: 0, max: 50000 },
        { key: 'vacancy_reduction_days', label: '空置减少天数', unit: '天', group: '收入↑', type: 'efficiency', color: '#8b5cf6', baseField: 'vacancy_reduction_days', adjustStep: 3, min: 0, max: 30 },
    ],
    // --- 供应商视角 E 杠杆 ---
    supplier: [
        { key: 'foreman', label: '工长成本', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'foreman', adjustStep: -2000, min: 10000, max: 50000 },
        { key: 'furniture', label: '家具成本', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'furniture', adjustStep: -500, min: 1000, max: 15000 },
        { key: 'appliances', label: '家电成本', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'appliances', adjustStep: -500, min: 1000, max: 15000 },
        { key: 'system_fee', label: '系统费用', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'system_fee', adjustStep: -200, min: 0, max: 5000 },
        { key: 'designer', label: '设计师费用', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'designer', adjustStep: -300, min: 500, max: 10000 },
        { key: 'soft_furnishing', label: '软装成本', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'soft_furnishing', adjustStep: -300, min: 500, max: 8000 },
        { key: 'beike_fee', label: '贝壳荐客费', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'beike_fee', adjustStep: -1000, min: 0, max: 30000 },
        { key: 'invoicing', label: '开票成本', unit: '元', group: '成本↓', type: 'cost', color: '#ef4444', baseField: 'invoicing', adjustStep: -300, min: 0, max: 8000 },
    ],
};

// ==================== UE 参数元定义 ====================
const UE_PARAMS_3V = {
    beike: [
        { key: 'gtv_per_unit', label: '单套GTV', unit: '元', category: '收入' },
        { key: 'commission_rate', label: '业务提点率', unit: '%', category: '收入' },
        { key: 'net_revenue', label: '净收入', unit: '元', category: '收入' },
        { key: 'channel_cost', label: '渠道成本', unit: '元', category: '成本' },
        { key: 'channel_manager', label: '├ 美租顾问', unit: '元', category: '成本' },
        { key: 'channel_broker', label: '├ 经纪人', unit: '元', category: '成本' },
        { key: 'channel_director', label: '├ 总监', unit: '元', category: '成本' },
        { key: 'channel_incentive', label: '├ 业务激励', unit: '元', category: '成本' },
        { key: 'expense_total', label: '费用摊销', unit: '元', category: '成本' },
        { key: 'expense_city_hr', label: '├ 城市人工', unit: '元', category: '成本' },
        { key: 'expense_platform_hr', label: '├ 平台人工', unit: '元', category: '成本' },
        { key: 'expense_brand', label: '├ 品牌营销', unit: '元', category: '成本' },
        { key: 'expense_system', label: '├ 系统建设', unit: '元', category: '成本' },
        { key: 'expense_other', label: '├ 其他运营', unit: '元', category: '成本' },
        { key: 'operating_profit', label: '运营利润', unit: '元', category: '利润' },
    ],
    owner: [
        { key: 'avg_rent_before', label: '装修前月租', unit: '元/月', category: '基础' },
        { key: 'avg_rent_after', label: '装修后月租', unit: '元/月', category: '基础' },
        { key: 'rent_premium', label: '月租金溢价', unit: '元', category: '收入' },
        { key: 'rent_premium_rate', label: '溢价率', unit: '%', category: '收入' },
        { key: 'total_premium_income', label: '租期总溢价收入', unit: '元', category: '收入' },
        { key: 'vacancy_reduction_value', label: '空置减少价值', unit: '元', category: '收入' },
        { key: 'renovation_total', label: '装修总款(GTV)', unit: '元', category: '成本' },
        { key: 'beike_service_fee', label: '├ 贝壳荐客费', unit: '元', category: '成本' },
        { key: 'supplier_cost', label: '├ 供应商执行', unit: '元', category: '成本' },
        { key: 'vacancy_cost', label: '空置损失', unit: '元', category: '成本' },
        { key: 'payback_months', label: '回本月数', unit: '月', category: '回报' },
        { key: 'annual_yield', label: '年化收益率', unit: '%', category: '回报' },
    ],
    supplier: [
        { key: 'total_cost', label: '每单总成本', unit: '元', category: '总计' },
        { key: 'beike_fee', label: '贝壳荐客费', unit: '元', category: '平台' },
        { key: 'system_fee', label: '系统', unit: '元', category: '其他' },
        { key: 'foreman', label: '工长', unit: '元', category: '施工' },
        { key: 'furniture', label: '家具', unit: '元', category: '主材' },
        { key: 'appliances', label: '家电', unit: '元', category: '主材' },
        { key: 'soft_furnishing', label: '软装', unit: '元', category: '主材' },
        { key: 'designer', label: '设计师', unit: '元', category: '施工' },
        { key: 'supervisor', label: '监理', unit: '元', category: '施工' },
        { key: 'invoicing', label: '开票', unit: '元', category: '其他' },
        { key: 'marketing', label: '营销', unit: '元', category: '其他' },
    ],
};

// ==================== 兼容：SCALE_PARAMS (旧模块用) ====================
const SCALE_PARAMS = [
    { key: 'monthlyUnits', label: '月签约套数', unit: '套', min: 50, max: 2000, step: 10 },
    { key: 'growthRate', label: '月增长率', unit: '%', min: 0, max: 50, step: 1 },
    { key: 'projectionMonths', label: '推演月数', unit: '月', min: 3, max: 12, step: 1 },
];

// ==================== 兼容：UE_PARAMS 平面数组 (旧模块用) ====================
const UE_PARAMS = [
    { key: 'gtv_per_unit', label: '单套GTV', unit: '元', min: 20000, max: 200000, step: 5000, category: '收入' },
    { key: 'commission_rate', label: '业务提点率', unit: '%', min: 5, max: 30, step: 0.5, category: '收入' },
    { key: 'net_revenue', label: '净收入', unit: '元', min: 0, max: 50000, step: 500, category: '收入' },
    { key: 'channel_cost', label: '渠道成本', unit: '元', min: 0, max: 20000, step: 200, category: '成本' },
    { key: 'channel_manager', label: '资管经理提佣', unit: '元', min: 0, max: 10000, step: 100, category: '成本' },
    { key: 'channel_broker', label: '经纪人佣金', unit: '元', min: 0, max: 5000, step: 100, category: '成本' },
    { key: 'channel_director', label: '总监提佣', unit: '元', min: 0, max: 3000, step: 100, category: '成本' },
    { key: 'channel_incentive', label: '业务激励', unit: '元', min: 0, max: 5000, step: 100, category: '成本' },
    { key: 'expense_total', label: '费用摊销', unit: '元', min: 0, max: 30000, step: 500, category: '成本' },
    { key: 'expense_city_hr', label: '城市人工', unit: '元', min: 0, max: 20000, step: 500, category: '成本' },
    { key: 'expense_platform_hr', label: '平台人工', unit: '元', min: 0, max: 5000, step: 200, category: '成本' },
    { key: 'expense_brand', label: '品牌营销', unit: '元', min: 0, max: 5000, step: 200, category: '成本' },
    { key: 'expense_system', label: '系统建设', unit: '元', min: 0, max: 5000, step: 200, category: '成本' },
    { key: 'expense_other', label: '其他运营', unit: '元', min: 0, max: 5000, step: 200, category: '成本' },
    { key: 'operating_profit', label: '运营利润', unit: '元', min: -10000, max: 30000, step: 500, category: '利润' },
    { key: 'monthly_target_units', label: '月签约单量', unit: '单/月', min: 0, max: 2000, step: 10, category: '运营' },
    { key: 'standardized_gtv_ratio', label: '标准化GTV占比', unit: '%', min: 0, max: 100, step: 1, category: '运营' },
];

// ==================== 兼容：UE_PARAM_DEFINITIONS (alignment.js使用) ====================
const UE_PARAM_DEFINITIONS = {
    gtv_per_unit: { label: '单套GTV', unit: '元', category: '收入' },
    commission_rate: { label: '业务提点率', unit: '%', category: '收入' },
    net_revenue: { label: '净收入', unit: '元', category: '收入' },
    channel_cost: { label: '渠道成本', unit: '元', category: '成本' },
    channel_manager: { label: '美租顾问提佣', unit: '元', category: '成本' },
    channel_broker: { label: '经纪人佣金', unit: '元', category: '成本' },
    channel_director: { label: '总监提佣', unit: '元', category: '成本' },
    channel_incentive: { label: '业务激励', unit: '元', category: '成本' },
    expense_total: { label: '费用摊销', unit: '元', category: '成本' },
    expense_city_hr: { label: '城市人工', unit: '元', category: '成本' },
    expense_platform_hr: { label: '平台人工', unit: '元', category: '成本' },
    expense_brand: { label: '品牌营销', unit: '元', category: '成本' },
    expense_system: { label: '系统建设', unit: '元', category: '成本' },
    expense_other: { label: '其他运营', unit: '元', category: '成本' },
    operating_profit: { label: '运营利润', unit: '元', category: '利润' },
    monthly_target_units: { label: '月签约单量', unit: '单/月', category: '运营' },
    standardized_gtv_ratio: { label: '标准化GTV占比', unit: '%', category: '运营' },
    // 业主视角参数
    rent_premium: { label: '月租金溢价', unit: '元/月', category: '收入' },
    avg_lease_months: { label: '平均租期', unit: '月', category: '收入' },
    vacancy_days: { label: '空置天数', unit: '天', category: '成本' },
    renovation_total: { label: '装修总价(GTV)', unit: '元', category: '成本' },
    beike_service_fee: { label: '贝壳荐客费', unit: '元', category: '成本' },
    vacancy_reduction_days: { label: '空置减少天数', unit: '天', category: '收入' },
    // 供应商视角参数
    foreman: { label: '工长成本', unit: '元', category: '成本' },
    furniture: { label: '家具成本', unit: '元', category: '成本' },
    appliances: { label: '家电成本', unit: '元', category: '成本' },
    system_fee: { label: '系统费用', unit: '元', category: '成本' },
    designer: { label: '设计师费用', unit: '元', category: '成本' },
    soft_furnishing: { label: '软装成本', unit: '元', category: '成本' },
    beike_fee: { label: '贝壳荐客费', unit: '元', category: '成本' },
    invoicing: { label: '开票成本', unit: '元', category: '成本' },
};

// ==================== 战略假设 ====================
// 支持三视角参数调整：beike(贝壳)/owner(业主)/supplier(供应商)
const DEFAULT_ASSUMPTIONS = [
    // === 市场空间假设组：拆分为三个具体可验证的假设 ===
    {
        id: 'asmp_focus_penetration',
        assumption_name: '聚焦盘渗透率可达10%',
        category: '获客',
        description: '聚焦盘（两高一低：高楼龄+高坪效+房况差）推房有效率目标从全量0.2%提升至1%，整体市场渗透率达10%。基于0922报告数据，按楼龄/坪效/HQI三维交叉分层。',
        impact_level: '高',
        confidence_level: 75,
        validation_status: '验证中',
        validation_result: '北京H2渗透率2.5%，聚焦盘推房有效率0.85%（vs全量0.2%），距离1%目标仍有提升空间。',
        // 三场景参数配置
        scenarios: {
            conservative: {
                name: '保守渗透 5%',
                probability: 0.25,
                param_adjustments: { 
                    monthly_target_units: 1.08, conversion_rate: 0.95, gtv_per_unit: 0.92,
                    avg_rent_after: 0.95, rent_premium: 0.92, renovation_total: 0.95, vacancy_days: 1.10,
                    total_cost: 1.02, foreman: 1.03, furniture: 1.02
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', gtv_per_unit: 'multiply',
                    avg_rent_after: 'multiply', rent_premium: 'multiply', renovation_total: 'multiply', vacancy_days: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply'
                }
            },
            target: {
                name: '目标渗透 10%⭐',
                probability: 0.50,
                param_adjustments: { 
                    monthly_target_units: 1.74, conversion_rate: 1.20, gtv_per_unit: 1.05,
                    avg_rent_after: 1.08, rent_premium: 1.15, renovation_total: 1.0, vacancy_days: 0.90,
                    total_cost: 0.98, foreman: 0.97, furniture: 0.98
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', gtv_per_unit: 'multiply',
                    avg_rent_after: 'multiply', rent_premium: 'multiply', renovation_total: 'multiply', vacancy_days: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '乐观渗透 18%',
                probability: 0.25,
                param_adjustments: { 
                    monthly_target_units: 3.2, conversion_rate: 1.45, gtv_per_unit: 1.15,
                    avg_rent_after: 1.18, rent_premium: 1.30, renovation_total: 1.05, vacancy_days: 0.75,
                    total_cost: 0.93, foreman: 0.92, furniture: 0.94
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', gtv_per_unit: 'multiply',
                    avg_rent_after: 'multiply', rent_premium: 'multiply', renovation_total: 'multiply', vacancy_days: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply'
                }
            }
        },
        // 三视角参数调整（兼容旧版）
        param_adjustments: { monthly_target_units: 1.74, conversion_rate: 1.15, avg_rent_after: 1.08, rent_premium: 1.15 },
        adjustment_type: { monthly_target_units: 'multiply', conversion_rate: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply' },
        // BLM实验设计
        bml_experiment: {
            status: '验证中',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '北京-朝阳区-聚焦盘（高楼龄20年++高坪效100元/㎡+/月+房况HQI<60）',
                control_group: '北京-海淀区-普通盘（随机房源，无筛选标准）',
                duration_weeks: 12,
                sample_size: 400
            },
            metrics: [
                { param: 'focus_push_efficiency', target: 1.0, current: 0.85, unit: '%' },
                { param: 'conversion_rate', target: 1.15, current: 1.0, unit: '倍数' },
                { param: 'payback_months', target: 18, current: 16, unit: '月' }
            ],
            results: {
                actual_data: {
                    treatment_conversion: 0.92,
                    control_conversion: 0.20,
                    lift: 4.6
                },
                conclusion: '聚焦盘转化率4.6倍于普通盘，验证了"两高一低"筛选标准的有效性',
                learnings: '聚焦盘虽然池子小，但转化率极高，单位投入产出比更优。建议扩大聚焦盘覆盖范围。'
            }
        },
        // 四维度分析
        strategic_analysis: '从"满天开花"到"两高一低"是战略聚焦的关键转变。聚焦盘定义为：楼龄20年+、坪效≥100元/㎡/月、HQI<60。0922报告显示此类房源推房有效率可达0.85%，显著高于全量0.2%。',
        financial_analysis: '有效市场8.25万套×10%渗透率=0.83万套/年。单套利润¥5,800，年利润¥4,814万。聚焦盘客单价¥8.5万 vs 普通盘¥6.2万，LTV更高。',
        hr_analysis: '需扩充资管团队，北京20→40人。聚焦盘需要更强的房源筛选能力，人均月签目标5单（质量优先）。',
        market_analysis: '存量住房老化加速，房龄迈入15年+总量年增2.1万套。一线城市老旧房源装修需求刚性，业主付费意愿强。',
        risk_factors: '宏观经济下行导致租赁市场收缩；聚焦盘定义过窄可能限制规模；竞争对手同质化筛选',
        timeline: '2025Q2-Q4',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_price_range',
        assumption_name: '客单价3-10万区间可行',
        category: '获客',
        description: '整装客单价在3-10万区间可覆盖80%以上目标客群。低于3万无法保证品质，高于10万超出大众消费能力。北京H2平均客单价9.6万（含个性化），标准化产品目标6-8万。',
        impact_level: '高',
        confidence_level: 80,
        validation_status: '已验证',
        validation_result: '北京H2平均客单价¥96,441（个性化占比28.9%）。上海¥69,024（个性化占比13.1%）。标准化产品客单价目标6-8万已验证可行。',
        scenarios: {
            conservative: {
                name: '低客单3-5万 品质担忧',
                probability: 0.20,
                param_adjustments: { 
                    gtv_per_unit: 0.60, standardized_gtv_ratio: 90, conversion_rate: 0.85,
                    renovation_total: 0.50, avg_rent_after: 0.85, rent_premium: 0.70, supplier_cost: 0.55,
                    total_cost: 0.55, foreman: 0.52, furniture: 0.58, appliances: 0.55
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', standardized_gtv_ratio: 'set', conversion_rate: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply', supplier_cost: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply', appliances: 'multiply'
                }
            },
            target: {
                name: '标准客单6-8万⭐',
                probability: 0.60,
                param_adjustments: { 
                    gtv_per_unit: 0.85, standardized_gtv_ratio: 85, conversion_rate: 1.15,
                    renovation_total: 0.80, avg_rent_after: 1.0, rent_premium: 1.0, supplier_cost: 0.85,
                    total_cost: 0.85, foreman: 0.82, furniture: 0.88, appliances: 0.85
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', standardized_gtv_ratio: 'set', conversion_rate: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply', supplier_cost: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply', appliances: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '高客单10万+ 高端突破',
                probability: 0.20,
                param_adjustments: { 
                    gtv_per_unit: 1.30, standardized_gtv_ratio: 70, conversion_rate: 1.05,
                    renovation_total: 1.40, avg_rent_after: 1.25, rent_premium: 1.50, supplier_cost: 1.35,
                    total_cost: 1.35, foreman: 1.32, furniture: 1.38, appliances: 1.35
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', standardized_gtv_ratio: 'set', conversion_rate: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply', supplier_cost: 'multiply',
                    total_cost: 'multiply', foreman: 'multiply', furniture: 'multiply', appliances: 'multiply'
                }
            }
        },
        param_adjustments: { gtv_per_unit: 0.85, standardized_gtv_ratio: 85 },
        adjustment_type: { gtv_per_unit: 'multiply', standardized_gtv_ratio: 'set' },
        bml_experiment: {
            status: '已验证',
            experiment_type: '时段对照',
            experiment_design: {
                treatment_group: '2025H1-标准化产品主推（6-8万套餐）',
                control_group: '2024H2-混合产品（个性化+标准化）',
                duration_weeks: 26,
                sample_size: 1200
            },
            metrics: [
                { param: 'avg_gtv', target: 75000, current: 96441, unit: '元' },
                { param: 'conversion_rate', target: 12, current: 8.5, unit: '%' },
                { param: 'gross_margin', target: 8, current: 4.8, unit: '%' }
            ],
            results: {
                actual_data: {
                    standardized_avg_price: 78500,
                    personalized_avg_price: 142000,
                    price_elasticity: -0.35
                },
                conclusion: '6-8万标准化产品转化率12.3%，显著高于10万+产品的6.8%。客单价降低18%，转化率提升45%，总利润提升22%。',
                learnings: '3-5万区间因品质担忧转化率反而下降；8-10万区间利润最优；超过12万进入小众市场，规模受限。'
            }
        },
        strategic_analysis: '客单价是UE的核心杠杆。北京当前9.6万客单价（含28.9%个性化）过高，压制了转化率。上海6.9万客单价模型已验证可行，北京需跟进。',
        financial_analysis: '客单价从9.6万→7.5万（-22%），但转化率8.5%→12%（+41%），月签单量提升，固定费用摊销降低，整体UE改善¥1,200/单。',
        hr_analysis: '低客单产品降低销售难度，新人开单周期从3个月缩短至1.5个月。',
        market_analysis: '3-5万：刚需客群，关注基础功能，价格敏感；6-8万：改善客群，关注品质性价比，主力市场；8-10万：品质客群，关注设计和服务。',
        risk_factors: '过度降价损害品牌形象；价格战压缩利润；高端客群流失',
        timeline: '2025H1-H2',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_pricing_strategy',
        assumption_name: '产品定价区间策略',
        category: '获客',
        description: '建立差异化定价体系：简装3-5万（引流款）、标准6-8万（主力款）、品质8-10万（利润款）。通过价格锚定和套餐组合提升客单价和转化率。',
        impact_level: '中',
        confidence_level: 70,
        validation_status: '待验证',
        validation_result: '当前仅有一套定价体系，缺乏差异化。计划Q2推出三档定价试点。',
        scenarios: {
            conservative: {
                name: '保守定价 单一套餐',
                probability: 0.30,
                param_adjustments: { 
                    gtv_per_unit: 0.85, conversion_rate: 0.90, commission_rate: 0.95,
                    renovation_total: 0.95, furniture: 0.95, appliances: 0.95
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', commission_rate: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply', appliances: 'multiply'
                }
            },
            target: {
                name: '差异化定价 三档套餐⭐',
                probability: 0.50,
                param_adjustments: { 
                    gtv_per_unit: 1.08, conversion_rate: 1.15, commission_rate: 1.0,
                    renovation_total: 1.05, furniture: 1.08, appliances: 1.05
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', commission_rate: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply', appliances: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '动态定价 个性化报价',
                probability: 0.20,
                param_adjustments: { 
                    gtv_per_unit: 1.25, conversion_rate: 1.30, commission_rate: 1.05,
                    renovation_total: 1.20, furniture: 1.15, appliances: 1.12, designer: 1.30
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', commission_rate: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply', appliances: 'multiply', designer: 'multiply'
                }
            }
        },
        param_adjustments: { gtv_per_unit: 1.05, conversion_rate: 1.12 },
        adjustment_type: { gtv_per_unit: 'multiply', conversion_rate: 'multiply' },
        bml_experiment: {
            status: '待验证',
            experiment_type: '阶梯投放',
            experiment_design: {
                treatment_group: '北京-朝阳区-三档定价（简装/标准/品质）',
                control_group: '北京-其他区-单一标准定价',
                duration_weeks: 16,
                sample_size: 600
            },
            metrics: [
                { param: 'conversion_rate', target: 12, current: 8.5, unit: '%' },
                { param: 'avg_gtv', target: 82000, current: 75000, unit: '元' },
                { param: 'package_mix', target: '20/60/20', current: '0/100/0', unit: '简/标/品占比' }
            ],
            results: {
                actual_data: {},
                conclusion: '实验尚未启动',
                learnings: '待验证假设：三档定价通过锚定效应提升主力款转化率；简装款引流+品质款提升品牌形象'
            }
        },
        strategic_analysis: '定价即定位。单一价格无法覆盖多层次客群。学习互联网"引流款+利润款"组合策略，建立价格锚定。',
        financial_analysis: '预计简装款毛利率3%（引流），标准款毛利率8%（主力），品质款毛利率12%（利润）。组合毛利率目标8.5%，高于当前4.8%。',
        hr_analysis: '销售需培训新产品知识和报价策略，增加销售复杂度但能提升人均产出。',
        market_analysis: '竞品多采用套餐定价，我方可通过透明化清单定价形成差异化。',
        risk_factors: '定价体系复杂导致客户选择困难；简装款品质投诉风险；价格歧视引发客诉',
        timeline: '2025Q3-Q4',
        priority: 2,
        is_active: true
    },
    // === 局装→整装 转型假设 ===
    {
        id: 'asmp_renovation_upgrade',
        assumption_name: '局装客户可升级为整装',
        category: '获客',
        description: '验证局装（软装/局改，客单价1-2万）客户是否可以转化为整装（全屋翻新，客单价8万）。通过渐进式服务建立信任，实现客户LTV翻倍。',
        impact_level: '高',
        confidence_level: 60,
        validation_status: '待验证',
        validation_result: '当前局装与整装业务割裂，缺乏转化路径。理论上局装客户是整装的高潜客户（已验证装修需求+服务信任），但转化机制尚未建立。',
        scenarios: {
            conservative: {
                name: '转化率8% 转化周期长',
                probability: 0.35,
                param_adjustments: { 
                    gtv_per_unit: 1.05, conversion_rate: 0.95, channel_cost: 1.15,
                    renovation_total: 1.0, avg_rent_after: 1.0
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', channel_cost: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply'
                }
            },
            target: {
                name: '转化率20%⭐',
                probability: 0.50,
                param_adjustments: { 
                    gtv_per_unit: 1.35, conversion_rate: 1.15, channel_cost: 1.0,
                    renovation_total: 1.35, avg_rent_after: 1.20, rent_premium: 1.35
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', channel_cost: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '转化率30% 口碑裂变',
                probability: 0.15,
                param_adjustments: { 
                    gtv_per_unit: 1.25, conversion_rate: 1.30, channel_cost: 0.90,
                    renovation_total: 1.25, avg_rent_after: 1.25, rent_premium: 1.40
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', conversion_rate: 'multiply', channel_cost: 'multiply',
                    renovation_total: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply'
                }
            }
        },
        param_adjustments: { gtv_per_unit: 1.35, conversion_rate: 1.10 },
        adjustment_type: { gtv_per_unit: 'multiply', conversion_rate: 'multiply' },
        bml_experiment: {
            status: '待验证',
            experiment_type: '时段对照',
            experiment_design: {
                treatment_group: '局装后6个月内主动推荐整装升级方案',
                control_group: '局装后无主动跟进，等待客户自发需求',
                duration_weeks: 24,
                sample_size: 500
            },
            metrics: [
                { param: 'upgrade_rate', target: 20, current: 0, unit: '%', desc: '局装→整装转化率' },
                { param: 'upgrade_time', target: 6, current: 0, unit: '月', desc: '平均转化周期' },
                { param: 'upgrade_gtv', target: 80000, current: 15000, unit: '元', desc: '升级后客单价' }
            ],
            results: {
                actual_data: {},
                conclusion: '实验尚未启动，计划2025Q2启动',
                learnings: '待验证假设：局装客户转化率20%，转化周期6个月。关键成功因素：1)局装交付品质建立信任；2)时机把握（入住后发现全屋问题）；3)升级方案吸引力（差价抵扣）。'
            }
        },
        strategic_analysis: '市场机会分析显示局装TAM 155万套/年，整装TAM 45.9万套/年。局装是流量入口，整装是利润来源。从"软品牌→模块品牌→标准品牌"的三级跳，需要建立客户升级路径。',
        financial_analysis: '局装客单价¥1.5万，整装¥8万。转化率20%意味着每5个局装客户转化1个整装，单客户LTV从¥1.5万提升至¥2.8万（¥1.5万+¥8万×20%×折扣系数）。同时获客成本被摊薄，局装CAC可视为整装获客投入。',
        hr_analysis: '需要建立"客户成功"角色，负责局装客户的长期维护和整装转化。不同于销售顾问的一次性成交，客户成功需要持续6-12个月的跟进。',
        market_analysis: '局装是低门槛入口，客户决策快、风险低。整装是高价值服务，客户决策慢、要求高。局装→整装的转化是"流量→留量→增量"的商业逻辑。',
        risk_factors: '局装交付品质不佳反而损害整装转化；过度推销引起客户反感；局装客户预算有限，对整装价格敏感；转化周期长，跟进成本高',
        timeline: '2025Q2-Q4',
        priority: 2,
        is_active: true
    },
    // === 产品组合假设：卖多款 vs 卖一款 ===
    {
        id: 'asmp_product_mix',
        assumption_name: '产品组合转化率优于单一产品',
        category: '产品',
        description: '验证"多产品组合销售"是否比"单一主力产品销售"转化率更高。通过设置不同区域（北京-朝阳区/海淀区/丰台区）和销售方式（顾问推荐/自主选购/套餐组合），测试产品矩阵对转化率的影响。',
        impact_level: '高',
        confidence_level: 65,
        validation_status: '待验证',
        validation_result: '理论基础：选择悖论 vs 锚定效应。产品组合提供更多入口，但可能增加决策复杂度。待实验验证。',
        // 三场景参数配置
        scenarios: {
            conservative: {
                name: '选择困难 转化率-10%',
                probability: 0.30,
                param_adjustments: { 
                    conversion_rate: 0.90, decision_days: 1.30, gtv_per_unit: 0.95,
                    renovation_total: 0.95, furniture: 0.90
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', decision_days: 'multiply', gtv_per_unit: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply'
                }
            },
            target: {
                name: '组合转化率+15%⭐',
                probability: 0.50,
                param_adjustments: { 
                    conversion_rate: 1.15, gtv_per_unit: 1.08, monthly_target_units: 1.10, decision_days: 0.90,
                    renovation_total: 1.08, furniture: 1.10, appliances: 1.05
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', gtv_per_unit: 'multiply', monthly_target_units: 'multiply', decision_days: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply', appliances: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '锚定效应+30%转化',
                probability: 0.20,
                param_adjustments: { 
                    conversion_rate: 1.30, gtv_per_unit: 1.18, monthly_target_units: 1.30, decision_days: 0.75,
                    renovation_total: 1.20, furniture: 1.20, appliances: 1.15, avg_rent_after: 1.10
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', gtv_per_unit: 'multiply', monthly_target_units: 'multiply', decision_days: 'multiply',
                    renovation_total: 'multiply', furniture: 'multiply', appliances: 'multiply', avg_rent_after: 'multiply'
                }
            }
        },
        // 三视角参数调整（兼容旧版）
        param_adjustments: { conversion_rate: 1.12, gtv_per_unit: 1.05 },
        adjustment_type: { conversion_rate: 'multiply', gtv_per_unit: 'multiply' },
        // BLM实验设计：多维度对照
        bml_experiment: {
            status: '待验证',
            experiment_type: '城市对照',
            experiment_design: {
                // 维度1：区域对照
                treatment_group: '北京-朝阳区-多产品组合（简装/标准/品质三档可选）',
                control_group: '北京-海淀区-单一主力产品（仅标准款）',
                duration_weeks: 16,
                sample_size: 800,
                // 维度2：销售方式对照（在实验组内部）
                sub_groups: {
                    advisor_driven: '顾问主导推荐（基于客户需求匹配产品）',
                    self_service: '自主选购（客户自行浏览选择）',
                    bundle_first: '套餐组合优先（主推套餐，单产品为补充）'
                }
            },
            metrics: [
                { param: 'overall_conversion_rate', target: 12.5, current: 11.2, unit: '%', desc: '整体转化率' },
                { param: 'consult_to_order_rate', target: 35, current: 28, unit: '%', desc: '咨询→下单转化率' },
                { param: 'decision_time', target: 7, current: 10, unit: '天', desc: '决策周期' },
                { param: 'package_attach_rate', target: 40, current: 0, unit: '%', desc: '套餐连带率' },
                { param: 'customer_satisfaction', target: 4.5, current: 4.2, unit: '分', desc: '客户满意度' }
            ],
            results: {
                actual_data: {},
                conclusion: '实验尚未启动，计划于2025Q2启动',
                learnings: '待验证假设：' +
                    '1) 顾问推荐模式可能转化率最高（专业引导降低决策成本）；' +
                    '2) 自主选购模式可能决策周期最长（选择困难）；' +
                    '3) 套餐组合模式可能客单价最高但转化率中等。'
            }
        },
        // 四维度分析
        strategic_analysis: '产品策略的核心矛盾：更多选择带来更多流量入口 vs 决策复杂度提升流失率。参考互联网行业"金角银边草肚皮"的产品矩阵策略，通过价格锚定和差异定位覆盖多层次客群。关键假设：专业销售顾问的介入可以化解选择困难，实现"多而不乱"。',
        financial_analysis: '单一产品模式：客单价¥7.5万，转化率11.2%，月签100单，营收¥750万；' +
            '产品组合模式（目标场景）：客单价¥7.9万（+5%），转化率12.5%（+12%），月签115单，营收¥908万（+21%）。' +
            '增量利润约¥80万/月，主要来源于转化率提升和客单价优化。',
        hr_analysis: '产品组合对销售能力要求更高：' +
            '1) 顾问需掌握3款产品知识（培训周期从1周延长至3周）；' +
            '2) 需建立客户需求诊断能力（匹配最适合的产品）；' +
            '3) 建议配置"产品专家"角色，复杂案例由专家介入。' +
            '人效目标：单一产品模式下人均月签5单，组合模式下目标人均月签6单（转化率提升对冲复杂度成本）。',
        market_analysis: '竞品分析：自如采用套餐+个性化组合，相寓主打标准化套餐，贝壳装修采用纯个性化。市场空白在于"有限组合+专业推荐"模式。客户调研显示：68%客户希望有多个价位选择，但42%客户担心选择困难。机会窗口：通过销售顾问专业能力建立差异化竞争优势。',
        risk_factors: '1) 选择困难导致流失率上升；2) 销售人员培训成本增加，短期人效下降；3) 产品间 cannibalization，低毛利产品侵蚀高毛利产品；4) 库存管理复杂度提升（需备货3套产品物料）；5) 定价透明度要求高，避免客户投诉价格歧视',
        timeline: '2025Q2-Q3',
        priority: 1,
        is_active: true
    },
    // === 个性化→标准化 多维度比较假设组 ===
    {
        id: 'asmp_std_conversion',
        assumption_name: '标准化转化率是个性化2倍',
        category: '产品',
        description: '验证标准化产品转化率（14%）是否显著高于个性化（7%）。基于市场机会分析，标准化降低决策复杂度，提升客户信任度，从而实现转化率翻倍。',
        impact_level: '高',
        confidence_level: 80,
        validation_status: '已验证',
        validation_result: '北京H2数据：个性化转化率约7%，标准化转化率12-14%。上海标准化占比86.9%，转化率显著高于北京。',
        scenarios: {
            conservative: {
                name: '转化率仅提升20%',
                probability: 0.25,
                param_adjustments: { 
                    conversion_rate: 1.20, decision_days: 1.15, consult_to_survey_rate: 1.05,
                    renovation_total: 0.95, foreman: 0.95, system_fee: 0.95
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', decision_days: 'multiply', consult_to_survey_rate: 'multiply',
                    renovation_total: 'multiply', foreman: 'multiply', system_fee: 'multiply'
                }
            },
            target: {
                name: '转化率翻倍⭐',
                probability: 0.55,
                param_adjustments: { 
                    conversion_rate: 2.0, decision_days: 0.60, consult_to_survey_rate: 1.25,
                    renovation_total: 0.90, foreman: 0.90, system_fee: 0.90, furniture: 0.95
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', decision_days: 'multiply', consult_to_survey_rate: 'multiply',
                    renovation_total: 'multiply', foreman: 'multiply', system_fee: 'multiply', furniture: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '转化率提升至3倍',
                probability: 0.20,
                param_adjustments: { 
                    conversion_rate: 3.0, decision_days: 0.40, consult_to_survey_rate: 1.50,
                    renovation_total: 0.85, foreman: 0.85, system_fee: 0.85, furniture: 0.90, appliances: 0.92
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', decision_days: 'multiply', consult_to_survey_rate: 'multiply',
                    renovation_total: 'multiply', foreman: 'multiply', system_fee: 'multiply', furniture: 'multiply', appliances: 'multiply'
                }
            }
        },
        param_adjustments: { 
            conversion_rate: 2.0,
            decision_days: 0.6,        // 决策周期缩短40%
            consult_to_survey_rate: 1.25  // 咨询→量房提升25%
        },
        adjustment_type: { 
            conversion_rate: 'multiply',
            decision_days: 'multiply',
            consult_to_survey_rate: 'multiply'
        },
        // BLM实验组：一个假设对应多个聚焦实验
        bml_experiments: [
            {
                id: 'exp_std_conv_001',
                name: '主实验：标准化vs个性化转化率对照',
                description: '核心验证：标准化产品转化率是否显著高于个性化',
                focus_param: 'survey_to_sign_rate',  // ← 聚焦单一核心参数
                status: '已验证',
                experiment_type: '城市对照',
                experiment_design: {
                    treatment_group: '北京-标准化产品主推（占比85%）',
                    control_group: '历史同期-个性化产品为主（占比40%）',
                    duration_weeks: 26,
                    sample_size: 1500,
                    key_variable: '产品类型（标准化vs个性化）'  // ← 单一变量变化
                },
                metrics: [
                    { param: 'survey_to_sign_rate', target: 14, current: 7, unit: '%', desc: '量房→签约转化率（核心指标）' }
                ],
                results: {
                    actual_data: {
                        standardized_conversion: 12.8,
                        personalized_conversion: 6.9,
                        lift_ratio: 1.86
                    },
                    conclusion: '标准化转化率是个性化的1.86倍，接近翻倍目标',
                    learnings: '标准化通过价格透明+交付可控+快速报价三重机制提升转化率'
                }
            },
            {
                id: 'exp_std_conv_002',
                name: '子实验1：决策周期缩短验证',
                description: '机制验证：即时报价如何缩短客户决策周期',
                focus_param: 'decision_days',
                status: '已验证',
                experiment_type: '时段对照',
                experiment_design: {
                    treatment_group: '2025Q1-即时报价标准化产品（报价时间<1天）',
                    control_group: '2024Q4-3天报价个性化产品',
                    duration_weeks: 12,
                    sample_size: 400,
                    key_variable: '报价响应时间'  // ← 单一变量
                },
                metrics: [
                    { param: 'decision_days', target: 10, current: 18, unit: '天', desc: '客户决策周期' },
                    { param: 'quote_to_decision_rate', target: 45, current: 28, unit: '%', desc: '报价后决策转化率' }
                ],
                results: {
                    actual_data: {
                        avg_decision_days_std: 12,
                        avg_decision_days_personalized: 18,
                        time_saving: 6
                    },
                    conclusion: '标准化即时报价使决策周期从18天缩短至12天，减少33%',
                    learnings: '等待报价是客户流失的关键节点，即时报价可显著提升转化率'
                }
            },
            {
                id: 'exp_std_conv_003',
                name: '子实验2：咨询→量房漏斗优化',
                description: '上游验证：标准化是否提升咨询→量房转化',
                focus_param: 'consult_to_survey_rate',
                status: '验证中',
                experiment_type: '城市对照',
                experiment_design: {
                    treatment_group: '朝阳区-标准化案例展示+即时预约',
                    control_group: '海淀区-个性化方案沟通',
                    duration_weeks: 8,
                    sample_size: 300,
                    key_variable: '前端展示方式'  // ← 单一变量
                },
                metrics: [
                    { param: 'consult_to_survey_rate', target: 35, current: 28, unit: '%', desc: '咨询→量房转化率' }
                ],
                results: {
                    actual_data: {},
                    conclusion: '实验进行中，第4周数据初步显示标准化展示组量房预约率提升8%',
                    learnings: '待完成实验后总结'
                }
            }
        ],
        strategic_analysis: '转化率是销售漏斗的核心瓶颈。个性化服务因报价不确定、交付风险高，导致客户决策周期长、流失率高。标准化产品通过价格透明、交付可控、快速报价三大优势，显著降低客户决策门槛，实现转化率翻倍。',
        financial_analysis: '转化率从7%提升至14%，在流量不变情况下月签单量翻倍。以北京月咨询量1000单计算，多转化70单，增量营收¥525万/月，增量利润约¥40万/月。',
        hr_analysis: '标准化降低对销售顾问个人经验的依赖。个性化需要资深顾问才能准确报价和把控交付，标准化后新人培训周期从3个月缩短至3周。',
        market_analysis: '市场机会数据显示标准化转化率14% vs 个性化7%，相差2倍。自如、相寓等竞品均采用标准化套餐模式，验证了该假设的行业普适性。',
        risk_factors: '过度标准化可能导致高端客户流失；标准化产品需保持足够差异化以应对竞争；转化率提升依赖价格竞争力，毛利承压',
        timeline: '2025Q1-Q2',
        priority: 1,
        is_active: true
    },
    // === 个性化vs标准化：招租成功率差异 ===
    {
        id: 'asmp_std_rental_success',
        assumption_name: '标准化招租成功率高于个性化',
        category: '产品',
        description: '验证标准化产品（美租整装/品牌化产品）的招租成功率（曝光装商机率）是否高于个性化产品。基于曝光装商机率数据：美租整装0.25% vs 个性化产品0.20%，品牌化产品0.26%表现最优。',
        impact_level: '高',
        confidence_level: 80,
        validation_status: '已验证',
        validation_result: '曝光装商机率数据验证：美租整装0.25%、品牌化产品0.26%，显著高于个性化产品的0.20%。北京个性化0.22%，上海仅0.18%。',
        scenarios: {
            conservative: {
                name: '招租成功率持平',
                probability: 0.25,
                param_adjustments: { 
                    conversion_rate: 0.95, monthly_target_units: 0.90,
                    vacancy_days: 1.15, vacancy_cost: 1.20, avg_rent_after: 0.95
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', monthly_target_units: 'multiply',
                    vacancy_days: 'multiply', vacancy_cost: 'multiply', avg_rent_after: 'multiply'
                }
            },
            target: {
                name: '标准化商机率+25%⭐',
                probability: 0.55,
                param_adjustments: { 
                    conversion_rate: 1.25, monthly_target_units: 1.15,
                    vacancy_days: 0.80, vacancy_cost: 0.75, avg_rent_after: 1.08
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', monthly_target_units: 'multiply',
                    vacancy_days: 'multiply', vacancy_cost: 'multiply', avg_rent_after: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '品牌化商机率+50%',
                probability: 0.20,
                param_adjustments: { 
                    conversion_rate: 1.50, monthly_target_units: 1.40,
                    vacancy_days: 0.65, vacancy_cost: 0.60, avg_rent_after: 1.15, rent_premium: 1.20
                },
                adjustment_type: { 
                    conversion_rate: 'multiply', monthly_target_units: 'multiply',
                    vacancy_days: 'multiply', vacancy_cost: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply'
                }
            }
        },
        param_adjustments: { conversion_rate: 1.25, monthly_target_units: 1.15 },
        adjustment_type: { conversion_rate: 'multiply', monthly_target_units: 'multiply' },
        bml_experiment: {
            status: '已验证',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '北京/上海-美租整装/品牌化产品（标准化）',
                control_group: '同期-个性化产品（非标设计）',
                duration_weeks: 26,
                sample_size: 2000
            },
            metrics: [
                { param: 'exposure_to_lead_rate', target: 0.26, current: 0.20, unit: '%', desc: '曝光装商机率' },
                { param: 'lead_to_visit_rate', target: 35, current: 28, unit: '%', desc: '商机→带看率' },
                { param: 'rental_days', target: 12, current: 18, unit: '天', desc: '平均招租周期' }
            ],
            results: {
                actual_data: {
                    meizu_standardized: 0.25,
                    branded_product: 0.26,
                    personalized: 0.20,
                    shengxinzu: 0.20
                },
                conclusion: '标准化产品（美租整装0.25%、品牌化0.26%）招租成功率显著高于个性化（0.20%）。品牌化产品表现最优，建议推进品牌化发展。',
                learnings: '招租成功率差异原因：1)标准化产品视觉效果统一，线上展示吸引力强；2)租客对标准化装修品质预期明确；3)个性化设计良莠不齐，租客顾虑风险；4)品牌化产品背书增强信任。'
            }
        },
        strategic_analysis: '招租成功率直接影响业主收益和贝壳周转效率。曝光装商机率是漏斗最上游指标，0.25% vs 0.20%的差距在规模化后会放大为显著的量级差异。标准化产品"所见即所得"的特性，降低了租客决策门槛。',
        financial_analysis: '曝光装商机率从0.20%→0.25%，提升25%。以月曝光UV 100万计算，多产生500个商机，按10%转化率计算，月增量50单，营收增量约¥400万/月。同时招租周期缩短，业主空置损失降低，业主满意度提升。',
        hr_analysis: '招租成功率提升降低了对一线销售顾问的依赖。个性化产品需要顾问更多解释和说服，标准化产品"自带说服力"。资管顾问可将精力从"解释产品"转向"服务客户"。',
        market_analysis: '租客端市场教育已完成：自如、相寓等品牌的标准化装修已被广泛接受。个性化装修在租客眼中反而意味着"不确定性"。品牌化+标准化是赢得租客信任的最佳路径。',
        risk_factors: '过度标准化可能导致审美疲劳；品牌调性需持续维护；不同区域租客偏好差异',
        timeline: '2025Q1-Q2',
        priority: 1,
        is_active: true
    },
    // === 个性化vs标准化：价格优势/溢价率差异 ===
    {
        id: 'asmp_std_premium',
        assumption_name: '标准化租金溢价率优于个性化',
        category: '产品',
        description: '验证标准化装修产品的租金溢价率是否高于个性化装修。基于美租系列研究，标准化装修后租金溢价10-15%，而个性化装修因品质不稳定，溢价率波动大且均值低于标准化。',
        impact_level: '高',
        confidence_level: 85,
        validation_status: '已验证',
        validation_result: '美租整装标准化产品租金溢价率10-15%，装修后平均租金¥6,500 vs 装修前¥5,800。个性化装修溢价率波动大（5%-20%），均值约8%，且存在劣化风险导致租金反而下降的案例。',
        scenarios: {
            conservative: {
                name: '溢价率下滑至5%',
                probability: 0.20,
                param_adjustments: { 
                    avg_rent_after: 1.05, rent_premium: 0.95, conversion_rate: 0.92,
                    renovation_total: 1.0, vacancy_days: 1.10
                },
                adjustment_type: { 
                    avg_rent_after: 'multiply', rent_premium: 'multiply', conversion_rate: 'multiply',
                    renovation_total: 'multiply', vacancy_days: 'multiply'
                }
            },
            target: {
                name: '标准化溢价12%⭐',
                probability: 0.60,
                param_adjustments: { 
                    avg_rent_after: 1.12, rent_premium: 1.15, conversion_rate: 1.05,
                    renovation_total: 1.05, vacancy_days: 0.90
                },
                adjustment_type: { 
                    avg_rent_after: 'multiply', rent_premium: 'multiply', conversion_rate: 'multiply',
                    renovation_total: 'multiply', vacancy_days: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '品牌化溢价20%',
                probability: 0.20,
                param_adjustments: { 
                    avg_rent_after: 1.20, rent_premium: 1.30, conversion_rate: 1.18,
                    renovation_total: 1.12, vacancy_days: 0.80, furniture: 1.08
                },
                adjustment_type: { 
                    avg_rent_after: 'multiply', rent_premium: 'multiply', conversion_rate: 'multiply',
                    renovation_total: 'multiply', vacancy_days: 'multiply', furniture: 'multiply'
                }
            }
        },
        param_adjustments: { avg_rent_after: 1.12, rent_premium: 1.15 },
        adjustment_type: { avg_rent_after: 'multiply', rent_premium: 'multiply' },
        bml_experiment: {
            status: '已验证',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '北京-朝阳区-美租整装标准化装修',
                control_group: '北京-海淀区-个性化装修（同期同小区）',
                duration_weeks: 52,
                sample_size: 500
            },
            metrics: [
                { param: 'rent_premium_rate', target: 12, current: 8, unit: '%', desc: '租金溢价率' },
                { param: 'avg_rent_after', target: 6500, current: 5800, unit: '元/月', desc: '装修后月租金' },
                { param: 'rental_success_days', target: 10, current: 15, unit: '天', desc: '平均招租天数' },
                { param: 'tenant_satisfaction', target: 4.5, current: 4.0, unit: '分', desc: '租客满意度' }
            ],
            results: {
                actual_data: {
                    standardized_premium: 12.5,
                    personalized_premium_avg: 8.3,
                    personalized_premium_std: 6.5,
                    rent_lift_meizu: 700
                },
                conclusion: '标准化装修租金溢价率12.5%，显著高于个性化的8.3%。个性化溢价率标准差高达6.5%，存在溢价为负的风险。',
                learnings: '溢价率差异原因：1)标准化装修品质稳定，租客愿意付溢价；2)个性化装修品质参差不齐，部分案例劣化导致租金下降；3)美租品牌背书增强租客支付意愿；4)标准化装修风格符合主流审美，个性化可能过于独特导致小众。'
            }
        },
        strategic_analysis: '租金溢价是业主选择装修服务的核心驱动力。溢价率差异直接决定业主ROI和续签意愿。标准化通过"可预期的品质"实现稳定溢价，个性化则面临"品质彩票"风险——可能很好也可能很差。',
        financial_analysis: '以65㎡一居室为例，月租金从¥5,800→¥6,500（+¥700/月），年化增收¥8,400。装修投入¥8万，装租比约9.5个月回本。个性化装修因溢价不稳定，业主ROI不可预期，影响购买决策。',
        hr_analysis: '租金溢价提升降低销售难度。当业主看到明确的租金提升数据时，决策周期缩短。标准化产品的溢价数据可用于销售话术，个性化则难以给出明确承诺。',
        market_analysis: '租客为"品质"和"确定性"买单。标准化装修提供品质保证，租客愿意支付10-15%溢价。个性化装修虽有独特性，但品质风险让租客望而却步，除非价格明显低于市场价。',
        risk_factors: '标准化风格同质化可能导致溢价天花板；区域差异大，需本地化调整；过度装修导致投入产出比下降',
        timeline: '2025Q1-Q2',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_std_efficiency',
        assumption_name: '标准化人效是个性化1.5倍',
        category: '转化',
        description: '验证标准化模式人均产出是否显著高于个性化。标准化降低对资深人员依赖，新人快速上手，人均月签单量提升。',
        impact_level: '高',
        confidence_level: 75,
        validation_status: '验证中',
        validation_result: '北京资管人均月签约5单（混合模式），上海标准化占比86.9%，人均月签约7单。初步验证标准化人效更高。',
        scenarios: {
            conservative: {
                name: '人效仅提升10%',
                probability: 0.30,
                param_adjustments: { 
                    monthly_target_units: 1.10, expense_city_hr: 1.05, conversion_rate: 0.95,
                    system_fee: 1.05
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', expense_city_hr: 'multiply', conversion_rate: 'multiply',
                    system_fee: 'multiply'
                }
            },
            target: {
                name: '人效提升50%⭐',
                probability: 0.55,
                param_adjustments: { 
                    monthly_target_units: 1.50, expense_city_hr: 0.90, conversion_rate: 1.10,
                    system_fee: 0.90
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', expense_city_hr: 'multiply', conversion_rate: 'multiply',
                    system_fee: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '人效翻倍+成本降20%',
                probability: 0.15,
                param_adjustments: { 
                    monthly_target_units: 2.0, expense_city_hr: 0.80, conversion_rate: 1.30,
                    system_fee: 0.80, foreman: 0.95
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', expense_city_hr: 'multiply', conversion_rate: 'multiply',
                    system_fee: 'multiply', foreman: 'multiply'
                }
            }
        },
        param_adjustments: { monthly_target_units: 1.50, expense_city_hr: 0.90 },
        adjustment_type: { monthly_target_units: 'multiply', expense_city_hr: 'multiply' },
        bml_experiment: {
            status: '验证中',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '上海-标准化模式（86.9%标准化占比）',
                control_group: '北京-混合模式（71.1%标准化占比）',
                duration_weeks: 26,
                sample_size: 100
            },
            metrics: [
                { param: 'orders_per_advisor', target: 7.5, current: 5, unit: '单/人/月', desc: '顾问人均月签' },
                { param: 'training_period', target: 21, current: 60, unit: '天', desc: '新人培训周期' },
                { param: 'ramp_up_months', target: 1, current: 3, unit: '月', desc: '新人达到均产所需月数' }
            ],
            results: {
                actual_data: {
                    shanghai_avg_orders: 7.3,
                    beijing_avg_orders: 5.1,
                    efficiency_ratio: 1.43
                },
                conclusion: '上海人效是北京的1.43倍，接近1.5倍目标。主要差异来自标准化占比（86.9% vs 71.1%）。',
                learnings: '人效提升主要来自：1)新人开单周期缩短；2)报价效率提升（标准化即时报价 vs 个性化3-5天）；3)交付协调成本降低。'
            }
        },
        strategic_analysis: '人效是规模化最核心的瓶颈。个性化模式依赖"高手"，高手培养周期长、成本高、流动性大。标准化通过流程固化降低对个人的依赖，实现"普通人也能做出好业绩"，这是规模化的基础。',
        financial_analysis: '人效从5单→7.5单（+50%），在人员规模不变情况下，单量提升50%。同时人均产出提升后，固定人力成本摊薄，单均人力成本下降约20%。',
        hr_analysis: '个性化模式下，资管顾问需要掌握设计、报价、供应链协调等多维能力，培训周期3个月。标准化模式下，顾问只需掌握客户需求诊断和产品匹配，培训周期3周。团队扩张速度可提升4倍。',
        market_analysis: '京沪人效对比（7.3 vs 5.1）已验证标准化对人效的提升作用。行业通病是"能人依赖"，标准化是破局之道。',
        risk_factors: '标准化后人效提升但客单价可能下降；人员快速扩张带来管理挑战；标准化产品需持续迭代保持竞争力',
        timeline: '2025H1-H2',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_delivery',
        assumption_name: '交付管理升级',
        category: '交付',
        description: '与酒管合作构建供应商管理模式及交付管理机制，压缩工长成本和施工周期。',
        impact_level: '中',
        confidence_level: 70,
        validation_status: '验证中',
        validation_result: '工长成本占供应商支出39.5%，是最大单项。供应链管理可压缩10-15%。',
        scenarios: {
            conservative: {
                name: '交付成本微降5%',
                probability: 0.30,
                param_adjustments: { 
                    foreman: 0.95, 
                    renovation_total: 0.98, 
                    expense_other: 1.05,
                    supplier_cost: 0.97,
                    furniture: 0.98,
                    appliances: 0.98
                },
                adjustment_type: { 
                    foreman: 'multiply', 
                    renovation_total: 'multiply', 
                    expense_other: 'multiply',
                    supplier_cost: 'multiply',
                    furniture: 'multiply',
                    appliances: 'multiply'
                }
            },
            target: {
                name: '工长成本降12%⭐',
                probability: 0.50,
                param_adjustments: { 
                    foreman: 0.88, 
                    renovation_total: 0.92, 
                    expense_other: 0.95,
                    gtv_per_unit: 1.03,
                    supplier_cost: 0.90,
                    furniture: 0.95,
                    appliances: 0.95,
                    vacancy_days: 0.95
                },
                adjustment_type: { 
                    foreman: 'multiply', 
                    renovation_total: 'multiply', 
                    expense_other: 'multiply',
                    gtv_per_unit: 'multiply',
                    supplier_cost: 'multiply',
                    furniture: 'multiply',
                    appliances: 'multiply',
                    vacancy_days: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '供应链重构降20%',
                probability: 0.20,
                param_adjustments: { 
                    foreman: 0.80, 
                    renovation_total: 0.85, 
                    expense_other: 0.88,
                    gtv_per_unit: 1.08,
                    conversion_rate: 1.10,
                    supplier_cost: 0.82,
                    furniture: 0.88,
                    appliances: 0.88,
                    system_fee: 0.90,
                    vacancy_days: 0.88
                },
                adjustment_type: { 
                    foreman: 'multiply', 
                    renovation_total: 'multiply', 
                    expense_other: 'multiply',
                    gtv_per_unit: 'multiply',
                    conversion_rate: 'multiply',
                    supplier_cost: 'multiply',
                    furniture: 'multiply',
                    appliances: 'multiply',
                    system_fee: 'multiply',
                    vacancy_days: 'multiply'
                }
            }
        },
        param_adjustments: {
            beike: {},  // 贝壳：供应商成本下降间接改善
            owner: { renovation_total: 0.95 },  // 业主：装修总价降5%（节省¥5,000）
            supplier: { foreman: 0.90 }  // 供应商：工长成本降10%
        },
        adjustment_type: {
            beike: {},
            owner: { renovation_total: 'multiply' },
            supplier: { foreman: 'multiply' }
        },
        strategic_analysis: '交付品质直接决定客户口碑和回单率。工长成本是供应商最大可压缩项。',
        financial_analysis: '工长成本每降10%=节省¥2,848/单，直接改善供应商UE和业主UE。',
        hr_analysis: '需建立品控团队5-8人/城。',
        market_analysis: '品质交付提升NPS，降低获客成本。',
        risk_factors: '供应商管理复杂度高',
        timeline: '2025H2',
        priority: 3,
        is_active: true
    },
    // === 销售运营赋能：三角色销售能力拆分 ===
    {
        id: 'asmp_sales_zg',
        assumption_name: '资管经理销售模式',
        category: '转化',
        description: '验证资管经理作为整装产品销售主力模式的可行性。资管经理优势：距离业主最近、掌握房源信息、已建立信任关系。挑战：专业能力偏向租赁，装修销售能力不足。',
        impact_level: '高',
        confidence_level: 70,
        validation_status: '验证中',
        validation_result: '北京H2资管人均月签约5.2单（含租赁+装修），装修渗透率2.5%。上海资管人效显著更高，但统计口径可能不同。',
        scenarios: {
            conservative: {
                name: '资管仅引流 转化率低',
                probability: 0.30,
                param_adjustments: { 
                    monthly_target_units: 0.90, channel_manager: 1.05, conversion_rate: 0.85, expense_city_hr: 1.10,
                    vacancy_days: 1.15
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', channel_manager: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply'
                }
            },
            target: {
                name: '资管主力销售模式⭐',
                probability: 0.50,
                param_adjustments: { 
                    monthly_target_units: 1.35, channel_manager: 1.25, conversion_rate: 1.05, expense_city_hr: 1.0,
                    vacancy_days: 0.90, avg_rent_after: 1.02
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', channel_manager: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply', avg_rent_after: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '资管全能顾问 人效翻倍',
                probability: 0.20,
                param_adjustments: { 
                    monthly_target_units: 1.80, channel_manager: 1.40, conversion_rate: 1.25, expense_city_hr: 0.90,
                    vacancy_days: 0.80, avg_rent_after: 1.08, rent_premium: 1.10
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', channel_manager: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply'
                }
            }
        },
        param_adjustments: { monthly_target_units: 1.35, channel_manager: 1.25 },
        adjustment_type: { monthly_target_units: 'multiply', channel_manager: 'multiply' },
        bml_experiment: {
            status: '验证中',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '北京-朝阳区-资管经理装修销售培训+激励机制',
                control_group: '北京-海淀区-资管经理仅引流，专业销售跟进',
                duration_weeks: 16,
                sample_size: 60
            },
            metrics: [
                { param: 'zg_orders_per_month', target: 2, current: 0.8, unit: '单/人/月', desc: '资管人均装修签约' },
                { param: 'penetration_rate', target: 5, current: 2.5, unit: '%', desc: '租赁房源装修渗透率' },
                { param: 'cross_sell_rate', target: 15, current: 8, unit: '%', desc: '租转装交叉销售率' }
            ],
            results: {
                actual_data: {
                    beijing_zg_avg: 0.8,
                    shanghai_zg_avg: 1.5,
                    penetration_gap: 2
                },
                conclusion: '北京资管装修销售能力显著低于上海，培训体系和激励机制是主要差距。',
                learnings: '资管销售模式关键成功因素：1)标准化产品降低销售难度；2)与租赁业务绑定激励；3)专业培训（产品知识+销售技巧）；4)销售工具支持（报价器/案例库）。'
            }
        },
        strategic_analysis: '资管经理是距离业主最近的触点，掌握房源信息优势。但传统资管只负责租赁，装修销售是能力缺口。关键问题：能否将资管的"房源优势"转化为"装修销售优势"？',
        financial_analysis: '资管销售模式成本结构：资管底薪¥8,000/月+装修提成¥2,000/单。人效2单/月即可覆盖成本，3单/月开始贡献利润。vs专业销售团队，资管模式获客成本更低（房源已掌握）。',
        hr_analysis: '北京当前资管约200人，如人均月签装修2单，月增量400单，可支撑业务快速起量。培训周期：租赁转装修销售需4-6周培训。激励机制需调整：租赁与装修提成平衡，避免顾此失彼。',
        market_analysis: '上海模式验证：资管人效显著高于北京，说明资管销售模式可行。差异可能来自：1)上海标准化程度更高（86.9% vs 71.1%）；2)上海资管培训体系更完善；3)上海市场竞争倒逼销售能力。',
        risk_factors: '资管精力分散，租赁服务品质下降；装修销售专业性不足，客户体验差；激励机制设计困难，租赁和装修目标冲突；人员流动大，培训投入回报不确定',
        timeline: '2025Q1-Q3',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_sales_mz',
        assumption_name: '美租顾问销售模式',
        category: '转化',
        description: '验证美租顾问作为整装产品销售主力模式的可行性。美租顾问优势：专业装修知识、全程服务业主、已建立深度信任。数据验证：上海美租顾问人效可达20单/月。',
        impact_level: '高',
        confidence_level: 80,
        validation_status: '已验证',
        validation_result: '上海美租顾问人效可达20单/月（标准化占比86.9%），北京美租顾问人效约12单/月。美租顾问是验证成功的销售模式。',
        scenarios: {
            conservative: {
                name: '人效10单/月 新人为主',
                probability: 0.20,
                param_adjustments: { 
                    monthly_target_units: 0.85, conversion_rate: 0.90, expense_city_hr: 1.15,
                    vacancy_days: 1.10, renovation_total: 1.02
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply', renovation_total: 'multiply'
                }
            },
            target: {
                name: '人效18单/月⭐',
                probability: 0.60,
                param_adjustments: { 
                    monthly_target_units: 1.55, conversion_rate: 1.15, expense_city_hr: 1.0,
                    vacancy_days: 0.85, renovation_total: 0.95
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply', renovation_total: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '人效28单/月 明星模式',
                probability: 0.20,
                param_adjustments: { 
                    monthly_target_units: 2.40, conversion_rate: 1.35, expense_city_hr: 0.85,
                    vacancy_days: 0.75, renovation_total: 0.90, avg_rent_after: 1.05
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    vacancy_days: 'multiply', renovation_total: 'multiply', avg_rent_after: 'multiply'
                }
            }
        },
        param_adjustments: { monthly_target_units: 1.5, conversion_rate: 1.1 },
        adjustment_type: { monthly_target_units: 'multiply', conversion_rate: 'multiply' },
        bml_experiment: {
            status: '已验证',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '上海-美租顾问销售模式（标准化产品）',
                control_group: '北京-美租顾问销售模式（混合产品）',
                duration_weeks: 26,
                sample_size: 150
            },
            metrics: [
                { param: 'mz_orders_per_month', target: 20, current: 12, unit: '单/人/月', desc: '美租顾问人均月签' },
                { param: 'conversion_rate', target: 15, current: 11, unit: '%', desc: '商机→签约转化率' },
                { param: 'customer_satisfaction', target: 4.6, current: 4.3, unit: '分', desc: '客户满意度' }
            ],
            results: {
                actual_data: {
                    shanghai_mz_avg: 20.5,
                    beijing_mz_avg: 12.3,
                    efficiency_gap: 1.67
                },
                conclusion: '上海美租顾问人效20.5单/月，是北京（12.3单）的1.67倍。关键差异：产品标准化程度（86.9% vs 71.1%）。',
                learnings: '美租顾问销售模式成功要素：1)标准化产品大幅降低报价和交付难度；2)美租顾问专业度高，客户信任强；3)服务全流程跟进，转化率高；4)人效天花板高（上海已达20单）。'
            }
        },
        strategic_analysis: '美租顾问是验证最成功的销售角色。不同于资管"被动接单"，美租顾问是"主动服务"，与业主建立全程陪伴关系。上海数据证明：美租顾问人效可达20单/月，是规模化最佳路径。',
        financial_analysis: '美租顾问人效12单→20单，提升67%。以100人团队计算，月增量800单，营收增量¥6,000万/月。美租顾问成本：底薪¥6,000+提成¥3,000/单，单均成本¥3,300，远低于渠道获客成本¥7,000。',
        hr_analysis: '美租顾问招聘培养体系是关键瓶颈。成熟美租顾问培养周期3-6个月，上海模式可快速复制。建议：1)建立美租顾问学院；2)上海优秀顾问输出北京带教；3)标准化降低新人上手难度。',
        market_analysis: '美租顾问模式是行业差异化竞争力。相比竞品的"销售签单后就不管了"，美租顾问全程陪伴建立深度信任，客户转介绍率高。上海20单人效是行业标杆。',
        risk_factors: '美租顾问培养周期长，难以快速扩张；优秀顾问稀缺，招聘困难；人效20单可能是个别高手，难以全员复制；过度依赖个人，规模化风险',
        timeline: '2025Q1-Q2',
        priority: 1,
        is_active: true
    },
    {
        id: 'asmp_sales_sjs',
        assumption_name: '设计师销售模式',
        category: '转化',
        description: '验证设计师作为整装产品销售主力模式的可行性。设计师优势：专业设计能力、方案说服力强、客单价高。挑战：销售能力不足、交付周期长、人效低。',
        impact_level: '中',
        confidence_level: 55,
        validation_status: '待验证',
        validation_result: '设计师模式个性化占比高，人效约3-5单/月，客单价¥12万+，但规模化受限。北京个性化产品UE亏损¥4,203/单，设计师模式经济性存疑。',
        scenarios: {
            conservative: {
                name: '设计师仅做方案',
                probability: 0.40,
                param_adjustments: { 
                    gtv_per_unit: 1.15, monthly_target_units: 0.70, conversion_rate: 0.75, expense_city_hr: 1.25,
                    designer: 1.30, renovation_total: 1.20, foreman: 1.10
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    designer: 'multiply', renovation_total: 'multiply', foreman: 'multiply'
                }
            },
            target: {
                name: '设计师销售高客单⭐',
                probability: 0.40,
                param_adjustments: { 
                    gtv_per_unit: 1.25, monthly_target_units: 0.85, conversion_rate: 0.95, expense_city_hr: 1.15,
                    designer: 1.40, renovation_total: 1.25, foreman: 1.15, avg_rent_after: 1.12
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    designer: 'multiply', renovation_total: 'multiply', foreman: 'multiply', avg_rent_after: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '设计师IP化高转化',
                probability: 0.20,
                param_adjustments: { 
                    gtv_per_unit: 1.40, monthly_target_units: 1.10, conversion_rate: 1.15, expense_city_hr: 1.05,
                    designer: 1.70, renovation_total: 1.40, foreman: 1.25, avg_rent_after: 1.20, rent_premium: 1.35
                },
                adjustment_type: { 
                    gtv_per_unit: 'multiply', monthly_target_units: 'multiply', conversion_rate: 'multiply', expense_city_hr: 'multiply',
                    designer: 'multiply', renovation_total: 'multiply', foreman: 'multiply', avg_rent_after: 'multiply', rent_premium: 'multiply'
                }
            }
        },
        param_adjustments: { gtv_per_unit: 1.4, monthly_target_units: 1.0, conversion_rate: 0.9 },
        adjustment_type: { gtv_per_unit: 'multiply', monthly_target_units: 'multiply', conversion_rate: 'multiply' },
        bml_experiment: {
            status: '待验证',
            experiment_type: '阶梯投放',
            experiment_design: {
                treatment_group: '北京-朝阳区-设计师销售模式（10%个性化高端）',
                control_group: '北京-海淀区-标准化销售模式（无设计师深度介入）',
                duration_weeks: 12,
                sample_size: 40
            },
            metrics: [
                { param: 'sjs_orders_per_month', target: 4, current: 3, unit: '单/人/月', desc: '设计师人均月签' },
                { param: 'avg_gtv', target: 120000, current: 85000, unit: '元', desc: '客单价' },
                { param: 'gross_margin', target: 12, current: 4.8, unit: '%', desc: '毛利率' }
            ],
            results: {
                actual_data: {},
                conclusion: '实验尚未启动，计划2025Q2启动',
                learnings: '待验证假设：设计师模式适合服务高端客群，客单价¥12万+，但人效天花板低（4单/月）。规模化需解决：1)设计师培养周期长；2)个性化交付风险；3)UE经济性。'
            }
        },
        strategic_analysis: '设计师模式是"重服务、高客单、低人效"的代表。适合服务高端个性化客群，但不适合规模化。战略定位：设计师作为"品质标杆"和"高端补充"，而非主力销售模式。',
        financial_analysis: '设计师模式客单价¥12万 vs 标准化¥8万，但人效4单 vs 18单。单设计师月产出¥48万 vs 美租顾问¥144万。且个性化UE亏损，经济性不支持规模化。',
        hr_analysis: '设计师培养周期6-12个月，成本极高。优秀设计师稀缺且流动性大。建议设计师定位转型：从"销售"转向"方案支持"，为美租顾问提供专业设计能力支撑。',
        market_analysis: '高端市场存在个性化需求，但规模有限。设计师模式可作为差异化补充，服务高净值客户，建立品牌高度。主力市场仍需标准化+美租顾问模式。',
        risk_factors: '设计师销售能力不足，转化率低；个性化交付风险高，NPS波动大；人效低，规模化成本不可承受；优秀设计师稀缺且难留住',
        timeline: '2025Q2-Q4',
        priority: 3,
        is_active: true
    },
    {
        id: 'asmp_expand',
        assumption_name: '规模扩张-城市拓展',
        category: '获客',
        description: '从北上双城向更多一二线城市拓展，复制标准化模式。武汉已在试点。',
        impact_level: '高',
        confidence_level: 50,
        validation_status: '待验证',
        validation_result: 'Excel已有武汉sheet，但单量极少，UE结构与北京类似。',
        scenarios: {
            conservative: {
                name: '保守扩张 1城试点',
                probability: 0.35,
                param_adjustments: { 
                    monthly_target_units: 1.15, 
                    expense_city_hr: 1.20, 
                    expense_brand: 1.30,
                    conversion_rate: 0.85,
                    renovation_total: 1.05,
                    foreman: 1.08,
                    avg_rent_after: 0.92
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', 
                    expense_city_hr: 'multiply', 
                    expense_brand: 'multiply',
                    conversion_rate: 'multiply',
                    renovation_total: 'multiply',
                    foreman: 'multiply',
                    avg_rent_after: 'multiply'
                }
            },
            target: {
                name: '稳步扩张 3城布局⭐',
                probability: 0.45,
                param_adjustments: { 
                    monthly_target_units: 1.60, 
                    expense_city_hr: 1.35, 
                    expense_brand: 1.50,
                    gtv_per_unit: 0.95,
                    renovation_total: 1.0,
                    foreman: 1.0,
                    avg_rent_after: 1.0
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', 
                    expense_city_hr: 'multiply', 
                    expense_brand: 'multiply',
                    gtv_per_unit: 'multiply',
                    renovation_total: 'multiply',
                    foreman: 'multiply',
                    avg_rent_after: 'multiply'
                },
                is_primary: true
            },
            optimistic: {
                name: '快速扩张 5城联动',
                probability: 0.20,
                param_adjustments: { 
                    monthly_target_units: 2.0, 
                    expense_city_hr: 1.45, 
                    expense_brand: 1.60,
                    gtv_per_unit: 1.03,
                    conversion_rate: 1.10,
                    commission_rate: 1.08,
                    renovation_total: 0.94,
                    foreman: 0.90,
                    system_fee: 0.88,
                    avg_rent_after: 1.06
                },
                adjustment_type: { 
                    monthly_target_units: 'multiply', 
                    expense_city_hr: 'multiply', 
                    expense_brand: 'multiply',
                    gtv_per_unit: 'multiply',
                    conversion_rate: 'multiply',
                    commission_rate: 'multiply',
                    renovation_total: 'multiply',
                    foreman: 'multiply',
                    system_fee: 'multiply',
                    avg_rent_after: 'multiply'
                }
            }
        },
        param_adjustments: {
            beike: { monthly_target_units: 2.0 },  // 贝壳：单量翻倍
            owner: {},  // 业主：规模效应带来装修成本下降
            supplier: {}  // 供应商：订单量增长
        },
        adjustment_type: {
            beike: { monthly_target_units: 'multiply' },
            owner: {},
            supplier: {}
        },
        strategic_analysis: '城市拓展是规模经济必经之路。武汉试点中，H2目标不明确。',
        financial_analysis: '新城初期投入大、回报周期长。参照北京UE结构。',
        hr_analysis: '每个新城市需要15-20人核心团队。',
        market_analysis: '二线城市竞争弱但市场空间有限。',
        risk_factors: '新城市市场验证周期长',
        timeline: '2026H1',
        priority: 4,
        is_active: true
    }
];

// ==================== 战略主题 ====================
// 14个假设按 获客/产品/转化/交付 四大维度聚合为4个战略主题
const DEFAULT_THEMES = [
    {
        id: 'theme_acquisition',
        theme_name: '获客',
        description: '市场渗透、定价策略、客户获取与城市扩张',
        color: '#2f9668',
        icon: 'bullhorn',
        experiment_ids: [
            'asmp_focus_penetration',
            'asmp_price_range',
            'asmp_pricing_strategy',
            'asmp_renovation_upgrade',
            'asmp_expand'
        ],
        sort_order: 1
    },
    {
        id: 'theme_product',
        theme_name: '产品',
        description: '产品组合策略、标准化转化、招租与溢价能力',
        color: '#6366f1',
        icon: 'cube',
        experiment_ids: [
            'asmp_product_mix',
            'asmp_std_conversion',
            'asmp_std_rental_success',
            'asmp_std_premium'
        ],
        sort_order: 2
    },
    {
        id: 'theme_conversion',
        theme_name: '转化',
        description: '人效提升、销售模式验证与运营赋能',
        color: '#f59e0b',
        icon: 'exchange-alt',
        experiment_ids: [
            'asmp_std_efficiency',
            'asmp_sales_zg',
            'asmp_sales_mz',
            'asmp_sales_sjs'
        ],
        sort_order: 3
    },
    {
        id: 'theme_delivery',
        theme_name: '交付',
        description: '交付管理升级、供应商管理与施工品控',
        color: '#ec4899',
        icon: 'truck',
        experiment_ids: [
            'asmp_delivery'
        ],
        sort_order: 4
    }
];

// ==================== 主题 Helper 函数 ====================

// 从themes同步assumptions数组，注入_theme_id（向后兼容）
function syncAssumptionsFromThemes() {
    const asmpMap = {};
    AppState.assumptions.forEach(a => { asmpMap[a.id] = a; });

    const synced = [];
    AppState.themes.forEach(theme => {
        theme.experiment_ids.forEach(expId => {
            const asmp = asmpMap[expId];
            if (asmp) {
                asmp._theme_id = theme.id;
                asmp._theme_name = theme.theme_name;
                synced.push(asmp);
            }
        });
    });

    // 保留孤儿假设（安全网）
    const themedIds = new Set(synced.map(a => a.id));
    AppState.assumptions.forEach(a => {
        if (!themedIds.has(a.id)) {
            a._theme_id = null;
            a._theme_name = null;
            synced.push(a);
        }
    });

    AppState.assumptions = synced;
}

// 获取主题下所有实验
function getThemeExperiments(themeId) {
    return AppState.assumptions.filter(a => a._theme_id === themeId);
}

// 聚合主题下所有实验的参数调整
// multiply: 连乘, add: 累加, set: 取绝对偏差最大的
function aggregateThemeParamAdjustments(themeId) {
    const experiments = getThemeExperiments(themeId);
    const merged = {};
    const mergedTypes = {};

    experiments.forEach(exp => {
        if (!exp.param_adjustments) return;
        Object.entries(exp.param_adjustments).forEach(([key, val]) => {
            // 跳过嵌套对象（如 beike: { ... }）
            if (typeof val === 'object' && val !== null) return;

            const adjType = exp.adjustment_type?.[key] || 'multiply';

            if (!merged[key]) {
                merged[key] = val;
                mergedTypes[key] = adjType;
            } else if (adjType === 'multiply' && mergedTypes[key] === 'multiply') {
                merged[key] = merged[key] * val;
            } else if (adjType === 'add' && mergedTypes[key] === 'add') {
                merged[key] = merged[key] + val;
            } else if (adjType === 'set') {
                if (Math.abs(val) > Math.abs(merged[key])) {
                    merged[key] = val;
                }
            }
        });
    });

    return { param_adjustments: merged, adjustment_type: mergedTypes };
}

// 构建主题级虚拟假设对象（供alignment等模块使用）
function buildThemeVirtualAssumption(theme) {
    const experiments = getThemeExperiments(theme.id);
    const aggregated = aggregateThemeParamAdjustments(theme.id);

    // 加权平均置信度
    let totalWeight = 0, weightedConfidence = 0;
    experiments.forEach(exp => {
        const w = exp.impact_level === '高' ? 3 : exp.impact_level === '中' ? 2 : 1;
        totalWeight += w;
        weightedConfidence += (exp.confidence_level || 50) * w;
    });

    // 聚合验证状态（最弱状态）
    const statuses = experiments.map(e => e.validation_status);
    const validation_status = statuses.includes('已否定') ? '已否定' :
        statuses.includes('待验证') ? '待验证' :
        statuses.includes('验证中') ? '验证中' : '已验证';

    return {
        id: theme.id,
        assumption_name: theme.theme_name,
        category: theme.theme_name,
        description: theme.description,
        impact_level: '高',
        confidence_level: totalWeight > 0 ? Math.round(weightedConfidence / totalWeight) : 50,
        validation_status: validation_status,
        param_adjustments: aggregated.param_adjustments,
        adjustment_type: aggregated.adjustment_type,
        is_active: experiments.some(e => e.is_active !== false),
        _is_theme: true,
        _experiment_count: experiments.length,
        _color: theme.color,
        _icon: theme.icon
    };
}

// 获取主题摘要统计
function getThemeSummary(theme) {
    const experiments = getThemeExperiments(theme.id);
    return {
        total: experiments.length,
        verified: experiments.filter(e => e.validation_status === '已验证').length,
        inProgress: experiments.filter(e => e.validation_status === '验证中').length,
        pending: experiments.filter(e => e.validation_status === '待验证').length,
        denied: experiments.filter(e => e.validation_status === '已否定').length,
        avgConfidence: experiments.length > 0 ?
            Math.round(experiments.reduce((s, e) => s + (e.confidence_level || 0), 0) / experiments.length) : 0,
    };
}

// ==================== 工具函数 ====================
function formatCurrency(value) {
    if (Math.abs(value) >= 100000000) return '¥' + (value / 100000000).toFixed(2) + '亿';
    if (Math.abs(value) >= 10000) return '¥' + (value / 10000).toFixed(1) + '万';
    return '¥' + value.toLocaleString('zh-CN');
}

function formatNumber(value, decimals = 0) {
    return Number(value).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPercent(value) {
    return Number(value).toFixed(1) + '%';
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i>${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ==================== 贝壳 UE 计算 ====================
function calculateBeikeUE(model) {
    const netRevenue = model.gtv_per_unit * (model.commission_rate / 100);
    const channelCost = (model.channel_broker || 0) + (model.channel_manager || 0) +
                        (model.channel_director || 0) + (model.channel_incentive || 0);
    const expenseTotal = (model.expense_city_hr || 0) + (model.expense_platform_hr || 0) +
                         (model.expense_brand || 0) + (model.expense_system || 0) + (model.expense_other || 0);
    // 招租成功率 & 口碑回单率杠杆
    // 招租成功率：影响有效签约率，从而影响单均摊销（基准75% → 每+1pp节省摊销成本1.33%）
    const rentalSuccessRate = (model.rental_success_rate || 75) / 100;
    const rentalBaseRate = 0.75;
    const rentalEfficiencyGain = rentalSuccessRate > 0 ? (rentalBaseRate / rentalSuccessRate) : 1; // <1 = 成本降低
    const adjustedExpense = expenseTotal * rentalEfficiencyGain;
    // 口碑回单率：转介绍获客无渠道成本，混合后降低加权CAC
    const referralRate = (model.referral_rate || 0) / 100;
    const referralBaseRate = 0.15;
    const paidLeadRatio = 1 - referralRate;
    const referralBaseRatio = 1 - referralBaseRate;
    const channelSavingFactor = referralBaseRatio > 0 ? (paidLeadRatio / referralBaseRatio) : 1;
    const adjustedChannelCost = channelCost * channelSavingFactor;
    const operatingProfit = netRevenue - adjustedChannelCost - adjustedExpense;
    const profitMargin = netRevenue > 0 ? (operatingProfit / netRevenue * 100) : 0;
    const gtvProfitMargin = model.gtv_per_unit > 0 ? (operatingProfit / model.gtv_per_unit * 100) : 0;

    return {
        gtv: model.gtv_per_unit,
        netRevenue,
        channelCost: adjustedChannelCost,
        rawChannelCost: channelCost,
        channelDetail: {
            broker: model.channel_broker || 0,
            manager: model.channel_manager || 0,
            director: model.channel_director || 0,
            incentive: model.channel_incentive || 0,
        },
        expenseTotal: adjustedExpense,
        rawExpenseTotal: expenseTotal,
        expenseDetail: {
            cityHR: model.expense_city_hr || 0,
            platformHR: model.expense_platform_hr || 0,
            brand: model.expense_brand || 0,
            system: model.expense_system || 0,
            other: model.expense_other || 0,
        },
        operatingProfit,
        profitMargin,
        gtvProfitMargin,
        // 效率杠杆
        rentalSuccessRate: (model.rental_success_rate || 75),
        referralRate: (model.referral_rate || 0),
        rentalEfficiencyGain,
        channelSavingFactor,
        // GTV比率
        gtvRatios: {
            commission: model.commission_rate,
            channel: adjustedChannelCost / model.gtv_per_unit * 100,
            expense: adjustedExpense / model.gtv_per_unit * 100,
            profit: operatingProfit / model.gtv_per_unit * 100,
        },
        // 净收比率
        revRatios: {
            channel: netRevenue > 0 ? (adjustedChannelCost / netRevenue * 100) : 0,
            expense: netRevenue > 0 ? (adjustedExpense / netRevenue * 100) : 0,
            profit: profitMargin,
        },
        lineItems: [
            { name: '单套GTV', value: model.gtv_per_unit, category: '基准', pct: 100 },
            { name: '美租净收入', value: netRevenue, category: '收入', pct: model.commission_rate, isSubtotal: true },
            { name: '渠道成本(调整后)', value: -adjustedChannelCost, category: '成本', pct: (adjustedChannelCost/netRevenue*100).toFixed(1) },
            { name: '├ 经纪人', value: -(model.channel_broker||0), category: '成本' },
            { name: '├ 资管经理', value: -(model.channel_manager||0), category: '成本' },
            { name: '├ 总监', value: -(model.channel_director||0), category: '成本' },
            { name: '├ 业务激励', value: -(model.channel_incentive||0), category: '成本' },
            { name: '├ 口碑节省系数', value: channelSavingFactor, category: '效率', unit: 'x' },
            { name: '费用摊销(调整后)', value: -adjustedExpense, category: '成本', pct: (adjustedExpense/netRevenue*100).toFixed(1) },
            { name: '├ 城市人工', value: -(model.expense_city_hr||0), category: '成本' },
            { name: '├ 平台人工', value: -(model.expense_platform_hr||0), category: '成本' },
            { name: '├ 品牌营销', value: -(model.expense_brand||0), category: '成本' },
            { name: '├ 系统建设', value: -(model.expense_system||0), category: '成本' },
            { name: '├ 其他运营', value: -(model.expense_other||0), category: '成本' },
            { name: '├ 招租效率系数', value: rentalEfficiencyGain, category: '效率', unit: 'x' },
            { name: '运营利润', value: operatingProfit, category: '利润', isTotal: true, pct: profitMargin.toFixed(1) },
        ],
    };
}

// ==================== 业主 UE 计算 ====================
function calculateOwnerUE(model) {
    // 主算法：装修金额 / 全月租金 = 几个月租金换一次装修
    const fullMonthRent = model.avg_rent_after || 0;
    const renovationToRentRatio = fullMonthRent > 0 ? (model.renovation_total / fullMonthRent) : 999;
    // 辅助：溢价回本
    const totalIncome = model.total_premium_income + model.vacancy_reduction_value;
    const totalCost = model.renovation_total + model.vacancy_cost;
    const netReturn = totalIncome - totalCost;
    const paybackMonths = model.rent_premium > 0 ? Math.ceil(model.renovation_total / model.rent_premium) : 999;
    const annualYield = model.renovation_total > 0 ? (model.first_year_return / model.renovation_total * 100) : 0;

    return {
        // 主指标
        renovationToRentRatio,          // 装修金额 ÷ 全月租金（月数）
        fullMonthRent,
        // 辅助指标（溢价视角）
        totalIncome,
        premiumIncome: model.total_premium_income,
        vacancyReductionValue: model.vacancy_reduction_value,
        totalCost,
        renovationTotal: model.renovation_total,
        beikeServiceFee: model.beike_service_fee,
        supplierCost: model.supplier_cost,
        vacancyCost: model.vacancy_cost,
        netReturn,
        paybackMonths,
        annualYield,
        lineItems: [
            { name: '装修总款(GTV)', value: -model.renovation_total, category: '投入', isSubtotal: true },
            { name: '├ 贝壳荐客费', value: -model.beike_service_fee, category: '投入' },
            { name: '├ 供应商执行', value: -model.supplier_cost, category: '投入' },
            { name: '装修后全月租金', value: fullMonthRent, category: '产出' },
            { name: '装修/租金倍数', value: renovationToRentRatio, category: '核心', isTotal: true, unit: '月' },
            { name: '── 辅助：溢价视角 ──', value: 0, category: '分隔', isSeparator: true },
            { name: '月租金溢价', value: model.rent_premium, category: '溢价' },
            { name: '租期总溢价收入', value: model.total_premium_income, category: '溢价', isSubtotal: true },
            { name: '空置减少价值', value: model.vacancy_reduction_value, category: '溢价' },
            { name: '空置损失', value: -model.vacancy_cost, category: '溢价' },
            { name: '溢价回本月数', value: paybackMonths, category: '溢价', unit: '月' },
        ],
    };
}

// ==================== 供应商 UE 计算 ====================
function calculateSupplierUE(model) {
    const materialCost = model.furniture + model.appliances + model.soft_furnishing;
    const laborCost = model.foreman + model.designer + model.supervisor + model.admin + model.gc_boss;
    // 剔除资金成本；酒管→系统
    const overheadCost = (model.system_fee || 0) + model.formaldehyde +
                         model.invoicing + model.capital_invoice + model.marketing;
    const totalExBeike = materialCost + laborCost + overheadCost;
    const totalIncBeike = totalExBeike + model.beike_fee;
    
    // 使用计算后的总成本（而非原始total_cost），确保参数调整能反映在结果中
    // 注意：total_cost 不含贝壳荐客费，对应 totalExBeike
    const effectiveTotalCost = model.total_cost !== undefined ? 
        (model.foreman !== undefined || model.furniture !== undefined || model.appliances !== undefined ? 
            totalExBeike : model.total_cost) : totalExBeike;

    return {
        totalCost: effectiveTotalCost,
        beikeFee: model.beike_fee,
        materialCost,
        laborCost,
        overheadCost,
        totalExBeike,
        totalIncBeike,
        lineItems: [
            { name: '贝壳荐客费', value: model.beike_fee, category: '平台', pct: model.beike_fee_pct },
            { name: '工长', value: model.foreman, category: '施工', pct: model.foreman_pct },
            { name: '设计师', value: model.designer, category: '施工', pct: model.designer_pct },
            { name: '监理', value: model.supervisor, category: '施工', pct: model.supervisor_pct },
            { name: '职能', value: model.admin, category: '施工', pct: model.admin_pct },
            { name: '总包老板', value: model.gc_boss, category: '施工', pct: model.gc_boss_pct },
            { name: '家具', value: model.furniture, category: '主材', pct: model.furniture_pct },
            { name: '家电', value: model.appliances, category: '主材', pct: model.appliances_pct },
            { name: '软装', value: model.soft_furnishing, category: '主材', pct: model.soft_furnishing_pct },
            { name: '系统', value: model.system_fee || 0, category: '其他', pct: model.system_fee_pct || 0 },
            { name: '甲醛', value: model.formaldehyde, category: '其他', pct: model.formaldehyde_pct },
            { name: '开票', value: model.invoicing, category: '其他', pct: model.invoicing_pct },
            { name: '资金票', value: model.capital_invoice, category: '其他', pct: model.capital_invoice_pct },
            { name: '营销', value: model.marketing, category: '其他', pct: model.marketing_pct },
        ],
    };
}

// ==================== 兼容层：旧 calculateUE 桥接 ====================
// 保持旧模块（cross-analysis, alignment 等）可运行，逐步迁移
function calculateUE(model) {
    // 检测是否是新的 beike model
    if (model.commission_rate !== undefined) {
        const bue = calculateBeikeUE(model);
        return {
            gtv: bue.gtv,
            totalRevenue: bue.netRevenue,
            serviceFee: bue.netRevenue,
            rentPremium: 0,
            rentPremiumRevenue: 0,
            grossProfit: bue.operatingProfit,
            grossMargin: bue.profitMargin,
            unitProfit: bue.operatingProfit,
            renovationCost: bue.channelCost + bue.expenseTotal,
            materialCost: bue.channelCost,
            laborCost: bue.expenseDetail.cityHR,
            managementFee: bue.expenseDetail.platformHR + bue.expenseDetail.brand + bue.expenseDetail.system,
            otherCost: bue.expenseDetail.other,
            insuranceCost: 0,
            smartDeviceCost: 0,
            totalDirectCost: bue.channelCost + bue.expenseTotal,
            vacancyLoss: 0,
            monthlyTargetUnits: model.monthly_target_units || 0,
            lineItems: bue.lineItems,
        };
    }
    // 旧模型兼容（不应再触发）
    const gtv = model.gtv_per_unit || 0;
    const rev = gtv * ((model.service_fee_rate || 10) / 100);
    return { gtv, totalRevenue: rev, grossProfit: rev * 0.2, grossMargin: 20, unitProfit: rev * 0.2, lineItems: [], monthlyTargetUnits: model.monthly_target_units || 0, serviceFee: rev, rentPremium: 0, rentPremiumRevenue: 0, renovationCost: 0, materialCost: 0, laborCost: 0, managementFee: 0, otherCost: 0, insuranceCost: 0, smartDeviceCost: 0, totalDirectCost: 0, vacancyLoss: 0 };
}

// ==================== 假设应用 ====================
/**
 * 应用战略假设到基准模型（支持三视角）
 * @param {Object} baselineModels - 三视角基准模型 {beike, owner, supplier}
 * @param {Object} assumption - 战略假设，包含 param_adjustments 和 adjustment_type
 * @returns {Object} - 调整后的三视角模型 {beike, owner, supplier}
 */
function applyAssumption(baselineModels, assumption) {
    // 兼容旧格式：如果传入的是单个模型，包装成三视角格式
    if (!baselineModels.beike && !baselineModels.owner && !baselineModels.supplier) {
        // 旧格式：直接传入 beike 模型
        return applyAssumptionToModel(baselineModels, assumption.param_adjustments, assumption.adjustment_type);
    }
    
    // 新格式：三视角模型
    const result = {};
    
    // 检测 param_adjustments 格式
    const pa = assumption.param_adjustments || {};
    const at = assumption.adjustment_type || {};
    
    // 判断是否是扁平化格式（包含直接的参数键，而非视角键）
    const isFlatFormat = !pa.beike && !pa.owner && !pa.supplier && 
                         Object.keys(pa).length > 0 && 
                         !['conservative', 'target', 'optimistic'].includes(Object.keys(pa)[0]);
    
    // 处理每个视角
    ['beike', 'owner', 'supplier'].forEach(perspective => {
        const baseline = baselineModels[perspective];
        if (!baseline) {
            result[perspective] = null;
            return;
        }
        
        let adj, adjType;
        
        if (isFlatFormat) {
            // 扁平化格式：所有参数直接应用到对应视角（如果参数存在）
            adj = {};
            adjType = {};
            
            Object.entries(pa).forEach(([key, val]) => {
                // 只应用该视角存在的参数
                if (baseline[key] !== undefined) {
                    adj[key] = val;
                    adjType[key] = at[key] || 'multiply';
                }
            });
        } else {
            // 嵌套格式：按视角分组
            adj = pa[perspective] || {};
            adjType = at[perspective] || {};
        }
        
        result[perspective] = applyAssumptionToModel(baseline, adj, adjType);
    });
    
    return result;
}

/**
 * 应用参数调整到单个模型
 */
function applyAssumptionToModel(baseline, adjustments, types) {
    const adjusted = JSON.parse(JSON.stringify(baseline));
    
    for (const [key, val] of Object.entries(adjustments)) {
        if (adjusted[key] !== undefined) {
            const type = types[key] || 'multiply';
            if (type === 'multiply') adjusted[key] = adjusted[key] * val;
            else if (type === 'add') adjusted[key] = adjusted[key] + val;
            else if (type === 'set') adjusted[key] = val;
        }
    }
    
    // 联动计算（仅贝壳模型）
    if (adjusted.commission_rate !== undefined && adjusted.gtv_per_unit !== undefined) {
        adjusted.net_revenue = adjusted.gtv_per_unit * (adjusted.commission_rate / 100);
    }
    
    return adjusted;
}

// ==================== 财务推演 ====================
function generateFinancialProjection(model, scaleParams, months = 6) {
    const ue = calculateBeikeUE(model);
    const cityScale = scaleParams[AppState.currentCity] || scaleParams.beijing;
    const productScale = cityScale[AppState.currentProduct] || cityScale.standard;
    const team = TEAM_STRUCTURE[AppState.currentCity] || TEAM_STRUCTURE.beijing;
    const projections = [];

    for (let m = 1; m <= months; m++) {
        const units = productScale.monthlyUnits;
        const revenue = units * ue.netRevenue;
        const channelCost = units * ue.channelCost;
        const expenseCost = units * ue.expenseTotal;
        const operatingProfit = units * ue.operatingProfit;
        const personnelCost = team.h2_headcount * team.avg_salary;

        // 计算各项利润指标（单位：万元）
        const directCost = (channelCost + expenseCost) / 10000;
        const grossProfit = revenue / 10000 - directCost;
        const netProfit = operatingProfit / 10000;
        
        projections.push({
            month: m,
            units,
            gtv: units * ue.gtv / 10000,
            revenue: revenue / 10000,
            channelCost: channelCost / 10000,
            expenseCost: expenseCost / 10000,
            directCost,
            grossProfit,
            operatingProfit: operatingProfit / 10000,
            netProfit,
            profitMargin: ue.profitMargin,
            personnelCost: personnelCost / 10000,
            headcount: team.h2_headcount,
            perCapitaUnits: units / team.h2_headcount,
        });
    }
    return projections;
}

// ==================== 获取当前模型的便捷方法 ====================
function getCurrentBeikeModel() {
    const city = AppState.currentCity;
    const product = AppState.currentProduct;
    return AppState.baselineModels.beike[city][product];
}

function getCurrentOwnerModel() {
    const city = AppState.currentCity;
    const product = AppState.currentProduct;
    return DEFAULT_OWNER_MODELS[city][product];
}

function getCurrentSupplierModel() {
    return DEFAULT_SUPPLIER_MODELS.standard;
}

// ==================== 初始化 ====================
function initializeState() {
    AppState.baselineModels = {
        beike: JSON.parse(JSON.stringify(DEFAULT_BEIKE_MODELS)),
        owner: JSON.parse(JSON.stringify(DEFAULT_OWNER_MODELS)),
        supplier: JSON.parse(JSON.stringify(DEFAULT_SUPPLIER_MODELS)),
        // 兼容层：旧代码用 AppState.baselineModels[city]
        beijing: JSON.parse(JSON.stringify(DEFAULT_BEIKE_MODELS.beijing.standard)),
        shanghai: JSON.parse(JSON.stringify(DEFAULT_BEIKE_MODELS.shanghai.standard)),
    };
    AppState.assumptions = JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS));
    AppState.themes = JSON.parse(JSON.stringify(DEFAULT_THEMES));
    syncAssumptionsFromThemes();
}
