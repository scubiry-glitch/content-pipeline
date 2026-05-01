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

-- ─────────────────────────────────────────────────────────
-- War Room · 灵光一闪 sparks (12 张候选, 3 组用于 reroll)
-- ─────────────────────────────────────────────────────────

INSERT INTO ceo_war_room_sparks (tag, headline, evidence_short, why_evidence, risk_text, seed_group)
SELECT t, h, e, w::jsonb, r, g FROM (VALUES
  -- Group 0 (默认 4 张)
  ('🔮 跨项目人才嫁接',
   '让 Wei Tan 主导 LP 沟通方案 —— 也许他的二阶思考能给林雾一个交代',
   '过去 6 场会议中，Wei 的 3 次反事实提问被 LP 提到 2 次',
   '["Wei 的 calibration 0.78,组内最高","历史上他在''未走的路''分析中命中率 62%","林雾最近 3 次提问都是反事实,Wei 风格契合"]',
   '⚠ 沈岚可能感觉被绕过 — 提前 1v1 沟通',
   0),
  ('⚡ 张力配对',
   '把 陈汀+沈岚 送进同一个尽调会议 —— 让估值分歧变成尽调标准',
   '两人在估值上的分歧 6 次中 5 次落在同一逻辑分支',
   '["分歧已稳定为''$60M vs $80M'',不是情绪化","把内部冲突转化为外部尽调输出","Wei 之前提议过类似做法,得到 0.7 confidence"]',
   '⚠ 项目方会感觉被''双面夹击'' — 提前打招呼',
   0),
  ('🌱 沉默激活',
   '让 Omar K. 主持下次"未解问题"会议 —— 他的反事实没人接住,也许他自己能接',
   'Omar 在 9 场会议中提出 14 次反事实,12 次未被回应',
   '["Omar 的''二阶+反事实''在专家库 rubric 中得分 0.81","主持位置可以放大他原本被忽视的视角","沉默信号矩阵显示他''高质量低发言''"]',
   '⚠ 内部人员可能不习惯外援主持',
   0),
  ('🔄 角色翻转',
   '让 周劭然 出一次决策提案 —— 听了 48 场会的人最知道盲区',
   '他的会议纪要里包含 23 条"未被采纳但反复出现"的提问',
   '["纪要里他暗中标注了 23 次''重复未答的提问''","他的发言质量 (信息熵) 0.74,被低估","角色翻转能激活他的执行视角"]',
   '⚠ 改变他原本的''低存在感安全区''',
   0),

  -- Group 1 (再来一组之 1)
  ('🪞 镜像演练',
   '让 Sara M. 模拟"如果你是被投公司 CEO" 的反方 —— 法务视角的盲区在合规之外',
   'Sara 过去 8 次法务备忘录中有 4 次提出非合规问题但未被讨论',
   '["Sara 的法务 lens 经常意外打中战略盲区","角色互换能让她跳出合规框架","可与 Wei 的 calibration 形成对照"]',
   '⚠ Sara 可能不愿意越界 — 给她明确的安全网',
   1),
  ('🎲 三角验证',
   '同一个 Stellar 估值问题让 沈岚 / Wei / Omar 各自独立打分 —— 不交流,72 小时后对比',
   '三人之前的分歧从未同步过,各自的逻辑链未被相互检验',
   '["独立评分能暴露各自的判断框架","对比 72h 后再开会效率倍增","Wei 提议过的方法,首次可执行"]',
   '⚠ 行政成本高 — 第一次跑要保护时间',
   1),
  ('💧 注水试验',
   '故意把一个低优先级议题放到下次 IC 头条 —— 看看团队会不会自觉过滤',
   '过去 12 次议程,有 9 次按顺序消化,缺乏自主优先级判断',
   '["被动议程压制了自主判断","注水试验是低风险的元能力训练","Edmondson 心理安全分预测可承受"]',
   '⚠ 个别成员可能误以为这是真议题 — 事后说明',
   1),
  ('🌊 退出复盘',
   '把 Beacon 退出案例做反向推演 —— 如果失败会是哪几个原因',
   '只复盘了成功路径,缺一次"备选反事实"输出',
   '["反事实复盘对未来同类项目复用价值 ×3","团队近 6 月复盘格式化,需要一次破格","Omar 已主动表达兴趣"]',
   '⚠ 团队可能误读为''否定 Beacon 成功''',
   1),

  -- Group 2 (再来一组之 2)
  ('🧭 跨基金对话',
   '主动约 Sequoia Q3 早午餐 —— 不为合作,为打探他们如何看 Stellar',
   'Sequoia 与 Lightspeed 同时扫描 Stellar 的信号未被深度利用',
   '["竞品视角能打破 echo chamber","非交易性约谈门槛低","可能拿到二阶情报"]',
   '⚠ 谈话内容可能被传回项目方',
   2),
  ('🦉 静默 24h',
   '本周三晚 6 点到周四晚 6 点,所有内部群禁言 24h —— 看看是否真有不靠 IM 的事',
   '过去 30 天 IM 流量 +47%,但决策密度未提升',
   '["IM 是注意力税,不是协作工具","静默 24h 已被 5 家基金验证有效","成本极低,失败也只损失 1 天信息"]',
   '⚠ 紧急合规事件可能受影响 — Sara 持紧急通道',
   2),
  ('⚖ 重新调权',
   '把 LP 关切的 4 维 (退出/节奏/沟通/流程) 临时上调到 50%权重 —— 一个月,看 IC 决策会怎么变',
   'LP 关切目前只占 IC 评分 18%,但 Q3 大会权重应该是它',
   '["权重再校准是元决策,稀缺但高 ROI","可逆,30 天后重新评估","与 Wei 的''rubric 反复''意见一致"]',
   '⚠ 会被项目方解读为''越来越保守''',
   2),
  ('🔥 烧毁备忘',
   '本季度所有未结案的备忘 >90 天的,统一''决议归零'' —— 强制重新开始',
   '当前未结案备忘 31 份,平均 76 天,系统性卡死',
   '["决策腐败 (decision rot) 的标准疗法","一次性清算成本远低于持续维护","团队会感谢这个决定"]',
   '⚠ 个别长期项目的人可能感觉被冒犯',
   2)
) AS s(t, h, e, w, r, g)
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_war_room_sparks WHERE headline = s.h
);

COMMIT;

-- 数据自检
DO $$
DECLARE counts text;
BEGIN
  SELECT format(
    'CEO seed: directors=%s · concerns=%s · lines=%s · echos=%s · stakeholders=%s · signals=%s · rubric=%s · reflections=%s · roi=%s · sparks=%s',
    (SELECT COUNT(*) FROM ceo_directors),
    (SELECT COUNT(*) FROM ceo_director_concerns),
    (SELECT COUNT(*) FROM ceo_strategic_lines),
    (SELECT COUNT(*) FROM ceo_strategic_echos),
    (SELECT COUNT(*) FROM ceo_stakeholders),
    (SELECT COUNT(*) FROM ceo_external_signals),
    (SELECT COUNT(*) FROM ceo_rubric_scores),
    (SELECT COUNT(*) FROM ceo_balcony_reflections WHERE user_id = 'system'),
    (SELECT COUNT(*) FROM ceo_time_roi WHERE user_id = 'system'),
    (SELECT COUNT(*) FROM ceo_war_room_sparks)
  ) INTO counts;
  RAISE NOTICE '%', counts;
END $$;
