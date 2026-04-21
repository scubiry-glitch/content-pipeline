// Shared taxonomy tree loader. Caches the first request so multiple pages
// mounted at the same time hit the API only once.

import { useCallback, useEffect, useState } from 'react';
import { taxonomyApi } from '../api/taxonomy';
import type { TaxonomyNode } from '../types/taxonomy';

let cached: Promise<TaxonomyNode[]> | null = null;

function fetchTree(): Promise<TaxonomyNode[]> {
  if (!cached) {
    cached = taxonomyApi
      .getTree(false)
      .then(r => r.data)
      .catch(err => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

export function invalidateTaxonomyCache() {
  cached = null;
}

export function useTaxonomy() {
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await fetchTree();
      setTree(t);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    invalidateTaxonomyCache();
    return load();
  }, [load]);

  const findL1 = useCallback(
    (code: string) => tree.find(n => n.code === code) ?? null,
    [tree],
  );

  const findByCode = useCallback(
    (code: string): TaxonomyNode | null => {
      for (const l1 of tree) {
        if (l1.code === code) return l1;
        for (const l2 of l1.children ?? []) {
          if (l2.code === code) return l2;
        }
      }
      return null;
    },
    [tree],
  );

  const nameOf = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '';
      const n = findByCode(code);
      return n?.name ?? code;
    },
    [findByCode],
  );

  return { tree, loading, error, refresh, findL1, findByCode, nameOf };
}
