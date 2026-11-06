import { buildNetlist, pinKey } from '../core/netlist';
import type { CircuitSnapshot, Props } from '../core/types';
import { chipPins, elementDef } from '../logic/elements';
import { MAIN_SHEET, type LogicNode, type LogicPinRef, type LogicSheet } from '../logic/types';
import { PARTS } from '../parts';

type Ref = LogicPinRef & { out: boolean; sheet: string };
type Stage = { id: string; name: string; title: string; refs: string[]; x: number; y: number };
const STAGES: Stage[] = [
  { id: 'requests', name: 'PEDIDOS', title: '01 · Prioridad de pedidos', refs: ['U20', 'U2'], x: 280, y: 100 },
  { id: 'destination', name: 'DESTINO', title: '02 · Memoria del destino', refs: ['U8'], x: 670, y: 100 },
  { id: 'control', name: 'CONTROL', title: '03 · Estado y bloqueo', refs: ['U3', 'U5', 'U6', 'U7'], x: 670, y: 380 },
  // The transparent floor latch and its delayed sensor data stay in the same delta-cycle
  // domain. Splitting them into nested simulators changes the latch's hold behavior.
  { id: 'sensors', name: 'PLANTA', title: '04 · Sensores, memoria y movimiento', refs: ['U9', 'U10', 'U21', 'U11', 'U13'], x: 670, y: 740 },
  { id: 'comparison', name: 'COMPARAR', title: '05 · Piso actual frente a destino', refs: ['U12'], x: 1060, y: 380 },
];

function blank(id: string, name: string, kind: 'main' | 'ic' = 'ic'): LogicSheet {
  return { id, name, kind, part: kind === 'ic' ? name : '', description: '', order: [], package: 0, nodes: [], wires: [] };
}

/** Derive the logical model from the project's actual physical nets, never a similar template. */
export function elevatorDesign(sourceSnapshot: CircuitSnapshot) {
  const snapshot = { ...sourceSnapshot, parts: sourceSnapshot.parts.map(p => ({ ...p, props: { ...PARTS[p.type]?.defaults, ...p.props } })) };
  const nets = buildNetlist(snapshot, PARTS);
  const main = blank(MAIN_SHEET, 'Ascensor · montaje actual', 'main');
  const sheets = [main, ...STAGES.map((s, i) => ({ ...blank(`elevator-${s.id}`, `${String(i + 1).padStart(2, '0')} ${s.name[0]}${s.name.slice(1).toLowerCase()}`), part: s.name }))];
  const bySheet = new Map(sheets.map(s => [s.id, s]));
  const byRef = new Map(snapshot.parts.flatMap(p => {
    const ref = String(p.props.label ?? '').match(/^(U\d+)\b/)?.[1];
    return ref ? [[ref, p] as const] : [];
  }));
  const netOf = (part: string, pin: string) => {
    const n = nets.netOf.get(pinKey(part, pin));
    if (n === undefined) throw new Error(`No existe la red de ${part}.${pin}.`);
    return n;
  };
  const supply = snapshot.parts.find(p => p.type === 'bench-supply' || p.type === 'breadboard-power' || p.type === 'mb102-power');
  if (!supply) throw new Error('No se encontró la fuente del circuito.');
  const high = netOf(supply.id, supply.type === 'breadboard-power' || supply.type === 'mb102-power' ? 'TP' : '+'), low = netOf(supply.id, supply.type === 'breadboard-power' || supply.type === 'mb102-power' ? 'TN' : '-');
  const refs = new Map<number, Ref[]>();
  const names = new Map<number, string>();
  const add = (sheet: LogicSheet, id: string, kind: string, x: number, y: number, props: Props = {}) => {
    const node: LogicNode = { id, kind, x, y, rot: 0, props }; sheet.nodes.push(node); return node;
  };
  const note = (sheet: LogicSheet, id: string, x: number, y: number, text: string) => add(sheet, id, 'note', x, y, { text, fontSize: sheet.id === MAIN_SHEET ? (id === 'title' ? 18 : id.startsWith('title-') ? 14 : 12) : 11 });
  const attach = (n: number, ref: Ref) => refs.set(n, [...(refs.get(n) ?? []), ref]);
  let wireId = 0;
  const connect = (sheet: LogicSheet, a: LogicPinRef, b: LogicPinRef, label?: string) => sheet.wires.push({ id: `wire-${++wireId}`, a: { node: a.node, pin: a.pin }, b: { node: b.node, pin: b.pin }, ...(label ? { label } : {}) });
  for (const p of snapshot.parts) for (const field of String(p.props.nets ?? '').split(';')) {
    const at = field.indexOf('=');
    if (at > 0) names.set(netOf(p.id, field.slice(0, at)), field.slice(at + 1));
  }
  for (const [ref, pin, name] of [
    ['U3', '1Y', 'PED1'], ['U20', '1Y', 'PRI1'], ['U3', '5Y', '/PRI1'],
    ['U6', '3Y', 'CARGAR'], ['U10', '4Y', 'SEN1'], ['U13', '1Y', 'SP12_N'], ['U13', '3Y', 'SP34_N'],
  ]) {
    const p = byRef.get(ref); if (p) names.set(netOf(p.id, pin), name);
  }
  const modeled = new Set<string>();
  function chip(ref: string, sheet: LogicSheet, x: number, y: number) {
    const p = byRef.get(ref), spec = p && PARTS[p.type]?.chip;
    if (!p || !spec) throw new Error(`No se encontró el integrado ${ref} del montaje.`);
    modeled.add(p.id);
    const node = add(sheet, `chip-${p.id}`, `chip:${p.type}`, x, y, { sourcePart: p.id, label: ref });
    note(sheet, `label-${ref}`, x, y - 50, `${ref} · ${spec.part}`);
    const { inputs, outputs } = chipPins(spec);
    for (const [pins, out] of [[inputs, false], [outputs, true]] as const) for (const pin of pins) {
      const n = netOf(p.id, pin);
      if (!names.has(n)) names.set(n, `${ref}.${pin}`);
      attach(n, { node: node.id, pin, out, sheet: sheet.id });
    }
    return p;
  }
  for (const stage of STAGES) {
    const sheet = bySheet.get(`elevator-${stage.id}`)!;
    sheet.description = `Bloque funcional del montaje: ${stage.refs.join(', ')}. No es un integrado físico adicional. Las patillas conservan las redes del circuito original.`;
    stage.refs.forEach((ref, i) => chip(ref, sheet, 300 + (i % 3) * 300, 140 + Math.floor(i / 3) * 400));
    add(main, `block-${stage.id}`, `ic:${sheet.id}`, stage.x, stage.y);
    note(main, `title-${stage.id}`, stage.x - 10, stage.y - 70, stage.title);
  }
  const source = (id: string, label: string, part: string, pin: string, x: number, y: number, kind = 'in', value = 1) => {
    const node = add(main, id, kind, x, y, { label, value, ...(kind === 'clock' ? { hz: 21 } : {}), sourcePart: part, sourcePin: pin });
    const n = netOf(part, pin); names.set(n, label); attach(n, { node: node.id, pin: 'Y', out: true, sheet: main.id });
  };
  for (let f = 1; f <= 4; f++) {
    const p = snapshot.parts.find(p => p.type === 'pushbutton' && String(p.props.label).startsWith(`PP${f}`));
    if (!p) throw new Error(`Falta PP${f}.`);
    source(`PP${f}`, `PP${f}`, p.id, f <= 2 ? '2b' : '2a', 80, 110 + (f - 1) * 50);
  }
  const reset = snapshot.parts.find(p => p.type === 'pushbutton' && String(p.props.label).startsWith('RESET'));
  const sensors = snapshot.parts.find(p => p.type === 'dip-switch-4');
  const clock = byRef.get('U4');
  if (!reset || !sensors || !clock) throw new Error('Falta el reinicio, el sensor de planta o el reloj.');
  modeled.add(clock.id);
  source('RESET', '/RESET', reset.id, '2a', 370, 390);
  source('CLOCK', 'CLK · 21 Hz', clock.id, 'OUT', 370, 470, 'clock');
  for (let f = 1; f <= 4; f++) source(`SP${f}`, `SP${f}`, sensors.id, `${f}B`, 80, 750 + (f - 1) * 50, 'in', f === 1 ? 0 : 1);

  for (const [ref, y, label] of [['U14', 100, 'Destino'], ['U19', 740, 'Piso actual']] as const) {
    const dec = chip(ref, main, 1060, y);
    const seg = snapshot.parts.find(p => p.type === 'seven-segment' && netOf(p.id, 'a') === netOf(dec.id, 'SA'));
    if (!seg) throw new Error(`Falta el display conectado a ${ref}.`);
    const node = add(main, `display-${ref}`, 'seg7', 1290, y, { sourcePart: seg.id });
    note(main, `display-label-${ref}`, 1270, y - 50, label);
    for (const pin of 'abcdefg') attach(netOf(seg.id, pin), { node: node.id, pin, out: false, sheet: main.id });
  }
  for (const [ref, pin, label, color, y] of [
    ['U13', '2Y', 'SUBIR', 'green', 390], ['U12', 'OAEQB', 'PARAR', 'yellow', 450],
    ['U13', '4Y', 'BAJAR', 'red', 510], ['U5', '1Q', 'OCUPADO', 'blue', 570],
  ] as const) {
    const p = byRef.get(ref)!;
    const node = add(main, `indicator-${label}`, 'out', 1660, y, { label, color, sourcePart: p.id, sourcePin: pin });
    attach(netOf(p.id, pin), { node: node.id, pin: 'A', out: false, sheet: main.id });
  }
  const physicalChips = snapshot.parts.filter(p => PARTS[p.type]?.chip);
  if (physicalChips.some(p => !modeled.has(p.id))) throw new Error('El montaje contiene integrados fuera de las etapas previstas.');

  const shortName = (n: number) => (names.get(n) ?? `RED${n}`).replace('CAPTURA_PISO', 'CAPT_PISO');
  for (const stage of STAGES) {
    const sheet = bySheet.get(`elevator-${stage.id}`)!;
    const local = [...refs].filter(([, pins]) => pins.some(p => p.sheet === sheet.id));
    let ins = 0, outs = 0;
    const constants = new Map<number, LogicNode>();
    for (const [n, all] of local) {
      const here = all.filter(p => p.sheet === sheet.id);
      const external = all.some(p => p.sheet !== sheet.id);
      if (n === high || n === low) {
        let c = constants.get(n);
        if (!c) { c = add(sheet, `power-${n}`, 'const', 100, 660 + constants.size * 50, { value: n === high ? 1 : 0 }); constants.set(n, c); }
        here.filter(p => !p.out).forEach(p => connect(sheet, { node: c!.id, pin: 'Y' }, p));
        continue;
      }
      const driver = here.find(p => p.out);
      if (driver) {
        here.filter(p => !p.out).forEach(p => connect(sheet, driver, p, shortName(n)));
        if (external) {
          const port = add(sheet, `out-${n}`, 'out', 300 + Math.min(3, stage.refs.length) * 300, 100 + outs++ * 50, { label: shortName(n) });
          connect(sheet, driver, { node: port.id, pin: 'A' }); sheet.order.push(port.id);
          attach(n, { node: `block-${stage.id}`, pin: port.id, out: true, sheet: main.id });
        }
      } else {
        const port = add(sheet, `in-${n}`, 'in', 100, 100 + ins++ * 50, { label: shortName(n), value: 0 });
        here.forEach(p => connect(sheet, { node: port.id, pin: 'Y' }, p, shortName(n))); sheet.order.push(port.id);
        attach(n, { node: `block-${stage.id}`, pin: port.id, out: false, sheet: main.id });
      }
    }
    // Keep inputs and outputs in a predictable, matching order on the overview block.
    sheet.order.sort((a, b) => (a.startsWith('in-') ? 0 : 1) - (b.startsWith('in-') ? 0 : 1));
    note(sheet, 'stage-help', 100, -10, `${stage.title}\nConexiones derivadas del montaje físico.`);
  }
  const mainConstants = new Map<number, LogicNode>();
  for (const [n, all] of refs) {
    const here = all.filter(p => p.sheet === main.id);
    if (!here.length) continue;
    let driver = here.find(p => p.out);
    if (n === high || n === low) {
      let c = mainConstants.get(n);
      if (!c) { c = add(main, `power-${n}`, 'const', 1450, 100 + mainConstants.size * 50, { value: n === high ? 1 : 0 }); mainConstants.set(n, c); }
      driver = { node: c.id, pin: 'Y', out: true, sheet: main.id };
    }
    if (!driver && here.some(p => !p.out)) throw new Error(`La señal ${shortName(n)} quedó sin controlador en Diseño.`);
    if (driver) for (const target of here.filter(p => !p.out)) connect(main, driver, target, shortName(n));
  }
  note(main, 'title', 80, -110, 'ASCENSOR DE CUATRO PISOS\nDiseño correspondiente al montaje de este proyecto.');
  note(main, 'instructions', 80, 330, 'PP1–PP4: 0 = pulsado\n/RESET: 0 = reiniciar\nSP1–SP4: 0 = sensor activo');
  note(main, 'navigation', 80, 950, 'Las pestañas contienen los integrados reales de cada etapa.\nSon bloques de organización, no integrados físicos adicionales.');
  note(main, 'boundary', 1060, 950, 'Modelo lógico: alimentación y adaptación de voltaje implícitas.\nLa pantalla y el motor del GIGA se simulan en Protoboard.');
  const lookup = (id: string) => bySheet.get(id);
  for (const sheet of sheets) for (const node of sheet.nodes) if (!elementDef(node.kind, lookup)) throw new Error(`Elemento no compatible: ${node.kind}`);
  return { sheets, snapshot, sourceRefs: refs, high, low };
}
