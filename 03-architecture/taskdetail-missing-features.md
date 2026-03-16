# TaskDetail 功能缺失清单

**对比基准**: /Users/行业研究/demo-project/webapp/index.html
**日期**: 2026-03-17

---

## ❌ 缺失功能列表

### 1. 选题策划 Tab 操作按钮

| 功能 | 原系统 | 当前状态 | 优先级 |
|------|--------|----------|--------|
| 确认大纲并继续 | ✅ `confirmOutline()` | ❌ 按钮样式有了，但API调用可能不正确 | P0 |
| 重做选题策划 | ✅ `openRedoPlanningModal()` | ✅ 已实现 | ✅ |
| 生成大纲 (初始触发) | ✅ 创建任务后自动生成 | ⚠️ 需要确认流程 | P1 |

### 2. 深度研究 Tab 操作按钮

| 功能 | 原系统 | 当前状态 | 优先级 |
|------|--------|----------|--------|
| 重做深度研究 | ✅ `openRedoResearchModal()` | ✅ 已实现 | ✅ |
| 触发研究采集 | ✅ 确认大纲后自动触发 | ⚠️ 需要后端配合 | P0 |
| 添加外部链接 | ✅ `addExternalLink()` | ❌ 完全缺失 | P1 |
| 显示搜索统计 | ✅ `searchStats.webSources/assetSources` | ⚠️ 部分实现 | P1 |

### 3. 文稿生成 Tab

| 功能 | 原系统 | 当前状态 | 优先级 |
|------|--------|----------|--------|
| 重做文稿生成 | ✅ `confirmRedoWriting()` | ❌ 完全缺失 | P1 |
| 显示生成状态 | ✅ 进度指示 | ❌ 完全缺失 | P2 |

### 4. 蓝军评审 Tab (已完整)

| 功能 | 状态 |
|------|------|
| 重做蓝军评审 | ✅ 已实现 |
| 评审决策按钮 | ✅ 已实现 |
| 专家评审分工 | ✅ 已实现 |

### 5. 深度研究 - 洞见生成功能

原系统功能：
```javascript
// 深度研究流程
dataCollection → cleaning → analysis → insightGeneration

// 具体功能
1. 网页搜索采集 (web search)
2. 素材库检索 (asset search)
3. 数据清洗 (data cleaning)
4. 交叉验证 (cross validation)
5. 洞察提炼 (insight generation)
6. 生成研究洞见 (knowledge insights)
```

当前缺失：
- ❌ 触发采集按钮
- ❌ 采集进度显示
- ❌ 数据清洗界面
- ❌ 交叉验证结果展示
- ❌ 手动添加/删除数据源

### 6. 大纲编辑增强

原系统功能：
- ✅ 编辑大纲 JSON
- ❌ 大纲版本对比
- ❌ 大纲段落重新生成
- ❌ 大纲段落调整顺序

---

## 📝 API 核对清单

### 已确认存在的 API
- [x] `POST /production/:id/redo/planning` - 重做选题策划
- [x] `POST /production/:id/redo/research` - 重做深度研究
- [x] `POST /production/:id/redo/writing` - 重做文稿生成
- [x] `POST /production/:id/redo/review` - 重做蓝军评审
- [x] `POST /production/:id/outline/confirm` - 确认大纲

### 需要确认的 API
- [ ] `POST /production/:id/research/collect` - 触发研究采集
- [ ] `POST /production/:id/research/sources` - 添加外部链接
- [ ] `GET /production/:id/research/progress` - 采集进度

---

## 🎯 修复计划

### Phase A: 紧急修复 (P0)
1. 修复确认大纲按钮 API 调用
2. 添加触发研究采集按钮
3. 添加添加外部链接功能

### Phase B: 功能增强 (P1)
1. 重做文稿生成按钮
2. 搜索统计显示
3. 采集进度显示

### Phase C: 高级功能 (P2)
1. 数据清洗界面
2. 交叉验证展示
3. 大纲版本对比

---

## 🔍 问题根因分析

1. **前端问题**: 部分按钮已存在但 API 调用路径错误
2. **后端问题**: 部分 API 可能未实现或文档不全
3. **数据问题**: 任务状态流转可能不完整

---

## 💡 建议

**方案1: 最小可用**
- 修复现有按钮的 API 调用
- 添加缺失的基础操作按钮
- 保持当前数据展示方式

**方案2: 完整复刻**
- 完整实现原系统所有功能
- 包括数据采集进度、清洗界面等
- 需要后端配合实现相关 API

请选择方案继续推进。
