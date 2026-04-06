// 串行评审服务 - Sequential Review Service
// 实现 PRD 中定义的串行多轮评审流程

import { query } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getLLMRouter } from '../providers/index.js';
import { getExpertEngine } from '../modules/expert-library/singleton.js';
import { buildSystemPrompt } from '../modules/expert-library/promptBuilder.js';
import { KimiProvider } from '../providers/kimi.js';
import { 
  broadcastSequentialEvent,
  broadcastDraftRevising,
  broadcastReviewCompleted 
} from './streamingSequentialReview.js';

// 专家评审配置
interface ReviewConfig {
  taskId: string;
  reviewQueue: ExpertConfig[];
  totalRounds: number;
}

interface ExpertConfig {
  type: 'ai' | 'human';
  role?: string;
  id?: string;
  name: string;
  profile?: string;
}

// 评审结果
interface ReviewResult {
  score: number;
  summary: string;
  questions: ReviewQuestion[];
}

interface ReviewQuestion {
  id: string;
  question: string;
  severity: 'high' | 'medium' | 'low' | 'praise';
  suggestion: string;
  category?: string;
  location?: string;
}

// 评审链项
interface ReviewChainItem {
  round: number;
  expertId: string;
  expertName: string;
  expertRole: string;
  inputDraftId: string;
  outputDraftId: string;
  reviewId: string;
  score: number;
  status: 'completed' | 'skipped';
}

/**
 * 配置串行评审专家队列
 */
export async function configureSequentialReview(
  taskId: string,
  topic: string,
  userExperts?: string[]  // 用户在配置面板选择的专家角色列表
): Promise<ReviewConfig> {
  // 所有可用 AI 专家
  const ALL_AI_EXPERTS: Record<string, ExpertConfig> = {
    challenger: { type: 'ai', role: 'challenger', name: '批判者', profile: '挑战逻辑漏洞、数据可靠性、隐含假设' },
    expander: { type: 'ai', role: 'expander', name: '拓展者', profile: '扩展关联因素、国际对比、交叉学科视角' },
    synthesizer: { type: 'ai', role: 'synthesizer', name: '提炼者', profile: '归纳核心论点、结构优化、金句提炼' },
    fact_checker: { type: 'ai', role: 'fact_checker', name: '事实核查员', profile: '数据准确性、来源可靠性验证' },
    logic_checker: { type: 'ai', role: 'logic_checker', name: '逻辑检察官', profile: '论证严密性、逻辑链完整性' },
    domain_expert: { type: 'ai', role: 'domain_expert', name: '行业专家', profile: '专业深度、行业洞察' },
    reader_rep: { type: 'ai', role: 'reader_rep', name: '读者代表', profile: '可读性、受众适配度' },
  };

  // 1. 根据用户选择或默认配置构建 AI 专家队列
  let aiExperts: ExpertConfig[];
  let effectiveExperts = userExperts;

  // ★ 从 tasks.sequential_review_config 读取持久化配置（包括 AI 专家和人类专家）
  // ★ 始终读取持久化配置，获取 humanExperts 和 readerTest（不受 AI experts 是否已传入的影响）
  let persistedHumanExpertIds: string[] = [];
  let persistedHumanExpertsDetail: Array<{ id: string; name: string; profile: string }> = [];
  let persistedReaderExpertsDetail: Array<{ id: string; name: string; profile: string }> = [];
  try {
    const configResult = await query(
      `SELECT sequential_review_config FROM tasks WHERE id = $1`,
      [taskId]
    );
    const persistedConfig = configResult.rows[0]?.sequential_review_config;
    if (persistedConfig) {
      const parsed = typeof persistedConfig === 'string' ? JSON.parse(persistedConfig) : persistedConfig;
      // AI 专家：仅在未传入时从持久化配置恢复
      if ((!effectiveExperts || effectiveExperts.length === 0) &&
          parsed.experts && Array.isArray(parsed.experts) && parsed.experts.length > 0) {
        effectiveExperts = parsed.experts;
        console.log(`[SequentialReview] Loaded AI experts from persisted config:`, effectiveExperts);
      }
      // 人类专家：始终从持久化配置读取
      if (parsed.humanExperts && Array.isArray(parsed.humanExperts) && parsed.humanExperts.length > 0) {
        persistedHumanExpertIds = parsed.humanExperts;
        console.log(`[SequentialReview] Loaded human experts from persisted config:`, persistedHumanExpertIds);
      }
      // ★ 优先使用前端传来的专家详情（包含 name + profile）
      if (parsed.humanExpertsDetail && Array.isArray(parsed.humanExpertsDetail)) {
        persistedHumanExpertsDetail = parsed.humanExpertsDetail;
        console.log(`[SequentialReview] Loaded human experts detail:`, persistedHumanExpertsDetail.map((d: any) => d.name));
      }
      if (parsed.readerExpertsDetail && Array.isArray(parsed.readerExpertsDetail)) {
        persistedReaderExpertsDetail = parsed.readerExpertsDetail;
        console.log(`[SequentialReview] Loaded reader experts detail:`, persistedReaderExpertsDetail.map((d: any) => d.name));
      }
    }
  } catch (e) {
    console.warn(`[SequentialReview] Failed to read persisted config:`, e);
  }

  if (effectiveExperts && effectiveExperts.length > 0) {
    // 使用用户选择的专家
    aiExperts = effectiveExperts
      .map(role => ALL_AI_EXPERTS[role])
      .filter(Boolean);
    console.log(`[SequentialReview] Using user-selected AI experts:`, effectiveExperts);
  } else {
    // 默认: 挑战者 → 拓展者 → 提炼者
    aiExperts = [
      ALL_AI_EXPERTS.challenger,
      ALL_AI_EXPERTS.expander,
      ALL_AI_EXPERTS.synthesizer,
    ];
  }

  // 2. 获取人类专家 — 前端专家库的专家（本地 ID 如 S-01）用 AI 模拟风格评审
  //    本地专家库的完整画像存储在前端 expertService 中，后端只存 ID
  //    这里构建 simulated human expert 的配置
  const KNOWN_EXPERTS: Record<string, { name: string; profile: string }> = {
    'S-01': { name: '张一鸣', profile: '字节跳动创始人，数据驱动思维，追求延迟满足，关注长期价值和执行效率' },
    'S-02': { name: '雷军', profile: '小米创始人，极致性价比思维，关注用户体验、效率提升和口碑传播' },
    'S-03': { name: '马斯克', profile: 'Tesla/SpaceX创始人，第一性原理思维，从物理可行性和成本拆解角度评估技术投资' },
    'S-04': { name: '王兴', profile: '美团创始人，无边界扩张思维，关注本地生活和供给侧改革' },
    'S-05': { name: '马斯克', profile: 'Tesla/SpaceX创始人，第一性原理思维，关注颠覆性创新和长期愿景' },
    'S-06': { name: '任正非', profile: '华为创始人，狼性文化，关注技术自主、组织活力和战略定力' },
    'S-07': { name: '张勇', profile: '阿里巴巴前CEO，组织架构大师，关注组织效能和商业模式创新' },
    'S-08': { name: '宿华', profile: '快手创始人，普惠科技思维，关注下沉市场和社会价值' },
    'S-09': { name: '王慧文', profile: '美团联合创始人，互联网老兵，关注竞争策略和执行力' },
    'S-10': { name: '陆奇', profile: 'Y Combinator中国CEO，AI领域思想家，关注AI趋势和创业生态' },
    'S-11': { name: '查理·芒格', profile: '伯克希尔副董事长，多元思维模型，关注理性决策和逆向思维' },
    'S-12': { name: '段永平', profile: '步步高创始人，本分哲学，关注长期主义和商业本质' },
    'S-13': { name: '朱啸虎', profile: '金沙江创投主管合伙人，眼光毒辣出手果断，善于捕捉风口，关注商业模式和增长潜力' },
    'S-14': { name: '徐新', profile: '今日资本创始人，独具慧眼长期持有，关注企业家精神和消费品品牌' },
    'S-15': { name: '林毅夫', profile: '著名经济学家，原世界银行首席经济学家，关注宏观经济、产业政策和比较优势' },
    'S-16': { name: '周其仁', profile: '北京大学经济学教授，关注产权制度、市场改革和经济转型' },
    'S-17': { name: '刘强东', profile: '京东创始人，供应链思维，关注效率、用户体验和物流优化' },
    'E07-10': { name: '谷文栋', profile: '人工智能方向专家，关注大模型与机器学习、AI工程化、智能体与产业落地' },
    'E04-05': {
      name: '一濛',
      profile:
        '居住服务·惠居美租方向；UE 卷积与 P&L 递归对齐、L3/L2/L1 分层治理与财务硬账、U×E 弹性与 BML 准实验、好产品好服务好效率好 UE',
    },
  };

  // ★ 构建专家详情查找表：优先使用前端传来的详情，再 fallback 到 KNOWN_EXPERTS
  const expertDetailMap = new Map<string, { name: string; profile: string }>();
  for (const d of persistedHumanExpertsDetail) {
    expertDetailMap.set(d.id, { name: d.name, profile: d.profile });
  }

  let humanExperts: ExpertConfig[] = [];
  if (persistedHumanExpertIds.length > 0) {
    const isLocalExpertId = (id: string) => /^(S-\d+|E\d{2}-\d{2})$/.test(id);
    const localIds = persistedHumanExpertIds.filter(isLocalExpertId);
    const dbIds = persistedHumanExpertIds.filter(id => !isLocalExpertId(id));

    // 本地专家：优先用前端传来的详情 → fallback KNOWN_EXPERTS → fallback 通用
    for (const id of localIds) {
      const detail = expertDetailMap.get(id) || KNOWN_EXPERTS[id];
      humanExperts.push({
        type: 'human' as const,
        id,
        role: id,
        name: detail?.name || `专家${id}`,
        profile: detail?.profile || '资深领域专家，提供专业视角的深度审核',
      });
    }

    // 数据库专家：从 DB 查询（UUID 格式，非 S-XX）
    if (dbIds.length > 0) {
      const placeholders = dbIds.map((_, i) => `$${i + 1}`).join(',');
      const humanExpertsResult = await query(
        `SELECT id, name, bio, title, domain, angle
         FROM experts
         WHERE id IN (${placeholders})`,
        dbIds
      );
      for (const e of humanExpertsResult.rows) {
        humanExperts.push({
          type: 'human' as const,
          id: e.id,
          role: e.id,
          name: e.name,
          profile: e.bio || e.title || '领域专家',
        });
      }
    }
    console.log(`[SequentialReview] Using user-selected human experts:`, humanExperts.map(e => `${e.id}:${e.name}`));
  }

  // 2b. 获取读者测试角色（从持久化配置的 readerTest 中读取）
  let readerExperts: ExpertConfig[] = [];
  try {
    const configResult2 = await query(`SELECT sequential_review_config FROM tasks WHERE id = $1`, [taskId]);
    const pc = configResult2.rows[0]?.sequential_review_config;
    if (pc) {
      const parsed2 = typeof pc === 'string' ? JSON.parse(pc) : pc;
      if (parsed2.readerTest?.enabled && parsed2.readerTest?.selectedReaders?.length > 0) {
        const readerIds: string[] = parsed2.readerTest.selectedReaders;
        // 读者画像来自前端的 MOCK_READER_PERSONAS，用 role 映射
        const READER_PROFILES: Record<string, { name: string; profile: string }> = {
          reader_01: { name: '快速浏览者', profile: '上班族白领，注意力有限，需要快速获取信息' },
          reader_02: { name: '深度思考者', profile: '研究者，注重内容的准确性和深度' },
          reader_03: { name: '行业新人', profile: '应届毕业生，行业知识有限，需要更多背景信息' },
          reader_04: { name: '实战派管理者', profile: '中层管理者，关注内容的实用性' },
          reader_05: { name: '资深从业者', profile: '行业老兵，对内容质量要求高' },
          reader_06: { name: '投资决策人', profile: '投资人，关注风险和回报，重视数据支撑' },
          reader_07: { name: '跨界学习者', profile: '多领域关注者，需要通俗易懂的解释' },
          reader_08: { name: '数据敏感者', profile: '数据分析师，重视统计和证据' },
          reader_09: { name: '批判质疑者', profile: '审慎观察者，喜欢寻找漏洞' },
          reader_10: { name: '故事爱好者', profile: '叙事偏好读者，喜欢有人情味的内容' },
        };
        // ★ 优先用前端传来的详情，再 fallback 到 READER_PROFILES
        const readerDetailMap = new Map<string, { name: string; profile: string }>();
        for (const d of persistedReaderExpertsDetail) {
          readerDetailMap.set(d.id, { name: d.name, profile: d.profile });
        }
        readerExperts = readerIds.map(id => {
          const detail = readerDetailMap.get(id) || READER_PROFILES[id] || { name: id, profile: '读者' };
          return {
            type: 'ai' as const,
            role: 'reader_rep',
            id,
            name: `读者测试-${detail.name}`,
            profile: detail.profile,
          };
        });
        console.log(`[SequentialReview] Loaded reader test experts:`, readerExperts.map(e => e.name));
      }
    }
  } catch (e) {
    console.warn(`[SequentialReview] Failed to load reader config:`, e);
  }

  // 3. 构建串行评审队列: AI 专家 → 人类专家(交替) → 读者测试(最后)
  let reviewQueue: ExpertConfig[];
  if (aiExperts.length > 0 && humanExperts.length > 0) {
    // 交替排列: AI → Human → AI → Human → ...
    reviewQueue = [];
    const maxLen = Math.max(aiExperts.length, humanExperts.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < aiExperts.length) reviewQueue.push(aiExperts[i]);
      if (i < humanExperts.length) reviewQueue.push(humanExperts[i]);
    }
  } else {
    reviewQueue = [...aiExperts, ...humanExperts];
  }
  // 读者测试放在最后（在所有专家评审完成后进行）
  reviewQueue.push(...readerExperts);
  console.log(`[SequentialReview] Final review queue (${reviewQueue.length}):`, reviewQueue.map(e => `${e.type}:${e.name}`));

  // 4. 保存评审配置到进度表
  await query(
    `INSERT INTO task_review_progress (
      task_id, total_rounds, review_queue, status, updated_at
    ) VALUES ($1, $2, $3, 'idle', NOW())
    ON CONFLICT (task_id) DO UPDATE SET
      total_rounds = $2,
      review_queue = $3,
      status = 'idle',
      updated_at = NOW()`,
    [taskId, reviewQueue.length, JSON.stringify(reviewQueue)]
  );

  return {
    taskId,
    reviewQueue,
    totalRounds: reviewQueue.length,
  };
}

/**
 * 启动串行评审流程
 */
export async function startSequentialReview(
  taskId: string,
  initialDraftId: string,
  draftContent: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. 获取评审配置
    const progressResult = await query(
      `SELECT * FROM task_review_progress WHERE task_id = $1`,
      [taskId]
    );

    if (progressResult.rows.length === 0) {
      // 自动配置评审 — configureSequentialReview 会自动从 tasks.sequential_review_config 读取持久化配置
      const taskResult = await query(`SELECT topic, sequential_review_config FROM tasks WHERE id = $1`, [taskId]);
      const topic = taskResult.rows[0]?.topic || '未命名主题';
      // 从持久化配置中提取专家列表作为参数传入
      let persistedExperts: string[] | undefined;
      const persistedConfig = taskResult.rows[0]?.sequential_review_config;
      if (persistedConfig) {
        const parsed = typeof persistedConfig === 'string' ? JSON.parse(persistedConfig) : persistedConfig;
        if (parsed.experts && Array.isArray(parsed.experts) && parsed.experts.length > 0) {
          persistedExperts = parsed.experts;
          console.log(`[SequentialReview] startSequentialReview using persisted experts:`, persistedExperts);
        }
      }
      await configureSequentialReview(taskId, topic, persistedExperts);
    }

    // 2. 清理旧评审数据（重新评审时避免 unique constraint 冲突）
    await query(`DELETE FROM review_chains WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM expert_reviews WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM review_reports WHERE task_id = $1`, [taskId]);
    console.log(`[SequentialReview] Cleaned old review data for task ${taskId}`);

    // 3. 更新任务状态
    await query(
      `UPDATE tasks SET
        status = 'reviewing',
        current_stage = 'sequential_review',
        review_mode = 'sequential',
        updated_at = NOW()
      WHERE id = $1`,
      [taskId]
    );

    // 3.5 更新 draft 状态为 reviewing
    await query(
      `UPDATE draft_versions SET status = 'reviewing' WHERE id = $1`,
      [initialDraftId]
    );

    // 4. 初始化评审进度
    await query(
      `UPDATE task_review_progress SET
        status = 'running',
        current_round = 0,
        initial_draft_id = $2,
        current_draft_id = $2,
        started_at = NOW(),
        updated_at = NOW()
      WHERE task_id = $1`,
      [taskId, initialDraftId]
    );

    // 5. 异步开始第一轮评审
    setImmediate(async () => {
      try {
        await processNextRound(taskId);
      } catch (error) {
        console.error(`[SequentialReview] Failed to process task ${taskId}:`, error);
        await query(
          `UPDATE task_review_progress SET status = 'failed', updated_at = NOW() WHERE task_id = $1`,
          [taskId]
        );
      }
    });

    return { success: true, message: '串行评审已启动' };
  } catch (error) {
    console.error('[SequentialReview] Start failed:', error);
    return { success: false, message: '启动失败: ' + (error as Error).message };
  }
}

/**
 * 处理下一轮评审
 */
async function processNextRound(taskId: string): Promise<void> {
  console.log(`[processNextRound] Starting for task ${taskId}`);
  
  // 1. 获取当前进度
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) {
    console.log(`[processNextRound] No progress found for task ${taskId}`);
    return;
  }
  
  const progress = progressResult.rows[0];
  const currentRound = progress.current_round || 0;
  const totalRounds = progress.total_rounds;
  const reviewQueue: ExpertConfig[] = progress.review_queue || [];
  
  // 2. 检查是否完成所有轮次
  if (currentRound >= totalRounds) {
    await finalizeSequentialReview(taskId);
    return;
  }
  
  // 3. 获取当前轮次的专家配置
  const expertConfig = reviewQueue[currentRound];
  if (!expertConfig) {
    await finalizeSequentialReview(taskId);
    return;
  }
  
  // 4. 获取当前 draft
  const currentDraftId = progress.current_draft_id;
  const draftResult = await query(
    `SELECT content FROM draft_versions WHERE id = $1`,
    [currentDraftId]
  );
  const draftContent = draftResult.rows[0]?.content || '';
  
  // 5. 更新进度状态
  await query(
    `UPDATE task_review_progress SET
      current_round = $2,
      current_expert_role = $3,
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, currentRound + 1, expertConfig.role || expertConfig.id]
  );
  
  // 6. 创建专家评审记录
  const reviewId = uuidv4();
  await query(
    `INSERT INTO expert_reviews (
      id, task_id, draft_id, round, expert_type, expert_role, expert_id, expert_name,
      input_draft_id, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'in_progress', NOW())`,
    [
      reviewId, taskId, currentDraftId, currentRound + 1,
      expertConfig.type, expertConfig.role, expertConfig.id, expertConfig.name,
      currentDraftId
    ]
  );
  
  await query(
    `UPDATE task_review_progress SET current_review_id = $2 WHERE task_id = $1`,
    [taskId, reviewId]
  );
  
  // 7. 执行专家评审（带流式推送）
  console.log(`[processNextRound] Conducting review for round ${currentRound + 1} with ${expertConfig.name}`);
  
  // 广播轮次开始
  broadcastSequentialEvent(taskId, {
    type: 'round_started',
    round: currentRound + 1,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `第 ${currentRound + 1} 轮评审开始：${expertConfig.name}`
  });
  
  let reviewResult: ReviewResult;
  if (expertConfig.type === 'ai') {
    // AI 专家评审 - 逐条推送评论
    reviewResult = await conductAIExpertReviewWithStreaming(
      taskId, 
      currentRound + 1, 
      draftContent, 
      expertConfig,
      totalRounds
    );
  } else {
    // 真人专家 - 创建任务等待反馈 (简化版直接模拟)
    reviewResult = await conductHumanExpertReview(draftContent, expertConfig);
  }
  
  // 8. 更新评审记录
  await query(
    `UPDATE expert_reviews SET
      questions = $2,
      overall_score = $3,
      summary = $4,
      status = 'completed',
      completed_at = NOW()
    WHERE id = $1`,
    [reviewId, JSON.stringify(reviewResult.questions), reviewResult.score, reviewResult.summary]
  );
  
  // 9. 生成修订稿（带流式推送）
  broadcastDraftRevising(taskId, currentRound + 1, expertConfig.name);
  
  const newDraft = await generateRevisedDraft(
    taskId,
    currentDraftId,
    draftContent,
    reviewResult,
    currentRound + 1,
    expertConfig.role || 'expert'
  );
  
  // 广播修订稿生成完成
  broadcastSequentialEvent(taskId, {
    type: 'draft_revised',
    round: currentRound + 1,
    expertName: expertConfig.name,
    draftId: newDraft.id,
    message: `${expertConfig.name} 生成修订稿完成`
  });
  
  // 10. 更新评审记录和进度
  await query(
    `UPDATE expert_reviews SET output_draft_id = $2 WHERE id = $1`,
    [reviewId, newDraft.id]
  );
  
  await query(
    `UPDATE task_review_progress SET
      current_draft_id = $2,
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, newDraft.id]
  );
  
  // 11. 记录评审链
  await query(
    `INSERT INTO review_chains (
      task_id, review_id, round, expert_id, expert_name, expert_role,
      input_draft_id, output_draft_id, score, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')`,
    [
      taskId, reviewId, currentRound + 1,
      expertConfig.id || expertConfig.role, expertConfig.name, expertConfig.role,
      currentDraftId, newDraft.id, reviewResult.score
    ]
  );
  
  // 12. 继续下一轮
  setImmediate(async () => {
    try {
      await processNextRound(taskId);
    } catch (error) {
      console.error(`[SequentialReview] Round ${currentRound + 1} failed:`, error);
      await query(
        `UPDATE task_review_progress SET status = 'failed' WHERE task_id = $1`,
        [taskId]
      );
    }
  });
}

/**
 * AI 专家评审
 */
async function conductAIExpertReview(
  draftContent: string,
  expertConfig: ExpertConfig
): Promise<ReviewResult> {
  const promptTemplates: Record<string, string> = {
    challenger: `你是一位严苛的批判者(Challenger)，负责找出文稿中的逻辑漏洞和问题。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 逻辑漏洞：是否存在论证不严密的地方？
2. 论证跳跃：是否缺少必要的推理步骤？
3. 数据可靠性：引用的数据是否可信？
4. 隐含假设：是否有未明确说明的前提？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "逻辑漏洞|论证跳跃|数据可靠性|隐含假设"
    }
  ]
}`,
    expander: `你是一位拓展者(Expander)，负责提供补充视角和扩展内容。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 关联因素：是否遗漏了相关的影响因素？
2. 国际对比：是否可以引入国际经验对比？
3. 交叉学科：是否需要引入其他学科视角？
4. 长尾效应：是否考虑了长期影响？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "关联因素|国际对比|交叉学科|长尾效应"
    }
  ]
}`,
    synthesizer: `你是一位提炼者(Synthesizer)，负责优化表达和结构。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 核心论点：是否清晰突出？
2. 结构优化：章节安排是否合理？
3. 金句提炼：是否有 memorable 的表述？
4. 消除冗余：是否有重复或冗余内容？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "核心论点|结构优化|金句提炼|消除冗余"
    }
  ]
}`,
    fact_checker: `你是一位严谨的事实核查员(Fact Checker)，负责验证文稿中的数据和事实准确性。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 数据准确性：引用的数据、数字、统计是否准确？
2. 来源可靠性：信息来源是否权威可信？
3. 时效性：数据是否过时？是否有更新的数据？
4. 引用完整性：是否注明了数据出处？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "数据准确性|来源可靠性|时效性|引用完整性"
    }
  ]
}`,
    logic_checker: `你是一位逻辑检察官(Logic Checker)，负责审查文稿的论证严密性和逻辑链完整性。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 因果关系：因果推断是否成立？
2. 逻辑一致性：全文论点是否自相矛盾？
3. 推理完整性：是否存在跳跃式推理？
4. 反例考虑：是否忽略了重要的反面论据？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "因果关系|逻辑一致性|推理完整性|反例考虑"
    }
  ]
}`,
    domain_expert: `你是一位行业专家(Domain Expert)，负责从专业深度和行业洞察角度评审文稿。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 专业深度：分析是否有足够深度？
2. 行业洞察：是否反映了行业最新趋势？
3. 术语准确性：专业术语使用是否恰当？
4. 实操建议：给出的建议是否具有可操作性？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "专业深度|行业洞察|术语准确性|实操建议"
    }
  ]
}`,
    reader_rep: `你是一位读者代表(Reader Representative)，站在目标读者的立场评审文稿的可读性和受众适配度。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 可读性：语言是否通俗易懂？
2. 受众适配：内容深度是否匹配目标读者？
3. 阅读体验：结构是否清晰、段落是否合理？
4. 价值感知：读者能从中获得什么具体价值？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "可读性|受众适配|阅读体验|价值感知"
    }
  ]
}`,
  };

  let template = promptTemplates[expertConfig.role || 'challenger'] || promptTemplates.challenger;
  // 读者测试：注入具体的读者画像信息
  if (expertConfig.role === 'reader_rep' && expertConfig.profile) {
    template = `你是一位读者代表，你的读者画像是：${expertConfig.name}（${expertConfig.profile}）。
请以这个特定读者的视角来评审文稿，关注该读者最在意的方面。

当前文稿：
{{draftContent}}

请从以下角度进行评审：
1. 可读性：以你的阅读习惯，这篇文章是否容易理解？
2. 受众适配：内容深度是否匹配你的知识水平？
3. 阅读体验：结构是否清晰、是否能吸引你读下去？
4. 价值感知：你能从中获得什么具体价值？

输出JSON格式：
{
  "score": 0-100,
  "summary": "总体评价（以读者身份）",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述",
      "severity": "high|medium|low|praise",
      "suggestion": "修改建议",
      "category": "可读性|受众适配|阅读体验|价值感知"
    }
  ]
}`;
  }
  const prompt = template.replace('{{draftContent}}', draftContent.substring(0, 2000));
  
  try {
    const llm = getLLMRouter();
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 2000,
      temperature: 0.7,
    });
    
    const content = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(content);
    
    return {
      score: result.score || 80,
      summary: result.summary || '评审完成',
      questions: result.questions || [],
    };
  } catch (error) {
    console.error('[AIReview] Failed:', error);
    // 返回默认结果
    return {
      score: 75,
      summary: 'AI评审完成，未发现严重问题',
      questions: [
        {
          id: 'q1',
          question: '建议进一步优化文稿结构和表达',
          severity: 'low',
          suggestion: '参考同类优秀文稿进行优化',
          category: 'general',
        },
      ],
    };
  }
}

/**
 * 真人专家评审 (简化版)
 */
async function conductHumanExpertReview(
  draftContent: string,
  expertConfig: ExpertConfig
): Promise<ReviewResult> {
  // 使用 AI 模拟专家风格评审，注入专家画像
  console.log(`[HumanReview] Simulating review for ${expertConfig.name} (${expertConfig.profile})`);

  // CDT 增强：若该专家有深度 profile，使用 buildSystemPrompt 生成更丰富的人格提示
  let cdtSystemPrompt: string | undefined;
  if (expertConfig.id) {
    try {
      const engine = getExpertEngine();
      if (engine) {
        const cdtProfile = await engine.loadExpert(expertConfig.id);
        if (cdtProfile) {
          cdtSystemPrompt = buildSystemPrompt(cdtProfile, { taskType: 'evaluation' });
          console.log(`[HumanReview] CDT profile found for ${expertConfig.id}, using enriched system prompt`);
        }
      }
    } catch { /* CDT not available, fall through to default */ }
  }

  const taskPrompt = `当前文稿：
${draftContent.substring(0, 2000)}

请以 ${expertConfig.name} 的口吻和视角进行评审，输出JSON格式：
{
  "score": 0-100,
  "summary": "以${expertConfig.name}的视角给出总体评价",
  "questions": [
    {
      "id": "q1",
      "question": "问题描述（体现${expertConfig.name}的思维特点）",
      "severity": "high|medium|low|praise",
      "suggestion": "以${expertConfig.name}的风格给出修改建议",
      "category": "战略视角|数据驱动|用户体验|执行效率|长期价值"
    }
  ]
}`;

  const prompt = cdtSystemPrompt
    ? taskPrompt
    : `你现在模拟的是 ${expertConfig.name}。
人物画像：${expertConfig.profile || '资深领域专家'}

请以 ${expertConfig.name} 的思维方式和视角来评审以下文稿。
评审风格应体现该人物的核心理念和关注点。

${taskPrompt}`;

  try {
    const llm = getLLMRouter();
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 2000,
      temperature: 0.7,
      ...(cdtSystemPrompt ? { systemPrompt: cdtSystemPrompt } : {}),
    });

    const content = response.content.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(content);

    return {
      score: result.score || 80,
      summary: result.summary || `${expertConfig.name}评审完成`,
      questions: result.questions || [],
    };
  } catch (error) {
    console.error(`[HumanReview] Failed for ${expertConfig.name}:`, error);
    return {
      score: 75,
      summary: `${expertConfig.name}评审完成`,
      questions: [{
        id: 'q1',
        question: `从${expertConfig.name}的视角看，文稿尚有优化空间`,
        severity: 'medium',
        suggestion: '建议进一步深化分析',
        category: 'general',
      }],
    };
  }
}

/**
 * 生成修订稿
 */
async function generateRevisedDraft(
  taskId: string,
  currentDraftId: string,
  currentContent: string,
  reviewResult: ReviewResult,
  round: number,
  expertRole: string
): Promise<{ id: string; content: string }> {
  // 只取前5个最重要的问题（排除 praise）
  const topQuestions = reviewResult.questions
    .filter(q => q.severity !== 'praise')
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    })
    .slice(0, 5);

  // 如果没有需要修改的问题，直接复用原稿
  if (topQuestions.length === 0) {
    console.log(`[GenerateDraft] Round ${round}: no actionable issues, reusing original draft`);
    const newDraftId = uuidv4();
    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, change_summary,
        source_review_id, previous_version_id, round, expert_role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [newDraftId, taskId, round, currentContent,
       `第${round}轮${expertRole}评审：无需修改`, null, currentDraftId, round, expertRole]
    );
    return { id: newDraftId, content: currentContent };
  }

  // 上下文管理：完整传入文稿（截取上限 15000 字符，保留结构完整性）
  const MAX_CONTENT_CHARS = 15000;
  const contentForPrompt = currentContent.length > MAX_CONTENT_CHARS
    ? currentContent.substring(0, MAX_CONTENT_CHARS) + '\n\n[... 后续内容省略，请保持原文后续部分不变 ...]'
    : currentContent;

  // 获取前轮修改记录，防止 LLM 回退前轮修改
  let priorChangesSection = '';
  if (round > 1) {
    const priorDrafts = await query(
      `SELECT round, expert_role, change_summary
       FROM draft_versions
       WHERE task_id = $1 AND round < $2 AND change_summary IS NOT NULL
       ORDER BY round ASC`,
      [taskId, round]
    );
    if (priorDrafts.rows.length > 0) {
      const changesList = priorDrafts.rows
        .map(r => `- 第${r.round}轮(${r.expert_role}): ${r.change_summary}`)
        .join('\n');
      priorChangesSection = `\n## 前轮已完成的修改（必须保留）\n\n${changesList}\n\n**重要：以上修改已经应用到当前文稿中，不得回退或覆盖。**\n`;
    }
  }

  const prompt = `你是一位专业的文稿修订专家。请根据专家评审意见，对完整文稿进行**针对性修订**。

## 重要规则
- 你必须输出**完整的修订后文稿**，不能只输出摘要或部分内容
- 修订后文稿的总字数应与原文相当（原文约 ${currentContent.length} 字符）
- 只修改评审意见指出的具体问题，**保留所有未被评审指出的段落和章节**
- 保持原文的 Markdown 标题层级结构（# ## ### 等）
${priorChangesSection}
## 当前文稿（完整）

${contentForPrompt}

## 专家评审意见

评审专家：${expertRole}
综合评分：${reviewResult.score}/100
总体评价：${reviewResult.summary}

需要修改的问题：
${topQuestions.map((q, i) => `${i + 1}. [${q.severity}] ${q.question.substring(0, 300)}
   建议：${q.suggestion.substring(0, 200)}`).join('\n')}

## 修订要求

1. **只修改上述问题涉及的段落**，其余部分原样保留
2. 修订后文稿字数应≥原文字数的 80%
3. 保持所有 Markdown 标题（#/##/###）不变
4. 输出完整的修订后文稿（Markdown格式）${round > 1 ? '\n5. **不得回退前轮已完成的修改**' : ''}

请输出完整修订后文稿：`;

  try {
    console.log(`[GenerateDraft] Starting for round ${round}, task ${taskId}, original content: ${currentContent.length} chars, prompt length: ${prompt.length}`);
    const llm = getLLMRouter();
    const response = await llm.generate(prompt, 'blue_team_review', {
      maxTokens: 16000,
      temperature: 0.5,
    });

    const revisedContent = response.content;
    console.log(`[GenerateDraft] LLM response: ${revisedContent.length} chars (original: ${currentContent.length} chars, ratio: ${(revisedContent.length / currentContent.length * 100).toFixed(1)}%)`);

    // 质量守卫：修订稿不能严重缩水
    const lengthRatio = revisedContent.length / currentContent.length;
    let finalContent = revisedContent;

    if (lengthRatio < 0.6) {
      console.warn(`[GenerateDraft] Quality guard: revised content too short (${(lengthRatio * 100).toFixed(1)}% of original). Falling back to original.`);
      finalContent = currentContent;
    } else if (revisedContent.trim().length < 100) {
      console.warn(`[GenerateDraft] Quality guard: revised content is empty/trivial. Falling back to original.`);
      finalContent = currentContent;
    }

    // 检查 Markdown 标题保留情况
    const originalHeadings = (currentContent.match(/^#{1,3}\s+.+$/gm) || []).length;
    const revisedHeadings = (finalContent.match(/^#{1,3}\s+.+$/gm) || []).length;
    if (originalHeadings > 0 && revisedHeadings < originalHeadings * 0.5) {
      console.warn(`[GenerateDraft] Quality guard: headings lost (original: ${originalHeadings}, revised: ${revisedHeadings}). Falling back to original.`);
      finalContent = currentContent;
    }

    // 保存新版本
    const newDraftId = uuidv4();
    const changeSummary = finalContent === currentContent
      ? `第${round}轮${expertRole}评审：修订未通过质量检查，保留原稿`
      : `第${round}轮${expertRole}评审后修订`;

    await query(
      `INSERT INTO draft_versions (
        id, task_id, version, content, change_summary,
        source_review_id, previous_version_id, round, expert_role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [newDraftId, taskId, round, finalContent, changeSummary,
       null, currentDraftId, round, expertRole]
    );
    console.log(`[GenerateDraft] Draft saved: ${newDraftId}, final length: ${finalContent.length} chars`);

    return { id: newDraftId, content: finalContent };
  } catch (error) {
    console.error('[GenerateDraft] Failed:', error);
    // 返回原稿
    return { id: currentDraftId, content: currentContent };
  }
}

/**
 * 完成串行评审
 */
async function finalizeSequentialReview(taskId: string): Promise<void> {
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) return;
  
  const progress = progressResult.rows[0];
  
  // 1. 生成评审报告
  const reviewsResult = await query(
    `SELECT * FROM expert_reviews WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  const reviews = reviewsResult.rows;
  const totalQuestions = reviews.reduce((sum: number, r: any) => {
    const qs = r.questions || [];
    return sum + (Array.isArray(qs) ? qs.length : 0);
  }, 0);

  // 统计问题严重度分布
  let criticalCount = 0, majorCount = 0, minorCount = 0, praiseCount = 0;
  for (const review of reviews) {
    const questions = Array.isArray(review.questions) ? review.questions : [];
    for (const q of questions) {
      switch (q.severity) {
        case 'high': criticalCount++; break;
        case 'medium': majorCount++; break;
        case 'low': minorCount++; break;
        case 'praise': praiseCount++; break;
      }
    }
  }

  const avgScore = reviews.length > 0
    ? Math.round(reviews.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / reviews.length)
    : 0;

  // 决策逻辑：≥80 且无严重问题 → accept，≥60 → revise，<60 → reject
  const decision = (avgScore >= 80 && criticalCount === 0) ? 'accept' : avgScore >= 60 ? 'revise' : 'reject';

  const reportId = uuidv4();
  await query(
    `INSERT INTO review_reports (
      id, task_id, original_draft_id, final_draft_id,
      total_rounds, total_questions, critical_count, major_count, minor_count, praise_count,
      final_score, decision
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      reportId, taskId, progress.initial_draft_id, progress.current_draft_id,
      reviews.length, totalQuestions, criticalCount, majorCount, minorCount, praiseCount,
      avgScore, decision
    ]
  );
  
  // 1.5 更新最终稿件状态
  if (decision === 'accept') {
    await query(`UPDATE draft_versions SET status = 'final' WHERE id = $1`, [progress.current_draft_id]);
  }

  // 2. 更新进度表
  await query(
    `UPDATE task_review_progress SET
      status = 'completed',
      final_draft_id = $2,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE task_id = $1`,
    [taskId, progress.current_draft_id]
  );
  
  // 3. 更新任务状态
  await query(
    `UPDATE tasks SET
      status = 'awaiting_approval',
      current_stage = 'awaiting_approval',
      updated_at = NOW()
    WHERE id = $1`,
    [taskId]
  );
  
  // 4. 同步评审意见到 blue_team_reviews (统一对外接口)
  await syncToBlueTeamReviews(taskId, reviews);
  
  // 5. 广播评审全部完成
  broadcastReviewCompleted(taskId, reviews.length);
  
  console.log(`[SequentialReview] Task ${taskId} completed with ${reviews.length} rounds`);
}

/**
 * 获取串行评审进度
 */
export async function getSequentialReviewProgress(taskId: string) {
  const progressResult = await query(
    `SELECT * FROM task_review_progress WHERE task_id = $1`,
    [taskId]
  );
  
  if (progressResult.rows.length === 0) return null;
  
  const progress = progressResult.rows[0];
  
  // 获取评审链
  const chainResult = await query(
    `SELECT * FROM review_chains WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  // 获取专家评审详情
  const reviewsResult = await query(
    `SELECT * FROM expert_reviews WHERE task_id = $1 ORDER BY round`,
    [taskId]
  );
  
  return {
    ...progress,
    chain: chainResult.rows,
    reviews: reviewsResult.rows,
  };
}

/**
 * 获取评审链完整信息
 */
export async function getReviewChain(taskId: string) {
  const chainResult = await query(
    `SELECT rc.*, 
            dv_input.content as input_content,
            dv_output.content as output_content
     FROM review_chains rc
     LEFT JOIN draft_versions dv_input ON rc.input_draft_id = dv_input.id
     LEFT JOIN draft_versions dv_output ON rc.output_draft_id = dv_output.id
     WHERE rc.task_id = $1
     ORDER BY rc.round`,
    [taskId]
  );
  
  return chainResult.rows;
}

/**
 * 获取所有版本
 */
export async function getDraftVersions(taskId: string) {
  // 先获取 draft_versions
  const draftsResult = await query(
    `SELECT * FROM draft_versions 
     WHERE task_id = $1
     ORDER BY round, version`,
    [taskId]
  );
  
  // 再获取 expert_reviews 映射
  const reviewsResult = await query(
    `SELECT id, expert_name, expert_role FROM expert_reviews WHERE task_id = $1`,
    [taskId]
  );
  
  const reviewsMap = new Map(
    reviewsResult.rows.map((r: any) => [r.id, r])
  );
  
  return draftsResult.rows.map((dv: any) => {
    const review = reviewsMap.get(dv.source_review_id);
    return {
      ...dv,
      expert_name: review?.expert_name || null,
      expert_role: review?.expert_role || dv.expert_role,
    };
  });
}


/**
 * 将串行评审结果同步到 blue_team_reviews
 * 统一对外接口，避免数据冗余和前端兼容性问题
 */
async function syncToBlueTeamReviews(taskId: string, expertReviews: any[]): Promise<void> {
  console.log(`[SequentialReview] Syncing ${expertReviews.length} reviews to blue_team_reviews for task ${taskId}`);
  
  // 1. 清理该任务在 blue_team_reviews 中的旧数据（如果有）
  await query(
    `DELETE FROM blue_team_reviews WHERE task_id = $1`,
    [taskId]
  );
  
  // 2. 将 expert_reviews 转换为 blue_team_reviews 格式
  for (const review of expertReviews) {
    const questions = Array.isArray(review.questions) ? review.questions : [];
    
    // 只同步 AI 专家评审（真人专家评审通过 expert_review_tasks 处理）
    if (review.expert_type === 'ai') {
      await query(
        `INSERT INTO blue_team_reviews (
          id, task_id, round, expert_role, questions,
          status, user_decision, decision_note, decided_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          review.id,  // 保持相同ID便于追溯
          taskId,
          review.round,
          review.expert_role,
          JSON.stringify(questions),
          'completed',  // 串行评审已完成
          'completed',  // 系统自动处理
          `串行评审第${review.round}轮自动处理完成，生成修订版本`,
          review.completed_at || new Date(),
          review.created_at || new Date()
        ]
      );
      
      console.log(`[SequentialReview] Synced AI review: ${review.expert_name} (${review.expert_role})`);
    }
  }
  
  console.log(`[SequentialReview] Sync completed for task ${taskId}`);
}


/**
 * AI 专家评审（带 Streaming 推送）
 * 包装原有 conductAIExpertReview，逐条推送生成的评论
 */
async function conductAIExpertReviewWithStreaming(
  taskId: string,
  round: number,
  draftContent: string,
  expertConfig: ExpertConfig,
  totalRounds: number
): Promise<ReviewResult> {
  // 广播专家开始评审
  broadcastSequentialEvent(taskId, {
    type: 'expert_reviewing',
    round,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `${expertConfig.name} 正在分析文稿...`
  });
  
  // 调用原有评审逻辑
  const result = await conductAIExpertReview(draftContent, expertConfig);
  
  // 逐条推送生成的评论（模拟流式效果）
  if (result.questions && result.questions.length > 0) {
    for (let i = 0; i < result.questions.length; i++) {
      const q = result.questions[i];
      
      // 广播单条评论生成
      broadcastSequentialEvent(taskId, {
        type: 'comment_generated',
        round,
        totalRounds,
        expertName: expertConfig.name,
        expertRole: expertConfig.role,
        comment: {
          index: i,
          total: result.questions.length,
          id: q.id || `${taskId}-${round}-${i}`,
          question: q.question,
          severity: q.severity,
          suggestion: q.suggestion,
          category: q.category,
          location: q.location,
          expertName: expertConfig.name,
          expertRole: expertConfig.role,
          round
        },
        progress: {
          currentRound: round,
          totalRounds,
          currentExpert: expertConfig.name,
          status: 'processing'
        },
        message: `${expertConfig.name} 发现问题 ${i + 1}/${result.questions.length}`
      });
      
      // 添加延迟让用户感知流式效果（每条间隔 300ms）
      if (i < result.questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  
  // 广播评审完成
  broadcastSequentialEvent(taskId, {
    type: 'round_completed',
    round,
    totalRounds,
    expertName: expertConfig.name,
    expertRole: expertConfig.role,
    message: `${expertConfig.name} 完成评审，发现 ${result.questions?.length || 0} 个问题，评分 ${result.score}`
  });
  
  return result;
}
