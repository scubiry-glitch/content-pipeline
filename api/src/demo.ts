// Demo script for 保租房REITs topic
// Day 7 deliverable: End-to-end pipeline demonstration

import { initLLMRouter, isClaudeCodeEnvironment, getClaudeCodeModel, MockProvider } from './providers';
import { initDatabase, enableInMemoryMode } from './db/connection';
import { PipelineOrchestrator } from './pipeline/orchestrator';
import { AssetLibraryService } from './services/assetLibrary';
import * as fs from 'fs';
import * as path from 'path';

async function runDemo() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     内容生产流水线 - 保租房REITs Demo                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // Check environment
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const inClaudeCode = isClaudeCodeEnvironment();

  console.log('🔍 环境检测:');
  console.log(`   Claude Code环境: ${inClaudeCode ? '✓ 是' : '✗ 否'}`);
  if (inClaudeCode) {
    console.log(`   配置模型: ${getClaudeCodeModel()}`);
  }
  console.log(`   ANTHROPIC_API_KEY: ${claudeApiKey ? '✓ 已设置' : '✗ 未设置'}`);
  console.log(`   OPENAI_API_KEY: ${openaiApiKey ? '✓ 已设置' : '✗ 未设置'}`);
  console.log();

  if (!claudeApiKey && !openaiApiKey && !inClaudeCode) {
    console.error('❌ 请设置以下之一:');
    console.error('   - ANTHROPIC_API_KEY (推荐)');
    console.error('   - OPENAI_API_KEY');
    console.error('   - 或在Claude Code环境中运行');
    process.exit(1);
  }

  // Initialize system
  console.log('📦 初始化系统...');

  // Determine which provider to use
  // Priority: 1) Mock mode for demo, 2) API Key for standard API, 3) Claude Code environment
  const useMock = process.argv.includes('--mock') || (!claudeApiKey && !openaiApiKey);
  const useClaudeCode = inClaudeCode && !claudeApiKey && !useMock;

  let llmRouter;

  if (useMock) {
    console.log('   模式: 🎭 Mock模式 (演示用，无实际API调用)');
    // Create router without any providers, then add mock
    const { LLMRouter } = await import('./providers');
    llmRouter = new LLMRouter();
    llmRouter.registerProvider(new MockProvider());
  } else if (claudeApiKey) {
    console.log('   模式: 🔑 标准API调用');
    llmRouter = initLLMRouter({
      claudeApiKey,
      openaiApiKey,
      useClaudeCode: false,
    });
  } else {
    console.log('   模式: Claude Code环境');
    llmRouter = initLLMRouter({
      useClaudeCode: true,
    });
  }

  // Check provider health
  const health = await llmRouter.checkHealth();
  console.log('  LLM Providers:', Object.entries(health).map(([k, v]) => `${k}:${v ? '✓' : '✗'}`).join(', '));

  // Initialize database (if config provided)
  const dbConfig = process.env.DATABASE_URL ? {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'content_pipeline',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  } : null;

  if (dbConfig) {
    await initDatabase(dbConfig);
    console.log('  Database: ✓ (PostgreSQL)');
  } else {
    // Enable in-memory mode for demo
    enableInMemoryMode();
    console.log('  Database: ✓ (In-Memory Mode)');
  }

  // Initialize services
  const pipeline = new PipelineOrchestrator({
    llmRouter,
    enableBlueTeam: true,
    blueTeamRounds: 3,
    maxRetries: 2,
  });

  const assetLibrary = new AssetLibraryService(llmRouter);
  console.log('  Services: ✓');
  console.log();

  // Step 1: Import historical documents (if available)
  console.log('📚 Step 1: 导入历史研究材料');
  const reportDir = '/Users/行业研究/输出/保租房';
  let importedCount = 0;

  if (fs.existsSync(reportDir)) {
    const files = fs.readdirSync(reportDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    console.log(`  发现 ${files.length} 个文档`);

    for (const file of files.slice(0, 5)) {
      try {
        const content = fs.readFileSync(path.join(reportDir, file), 'utf-8');
        await assetLibrary.importAsset({
          content,
          contentType: 'text',
          source: file,
          publishDate: new Date(),
        });
        importedCount++;
        process.stdout.write('.');
      } catch (e) {
        process.stdout.write('x');
      }
    }
    console.log(`\n  ✓ 成功导入 ${importedCount} 个文档`);
  } else {
    console.log('  历史文档目录不存在，跳过导入');
  }
  console.log();

  // Step 2: Run full pipeline
  console.log('🚀 Step 2: 启动内容生产流水线');
  console.log('─────────────────────────────────────────────────────────────');

  const topic = '保租房REITs市场分析与投资机遇研究';
  const context = `
保租房REITs（保障性租赁住房REITs）是中国REITs市场的重要组成部分。
2022年以来，已有多个保租房REITs项目上市，包括华润有巢、上海城投宽庭等。
本项目需要分析：
1. 保租房REITs的政策背景和发展历程
2. 已上市项目的运营表现和估值水平
3. 与市场化长租公寓REITs的对比
4. 投资价值和风险因素
`;

  console.log(`📋 研究主题: ${topic}`);
  console.log();

  const startTime = Date.now();
  const result = await pipeline.run({
    topic,
    context,
    targetAudience: '机构投资者和产业研究人员',
    desiredDepth: 'comprehensive',
  });

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('─────────────────────────────────────────────────────────────');
  console.log();

  // Output results
  console.log('✅ 流水线执行完成');
  console.log(`   耗时: ${duration} 分钟`);
  console.log(`   状态: ${result.status}`);
  console.log();

  console.log('📊 执行日志:');
  for (const log of result.logs) {
    console.log(`   ${log}`);
  }
  console.log();

  if (result.errors.length > 0) {
    console.log('❌ 错误:');
    for (const error of result.errors) {
      console.log(`   ${error}`);
    }
    console.log();
  }

  if (result.documentId) {
    console.log('📝 输出结果:');
    console.log(`   Topic ID: ${result.topicId}`);
    console.log(`   Report ID: ${result.reportId}`);
    console.log(`   Document ID: ${result.documentId}`);
    console.log();
    console.log('💡 下一步:');
    console.log(`   GET /documents/${result.documentId} 获取完整报告`);
    console.log(`   GET /topics/${result.topicId}/blue-team 查看Blue Team审核记录`);
  }

  console.log();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Demo 完成                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

runDemo().catch(console.error);
