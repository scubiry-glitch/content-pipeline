# Step 18 阶段报告：Research 数据处理流程面板（Re5）

**对应缺口：** Research Re5 — 5 个数据处理面板（DataReview/Cleaning/CrossValidation/ExternalLinks/AssetLinks）

---

## 实施内容

将原本分散的 5 个处理面板整合为一个统一的「数据处理流程」可视化面板，从原始数据 → 清洗 → 验证 → 引用提取的全流水线展示。

### 文件改动

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `webapp/src/pages/lg-task-detail/LGResearchTab.tsx` | 编辑 | +145 |

### 核心功能

#### 1. 处理流水线统计（4 列卡片）

每张卡片带顶部彩色边条：

- **数据审查**（蓝）— 原始数据条目数
- **数据清洗**（绿）— 通过数 / 剔除数（基于 reliability ≥50% 阈值）
- **交叉验证**（紫）— 多源印证类型数 / 总类型数
- **外部引用**（橙）— 提取的外链数

#### 2. 数据类型分布矩阵

- 按 type 字段分组统计
- 通过 ≥2 个多源印证的类型用绿色高亮 + 勾号图标
- 圆角胶囊布局

#### 3. 外部链接列表

- 用正则 `https?:\/\/[^\s)\]"'`]+` 扫描所有 dataPackage 内容
- 去重 + 限制最多 10 条
- 链接列表（target="_blank"）
- 截断长链接

### 智能数据提取

```typescript
const externalLinks: string[] = [];
const urlRegex = /https?:\/\/[^\s)\]"'`]+/g;
dataPackage.forEach((item: any) => {
  const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content || {});
  const matches = text.match(urlRegex);
  if (matches) externalLinks.push(...matches.slice(0, 3));
});
```

支持字符串和对象类型的 content，自动序列化后扫描。

---

## 验证

- ✅ TypeScript 类型检查通过
- 待手动验证：
  - 4 张统计卡片数字正确
  - 数据类型分布正确高亮多源类型
  - 外部链接可点击打开

---

## 下一步

Step 19: 列表页 — 素材推荐 / 专家匹配
