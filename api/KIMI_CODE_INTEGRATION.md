# Kimi Code API 集成方案

## 问题分析

### 1. 网络连接问题（已解决）
- **现象**: Node.js `fetch` 连接 `api.kimi.com` 超时
- **原因**: Node.js 优先尝试 IPv6，但服务器 IPv6 不可达
- **解决**: 使用原生 `https` 模块 + 强制 IPv4 (`family: 4`)

### 2. API Key 权限问题（待解决）
- **现象**: 返回 403，`kimi-for-coding` 模型拒绝访问
- **原因**: API Key 是 Kimi Code 专用 Key，仅限特定 Coding Agents 使用
- **错误信息**: "Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc."

## 解决方案

### 方案 1: 申请 Moonshot 通用 API Key（推荐）
从 https://platform.moonshot.cn/ 获取通用 API Key：
- 端点: `https://api.moonshot.cn/v1`
- 模型: `kimi-k2.5`, `moonshot-v1-8k` 等
- 支持标准 OpenAI SDK 格式

### 方案 2: 使用 Kimi CLI
```bash
# 安装 Kimi CLI
curl -LsSf https://code.kimi.com/install.sh | bash

# 登录
kimi /login

# 启动服务模式
kimi acp
```

### 方案 3: 配置 Roo Code/Claude Code
按照您提供的配置：
- Entrypoint: `https://api.kimi.com/coding/v1`
- Model: `kimi-for-coding`
- Use legacy OpenAI API format: ✅
- Enable streaming: ✅

## 代码修改

`src/services/llm.ts` 已更新：
1. 使用原生 `https` 模块替代 `fetch`
2. 强制 IPv4 连接
3. 使用 OpenAI 兼容格式
4. 支持 `kimi-for-coding` 和 `k2p5` 模型

## 测试命令

```bash
# 测试连接
node -e "
const https = require('https');
const options = {
  hostname: 'api.kimi.com',
  path: '/coding/v1/models',
  headers: { 'Authorization': 'Bearer ' + process.env.ANTHROPIC_API_KEY },
  family: 4,
};
https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
"
```
