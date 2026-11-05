import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LogicSim } from '../logic/sim';
import { MAIN_SHEET } from '../logic/types';
import { DesignDoc } from './design';
import { DESIGN_EXAMPLES } from './designExamples';

function setup() {
  const doc = new Y.Doc();
  const design = new DesignDoc(doc.getMap('logic'), (fn) => doc.transact(fn));
  const ids = DESIGN_EXAMPLES[0].insert(design);
  const main = design.sheet(MAIN_SHEET)!;
  const sim = new LogicSim(main, (id) => design.sheet(id));
  const byKind = (kind: string) => main.nodes.filter((n) => n.kind === kind);
  return { design, ids, main, sim, byKind };
}

// Segmentos a–g encendidos en cada display, en orden a..g.
const segments = (sim: LogicSim, node: string) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => sim.value(node, s));

describe('ejemplo «Comparador de pisos» del modo diseño', () => {
  it('crea los integrados decoder y COMPARADOR y todo el circuito principal', () => {
    const { design, ids, main, byKind } = setup();
    expect(design.ics().map((s) => s.name).sort()).toEqual(['COMPARADOR', 'decoder']);
    expect(ids).toHaveLength(main.nodes.length);
    expect(byKind('seg7')).toHaveLength(2);
    expect(byKind('in')).toHaveLength(8);
    expect(byKind('out').map((n) => n.props.label)).toEqual(expect.arrayContaining(['Debe BAJAR', 'Debe PARAR', 'Debe SUBIR']));
  });

  it('muestra 7 y 1 y, con el piso actual mayor, enciende solo «Debe BAJAR»', () => {
    const { sim, byKind, main } = setup();
    const [actual, call] = byKind('seg7').sort((a, b) => a.y - b.y);
    expect(segments(sim, actual.id)).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(segments(sim, call.id)).toEqual([0, 1, 1, 0, 0, 0, 0]);
    const led = (label: string) => sim.value(main.nodes.find((n) => n.props.label === label)!.id, 'A');
    expect([led('Debe BAJAR'), led('Debe PARAR'), led('Debe SUBIR')]).toEqual([1, 0, 0]);
  });

  it('para y sube según los interruptores', () => {
    const { sim, byKind, main } = setup();
    const bits = byKind('in').sort((a, b) => a.y - b.y || a.x - b.x);
    const [actual, call] = [bits.slice(0, 4), bits.slice(4)];
    const set = (row: typeof actual, n: number) => row.forEach((b, i) => sim.setSource(b.id, ((n >> (3 - i)) & 1) as 0 | 1));
    const led = (label: string) => sim.value(main.nodes.find((n) => n.props.label === label)!.id, 'A');
    set(actual, 3);
    set(call, 3);
    expect([led('Debe BAJAR'), led('Debe PARAR'), led('Debe SUBIR')]).toEqual([0, 1, 0]);
    set(call, 9);
    expect([led('Debe BAJAR'), led('Debe PARAR'), led('Debe SUBIR')]).toEqual([0, 0, 1]);
  });

  it('reutiliza los integrados al insertarlo otra vez y lo coloca a la derecha', () => {
    const { design, main } = setup();
    const before = Math.max(...main.nodes.map((n) => n.x));
    DESIGN_EXAMPLES[0].insert(design);
    expect(design.ics()).toHaveLength(2);
    const after = design.sheet(MAIN_SHEET)!.nodes;
    expect(after).toHaveLength(main.nodes.length * 2);
    expect(Math.min(...after.filter((n) => !main.nodes.some((m) => m.id === n.id)).map((n) => n.x))).toBeGreaterThan(before);
  });
});

describe('ejemplo «Ascensor de clase» del modo diseño', () => {
  function elevator() {
    const doc = new Y.Doc();
    const design = new DesignDoc(doc.getMap('logic'), (fn) => doc.transact(fn));
    DESIGN_EXAMPLES.find((e) => e.id === 'class-elevator')!.insert(design);
    const main = design.sheet(MAIN_SHEET)!;
    const sim = new LogicSim(main, (id) => design.sheet(id));
    const node = (label: string) => main.nodes.find((n) => n.props.label === label)!;
    const segs = main.nodes.filter((n) => n.kind === 'seg7').sort((a, b) => a.y - b.y);
    const DIGITS: Record<string, number> = { '1111110': 0, '0110000': 1, '1101101': 2, '1111001': 3, '0110011': 4 };
    const digit = (seg: (typeof segs)[number]) => {
      const bits = SEG.map((s) => sim.value(seg.id, s)).join('');
      return bits === '0000000' ? null : (DIGITS[bits] ?? bits);
    };
    const run = (s = 0.3) => sim.advance(s);
    const led = (label: string) => sim.value(node(label).id, 'A');
    const sensor = (f: number) => {
      for (let i = 1; i <= 4; i++) sim.setSource(node(`SP${i}`).id, 0);
      run(0.05);
      if (f) sim.setSource(node(`SP${f}`).id, 1);
      run(0.1);
    };
    const press = (f: number) => {
      sim.setSource(node(`PP${f}`).id, 1);
      run(0.2);
      sim.setSource(node(`PP${f}`).id, 0);
      run(0.2);
    };
    return { main, sim, digit, dest: () => digit(segs[0]), floor: () => digit(segs[1]), led, sensor, press, run, node };
  }
  const SEG = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('usa los integrados de clase', () => {
    const { main } = elevator();
    const chips = main.nodes.filter((n) => n.kind.startsWith('chip:')).map((n) => n.kind.slice(5)).sort();
    expect(chips).toEqual(['74hc04', '74hc04', '74hc08', '74hc08', '74hc08', '74hc32', '74hc32', '74hc32', '74hc74', '74ls48', '74ls48', '74ls75', '74ls75', '74ls85']);
  });

  it('viaje completo: guarda el destino, sube por los pisos, llega y acepta otro pedido', () => {
    const h = elevator();
    h.run(0.3);
    h.sensor(1);
    expect(h.floor()).toBe(1);
    expect(h.dest(), 'apagado antes de pedir').toBe(null);
    h.press(3);
    expect(h.dest()).toBe(3);
    expect(h.led('OCUPADO')).toBe(1);
    expect(h.led('LS · SUBIENDO')).toBe(1);
    h.press(2); // bloqueado en viaje
    expect(h.dest()).toBe(3);
    h.sensor(0);
    expect(h.floor(), 'conserva el piso entre plantas').toBe(1);
    h.sensor(2);
    expect(h.floor()).toBe(2);
    h.sensor(0);
    h.sensor(3);
    expect(h.floor()).toBe(3);
    h.run(0.2);
    expect(h.led('OCUPADO')).toBe(0);
    expect(h.led('PARAR · A = B')).toBe(1);
    h.press(1);
    expect(h.dest()).toBe(1);
    expect(h.led('LB · BAJANDO')).toBe(1);
  });

  it('pulsadores y sensores con prioridad 4 > 3 > 2 > 1: nunca pasa de 4', () => {
    for (let mask = 1; mask < 16; mask++) {
      const h = elevator();
      h.run(0.3);
      for (let f = 1; f <= 4; f++) h.sim.setSource(h.node(`SP${f}`).id, (mask >> (f - 1)) & 1 ? 1 : 0);
      h.run(0.2);
      const top = [4, 3, 2, 1].find((f) => mask & (1 << (f - 1)))!;
      expect(h.floor(), `sensores ${mask.toString(2)}`).toBe(top);
    }
    for (let mask = 1; mask < 16; mask++) {
      const h = elevator();
      h.run(0.3);
      const top = [4, 3, 2, 1].find((f) => mask & (1 << (f - 1)))!;
      h.sensor(top === 1 ? 2 : 1);
      for (let f = 1; f <= 4; f++) if (mask & (1 << (f - 1))) h.sim.setSource(h.node(`PP${f}`).id, 1);
      h.run(0.2);
      for (let f = 1; f <= 4; f++) h.sim.setSource(h.node(`PP${f}`).id, 0);
      h.run(0.2);
      expect(h.dest(), `pulsadores ${mask.toString(2)}`).toBe(top);
    }
  });
});
