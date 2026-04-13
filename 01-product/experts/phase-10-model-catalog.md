# Phase 10: Mental Model Library 可查询目录

## 背景

Phase 8 构建了运行时的 `mentalModelGraph` 缓存。Phase 10 在此基础上提供两种访问方式：

1. **Build-time 静态 catalog JSON** — 由脚本扫描所有 .ts profile 导出到 `01-product/experts/mental-model-catalog.json`，供外部工具（文档生成、可视化、数据分析）离线使用
2. **Runtime 活 catalog 端点** — `GET /mental-models/catalog` 返回与静态文件结构一致的数据，但内容来自 Phase 8 图谱缓存，反映当前运行时状态

这让"心智模型"成为独立于专家的一等资产，供 `writerNode`、`blueTeamNode` 等下游直接引用。

## 变更点

### 1. 新增 `api/src/scripts/extract-mental-model-catalog.ts`

命令行脚本：
```bash
cd api && npx tsx src/scripts/extract-mental-model-catalog.ts
```

- 静态 import 所有 16 个 .ts profile（包括 topExperts + 各独立文件）
- 遍历构建 catalog（结构与 Phase 8 的 graph 一致，但输出为 JSON）
- 写入 `01-product/experts/mental-model-catalog.json`
- 控制台打印统计和 Top 5 共享模型

实际运行结果：
```
专家总数: 26
心智模型总数: 75
共享模型（2+ 专家）: 0
```

**意外发现**：0 个共享模型——因为相似模型的命名都不完全一致。例如：
- "增长飞轮" (S-01 张一鸣)
- "极致性价比飞轮" (S-02 雷军)
- "飞轮效应" (S-31 贝索斯) — 如果有的话

当前 `normalizeName` 只去空白，不做语义相似度匹配，所以这些变体被视为不同模型。这是一个明确可操作的后续优化方向（见"已知限制"）。

### 2. `api/src/modules/expert-library/router.ts`

新增端点 `GET /mental-models/catalog`：
- 复用 Phase 8 的 `getMmGraph()` 缓存
- 返回结构化 catalog（含所有字段：evidence/applicationContext/failureCondition）
- 与静态 JSON 格式对齐

## 输出示例

### 静态文件 `01-product/experts/mental-model-catalog.json`
```json
{
  "generatedAt": "2026-04-13T16:xx:xx.xxxZ",
  "totalModels": 75,
  "sharedCount": 0,
  "expertCount": 26,
  "experts": [
    { "expert_id": "S-03", "name": "马斯克", "domain": ["投资分析", "科技战略", ...] },
    ...
  ],
  "models": [
    {
      "name": "渐近极限思维",
      "expertCount": 1,
      "isShared": false,
      "variants": [
        {
          "expert_id": "S-03",
          "expert_name": "马斯克",
          "summary": "任何物理产品都有一个由材料成本决定的理论价格下限...",
          "evidence": ["Tesla: 将电池包成本从 $250/kWh 推向材料极限 $60/kWh", ...],
          "applicationContext": "评估任何硬件产品/制造业的成本优化潜力",
          "failureCondition": "纯软件/服务行业；成本瓶颈在监管而非物理"
        }
      ]
    },
    ...
  ]
}
```

### API `GET /api/v1/expert-library/mental-models/catalog`

与静态文件结构一致，但：
- `generatedAt` 是请求时间
- `variants` 字段名（静态文件里叫 variants，运行时 graph entry 叫 experts——我们在端点里做了映射统一为 `variants`）
- 来源是运行时缓存，反映热加载后的最新状态

## 测试验证

### 类型检查
```bash
cd api && npx tsc --noEmit  # 无错误
```

### 静态导出
```bash
cd api && npx tsx src/scripts/extract-mental-model-catalog.ts
# 预期输出：生成 75 个 model, 26 个 expert, top 5 共享模型列表
cat ../01-product/experts/mental-model-catalog.json | jq '.totalModels'
# 75
```

### 运行时端点
```bash
curl -s http://localhost:3006/api/v1/expert-library/mental-models/catalog \
  -H "X-API-Key: $API_KEY" | jq '{totalModels, sharedCount, expertCount}'
```

### 查询特定模型
```bash
curl -s 'http://localhost:3006/api/v1/expert-library/mental-models/%E6%B8%90%E8%BF%91%E6%9E%81%E9%99%90%E6%80%9D%E7%BB%B4' \
  -H "X-API-Key: $API_KEY" | jq '.experts[0].evidence'
```

## 下游收益

1. **离线工具**：数据分析师可以读取静态 JSON 做统计/可视化，无需启动 API
2. **writerNode 集成铺路**：未来 LangGraph 的 writerNode 可以接受 `mental_model_ref: "渐近极限思维"` 参数，从 catalog 拉取应用指南
3. **文档生成**：脚本可以定期生成"心智模型百科"文档，每次更新专家后运行一次
4. **跨专家洞察**：分析师可以直接查询 "Tesla 相关的 evidence 出现在哪些心智模型中" 等交叉问题
5. **Phase 8 图谱的补充**：Phase 8 提供查询 API，Phase 10 提供可导出/可归档的快照格式

## 已知限制

- **0 共享模型是命名差异问题**：当前 exact-match 无法识别"增长飞轮"/"极致性价比飞轮"/"飞轮效应"是同一基础模型——**后续独立任务**可以引入：
  - keyword-based canonicalize（如"飞轮"作为 canonical key）
  - LLM-based 语义聚类（一次性跑完，结果持久化）
  - 管理员手动合并 UI
- **静态 JSON 不含使用频率**：没有记录"某模型在近 30 天被应用了多少次"。要做热度排名，需要聚合 Phase 5 的 `model_applications` 数据
- **脚本需要 ts-node/tsx**：不能直接在生产环境运行纯 JS，生产环境需先 build 再用 node 调用
- **运行时端点和静态 JSON 可能短期不一致**：如果 profile 在运行时被修改（Phase 9 的 knowledge source 更新不算，但 Phase 11 若实现专家热更新会相关），静态 JSON 需要重新生成
- **不含 heuristics/expressionDNA/contradictions**：只覆盖 mentalModels，其他 nuwa 字段没有对应 catalog（可作为 Phase 11+ 工作）

## 后续相关 Phase

无——Phase 10 是本批优化的最后一步。未来独立任务方向：
1. Mental Model 语义聚类与 canonical key
2. writerNode 按 `mental_model_ref` 参数调用指定模型
3. Catalog 热度统计（聚合 invoke 的 model_applications 数据）
4. UI 可视化：心智模型网络图、跨专家共享关系图
