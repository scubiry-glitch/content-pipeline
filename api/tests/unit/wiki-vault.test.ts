/**
 * wikiVault — vault 初始化 + 跨 ws 路径越权防御
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initWorkspaceVault, isPathInWorkspaceVault } from '../../src/lib/wikiVault.js';

let tmpRoot: string;
let originalWikiRoot: string | undefined;

beforeEach(async () => {
  // 把 wiki 临时挪到 tmpdir, 不污染 repo data/
  originalWikiRoot = process.env.WIKI_ROOT;
  delete process.env.WIKI_ROOT;
  delete process.env.MN_CLAUDE_WIKI_ROOT;
  delete process.env.CONTENT_LIBRARY_WIKI_ROOT;
  tmpRoot = await mkdtemp(join(tmpdir(), 'wiki-vault-test-'));
  // 用绝对路径覆盖 — initWorkspaceVault 用 wikiRoot.ts 解析,
  // 测试内通过 env 强制定向到 tmp
  process.env.WIKI_ROOT = join(tmpRoot, 'override-via-env');
});

afterEach(async () => {
  process.env.WIKI_ROOT = originalWikiRoot;
  delete process.env.MN_CLAUDE_WIKI_ROOT;
  delete process.env.CONTENT_LIBRARY_WIKI_ROOT;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('initWorkspaceVault', () => {
  it('创建骨架目录 + index.md', async () => {
    delete process.env.WIKI_ROOT;
    // 让 resolveWikiRoot 回到 default fallback (REPO_ROOT/data/content-wiki/<slug>)
    // 但测试需要写到 tmp — 用绝对 override
    // 实际生产环境会在 data/content-wiki/<slug>; 这里改用 env 走 tmp
    process.env.WIKI_ROOT = join(tmpRoot, 'data', 'content-wiki', 'test-ws');
    const r = await initWorkspaceVault('test-ws', 'Test WS');
    expect(r.ok).toBe(true);
    expect(r.root).toBeDefined();
    // env 路径优先级高于 slug 派生 — 实际写到 env 路径
    const dirs = await readdir(r.root!);
    expect(dirs).toContain('concepts');
    expect(dirs).toContain('domains');
    expect(dirs).toContain('entities');
    expect(dirs).toContain('sources');
    expect(dirs).toContain('index.md');
    const indexBody = await readFile(join(r.root!, 'index.md'), 'utf8');
    expect(indexBody).toContain('Test WS');
    expect(indexBody).toContain('slug=`test-ws`');
  });

  it('幂等: 第二次调用不报错且不覆盖 index.md', async () => {
    process.env.WIKI_ROOT = join(tmpRoot, 'data', 'content-wiki', 'idempotent-ws');
    const r1 = await initWorkspaceVault('idempotent-ws', 'V1');
    expect(r1.ok).toBe(true);
    const stat1 = await stat(join(r1.root!, 'index.md'));
    // 模拟用户编辑过 index.md 后重跑 init: 内容应保持
    const r2 = await initWorkspaceVault('idempotent-ws', 'V2 不应该覆盖');
    expect(r2.ok).toBe(true);
    const indexBody2 = await readFile(join(r2.root!, 'index.md'), 'utf8');
    expect(indexBody2).toContain('V1');
    expect(indexBody2).not.toContain('V2 不应该覆盖');
    const stat2 = await stat(join(r2.root!, 'index.md'));
    expect(stat2.mtimeMs).toBe(stat1.mtimeMs);
  });
});

describe('isPathInWorkspaceVault', () => {
  beforeEach(() => {
    // 不用 env 干扰路径解析 — 测纯字符串 resolve
    delete process.env.WIKI_ROOT;
    delete process.env.MN_CLAUDE_WIKI_ROOT;
    delete process.env.CONTENT_LIBRARY_WIKI_ROOT;
  });

  it('精确等于 vault 根 → true', () => {
    // wikiRoot.ts: data/content-wiki/<slug>; 这里 isPathInWorkspaceVault 内部按 slug 解析,
    // 提供的 input 应该 resolve 到同一路径
    expect(isPathInWorkspaceVault('data/content-wiki/abc', 'abc')).toBe(true);
  });

  it('vault 子路径 → true', () => {
    expect(isPathInWorkspaceVault('data/content-wiki/abc/sources/meeting', 'abc')).toBe(true);
    expect(isPathInWorkspaceVault('data/content-wiki/abc/concepts/x.md', 'abc')).toBe(true);
  });

  it('其他 ws 的 vault → false', () => {
    expect(isPathInWorkspaceVault('data/content-wiki/other-ws', 'abc')).toBe(false);
    expect(isPathInWorkspaceVault('data/content-wiki/other-ws/sources', 'abc')).toBe(false);
  });

  it('路径穿越攻击 → false', () => {
    expect(isPathInWorkspaceVault('data/content-wiki/abc/../other-ws', 'abc')).toBe(false);
    expect(isPathInWorkspaceVault('/etc/passwd', 'abc')).toBe(false);
    expect(isPathInWorkspaceVault('../../tmp', 'abc')).toBe(false);
  });

  it('空 / 非法 input → false', () => {
    expect(isPathInWorkspaceVault('', 'abc')).toBe(false);
    expect(isPathInWorkspaceVault('   ', 'abc')).toBe(false);
    // @ts-expect-error: 测试运行时传非 string
    expect(isPathInWorkspaceVault(null, 'abc')).toBe(false);
  });

  it('非法 slug (路径穿越) → false (resolveWikiRoot 抛错被 catch)', () => {
    expect(isPathInWorkspaceVault('data/content-wiki/abc', '../etc')).toBe(false);
  });
});
