/**
 * axes/_shared helpers — safeJsonParse
 *
 * LLM 输出可能是纯 JSON / ```json``` 代码块 / 夹杂自然语言。
 * safeJsonParse 必须全部兼容，解析失败返回 fallback 而不抛。
 */
import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../../src/modules/meeting-notes/axes/_shared.js';

describe('safeJsonParse', () => {
  it('parses a plain JSON array', () => {
    expect(safeJsonParse('[{"a":1}]', [])).toEqual([{ a: 1 }]);
  });

  it('parses a plain JSON object', () => {
    expect(safeJsonParse('{"k":"v"}', {})).toEqual({ k: 'v' });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n[{"x":1}]\n```';
    expect(safeJsonParse(raw, [])).toEqual([{ x: 1 }]);
  });

  it('strips unnamed ``` fences', () => {
    const raw = '```\n{"ok":true}\n```';
    expect(safeJsonParse(raw, {})).toEqual({ ok: true });
  });

  it('extracts first balanced JSON from mixed natural language', () => {
    const raw = '以下是抽取结果：\n[{"text":"foo"},{"text":"bar"}]\n备注: 完成。';
    expect(safeJsonParse(raw, [])).toEqual([{ text: 'foo' }, { text: 'bar' }]);
  });

  it('handles nested structures', () => {
    const raw = '{"a":{"b":[1,2,3]},"c":"d"}';
    expect(safeJsonParse(raw, {})).toEqual({ a: { b: [1, 2, 3] }, c: 'd' });
  });

  it('returns fallback on invalid JSON', () => {
    expect(safeJsonParse('not json at all', [])).toEqual([]);
    expect(safeJsonParse('', { z: 1 })).toEqual({ z: 1 });
  });

  it('returns fallback when no balanced JSON found', () => {
    const raw = '{"unbalanced":';
    expect(safeJsonParse(raw, [])).toEqual([]);
  });

  it('prefers fence over inline when both exist', () => {
    const raw = '前言 [{"inline":1}] 之后\n```json\n[{"fenced":2}]\n```';
    // fenceMatch 先尝试，成功则用它
    expect(safeJsonParse(raw, [])).toEqual([{ fenced: 2 }]);
  });
});
