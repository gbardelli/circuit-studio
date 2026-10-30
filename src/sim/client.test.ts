import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimClient } from "./client";
import type { SimulationFrame } from "./session";
import { templateSnapshot } from "../collab/applyTemplate";
import { TOUCHSCREEN } from "../collab/touchscreen";
class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror:
    | ((event: { message: string; filename: string; lineno: number }) => void)
    | null = null;
  messages: unknown[] = [];
  terminate = vi.fn();
  constructor() {
    MockWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  emit(frame: SimulationFrame) {
    this.onmessage?.({ data: { type: "frame", frame } });
  }
}
const frame = (): SimulationFrame => ({
  modes: {},
  status: {
    running: true,
    simTime: 1,
    speed: 1,
    converged: true,
    nodes: 2,
    message: null,
  },
  visuals: { screen: { powered: true, scene: "[]" } },
  readings: { "mcu:5V": 5, "screen:VCC": 5 },
  currents: [],
  serial: [],
  scene: null,
  lab: {
    paused: false,
    seeking: false,
    cursor: 1,
    duration: 1,
    probes: [{ key: "mcu:D13", name: "LED", color: "#fff" }],
    traces: {},
    generation: 1,
    error: null,
  },
  traceDelta: { "mcu:D13": { reset: true, edges: [{ t: 0, v: 0 }] } },
});
beforeEach(() => {
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker);
});
afterEach(() => vi.unstubAllGlobals());
describe("worker client lifecycle and incremental frames", () => {
  it("merges edge deltas and only notifies components whose visual state changed", () => {
    const client = new SimClient(),
      worker = MockWorker.instances[0],
      changed = vi.fn();
    client.update(templateSnapshot(TOUCHSCREEN));
    client.subscribePart("screen", changed);
    worker.emit(frame());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(client.voltageAt("screen", "VCC")).toBe(5);
    const second = frame();
    second.traceDelta = {
      "mcu:D13": { reset: false, edges: [{ t: 1, v: 5 }] },
    };
    worker.emit(second);
    expect(client.lab.traces["mcu:D13"]).toHaveLength(2);
    expect(changed).toHaveBeenCalledTimes(1);
    const stop = frame();
    stop.lab.generation = 2;
    stop.traceDelta = { "mcu:D13": { reset: true, edges: [{ t: 0, v: 5 }] } };
    worker.emit(stop);
    expect(client.lab.traces["mcu:D13"]).toHaveLength(1);
    client.dispose();
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("recreates a failed worker with its document and compiled programs", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {}),
      client = new SimClient(),
      worker = MockWorker.instances[0];
    client.update(templateSnapshot(TOUCHSCREEN));
    client.setProgram("mcu", ":0100000000FF");
    worker.onerror?.({
      message: "Test worker interruption",
      filename: "worker.js",
      lineno: 1,
    });
    expect(client.status.running).toBe(false);
    client.start();
    const next = MockWorker.instances[1];
    expect(worker.terminate).toHaveBeenCalled();
    expect(next.messages).toContainEqual({
      type: "program",
      id: "mcu",
      hex: ":0100000000FF",
    });
    expect(next.messages).toContainEqual({ type: "start" });
    client.dispose();
    error.mockRestore();
  });
});
