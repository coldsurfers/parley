import { describe, expect, it } from 'vitest';

import { diffMaps, hasChanges } from './diff.ts';

describe('diffMaps', () => {
  it('classifies added/updated/removed/unchanged', () => {
    const local = new Map([
      ['NEW', 'a'],
      ['SAME', 'x'],
      ['CHANGED', 'new'],
    ]);
    const remote = new Map([
      ['SAME', 'x'],
      ['CHANGED', 'old'],
      ['ORPHAN', 'r'],
    ]);
    const r = diffMaps(local, remote);
    expect(r.added).toEqual(['NEW']);
    expect(r.updated).toEqual(['CHANGED']);
    expect(r.removed).toEqual(['ORPHAN']);
    expect(r.unchanged).toEqual(['SAME']);
  });

  it('reports no changes when both sides are empty', () => {
    const r = diffMaps(new Map(), new Map());
    expect(hasChanges(r)).toBe(false);
  });

  it('hasChanges is true if any of added/updated/removed are non-empty', () => {
    expect(hasChanges(diffMaps(new Map([['A', '1']]), new Map()))).toBe(true);
    expect(hasChanges(diffMaps(new Map(), new Map([['A', '1']])))).toBe(true);
    expect(hasChanges(diffMaps(new Map([['A', '1']]), new Map([['A', '2']])))).toBe(true);
    expect(hasChanges(diffMaps(new Map([['A', '1']]), new Map([['A', '1']])))).toBe(false);
  });
});
