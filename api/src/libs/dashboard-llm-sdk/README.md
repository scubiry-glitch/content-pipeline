# Dashboard LLM SDK

用于接入 Dashboard 提供的 LLM API。

## 安装

将本目录作为独立包使用，或发布到私有 npm 仓库后安装。

## 使用

```ts
import { createDashboardLlmSdk } from './src/index.js';

const sdk = createDashboardLlmSdk({
  baseUrl: process.env.LLM_API_BASE_URL,
  token: process.env.LLM_API_TOKEN,
  defaultModel: 'k2p5',
});

const result = await sdk.chat({
  prompt: '请总结今天的研发进展',
  maxTokens: 1200,
});

console.log(result.reply);
```

## API

- `createDashboardLlmSdk(options?)`
- `sdk.chat({ prompt, model?, maxTokens? })`
- `sdk.listProviders()`

## 环境变量

- `LLM_API_BASE_URL`（默认：`http://127.0.0.1:3004`）
- `LLM_API_TOKEN`（必填）
- `DASHBOARD_LLM_MODEL`（可选，默认模型）
