import { describe, expect, it } from 'vitest';

import { maskValue, valueFingerprint } from './mask.ts';

describe('valueFingerprint', () => {
  it('identical values produce identical fingerprints', () => {
    expect(valueFingerprint('hello')).toBe(valueFingerprint('hello'));
  });

  it('different values produce different fingerprints', () => {
    expect(valueFingerprint('a')).not.toBe(valueFingerprint('b'));
  });

  it('returns 8 hex chars', () => {
    expect(valueFingerprint('hello')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('maskValue', () => {
  it('empty value', () => {
    expect(maskValue('')).toBe('<empty>');
  });

  it('fully masks short values', () => {
    expect(maskValue('abc')).toBe('***');
  });

  it('shows first/last char preview for long values', () => {
    expect(maskValue('abcdef')).toBe('a****f');
    expect(maskValue('https://api.example.com')).toBe(`h${'*'.repeat(21)}m`);
  });
});
