import { describe, expect, it } from 'vitest';
import { elementDef, noteLines } from './elements';

describe('design notes', () => {
  it('preserves existing explicit line breaks and wraps text to a chosen width', () => {
    expect(noteLines({ text: 'uno dos\ntres' })).toEqual(['uno dos', 'tres']);
    expect(noteLines({ text: 'uno dos tres', width: 60 })).toEqual(['uno', 'dos', 'tres']);
    expect(noteLines({ text: 'abcdefghijkl', width: 60 })).toEqual(['abcdef', 'ghijkl']);
  });

  it('keeps all wrapped text visible when the note is resized', () => {
    const def = elementDef('note', () => undefined)!;
    const ctx = { sheet: () => undefined, instantiate: () => null };
    const size = def.size({ text: 'uno dos tres cuatro', width: 60, height: 30 }, ctx);
    expect(size.w).toBe(60);
    expect(size.h).toBeGreaterThan(30);
  });
});
