# 内容生产流水线 - 前端管理界面

## 使用方式

直接用浏览器打开 `index.html` 文件即可：

```bash
open index.html
# 或
open /Users/行业研究/demo-project/content-pipeline/webapp/index.html
```

## 功能

### 任务管理
- **创建任务**: 输入研究主题，选择输出格式
- **查看进度**: 实时显示任务状态和进度条
- **BlueTeam评审**: 查看2轮×3专家的评审意见
- **人工确认**: 对待确认的任务进行通过/拒绝操作
- **预览/下载**: 完成的任务可预览内容或下载Markdown文件

### 素材库
- **上传素材**: 支持PDF、TXT、Markdown格式
- **标签管理**: 为素材添加标签便于检索
- **内容预览**: 自动提取文本内容预览

## API配置

前端默认连接:
- API地址: `http://localhost:3000/api/v1`
- API Key: `dev-api-key-change-in-production`

如需修改，编辑 `index.html` 中的以下配置:
```javascript
const API_KEY = 'dev-api-key-change-in-production';
const BASE_URL = 'http://localhost:3000/api/v1';
```

## 界面预览

界面包含两个主要标签页:
1. **任务管理** - 查看和创建内容生产任务
2. **素材库** - 管理上传的研究素材

任务列表会自动每5秒刷新一次。
