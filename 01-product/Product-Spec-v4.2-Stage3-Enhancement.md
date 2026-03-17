# 产品规格: Stage 3 文稿生成增强 v4.2

**版本**: v4.2
**日期**: 2026-03-16
**状态**: 📝 需求文档
**负责人**: 产品研发运营协作体系
**优先级**: P0

---

## 1. 需求价值（承接 WHY.md）

### 1.1 与 WHY.md 的关联

根据 [WHY.md](../WHY.md)，项目核心目标是建立**标准化、可复用的内容生产流水线**，实现：
- ✅ 质量优先：蓝军评审机制
- ✅ 双周更：稳定产出
- ✅ 高自动化：减少人工干预
- ✅ 知识复用：历史研报关联

**v4.2 解决的关键痛点**：

| WHY.md 痛点 | v4.2 解决方案 | 价值量化 |
|------------|--------------|---------|
| "产出效率极低（围绕一个观点需大量重复劳动）" | 对话式修改：自然语言指令直接修改 | 修改效率提升 **3倍** |
| "蓝军评审后修改依赖人工逐行处理" | 可视化标注 + 一键接受/拒绝 | 评审处理时间从 **2小时→30分钟** |
| "无法规模化（手动流程限制产出频率）" | 版本管理 + 修改追踪 | 支持并行协作，实现双周更目标 |
| 内容质量把控 | 5种标注类型覆盖全场景质量问题 | 蓝军评审通过率 **100%** |

### 1.2 用户价值

**主要用户：内容创作者（我自己）**
- 🎯 专注思考：从"逐字修改"解放，用对话完成修改
- 🎯 质量保障：蓝军评审意见可视化，不遗漏任何建议
- 🎯 版本可控：随时回溯，实验性修改无风险

**间接用户：内容消费者**
- 📈 更稳定的内容产出（支撑双周更）
- 📈 更高质量的内容（蓝军评审100%通过）

### 1.3 成功标准（可量化）

| 指标 | 现状 | 目标 | 验证方式 |
|------|------|------|---------|
| 文稿修改时间 | 4小时/篇 | <1小时/篇 | 计时统计 |
| 蓝军意见处理遗漏率 | 约15% | 0% | 意见闭环检查 |
| 对话修改满意度 | - | >85% | 每次对话后评分 |
| 版本回滚使用频率 | - | >20% | 埋点统计 |
| Stage 3 整体耗时 | 2天 | <0.5天 | 流水线耗时统计 |

---

## 2. 功能清单

### 2.1 可视化标注系统 (Annotation System)

**核心功能**:
- 📝 文本高亮标注（支持多种颜色标记）
- 💬 批注气泡（点击高亮显示批注内容）
- ✏️ 建议修改（右侧显示AI建议）
- ✅ 一键接受/拒绝修改

**标注类型**:
| 类型 | 图标 | 颜色 | 用途 |
|------|------|------|------|
| 事实错误 | ⚠️ | 红色 | 数据、引用错误 |
| 逻辑问题 | 🔍 | 橙色 | 论证不严谨 |
| 表达优化 | ✨ | 蓝色 | 语句润色建议 |
| 补充建议 | ➕ | 绿色 | 建议增加内容 |
| 删除建议 | ➖ | 灰色 | 建议删除内容 |

**交互方式**:
```
1. 用户选中段落 → 弹出标注工具栏
2. 选择标注类型 → 输入批注内容
3. AI自动生成建议修改
4. 用户选择：接受/拒绝/继续对话修改
```

---

### 2.2 对话式修改 (Conversational Editing)

**核心功能**:
- 💬 侧边对话面板
- 🎯 上下文感知（基于当前选中内容）
- 🔄 多轮对话迭代
- 📜 修改历史回溯

**对话指令示例**:
```
用户: "这段数据太旧了，换成2024年最新数据"
AI: "已查找最新数据：2024年Q1新能源汽车销量为XXX万辆，同比增长XX%。是否替换？"

用户: "第三段的论证不够有力，加强一下"
AI: "已增强论证：添加了行业专家观点和对比数据。请查看修改效果。"

用户: "把全文改成更口语化的风格"
AI: "已完成风格转换：将学术用语转换为通俗表达，增加口语化连接词。共修改15处。"
```

**对话模式**:
| 模式 | 说明 |
|------|------|
| 指令模式 | "把第二段改成..." / "增加关于...的内容" |
| 问答模式 | "这个数据准确吗？" / "为什么用这个例子？" |
| 建议模式 | AI主动发现并提出修改建议 |

---

### 2.3 版本对比系统 (Version Diff)

**核心功能**:
- 🔄 左右对比视图
- 📝 行级差异高亮（新增/删除/修改）
- 📊 修改统计（字数变化、修改点数量）
- ⏪ 一键回滚到任意版本

**对比维度**:
```
版本1: 初稿 (生成时间: 2026-03-16 10:00)
版本2: 标注修改后 (修改时间: 2026-03-16 11:30)
版本3: 对话修改后 (修改时间: 2026-03-16 14:00)
```

---

### 2.4 修改追踪 (Change Tracking)

**核心功能**:
- 📋 修改日志列表
- 👤 修改者标识（用户/AI/蓝军）
- 🕐 时间线展示
- 💬 修改原因记录

---

## 3. 页面交互原型

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 内容生产流水线                     Stage 3: 文稿生成 - 交互式修改 v4.2   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────┐  ┌─────────────────────────┐  │
│  │                                         │  │  💬 对话修改             │  │
│  │  📄 新能源汽车行业深度分析               │  │  ─────────────────────  │  │
│  │                                         │  │                         │  │
│  │  [标签: 研报解读] [标签: 新能源]          │  │  👤 你                  │  │
│  │                                         │  │  "这段数据太旧了，换成   │  │
│  │  ╔═══════════════════════════════════╗  │  │   2024年最新数据"       │  │
│  │  ║ 一、行业概况                        ║  │  │                         │  │
│  │  ║                                   ║  │  │  🤖 AI                  │  │
│  │  ║ 2023年新能源汽车销量达到949.5万辆   ║  │  │  "已查找最新数据：2024年 │  │
│  │  ║ ═══════════════════════════════════ 📝║  │  │  Q1销量为XXX万辆。       │  │
│  │  ║ [⚠️ 标注: 数据过期]                ║  │  │  是否替换？"            │  │
│  │  ╚═══════════════════════════════════╝  │  │  [✅ 应用] [❌ 忽略]     │  │
│  │                                         │  │                         │  │
│  │  ╔═══════════════════════════════════╗  │  │  👤 你                  │  │
│  │  ║ 二、产业链分析                      ║  │  │  "把第二段改成更口语化"  │  │
│  │  ║                                   ║  │  │                         │  │
│  │  ║ 动力电池产业呈现高度集中态势...     ║  │  │  🤖 AI                  │  │
│  │  ║ ═══════════════════════════════════ ✨║  │  │  "已完成15处修改，请看   │  │
│  │  ║ [✨ 标注: 表达优化]                ║  │  │  高亮部分"              │  │
│  │  ╚═══════════════════════════════════╝  │  │                         │  │
│  │                                         │  │  ┌─────────────────┐    │  │
│  │                                         │  │  │ 📝 输入修改指令... │    │  │
│  │                                         │  │  │                 │    │  │
│  │                                         │  │  │ [📎] [🎙️] [发送] │    │  │
│  │                                         │  │  └─────────────────┘    │  │
│  │                                         │  │                         │  │
│  │                                         │  │  📋 标注列表             │  │
│  │                                         │  │  ─────────────────────  │  │
│  │                                         │  │  ⚠️ 事实错误 (1)        │  │
│  │                                         │  │  ✨ 表达优化 (3)        │  │
│  │                                         │  │  ➕ 补充建议 (2)        │  │
│  │                                         │  │  🔍 逻辑问题 (0)        │  │
│  │                                         │  │                         │  │
│  └─────────────────────────────────────────┘  └─────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  [📋 版本: v3 - 对话修改后]    [📊 修改: +120字, 15处改动]            │ │
│  │                                                                       │ │
│  │  [💾 保存] [↩️ 撤销] [🔄 对比版本] [📜 修改日志] [✅ 完成并进入Stage 4]│ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 标注创建交互流程

**步骤1: 选中文本 → 弹出工具栏**
```
选中文本区域:
┌──────────────────────────────────────┐
│ 动力电池产业呈现高度集中态势...       │
│ ████████████████████████████         │ ← 用户选中
│ 宁德时代占据市场份额的45%以上        │
└──────────────────────────────────────┘

弹出工具栏:
┌──────────────────────────────────────────────────┐
│ 📝标注 │ ⚠️错误 │ 🔍逻辑 │ ✨优化 │ ➕补充 │ ➖删除 │
└──────────────────────────────────────────────────┘
```

**步骤2: 选择类型 → 批注面板**
```
┌──────────────────────────────────────┐
│ 批注详情                            │
├──────────────────────────────────────┤
│ 类型: ✨ 表达优化                    │
│                                      │
│ 选中文本:                            │
│ "动力电池产业呈现高度集中态势"       │
│                                      │
│ 批注内容:                            │
│ ┌──────────────────────────────────┐ │
│ │ 这句话表述过于学术化，建议改为更   │ │
│ │ 通俗的表达方式                     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ AI建议修改:                          │
│ ┌──────────────────────────────────┐ │
│ │ "动力电池市场集中度很高"          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [✅ 接受建议] [🔄 继续对话] [❌ 拒绝]│
└──────────────────────────────────────┘
```

### 3.3 版本对比界面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔄 版本对比                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [版本: v1 初稿 ▼]                    [版本: v3 对话修改后 ▼]               │
│                                                                             │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐      │
│  │ 2023年新能源汽车销量        │      │ 2024年Q1新能源汽车销量      │      │
│  │ 达到949.5万辆。             │      │ 达到XXX万辆，同比增长XX%。  │      │
│  │                             │      │                             │      │
│  │ 动力电池产业呈现            │      │ 动力电池市场集中度很高，    │      │
│  │ 高度集中态势。              │      │ 头部企业优势明显。          │      │
│  │                             │      │                             │      │
│  │  ┌─ 删除 ─────────────────┐ │      │  ┌─ 新增 ─────────────────┐ │      │
│  │  │ 产业政策支持力度不足   │ │      │  │ ⭐ 政策利好持续释放    │ │      │
│  │  │                        │ │      │  │ 财政部近期出台新政策...│ │      │
│  │  └────────────────────────┘ │      │  └────────────────────────┘ │      │
│  └─────────────────────────────┘      └─────────────────────────────┘      │
│                                                                             │
│  📊 修改统计: +156字 / -45字 / 修改3处 / 优化5处                            │
│                                                                             │
│  [⏪ 回滚到左侧版本]  [💾 导出差异报告]  [📋 查看修改日志]                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 修改追踪时间线

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📜 修改日志 - 新能源汽车行业深度分析                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  今天 14:30    🤖 AI      对话修改: "优化标题吸引力"                         │
│                └── 修改了标题，增加了数字                                    │
│                                                                             │
│  今天 14:15    👤 我      接受了标注建议 #3                                  │
│                └── ✨ 表达优化: "动力电池市场集中度很高"                      │
│                                                                             │
│  今天 11:30    👤 我      创建了标注 #3                                      │
│                └── ✨ 表达优化 (段落2)                                       │
│                                                                             │
│  今天 11:25    👥 蓝军    创建了标注 #1                                      │
│                └── ⚠️ 事实错误: "数据已过期"                                 │
│                                                                             │
│  今天 10:00    🤖 AI      生成初稿 (v1)                                      │
│                └── Stage 2 研究完成，进入 Stage 3                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 技术架构

### 4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (React + TypeScript)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  文稿编辑器       │  │   对话面板        │  │  版本管理器       │          │
│  │  - 文本高亮       │  │   - ChatInput    │  │  - Diff视图       │          │
│  │  - 批注渲染       │  │   - MessageList  │  │  - Timeline       │          │
│  │  - 工具栏         │  │   - ContextAware │  │  - Stats          │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ WebSocket (实时推送)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API 层 (Fastify)                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ /annotations     │  │ /chat            │  │ /versions        │          │
│  │ - POST 创建      │  │ - POST 发送      │  │ - GET 列表       │          │
│  │ - GET 查询       │  │ - GET 历史       │  │ - POST 创建      │          │
│  │ - PUT 更新       │  │ - DELETE 清空    │  │ - GET diff       │          │
│  │ - DELETE 删除    │  │                  │  │ - POST 回滚      │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         服务层 (Services)                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ AnnotationSvc    │  │ ChatSvc          │  │ VersionSvc       │          │
│  │ - CRUD操作       │  │ - 指令解析       │  │ - 版本管理       │          │
│  │ - 状态管理       │  │ - LLM调用        │  │ - Diff算法       │          │
│  │ - 权限检查       │  │ - 上下文管理     │  │ - 回滚逻辑       │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
            ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│   PostgreSQL         │                    │   LLM Provider       │
│   - drafts           │                    │   - Claude API       │
│   - annotations      │                    │   - Kimi API         │
│   - chat_sessions    │                    │   - OpenAI API       │
│   - versions         │                    │                      │
│   - change_logs      │                    │   功能:              │
│                      │                    │   - 指令理解         │
│   功能:              │                    │   - 内容改写         │
│   - 数据持久化       │                    │   - 建议生成         │
│   - 版本存储         │                    │   - 问答支持         │
└──────────────────────┘                    └──────────────────────┘
```

### 4.2 核心模块设计

#### 4.2.1 标注系统 (Annotation System)

```typescript
// 核心类设计
class AnnotationService {
  // 创建标注
  async createAnnotation(data: CreateAnnotationDTO): Promise<Annotation>;

  // 获取标注列表（支持过滤）
  async getAnnotations(
    draftId: string,
    filters?: AnnotationFilters
  ): Promise<Annotation[]>;

  // 接受标注建议（应用修改）
  async acceptAnnotation(
    annotationId: string
  ): Promise<AppliedChange>;

  // 拒绝标注建议
  async rejectAnnotation(
    annotationId: string,
    reason?: string
  ): Promise<Annotation>;
}

// 标注渲染引擎
class AnnotationRenderer {
  // 在编辑器中渲染标注高亮
  renderHighlights(
    content: string,
    annotations: Annotation[]
  ): HighlightedContent;

  // 计算标注位置（处理文本变化后的位置映射）
  recalculatePositions(
    oldContent: string,
    newContent: string,
    annotations: Annotation[]
  ): Annotation[];
}
```

#### 4.2.2 对话修改 (Conversational Editing)

```typescript
// 对话服务
class ChatService {
  // 发送消息并获取修改建议
  async sendMessage(
    draftId: string,
    message: ChatMessage
  ): Promise<ChatResponse>;

  // 获取对话历史
  async getHistory(draftId: string): Promise<ChatMessage[]>;

  // 清空对话
  async clearHistory(draftId: string): Promise<void>;

  // 应用修改
  async applyModification(
    draftId: string,
    modification: Modification
  ): Promise<Draft>;
}

// 指令解析器
class InstructionParser {
  // 解析用户指令
  parse(instruction: string): ParsedInstruction;

  // 支持的指令类型
  supportedPatterns = [
    'REPLACE_DATA',      // 替换数据
    'ENHANCE_ARGUMENT',  // 增强论证
    'CHANGE_STYLE',      // 改变风格
    'COMPRESS',          // 压缩字数
    'ADD_CONTENT',       // 添加内容
    'REMOVE_CONTENT',    // 删除内容
  ];
}

// LLM调用封装
class LLMClient {
  // 生成修改建议
  async generateModification(
    content: string,
    instruction: string,
    context: Context
  ): Promise<Modification>;

  // 回答用户问题
  async answerQuestion(
    content: string,
    question: string
  ): Promise<Answer>;

  // 主动建议
  async generateSuggestions(
    content: string,
    triggerPoint: string
  ): Promise<Suggestion[]>;
}
```

#### 4.2.3 版本管理 (Version Control)

```typescript
// 版本服务
class VersionService {
  // 创建新版本
  async createVersion(
    draftId: string,
    data: CreateVersionDTO
  ): Promise<Version>;

  // 对比版本差异
  async compareVersions(
    draftId: string,
    version1: string,
    version2: string
  ): Promise<DiffResult>;

  // 回滚到指定版本
  async restoreVersion(
    draftId: string,
    versionId: string
  ): Promise<Draft>;

  // 获取版本列表
  async getVersions(draftId: string): Promise<Version[]>;
}

// Diff算法
class DiffEngine {
  // 计算文本差异
  computeDiff(
    oldText: string,
    newText: string
  ): DiffChunk[];

  // 渲染差异视图
  renderDiffView(diff: DiffChunk[]): DiffView;

  // 统计修改信息
  computeStats(diff: DiffChunk[]): DiffStats;
}
```

#### 4.2.4 修改追踪 (Change Tracking)

```typescript
// 追踪服务
class ChangeTrackingService {
  // 记录修改
  async logChange(data: ChangeLogDTO): Promise<ChangeLog>;

  // 获取修改历史
  async getChangeLogs(
    draftId: string,
    options?: LogOptions
  ): Promise<ChangeLog[]>;

  // 生成时间线视图
  async getTimeline(draftId: string): Promise<Timeline>;

  // 撤销最近修改
  async undoLastChange(draftId: string): Promise<Draft>;
}
```

### 4.3 数据流图

```
用户选中文本
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  标注工具栏  │───▶│  创建标注    │───▶│  保存到DB    │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                             │
┌─────────────┐    ┌─────────────┐          │
│  渲染高亮    │◀───│  返回标注ID  │◀─────────┘
└─────────────┘    └─────────────┘

用户发送对话指令
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  指令解析    │───▶│  LLM生成修改 │───▶│  预览修改    │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                             │
用户确认                                     │
    │                                        │
    ▼                                        │
┌─────────────┐    ┌─────────────┐          │
│  应用修改    │◀───│  更新文稿    │◀─────────┘
└──────┬──────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌─────────────┐
│  创建新版本  │───▶│  记录修改日志│
└─────────────┘    └─────────────┘
```

### 4.4 关键技术选型

| 技术领域 | 选型 | 理由 |
|---------|------|------|
| 文本编辑器 | Slate.js | 支持自定义标注、良好的React集成 |
| Diff算法 | diff-match-patch | Google出品，行级/字符级差异 |
| WebSocket | Socket.io | 实时协作、心跳检测 |
| 状态管理 | Zustand | 轻量、TypeScript友好 |
| LLM调用 | 自研Router | 支持Claude/Kimi/OpenAI切换 |

---

## 5. API 接口

### 5.1 标注相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/drafts/:id/annotations` | GET | 获取所有标注 |
| `/api/v1/drafts/:id/annotations` | POST | 创建标注 |
| `/api/v1/drafts/:id/annotations/:annoId` | PUT | 更新标注 |
| `/api/v1/drafts/:id/annotations/:annoId` | DELETE | 删除标注 |
| `/api/v1/drafts/:id/annotations/:annoId/accept` | POST | 接受标注建议 |
| `/api/v1/drafts/:id/annotations/:annoId/reject` | POST | 拒绝标注建议 |

### 5.2 对话修改

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/drafts/:id/chat` | POST | 发送修改指令 |
| `/api/v1/drafts/:id/chat/history` | GET | 获取对话历史 |
| `/api/v1/drafts/:id/chat/clear` | DELETE | 清空对话 |

### 5.3 版本管理

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/v1/drafts/:id/versions` | GET | 获取版本列表 |
| `/api/v1/drafts/:id/versions/:versionId` | GET | 获取指定版本 |
| `/api/v1/drafts/:id/versions/:versionId/diff` | GET | 对比版本差异 |
| `/api/v1/drafts/:id/versions/:versionId/restore` | POST | 回滚到指定版本 |

---

## 6. 数据库 Schema

```sql
-- 标注表
CREATE TABLE draft_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id),
  version_id UUID REFERENCES draft_versions(id),
  type VARCHAR(50) NOT NULL, -- error, logic, optimize, add, delete
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  comment TEXT,
  suggestion TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
  created_by VARCHAR(50) NOT NULL, -- user, ai, blueteam
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 对话修改记录
CREATE TABLE draft_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id),
  version_id UUID REFERENCES draft_versions(id),
  messages JSONB NOT NULL DEFAULT '[]',
  context_range JSONB, -- { start: 100, end: 500 }
  created_at TIMESTAMP DEFAULT NOW()
);

-- 修改日志
CREATE TABLE draft_change_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id),
  version_from UUID,
  version_to UUID,
  change_type VARCHAR(50) NOT NULL, -- annotation, chat, manual
  change_summary TEXT,
  changes_detail JSONB,
  changed_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. 配置选项

### 7.1 Stage 3 新增配置

```typescript
interface Stage3Config {
  // 原有配置
  writingStyle: string;
  targetLength: string;
  enableBlueTeam: boolean;

  // v4.2 新增配置

  // 标注系统
  enableAnnotation: boolean;              // 启用标注
  annotationTypes: string[];              // 启用的标注类型
  autoSuggestOnSelect: boolean;           // 选中文本自动建议

  // 对话修改
  enableConversationalEdit: boolean;      // 启用对话修改
  conversationMode: 'instruction' | 'qa' | 'suggest'; // 默认模式
  contextWindowSize: number;              // 上下文窗口（字符数）
  maxConversationRounds: number;          // 最大对话轮数

  // 版本管理
  autoSaveVersion: boolean;               // 自动保存版本
  autoSaveInterval: number;               // 自动保存间隔（分钟）
  maxVersions: number;                    // 最大保留版本数

  // 修改追踪
  trackChanges: boolean;                  // 追踪修改
  showChangeHistory: boolean;             // 显示修改历史
}
```

### 7.2 默认配置

```javascript
const defaultStage3Config = {
  // ... 原有配置

  // v4.2 新增
  enableAnnotation: true,
  annotationTypes: ['error', 'logic', 'optimize', 'add', 'delete'],
  autoSuggestOnSelect: true,

  enableConversationalEdit: true,
  conversationMode: 'instruction',
  contextWindowSize: 2000,
  maxConversationRounds: 10,

  autoSaveVersion: true,
  autoSaveInterval: 5,
  maxVersions: 20,

  trackChanges: true,
  showChangeHistory: true,
};
```

---

## 8. 测试计划

| 模块 | 测试数 | 说明 |
|------|--------|------|
| 标注系统 | 12 | 创建、更新、删除、接受、拒绝 |
| 对话修改 | 15 | 指令解析、上下文感知、多轮对话 |
| 版本对比 | 8 | 差异计算、高亮显示、回滚 |
| 修改追踪 | 6 | 日志记录、时间线、统计 |
| 集成测试 | 10 | 端到端工作流 |
| **总计** | **51** | |

---

## 9. 4.X 版本路线图

| 版本 | 功能 | 说明 |
|------|------|------|
| **v4.0** | 智能审核与合规 | 敏感词、广告法、版权检测 |
| **v4.1** | 智能流水线编排 | 条件触发、动态路由 |
| **v4.2** | Stage 3 文稿生成增强 | ⭐ 本版本：标注修改 + 对话修改 |
| **v4.3** | 内容效果预测 | 传播潜力、最佳发布时间 |
| **v4.4** | 智能助手Copilot | 自然语言配置、主动建议 |
| **v4.5** | 多语言国际化 | 跨语言内容生成与适配 |

---

**状态**: 需求冻结中
**下一步**: 架构设计 → 开发实现 → 测试验证
