// 趋势信号 — 数据质量治理与动力学计算
// 纯函数模块：去重、时间解析、静态指标识别、速率/加速度/外推
// 修复：同一事实被多篇文章引用导致 dataPoints 重复、方向判断被污染

export interface RawFactRow {
  subject: string;
  predicate: string;
  object: string;
  context: any;
  created_at: string | Date;
}

export interface CleanedDataPoint {
  time: string;          // ISO 字符串（保证可解析）
  value: string;         // 原始 object
  source: string;        // 来源
  numeric?: number;      // 解析出的数值（若能）
  citationCount: number; // 同值被引用次数（去重折叠前的条数）
}

export interface TrendDynamics {
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  velocity?: number;                // 平均速率：单位 / 天
  velocityLabel?: string;           // 人读："↑ 2.3/月"
  acceleration?: 'accelerating' | 'decelerating' | 'steady';
  forecastNote?: string;            // "若保持当前速率，N 个月内将达 X"
  significance: number;             // 0~1，基于去重后点数 + 单调性
}

/** 本质上不会随时间演化的谓词，直接过滤 */
export const STATIC_PREDICATES = new Set<string>([
  '成立时间', '创立时间', '创办时间', '建立时间', '注册时间',
  '成立日期', '创立日期',
  '创始人', '联合创始人', '创办人',
  '总部所在地', '总部地址', '注册地',
  '法人代表', '法定代表人',
  '注册号', '统一社会信用代码',
  '性别', '国籍', '出生日期', '出生地',
  'founder', 'founding_date', 'headquarters', 'registered_address',
]);

/** 把一行 row 解析成可用时间戳；解析失败返回 null */
export function parseFactTime(row: RawFactRow): string | null {
  const candidates: Array<any> = [
    row.context?.event_time,
    row.context?.time,
    row.context?.date,
    row.created_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** 尝试把 object 解析成数值：支持 "27%"、"1.5亿"、"￥3,200"、"2021年" 等 */
export function parseNumericValue(raw: string | number): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (!raw) return undefined;
  const original = String(raw).trim();
  // 先剥离货币/空白/逗号/千分位，再做后续匹配
  const s = original.replace(/[,\s￥¥$]/g, '');

  // 百分比
  const pct = s.match(/^([-+]?\d+(?:\.\d+)?)\s*%$/);
  if (pct) return parseFloat(pct[1]) / 100;

  // 中文数量级
  const cnUnits: Record<string, number> = { 万: 1e4, '亿': 1e8, '千': 1e3, '百': 1e2 };
  const cnMatch = s.match(/^([-+]?\d+(?:\.\d+)?)(万|亿|千|百)?/);
  if (cnMatch) {
    const base = parseFloat(cnMatch[1]);
    const unit = cnMatch[2] ? cnUnits[cnMatch[2]] : 1;
    if (!isNaN(base)) return base * unit;
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** 去重 + 时间校验 + 引用计数折叠 */
export function dedupeDataPoints(rows: RawFactRow[]): CleanedDataPoint[] {
  const bucket = new Map<string, CleanedDataPoint>();
  for (const row of rows) {
    const isoTime = parseFactTime(row);
    if (!isoTime) continue; // 丢弃无法解析时间的行
    const dayKey = isoTime.slice(0, 10); // YYYY-MM-DD
    const valueKey = `${dayKey}::${row.object}`;
    const existing = bucket.get(valueKey);
    if (existing) {
      existing.citationCount += 1;
      // 若当前 row 的 source 更明确则保留
      if ((!existing.source || existing.source === 'unknown') && row.context?.source) {
        existing.source = String(row.context.source);
      }
    } else {
      const numeric = parseNumericValue(row.object);
      bucket.set(valueKey, {
        time: isoTime,
        value: String(row.object),
        source: row.context?.source ? String(row.context.source) : 'unknown',
        numeric,
        citationCount: 1,
      });
    }
  }
  return Array.from(bucket.values()).sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
}

/** 是否该指标值得作为趋势展示：去重后 ≥2 个点 + 至少 2 个不同值 + 非静态谓词 */
export function shouldKeepAsTrend(predicate: string, points: CleanedDataPoint[]): boolean {
  if (STATIC_PREDICATES.has(predicate)) return false;
  if (points.length < 2) return false;
  const distinct = new Set(points.map(p => p.value));
  if (distinct.size < 2) return false;
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatUnitLabel(perDay: number): string {
  const perMonth = perDay * 30;
  const abs = Math.abs(perMonth);
  const arrow = perMonth > 0 ? '↑' : perMonth < 0 ? '↓' : '→';
  if (abs >= 1) return `${arrow} ${abs.toFixed(1)}/月`;
  if (abs >= 0.01) return `${arrow} ${abs.toFixed(3)}/月`;
  return `${arrow} ${abs.toExponential(1)}/月`;
}

/** 根据去重后的点计算方向 + 速率 + 加速度 + 外推 */
export function computeDynamics(points: CleanedDataPoint[]): TrendDynamics {
  if (points.length < 2) {
    return { direction: 'stable', significance: 0 };
  }

  const numerics = points.filter(p => typeof p.numeric === 'number');
  if (numerics.length < 2) {
    // 非数值序列：只能基于值是否变化给出粗略方向
    const distinct = new Set(points.map(p => p.value)).size;
    return {
      direction: distinct >= 3 ? 'volatile' : 'stable',
      significance: Math.min(1, points.length / 10),
    };
  }

  const first = numerics[0];
  const last = numerics[numerics.length - 1];
  const totalDays = (new Date(last.time).getTime() - new Date(first.time).getTime()) / DAY_MS;
  const totalDelta = (last.numeric ?? 0) - (first.numeric ?? 0);
  const velocity = totalDays > 0 ? totalDelta / totalDays : 0;

  // 方向：相对变化比例
  const base = Math.max(Math.abs(first.numeric ?? 0), 1e-9);
  const relative = totalDelta / base;
  let direction: TrendDynamics['direction'];
  if (Math.abs(relative) < 0.02) direction = 'stable';
  else if (relative > 0) direction = 'rising';
  else direction = 'falling';

  // 震荡检测：如果中间段出现方向反转
  if (numerics.length >= 4) {
    let reversals = 0;
    for (let i = 2; i < numerics.length; i++) {
      const d1 = Math.sign((numerics[i - 1].numeric ?? 0) - (numerics[i - 2].numeric ?? 0));
      const d2 = Math.sign((numerics[i].numeric ?? 0) - (numerics[i - 1].numeric ?? 0));
      if (d1 !== 0 && d2 !== 0 && d1 !== d2) reversals++;
    }
    if (reversals >= Math.max(2, Math.floor(numerics.length / 3))) {
      direction = 'volatile';
    }
  }

  // 加速度：后半段平均速率 vs 前半段
  let acceleration: TrendDynamics['acceleration'] = 'steady';
  if (numerics.length >= 4) {
    const mid = Math.floor(numerics.length / 2);
    const seg1 = numerics.slice(0, mid + 1);
    const seg2 = numerics.slice(mid);
    const v1 = segmentVelocity(seg1);
    const v2 = segmentVelocity(seg2);
    if (v1 !== null && v2 !== null) {
      const diff = v2 - v1;
      const scale = Math.max(Math.abs(v1), 1e-9);
      if (Math.abs(diff) / scale > 0.2) {
        acceleration = Math.abs(v2) > Math.abs(v1) ? 'accelerating' : 'decelerating';
      }
    }
  }

  // 外推：仅 rising/falling 才有意义
  let forecastNote: string | undefined;
  if ((direction === 'rising' || direction === 'falling') && velocity !== 0) {
    const futureMonths = 3;
    const projected = (last.numeric ?? 0) + velocity * futureMonths * 30;
    forecastNote = `若保持当前速率，约 ${futureMonths} 个月后预计达到 ${formatProjected(projected, last.value)}`;
  }

  // 显著度：基于点数 + 相对变化幅度（截断到 0~1）
  const significance = Math.min(
    1,
    Math.min(1, numerics.length / 8) * 0.5 + Math.min(1, Math.abs(relative)) * 0.5,
  );

  return {
    direction,
    velocity,
    velocityLabel: formatUnitLabel(velocity),
    acceleration,
    forecastNote,
    significance,
  };
}

function segmentVelocity(seg: CleanedDataPoint[]): number | null {
  if (seg.length < 2) return null;
  const a = seg[0];
  const b = seg[seg.length - 1];
  const days = (new Date(b.time).getTime() - new Date(a.time).getTime()) / DAY_MS;
  if (days <= 0) return null;
  return ((b.numeric ?? 0) - (a.numeric ?? 0)) / days;
}

/** 格式化外推值：尽量保留原值的单位风格（% / 万 / 亿） */
function formatProjected(n: number, originalSample: string): string {
  if (/%/.test(originalSample)) return `${(n * 100).toFixed(1)}%`;
  if (/亿/.test(originalSample)) return `${(n / 1e8).toFixed(2)}亿`;
  if (/万/.test(originalSample)) return `${(n / 1e4).toFixed(1)}万`;
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toFixed(2);
}
