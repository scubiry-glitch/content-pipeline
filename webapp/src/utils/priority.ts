import type { Task } from '../types';

export interface PriorityScore {
  score: number;
  level: 'urgent' | 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * 计算任务优先级分数
 * 基于截止日期、任务状态、创建时间等因素
 */
export function calculatePriority(task: Task): PriorityScore {
  let score = 0;
  const reasons: string[] = [];

  // 1. 截止日期权重 (0-40分)
  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    const now = new Date();
    const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) {
      score += 40;
      reasons.push('已逾期');
    } else if (diffHours < 24) {
      score += 35;
      reasons.push('24小时内到期');
    } else if (diffHours < 72) {
      score += 25;
      reasons.push('3天内到期');
    } else if (diffHours < 168) {
      score += 15;
      reasons.push('7天内到期');
    }
  }

  // 2. 任务状态权重 (0-20分)
  const statusScores: Record<string, number> = {
    'pending': 20,
    'reviewing': 15,
    'writing': 10,
    'researching': 8,
    'planning': 5,
    'completed': 0,
  };
  score += statusScores[task.status] || 0;
  if (task.status === 'pending') {
    reasons.push('待处理状态');
  }

  // 3. 创建时间权重 (0-20分)
  const createdDate = new Date(task.created_at);
  const now = new Date();
  const ageDays = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays > 30) {
    score += 20;
    reasons.push('创建超过30天');
  } else if (ageDays > 14) {
    score += 15;
    reasons.push('创建超过14天');
  } else if (ageDays > 7) {
    score += 10;
    reasons.push('创建超过7天');
  }

  // 4. 进度权重 (0-20分)
  if (task.progress !== undefined) {
    if (task.progress >= 80) {
      score += 5;
      reasons.push('即将完成');
    } else if (task.progress <= 10 && task.status !== 'pending') {
      score += 15;
      reasons.push('进度滞后');
    }
  }

  // 确定优先级等级
  let level: PriorityScore['level'];
  if (score >= 60) {
    level = 'urgent';
  } else if (score >= 40) {
    level = 'high';
  } else if (score >= 20) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return {
    score,
    level,
    reason: reasons.join('、') || '常规任务',
  };
}

/**
 * 对任务列表进行智能排序
 */
export function sortTasksByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priorityA = calculatePriority(a);
    const priorityB = calculatePriority(b);

    // 首先按优先级分数降序
    if (priorityB.score !== priorityA.score) {
      return priorityB.score - priorityA.score;
    }

    // 分数相同则按截止日期升序
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }

    // 没有截止日期的排后面
    if (a.due_date) return -1;
    if (b.due_date) return 1;

    return 0;
  });
}

/**
 * 获取优先级标签样式
 */
export function getPriorityStyle(level: PriorityScore['level']) {
  const styles = {
    urgent: {
      bg: '#ff4d4f',
      color: '#fff',
      label: '紧急',
      icon: '🔴',
    },
    high: {
      bg: '#fa8c16',
      color: '#fff',
      label: '高',
      icon: '🟠',
    },
    medium: {
      bg: '#1890ff',
      color: '#fff',
      label: '中',
      icon: '🔵',
    },
    low: {
      bg: '#52c41a',
      color: '#fff',
      label: '低',
      icon: '🟢',
    },
  };

  return styles[level];
}
