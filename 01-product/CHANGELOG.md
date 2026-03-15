# 更新日志 (CHANGELOG)

## 格式规范

基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 规划中
- [ ] 选题模块 - 热点追踪、用户反馈收集
- [ ] 研究模块 - RAG检索242份研报
- [ ] 写作模块 - 大纲生成、内容生成
- [ ] 蓝军评审 - AI自动评审机制
- [ ] 发布模块 - 多平台一键发布
- [ ] 数据看板 - 监控指标可视化

---

## [2.0.0] - 2026-03-16

### 新增
- 建立标准 Product-Dev-Ops-Team 项目结构
- 创建 WHY.md 文档，明确项目目标和成功标准
- 创建产品规格文档 (Product-Spec.md)
- 创建 API 规格文档 (API-Spec.yaml)
- 创建运营文档：权限矩阵、SOP、成功指标
- 集成现有代码仓库 (`content-pipeline/`)
- 集成现有 TDD 测试套件 (22个测试全部通过)

### 变更
- 更新 WHY.md，添加项目参考链接

### 技术债务
- 代码与测试在同一文件中 (pipeline.test.ts)，需要分离
- 缺少正式的数据库 schema 文档
- 缺少部署流程自动化

---

## [1.0.0] - 2026-03-15 (代码仓库)

### 新增
- TDD 测试套件 (22个测试)
  - 数据库初始化测试
  - SQL INSERT 表名提取测试
  - 网络降级策略测试
  - 完整集成流程测试
  - Claude Code 模型支持测试
- ContentPipeline 核心类实现
- extractTableName SQL 解析函数
- 连接池配置 (pool.ts)
- 数据库 schema (schema.sql)
- 环境配置模板 (.env.template)

### 修复
- 解决测试冲突 (重试次数预期不一致)
- 修复并发处理唯一 ID 生成
- 修复指标追踪计算

---

## 版本说明

### 版本号规则

- **MAJOR** (主版本): 不兼容的 API 修改
- **MINOR** (次版本): 向下兼容的功能新增
- **PATCH** (修订号): 向下兼容的问题修复

### 版本标签

- `Added`: 新功能
- `Changed`: 现有功能的变更
- `Deprecated`: 即将移除的功能
- `Removed`: 移除的功能
- `Fixed`: 问题修复
- `Security`: 安全相关的修复

---

## 相关链接

| 资源 | 链接 |
|------|------|
| WHY | `/Users/行业研究/demo-project/WHY.md` |
| 产品规格 | `/Users/行业研究/demo-project/01-product/Product-Spec.md` |
| API 规格 | `/Users/行业研究/demo-project/03-architecture/API-Spec.yaml` |
| 代码仓库 | `/Users/行业研究/demo-project/content-pipeline/` |

---

*维护人：王校长（产品经理）*
*更新频率：每次版本发布时更新*
