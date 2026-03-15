# 文档约定 (Document Conventions)

## 文档命名规范

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 产品文档 | `Product-Spec-v{版本}.md` | `Product-Spec-v2.0.md` |
| API规格 | `API-Spec.yaml` | `API-Spec.yaml` |
| 架构决策 | `ADR-{编号}-{标题}.md` | `ADR-001-database-selection.md` |
| 运营文档 | `{中文名称}.md` | `运营SOP.md` |
| 会议纪要 | `YYYY-MM-DD-{类型}.md` | `2026-03-16-研讨会.md` |

## 文档模板

### 1. 产品规格 (Product-Spec)

```markdown
# 产品规格: {功能名}

## 概述
- 背景:
- 目标:
- 成功标准:

## 功能规格
| 功能 | 优先级 | 验收标准 |
|------|--------|---------|

## 技术依赖
- API:
- 数据库:

## 相关文档
- WHY:
- API:
```

### 2. 架构决策 (ADR)

```markdown
# ADR-{编号}: {标题}

## 状态
- 提议 / 已接受 / 已弃用

## 上下文
{问题背景}

## 决策
{选择了什么}

## 备选方案
| 方案 | 优点 | 缺点 |
|------|------|------|

## 影响
{对系统的影响}
```

### 3. 测试状态 (TEST_STATUS)

```markdown
# Test Status Dashboard

## Summary
| Metric | Value |
|--------|-------|
| Total | 22 |
| Passing | 22 |
| Failing | 0 |
| Coverage | 85% |

## By Suite
| Suite | Tests | Status |
|-------|-------|--------|

## Risk Areas
1.

## Next Steps
- [ ]
```

## 目录编号规则

```
00-work/        # 过程文档（工作中）
01-product/     # 产品（Why驱动）
02-design/      # 设计
03-architecture/# 架构
04-development/ # 开发
05-operations/  # 运营
07-archive/     # 归档
```

编号间隔为2，预留扩展空间。

## 文档链接规范

使用相对路径，确保可移植：

```markdown
<!-- ✅ 正确 -->
[WHY](../WHY.md)
[API Spec](../03-architecture/API-Spec.yaml)

<!-- ❌ 错误 -->
[WHY](/Users/行业研究/demo-project/WHY.md)
```

## 更新频率

| 文档 | 更新时机 |
|------|---------|
| WHY.md | 变更流程后 |
| Product-Spec | 迭代规划前 |
| API-Spec | 接口变更前 |
| TEST_STATUS | 每次测试运行后 |
| CLAUDE.md | 协作规范变更后 |

---

*Version: 1.0*
*Created: 2026-03-16*
