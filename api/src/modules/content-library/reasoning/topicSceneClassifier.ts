// v7.5 议题场景分类器 — 给每个议题贴 7 选 1 的 scene 标签
//
// 规则优先（确定性），不确定项走 LLM：
// 🔥 争议话题   → entity 上有 ≥1 高可信 TensionCandidate
// 📈 新变化     → timeliness > 0.8 且近 30 天出现新动作事实
// ⚠️ 被忽视的风险 → gapScore > 0.7 或 entity 有 negative 类事实但主流叙事正面
// 🧩 认知拼图   → factDensity 中高，关联 ≥3 独立 asset，尚无 enrichment
// 🧭 决策转折   → 事实含政策/定价/技术临界点关键词
// 🎭 人物切片   → entity.type=person 且立场出现转变
// 🪞 反常识     → LLM 判断（成本高；仅对前 6 条未命中的候选兜底）

import type { ContentLibraryDeps, TopicRecommendation, SceneTag } from '../types.js';
import type { TensionCandidate } from './contradictionRecall.js';

/** 新动作关键词（用于 📈 新变化） */
const NEW_ACTION_KEYWORDS = [
  '新增', '推出', '宣布', '发布', '上线', '进入', '首次', '开启', '启动', '落地',
  '裁员', '收购', '合并', '涨价', '降价', '停售', '下架', '换帅', '离职', '加入',
];

/** 决策转折关键词（用于 🧭 决策转折） */
const INFLECTION_KEYWORDS = [
  '临界', '拐点', '分水岭', '天花板', '红线', '下限', '上限', '政策', '监管',
  '禁止', '放开', '牌照', '许可', '合规', '处罚', '反垄断',
  '突破', '首次实现', '量产', '商业化', '开源', '闭源',
];

/** Negative 情绪/事实关键词（用于 ⚠️ 被忽视的风险） */
const NEGATIVE_KEYWORDS = [
  '亏损', '下滑', '缩水', '停摆', '失败', '崩盘', '违约', '暴雷', '诉讼', '欺诈',
  '风险', '隐患', '泡沫', '过热', '过度', '透支', '依赖', '单一',
];

/** 立场转变触发词（用于 🎭 人物切片） */
const STANCE_SHIFT_KEYWORDS = [
  '改口', '反悔', '承认', '澄清', '否认', '否定', '不再', '放弃',
];

export interface SceneClassificationInput {
  topic: TopicRecommendation;
  /** entity 上检测到的 tensions（来自 contradictionRecall） */
  tensions: TensionCandidate[];
  /** 关联 asset 数量（factDensity 衍生） */
  relatedAssetCount?: number;
  /** entity 类型 */
  entityType?: string;
  /** entity 最近事实（用于 token 扫描） */
  recentFacts?: Array<{ predicate: string; object: string; createdAt?: Date | string }>;
}

export interface SceneResult {
  scene: SceneTag;
  sceneReason: string;
  /** 如果是 🔥 争议话题，带上支撑的 tensions */
  detectedTensions?: Array<{
    tensionType: import('../types.js').TensionType;
    divergenceAxis?: string;
    factASummary: string;
    factBSummary: string;
  }>;
}

/**
 * 批量分类：输入 topic[] + tensions[]，输出每条 topic 的 scene。
 * 传入 deps 以便在规则都不命中时走 LLM 判 "反常识"。
 */
export async function classifyScenes(
  topics: TopicRecommendation[],
  tensionsByEntity: Map<string, TensionCandidate[]>,
  deps: ContentLibraryDeps,
  options?: { disableLLMFallback?: boolean },
): Promise<Array<TopicRecommendation & SceneResult>> {
  const out: Array<TopicRecommendation & SceneResult> = [];
  const llmFallbackQueue: Array<{ idx: number; topic: TopicRecommendation }> = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const tensions = tensionsByEntity.get(topic.entityId) ?? [];

    // 按规则优先级逐条尝试
    const ruleResult = applyRules(topic, tensions);
    if (ruleResult) {
      out.push({ ...topic, ...ruleResult });
      continue;
    }

    // 规则未命中 → 暂存待 LLM 兜底
    llmFallbackQueue.push({ idx: i, topic });
    out.push({
      ...topic,
      scene: '认知拼图',
      sceneReason: '（待 LLM 判定）',
    });
  }

  // LLM 兜底：批量判"反常识"，失败则保留默认 认知拼图
  if (!options?.disableLLMFallback && llmFallbackQueue.length > 0) {
    try {
      const llmResults = await classifyByLLM(
        llmFallbackQueue.map(q => q.topic),
        deps,
      );
      for (let k = 0; k < llmFallbackQueue.length; k++) {
        const origIdx = llmFallbackQueue[k].idx;
        const result = llmResults[k];
        if (result) {
          out[origIdx] = { ...out[origIdx], ...result };
        }
      }
    } catch (err) {
      console.warn('[topicSceneClassifier] LLM fallback failed:', (err as Error).message);
    }
  }

  return out;
}

// ============================================================
// 规则层
// ============================================================

function applyRules(
  topic: TopicRecommendation,
  tensions: TensionCandidate[],
): SceneResult | null {
  // 🔥 争议话题 — 最高优先级
  const highConfTensions = tensions.filter(
    t => (t.factA.confidence + t.factB.confidence) >= 1.2,
  );
  if (highConfTensions.length >= 1) {
    return {
      scene: '争议话题',
      sceneReason: `检测到 ${highConfTensions.length} 条高可信张力（${highConfTensions[0].tensionType}）`,
      detectedTensions: highConfTensions.slice(0, 3).map(t => ({
        tensionType: t.tensionType,
        divergenceAxis: t.divergenceAxis,
        factASummary: `${t.factA.subject} ${t.factA.predicate} ${t.factA.object}`,
        factBSummary: `${t.factB.subject} ${t.factB.predicate} ${t.factB.object}`,
      })),
    };
  }

  const recentFacts = (topic.evidenceFacts ?? []).map(f => ({
    predicate: f.predicate ?? '',
    object: f.object ?? '',
  }));
  const allText = recentFacts.map(f => `${f.predicate} ${f.object}`).join(' ');

  // 🎭 人物切片 — 需要 entityType=person，但 TopicRecommendation 没带这个字段
  // 这里用 entityName + 关键词做启发式判断
  if (
    containsAnyKeyword(allText, STANCE_SHIFT_KEYWORDS) &&
    looksLikePersonName(topic.entityName)
  ) {
    return {
      scene: '人物切片',
      sceneReason: '事实流中出现立场转变信号',
    };
  }

  // 🧭 决策转折
  if (containsAnyKeyword(allText, INFLECTION_KEYWORDS)) {
    return {
      scene: '决策转折',
      sceneReason: '事实中包含政策/技术/价格临界点关键词',
    };
  }

  // 📈 新变化
  if (
    (topic.timeliness ?? 0) > 0.8 &&
    containsAnyKeyword(allText, NEW_ACTION_KEYWORDS)
  ) {
    return {
      scene: '新变化',
      sceneReason: `timeliness=${topic.timeliness?.toFixed(2)},近期出现新动作事实`,
    };
  }

  // ⚠️ 被忽视的风险
  if (
    (topic.gapScore ?? 0) > 0.7 ||
    containsAnyKeyword(allText, NEGATIVE_KEYWORDS)
  ) {
    return {
      scene: '被忽视的风险',
      sceneReason:
        (topic.gapScore ?? 0) > 0.7
          ? `gapScore=${topic.gapScore?.toFixed(2)},覆盖空白`
          : '事实流中出现风险信号',
    };
  }

  // 🧩 认知拼图 — factDensity 中高但还没人拼
  if (
    (topic.factDensity ?? 0) >= 0.4 &&
    !topic.narrative &&
    !topic.titleSuggestion
  ) {
    return {
      scene: '认知拼图',
      sceneReason: `事实密度 ${topic.factDensity?.toFixed(2)}，但尚无 narrative,适合拼图式成文`,
    };
  }

  // 规则未命中 → 交给 LLM 判"反常识"
  return null;
}

// ============================================================
// LLM 兜底（仅判反常识 / 其余维持认知拼图）
// ============================================================

const LLM_SCENE_SYSTEM = `你是选题编辑。判断每条候选议题是否属于"反常识"——即结论与大多数读者的直觉相反(例:"熬夜其实对身体影响不大"、"新能源车电池寿命超过油车")。

如果是反常识:输出 scene="反常识",并给出一句话 sceneReason 说明反在哪里。
如果不是:输出 scene="认知拼图"(默认兜底)。

严格输出 JSON 数组,顺序与输入一致:
[{"index":0,"scene":"反常识|认知拼图","sceneReason":"..."}]`;

async function classifyByLLM(
  topics: TopicRecommendation[],
  deps: ContentLibraryDeps,
): Promise<SceneResult[]> {
  if (topics.length === 0) return [];

  const userPrompt = topics
    .map((t, i) => {
      const facts = (t.evidenceFacts ?? []).slice(0, 3).map(f => `${f.subject} ${f.predicate} ${f.object}`).join('; ');
      return `[${i}] 议题: ${t.entityName}\n    事实样本: ${facts || '(无)'}`;
    })
    .join('\n\n');

  const raw = await deps.llm.completeWithSystem(LLM_SCENE_SYSTEM, userPrompt, {
    temperature: 0.2,
    maxTokens: 1024,
    responseFormat: 'json',
  });

  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  let parsed: any[] = [];
  try {
    const p = JSON.parse(cleaned);
    parsed = Array.isArray(p) ? p : [];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = [];
      }
    }
  }

  return topics.map((_, i) => {
    const match = parsed.find((p: any) => p?.index === i) ?? parsed[i];
    const scene: SceneTag = match?.scene === '反常识' ? '反常识' : '认知拼图';
    return {
      scene,
      sceneReason: typeof match?.sceneReason === 'string' && match.sceneReason.length > 0
        ? match.sceneReason
        : '（LLM 未提供原因）',
    };
  });
}

// ============================================================
// 工具函数
// ============================================================

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

function looksLikePersonName(name: string): boolean {
  if (!name) return false;
  // 启发式:2-4 字的中文姓名 / 含"·"的外文姓名 / 姓氏白名单
  if (/^[一-龥]{2,4}$/.test(name)) return true;
  if (name.includes('·')) return true;
  const titles = ['CEO', '总裁', '创始人', '董事长', '部长', '总'];
  return titles.some(t => name.includes(t));
}
