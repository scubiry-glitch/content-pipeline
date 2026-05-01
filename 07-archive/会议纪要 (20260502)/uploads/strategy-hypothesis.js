// ===== 战略实践验证模块 (v7.0) =====
// 合并：战略假设 + 推演 + BLM实验
// 每个假设自带三个推演场景，可直接启动BLM实验验证

// ==================== 数据结构：假设-推演-实验一体化 ====================

const HYPOTHESIS_SCHEMA = {
    // 假设基础信息
    id: '',
    assumption_name: '',
    category: '', // 获客/产品/转化/交付 — 四大能力维度
    description: '',
    impact_level: '高', // 高/中/低
    confidence_level: 70, // 0-100
    priority: 1,
    
    // === 三个推演场景（内置） ===
    scenarios: {
        conservative: {  // 保守场景
            name: '保守估计',
            probability: 0.3,
            param_adjustments: {},
            adjustment_type: {},
            expected_ue: {},
            market_projection: {}
        },
        target: {  // 目标场景⭐
            name: '目标达成',
            probability: 0.5,
            param_adjustments: {},
            adjustment_type: {},
            expected_ue: {},
            market_projection: {},
            is_primary: true
        },
        optimistic: {  // 乐观场景
            name: '乐观预期',
            probability: 0.2,
            param_adjustments: {},
            adjustment_type: {},
            expected_ue: {},
            market_projection: {}
        }
    },
    
    // === BLM实验设计 ===
    bml_experiment: {
        status: '待验证', // 待验证/验证中/已验证/已否定
        experiment_type: '', // 城市对照/时段对照/阶梯投放
        experiment_design: {
            treatment_group: '',
            control_group: '',
            duration_weeks: 0,
            sample_size: 0
        },
        metrics: [], // 盯住的关键UE参数
        results: {
            actual_data: {},
            conclusion: '',
            learnings: ''
        }
    },
    
    // 四维度分析
    strategic_analysis: '',
    financial_analysis: '',
    hr_analysis: '',
    market_analysis: '',
    risk_factors: '',
    timeline: ''
};

// ==================== 初始化：市场空间为核心的假设集 ====================

function initMarketHypotheses() {
    const marketBase = SUPPLY_MARKET_MODEL[AppState.currentCity || 'beijing'];
    
    return [
        {
            id: 'hyp_market_penetration',
            assumption_name: '聚焦盘渗透率可达10%',
            category: '获客',
            description: `基于${marketBase.effective.value}万套有效目标市场，聚焦盘（两高一低）推房有效率目标从全量0.2%提升至1%，整体市场渗透率达10%`,
            impact_level: '高',
            confidence_level: 75,
            priority: 1,
            
            // === 三个推演场景 ===
            scenarios: {
                conservative: {
                    name: '保守渗透 5%',
                    probability: 0.25,
                    param_adjustments: { 
                        monthly_target_units: 1.08,
                        conversion_rate: 0.95,
                        gtv_per_unit: 0.92
                    },
                    adjustment_type: { 
                        monthly_target_units: 'multiply', 
                        conversion_rate: 'multiply',
                        gtv_per_unit: 'multiply'
                    },
                    expected_ue: {
                        unit_profit: 1800,
                        monthly_profit: 248400,
                        annual_units: 1482
                    },
                    market_projection: {
                        penetration_rate: 0.05,
                        addressable_market: marketBase.effective.value * 0.05,
                        revenue_forecast: 118800000
                    }
                },
                target: {
                    name: '目标渗透 10%⭐',
                    probability: 0.50,
                    param_adjustments: { 
                        monthly_target_units: 1.74,
                        conversion_rate: 1.20,
                        gtv_per_unit: 1.05
                    },
                    adjustment_type: { 
                        monthly_target_units: 'multiply', 
                        conversion_rate: 'multiply',
                        gtv_per_unit: 'multiply'
                    },
                    expected_ue: {
                        unit_profit: 6100,
                        monthly_profit: 1220000,
                        annual_units: 3480
                    },
                    market_projection: {
                        penetration_rate: 0.10,
                        addressable_market: marketBase.effective.value * 0.10,
                        revenue_forecast: 278400000
                    },
                    is_primary: true
                },
                optimistic: {
                    name: '乐观渗透 18%',
                    probability: 0.25,
                    param_adjustments: { 
                        monthly_target_units: 3.2,
                        conversion_rate: 1.45,
                        gtv_per_unit: 1.15
                    },
                    adjustment_type: { 
                        monthly_target_units: 'multiply', 
                        conversion_rate: 'multiply',
                        gtv_per_unit: 'multiply'
                    },
                    expected_ue: {
                        unit_profit: 9500,
                        monthly_profit: 2850000,
                        annual_units: 6240
                    },
                    market_projection: {
                        penetration_rate: 0.18,
                        addressable_market: marketBase.effective.value * 0.18,
                        revenue_forecast: 513600000
                    }
                }
            },
            
            // === BLM实验 ===
            bml_experiment: {
                status: '验证中',
                experiment_type: '城市对照',
                experiment_design: {
                    treatment_group: '北京-朝阳区-聚焦盘（高楼龄+高坪效）',
                    control_group: '北京-海淀区-普通盘（随机房源）',
                    duration_weeks: 8,
                    sample_size: 200
                },
                metrics: [
                    { param: 'conversion_rate', target: 0.01, current: 0.0085 },
                    { param: 'unit_profit', target: 5800, current: 6200 },
                    { param: 'payback_months', target: 18, current: 16 }
                ],
                results: {
                    actual_data: {
                        conversion_rate: 0.0085,
                        unit_profit: 6200
                    },
                    conclusion: '转化率略低于预期(0.85% vs 1%)，但客单价更高，整体UE达标',
                    learnings: '聚焦盘虽然转化率略低，但LTV提升明显，建议继续扩大覆盖'
                }
            },
            
            strategic_analysis: '从"满天开花"到"两高一低"，聚焦盘推房有效率目标1%（vs全量0.2%）。基于0922报告数据，按楼龄/坪效/HQI三维交叉分层。',
            financial_analysis: `有效市场${marketBase.effective.value}万套×10%渗透率=${marketBase.effective.value * 0.10}万套/年=月签200单。单套利润¥5,800，月利润¥116万。`,
            hr_analysis: '需扩充资管团队，北京20→40人，人均月签从5.75单提升至5单（质量优先）',
            market_analysis: '存量住房老化加速，房龄迈入15年+总量年增2.1万套，自然增长支撑长期需求',
            risk_factors: '宏观经济下行导致租赁市场收缩，聚焦盘定义需动态调整',
            timeline: '2025H2-2026H1'
        },
        
        {
            id: 'hyp_standard_ratio',
            assumption_name: '标准化产品占比提升至85%',
            category: '产品',
            description: '标准化产品GTV占比从71%提升至85%以上，降低个性化产品亏损拖累',
            impact_level: '高',
            confidence_level: 80,
            priority: 2,
            
            scenarios: {
                conservative: {
                    name: '标品占比70% 亏损持续',
                    probability: 0.25,
                    param_adjustments: { standardized_gtv_ratio: 70, conversion_rate: 0.90, gtv_per_unit: 0.95 },
                    adjustment_type: { standardized_gtv_ratio: 'set', conversion_rate: 'multiply', gtv_per_unit: 'multiply' },
                    expected_ue: {
                        blended_profit: -2000,
                        monthly_profit: -400000
                    },
                    market_projection: {
                        standard_units: 140,
                        custom_units: 60
                    }
                },
                target: {
                    name: '标品占比85% 扭亏为盈⭐',
                    probability: 0.55,
                    param_adjustments: { standardized_gtv_ratio: 85, conversion_rate: 1.15, gtv_per_unit: 1.02 },
                    adjustment_type: { standardized_gtv_ratio: 'set', conversion_rate: 'multiply', gtv_per_unit: 'multiply' },
                    expected_ue: {
                        blended_profit: 1800,
                        monthly_profit: 360000
                    },
                    market_projection: {
                        standard_units: 175,
                        custom_units: 25
                    },
                    is_primary: true
                },
                optimistic: {
                    name: '标品占比95% 利润丰厚',
                    probability: 0.20,
                    param_adjustments: { standardized_gtv_ratio: 95, conversion_rate: 1.35, gtv_per_unit: 1.08 },
                    adjustment_type: { standardized_gtv_ratio: 'set', conversion_rate: 'multiply', gtv_per_unit: 'multiply' },
                    expected_ue: {
                        blended_profit: 4500,
                        monthly_profit: 900000
                    },
                    market_projection: {
                        standard_units: 190,
                        custom_units: 10
                    }
                }
            },
            
            bml_experiment: {
                status: '验证中',
                experiment_type: '城市对照',
                experiment_design: {
                    treatment_group: '上海-标准化占比86.9%',
                    control_group: '北京-标准化占比71.1%',
                    duration_weeks: 12,
                    sample_size: 1000
                },
                metrics: [
                    { param: 'blended_profit', target: 1500, current: 11447 },
                    { param: 'standardized_gtv_ratio', target: 85, current: 71.1 }
                ],
                results: {
                    actual_data: {},
                    conclusion: '',
                    learnings: ''
                }
            },
            
            strategic_analysis: '标准化是规模化的基础。北京个性化产品单均亏损严重，必须控制占比。',
            financial_analysis: '标准化占比每提升10%，北京整体UE改善约¥600/单。上海86.9%占比带来¥11,447单均利润。',
            hr_analysis: '标准化降低对设计师个人能力的依赖，缩短新人培训周期从3个月→1个月',
            market_analysis: '标准化产品覆盖主流需求80%以上，7个产品方向（A-G）已基本定型',
            risk_factors: '标准化程度过高可能导致同质化竞争，需保留适度个性化能力',
            timeline: '2025H2'
        },
        
        {
            id: 'hyp_delivery_upgrade',
            assumption_name: '供应链集约化降本10%',
            category: '交付',
            description: '与酒管合作构建供应商管理模式，工长成本压缩10-15%',
            impact_level: '中',
            confidence_level: 65,
            priority: 3,
            
            scenarios: {
                conservative: {
                    name: '降本微效3%',
                    probability: 0.30,
                    param_adjustments: { foreman: 0.97, renovation_total: 0.98, expense_other: 1.05 },
                    adjustment_type: { foreman: 'multiply', renovation_total: 'multiply', expense_other: 'multiply' },
                    expected_ue: {
                        cost_reduction: 800,
                        unit_profit_lift: 600
                    }
                },
                target: {
                    name: '工长成本降12%⭐',
                    probability: 0.50,
                    param_adjustments: { foreman: 0.88, renovation_total: 0.92, expense_other: 0.95, gtv_per_unit: 1.03 },
                    adjustment_type: { foreman: 'multiply', renovation_total: 'multiply', expense_other: 'multiply', gtv_per_unit: 'multiply' },
                    expected_ue: {
                        cost_reduction: 3500,
                        unit_profit_lift: 2800
                    },
                    is_primary: true
                },
                optimistic: {
                    name: '供应链重构降20%',
                    probability: 0.20,
                    param_adjustments: { foreman: 0.80, renovation_total: 0.85, expense_other: 0.88, gtv_per_unit: 1.08, conversion_rate: 1.10 },
                    adjustment_type: { foreman: 'multiply', renovation_total: 'multiply', expense_other: 'multiply', gtv_per_unit: 'multiply', conversion_rate: 'multiply' },
                    expected_ue: {
                        cost_reduction: 6000,
                        unit_profit_lift: 5200
                    }
                }
            },
            
            bml_experiment: {
                status: '待验证',
                experiment_type: '阶梯投放',
                experiment_design: {
                    treatment_group: '新供应商体系-分批接入',
                    control_group: '原供应商体系',
                    duration_weeks: 16,
                    sample_size: 300
                },
                metrics: [
                    { param: 'foreman_cost', target: 25628, current: 28476 },
                    { param: 'vacancy_days', target: 20, current: 25 }
                ],
                results: {
                    actual_data: {},
                    conclusion: '',
                    learnings: ''
                }
            },
            
            strategic_analysis: '供应商成本占GTV 69.9%，工长占供应商成本39.5%。供应链管理是UE改善的关键抓手。',
            financial_analysis: '工长成本¥28,476/单，降本10%=节省¥2,848，直接转化为利润。',
            hr_analysis: '需培养交付管理团队，从纯撮合转向深度供应链管理',
            market_analysis: '供应商集约化后可获得更强的议价能力和质量把控',
            risk_factors: '供应商反抗、质量下滑、交付延期',
            timeline: '2026H1'
        }
    ];
}

// ==================== 页面渲染 ====================

function renderStrategyHypothesisPage() {
    const container = document.getElementById('strategy-hypothesis-content');
    if (!container) return;
    
    // 初始化假设数据（如果为空）
    if (!AppState.hypotheses || AppState.hypotheses.length === 0) {
        AppState.hypotheses = initMarketHypotheses();
    }
    
    let html = `
        <!-- 顶部说明 + 管理按钮 -->
        <div class="mb-6">
            <div class="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-5 border border-indigo-100">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🧪</span>
                        <div>
                            <h2 class="text-xl font-bold text-gray-900">战略实践验证 — BLM实验验证</h2>
                            <p class="text-sm text-gray-600">每个假设自带三个推演场景，可直接启动BLM实验 | Build(假设) → Measure(推演) → Learn(验证)</p>
                        </div>
                    </div>
                    <button class="btn-primary bg-gradient-to-r from-indigo-600 to-purple-600" onclick="openHypothesisEditor()">
                        <i class="fas fa-plus mr-2"></i>新建假设
                    </button>
                </div>
                <div class="grid grid-cols-4 gap-3 text-center">
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-indigo-600">${AppState.hypotheses.length}</div>
                        <div class="text-xs text-gray-500">核心假设</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-purple-600">${AppState.hypotheses.length * 3}</div>
                        <div class="text-xs text-gray-500">推演场景</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-amber-600">${AppState.hypotheses.filter(h => h.bml_experiment?.status === '验证中').length}</div>
                        <div class="text-xs text-gray-500">验证中实验</div>
                    </div>
                    <div class="bg-white/80 rounded-xl p-3">
                        <div class="text-2xl font-black text-green-600">${AppState.hypotheses.filter(h => h.bml_experiment?.status === '已验证').length}</div>
                        <div class="text-xs text-gray-500">已验证</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 假设列表 -->
        <div class="space-y-6">
            ${AppState.hypotheses.map((hyp, idx) => renderHypothesisCard(hyp, idx)).join('')}
        </div>
        
        <!-- 假设编辑浮层 -->
        <div id="hypothesis-editor-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center">
            <div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                <div class="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🎯</span>
                        <div>
                            <h3 class="text-lg font-bold text-gray-900" id="editor-title">新建战略假设</h3>
                            <p class="text-xs text-gray-500">配置三套 UE 模型参数调整</p>
                        </div>
                    </div>
                    <button onclick="closeHypothesisEditor()" class="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <i class="fas fa-times text-gray-500"></i>
                    </button>
                </div>
                <div class="flex-1 overflow-auto p-6" id="hypothesis-editor-content">
                    <!-- 编辑内容 -->
                </div>
                <div class="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                    <button onclick="deleteCurrentHypothesis()" id="btn-delete-hyp" class="text-red-500 hover:text-red-700 text-sm font-medium hidden">
                        <i class="fas fa-trash-alt mr-1"></i>删除此假设
                    </button>
                    <div class="flex items-center gap-3 ml-auto">
                        <button onclick="closeHypothesisEditor()" class="btn-secondary">取消</button>
                        <button onclick="saveHypothesis()" class="btn-primary bg-gradient-to-r from-indigo-600 to-purple-600">
                            <i class="fas fa-save mr-2"></i>保存假设
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// 旧的 renderHypothesisCard 函数已被新的版本替换，见文件末尾

function showScenarioResult(hyp, scenarioType, model) {
    // 展示该场景下的详细UE计算结果
    const ue = calculateBeikeUE(model);
    
    // 可以扩展为弹窗或侧边栏展示
    console.log(`场景结果 [${hyp.assumption_name} - ${scenarioType}]:`, ue);
}


// ==================== 假设管理：创建、编辑、删除 ====================

let currentEditingHypothesis = null;

// 打开假设编辑器（新建或编辑）
function openHypothesisEditor(hypId = null) {
    const modal = document.getElementById('hypothesis-editor-modal');
    const content = document.getElementById('hypothesis-editor-content');
    const title = document.getElementById('editor-title');
    const deleteBtn = document.getElementById('btn-delete-hyp');
    
    if (!modal || !content) return;
    
    if (hypId) {
        // 编辑模式
        currentEditingHypothesis = AppState.hypotheses.find(h => h.id === hypId);
        title.textContent = '编辑战略假设';
        deleteBtn.classList.remove('hidden');
    } else {
        // 新建模式
        currentEditingHypothesis = createEmptyHypothesis();
        title.textContent = '新建战略假设';
        deleteBtn.classList.add('hidden');
    }
    
    content.innerHTML = renderHypothesisEditorContent(currentEditingHypothesis);
    modal.classList.remove('hidden');
    
    // 初始化场景标签切换
    initScenarioTabs();
}

function closeHypothesisEditor() {
    const modal = document.getElementById('hypothesis-editor-modal');
    if (modal) modal.classList.add('hidden');
    currentEditingHypothesis = null;
}

// 创建空白假设模板
function createEmptyHypothesis() {
    return {
        id: 'hyp_' + Date.now(),
        assumption_name: '',
        category: '获客',
        description: '',
        impact_level: '中',
        confidence_level: 70,
        priority: AppState.hypotheses.length + 1,
        
        scenarios: {
            conservative: createEmptyScenario('保守估计', 0.3),
            target: createEmptyScenario('目标达成', 0.5, true),
            optimistic: createEmptyScenario('乐观预期', 0.2)
        },
        
        bml_experiment: {
            status: '待验证',
            experiment_type: '城市对照',
            experiment_design: {
                treatment_group: '',
                control_group: '',
                duration_weeks: 8,
                sample_size: 100
            },
            metrics: [],
            results: {}
        },
        
        strategic_analysis: '',
        financial_analysis: '',
        hr_analysis: '',
        market_analysis: ''
    };
}

function createEmptyScenario(name, probability, isPrimary = false) {
    const scenario = {
        name: name,
        probability: probability,
        param_adjustments: {},
        adjustment_type: {},
        expected_ue: {},
        market_projection: {}
    };
    if (isPrimary) scenario.is_primary = true;
    return scenario;
}

// 渲染假设编辑器内容
function renderHypothesisEditorContent(hyp) {
    return `
        <div class="space-y-6">
            <!-- 基本信息 -->
            <div class="bg-gray-50 rounded-xl p-4">
                <h4 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-info-circle text-indigo-500"></i>基本信息
                </h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">假设名称</label>
                        <input type="text" id="hyp-name" value="${hyp.assumption_name}" 
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="例如：聚焦盘渗透率可达10%">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">分类</label>
                        <select id="hyp-category" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            <option value="获客" ${hyp.category === '获客' ? 'selected' : ''}>获客</option>
                            <option value="产品" ${hyp.category === '产品' ? 'selected' : ''}>产品</option>
                            <option value="转化" ${hyp.category === '转化' ? 'selected' : ''}>转化</option>
                            <option value="交付" ${hyp.category === '交付' ? 'selected' : ''}>交付</option>
                        </select>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-600 mb-1">描述</label>
                        <textarea id="hyp-desc" rows="2" 
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="简要描述这个战略假设的核心逻辑">${hyp.description}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">影响级别</label>
                        <select id="hyp-impact" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            <option value="高" ${hyp.impact_level === '高' ? 'selected' : ''}>高</option>
                            <option value="中" ${hyp.impact_level === '中' ? 'selected' : ''}>中</option>
                            <option value="低" ${hyp.impact_level === '低' ? 'selected' : ''}>低</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">置信度 (%)</label>
                        <input type="number" id="hyp-confidence" value="${hyp.confidence_level}" min="0" max="100"
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    </div>
                </div>
            </div>
            
            <!-- 三场景参数配置 -->
            <div>
                <h4 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-sliders-h text-purple-500"></i>三场景 UE 参数配置
                </h4>
                
                <!-- 场景标签 -->
                <div class="flex gap-2 mb-4">
                    <button type="button" class="scenario-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600" 
                        data-scenario="conservative" onclick="switchScenarioTab('conservative')">
                        🛡️ 保守场景 (${(hyp.scenarios.conservative.probability * 100).toFixed(0)}%)
                    </button>
                    <button type="button" class="scenario-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-indigo-100 text-indigo-700" 
                        data-scenario="target" onclick="switchScenarioTab('target')">
                        ⭐ 目标场景 (${(hyp.scenarios.target.probability * 100).toFixed(0)}%)
                    </button>
                    <button type="button" class="scenario-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600" 
                        data-scenario="optimistic" onclick="switchScenarioTab('optimistic')">
                        🚀 乐观场景 (${(hyp.scenarios.optimistic.probability * 100).toFixed(0)}%)
                    </button>
                </div>
                
                <!-- 场景内容 -->
                <div class="scenario-contents">
                    ${renderScenarioEditor('conservative', hyp.scenarios.conservative, hyp)}
                    ${renderScenarioEditor('target', hyp.scenarios.target, hyp)}
                    ${renderScenarioEditor('optimistic', hyp.scenarios.optimistic, hyp)}
                </div>
            </div>
            
            <!-- BLM实验配置 -->
            <div class="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <h4 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-flask text-amber-500"></i>BLM实验配置
                </h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">实验状态</label>
                        <select id="hyp-exp-status" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            <option value="待验证" ${hyp.bml_experiment.status === '待验证' ? 'selected' : ''}>待验证</option>
                            <option value="验证中" ${hyp.bml_experiment.status === '验证中' ? 'selected' : ''}>验证中</option>
                            <option value="已验证" ${hyp.bml_experiment.status === '已验证' ? 'selected' : ''}>已验证</option>
                            <option value="已否定" ${hyp.bml_experiment.status === '已否定' ? 'selected' : ''}>已否定</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">实验类型</label>
                        <select id="hyp-exp-type" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            <option value="城市对照" ${hyp.bml_experiment.experiment_type === '城市对照' ? 'selected' : ''}>城市对照</option>
                            <option value="时段对照" ${hyp.bml_experiment.experiment_type === '时段对照' ? 'selected' : ''}>时段对照</option>
                            <option value="阶梯投放" ${hyp.bml_experiment.experiment_type === '阶梯投放' ? 'selected' : ''}>阶梯投放</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">实验组</label>
                        <input type="text" id="hyp-exp-treatment" value="${hyp.bml_experiment.experiment_design.treatment_group}"
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="例如：上海-标准化产品">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">对照组</label>
                        <input type="text" id="hyp-exp-control" value="${hyp.bml_experiment.experiment_design.control_group}"
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="例如：北京-个性化产品">
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 渲染单个场景编辑器
function renderScenarioEditor(scenarioType, scenario, hyp) {
    const isActive = scenarioType === 'target' ? '' : 'hidden';
    const typeLabels = {
        conservative: { name: '保守', color: 'blue', icon: '🛡️' },
        target: { name: '目标', color: 'indigo', icon: '⭐' },
        optimistic: { name: '乐观', color: 'purple', icon: '🚀' }
    };
    const tl = typeLabels[scenarioType];
    
    return `
        <div id="scenario-panel-${scenarioType}" class="scenario-panel ${isActive}">
            <div class="bg-${tl.color}-50 rounded-xl p-4 border border-${tl.color}-100">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${tl.icon}</span>
                        <input type="text" id="scene-name-${scenarioType}" value="${scenario.name}"
                            class="bg-transparent font-bold text-gray-800 border-b border-transparent hover:border-${tl.color}-300 focus:border-${tl.color}-500 focus:outline-none px-1">
                    </div>
                    <div class="flex items-center gap-2 text-sm">
                        <label class="text-gray-600">概率:</label>
                        <input type="number" id="scene-prob-${scenarioType}" value="${(scenario.probability * 100).toFixed(0)}" min="0" max="100"
                            class="w-16 px-2 py-1 border border-gray-200 rounded text-center">%
                        ${scenario.is_primary ? '<span class="text-amber-500 text-xs">⭐ 主要场景</span>' : ''}
                    </div>
                </div>
                
                <!-- 三套 UE 参数调整 -->
                <div class="grid grid-cols-3 gap-4">
                    <!-- 贝壳 UE -->
                    <div class="bg-white rounded-lg p-3">
                        <h5 class="font-semibold text-gray-700 mb-3 flex items-center gap-1 text-sm">
                            <i class="fas fa-building text-ke-500"></i> 贝壳 UE
                        </h5>
                        <div class="space-y-2">
                            ${renderParamAdjustInputs('beike', scenarioType, scenario.param_adjustments, scenario.adjustment_type)}
                        </div>
                    </div>
                    
                    <!-- 业主 UE -->
                    <div class="bg-white rounded-lg p-3">
                        <h5 class="font-semibold text-gray-700 mb-3 flex items-center gap-1 text-sm">
                            <i class="fas fa-home text-green-500"></i> 业主 UE
                        </h5>
                        <div class="space-y-2">
                            ${renderParamAdjustInputs('owner', scenarioType, scenario.param_adjustments, scenario.adjustment_type)}
                        </div>
                    </div>
                    
                    <!-- 供应商 UE -->
                    <div class="bg-white rounded-lg p-3">
                        <h5 class="font-semibold text-gray-700 mb-3 flex items-center gap-1 text-sm">
                            <i class="fas fa-tools text-amber-500"></i> 供应商 UE
                        </h5>
                        <div class="space-y-2">
                            ${renderParamAdjustInputs('supplier', scenarioType, scenario.param_adjustments, scenario.adjustment_type)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 渲染参数调整输入
function renderParamAdjustInputs(ueType, scenarioType, paramAdjustments, adjustmentTypes) {
    // 每个 UE 类型的关键参数
    const keyParams = {
        beike: [
            { key: 'monthly_target_units', label: '月目标单量', type: 'multiply', step: 0.1 },
            { key: 'gtv_per_unit', label: '单套GTV', type: 'multiply', step: 0.05 },
            { key: 'commission_rate', label: '提点率', type: 'multiply', step: 0.05 },
            { key: 'channel_cost', label: '渠道成本', type: 'multiply', step: 0.1 },
            { key: 'expense_city_hr', label: '城市人工', type: 'multiply', step: 0.1 },
            { key: 'standardized_gtv_ratio', label: '标准化占比', type: 'set', step: 1, unit: '%' }
        ],
        owner: [
            { key: 'avg_rent_after', label: '装修后租金', type: 'multiply', step: 0.05 },
            { key: 'rent_premium', label: '月租金溢价', type: 'multiply', step: 0.1 },
            { key: 'renovation_total', label: '装修总款', type: 'multiply', step: 0.1 },
            { key: 'vacancy_cost', label: '空置损失', type: 'multiply', step: 0.1 },
            { key: 'avg_lease_months', label: '平均租期', type: 'set', step: 1, unit: '月' }
        ],
        supplier: [
            { key: 'foreman', label: '工长成本', type: 'multiply', step: 0.05 },
            { key: 'furniture', label: '家具成本', type: 'multiply', step: 0.05 },
            { key: 'appliances', label: '家电成本', type: 'multiply', step: 0.05 },
            { key: 'system_fee', label: '系统费用', type: 'multiply', step: 0.1 },
            { key: 'marketing', label: '营销费用', type: 'multiply', step: 0.1 }
        ]
    };
    
    const params = keyParams[ueType] || [];
    
    return params.map(p => {
        const currentVal = paramAdjustments[p.key];
        const currentType = adjustmentTypes[p.key] || p.type;
        const hasValue = currentVal !== undefined && currentVal !== null && currentVal !== '';
        
        const bgClass = hasValue ? (ueType === 'beike' ? 'bg-ke-50' : ueType === 'owner' ? 'bg-green-50' : 'bg-amber-50') : '';
        return `
            <div class="flex items-center gap-2 ${bgClass} rounded px-2 py-1">
                <label class="text-xs text-gray-600 w-20">${p.label}</label>
                <select class="param-type-${scenarioType} text-xs border border-gray-200 rounded px-1 py-0.5 w-14" 
                    data-param="${p.key}" data-scenario="${scenarioType}">
                    <option value="multiply" ${currentType === 'multiply' ? 'selected' : ''}>×</option>
                    <option value="add" ${currentType === 'add' ? 'selected' : ''}>+</option>
                    <option value="set" ${currentType === 'set' ? 'selected' : ''}>=</option>
                </select>
                <input type="number" class="param-value-${scenarioType} text-xs border border-gray-200 rounded px-1 py-0.5 w-16" 
                    data-param="${p.key}" data-scenario="${scenarioType}" data-type="${ueType}"
                    value="${hasValue ? currentVal : ''}" step="${p.step || 1}"
                    placeholder="${p.type === 'multiply' ? '1.0' : p.type === 'add' ? '0' : ''}">
                <span class="text-xs text-gray-400">${p.unit || ''}</span>
            </div>
        `;
    }).join('');
}

// 初始化场景标签切换
function initScenarioTabs() {
    switchScenarioTab('target');
}

function switchScenarioTab(scenarioType) {
    // 切换标签样式
    document.querySelectorAll('.scenario-tab').forEach(tab => {
        if (tab.dataset.scenario === scenarioType) {
            tab.classList.remove('bg-gray-100', 'text-gray-600');
            tab.classList.add('bg-indigo-100', 'text-indigo-700');
        } else {
            tab.classList.remove('bg-indigo-100', 'text-indigo-700');
            tab.classList.add('bg-gray-100', 'text-gray-600');
        }
    });
    
    // 切换面板显示
    document.querySelectorAll('.scenario-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    const activePanel = document.getElementById(`scenario-panel-${scenarioType}`);
    if (activePanel) activePanel.classList.remove('hidden');
}

// 保存假设
function saveHypothesis() {
    if (!currentEditingHypothesis) return;
    
    // 收集基本信息
    currentEditingHypothesis.assumption_name = document.getElementById('hyp-name').value || '未命名假设';
    currentEditingHypothesis.category = document.getElementById('hyp-category').value;
    currentEditingHypothesis.description = document.getElementById('hyp-desc').value;
    currentEditingHypothesis.impact_level = document.getElementById('hyp-impact').value;
    currentEditingHypothesis.confidence_level = parseInt(document.getElementById('hyp-confidence').value) || 70;
    
    // 收集三场景参数
    ['conservative', 'target', 'optimistic'].forEach(scenarioType => {
        const scenario = currentEditingHypothesis.scenarios[scenarioType];
        
        // 场景名称和概率
        const nameInput = document.getElementById(`scene-name-${scenarioType}`);
        const probInput = document.getElementById(`scene-prob-${scenarioType}`);
        if (nameInput) scenario.name = nameInput.value;
        if (probInput) scenario.probability = parseInt(probInput.value) / 100;
        
        // 参数调整
        scenario.param_adjustments = {};
        scenario.adjustment_type = {};
        
        // 收集所有参数值
        document.querySelectorAll(`.param-value-${scenarioType}`).forEach(input => {
            const param = input.dataset.param;
            const value = parseFloat(input.value);
            
            if (!isNaN(value)) {
                scenario.param_adjustments[param] = value;
                
                // 获取调整类型
                const typeSelect = document.querySelector(`.param-type-${scenarioType}[data-param="${param}"]`);
                scenario.adjustment_type[param] = typeSelect ? typeSelect.value : 'multiply';
            }
        });
    });
    
    // 收集BLM实验配置
    currentEditingHypothesis.bml_experiment.status = document.getElementById('hyp-exp-status').value;
    currentEditingHypothesis.bml_experiment.experiment_type = document.getElementById('hyp-exp-type').value;
    currentEditingHypothesis.bml_experiment.experiment_design.treatment_group = document.getElementById('hyp-exp-treatment').value;
    currentEditingHypothesis.bml_experiment.experiment_design.control_group = document.getElementById('hyp-exp-control').value;
    
    // 检查是新建还是更新
    const existingIndex = AppState.hypotheses.findIndex(h => h.id === currentEditingHypothesis.id);
    if (existingIndex >= 0) {
        AppState.hypotheses[existingIndex] = currentEditingHypothesis;
    } else {
        AppState.hypotheses.push(currentEditingHypothesis);
    }
    
    showToast('假设保存成功！', 'success');
    closeHypothesisEditor();
    renderStrategyHypothesisPage();
}

// 删除当前假设
function deleteCurrentHypothesis() {
    if (!currentEditingHypothesis) return;
    
    if (confirm('确定要删除这个战略假设吗？此操作不可恢复。')) {
        AppState.hypotheses = AppState.hypotheses.filter(h => h.id !== currentEditingHypothesis.id);
        showToast('假设已删除', 'success');
        closeHypothesisEditor();
        renderStrategyHypothesisPage();
    }
}

// 在假设卡片上添加编辑按钮
function renderHypothesisCard(hyp, idx) {
    const statusColors = {
        '已验证': 'bg-green-100 text-green-700 border-green-300',
        '验证中': 'bg-blue-100 text-blue-700 border-blue-300',
        '待验证': 'bg-amber-100 text-amber-700 border-amber-300',
        '已否定': 'bg-red-100 text-red-700 border-red-300'
    };
    
    const impactColors = {
        '高': 'bg-red-50 text-red-700 border-red-200',
        '中': 'bg-yellow-50 text-yellow-700 border-yellow-200',
        '低': 'bg-gray-50 text-gray-700 border-gray-200'
    };
    
    return `
        <div class="card overflow-hidden" id="hyp-card-${hyp.id}">
            <!-- 头部：假设基本信息 -->
            <div class="p-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${impactColors[hyp.impact_level]}">
                            P${hyp.priority}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-gray-900 text-lg">${hyp.assumption_name}</span>
                                <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[hyp.bml_experiment.status]}">
                                    ${hyp.bml_experiment.status}
                                </span>
                                <span class="tag tag-purple">${hyp.category}</span>
                            </div>
                            <p class="text-sm text-gray-500 mt-1">${hyp.description}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-center">
                            <div class="text-xs text-gray-400">置信度</div>
                            <div class="text-xl font-bold ${hyp.confidence_level >= 75 ? 'text-green-600' : hyp.confidence_level >= 50 ? 'text-yellow-600' : 'text-red-600'}">
                                ${hyp.confidence_level}%
                            </div>
                        </div>
                        <button class="btn-secondary text-sm" onclick="openHypothesisEditor('${hyp.id}')">
                            <i class="fas fa-edit mr-1"></i>编辑
                        </button>
                        <button class="btn-primary" onclick="runHypothesisComparison('${hyp.id}')">
                            <i class="fas fa-play mr-1"></i>推演对比
                        </button>
                    </div>
                </div>
            </div>
            
            ${renderHypothesisScenarios(hyp)}
            ${renderHypothesisBLMExperiment(hyp)}
        </div>
    `;
}

// 渲染假设的三场景
function renderHypothesisScenarios(hyp) {
    const scenarioColors = {
        conservative: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', prob: 'bg-blue-100' },
        target: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', prob: 'bg-indigo-100' },
        optimistic: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', prob: 'bg-purple-100' }
    };
    
    return `
        <!-- 三个推演场景 -->
        <div class="p-5 border-b border-gray-100">
            <div class="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                <i class="fas fa-code-branch"></i> 三场景推演
            </div>
            <div class="grid grid-cols-3 gap-4">
                ${Object.entries(hyp.scenarios).map(([type, scenario]) => {
                    const colors = scenarioColors[type];
                    const isPrimary = scenario.is_primary;
                    const params = Object.entries(scenario.param_adjustments || {}).slice(0, 3);
                    
                    return `
                        <div class="${colors.bg} rounded-xl p-4 border ${colors.border} ${isPrimary ? 'ring-2 ring-indigo-300' : ''} cursor-pointer hover:shadow-md transition-shadow"
                            onclick="showScenarioParams('${hyp.id}', '${type}')">
                            <div class="flex items-center justify-between mb-2">
                                <span class="font-semibold ${colors.text}">${scenario.name}</span>
                                <span class="text-xs ${colors.prob} ${colors.text} px-2 py-0.5 rounded-full">${(scenario.probability * 100).toFixed(0)}%</span>
                            </div>
                            <div class="space-y-1 text-xs">
                                ${params.map(([key, val]) => {
                                    const type = scenario.adjustment_type?.[key] || 'multiply';
                                    const symbol = type === 'multiply' ? '×' : type === 'add' ? '+' : '=';
                                    return `<div class="text-gray-600">${key}: <span class="font-mono font-medium">${symbol}${val}</span></div>`;
                                }).join('')}
                                ${params.length === 0 ? '<div class="text-gray-400 italic">无参数调整</div>' : ''}
                            </div>
                            ${isPrimary ? '<div class="mt-2 text-xs text-indigo-600 font-medium">⭐ 主要场景</div>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// 渲染BLM实验部分
function renderHypothesisBLMExperiment(hyp) {
    const exp = hyp.bml_experiment;
    const statusColors = {
        '已验证': 'bg-green-50 border-green-100',
        '验证中': 'bg-blue-50 border-blue-100',
        '待验证': 'bg-amber-50 border-amber-100',
        '已否定': 'bg-red-50 border-red-100'
    };
    
    return `
        <!-- BLM实验 -->
        <div class="p-5 ${statusColors[exp.status] || 'bg-gray-50'}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="text-2xl">🧪</div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-semibold text-gray-800">BLM实验：${exp.experiment_type}</span>
                            <span class="tag ${exp.status === '已验证' ? 'tag-green' : exp.status === '验证中' ? 'tag-blue' : 'tag-amber'}">${exp.status}</span>
                        </div>
                        <div class="text-sm text-gray-500 mt-1">
                            ${exp.experiment_design.treatment_group || '待配置'} vs ${exp.experiment_design.control_group || '对照组'}
                            ${exp.metrics && exp.metrics.length > 0 ? `| 盯住: ${exp.metrics.map(m => m.param).join(', ')}` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn-secondary text-sm" onclick="startBLMExperiment('${hyp.id}')">
                        <i class="fas fa-microscope mr-1"></i>${exp.status === '待验证' ? '启动实验' : '查看实验'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 显示场景参数详情
function showScenarioParams(hypId, scenarioType) {
    const hyp = AppState.hypotheses.find(h => h.id === hypId);
    if (!hyp) return;
    
    const scenario = hyp.scenarios[scenarioType];
    console.log(`场景参数 [${hyp.assumption_name} - ${scenario.name}]:`, scenario);
    
    // 可以扩展为弹窗展示
    showToast(`查看 ${scenario.name} 的参数配置`, 'info');
}

// 运行假设推演对比
function runHypothesisComparison(hypId) {
    const hyp = AppState.hypotheses.find(h => h.id === hypId);
    if (!hyp) return;
    
    // 获取当前城市的基准模型
    const city = AppState.currentCity;
    const baselineBeike = AppState.baselineModels[city];
    const baselineOwner = AppState.ownerModels?.[city]?.standard || DEFAULT_OWNER_MODELS[city]?.standard;
    const baselineSupplier = DEFAULT_SUPPLIER_MODELS.standard;
    
    const scenarios = [];
    
    Object.entries(hyp.scenarios).forEach(([type, scenario]) => {
        // 构建参数调整
        const assumption = {
            beike_params: {},
            owner_params: {},
            supplier_params: {},
            param_adjustments: scenario.param_adjustments,
            adjustment_type: scenario.adjustment_type
        };
        
        // 分类参数到不同UE模型
        Object.entries(scenario.param_adjustments || {}).forEach(([key, val]) => {
            const adjType = scenario.adjustment_type?.[key] || 'multiply';
            
            // 判断参数属于哪个模型
            if (UE_PARAMS.find(p => p.key === key)) {
                assumption.beike_params[key] = { type: adjType, value: val };
            } else if (['avg_rent_after', 'rent_premium', 'renovation_total', 'vacancy_cost', 'avg_lease_months'].includes(key)) {
                assumption.owner_params[key] = { type: adjType, value: val };
            } else if (['foreman', 'furniture', 'appliances', 'system_fee', 'marketing'].includes(key)) {
                assumption.supplier_params[key] = { type: adjType, value: val };
            }
        });
        
        // 应用假设
        const adjustedModels = applyAssumption(
            { beike: baselineBeike, owner: baselineOwner, supplier: baselineSupplier },
            assumption
        );
        
        scenarios.push({
            name: scenario.name,
            type: type,
            beikeUE: adjustedModels.beike ? calculateBeikeUE(adjustedModels.beike) : null,
            ownerUE: adjustedModels.owner ? calculateOwnerUE(adjustedModels.owner) : null,
            supplierUE: adjustedModels.supplier ? calculateSupplierUE(adjustedModels.supplier) : null
        });
    });
    
    // 渲染对比结果
    renderHypothesisComparisonCharts(baselineBeike, scenarios);
    
    showToast(`已生成「${hyp.assumption_name}」三场景对比`);
}

function renderHypothesisComparisonCharts(baseline, scenarios) {
    // 触发对齐层的图表渲染，展示该假设的Attention权重
    if (typeof renderAttentionHeatmap === 'function') {
        renderAttentionHeatmap();
    }
    if (typeof renderAttentionSankey === 'function') {
        renderAttentionSankey();
    }
}

function startBLMExperiment(hypId) {
    const hyp = AppState.hypotheses.find(h => h.id === hypId);
    if (!hyp) return;
    
    // 打开实验设计弹窗（复用 alignment.js 的逻辑）
    if (typeof createNewExperiment === 'function') {
        // 预填充实验参数
        AppState.pendingExperiment = {
            assumption_id: hypId,
            experiment_type: hyp.bml_experiment.experiment_type,
            metrics: hyp.bml_experiment.metrics
        };
        createNewExperiment();
    } else {
        showToast('BLM实验模块加载中...', 'info');
    }
}

function showScenarioResult(hyp, scenarioType, model) {
    // 展示该场景下的详细UE计算结果
    const ue = calculateBeikeUE(model);
    
    // 可以扩展为弹窗或侧边栏展示
    console.log(`场景结果 [${hyp.assumption_name} - ${scenarioType}]:`, ue);
}
