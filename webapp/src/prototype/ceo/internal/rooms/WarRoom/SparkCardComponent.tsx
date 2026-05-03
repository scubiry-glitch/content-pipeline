// Spark 卡片组件 — 3D 翻面 (CSS rotateY 0.6s)
// 正面: tag + headline + evidence_short + "↻ 翻面看证据"
// 背面: Why list (3 条) + ⚠ 风险 + [采纳并加入议程] + [换一个]

import { useState } from 'react';

/** Why 证据条目：新 schema 为 { text, source }（war-room-spark prompt 输出格式），
 *  老数据 / mock 仍可能是 string —— 渲染处兼容两种形状。 */
export type WhyEvidence = string | { text: string; source?: string | null };

export interface SparkRow {
  id: string;
  tag: string;
  headline: string;
  evidence_short: string | null;
  why_evidence: WhyEvidence[];
  risk_text: string | null;
}

interface Props {
  spark: SparkRow;
  onAdopt?: (id: string) => void;
  onReplace?: (id: string) => void;
}

export function SparkCard({ spark, onAdopt, onReplace }: Props) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      onClick={(e) => {
        // 点击按钮时不翻
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        setFlipped((f) => !f);
      }}
      style={{
        perspective: '1000px',
        cursor: 'pointer',
        minHeight: 200,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 200,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s cubic-bezier(.4,.1,.3,1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* 正面 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: 'rgba(200,161,92,0.06)',
            border: '1px solid rgba(200,161,92,0.25)',
            borderLeft: '3px solid #C8A15C',
            borderRadius: '0 4px 4px 0',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#C8A15C',
              letterSpacing: 0.3,
              marginBottom: 2,
            }}
          >
            {spark.tag}
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 13.5,
              color: '#F5D9D9',
              lineHeight: 1.55,
              fontWeight: 600,
            }}
          >
            {spark.headline}
          </div>
          {spark.evidence_short && (
            <div
              style={{
                fontSize: 11.5,
                color: 'rgba(245,217,217,0.65)',
                lineHeight: 1.5,
              }}
            >
              {spark.evidence_short}
            </div>
          )}
          <div
            style={{
              marginTop: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(200,161,92,0.7)',
              letterSpacing: 0.2,
            }}
          >
            ↻ 翻面看证据
          </div>
        </div>

        {/* 背面 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'rgba(168,69,30,0.08)',
            border: '1px solid rgba(168,69,30,0.4)',
            borderLeft: '3px solid #FFB89A',
            borderRadius: '0 4px 4px 0',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#FFB89A',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            Why · 证据
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11.5,
              color: 'rgba(245,217,217,0.85)',
              lineHeight: 1.6,
            }}
          >
            {spark.why_evidence.map((w, i) => {
              if (typeof w === 'string') return <li key={i}>{w}</li>;
              const text = w?.text ?? '';
              const source = w?.source;
              return (
                <li key={i}>
                  {text}
                  {source && (
                    <span style={{
                      marginLeft: 6, opacity: 0.55, fontFamily: 'var(--mono)', fontSize: 10.5,
                    }}>· {source}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {spark.risk_text && (
            <div
              style={{
                padding: '6px 8px',
                background: 'rgba(214,69,69,0.1)',
                borderLeft: '2px solid #D64545',
                fontSize: 11,
                color: '#FFCFB7',
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
              }}
            >
              {spark.risk_text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
            <button
              onClick={() => onAdopt?.(spark.id)}
              style={{
                flex: 1,
                padding: '6px 10px',
                background: '#C8A15C',
                color: '#1A0E0E',
                border: 0,
                borderRadius: 4,
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✓ 采纳并加入议程
            </button>
            <button
              onClick={() => onReplace?.(spark.id)}
              style={{
                padding: '6px 10px',
                background: 'rgba(200,161,92,0.1)',
                color: 'rgba(245,217,217,0.85)',
                border: '1px solid rgba(200,161,92,0.4)',
                borderRadius: 4,
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                cursor: 'pointer',
              }}
            >
              换一个
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
