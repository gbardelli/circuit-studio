import { buildNetlist, pinKey } from "../core/netlist";
import type { CircuitSnapshot, PartData } from "../core/types";
import { PARTS } from "../parts";
export interface Finding {
  id: string;
  part: string;
  pin?: string;
  severity: "warning" | "error";
  title: string;
  detail: string;
  evidence: string[];
}
export interface Evidence {
  key: string;
  label: string;
  voltage: number | null;
  state: string;
  explanation: string;
  children: Evidence[];
}
export function diagnosticQuery(query: string) {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,:]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word &&
        ![
          "por",
          "que",
          "no",
          "se",
          "el",
          "la",
          "los",
          "las",
          "un",
          "una",
          "de",
          "del",
          "esta",
          "estan",
          "enciende",
          "encienden",
          "activa",
          "activan",
          "funciona",
          "funcionan",
          "cambia",
          "cambian",
          "alto",
          "bajo",
          "porque",
          "explica",
          "explicame",
          "senal",
        ].includes(word),
    )
    .join(" ");
}
function thresholds(part: PartData, readings: Record<string, number>) {
  const logic = PARTS[part.type]?.logic;
  if (!logic) return { low: 1.5, high: 3 };
  const supply = logic.supply
      ? readings[pinKey(part.id, logic.supply)]
      : undefined,
    ground = readings[pinKey(part.id, logic.ground)] ?? 0;
  if (logic.fixedThresholds || supply === undefined)
    return { low: logic.low + ground, high: logic.high + ground };
  return {
    low: ground + 0.35 * Math.max(0, supply - ground),
    high: ground + 0.55 * Math.max(0, supply - ground),
  };
}
export function pinLabel(part: PartData, pin: string) {
  return `${part.props.label || PARTS[part.type]?.partNumber || PARTS[part.type]?.name || part.type} · ${pin}`;
}
export function electricalChecks(
  snapshot: CircuitSnapshot,
  readings: Record<string, number>,
  currents = new Map<string, number>(),
): Finding[] {
  const netlist = buildNetlist(snapshot, PARTS),
    members = new Map<number, { part: PartData; pin: string }[]>();
  for (const part of snapshot.parts) {
    const def = PARTS[part.type];
    if (!def || def.category === "Protoboards") continue;
    for (const pin of def.pins(part.props)) {
      const net = netlist.netOf.get(pinKey(part.id, pin.id));
      if (net !== undefined)
        members.set(net, [...(members.get(net) ?? []), { part, pin: pin.id }]);
    }
  }
  const findings: Finding[] = [];
  const add = (
    part: string,
    pin: string | undefined,
    severity: Finding["severity"],
    title: string,
    detail: string,
    evidence: string[],
  ) =>
    findings.push({
      id: `${part}:${pin}:${title}`,
      part,
      pin,
      severity,
      title,
      detail,
      evidence,
    });
  for (const part of snapshot.parts) {
    const def = PARTS[part.type],
      logic = def?.logic;
    if (logic) {
      const { low, high } = thresholds(part, readings);
      for (const pin of logic.inputs) {
        const key = pinKey(part.id, pin),
          net = netlist.netOf.get(key);
        const peers = members.get(net!) ?? [];
        if (peers.length < 2)
          add(
            part.id,
            pin,
            "warning",
            "Entrada sin conexión externa",
            `${pin} no tiene otra patilla de componente conectada. Los orificios de una protoboard no aportan un nivel lógico.`,
            [key],
          );
        const v = readings[key];
        if (v !== undefined && v > low && v < high)
          add(
            part.id,
            pin,
            "warning",
            "Nivel lógico indeterminado",
            `${pin}: ${v.toFixed(2)} V está entre los umbrales del modelo, ${low.toFixed(2)} y ${high.toFixed(2)} V. Comprueba alimentación, carga y resistencias.`,
            [key],
          );
      }
      if (logic.supply) {
        const v = readings[pinKey(part.id, logic.supply)],
          g = readings[pinKey(part.id, logic.ground)];
        if (v !== undefined && g !== undefined && v - g < logic.minSupply)
          add(
            part.id,
            logic.supply,
            "error",
            "Alimentación insuficiente",
            `Se miden ${(v - g).toFixed(2)} V entre ${logic.supply} y ${logic.ground}.`,
            [pinKey(part.id, logic.supply), pinKey(part.id, logic.ground)],
          );
      }
    }
    const io = def?.mcu?.vio;
    if (io && io < 4)
      for (const pin of def.mcu!.pinIds) {
        const v = readings[pinKey(part.id, pin)];
        if (v !== undefined && v > io + 0.3)
          add(
            part.id,
            pin,
            "error",
            "Entrada por encima de la tensión de E/S",
            `${pin}: ${v.toFixed(2)} V frente a ${io} V nominales. Verifica la tolerancia en la documentación de la placa.`,
            [pinKey(part.id, pin)],
          );
      }
  }
  for (const group of members.values()) {
    const outputs = group.filter(
      ({ part, pin }) =>
        PARTS[part.type]?.logic?.outputs.includes(pin) &&
        !PARTS[part.type]?.logic?.openDrain,
    );
    if (outputs.length < 2) continue;
    const sourcing = outputs.find(
        (o) => (currents.get(pinKey(o.part.id, o.pin)) ?? 0) < -0.01,
      ),
      sinking = outputs.find(
        (o) => (currents.get(pinKey(o.part.id, o.pin)) ?? 0) > 0.01,
      );
    if (sourcing && sinking)
      add(
        sourcing.part.id,
        sourcing.pin,
        "error",
        "Salidas conduciendo una contra otra",
        "Una salida suministra más de 10 mA y otra absorbe más de 10 mA en la misma red. Revisa las habilitaciones.",
        [
          pinKey(sourcing.part.id, sourcing.pin),
          pinKey(sinking.part.id, sinking.pin),
        ],
      );
  }
  return findings.sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );
}
export function explainSignal(
  snapshot: CircuitSnapshot,
  readings: Record<string, number>,
  key: string,
  depth = 0,
  seen = new Set<string>(),
  context?: ReturnType<typeof buildNetlist>,
  modes: Record<string, string> = {},
): Evidence {
  const split = key.lastIndexOf(":"),
    part = snapshot.parts.find((p) => p.id === key.slice(0, split)),
    pin = key.slice(split + 1),
    v = readings[key] ?? null;
  const logic = part ? PARTS[part.type]?.logic : undefined;
  const levels = part ? thresholds(part, readings) : { low: 1.5, high: 3 };
  const state =
    v === null
      ? "Sin lectura"
      : v <= levels.low
        ? "LOW"
        : v >= levels.high
          ? "HIGH"
          : "Indeterminado";
  const node: Evidence = {
    key,
    label: part ? pinLabel(part, pin) : key,
    voltage: v,
    state,
    explanation: "Valor medido en la red.",
    children: [],
  };
  if (!part || depth >= 7 || seen.has(key) || seen.size > 200) return node;
  seen.add(key);
  const role = PARTS[part.type].pinRole?.(pin);
  if (
    role === "ground" ||
    role === "power" ||
    PARTS[part.type].ground?.includes(pin)
  ) {
    node.explanation =
      role === "power"
        ? "Pin de alimentación: verifica su tensión y referencia."
        : "Referencia de tierra del circuito.";
    return node;
  }
  const netlist = context ?? buildNetlist(snapshot, PARTS),
    net = netlist.netOf.get(key);
  if (logic?.outputs.includes(pin)) {
    const type = part.type,
      gate = /^(\d+)Y$/.exec(pin);
    const combinational =
      /^74hc(00|02|04|08|10|11|14|20|27|32|86|125|126)$/.test(type);
    const inputs =
      gate && combinational
        ? logic.inputs.filter(
            (p) => p.startsWith(gate[1]) && /^[0-9]+(?:[A-D]|OE|G)$/.test(p),
          )
        : logic.inputs;
    node.explanation = combinational
      ? "Salida combinacional; estas entradas determinan su nivel."
      : "Estado observado de un dispositivo. Sus entradas actuales no demuestran por sí solas qué ocurrió en el pasado; revisa los flancos y las habilitaciones en el analizador.";
    node.children = inputs
      .slice(0, 10)
      .map((p) =>
        explainSignal(
          snapshot,
          readings,
          pinKey(part.id, p),
          depth + 1,
          seen,
          netlist,
          modes,
        ),
      );
  } else {
    for (const driver of snapshot.parts) {
      const def = PARTS[driver.type];
      const candidates =
        def?.logic?.outputs ??
        (def?.mcu
          ? def.mcu.pinIds.filter((pin) =>
              ["high", "low", "pullup"].includes(modes[pinKey(driver.id, pin)]),
            )
          : driver.type === "clock"
            ? ["OUT"]
            : []);
      for (const output of candidates) {
        const other = pinKey(driver.id, output);
        if (
          other !== key &&
          netlist.netOf.get(other) === net &&
          !seen.has(other)
        )
          node.children.push(
            explainSignal(
              snapshot,
              readings,
              other,
              depth + 1,
              seen,
              netlist,
              modes,
            ),
          );
      }
    }
    if (!node.children.length)
      for (const resistor of snapshot.parts.filter(
        (p) => p.type === "resistor",
      )) {
        for (const [input, output] of [
          ["1", "2"],
          ["2", "1"],
        ])
          if (
            netlist.netOf.get(pinKey(resistor.id, input)) === net &&
            !seen.has(pinKey(resistor.id, output))
          ) {
            node.children.push(
              explainSignal(
                snapshot,
                readings,
                pinKey(resistor.id, output),
                depth + 1,
                seen,
                netlist,
                modes,
              ),
            );
            node.explanation =
              "La red continúa a través de una resistencia. Se muestran las tensiones de ambos lados.";
          }
      }
    if (!node.children.length)
      node.explanation =
        "No hay una salida lógica identificada en esta red. Puede depender de una fuente, un componente pasivo o un control manual.";
  }
  return node;
}
