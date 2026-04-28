// Phase H+ · MeetingScopeGenerator
//
// 把 mn_scopes + mn_scope_members 物化为:
//   scopes/_index.md                              # 全 scope 总览
//   scopes/{project,client,topic}/<slug>/_index.md  # 每 scope 主页
//     · header (kind/name/slug/description)
//     · meetings 列表 (该 scope 绑定的会议, 含 title + date)
//     · 跨场 axes 摘要 (仅限该 scope 内 meetings):
//       - people: commitments
//       - projects: decisions / open questions / risks
//       - knowledge: judgments
//       - meta: decision-quality 平均
//     · 参与者跨场聚合 (按 speaking_pct 总和)
//
// 用法:
//   const gen = new MeetingScopeGenerator(deps);
//   await gen.generate({ wikiRoot: '/abs/path' });
//   // 或单 scope: await gen.generate({ wikiRoot, scopeId: '<uuid>' });

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MeetingNotesDeps } from '../types.js';
import {
  renderFrontmatter,
  type WikiFrontmatter,
} from '../../content-library/wiki/wikiFrontmatter.js';
import { slugify } from '../../content-library/wiki/templates.js';

export interface MeetingScopeGenerateOptions {
  wikiRoot: string;
  /** 单 scope 模式: 仅重生指定 scope (claude-cli run 完成后跨 scope 触发用) */
  scopeId?: string;
  /** 每 scope 内 axes 行数上限 */
  limitPerAxis?: number;
}

export interface MeetingScopeGenerateResult {
  wikiRoot: string;
  filesWritten: number;
  scopes: Array<{ id: string; kind: string; name: string; meetingCount: number }>;
  durationMs: number;
  errors: string[];
}

const DEFAULT_LIMIT = 100;

interface ScopeRow {
  id: string;
  kind: string;
  slug: string;
  name: string;
  description: string | null;
}

interface MeetingRow {
  id: string;
  title: string | null;
  occurred_at: string | null;
  meeting_kind: string | null;
}

export class MeetingScopeGenerator {
  private deps: MeetingNotesDeps;
  constructor(deps: MeetingNotesDeps) {
    this.deps = deps;
  }

  async generate(opts: MeetingScopeGenerateOptions): Promise<MeetingScopeGenerateResult> {
    const started = Date.now();
    const wikiRoot = path.resolve(opts.wikiRoot);
    const limit = opts.limitPerAxis ?? DEFAULT_LIMIT;
    const errors: string[] = [];
    let filesWritten = 0;

    // 准备目录
    for (const sub of ['project', 'client', 'topic']) {
      await fs.mkdir(path.join(wikiRoot, 'sources/meeting/scopes', sub), { recursive: true });
    }

    // ── 加载 scopes ──
    const scopesQuery = opts.scopeId
      ? `SELECT id::text AS id, kind, slug, name, description FROM mn_scopes WHERE id::text = $1`
      : `SELECT id::text AS id, kind, slug, name, description FROM mn_scopes WHERE status = 'active' ORDER BY kind, name`;
    const scopesParams = opts.scopeId ? [opts.scopeId] : [];
    const sr = await this.deps.db.query(scopesQuery, scopesParams);
    const scopes: ScopeRow[] = sr.rows;

    const summary: Array<{ id: string; kind: string; name: string; meetingCount: number }> = [];

    // ── 每 scope 生成 _index.md ──
    for (const scope of scopes) {
      try {
        const result = await this.writeScopeIndex(wikiRoot, scope, limit);
        summary.push({
          id: scope.id,
          kind: scope.kind,
          name: scope.name,
          meetingCount: result.meetingCount,
        });
        filesWritten++;
      } catch (e) {
        errors.push(`scope ${scope.kind}/${scope.name}: ${(e as Error).message}`);
      }
    }

    // ── scopes/_index.md 总览 (仅在全量模式) ──
    if (!opts.scopeId) {
      try {
        await fs.writeFile(
          path.join(wikiRoot, 'sources/meeting/scopes', '_index.md'),
          this.renderTopIndex(summary),
          'utf8',
        );
        filesWritten++;
      } catch (e) {
        errors.push(`scopes/_index: ${(e as Error).message}`);
      }
    }

    return {
      wikiRoot,
      filesWritten,
      scopes: summary,
      durationMs: Date.now() - started,
      errors,
    };
  }

  // ============================================================
  // 单 scope 主页
  // ============================================================

  private async writeScopeIndex(
    wikiRoot: string,
    scope: ScopeRow,
    limit: number,
  ): Promise<{ meetingCount: number }> {
    // 1. 拉绑定的 meetings
    const mr = await this.deps.db.query(
      `SELECT a.id::text AS id,
              COALESCE(a.title, a.metadata->>'title', 'Untitled') AS title,
              COALESCE(a.metadata->>'occurred_at', a.metadata->'analysis'->>'date') AS occurred_at,
              a.metadata->>'meeting_kind' AS meeting_kind
         FROM mn_scope_members sm
         JOIN assets a ON a.id::text = sm.meeting_id::text
        WHERE sm.scope_id::text = $1
          AND COALESCE((a.metadata->>'archived')::boolean, false) = false
        ORDER BY COALESCE(a.metadata->>'occurred_at', a.metadata->'analysis'->>'date', a.created_at::text) DESC`,
      [scope.id],
    );
    const meetings: MeetingRow[] = mr.rows;
    const meetingIds = meetings.map((m) => m.id);

    // 2. 跨场 axes 摘要 (仅限该 scope meetings) — 全部并行
    const [commitmentsRes, decisionsRes, openQRes, risksRes, judgmentsRes, dqRes] = await Promise.all([
      meetingIds.length > 0
        ? this.deps.db.query(
            `SELECT c.id, c.text, c.due_at, c.state, c.progress, c.meeting_id,
                    mp.canonical_name AS person_name
               FROM mn_commitments c
               LEFT JOIN mn_people mp ON mp.id = c.person_id
              WHERE c.meeting_id::text = ANY($1::text[])
              ORDER BY c.created_at DESC LIMIT $2`,
            [meetingIds, limit],
          )
        : Promise.resolve({ rows: [] }),
      meetingIds.length > 0
        ? this.deps.db.query(
            `SELECT d.id, d.title, d.is_current, d.meeting_id,
                    mp.canonical_name AS proposer_name
               FROM mn_decisions d
               LEFT JOIN mn_people mp ON mp.id = d.proposer_person_id
              WHERE d.meeting_id::text = ANY($1::text[]) OR d.scope_id::text = $2
              ORDER BY d.created_at DESC LIMIT $3`,
            [meetingIds, scope.id, limit],
          )
        : this.deps.db.query(
            `SELECT id, title, is_current, meeting_id, NULL::text AS proposer_name
               FROM mn_decisions WHERE scope_id::text = $1 LIMIT $2`,
            [scope.id, limit],
          ),
      this.deps.db.query(
        `SELECT id, text, category, status, times_raised, owner_person_id
           FROM mn_open_questions WHERE scope_id::text = $1
          ORDER BY times_raised DESC LIMIT $2`,
        [scope.id, limit],
      ),
      this.deps.db.query(
        `SELECT id, text, severity, mention_count, heat_score, trend
           FROM mn_risks WHERE scope_id::text = $1
          ORDER BY heat_score DESC NULLS LAST LIMIT $2`,
        [scope.id, limit],
      ),
      meetingIds.length > 0
        ? this.deps.db.query(
            `SELECT id, text, generality_score, reuse_count, abstracted_from_meeting_id
               FROM mn_judgments
              WHERE abstracted_from_meeting_id::text = ANY($1::text[])
                 OR linked_meeting_ids && (SELECT array_agg(id::uuid) FROM unnest($1::text[]) AS t(id))
              ORDER BY generality_score DESC NULLS LAST LIMIT $2`,
            [meetingIds, limit],
          )
        : Promise.resolve({ rows: [] }),
      meetingIds.length > 0
        ? this.deps.db.query(
            `SELECT meeting_id, overall, clarity, actionable, traceable,
                    falsifiable, aligned
               FROM mn_decision_quality
              WHERE meeting_id::text = ANY($1::text[])`,
            [meetingIds],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    // 3. 参与者跨场 speaking_pct 聚合
    const speakers = meetingIds.length > 0
      ? await this.deps.db.query(
          `SELECT mp.canonical_name AS name, mp.id::text AS person_id,
                  ROUND(AVG(sq.entropy_pct)::numeric, 1) AS avg_entropy,
                  COUNT(DISTINCT sq.meeting_id)::int AS appeared_in
             FROM mn_speech_quality sq
             JOIN mn_people mp ON mp.id = sq.person_id
            WHERE sq.meeting_id::text = ANY($1::text[])
            GROUP BY mp.id, mp.canonical_name
            ORDER BY appeared_in DESC, avg_entropy DESC LIMIT 30`,
          [meetingIds],
        )
      : { rows: [] };

    // 4. render
    const md = this.renderScopeIndex({
      scope,
      meetings,
      commitments: commitmentsRes.rows,
      decisions: decisionsRes.rows,
      openQuestions: openQRes.rows,
      risks: risksRes.rows,
      judgments: judgmentsRes.rows,
      decisionQuality: dqRes.rows,
      speakers: speakers.rows,
    });

    const slug = `${scope.slug || slugify(scope.name)}`;
    const filePath = path.join(wikiRoot, 'sources/meeting/scopes', scope.kind, slug, '_index.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, md, 'utf8');

    return { meetingCount: meetings.length };
  }

  private renderScopeIndex(input: {
    scope: ScopeRow;
    meetings: MeetingRow[];
    commitments: any[];
    decisions: any[];
    openQuestions: any[];
    risks: any[];
    judgments: any[];
    decisionQuality: any[];
    speakers: any[];
  }): string {
    const { scope, meetings, commitments, decisions, openQuestions, risks, judgments, decisionQuality, speakers } = input;

    const fm: WikiFrontmatter = {
      type: 'scope',
      subtype: scope.kind,
      canonical_name: scope.name,
      slug: scope.slug,
      app: 'meeting-notes',
      generatedBy: 'meeting-scope-generator',
      lastEditedAt: new Date().toISOString(),
      factCount: commitments.length + decisions.length + openQuestions.length + risks.length + judgments.length,
      entityCount: meetings.length,
    };

    const out: string[] = [
      renderFrontmatter(fm), '',
      `# ${scope.name}`, '',
      `**类型**: \`${scope.kind}\` · **slug**: \`${scope.slug}\` · **scope_id**: \`${scope.id}\``,
    ];
    if (scope.description) out.push('', scope.description);
    out.push('', '');

    // ── meetings 列表 ──
    out.push(`## 会议列表 · ${meetings.length} 场`, '');
    if (meetings.length === 0) {
      out.push('_(无绑定会议)_', '');
    } else {
      for (const m of meetings) {
        const date = m.occurred_at ? String(m.occurred_at).slice(0, 10) : '—';
        const kind = m.meeting_kind ? ` \`${m.meeting_kind}\`` : '';
        out.push(`- [[${m.id.slice(0, 8)}|${m.title}]] · ${date}${kind}`);
      }
      out.push('');
    }

    // ── 参与者跨场 ──
    if (speakers.length > 0) {
      out.push('## 参与者跨场聚合', '');
      out.push('| 人物 | 出场会议数 | 平均 entropy% |');
      out.push('|---|---|---|');
      for (const s of speakers) {
        out.push(`| [[${slugify(s.name)}|${s.name}]] | ${s.appeared_in} | ${s.avg_entropy ?? '—'} |`);
      }
      out.push('');
    }

    // ── 4 轴摘要 ──
    if (decisions.length > 0) {
      out.push(`## 决策链 · ${decisions.length}`, '');
      for (const d of decisions.slice(0, 20)) {
        const cur = d.is_current ? '✓' : '✗';
        const prop = d.proposer_name ? ` · 提出 [[${slugify(d.proposer_name)}|${d.proposer_name}]]` : '';
        out.push(`- **${d.title ?? '(no title)'}** · 当前 ${cur}${prop}`);
      }
      out.push('');
    }

    if (commitments.length > 0) {
      out.push(`## 承诺兑现 · ${commitments.length}`, '');
      for (const c of commitments.slice(0, 20)) {
        const due = c.due_at ? new Date(c.due_at).toISOString().slice(0, 10) : '—';
        const person = c.person_name ? `[[${slugify(c.person_name)}|${c.person_name}]]` : '_(未知)_';
        out.push(`- ${person} · ${c.text ?? ''} · due ${due} · \`${c.state ?? '—'}\``);
      }
      out.push('');
    }

    if (openQuestions.length > 0) {
      out.push(`## 开放问题 · ${openQuestions.length}`, '');
      for (const q of openQuestions.slice(0, 20)) {
        out.push(`- ${q.text ?? ''} · 类别 \`${q.category}\` · 状态 \`${q.status}\` · 提及 ${q.times_raised} 次`);
      }
      out.push('');
    }

    if (risks.length > 0) {
      out.push(`## 风险热度 · ${risks.length}`, '');
      for (const r of risks.slice(0, 20)) {
        out.push(`- ${r.text ?? ''} · severity \`${r.severity}\` · heat ${Number(r.heat_score ?? 0).toFixed(2)} · 提及 ${r.mention_count} 次`);
      }
      out.push('');
    }

    if (judgments.length > 0) {
      out.push(`## 可复用判断 · ${judgments.length}`, '');
      for (const j of judgments.slice(0, 20)) {
        out.push(`- ${j.text ?? ''} · 通用度 ${Number(j.generality_score ?? 0).toFixed(2)} · reuse ${j.reuse_count}`);
      }
      out.push('');
    }

    if (decisionQuality.length > 0) {
      const avg = (k: string) =>
        decisionQuality.reduce((s, x) => s + Number(x[k] ?? 0), 0) / decisionQuality.length;
      out.push('## 决策质量平均', '');
      out.push(`- overall: ${avg('overall').toFixed(2)}`);
      out.push(`- 清晰: ${avg('clarity').toFixed(2)} · 可执行: ${avg('actionable').toFixed(2)} · 可追踪: ${avg('traceable').toFixed(2)} · 可证伪: ${avg('falsifiable').toFixed(2)} · 对齐: ${avg('aligned').toFixed(2)}`);
      out.push('');
    }

    return out.join('\n');
  }

  private renderTopIndex(summary: Array<{ id: string; kind: string; name: string; meetingCount: number }>): string {
    const fm: WikiFrontmatter = {
      type: 'index',
      subtype: 'scopes',
      app: 'meeting-notes',
      generatedBy: 'meeting-scope-generator',
      lastEditedAt: new Date().toISOString(),
    };

    const byKind: Record<string, typeof summary> = {};
    for (const s of summary) {
      byKind[s.kind] = byKind[s.kind] ?? [];
      byKind[s.kind].push(s);
    }

    const out: string[] = [
      renderFrontmatter(fm), '',
      '# Scope 总览', '',
      `共 ${summary.length} 个 scope · ${summary.reduce((s, x) => s + x.meetingCount, 0)} 场会议绑定.`, '',
    ];

    for (const kindName of [['project', '项目'], ['client', '客户'], ['topic', '主题']]) {
      const list = byKind[kindName[0]] ?? [];
      out.push(`## ${kindName[1]} · ${kindName[0]} (${list.length})`, '');
      for (const s of list.sort((a, b) => b.meetingCount - a.meetingCount)) {
        out.push(`- [[${s.kind}/${slugify(s.name)}/_index|${s.name}]] · ${s.meetingCount} 场会议`);
      }
      out.push('');
    }

    return out.join('\n');
  }
}
