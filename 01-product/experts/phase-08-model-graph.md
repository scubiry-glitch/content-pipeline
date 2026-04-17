# Phase 8: 跨专家 MentalModel 索引图

## 背景

21 个 nuwa 增强专家累计定义了约 60 个心智模型。其中"飞轮效应"被张一鸣/贝索斯/王兴都提到过，"长期主义"被巴菲特/贝索斯都推崇，"第一性原理"被马斯克/任正非都应用。这些共享模型是宝贵的跨专家认知资产，但目前没有任何地方做聚合——它们只作为单个专家 profile 的私有字段存在。

Phase 8 构建一个 `Map<modelName, entry>` 图谱，支持：
- 列出所有被 2+ 专家共享的模型
- 按模型名反向查找"哪些专家用它"
- 为 Phase 10 的 catalog 能力奠基

## 变更点

### 1. 新增 `api/src/modules/expert-library/mentalModelGraph.ts`

导出接口和函数：

```ts
export interface MentalModelGraphEntry {
  name: string;
  experts: Array<{
    expert_id, expert_name, summary, evidence[], applicationContext, failureCondition
  }>;
  expertCount: number;
  isShared: boolean;  // expertCount >= 2
}

export async function buildMentalModelGraph(engine): Promise<Map<string, MentalModelGraphEntry>>;
export function findExpertsByModel(graph, modelName): MentalModelGraphEntry | undefined;
export function listSharedModels(graph): MentalModelGraphEntry[];  // 按 expertCount 降序
export function listAllModels(graph): MentalModelGraphEntry[];
```

构建算法：
- 调用 `engine.listExperts()` 拉所有专家
- 遍历每位专家的 `persona.cognition.mentalModels`
- 按 `normalizeName(name)` (去空白) 聚合
- 每个 entry 收集该模型在各专家处的 summary/evidence/context/failureCondition

时间复杂度 O(专家数 × 心智模型数)，21 × 4 = ~84 次操作，可忽略。

### 2. `api/src/modules/expert-library/router.ts`

- `createRouter()` 开头新增模块级缓存 `cachedMmGraph` + 5 分钟 TTL
- 新增 helper `getMmGraph()` 惰性构建 + 缓存

新增三个端点：

**`GET /mental-models`**
- 可选查询参数 `?shared=true` 只返回共享模型
- 返回总数、共享数、列表（每条含模型名/专家数/专家列表简化视图）

**`GET /mental-models/:name`**
- URL 解码后精确查找单个模型
- 返回完整 entry（含每位专家的详细 evidence/context）
- 未找到返回 404

**`POST /mental-models/refresh`**
- 强制清缓存重建图谱
- 用于专家 profile 更新后手动刷新

## 接口变化

纯新增 API，对现有接口无影响。示例响应：

**`GET /mental-models?shared=true`**
```json
{
  "total": 8,
  "shared_count": 8,
  "models": [
    {
      "name": "飞轮效应",
      "expertCount": 3,
      "isShared": true,
      "experts": [
        { "expert_id": "S-01", "name": "张一鸣" },
        { "expert_id": "S-31", "name": "贝索斯" },
        { "expert_id": "S-04", "name": "王兴" }
      ]
    },
    ...
  ]
}
```

**`GET /mental-models/%E9%A3%9E%E8%BD%AE%E6%95%88%E5%BA%94`**
```json
{
  "name": "飞轮效应",
  "expertCount": 3,
  "isShared": true,
  "experts": [
    {
      "expert_id": "S-01",
      "expert_name": "张一鸣",
      "summary": "找到一个核心变量改善会带动全链路指标提升的正反馈循环",
      "evidence": ["今日头条: 更多用户→更多数据→更好推荐", "抖音: 创作者多→内容多→用户留存高"],
      "applicationContext": "评估任何平台型或内容型产品的增长可持续性",
      "failureCondition": "飞轮依赖补贴而非自然行为；单边市场无网络效应"
    },
    {
      "expert_id": "S-31",
      "expert_name": "贝索斯",
      ...
    }
  ]
}
```

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无新增错误
```

### 端到端
```bash
# 全量列表
curl -s http://localhost:3006/api/v1/expert-library/mental-models?shared=true \
  -H "X-API-Key: $API_KEY" | jq

# 查询某个模型
curl -s 'http://localhost:3006/api/v1/expert-library/mental-models/%E9%A3%9E%E8%BD%AE%E6%95%88%E5%BA%94' \
  -H "X-API-Key: $API_KEY" | jq '.experts | length'
# 预期：>= 2

# 刷新缓存
curl -X POST http://localhost:3006/api/v1/expert-library/mental-models/refresh \
  -H "X-API-Key: $API_KEY" | jq
```

### 回归测试
- 没有 mentalModels 的专家（E 系列、部分旧 S 级）不会出现在图谱中——符合预期
- 单次调用冷启动 < 100ms（内存扫描 21 个 profile），后续命中缓存 < 5ms

## 下游收益

1. **Phase 10 Mental Model Catalog** 直接消费本图谱，无需重新构建
2. **UI 可视化**：前端可以渲染"心智模型网络图"展示跨专家共享关系
3. **Phase 4 ExpertMatcher 增强**：未来可以用图谱做"按模型找专家"的反向匹配（用户说"我想用飞轮效应视角分析"）
4. **教学/内容创作**：writer 可以从 catalog 选模型，自动拿到多位专家的应用示例
5. **数据洞察**：统计出最"流行"的模型（被提到最多），可以指导专家画像扩展方向

## 已知限制

- **精确名称匹配**：`normalizeName` 只去空白，"飞轮效应" vs "飞轮机制" 会被视为不同模型——语义相似度匹配需要更复杂的 embedding 方案
- **缓存 TTL 5 分钟**：专家 profile 热更新后最多延迟 5 分钟生效（或用 `/refresh` 强制刷新）
- **不涉及持久化**：图谱完全在内存中构建，重启后重建——若未来 catalog 有热度统计需求，需要入 DB
- **无访问控制**：所有 endpoint 公开，没有 `preHandler: authenticate`，与 `GET /experts` 等同样公开的接口保持一致

## 后续相关 Phase

- Phase 10 Mental Model Catalog 将使用本图谱作为数据源，导出 JSON catalog

