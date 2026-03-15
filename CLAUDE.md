# CLAUDE.md - 内容生产流水线项目

项目级 Claude Code 协作指南

---

## 项目信息

| 项目 | 内容 |
|------|------|
| 名称 | 内容生产流水线 v2.0 |
| 路径 | `/Users/行业研究/demo-project/` |
| 代码 | `/Users/行业研究/demo-project/content-pipeline/` |
| 技术栈 | TypeScript + Node.js + PostgreSQL |

---

## 目录结构约定

```
/Users/行业研究/demo-project/
├── WHY.md                          # 项目目标（只读，需/冻结变更）
├── CLAUDE.md                       # 本文件：协作指南
├── 01-product/                     # 产品文档
│   ├── Product-Spec.md             # 功能规格
│   ├── CHANGELOG.md                # 版本日志
│   └── features/                   # 功能详细设计
├── 03-architecture/                # 技术架构
│   ├── API-Spec.yaml               # OpenAPI 定义
│   ├── system-design.md            # 系统设计
│   └── ADR/                        # 架构决策记录
├── 05-operations/                  # 运营文档
│   ├── 权限矩阵.md
│   ├── 运营SOP.md
│   └── 成功指标.md
├── 00-work/                        # 工作过程文档
│   ├── interview/                  # 访谈记录
│   ├── daily/                      # 站会记录
│   └── workshop/                   # 研讨会记录
├── 02-design/wireframes/           # 设计稿
├── 04-development/                 # 开发文档
│   ├── setup.md                    # 环境搭建
│   └── testing.md                  # 测试指南
├── 07-archive/                     # 历史版本归档
│
├── content-pipeline/               # 💻 代码仓库
│   ├── api/                        # API 服务
│   ├── webapp/                     # Web 前端
│   ├── database/                   # 数据库
│   └── ...
│
└── docs/                           # 原始文档（只读）
    └── WHY.md                      # 原始 WHY
```

---

## 工作流程（基于 Insights 建议）

### 1. 开始任务前

**必须确认：**
- [ ] 本任务与 WHY.md 目标一致
- [ ] 已查阅相关文档（Product-Spec / API-Spec）
- [ ] 已检查 TEST_STATUS.md 了解当前测试状态
- [ ] 已确认不涉及 242份研报 等大数据操作（避免超时）

**禁止行为：**
- ❌ 不确认目标就开始编码
- ❌ 一次性修改超过 3 个文件不确认
- ❌ 在没有测试的情况下实现功能

### 2. 探索阶段

**避免过度探索陷阱：**

```bash
# ❌ 不要这样做
find . -type f | xargs grep "something"  # 大面积无目的搜索

# ✅ 应该这样做
"Use a Task Agent to explore the codebase and find all files related to XXX.
Return a summary of: (1) which files, (2) where data comes from, (3) obvious risks.
Do NOT make any edits yet."
```

**探索限制：**
- 最多 3 个文件自主探索
- 超过 3 个文件必须使用 Task Agent
- 数据库/基础设施任务：先提出 3 步计划，执行第 1 步后暂停确认

### 3. 开发阶段

**TDD 强制要求：**

```
RED:  写测试 → 运行确认失败
GREEN: 实现最小代码 → 运行确认通过
REFACTOR: 重构 → 运行确认仍通过
```

**数据库工作规范：**
1. 最小 viable schema 优先
2. 连接失败时自动使用 mock/fallback 模式
3. 复杂 migration 延后到基础连接确认后

### 4. UI 调试规范

**遇到 UI 显示问题时：**
1. **打开浏览器 dev tools**，截图 console 错误
2. **定位具体行号** — 找到 undefined property 的源头
3. **添加防御性代码** — 使用 `?.` 或默认值
4. **用硬编码数据验证** — 确认渲染正常后再接真实数据

### 5. 调试日志

**复杂问题使用自主调试协议：**

```
1. Log error to DEBUG_LOG.md with full context
2. Generate 3 competing hypotheses
3. Design minimal test for each hypothesis
4. Execute tests using Bash/file reads
5. Update DEBUG_LOG.md with findings
6. If confidence > 80%: implement fix
7. If confidence < 80%: pause and ask specific question
```

---

## 文档更新约定

| 文档 | 更新时机 | 维护者 |
|------|---------|--------|
| WHY.md | 需走变更流程 `/冻结` | 王校长 |
| Product-Spec.md | 每次迭代前 | 王校长 |
| API-Spec.yaml | API 变更前 | 架构师 |
| 运营SOP.md | 流程优化后 | 运营经理 |
| TEST_STATUS.md | 每次测试变更 | 开发助手 |
| CLAUDE.md | 协作规范变更 | 系统 |

---

## Git 提交约定

```
<type>: <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新功能
- `fix`: 修复
- `test`: 测试
- `docs`: 文档
- `refactor`: 重构

**Example:**
```
feat: 选题模块热点追踪功能

- 实现热点话题抓取
- 集成蓝军评审预检查
- TDD: 5个测试全部通过

Relates: 01-product/Product-Spec.md#选题模块
```

---

## 禁止行为（基于历史教训）

1. **不要假设数据库连接成功** — 总是实现 fallback 模式
2. **不要大面积文件探索** — 使用 Task Agent 并行探索
3. **不要同时修改多个不相关文件** — 小步提交
4. **不要忽视测试状态** — 保持 TEST_STATUS.md 更新
5. **不要修改 WHY.md** — 除非重新走 `/冻结` 流程

---

## 快捷命令

| 命令 | 用途 |
|------|------|
| `/状态` | 查看项目整体状态 |
| `/研讨` | 四角色对齐研讨会 |
| `/冻结` | Why 冻结，开发启动 |
| `/继续` | 继续上次中断的任务 |

---

## 参考

- 用户 Insights: `file:///Users/scubiry/.claude/usage-data/report.html`
- Product-Dev-Ops-Team 技能: `/.claude/skills/product-dev-ops-team-3.1.0-final/`

---

*Created: 2026-03-16*
*Based on: Claude Code Insights Report + Product-Dev-Ops-Team v3.2.0*
