import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData, Props } from '../core/types';
import { PARTS } from '../parts';
import { SimEngine } from './engine';

const part = (id: string, type: string, x: number, props: Props = {}): PartData => ({ id, type, x, y: 0, rot: 0, props: { ...PARTS[type].defaults, ...props } });

/** Fuente de banco con una carga de 100 Ω: el circuito más simple donde se mueven los mandos. */
const loaded = (voltage: number, current: number): CircuitSnapshot => ({
  parts: [part('s', 'bench-supply', 0, { voltage, current }), part('r', 'resistor', 500, { resistance: 100 })],
  wires: [['+', '1'], ['-', '2']].map(([a, b], i) => ({ id: `w${i}`, a: { part: 's', pin: a, x: 0, y: 0 }, b: { part: 'r', pin: b, x: 0, y: 0 }, color: '#000', points: [], sch: true })),
});

describe('mandos de la fuente de banco', () => {
  it('al girar la tensión en marcha, la pantalla nunca enseña una corriente absurda', () => {
    const engine = new SimEngine();
    engine.update(loaded(20, 5));
    engine.start({ manual: true });
    engine.tick(0.05);
    // Como arrastrar el mando de 20 V a 0 V: cada paso cambia la tensión antes de que el motor resuelva.
    for (let v = 20; v >= 0; v -= 0.5) {
      engine.update(loaded(v, 5));
      engine.tick(0.016);
      const shown = engine.getVisual('s')!;
      expect(Math.abs(Number(shown.i)), `V = ${v}`).toBeLessThan(0.25);
      expect(Number(shown.v)).toBeGreaterThanOrEqual(-0.01);
    }
    engine.stop();
  });

  it('al girar el límite de corriente tampoco hay picos, y entra en CC', () => {
    const engine = new SimEngine();
    engine.update(loaded(5, 1));
    engine.start({ manual: true });
    engine.tick(0.05);
    for (let a = 1; a >= 0.01; a -= 0.05) {
      engine.update(loaded(5, a));
      engine.tick(0.016);
      expect(Math.abs(Number(engine.getVisual('s')!.i))).toBeLessThan(0.25);
    }
    engine.update(loaded(5, 0.01));
    engine.tick(0.05);
    expect(engine.getVisual('s')!.cc).toBe(true);
    engine.stop();
  });
});
