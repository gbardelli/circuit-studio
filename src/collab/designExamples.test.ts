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
