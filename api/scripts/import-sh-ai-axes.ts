#!/usr/bin/env tsx
// 一次性导入 /Users/scubiry/Downloads/sh-ai-axes.json 的 Tier-1 候选到
// scope=cbb8c5c7-c62b-4216-b9ac-29b61bfbc438 (AI 升级 / 上海汇聚 AI 项目)
// workspace_id 由 037 trigger 自动从 scope/meeting 派生 (惠居上海)。
//
// 导入清单 (16 条):
//   - 10 决策 D-01..D-10 → mn_decisions (DB 当前为 0)
//   - 4 未决问题 Q-01/03/05/06 → mn_open_questions (跳过已存在的 Q-02/04/07)
//   - 2 风险 R-03/06 → mn_risks (跳过已存在的 R-01/02/04/05/07/08)
//
// 人物映射 p1-p4: 用户未给映射, 一律 NULL, 原值落 metadata.original_who
// 会议映射:
//   M-SH-2026-03-31-AI-KICKOFF → e5d6d9f1-82bb-4b49-b3ec-18e490bf208b (启动)
//   M-SH-2026-04-XX-AI-01      → 2a30e464 (两轮 A→B 点规划首轮)
//
// 跑法: cd api && npx tsx scripts/import-sh-ai-axes.ts

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { query } from '../src/db/connection.js';

const SCOPE_ID = 'cbb8c5c7-c62b-4216-b9ac-29b61bfbc438';   // project: AI 升级 (惠居上海)
const MEETING_KICKOFF = 'e5d6d9f1-82bb-4b49-b3ec-18e490bf208b';   // 启动 · 管理模式迭代
const MEETING_ROUND1  = '2a30e464-ab89-4fa1-89d7-5975dee31ce4';   // 两轮 A→B 点规划

// === Tier-1 决策 (10) ===
type DecisionIn = {
  code: string;
  meeting: 'kickoff' | 'round1';
  title: string;
  who: string;
  basedOn: string;
  confidence: number;
  superseded?: boolean;
  supersededByCode?: string; // D-XX
  isCurrent?: boolean;
  note?: string;
};

const DECISIONS: DecisionIn[] = [
  { code: 'D-01', meeting: 'kickoff', title: '立项「上海汇聚 AI 项目」（半年期，1 个月写剧本起步）', who: 'p1',
    basedOn: '永邦自陈 20 年人效未变 + 一濛 2-3 小时分享展示的 AI 可行性', confidence: 0.7 },
  { code: 'D-02', meeting: 'kickoff', title: '6 个月目标：上海汇聚从「AI 应用基本为 0」推到全国头部 · 2-3 个可对外讲的案例', who: 'p1',
    basedOn: '永邦的对标雄心（秒杀集团）+ 一濛的「完全可以」回执', confidence: 0.55,
    note: '目标值偏宏观, 成员乙原话「你这个想要的稍微有点太宏观」' },
  { code: 'D-03', meeting: 'kickoff', title: '三大画面：管一套房 / 管一个人 / 管每个指标', who: 'p1',
    basedOn: '一濛装修评分 demo（改造前 3.5 → 改造后 8.5）+ 美团骑手末端可视类比', confidence: 0.65,
    superseded: true, supersededByCode: 'D-07',
    note: '颗粒度粗, 4 月场展开为 8 个具体候选 B 点' },
  { code: 'D-04', meeting: 'kickoff', title: '团队从三人组（永邦 + 一濛 + 成员甲）扩为加入成员乙的四人组', who: 'p1',
    basedOn: '成员乙现场请求加入「可以参加他」, 永邦同意', confidence: 0.85 },
  { code: 'D-05', meeting: 'kickoff', title: '第一阶段 1 个月「写剧本」：把场景拆成具体 B 点画面', who: 'p1',
    basedOn: '成员乙「最缺的是画面感」+ 一濛「demo 出来你看是不是你想要的」', confidence: 0.78,
    note: '被 D-08 进一步细化为具体节奏 (4/20 / 4/30 / 5/1), 但不是替换' },
  { code: 'D-06', meeting: 'kickoff', title: '复用现成 AI 工具栈：飞书会议纪要 + 待办、小红书舆情爬虫、参数化看板/PPT', who: 'p2',
    basedOn: '现场已演示并跑通（会议纪要、舆情爬虫已上线）', confidence: 0.92 },
  { code: 'D-07', meeting: 'round1', title: 'B 点收敛到 8 个候选（P0-P2 三档）', who: 'p1',
    basedOn: '首轮 119 分钟头脑风暴 + 永邦反复强调「先穷尽不归类」', confidence: 0.7, isCurrent: true,
    note: '替代 D-03 的三大画面, 把粗颗粒度展开为可调度的优先级队列' },
  { code: 'D-08', meeting: 'round1', title: '节奏：4/20 前开第 2 次会，4/30 前开第 3 次，5/1 正式启动 2-3 个项目', who: 'p1',
    basedOn: '永邦设的硬节点 + 团队对「不要追求高大上」的共识', confidence: 0.8, isCurrent: true },
  { code: 'D-09', meeting: 'round1', title: '数据通路需要新增「写 scale (规则编排)」角色，而非仅「写 SQL」', who: 'p2',
    basedOn: '一濛指出大模型应用时口径会持续迭代; 永邦立刻代入「小花、小胖」加班赶数据现状', confidence: 0.72, isCurrent: true },
  { code: 'D-10', meeting: 'round1', title: '概念分离：「商品」（07/09 等对外销售物）vs「产品」（内部工具）', who: 'p1',
    basedOn: '永邦自陈在成都已分清, 上海汇聚需要内部对齐', confidence: 0.85, isCurrent: true },
];

// === Tier-1 未决问题 (4) ===
type QuestionIn = {
  code: string; text: string; raisedAt: 'kickoff' | 'round1'; lastRaisedAt: 'kickoff' | 'round1';
  by: string; timesRaised: number; category: 'strategic' | 'analytical' | 'governance' | 'operational';
  status: 'open' | 'assigned' | 'chronic' | 'resolved'; owner?: string; due?: string; note?: string;
};

const QUESTIONS: QuestionIn[] = [
  { code: 'Q-01', text: '颠覆式 vs 提效式 — 项目到底走哪条路？', raisedAt: 'kickoff', lastRaisedAt: 'round1',
    by: 'p1', timesRaised: 2, category: 'strategic', status: 'chronic',
    note: '永邦反复回到「我要把所有推翻」, 成员乙/王丽反复回到「业务有交叉协作, 该传统管理就传统管理」。两场都未真正收敛。' },
  { code: 'Q-03', text: '销售型岗位是否需要 AI 强行程管控？', raisedAt: 'round1', lastRaisedAt: 'round1',
    by: 'p3', timesRaised: 1, category: 'strategic', status: 'open',
    note: '王丽明确反对（销售有自然淘汰）, 永邦认为末端可见性差必须上 — 4 月场 T1 张力 0.72, 是项目最热的未决冲突。' },
  { code: 'Q-05', text: '数据基础设施：自建 vs 走集团？', raisedAt: 'kickoff', lastRaisedAt: 'round1',
    by: 'p1', timesRaised: 2, category: 'governance', status: 'chronic',
    note: '3/31 永邦担心安全/权限, 一濛说集团 c1-c4 够用; 4 月场永邦发现集团进度拖了半年, 倾向自建但承认合规风险。两难, 未决。' },
  { code: 'Q-06', text: '管理者怎么管管理者？— 一阶段 → 二阶段 → 管理者层级的路径', raisedAt: 'kickoff', lastRaisedAt: 'kickoff',
    by: 'p3', timesRaised: 1, category: 'analytical', status: 'open',
    note: '成员甲在 3/31 直接发问, 永邦没正面回答而是转到「下级动力靠上级逼」的吐槽。4 月场未再被提起, 风险是被默默放下。' },
];

// === Tier-1 风险 (2) ===
type RiskIn = {
  code: string; text: string; mentions: number; hasAction: boolean; action?: string;
  severity: 'low' | 'med' | 'high' | 'critical'; heat: number; meetings: number;
  trend: 'up' | 'flat' | 'down'; note?: string;
};

const RISKS: RiskIn[] = [
  { code: 'R-03', text: '颠覆式 vs 提效式 路线未对齐（对应 Q-01）', mentions: 4, hasAction: false,
    severity: 'med', heat: 0.72, meetings: 2, trend: 'flat',
    note: '永邦坚持颠覆, 成员乙/王丽推动提效。如果不在 4/20-4/30 两轮内对齐, 5/1 启动会是分裂的。' },
  { code: 'R-06', text: '集团产品线进度滞后（驾驶舱/人对人排班已等半年），自建会增加维护负担', mentions: 3, hasAction: true,
    action: '永邦决定自建, 但具体方案/人员未定',
    severity: 'med', heat: 0.7, meetings: 1, trend: 'up',
    note: '4 月场新增, 这是项目从「等集团」转向「自启动」的关键拐点。负面影响是合规暴露上升。' },
];

async function main() {
  const meetingMap = { kickoff: MEETING_KICKOFF, round1: MEETING_ROUND1 };
  console.log('[import] meeting map:', meetingMap);

  // 1. 验证 scope 存在 + 取 workspace_id (确认是惠居上海的)
  const s = await query(
    `SELECT id::text, name, workspace_id::text AS ws FROM mn_scopes WHERE id = $1::uuid`,
    [SCOPE_ID],
  );
  if (s.rows.length === 0) throw new Error(`scope ${SCOPE_ID} not found`);
  console.log('[import] scope:', s.rows[0]);

  // 3. 插决策 (两遍: 第一遍插所有, 拿到 D-XX → uuid; 第二遍 UPDATE superseded_by_id)
  console.log(`[import] inserting ${DECISIONS.length} decisions...`);
  const decisionUuid: Record<string, string> = {};
  for (const d of DECISIONS) {
    const ins = await query(
      `INSERT INTO mn_decisions
         (scope_id, meeting_id, title, confidence, is_current, rationale, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
       RETURNING id::text`,
      [
        SCOPE_ID,
        meetingMap[d.meeting],
        d.title,
        d.confidence,
        d.isCurrent !== false && !d.superseded,
        d.basedOn,
        JSON.stringify({
          source: 'sh-ai-axes.json import',
          original_code: d.code,
          original_who: d.who,
          ...(d.note ? { import_note: d.note } : {}),
        }),
      ],
    );
    decisionUuid[d.code] = ins.rows[0].id as string;
    console.log(`  ${d.code} → ${ins.rows[0].id}`);
  }

  // 第二遍: 把 D-03 → D-07 的 supersededBy 关系写上
  for (const d of DECISIONS) {
    if (d.supersededByCode && decisionUuid[d.supersededByCode]) {
      await query(
        `UPDATE mn_decisions SET superseded_by_id = $2::uuid, is_current = FALSE WHERE id = $1::uuid`,
        [decisionUuid[d.code], decisionUuid[d.supersededByCode]],
      );
      console.log(`  ${d.code} superseded_by ${d.supersededByCode}`);
    }
  }

  // 4. 插未决问题
  console.log(`[import] inserting ${QUESTIONS.length} open questions...`);
  for (const q of QUESTIONS) {
    const ins = await query(
      `INSERT INTO mn_open_questions
         (scope_id, text, category, status, times_raised,
          first_raised_meeting_id, last_raised_meeting_id, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8::jsonb)
       RETURNING id::text`,
      [
        SCOPE_ID,
        q.text,
        q.category,
        q.status,
        q.timesRaised,
        meetingMap[q.raisedAt],
        meetingMap[q.lastRaisedAt],
        JSON.stringify({
          source: 'sh-ai-axes.json import',
          original_code: q.code,
          original_by: q.by,
          ...(q.note ? { import_note: q.note } : {}),
        }),
      ],
    );
    console.log(`  ${q.code} → ${ins.rows[0].id}`);
  }

  // 5. 插风险
  console.log(`[import] inserting ${RISKS.length} risks...`);
  for (const rk of RISKS) {
    const ins = await query(
      `INSERT INTO mn_risks
         (scope_id, text, severity, mention_count, heat_score, trend, action_taken, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id::text`,
      [
        SCOPE_ID,
        rk.text,
        rk.severity,
        rk.mentions,
        rk.heat,
        rk.trend,
        rk.hasAction,
        JSON.stringify({
          source: 'sh-ai-axes.json import',
          original_code: rk.code,
          ...(rk.action ? { action: rk.action } : {}),
          ...(rk.note ? { import_note: rk.note } : {}),
        }),
      ],
    );
    console.log(`  ${rk.code} → ${ins.rows[0].id}`);
  }

  // 6. 摘要
  const counts = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM mn_decisions WHERE scope_id = $1::uuid) AS decisions,
       (SELECT COUNT(*)::int FROM mn_open_questions WHERE scope_id = $1::uuid) AS questions,
       (SELECT COUNT(*)::int FROM mn_risks WHERE scope_id = $1::uuid) AS risks`,
    [SCOPE_ID],
  );
  console.log('[import] post-import counts:', counts.rows[0]);
  console.log('[import] done');
  process.exit(0);
}

main().catch((e) => {
  console.error('[import] failed:', e);
  process.exit(1);
});
