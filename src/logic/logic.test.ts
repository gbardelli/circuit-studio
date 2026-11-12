import { describe, expect, it } from 'vitest';
import { PARTS } from '../parts';
import { fixture } from '../test/electrical';
import { icParts, icIssues, packagePins, registerIcs } from './ic';
import { LogicSim, icDependencies, truthTable } from './sim';
import { IC_PREFIX, type LogicNode, type LogicSheet, type LogicWire } from './types';
import { elementDef, ttColumns, ttEvaluate, ttPreset, ttSize } from './elements';

let seq = 0;
function sheet(id: string, kind: 'main' | 'ic', nodes: Omit<LogicNode, 'x' | 'y' | 'rot'>[], wires: [string, string, string, string][], meta: Partial<LogicSheet> = {}): LogicSheet {
  return {
    id,
    kind,
    name: meta.name ?? id,
    part: meta.part ?? '',
    description: '',
    order: meta.order ?? [],
    package: meta.package ?? 0,
    nodes: nodes.map((n) => ({ x: 0, y: 0, rot: 0, ...n })),
    wires: wires.map(([an, ap, bn, bp]): LogicWire => ({ id: `w${seq++}`, a: { node: an, pin: ap }, b: { node: bn, pin: bp } })),
  };
}

const halfAdder = sheet(
  'ha',
  'ic',
  [
    { id: 'a', kind: 'in', props: { label: 'A' } },
    { id: 'b', kind: 'in', props: { label: 'B' } },
    { id: 'x', kind: 'xor', props: { inputs: 2 } },
    { id: 'g', kind: 'and', props: { inputs: 2 } },
    { id: 's', kind: 'out', props: { label: 'S' } },
    { id: 'c', kind: 'out', props: { label: 'C' } },
  ],
  [
    ['a', 'Y', 'x', 'I1'],
    ['b', 'Y', 'x', 'I2'],
    ['a', 'Y', 'g', 'I1'],
    ['b', 'Y', 'g', 'I2'],
    ['x', 'Y', 's', 'A'],
    ['g', 'Y', 'c', 'A'],
  ],
  { name: 'Semisumador', part: 'CS-HA1', order: ['a', 'b', 's', 'c'] },
);

describe('simulador lógico del modo diseño', () => {
  it('reorders visual pins without changing their identity or electrical order', () => {
    const lookup = (id: string) => id === halfAdder.id ? halfAdder : undefined;
    const def = elementDef(`${IC_PREFIX}${halfAdder.id}`, lookup)!;
    const ctx = { sheet: lookup, instantiate: () => null };
    const original = def.pins({}, ctx);
    const edited = def.pins({ blockWidth: 150, pinSpacing: 30, outputOrder: JSON.stringify(['c', 's']) }, ctx);
    expect(edited.map(p => p.id)).toEqual(original.map(p => p.id));
    expect(edited.find(p => p.id === 'c')).toMatchObject({ x: 150, y: 20 });
    expect(edited.find(p => p.id === 's')).toMatchObject({ x: 150, y: 50 });
    expect(def.size({ blockWidth: 150, pinSpacing: 30 }, ctx)).toEqual({ w: 150, h: 70 });
    const main = sheet('main', 'main', [
      { id: 'a', kind: 'in', props: {} }, { id: 'b', kind: 'in', props: {} },
      { id: 'chip', kind: `${IC_PREFIX}${halfAdder.id}`, props: { outputOrder: JSON.stringify(['c', 's']) } },
      { id: 'sum', kind: 'out', props: {} }, { id: 'carry', kind: 'out', props: {} },
    ], [['a', 'Y', 'chip', 'a'], ['b', 'Y', 'chip', 'b'], ['chip', 's', 'sum', 'A'], ['chip', 'c', 'carry', 'A']]);
    const sim = new LogicSim(main, lookup);
    sim.setSource('a', 1); sim.setSource('b', 0);
    expect([sim.value('sum', 'A'), sim.value('carry', 'A')]).toEqual([1, 0]);
  });
  it('propaga puertas y entradas interactivas', () => {
    const sim = new LogicSim(halfAdder, () => undefined);
    for (const [a, b, s, c] of [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 0, 1, 0],
      [1, 1, 0, 1],
    ] as const) {
      sim.setSource('a', a);
      sim.setSource('b', b);
      expect([sim.value('s', 'A'), sim.value('c', 'A')]).toEqual([s, c]);
    }
  });

  it('los biestables de un mismo reloj leen su dato antes de que ninguno cambie', () => {
    // Registro de desplazamiento de dos etapas: D1 = entrada, D2 = Q1.
    const shift = sheet(
      'main',
      'main',
      [
        { id: 'in', kind: 'in', props: {} },
        { id: 'clk', kind: 'clock', props: { hz: 1 } },
        { id: 'f1', kind: 'dff', props: {} },
        { id: 'f2', kind: 'dff', props: {} },
      ],
      [
        ['in', 'Y', 'f1', 'D'],
        ['clk', 'Y', 'f1', 'CLK'],
        ['clk', 'Y', 'f2', 'CLK'],
        ['f1', 'Q', 'f2', 'D'],
      ],
    );
    const sim = new LogicSim(shift, () => undefined);
    sim.setSource('in', 1);
    sim.stepClocks(); // flanco de subida
    expect([sim.value('f1', 'Q'), sim.value('f2', 'Q')]).toEqual([1, 0]);
    sim.stepClocks();
    sim.setSource('in', 0);
    sim.stepClocks();
    expect([sim.value('f1', 'Q'), sim.value('f2', 'Q')]).toEqual([0, 1]);
    // Medio segundo por cambio a 1 Hz.
    sim.advance(0.5);
    expect(sim.value('clk', 'Y')).toBe(0);
  });

  it('detecta un inversor realimentado y dos salidas en corto', () => {
    // Desde valores conocidos: el multiplexor pasa de un 1 fijo a su propia salida invertida.
    const ring = sheet(
      'main',
      'main',
      [
        { id: 'sel', kind: 'in', props: {} },
        { id: 'one', kind: 'const', props: { value: 1 } },
        { id: 'm', kind: 'mux2', props: {} },
        { id: 'n', kind: 'not', props: {} },
      ],
      [
        ['one', 'Y', 'm', 'I0'],
        ['n', 'Y', 'm', 'I1'],
        ['sel', 'Y', 'm', 'S'],
        ['m', 'Y', 'n', 'A'],
      ],
    );
    const osc = new LogicSim(ring, () => undefined);
    expect(osc.problem).toBe(null);
    osc.setSource('sel', 1);
    expect(osc.problem?.kind).toBe('oscillation');
    const short = sheet(
      'main',
      'main',
      [
        { id: 'one', kind: 'const', props: { value: 1 } },
        { id: 'zero', kind: 'const', props: { value: 0 } },
        { id: 'led', kind: 'out', props: {} },
      ],
      [
        ['one', 'Y', 'led', 'A'],
        ['zero', 'Y', 'led', 'A'],
      ],
    );
    const sim = new LogicSim(short, () => undefined);
    expect(sim.conflicts.size).toBe(1);
    expect(sim.value('led', 'A')).toBe(2);
  });

  it('usa un integrado propio dentro de otra hoja y uno del catálogo como bloque', () => {
    const main = sheet(
      'main',
      'main',
      [
        { id: 'a', kind: 'in', props: {} },
        { id: 'b', kind: 'in', props: {} },
        { id: 'u1', kind: `${IC_PREFIX}ha`, props: {} },
        { id: 'u2', kind: 'chip:74hc04', props: {} },
      ],
      [
        ['a', 'Y', 'u1', 'a'],
        ['b', 'Y', 'u1', 'b'],
        ['u1', 'c', 'u2', '1A'],
      ],
    );
    const lookup = (id: string) => (id === 'ha' ? halfAdder : undefined);
    const sim = new LogicSim(main, lookup);
    sim.setSource('a', 1);
    sim.setSource('b', 1);
    expect(sim.value('u1', 's')).toBe(0);
    expect(sim.value('u1', 'c')).toBe(1);
    expect(sim.value('u2', '1Y')).toBe(0);
    expect([...icDependencies('main', (id) => (id === 'main' ? main : lookup(id)))]).toEqual(['main', 'ha']);
  });

  it('impide que un integrado se contenga a sí mismo', () => {
    const loop = sheet('lp', 'ic', [{ id: 'u', kind: `${IC_PREFIX}lp`, props: {} }], []);
    expect(new LogicSim(loop, () => loop).problem?.kind).toBe('recursion');
  });

  it('corta los integrados anidados que se expanden sin medida', () => {
    // Seis niveles de diez copias del nivel siguiente: un millón de elementos sin límite.
    const levels = Array.from({ length: 7 }, (_, d) =>
      sheet(`l${d}`, 'ic', d === 6 ? [{ id: 'g', kind: 'not', props: {} }] : Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, kind: `${IC_PREFIX}l${d + 1}`, props: {} })), []),
    );
    const lookup = (id: string) => levels.find((l) => l.id === id);
    const started = Date.now();
    expect(new LogicSim(levels[0], lookup).problem?.kind).toBe('recursion');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(packagePins({ ...halfAdder, package: 1e9 })).toHaveLength(8);
  });

  it('genera la tabla de verdad', () => {
    const table = truthTable(halfAdder, () => undefined)!;
    expect(table.rows.map((r) => [...r.inputs, ...r.outputs])).toEqual([
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 0, 1, 0],
      [1, 1, 0, 1],
    ]);
  });
});

describe('integrado propio como pieza DIP virtual', () => {
  it('ocupa el menor DIP, con GND en la mitad y VCC en la última patilla', () => {
    expect(packagePins(halfAdder).map((p) => p.name)).toEqual(['A', 'B', 'S', 'GND', 'C', 'NC', 'NC', 'VCC']);
    expect(icIssues(halfAdder)).toEqual([]);
    expect(icIssues(sheet('e', 'ic', [], []))).toHaveLength(2);
  });

  it('se registra como pieza y funciona eléctricamente a 3,3 y 5 V', () => {
    registerIcs([halfAdder]);
    const def = PARTS[`${IC_PREFIX}ha`];
    expect(def.partNumber).toBe('CS-HA1');
    expect(def.category).toBe('Integrados');
    expect(PARTS[`sch:${IC_PREFIX}ha`]).toBeDefined();
    for (const vcc of [3.3, 5]) {
      const h = fixture(def.type, { VCC: vcc, A: vcc, B: 0 });
      expect(h.volts('S')).toBeGreaterThan(vcc * 0.9);
      expect(h.volts('C')).toBeLessThan(0.1);
      h.settle({ B: vcc });
      expect(h.volts('S')).toBeLessThan(0.1);
      expect(h.volts('C')).toBeGreaterThan(vcc * 0.9);
    }
    registerIcs([]);
    expect(PARTS[`${IC_PREFIX}ha`]).toBeUndefined();
    expect(icParts([halfAdder])).toHaveLength(1);
  });
});

describe('compuerta por tabla de verdad', () => {
  const none = () => undefined;
  const run = (props: Record<string, string | number>, inputs: Record<string, 0 | 1>) => {
    const ins = Object.keys(inputs);
    const outs = Number(props.outputs ?? 1);
    const nodes: Omit<LogicNode, 'x' | 'y' | 'rot'>[] = [
      ...ins.map((id) => ({ id, kind: 'in', props: { label: id } })),
      { id: 't', kind: 'tabla', props },
      ...Array.from({ length: outs }, (_, j) => ({ id: `o${j}`, kind: 'out', props: { label: `o${j}` } })),
    ];
    const wires: [string, string, string, string][] = [
      ...ins.map((id, i): [string, string, string, string] => [id, 'Y', 't', `I${i + 1}`]),
      ...Array.from({ length: outs }, (_, j): [string, string, string, string] => ['t', outs === 1 ? 'Y' : `Y${j + 1}`, `o${j}`, 'A']),
    ];
    const sim = new LogicSim(sheet('m', 'main', nodes, wires), none);
    for (const [id, v] of Object.entries(inputs)) sim.setSource(id, v);
    return Array.from({ length: outs }, (_, j) => sim.value(`o${j}`, 'A'));
  };
  const presets = (name: string) => [0, 1].flatMap((a) => [0, 1].map((b) => run({ inputs: 2, outputs: 1, table: ttPreset(name, 2) }, { a: a as 0 | 1, b: b as 0 | 1 })[0]));

  it('las tablas de las compuertas básicas dan sus funciones', () => {
    expect(ttPreset('and', 2)).toBe('0001');
    expect(ttPreset('or', 2)).toBe('0111');
    expect(ttPreset('nand', 2)).toBe('1110');
    expect(ttPreset('nor', 2)).toBe('1000');
    expect(ttPreset('xor', 2)).toBe('0110');
    expect(ttPreset('xnor', 2)).toBe('1001');
    expect(ttPreset('not', 1)).toBe('10');
    expect(presets('and')).toEqual([0, 0, 0, 1]);
    expect(presets('or')).toEqual([0, 1, 1, 1]);
    expect(presets('xor')).toEqual([0, 1, 1, 0]);
  });

  it('una tabla editada a mano se comporta como dice su tabla, con varias salidas', () => {
    // Semisumador: suma = XOR, acarreo = AND
    const props = { inputs: 2, outputs: 2, table: '0110;0001' };
    expect(run(props, { a: 1, b: 1 })).toEqual([0, 1]);
    expect(run(props, { a: 1, b: 0 })).toEqual([1, 0]);
  });

  it('con entradas sin valor solo sale X si la tabla depende de ellas', () => {
    expect(ttEvaluate(['0001'], [0, 2])).toEqual([0]); // AND con un 0 conocido
    expect(ttEvaluate(['0001'], [1, 2])).toEqual([2]);
    expect(ttEvaluate(['0111'], [1, 2])).toEqual([1]); // OR con un 1 conocido
  });

  it('la tabla se normaliza al tamaño y el elemento la dibuja con todas sus filas', () => {
    expect(ttColumns({ inputs: 2, outputs: 2, table: '01' })).toEqual(['0100', '0000']);
    expect(ttSize({ inputs: 2, outputs: 1 }).h).toBeGreaterThanOrEqual(60);
    expect(ttSize({ inputs: 4, outputs: 1 }).h).toBeGreaterThan(ttSize({ inputs: 2, outputs: 1 }).h);
  });
});

describe('pulsador activo en bajo', () => {
  it('vale 1 en reposo y 0 al pulsarlo; el normal, al revés', () => {
    const mk = (props: Record<string, number | string>) => {
      const s = sheet('m', 'main', [{ id: 'b', kind: 'button', props }, { id: 'o', kind: 'out', props: { label: 'o' } }], [['b', 'Y', 'o', 'A']]);
      return new LogicSim(s, () => undefined);
    };
    const low = mk({ label: 'P', activeLow: 1 });
    expect(low.value('o', 'A')).toBe(1);
    low.setSource('b', 0);
    expect(low.value('o', 'A')).toBe(0);
    const high = mk({ label: 'P' });
    expect(high.value('o', 'A')).toBe(0);
    high.setSource('b', 1);
    expect(high.value('o', 'A')).toBe(1);
  });
});
