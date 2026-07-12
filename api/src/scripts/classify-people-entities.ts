/**
 * classify-people-entities.ts — 存量 mn_people 语义分类(只读,不写库)
 *
 * 用途:把 mn_people 里被错标成"人物"的条目分类成 真人/角色/话题/章节/元数据/占位符,
 *   出报告(各类计数 + 真人清单 + 真人疑似重复簇),供决定"哪些值得桥接/合并"。
 * LLM:Anthropic 兼容 API(ANTHROPIC_BASE_URL/_AUTH_TOKEN/_MODEL,即本机 meizu 网关直连)。
 *
 * 用法:
 *   npx tsx src/scripts/classify-people-entities.ts --limit 40   # 小批试跑
 *   npx tsx src/scripts/classify-people-entities.ts              # 全量
 *   输出:stdout 报告 + 明细 JSON 落 /tmp/people-classification.json
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { query } from '../db/connection.js';
import { EmbeddingService } from '../services/assets-ai/embedding.js';

const BASE = (process.env.ANTHROPIC_BASE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const BATCH = 40;
const OUT = '/tmp/people-classification.json';

const CATEGORIES = ['person', 'role', 'topic', 'section', 'metadata', 'placeholder', 'unclear'] as const;
type Cat = (typeof CATEGORIES)[number];

const CAT_ZH: Record<Cat, string> = {
  person: '真人(自然人姓名)', role: '角色/职能/头衔', topic: '话题/模型/条目',
  section: '文档章节', metadata: '会议元数据', placeholder: '匿名占位符', unclear: '无法判断',
};

interface Row { id: string; name: string; aliases: string[]; role: string | null; org: string | null; refs: number }

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function callLLM(prompt: string, attempt = 0): Promise<string> {
  try {
    const res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': TOKEN, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    return (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  } catch (e: any) {
    if (attempt < 4) { await sleep(1500 * (attempt + 1)); return callLLM(prompt, attempt + 1); }
    throw e;
  }
}

function buildPrompt(batch: Row[]): string {
  const items = batch.map((r, i) =>
    `${i}. 名字="${r.name}"${r.role ? ` 角色字段="${r.role}"` : ''}${r.org ? ` 组织="${r.org}"` : ''}${r.aliases.length ? ` 别名=[${r.aliases.join(',')}]` : ''} 被会议引用${r.refs}次`,
  ).join('\n');
  return `下面是从会议纪要中被抽取标记为"人物"的条目,但很多是误标。请判断每条的**真实类别**:
- person: 有真实姓名的自然人(如 王丽/张伟/Kenny/丁美云/Wei Tan)
- role: 角色/职能/头衔(如 负责人/项目经理/风控/收益分析师/业主方/客户对接/协调员)
- topic: 话题/模型/业务条目(如 商业模式/财务模型/成本核算/服务承诺/跟进节奏分层)
- section: 文档章节(如 第一部分/第七部分)
- metadata: 会议元数据(如 地点/时间/参会人员/录音时间/议程)
- placeholder: 匿名占位符,无法定位到具体自然人(如 客户A/客户B/客户 D·农光南里)
- unclear: 信息不足无法判断

判据:若"名字"能回答"这是哪个具体的真人",才是 person;否则归入对应非人物类。

条目(共${batch.length}条):
${items}

只输出一个 JSON 数组,每项 {"i":序号,"category":"上述之一","confidence":0到1}。不要任何解释、不要 markdown 代码围栏。`;
}

function parseJson(text: string): Array<{ i: number; category: string; confidence: number }> {
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('['), e = t.lastIndexOf(']');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

function cos(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

(async () => {
  if (!BASE || !TOKEN) { console.error('缺 ANTHROPIC_BASE_URL/_AUTH_TOKEN'); process.exit(1); }
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 0;

  const refd = `(SELECT count(*) FROM mn_commitments c WHERE c.person_id=p.id)
    + (SELECT count(*) FROM mn_role_trajectory_points r WHERE r.person_id=p.id)
    + (SELECT count(*) FROM mn_speech_quality s WHERE s.person_id=p.id)
    + (SELECT count(*) FROM mn_decisions d WHERE d.proposer_person_id=p.id)`;
  const res = await query(
    `SELECT p.id, p.canonical_name AS name, p.aliases, p.role, p.org, (${refd})::int AS refs
       FROM mn_people p ORDER BY p.canonical_name ${limit ? `LIMIT ${limit}` : ''}`,
  );
  const rows: Row[] = res.rows.map((r: any) => ({
    id: String(r.id), name: String(r.name), aliases: Array.isArray(r.aliases) ? r.aliases : [],
    role: r.role ?? null, org: r.org ?? null, refs: r.refs ?? 0,
  }));
  console.log(`加载 ${rows.length} 条 mn_people,分 ${Math.ceil(rows.length / BATCH)} 批分类…`);

  const labeled: Array<Row & { category: Cat; confidence: number }> = [];
  for (let b = 0; b < rows.length; b += BATCH) {
    const batch = rows.slice(b, b + BATCH);
    try {
      const out = parseJson(await callLLM(buildPrompt(batch)));
      const byI = new Map(out.map((o) => [o.i, o]));
      batch.forEach((r, i) => {
        const o = byI.get(i);
        const cat = (CATEGORIES.includes(o?.category as Cat) ? o!.category : 'unclear') as Cat;
        labeled.push({ ...r, category: cat, confidence: o?.confidence ?? 0 });
      });
      process.stdout.write(`  批 ${b / BATCH + 1}/${Math.ceil(rows.length / BATCH)} ✓\r`);
    } catch (e: any) {
      console.error(`\n批 ${b / BATCH + 1} 失败,该批标 unclear: ${e.message}`);
      batch.forEach((r) => labeled.push({ ...r, category: 'unclear', confidence: 0 }));
    }
  }

  // 报告:各类计数
  console.log('\n\n=== 分类结果 ===');
  const counts: Record<string, number> = {};
  for (const l of labeled) counts[l.category] = (counts[l.category] || 0) + 1;
  for (const c of CATEGORIES) if (counts[c]) console.log(`  ${CAT_ZH[c].padEnd(18)} ${counts[c]}`);
  const persons = labeled.filter((l) => l.category === 'person');
  console.log(`\n真人 ${persons.length} / ${labeled.length}(${(persons.length / labeled.length * 100).toFixed(1)}%)`);

  // 真人疑似重复簇(bge-m3 语义)
  let clusters: string[][] = [];
  if (persons.length >= 2) {
    const svc = new EmbeddingService();
    if (svc.provider === 'siliconflow') {
      const texts = persons.map((p) => [p.name, ...p.aliases].join(' / ') + (p.org ? ` @${p.org}` : ''));
      const vecs = await svc.embedBatch(texts);
      const seen = new Set<number>();
      for (let i = 0; i < persons.length; i++) {
        if (seen.has(i)) continue;
        const grp = [i];
        for (let j = i + 1; j < persons.length; j++) if (!seen.has(j) && cos(vecs[i], vecs[j]) >= 0.86) { grp.push(j); seen.add(j); }
        if (grp.length > 1) { grp.forEach((k) => seen.add(k)); clusters.push(grp.map((k) => persons[k].name)); }
      }
      console.log(`\n真人疑似重复簇(cosine≥0.86,共 ${clusters.length} 簇):`);
      clusters.slice(0, 30).forEach((c) => console.log(`  · ${c.join('  ↔  ')}`));
    } else console.log(`\n(embedding provider=${svc.provider},跳过重复簇)`);
  }

  console.log('\n=== 真人清单(前 60) ===');
  console.log(persons.slice(0, 60).map((p) => p.name + (p.refs ? `(${p.refs})` : '')).join(' / '));

  writeFileSync(OUT, JSON.stringify({ generatedFor: labeled.length, counts, persons: persons.map((p) => ({ id: p.id, name: p.name, refs: p.refs })), clusters, labeled }, null, 2));
  console.log(`\n明细已写 ${OUT}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
