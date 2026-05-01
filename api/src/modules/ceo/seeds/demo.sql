-- CEO 模块 demo 种子数据
--
-- 用法: 不在 ensureCeoModuleSchema 自动执行，避免污染生产 DB。
-- 手动跑:
--   psql $DATABASE_URL -f api/src/modules/ceo/seeds/demo.sql
-- 或通过 npm script:
--   cd api && npm run ceo:seed-demo
--
-- 幂等设计: 全部 INSERT ... WHERE NOT EXISTS / ON CONFLICT 兜底，可重复跑。
-- 数据来源: 07-archive/会议纪要 (20260501)/ 各原型 .html 中的示例。

BEGIN;

-- ─────────────────────────────────────────────────────────
-- Boardroom · 5 位董事 + 5 项关切
-- ─────────────────────────────────────────────────────────

INSERT INTO ceo_directors (name, role, weight)
SELECT n, r, w FROM (VALUES
  ('林雾',    'LP 代表',     1.5::numeric),
  ('Wei Zhao', '独立董事',   1.2::numeric),
  ('Omar K.',  '独立董事',   1.2::numeric),
  ('陆景行',   '创始合伙人', 1.0::numeric),
  ('Sara M.',  '法务顾问',   0.8::numeric)
) AS d(n, r, w)
WHERE NOT EXISTS (SELECT 1 FROM ceo_directors WHERE name = d.n);

INSERT INTO ceo_director_concerns (director_id, topic, status, raised_count)
SELECT d.id, c.topic, 'pending', c.cnt FROM ceo_directors d
  JOIN (VALUES
    ('林雾',    '退出路径再不明确,Q3 LP 大会怎么开?',                3),
    ('Wei Zhao', 'Stellar 估值反复 5 次,你们的尽调标准到底是什么?',  2),
    ('Omar K.',  '基金部署节奏比预期慢 18 个月 — 是市场变了还是判断变了?', 2),
    ('陆景行',   '下个新人储备得抓紧 — Halycon 团队该补人了。',       1),
    ('Sara M.',  'Crucible 的合规备案需在月内完成。',                  1)
  ) AS c(name, topic, cnt) ON c.name = d.name
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_director_concerns x WHERE x.director_id = d.id AND x.topic = c.topic
);

-- ─────────────────────────────────────────────────────────
-- Compass · 6 战略线 + 4 战略回响 + 本周时间分配
-- ─────────────────────────────────────────────────────────

INSERT INTO ceo_strategic_lines (name, kind, alignment_score, status, description)
SELECT n, k, a, 'active', descr FROM (VALUES
  ('Halycon',  'main',   0.82::numeric, 'AI 基础设施战略主线 — Q1 ARR +47%'),
  ('Beacon',   'main',   0.76::numeric, '退出协议主体条款达成 — 5 月签'),
  ('Stellar',  'branch', 0.62::numeric, '尽调反复 5 次的支线 — 估值锚定中'),
  ('Echo',     'branch', 0.58::numeric, '探索期支线 — 等待估值回调'),
  ('Crucible', 'drift',  0.28::numeric, '原 3% 注意力升至 11% — 创始人失联'),
  ('Pyre',     'drift',  0.22::numeric, '业内传言"动向不明"')
) AS s(n, k, a, descr)
WHERE NOT EXISTS (SELECT 1 FROM ceo_strategic_lines WHERE name = s.n);

INSERT INTO ceo_strategic_echos (line_id, hypothesis_text, fact_text, fate)
SELECT l.id, e.hyp, e.fact, e.fate FROM ceo_strategic_lines l
  JOIN (VALUES
    ('Halycon', '加配 $40M AI 基础设施会推高 ARR',          'Q1 ARR +47%, 新签 2 单战略客户',                    'confirm'),
    ('Beacon',  '主体条款 H1 内可签',                       '5 月签字会议已排期',                                 'confirm'),
    ('Stellar', '估值反复 3 次以内可控',                    '已反复 5 次, Sequoia/Lightspeed 同时扫描中',         'refute'),
    ('Crucible', '创始人沟通中断 2 周内会恢复',              '已 4 周失联, 业内自媒体提及"动向不明"',              'refute'),
    ('Pyre',    'Q2 部署节奏可拉回正常',                    '尚未恢复 — 等待市场指标',                           'pending')
  ) AS e(line_name, hyp, fact, fate) ON e.line_name = l.name
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_strategic_echos x WHERE x.line_id = l.id AND x.hypothesis_text = e.hyp
);

INSERT INTO ceo_attention_alloc (week_start, project_id, hours, kind, source)
SELECT DATE_TRUNC('week', NOW())::date, NULL, h, k, 'manual' FROM (VALUES
  (20.14::numeric, 'main'),
  (11.40::numeric, 'branch'),
  (6.46::numeric,  'firefighting')
) AS a(h, k)
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_attention_alloc
   WHERE week_start = DATE_TRUNC('week', NOW())::date AND kind = a.k
);

-- ─────────────────────────────────────────────────────────
-- Situation · 6 利益相关方 + 8 外部信号 + Rubric 矩阵 (5×6)
-- ─────────────────────────────────────────────────────────

INSERT INTO ceo_stakeholders (name, kind, heat, last_signal_at, description)
SELECT n, k, h, NOW() - (offset_days * INTERVAL '1 day'), d FROM (VALUES
  ('LP',           'investor',  0.92::numeric, 0, '林雾 + 3 位机构 — Q3 大会前需要退出方案'),
  ('董事会',       'investor',  0.78::numeric, 1, 'Wei + Omar 主导 — 流程层关切升级'),
  ('同行',         'partner',   0.62::numeric, 3, 'Sequoia + Lightspeed 扫描 Stellar'),
  ('团队',         'employee',  0.55::numeric, 0, '陆景行连续 2 周加班，需关注'),
  ('监管',         'regulator', 0.45::numeric, 5, '港 SFC + 美 SEC — 季度报告改革跟进'),
  ('媒体',         'press',     0.30::numeric, 7, '财经口 — 本季无 inbound'),
  ('Halycon 客户', 'customer',  0.68::numeric, 2, '被投 Halycon 的核心客户群 — Q1 ARR +47% 来源'),
  ('Beacon 客户',  'customer',  0.40::numeric, 4, 'Beacon 退出后将转为新东家关系')
) AS s(n, k, h, offset_days, d)
WHERE NOT EXISTS (SELECT 1 FROM ceo_stakeholders WHERE name = s.n);

-- 历史 12 周时间分配 (供 Tower ⑥ rhythms / RhythmPulse 8 周折线 / Compass alignment 历史使用)
INSERT INTO ceo_attention_alloc (week_start, project_id, hours, kind, source)
SELECT DATE_TRUNC('week', NOW() - (n * INTERVAL '7 day'))::date, NULL, h, k, 'manual' FROM (VALUES
  -- (周偏移, 主线 h, 支线 h, 救火 h)
  (1::int,  18.5::numeric, 10.0::numeric, 8.5::numeric),
  (2::int,  17.0::numeric, 11.5::numeric, 9.5::numeric),
  (3::int,  19.5::numeric, 12.0::numeric, 6.0::numeric),
  (4::int,  18.0::numeric, 11.0::numeric, 9.0::numeric),
  (5::int,  16.5::numeric, 11.5::numeric, 10.0::numeric),
  (6::int,  17.5::numeric, 12.5::numeric, 7.5::numeric),
  (7::int,  20.0::numeric, 11.0::numeric, 6.0::numeric),
  (8::int,  17.0::numeric, 12.0::numeric, 8.5::numeric),
  (9::int,  18.5::numeric, 10.5::numeric, 9.5::numeric),
  (10::int, 19.0::numeric, 12.0::numeric, 7.0::numeric),
  (11::int, 16.0::numeric, 11.0::numeric, 11.0::numeric),
  (12::int, 17.5::numeric, 11.5::numeric, 9.0::numeric)
) AS w(n, m, b, f)
CROSS JOIN LATERAL (VALUES (m, 'main'), (b, 'branch'), (f, 'firefighting')) AS k(h, k)
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_attention_alloc
   WHERE week_start = DATE_TRUNC('week', NOW() - (w.n * INTERVAL '7 day'))::date
     AND kind = k.k
);

-- 历史 12 周 time ROI (供 Tower ⑥ rhythms 透支天数计算)
INSERT INTO ceo_time_roi (user_id, week_start, total_hours, deep_focus_hours, meeting_hours, target_focus_hours, weekly_roi)
SELECT 'system', DATE_TRUNC('week', NOW() - (n * INTERVAL '7 day'))::date, t, df, m, tg, ROUND((df / NULLIF(tg, 0))::numeric, 3) FROM (VALUES
  (1::int,  53.5::numeric, 12.5::numeric, 24.0::numeric, 18.0::numeric),
  (2::int,  55.0::numeric, 10.0::numeric, 28.0::numeric, 18.0::numeric),
  (3::int,  51.0::numeric, 14.0::numeric, 22.0::numeric, 18.0::numeric),
  (4::int,  56.0::numeric, 11.5::numeric, 27.0::numeric, 18.0::numeric),
  (5::int,  58.0::numeric,  9.5::numeric, 30.0::numeric, 18.0::numeric),
  (6::int,  52.5::numeric, 13.0::numeric, 24.0::numeric, 18.0::numeric),
  (7::int,  50.0::numeric, 15.0::numeric, 21.0::numeric, 18.0::numeric),
  (8::int,  54.0::numeric, 12.0::numeric, 26.0::numeric, 18.0::numeric),
  (9::int,  57.5::numeric, 10.5::numeric, 29.5::numeric, 18.0::numeric),
  (10::int, 53.0::numeric, 13.5::numeric, 24.5::numeric, 18.0::numeric),
  (11::int, 60.0::numeric,  8.5::numeric, 32.0::numeric, 18.0::numeric),
  (12::int, 55.5::numeric, 11.0::numeric, 27.5::numeric, 18.0::numeric)
) AS r(n, t, df, m, tg)
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_time_roi
   WHERE user_id = 'system'
     AND week_start = DATE_TRUNC('week', NOW() - (r.n * INTERVAL '7 day'))::date
);

INSERT INTO ceo_external_signals (stakeholder_id, signal_text, source_url, sentiment, captured_at)
SELECT s.id, sig.text, sig.url, sig.sent, NOW() - (sig.days * INTERVAL '1 day') FROM ceo_stakeholders s
  JOIN (VALUES
    ('LP',       '林雾私聊 "Q3 大会前我需要看到方案"',          NULL,                                          0.20::numeric, 6),
    ('LP',       '亚洲 PE 估值 H1 普跌 12%, IRR 中位数下滑',     'https://www.bloomberg.com/...',               -0.65::numeric, 0),
    ('董事会',   'Wei 对 Stellar 备忘录 rubric 7.2 评分',         NULL,                                          -0.30::numeric, 8),
    ('监管',     'SFC 拟将 PE 报告周期由半年改季度',              'https://www.ft.com/...',                      -0.40::numeric, 1),
    ('同行',     'Stellar 估值反复传至 3 家同行',                NULL,                                          -0.55::numeric, 3),
    ('同行',     'Sequoia 完成第 IV 期亚洲基金募集',             'https://www.reuters.com/...',                 -0.10::numeric, 5),
    ('媒体',     'Crucible 业内自媒体 "动向不明"',                NULL,                                          -0.50::numeric, 8),
    ('团队',     'Halycon 创始人通报 Q1 ARR +47%, 新签 2 单',     NULL,                                          0.85::numeric, 2)
  ) AS sig(stakeholder_name, text, url, sent, days) ON sig.stakeholder_name = s.name
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_external_signals x WHERE x.stakeholder_id = s.id AND x.signal_text = sig.text
);

-- Rubric 矩阵 5 维 × 6 利益方
INSERT INTO ceo_rubric_scores (stakeholder_id, dimension, score, evidence_text)
SELECT s.id, r.dim, r.sc, r.evi FROM ceo_stakeholders s
  JOIN (VALUES
    ('LP',     '战略清晰', 0.65::numeric, '退出路径未明 → 战略叙事打折'),
    ('LP',     '节奏匹配', 0.42::numeric, '部署慢 18 月 — LP 节奏期待错配'),
    ('LP',     '沟通透明', 0.50::numeric, '林雾 3 次关切未排进议程'),
    ('LP',     '流程严谨', 0.70::numeric, 'IC 流程已书面化'),
    ('LP',     '回应速度', 0.38::numeric, 'LP 反馈闭环逾期 28 天'),
    ('董事会', '战略清晰', 0.82::numeric, '主线项目数据强 (Halycon/Beacon)'),
    ('董事会', '节奏匹配', 0.68::numeric, '部署慢但理由可解释'),
    ('董事会', '沟通透明', 0.75::numeric, '预读包按月按版本归档'),
    ('董事会', '流程严谨', 0.80::numeric, '尽调五条草稿已起'),
    ('董事会', '回应速度', 0.72::numeric, '关切平均 2 周内回应'),
    ('同行',   '战略清晰', 0.75::numeric, '同行匿名打分'),
    ('同行',   '节奏匹配', 0.65::numeric, '同行匿名打分'),
    ('同行',   '沟通透明', 0.60::numeric, '同行匿名打分'),
    ('同行',   '流程严谨', 0.78::numeric, '同行匿名打分'),
    ('同行',   '回应速度', 0.62::numeric, '同行匿名打分'),
    ('团队',   '战略清晰', 0.78::numeric, '内部 14 人调研'),
    ('团队',   '节奏匹配', 0.65::numeric, '内部 14 人调研'),
    ('团队',   '沟通透明', 0.70::numeric, '内部 14 人调研'),
    ('团队',   '流程严谨', 0.75::numeric, '内部 14 人调研'),
    ('团队',   '回应速度', 0.70::numeric, '内部 14 人调研'),
    ('监管',   '战略清晰', 0.70::numeric, 'Sara 合规自评'),
    ('监管',   '节奏匹配', 0.75::numeric, 'Sara 合规自评'),
    ('监管',   '沟通透明', 0.70::numeric, 'Sara 合规自评'),
    ('监管',   '流程严谨', 0.85::numeric, 'Sara 合规自评 — 备案完备'),
    ('监管',   '回应速度', 0.72::numeric, 'Sara 合规自评'),
    ('媒体',   '战略清晰', 0.68::numeric, '舆情评分'),
    ('媒体',   '节奏匹配', 0.55::numeric, '舆情评分'),
    ('媒体',   '沟通透明', 0.65::numeric, '舆情评分'),
    ('媒体',   '流程严谨', 0.68::numeric, '舆情评分'),
    ('媒体',   '回应速度', 0.60::numeric, '舆情评分')
  ) AS r(stakeholder_name, dim, sc, evi) ON r.stakeholder_name = s.name
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_rubric_scores x
   WHERE x.stakeholder_id = s.id AND x.dimension = r.dim
);

-- ─────────────────────────────────────────────────────────
-- Balcony · 本周时间 ROI + 系统用户的 3 张反思 (system 占位)
-- ─────────────────────────────────────────────────────────

INSERT INTO ceo_time_roi (user_id, week_start, total_hours, deep_focus_hours, meeting_hours, target_focus_hours, weekly_roi)
SELECT 'system', DATE_TRUNC('week', NOW())::date, 56.0, 11.0, 29.0, 18.0, 0.611
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_time_roi WHERE user_id = 'system' AND week_start = DATE_TRUNC('week', NOW())::date
);

INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question, prompt)
SELECT 'system', DATE_TRUNC('week', NOW())::date, p, q, pr FROM (VALUES
  ('direction', '你这周做的决定里,哪一个 是在承诺而非选择?',
                '周三董事会 · AI 基础设施 Q2 加配决议 — 你在会上说"同意",但从张力图看,你在陈汀发言时沉默了 2 分 14 秒。'),
  ('team',      '你有多久 没和周劭然 单独说过话了?',
                '本周他在 4 场会议里都在场,但只发言 3 次,共 47 秒。沉默/发言比从 Q1 4.2 涨到 Q2 11.8。'),
  ('self',      '这周有 一件事,你觉得再来一次会做得不一样吗?',
                'Copilot 注意到:周四和 Omar K. 的会议中,你三次用了"我们再看一下",都在他提反对意见后 8 秒内。')
) AS r(p, q, pr)
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_balcony_reflections x
   WHERE x.user_id = 'system' AND x.week_start = DATE_TRUNC('week', NOW())::date AND x.prism_id = r.p
);

COMMIT;

-- 数据自检
DO $$
DECLARE counts text;
BEGIN
  SELECT format(
    'CEO seed: directors=%s · concerns=%s · lines=%s · echos=%s · stakeholders=%s · signals=%s · rubric=%s · reflections=%s · roi=%s',
    (SELECT COUNT(*) FROM ceo_directors),
    (SELECT COUNT(*) FROM ceo_director_concerns),
    (SELECT COUNT(*) FROM ceo_strategic_lines),
    (SELECT COUNT(*) FROM ceo_strategic_echos),
    (SELECT COUNT(*) FROM ceo_stakeholders),
    (SELECT COUNT(*) FROM ceo_external_signals),
    (SELECT COUNT(*) FROM ceo_rubric_scores),
    (SELECT COUNT(*) FROM ceo_balcony_reflections WHERE user_id = 'system'),
    (SELECT COUNT(*) FROM ceo_time_roi WHERE user_id = 'system')
  ) INTO counts;
  RAISE NOTICE '%', counts;
END $$;
