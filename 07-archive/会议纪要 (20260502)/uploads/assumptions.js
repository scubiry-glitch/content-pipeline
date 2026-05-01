// ===== Strategic Assumptions Module (Kanban by Theme) =====

function renderAssumptions() {
    const container = document.getElementById('assumptions-container');
    if (!container) return;

    // 四列 Kanban 布局
    container.className = 'grid grid-cols-4 gap-4';

    let html = '';
    AppState.themes.forEach(theme => {
        const experiments = getThemeExperiments(theme.id);
        const summary = getThemeSummary(theme);
        const confidenceColor = summary.avgConfidence >= 75 ? 'text-green-600' : summary.avgConfidence >= 50 ? 'text-yellow-600' : 'text-red-600';

        html += `
        <div class="kanban-column" data-theme="${theme.id}">
            <!-- Column Header -->
            <div class="px-4 py-3 flex flex-col gap-1" style="background: ${theme.color}10; border-bottom: 3px solid ${theme.color}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-${theme.icon}" style="color: ${theme.color}"></i>
                        <span class="font-bold text-gray-800">${theme.theme_name}</span>
                        <span class="text-xs text-gray-400">(${experiments.length})</span>
                    </div>
                    <div class="flex items-center gap-1">
                        ${summary.verified > 0 ? `<span class="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[10px] flex items-center justify-center font-bold">${summary.verified}</span>` : ''}
                        ${summary.inProgress > 0 ? `<span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-bold">${summary.inProgress}</span>` : ''}
                        ${summary.pending > 0 ? `<span class="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] flex items-center justify-center font-bold">${summary.pending}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-3 text-xs text-gray-500">
                    <span>置信度 <strong class="${confidenceColor}">${summary.avgConfidence}%</strong></span>
                    <span class="text-gray-300">|</span>
                    <span class="truncate">${theme.description}</span>
                </div>
            </div>
            <!-- Experiment Cards -->
            <div class="space-y-3 p-3 bg-gray-50/50 min-h-[200px]">
                ${experiments.map(asmp => renderKanbanExperimentCard(asmp, theme)).join('')}
                <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm hover:border-gray-400 hover:text-gray-600 transition-colors"
                    onclick="showAddAssumptionModal('${theme.id}')">
                    <i class="fas fa-plus mr-1"></i>添加实验
                </button>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// 渲染 Kanban 实验卡片（紧凑版）
function renderKanbanExperimentCard(asmp, theme) {
    const statusTag = getStatusTag(asmp.validation_status);
    const impactClass = asmp.impact_level === '高' ? 'impact-high' : asmp.impact_level === '中' ? 'impact-mid' : 'impact-low';
    const confidenceColor = asmp.confidence_level >= 75 ? 'text-green-600' : asmp.confidence_level >= 50 ? 'text-yellow-600' : 'text-red-600';

    return `
    <div class="assumption-card bg-white" id="asmp-card-${asmp.id}">
        <!-- Compact Header -->
        <div class="px-3 py-2.5 cursor-pointer" onclick="toggleAssumptionCard('${asmp.id}')">
            <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${impactClass}">P${asmp.priority}</div>
                    <span class="font-semibold text-gray-800 text-sm leading-tight truncate">${asmp.assumption_name}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0 ml-1">
                    <button class="text-gray-400 hover:text-gray-600 text-xs p-0.5" onclick="event.stopPropagation();editAssumption('${asmp.id}')"><i class="fas fa-edit"></i></button>
                    <button class="text-gray-400 hover:text-red-500 text-xs p-0.5" onclick="event.stopPropagation();deleteAssumption('${asmp.id}')"><i class="fas fa-trash"></i></button>
                    <i class="fas fa-chevron-down text-gray-300 text-xs transition-transform" id="asmp-chevron-${asmp.id}"></i>
                </div>
            </div>
            <p class="text-[11px] text-gray-500 line-clamp-2 mb-1.5">${asmp.description || ''}</p>
            <div class="flex items-center gap-2">
                ${statusTag}
                <span class="${confidenceColor} text-xs font-bold">${asmp.confidence_level}%</span>
            </div>
        </div>
        <!-- Expandable Detail -->
        <div class="assumption-detail border-t border-gray-100">
            <div class="px-3 py-3 bg-gray-50">
                <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">参数调整</h4>
                <div class="flex flex-wrap gap-1 mb-2">
                    ${renderParamAdjustmentTags(asmp)}
                </div>
                ${asmp.validation_result ? `<div class="bg-white rounded-lg p-2 border border-gray-200 text-xs text-gray-600"><i class="fas fa-check-circle text-green-500 mr-1"></i>${asmp.validation_result}</div>` : ''}
            </div>
            ${renderBLMExperimentsGroup(asmp)}
            <div class="px-3 py-3 grid grid-cols-2 gap-2">
                ${renderAnalysisDimension('战略分析', 'chess-rook', 'ke', asmp.strategic_analysis)}
                ${renderAnalysisDimension('财务分析', 'calculator', 'blue', asmp.financial_analysis)}
                ${renderAnalysisDimension('人力分析', 'users', 'purple', asmp.hr_analysis)}
                ${renderAnalysisDimension('市场分析', 'chart-line', 'amber', asmp.market_analysis)}
            </div>
            <div class="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs">
                <span class="text-gray-500"><i class="fas fa-exclamation-triangle text-amber-400 mr-1"></i>${asmp.risk_factors || '暂无'}</span>
                <span class="text-gray-400"><i class="fas fa-clock mr-1"></i>${asmp.timeline || '待定'}</span>
            </div>
        </div>
    </div>`;
}

function getStatusTag(status) {
    const map = {
        '已验证': '<span class="tag tag-green"><i class="fas fa-check-circle mr-1"></i>已验证</span>',
        '验证中': '<span class="tag tag-blue"><i class="fas fa-spinner mr-1"></i>验证中</span>',
        '待验证': '<span class="tag tag-yellow"><i class="fas fa-clock mr-1"></i>待验证</span>',
        '已否定': '<span class="tag tag-red"><i class="fas fa-times-circle mr-1"></i>已否定</span>'
    };
    return map[status] || '<span class="tag tag-gray">未知</span>';
}

function renderParamAdjustmentTags(asmp) {
    const adj = asmp.param_adjustments;
    const adjType = asmp.adjustment_type || {};
    let tags = '';
    for (const [key, val] of Object.entries(adj)) {
        const param = UE_PARAMS.find(p => p.key === key);
        if (!param) continue;
        const type = adjType[key] || 'multiply';
        let display, tagClass;
        if (type === 'multiply') {
            const pct = (val * 100).toFixed(0);
            display = `${param.label} ${val >= 0 ? '+' : ''}${pct}%`;
            tagClass = val >= 0 ? 'tag-green' : 'tag-red';
        } else if (type === 'add') {
            display = `${param.label} ${val >= 0 ? '+' : ''}${val}${param.unit === '%' ? 'pp' : ''}`;
            tagClass = val >= 0 ? 'tag-green' : 'tag-red';
        } else {
            display = `${param.label} → ${val}${param.unit}`;
            tagClass = 'tag-blue';
        }
        tags += `<span class="tag ${tagClass}">${display}</span>`;
    }
    return tags;
}

function renderAnalysisDimension(title, icon, color, content) {
    const colorMap = {
        ke: 'border-ke-200 bg-ke-50/30',
        blue: 'border-blue-200 bg-blue-50/30',
        purple: 'border-purple-200 bg-purple-50/30',
        amber: 'border-amber-200 bg-amber-50/30'
    };
    const iconColorMap = {
        ke: 'text-ke-500',
        blue: 'text-blue-500',
        purple: 'text-purple-500',
        amber: 'text-amber-500'
    };
    return `<div class="analysis-dimension ${colorMap[color]}">
        <div class="dim-header">
            <i class="fas fa-${icon} ${iconColorMap[color]}"></i>
            <span class="text-sm font-semibold text-gray-700">${title}</span>
        </div>
        <div class="dim-content">${content || '暂无分析'}</div>
    </div>`;
}

// 渲染BLM实验组（支持一假设多实验）
function renderBLMExperimentsGroup(asmp) {
    // 兼容旧数据结构（单一实验）
    const experiments = asmp.bml_experiments || (asmp.bml_experiment ? [asmp.bml_experiment] : []);
    
    if (experiments.length === 0) {
        return `<div class="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <div class="text-xs text-gray-500"><i class="fas fa-flask text-gray-400 mr-1"></i>暂无BLM实验设计</div>
        </div>`;
    }
    
    const mainExperiment = experiments[0];
    const subExperiments = experiments.slice(1);
    
    return `
        <div class="px-5 py-4 bg-indigo-50/50 border-t border-indigo-100">
            <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-bold text-indigo-700 uppercase">
                    <i class="fas fa-flask mr-1"></i>BLM实验组 (${experiments.length}个)
                </h4>
                <span class="text-xs text-indigo-600">聚焦变量：${getFocusParamsText(experiments)}</span>
            </div>
            
            <!-- 主实验 -->
            <div class="bg-white rounded-lg p-3 border border-indigo-200 mb-2">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${getExperimentStatusIcon(mainExperiment.status)}</span>
                        <span class="font-semibold text-gray-800 text-sm">${mainExperiment.name || '主实验'}</span>
                    </div>
                    ${getExperimentStatusTag(mainExperiment.status)}
                </div>
                <p class="text-xs text-gray-600 mb-2">${mainExperiment.description || ''}</p>
                ${renderExperimentMetrics(mainExperiment.metrics)}
                ${mainExperiment.results?.conclusion ? `
                    <div class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-700">
                        <strong>结论：</strong>${mainExperiment.results.conclusion}
                    </div>
                ` : ''}
            </div>
            
            <!-- 子实验列表 -->
            ${subExperiments.length > 0 ? `
                <div class="space-y-2">
                    ${subExperiments.map((exp, idx) => `
                        <div class="bg-white/70 rounded-lg p-2 border border-indigo-100 ml-4">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">${getExperimentStatusIcon(exp.status)}</span>
                                    <span class="font-medium text-gray-700 text-xs">${exp.name || `子实验${idx + 1}`}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-500">聚焦: ${exp.focus_param || '未指定'}</span>
                                    ${getExperimentStatusTag(exp.status)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function getExperimentStatusIcon(status) {
    const icons = {
        '已验证': '✅',
        '验证中': '🔄',
        '待验证': '⏳',
        '已否定': '❌'
    };
    return icons[status] || '❓';
}

function getExperimentStatusTag(status) {
    const tags = {
        '已验证': '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">已验证</span>',
        '验证中': '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">验证中</span>',
        '待验证': '<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">待验证</span>',
        '已否定': '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">已否定</span>'
    };
    return tags[status] || '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px]">未知</span>';
}

function getFocusParamsText(experiments) {
    const params = experiments.map(e => e.focus_param).filter(Boolean);
    if (params.length === 0) return '未指定';
    if (params.length <= 2) return params.join('、');
    return `${params[0]}、${params[1]}等${params.length}个`;
}

function renderExperimentMetrics(metrics) {
    if (!metrics || metrics.length === 0) return '';
    
    return `
        <div class="flex flex-wrap gap-2 mt-2">
            ${metrics.map(m => `
                <div class="px-2 py-1 bg-indigo-50 rounded text-[10px]">
                    <span class="text-gray-600">${m.desc || m.param}:</span>
                    <span class="font-mono font-semibold text-indigo-700">${m.current}${m.unit}</span>
                    <span class="text-gray-400">→</span>
                    <span class="font-mono font-semibold text-green-700">${m.target}${m.unit}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function toggleAssumptionCard(id) {
    const card = document.getElementById(`asmp-card-${id}`);
    const chevron = document.getElementById(`asmp-chevron-${id}`);
    if (card) {
        card.classList.toggle('expanded');
        if (chevron) chevron.style.transform = card.classList.contains('expanded') ? 'rotate(180deg)' : '';
    }
}

function showAddAssumptionModal(themeId) {
    openAssumptionForm(null, themeId);
}

function editAssumption(id) {
    const asmp = AppState.assumptions.find(a => a.id === id);
    if (asmp) {
        // 转换为三场景结构（如果是旧数据）
        const convertedAsmp = convertToScenarios(asmp);
        openAssumptionForm(convertedAsmp);
    }
}

// 当前编辑的假设（用于三场景编辑器）
let currentEditingAssumption = null;

// UE参数定义（用于三场景编辑器）
const UE_PARAMS_BY_TYPE = {
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

function openAssumptionForm(asmp, themeId) {
    const isEdit = !!asmp;
    currentEditingAssumption = isEdit ? JSON.parse(JSON.stringify(asmp)) : createEmptyAssumption(themeId);
    
    document.getElementById('modal-title').innerHTML = `
        <div class="flex items-center gap-3">
            <span class="text-2xl">🎯</span>
            <div>
                <h3 class="text-lg font-bold text-gray-900">${isEdit ? '编辑战略假设' : '新建战略假设'}</h3>
                <p class="text-xs text-gray-500">配置三套 UE 模型参数调整</p>
            </div>
        </div>
    `;

    document.getElementById('modal-body').innerHTML = renderAssumptionEditorContent(currentEditingAssumption);

    document.getElementById('modal-footer').innerHTML = `
        <button onclick="deleteAssumptionFromModal()" id="btn-delete-asmp" class="text-red-500 hover:text-red-700 text-sm font-medium ${isEdit ? '' : 'hidden'}">
            <i class="fas fa-trash-alt mr-1"></i>删除此假设
        </button>
        <div class="flex items-center gap-3 ml-auto">
            <button class="btn-secondary" onclick="closeModal()">取消</button>
            <button class="btn-primary bg-gradient-to-r from-indigo-600 to-purple-600" onclick="saveAssumption('${isEdit ? asmp.id : ''}')">
                <i class="fas fa-save mr-2"></i>${isEdit ? '保存假设' : '创建假设'}
            </button>
        </div>`;

    document.getElementById('modal-overlay').classList.remove('hidden');
    
    // 初始化场景标签切换
    initScenarioTabs();
}

// 创建空白假设模板（带三场景结构）
function createEmptyAssumption(themeId) {
    const theme = themeId ? AppState.themes.find(t => t.id === themeId) : null;
    return {
        id: 'asmp_' + Date.now(),
        assumption_name: '',
        category: theme ? theme.theme_name : '获客',
        _theme_id: themeId || null,
        description: '',
        impact_level: '中',
        confidence_level: 70,
        priority: AppState.assumptions.length + 1,
        validation_status: '待验证',
        timeline: '',
        strategic_analysis: '',
        financial_analysis: '',
        hr_analysis: '',
        market_analysis: '',
        risk_factors: '',
        param_adjustments: {},
        adjustment_type: {},
        
        // 三场景结构
        scenarios: {
            conservative: {
                name: '保守估计',
                probability: 0.3,
                param_adjustments: {},
                adjustment_type: {}
            },
            target: {
                name: '目标达成',
                probability: 0.5,
                param_adjustments: {},
                adjustment_type: {},
                is_primary: true
            },
            optimistic: {
                name: '乐观预期',
                probability: 0.2,
                param_adjustments: {},
                adjustment_type: {}
            }
        }
    };
}

// 渲染假设编辑器内容（三场景版本）
function renderAssumptionEditorContent(asmp) {
    const categories = ['获客', '产品', '转化', '交付'];
    const statuses = ['已验证', '验证中', '待验证', '已否定'];
    
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
                        <input type="text" id="asmp-name" value="${asmp.assumption_name}" 
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="例如：聚焦盘渗透率可达10%">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">分类</label>
                        <select id="asmp-category" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            ${categories.map(c => `<option ${asmp.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-600 mb-1">描述</label>
                        <textarea id="asmp-desc" rows="2" 
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="简要描述这个战略假设的核心逻辑">${asmp.description}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">影响级别</label>
                        <select id="asmp-impact" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            <option ${asmp.impact_level === '高' ? 'selected' : ''}>高</option>
                            <option ${asmp.impact_level === '中' ? 'selected' : ''}>中</option>
                            <option ${asmp.impact_level === '低' ? 'selected' : ''}>低</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">置信度 (%)</label>
                        <input type="number" id="asmp-confidence" value="${asmp.confidence_level}" min="0" max="100"
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">验证状态</label>
                        <select id="asmp-status" class="w-full px-3 py-2 border border-gray-200 rounded-lg">
                            ${statuses.map(s => `<option ${asmp.validation_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">优先级 (1-5)</label>
                        <input type="number" id="asmp-priority" value="${asmp.priority}" min="1" max="5"
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
                        🛡️ 保守场景 (${((asmp.scenarios?.conservative?.probability || 0.3) * 100).toFixed(0)}%)
                    </button>
                    <button type="button" class="scenario-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-indigo-100 text-indigo-700" 
                        data-scenario="target" onclick="switchScenarioTab('target')">
                        ⭐ 目标场景 (${((asmp.scenarios?.target?.probability || 0.5) * 100).toFixed(0)}%)
                    </button>
                    <button type="button" class="scenario-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600" 
                        data-scenario="optimistic" onclick="switchScenarioTab('optimistic')">
                        🚀 乐观场景 (${((asmp.scenarios?.optimistic?.probability || 0.2) * 100).toFixed(0)}%)
                    </button>
                </div>
                
                <!-- 场景内容 -->
                <div class="scenario-contents">
                    ${renderScenarioEditorPanel('conservative', asmp.scenarios?.conservative || {}, asmp)}
                    ${renderScenarioEditorPanel('target', asmp.scenarios?.target || {}, asmp)}
                    ${renderScenarioEditorPanel('optimistic', asmp.scenarios?.optimistic || {}, asmp)}
                </div>
            </div>
        </div>
    `;
}

// 渲染单个场景编辑器面板
function renderScenarioEditorPanel(scenarioType, scenario, asmp) {
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
                        <input type="text" id="scene-name-${scenarioType}" value="${scenario.name || tl.name + '场景'}"
                            class="bg-transparent font-bold text-gray-800 border-b border-transparent hover:border-${tl.color}-300 focus:border-${tl.color}-500 focus:outline-none px-1">
                    </div>
                    <div class="flex items-center gap-2 text-sm">
                        <label class="text-gray-600">概率:</label>
                        <input type="number" id="scene-prob-${scenarioType}" value="${((scenario.probability || 0) * 100).toFixed(0)}" min="0" max="100"
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
                            ${renderParamAdjustInputsForAssumption('beike', scenarioType, scenario.param_adjustments || {}, scenario.adjustment_type || {})}
                        </div>
                    </div>
                    
                    <!-- 业主 UE -->
                    <div class="bg-white rounded-lg p-3">
                        <h5 class="font-semibold text-gray-700 mb-3 flex items-center gap-1 text-sm">
                            <i class="fas fa-home text-green-500"></i> 业主 UE
                        </h5>
                        <div class="space-y-2">
                            ${renderParamAdjustInputsForAssumption('owner', scenarioType, scenario.param_adjustments || {}, scenario.adjustment_type || {})}
                        </div>
                    </div>
                    
                    <!-- 供应商 UE -->
                    <div class="bg-white rounded-lg p-3">
                        <h5 class="font-semibold text-gray-700 mb-3 flex items-center gap-1 text-sm">
                            <i class="fas fa-tools text-amber-500"></i> 供应商 UE
                        </h5>
                        <div class="space-y-2">
                            ${renderParamAdjustInputsForAssumption('supplier', scenarioType, scenario.param_adjustments || {}, scenario.adjustment_type || {})}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 渲染参数调整输入（用于assumptions.js）
function renderParamAdjustInputsForAssumption(ueType, scenarioType, paramAdjustments, adjustmentTypes) {
    const params = UE_PARAMS_BY_TYPE[ueType] || [];
    
    return params.map(p => {
        const currentVal = paramAdjustments[p.key];
        const currentType = adjustmentTypes[p.key] || p.type;
        const hasValue = currentVal !== undefined && currentVal !== null && currentVal !== '';
        
        const bgClass = hasValue ? (ueType === 'beike' ? 'bg-ke-50' : ueType === 'owner' ? 'bg-green-50' : 'bg-amber-50') : '';
        return `
            <div class="flex items-center gap-2 ${bgClass} rounded px-2 py-1">
                <label class="text-xs text-gray-600 w-20">${p.label}</label>
                <select class="asmp-param-type-${scenarioType} text-xs border border-gray-200 rounded px-1 py-0.5 w-14" 
                    data-param="${p.key}" data-scenario="${scenarioType}">
                    <option value="multiply" ${currentType === 'multiply' ? 'selected' : ''}>×</option>
                    <option value="add" ${currentType === 'add' ? 'selected' : ''}>+</option>
                    <option value="set" ${currentType === 'set' ? 'selected' : ''}>=</option>
                </select>
                <input type="number" class="asmp-param-value-${scenarioType} text-xs border border-gray-200 rounded px-1 py-0.5 w-16" 
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
    
    // 切换内容面板
    document.querySelectorAll('.scenario-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    const activePanel = document.getElementById(`scenario-panel-${scenarioType}`);
    if (activePanel) activePanel.classList.remove('hidden');
}

// 从弹窗删除假设
function deleteAssumptionFromModal() {
    if (currentEditingAssumption && currentEditingAssumption.id) {
        deleteAssumption(currentEditingAssumption.id);
    }
}

// 将旧版数据结构转换为三场景结构
function convertToScenarios(asmp) {
    if (!asmp) return null;
    
    // 如果已经有scenarios结构，直接返回
    if (asmp.scenarios && asmp.scenarios.target) {
        return asmp;
    }
    
    // 否则，从param_adjustments转换为目标场景
    return {
        ...asmp,
        scenarios: {
            conservative: {
                name: '保守估计',
                probability: 0.3,
                param_adjustments: {},
                adjustment_type: {}
            },
            target: {
                name: '目标达成',
                probability: 0.5,
                param_adjustments: { ...asmp.param_adjustments },
                adjustment_type: { ...asmp.adjustment_type },
                is_primary: true
            },
            optimistic: {
                name: '乐观预期',
                probability: 0.2,
                param_adjustments: {},
                adjustment_type: {}
            }
        }
    };
}

function saveAssumption(existingId) {
    const name = document.getElementById('asmp-name').value.trim();
    if (!name) { showToast('请输入假设名称', 'error'); return; }

    // 收集三场景数据
    const scenarios = {
        conservative: {
            name: document.getElementById('scene-name-conservative')?.value || '保守估计',
            probability: parseInt(document.getElementById('scene-prob-conservative')?.value || 30) / 100,
            param_adjustments: {},
            adjustment_type: {}
        },
        target: {
            name: document.getElementById('scene-name-target')?.value || '目标达成',
            probability: parseInt(document.getElementById('scene-prob-target')?.value || 50) / 100,
            param_adjustments: {},
            adjustment_type: {},
            is_primary: true
        },
        optimistic: {
            name: document.getElementById('scene-name-optimistic')?.value || '乐观预期',
            probability: parseInt(document.getElementById('scene-prob-optimistic')?.value || 20) / 100,
            param_adjustments: {},
            adjustment_type: {}
        }
    };

    // 收集每个场景的参数调整
    ['conservative', 'target', 'optimistic'].forEach(sceneType => {
        // 收集该场景的所有参数类型输入
        document.querySelectorAll(`.asmp-param-type-${sceneType}`).forEach(select => {
            const paramKey = select.dataset.param;
            const type = select.value;
            const valueInput = document.querySelector(`.asmp-param-value-${sceneType}[data-param="${paramKey}"]`);
            const val = valueInput?.value;
            
            if (val !== '' && val !== undefined) {
                scenarios[sceneType].param_adjustments[paramKey] = parseFloat(val);
                scenarios[sceneType].adjustment_type[paramKey] = type;
            }
        });
    });

    // 使用目标场景作为主要参数调整（保持向后兼容）
    const targetAdj = scenarios.target.param_adjustments;
    const targetAdjType = scenarios.target.adjustment_type;

    const data = {
        id: existingId || generateId(),
        assumption_name: name,
        category: document.getElementById('asmp-category').value,
        description: document.getElementById('asmp-desc').value,
        impact_level: document.getElementById('asmp-impact').value,
        confidence_level: parseInt(document.getElementById('asmp-confidence').value),
        validation_status: document.getElementById('asmp-status').value,
        validation_result: '',
        param_adjustments: targetAdj,
        adjustment_type: targetAdjType,
        priority: parseInt(document.getElementById('asmp-priority').value),
        is_active: true,
        scenarios: scenarios  // 保存三场景结构
    };

    if (existingId) {
        const idx = AppState.assumptions.findIndex(a => a.id === existingId);
        if (idx >= 0) {
            // 保留原有的分析字段
            const existing = AppState.assumptions[idx];
            const oldCategory = existing.category;
            AppState.assumptions[idx] = {
                ...existing,
                ...data,
                strategic_analysis: existing.strategic_analysis || '',
                financial_analysis: existing.financial_analysis || '',
                hr_analysis: existing.hr_analysis || '',
                market_analysis: existing.market_analysis || '',
                risk_factors: existing.risk_factors || '',
                timeline: existing.timeline || ''
            };
            // 如果category变了，迁移到新主题
            if (oldCategory !== data.category) {
                AppState.themes.forEach(t => {
                    t.experiment_ids = t.experiment_ids.filter(eid => eid !== existingId);
                });
                const newTheme = AppState.themes.find(t => t.theme_name === data.category);
                if (newTheme && !newTheme.experiment_ids.includes(existingId)) {
                    newTheme.experiment_ids.push(existingId);
                }
            }
        }
    } else {
        AppState.assumptions.push(data);
        // 新假设：添加到对应主题
        const theme = AppState.themes.find(t => t.theme_name === data.category);
        if (theme && !theme.experiment_ids.includes(data.id)) {
            theme.experiment_ids.push(data.id);
        }
    }

    syncAssumptionsFromThemes();
    closeModal();
    renderAssumptions();
    renderScenarioSelector();
    currentEditingAssumption = null;
    showToast(existingId ? '假设已更新' : '假设已创建');
}

function deleteAssumption(id) {
    if (!confirm('确认删除此实验假设？')) return;
    // 从主题中移除
    AppState.themes.forEach(t => {
        t.experiment_ids = t.experiment_ids.filter(eid => eid !== id);
    });
    AppState.assumptions = AppState.assumptions.filter(a => a.id !== id);
    syncAssumptionsFromThemes();
    renderAssumptions();
    renderScenarioSelector();
    showToast('实验已删除');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    currentEditingAssumption = null;
}