import type { CircuitSnapshot } from "../core/types";
import type { LabState } from "../sim/session";
import { PARTS } from "../parts";
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function vcd(lab: LabState) {
  const ids = lab.probes.map((_, i) => String.fromCharCode(33 + i));
  const header = [
    "$version Circuit Studio $end",
    "$timescale 1us $end",
    "$scope module circuit $end",
    ...lab.probes.map(
      (p, i) =>
        `$var wire 1 ${ids[i]} ${p.name.replace(/[^a-zA-Z0-9_$]/g, "_")}_${i} $end`,
    ),
    "$upscope $end",
    "$enddefinitions $end",
  ];
  const events = lab.probes
    .flatMap((p, i) =>
      (lab.traces[p.key] ?? []).map((e) => ({
        t: Math.round(e.t * 1e6),
        line: `${e.v > 2.5 ? 1 : 0}${ids[i]}`,
      })),
    )
    .sort((a, b) => a.t - b.t);
  let t = -1;
  for (const event of events) {
    if (event.t !== t) {
      header.push(`#${event.t}`);
      t = event.t;
    }
    header.push(event.line);
  }
  return header.join("\n") + "\n";
}
export function materials(snapshot: CircuitSnapshot) {
  const rows = new Map<
    string,
    { name: string; reference: string; quantity: number; key: string }
  >();
  for (const p of snapshot.parts) {
    const def = PARTS[p.type];
    const value = Object.entries(p.props)
      .filter(([key]) =>
        ["resistance", "capacitance", "color", "cols"].includes(key),
      )
      .map(([key, v]) => `${key}=${v}`)
      .join(" · ");
    const key = `${p.type}|${value}`;
    const old = rows.get(key);
    if (old) old.quantity++;
    else
      rows.set(key, {
        key,
        name: def.name,
        reference: [def.partNumber, value].filter(Boolean).join(" · "),
        quantity: 1,
      });
  }
  if (snapshot.wires.length)
    rows.set("wire", {
      key: "wire",
      name: "Cables de conexión",
      reference: "Jumper",
      quantity: snapshot.wires.length,
    });
  return [...rows.values()];
}
export const csvCell = (value: unknown) =>
  `"${String(value).replaceAll('"', '""')}"`;
