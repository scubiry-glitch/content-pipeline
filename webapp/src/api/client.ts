import axios from 'axios';
import type { Task, Asset, AssetTheme, Expert } from '../types';

const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key-change-in-production';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// 请求拦截器
client.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('[API] Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// 任务相关 API
export const tasksApi = {
  getAll: (params?: { limit?: number; status?: string }) =>
    client.get('/production', { params }) as Promise<{ items: Task[]; total: number }>,

  getById: (id: string) =>
    client.get(`/production/${id}`) as Promise<Task>,

  create: (data: {
    topic: string;
    source_materials?: { type: 'url' | 'asset'; url?: string; asset_id?: string; title: string }[];
    target_formats?: string[];
  }) => client.post('/production', data) as Promise<Task>,

  update: (id: string, data: Partial<Task>) =>
    client.put(`/production/${id}`, data) as Promise<Task>,

  delete: (id: string) =>
    client.delete(`/production/${id}`) as Promise<void>,

  hide: (id: string) =>
    client.post(`/production/${id}/hide`) as Promise<void>,

  submitFeedback: (id: string, feedback: { decision: 'accept' | 'revise' | 'reject'; note?: string }) =>
    client.post(`/production/${id}/feedback`, feedback) as Promise<void>,
};

// 素材相关 API
export const assetsApi = {
  getAll: (params?: { limit?: number; theme_id?: string }) =>
    client.get('/assets', { params }) as Promise<{ items: Asset[]; total: number }>,

  getById: (id: string) =>
    client.get(`/assets/${id}`) as Promise<Asset>,

  create: (data: FormData) =>
    client.post('/assets', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<Asset>,

  update: (id: string, data: Partial<Asset>) =>
    client.put(`/assets/${id}`, data) as Promise<Asset>,

  delete: (id: string) =>
    client.delete(`/assets/${id}`) as Promise<void>,

  togglePin: (id: string, isPinned: boolean) =>
    client.post(`/assets/${id}/pin`, { is_pinned: isPinned }) as Promise<Asset>,

  search: (query: string) =>
    client.get('/assets/search', { params: { q: query } }) as Promise<Asset[]>,
};

// 主题相关 API
export const themesApi = {
  getAll: () =>
    client.get('/assets/themes') as Promise<AssetTheme[]>,

  create: (data: Partial<AssetTheme>) =>
    client.post('/assets/themes', data) as Promise<AssetTheme>,

  update: (id: string, data: Partial<AssetTheme>) =>
    client.put(`/assets/themes/${id}`, data) as Promise<AssetTheme>,

  delete: (id: string) =>
    client.delete(`/assets/themes/${id}`) as Promise<void>,
};

// 专家相关 API
export const expertsApi = {
  getAll: (params?: { angle?: string }) =>
    client.get('/experts', { params }) as Promise<{ items: Expert[]; total: number }>,

  getById: (id: string) =>
    client.get(`/experts/${id}`) as Promise<Expert>,

  create: (data: Partial<Expert>) =>
    client.post('/experts', data) as Promise<Expert>,

  update: (id: string, data: Partial<Expert>) =>
    client.put(`/experts/${id}`, data) as Promise<Expert>,

  delete: (id: string) =>
    client.delete(`/experts/${id}`) as Promise<void>,
};

// BlueTeam 评审 API
export const blueTeamApi = {
  getReviews: (taskId: string) =>
    client.get(`/production/${taskId}/reviews`) as Promise<{ items: any[] }>,

  submitDecision: (reviewId: string, decision: { decision: 'accept' | 'revise' | 'reject'; note?: string }) =>
    client.post(`/production/reviews/${reviewId}/decision`, decision) as Promise<void>,
};

// 健康检查
export const healthApi = {
  check: () =>
    client.get('/health') as Promise<{ status: string; version: string }>,
};

// 研报相关 API (v3.3)
export const reportsApi = {
  getAll: (params?: { limit?: number; status?: string }) =>
    client.get('/reports', { params }) as Promise<{ items: import('../types').Report[]; total: number }>,

  getById: (id: string) =>
    client.get(`/reports/${id}`) as Promise<import('../types').Report>,

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/reports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<import('../types').ReportUploadResponse>;
  },

  parse: (id: string) =>
    client.post(`/reports/${id}/parse`) as Promise<import('../types').ReportParseResult>,

  getMatches: (id: string) =>
    client.get(`/reports/${id}/matches`) as Promise<{ items: import('../types').ReportMatch[] }>,

  getQuality: (id: string) =>
    client.get(`/reports/${id}/quality`) as Promise<import('../types').Report['qualityDimensions']>,

  search: (query: string, limit?: number) =>
    client.get('/reports/search', { params: { q: query, limit } }) as Promise<{ items: import('../types').Report[] }>,

  delete: (id: string) =>
    client.delete(`/reports/${id}`) as Promise<void>,
};

export default client;
