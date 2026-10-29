import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { templateSnapshot } from './applyTemplate';
import { TEMPLATES } from './templates';

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;

function run(id: string) {
  const engine = new SimEngine();
  engine.update(templateSnapshot(byId(id)));
  engine.start({ manual: true });
  return engine;
}

const lit = (engine: SimEngine, key: string) => Number(engine.getVisual(key)?.i ?? 0) > 0.002;

describe('plantillas', () => {
  it('todas se montan: ids únicos y cada cable llega a una patilla que existe', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(new Set(t.parts.map((p) => p.key)).size, t.id).toBe(t.parts.length);
      expect(() => templateSnapshot(t), t.id).not.toThrow();
    }
  });

  it('las de lógica secuencial usan varias protoboards', () => {
    const sequential = TEMPLATES.filter((t) => t.category === 'Lógica secuencial');
    expect(sequential.length).toBeGreaterThanOrEqual(4);
    for (const t of sequential) expect(t.parts.filter((p) => p.type.startsWith('breadboard')).length, t.id).toBeGreaterThanOrEqual(2);
  });

  it('el contador binario cuenta de 0 a 15 en los LEDs', () => {
    const engine = run('counter4');
    const values: number[] = [];
    for (let k = 0; k < 40; k++) {
      engine.tick(0.5);
      values.push([0, 1, 2, 3].reduce((n, i) => n + (lit(engine, `l${i}`) ? 1 << i : 0), 0));
    }
    for (let k = 1; k < values.length; k++) expect((values[k] - values[k - 1] + 16) % 16, `paso ${k}: ${values}`).toBe(1);
    expect(new Set(values).size).toBe(16);
    engine.stop();
  });

  it('el divisor de frecuencia reparte los flancos: cada LED va a la mitad del anterior', () => {
    const engine = run('freqdiv');
    const edges = [0, 0, 0, 0];
    const prev = [false, false, false, false];
    for (let k = 0; k < 800; k++) {
      engine.tick(0.02);
      for (let i = 0; i < 4; i++) {
        const on = lit(engine, `l${i}`);
        if (on && !prev[i]) edges[i]++;
        prev[i] = on;
      }
    }
    // 16 s con un reloj de 8 Hz: los LEDs van a 4, 2, 1 y 0,5 Hz → 64, 32, 16 y 8 subidas.
    expect(edges.map((n, i) => Math.abs(n - 64 / 2 ** i)).every((d) => d <= 1), String(edges)).toBe(true);
    engine.stop();
  });

  it('el contador de década enseña los dígitos 0–9 en orden y vuelve a 0', () => {
    const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg'];
    const engine = run('decade');
    const seen: number[] = [];
    for (let k = 0; k < 30; k++) {
      engine.tick(0.5);
      const v = engine.getVisual('seg');
      const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.001).join('');
      seen.push(DIGITS.indexOf(on));
    }
    expect(seen.includes(-1), `patrón desconocido en ${seen}`).toBe(false);
    for (let k = 1; k < seen.length; k++) expect((seen[k] - seen[k - 1] + 10) % 10, `paso ${k}: ${seen}`).toBe(1);
    expect(new Set(seen).size).toBe(10);
    engine.stop();
  });

  it('las luces secuenciales encienden una sola y la pasan de la 1 a la 10 en bucle', () => {
    const engine = run('chaser');
    const order: number[] = [];
    for (let k = 0; k < 330; k++) {
      engine.tick(0.02);
      const v = engine.getVisual('bar');
      // El valor de cada LED es la media del tick: en el cambio de salida pueden verse dos; manda la mayor.
      const levels = Array.from({ length: 10 }, (_, i) => Number(v?.[`i${i}`] ?? 0));
      const top = Math.max(...levels);
      if (top > 0.005 && levels.indexOf(top) !== order[order.length - 1]) order.push(levels.indexOf(top));
    }
    expect(order.length).toBeGreaterThan(20);
    for (let k = 1; k < order.length; k++) expect((order[k] - order[k - 1] + 10) % 10, `${order}`).toBe(1);
    engine.stop();
  });
});
