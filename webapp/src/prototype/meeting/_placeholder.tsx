// 统一占位组件 — 骨架阶段每个尚未实现的页面使用
// 样式与原型色板一致；页面接入真 API 后替换为具体实现

import type { ReactNode } from 'react';
import { SectionLabel, MonoMeta, Chip, MockBadge } from './_atoms';

interface PlaceholderProps {
  title: string;
  subtitle?: string;
  protoSrc: string;       // 原型源文件（方便逐页推进时对照）
  phase: number;          // 将在 Phase N 落地
  preview?: ReactNode;    // 可选：这页预期内容摘要（帮助审视空间占用）
}

export function Placeholder({ title, subtitle, protoSrc, phase, preview }: PlaceholderProps) {
  return (
    <div style={{
      padding: '40px 48px',
      maxWidth: 1200,
      minHeight: 'calc(100vh - 56px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1 style={{
          fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 28,
          letterSpacing: '-0.01em', margin: 0, color: 'var(--ink)',
        }}>
          {title}
        </h1>
        <MockBadge />
        <Chip tone="ghost">Phase {phase}</Chip>
      </div>

      {subtitle && (
        <p style={{
          fontFamily: 'var(--sans)', fontSize: 14,
          color: 'var(--ink-3)', margin: '0 0 24px 0', maxWidth: 720, lineHeight: 1.5,
        }}>
          {subtitle}
        </p>
      )}

      <div style={{
        background: 'var(--paper)', border: '1px dashed var(--line)',
        borderRadius: 10, padding: '28px 32px', marginBottom: 20,
      }}>
        <SectionLabel>骨架阶段</SectionLabel>
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '10px 0 0 0', lineHeight: 1.6 }}>
          本页面将在 <b>Phase {phase}</b> 按原型 <code style={{
            fontFamily: 'var(--mono)', background: 'var(--paper-2)',
            padding: '1px 6px', borderRadius: 3, fontSize: 12,
          }}>{protoSrc}</code> 直译还原。
          当前仅骨架与路由；无运行时错误。
        </p>
      </div>

      {preview && (
        <div>
          <SectionLabel>预期内容摘要</SectionLabel>
          <div style={{ marginTop: 12 }}>{preview}</div>
        </div>
      )}
    </div>
  );
}

export default Placeholder;
