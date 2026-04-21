// Unified two-level domain picker used across /assets, /content-library and
// /expert-library. Loads the taxonomy tree once via useTaxonomy.
// - `value.l1` is the level-1 code (e.g. "E07"); null = "all".
// - `value.l2` is the level-2 code (e.g. "E07.LLM"); null = "all within l1".
// - When l1 is "E99" (其他 / fallback), l2 falls back to a free-text <input>
//   because user-custom strings don't map to fixed codes.

import { useMemo } from 'react';
import { useTaxonomy } from '../hooks/useTaxonomy';
import type { TaxonomySelection } from '../types/taxonomy';

export interface DomainCascadeSelectProps {
  value: TaxonomySelection;
  onChange: (next: TaxonomySelection) => void;
  includeAllOption?: boolean;     // render "全部领域"; default true
  disabled?: boolean;
  countByCode?: Record<string, number>;  // optional: label annotation "(n)"
  className?: string;
  compact?: boolean;
}

const BASE_CLS =
  'px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-60';

export function DomainCascadeSelect({
  value,
  onChange,
  includeAllOption = true,
  disabled,
  countByCode,
  className,
  compact,
}: DomainCascadeSelectProps) {
  const { tree, loading, findL1 } = useTaxonomy();

  const l1Options = tree;
  const l1Node = value.l1 ? findL1(value.l1) : null;
  const l2Options = l1Node?.children ?? [];

  const selectCls = `${BASE_CLS} ${compact ? 'min-w-[120px]' : 'min-w-[160px]'}`;

  const labelWithCount = (code: string, name: string, icon?: string | null) => {
    const c = countByCode?.[code];
    const prefix = icon ? `${icon} ` : '';
    return c != null ? `${prefix}${name} (${c})` : `${prefix}${name}`;
  };

  const isE99 = value.l1 === 'E99';

  const handleL1 = (next: string) => {
    if (!next) {
      onChange({ l1: null, l2: null });
    } else {
      onChange({ l1: next, l2: null });
    }
  };

  const handleL2 = (next: string) => {
    onChange({ l1: value.l1, l2: next || null });
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <select
        className={selectCls}
        value={value.l1 ?? ''}
        onChange={e => handleL1(e.target.value)}
        disabled={disabled || loading}
      >
        {includeAllOption && <option value="">全部领域</option>}
        {l1Options.map(n => (
          <option key={n.code} value={n.code}>
            {labelWithCount(n.code, n.name, n.icon)}
          </option>
        ))}
      </select>

      {value.l1 && !isE99 && (
        <select
          className={selectCls}
          value={value.l2 ?? ''}
          onChange={e => handleL2(e.target.value)}
          disabled={disabled || loading || l2Options.length === 0}
        >
          <option value="">全部子类</option>
          {l2Options.map(n => (
            <option key={n.code} value={n.code}>
              {labelWithCount(n.code, n.name, null)}
            </option>
          ))}
        </select>
      )}

      {isE99 && (
        <input
          type="text"
          className={selectCls}
          placeholder="自定义（可选）"
          value={value.l2 ?? ''}
          onChange={e => handleL2(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/** Resolve a cascade selection to a single taxonomy_code query param.
 *  Prefer the specific L2 code; otherwise fall back to the L1. */
export function selectionToCode(sel: TaxonomySelection): string | undefined {
  return sel.l2 || sel.l1 || undefined;
}

/** Parse a URL query value (either just level-1 or "E07.LLM") back into a
 *  cascade selection. */
export function codeToSelection(code: string | null | undefined): TaxonomySelection {
  if (!code) return { l1: null, l2: null };
  if (/^E\d{2}$/.test(code)) return { l1: code, l2: null };
  if (/^E\d{2}\./.test(code)) return { l1: code.split('.')[0], l2: code };
  // Unknown format — treat as custom within E99
  return { l1: 'E99', l2: code };
}

export function useTaxonomyOptions() {
  const ctx = useTaxonomy();
  return useMemo(() => ({ ...ctx }), [ctx]);
}
