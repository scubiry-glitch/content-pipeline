export interface TaxonomyNode {
  code: string;
  parent_code: string | null;
  name: string;
  level: 1 | 2;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  children?: TaxonomyNode[];
}

export interface TaxonomyUsage {
  assets: number;
  themes: number;
  facts: number;
  experts: number;
  total: number;
}

export interface TaxonomyAuditEntry {
  id: string;
  code: string;
  action: string;
  diff: unknown;
  actor: string | null;
  created_at: string;
}

export interface TaxonomySelection {
  l1: string | null;
  l2: string | null;
}
