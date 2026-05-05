/**
 * wikiRoot — per-workspace vault path 解析
 *
 * 行为契约:
 *   1) 无参 / 老 null / 老 string null → 走 data/content-wiki/default (兼容老路径)
 *   2) opts.workspaceSlug='abc' → data/content-wiki/abc
 *   3) opts.override 优先级最高, 跳过 env / slug
 *   4) 老 string 参数 = opts.override 兼容
 *   5) env (MN_CLAUDE_WIKI_ROOT / CONTENT_LIBRARY_WIKI_ROOT / WIKI_ROOT) 在 override 之后, slug 之前
 *   6) strict=true 缺 workspaceSlug → 抛错 (防 caller 漏传时静默落 default)
 *   7) 非法 slug (路径穿越 / 空格 / 大写) 抛错
 *   8) resolveWikiSubPath 兼容新旧两种调用形式
 *   9) resolveWorkspaceSlug 缓存 + null fallback + DB 异常 fallback
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../src/db/connection.js', () => ({
  query: queryMock,
}));

import {
  resolveWikiRoot,
  resolveWikiSubPath,
  resolveWorkspaceSlug,
  clearWorkspaceSlugCache,
  DEFAULT_WIKI_ROOT_ABS,
} from '../../src/lib/wikiRoot.js';

describe('resolveWikiRoot', () => {
  beforeEach(() => {
    delete process.env.MN_CLAUDE_WIKI_ROOT;
    delete process.env.CONTENT_LIBRARY_WIKI_ROOT;
    delete process.env.WIKI_ROOT;
  });

  it('无参 → DEFAULT_WIKI_ROOT_ABS (data/content-wiki/default)', () => {
    const r = resolveWikiRoot();
    expect(r).toBe(DEFAULT_WIKI_ROOT_ABS);
    expect(r).toMatch(/data\/content-wiki\/default$/);
  });

  it('null / undefined → default 路径', () => {
    expect(resolveWikiRoot(null)).toBe(DEFAULT_WIKI_ROOT_ABS);
    expect(resolveWikiRoot(undefined)).toBe(DEFAULT_WIKI_ROOT_ABS);
  });

  it('opts.workspaceSlug=abc → data/content-wiki/abc', () => {
    const r = resolveWikiRoot({ workspaceSlug: 'abc' });
    expect(r).toMatch(/data\/content-wiki\/abc$/);
  });

  it('opts.workspaceSlug=default-yz566-cornell-edu → 衍生 slug 正确解析', () => {
    const r = resolveWikiRoot({ workspaceSlug: 'default-yz566-cornell-edu' });
    expect(r).toMatch(/data\/content-wiki\/default-yz566-cornell-edu$/);
  });

  it('opts.workspaceSlug 空字符串 / 空白 → fallback 到 default', () => {
    expect(resolveWikiRoot({ workspaceSlug: '' })).toBe(DEFAULT_WIKI_ROOT_ABS);
    expect(resolveWikiRoot({ workspaceSlug: '  ' })).toBe(DEFAULT_WIKI_ROOT_ABS);
    expect(resolveWikiRoot({ workspaceSlug: null })).toBe(DEFAULT_WIKI_ROOT_ABS);
  });

  it('opts.override 绝对路径 → 直接用', () => {
    const r = resolveWikiRoot({ override: '/tmp/myvault' });
    expect(r).toBe('/tmp/myvault');
  });

  it('opts.override 相对路径 → 相对仓库根解析', () => {
    const r = resolveWikiRoot({ override: 'data/foo' });
    expect(r).toMatch(/data\/foo$/);
    expect(r.startsWith('/')).toBe(true);
  });

  it('opts.override 优先于 workspaceSlug', () => {
    const r = resolveWikiRoot({ override: '/tmp/x', workspaceSlug: 'should-ignore' });
    expect(r).toBe('/tmp/x');
  });

  it('老 string 签名 = override (兼容 router.ts:1001)', () => {
    expect(resolveWikiRoot('/tmp/legacy')).toBe('/tmp/legacy');
  });

  it('env MN_CLAUDE_WIKI_ROOT 优先于 slug, 低于 override', () => {
    process.env.MN_CLAUDE_WIKI_ROOT = '/tmp/env-wiki';
    expect(resolveWikiRoot({ workspaceSlug: 'abc' })).toBe('/tmp/env-wiki');
    expect(resolveWikiRoot({ override: '/tmp/o', workspaceSlug: 'abc' })).toBe('/tmp/o');
  });

  it('env 优先级: MN_CLAUDE_WIKI_ROOT > CONTENT_LIBRARY_WIKI_ROOT > WIKI_ROOT', () => {
    process.env.WIKI_ROOT = '/tmp/c';
    expect(resolveWikiRoot()).toBe('/tmp/c');
    process.env.CONTENT_LIBRARY_WIKI_ROOT = '/tmp/b';
    expect(resolveWikiRoot()).toBe('/tmp/b');
    process.env.MN_CLAUDE_WIKI_ROOT = '/tmp/a';
    expect(resolveWikiRoot()).toBe('/tmp/a');
  });

  it('strict=true + 缺 workspaceSlug → 抛错', () => {
    expect(() => resolveWikiRoot({ strict: true })).toThrow(/strict.*workspaceSlug/);
    expect(() => resolveWikiRoot({ strict: true, workspaceSlug: '' })).toThrow();
  });

  it('strict=true + 有 workspaceSlug → 正常返回', () => {
    const r = resolveWikiRoot({ strict: true, workspaceSlug: 'abc' });
    expect(r).toMatch(/data\/content-wiki\/abc$/);
  });

  it('非法 slug 路径穿越 → 抛错', () => {
    expect(() => resolveWikiRoot({ workspaceSlug: '../etc' })).toThrow(/invalid workspaceSlug/);
    expect(() => resolveWikiRoot({ workspaceSlug: 'a/b' })).toThrow();
    expect(() => resolveWikiRoot({ workspaceSlug: 'WITH-UPPER' })).toThrow();
    expect(() => resolveWikiRoot({ workspaceSlug: 'with space' })).toThrow();
    expect(() => resolveWikiRoot({ workspaceSlug: '1'.repeat(100) })).toThrow();
  });
});

describe('resolveWikiSubPath', () => {
  beforeEach(() => {
    delete process.env.MN_CLAUDE_WIKI_ROOT;
    delete process.env.CONTENT_LIBRARY_WIKI_ROOT;
    delete process.env.WIKI_ROOT;
  });

  it('老形式: 全部字符串参数 → 拼到 default vault', () => {
    const r = resolveWikiSubPath('sources', 'meeting');
    expect(r).toMatch(/data\/content-wiki\/default\/sources\/meeting$/);
  });

  it('新形式: opts 第一参 + segments → 拼到 per-ws vault', () => {
    const r = resolveWikiSubPath({ workspaceSlug: 'tenant-a' }, 'sources', 'meeting');
    expect(r).toMatch(/data\/content-wiki\/tenant-a\/sources\/meeting$/);
  });
});

describe('resolveWorkspaceSlug', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clearWorkspaceSlugCache();
  });

  it('null wsId (admin / api-key) → default', async () => {
    const slug = await resolveWorkspaceSlug(null);
    expect(slug).toBe('default');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('undefined wsId → default', async () => {
    const slug = await resolveWorkspaceSlug(undefined);
    expect(slug).toBe('default');
  });

  it('正常 wsId → DB 返回 slug', async () => {
    queryMock.mockResolvedValue({ rows: [{ slug: 'tenant-a' }] });
    const slug = await resolveWorkspaceSlug('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(slug).toBe('tenant-a');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('缓存生效 → 第二次同一 wsId 不再 SELECT', async () => {
    queryMock.mockResolvedValue({ rows: [{ slug: 'tenant-a' }] });
    const wsId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await resolveWorkspaceSlug(wsId);
    await resolveWorkspaceSlug(wsId);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('DB 抛错 → fallback default + 不抛错', async () => {
    queryMock.mockRejectedValue(new Error('connection lost'));
    const slug = await resolveWorkspaceSlug('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(slug).toBe('default');
  });

  it('DB 返回空 → fallback default', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const slug = await resolveWorkspaceSlug('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(slug).toBe('default');
  });

  it('DB 返回非法 slug → fallback default (防路径穿越)', async () => {
    queryMock.mockResolvedValue({ rows: [{ slug: '../etc/passwd' }] });
    const slug = await resolveWorkspaceSlug('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(slug).toBe('default');
  });
});
