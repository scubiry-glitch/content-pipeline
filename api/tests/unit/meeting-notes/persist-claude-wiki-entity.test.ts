import { describe, it, expect } from 'vitest';
import { entityTypeForSubtype } from '../../../src/modules/meeting-notes/runs/persistClaudeWiki.js';

describe('entityTypeForSubtype', () => {
  it('实体类 subtype 映射到 EntityType', () => {
    expect(entityTypeForSubtype('person')).toBe('person');
    expect(entityTypeForSubtype('org')).toBe('organization');
    expect(entityTypeForSubtype('product')).toBe('product');
    expect(entityTypeForSubtype('event')).toBe('event');
    expect(entityTypeForSubtype('location')).toBe('location');
  });
  it('project 与概念类 subtype → null（不注册 content_entities）', () => {
    expect(entityTypeForSubtype('project')).toBeNull();
    expect(entityTypeForSubtype('mental-model')).toBeNull();
    expect(entityTypeForSubtype('judgment')).toBeNull();
    expect(entityTypeForSubtype('bias')).toBeNull();
    expect(entityTypeForSubtype('counterfactual')).toBeNull();
    expect(entityTypeForSubtype('metric')).toBeNull();
    expect(entityTypeForSubtype('unknown-xyz')).toBeNull();
  });
});
