// Phase H+ · MeetingAxesGenerator
//
// 把 17 张 mn_* 表跨场聚合, 物化为 sources/meeting/axes/ 下:
//   sources/meeting/axes/_index.md
//   sources/meeting/axes/people-人物/_index.md + 承诺兑现.md + 角色变迁.md + 发言质量.md + 沉默信号.md
//   sources/meeting/axes/projects-项目/_index.md + 决策链.md + 假设清单.md + 待决问题.md + 风险热度.md
//   sources/meeting/axes/knowledge-知识/_index.md + 可复用判断.md + 心智模型.md + 认知偏误.md + 反事实.md + 证据等级.md
//   sources/meeting/axes/meta-元信息/_index.md + 决策质量.md + 必要性审计.md + 情绪曲线.md
//
// 命名规则: 中英对照目录 + 中文文件 (选项 A)
//
// 调用:
//   const gen = new MeetingAxesGenerator(deps);
//   await gen.generate({ wikiRoot: '/abs/path/to/data/content-wiki/default', limitPerAxis: 200 });
//
// 不写 entities/concepts/domains, 那些由 wikiGenerator 全权.
// 失败容忍: 任一 deliverable 写入失败 → push 到 errors[], 继续其他 deliverable.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MeetingNotesDeps } from '../types.js';
import {
  renderFrontmatter,
  type WikiFrontmatter,
} from '../../content-library/wiki/wikiFrontmatter.js';
import { slugify } from '../../content-library/wiki/templates.js';

export interface MeetingAxesGenerateOptions {
  wikiRoot: string;
  /** 每个 deliverable 最多渲染多少行 (避免某个 axis 表行数极大时文件爆炸) */
  limitPerAxis?: number;
  /**
   * R3-B · DAG 的 stage 过滤：
   *   - 'L1'：只跑 meta + tension axes wiki + per-meeting health.md
   *   - 'L2'：只跑 people / projects / knowledge axes wiki
   *   - 'all' / undefined：跑全部（默认）
   * 让 ops 在 L1 完成后单独重跑 L2 wiki（或反之），不必整盘重生成。
   */
  stage?: 'L1' | 'L2' | 'all';
}

export interface MeetingAxesGenerateResult {
  wikiRoot: string;
  filesWritten: number;
  axes: Record<string, Record<string, number>>;  // {people:{commitments:62,...}, ...}
  durationMs: number;
  errors: string[];
}

const DEFAULT_LIMIT = 200;

// Phase H+ · 中文友好命名 (选项 A: 中英对照目录 + 中文文件)
const AXIS_DIR: Record<string, string> = {
  people: 'people-人物',
  projects: 'projects-项目',
  knowledge: 'knowledge-知识',
  meta: 'meta-元信息',
};

const DELIVERABLE_LABEL: Record<string, string> = {
  // people
  commitments: '承诺兑现',
  'role-trajectory': '角色变迁',
  'speech-quality': '发言质量',
  'silence-signals': '沉默信号',
  // projects
  decisions: '决策链',
  assumptions: '假设清单',
  'open-questions': '待决问题',
  risks: '风险热度',
  // knowledge
  'reusable-judgments': '可复用判断',
  'mental-models': '心智模型',
  'cognitive-biases': '认知偏误',
  counterfactuals: '反事实',
  'evidence-grades': '证据等级',
  // R3-A · 知识轴扩展 5 子维度（023-knowledge-axis-extension.sql）
  'model-hitrate':    '心智模型命中率',
  'consensus-track':  '共识轨迹',
  'concept-drift':    '概念漂移',
  'topic-lineage':    '议题谱系',
  'external-experts': '外部专家注释',
  // meta
  'decision-quality': '决策质量',
  'necessity-audit': '必要性审计',
  'affect-curve': '情绪曲线',
};

function axisDirName(axis: string): string {
  return AXIS_DIR[axis] ?? axis;
}

function fileLabelFor(deliverable: string): string {
  return DELIVERABLE_LABEL[deliverable] ?? deliverable;
}

/** title → slugified directory name 的统一规则 */
function buildMeetingDirSlug(id: string, title: string | null | undefined): string {
  const cleanTitle = String(title || 'untitled')
    .replace(/\.docx?$|\.txt$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${cleanTitle}-${id.slice(0, 8)}`;
}

export class MeetingAxesGenerator {
  private deps: MeetingNotesDeps;
  /** Phase H+ · meeting id → dir slug 映射, 用于 wikilink */
  private meetingDirById: Map<string, string> = new Map();

  constructor(deps: MeetingNotesDeps) {
    this.deps = deps;
  }

  private async loadMeetingDirMap(): Promise<void> {
    try {
      const r = await this.deps.db.query(`
        SELECT id::text AS id, COALESCE(title, metadata->>'title', 'Untitled') AS title
        FROM assets
        WHERE type IN ('meeting_note','meeting_minutes','transcript')
           OR (metadata ? 'meeting_kind')
      `);
      for (const row of r.rows) {
        this.meetingDirById.set(row.id, buildMeetingDirSlug(row.id, row.title));
      }
    } catch (e) {
      console.warn('[MeetingAxesGenerator] loadMeetingDirMap failed:', (e as Error).message);
    }
  }

  async generate(opts: MeetingAxesGenerateOptions): Promise<MeetingAxesGenerateResult> {
    const started = Date.now();
    const wikiRoot = path.resolve(opts.wikiRoot);
    const limit = opts.limitPerAxis ?? DEFAULT_LIMIT;
    const stage = opts.stage ?? 'all';
    // R3-B · stage gate：L1 = meta + tension（per-meeting 体征）；L2 = people/projects/knowledge（聚合）
    const runL2 = stage === 'all' || stage === 'L2';
    const runL1 = stage === 'all' || stage === 'L1';
    const errors: string[] = [];
    let filesWritten = 0;
    const axes: Record<string, Record<string, number>> = {
      people: {}, projects: {}, knowledge: {}, meta: {},
    };

    // Phase H+ · 预加载 meeting id → dir slug map (供 wikilink 用)
    await this.loadMeetingDirMap();

    // 准备目录 (中英对照目录名)
    for (const sub of ['people', 'projects', 'knowledge', 'meta']) {
      await fs.mkdir(path.join(wikiRoot, 'sources/meeting/axes', axisDirName(sub)), { recursive: true });
    }

    // ── people 轴 ──────────────────────────────────────────────
    if (runL2) {
      const tasks: Array<[string, () => Promise<{ rows: any[] }>, (rows: any[]) => string]> = [
        ['commitments', () => this.deps.db.query(
          `SELECT c.id, c.text, c.due_at, c.state, c.progress,
                  c.meeting_id, c.person_id, c.created_at,
                  mp.canonical_name AS person_name, mp.aliases
             FROM mn_commitments c
             LEFT JOIN mn_people mp ON mp.id = c.person_id
            ORDER BY c.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderCommitments(rows)],

        ['role-trajectory', () => this.deps.db.query(
          `SELECT rt.id, rt.role_label, rt.confidence, rt.detected_at AS computed_at,
                  rt.meeting_id, rt.person_id,
                  mp.canonical_name AS person_name
             FROM mn_role_trajectory_points rt
             LEFT JOIN mn_people mp ON mp.id = rt.person_id
            ORDER BY rt.detected_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderRoleTrajectory(rows)],

        ['speech-quality', () => this.deps.db.query(
          `SELECT sq.id, sq.entropy_pct, sq.followed_up_count, sq.quality_score,
                  sq.meeting_id, sq.person_id, sq.computed_at,
                  mp.canonical_name AS person_name
             FROM mn_speech_quality sq
             LEFT JOIN mn_people mp ON mp.id = sq.person_id
            ORDER BY sq.entropy_pct DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderSpeechQuality(rows)],

        ['silence-signals', () => this.deps.db.query(
          `SELECT ss.id, ss.state, ss.prior_topics_spoken, ss.anomaly_score, ss.computed_at,
                  ss.meeting_id, ss.person_id, ss.topic_id,
                  mp.canonical_name AS person_name
             FROM mn_silence_signals ss
             LEFT JOIN mn_people mp ON mp.id = ss.person_id
            WHERE ss.state IN ('abnormal_silence','absent')
            ORDER BY ss.anomaly_score DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderSilenceSignals(rows)],
      ];
      for (const [name, query, render] of tasks) {
        try {
          const r = await query();
          const md = render(r.rows);
          await fs.writeFile(path.join(wikiRoot, 'sources/meeting/axes', axisDirName('people'), `${fileLabelFor(name)}.md`), md, 'utf8');
          axes.people[name] = r.rows.length;
          filesWritten++;
        } catch (e) {
          errors.push(`people/${name}: ${(e as Error).message}`);
        }
      }
      // _index.md
      try {
        await fs.writeFile(
          path.join(wikiRoot, 'sources/meeting/axes/' + axisDirName('people') + '/_index.md'),
          this.renderAxisIndex('people', '人物', axes.people),
          'utf8',
        );
        filesWritten++;
      } catch (e) {
        errors.push(`people/_index: ${(e as Error).message}`);
      }
    }

    // ── projects 轴 ────────────────────────────────────────────
    if (runL2) {
      const tasks: Array<[string, () => Promise<{ rows: any[] }>, (rows: any[]) => string]> = [
        ['decisions', () => this.deps.db.query(
          `SELECT d.id, d.title, d.rationale, d.confidence, d.is_current, d.created_at,
                  d.meeting_id, d.proposer_person_id, d.based_on_ids,
                  mp.canonical_name AS proposer_name
             FROM mn_decisions d
             LEFT JOIN mn_people mp ON mp.id = d.proposer_person_id
            ORDER BY d.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderDecisions(rows)],

        ['assumptions', () => this.deps.db.query(
          `SELECT a.id, a.text, a.evidence_grade, a.verification_state, a.confidence,
                  a.due_at, a.created_at, a.meeting_id, a.underpins_decision_ids
             FROM mn_assumptions a
            ORDER BY a.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderAssumptions(rows)],

        ['open-questions', () => this.deps.db.query(
          `SELECT oq.id, oq.text, oq.category, oq.status, oq.times_raised,
                  oq.first_raised_meeting_id, oq.last_raised_meeting_id,
                  oq.due_at, oq.created_at, oq.owner_person_id,
                  mp.canonical_name AS owner_name
             FROM mn_open_questions oq
             LEFT JOIN mn_people mp ON mp.id = oq.owner_person_id
            ORDER BY oq.times_raised DESC, oq.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderOpenQuestions(rows)],

        ['risks', () => this.deps.db.query(
          `SELECT r.id, r.text, r.severity, r.mention_count, r.heat_score, r.trend,
                  r.action_taken, r.created_at, r.scope_id
             FROM mn_risks r
            ORDER BY r.heat_score DESC NULLS LAST, r.mention_count DESC LIMIT $1`,
          [limit],
        ), rows => this.renderRisks(rows)],
      ];
      for (const [name, query, render] of tasks) {
        try {
          const r = await query();
          const md = render(r.rows);
          await fs.writeFile(path.join(wikiRoot, 'sources/meeting/axes', axisDirName('projects'), `${fileLabelFor(name)}.md`), md, 'utf8');
          axes.projects[name] = r.rows.length;
          filesWritten++;
        } catch (e) {
          errors.push(`projects/${name}: ${(e as Error).message}`);
        }
      }
      try {
        await fs.writeFile(
          path.join(wikiRoot, 'sources/meeting/axes/' + axisDirName('projects') + '/_index.md'),
          this.renderAxisIndex('projects', '项目', axes.projects),
          'utf8',
        );
        filesWritten++;
      } catch (e) {
        errors.push(`projects/_index: ${(e as Error).message}`);
      }
    }

    // ── knowledge 轴 ──────────────────────────────────────────
    if (runL2) {
      const tasks: Array<[string, () => Promise<{ rows: any[] }>, (rows: any[]) => string]> = [
        ['reusable-judgments', () => this.deps.db.query(
          `SELECT j.id, j.text, j.domain, j.generality_score, j.reuse_count,
                  j.linked_meeting_ids, j.created_at,
                  j.abstracted_from_meeting_id, j.author_person_id,
                  mp.canonical_name AS author_name
             FROM mn_judgments j
             LEFT JOIN mn_people mp ON mp.id = j.author_person_id
            ORDER BY j.generality_score DESC NULLS LAST, j.reuse_count DESC LIMIT $1`,
          [limit],
        ), rows => this.renderJudgments(rows)],

        ['mental-models', () => this.deps.db.query(
          `SELECT mm.id, mm.model_name, mm.correctly_used, mm.outcome,
                  mm.confidence, mm.created_at,
                  mm.meeting_id, mm.invoked_by_person_id, mm.expert_source,
                  mp.canonical_name AS person_name
             FROM mn_mental_model_invocations mm
             LEFT JOIN mn_people mp ON mp.id = mm.invoked_by_person_id
            ORDER BY mm.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderMentalModels(rows)],

        ['cognitive-biases', () => this.deps.db.query(
          `SELECT b.id, b.bias_type, b.where_excerpt, b.severity,
                  b.mitigated, b.mitigation_strategy, b.created_at,
                  b.meeting_id, b.by_person_id,
                  mp.canonical_name AS person_name
             FROM mn_cognitive_biases b
             LEFT JOIN mn_people mp ON mp.id = b.by_person_id
            ORDER BY CASE b.severity WHEN 'high' THEN 3 WHEN 'med' THEN 2 ELSE 1 END DESC, b.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderCognitiveBiases(rows)],

        ['counterfactuals', () => this.deps.db.query(
          `SELECT cf.id, cf.rejected_path, cf.tracking_note, cf.next_validity_check_at AS validity_check_at,
                  cf.created_at, cf.meeting_id, cf.rejected_by_person_id,
                  mp.canonical_name AS person_name
             FROM mn_counterfactuals cf
             LEFT JOIN mn_people mp ON mp.id = cf.rejected_by_person_id
            ORDER BY cf.created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderCounterfactuals(rows)],

        ['evidence-grades', () => this.deps.db.query(
          `SELECT eg.meeting_id, eg.dist_a, eg.dist_b, eg.dist_c, eg.dist_d, eg.computed_at
             FROM mn_evidence_grades eg
            ORDER BY eg.computed_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderEvidenceGrades(rows)],

        // R3-A · 知识轴扩展 5 子维度（023-knowledge-axis-extension.sql）
        // 用 lite renderer：表头 + JSON 行；后续可换成定制 renderer
        ['model-hitrate', () => this.deps.db.query(
          `SELECT scope_id, model_name, window_label, total_invocations, correct_count, hit_rate, computed_at
             FROM mn_model_hitrates ORDER BY hit_rate DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderJsonRows(rows, '心智模型命中率', 'mn_model_hitrates')],

        ['consensus-track', () => this.deps.db.query(
          `SELECT scope_id, topic, meeting_id, consensus_score, dominant_view, created_at
             FROM mn_consensus_tracks ORDER BY created_at DESC LIMIT $1`,
          [limit],
        ), rows => this.renderJsonRows(rows, '共识轨迹', 'mn_consensus_tracks')],

        ['concept-drift', () => this.deps.db.query(
          `SELECT scope_id, term, drift_severity, first_observed_at, last_observed_at
             FROM mn_concept_drifts ORDER BY last_observed_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderJsonRows(rows, '概念漂移', 'mn_concept_drifts')],

        ['topic-lineage', () => this.deps.db.query(
          `SELECT scope_id, topic, birth_meeting_id, health_state, last_active_at, mention_count
             FROM mn_topic_lineage ORDER BY last_active_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderJsonRows(rows, '议题谱系', 'mn_topic_lineage')],

        ['external-experts', () => this.deps.db.query(
          `SELECT name, domain, cite_count, accuracy_score
             FROM mn_external_experts ORDER BY cite_count DESC LIMIT $1`,
          [limit],
        ), rows => this.renderJsonRows(rows, '外部专家注释', 'mn_external_experts')],
      ];
      for (const [name, query, render] of tasks) {
        try {
          const r = await query();
          const md = render(r.rows);
          await fs.writeFile(path.join(wikiRoot, 'sources/meeting/axes', axisDirName('knowledge'), `${fileLabelFor(name)}.md`), md, 'utf8');
          axes.knowledge[name] = r.rows.length;
          filesWritten++;
        } catch (e) {
          errors.push(`knowledge/${name}: ${(e as Error).message}`);
        }
      }
      try {
        await fs.writeFile(
          path.join(wikiRoot, 'sources/meeting/axes/' + axisDirName('knowledge') + '/_index.md'),
          this.renderAxisIndex('knowledge', '知识', axes.knowledge),
          'utf8',
        );
        filesWritten++;
      } catch (e) {
        errors.push(`knowledge/_index: ${(e as Error).message}`);
      }
    }

    // ── meta 轴（L1：per-meeting 体征） ──────────────────────
    if (runL1) {
      const tasks: Array<[string, () => Promise<{ rows: any[] }>, (rows: any[]) => string]> = [
        ['decision-quality', () => this.deps.db.query(
          `SELECT dq.meeting_id, dq.overall, dq.clarity, dq.actionable, dq.traceable,
                  dq.falsifiable, dq.aligned, dq.computed_at
             FROM mn_decision_quality dq
            ORDER BY dq.computed_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderDecisionQuality(rows)],

        ['necessity-audit', () => this.deps.db.query(
          `SELECT mn.meeting_id, mn.verdict, mn.suggested_duration_min,
                  mn.reasons, mn.computed_at
             FROM mn_meeting_necessity mn
            ORDER BY mn.computed_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderNecessityAudit(rows)],

        ['affect-curve', () => this.deps.db.query(
          `SELECT ac.meeting_id, ac.samples, ac.tension_peaks, ac.insight_points, ac.computed_at
             FROM mn_affect_curve ac
            ORDER BY ac.computed_at DESC NULLS LAST LIMIT $1`,
          [limit],
        ), rows => this.renderAffectCurve(rows)],
      ];
      for (const [name, query, render] of tasks) {
        try {
          const r = await query();
          const md = render(r.rows);
          await fs.writeFile(path.join(wikiRoot, 'sources/meeting/axes', axisDirName('meta'), `${fileLabelFor(name)}.md`), md, 'utf8');
          axes.meta[name] = r.rows.length;
          filesWritten++;
        } catch (e) {
          errors.push(`meta/${name}: ${(e as Error).message}`);
        }
      }
      try {
        await fs.writeFile(
          path.join(wikiRoot, 'sources/meeting/axes/' + axisDirName('meta') + '/_index.md'),
          this.renderAxisIndex('meta', '元信息', axes.meta),
          'utf8',
        );
        filesWritten++;
      } catch (e) {
        errors.push(`meta/_index: ${(e as Error).message}`);
      }

      // R3-A · 改动一：per-meeting health.md
      // 把 meta 三表 + tension 按 meeting_id 分桶写到 sources/meeting/per-meeting/{slug}/health.md
      // 让 d 视图 / 静态 wiki 消费方一站式拿到该会议的体征
      try {
        const perMeetingDir = path.join(wikiRoot, 'sources/meeting/per-meeting');
        await fs.mkdir(perMeetingDir, { recursive: true });
        const health = await this.deps.db.query(
          `SELECT a.id::text AS meeting_id, a.title,
                  dq.overall AS quality_overall, dq.clarity, dq.actionable, dq.traceable, dq.falsifiable, dq.aligned, dq.notes,
                  nec.verdict, nec.suggested_duration_min, nec.reasons,
                  ac.samples AS affect_samples, ac.tension_peaks, ac.insight_points,
                  (SELECT COUNT(*)::int FROM mn_tensions WHERE meeting_id = a.id) AS tension_count,
                  (SELECT MAX(intensity)::float FROM mn_tensions WHERE meeting_id = a.id) AS tension_peak
             FROM assets a
             LEFT JOIN mn_decision_quality   dq  ON dq.meeting_id  = a.id
             LEFT JOIN mn_meeting_necessity  nec ON nec.meeting_id = a.id
             LEFT JOIN mn_affect_curve       ac  ON ac.meeting_id  = a.id
            WHERE dq.meeting_id IS NOT NULL OR nec.meeting_id IS NOT NULL OR ac.meeting_id IS NOT NULL
            LIMIT $1`,
          [Math.min(limit, 200)],
        );
        for (const row of health.rows) {
          const slug = this.meetingDirById.get(row.meeting_id) ?? buildMeetingDirSlug(row.meeting_id, row.title);
          const dir = path.join(perMeetingDir, slug);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(path.join(dir, 'health.md'), this.renderPerMeetingHealth(row), 'utf8');
          filesWritten++;
        }
      } catch (e) {
        errors.push(`per-meeting/health: ${(e as Error).message}`);
      }
    }

    // ── 顶层 axes/_index.md ──
    try {
      const total = Object.values(axes).reduce(
        (sum, sub) => sum + Object.values(sub).reduce((s, n) => s + n, 0),
        0,
      );
      const md = [
        renderFrontmatter({
          type: 'index',
          subtype: 'axes',
          app: 'meeting-notes',
          generatedBy: 'meeting-axes-generator',
          lastEditedAt: new Date().toISOString(),
        } as WikiFrontmatter),
        '',
        '# 跨会议 4 轴聚合',
        '',
        `共 ${total} 行数据 · ${Object.keys(axes).length} 轴 · ${Object.values(axes).reduce((s, sub) => s + Object.keys(sub).length, 0)} 个 deliverable`,
        '',
        '## 轴入口',
        '',
        `- [[${axisDirName('people')}/_index|人物轴]] · ${Object.keys(axes.people).length} deliverables`,
        `- [[${axisDirName('projects')}/_index|项目轴]] · ${Object.keys(axes.projects).length} deliverables`,
        `- [[${axisDirName('knowledge')}/_index|知识轴]] · ${Object.keys(axes.knowledge).length} deliverables`,
        `- [[${axisDirName('meta')}/_index|元信息轴]] · ${Object.keys(axes.meta).length} deliverables`,
        '',
      ].join('\n');
      await fs.writeFile(path.join(wikiRoot, 'sources/meeting/axes/_index.md'), md, 'utf8');
      filesWritten++;
    } catch (e) {
      errors.push(`axes/_index: ${(e as Error).message}`);
    }

    return {
      wikiRoot,
      filesWritten,
      axes,
      durationMs: Date.now() - started,
      errors,
    };
  }

  // ============================================================
  // Render helpers
  // ============================================================

  private fmHeader(axis: string, deliverable: string, count: number, title: string): string {
    return [
      renderFrontmatter({
        type: 'axis',
        subtype: `${axis}/${deliverable}`,
        app: 'meeting-notes',
        generatedBy: 'meeting-axes-generator',
        lastEditedAt: new Date().toISOString(),
        factCount: count,
      } as WikiFrontmatter),
      '',
      `# ${title}`,
      '',
      `共 ${count} 条 · 跨所有会议聚合`,
      '',
    ].join('\n');
  }

  /**
   * R3-A · 通用 lite renderer：表头 + JSON 行。
   * 给新增子维度（model_hitrate / consensus_track / concept_drift / topic_lineage / external_experts）兜底用，
   * 后续可换成定制 renderer 输出更易读的 markdown。
   */
  private renderJsonRows(rows: any[], label: string, table: string): string {
    const lines: string[] = [
      renderFrontmatter({
        type: 'source',
        subtype: `axes/knowledge/${table}`,
        app: 'meeting-notes',
        generatedBy: 'meeting-axes-generator',
        lastEditedAt: new Date().toISOString(),
      } as WikiFrontmatter),
      '',
      `# ${label}`,
      '',
      `**source**: \`${table}\` · ${rows.length} 行`,
      '',
    ];
    if (rows.length === 0) {
      lines.push('_暂无数据 · 跑生成中心 → knowledge axis 触发对应 computer_');
    } else {
      lines.push('```json');
      for (const r of rows) lines.push(JSON.stringify(r));
      lines.push('```');
    }
    return lines.join('\n');
  }

  /**
   * R3-A · 改动一：单场会议体征聚合页（health.md）
   * 输出到 sources/meeting/per-meeting/{slug}/health.md
   * 与 GET /meetings/:id/health 同源，方便 d 视图 + 静态 wiki 消费方对照
   */
  private renderPerMeetingHealth(row: any): string {
    const lines: string[] = [
      renderFrontmatter({
        type: 'source',
        subtype: 'per-meeting/health',
        app: 'meeting-notes',
        generatedBy: 'meeting-axes-generator',
        lastEditedAt: new Date().toISOString(),
      } as WikiFrontmatter),
      '',
      `# 会议体征 · ${row.title || row.meeting_id?.slice(0, 8)}`,
      '',
      `> meeting_id: \`${row.meeting_id}\`  ·  来源 GET /meetings/:id/health`,
      '',
      '## 决策质量 · Decision Quality',
      '',
    ];
    if (row.quality_overall !== null && row.quality_overall !== undefined) {
      lines.push(`overall = **${Number(row.quality_overall).toFixed(2)}**`);
      lines.push('');
      lines.push('| 维度 | 分数 |');
      lines.push('| --- | --- |');
      for (const [k, label] of [['clarity', '清晰度'], ['actionable', '可执行'], ['traceable', '可追溯'], ['falsifiable', '可证伪'], ['aligned', '对齐度']] as const) {
        if (row[k] !== null && row[k] !== undefined) {
          lines.push(`| ${label} | ${Number(row[k]).toFixed(2)} |`);
        }
      }
    } else {
      lines.push('_未计算_');
    }
    lines.push('');
    lines.push('## 必要性评估 · Necessity');
    lines.push('');
    if (row.verdict) {
      const verdictLabel = row.verdict === 'async_ok' ? '本可异步' : row.verdict === 'partial' ? '部分必要' : '确有必要';
      lines.push(`**${verdictLabel}** (${row.verdict})`);
      if (row.suggested_duration_min) lines.push(`建议 ${row.suggested_duration_min} 分钟`);
      if (Array.isArray(row.reasons) && row.reasons.length > 0) {
        lines.push('');
        for (const r of row.reasons.slice(0, 5)) {
          lines.push(`- ${r.t || r.k || JSON.stringify(r)}`);
        }
      }
    } else {
      lines.push('_未计算_');
    }
    lines.push('');
    lines.push('## 情绪曲线 · Affect Curve');
    lines.push('');
    if (Array.isArray(row.affect_samples) && row.affect_samples.length > 0) {
      lines.push(`${row.affect_samples.length} 个采样点`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(row.affect_samples.slice(0, 20)));
      lines.push('```');
    } else {
      lines.push('_未计算_');
    }
    lines.push('');
    lines.push('## 张力 · Tension');
    lines.push('');
    const peak = Number(row.tension_peak ?? 0);
    const cnt = Number(row.tension_count ?? 0);
    lines.push(cnt > 0
      ? `${cnt} 处张力 · 峰值 ${peak.toFixed(2)}`
      : '_未识别张力_');
    lines.push('');
    return lines.join('\n');
  }

  private renderAxisIndex(axis: string, label: string, deliverables: Record<string, number>): string {
    const lines: string[] = [
      renderFrontmatter({
        type: 'index',
        subtype: `axes/${axis}`,
        app: 'meeting-notes',
        generatedBy: 'meeting-axes-generator',
        lastEditedAt: new Date().toISOString(),
      } as WikiFrontmatter),
      '',
      `# ${label}轴 · ${axis}`,
      '',
      `${Object.keys(deliverables).length} 个 deliverable, 合计 ${Object.values(deliverables).reduce((s, n) => s + n, 0)} 行.`,
      '',
      '## Deliverables',
      '',
    ];
    for (const [name, n] of Object.entries(deliverables).sort()) {
      const cn = fileLabelFor(name);
      lines.push(`- [[${cn}|${cn}]] (${n} 行)`);
    }
    return lines.join('\n');
  }

  private personLink(name: string | null | undefined): string {
    if (!name) return '_(未知)_';
    return `[[${slugify(name)}|${name}]]`;
  }

  private meetingLink(id: string | null | undefined): string {
    if (!id) return '—';
    // 优先用预加载的 title-id8 dir slug; 没命中则降级到 id-8
    const dirSlug = this.meetingDirById.get(id);
    if (dirSlug) {
      // wikilink 用 dir slug + 简短显示标签 (取 title 部分, 去 -<id8> 后缀)
      const display = dirSlug.replace(/-[0-9a-f]{8}$/, '').slice(0, 30) || id.slice(0, 8);
      return `[[${dirSlug}|${display}]]`;
    }
    return `[[${id.slice(0, 8)}|${id.slice(0, 8)}…]]`;
  }

  private renderCommitments(rows: any[]): string {
    const out = [this.fmHeader('people', 'commitments', rows.length, '承诺兑现 · Commitments')];
    for (const r of rows) {
      const due = r.due_at ? new Date(r.due_at).toISOString().slice(0, 10) : '—';
      const progress = r.progress_pct != null ? `${r.progress_pct}%` : '—';
      out.push(`- ${this.personLink(r.person_name)} · ${r.text ?? ''} · due ${due} · state \`${r.state ?? '—'}\` · ${progress} · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderRoleTrajectory(rows: any[]): string {
    const out = [this.fmHeader('people', 'role-trajectory', rows.length, '角色变迁 · Role Trajectory')];
    for (const r of rows) {
      out.push(`- ${this.personLink(r.person_name)} · 角色 \`${r.role_label ?? '—'}\` · 置信 ${r.confidence ?? '—'} · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderSpeechQuality(rows: any[]): string {
    const out = [this.fmHeader('people', 'speech-quality', rows.length, '发言质量 · Speech Quality')];
    for (const r of rows) {
      const ent = r.entropy_pct != null ? `${r.entropy_pct}%` : '—';
      const fu = r.followed_up_count ?? 0;
      const qa = r.qa_ratio != null ? Number(r.qa_ratio).toFixed(2) : '—';
      out.push(`- ${this.personLink(r.person_name)} · entropy ${ent} · followups ${fu} · qa-ratio ${qa} · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderSilenceSignals(rows: any[]): string {
    const out = [this.fmHeader('people', 'silence-signals', rows.length, '沉默信号 · Silence Signals')];
    for (const r of rows) {
      out.push(`- ${this.personLink(r.person_name)} · state \`${r.state ?? '—'}\` · prior-spoken ${r.prior_topics_spoken ?? 0} · anomaly ${Number(r.anomaly_score ?? 0).toFixed(2)} · topic ${r.topic_id ?? '—'} · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderDecisions(rows: any[]): string {
    const out = [this.fmHeader('projects', 'decisions', rows.length, '决策链 · Decisions')];
    for (const r of rows) {
      const cur = r.is_current ? '✓' : '✗';
      out.push(`- **${r.title ?? '(no title)'}** · 提出 ${this.personLink(r.proposer_name)} · 当前 ${cur} · ${this.meetingLink(r.meeting_id)}`);
      if (r.rationale) out.push(`  > ${String(r.rationale).slice(0, 200)}`);
    }
    return out.join('\n');
  }

  private renderAssumptions(rows: any[]): string {
    const out = [this.fmHeader('projects', 'assumptions', rows.length, '假设清单 · Assumptions')];
    for (const r of rows) {
      out.push(`- ${r.text ?? ''} · 证据 \`${r.evidence_grade ?? '—'}\` · 状态 \`${r.verification_state ?? '—'}\` · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderOpenQuestions(rows: any[]): string {
    const out = [this.fmHeader('projects', 'open-questions', rows.length, '开放问题 · Open Questions')];
    for (const r of rows) {
      out.push(`- ${r.text ?? ''} · 类别 \`${r.category ?? '—'}\` · 状态 \`${r.status ?? '—'}\` · 提及 ${r.times_raised ?? 1} 次 · owner ${this.personLink(r.owner_name)}`);
    }
    return out.join('\n');
  }

  private renderRisks(rows: any[]): string {
    const out = [this.fmHeader('projects', 'risks', rows.length, '风险热度 · Risks')];
    for (const r of rows) {
      out.push(`- ${r.text ?? ''} · severity \`${r.severity ?? '—'}\` · 提及 ${r.mention_count ?? 1} 次 · heat ${Number(r.heat_score ?? 0).toFixed(2)} · trend \`${r.trend ?? 'flat'}\``);
    }
    return out.join('\n');
  }

  private renderJudgments(rows: any[]): string {
    const out = [this.fmHeader('knowledge', 'reusable-judgments', rows.length, '可复用判断 · Reusable Judgments')];
    for (const r of rows) {
      const linked = Array.isArray(r.linked_meeting_ids) ? r.linked_meeting_ids.length : 0;
      out.push(`- ${r.text ?? ''} · 通用度 ${Number(r.generality_score ?? 0).toFixed(2)} · reuse ${r.reuse_count ?? 0} · 关联会议 ${linked} 场 · by ${this.personLink(r.author_name)}`);
    }
    return out.join('\n');
  }

  private renderMentalModels(rows: any[]): string {
    const out = [this.fmHeader('knowledge', 'mental-models', rows.length, '心智模型 · Mental Model Invocations')];
    for (const r of rows) {
      const correct = r.correctly_used ? '✓' : '✗';
      out.push(`- **${r.model_name ?? '—'}** · 调用 ${this.personLink(r.person_name)} · 正确 ${correct} · 结果 \`${r.outcome ?? '—'}\` · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderCognitiveBiases(rows: any[]): string {
    const out = [this.fmHeader('knowledge', 'cognitive-biases', rows.length, '认知偏误 · Cognitive Biases')];
    for (const r of rows) {
      const mit = r.mitigated ? '已缓解' : '未缓解';
      out.push(`- **${r.bias_type ?? '—'}** · severity \`${r.severity ?? '—'}\` · ${mit} · by ${this.personLink(r.person_name)} · ${this.meetingLink(r.meeting_id)}`);
      if (r.where_excerpt) out.push(`  > ${String(r.where_excerpt).slice(0, 150)}`);
    }
    return out.join('\n');
  }

  private renderCounterfactuals(rows: any[]): string {
    const out = [this.fmHeader('knowledge', 'counterfactuals', rows.length, '反事实 · Counterfactuals')];
    for (const r of rows) {
      out.push(`- 拒绝 \`${r.rejected_path ?? ''}\` by ${this.personLink(r.person_name)} · 跟踪 ${r.tracking_note ?? '—'} · ${this.meetingLink(r.meeting_id)}`);
    }
    return out.join('\n');
  }

  private renderEvidenceGrades(rows: any[]): string {
    const out = [this.fmHeader('knowledge', 'evidence-grades', rows.length, '证据等级分布 · Evidence Grades')];
    out.push('| meeting | A | B | C | D |');
    out.push('|---|---|---|---|---|');
    for (const r of rows) {
      out.push(`| ${this.meetingLink(r.meeting_id)} | ${r.dist_a ?? 0} | ${r.dist_b ?? 0} | ${r.dist_c ?? 0} | ${r.dist_d ?? 0} |`);
    }
    return out.join('\n');
  }

  private renderDecisionQuality(rows: any[]): string {
    const out = [this.fmHeader('meta', 'decision-quality', rows.length, '决策质量 · Decision Quality')];
    out.push('| meeting | 总分 | 清晰 | 可执行 | 可追踪 | 可证伪 | 对齐 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of rows) {
      out.push(`| ${this.meetingLink(r.meeting_id)} | ${Number(r.overall ?? 0).toFixed(2)} | ${Number(r.clarity ?? 0).toFixed(2)} | ${Number(r.actionable ?? 0).toFixed(2)} | ${Number(r.traceable ?? 0).toFixed(2)} | ${Number(r.falsifiable ?? 0).toFixed(2)} | ${Number(r.aligned ?? 0).toFixed(2)} |`);
    }
    return out.join('\n');
  }

  private renderNecessityAudit(rows: any[]): string {
    const out = [this.fmHeader('meta', 'necessity-audit', rows.length, '必要性审计 · Necessity Audit')];
    for (const r of rows) {
      const dur = r.suggested_duration_min ? `建议 ${r.suggested_duration_min} 分钟` : '';
      out.push(`- ${this.meetingLink(r.meeting_id)} · verdict \`${r.verdict ?? '—'}\` · ${dur}`);
    }
    return out.join('\n');
  }

  private renderAffectCurve(rows: any[]): string {
    const out = [this.fmHeader('meta', 'affect-curve', rows.length, '情绪曲线 · Affect Curve')];
    for (const r of rows) {
      const sampleCount = Array.isArray(r.samples) ? r.samples.length : 0;
      const peakCount = Array.isArray(r.tension_peaks) ? r.tension_peaks.length : 0;
      out.push(`- ${this.meetingLink(r.meeting_id)} · ${sampleCount} 个采样点 · ${peakCount} 个张力峰`);
    }
    return out.join('\n');
  }
}
