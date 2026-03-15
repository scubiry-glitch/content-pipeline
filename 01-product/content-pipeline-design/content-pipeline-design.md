# 内容生产流水线设计文档

> 版本：v1.0
> 日期：2025年
> 适用范围：《居住金融科技周报》及衍生内容产品

---

## 第一部分：需求分析

### 1.1 业务背景

**现状问题**：
- 内容生产依赖个人能力，缺乏标准化流程
- 研究、写作、排版、发布环节割裂，效率低下
- 同一内容无法快速生成多形态产品（图文/视频/音频）
- 质量把控依赖主观判断，缺乏客观标准
- 历史内容资产难以复用和检索

**目标状态**：
- 建立标准化、可复用的内容生产流水线
- 实现"一源多用"：一次研究，多形态输出
- 引入批判性审视机制，提升内容质量
- 建立可积累的内容资产库
- 支持自动化/半自动化的内容发布

### 1.2 用户需求

#### 1.2.1 内容消费者需求

| 用户类型 | 核心需求 | 内容偏好 | 消费场景 |
|---------|---------|---------|---------|
| 金融机构从业者 | 深度洞察、投资参考 | 数据详实、逻辑严密 | 工作日通勤、午休 |
| 居住企业管理者 | 行业趋势、对标分析 | 案例丰富、可操作性强 | 周末深度阅读 |
| 政策研究者 | 宏观视野、国际对比 | 政治经济学视角 | 研究工作时间 |
| 个人投资者 | 投资建议、风险提示 | 通俗易懂、有结论 | 碎片时间 |

#### 1.2.2 内容生产者需求

| 角色 | 核心痛点 | 期望功能 |
|-----|---------|---------|
| 研究员 | 数据采集耗时、分析工具分散 | 一站式研究工作台 |
| 撰稿人 | 结构 designing 困难、风格不统一 | 智能大纲生成、风格检查 |
| 编辑 | 多平台格式转换繁琐 | 一键多态转换 |
| 运营 | 发布时间优化难、数据追踪散 | 智能排期、数据看板 |

### 1.3 功能需求

#### 1.3.1 核心功能（MVP）

**F1 - 选题策划**
- 热点事件监控与关联分析
- 选题优先级自动评分
- 大纲智能生成

**F2 - 深度研究**
- 多源数据采集与清洗
- 结构化数据分析
- 国际经验自动对比
- 洞察自动提炼

**F3 - 文稿生成**
- 三层穿透结构自动生成
- 风格一致性检查
- 蓝军提问自动生成

**F4 - 多态转换**
- Markdown → 信息图（HTML/SVG）
- Markdown → 执行摘要
- Markdown → PPT

**F5 - 自动发布**
- 多平台内容适配
- 定时发布
- 基础数据追踪

#### 1.3.2 扩展功能（Future）

**F6 - 视频生成**
- 文本 → 视频脚本
- 自动配图/配视频素材
- AI配音

**F7 - 音频生成**
- 文本 → 播客脚本
- TTS配音
- 背景音乐合成

**F8 - 智能交互**
- 读者问答自动回复
- 评论区情感分析
- 个性化推荐

#### 1.3.3 高级功能（Advanced）

**F9 - 智能素材库管理**
- 自动标签生成（NLP提取关键词、主题分类）
- 质量权重自动评估（来源可信度、数据完整性、时效性）
- 引用权重人工设定（核心数据 vs 辅助参考）
- 智能检索降噪（基于权重排序、相关度过滤）

**F10 - 知识图谱构建**
- 选题阶段自动抽取实体关系
- 实体链接与消歧（人名、机构、政策、指标）
- 关系推理与补全
- 图谱可视化与交互探索
- 支持离线异步构建（应对计算量）

**F11 - 多模型底座**
- Agent级模型配置（不同Agent调用不同模型）
- 统一调用封装（标准接口适配多厂商API）
- 技能路由（文生图、图生图、文生视频等）
- 场景感知（根据任务类型自动选择最优模型）
- 故障切换与降级策略

### 1.4 非功能需求

#### 1.4.1 性能需求

| 指标 | 要求 | 说明 |
|-----|------|------|
| 选题生成 | < 5分钟 | 从指令到完整选题计划 |
| 研究分析 | < 30分钟 | 数据采集+基础分析 |
| 文稿生成 | < 10分钟 | 18000字初稿 |
| 多态转换 | < 15分钟 | 信息图+摘要+PPT |
| 并发处理 | 支持3个任务并行 | 多选题同时推进 |

#### 1.4.2 质量需求

| 指标 | 要求 | 验证方式 |
|-----|------|---------|
| 数据准确率 | > 95% | 人工抽检 |
| 可读性评分 | Flesch 40-60 | 自动检测 |
| 风格一致性 | > 90% | 与样本文本相似度 |
| 蓝军问题覆盖 | > 80% | 专家评审 |

#### 1.4.3 安全需求

- 敏感数据本地存储，不上云
- API密钥分级管理
- 内容发布前人工确认（关键节点）
- 操作日志完整记录

---

## 第二部分：技术架构

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              内容生产流水线 v1.0                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         应用层 (Application)                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ 选题系统  │ │ 研究系统  │ │ 写作系统  │ │ 转换系统  │ │ 发布系统  │   │   │
│  │  │  (Web)   │ │  (Web)   │ │  (Web)   │ │  (Web)   │ │  (Web)   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         服务层 (Service)                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Planner  │ │Researcher│ │  Writer  │ │Converter │ │ Publisher│   │   │
│  │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      Master Agent (总调度)                       │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         能力层 (Skills)                              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │热点分析  │ │数据采集  │ │大纲生成  │ │信息图    │ │平台适配  │   │   │
│  │  │竞品分析  │ │数据分析  │ │文稿生成  │ │PPT生成   │ │定时发布  │   │   │
│  │  │选题评分  │ │洞察提炼  │ │蓝军提问  │ │视频生成  │ │数据追踪  │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         数据层 (Data)                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ 知识库   │ │ 选题池   │ │ 研究数据 │ │ 内容资产 │ │ 发布数据 │   │   │
│  │  │(向量库)  │ │(关系库)  │ │(时序库)  │ │(文件系统)│ │(日志库)  │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块详细设计

#### 2.2.1 Master Agent（总调度模块）

**职责**：
- 接收用户指令，解析任务类型
- 分解任务，调度子Agent执行
- 监控执行进度，处理异常
- 质量把关，最终交付

**输入**：
```typescript
interface UserRequest {
  type: 'newsletter' | 'research' | 'infographic' | 'video' | 'audio';
  topic?: string;              // 选题（可选）
  sourceMaterial?: string[];   // 源材料路径
  targetFormats: FormatType[]; // 目标格式
  deadline?: Date;             // 截止时间
  priority: 'low' | 'medium' | 'high';
}
```

**输出**：
```typescript
interface ProductionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'partial';
  outputs: {
    format: FormatType;
    path: string;
    url?: string;
  }[];
  metrics: {
    startTime: Date;
    endTime: Date;
    wordCount?: number;
    dataSources?: number;
  };
  logs: ExecutionLog[];
}
```

**核心算法**：
```python
def orchestrate(request: UserRequest) -> ProductionResult:
    # 1. 任务分解
    subtasks = decompose(request)

    # 2. 并行/串行调度
    execution_plan = schedule(subtasks)

    # 3. 执行监控
    for task in execution_plan:
        result = execute_with_monitoring(task)
        if result.quality < threshold:
            result = retry_or_escalate(task)

    # 4. 质量把关
    final_output = quality_gate(aggregate_results())

    return final_output
```

#### 2.2.2 Planner Agent（选题策划模块）

**技术栈**：
- Python + FastAPI
- 爬虫框架：Scrapy
- NLP：BERT/ERNIE 用于热点相关性分析
- 数据库：PostgreSQL（选题库）

**核心功能实现**：

```python
class PlannerAgent:
    def generate_topic_plan(self, hint: str) -> TopicPlan:
        # 1. 热点分析
        hot_topics = self.hot_analyzer.get_recent(days=7)

        # 2. 竞品分析
        competitive_landscape = self.competition_analyzer.analyze(hot_topics)

        # 3. 选题评分
        scored_topics = []
        for topic in hot_topics:
            score = self.scoring_model.calculate(
                timeliness=topic.trend_score * 0.3,
                depth_value=self.assess_depth_potential(topic) * 0.25,
                reader_interest=self.predict_interest(topic) * 0.25,
                differentiation=self.assess_uniqueness(topic, competitive_landscape) * 0.2
            )
            scored_topics.append((topic, score))

        # 4. 选择最优选题
        selected_topic = max(scored_topics, key=lambda x: x[1])

        # 5. 生成大纲
        outline = self.outline_generator.generate(
            topic=selected_topic,
            structure_type='three_layer',  # 三层穿透
            target_length=18000
        )

        return TopicPlan(
            topic=selected_topic,
            outline=outline,
            data_requirements=self.extract_data_needs(outline),
            estimated_time=self.estimate_time(outline)
        )
```

#### 2.2.3 Research Agent（研究分析模块）

**技术栈**：
- Python + Jupyter Notebook（交互式研究）
- 数据采集：Playwright（动态页面）+ requests
- 数据处理：Pandas + NumPy
- 可视化：Matplotlib + Plotly
- 知识图谱：Neo4j

**数据流水线**：
```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 数据采集  │ → │ 数据清洗  │ → │ 数据分析  │ → │ 洞察生成  │
│          │   │          │   │          │   │          │
│ 多源API   │   │ 去重     │   │ 描述统计  │   │ 模式识别  │
│ 爬虫     │   │ 格式化   │   │ 回归分析  │   │ 异常检测  │
│ 文件导入  │   │ 校验     │   │ 时序预测  │   │ 对比分析  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**核心代码结构**：
```python
class ResearchAgent:
    def __init__(self):
        self.collectors = {
            'government': GovernmentDataCollector(),
            'industry': IndustryReportCollector(),
            'academic': AcademicPaperCollector(),
            'expert': ExpertInterviewCollector()
        }
        self.analyzer = DataAnalyzer()
        self.insight_extractor = InsightExtractor()

    def conduct_research(self, data_requirements: DataRequirements) -> ResearchReport:
        # 1. 并行采集
        raw_data = {}
        with ThreadPoolExecutor() as executor:
            futures = {
                source: executor.submit(collector.collect, req)
                for source, (collector, req) in zip(self.collectors.items(), data_requirements)
            }
            for source, future in futures.items():
                raw_data[source] = future.result()

        # 2. 数据清洗
        clean_data = self.cleaner.clean(raw_data)

        # 3. 分析
        analysis_results = self.analyzer.analyze(clean_data)

        # 4. 洞察提炼
        insights = self.insight_extractor.extract(
            data=analysis_results,
            framework=['反常现象', '深层原因', '趋势判断', '行动建议']
        )

        return ResearchReport(
            data_package=clean_data,
            analysis=analysis_results,
            insights=insights,
            visualizations=self.generate_charts(analysis_results)
        )
```

#### 2.2.4 Writer Agent（文稿生成模块）

**技术栈**：
- Python + LangChain
- LLM：Claude/GPT-4（长文本生成）
- 模板引擎：Jinja2
- 文档处理：Markdown-it

**三层穿透结构生成器**：
```python
class ThreeLayerStructureGenerator:
    def generate(self, core_proposition: str, research_data: ResearchReport) -> Document:
        document = Document()

        # 第一层：宏观视野
        document.add_section(
            title="宏观视野",
            content=self.generate_macro_layer(
                proposition=core_proposition,
                data=research_data.policy_data,
                international_cases=research_data.cases
            ),
            subsections=[
                "本期命题",
                "历史脉络",
                "政策逻辑",
                "国际对标"
            ]
        )

        # 第二层：中观解剖
        document.add_section(
            title="中观解剖",
            content=self.generate_meso_layer(
                structural_data=research_data.structural_data,
                flow_analysis=research_data.flow_analysis
            ),
            subsections=[
                "模式对比",
                "资金流向",
                "收益分配",
                "参与者画像"
            ]
        )

        # 第三层：微观行动
        document.add_section(
            title="微观行动",
            content=self.generate_micro_layer(
                valuation_model=research_data.valuation,
                risk_assessment=research_data.risks
            ),
            subsections=[
                "价值评估",
                "风险雷达",
                "投资策略",
                "政策建议"
            ]
        )

        return document
```

**蓝军提问生成器**：
```python
class BlueTeamQuestionGenerator:
    EXPERTS = {
        'huang_qifan': {
            'perspective': '政治经济学',
            'focus_areas': ['宏观格局', '激励机制', '制度设计'],
            'question_templates': [
                "你的{conclusion}是否过于{adjective}？",
                "{problem}的解决方案是什么？",
                "你对{issue}的分析，是否触及了{deep_issue}？"
            ]
        },
        'meng_xiaosu': {
            'perspective': '实操经验',
            'focus_areas': ['市场判断', '政策解读', '投资者教育'],
            'question_templates': [
                "你对{issue}的担忧，是否有{solution}？",
                "市场规模预测是否过于{adjective}？",
                "散户占比低的{solution}是什么？"
            ]
        }
    }

    def generate_questions(self, draft: Document, expert: str) -> List[Question]:
        expert_config = self.EXPERTS[expert]

        # 1. 分析文稿内容
        content_analysis = self.analyze_content(draft)

        # 2. 识别潜在问题点
        weak_points = self.identify_weak_points(content_analysis, expert_config['focus_areas'])

        # 3. 生成针对性问题
        questions = []
        for point in weak_points:
            template = random.choice(expert_config['question_templates'])
            question = template.format(**point)
            questions.append(Question(
                text=question,
                category=point['category'],
                severity=point['severity']
            ))

        return questions
```

#### 2.2.5 Converter Agent（多态转换模块）

**技术栈**：
- 信息图：D3.js + Chart.js + Puppeteer（截图）
- PPT：python-pptx
- 视频：FFmpeg + 剪映API
- 音频：Azure Speech SDK / 讯飞API

**信息图生成器**：
```python
class InfographicGenerator:
    CHART_TYPES = {
        'trend': ['line', 'area'],
        'comparison': ['bar', 'radar'],
        'composition': ['pie', 'donut', 'treemap'],
        'distribution': ['scatter', 'heatmap'],
        'flow': ['sankey', 'funnel']
    }

    def generate(self, markdown_content: str, chart_specs: List[ChartSpec]) -> Infographic:
        # 1. 提取数据
        data = self.data_extractor.extract(markdown_content)

        # 2. 选择图表类型
        charts = []
        for spec in chart_specs:
            chart_type = self.recommend_chart_type(spec.data_type, spec.purpose)
            chart = self.render_chart(data[spec.source], chart_type, spec.style)
            charts.append(chart)

        # 3. 布局排版
        layout = self.layout_engine.arrange(
            charts=charts,
            template='professional',
            brand_colors=['#1e3c72', '#667eea', '#764ba2']
        )

        # 4. 渲染输出
        html = self.template_engine.render('infographic.html', layout=layout)

        # 5. 截图生成静态图
        png = self.screenshot(html)

        return Infographic(html=html, png=png, svg=self.export_svg(html))
```

#### 2.2.6 SmartAssetLibrary Agent（智能素材库模块）

**职责**：管理研究素材的全生命周期，支持智能检索与降噪

**核心功能**：

```python
class SmartAssetLibrary:
    def __init__(self):
        self.tag_generator = AutoTagGenerator()
        self.quality_evaluator = QualityEvaluator()
        self.reference_manager = ReferenceManager()
        self.search_engine = WeightedSearchEngine()

    def ingest_asset(self, asset: RawAsset) -> ManagedAsset:
        """素材入库流程"""

        # 1. 自动标签生成
        tags = self.tag_generator.generate(
            content=asset.content,
            methods=['keyword_extraction', 'topic_modeling', 'entity_recognition']
        )
        # 输出：['保租房REITs', '财政政策', '收益率', '2025'] + 置信度分数

        # 2. 质量权重自动评估
        quality_score = self.quality_evaluator.evaluate(
            source_credibility=self.check_source_tier(asset.source),  # 政府>机构>媒体
            data_completeness=self.check_completeness(asset),         # 字段完整度
            freshness=self.calculate_freshness(asset.date),           # 时效性
            cross_validation=self.check_cross_references(asset)       # 交叉验证
        )
        # 输出：0-1之间的质量权重

        # 3. 引用权重（人工设定或继承）
        reference_weight = asset.user_defined_weight or self.infer_weight(asset)
        # 核心数据=1.0, 辅助参考=0.5, 背景信息=0.3

        # 4. 计算综合权重
        combined_weight = self.calculate_combined_weight(
            quality=quality_score,      # 40%
            reference=reference_weight, # 40%
            usage_count=asset.citations # 20% 被引用次数
        )

        return ManagedAsset(
            id=generate_uuid(),
            content=asset.content,
            tags=tags,
            quality_weight=quality_score,
            reference_weight=reference_weight,
            combined_weight=combined_weight,
            embeddings=self.generate_embeddings(asset.content),
            metadata=asset.metadata
        )

    def smart_search(self, query: str, filters: SearchFilters) -> List[SearchResult]:
        """智能检索降噪"""

        # 1. 语义检索
        query_embedding = self.embed(query)
        semantic_results = self.vector_search(query_embedding, top_k=100)

        # 2. 基于权重的重排序
        weighted_results = self.rerank_by_weights(
            semantic_results,
            min_quality=filters.min_quality,      # 过滤低质量
            min_reference=filters.min_reference,  # 过滤低引用
            boost_tags=filters.priority_tags      # 标签加权
        )

        # 3. 多样性控制（避免同源信息过载）
        diverse_results = self.ensure_diversity(
            weighted_results,
            max_per_source=2,
            max_per_topic=5
        )

        # 4. 时效性衰减（旧数据降权）
        time_decayed = self.apply_time_decay(diverse_results, half_life_days=365)

        return time_decayed[:filters.top_k]
```

**数据模型扩展**：

```sql
-- 素材库主表
CREATE TABLE asset_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    content_type VARCHAR(50), -- text, image, pdf, url

    -- 自动标签（JSONB数组）
    auto_tags JSONB DEFAULT '[]',
    -- 格式：[{"tag": "保租房REITs", "confidence": 0.95, "method": "NER"}, ...]

    -- 质量评估
    quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
    quality_factors JSONB,
    -- 格式：{"source_credibility": 0.9, "completeness": 0.8, "freshness": 0.95}

    -- 引用权重（人工设定）
    reference_weight FLOAT DEFAULT 0.5 CHECK (reference_weight >= 0 AND reference_weight <= 1),
    -- 1.0=核心数据, 0.5=辅助参考, 0.3=背景信息

    -- 综合权重（动态计算）
    combined_weight FLOAT GENERATED ALWAYS AS (
        quality_score * 0.4 + reference_weight * 0.4 + COALESCE(usage_score, 0) * 0.2
    ) STORED,

    -- 向量嵌入
    embedding VECTOR(1536),  -- OpenAI text-embedding-3-large

    -- 使用统计
    citation_count INT DEFAULT 0,
    last_used_at TIMESTAMP,

    source VARCHAR(255),
    source_url VARCHAR(500),
    publish_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 标签索引表（加速标签检索）
CREATE TABLE asset_tags (
    asset_id UUID REFERENCES asset_library(id),
    tag VARCHAR(100),
    confidence FLOAT,
    method VARCHAR(50), -- NER, LDA, KeyBERT
    PRIMARY KEY (asset_id, tag)
);

-- 素材引用关系表（构建引用网络）
CREATE TABLE asset_citations (
    citing_asset_id UUID REFERENCES asset_library(id),
    cited_asset_id UUID REFERENCES asset_library(id),
    citation_context TEXT, -- 引用时的上下文
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (citing_asset_id, cited_asset_id)
);

-- 创建向量索引（IVFFlat适用于高维向量）
CREATE INDEX idx_asset_embedding ON asset_library
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 创建权重复合索引（支持排序）
CREATE INDEX idx_asset_combined_weight ON asset_library(combined_weight DESC)
WHERE combined_weight > 0.5;  -- 只索引高质量素材
```

**技术选型**：

| 功能 | 技术 | 选型理由 |
|-----|------|---------|
| **向量数据库** | pgvector (PostgreSQL扩展) | 与主库统一，无需额外运维 |
| **标签生成** | KeyBERT + spaCy NER | 无监督关键词提取 + 命名实体识别 |
| **主题建模** | BERTopic | 基于Transformer的现代主题模型 |
| **嵌入模型** | text-embedding-3-large | 1536维，性价比高 |
| **质量评估** | 规则引擎 + 轻量ML | 可解释性强，易于调整 |

---

#### 2.2.7 KnowledgeGraph Agent（知识图谱构建模块）

**职责**：从选题阶段开始构建领域知识图谱，支持实体关系抽取与推理

**架构设计**：

```
┌─────────────────────────────────────────────────────────────────┐
│                    知识图谱构建流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  输入层                                                          │
│  ├── 选题文本（"REITs替代土地财政"）                             │
│  ├── 研报文档（242份历史研报）                                   │
│  ├── 政策文件（住建部、证监会文件）                              │
│  └── 实时数据（市场数据、新闻）                                  │
│                              │                                   │
│                              ▼                                   │
│  抽取层（NLP Pipeline）                                          │
│  ├── 实体识别（NER）                                             │
│  │   └── 机构：住建部、证监会、地方政府                          │
│  │   └── 政策：保租房REITs、土地财政、公积金                     │
│  │   └── 指标：土地出让金、收益率、分派率                        │
│  │   └── 地点：北京、上海、深圳                                  │
│  │                                                              │
│  ├── 关系抽取（RE）                                              │
│  │   └── 住建部 --发布--> 保租房REITs政策                        │
│  │   └── 土地出让金 --下降--> 地方财政压力                        │
│  │   └── REITs --替代--> 土地财政                                │
│  │                                                              │
│  └── 属性抽取（AE）                                              │
│      └── 北京保障房REITs {收益率: 3.5%, 规模: 13亿}              │
│                              │                                   │
│                              ▼                                   │
│  消歧层（Entity Linking）                                        │
│  ├── 实体对齐："住建部" = "住房和城乡建设部"                     │
│  ├── 实体消歧："北京"（城市 vs 公司名）                          │
│  └── 共指消解："它" -> "REITs"                                   │
│                              │                                   │
│                              ▼                                   │
│  存储层（Graph DB）                                              │
│  ├── 实体节点（Node）                                            │
│  │   └── (:Policy {name: "保租房REITs", date: "2022-05"})        │
│  ├── 关系边（Relationship）                                      │
│  │   └── (:City)-[:IMPLEMENTED]->(:Policy)                      │
│  └── 时序快照（支持版本追溯）                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**核心实现**：

```python
class KnowledgeGraphBuilder:
    def __init__(self):
        self.ner_model = AutoModel.from_pretrained("shibing624/macbert4cner")  # 中文NER
        self.re_model = AutoModel.from_pretrained("liebespaar93/chinese-re")    # 关系抽取
        self.graph_db = Neo4jGraph()
        self.vector_store = ZepVectorStore()  # Zep用于长期记忆

    def build_from_topic(self, topic: str, materials: List[Document]) -> KnowledgeGraph:
        """从选题构建知识图谱"""

        # 1. 文档分块与向量化
        chunks = self.chunk_documents(materials)

        # 2. 实体抽取
        all_entities = []
        for chunk in chunks:
            entities = self.ner_model.extract(
                chunk.text,
                entity_types=['ORG', 'POLICY', 'INDICATOR', 'LOC', 'TIME']
            )
            all_entities.extend(entities)

        # 3. 实体聚类与消歧
        canonical_entities = self.cluster_and_disambiguate(all_entities)
        # 使用向量相似度聚类，人工规则消歧

        # 4. 关系抽取
        relations = []
        for chunk in chunks:
            rels = self.re_model.extract(
                chunk.text,
                relation_types=['发布', '实施', '影响', '替代', '包含']
            )
            relations.extend(rels)

        # 5. 构建图谱
        graph = self.construct_graph(
            entities=canonical_entities,
            relations=relations,
            source_topic=topic
        )

        # 6. 存入Neo4j
        self.graph_db.merge(graph)

        # 7. 存入Zep（长期记忆，支持语义检索）
        self.vector_store.add(
            documents=chunks,
            metadata={"topic": topic, "graph_id": graph.id}
        )

        return graph

    def query_graph(self, query: str, mode: str = "hybrid") -> QueryResult:
        """图谱查询（支持多种模式）"""

        if mode == "exact":
            # Cypher精确查询
            return self.graph_db.execute_cypher(query)

        elif mode == "semantic":
            # 向量语义检索
            query_embedding = self.embed(query)
            return self.vector_store.search(query_embedding, top_k=10)

        elif mode == "hybrid":
            # 混合检索：向量召回 + 图谱验证
            candidates = self.vector_store.search(self.embed(query), top_k=20)
            validated = self.graph_db.validate_paths(candidates, query)
            return validated

        elif mode == "reasoning":
            # 关系推理（使用图谱嵌入或规则）
            return self.reasoning_engine.infer(query)

    def async_refresh(self, topic: str = None, full_rebuild: bool = False):
        """异步刷新知识图谱"""

        if full_rebuild:
            # 全量重建（月度/季度执行）
            self.schedule_background_job(
                self.full_rebuild,
                priority='low',
                estimated_time='4h'
            )
        else:
            # 增量更新（每日执行）
            self.schedule_background_job(
                self.incremental_update,
                topic=topic,
                priority='medium',
                estimated_time='30min'
            )
```

**技术选型对比**：

| 方案 | 代表产品 | 优点 | 缺点 | 适用场景 |
|-----|---------|------|------|---------|
| **图数据库** | Neo4j | 原生图存储，Cypher强大 | 学习成本高，扩展性一般 | 复杂关系查询 |
| **向量+图谱** | Zep + Neo4j | 语义+结构双能力 | 架构复杂 | 我们的方案 |
| **RAG增强** | LangChain GraphRAG | 易集成，生态好 | 黑盒，可控性差 | 快速原型 |
| **知识图谱平台** | 自研/Apache Jena | 完全可控 | 开发成本高 | 超大规模 |

**我们的选型：Zep + Neo4j 混合架构**

```
查询流程：
用户问题 → 向量化 → Zep语义检索（Top 20）→
    ↓
获取相关实体ID → Neo4j子图查询（2-hop）→
    ↓
关系路径验证 → 生成答案 + 引用来源
```

**数据模型（Neo4j）**：

```cypher
// 实体节点
(:Entity {
    id: "reits_001",
    name: "保租房REITs",
    type: "Policy",
    aliases: ["保障性租赁住房REITs", " rental REITs"],
    embedding: [...],  // 用于模糊匹配
    created_at: timestamp(),
    updated_at: timestamp()
})

(:Entity {
    id: "city_beijing",
    name: "北京",
    type: "Location",
    properties: {tier: 1, gdp: 4.4e12}
})

// 关系边
(:Entity {name: "住建部"})-[:PUBLISHED {
    date: date("2022-05-27"),
    document: "《关于规范做好保障性租赁住房试点发行REITs有关工作的通知》"
}]->(:Entity {name: "保租房REITs"})

(:Entity {name: "保租房REITs"})-[:SUBSTITUTES {
    degree: "partial",
    evidence: ["土地财政下降41%", "REITs募资150亿"]
}]->(:Entity {name: "土地财政"})

// 时序数据（支持版本控制）
(:Metric {
    name: "土地出让金",
    value: 5.1,
    unit: "万亿",
    year: 2024,
    source: "财政部"
})-[:BELONGS_TO]->(:Entity {name: "土地财政"})
```

**计算资源策略**：

| 任务类型 | 执行模式 | 计算资源 | 频率 |
|---------|---------|---------|------|
| 实时实体抽取 | 同步 | 本地GPU | 每次选题 |
| 批量关系推理 | 异步 | 云端GPU | 每日凌晨 |
| 全量图谱重建 | 离线 | 大数据集群 | 每月 |
| 向量索引更新 | 增量 | 本地CPU | 每小时 |

---

#### 2.2.8 ModelRouter Agent（多模型底座模块）

**职责**：统一封装多厂商模型API，支持Agent级配置和技能路由

**架构设计**：

```
┌─────────────────────────────────────────────────────────────────┐
│                      多模型底座架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     统一接口层 (API Gateway)                │ │
│  │  ─────────────────────────────────────────────────────────  │ │
│  │  标准接口：generate() / embed() / multimodal() / status()   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                   │
│       ┌──────────────────────┼──────────────────────┐            │
│       ▼                      ▼                      ▼            │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐        │
│  │Agent配置│           │技能路由 │           │负载均衡 │        │
│  │管理器   │           │引擎    │           │管理器   │        │
│  └─────────┘           └─────────┘           └─────────┘        │
│       │                      │                      │            │
│       └──────────────────────┼──────────────────────┘            │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      模型适配器层                          │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │ │
│  │  │ Claude  │ │  GPT-4  │ │  Gemini │ │ 文心一言 │        │ │
│  │  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │        │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │ │
│  │  │DALL-E 3 │ │StableDiff│ │  MJ API │ │ 讯飞绘影 │        │ │
│  │  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │        │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      能力封装层 (Skills)                    │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │ 文本生成  │ │ 文生图   │ │ 图生图   │ │ 文生视频 │     │ │
│  │  │ TextGen  │ │ Text2Img │ │ Img2Img  │ │ Text2Vid │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │ 代码生成  │ │ 嵌入向量 │ │ 语音合成 │ │ 语音识别 │     │ │
│  │  │ CodeGen  │ │ Embedding│ │   TTS    │ │   ASR    │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**核心实现**：

```python
class ModelRouter:
    """模型统一路由器"""

    # 模型能力映射表
    MODEL_REGISTRY = {
        # 大语言模型
        "claude-3-opus": {
            "provider": "anthropic",
            "capabilities": ["text_generation", "long_context", "analysis"],
            "context_length": 200000,
            "cost_per_1k_tokens": 0.015,
            "best_for": ["深度研究", "长文生成", "复杂推理"]
        },
        "claude-3-sonnet": {
            "provider": "anthropic",
            "capabilities": ["text_generation", "balanced"],
            "context_length": 200000,
            "cost_per_1k_tokens": 0.003,
            "best_for": ["常规写作", "快速迭代"]
        },
        "gpt-4-turbo": {
            "provider": "openai",
            "capabilities": ["text_generation", "function_calling", "json_mode"],
            "context_length": 128000,
            "cost_per_1k_tokens": 0.01,
            "best_for": ["结构化输出", "工具调用"]
        },
        "gpt-4o": {
            "provider": "openai",
            "capabilities": ["text_generation", "vision", "multimodal"],
            "context_length": 128000,
            "cost_per_1k_tokens": 0.005,
            "best_for": ["多模态任务", "性价比场景"]
        },
        "gemini-pro": {
            "provider": "google",
            "capabilities": ["text_generation", "long_context"],
            "context_length": 1000000,
            "cost_per_1k_tokens": 0.0005,
            "best_for": ["超长文档", "低成本场景"]
        },

        # 图像生成模型
        "dall-e-3": {
            "provider": "openai",
            "capabilities": ["text_to_image"],
            "cost_per_image": 0.04,
            "best_for": ["信息图", "插图"]
        },
        "stable-diffusion-xl": {
            "provider": "stability",
            "capabilities": ["text_to_image", "image_to_image"],
            "cost_per_image": 0.008,
            "best_for": ["风格化图像", "批量生成"]
        },

        # 嵌入模型
        "text-embedding-3-large": {
            "provider": "openai",
            "capabilities": ["embedding"],
            "dimensions": 3072,
            "cost_per_1k_tokens": 0.00013,
            "best_for": ["语义检索", "聚类"]
        },
        "bge-large-zh": {
            "provider": "local",
            "capabilities": ["embedding"],
            "dimensions": 1024,
            "cost_per_1k_tokens": 0,
            "best_for": ["中文检索", "离线场景"]
        },

        # 语音模型
        "azure-tts": {
            "provider": "azure",
            "capabilities": ["tts"],
            "cost_per_1m_chars": 16,
            "best_for": ["中文播客", "新闻播报"]
        },
        "elevenlabs": {
            "provider": "elevenlabs",
            "capabilities": ["tts", "voice_cloning"],
            "cost_per_1k_chars": 0.30,
            "best_for": ["英文播客", "情感表达"]
        }
    }

    # Agent默认配置
    AGENT_DEFAULTS = {
        "PlannerAgent": {
            "default_model": "claude-3-sonnet",
            "fallback_model": "gpt-4o",
            "skills": ["text_generation"],
            "max_tokens": 4000
        },
        "ResearchAgent": {
            "default_model": "claude-3-opus",
            "fallback_model": "gemini-pro",
            "skills": ["text_generation", "long_context", "analysis"],
            "max_tokens": 8000
        },
        "WriterAgent": {
            "default_model": "claude-3-opus",
            "fallback_model": "claude-3-sonnet",
            "skills": ["text_generation", "long_context"],
            "max_tokens": 12000
        },
        "ConverterAgent": {
            "default_model": "gpt-4o",  # 多模态
            "skills": ["text_generation", "vision", "multimodal"],
            "image_model": "dall-e-3",
            "tts_model": "azure-tts",
            "max_tokens": 4000
        },
        "SmartAssetLibrary": {
            "embedding_model": "text-embedding-3-large",
            "tagging_model": "claude-3-haiku",  # 轻量快速
            "fallback_embedding": "bge-large-zh"
        }
    }

    def __init__(self):
        self.adapters = self._init_adapters()
        self.skill_router = SkillRouter()
        self.load_balancer = LoadBalancer()
        self.cost_tracker = CostTracker()

    def generate(
        self,
        agent_name: str,
        prompt: str,
        skill: str = "text_generation",
        context: Dict = None,
        force_model: str = None
    ) -> GenerationResult:
        """
        统一生成接口

        Args:
            agent_name: 调用Agent名称（用于选择默认模型）
            prompt: 提示词
            skill: 所需技能
            context: 额外上下文（温度、最大长度等）
            force_model: 强制使用指定模型（覆盖默认配置）
        """

        # 1. 确定模型
        model = force_model or self.select_model(agent_name, skill)

        # 2. 检查模型状态
        if not self.check_model_health(model):
            model = self.fallback_model(agent_name, model)
            logger.warning(f"Model {model} unhealthy, fallback to {model}")

        # 3. 路由到对应适配器
        adapter = self.adapters[self.MODEL_REGISTRY[model]["provider"]]

        # 4. 执行生成
        start_time = time.time()
        try:
            result = adapter.generate(
                model=model,
                prompt=prompt,
                **self.build_params(context)
            )

            # 5. 记录成本与性能
            self.cost_tracker.log(
                agent=agent_name,
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                latency=time.time() - start_time,
                cost=self.calculate_cost(model, result)
            )

            return result

        except ModelOverloadError:
            # 模型过载，降级处理
            return self.generate_with_degradation(agent_name, prompt, skill)

        except ModelError as e:
            # 模型错误，切换到fallback
            fallback = self.fallback_model(agent_name, model)
            logger.error(f"Model {model} error: {e}, switching to {fallback}")
            return self.generate(agent_name, prompt, skill, context, fallback)

    def select_model(self, agent_name: str, skill: str) -> str:
        """智能模型选择"""

        agent_config = self.AGENT_DEFAULTS[agent_name]

        # 检查技能匹配
        for model_name, model_info in self.MODEL_REGISTRY.items():
            if skill in model_info["capabilities"]:
                if model_name == agent_config.get("default_model"):
                    return model_name

        # 返回Agent默认模型
        return agent_config["default_model"]

    def route_skill(self, skill: str, params: Dict) -> SkillResult:
        """技能路由（多模态任务）"""

        skill_handlers = {
            "text_to_image": self._handle_text_to_image,
            "image_to_image": self._handle_image_to_image,
            "text_to_video": self._handle_text_to_video,
            "text_to_speech": self._handle_tts,
            "embedding": self._handle_embedding
        }

        handler = skill_handlers.get(skill)
        if not handler:
            raise UnsupportedSkillError(f"Skill {skill} not supported")

        return handler(params)

    def _handle_text_to_image(self, params: Dict) -> ImageResult:
        """文生图技能"""
        model = params.get("model", "dall-e-3")
        adapter = self.adapters[self.MODEL_REGISTRY[model]["provider"]]

        return adapter.generate_image(
            prompt=params["prompt"],
            size=params.get("size", "1024x1024"),
            quality=params.get("quality", "standard"),
            style=params.get("style", "vivid")
        )

    def generate_with_degradation(self, agent_name: str, prompt: str, skill: str) -> GenerationResult:
        """降级生成（模型过载时）"""

        degradation_strategies = {
            # 策略1：缩短上下文
            "truncate_context": lambda p: p[:len(p)//2],
            # 策略2：降低输出长度
            "reduce_output": {"max_tokens": 2000},
            # 策略3：切换到更便宜的模型
            "cheaper_model": "gemini-pro"
        }

        # 应用降级策略
        truncated_prompt = degradation_strategies["truncate_context"](prompt)
        cheaper_model = degradation_strategies["cheaper_model"]

        return self.generate(agent_name, truncated_prompt, skill, force_model=cheaper_model)


class SkillRouter:
    """技能路由器 - 将任务路由到正确的模型/服务"""

    SKILL_MATRIX = {
        "深度研究": {
            "models": ["claude-3-opus", "gemini-pro"],
            "required_capabilities": ["long_context", "analysis"],
            "estimated_cost": "high"
        },
        "快速写作": {
            "models": ["claude-3-sonnet", "gpt-4o"],
            "required_capabilities": ["text_generation"],
            "estimated_cost": "medium"
        },
        "信息图生成": {
            "models": ["dall-e-3", "stable-diffusion-xl"],
            "required_capabilities": ["text_to_image"],
            "estimated_cost": "medium"
        },
        "批量嵌入": {
            "models": ["bge-large-zh", "text-embedding-3-large"],
            "required_capabilities": ["embedding"],
            "estimated_cost": "low"
        },
        "播客配音": {
            "models": ["azure-tts", "elevenlabs"],
            "required_capabilities": ["tts"],
            "estimated_cost": "low"
        }
    }

    def route(self, task_description: str, constraints: Dict) -> RoutingDecision:
        """根据任务描述路由到最佳模型组合"""

        # 1. 任务分类
        task_type = self.classify_task(task_description)

        # 2. 获取候选模型
        candidates = self.SKILL_MATRIX[task_type]["models"]

        # 3. 应用约束过滤
        if constraints.get("max_cost"):
            candidates = self.filter_by_cost(candidates, constraints["max_cost"])

        if constraints.get("max_latency"):
            candidates = self.filter_by_latency(candidates, constraints["max_latency"])

        # 4. 选择最优模型
        best_model = self.select_optimal(candidates, task_type)

        return RoutingDecision(
            model=best_model,
            estimated_cost=self.estimate_cost(best_model, task_type),
            estimated_time=self.estimate_time(best_model, task_type),
            fallback=self.get_fallback(best_model)
        )
```

**模型配置YAML示例**：

```yaml
# config/models.yaml
agents:
  ResearchAgent:
    default_model: claude-3-opus
    fallback_chain:
      - gemini-pro
      - claude-3-sonnet
    skills:
      - text_generation
      - long_context
      - analysis
    context_window: 200000
    params:
      temperature: 0.3  # 研究需要确定性
      max_tokens: 8000

  WriterAgent:
    default_model: claude-3-opus
    fallback_chain:
      - claude-3-sonnet
      - gpt-4-turbo
    skills:
      - text_generation
      - long_context
    context_window: 200000
    params:
      temperature: 0.7  # 写作需要一定创造性
      max_tokens: 12000

  ConverterAgent:
    default_model: gpt-4o  # 多模态
    skills:
      - text_generation
      - vision
    multimodal:
      image_generation:
        model: dall-e-3
        fallback: stable-diffusion-xl
        params:
          size: "1024x1024"
          quality: "standard"
      tts:
        model: azure-tts
        voice: "zh-CN-YunxiNeural"
        fallback: elevenlabs

# 成本预算控制
budget_limits:
  daily_usd: 100
  per_task_usd: 10
  alert_threshold: 0.8  # 80%时告警

# 故障转移策略
failover:
  retry_attempts: 3
  retry_delay: 1  # 秒
  circuit_breaker_threshold: 5  # 连续错误5次开启熔断
  circuit_breaker_timeout: 300  # 熔断5分钟后恢复
```

#### 2.2.9 Publisher Agent（自动发布模块）

**技术栈**：
- 公众号：wechaty / itchat
- 即刻：爬虫模拟 / 官方API（如有）
- 知乎：知乎开放平台API
- 邮件：SendGrid / AWS SES

**平台适配器**：
```python
class PlatformAdapter:
    ADAPTERS = {
        'wechat_official': WechatOfficialAdapter(),
        'jike': JikeAdapter(),
        'zhihu': ZhihuAdapter(),
        'newsletter': NewsletterAdapter()
    }

    def adapt_content(self, content: Document, platform: str) -> PlatformContent:
        adapter = self.ADAPTERS[platform]

        # 1. 格式转换
        formatted = adapter.format(content)

        # 2. 敏感词过滤
        filtered = adapter.filter_sensitive_words(formatted)

        # 3. 长度裁剪
        cropped = adapter.crop_to_limit(filtered)

        # 4. 添加平台特定元素
        enhanced = adapter.add_platform_elements(cropped)

        return enhanced

    def schedule_publish(self, content: PlatformContent, platform: str, time: DateTime):
        # 1. 计算最佳发布时间
        optimal_time = self.optimize_timing(platform, time)

        # 2. 加入发布队列
        self.scheduler.schedule(
            task=lambda: self.ADAPTERS[platform].publish(content),
            time=optimal_time
        )
```

### 2.3 数据存储设计

#### 2.3.1 数据模型

```sql
-- 选题表
create table topics (
    id uuid primary key default gen_random_uuid(),
    title varchar(255) not null,
    status varchar(50) default 'draft', -- draft, researching, writing, reviewing, published
    priority integer default 0,
    outline jsonb,
    data_requirements jsonb,
    created_at timestamp default now(),
    updated_at timestamp default now()
);

-- 研究数据表
create table research_data (
    id uuid primary key default gen_random_uuid(),
    topic_id uuid references topics(id),
    source_type varchar(50), -- government, industry, academic, expert
    data jsonb,
    file_paths text[],
    created_at timestamp default now()
);

-- 内容资产表
create table content_assets (
    id uuid primary key default gen_random_uuid(),
    topic_id uuid references topics(id),
    format varchar(50), -- markdown, html, pptx, mp4, mp3
    version varchar(20),
    file_path varchar(500),
    metadata jsonb, -- word_count, reading_time, etc.
    created_at timestamp default now()
);

-- 发布记录表
create table publish_logs (
    id uuid primary key default gen_random_uuid(),
    asset_id uuid references content_assets(id),
    platform varchar(50),
    url varchar(500),
    published_at timestamp,
    metrics jsonb -- reads, shares, comments
);
```

#### 2.3.2 文件存储结构

```
/Users/行业研究/
├── data/                          # 数据库存储
│   ├── postgres/                  # PostgreSQL数据
│   └── neo4j/                     # 知识图谱数据
│
├── storage/                       # 文件存储
│   ├── uploads/                   # 用户上传
│   ├── research/                  # 研究数据
│   │   ├── raw/                   # 原始数据
│   │   ├── processed/             # 清洗后数据
│   │   └── exports/               # 导出数据
│   ├── content/                   # 内容资产
│   │   ├── drafts/                # 草稿
│   │   ├── final/                 # 定稿
│   │   └── archive/               # 归档
│   └── exports/                   # 导出产品
│       ├── infographics/          # 信息图
│       ├── presentations/         # PPT
│       ├── videos/                # 视频
│       └── audios/                # 音频
│
└── cache/                         # 缓存
    ├── search/                    # 搜索结果缓存
    ├── analysis/                  # 分析结果缓存
    └── render/                    # 渲染结果缓存
```

### 2.4 API设计

#### 2.4.1 核心API

```yaml
# 内容生产API
/api/v1/production:
  post:
    summary: 创建内容生产任务
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              type:
                type: string
                enum: [newsletter, research, infographic]
              topic:
                type: string
              source_materials:
                type: array
                items:
                  type: string
              target_formats:
                type: array
                items:
                  type: string
                  enum: [markdown, html, pptx, mp4, mp3]
    responses:
      201:
        description: 任务创建成功
        content:
          application/json:
            schema:
              type: object
              properties:
                task_id:
                  type: string
                status:
                  type: string
                  enum: [pending, running, completed, failed]

  /{task_id}:
    get:
      summary: 查询任务状态
      responses:
        200:
          description: 任务状态
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  progress:
                    type: number
                  outputs:
                    type: array
                    items:
                      type: object
                      properties:
                        format:
                          type: string
                        path:
                          type: string
                        url:
                          type: string

    delete:
      summary: 取消任务
      responses:
        204:
          description: 任务已取消

# 内容管理API
/api/v1/content:
  get:
    summary: 查询内容资产列表
    parameters:
      - name: format
        in: query
        schema:
          type: string
      - name: date_from
        in: query
        schema:
          type: string
          format: date
    responses:
      200:
        description: 内容资产列表

  /{asset_id}:
    get:
      summary: 获取内容资产详情
      responses:
        200:
          description: 内容资产详情

    put:
      summary: 更新内容资产
      requestBody:
        content:
          application/json:
            schema:
              type: object

# 发布管理API
/api/v1/publish:
  post:
    summary: 发布内容
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              asset_id:
                type: string
              platforms:
                type: array
                items:
                  type: string
                  enum: [wechat, jike, zhihu, newsletter]
              schedule_time:
                type: string
                format: date-time
```

### 2.5 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                         生产环境                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Nginx (反向代理)                  │   │
│  │              SSL终止 + 负载均衡 + 静态资源            │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                     │
│       ┌────────────────┼────────────────┐                   │
│       ▼                ▼                ▼                   │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│  │Web服务1 │     │Web服务2 │     │Web服务N │              │
│  │(FastAPI)│     │(FastAPI)│     │(FastAPI)│              │
│  └─────────┘     └─────────┘     └─────────┘              │
│       │                │                │                   │
│       └────────────────┼────────────────┘                   │
│                        ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Celery Worker (异步任务)               │   │
│  │    长耗时任务：数据采集、文稿生成、视频渲染          │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                     │
│       ┌────────────────┼────────────────┐                   │
│       ▼                ▼                ▼                   │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│  │PostgreSQL│     │  Redis  │     │  Neo4j  │              │
│  │(主数据) │     │(缓存+队列)│    │(知识图谱)│              │
│  └─────────┘     └─────────┘     └─────────┘              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 对象存储 (MinIO)                     │   │
│  │              文件存储：文档、图片、视频              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.6 技术选型清单

| 层级 | 技术选型 | 选型理由 |
|-----|---------|---------|
| **后端框架** | FastAPI + Python | 异步高性能、类型提示、自动生成文档 |
| **任务队列** | Celery + Redis | 成熟稳定、支持定时任务、监控完善 |
| **数据库** | PostgreSQL | JSONB支持灵活、全文搜索、向量扩展 |
| **知识图谱** | Neo4j | 图数据库标杆、Cypher查询直观 |
| **缓存** | Redis | 高性能、支持多种数据结构 |
| **文件存储** | MinIO | S3兼容、自托管、成本可控 |
| **向量数据库** | pgvector | 与PostgreSQL统一，支持相似度检索 |
| **图数据库** | Neo4j | 原生图存储，Cypher查询强大 |
| **长期记忆** | Zep | 向量+元数据混合存储，支持语义检索 |
| **LLM底座** | ModelRouter（自研） | 统一封装多厂商API，支持故障转移 |
| **嵌入模型** | text-embedding-3-large | 1536维，性价比高 |
| **中文NER** | macbert4cner | 中文命名实体识别准确率高 |
| **主题建模** | BERTopic | 基于Transformer的现代主题模型 |
| **数据采集** | Playwright + Scrapy | 动态页面+静态页面全覆盖 |
| **数据处理** | Pandas + NumPy | 生态成熟、性能优秀 |
| **可视化** | D3.js + Chart.js | 灵活度高、交互性强 |
| **文档生成** | python-pptx + WeasyPrint | 程序化生成PPT/PDF |
| **视频生成** | FFmpeg + 剪映API | 专业级视频处理能力 |
| **音频生成** | Azure Speech SDK | 中文TTS质量高、稳定 |
| **部署** | Docker + Docker Compose | 环境一致性、易于维护 |

---

## 第三部分：实施路线图

### 3.1 阶段规划

#### Phase 1：MVP（2-3个月）

**目标**：实现基础内容生产流程

**功能范围**：
- [x] 选题策划（热点分析+大纲生成）
- [x] 深度研究（数据采集+基础分析）
- [x] 文稿生成（三层穿透结构）
- [x] 蓝军提问（黄奇帆+孟晓苏视角）
- [x] 多态转换（信息图+执行摘要）

**里程碑**：
- Week 4：Planner + Researcher Agent 可运行
- Week 8：Writer Agent 可生成完整文稿
- Week 12：完整流水线跑通，产出第一期Newsletter

#### Phase 2：增强（3-4个月）

**目标**：提升质量和效率

**功能范围**：
- [ ] 知识图谱集成（研报库检索）
- [ ] 智能数据可视化
- [ ] 自我批判模块（自我Review）
- [ ] PPT自动生成
- [ ] 自动发布（公众号+即刻）

**里程碑**：
- 质量：人工干预减少50%
- 效率：单期生产时间从3天降至1天

#### Phase 3：自动化（4-6个月）

**目标**：实现高度自动化

**功能范围**：
- [ ] 视频自动生成
- [ ] 音频自动生成
- [ ] 智能排期优化
- [ ] 读者问答自动回复
- [ ] 个性化推荐

**里程碑**：
- 自动化率：80%内容无需人工干预
- 多形态产出：每期内容自动生成5+形态

### 3.2 资源需求

| 资源类型 | MVP阶段 | 增强阶段 | 自动化阶段 |
|---------|--------|---------|-----------|
| **人力** | 1全栈 + 0.5产品 | 2全栈 + 1产品 | 3全栈 + 1产品 + 1算法 |
| **服务器** | 1台（4核8G） | 2台（8核16G） | 3台 + GPU实例 |
| **API费用** | ￥500/月 | ￥2000/月 | ￥5000/月 |
| **存储** | 100GB | 500GB | 2TB |

### 3.3 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|-----|------|------|---------|
| LLM输出质量不稳定 | 高 | 高 | 建立人工审核机制、prompt优化 |
| 数据源API变更 | 中 | 高 | 多源备份、爬虫兜底 |
| 平台发布规则变更 | 中 | 中 | 监控预警、快速适配 |
| 内容同质化 | 中 | 中 | 强化蓝军机制、差异化定位 |
| 技术债务累积 | 高 | 中 | 代码审查、重构计划 |

---

## 附录

### A. 术语表

| 术语 | 定义 |
|-----|------|
| **Agent** | 具有特定职责的AI代理，可自主决策和执行任务 |
| **Skill** | Agent具备的具体能力，如数据分析、文稿生成 |
| **三层穿透** | 宏观视野-中观解剖-微观行动的内容结构 |
| **蓝军** | 批判性审视角色，模拟专家提出挑战性意见 |
| **多态转换** | 同一内容转换为多种形态（图文/视频/音频） |
| **一源多用** | 一次研究产出，多场景复用 |

### C. 文件目录结构

```
/Users/行业研究/
│
├── 📁 00-知识库/                     # 核心资产：历史积累
│   ├── 研报库/
│   │   ├── 金融科技/
│   │   ├── 居住服务/
│   │   └── 交叉领域/
│   ├── 数据字典/
│   ├── 术语词典/
│   └── 专家名录/
│
├── 📁 01-选题池/                     # 内容策划阶段
│   ├── 选题库.yaml                   # 结构化选题列表
│   ├── 热点追踪/
│   ├── 读者反馈/
│   └── 选题计划书/                   # 每个选题的策划文档
│
├── 📁 02-研究产出/                   # 研究分析阶段
│   ├── 数据包/                       # 清洗后的原始数据
│   ├── 洞察报告/
│   │   ├── draft/                    # 研究初稿
│   │   └── final/                    # 定稿洞察
│   └── 参考文献/
│
├── 📁 03-文稿生产/                   # 文稿生成阶段
│   ├── 大纲/
│   ├── draft/                        # 写作初稿
│   ├── review/                       # 审核修改
│   ├── final/                        # 定稿
│   └── 蓝军提问/                     # 批判性审视记录
│
├── 📁 04-多态产品/                   # 多态转换阶段
│   ├── 完整版/                       # 长文深度版
│   ├── 执行摘要/                     # 精简版（3000字）
│   ├── 信息图/                       # 可视化图表
│   ├── PPT/
│   ├── 视频脚本/
│   ├── 视频文件/
│   └── 音频文件/
│
├── 📁 05-已发布/                     # 发布管理
│   ├── 公众号/
│   ├── 即刻/
│   ├── 知乎/
│   ├── Newsletter/
│   └── 数据反馈/                     # 阅读/转发/评论数据
│
├── 📁 06-模板资产/                   # 可复用模板
│   ├── 图表模板/
│   ├── PPT模板/
│   ├── 视频模板/
│   └── 邮件模板/
│
├── 📁 07-智能素材库/                 # 【新增】智能素材管理
│   ├── raw/                          # 原始素材
│   ├── processed/                    # 处理后的素材（带标签、权重）
│   ├── embeddings/                   # 向量嵌入
│   └── tags/                         # 标签体系
│
├── 📁 08-知识图谱/                   # 【新增】知识图谱数据
│   ├── nodes/                        # 实体节点
│   ├── edges/                        # 关系边
│   ├── snapshots/                    # 时序快照
│   └── exports/                      # 图谱导出
│
├── 📁 09-模型底座/                   # 【新增】多模型配置
│   ├── configs/                      # 模型配置文件
│   ├── adapters/                     # 模型适配器
│   ├── cache/                        # 模型响应缓存
│   └── logs/                         # 调用日志与成本统计
│
├── 📁 10-系统日志/                   # 运维监控
│   ├── 运行日志/
│   ├── 错误日志/
│   ├── 性能监控/
│   └── 成本统计/                     # 模型调用成本
│
└── 📁 agents/                        # Agent配置
    ├── planner_config.yaml
    ├── researcher_config.yaml
    ├── writer_config.yaml
    ├── converter_config.yaml
    ├── publisher_config.yaml
    ├── asset_library_config.yaml       # 【新增】
    ├── knowledge_graph_config.yaml     # 【新增】
    └── model_router_config.yaml        # 【新增】
```

### D. 专家库扩展设计

#### D.1 专家模型扩展

```python
class ExpertProfile:
    """专家多维属性模型"""

    # 基础属性
    id: str                          # 唯一标识
    name: str                        # 姓名
    title: str                       # 头衔（如：原重庆市市长）
    avatar: str                      # 头像URL
    bio: str                         # 简介

    # 权威属性
    authority_score: float           # 权威度评分（0-1）
    credentials: List[str]           # 资质证明
    publications: List[str]          # 代表作
    media_exposure: int              # 媒体曝光度

    # 领域属性
    domains: List[DomainExpertise]   # 专业领域（多领域）
    # DomainExpertise: {domain: "财政学", level: "expert", years: 30}

    # 观点属性
    core_viewpoints: List[ViewPoint] # 核心观点库
    # ViewPoint: {topic: "土地财政", stance: "悲观", evidence: [...]}

    # 风格属性
    communication_style: str         # 沟通风格（如：犀利/温和/数据驱动）
    question_patterns: List[str]     # 典型提问模式
    favorite_frameworks: List[str]   # 惯用分析框架

    # 关系属性
    influenced_by: List[str]         # 学术谱系（受谁影响）
    collaborators: List[str]         # 合作者
    rivals: List[str]                # 观点对立者

    # 动态属性
    recent_focus: List[str]          # 近期关注话题
    activity_level: float            # 活跃度（0-1）
    last_updated: datetime           # 最后更新时间


class ExpertRole(Enum):
    """专家参与角色"""
    ADVOCATE = "advocate"           # 正向输出观点
    CRITIC = "critic"               # 蓝军提意见
    DISCUSSANT = "discussant"       # 参与讨论
    MEDIATOR = "mediator"           # 调解争议
    SUMMARIZER = "summarizer"       # 总结陈词


class ExpertParticipation:
    """专家参与会话"""

    expert_id: str
    role: ExpertRole
    context: str                     # 参与上下文
    input_content: str               # 输入内容
    output_content: str              # 专家输出
    referenced_viewpoints: List[str] # 引用的核心观点
    confidence: float                # 置信度
    timestamp: datetime
```

#### D.2 专家库实现

```python
class ExpertLibrary:
    """专家库管理器"""

    def __init__(self):
        self.experts: Dict[str, ExpertProfile] = self.load_experts()
        self.viewpoint_graph = ViewpointGraph()  # 观点关系图谱

    def register_expert(self, profile: ExpertProfile):
        """注册新专家"""
        self.experts[profile.id] = profile
        self.build_viewpoint_links(profile)

    def get_expert_for_task(
        self,
        task_type: str,
        topic: str,
        role: ExpertRole,
        constraints: Dict
    ) -> List[ExpertProfile]:
        """智能匹配专家"""

        candidates = []
        for expert in self.experts.values():
            # 1. 领域匹配
            domain_match = any(
                d.domain in self.get_related_domains(topic)
                for d in expert.domains
            )

            # 2. 角色适配
            role_match = self.check_role_compatibility(expert, role)

            # 3. 活跃度检查
            if expert.activity_level < 0.3:
                continue

            # 4. 计算匹配度
            match_score = self.calculate_match_score(
                expert, topic, role, constraints
            )

            if domain_match and role_match and match_score > 0.6:
                candidates.append((expert, match_score))

        # 按匹配度排序
        return sorted(candidates, key=lambda x: x[1], reverse=True)

    def generate_participation(
        self,
        expert_id: str,
        role: ExpertRole,
        content: str,
        context: Dict
    ) -> ExpertParticipation:
        """生成专家参与内容"""

        expert = self.experts[expert_id]

        # 根据角色生成不同输出
        generators = {
            ExpertRole.ADVOCATE: self._generate_advocate_view,
            ExpertRole.CRITIC: self._generate_critical_questions,
            ExpertRole.DISCUSSANT: self._generate_discussion_points,
            ExpertRole.MEDIATOR: self._generate_mediation,
            ExpertRole.SUMMARIZER: self._generate_summary
        }

        generator = generators[role]
        output = generator(expert, content, context)

        return ExpertParticipation(
            expert_id=expert_id,
            role=role,
            context=context,
            input_content=content,
            output_content=output,
            referenced_viewpoints=self.extract_viewpoints(output, expert),
            confidence=self.calculate_confidence(expert, output),
            timestamp=datetime.now()
        )

    def _generate_critical_questions(
        self,
        expert: ExpertProfile,
        content: str,
        context: Dict
    ) -> str:
        """生成蓝军式批判提问"""

        # 1. 提取内容中的主张
        claims = self.extract_claims(content)

        # 2. 匹配专家的核心观点
        relevant_viewpoints = [
            vp for vp in expert.core_viewpoints
            if any(self.is_related(vp.topic, claim.topic) for claim in claims)
        ]

        # 3. 基于专家风格生成提问
        questions = []
        for claim in claims:
            # 使用专家惯用的提问模式
            template = random.choice(expert.question_patterns)

            # 填充内容
            question = template.format(
                conclusion=claim.conclusion,
                evidence=claim.evidence,
                assumption=claim.assumption
            )

            # 引用专家核心观点作为支撑
            if relevant_viewpoints:
                vp = random.choice(relevant_viewpoints)
                question += f"\n\n（基于我关于'{vp.topic}'的立场：{vp.stance}）"

            questions.append(question)

        return "\n\n".join(questions)

    def _generate_advocate_view(
        self,
        expert: ExpertProfile,
        content: str,
        context: Dict
    ) -> str:
        """生成正向观点输出"""

        # 1. 找到与内容相关的专家观点
        related_views = [
            vp for vp in expert.core_viewpoints
            if self.semantic_similarity(vp.topic, context.get('topic')) > 0.7
        ]

        # 2. 构建论证
        argument = f"作为{expert.title}，我对这个问题的看法是：\n\n"

        for view in related_views[:3]:  # 取最相关的3个观点
            argument += f"**关于{view.topic}**：{view.stance}\n"
            argument += f"依据：{'；'.join(view.evidence[:2])}\n\n"

        # 3. 结合当前内容给出具体建议
        argument += f"回到本文，我认为{context.get('core_proposition')}这一命题"
        argument += self.align_with_expert_stance(
            context.get('core_proposition'),
            expert
        )

        return argument
```

#### D.3 预设专家配置

```yaml
# config/experts.yaml
experts:
  huang_qifan:
    name: "黄奇帆"
    title: "原重庆市市长，著名经济学家"
    avatar: "/experts/huang_qifan.jpg"
    bio: "长期研究房地产、金融与地方政府行为，著有《结构性改革》《分析与思考》"
    authority_score: 0.95
    credentials: ["重庆市原市长", "全国人大财经委副主任"]

    domains:
      - { domain: "财政学", level: "expert", years: 40 }
      - { domain: "房地产经济学", level: "expert", years: 30 }
      - { domain: "地方政府行为", level: "authority", years: 35 }

    core_viewpoints:
      - topic: "土地财政"
        stance: "必须转型，但短期内不可完全替代"
        evidence:
          - "土地出让金5万亿 vs REITs 150亿，差距340倍"
          - "地方政府激励机制未转变"
        confidence: 0.9

      - topic: "REITs"
        stance: "方向正确，但路径曲折"
        evidence:
          - "需要10-20年过渡期"
          - "中央财政需提供转移支付支持"
        confidence: 0.85

    communication_style: "犀利直接，数据驱动，善用类比"
    question_patterns:
      - "你的{conclusion}是否过于{adjective}？"
      - "{problem}的解决方案是什么？"
      - "你对{issue}的分析，是否触及了{deep_issue}？"
      - "为什么{time}年还没解决{problem}？"

    favorite_frameworks:
      - "政治经济学分析框架"
      - "中央-地方博弈模型"
      - "财政可持续性评估"

    influenced_by: ["吴敬琏", "厉以宁"]
    activity_level: 0.9

  meng_xiaosu:
    name: "孟晓苏"
    title: "原中房集团董事长，中国REITs推动者"
    avatar: "/experts/meng_xiaosu.jpg"
    bio: "被誉为'中国REITs之父'，长期致力于推动中国REITs立法与市场发展"
    authority_score: 0.92
    credentials: ["中房集团原董事长", "REITs联盟理事长"]

    domains:
      - { domain: "REITs", level: "authority", years: 25 }
      - { domain: "住房金融", level: "expert", years: 30 }
      - { domain: "房地产开发", level: "expert", years: 35 }

    core_viewpoints:
      - topic: "REITs市场规模"
        stance: "5年内可达3000亿，10年内万亿级"
        evidence:
          - "全国可证券化存量资产超100万亿"
          - "保险资金30万亿缺口巨大"
        confidence: 0.88

      - topic: "投资者教育"
        stance: "散户占比应达30%，与日本接轨"
        evidence:
          - "当前散户仅占10%，流动性不足"
          - "需开设'REITs课堂'系统普及"
        confidence: 0.82

    communication_style: "乐观积极，经验丰富，注重实操"
    question_patterns:
      - "你对{issue}的担忧，是否有{solution}？"
      - "{prediction}是否过于{adjective}？"
      - "散户占比低的{solution}是什么？"
      - "为什么不能学习{country}的{practice}？"

    favorite_frameworks:
      - "国际经验对标分析"
      - "市场规模测算模型"
      - "投资者教育路径"

    activity_level: 0.85

  # 更多专家...
  liu_yuanChun:
    name: "刘元春"
    title: "上海财经大学校长，经济学家"
    domains:
      - { domain: "宏观经济学", level: "expert", years: 25 }
      - { domain: "金融风险", level: "expert", years: 20 }
    # ... 类似结构

  xu_yuan:
    name: "徐远"
    title: "北京大学国家发展研究院教授"
    domains:
      - { domain: "房地产金融", level: "expert", years: 15 }
      - { domain: "城市经济学", level: "expert", years: 12 }
    # ... 类似结构
```

#### D.4 多专家协作模式

```python
class MultiExpertPanel:
    """多专家协作讨论"""

    def __init__(self, expert_library: ExpertLibrary):
        self.library = expert_library
        self.discussion_history: List[ExpertParticipation] = []

    def start_discussion(
        self,
        topic: str,
        initial_content: str,
        expert_ids: List[str],
        rounds: int = 3
    ) -> DiscussionSummary:
        """启动多专家讨论"""

        # 第一轮：各自输出观点（ADVOCATE角色）
        for expert_id in expert_ids:
            participation = self.library.generate_participation(
                expert_id=expert_id,
                role=ExpertRole.ADVOCATE,
                content=initial_content,
                context={"topic": topic, "round": 1}
            )
            self.discussion_history.append(participation)

        # 第二轮：相互质疑（CRITIC角色）
        for expert_id in expert_ids:
            # 获取其他专家的观点
            others_views = [
                p for p in self.discussion_history
                if p.expert_id != expert_id and p.round == 1
            ]

            content_to_critique = "\n".join([p.output_content for p in others_views])

            participation = self.library.generate_participation(
                expert_id=expert_id,
                role=ExpertRole.CRITIC,
                content=content_to_critique,
                context={"topic": topic, "round": 2}
            )
            self.discussion_history.append(participation)

        # 第三轮：深入讨论（DISCUSSANT角色）
        # 基于前两轮形成焦点问题
        focal_issues = self.identify_focal_issues(self.discussion_history)

        for expert_id in expert_ids:
            participation = self.library.generate_participation(
                expert_id=expert_id,
                role=ExpertRole.DISCUSSANT,
                content=focal_issues,
                context={"topic": topic, "round": 3}
            )
            self.discussion_history.append(participation)

        # 最终轮：总结（SUMMARIZER角色，选最资深的专家）
        senior_expert = max(expert_ids, key=lambda e: self.library.experts[e].authority_score)

        summary = self.library.generate_participation(
            expert_id=senior_expert,
            role=ExpertRole.SUMMARIZER,
            content=self.format_full_discussion(self.discussion_history),
            context={"topic": topic, "round": "final"}
        )

        return DiscussionSummary(
            topic=topic,
            rounds=self.discussion_history,
            final_summary=summary,
            consensus_points=self.extract_consensus(self.discussion_history),
            divergence_points=self.extract_divergence(self.discussion_history),
            action_items=self.extract_action_items(self.discussion_history)
        )
```

### B. 参考资源

- LangChain文档：https://python.langchain.com/
- FastAPI文档：https://fastapi.tiangolo.com/
- Neo4j文档：https://neo4j.com/docs/
- Zep文档：https://docs.getzep.com/
- BERTopic文档：https://maartengr.github.io/BERTopic/
- Celery文档：https://docs.celeryq.dev/

---

*文档版本：v1.0*
*最后更新：2025年*