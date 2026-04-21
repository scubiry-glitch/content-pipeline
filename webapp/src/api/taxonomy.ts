import axios from 'axios';
import type {
  TaxonomyNode,
  TaxonomyUsage,
  TaxonomyAuditEntry,
} from '../types/taxonomy';

const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key';
const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const client = axios.create({
  baseURL: `${BASE_URL}/taxonomy`,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

client.interceptors.response.use(r => r.data, err => Promise.reject(err));

export const taxonomyApi = {
  listFlat: (includeInactive = false) =>
    client.get('/domains', {
      params: includeInactive ? { include_inactive: '1' } : undefined,
    }) as Promise<{ data: TaxonomyNode[] }>,

  getTree: (includeInactive = false) =>
    client.get('/domains/tree', {
      params: includeInactive ? { include_inactive: '1' } : undefined,
    }) as Promise<{ data: TaxonomyNode[] }>,

  getUsage: (code: string) =>
    client.get(`/domains/${encodeURIComponent(code)}/usage`) as Promise<{ data: TaxonomyUsage }>,

  create: (input: {
    code: string;
    parent_code?: string | null;
    name: string;
    icon?: string | null;
    color?: string | null;
    sort_order?: number;
  }) => client.post('/domains', input) as Promise<{ data: TaxonomyNode }>,

  update: (code: string, patch: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }) => client.patch(`/domains/${encodeURIComponent(code)}`, patch) as Promise<{ data: TaxonomyNode }>,

  sync: () => client.post('/sync') as Promise<{ data: { upserted: number } }>,

  exportTs: () => client.get('/export', {
    transformResponse: [(d: unknown) => d],  // keep raw text
  }) as unknown as Promise<string>,

  audit: (code?: string, limit = 50) =>
    client.get('/audit', { params: { code, limit } }) as Promise<{ data: TaxonomyAuditEntry[] }>,
};
