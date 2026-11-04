import { describe, expect, it } from 'vitest';
import { advanceFlow, emptyFlowFrame, FLOW_PERIOD, nearestWire, wireEmphasis } from './wireFeedback';
import type { WireData } from '../core/types';

describe('physical wire feedback', () => {
  it('emphasizes only the pointed wire, even when several cables share an electrical signal', () => {
    expect(wireEmphasis('first', 'first', [])).toEqual({ hovered: true, opacity: 1 });
    expect(wireEmphasis('same-net', 'first', [])).toEqual({ hovered: false, opacity: .48 });
    expect(wireEmphasis('same-net', null, ['first', 'same-net']).opacity).toBe(1);
    expect(wireEmphasis('first', 'first', [], 'assembly-step').opacity).toBe(.12);
  });
  it('chooses the nearer of overlapping hit targets at different zooms', () => {
    const wires = [0, 5].map((y, n): WireData => ({ id: `w${n}`, a: { x: 0, y }, b: { x: 100, y }, points: [], color: '#f00' }));
    for (const zoom of [.4, 1, 4])
      expect(nearestWire({ x: 50, y: .2 }, wires, w => [w.a, w.b], zoom, 'w1')).toBe('w0');
  });
  it('keeps direction and appearance continuous through reversals, stops and a dash wrap', () => {
    let frame = { ...emptyFlowFrame(), phase: .001, speed: 32, opacity: .8 };
    const next = advanceFlow(frame, .001, 3.3, 1 / 120, false);
    expect(next.phase).toBeGreaterThan(11);
    expect((frame.phase - next.phase + FLOW_PERIOD) % FLOW_PERIOD).toBeLessThan(.3);
    frame = advanceFlow(frame, -.001, 3.3, 1 / 120, false);
    expect(frame.speed).toBeGreaterThan(0); // no instantaneous direction flip
    expect(advanceFlow(frame, 0, 0, 1 / 120, false).opacity).toBeGreaterThan(.7);
    expect(advanceFlow(frame, .001, 3.3, 1 / 120, true).phase).toBe(frame.phase);
  });
  it('travels the same distance at 30, 60 and 120 frames per second', () => {
    const run = (fps: number) => { let f = emptyFlowFrame(); for (let n = 0; n < fps; n++) f = advanceFlow(f, .001, 3.3, 1 / fps, false); return f; };
    for (const fps of [30, 60]) {
      expect(run(fps).phase).toBeCloseTo(run(120).phase, 8);
      expect(run(fps).opacity).toBeCloseTo(run(120).opacity, 8);
    }
  });
});
