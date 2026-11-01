import { pinKey, type Netlist } from "../core/netlist";
import type { CircuitSnapshot } from "../core/types";
import { namedPins } from "./readableConnections";

export interface LegendEntry {
  color: string;
  colors: string[];
  label: string;
  names?: string[];
}
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
export function configuredLegend(raw: unknown): LegendEntry[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    if (
      !entry ||
      !validColor(entry.color) ||
      typeof entry.label !== "string" ||
      !entry.label.trim()
    )
      return [];
    const colors = Array.isArray(entry.colors)
      ? entry.colors.filter(validColor)
      : [entry.color];
    return [
      {
        color: entry.color.toLowerCase(),
        colors: [
          ...new Set<string>(
            colors.map((color: string) => color.toLowerCase()),
          ),
        ],
        label: entry.label.trim(),
      },
    ];
  });
}
export function updateLegendLabel(
  raw: unknown,
  color: string,
  label: string,
): LegendEntry[] {
  const target = color.toLowerCase(),
    next = configuredLegend(raw).flatMap((entry) => {
      const colors = entry.colors.filter((c) => c !== target);
      return colors.length ? [{ ...entry, color: colors[0], colors }] : [];
    });
  return label.trim()
    ? [
        { color: target, colors: [target], label: label.trim().slice(0, 80) },
        ...next,
      ]
    : next;
}
/** Meaning comes from explicit project labels or actual net connections, never a palette match. */
export function connectionLegend(
  snapshot: CircuitSnapshot,
  nets: Netlist,
  raw: unknown,
): LegendEntry[] {
  const custom = configuredLegend(raw),
    aliases = new Map<number, string[]>(),
    pins = new Map<number, string[]>();
  for (const [key, id] of nets.netOf)
    pins.set(id, [
      ...(pins.get(id) ?? []),
      key.slice(key.lastIndexOf(":") + 1),
    ]);
  for (const part of snapshot.parts)
    for (const [pin, name] of namedPins(part)) {
      const id = nets.netOf.get(pinKey(part.id, pin));
      if (id !== undefined && name)
        aliases.set(id, [...(aliases.get(id) ?? []), name]);
    }
  const groups = new Map<string, LegendEntry>();
  for (const wire of snapshot.wires) {
    if (wire.sch) continue;
    const color = wire.color.toLowerCase();
    const id =
      wire.a.part && wire.a.pin
        ? nets.netOf.get(pinKey(wire.a.part, wire.a.pin))
        : wire.b.part && wire.b.pin
          ? nets.netOf.get(pinKey(wire.b.part, wire.b.pin))
          : undefined;
    const names = [
        ...new Set(id === undefined ? [] : (aliases.get(id) ?? [])),
      ].sort(),
      physical = id === undefined ? [] : (pins.get(id) ?? []);
    const override = custom.find((entry) => entry.colors.includes(color)),
      name = names[0];
    const label =
      override?.label ??
      (physical.some((pin) => /^(?:GND(?:\.\d+)?|VSS|-)$/i.test(pin))
        ? "GND"
        : physical.some((pin) => /^(?:3V3|5V|VCC|VDD|VIN|\+)$/i.test(pin))
          ? "Alimentación"
          : name
            ? name
                .replace(/^\/+/, "")
                .replace(/\d+$/, "")
                .replace(/_[A-G]$/, "")
            : "Sin etiqueta");
    const key = label || name || "Sin etiqueta",
      entry = groups.get(key);
    if (entry) {
      if (!entry.colors.includes(color)) entry.colors.push(color);
      entry.names = [...new Set([...(entry.names ?? []), ...names])];
    } else groups.set(key, { color, colors: [color], label: key, names });
  }
  const priority = (entry: LegendEntry) =>
    custom.some((saved) => saved.label === entry.label)
      ? 0
      : entry.label === "Alimentación" || entry.label === "GND"
        ? 1
        : 2;
  const entries = [...groups.values()].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (b.names?.length ?? 0) - (a.names?.length ?? 0) ||
      a.label.localeCompare(b.label),
  );
  if (entries.length <= 12) return entries;
  const rest = entries.slice(11),
    colors = [...new Set(rest.flatMap((entry) => entry.colors))];
  return [
    ...entries.slice(0, 11),
    {
      color: colors[0],
      colors,
      label: "Otras redes",
      names: rest.flatMap((entry) =>
        entry.names?.length ? entry.names : [entry.label],
      ),
    },
  ];
}
