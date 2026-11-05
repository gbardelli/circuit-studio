// Circuitos de ejemplo del modo diseño que se insertan con un clic en la hoja abierta.
// «Comparador de pisos»: dos números de 4 bits (piso actual y piso de llamada) se muestran en
// displays de 7 segmentos a través de un decodificador y se comparan para decidir si el ascensor
// debe bajar, parar o subir. Decodificador y comparador son integrados propios (hojas «decoder» y
// «COMPARADOR») que por dentro usan un 74LS48 y un 74LS85.
import type { Vec } from '../core/types';
import { MAIN_SHEET, type LogicSheet } from '../logic/types';
import type { DesignDoc } from './design';
import { findTemplate } from './applyTemplate';
import { insertBenchDesign } from './benchDesign';

export interface DesignExample {
  id: string;
  name: string;
  description: string;
  insert(design: DesignDoc, sheet?: string): string[];
}

const DECODER = 'decoder';
const COMPARATOR = 'COMPARADOR';
/** Orden de las salidas del decodificador, de arriba abajo, como en el esquema original. */
const DECODER_OUTS = ['a', 'b', 'f', 'g', 'e', 'd', 'c'];
const BCD = ['D', 'C', 'B', 'A'];
const CMP_OUTS = ['A > B', 'A = B', 'A < B'];

type Pin = [string, string];

/** Hoja de un integrado propio por nombre; la crea con su contenido si no existe. */
function ensureIc(design: DesignDoc, name: string, build: (id: string) => void) {
  const found = design.ics().find((s) => s.name === name);
  if (found) return found.id;
  const id = design.createIc(name, '');
  design.batch(() => build(id));
  return id;
}

function buildDecoder(design: DesignDoc, id: string) {
  // 74LS48: entradas B, C, LT, BIRBO, RBI, D, A (y = 20 + 20·i) y salidas SA–SG.
  const chip = design.addNode(id, 'chip:74ls48', 200, 0);
  const chipY = (pin: string) => 20 + ['B', 'C', 'LT', 'BIRBO', 'RBI', 'D', 'A'].indexOf(pin) * 20;
  const ins = BCD.map((label) => {
    const n = design.addNode(id, 'in', 60, chipY(label) - 10, { label });
    design.addWire(id, { node: n, pin: 'Y' }, { node: chip, pin: label });
    return n;
  });
  for (const pin of ['LT', 'BIRBO', 'RBI']) {
    const n = design.addNode(id, 'const', 120, chipY(pin) - 10, { value: 1 });
    design.addWire(id, { node: n, pin: 'Y' }, { node: chip, pin });
  }
  const outs = DECODER_OUTS.map((label, i) => {
    const n = design.addNode(id, 'out', 380, 10 + i * 20, { label });
    design.addWire(id, { node: chip, pin: `S${label.toUpperCase()}` }, { node: n, pin: 'A' });
    return n;
  });
  design.setSheet(id, { order: [...ins, ...outs], description: 'Decodificador BCD a 7 segmentos (74LS48). Entradas D C B A, salidas a–g.' });
}

function buildComparator(design: DesignDoc, id: string) {
  // 74LS85: entradas B3, IALTB, IAEQB, IAGTB, B0, A0, B1, A1, A2, B2, A3; salidas OAGTB, OAEQB, OALTB.
  const order85 = ['B3', 'IALTB', 'IAEQB', 'IAGTB', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3'];
  const chip = design.addNode(id, 'chip:74ls85', 200, 0);
  const chipY = (pin: string) => 20 + order85.indexOf(pin) * 20;
  const labels = ['A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0'];
  const ins = labels.map((label) => {
    const n = design.addNode(id, 'in', 60, chipY(label) - 10, { label });
    design.addWire(id, { node: n, pin: 'Y' }, { node: chip, pin: label });
    return n;
  });
  // Sin encadenar: A=B a 1, A>B y A<B a 0.
  for (const [pin, value] of [['IALTB', 0], ['IAEQB', 1], ['IAGTB', 0]] as const) {
    const n = design.addNode(id, 'const', 120, chipY(pin) - 10, { value });
    design.addWire(id, { node: n, pin: 'Y' }, { node: chip, pin });
  }
  const outs = (['OAGTB', 'OAEQB', 'OALTB'] as const).map((pin, i) => {
    const n = design.addNode(id, 'out', 360, 10 + i * 20, { label: CMP_OUTS[i] });
    design.addWire(id, { node: chip, pin }, { node: n, pin: 'A' });
    return n;
  });
  design.setSheet(id, { order: [...ins, ...outs], description: 'Comparador de 4 bits (74LS85): A > B, A = B o A < B.' });
}

/** Id de la patilla de un integrado propio a partir de su nombre. */
function pinOf(sheet: LogicSheet | undefined, label: string) {
  const node = sheet?.nodes.find((n) => (n.kind === 'in' || n.kind === 'out') && n.props.label === label);
  if (!node) throw new Error(`Falta la patilla «${label}» en «${sheet?.name}».`);
  return node.id;
}

function insertFloorComparator(design: DesignDoc, sheet = MAIN_SHEET) {
  const decId = ensureIc(design, DECODER, (id) => buildDecoder(design, id));
  const cmpId = ensureIc(design, COMPARATOR, (id) => buildComparator(design, id));
  const dec = design.sheet(decId);
  const cmp = design.sheet(cmpId);
  const current = design.sheet(sheet)?.nodes ?? [];
  // Si la hoja ya tiene algo, el ejemplo va a su derecha.
  const o: Vec = { x: current.length ? Math.ceil((Math.max(...current.map((n) => n.x)) + 400) / 10) * 10 : 0, y: 0 };
  const ids: string[] = [];
  const add = (kind: string, x: number, y: number, props = {}) => {
    const id = design.addNode(sheet, kind, o.x + x, o.y + y, props);
    ids.push(id);
    return id;
  };
  const wire = (a: Pin, b: Pin) => design.addWire(sheet, { node: a[0], pin: a[1] }, { node: b[0], pin: b[1] });

  design.batch(() => {
    const comparator = add(`ic:${cmpId}`, 520, 20);
    const rows = [
      { title: 'Piso ACTUAL', y: 0, bits: [0, 1, 1, 1], bitsY: -100, side: 'A' },
      { title: 'Piso de LLAMADA', y: 200, bits: [0, 0, 0, 1], bitsY: 330, side: 'B' },
    ];
    for (const row of rows) {
      const display = add('seg7', 0, row.y - 30);
      add('note', -160, row.y + 40, { text: row.title });
      const decoder = add(`ic:${decId}`, 120, row.y - 30, { flip: 1 });
      for (const seg of DECODER_OUTS) wire([decoder, pinOf(dec, seg)], [display, seg]);
      add('note', 270, row.bitsY + (row.side === 'A' ? -30 : 30), { text: row.title });
      BCD.forEach((bcd, i) => {
        const bit = add('in', 260 + i * 50, row.bitsY, { value: row.bits[i] });
        wire([bit, 'Y'], [decoder, pinOf(dec, bcd)]);
        wire([bit, 'Y'], [comparator, pinOf(cmp, `${row.side}${3 - i}`)]);
      });
    }
    CMP_OUTS.forEach((label, i) => {
      const led = add('out', 700, [-20, 90, 200][i], { label: ['Debe BAJAR', 'Debe PARAR', 'Debe SUBIR'][i], color: 'red' });
      wire([comparator, pinOf(cmp, label)], [led, 'A']);
    });
  });
  return ids;
}


// ── «Ascensor de clase» ─────────────────────────────────────────────────────────
// El mismo circuito de la protoboard (plantilla «elevator-class»), integrado por integrado, sin el
// GIGA ni su pantalla. Pulsadores, sensores y RESET son activos en bajo, como en la placa: 1 = suelto.
function insertClassElevator(design: DesignDoc, sheet = MAIN_SHEET) {
  const t = findTemplate('elevator-class');
  if (!t) return [];
  const src = (part: string, pin: string, kind: 'in' | 'clock', props: Record<string, string | number>) => ({ part, pin, kind, props });
  return insertBenchDesign(design, sheet, t, {
    boards: ['b1', 'b2', 'b3'],
    sources: [
      ...[1, 2, 3, 4].map((f) => src(`pp${f}`, f <= 2 ? '2b' : '2a', 'in', { label: `PP${f} (pulsado = 0)`, value: 1 })),
      src('reset', '2a', 'in', { label: '/RESET', value: 1 }),
      src('u4', 'OUT', 'clock', { label: 'CLK (NE555)', hz: 20 }),
      ...[1, 2, 3, 4].map((f) => src('sp', `${f}B`, 'in', { label: `SP${f} (activo = 0)`, value: 1 })),
    ],
    leds: [
      ['u13', '2Y', 'LS · SUBIENDO', 'green'],
      ['u13', '4Y', 'LB · BAJANDO', 'red'],
      ['u12', 'OAEQB', 'PARAR · A = B', 'yellow'],
      ['u5', '1Q', 'OCUPADO', 'blue'],
    ],
  });
}

export const DESIGN_EXAMPLES: DesignExample[] = [
  {
    id: 'floor-comparator',
    name: 'Comparador de pisos',
    description: 'Piso actual y de llamada en displays de 7 segmentos; un 74LS85 decide si bajar, parar o subir.',
    insert: insertFloorComparator,
  },
  {
    id: 'class-elevator',
    name: 'Ascensor de clase (74LS75 · 74LS85 · 74LS48)',
    description: 'El ascensor de 4 pisos por bloques: teclado con prioridad, control 74HC74, memorias 74LS75, displays 74LS48, sensores y comparador 74LS85.',
    insert: insertClassElevator,
  },
];
