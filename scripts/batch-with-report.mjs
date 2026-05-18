#!/usr/bin/env node
/**
 * batch-with-report.mjs
 * 在远程服务器上运行 batch-analyze，每 15 分钟通过 openclaw 向 damon 汇报进度
 *
 * 用法: nohup node scripts/batch-with-report.mjs > /root/pipeline/tmp/batch.log 2>&1 &
 */

import { spawn } from 'child_process';
import pg from 'pg';

const DB_HOST = '127.0.0.1'; // 本地 DB
const DB_CONFIG = {
  host: DB_HOST, port: 5432, database: 'author', user: 'scubiry',
  password: '0tzgzmjUXWCgTed1N28iaA==',
  connectionTimeoutMillis: 10000,
  max: 1,
};
const REPORT_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟

// ---- 进度查询 ----
async function getProgress() {
  const pool = new pg.Pool(DB_CONFIG);
  try {
    const runs = await pool.query("SELECT count(*),state FROM mn_runs WHERE module='mn' GROUP BY state");
    const total = await pool.query("SELECT count(*) FROM assets WHERE source='feishu-minutes' AND (metadata->>'duration_min')::int >= 3");
    const facts = await pool.query('SELECT count(*) FROM content_facts');
    const judgments = await pool.query('SELECT count(*) FROM mn_judgments');
    const tensions = await pool.query('SELECT count(*) FROM mn_tensions');

    const states = {};
    for (const r of runs.rows) states[r.state] = parseInt(r.count);
    const succeeded = states.succeeded || 0;
    const failed = states.failed || 0;
    const totalMeetings = parseInt(total.rows[0].count);

    return {
      total: totalMeetings,
      succeeded,
      failed,
      remaining: totalMeetings - succeeded - failed,
      facts: parseInt(facts.rows[0].count),
      judgments: parseInt(judgments.rows[0].count),
      tensions: parseInt(tensions.rows[0].count),
    };
  } finally {
    await pool.end();
  }
}

// ---- 通过 openclaw 发消息 ----
const FEISHU_TARGET = 'ou_d5f010eae3aedddaa40176f85f8b23b9';

async function reportToDamon(progress) {
  const msg = [
    `📊 Batch Analysis 进度`,
    `✅ ${progress.succeeded}/${progress.total} | ❌ ${progress.failed} | 🔄 ${progress.remaining} 剩余`,
    `facts: ${progress.facts} | judgments: ${progress.judgments} | tensions: ${progress.tensions}`,
  ].join('\n');

  try {
    const proc = spawn('openclaw', [
      'message', 'send',
      '--channel', 'feishu',
      '--target', FEISHU_TARGET,
      '--message', msg,
    ], { timeout: 30000 });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => stdout += d);
    proc.stderr.on('data', (d) => stderr += d);
    proc.on('close', (code) => {
      if (code !== 0) console.error('openclaw exit:', code, stderr.slice(0, 200));
      else console.log('📤 Reported to damon via feishu');
    });
    proc.on('error', (e) => console.error('openclaw spawn error:', e.message));
  } catch (e) {
    console.error('report failed:', e.message);
  }
}

// ---- 主逻辑 ----
async function main() {
  console.log(`\n🚀 Batch with Report started at ${new Date().toISOString()}\n`);

  // 启动 batch-analyze 子进程
  const batch = spawn('node', ['scripts/batch-analyze.mjs'], {
    cwd: '/root/pipeline',
    stdio: 'inherit',
  });

  batch.on('error', (e) => {
    console.error('Batch process error:', e.message);
  });

  batch.on('exit', (code) => {
    console.log(`\nBatch process exited with code ${code}`);
  });

  // 定时汇报
  const reportTimer = setInterval(async () => {
    try {
      const progress = await getProgress();
      console.log(`\n[${new Date().toISOString()}] Progress: ${progress.succeeded}/${progress.total} succeeded, ${progress.failed} failed`);
      await reportToDamon(progress);
    } catch (e) {
      console.error('Progress check failed:', e.message);
    }
  }, REPORT_INTERVAL_MS);

  // 等待 batch 结束
  await new Promise((resolve) => {
    batch.on('exit', resolve);
  });

  // 最终汇报
  clearInterval(reportTimer);
  try {
    const finalProgress = await getProgress();
    console.log(`\n✅ Final: ${finalProgress.succeeded}/${finalProgress.total} succeeded, ${finalProgress.failed} failed`);
    await reportToDamon(finalProgress);
  } catch (e) {
    console.error('Final report failed:', e.message);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
