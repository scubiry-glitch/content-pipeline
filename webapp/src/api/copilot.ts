// v4.4 Copilot AI助手 API 客户端
import client from './client';

// ============ 类型定义 ============

export interface CopilotSession {
  id: string;
  userId: string;
  sessionType: 'chat' | 'writing' | 'research' | 'review';
  title: string;
  contextId?: string;
  contextType?: string;
  status: 'active' | 'archived' | 'closed';
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: 'text' | 'code' | 'suggestion' | 'action';
  skillName?: string;
  metadata?: {
    actions?: QuickAction[];
    code?: string;
    language?: string;
  };
  feedback?: {
    rating: number;
    comment?: string;
  };
  createdAt: string;
}

export interface QuickAction {
  id: string;
  label: string;
  action: string;
  params?: Record<string, any>;
}

export interface CopilotSkill {
  name: string;
  displayName: string;
  description: string;
  category: 'writing' | 'research' | 'analysis' | 'review';
  icon?: string;
  isActive: boolean;
}

// ============ API 方法 ============

export const copilotApi = {
  // 会话管理
  getSessions: (userId: string, status?: string) =>
    client.get('/copilot/sessions', { params: { userId, status } }) as Promise<{ items: CopilotSession[] }>,

  getSession: (id: string) =>
    client.get(`/copilot/sessions/${id}`) as Promise<CopilotSession>,

  createSession: (data: {
    userId: string;
    sessionType: string;
    title: string;
    contextId?: string;
    contextType?: string;
    config?: any;
  }) => client.post('/copilot/sessions', data) as Promise<CopilotSession>,

  updateSession: (id: string, updates: Partial<CopilotSession>) =>
    client.patch(`/copilot/sessions/${id}`, updates) as Promise<CopilotSession>,

  archiveSession: (id: string) =>
    client.post(`/copilot/sessions/${id}/archive`) as Promise<CopilotSession>,

  deleteSession: (id: string) =>
    client.delete(`/copilot/sessions/${id}`) as Promise<void>,

  // 消息管理
  getMessages: (sessionId: string, limit?: number) =>
    client.get(`/copilot/sessions/${sessionId}/messages`, { params: { limit } }) as Promise<{ items: CopilotMessage[] }>,

  sendMessage: (sessionId: string, content: string, contentType?: string, skillName?: string) =>
    client.post(`/copilot/sessions/${sessionId}/messages`, {
      content,
      contentType,
      skillName
    }) as Promise<CopilotMessage>,

  addFeedback: (messageId: string, rating: number, comment?: string) =>
    client.post(`/copilot/messages/${messageId}/feedback`, { rating, comment }) as Promise<void>,

  // 技能管理
  getSkills: (category?: string) =>
    client.get('/copilot/skills', { params: { category } }) as Promise<{ items: CopilotSkill[] }>,

  getSkill: (name: string) =>
    client.get(`/copilot/skills/${name}`) as Promise<CopilotSkill>,

  // 快捷操作
  executeQuickAction: (action: string, params?: Record<string, any>) =>
    client.post('/copilot/quick-actions', { action, params }) as Promise<any>,
};

export default copilotApi;
