# v5.1 专家库测试用例

**版本**: v5.1
**测试日期**: 2026-03-17
**测试范围**: 专家库基础功能、蓝军评审整合

---

## 1. 类型定义测试

### TC-001: Expert 类型完整性
**目的**: 验证 Expert 类型包含所有必要字段
**测试步骤**:
1. 检查 types/index.ts 中 Expert 接口
2. 验证包含: id, name, code, level, domainCode, domainName, profile, philosophy, achievements, reviewDimensions, status, totalReviews, acceptanceRate, avgResponseTime

**期望结果**: 所有字段存在，类型定义正确
**状态**: ⬜ 待测试

### TC-002: ExpertReview 类型完整性
**目的**: 验证 ExpertReview 类型包含所有必要字段
**测试步骤**:
1. 检查 ExpertReview 接口定义
2. 验证包含评审内容、建议、置信度、用户反馈等字段

**期望结果**: 类型定义完整
**状态**: ⬜ 待测试

---

## 2. 专家服务测试

### TC-003: 专家匹配算法 - 新能源主题
**目的**: 验证主题关键词能正确匹配领域专家
**测试数据**:
```typescript
const request = {
  topic: "新能源汽车电池技术发展趋势",
  importance: 0.5
};
```

**测试步骤**:
1. 调用 matchExperts(request)
2. 检查返回的 domainExperts

**期望结果**:
- domainExperts.length >= 2
- domainExperts[0].domainCode === 'E03'
- domainExperts[0].domainName === '新能源'

**状态**: ⬜ 待测试

### TC-004: 专家匹配算法 - AI主题
**目的**: 验证人工智能主题匹配
**测试数据**:
```typescript
const request = {
  topic: "大模型在医疗诊断中的应用",
  importance: 0.6
};
```

**期望结果**:
- 匹配 E07 人工智能领域专家
- domainExperts 不为空

**状态**: ⬜ 待测试

### TC-005: 特级专家触发 - 高重要性任务
**目的**: 验证 importance > 0.8 时触发特级专家
**测试数据**:
```typescript
const request = {
  topic: "宏观经济政策分析",
  importance: 0.9
};
```

**期望结果**:
- seniorExpert 不为 undefined
- seniorExpert.level === 'senior'
- matchReasons 包含重要性说明

**状态**: ⬜ 待测试

### TC-006: 特级专家不触发 - 普通任务
**目的**: 验证 importance <= 0.8 时不触发特级专家
**测试数据**:
```typescript
const request = {
  topic: "宏观经济政策分析",
  importance: 0.7
};
```

**期望结果**:
- seniorExpert === undefined

**状态**: ⬜ 待测试

### TC-007: 通用专家返回
**目的**: 验证通用专家（事实核查/逻辑检查/读者代表）正确返回
**测试步骤**:
1. 调用 matchExperts 任意主题
2. 检查返回的 universalExperts

**期望结果**:
- universalExperts.factChecker 存在
- universalExperts.logicChecker 存在
- universalExperts.readerRep 存在
- 三者 id 分别为 UNI-01, UNI-02, UNI-03

**状态**: ⬜ 待测试

### TC-008: 专家观点生成 - 张一鸣风格
**目的**: 验证张一鸣专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-01'); // 张一鸣
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "A/B测试"
- opinion.opinion 包含 "延迟满足"
- opinion.opinion 包含 "长期视角"

**状态**: ⬜ 待测试

### TC-009: 专家观点生成 - 王兴风格
**目的**: 验证王兴专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-02'); // 王兴
const opinion = generateExpertOpinion(expert, "测试内容", "outline");
```

**期望结果**:
- opinion.opinion 包含 "终局"
- opinion.opinion 包含 "供给侧"
- opinion.opinion 包含 "无限游戏"

**状态**: ⬜ 待测试

### TC-010: 专家观点生成 - 马斯克风格
**目的**: 验证马斯克专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-03'); // 马斯克
const opinion = generateExpertOpinion(expert, "测试内容", "research");
```

**期望结果**:
- opinion.opinion 包含 "第一性原理"
- opinion.opinion 包含 "10倍改进"

**状态**: ⬜ 待测试

### TC-011: 专家观点生成 - 任正非风格
**目的**: 验证任正非专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-04'); // 任正非
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "备胎"
- opinion.opinion 包含 "压强原则"

**状态**: ⬜ 待测试

### TC-012: 专家观点生成 - 贝索斯风格
**目的**: 验证贝索斯专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-05'); // 贝索斯
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "Day 1"
- opinion.opinion 包含 "客户"

**状态**: ⬜ 待测试

### TC-013: 专家观点生成 - 巴菲特风格
**目的**: 验证巴菲特专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-06'); // 巴菲特
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "护城河"
- opinion.opinion 包含 "安全边际"

**状态**: ⬜ 待测试

### TC-014: 专家观点生成 - 孙正义风格
**目的**: 验证孙正义专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-07'); // 孙正义
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "赛道"
- opinion.opinion 包含 "指数级"

**状态**: ⬜ 待测试

### TC-015: 专家观点生成 - 黄峥风格
**目的**: 验证黄峥专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-08'); // 黄峥
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "五环外"
- opinion.opinion 包含 "本分"

**状态**: ⬜ 待测试

### TC-016: 专家观点生成 - 雷军风格
**目的**: 验证雷军专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-09'); // 雷军
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "极致"
- opinion.opinion 包含 "性价比"

**状态**: ⬜ 待测试

### TC-017: 专家观点生成 - 纳德拉风格
**目的**: 验证纳德拉专家观点包含其标志性思想
**测试数据**:
```typescript
const expert = getExpertById('S-10'); // 纳德拉
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.opinion 包含 "成长思维"
- opinion.opinion 包含 "云优先"

**状态**: ⬜ 待测试

### TC-018: 专家工作量查询
**目的**: 验证 getExpertWorkload 返回正确格式
**测试步骤**:
1. 调用 getExpertWorkload('S-01')
2. 检查返回结构

**期望结果**:
- 返回对象包含 pendingReviews (number)
- 返回对象包含 avgReviewTime (number)
- 返回对象包含 availability ('available' | 'busy' | 'unavailable')

**状态**: ⬜ 待测试

### TC-019: 领域专家观点生成
**目的**: 验证领域专家观点生成
**测试数据**:
```typescript
const expert = getExpertById('E01-01'); // 宏观经济专家
const opinion = generateExpertOpinion(expert, "测试内容", "draft");
```

**期望结果**:
- opinion.expertId === 'E01-01'
- opinion.opinion 包含专家领域名称
- opinion.focusAreas 不为空

**状态**: ⬜ 待测试

---

## 3. 组件测试

### TC-020: ExpertReviewPanel 渲染
**目的**: 验证组件正确渲染
**测试步骤**:
1. 渲染 ExpertReviewPanel
2. 传入必要 props

**期望结果**:
- 组件渲染不报错
- 显示加载状态或内容
- 包含 match-explanation 区域

**状态**: ⬜ 待测试

### TC-021: ExpertReviewPanel 特级专家展示
**目的**: 验证特级专家区域正确展示
**测试数据**:
```typescript
const assignment = {
  seniorExpert: { id: 'S-01', name: '张一鸣', ... },
  domainExperts: [...],
  universalExperts: {...}
};
```

**期望结果**:
- 显示 senior-expert-section
- 显示 "战略顾问评审" 标题
- 显示特级专家徽章

**状态**: ⬜ 待测试

### TC-022: ExpertReviewPanel 领域专家网格
**目的**: 验证领域专家网格展示
**期望结果**:
- 显示 domain-experts-section
- 显示 "领域专家深度评审" 标题
- 网格中包含对应数量的 ExpertReviewCard

**状态**: ⬜ 待测试

### TC-023: ExpertReviewPanel 通用专家徽章
**目的**: 验证通用专家徽章展示
**期望结果**:
- 显示 universal-experts-section
- 显示 "基础质量检查" 标题
- 显示3个 UniversalExpertBadge

**状态**: ⬜ 待测试

### TC-024: ExpertReviewCard 接受操作
**目的**: 验证接受按钮功能
**测试步骤**:
1. 渲染 ExpertReviewCard
2. 点击接受按钮
3. 验证 onAccept 回调被调用

**期望结果**:
- onAccept 被调用
- 按钮显示 "已接受" 状态
- 按钮被禁用

**状态**: ⬜ 待测试

### TC-025: ExpertReviewCard 忽略操作
**目的**: 验证忽略按钮功能
**测试步骤**:
1. 渲染 ExpertReviewCard
2. 点击忽略按钮
3. 验证 onIgnore 回调被调用

**期望结果**:
- onIgnore 被调用
- 按钮显示 "已忽略" 状态

**状态**: ⬜ 待测试

### TC-026: ExpertReviewCard 重新生成
**目的**: 验证重新生成功能
**测试步骤**:
1. 渲染 ExpertReviewCard
2. 点击重新生成按钮
3. 验证 onRefresh 回调被调用

**期望结果**:
- onRefresh 被调用
- isGenerating 为 true 时显示加载状态

**状态**: ⬜ 待测试

---

## 4. 集成测试

### TC-027: TaskDetail 评审标签页加载
**目的**: 验证 TaskDetail 评审标签页包含 ExpertReviewPanel
**测试步骤**:
1. 打开 TaskDetail 页面
2. 切换到 "蓝军评审" 标签

**期望结果**:
- 页面加载不报错
- 显示专家库深度评审区域
- ExpertReviewPanel 正确渲染

**状态**: ⬜ 待测试

### TC-028: TaskDetail 专家匹配展示
**目的**: 验证 TaskDetail 根据任务主题匹配专家
**测试步骤**:
1. 创建新能源主题任务
2. 进入评审标签页

**期望结果**:
- 匹配并显示 E03 新能源领域专家
- 显示专家头像、名称、职称

**状态**: ⬜ 待测试

---

## 5. 数据完整性测试

### TC-029: 专家数据数量验证
**目的**: 验证专家数据完整
**测试步骤**:
1. 调用 getAllExperts()
2. 统计专家数量

**期望结果**:
- 特级专家数量 === 10
- 领域专家数量 === 65
- 总专家数量 === 75

**状态**: ⬜ 待测试

### TC-030: 领域覆盖验证
**目的**: 验证12个领域都有专家
**测试步骤**:
1. 检查每个领域代码 E01-E12
2. 调用 getExpertsByDomain

**期望结果**:
- 每个领域返回的专家数量 >= 5

**状态**: ⬜ 待测试

---

## 测试执行记录

| 测试ID | 执行人 | 结果 | 日期 | 备注 |
|-------|-------|------|------|------|
| TC-001 | | | | |
| TC-002 | | | | |
| ... | | | | |

---

## 缺陷记录

| 缺陷ID | 描述 | 严重度 | 状态 | 修复人 | 修复日期 |
|-------|------|-------|------|-------|---------|
| | | | | | |

---

**测试总结**:
**测试通过**: 0/30
**测试失败**: 0/30
**待测试**: 30/30
