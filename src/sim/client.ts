import type { SimStatus } from "./engine";
import type { CircuitSnapshot } from "../core/types";
import type { Visual } from "../parts/types";
import type { LabState, Probe, SimulationFrame } from "./session";
import { buildNetlist, type Netlist } from "../core/netlist";
import { PARTS } from "../parts";

/** Same synchronous inspection API as SimEngine, backed by a worker's last published frame. */
export class SimClient {
  running = false;
  status: SimStatus = {
    running: false,
    simTime: 0,
    speed: 1,
    converged: true,
    nodes: 0,
    message: null,
  };
  private worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  private partCache: Record<string, Visual> = {};
  private voltages: Record<string, number> = {};
  private currentsCache = new Map<string, number>();
  private listeners = new Set<() => void>();
  private partSubs = new Map<string, Set<() => void>>();
  private serialSubs = new Set<(id: string, text: string) => void>();
  private programsCache = new Set<string>();
  private hexCache = new Map<string, string>();
  private lastSnapshot: CircuitSnapshot = { parts: [], wires: [] };
  private failed = false;
  private topology: Netlist | null = null;
  private voltageNets = new Map<number, number>();
  private modes: Record<string, string> = {};
  playbackScene: CircuitSnapshot | null = null;
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
  constructor(private readonly room?: string) {
    this.bindWorker();
    if (room)
      try {
        const saved = JSON.parse(
          localStorage.getItem(`cs-probes:${room}`) ?? "[]",
        ) as Probe[];
        if (Array.isArray(saved))
          this.watch(
            saved
              .filter(
                (p) =>
                  p &&
                  typeof p.key === "string" &&
                  typeof p.name === "string" &&
                  typeof p.color === "string",
              )
              .slice(0, 12),
          );
      } catch {
        /* Unavailable local preferences do not block simulation. */
      }
  }
  private bindWorker() {
    this.worker.onmessage = (event) => {
      if (event.data.type === "error") {
        this.lab = { ...this.lab, error: event.data.message };
        this.status = { ...this.status, message: event.data.message };
        this.notify();
        return;
      }
      const frame = event.data.frame as SimulationFrame;
      if (!frame) return;
      const previous = this.partCache;
      this.partCache = frame.visuals;
      this.voltages = frame.readings;
      this.voltageNets.clear();
      for (const [key, v] of Object.entries(this.voltages)) {
        const net = this.topology?.netOf.get(key);
        if (net !== undefined) this.voltageNets.set(net, v);
      }
      this.currentsCache = new Map(frame.currents);
      this.status = frame.status;
      this.modes = frame.modes;
      this.running = frame.status.running;
      const traces =
        frame.lab.generation === this.lab.generation
          ? { ...this.lab.traces }
          : {};
      for (const [key, delta] of Object.entries(frame.traceDelta)) {
        traces[key] = delta.reset
          ? delta.edges
          : [...(traces[key] ?? []), ...delta.edges];
      }
      for (const key of Object.keys(traces))
        if (!frame.lab.probes.some((p) => p.key === key)) delete traces[key];
      this.lab = { ...frame.lab, traces };
      if (JSON.stringify(this.playbackScene) !== JSON.stringify(frame.scene))
        this.playbackScene = frame.scene;
      for (const id of new Set([
        ...Object.keys(previous),
        ...Object.keys(this.partCache),
      ])) {
        if (JSON.stringify(previous[id]) !== JSON.stringify(this.partCache[id]))
          this.partSubs.get(id)?.forEach((fn) => fn());
      }
      for (const [id, text] of frame.serial)
        this.serialSubs.forEach((fn) => fn(id, text));
      this.notify();
    };
    this.worker.onerror = (event) => {
      console.error(
        "Simulation worker:",
        event.message,
        event.filename,
        event.lineno,
      );
      this.failed = true;
      this.running = false;
      this.status = {
        ...this.status,
        running: false,
        message:
          "El motor de simulación se interrumpió. Detén y vuelve a simular.",
      };
      this.lab = { ...this.lab, error: this.status.message };
      this.notify();
    };
  }
  private notify() {
    this.listeners.forEach((fn) => fn());
  }
  update(snapshot: CircuitSnapshot) {
    this.lastSnapshot = snapshot;
    this.topology = buildNetlist(snapshot, PARTS);
    this.worker.postMessage({ type: "update", snapshot });
  }
  start() {
    if (this.failed) {
      this.worker.terminate();
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.bindWorker();
      this.failed = false;
      this.worker.postMessage({ type: "update", snapshot: this.lastSnapshot });
      for (const [id, hex] of this.hexCache)
        this.worker.postMessage({ type: "program", id, hex });
      this.worker.postMessage({ type: "watch", probes: this.lab.probes });
    }
    this.running = true;
    this.worker.postMessage({ type: "start" });
  }
  stop() {
    this.running = false;
    this.worker.postMessage({ type: "stop" });
  }
  dispose() {
    this.worker.postMessage({ type: "dispose" });
    this.worker.terminate();
    this.listeners.clear();
    this.partSubs.clear();
    this.serialSubs.clear();
  }
  setProgram(id: string, hex: string | null) {
    if (hex) this.hexCache.set(id, hex);
    else this.hexCache.delete(id);
    if (hex) this.programsCache.add(id);
    else this.programsCache.delete(id);
    this.worker.postMessage({ type: "program", id, hex });
  }
  hasProgram(id: string) {
    return this.programsCache.has(id);
  }
  setInput(id: string, key: string, value: number | boolean) {
    this.worker.postMessage({ type: "input", id, key, value });
  }
  serialWrite(id: string, text: string) {
    this.worker.postMessage({ type: "serial", id, text });
  }
  voltageAt(id: string, pin: string) {
    const key = `${id}:${pin}`;
    return (
      this.voltages[key] ??
      this.voltageNets.get(this.topology?.netOf.get(key) ?? -1) ??
      null
    );
  }
  pinCurrents() {
    return this.currentsCache;
  }
  readings() {
    return this.voltages;
  }
  pinModes() {
    return this.modes;
  }
  getVisual(id: string) {
    return this.partCache[id] ?? null;
  }
  subscribeStatus(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  subscribePart(id: string, fn: () => void) {
    let set = this.partSubs.get(id);
    if (!set) this.partSubs.set(id, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  subscribeSerial(fn: (id: string, text: string) => void) {
    this.serialSubs.add(fn);
    return () => this.serialSubs.delete(fn);
  }
  watch(probes: Probe[]) {
    if (this.room)
      try {
        localStorage.setItem(`cs-probes:${this.room}`, JSON.stringify(probes));
      } catch {
        /* Storage may be unavailable. */
      }
    this.worker.postMessage({ type: "watch", probes });
  }
  pause(on: boolean) {
    this.worker.postMessage({ type: "pause", on });
  }
  seek(time: number) {
    this.worker.postMessage({ type: "seek", time });
  }
}
