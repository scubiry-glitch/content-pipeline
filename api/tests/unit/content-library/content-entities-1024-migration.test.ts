import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function connSrc(): string {
  const p = fileURLToPath(new URL('../../../src/db/connection.ts', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('content_entities 1024 迁移', () => {
  it('含幂等守卫式 ALTER 到 vector(1024)', () => {
    const s = connSrc();
    // 守卫：检测当前维度 / 仅 768 时才改
    expect(s).toMatch(/content_entities.*embedding.*vector\(1024\)/s);
    expect(s).toMatch(/DROP INDEX IF EXISTS idx_content_entities_embedding/);
    // 幂等守卫标记（DO 块 + 维度判断）
    expect(s).toMatch(/atttypmod|format_type|vector\(768\)/);
  });
});
