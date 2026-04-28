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
    {
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
    {
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
    {
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

    // ── meta 轴 ───────────────────────────────────────────────
    {
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
