// 情感分析中心统一配色
// 所有颜色基于主题 CSS 变量（运行时读取），非主题色用于图表的降级兜底

export const POLARITY_COLORS = {
  positive: '#7A9E6B', // 与 MSI greed / sage 一致
  neutral: '#D4A574',  // 与 MSI fear / ochre 一致
  negative: '#C75B5B', // 与 MSI extreme_fear 一致
} as const;

export const MSI_LEVEL_COLORS: Record<string, string> = {
  extreme_fear: '#C75B5B',
  fear: '#D4A574',
  neutral: '#6B9FB8',
  greed: '#7A9E6B',
  extreme_greed: '#9CC17B',
};

export const MSI_LEVEL_LABELS: Record<string, string> = {
  extreme_fear: '极度恐惧',
  fear: '恐惧',
  neutral: '中性',
  greed: '贪婪',
  extreme_greed: '极度贪婪',
};

export const ALERT_ICONS: Record<string, string> = {
  extreme_positive: '🚀',
  extreme_negative: '⚠️',
  sudden_change: '📈',
};

export const ALERT_LABELS: Record<string, string> = {
  extreme_positive: '极度乐观',
  extreme_negative: '极度悲观',
  sudden_change: '突发变化',
};

// 从 MSI 数值推断颜色（当后端未返回 level 时用）
export function msiValueToColor(value: number): string {
  if (value >= 75) return MSI_LEVEL_COLORS.extreme_greed;
  if (value >= 55) return MSI_LEVEL_COLORS.greed;
  if (value >= 45) return MSI_LEVEL_COLORS.neutral;
  if (value >= 25) return MSI_LEVEL_COLORS.fear;
  return MSI_LEVEL_COLORS.extreme_fear;
}

export function polarityLabel(p: string): string {
  if (p === 'positive') return '正面';
  if (p === 'negative') return '负面';
  return '中性';
}

export function polarityEmoji(p: string): string {
  if (p === 'positive') return '😊';
  if (p === 'negative') return '😔';
  return '😐';
}
