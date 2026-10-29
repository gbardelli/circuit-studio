import { beforeAll, describe, expect, it } from "vitest";
import { compileSketch, compilerAvailable } from "../../server/compile";
import { Nextion } from "./nextion";
import { SimEngine } from "./engine";
import { templateSnapshot } from "../collab/applyTemplate";
import { TOUCHSCREEN, ELEVATOR_SCREEN } from "../collab/touchscreen";
import { elevatorTemplate } from "../collab/elevator";

function send(screen: Nextion, text: string) {
  for (const ch of text) screen.receive(ch.charCodeAt(0));
  for (let i = 0; i < 3; i++) screen.receive(255);
}
describe("Nextion UART protocol", () => {
  it("waits for all terminators and emits exact press and release coordinates", () => {
    const n = new Nextion();
    n.power(true);
    for (const b of [
      ...Array.from("sendxy=1", (c) => c.charCodeAt(0)),
      255,
      255,
    ])
      n.receive(b);
    n.touch(319, 239, true);
    expect(n.drain()).toEqual([]);
    n.receive(255);
    n.touch(319, 239, true);
    n.touch(319, 239, false);
    expect(n.drain()).toEqual([
      0x67, 1, 63, 0, 239, 1, 255, 255, 255, 0x67, 1, 63, 0, 239, 0, 255, 255,
      255,
    ]);
    n.touch(320, 240, true);
    expect(n.drain()).toEqual([]);
  });
  it("draws RGB565 primitives and quoted text; rejects malformed and unsupported commands", () => {
    const n = new Nextion();
    n.power(true);
    send(n, "bkcmd=3");
    expect(n.drain()).toEqual([1, 255, 255, 255]);
    send(n, "cls BLACK");
    send(n, "fill 20,90,280,100,2016");
    send(n, 'xstr 20,90,280,100,1,65535,2016,1,1,1,"Hello, touch"');
    const scene = JSON.parse(n.scene);
    expect(scene).toHaveLength(2);
    expect(scene[1].background).toBe("rgb(0,255,0)");
    expect(scene[1].text).toBe("Hello, touch");
    n.drain();
    send(n, "fill 2,3,-1,4,0");
    expect(n.drain()).toEqual([0x1a, 255, 255, 255]);
    send(n, "page missing");
    expect(n.drain()).toEqual([0, 255, 255, 255]);
    expect(JSON.parse(n.scene)).toEqual(scene);
  });
  it("repaints opaque labels without exhausting the drawing buffer", () => {
    const n = new Nextion();
    n.power(true);
    send(n, "cls BLACK");
    for (let i = 0; i < 1000; i++)
      send(n, `xstr 20,90,280,100,0,65535,0,1,1,1,"${i}"`);
    expect(n.error).toBe("");
    const scene = JSON.parse(n.scene);
    expect(scene).toHaveLength(2);
    expect(scene[1].text).toBe("999");
  });
  it("clears state on power loss and recovers from an oversized instruction", () => {
    const n = new Nextion();
    n.power(true);
    send(n, "sendxy=1");
    send(n, "a".repeat(1200));
    expect(n.drain()).toEqual([0x24, 255, 255, 255]);
    send(n, "cls RED");
    expect(JSON.parse(n.scene)).toHaveLength(1);
    n.power(false);
    n.touch(10, 20, true);
    expect(n.drain()).toEqual([]);
    expect(n.scene).toBe("[]");
    n.power(true);
    n.touch(10, 20, true);
    expect(n.drain()).toEqual([]);
    send(n, "sendme");
    expect(n.drain()).toEqual([0x66, 0, 255, 255, 255]);
  });
});

describe.skipIf(!compilerAvailable())(
  "compiled Arduino touchscreen integration",
  () => {
    let demo: string;
    beforeAll(async () => {
      const r = await compileSketch(
        TOUCHSCREEN.sketch!,
        "arduino:avr:mega:cpu=atmega2560",
      );
      expect(r.ok, r.stderr).toBe(true);
      demo = r.hex!;
    }, 90_000);
    function run(hex = demo, snapshot = templateSnapshot(TOUCHSCREEN)) {
      const engine = new SimEngine();
      let serial = "";
      engine.subscribeSerial((_id, text) => (serial += text));
      engine.update(snapshot);
      engine.setProgram("mcu", hex);
      engine.start({ manual: true });
      engine.tick(1.4);
      return { engine, serial: () => serial, snapshot };
    }
    it("programs the screen through Serial1 and receives a complete touch packet to toggle GPIO", () => {
      const h = run();
      expect(h.engine.getVisual("screen")?.powered).toBe(true);
      expect(String(h.engine.getVisual("screen")?.scene)).toContain("LED OFF");
      h.engine.setInput("screen", "touch", (1 << 18) | (160 << 9) | 140);
      h.engine.setInput("screen", "touch", (160 << 9) | 140);
      h.engine.tick(0.8);
      expect(h.serial()).toContain("160,140,1");
      expect(h.serial()).toContain("160,140,0");
      expect(String(h.engine.getVisual("screen")?.scene)).toContain("LED ON");
      expect(h.engine.voltageAt("mcu", "D13")).toBeGreaterThan(4.5);
      h.engine.stop();
    });
    it.each(["VCC", "GND", "RX", "TX"] as const)(
      "blocks communication with %s disconnected",
      (fault) => {
        const snapshot = templateSnapshot(TOUCHSCREEN);
        snapshot.wires = snapshot.wires.filter((w) => w.b.pin !== fault);
        const h = run(demo, snapshot);
        h.engine.setInput("screen", "touch", (1 << 18) | (160 << 9) | 140);
        h.engine.tick(0.2);
        if (fault === "TX") {
          expect(String(h.engine.getVisual("screen")?.scene)).toContain(
            "LED OFF",
          );
          expect(h.serial()).toBe("");
        } else
          expect(String(h.engine.getVisual("screen")?.scene)).not.toContain(
            "LED OFF",
          );
        expect(h.engine.voltageAt("mcu", "D13")).toBeLessThan(0.1);
        h.engine.stop();
      },
    );
    it.each([2, 3])(
      "supports Mega Serial%i in both directions",
      async (port) => {
        const code = `void setup(){Serial.begin(115200);Serial${port}.begin(19200);Serial${port}.print("sendxy=1");for(int i=0;i<3;i++)Serial${port}.write(255);} void loop(){while(Serial${port}.available())Serial.println(Serial${port}.read(),HEX);}`;
        const compiled = await compileSketch(
          code,
          "arduino:avr:mega:cpu=atmega2560",
        );
        expect(compiled.ok, compiled.stderr).toBe(true);
        const snap = templateSnapshot(TOUCHSCREEN);
        snap.wires.find((w) => w.b.pin === "RX")!.a.pin =
          port === 2 ? "D16" : "D14";
        snap.wires.find((w) => w.b.pin === "TX")!.a.pin =
          port === 2 ? "D17" : "D15";
        const h = run(compiled.hex!, snap);
        h.engine.setInput("screen", "touch", (1 << 18) | (12 << 9) | 34);
        h.engine.tick(0.1);
        // The physical device boots at 9600: firmware at 19200 cannot enable touch reporting.
        expect(h.serial()).toBe("");
        h.engine.stop();
        const ok = await compileSketch(
          code.replaceAll("19200", "9600"),
          "arduino:avr:mega:cpu=atmega2560",
        );
        expect(ok.ok, ok.stderr).toBe(true);
        const working = run(ok.hex!, snap);
        working.engine.setInput("screen", "touch", (1 << 18) | (12 << 9) | 34);
        working.engine.tick(0.1);
        expect(working.serial()).toMatch(
          /67\r?\n0\r?\nC\r?\n0\r?\n22\r?\n1\r?\nFF\r?\nFF\r?\nFF/,
        );
        working.engine.stop();
      },
      90_000,
    );
    it("uses touch as a physical hall call while the ICs retain and lock the destination", async () => {
      const compiled = await compileSketch(
        ELEVATOR_SCREEN,
        "arduino:avr:mega:cpu=atmega2560",
      );
      expect(compiled.ok, compiled.stderr).toBe(true);
      const h = run(compiled.hex!, templateSnapshot(elevatorTemplate()));
      expect(String(h.engine.getVisual("screen")?.scene)).toContain("FLOOR 4");
      h.engine.setInput("screen", "touch", (1 << 18) | (230 << 9) | 195);
      h.engine.setInput("screen", "touch", (230 << 9) | 195);
      h.engine.tick(0.6);
      expect(h.engine.voltageAt("destination", "Q2")).toBeGreaterThan(4.5);
      expect(h.engine.voltageAt("state", "1Q")).toBeGreaterThan(4.5);
      expect(h.engine.voltageAt("control", "4Y")).toBeGreaterThan(4.5);
      h.engine.setInput("screen", "touch", (1 << 18) | (80 << 9) | 130);
      h.engine.tick(0.5);
      expect(h.engine.voltageAt("destination", "Q2")).toBeGreaterThan(4.5);
      h.engine.stop();
    }, 90_000);
  },
);
