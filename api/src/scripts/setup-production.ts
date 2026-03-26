#!/usr/bin/env node
// ============================================
// v6.2 Assets AI 批量处理 - 生产环境配置脚本
// 自动检测并推荐最佳 Embedding 配置
// ============================================

import * as dotenv from 'dotenv';
import { EmbeddingService } from '../services/assets-ai/embedding.js';

dotenv.config();

interface ProviderCheck {
  name: string;
  envVars: string[];
  priority: number;
  recommendation: string;
}

const PROVIDERS: ProviderCheck[] = [
  {
    name: 'SiliconFlow (推荐)',
    envVars: ['SILICONFLOW_API_KEY', 'embedding_model'],
    priority: 1,
    recommendation: '生产环境首选，中文 Embedding 效果最佳',
  },
  {
    name: 'OpenAI',
    envVars: ['OPENAI_API_KEY'],
    priority: 2,
    recommendation: '备选方案，效果优秀但英文优化',
  },
  {
    name: 'Dashboard LLM',
    envVars: ['DASHBOARD_LLM_MODEL', 'LLM_API_TOKEN'],
    priority: 3,
    recommendation: '备选方案，无需额外配置但速度较慢',
  },
  {
    name: '本地 Fallback',
    envVars: [],
    priority: 4,
    recommendation: '离线使用，效果一般，仅作兜底',
  },
];

async function setupProduction() {
  console.log('🔧 v6.2 Assets AI - 生产环境配置检查\n');
  console.log('='.repeat(70));

  // 1. 检查各提供商配置状态
  console.log('\n📋 1. 提供商配置状态检查\n');
  
  let configuredProvider: ProviderCheck | null = null;
  let availableProviders: ProviderCheck[] = [];

  for (const provider of PROVIDERS) {
    if (provider.name === '本地 Fallback') {
      console.log(`   ${provider.priority}. ${provider.name}`);
      console.log(`      ✅ 始终可用（无需配置）`);
      console.log(`      💡 ${provider.recommendation}\n`);
      continue;
    }

    const envStatus = provider.envVars.map(varName => {
      const value = process.env[varName];
      return {
        name: varName,
        exists: !!value,
        preview: value ? `${value.slice(0, 15)}...${value.slice(-5)}` : '未设置',
      };
    });

    const allConfigured = envStatus.every(s => s.exists);
    const statusIcon = allConfigured ? '✅' : '❌';

    console.log(`   ${provider.priority}. ${provider.name}`);
    
    for (const status of envStatus) {
      const icon = status.exists ? '✓' : '✗';
      console.log(`      ${icon} ${status.name}: ${status.preview}`);
    }

    if (allConfigured) {
      configuredProvider = provider;
      availableProviders.push(provider);
      console.log(`      ✅ 配置完整`);
    } else {
      console.log(`      ❌ 配置不完整`);
    }
    
    console.log(`      💡 ${provider.recommendation}\n`);
  }

  // 2. 推荐配置
  console.log('='.repeat(70));
  console.log('\n🎯 2. 配置建议\n');

  if (availableProviders.length === 0) {
    console.log('   ⚠️  未检测到任何外部 Embedding 提供商配置');
    console.log('   系统将使用本地 Fallback 模式（效果有限）\n');
    console.log('   推荐添加 SiliconFlow 配置：\n');
    console.log('   # 在 .env 文件中添加：');
    console.log('   SILICONFLOW_API_KEY=sk-your-api-key');
    console.log('   embedding_model=netease-youdao/bce-embedding-base_v1\n');
  } else {
    const bestProvider = availableProviders[0];
    console.log(`   ✅ 已检测到 ${availableProviders.length} 个可用提供商`);
    console.log(`   ⭐ 推荐使用：${bestProvider.name}`);
    console.log(`   💡 ${bestProvider.recommendation}\n`);

    if (bestProvider.name !== 'SiliconFlow (推荐)') {
      console.log('   💡 提示：建议配置 SiliconFlow 以获得更好的中文 Embedding 效果\n');
    }
  }

  // 3. 测试当前配置
  console.log('='.repeat(70));
  console.log('\n🧪 3. 测试当前配置\n');

  const embeddingService = new EmbeddingService();
  const config = embeddingService.getConfig();

  console.log(`   当前使用提供商: ${config.provider}`);
  console.log(`   模型: ${config.model}`);
  console.log(`   维度: ${config.dimensions}`);
  console.log(`   API 端点: ${config.apiEndpoint || 'N/A'}`);

  // 4. 连接测试
  if (config.provider !== 'local') {
    console.log('\n   正在测试 API 连接...');
    
    try {
      const testText = '这是一个测试文本，用于验证 Embedding API 连接。';
      const startTime = Date.now();
      const embedding = await embeddingService.embed(testText);
      const duration = Date.now() - startTime;

      console.log(`   ✅ API 连接成功！`);
      console.log(`   📊 返回维度: ${embedding.length}`);
      console.log(`   ⏱️  响应时间: ${duration}ms`);
      console.log(`   📈 向量前5值: [${embedding.slice(0, 5).map((v: number) => v.toFixed(6)).join(', ')}]`);
    } catch (error) {
      console.error(`   ❌ API 连接失败:`, (error as Error).message);
      console.log('\n   请检查：');
      console.log('   1. API Key 是否正确');
      console.log('   2. 网络连接是否正常');
      console.log('   3. API 额度是否充足');
    }
  } else {
    console.log('\n   ℹ️  使用本地 Fallback 模式（无需网络连接）');
  }

  // 5. 生成推荐配置
  console.log('\n' + '='.repeat(70));
  console.log('\n📝 4. 推荐 .env 配置\n');
  
  console.log('# ============================================');
  console.log('# v6.2 Assets AI - Embedding 配置');
  console.log('# ============================================');
  console.log('');
  console.log('# 方式1: SiliconFlow (生产环境推荐) ⭐');
  console.log('# 特点: 中文优化，效果最佳，价格适中');
  console.log('SILICONFLOW_API_KEY=sk-your-api-key-here');
  console.log('embedding_model=netease-youdao/bce-embedding-base_v1');
  console.log('');
  console.log('# 可选模型:');
  console.log('# - netease-youdao/bce-embedding-base_v1 (推荐，768维)');
  console.log('# - BAAI/bge-large-zh-v1.5 (1024维)');
  console.log('# - BAAI/bge-m3 (1024维，多语言)');
  console.log('');
  console.log('# 方式2: OpenAI (备选)');
  console.log('# 特点: 英文优化，价格较高');
  console.log('# OPENAI_API_KEY=sk-your-api-key-here');
  console.log('');
  console.log('# 方式3: Dashboard LLM (使用现有配置)');
  console.log('# 特点: 无需额外配置，但速度较慢');
  console.log('# DASHBOARD_LLM_MODEL=k2p5');
  console.log('# LLM_API_TOKEN=your-token');
  console.log('');

  // 6. 后续步骤
  console.log('='.repeat(70));
  console.log('\n📚 5. 后续步骤\n');
  
  console.log('   1. 配置完成后，运行测试：');
  console.log('      npm run test:siliconflow');
  console.log('');
  console.log('   2. 执行数据库迁移：');
  console.log('      npm run db:migrate:v6.2');
  console.log('');
  console.log('   3. 启动服务并测试：');
  console.log('      npm run dev');
  console.log('');
  console.log('   4. 触发 Assets 批量处理：');
  console.log('      curl -X POST http://localhost:3006/api/v1/ai/assets/batch-process \\');
  console.log('        -H "Authorization: Bearer $API_KEY"');
  console.log('');

  console.log('='.repeat(70));
  console.log('\n✅ 生产环境配置检查完成！\n');
}

setupProduction().catch(error => {
  console.error('❌ 配置检查失败:', error);
  process.exit(1);
});
