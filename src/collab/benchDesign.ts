// Pasa un montaje de protoboard a la vista Diseño: cada integrado lógico es un bloque y cada red,
// sus cables. Es el mismo circuito, conexión por conexión. Lo que no es lógica (fuente, resistencias,
// adaptadores, el GIGA y su pantalla) no entra; pulsadores, interruptores, el 555, LEDs y displays
// pasan a sus equivalentes del modo diseño.
import { buildNetlist, pinKey } from '../core/netlist';
import { chipPins } from '../logic/elements';
import { PARTS } from '../parts';
import type { DesignDoc } from './design';
import { templateSnapshot } from './applyTemplate';
import type { Template } from './templates';

export interface BenchDesignOptions {
  /** Placas que se dibujan, en orden (cada una es una fila de bloques). */
  boards: string[];
  /** Fuentes: pieza y patilla de la protoboard → entrada o reloj del diseño. */
  sources: { part: string; pin: string; kind: 'in' | 'clock'; props: Record<string, string | number> }[];
  /** LEDs del diseño sobre señales lógicas: [pieza, patilla, nombre, color]. */
  leds: [string, string, string, string][];
}

const ROW = 560;
const COLUMN = 230;

export function insertBenchDesign(design: DesignDoc, sheet: string, template: Template, opts: BenchDesignOptions) {
  const snap = templateSnapshot(template);
  const nets = buildNetlist(snap, PARTS);
  const net = (part: string, pin: string) => nets.netOf.get(pinKey(part, pin));
  const supply = snap.parts.find((p) => p.type === 'bench-supply');
  const vccNet = supply && net(supply.id, '+');
  const gndNet = supply && net(supply.id, '-');
  const parts = new Map(snap.parts.map((p) => [p.id, p]));
  const boardOf = (id: string) => {
    // Placa en la que está clavada la pieza (por su primera patilla insertada).
    for (const [leg, hole] of nets.inserted) if (leg.startsWith(`${id}:`)) return hole.slice(0, hole.indexOf(':'));
    return null;
  };

  const current = design.sheet(sheet)?.nodes ?? [];
  const ox = current.length ? Math.ceil((Math.max(...current.map((n) => n.x)) + 500) / 20) * 20 : 200;
  const ids: string[] = [];
  let right = 0; // x más a la derecha usado (sin el desplazamiento de la hoja)
  const add = (kind: string, x: number, y: number, props = {}) => {
    right = Math.max(right, x);
    const id = design.addNode(sheet, kind, ox + x, y, props);
    ids.push(id);
    return id;
  };
  type Ref = { node: string; pin: string; out: boolean };
  const byNet = new Map<number, Ref[]>();
  const attach = (n: number | undefined, ref: Ref) => {
    if (n === undefined) return;
    byNet.set(n, [...(byNet.get(n) ?? []), ref]);
  };

  design.batch(() => {
    const labelOf = (key: string) => String(template.parts.find((p) => p.key === key)?.props?.label ?? key);
    opts.boards.forEach((board, row) => {
      const y = row * ROW;
      add('note', -200, y - 120, { text: labelOf(board) });
      const chips = snap.parts
        .filter((p) => /^74/.test(p.type) && PARTS[p.type].chip && boardOf(p.id) === board)
        .sort((a, b) => a.x - b.x);
      const decoders: string[] = [];
      chips.forEach((p, i) => {
        const x = i * COLUMN;
        add('note', x, y - 60, { text: labelOf(p.id).replace(' · ', '\n') });
        const node = add(`chip:${p.type}`, x, y);
        const { inputs, outputs } = chipPins(PARTS[p.type].chip!);
        let tie1: string | null = null, tie0: string | null = null;
        for (const pin of inputs) {
          const n = net(p.id, pin);
          if (n !== undefined && n === vccNet) {
            tie1 ??= add('const', x - 70, y + 20 * inputs.length, { value: 1 });
            design.addWire(sheet, { node: tie1, pin: 'Y' }, { node, pin });
          } else if (n !== undefined && n === gndNet) {
            tie0 ??= add('const', x - 70, y + 20 * inputs.length + 30, { value: 0 });
            design.addWire(sheet, { node: tie0, pin: 'Y' }, { node, pin });
          } else attach(n, { node, pin, out: false });
        }
        for (const pin of outputs) attach(net(p.id, pin), { node, pin, out: true });
        if (/48$/.test(p.type)) decoders.push(p.id);
      });
      // Displays: el de cada decodificador, a la derecha de la fila.
      decoders.forEach((dec, i) => {
        const seg = snap.parts.find((q) => q.type === 'seven-segment' && net(q.id, 'a') === net(dec, 'SA'));
        if (!seg) return;
        const node = add('seg7', chips.length * COLUMN + 40 + i * 140, y, {});
        add('note', chips.length * COLUMN + 40 + i * 140, y - 60, { text: labelOf(seg.id) });
        for (const s of 'abcdefg') attach(net(seg.id, s), { node, pin: s, out: false });
      });
      // Fuentes de esta placa (pulsadores, interruptores y reloj), a la izquierda.
      let k = 0;
      for (const src of opts.sources) {
        if (!parts.has(src.part) || boardOf(src.part) !== board) continue;
        const node = add(src.kind, -200, y + k++ * 40, src.props);
        attach(net(src.part, src.pin), { node, pin: 'Y', out: true });
      }
    });
    // LEDs: a la derecha de la última fila.
    const last = (opts.boards.length - 1) * ROW;
    const maxX = right;
    add('note', maxX + 200, last - 60, { text: 'Indicadores' });
    opts.leds.forEach(([part, pin, label, color], i) => {
      const node = add('out', maxX + 200, last + i * 40, { label, color });
      attach(net(part, pin), { node, pin: 'A', out: false });
    });
    // Cables: en cada red, del que la manda (salida o fuente) a cada entrada.
    for (const refs of byNet.values()) {
      if (refs.length < 2) continue;
      const driver = refs.find((r) => r.out) ?? refs[0];
      for (const r of refs) if (r !== driver) design.addWire(sheet, { node: driver.node, pin: driver.pin }, { node: r.node, pin: r.pin });
    }
  });
  return ids;
}
