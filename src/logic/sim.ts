// Simulador lógico del modo diseño: eventos por ciclos delta, sin retardos. En cada ciclo se
// evalúan juntos todos los elementos cuyas entradas cambiaron y después se aplican sus salidas;
// así los biestables de un mismo reloj leen sus datos antes de que ninguno cambie.
import { elementDef, Z, type Behavior, type Drive, type ElementCtx, type ElementDef, type Instance, icSignals } from './elements';
import { IC_PREFIX, X, type Bit, type LogicNode, type LogicSheet } from './types';

const MAX_DELTAS = 2000;
const MAX_DEPTH = 12;
/** Elementos que puede llegar a expandir una hoja con todos sus integrados anidados. */
export const MAX_ELEMENTS = 20_000;

interface Inst {
  node: LogicNode;
  def: ElementDef;
  behavior: Behavior;
  ins: number[];
  outs: number[];
  last: Drive[];
}

export interface SimProblem {
  kind: 'oscillation' | 'conflict' | 'recursion';
  message: string;
}

export const pinKey = (node: string, pin: string) => `${node}:${pin}`;

export class LogicSim {
  readonly nets: Bit[] = [];
  /** Red de cada patilla «nodo:patilla». */
  readonly netOf = new Map<string, number>();
  readonly conflicts = new Set<number>();
  problem: SimProblem | null = null;
  private insts: Inst[] = [];
  private byNode = new Map<string, Inst>();
  private drivers: { inst: number; out: number }[][] = [];
  private readers: number[][] = [];
  private sources = new Map<string, Bit>();
  private clocks: { inst: number; half: number; acc: number }[] = [];
  private queue = new Set<number>();

  constructor(
    readonly sheet: LogicSheet,
    private readonly lookup: (id: string) => LogicSheet | undefined,
    private readonly depth = 0,
    private readonly stack: string[] = [sheet.id],
    private readonly budget = { left: MAX_ELEMENTS },
  ) {
    const ctx: ElementCtx = {
      sheet: lookup,
      instantiate: (id) => this.child(id),
    };
    // Redes: unión de las patillas que une cada cable.
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      let r = k;
      while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(k, r);
      return r;
    };
    for (const w of sheet.wires) {
      const a = find(pinKey(w.a.node, w.a.pin));
      const b = find(pinKey(w.b.node, w.b.pin));
      if (a !== b) parent.set(a, b);
    }
    const roots = new Map<string, number>();
    const net = (key: string) => {
      const root = find(key);
      let id = roots.get(root);
      if (id === undefined) {
        id = this.nets.length;
        roots.set(root, id);
        this.nets.push(X);
        this.drivers.push([]);
        this.readers.push([]);
      }
      this.netOf.set(key, id);
      return id;
    };

    for (const node of sheet.nodes) {
      if (--this.budget.left < 0) {
        this.problem = { kind: 'recursion', message: 'El diseño es demasiado grande: sus integrados anidados superan los 20 000 elementos.' };
        break;
      }
      const def = elementDef(node.kind, lookup);
      if (!def) continue;
      const index = this.insts.length;
      const env = { source: () => this.sources.get(node.id) ?? (node.kind === 'in' ? (Number(node.props.value) ? 1 : 0) : 0) as Bit };
      const pins = def.pins(node.props, ctx);
      const ins = pins.filter((p) => p.dir === 'in').map((p) => net(pinKey(node.id, p.id)));
      const outs = pins.filter((p) => p.dir === 'out').map((p) => net(pinKey(node.id, p.id)));
      const inst: Inst = { node, def, behavior: def.behavior(node.props, ctx, env), ins, outs, last: outs.map(() => Z) };
      ins.forEach((n) => this.readers[n].push(index));
      outs.forEach((n, o) => this.drivers[n].push({ inst: index, out: o }));
      this.insts.push(inst);
      this.byNode.set(node.id, inst);
      if (node.kind === 'clock') {
        const hz = Math.max(0.01, Number(node.props.hz) || 1);
        this.clocks.push({ inst: index, half: 0.5 / hz, acc: 0 });
        this.sources.set(node.id, 0);
      }
    }
    this.insts.forEach((_, i) => this.queue.add(i));
    this.settle();
  }

  private child(id: string): Instance | null {
    const sheet = this.lookup(id);
    if (!sheet || this.depth >= MAX_DEPTH || this.stack.includes(id)) {
      this.problem = { kind: 'recursion', message: 'Un integrado no puede contenerse a sí mismo.' };
      return null;
    }
    if (this.budget.left <= 0) return null;
    const sim = new LogicSim(sheet, this.lookup, this.depth + 1, [...this.stack, id], this.budget);
    if (sim.problem?.kind === 'recursion') this.problem = sim.problem;
    const signals = icSignals(sheet);
    const ins = signals.filter((n) => n.kind === 'in');
    const outs = signals.filter((n) => n.kind === 'out');
    return {
      set: (v) => {
        ins.forEach((n, i) => sim.setSource(n.id, v[i], false));
        sim.settle();
      },
      outputs: () => outs.map((n) => sim.value(n.id, 'A')),
    };
  }

  // ── Entradas del usuario y tiempo ────────────────────────────────────────────────
  /** Valor de una entrada, un pulsador o una patilla de entrada de un integrado. */
  setSource(nodeId: string, value: Bit, settle = true) {
    if (this.sources.get(nodeId) === value) return;
    this.sources.set(nodeId, value);
    const inst = this.byNode.get(nodeId);
    if (inst) this.queue.add(this.insts.indexOf(inst));
    if (settle) this.settle();
  }

  source(nodeId: string): Bit | undefined {
    return this.sources.get(nodeId);
  }

  get hasClock() {
    return this.clocks.length > 0;
  }

  /** Avanza el tiempo: los relojes cambian cada medio periodo. */
  advance(seconds: number) {
    let changed = false;
    for (const c of this.clocks) {
      c.acc += seconds;
      let flips = 0;
      while (c.acc >= c.half && flips < 64) {
        c.acc -= c.half;
        flips++;
        this.toggleClock(c.inst);
        changed = true;
      }
      if (flips >= 64) c.acc = 0;
    }
    return changed;
  }

  /** Medio ciclo de todos los relojes (paso a paso). */
  stepClocks() {
    for (const c of this.clocks) {
      c.acc = 0;
      this.toggleClock(c.inst);
    }
  }

  private toggleClock(index: number) {
    const id = this.insts[index].node.id;
    this.setSource(id, this.sources.get(id) === 1 ? 0 : 1);
  }

  // ── Propagación ──────────────────────────────────────────────────────────────────
  settle() {
    let deltas = 0;
    while (this.queue.size) {
      if (++deltas > MAX_DELTAS) {
        this.problem = { kind: 'oscillation', message: 'El circuito oscila: una realimentación no llega a un valor estable.' };
        this.queue.clear();
        return;
      }
      const batch = [...this.queue];
      this.queue.clear();
      const results = batch.map((i) => {
        const inst = this.insts[i];
        return inst.behavior.step(inst.ins.map((n) => this.nets[n]));
      });
      const touched = new Set<number>();
      batch.forEach((i, k) => {
        const inst = this.insts[i];
        results[k].forEach((v, o) => {
          if (inst.last[o] !== v) {
            inst.last[o] = v;
            touched.add(inst.outs[o]);
          }
        });
      });
      for (const n of touched) {
        const value = this.resolve(n);
        if (value !== this.nets[n]) {
          this.nets[n] = value;
          for (const r of this.readers[n]) this.queue.add(r);
        }
      }
    }
    if (this.problem?.kind === 'oscillation') this.problem = null;
  }

  private resolve(n: number): Bit {
    let value: Bit | null = null;
    let conflict = false;
    for (const d of this.drivers[n]) {
      const v = this.insts[d.inst].last[d.out];
      if (v === Z) continue;
      if (value === null) value = v as Bit;
      else if (value !== v) conflict = true;
    }
    if (conflict) {
      this.conflicts.add(n);
      return X;
    }
    this.conflicts.delete(n);
    return value ?? X;
  }

  // ── Lectura ──────────────────────────────────────────────────────────────────────
  value(nodeId: string, pin: string): Bit {
    const n = this.netOf.get(pinKey(nodeId, pin));
    return n === undefined ? X : this.nets[n];
  }

  net(nodeId: string, pin: string) {
    return this.netOf.get(pinKey(nodeId, pin));
  }

  /** Número de 4 bits de un display hexadecimal, o null si alguna entrada es X. */
  hexValue(nodeId: string): number | null {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.value(nodeId, `D${i}`);
      if (b === X) return null;
      v |= b << i;
    }
    return v;
  }
}

/** Integrados que una hoja usa, directa o indirectamente (para impedir ciclos al colocar). */
export function icDependencies(sheetId: string, lookup: (id: string) => LogicSheet | undefined, seen = new Set<string>()) {
  const sheet = lookup(sheetId);
  if (!sheet || seen.has(sheetId)) return seen;
  seen.add(sheetId);
  for (const n of sheet.nodes) if (n.kind.startsWith(IC_PREFIX)) icDependencies(n.kind.slice(IC_PREFIX.length), lookup, seen);
  return seen;
}

/**
 * Tabla de verdad de un integrado combinacional (hasta 8 entradas). Para cada combinación se
 * parte de cero, así que un circuito con memoria aparece con su estado inicial.
 */
export function truthTable(sheet: LogicSheet, lookup: (id: string) => LogicSheet | undefined) {
  const signals = icSignals(sheet);
  const ins = signals.filter((n) => n.kind === 'in');
  const outs = signals.filter((n) => n.kind === 'out');
  if (ins.length > 8) return null;
  const rows: { inputs: Bit[]; outputs: Bit[] }[] = [];
  for (let m = 0; m < 1 << ins.length; m++) {
    const sim = new LogicSim(sheet, lookup);
    if (sim.problem?.kind === 'recursion') return null;
    const inputs = ins.map((_, i) => ((m >> (ins.length - 1 - i)) & 1) as Bit);
    ins.forEach((n, i) => sim.setSource(n.id, inputs[i], false));
    sim.settle();
    rows.push({ inputs, outputs: outs.map((n) => sim.value(n.id, 'A')) });
  }
  return { inputs: ins, outputs: outs, rows };
}
