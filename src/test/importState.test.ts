import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { importState } from '../../api/_lib/importState';

describe('server import state boundary', () => {
  it('accepts a complete Yjs document and derives its name from the document', () => {
    const doc = new Y.Doc(); doc.getMap('meta').set('name', 'Circuito');
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'); doc.destroy();
    expect(importState(state)).toEqual({ state, name: 'Circuito' });
  });
  it.each([undefined, null, '', 'not-base64!', 'AAAA', 'a'.repeat(4_000_004)])('rejects malformed or oversized state', value => {
    expect(() => importState(value)).toThrow();
  });
  it('rejects unexpected document roots and wrong shared types', () => {
    for (const kind of ['unknown', 'wrong-type']) {
      const doc = new Y.Doc(); doc.getMap('meta').set('name', 'Circuito');
      if (kind === 'unknown') doc.getMap('permissions').set('owner', 'other-user');
      else doc.getArray('parts').push(['invalid']);
      const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'); doc.destroy();
      expect(() => importState(state)).toThrow();
    }
  });
});
