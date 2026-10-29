// Orquesta la co-simulación: CPU AVR por segmentos que terminan en cada cambio de pin
// (o a 1 ms como máximo), resolución del circuito en cada frontera y promedios temporales
// para lo que se dibuja (brillo de LEDs con PWM, ángulo de servos, frecuencias).
import { buildNetlist, pinKey, type Netlist } from '../core/netlist';
import { Capacitor, Circuit, type Element } from '../core/solver';
import type { CircuitSnapshot, PartData, Props } from '../core/types';
import { PARTS } from '../parts';
import type { McuBridge, PartSim, Visual } from '../parts/types';
import { AvrRunner, CLOCK_HZ, type BoardId } from './avr';

const MAX_SEGMENT = 0.001;
const MAX_SOLVES_PER_FRAME = 6000;

interface PartRuntime {
  id: string;
  type: string;
  props: Props;
  sim: PartSim;
  sums: Record<string, number>;
  time: number;
  startedAt: number;
}

interface McuRuntime {
  partId: string;
  runner: AvrRunner | null;
  nodes: number[];
  analogNodes: number[];
  bridge: McuBridge;
  inputs: boolean[];
}

export interface SimStatus {
  running: boolean;
  simTime: number;
  speed: number;
  converged: boolean;
  nodes: number;
  message: string | null;
}

type Listener = () => void;

function topologyKey(snap: CircuitSnapshot) {
  const parts = snap.parts.map((p) => `${p.id}|${p.type}|${p.x}|${p.y}|${p.rot}|${p.props.cols ?? ''}|${p.props.flip ?? false}`).sort();
  const wires = snap.wires.map((w) => `${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`).sort();
  return parts.join(';') + '#' + wires.join(';');
}

export class SimEngine {
  running = false;
  private snapshot: CircuitSnapshot = { parts: [], wires: [] };
  private topo = '';
  private netlist: Netlist | null = null;
  private netNode = new Map<number, number>();
  private circuit: Circuit | null = null;
  private parts = new Map<string, PartRuntime>();
  private mcus: McuRuntime[] = [];
  private hasCapacitors = false;
  private inputs = new Map<string, number | boolean>();
  private programs = new Map<string, string>();
  private visuals = new Map<string, Visual>();
  private partListeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<Listener>();
  private serialListeners = new Set<(partId: string, text: string) => void>();
  private raf = 0;
  private last = 0;
  private dirty = true;
  private simTime = 0;
  status: SimStatus = { running: false, simTime: 0, speed: 1, converged: true, nodes: 0, message: null };

  // ── API pública ────────────────────────────────────────────────────────────
  update(snap: CircuitSnapshot) {
    this.snapshot = snap;
    if (!this.running) return;
    const key = topologyKey(snap);
    if (key !== this.topo) {
      this.rebuild(false);
    } else {
      for (const p of snap.parts) {
        const rt = this.parts.get(p.id);
        if (rt) Object.assign(rt.props, p.props);
      }
      this.dirty = true;
    }
  }

  /** `manual`: sin requestAnimationFrame; el llamador avanza con `tick()` (pruebas, servidor). */
  start(opts: { manual?: boolean } = {}) {
    if (this.running) return;
    this.running = true;
    this.simTime = 0;
    this.rebuild(true);
    if (opts.manual) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      if (this.running) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.circuit = null;
    this.mcus = [];
    this.parts.clear();
    this.inputs.clear();
    const ids = [...this.visuals.keys()];
    this.visuals.clear();
    ids.forEach((id) => this.notifyPart(id));
    this.status = { running: false, simTime: 0, speed: 1, converged: true, nodes: 0, message: null };
    this.statusListeners.forEach((l) => l());
  }

  setProgram(partId: string, hex: string | null) {
    if (hex) this.programs.set(partId, hex);
    else this.programs.delete(partId);
    if (this.running) this.rebuild(true);
  }

  hasProgram(partId: string) {
    return this.programs.has(partId);
  }

  setInput(partId: string, key: string, value: number | boolean) {
    this.inputs.set(`${partId}.${key}`, value);
    this.dirty = true;
  }

  serialWrite(partId: string, text: string) {
    this.mcus.find((m) => m.partId === partId)?.runner?.serialWrite(text);
  }

  getVisual(partId: string): Visual | null {
    return this.visuals.get(partId) ?? null;
  }

  subscribePart(partId: string, fn: Listener) {
    let set = this.partListeners.get(partId);
    if (!set) this.partListeners.set(partId, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  subscribeStatus(fn: Listener) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  subscribeSerial(fn: (partId: string, text: string) => void) {
    this.serialListeners.add(fn);
    return () => this.serialListeners.delete(fn);
  }

  /** Tensión del nodo al que está conectado un pin (null si está aislado o no simula). */
  voltageAt(partId: string, pin: string): number | null {
    if (!this.running || !this.netlist || !this.circuit) return null;
    const net = this.netlist.netOf.get(pinKey(partId, pin));
    if (net === undefined) return null;
    const node = this.netNode.get(net);
    if (node === undefined) return null;
    return node < 0 ? 0 : this.circuit.v[node];
  }

  /**
   * Corriente que entra en cada componente por cada pin (A), en el último punto resuelto.
   * Se obtiene de las ecuaciones de sus propios elementos (G·v − b), así vale también para
   * diodos y transistores. Los condensadores cuentan como abiertos en este cálculo.
   */
  pinCurrents(): Map<string, number> {
    const out = new Map<string, number>();
    if (!this.running || !this.netlist || !this.circuit) return out;
    const v = this.circuit.v;
    const netlist = this.netlist;
    for (const rt of this.parts.values()) {
      const node = new Map<number, number>();
      const add = (k: number, i: number) => {
        if (k >= 0 && i) node.set(k, (node.get(k) ?? 0) + i);
      };
      const at = (k: number) => (k < 0 ? 0 : v[k]);
      const probe = {
        v,
        dt: 0,
        limited: false,
        volt: at,
        conductance: (a: number, k: number, g: number) => {
          const i = g * (at(a) - at(k));
          add(a, i);
          add(k, -i);
        },
        current: (a: number, k: number, i: number) => {
          add(a, i);
          add(k, -i);
        },
        jac: (row: number, col: number, g: number) => add(row, g * at(col)),
        rhs: (row: number, value: number) => add(row, -value),
      };
      for (const e of rt.sim.elements) e.stamp(probe as never);
      let total = 0;
      node.forEach((i) => (total += i));
      // Cada nodo, a un único pin del componente; la tierra recibe lo que falta (KCL).
      const def = PARTS[rt.type];
      if (!def) continue;
      const seen = new Set<number>();
      for (const pin of def.pins(rt.props)) {
        const key = pinKey(rt.id, pin.id);
        const net = netlist.netOf.get(key);
        if (net === undefined) continue;
        const k = this.netNode.get(net);
        if (k === undefined || seen.has(k)) continue;
        seen.add(k);
        out.set(key, k < 0 ? -total : (node.get(k) ?? 0));
      }
    }
    return out;
  }

  // ── Construcción ───────────────────────────────────────────────────────────
  private rebuild(resetMcu: boolean) {
    const snap = this.snapshot;
    this.topo = topologyKey(snap);
    const netlist = buildNetlist(snap, PARTS);
    this.netlist = netlist;

    // Islas: redes unidas a través de componentes que simulan.
    const parent = new Map<number, number>();
    const find = (a: number): number => {
      let r = a;
      while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    const join = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    const groundNets = new Set<number>();
    const preferred: number[] = [];
    for (const p of snap.parts) {
      const def = PARTS[p.type];
      if (!def?.sim) continue;
      const nets = def.pins(p.props).map((pin) => netlist.netOf.get(pinKey(p.id, pin.id))!);
      for (let i = 1; i < nets.length; i++) join(nets[0], nets[i]);
      def.ground?.forEach((g) => groundNets.add(netlist.netOf.get(pinKey(p.id, g))!));
      if (def.reference) preferred.push(netlist.netOf.get(pinKey(p.id, def.reference))!);
    }
    const refByIsland = new Map<number, number>();
    for (const g of groundNets) refByIsland.set(find(g), g);
    for (const n of preferred) if (!refByIsland.has(find(n))) refByIsland.set(find(n), n);

    const netNode = new Map<number, number>();
    let count = 0;
    const nodeOf = (net: number) => {
      const known = netNode.get(net);
      if (known !== undefined) return known;
      const island = find(net);
      let ref = refByIsland.get(island);
      if (ref === undefined) {
        ref = net;
        refByIsland.set(island, net);
      }
      const node = groundNets.has(net) || ref === net ? -1 : count++;
      netNode.set(net, node);
      return node;
    };

    const prevMcus = new Map(this.mcus.map((m) => [m.partId, m]));
    const elements: Element[] = [];
    const parts = new Map<string, PartRuntime>();
    const mcus: McuRuntime[] = [];
    for (const p of snap.parts) {
      const def = PARTS[p.type];
      if (!def?.sim) continue;
      const props = { ...p.props };
      let mcu: McuRuntime | undefined;
      if (def.mcu) {
        const prev = prevMcus.get(p.id);
        const hex = this.programs.get(p.id);
        const runner = !resetMcu && prev?.runner ? prev.runner : hex ? this.createRunner(p.id, hex, def.mcu.board) : null;
        mcu = {
          partId: p.id,
          runner,
          nodes: [],
          analogNodes: [],
          inputs: [],
          bridge: {
            get running() {
              return runner != null;
            },
            pinMode: (i) => runner?.pinMode(i) ?? 'input',
          },
        };
      }
      const sim = def.sim({
        props,
        net: (pin) => {
          const net = netlist.netOf.get(pinKey(p.id, pin));
          return net === undefined ? -1 : nodeOf(net);
        },
        node: () => count++,
        input: (key) => this.inputs.get(`${p.id}.${key}`),
        mcu: mcu?.bridge,
      });
      if (mcu) {
        mcu.nodes = sim.mcuNodes ?? [];
        mcu.analogNodes = sim.analogNodes ?? [];
        mcus.push(mcu);
      }
      elements.push(...sim.elements);
      parts.set(p.id, { id: p.id, type: p.type, props, sim, sums: {}, time: 0, startedAt: this.simTime });
    }
    this.netNode = netNode;
    this.parts = parts;
    this.mcus = mcus;
    this.hasCapacitors = elements.some((e) => e instanceof Capacitor);
    this.circuit = new Circuit(count, elements);
    const r = this.circuit.solve(0);
    this.status = { ...this.status, running: true, nodes: count, converged: r.converged, message: r.converged ? null : 'El circuito no converge en el punto de operación.' };
    this.syncMcuInputs();
    this.dirty = false;
  }

  private createRunner(partId: string, hex: string, board: BoardId) {
    const runner = AvrRunner.fromHex(hex, board);
    runner.onSerial = (ch) => this.serialListeners.forEach((l) => l(partId, ch));
    return runner;
  }

  // ── Bucle ──────────────────────────────────────────────────────────────────
  private frame(now: number) {
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { advanced, converged } = this.advance(realDt, 24);
    this.publish(realDt > 0 ? advanced / realDt : 1, converged);
  }

  /** Avanza la simulación `seconds` de tiempo simulado y publica los valores visibles. */
  tick(seconds: number) {
    const { converged } = this.advance(seconds, Infinity);
    this.publish(1, converged);
  }

  private advance(span: number, budgetMs: number) {
    const circuit = this.circuit;
    if (!circuit) return { advanced: 0, converged: true };
    const started = performance.now();
    const from = this.simTime;
    const target = this.simTime + span;
    let solves = 0;
    let converged = true;
    const active = this.mcus.filter((m) => m.runner);

    while (this.simTime < target - 1e-9) {
      let segEnd = Math.min(target, this.simTime + MAX_SEGMENT);
      // Eventos programados por piezas (eco de un HC-SR04…): el segmento termina justo ahí.
      for (const rt of this.parts.values()) {
        const at = rt.sim.nextEvent?.();
        const eventTime = at == null ? null : rt.startedAt + at;
        if (eventTime != null && eventTime > this.simTime + 1e-12 && eventTime < segEnd) segEnd = eventTime;
      }
      let changed = false;
      for (const m of active) {
        const stopped = m.runner!.run(Math.round(segEnd * CLOCK_HZ));
        if (stopped) {
          changed = true;
          segEnd = Math.min(segEnd, m.runner!.seconds);
        }
      }
      const dt = segEnd - this.simTime;
      if (dt > 0) this.accumulate(circuit.v, dt);
      this.simTime = segEnd;
      for (const rt of this.parts.values()) if (rt.sim.changed?.()) changed = true;
      if ((changed || this.dirty || this.hasCapacitors) && solves < MAX_SOLVES_PER_FRAME) {
        const r = circuit.solve(this.hasCapacitors ? Math.max(dt, 1e-7) : 0);
        converged &&= r.converged;
        solves++;
        this.dirty = false;
        this.syncMcuInputs();
      }
      if (performance.now() - started > budgetMs) break; // no bloquear la interfaz
    }
    if (solves === 0 && this.dirty) {
      circuit.solve(0);
      this.dirty = false;
      this.syncMcuInputs();
    }
    return { advanced: this.simTime - from, converged };
  }

  private syncMcuInputs() {
    const v = this.circuit!.v;
    for (const m of this.mcus) {
      if (!m.runner) continue;
      m.nodes.forEach((node, i) => {
        const volts = node < 0 ? 0 : v[node];
        const mode = m.runner!.pinMode(i);
        if (mode === 'input' || mode === 'pullup') {
          const prev = m.inputs[i] ?? false;
          const high = prev ? volts > 1.5 : volts > 3.0; // histéresis del disparador Schmitt
          if (high !== prev) {
            m.inputs[i] = high;
            m.runner!.setInput(i, high);
          }
        }
      });
      m.analogNodes.forEach((node, ch) => m.runner!.setAnalog(ch, node < 0 ? 0 : v[node]));
    }
  }

  private accumulate(v: Float64Array, dt: number) {
    for (const rt of this.parts.values()) {
      if (rt.sim.probe) {
        const sample = rt.sim.probe(v);
        for (const k in sample) rt.sums[k] = (rt.sums[k] ?? 0) + sample[k] * dt;
      }
      rt.sim.tracker?.sample(v, dt);
      rt.time += dt;
    }
  }

  private publish(speed: number, converged: boolean) {
    for (const rt of this.parts.values()) {
      const visual: Visual = {};
      if (rt.time > 0) for (const k in rt.sums) visual[k] = rt.sums[k] / rt.time;
      if (rt.sim.tracker) Object.assign(visual, rt.sim.tracker.read());
      rt.sums = {};
      rt.time = 0;
      const mcu = this.mcus.find((m) => m.partId === rt.id);
      if (mcu?.runner) {
        visual.tx = mcu.runner.txActivity;
        mcu.runner.txActivity *= 0.6;
      }
      const prev = this.visuals.get(rt.id);
      if (!prev || changedEnough(prev, visual)) {
        this.visuals.set(rt.id, visual);
        this.notifyPart(rt.id);
      }
    }
    this.status = {
      running: true,
      simTime: this.simTime,
      speed: this.status.speed * 0.9 + speed * 0.1,
      converged,
      nodes: this.circuit?.nodeCount ?? 0,
      message: converged ? null : 'Convergencia numérica difícil: revisa cortocircuitos o fuentes en paralelo.',
    };
    this.statusListeners.forEach((l) => l());
  }

  private notifyPart(id: string) {
    this.partListeners.get(id)?.forEach((l) => l());
  }
}

function changedEnough(a: Visual, b: Visual) {
  for (const k in b) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'number' && typeof y === 'number') {
      if (Math.abs(x - y) > 1e-4 * Math.max(1, Math.abs(y)) + 1e-6) return true;
    } else if (x !== y) return true;
  }
  return false;
}

export type { PartData };
