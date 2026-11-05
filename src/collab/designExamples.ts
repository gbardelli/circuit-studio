// Circuitos de ejemplo del modo diseño que se insertan con un clic en la hoja abierta.
// «Comparador de pisos»: dos números de 4 bits (piso actual y piso de llamada) se muestran en
// displays de 7 segmentos a través de un decodificador y se comparan para decidir si el ascensor
// debe bajar, parar o subir. Decodificador y comparador son integrados propios (hojas «decoder» y
// «COMPARADOR») que por dentro usan un 74LS48 y un 74LS85.
import type { Vec } from '../core/types';
import { MAIN_SHEET, type LogicSheet } from '../logic/types';
import type { DesignDoc } from './design';

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
// El mismo ascensor de la protoboard, dibujado por bloques para el Capítulo III: integrados de
// clase (74LS75, 74LS85, 74LS48) y compuertas 74HC, en lógica positiva (pulsado/activo = 1).
// En la protoboard los pulsadores y sensores son activos en bajo, por eso allí algunas OR son NAND.
const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function insertClassElevator(design: DesignDoc, sheet = MAIN_SHEET) {
  const current = design.sheet(sheet)?.nodes ?? [];
  const ox = current.length ? Math.ceil((Math.max(...current.map((n) => n.x)) + 400) / 20) * 20 : 0;
  const ids: string[] = [];
  // Columnas separadas ×1,5 (en múltiplos de 20) para que notas y bloques no se pisen.
  const add = (kind: string, x: number, y: number, props = {}) => {
    const id = design.addNode(sheet, kind, ox + Math.round((x * 1.5) / 20) * 20, y, props);
    ids.push(id);
    return id;
  };
  const note = (x: number, y: number, text: string) => add('note', x, y, { text });
  const w = (a: string, pa: string, b: string, pb: string) => design.addWire(sheet, { node: a, pin: pa }, { node: b, pin: pb });
  const one = (x: number, y: number) => add('const', x, y, { value: 1 });
  const zero = (x: number, y: number) => add('const', x, y, { value: 0 });

  design.batch(() => {
    // 1 · Teclado de cabina, reloj y RESET
    note(0, -120, '1. Teclado de la cabina (PP1–PP4)\nPulsado = 1. Con dos a la vez gana el piso más alto.');
    const P = [1, 2, 3, 4].map((f) => add('button', 0, (f - 1) * 40, { label: `PP${f}` }));
    const clk = add('clock', 0, 200, { label: 'CLK', hz: 20 });
    note(0, 240, 'Reloj del control (NE555 ≈ 21 Hz en la protoboard)');
    const reset = add('in', 0, 300, { label: '/RESET', value: 1 });
    note(0, 330, '/RESET: ponlo a 0 para borrar OCUPADO y VÁLIDO');

    // 2 · Codificador con prioridad: SEL2 = P4 · SEL1 = (P2+P3)·/P4 · SEL0 = (P3 + P1·/P2)·/P4
    note(160, -120, '2. Codificador con prioridad 4 > 3 > 2 > 1\nSEL2 = P4 · SEL1 = (P2+P3)·/P4\nSEL0 = (P3 + P1·/P2)·/P4');
    const inv = add('chip:74hc04', 160, 0);
    const andA = add('chip:74hc08', 320, 0);
    const orA = add('chip:74hc32', 320, 220);
    w(P[3], 'Y', inv, '1A'); // /P4
    w(P[1], 'Y', inv, '2A'); // /P2
    w(P[0], 'Y', andA, '1A');
    w(inv, '2Y', andA, '1B'); // P1·/P2
    w(P[1], 'Y', orA, '1A');
    w(P[2], 'Y', orA, '1B'); // P2+P3
    w(orA, '1Y', andA, '2A');
    w(inv, '1Y', andA, '2B'); // SEL1
    w(P[2], 'Y', orA, '2A');
    w(andA, '1Y', orA, '2B'); // P3 + P1·/P2
    w(orA, '2Y', andA, '3A');
    w(inv, '1Y', andA, '3B'); // SEL0
    // SOLICITUD = SEL0 + SEL1 + SEL2
    w(andA, '3Y', orA, '3A');
    w(andA, '2Y', orA, '3B');
    w(orA, '3Y', orA, '4A');
    w(P[3], 'Y', orA, '4B');

    // 3 · Control: OCUPADO y VÁLIDO (74HC74)
    note(520, -120, '3. Control (74HC74)\nACEPTAR = /OCUPADO · SOLICITUD\nOCUPADO⁺ = ACEPTAR + OCUPADO·/LLEGÓ\nVÁLIDO⁺ = VÁLIDO + ACEPTAR');
    const ff = add('chip:74hc74', 520, 0);
    const andB = add('chip:74hc08', 520, 220);
    const orB = add('chip:74hc32', 520, 440);
    w(clk, 'Y', ff, '1CLK');
    w(clk, 'Y', ff, '2CLK');
    w(reset, 'Y', ff, '1CLR');
    w(reset, 'Y', ff, '2CLR');
    const pre = one(460, 180);
    w(pre, 'Y', ff, '1PRE');
    w(pre, 'Y', ff, '2PRE');
    w(ff, '1QN', andA, '4A');
    w(orA, '4Y', andA, '4B'); // ACEPTAR
    w(ff, '1Q', andB, '1A');
    w(inv, '4Y', andB, '1B'); // MANTENER = OCUPADO·/LLEGÓ
    w(andA, '4Y', orB, '1A');
    w(andB, '1Y', orB, '1B');
    w(orB, '1Y', ff, '1D'); // OCUPADO⁺
    w(ff, '2Q', orB, '2A');
    w(andA, '4Y', orB, '2B');
    w(orB, '2Y', ff, '2D'); // VÁLIDO⁺
    w(clk, 'Y', inv, '3A'); // /CLK
    w(andA, '4Y', andB, '2A');
    w(inv, '3Y', andB, '2B'); // LE del destino = ACEPTAR·/CLK

    // 4–5 · Memoria del destino (74LS75) y su display (74LS48)
    note(720, -120, '4. Memoria del destino (74LS75)\nGuarda SEL mientras LE = ACEPTAR·/CLK;\nse cierra en el flanco que pone OCUPADO a 1.');
    const dest = add('chip:74ls75', 720, 0);
    w(andA, '3Y', dest, '1D');
    w(andA, '2Y', dest, '2D');
    w(P[3], 'Y', dest, '3D');
    w(zero(660, 160), 'Y', dest, '4D');
    w(andB, '2Y', dest, 'LE12');
    w(andB, '2Y', dest, 'LE34');
    note(920, -120, '5. Display del destino (74LS48)\nApagado hasta la primera solicitud (BI = VÁLIDO).');
    const decD = add('chip:74ls48', 1040, 0, { flip: 1 });
    const segD = add('seg7', 920, 0);
    for (const s of SEGMENTS) w(decD, `S${s.toUpperCase()}`, segD, s);
    w(dest, '1Q', decD, 'A');
    w(dest, '2Q', decD, 'B');
    w(dest, '3Q', decD, 'C');
    w(zero(1180, 120), 'Y', decD, 'D');
    w(one(1180, 40), 'Y', decD, 'LT');
    w(ff, '2Q', decD, 'BIRBO');
    w(zero(1180, 100), 'Y', decD, 'RBI');

    // 6–7 · Sensores de planta y su codificador con prioridad
    note(0, 460, '6. Sensores de planta (SP1–SP4)\nActivo = 1. Entre piso y piso, todos a 0.');
    const S = [1, 2, 3, 4].map((f) => add('in', 0, 560 + (f - 1) * 40, { label: `SP${f}` }));
    note(160, 460, '7. Codificador de sensores (prioridad 4 > 3 > 2 > 1)\nSENSOR = SP1 + SP2 + SP3 + SP4');
    const inv2 = add('chip:74hc04', 160, 560);
    const andC = add('chip:74hc08', 320, 560);
    const orC = add('chip:74hc32', 320, 780);
    w(S[3], 'Y', inv2, '1A'); // /SP4
    w(S[1], 'Y', inv2, '2A'); // /SP2
    w(S[0], 'Y', andC, '1A');
    w(inv2, '2Y', andC, '1B'); // SP1·/SP2
    w(S[1], 'Y', orC, '1A');
    w(S[2], 'Y', orC, '1B'); // SP2+SP3
    w(orC, '1Y', andC, '2A');
    w(inv2, '1Y', andC, '2B'); // SEN1
    w(S[2], 'Y', orC, '2A');
    w(andC, '1Y', orC, '2B');
    w(orC, '2Y', andC, '3A');
    w(inv2, '1Y', andC, '3B'); // SEN0
    w(S[0], 'Y', orC, '3A');
    w(S[1], 'Y', orC, '3B'); // SP1+SP2
    w(S[2], 'Y', orB, '3A');
    w(S[3], 'Y', orB, '3B'); // SP3+SP4
    w(orC, '3Y', orB, '4A');
    w(orB, '3Y', orB, '4B'); // SENSOR
    // SEN2 = SP4 pasa por dos inversores: llega al latch después de que SENSOR lo cierre.
    w(S[3], 'Y', inv2, '3A');
    w(inv2, '3Y', inv2, '4A');

    // 8–9 · Memoria del piso actual (74LS75) y su display
    note(720, 460, '8. Memoria del piso actual (74LS75)\nAbierta mientras SENSOR = 1; conserva el piso\nal soltar el sensor.');
    const floor = add('chip:74ls75', 720, 560);
    w(andC, '3Y', floor, '1D');
    w(andC, '2Y', floor, '2D');
    w(inv2, '4Y', floor, '3D');
    w(zero(660, 720), 'Y', floor, '4D');
    w(orB, '4Y', floor, 'LE12');
    w(orB, '4Y', floor, 'LE34');
    note(920, 460, '9. Display del piso actual (74LS48)');
    const decF = add('chip:74ls48', 1040, 560, { flip: 1 });
    const segF = add('seg7', 920, 560);
    for (const s of SEGMENTS) w(decF, `S${s.toUpperCase()}`, segF, s);
    w(floor, '1Q', decF, 'A');
    w(floor, '2Q', decF, 'B');
    w(floor, '3Q', decF, 'C');
    w(zero(1180, 680), 'Y', decF, 'D');
    const hi = one(1180, 600);
    w(hi, 'Y', decF, 'LT');
    w(hi, 'Y', decF, 'BIRBO');
    w(hi, 'Y', decF, 'RBI');

    // 10–11 · Comparador (74LS85) e indicadores
    note(1260, 220, '10. Comparador (74LS85)\nA = piso actual, B = destino\nLLEGÓ = (A = B) · SENSOR');
    const cmp = add('chip:74ls85', 1260, 320);
    w(floor, '1Q', cmp, 'A0');
    w(floor, '2Q', cmp, 'A1');
    w(floor, '3Q', cmp, 'A2');
    w(dest, '1Q', cmp, 'B0');
    w(dest, '2Q', cmp, 'B1');
    w(dest, '3Q', cmp, 'B2');
    const c0 = zero(1200, 300);
    for (const pin of ['A3', 'B3', 'IALTB', 'IAGTB']) w(c0, 'Y', cmp, pin);
    w(one(1200, 340), 'Y', cmp, 'IAEQB');
    w(cmp, 'OAEQB', andB, '3A');
    w(orB, '4Y', andB, '3B'); // LLEGÓ
    w(andB, '3Y', inv, '4A'); // /LLEGÓ
    w(ff, '1Q', andB, '4A');
    w(cmp, 'OALTB', andB, '4B'); // SUBIR = OCUPADO · (A < B)
    w(ff, '1Q', andC, '4A');
    w(cmp, 'OAGTB', andC, '4B'); // BAJAR = OCUPADO · (A > B)
    note(1460, 220, '11. Indicadores');
    const led = (label: string, y: number, color: string) => add('out', 1460, y, { label, color });
    w(andB, '4Y', led('LS · SUBIENDO', 320, 'green'), 'A');
    w(andC, '4Y', led('LB · BAJANDO', 360, 'red'), 'A');
    w(cmp, 'OAEQB', led('PARAR · A = B', 400, 'yellow'), 'A');
    w(ff, '1Q', led('OCUPADO', 440, 'blue'), 'A');
  });
  return ids;
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
