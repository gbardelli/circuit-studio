import { SimEngine, type SimStatus } from "./engine";
import type { CircuitSnapshot } from "../core/types";
import type { Visual } from "../parts/types";

export interface Probe {
  key: string;
  name: string;
  color: string;
}
export interface Edge {
  t: number;
  v: number;
}
export interface LabState {
  paused: boolean;
  seeking: boolean;
  cursor: number;
  duration: number;
  probes: Probe[];
  traces: Record<string, Edge[]>;
  generation: number;
  error: string | null;
}
export interface SimulationFrame {
  modes: Record<string, string>;
  traceDelta: Record<string, { reset: boolean; edges: Edge[] }>;
  status: SimStatus;
  visuals: Record<string, Visual>;
  readings: Record<string, number>;
  currents: [string, number][];
  lab: LabState;
  serial: [string, string][];
  scene: CircuitSnapshot | null;
}
type Event =
  | {
      t: number;
      kind: "input";
      id: string;
      key: string;
      value: number | boolean;
    }
  | { t: number; kind: "serial"; id: string; text: string }
  | { t: number; kind: "update"; snapshot: CircuitSnapshot };
const clone = <T>(value: T): T => structuredClone(value);
export class SimulationSession {
  engine = new SimEngine();
  lab: LabState = {
    paused: false,
    seeking: false,
    cursor: 0,
    duration: 0,
    probes: [],
    traces: {},
    generation: 0,
    error: null,
  };
  private initial: CircuitSnapshot = { parts: [], wires: [] };
  private current: CircuitSnapshot = this.initial;
  private programs = new Map<string, string>();
  private events: Event[] = [];
  private boundaries: number[] = [];
  private serial: [string, string][] = [];
  private replaying = false;
  private token = 0;
  private frames: {
    t: number;
    visuals: Record<string, Visual>;
    readings: Record<string, number>;
  }[] = [];
  private bytes = 0;
  private sentTraces = new Map<
    string,
    { length: number; first: number; last: number }
  >();
  constructor() {
    this.attach();
  }
  private attach() {
    this.engine.subscribeSerial((id, text) => {
      if (!this.replaying) this.serial.push([id, text]);
    });
    this.engine.onSolve = () => {
      if (!this.replaying) this.sample();
    };
  }
  program(id: string, hex: string | null) {
    if (hex) this.programs.set(id, hex);
    else this.programs.delete(id);
    this.engine.setProgram(id, hex);
  }
  update(snapshot: CircuitSnapshot) {
    if (JSON.stringify(snapshot) === JSON.stringify(this.current)) return;
    const topology = (s: CircuitSnapshot) =>
      JSON.stringify([
        s.parts.map((p) => [p.id, p.type, p.x, p.y, p.rot]),
        s.wires.map((w) => [w.id, w.a, w.b]),
      ]);
    if (this.engine.running && topology(snapshot) !== topology(this.current)) {
      this.current = clone(snapshot);
      this.start();
      return;
    }
    this.current = clone(snapshot);
    if (this.engine.running) {
      this.branch();
      this.events.push({
        t: this.engine.time,
        kind: "update",
        snapshot: clone(snapshot),
      });
    }
    this.engine.update(snapshot);
  }
  start() {
    this.token++;
    this.engine.stop();
    this.engine = new SimEngine();
    this.attach();
    this.engine.update(this.current);
    for (const [id, hex] of this.programs) this.engine.setProgram(id, hex);
    this.initial = clone(this.current);
    this.events = [];
    this.boundaries = [];
    this.frames = [];
    this.bytes = 0;
    this.serial = [];
    this.sentTraces.clear();
    this.lab = {
      ...this.lab,
      paused: false,
      seeking: false,
      cursor: 0,
      duration: 0,
      traces: {},
      generation: this.lab.generation + 1,
      error: null,
    };
    this.engine.start({ manual: true });
    this.sample();
  }
  stop() {
    this.token++;
    this.lab = { ...this.lab, paused: false, seeking: false };
    this.engine.stop();
  }
  input(id: string, key: string, value: number | boolean) {
    if (!this.engine.running || this.lab.seeking) return;
    this.branch();
    this.events.push({ t: this.engine.time, kind: "input", id, key, value });
    this.engine.setInput(id, key, value);
  }
  write(id: string, text: string) {
    if (!this.engine.running || this.lab.seeking) return;
    this.branch();
    this.events.push({ t: this.engine.time, kind: "serial", id, text });
    this.engine.serialWrite(id, text);
  }
  watch(probes: Probe[]) {
    this.lab.probes = probes.slice(0, 12);
    for (const p of this.lab.probes)
      if (!this.lab.traces[p.key]) this.lab.traces[p.key] = [];
    for (const key of Object.keys(this.lab.traces))
      if (!probes.some((p) => p.key === key)) delete this.lab.traces[key];
    this.sample();
  }
  pause(on: boolean) {
    if (this.lab.seeking) return;
    this.lab.paused = on;
    if (!on) this.branch();
  }
  private branch() {
    if (this.lab.cursor < this.lab.duration - 1e-8) {
      this.events = this.events.filter((e) => e.t <= this.lab.cursor);
      this.boundaries = this.boundaries.filter((t) => t <= this.lab.cursor);
      if (this.boundaries.at(-1) !== this.lab.cursor)
        this.boundaries.push(this.lab.cursor);
      this.frames = this.frames.filter((f) => f.t <= this.lab.cursor);
      this.bytes = this.frames.reduce(
        (n, f) => n + JSON.stringify(f).length,
        0,
      );
      for (const key in this.lab.traces)
        this.lab.traces[key] = this.lab.traces[key].filter(
          (e) => e.t <= this.lab.cursor,
        );
      this.lab.duration = this.lab.cursor;
    }
  }
  pulse(seconds: number) {
    if (!this.engine.running || this.lab.paused || this.lab.seeking) return;
    const advanced=this.engine.stepBudget(Math.min(0.05, Math.max(0, seconds)), 7);
    this.engine.status={...this.engine.status,speed:seconds>0?advanced/seconds:1};
    if (this.boundaries.at(-1) !== this.engine.time)
      this.boundaries.push(this.engine.time);
    this.lab.cursor = this.engine.time;
    this.lab.duration = this.engine.time;
    this.capture();
  }
  private sample() {
    for (const probe of this.lab.probes) {
      const split = probe.key.lastIndexOf(":");
      const v = this.engine.voltageAt(
        probe.key.slice(0, split),
        probe.key.slice(split + 1),
      );
      if (v === null) continue;
      const trace =
        this.lab.traces[probe.key] ?? (this.lab.traces[probe.key] = []);
      const level = v > 2.5 ? 1 : 0;
      if (!trace.length || (trace.at(-1)!.v > 2.5 ? 1 : 0) !== level) {
        trace.push({ t: this.engine.time, v });
        if (trace.length > 6000) trace.splice(0, 1000);
      }
    }
  }
  private capture() {
    if (this.frames.length && this.engine.time - this.frames.at(-1)!.t < 1 / 30)
      return;
    const frame = {
      t: this.engine.time,
      visuals: clone(this.engine.visualSnapshot()),
      readings: this.engine.readings(false),
    };
    this.frames.push(frame);
    this.bytes += JSON.stringify(frame).length;
    while (this.frames.length > 1800 || this.bytes > 12_000_000) {
      const old = this.frames.shift()!;
      this.bytes -= JSON.stringify(old).length;
    }
  }
  frame(preview = false): SimulationFrame {
    let visuals = this.engine.visualSnapshot(),
      readings = this.engine.readings(false);
    if (preview) {
      const f = [...this.frames].reverse().find((f) => f.t <= this.lab.cursor);
      if (f) {
        visuals = f.visuals;
        readings = f.readings;
      }
    }
    const serial = this.serial;
    this.serial = [];
    const historical =
      this.lab.paused && this.lab.cursor < this.lab.duration - 1e-8;
    const change = historical
      ? [...this.events]
          .reverse()
          .find((e) => e.kind === "update" && e.t <= this.lab.cursor)
      : null;
    const scene = historical
      ? change?.kind === "update"
        ? change.snapshot
        : this.initial
      : null;
    const traceDelta: SimulationFrame["traceDelta"] = {};
    for (const probe of this.lab.probes) {
      const edges = this.lab.traces[probe.key] ?? [],
        sent = this.sentTraces.get(probe.key),
        first = edges[0]?.t ?? -1,
        last = edges.at(-1)?.t ?? -1;
      const reset =
        !sent ||
        sent.first !== first ||
        sent.length > edges.length ||
        (sent.length === edges.length && sent.last !== last);
      const added = reset ? edges : edges.slice(sent.length);
      if (reset || added.length)
        traceDelta[probe.key] = { reset, edges: clone(added) };
      this.sentTraces.set(probe.key, { length: edges.length, first, last });
    }
    return {
      modes: this.engine.pinModes(),
      status: { ...this.engine.status, simTime: this.lab.cursor },
      visuals,
      readings,
      currents: preview ? [] : [...this.engine.pinCurrents()],
      lab: { ...this.lab, probes: clone(this.lab.probes), traces: {} },
      traceDelta,
      serial,
      scene,
    };
  }
  async seek(
    time: number,
    emit: () => void,
    yieldTask: () => Promise<void> = () =>
      new Promise((resolve) => setTimeout(resolve, 0)),
  ) {
    if (!this.engine.running) return;
    const token = ++this.token,
      target = Math.max(0, Math.min(time, this.lab.duration));
    this.lab.paused = true;
    this.lab.seeking = true;
    this.lab.cursor = target;
    emit();
    const replay = new SimEngine();
    replay.update(clone(this.initial));
    for (const [id, hex] of this.programs) replay.setProgram(id, hex);
    replay.start({ manual: true });
    let index = 0,
      boundary = 0;
    try {
      while (
        replay.time < target - 1e-9 ||
        (index < this.events.length &&
          this.events[index].t <= target &&
          this.events[index].t <= replay.time + 1e-9)
      ) {
        if (token !== this.token) {
          replay.stop();
          return;
        }
        const started = performance.now();
        do {
          const event = this.events[index];
          if (event && event.t <= target && event.t <= replay.time + 1e-9) {
            if (event.kind === "input")
              replay.setInput(event.id, event.key, event.value);
            else if (event.kind === "serial")
              replay.serialWrite(event.id, event.text);
            else replay.update(clone(event.snapshot));
            index++;
          } else {
            while (
              boundary < this.boundaries.length &&
              this.boundaries[boundary] <= replay.time + 1e-10
            )
              boundary++;
            const to = Math.min(
              target,
              event?.t ?? target,
              this.boundaries[boundary] ?? target,
            );
            if (to <= replay.time + 1e-10) break;
            replay.stepBudget(to - replay.time, 6);
          }
        } while (
          performance.now() - started < 7 &&
          replay.time < target - 1e-9
        );
        await yieldTask();
      }
      if (token !== this.token) {
        replay.stop();
        return;
      }
      replay.tick(0);
      this.engine.stop();
      this.engine = replay;
      this.attach();
      this.lab.seeking = false;
      this.lab.cursor = replay.time;
      emit();
    } catch (error) {
      replay.stop();
      if (token === this.token) {
        this.lab.seeking = false;
        this.lab.error = String(error);
        emit();
      }
    }
  }
}
