// v7.5 议题角度生成器 — 在 scene 已贴 + purpose 已推断后，
// 让匹配的专家 CDT 走 '①topic-enrich' 策略，生成 angleCards + why 三问。
//
// 这是 enrichTopicsWithDeepMode 的扩展层:
//   enrichTopicsWithDeepMode 负责 reason/titleSuggestion/narrative/angleMatrix(通用)
//   本模块负责 angleCards(场景化) + whyNow + whyYou + whyItWorks

import type { ContentLibraryDeps, TopicRecommendation, PurposeId, SceneTag } from '../types.js';
import type { ExpertStrategySpec } from '../../../services/expert-application/types.js';
import { queryTrackRecord } from './purposeInferrer.js';

export interface TopicAngleInput {
  topic: TopicRecommendation;
  scene: SceneTag;
  sceneReason: string;
  purpose: PurposeId;
  /** 用户目的来源(override / inferred / fallback) — 用于 whyYou 用语 */
  purposeSource: 'override' | 'inferred' | 'fallback';
  /** 场景关联的张力候选(仅 🔥 争议话题 有) */
  detectedTensions?: TopicRecommendation['detectedTensions'];
  expertStrategy?: ExpertStrategySpec;
}

export interface TopicAngleOutput {
  angleCards: Array<{ title: string; hook: string; whoCares: string; promise: string }>;
  whyNow: string;
  whyYou: string;
  whyItWorks: string;
}

/**
 * 按 scene + purpose 生成角度卡 + why 三问。
 * 失败时返回空数组 + "无法生成"文案,由调用方决定是否回退。
 */
export async function generateTopicAngles(
  input: TopicAngleInput,
  deps: ContentLibraryDeps,
): Promise<TopicAngleOutput> {
  const { topic, scene, purpose, purposeSource, sceneReason, detectedTensions } = input;

  // whyItWorks 单独查历史回灌(不走 LLM)
  const trackRecord = await queryTrackRecord(deps, purpose);
  const whyItWorks = trackRecord
    ? `类似"${purpose}"定位的议题近 ${trackRecord.sampleSize} 篇,平均阅读 ${Math.round(trackRecord.avgReadCount ?? 0)}`
    : '历史数据不足,暂无回灌参考';

  // whyYou 的来源前缀
  const whyYouPrefix =
    purposeSource === 'override'
      ? '你指定本次目的为'
      : purposeSource === 'inferred'
        ? '根据你最近的任务分布,推断你偏好'
        : '本次默认目的为';

  // 拼 LLM prompt
  const tensionBlock = detectedTensions && detectedTensions.length > 0
    ? `\n检测到的张力:\n${detectedTensions
        .slice(0, 3)
        .map((t, i) => `  [${i + 1}] ${t.tensionType}: ${t.divergenceAxis || '(未给出分歧维度)'}\n      A: ${t.factASummary}\n      B: ${t.factBSummary}`)
        .join('\n')}`
    : '';

  const evidenceLines = (topic.evidenceFacts ?? [])
    .slice(0, 5)
    .map(f => `  - ${f.subject} · ${f.predicate} → ${f.object}`)
    .join('\n');

  const scenePromptHint = getScenePromptHint(scene);

  const systemPrompt = `你在给写作团队做议题包装。严格输出 JSON,不要 markdown 围栏。

场景: ${scene}
目的: ${purpose}

${scenePromptHint}

要求:
1. angleCards: 生成 2-3 个角度卡,每张卡:
   - title: 15-22 字,有钩子、非套话
   - hook: 一句话开场白,解释为什么值得读下去(10-25 字)
   - whoCares: 精准目标读者画像(不超过 15 字)
   - promise: 这篇会让读者得到什么(不超过 20 字)
2. whyNow: 一句话讲清"为什么现在"——用时效性/事实拐点/政策窗口等锚定
3. whyYou: 一句话讲清"为什么匹配用户目的"——${whyYouPrefix}"${purpose}"

输出 schema:
{
  "angleCards": [{"title":"","hook":"","whoCares":"","promise":""}],
  "whyNow": "",
  "whyYou": ""
}`;

  const userPrompt = `议题: ${topic.entityName}
场景命中原因: ${sceneReason}

事实证据:
${evidenceLines || '(无)'}
${tensionBlock}

请生成 JSON。`;

  try {
    const raw = await deps.llm.completeWithSystem(systemPrompt, userPrompt, {
      temperature: 0.6,
      maxTokens: 1500,
      responseFormat: 'json',
    });

    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error('parse failed');

    const angleCards = Array.isArray(parsed.angleCards)
      ? parsed.angleCards
          .filter((c: any) => c && typeof c === 'object')
          .slice(0, 3)
          .map((c: any) => ({
            title: String(c.title || '').slice(0, 40),
            hook: String(c.hook || '').slice(0, 60),
            whoCares: String(c.whoCares || '').slice(0, 30),
            promise: String(c.promise || '').slice(0, 40),
          }))
      : [];

    return {
      angleCards,
      whyNow: typeof parsed.whyNow === 'string' ? parsed.whyNow.slice(0, 120) : '',
      whyYou: typeof parsed.whyYou === 'string' ? parsed.whyYou.slice(0, 120) : '',
      whyItWorks,
    };
  } catch (err) {
    console.warn('[topicAngleGenerator] failed for', topic.entityName, ':', (err as Error).message);
    return {
      angleCards: [],
      whyNow: sceneReason,
      whyYou: `${whyYouPrefix}"${purpose}"`,
      whyItWorks,
    };
  }
}

/**
 * 按 scene 给不同的 prompt hint — 这是角度吸引力的核心
 */
function getScenePromptHint(scene: SceneTag): string {
  switch (scene) {
    case '争议话题':
      return `这是一个【争议话题】场景。多角度包装应该:
- 用"A 派说…,B 派说…,但真相可能是…"的三段结构
- 强调冲突但避免站队,给读者自己判断的空间
- 钩子用"为什么 X 会和 Y 吵起来"的形式`;
    case '新变化':
      return `这是一个【新变化】场景。多角度包装应该:
- 锚定具体时间点("上周"/"3 月 15 日"/"过去 30 天")
- 用"过去 X,现在 Y,接下来可能 Z"的结构
- 钩子强调拐点的意外性`;
    case '被忽视的风险':
      return `这是一个【被忽视的风险】场景。多角度包装应该:
- "所有人在谈 X,但一个重要数据没人提"的反叙事结构
- 钩子点出主流叙事的盲点
- 避免危言耸听,给出证据链`;
    case '反常识':
      return `这是一个【反常识】场景。多角度包装应该:
- 先承认"大多数人以为 X",再给出"但实际上 Y"
- 钩子用"你以为…,其实…"的句式
- 必须带 2-3 条硬证据支撑`;
    case '认知拼图':
      return `这是一个【认知拼图】场景。多角度包装应该:
- "A 这里看到一点、B 那里看到一点、C 又一点,拼起来是…"
- 角度强调"合并看才看得出"的发现感
- 钩子强调分散报道的信息损失`;
    case '决策转折':
      return `这是一个【决策转折】场景。多角度包装应该:
- 指出临界点的具体位置("过了 X 就…")
- 展现规则变化前后的博弈
- 钩子用"过了这条线,游戏规则就变了"的语气`;
    case '人物切片':
      return `这是一个【人物切片】场景。多角度包装应该:
- 聚焦一个关键人物的口径/立场转变
- "他去年说 X,上周说 Y,中间发生了什么"
- 钩子强调转变本身的反差`;
    default:
      return '';
  }
}

function parseJsonObject(raw: string): any | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
