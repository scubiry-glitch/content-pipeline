// _apiAdapters.ts — 共享 API → ANALYSIS 形状适配器
// 三个 Variant（A/B/C 视图）共用：getMeetingDetail(view='A') 返回 sections-based 数据，
// 此 adapter 映射到 fixture ANALYSIS 形状供前端渲染。

import { ANALYSIS } from './_fixtures';

export interface ApiMeetingMeta {
  title: string | null;
  date: string | null;
  participants: Array<{ name: string; role?: string }>;
}

/**
 * 把 GET /meetings/:id/detail?view=A 的 analysis payload 映射成 fixture 形状。
 * 注意 engine 用连字符 IDs（'new-cognition'/'focus-map'/'cross-view'），
 * 兼容旧下划线形式。
 */
export function adaptApiAnalysis(data: any): typeof ANALYSIS {
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];

  const secAny = (id: string, alt?: string) =>
    sections.find((s: any) => s?.id === id) ?? (alt ? sections.find((s: any) => s?.id === alt) : undefined);

  const minutesBody = secAny('minutes')?.body ?? {};
  const tensionBody: any[] = Array.isArray(secAny('tension')?.body) ? secAny('tension').body : [];
  const newCogBody: any[] = Array.isArray(secAny('new-cognition', 'new_cognition')?.body)
    ? secAny('new-cognition', 'new_cognition').body : [];
  const focusBody: any[] = Array.isArray(secAny('focus-map', 'focus_map')?.body)
    ? secAny('focus-map', 'focus_map').body : [];
  const consensusBody: any[] = Array.isArray(secAny('consensus')?.body) ? secAny('consensus').body : [];
  const crossBody: any[] = Array.isArray(secAny('cross-view', 'cross_view')?.body)
    ? secAny('cross-view', 'cross_view').body : [];

  // SCQA 四要素必须四段齐全才采用，缺任一段一律置 null（前端隐藏整块）
  const rawScqa = minutesBody?.scqa;
  const scqa = (rawScqa && typeof rawScqa === 'object'
    && typeof rawScqa.situation === 'string' && rawScqa.situation.trim()
    && typeof rawScqa.complication === 'string' && rawScqa.complication.trim()
    && typeof rawScqa.question === 'string' && rawScqa.question.trim()
    && typeof rawScqa.answer === 'string' && rawScqa.answer.trim())
    ? {
        situation: String(rawScqa.situation),
        complication: String(rawScqa.complication),
        question: String(rawScqa.question),
        answer: String(rawScqa.answer),
      }
    : null;

  // metrics 5 字段都是必填数字 + verdict 枚举；缺字段时整块置 null
  const rawMetrics = minutesBody?.metrics;
  const verdict = rawMetrics?.necessityVerdict;
  const metrics = (rawMetrics && typeof rawMetrics === 'object'
    && (verdict === 'async_ok' || verdict === 'partial' || verdict === 'needed' || verdict === null))
    ? {
        topicsCount: Number(rawMetrics.topicsCount ?? 0) || 0,
        decisionsCount: Number(rawMetrics.decisionsCount ?? 0) || 0,
        openQuestionsCount: Number(rawMetrics.openQuestionsCount ?? 0) || 0,
        chronicCount: Number(rawMetrics.chronicCount ?? 0) || 0,
        necessityVerdict: verdict as 'async_ok' | 'partial' | 'needed' | null,
      }
    : null;

  return {
    summary: {
      tldr: typeof minutesBody?.tldr === 'string' && minutesBody.tldr.trim() ? minutesBody.tldr : null,
      scqa,
      metrics,
      decision: minutesBody?.decision ?? '',
      actionItems: Array.isArray(minutesBody?.actionItems) ? minutesBody.actionItems : [],
      risks: Array.isArray(minutesBody?.risks) ? minutesBody.risks : [],
    },
    tension: tensionBody.map((t: any) => ({
      id: t.id ?? String(Math.random()),
      between: Array.isArray(t.between_ids) ? t.between_ids : (Array.isArray(t.between) ? t.between : []),
      topic: t.topic ?? t.bias_type ?? '',
      intensity: typeof t.intensity === 'number' ? t.intensity : 0.5,
      summary: t.summary ?? t.where_excerpt ?? '',
      moments: Array.isArray(t.moments) ? t.moments : [],
    })),
    newCognition: newCogBody.map((n: any) => ({
      id: n.id ?? String(Math.random()),
      who: n.who ?? n.by_person_id ?? '',
      before: n.before ?? n.prior_belief ?? '',
      after: n.after ?? n.updated_belief ?? '',
      trigger: n.trigger ?? '',
    })),
    focusMap: focusBody.map((f: any) => ({
      who: f.who ?? f.person_id ?? '',
      themes: Array.isArray(f.themes) ? f.themes : [],
      returnsTo: typeof f.returnsTo === 'number' ? f.returnsTo : (typeof f.returns_to === 'number' ? f.returns_to : 0),
    })),
    consensus: consensusBody.map((c: any) => ({
      id: c.id ?? String(Math.random()),
      kind: c.kind === 'divergence' ? 'divergence' as const : 'consensus' as const,
      text: c.text ?? '',
      supportedBy: Array.isArray(c.supportedBy) ? c.supportedBy : (Array.isArray(c.supported_by) ? c.supported_by : []),
      sides: Array.isArray(c.sides) ? c.sides : [],
    })),
    crossView: crossBody.map((v: any) => ({
      id: v.id ?? String(Math.random()),
      claimBy: v.claimBy ?? v.claim_by ?? v.by_person_id ?? '',
      claim: v.claim ?? v.text ?? '',
      responses: Array.isArray(v.responses) ? v.responses : [],
    })),
  };
}

/** 从 detail payload 抽 meeting metadata（title/date/participants）。 */
export function extractApiMeta(data: any): ApiMeetingMeta {
  return {
    title: data?.title ?? null,
    date: data?.date ?? null,
    participants: Array.isArray(data?.participants) ? data.participants : [],
  };
}
