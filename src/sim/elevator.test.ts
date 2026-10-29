import { describe, expect, it } from "vitest";
import { elevatorTemplate } from "../collab/elevator";
import { templateSnapshot } from "../collab/applyTemplate";
import { SimEngine } from "./engine";

function fixture() {
  const snapshot = templateSnapshot(elevatorTemplate());
  const engine = new SimEngine();
  engine.update(snapshot);
  engine.start({ manual: true });
  const tick = () => {
    engine.tick(0.11);
    expect(engine.status.converged).toBe(true);
  };
  const bit = (part: string, pin: string) => engine.voltageAt(part, pin)! > 2.5;
  const value = (id: string) =>
    [0, 1, 2, 3].reduce(
      (value, n) => value | (bit(id, `Q${n}`) ? 1 << n : 0),
      0,
    );
  const floor = (n: number | null) => {
    for (const part of snapshot.parts)
      if (part.id.startsWith("sensor") && part.type === "slide-switch")
        part.props.on = part.id === `sensor${n}`;
    engine.update(snapshot);
    tick();
  };
  const press = (n: number, prefix = "pp") => {
    engine.setInput(`${prefix}${n}`, "pressed", true);
    tick();
    engine.setInput(`${prefix}${n}`, "pressed", false);
    tick();
  };
  tick();
  return { engine, tick, bit, value, floor, press };
}

describe("four-floor elevator course requirements", () => {
  it("starts with the destination display blank and both direction indicators off", () => {
    const h = fixture();
    expect(h.value("current")).toBe(1);
    expect(h.bit("state", "2Q")).toBe(false);
    expect(h.bit("decoder", "BL")).toBe(false);
    expect(h.bit("control", "4Y")).toBe(false);
    expect(h.bit("movement", "1Y")).toBe(false);
    h.engine.stop();
  });
  it("retains a released request, blocks new ones, and accepts another after arrival", () => {
    const h = fixture();
    h.press(4);
    expect(h.value("destination")).toBe(4);
    expect(h.bit("state", "1Q")).toBe(true);
    expect(h.bit("control", "4Y")).toBe(true);
    expect(h.bit("movement", "1Y")).toBe(false);
    h.press(2);
    expect(h.value("destination")).toBe(4);
    h.floor(null);
    expect(h.value("current")).toBe(1);
    expect(h.bit("state", "1Q")).toBe(true);
    h.floor(2);
    expect(h.value("current")).toBe(2);
    expect(h.value("destination")).toBe(4);
    h.floor(4);
    expect(h.bit("state", "1Q")).toBe(false);
    expect(h.bit("control", "4Y")).toBe(false);
    h.press(1);
    expect(h.value("destination")).toBe(1);
    expect(h.bit("movement", "1Y")).toBe(true);
    h.floor(1);
    expect(h.bit("state", "1Q")).toBe(false);
    expect(h.bit("movement", "1Y")).toBe(false);
    h.engine.stop();
  });
  it.each([1, 2, 3, 4])(
    "accepts the external call from floor %i as the innovation module",
    (floor) => {
      const h = fixture();
      h.press(floor, "call");
      expect(h.value("destination")).toBe(floor);
      expect(h.bit("state", "2Q")).toBe(true);
      h.engine.stop();
    },
  );
  it("clears stored data, blanking and motion with the reset input", () => {
    const h = fixture();
    h.press(4);
    h.engine.setInput("reset", "pressed", true);
    h.tick();
    expect(h.value("destination")).toBe(0);
    expect(h.bit("state", "1Q")).toBe(false);
    expect(h.bit("state", "2Q")).toBe(false);
    expect(h.bit("decoder", "BL")).toBe(false);
    h.engine.stop();
  });
});
