// runs/dispatchPlan.ts — 把 axes 分派给若干位专家
//
// 历史：原来后端跑的是 4 个 axis × N 个 subDim 的纯 LLM 调用，没有真正的"专家分组"。
// 这里给出最小可观察的 dispatch：把 axes 按角色（people / projects / knowledge）分组，
// 写入 mn_runs.metadata.dispatchPlan 让前端能展示"专家×子维度"。
//
// 升级（多专家版）：当 enqueueRun 提供 expertRoles 时，每个角色用用户在 Step 2 选中的
// 真实专家替代硬编码虚拟专家；同一角色下多位专家会展开成多个 expertSlot 并行展示，
// LLM 调用阶段会合议（见 expertProfileLoader.renderPersonaPrompt）。
//
// 没传 expertRoles 时退回原来的硬编码虚拟专家行为，保持向后兼容。

import type { ExpertRoleAssignment, ExpertRoleId, ExpertSnapshot } from './expertProfileLoader.js';
import { ROLE_TO_AXES } from './expertProfileLoader.js';

export interface ExpertSlot {
  /** 专家 id（与 expert-library 的 expert_id 一致；缺失则虚拟） */
  expertId: string;
  /** 显示名 */
  label: string;
  /** 该专家在本 run 内承担的角色（people/projects/knowledge）；未传 expertRoles 时为虚拟角色 */
  role?: ExpertRoleId;
  /** 关注的 axis 列表 */
  axes: string[];
  /** 关注的子维度（合并后） */
  subDims: string[];
  /** 状态：queued / running / done / failed */
  state: 'queued' | 'running' | 'done' | 'failed';
  /** 已完成的子维度（用于进度展示） */
  completedSubDims: string[];
}

export interface DispatchPlan {
  preset: 'lite' | 'standard' | 'max';
  /** 形如 "evidence_anchored|calibrated_confidence|knowledge_grounded|...|base" */
  decoratorStack: string[];
  experts: ExpertSlot[];
}

/** 角色 → 默认虚拟专家（用户没指定时的 fallback） */
const ROLE_TO_VIRTUAL_EXPERT: Record<ExpertRoleId, { id: string; label: string }> = {
  people:    { id: 'expert-people-analyst',       label: '人事/团队动态分析师' },
  projects:  { id: 'expert-decision-strategist',  label: '项目/决策战略家' },
  knowledge: { id: 'expert-knowledge-synthesizer', label: '知识/认知综合师' },
};

const ROLE_LABEL: Record<ExpertRoleId, string> = {
  people: '人事/团队动态',
  projects: '项目/决策',
  knowledge: '知识/认知/张力',
};

/** axis → role 反查（与 ROLE_TO_AXES 对偶） */
const AXIS_TO_ROLE: Record<string, ExpertRoleId> = (() => {
  const out: Record<string, ExpertRoleId> = {};
  for (const role of Object.keys(ROLE_TO_AXES) as ExpertRoleId[]) {
    for (const ax of ROLE_TO_AXES[role]) out[ax] = role;
  }
  return out;
})();

const AXIS_SUBDIMS: Record<string, string[]> = {
  people:    ['commitments', 'role_trajectory', 'speech_quality', 'silence_signal'],
  projects:  ['decision_provenance', 'assumptions', 'open_questions', 'risk_heat'],
  knowledge: ['reusable_judgments', 'mental_models', 'cognitive_biases', 'counterfactuals', 'evidence_grading'],
  meta:      ['decision_quality', 'meeting_necessity', 'affect_curve'],
  tension:   ['intra_meeting'],
};

export function buildDispatchPlan(
  axesToRun: string[],
  preset: 'lite' | 'standard' | 'max',
  strategySpec: string | null,
  expertRoles?: ExpertRoleAssignment | null,
  expertSnapshots?: Map<string, ExpertSnapshot> | null,
): DispatchPlan {
  // axesToRun 决定本 run 实际涉及的角色集合
  const involvedRoles = new Set<ExpertRoleId>();
  for (const ax of axesToRun) {
    const role = AXIS_TO_ROLE[ax];
    if (role) involvedRoles.add(role);
  }

  const experts: ExpertSlot[] = [];
  for (const role of involvedRoles) {
    // 该角色覆盖的 axis（仅取本 run 实际跑的）
    const axes = ROLE_TO_AXES[role].filter((a) => axesToRun.includes(a));
    if (axes.length === 0) continue;
    const subDims = axes.flatMap((a) => AXIS_SUBDIMS[a] ?? []);

    const userIds = (expertRoles?.[role] ?? []).filter((x) => typeof x === 'string' && x.length > 0);
    if (userIds.length > 0) {
      // 用户为该角色指定了真实专家 → 一位专家一个 slot
      for (const eid of userIds) {
        const snap = expertSnapshots?.get(eid);
        const label = snap?.name
          ? `${snap.name} · ${ROLE_LABEL[role]}`
          : `${eid} · ${ROLE_LABEL[role]}`;
        experts.push({
          expertId: eid,
          label,
          role,
          axes: [...axes],
          subDims: [...subDims],
          state: 'queued',
          completedSubDims: [],
        });
      }
    } else {
      // 没指定：用虚拟专家保持向后兼容
      const v = ROLE_TO_VIRTUAL_EXPERT[role];
      experts.push({
        expertId: v.id,
        label: v.label,
        role,
        axes: [...axes],
        subDims: [...subDims],
        state: 'queued',
        completedSubDims: [],
      });
    }
  }

  const decoratorStack = (strategySpec ?? 'evidence_anchored|calibrated_confidence|knowledge_grounded|base')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  return { preset, decoratorStack, experts };
}
