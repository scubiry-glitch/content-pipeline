// 代码库内已有完整 ExpertProfile（data/*.ts）的 expert_id — 批量生成时跳过；listExperts 合并时内存优先覆盖同 ID 的 DB 行
// 来源：与各 profile 模块保持 import 一致，避免正则扫文件漂移

import { muskProfile } from './data/musk.js';
import { xiaohongshuProfile } from './data/xiaohongshu.js';
import { topExpertProfiles } from './data/topExperts.js';
import { weiHangkongProfile } from './data/weiHangkong.js';

function collectCodebaseExpertIds(): string[] {
  const ids = new Set<string>();
  ids.add(muskProfile.expert_id);
  ids.add(xiaohongshuProfile.expert_id);
  ids.add(weiHangkongProfile.expert_id);
  for (const p of topExpertProfiles) {
    ids.add(p.expert_id);
  }
  return [...ids];
}

/** data/*.ts 中已定义的 invoke 画像 ID（topExperts 已含 yiMeng 等） */
export const CODEBASE_EXPERT_IDS: ReadonlySet<string> = new Set(collectCodebaseExpertIds());

/** 与 CODEBASE_EXPERT_IDS 同义，供批处理脚本命名 */
export const SKIP_GENERATE_IDS = CODEBASE_EXPERT_IDS;
