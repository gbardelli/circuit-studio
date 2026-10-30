import { describe, expect, it } from "vitest";
import { magneticPosition, occupiedHoles } from "./magnet";
import { materials, vcd } from "./lab-utils";
import { wavePath } from "./Signals";
import type { PartData } from "../core/types";
describe("workbench exports and placement", () => {
  const board: PartData = {
    id: "bb",
    type: "breadboard-full",
    x: 0,
    y: 0,
    rot: 0,
    props: { cols: 63 },
  };
  const resistor: PartData = {
    id: "r",
    type: "resistor",
    x: 0,
    y: 0,
    rot: 0,
    props: { resistance: 1000 },
  };
  it("snaps compatible legs into real breadboard holes and releases beyond the hysteresis", () => {
    const result = magneticPosition(resistor, { x: 32, y: 61 }, [board], 2);
    expect(result.at).toEqual({ x: 30, y: 60 });
    expect(result.held).toEqual({ x: 30, y: 60 });
    expect(
      magneticPosition(resistor, { x: 34, y: 60 }, [board], 2, result.held).at,
    ).toEqual({ x: 30, y: 60 });
    expect(
      magneticPosition(resistor, { x: 90, y: 300 }, [board], 2, result.held)
        .held,
    ).toBeNull();
  });
  it("does not magnetize into sockets already occupied by another component", () => {
    const occupied = { ...resistor, id: "other", x: 30, y: 60 };
    expect(
      magneticPosition(resistor, { x: 32, y: 61 }, [board, occupied], 2).held,
    ).toBeNull();
  });
  it("distinguishes occupied physical holes from valid shared breadboard strips", () => {
    const occupied = { ...resistor, id: "other", x: 30, y: 60 };
    expect(
      occupiedHoles(resistor, { x: 30, y: 60 }, [board, occupied]),
    ).toHaveLength(2);
    expect(
      occupiedHoles(resistor, { x: 30, y: 70 }, [board, occupied]),
    ).toHaveLength(0);
  });
  it("keeps material variants and quantities distinct", () => {
    const rows = materials({
      parts: [
        resistor,
        { ...resistor, id: "r2" },
        { ...resistor, id: "r3", props: { resistance: 220 } },
      ],
      wires: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].quantity).toBe(2);
    expect(rows[1].reference).toContain("220");
  });
  it("exports chronological VCD edges and preserves the level at the visible window start", () => {
    const edges = [
      { t: 0, v: 0 },
      { t: 0.01, v: 5 },
      { t: 0.02, v: 0 },
    ];
    expect(wavePath(edges, 0.015, 0.03)).toMatch(/^M0 6H/);
    const file = vcd({
      paused: true,
      seeking: false,
      cursor: 0.03,
      duration: 0.03,
      generation: 1,
      error: null,
      probes: [{ key: "clk:OUT", name: "CLK", color: "#fff" }],
      traces: { "clk:OUT": edges },
    });
    expect(file).toContain("$timescale 1us $end");
    expect(file.indexOf("#10000")).toBeLessThan(file.indexOf("#20000"));
  });
});
