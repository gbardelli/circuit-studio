import { describe, expect, it } from "vitest";
import {
  electricalChecks,
  explainSignal,
  diagnosticQuery,
} from "./diagnostics";
import type { CircuitSnapshot, WireData } from "../core/types";
const wire = (a: string, ap: string, b: string, bp: string): WireData => ({
  id: `${a}-${ap}-${b}-${bp}`,
  a: { part: a, pin: ap, x: 0, y: 0 },
  b: { part: b, pin: bp, x: 0, y: 0 },
  points: [],
  color: "#000",
});
const snap: CircuitSnapshot = {
  parts: [
    { id: "u1", type: "74hc08", x: 0, y: 0, rot: 0, props: {} },
    { id: "u2", type: "74hc04", x: 200, y: 0, rot: 0, props: {} },
  ],
  wires: [],
};
describe("evidence-based circuit diagnostics", () => {
  it('checks configured MCU push-pull outputs while excluding input and pull-up pins',()=>{
    const circuit:CircuitSnapshot={parts:[{id:'mcu',type:'arduino-uno',x:0,y:0,rot:0,props:{}}],wires:[wire('mcu','D2','mcu','D3')]};
    const currents=new Map([['mcu:D2',-.03],['mcu:D3',.03]]);
    expect(electricalChecks(circuit,{},currents,{'mcu:D2':'high','mcu:D3':'input'}).some(f=>f.title.includes('contra otra'))).toBe(false);
    expect(electricalChecks(circuit,{},currents,{'mcu:D2':'high','mcu:D3':'low'}).some(f=>f.title.includes('contra otra'))).toBe(true);
  });
  it("accepts a focused question and follows an LED through its resistor to the actual gate", () => {
    expect(diagnosticQuery("¿Por qué no enciende LS?")).toBe("ls");
    const circuit: CircuitSnapshot = {
      parts: [
        snap.parts[0],
        {
          id: "r",
          type: "resistor",
          x: 500,
          y: 0,
          rot: 0,
          props: { resistance: 1000 },
        },
        {
          id: "ls",
          type: "led",
          x: 600,
          y: 0,
          rot: 0,
          props: { label: "LS", color: "green" },
        },
      ],
      wires: [wire("ls", "A", "r", "2"), wire("r", "1", "u1", "1Y")],
    };
    const evidence = explainSignal(
      circuit,
      { "ls:A": 0, "r:2": 0, "r:1": 0, "u1:1Y": 0, "u1:1A": 0, "u1:1B": 5 },
      "ls:A",
    );
    expect(evidence.children[0].key).toBe("r:1");
    expect(evidence.children[0].children[0].key).toBe("u1:1Y");
    expect(evidence.children[0].children[0].children[0].key).toBe("u1:1A");
  });
  it("reports an input with no external component, and clears it after wiring", () => {
    expect(
      electricalChecks(snap, {}).some((f) => f.part === "u1" && f.pin === "1A"),
    ).toBe(true);
    const connected = { ...snap, wires: [wire("u1", "1A", "u2", "1Y")] };
    expect(
      electricalChecks(connected, {}).some(
        (f) => f.part === "u1" && f.pin === "1A",
      ),
    ).toBe(false);
  });
  it("detects opposing currents on two push-pull outputs, without accusing tied idle outputs", () => {
    const connected = { ...snap, wires: [wire("u1", "1Y", "u2", "1Y")] };
    expect(
      electricalChecks(connected, {}).some((f) =>
        f.title.includes("contra otra"),
      ),
    ).toBe(false);
    expect(
      electricalChecks(
        connected,
        {},
        new Map([
          ["u1:1Y", -0.03],
          ["u2:1Y", 0.03],
        ]),
      ).some((f) => f.title.includes("contra otra")),
    ).toBe(true);
  });
  it("traces an AND output to its actual connected source with measured evidence", () => {
    const connected = { ...snap, wires: [wire("u1", "1A", "u2", "1Y")] };
    const evidence = explainSignal(
      connected,
      { "u1:1Y": 0, "u1:1A": 0, "u1:1B": 5, "u2:1Y": 0, "u2:1A": 5 },
      "u1:1Y",
    );
    expect(evidence.state).toBe("LOW");
    expect(evidence.children.map((c) => c.key)).toEqual(["u1:1A", "u1:1B"]);
    expect(evidence.children[0].children[0].key).toBe("u2:1Y");
    expect(evidence.children[0].children[0].children[0].voltage).toBe(5);
  });
  it("does not invent previous latch events from present inputs", () => {
    const circuit: CircuitSnapshot = {
      parts: [{ id: "ff", type: "74hc74", x: 0, y: 0, rot: 0, props: {} }],
      wires: [],
    };
    const evidence = explainSignal(circuit, { "ff:1Q": 0 }, "ff:1Q");
    expect(evidence.explanation).toContain("pasado");
  });
});
