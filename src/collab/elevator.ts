import { BoardRig, type Ref } from "./boardRig";
import { ELEVATOR_SCREEN } from "./touchscreen";
import type { Template } from "./templates";

export function elevatorTemplate(): Template {
  const r = new BoardRig();
  r.board("logicA", 0, 0);
  r.board("logicB", 740, 0);
  r.board("inputs", 0, 330);
  r.board("outputs", 740, 330);
  r.loose("mcu", "arduino-mega", 0, -310, {
    label: "Arduino Mega · interfaz y alimentación",
  });
  for (const [key, type, board, col, label] of [
    ["merge", "74hc08", "logicA", 2, "U1 · PP o llamada"],
    ["destEncoder", "74hc148", "logicA", 11, "U2 · Codificador destino"],
    ["invDest", "74hc04", "logicA", 21, "U3 · Polaridad y validez"],
    ["control", "74hc08", "logicA", 30, "U4 · Aceptación y llegada"],
    ["stateOr", "74hc32", "logicA", 39, "U5 · Próximo estado"],
    ["state", "74hc74", "logicA", 48, "U6 · Ocupado y dato válido"],
    ["destination", "74hc161", "logicA", 56, "U7 · Memoria de destino"],
    ["sensorEncoder", "74hc148", "logicB", 2, "U8 · Codificador sensores"],
    ["invSensor", "74hc04", "logicB", 12, "U9 · Polaridad y control"],
    ["current", "74hc161", "logicB", 21, "U10 · Memoria piso actual"],
    ["compare", "74hc85", "logicB", 31, "U11 · Destino frente a actual"],
    ["movement", "74hc08", "logicB", 41, "U12 · Indicadores de marcha"],
    ["decoder", "cd4511", "logicB", 50, "U13 · BCD a siete segmentos"],
  ] as const)
    r.dip(key, type, board, col, label);

  const power: Ref = ["mcu", "5V"],
    ground: Ref = ["mcu", "GND.1"];
  r.wire(power, r.rail("logicA", true), "#e5484d");
  r.wire(ground, r.rail("logicA", false), "#34383d");
  for (const board of ["logicB", "inputs", "outputs"]) {
    r.wire(r.rail("logicA", true), r.rail(board, true), "#e5484d", -35);
    r.wire(r.rail("logicA", false), r.rail(board, false), "#34383d", -20);
  }
  const high = (key: string, pin: string, board: string) =>
    r.power([key, pin], board, true);
  const low = (key: string, pin: string, board: string) =>
    r.power([key, pin], board, false);
  const wire = (a: Ref, b: Ref, color?: string) => r.wire(a, b, color);
  for (const key of [
    "merge",
    "destEncoder",
    "invDest",
    "control",
    "stateOr",
    "state",
    "destination",
  ]) {
    high(key, "VCC", "logicA");
    low(key, "GND", "logicA");
  }
  for (const key of [
    "sensorEncoder",
    "invSensor",
    "current",
    "compare",
    "movement",
  ]) {
    high(key, "VCC", "logicB");
    low(key, "GND", "logicB");
  }
  high("decoder", "VDD", "logicB");
  low("decoder", "VSS", "logicB");

  for (let floor = 1; floor <= 4; floor++) {
    const pp = 2 + (floor - 1) * 6,
      call = 26 + (floor - 1) * 6;
    for (const [prefix, col, color] of [
      ["pp", pp, "blue"],
      ["call", call, "yellow"],
    ] as const) {
      const id = `${prefix}${floor}`;
      r.put(id, "pushbutton", "inputs", `e${col}`, {
        cap: color,
        label: `${prefix === "pp" ? "PP" : "Llamada"} ${floor}`,
      });
      r.put(
        `${id}Pull`,
        "resistor",
        "inputs",
        `tp${col + 2}`,
        { resistance: 10000 },
        90,
      );
      low(id, "1a", "inputs");
      wire([id, "2a"], ["merge", `${floor}${prefix === "pp" ? "A" : "B"}`]);
    }
    wire(["merge", `${floor}Y`], ["destEncoder", `I${floor}`]);
    r.put(
      `sensor${floor}`,
      "slide-switch",
      "inputs",
      `b${50 + (floor - 1) * 3}`,
      { on: floor === 1, label: `SP${floor} · Piso ${floor}` },
    );
    high(`sensor${floor}`, "1", "inputs");
    low(`sensor${floor}`, "2", "inputs");
    wire([`sensor${floor}`, "C"], ["sensorEncoder", `I${floor}`]);
  }
  for (const encoder of ["destEncoder", "sensorEncoder"]) {
    const board = encoder === "destEncoder" ? "logicA" : "logicB";
    low(encoder, "EI", board);
    for (const bit of [0, 5, 6, 7]) high(encoder, `I${bit}`, board);
  }
  for (let bit = 0; bit < 3; bit++) {
    wire(["destEncoder", `A${bit}`], ["invDest", `${bit + 1}A`]);
    wire(["invDest", `${bit + 1}Y`], ["destination", `D${bit}`]);
    wire(["sensorEncoder", `A${bit}`], ["invSensor", `${bit + 1}A`]);
    wire(["invSensor", `${bit + 1}Y`], ["current", `D${bit}`]);
  }
  wire(["destEncoder", "GS"], ["invDest", "4A"]); // Any request, active high.
  wire(["sensorEncoder", "GS"], ["invDest", "5A"]); // A sensor is present.
  wire(["sensorEncoder", "GS"], ["current", "PE"]);
  low("invDest", "6A", "logicA");
  low("invSensor", "6A", "logicB");
  for (const [key, board] of [
    ["destination", "logicA"],
    ["current", "logicB"],
  ] as const) {
    for (const pin of ["D3", "CEP", "CET"]) low(key, pin, board); // Parallel-load registers; never count.
  }
  // ACCEPT = !BUSY & REQUEST. ARRIVED = EQUAL & SENSOR_VALID.
  wire(["state", "1QN"], ["control", "1A"]);
  wire(["invDest", "4Y"], ["control", "1B"]);
  wire(["compare", "OAEQB"], ["control", "3A"]);
  wire(["invDest", "5Y"], ["control", "3B"]);
  wire(["control", "1Y"], ["invSensor", "4A"]);
  wire(["invSensor", "4Y"], ["destination", "PE"]);
  wire(["control", "3Y"], ["invSensor", "5A"]);
  // BUSY(next) = ACCEPT | (BUSY & !ARRIVED). VALID(next) = VALID | ACCEPT.
  wire(["state", "1Q"], ["control", "2A"]);
  wire(["invSensor", "5Y"], ["control", "2B"]);
  wire(["control", "1Y"], ["stateOr", "1A"]);
  wire(["control", "2Y"], ["stateOr", "1B"]);
  wire(["stateOr", "1Y"], ["state", "1D"]);
  wire(["state", "2Q"], ["stateOr", "2A"]);
  wire(["control", "1Y"], ["stateOr", "2B"]);
  wire(["stateOr", "2Y"], ["state", "2D"]);
  for (const pin of ["3A", "3B", "4A", "4B"]) low("stateOr", pin, "logicA");
  for (const pin of ["1PRE", "2PRE"]) high("state", pin, "logicA");

  r.loose("clock", "clock", 570, -100, {
    frequency: 20,
    duty: 50,
    label: "Reloj de muestreo · 20 Hz",
  });
  low("clock", "GND", "inputs");
  wire(["clock", "OUT"], ["inputs", "a62"], "#f5c518");
  for (const [hole, target] of [
    ["b62", ["destination", "CP"]],
    ["c62", ["current", "CP"]],
    ["d62", ["state", "1CLK"]],
    ["e62", ["state", "2CLK"]],
  ] as [string, Ref][])
    wire(["inputs", hole], target, "#f5c518");
  r.loose("reset", "pushbutton", 570, 240, {
    cap: "red",
    label: "RESET general",
  });
  r.loose("resetPull", "resistor", 610, 240, { resistance: 10000 });
  high("resetPull", "1", "inputs");
  wire(["resetPull", "2"], ["reset", "2a"]);
  low("reset", "1a", "inputs");
  wire(["reset", "2b"], ["inputs", "a63"], "#b48cff");
  for (const [hole, target] of [
    ["b63", ["destination", "MR"]],
    ["c63", ["current", "MR"]],
    ["d63", ["state", "1CLR"]],
    ["e63", ["state", "2CLR"]],
  ] as [string, Ref][])
    wire(["inputs", hole], target, "#b48cff");

  for (let bit = 0; bit < 4; bit++) {
    wire(["destination", `Q${bit}`], ["compare", `A${bit}`]);
    wire(["current", `Q${bit}`], ["compare", `B${bit}`]);
  }
  low("compare", "IALTB", "logicB");
  low("compare", "IAGTB", "logicB");
  high("compare", "IAEQB", "logicB");
  wire(["state", "1Q"], ["control", "4A"]);
  wire(["compare", "OAGTB"], ["control", "4B"]);
  wire(["state", "1Q"], ["movement", "1A"]);
  wire(["compare", "OALTB"], ["movement", "1B"]);
  for (const gate of [2, 3, 4])
    for (const input of ["A", "B"])
      low("movement", `${gate}${input}`, "logicB");
  high("decoder", "LT", "logicB");
  low("decoder", "LE", "logicB");
  wire(["state", "2Q"], ["decoder", "BL"]);
  for (const [bit, pin] of ["A", "B", "C", "D"].entries())
    wire(["destination", `Q${bit}`], ["decoder", pin]);

  r.put("display", "seven-segment", "outputs", "b3", {
    label: "Piso solicitado",
  });
  low("display", "COM1", "outputs"); // COM2 is internally connected.
  for (const [i, segment] of ["a", "b", "c", "d", "e", "f", "g"].entries()) {
    r.put(`seg${segment}`, "resistor", "outputs", `b${10 + i * 7}`, {
      resistance: 470,
    });
    wire(["decoder", `S${segment.toUpperCase()}`], [`seg${segment}`, "1"]);
    wire([`seg${segment}`, "2"], ["display", segment]);
  }
  for (const [key, col, color, signal] of [
    ["up", 10, "green", ["control", "4Y"]],
    ["down", 24, "yellow", ["movement", "1Y"]],
  ] as const) {
    r.put(`${key}R`, "resistor", "outputs", `i${col}`, { resistance: 1000 });
    r.put(key, "led", "outputs", `f${col + 7}`, {
      color,
      label: key === "up" ? "LS · Subiendo" : "LB · Bajando",
    });
    wire([...signal] as Ref, [`${key}R`, "1"]);
    wire([`${key}R`, "2"], [key, "A"]);
    low(key, "K", "outputs");
  }
  for (const [pin, source] of [
    ["D22", ["destination", "Q0"]],
    ["D23", ["destination", "Q1"]],
    ["D24", ["destination", "Q2"]],
    ["D25", ["state", "1Q"]],
    ["D26", ["state", "2Q"]],
    ["D27", ["current", "Q0"]],
    ["D28", ["current", "Q1"]],
    ["D29", ["current", "Q2"]],
    ["D30", ["control", "4Y"]],
    ["D31", ["movement", "1Y"]],
    ["D32", ["invDest", "5Y"]],
  ] as [string, Ref][])
    wire(source, ["mcu", pin]);
  r.loose("screen", "nextion-28", 1110, -310, {
    label: "Nextion · llamadas táctiles",
  });
  high("screen", "VCC", "logicB");
  low("screen", "GND", "logicB");
  wire(["mcu", "D18"], ["screen", "RX"], "#6c9de8");
  wire(["screen", "TX"], ["mcu", "D19"], "#e1b65b");
  for (let floor = 1; floor <= 4; floor++)
    wire(["mcu", `D${32 + floor}`], [`call${floor}`, "2b"]);
  return r.template({
    id: "elevator-course",
    name: "Ascensor de cuatro pisos · control con integrados",
    summary:
      "Memoria de destino, bloqueo durante el viaje, sensores, display e indicadores. Incluye llamadas externas como innovación.",
    level: "Avanzado",
    category: "Lógica secuencial",
    sketch: ELEVATOR_SCREEN,
  });
}
