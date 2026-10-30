import { describe, expect, it } from "vitest";
import { SimulationSession } from "./session";
import { templateSnapshot } from "../collab/applyTemplate";
import { TEMPLATES } from "../collab/templates";
import type { CircuitSnapshot } from "../core/types";
const clock: CircuitSnapshot = {
  parts: [
    {
      id: "clk",
      type: "clock",
      x: 0,
      y: 0,
      rot: 0,
      props: { frequency: 1000, duty: 50 },
    },
  ],
  wires: [],
};
function advance(session: SimulationSession, target: number) {
  let guard = 0;
  while (session.engine.time < target - 1e-8 && guard++ < 100000)
    session.pulse(Math.min(0.02, target - session.engine.time));
  expect(session.engine.time).toBeCloseTo(target, 5);
}
describe("worker simulation session", () => {
  it("reuses recorded integration boundaries when reconstructing capacitor charge", async () => {
    const snapshot: CircuitSnapshot = {
      parts: [
        { ...clock.parts[0], props: { frequency: 1, duty: 50 } },
        {
          id: "r",
          type: "resistor",
          x: 200,
          y: 0,
          rot: 0,
          props: { resistance: 1000 },
        },
        {
          id: "c",
          type: "capacitor",
          x: 300,
          y: 0,
          rot: 0,
          props: { capacitance: 100e-6 },
        },
      ],
      wires: [
        ["clk", "OUT", "r", "1"],
        ["r", "2", "c", "+"],
        ["c", "-", "clk", "GND"],
      ].map(([a, ap, b, bp], i) => ({
        id: `w${i}`,
        a: { part: a, pin: ap, x: 0, y: 0 },
        b: { part: b, pin: bp, x: 0, y: 0 },
        points: [],
        color: "#000",
      })),
    };
    const s = new SimulationSession();
    s.update(snapshot);
    s.start();
    for (const span of [0.0073, 0.0098, 0.0137, 0.0081]) s.pulse(span);
    const time = s.engine.time,
      voltage = s.engine.voltageAt("c", "+")!;
    expect(voltage).toBeGreaterThan(0.1);
    advance(s, 0.08);
    await s.seek(
      time,
      () => {},
      () => Promise.resolve(),
    );
    expect(s.engine.voltageAt("c", "+")).toBeCloseTo(voltage, 6);
    s.stop();
  });
  it("captures edges at solve boundaries rather than render frames", () => {
    const s = new SimulationSession();
    s.update(clock);
    s.watch([{ key: "clk:OUT", name: "CLK", color: "#fff" }]);
    s.start();
    advance(s, 0.01);
    const edges = s.lab.traces["clk:OUT"];
    expect(edges.length).toBeGreaterThanOrEqual(18);
    expect(edges[2].t - edges[1].t).toBeCloseTo(0.0005, 5);
    s.pause(true);
    const time = s.engine.time;
    s.pulse(0.03);
    expect(s.engine.time).toBe(time);
    s.stop();
  });
  it("reconstructs a past clock state and resumes a new trajectory", async () => {
    const s = new SimulationSession();
    s.update(clock);
    s.watch([{ key: "clk:OUT", name: "CLK", color: "#fff" }]);
    s.start();
    advance(s, 0.02);
    await s.seek(
      0.00275,
      () => {},
      () => Promise.resolve(),
    );
    expect(s.lab.seeking).toBe(false);
    expect(s.lab.paused).toBe(true);
    expect(s.engine.time).toBeCloseTo(0.00275, 7);
    const expected = s.engine.voltageAt("clk", "OUT");
    const comparison = new SimulationSession();
    comparison.update(clock);
    comparison.start();
    advance(comparison, 0.00275);
    expect(s.engine.voltageAt("clk", "OUT")).toBeCloseTo(
      comparison.engine.voltageAt("clk", "OUT")!,
      3,
    );
    s.pause(false);
    advance(s, 0.004);
    expect(s.lab.duration).toBeCloseTo(0.004, 5);
    expect(s.lab.traces["clk:OUT"].every((e) => e.t <= 0.004 + 1e-8)).toBe(
      true,
    );
    expect(expected).not.toBeNull();
    s.stop();
    comparison.stop();
  });
  it("replays sequential IC memory and recorded property changes", async () => {
    const template =
      TEMPLATES.find((t) => t.id === "binary-counter") ??
      TEMPLATES.find((t) => t.name === "Contador binario de 4 bits")!;
    const snap = templateSnapshot(template),
      s = new SimulationSession();
    s.update(snap);
    s.start();
    advance(s, 1.2);
    const readings = s.engine.readings();
    advance(s, 2.2);
    await s.seek(
      1.2,
      () => {},
      () => Promise.resolve(),
    );
    for (const part of snap.parts.filter(
      (p) => PARTS[p.type].logic?.outputs.length,
    ))
      for (const pin of PARTS[part.type].logic!.outputs) {
        const key = `${part.id}:${pin}`;
        expect(s.engine.readings()[key]).toBeCloseTo(readings[key], 2);
      }
    s.stop();
  });
  it("starts a new recording after a topology change and cancels an old seek", async () => {
    const s = new SimulationSession();
    s.update(clock);
    s.start();
    advance(s, 0.01);
    const generation = s.lab.generation;
    const pending = s.seek(
      0.005,
      () => {},
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    );
    s.update({
      ...clock,
      parts: [
        ...clock.parts,
        {
          id: "r",
          type: "resistor",
          x: 200,
          y: 0,
          rot: 0,
          props: { resistance: 1000 },
        },
      ],
    });
    await pending;
    expect(s.lab.generation).toBeGreaterThan(generation);
    expect(s.lab.seeking).toBe(false);
    expect(s.engine.time).toBe(0);
    s.stop();
  });
});
import { PARTS } from "../parts";

import { compileSketch, compilerAvailable } from "../../server/compile";
import { TOUCHSCREEN } from "../collab/touchscreen";
describe.skipIf(!compilerAvailable())(
  "time travel with compiled firmware and peripherals",
  () => {
    it("restores the CPU, GPIO and Nextion before and after a recorded touch", async () => {
      const result = await compileSketch(
        TOUCHSCREEN.sketch!,
        "arduino:avr:mega:cpu=atmega2560",
      );
      expect(result.ok, result.stderr).toBe(true);
      const s = new SimulationSession();
      s.update(templateSnapshot(TOUCHSCREEN));
      s.program("mcu", result.hex!);
      s.watch([{ key: "mcu:D13", name: "LED", color: "#fff" }]);
      s.start();
      advance(s, 1.3);
      expect(String(s.engine.getVisual("screen")?.scene)).toContain("LED OFF");
      s.input("screen", "touch", (1 << 18) | (160 << 9) | 140);
      s.input("screen", "touch", (160 << 9) | 140);
      advance(s, 1.9);
      expect(String(s.engine.getVisual("screen")?.scene)).toContain("LED ON");
      expect(s.engine.voltageAt("mcu", "D13")).toBeGreaterThan(4.5);
      await s.seek(
        1.2,
        () => {},
        () => Promise.resolve(),
      );
      expect(String(s.engine.getVisual("screen")?.scene)).toContain("LED OFF");
      expect(s.engine.voltageAt("mcu", "D13")).toBeLessThan(0.1);
      await s.seek(
        1.9,
        () => {},
        () => Promise.resolve(),
      );
      expect(String(s.engine.getVisual("screen")?.scene)).toContain("LED ON");
      expect(s.engine.voltageAt("mcu", "D13")).toBeGreaterThan(4.5);
      s.pause(false);
      advance(s, 2);
      expect(s.engine.voltageAt("mcu", "D13")).toBeGreaterThan(4.5);
      s.stop();
    }, 90000);
  },
);
