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
/** Renombra una entrada entera de la leyenda (todos sus colores). Vacío vuelve al nombre automático. */
export function renameLegendEntry(raw: unknown, colors: string[], label: string): LegendEntry[] {
  const targets = new Set(colors.map((c) => c.toLowerCase()));
  const rest = configuredLegend(raw).flatMap((entry) => {
    const left = entry.colors.filter((c) => !targets.has(c));
    return left.length ? [{ ...entry, color: left[0], colors: left }] : [];
  });
  const list = [...targets];
  return label.trim() && list.length
    ? [{ color: list[0], colors: list, label: label.trim().slice(0, 80) }, ...rest]
    : rest;
}
/**
 * Leyenda real del montaje: una entrada por cada color que usan los cables (los más usados primero).
 * Nada se deduce ni se agrupa: el nombre de cada color lo pone el usuario. Sin nombre, la entrada
 * queda vacía (label = "") y la interfaz invita a nombrarla. `names` lista las redes que lleva ese
 * color, solo como ayuda.
 */
export function connectionLegend(
  snapshot: CircuitSnapshot,
  nets: Netlist,
  raw: unknown,
): (LegendEntry & { count: number })[] {
  const saved = configuredLegend(raw),
    aliases = new Map<number, string[]>();
  for (const part of snapshot.parts)
    for (const [pin, name] of namedPins(part)) {
      const id = nets.netOf.get(pinKey(part.id, pin));
      if (id !== undefined && name) aliases.set(id, [...(aliases.get(id) ?? []), name]);
    }
  const byColor = new Map<string, LegendEntry & { count: number }>();
  for (const wire of snapshot.wires) {
    if (wire.sch) continue;
    const color = wire.color.toLowerCase();
    const id =
      wire.a.part && wire.a.pin
        ? nets.netOf.get(pinKey(wire.a.part, wire.a.pin))
        : wire.b.part && wire.b.pin
          ? nets.netOf.get(pinKey(wire.b.part, wire.b.pin))
          : undefined;
    const names = id === undefined ? [] : (aliases.get(id) ?? []);
    const entry = byColor.get(color);
    if (entry) {
      entry.count++;
      entry.names = [...new Set([...(entry.names ?? []), ...names])];
    } else
      byColor.set(color, {
        color,
        colors: [color],
        label: saved.find((e) => e.colors.includes(color))?.label ?? "",
        names: [...new Set(names)],
        count: 1,
      });
  }
  // Los colores que comparten nombre (los siete segmentos de un display, por ejemplo) forman una sola entrada.
  const merged = new Map<string, LegendEntry & { count: number }>();
  for (const e of byColor.values()) {
    const key = e.label ? `label:${e.label}` : `color:${e.color}`;
    const into = merged.get(key);
    if (!into) merged.set(key, { ...e, colors: [...e.colors] });
    else {
      into.colors.push(...e.colors);
      into.count += e.count;
      into.names = [...new Set([...(into.names ?? []), ...(e.names ?? [])])];
    }
  }
  return [...merged.values()]
    .map((e) => ({ ...e, names: (e.names ?? []).sort() }))
    .sort((a, b) => Number(!a.label) - Number(!b.label) || b.count - a.count || a.color.localeCompare(b.color));
}
