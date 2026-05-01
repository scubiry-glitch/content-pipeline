// ===== 市场机会分析模块 (L1战略层) =====
// 基于美租系列研究：供需双向市场规模测算 + 战略路径规划

// ==================== 市场规模测算模型 ====================

// 供给侧：房源市场规模测算（TAM→SAM→SOM）
const SUPPLY_MARKET_MODEL = {
    beijing: {
        tam: {
            label: '住宅总量',
            value: 801, // 万套
            source: '研究院统计值',
            note: '北京市住宅总存量'
        },
        filters: [
            { label: '房龄15年+量', rate: 0.63, value: 512.6, note: '15年+房龄比例 63%' },
            { label: '未翻新重装量', rate: 0.444, value: 234.3, note: '未翻新重装比例 44.4%' },
            { label: '出租总体量', rate: 0.326, value: 76.4, note: '出租比例 32.6%' }
        ],
        sam: {
            label: '年度目标报盘量(SAM)',
            value: 45.9, // 万套
            rate: 0.60,
            note: '机构年度挂牌比例 60%'
        },
        som: {
            label: '贝壳报盘量(SOM)',
            value: 18.4, // 万套
            rate: 0.50,
            note: '贝壳租赁挂牌比例 50%'
        },
        effective: {
            label: '有效目标市场',
            value: 8.25, // 万套
            rate: 0.4495,
            note: '租金4000+占比80% × 坪效支撑装修成本',
            growthRate: 0.0372, // CAGR ~3.72%
            projection2035: 28.4 // 万套
        }
    },
    shanghai: {
        tam: { label: '住宅总量', value: 920, source: '研究院统计值' },
        filters: [
            { label: '房龄15年+量', rate: 0.58, value: 533.6 },
            { label: '未翻新重装量', rate: 0.42, value: 224.1 },
            { label: '出租总体量', rate: 0.35, value: 78.4 }
        ],
        sam: { label: '年度目标报盘量(SAM)', value: 52.3, rate: 0.60 },
        som: { label: '贝壳报盘量(SOM)', value: 26.2, rate: 0.50 },
        effective: { label: '有效目标市场', value: 9.5, rate: 0.42, growthRate: 0.035, projection2035: 31.2 }
    }
};

// 需求侧：租客市场规模测算
const DEMAND_MARKET_MODEL = {
    beijing: {
        totalRenters: 801, // 万租房人口
        targetFilter: {
            single: { minRent: 4000, population: 45.8 }, // 独居
            couple: { minRent: 7000, population: 28.3 }, // 情侣
            family: { minRent: 10000, population: 18.5 } // 家庭
        },
        som: 76.4, // 万套/年（与供给侧SOM匹配）
        targetSegments: [
            { name: '高价值独居', rent: '~10,000', leaseTerm: 1.38, value: 6835, priority: 'P1' },
            { name: '品质家庭', rent: '~12,000', leaseTerm: 1.72, value: 38638, priority: 'P1' },
            { name: '品质情侣', rent: '~12,000', leaseTerm: 1.38, value: 12345, priority: 'P1' },
            { name: '品质独居', rent: '~6,500', leaseTerm: 1.03, value: 21323, priority: 'P2' },
            { name: '普通家庭', rent: '~8,000', leaseTerm: 1.66, value: 21105, priority: 'P2' }
        ]
    }
};

// ==================== 战略路径定义 ====================

const STRATEGIC_PATHS = {
    // 路径1：哪些是我们的市场
    marketDefinition: {
        title: '哪些是我们的市场',
        icon: 'crosshairs',
        color: '#6366f1',
        subtitle: '局装 → 整装',
        before: {
            product: '局部改造（软装/局改）',
            tam: '155万套/年',
            price: '¥1,000-20,000',
            margin: '<10%',
            penetration: '5%以下'
        },
        after: {
            product: '全屋标准风格翻新',
            tam: '45.9万套/年',
            price: '¥80,000',
            margin: '20%',
            penetration: '10%以上'
        },
        keyMetrics: [
            { label: '北上总市场空间', value: '15万+套/年', source: '方案2' },
            { label: '有效市场占比', value: '44.95%', source: '美租系列' },
            { label: '24年北京规模', value: '8.25万套', source: '美租系列' },
            { label: '目标渗透率', value: '10%+', source: '业务目标' }
        ],
        qualifyingCriteria: [
            { label: '面积', value: '≥30㎡', reason: '一居室基本条件' },
            { label: '租金', value: '≥4,000元/月', reason: '北京一居室均价' },
            { label: '坪效', value: '≥100元/㎡/月(80㎡以下)', reason: '支撑装修成本' },
            { label: '房龄', value: '15年+', reason: '待翻新重装' },
            { label: '客单价', value: '5-10万可覆盖', reason: 'UE可持续' }
        ]
    },
    
    // 路径2：我们卖什么
    productStrategy: {
        title: '我们卖什么',
        icon: 'box-open',
        color: '#2f9668',
        subtitle: '个性化 → 标准化',
        before: {
            product: '个性化服务',
            conversionRate: '7%',
            issue: '不利于品质管控'
        },
        after: {
            product: '标准化产品管理',
            conversionRate: '14%',
            benefit: '商机转成交率翻倍'
        },
        // 标准化体系定义
        standardizationSystem: {
            title: '标准化体系定义',
            subtitle: '产品 × 获客 × 转化 × 交付 四维能力模型',
            dimensions: [
                {
                    key: 'product',
                    name: '产品标准化',
                    icon: 'cube',
                    color: '#2f9668',
                    description: '从个性化定制到标准产品化',
                    elements: [
                        { label: '产品矩阵', value: '简装/标准/品质三档' },
                        { label: '定价策略', value: '3-5万/6-8万/8-10万' },
                        { label: '模块化设计', value: '可组合的标准模块' },
                        { label: '品质标准', value: '统一施工与验收标准' }
                    ],
                    metrics: { current: '28.9%', target: '85%', metric: '标准化GTV占比' }
                },
                {
                    key: 'acquisition',
                    name: '获客标准化',
                    icon: 'bullhorn',
                    color: '#6366f1',
                    description: '从分散获客到聚焦盘精准获客',
                    elements: [
                        { label: '房源筛选', value: '两高一低聚焦策略' },
                        { label: '客户分层', value: 'P1/P2客群精准定位' },
                        { label: '获客渠道', value: '资管经理+美租顾问双轮' },
                        { label: '线索评级', value: '标准化线索质量评分' }
                    ],
                    metrics: { current: '0.2%', target: '1%', metric: '聚焦盘推房有效率' }
                },
                {
                    key: 'conversion',
                    name: '转化标准化',
                    icon: 'exchange-alt',
                    color: '#f59e0b',
                    description: '从顾问个人经验到标准化销售流程',
                    elements: [
                        { label: '销售流程', value: '咨询→量房→方案→签约' },
                        { label: '话术体系', value: '标准化卖点与异议处理' },
                        { label: '报价模式', value: '清单式/套餐式透明定价' },
                        { label: '促单工具', value: 'ROI计算器+案例库' }
                    ],
                    metrics: { current: '7%', target: '14%', metric: '量房→签约转化率' }
                },
                {
                    key: 'delivery',
                    name: '交付标准化',
                    icon: 'truck',
                    color: '#ec4899',
                    description: '从工长个人交付到供应链标准化交付',
                    elements: [
                        { label: '施工标准', value: '工序工艺标准化手册' },
                        { label: '供应链管理', value: '集采+统一配送' },
                        { label: '品控体系', value: '关键节点验收标准' },
                        { label: '工期管理', value: '标准工期承诺与赔付' }
                    ],
                    metrics: { current: '72%', target: '90%', metric: '如期交付率' }
                }
            ]
        },
        productMatrix: [
            { type: '软品牌', definition: '轻度美化', price: '¥1,000', tam: '155万套', margin: '<10%' },
            { type: '模块品牌', definition: '局部改造', price: '¥20,000', tam: '40.9万套', margin: '10%' },
            { type: '标准品牌⭐', definition: '全屋翻新', price: '¥80,000', tam: '45.9万套', margin: '20%' }
        ],
        sevenProducts: [
            { code: 'A', name: '高价值家庭', rent: '15,000元+', layout: '2居+', target: 3521 },
            { code: 'B', name: '高价值情侣/独居', rent: '15,000元+', layout: '2居/1居', target: 2552 },
            { code: 'C', name: '高价值独居', rent: '8,000元+', layout: '1居', target: 1540 },
            { code: 'D', name: '品质情侣', rent: '9,000-15,000元', layout: '2居', target: 4180 },
            { code: 'E', name: '品质家庭', rent: '9,000-15,000元', layout: '2居+', target: 11330 },
            { code: 'F', name: '普通家庭/情侣', rent: '7,000-9,000元', layout: '2居', target: 9636 },
            { code: 'G', name: '品质独居', rent: '5,000-8,000元', layout: '1居', target: 12848 }
        ]
    },
    
    // 路径3：我们的商业模式
    businessModel: {
        title: '我们的商业模式',
        icon: 'coins',
        color: '#f59e0b',
        subtitle: '单品牌 → 多品牌',
        // 多品牌战略必要性
        multiBrandStrategy: {
            title: '多品牌战略的必要性',
            reasons: [
                {
                    title: '需求多元化',
                    icon: 'users',
                    points: [
                        '不同客群价格敏感度差异大：简装客户预算3-5万，品质客户预算8-10万+',
                        '功能需求分化：引流款满足基础居住，利润款满足品质升级',
                        '决策路径不同：价格敏感型重性价比，品质导向型重品牌信任'
                    ]
                },
                {
                    title: '风险隔离',
                    icon: 'shield-alt',
                    points: [
                        '品牌风险隔离：高端品牌负面事件不影响大众品牌',
                        '业务风险分散：单一品牌依赖度过高，多品牌平衡波动',
                        '渠道冲突规避：不同品牌对应不同渠道，避免内部竞争'
                    ]
                },
                {
                    title: '市场全覆盖',
                    icon: 'expand-arrows-alt',
                    points: [
                        '价格带全覆盖：3-10万区间分层覆盖，不放弃任何细分市场',
                        '生命周期覆盖：引流款获客→标准款转化→品质款升级',
                        '区域适配性：不同城市选择不同品牌组合策略'
                    ]
                },
                {
                    title: '利润结构优化',
                    icon: 'chart-pie',
                    points: [
                        '引流款（简装）：低毛利但高转化，降低获客成本',
                        '主力款（标准）：规模利润核心，占比60%+',
                        '利润款（品质）：高毛利溢价，提升整体盈利水平'
                    ]
                }
            ]
        },
        // 品牌矩阵
        brandMatrix: [
            { 
                name: '简装品牌', 
                positioning: '引流款·极致性价比',
                priceRange: '3-5万',
                target: '价格敏感型客户',
                margin: '8-12%',
                role: '获客入口'
            },
            { 
                name: '美租标准⭐', 
                positioning: '主力款·品质标准化',
                priceRange: '6-8万',
                target: '大众品质客户',
                margin: '18-22%',
                role: '规模核心'
            },
            { 
                name: '品质品牌', 
                positioning: '利润款·高端定制',
                priceRange: '8-12万',
                target: '高价值客户',
                margin: '25-30%',
                role: '利润引擎'
            }
        ],
        // 简化定价模式
        pricingModels: [
            { 
                name: '清单式定价（主推）', 
                formula: '资金成本 + 管理费(5%) + 硬装结算 + 贝壳收益(12%)',
                note: '屋况标准-现状=服务清单，透明可控'
            }
        ],
        ltvImprovement: {
            base: { name: '省心租LTV', value: 20258 },
            meizu: { name: '美租LTV', value: 75154, uplift: '+202.58%' },
            drivers: [
                { label: '租金溢价', value: 11398, note: '10%溢价' },
                { label: '租期延长', value: 20060, note: '2年→6年' },
                { label: '美租直接收入', value: 14929, note: '装修+服务' },
                { label: '其他', value: 3929 }
            ]
        }
    }
};

// ==================== 页面渲染 ====================

function renderMarketOpportunityPage() {
    const container = document.getElementById('market-opportunity-content');
    if (!container) return;
    
    let html = `
        <!-- 顶部说明 -->
        <div class="mb-6">
            <div class="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-5 border border-indigo-100">
                <div class="flex items-center gap-3 mb-3">
                    <span class="text-3xl">🎯</span>
                    <div>
                        <h2 class="text-xl font-bold text-gray-900">市场机会分析 — 供需双向规模盘点</h2>
                        <p class="text-sm text-gray-600">基于美租系列研究 / 方案2 / 0922报告 | TAM→SAM→SOM漏斗测算</p>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-3 text-center">
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-indigo-600">15万+</div>
                        <div class="text-xs text-gray-500">北上总市场空间(套/年)</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-purple-600">44.95%</div>
                        <div class="text-xs text-gray-500">有效市场占比</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-green-600">8.25万</div>
                        <div class="text-xs text-gray-500">北京24年规模(套)</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-amber-600">200+</div>
                        <div class="text-xs text-gray-500">单月目标(单)</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 供需双向规模测算 -->
        <div class="grid grid-cols-2 gap-6 mb-6">
            ${renderSupplyAnalysis()}
            ${renderDemandAnalysis()}
        </div>

        <!-- 三大战略路径 -->
        <div class="space-y-6">
            ${renderStrategicPath('marketDefinition')}
            ${renderStrategicPath('productStrategy')}
            ${renderStrategicPath('businessModel')}
        </div>
    `;
    
    container.innerHTML = html;
    
    // 渲染图表
    setTimeout(() => {
        renderSupplyFunnelChart();
        renderDemandScatterChart();
    }, 100);
}

// 供给侧分析
function renderSupplyAnalysis() {
    const city = AppState.currentCity;
    const model = SUPPLY_MARKET_MODEL[city] || SUPPLY_MARKET_MODEL.beijing;
    
    return `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-building mr-2 text-blue-500"></i>供给侧：房源市场规模</h3>
                <span class="text-[10px] text-gray-400">TAM→SAM→SOM漏斗</span>
            </div>
            <div class="p-4">
                <!-- TAM -->
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-bold text-gray-700">🏠 TAM · ${model.tam.label}</span>
                        <span class="text-lg font-black text-blue-600">${model.tam.value}万套</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-2">${model.tam.note || model.tam.source}</div>
                </div>
                
                <!-- 筛选漏斗 -->
                <div class="space-y-2 mb-4 pl-4 border-l-2 border-blue-200">
                    ${model.filters.map(f => `
                        <div class="flex items-center justify-between text-sm">
                            <span class="text-gray-600">↓ ${f.label} (${(f.rate*100).toFixed(1)}%)</span>
                            <span class="font-semibold text-gray-800">${f.value}万套</span>
                        </div>
                    `).join('')}
                </div>
                
                <!-- SAM -->
                <div class="mb-4 p-3 bg-blue-50 rounded-xl">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-bold text-blue-800">📊 SAM · ${model.sam.label}</span>
                        <span class="text-xl font-black text-blue-600">${model.sam.value}万套</span>
                    </div>
                    <div class="text-xs text-blue-600 mt-1">${model.sam.note}</div>
                </div>
                
                <!-- SOM -->
                <div class="mb-4 p-3 bg-indigo-50 rounded-xl">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-bold text-indigo-800">🎯 SOM · ${model.som.label}</span>
                        <span class="text-xl font-black text-indigo-600">${model.som.value}万套</span>
                    </div>
                    <div class="text-xs text-indigo-600 mt-1">${model.som.note}</div>
                </div>
                
                <!-- 有效市场 -->
                <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-bold text-green-800">✅ ${model.effective.label}</span>
                        <span class="text-2xl font-black text-green-600">${model.effective.value}万套</span>
                    </div>
                    <div class="text-xs text-green-700 mb-2">${model.effective.note}</div>
                    <div class="flex gap-4 text-xs">
                        <span class="text-gray-600">CAGR: <strong class="text-green-600">${(model.effective.growthRate*100).toFixed(2)}%</strong></span>
                        <span class="text-gray-600">2035年: <strong class="text-green-600">${model.effective.projection2035}万套</strong></span>
                    </div>
                </div>
                
                <!-- 图表容器 -->
                <div id="chart-supply-funnel" style="height:200px;" class="mt-4"></div>
            </div>
        </div>
    `;
}

// 需求侧分析
function renderDemandAnalysis() {
    const model = DEMAND_MARKET_MODEL.beijing;
    
    return `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-users mr-2 text-amber-500"></i>需求侧：租客市场规模</h3>
                <span class="text-[10px] text-gray-400">目标客群细分与聚焦</span>
            </div>
            <div class="p-4">
                <!-- 总租房人口 -->
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-bold text-gray-700">👥 北京总租房人口</span>
                        <span class="text-lg font-black text-amber-600">${model.totalRenters}万人</span>
                    </div>
                </div>
                
                <!-- 目标客群筛选 -->
                <div class="space-y-2 mb-4">
                    <div class="text-xs font-bold text-gray-500 uppercase mb-2">目标客群筛选标准</div>
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="bg-amber-50 rounded-lg p-2">
                            <div class="text-xs text-gray-500">独居</div>
                            <div class="text-sm font-bold text-amber-700">¥${model.targetFilter.single.minRent}+</div>
                            <div class="text-xs text-gray-400">${model.targetFilter.single.population}万人</div>
                        </div>
                        <div class="bg-orange-50 rounded-lg p-2">
                            <div class="text-xs text-gray-500">情侣</div>
                            <div class="text-sm font-bold text-orange-700">¥${model.targetFilter.couple.minRent}+</div>
                            <div class="text-xs text-gray-400">${model.targetFilter.couple.population}万人</div>
                        </div>
                        <div class="bg-red-50 rounded-lg p-2">
                            <div class="text-xs text-gray-500">家庭</div>
                            <div class="text-sm font-bold text-red-700">¥${model.targetFilter.family.minRent}+</div>
                            <div class="text-xs text-gray-400">${model.targetFilter.family.population}万人</div>
                        </div>
                    </div>
                </div>
                
                <!-- 匹配SOM -->
                <div class="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-bold text-amber-800">🔗 供需匹配SOM</span>
                        <span class="text-xl font-black text-amber-600">${model.som}万套/年</span>
                    </div>
                    <div class="text-xs text-amber-700 mt-1">供给侧SOM与需求侧匹配</div>
                </div>
                
                <!-- 目标客群细分 -->
                <div class="space-y-2">
                    <div class="text-xs font-bold text-gray-500 uppercase mb-2">目标客群细分(P1/P2)</div>
                    ${model.targetSegments.slice(0, 5).map(s => `
                        <div class="flex items-center justify-between p-2 ${s.priority === 'P1' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'} rounded-lg">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] px-1.5 py-0.5 rounded ${s.priority === 'P1' ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}">${s.priority}</span>
                                <span class="text-sm font-medium ${s.priority === 'P1' ? 'text-green-800' : 'text-gray-700'}">${s.name}</span>
                            </div>
                            <div class="text-right">
                                <div class="text-sm font-bold ${s.priority === 'P1' ? 'text-green-600' : 'text-gray-600'}">${s.value.toLocaleString()}</div>
                                <div class="text-[10px] text-gray-400">${s.rent}/月</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- 图表容器 -->
                <div id="chart-demand-scatter" style="height:200px;" class="mt-4"></div>
            </div>
        </div>
    `;
}

// 战略路径卡片
function renderStrategicPath(pathKey) {
    const path = STRATEGIC_PATHS[pathKey];
    
    let content = '';
    
    if (pathKey === 'marketDefinition') {
        content = `
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div class="text-xs font-bold text-gray-600 mb-2">📍 局装（起点）</div>
                    <div class="space-y-1 text-sm text-gray-500">
                        <div class="flex justify-between"><span>TAM</span><span class="font-mono">${path.before.tam}</span></div>
                        <div class="flex justify-between"><span>客单价</span><span class="font-mono">${path.before.price}</span></div>
                        <div class="flex justify-between"><span>利润率</span><span class="font-mono">${path.before.margin}</span></div>
                    </div>
                </div>
                <div class="p-3 bg-green-50 rounded-xl border border-green-200">
                    <div class="text-xs font-bold text-green-700 mb-2">✅ 整装（目标）</div>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between"><span>TAM</span><span class="font-mono">${path.after.tam}</span></div>
                        <div class="flex justify-between"><span>客单价</span><span class="font-mono">${path.after.price}</span></div>
                        <div class="flex justify-between"><span>利润率</span><span class="font-mono text-green-600">${path.after.margin}</span></div>
                    </div>
                </div>
            </div>
            
            <!-- 聚焦盘画像 — 整合到市场定义中 -->
            <div class="mt-4 p-4 bg-gradient-to-r from-red-50 via-amber-50 to-gray-50 rounded-xl border border-red-200">
                <div class="flex items-center gap-2 mb-3">
                    <i class="fas fa-bullseye text-red-500"></i>
                    <span class="text-sm font-bold text-gray-700">聚焦盘画像 — 两高一低</span>
                    <span class="text-[10px] text-gray-400">0922报告 · 推房有效率目标 1%（vs 全量0.2%）</span>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div class="p-3 bg-white/80 rounded-xl border border-red-200 text-center">
                        <div class="text-2xl mb-1">🏢</div>
                        <div class="text-sm font-bold text-red-800">高楼龄</div>
                        <div class="text-xs text-red-600 mt-1">20年+</div>
                    </div>
                    <div class="p-3 bg-white/80 rounded-xl border border-amber-200 text-center">
                        <div class="text-2xl mb-1">📈</div>
                        <div class="text-sm font-bold text-amber-800">高坪效</div>
                        <div class="text-xs text-amber-600 mt-1">60元/㎡+</div>
                    </div>
                    <div class="p-3 bg-white/80 rounded-xl border border-gray-300 text-center">
                        <div class="text-2xl mb-1">🏚️</div>
                        <div class="text-sm font-bold text-gray-800">房况差</div>
                        <div class="text-xs text-gray-600 mt-1">HQI&lt;60</div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                <div class="text-xs font-bold text-indigo-700 mb-2">关键指标</div>
                <div class="grid grid-cols-4 gap-2">
                    ${path.keyMetrics.map(m => `
                        <div class="text-center">
                            <div class="text-lg font-bold text-indigo-600">${m.value}</div>
                            <div class="text-[10px] text-gray-500">${m.label}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else if (pathKey === 'productStrategy') {
        const sys = path.standardizationSystem;
        content = `
            <!-- 标准化体系定义 -->
            <div class="mb-5 p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-slate-200">
                <div class="flex items-center gap-2 mb-3">
                    <i class="fas fa-sitemap text-slate-600"></i>
                    <span class="font-bold text-slate-800">${sys.title}</span>
                    <span class="text-xs text-slate-500">| ${sys.subtitle}</span>
                </div>
                <div class="grid grid-cols-4 gap-3">
                    ${sys.dimensions.map(d => `
                        <div class="p-3 bg-white rounded-lg border-l-4" style="border-color: ${d.color}">
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-${d.icon}" style="color: ${d.color}"></i>
                                <span class="text-sm font-bold" style="color: ${d.color}">${d.name}</span>
                            </div>
                            <div class="text-xs text-gray-500 mb-2">${d.description}</div>
                            <div class="space-y-1 mb-2">
                                ${d.elements.map(e => `
                                    <div class="flex justify-between text-[10px]">
                                        <span class="text-gray-400">${e.label}</span>
                                        <span class="font-medium text-gray-700">${e.value}</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="pt-2 border-t border-gray-100">
                                <div class="flex items-center justify-between text-[10px]">
                                    <span class="text-gray-400">${d.metrics.metric}</span>
                                    <span class="font-bold" style="color: ${d.color}">${d.metrics.current} → ${d.metrics.target}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 产品矩阵 -->
            <div class="grid grid-cols-3 gap-3 mb-4">
                ${path.productMatrix.map(p => `
                    <div class="p-3 ${p.type === '标准品牌⭐' ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400' : 'bg-gray-50 border border-gray-200'} rounded-xl">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold ${p.type === '标准品牌⭐' ? 'text-green-800' : 'text-gray-600'}">${p.type}</span>
                            ${p.type === '标准品牌⭐' ? '<span class="text-[10px] bg-green-500 text-white px-1 rounded">优先</span>' : ''}
                        </div>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span class="text-gray-500">定价</span><span class="font-bold ${p.type === '标准品牌⭐' ? 'text-green-700' : 'text-gray-800'}">${p.price}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">TAM</span><span class="font-mono">${p.tam}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">利润率</span><span class="font-mono ${p.type === '标准品牌⭐' ? 'text-green-600' : ''}">${p.margin}</span></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div>
                <div class="text-xs font-bold text-gray-500 uppercase mb-2">7个产品方向</div>
                <div class="grid grid-cols-7 gap-2">
                    ${path.sevenProducts.map(p => `
                        <div class="p-2 bg-gray-50 rounded-lg text-center">
                            <div class="text-lg font-black text-gray-400">${p.code}</div>
                            <div class="text-[10px] font-bold text-gray-700 truncate">${p.name}</div>
                            <div class="text-[9px] text-gray-400">${p.rent}</div>
                            <div class="text-[9px] text-green-600 mt-1">${p.target.toLocaleString()}套</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else if (pathKey === 'businessModel') {
        content = `
            <!-- 多品牌战略必要性 -->
            <div class="mb-5 p-4 bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 rounded-xl border border-amber-200">
                <div class="flex items-center gap-2 mb-3">
                    <i class="fas fa-sitemap text-amber-600"></i>
                    <span class="font-bold text-amber-800">${path.multiBrandStrategy.title}</span>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${path.multiBrandStrategy.reasons.map(r => `
                        <div class="p-3 bg-white/80 rounded-lg">
                            <div class="flex items-center gap-2 mb-2">
                                <i class="fas fa-${r.icon} text-amber-500"></i>
                                <span class="text-sm font-bold text-gray-800">${r.title}</span>
                            </div>
                            <ul class="space-y-1">
                                ${r.points.map(p => `
                                    <li class="text-[10px] text-gray-600 flex items-start gap-1">
                                        <span class="text-amber-400 mt-0.5">•</span>
                                        <span>${p}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 品牌矩阵 -->
            <div class="mb-4">
                <div class="text-xs font-bold text-gray-500 uppercase mb-2">品牌矩阵 · 三档覆盖</div>
                <div class="grid grid-cols-3 gap-3">
                    ${path.brandMatrix.map((b, i) => `
                        <div class="p-3 ${i === 1 ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400' : 'bg-gray-50 border border-gray-200'} rounded-xl">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs font-bold ${i === 1 ? 'text-amber-800' : 'text-gray-600'}">${b.name}</span>
                                ${i === 1 ? '<span class="text-[10px] bg-amber-500 text-white px-1 rounded">主力</span>' : ''}
                            </div>
                            <div class="text-[10px] text-gray-500 mb-2">${b.positioning}</div>
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between"><span class="text-gray-500 text-xs">价格</span><span class="font-bold ${i === 1 ? 'text-amber-700' : 'text-gray-800'}">${b.priceRange}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500 text-xs">目标</span><span class="text-[10px] text-gray-700">${b.target}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500 text-xs">毛利率</span><span class="text-[10px] font-mono ${i === 1 ? 'text-amber-600' : ''}">${b.margin}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- LTV提升 -->
            <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200">
                <div class="text-xs font-bold text-purple-800 mb-2">LTV提升驱动</div>
                <div class="flex items-center gap-4 mb-3">
                    <div class="text-center">
                        <div class="text-sm text-gray-500">省心租LTV</div>
                        <div class="text-xl font-bold text-gray-600">¥${path.ltvImprovement.base.value.toLocaleString()}</div>
                    </div>
                    <div class="text-2xl text-purple-400">→</div>
                    <div class="text-center">
                        <div class="text-sm text-purple-600">美租LTV</div>
                        <div class="text-2xl font-black text-purple-600">¥${path.ltvImprovement.meizu.value.toLocaleString()}</div>
                        <div class="text-xs text-purple-500">${path.ltvImprovement.meizu.uplift}</div>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2">
                    ${path.ltvImprovement.drivers.map(d => `
                        <div class="p-2 bg-white/70 rounded-lg text-center">
                            <div class="text-[10px] text-gray-500">${d.label}</div>
                            <div class="text-sm font-bold text-purple-600">+¥${d.value.toLocaleString()}</div>
                            <div class="text-[9px] text-gray-400">${d.note}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    return `
        <div class="card">
            <div class="card-header" style="border-left: 4px solid ${path.color}">
                <div class="flex items-center gap-2">
                    <i class="fas fa-${path.icon}" style="color: ${path.color}"></i>
                    <h3 class="font-bold text-gray-800">${path.title}</h3>
                    <span class="text-sm text-gray-400">| ${path.subtitle}</span>
                </div>
            </div>
            <div class="p-4">
                ${content}
            </div>
        </div>
    `;
}

// 聚焦盘画像（精简版）
function renderFocusProfile() {
    return `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-bullseye mr-2 text-red-500"></i>聚焦盘画像 — 两高一低</h3>
                <span class="text-[10px] text-gray-400">0922报告 · 推房有效率目标 1%（vs 全量0.2%）</span>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-3 gap-4">
                    <div class="p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border border-red-200 text-center">
                        <div class="text-3xl mb-2">🏢</div>
                        <div class="text-lg font-bold text-red-800">高楼龄</div>
                        <div class="text-sm text-red-600 mt-1">20年+</div>
                    </div>
                    <div class="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200 text-center">
                        <div class="text-3xl mb-2">📈</div>
                        <div class="text-lg font-bold text-amber-800">高坪效</div>
                        <div class="text-sm text-amber-600 mt-1">60元/㎡+</div>
                    </div>
                    <div class="p-4 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl border border-gray-300 text-center">
                        <div class="text-3xl mb-2">🏚️</div>
                        <div class="text-lg font-bold text-gray-800">房况差</div>
                        <div class="text-sm text-gray-600 mt-1">HQI&lt;60</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 渲染供给侧漏斗图
function renderSupplyFunnelChart() {
    const chart = getOrCreateChart('chart-supply-funnel');
    if (!chart) return;
    
    const city = AppState.currentCity;
    const model = SUPPLY_MARKET_MODEL[city] || SUPPLY_MARKET_MODEL.beijing;
    
    chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}万套' },
        series: [{
            type: 'funnel',
            left: '10%',
            right: '10%',
            top: 10,
            bottom: 10,
            width: '80%',
            min: 0,
            max: model.tam.value,
            minSize: '0%',
            maxSize: '100%',
            sort: 'descending',
            gap: 2,
            label: {
                show: true,
                position: 'inside',
                fontSize: 10,
                formatter: '{b}\n{c}万套'
            },
            data: [
                { value: model.tam.value, name: 'TAM', itemStyle: { color: '#93c5fd' } },
                { value: model.sam.value, name: 'SAM', itemStyle: { color: '#818cf8' } },
                { value: model.som.value, name: 'SOM', itemStyle: { color: '#6366f1' } },
                { value: model.effective.value, name: '有效市场', itemStyle: { color: '#10b981' } }
            ]
        }]
    });
}

// 渲染需求侧散点图
function renderDemandScatterChart() {
    const chart = getOrCreateChart('chart-demand-scatter');
    if (!chart) return;
    
    const model = DEMAND_MARKET_MODEL.beijing;
    
    chart.setOption({
        tooltip: {
            trigger: 'item',
            formatter: p => `${p.data[3]}<br/>租金: ¥${p.data[1]}<br/>租期: ${p.data[0]}年<br/>客群: ${p.data[4].toLocaleString()}`
        },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'value', name: '租期(年)', nameLocation: 'middle', nameGap: 20, min: 0.8, max: 2.0 },
        yAxis: { type: 'value', name: '租金(元)', nameLocation: 'middle', nameGap: 30, min: 4000, max: 20000 },
        series: [{
            type: 'scatter',
            symbolSize: p => Math.sqrt(p[4]) / 3,
            data: model.targetSegments.map(s => [
                s.leaseTerm,
                parseInt(s.rent.replace(/[^0-9]/g, '')),
                s.priority,
                s.name,
                s.value
            ]),
            itemStyle: {
                color: p => p.data[2] === 'P1' ? '#10b981' : '#f59e0b'
            }
        }]
    });
}
