import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pinKey, type Netlist } from "../core/netlist";
import type { CircuitSnapshot, WireData, Vec } from "../core/types";
import { wirePoints } from "./geometry";
import { useEditor } from "./context";
import { namedPins } from "./readableConnections";
import { connectionLegend, renameLegendEntry, type LegendEntry } from "./wiring-legend";
import { ConnectionEndpoint } from "./ConnectionEndpoint";
import { WIRE_COLORS } from "./geometry";
import { HintButton } from "./Overlays";

export function wireNet(w: WireData, nets: Netlist) {
  return w.a.part && w.a.pin
    ? nets.netOf.get(pinKey(w.a.part, w.a.pin))
    : w.b.part && w.b.pin
      ? nets.netOf.get(pinKey(w.b.part, w.b.pin))
      : undefined;
}

/** Bridges mark physical crossings, never a new electrical junction. */
export function wireCrossings(
  snapshot: CircuitSnapshot,
): Map<string, (Vec & { vertical?: boolean })[]> {
  const parts = new Map(snapshot.parts.map((p) => [p.id, p]));
  const prior: { a: Vec; b: Vec }[] = [],
    result = new Map<string, (Vec & { vertical?: boolean })[]>();
  for (const w of snapshot.wires) {
    if (w.sch) continue;
    const points = wirePoints(w, parts),
      hits: (Vec & { vertical?: boolean })[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const vertical = Math.abs(a.x - b.x) < 0.01;
      const horizontal = Math.abs(a.y - b.y) < 0.01;
      if ((!vertical && !horizontal) || Math.hypot(a.x - b.x, a.y - b.y) < 10)
        continue;
      for (const seg of prior) {
        const otherVertical = Math.abs(seg.a.x - seg.b.x) < 0.01;
        const otherHorizontal = Math.abs(seg.a.y - seg.b.y) < 0.01;
        if (vertical ? !otherHorizontal : !otherVertical) continue;
        const x = vertical ? a.x : seg.a.x,
          y = vertical ? seg.a.y : a.y;
        const along = vertical ? y : x,
          across = vertical ? x : y;
        const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
          hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const otherLo = vertical
            ? Math.min(seg.a.x, seg.b.x)
            : Math.min(seg.a.y, seg.b.y),
          otherHi = vertical
            ? Math.max(seg.a.x, seg.b.x)
            : Math.max(seg.a.y, seg.b.y);
        if (
          along <= lo + 6 ||
          along >= hi - 6 ||
          across <= otherLo + 6 ||
          across >= otherHi - 6
        )
          continue;
        if (!hits.some((p) => Math.hypot(p.x - x, p.y - y) < 9))
          hits.push(vertical ? { x, y, vertical: true } : { x, y });
      }
    }
    result.set(w.id, hits);
    for (let i = 1; i < points.length; i++)
      prior.push({ a: points[i - 1], b: points[i] });
  }
  return result;
}

export function ConnectionGuide({
  snapshot,
  netlist,
  wire,
  onClear,
}: {
  snapshot: CircuitSnapshot;
  netlist: Netlist;
  wire?: WireData;
  onClear: () => void;
}) {
  const { project } = useEditor();
  const guide = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = guide.current,
      canvas = node?.closest<HTMLElement>(".canvas-wrap");
    if (!node || !canvas) return;
    let previous = 0;
    const measure = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height > 0 && height !== previous) {
        previous = height;
        canvas.style.setProperty("--connection-guide-height", `${height}px`);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      canvas.style.removeProperty("--connection-guide-height");
    };
  }, []);
  const rawLegend = project.meta.get("wiring.legend");
  const legend = useMemo(
    () => connectionLegend(snapshot, netlist, rawLegend),
    [snapshot, netlist, rawLegend],
  );
  const net = wire && wireNet(wire, netlist);
  let name = "Conexión";
  if (net !== undefined) {
    for (const [key, id] of netlist.netOf) {
      if (id !== net) continue;
      const pin = key.slice(key.lastIndexOf(":") + 1);
      if (/^(GND(\.\d+)?|tn\d+|bn\d+)$/i.test(pin)) name = "GND";
      if (/^(3V3|5V|VCC|VDD)$/i.test(pin)) name = "Alimentación";
    }
    for (const p of snapshot.parts) {
      for (const [pin, label] of namedPins(p)) {
        if (label && netlist.netOf.get(pinKey(p.id, pin)) === net) name = label;
      }
    }
  }
  const count =
    wire && net !== undefined
      ? snapshot.wires.filter((w) => wireNet(w, netlist) === net).length
      : wire ? 1 : 0;
  return (
    <aside
      ref={guide}
      className={`connection-guide ${wire ? "is-focused" : ""} ${legend.length ? "has-legend" : ""}`}
      aria-label="Guía de conexiones"
    >
      <div
        className="connection-guide-details"
        aria-hidden={!wire || undefined}
      >
        <div className="connection-heading">
          <span
            className="connection-swatch"
            style={{ background: wire?.color }}
          />
          <strong>{name}</strong>
          <span>
            {count} {count === 1 ? "cable" : "cables"}
          </span>
        </div>
        <div className="connection-ends">
          <ConnectionEndpoint
            label="Origen"
            end={wire?.a ?? { x: 0, y: 0 }}
            part={snapshot.parts.find((p) => p.id === wire?.a.part)}
          />
          <ConnectionEndpoint
            label="Destino"
            end={wire?.b ?? { x: 0, y: 0 }}
            part={snapshot.parts.find((p) => p.id === wire?.b.part)}
          />
        </div>
        <HintButton
          className="icon-btn panel-control"
          aria-label="Dejar de seguir la conexión"
          onClick={onClear}
          tabIndex={wire ? 0 : -1}
        >
          <X size={16} />
        </HintButton>
      </div>
      <div
        className="connection-guide-idle"
        aria-hidden={wire ? true : undefined}
      >
        {legend.length > 0 && (
          <div className="connection-legend">
            {legend.map((entry) => (
              <LegendItem
                key={entry.color}
                entry={entry}
                editable={!project.readOnly}
                onRecolor={(from, to) => project.recolorWires(from, to)}
                onRename={(label) =>
                  project.setMeta(
                    "wiring.legend",
                    renameLegendEntry(project.meta.get("wiring.legend"), entry.colors, label),
                  )
                }
              />
            ))}
          </div>
        )}
        <span className="connection-help">
          Los cruces de cables no crean una conexión.
        </span>
      </div>
    </aside>
  );
}

/** Entrada de la leyenda: un clic la renombra en el sitio (Enter guarda, Esc cancela, vacío = automático). */
function LegendItem({ entry, editable, onRename, onRecolor }: { entry: LegendEntry & { count?: number }; editable: boolean; onRename: (label: string) => void; onRecolor: (from: string, to: string) => void }) {
  const [editing, setEditing] = useState(false);
  // Cada muestra de color es un selector: cambiarla recolorea todos los cables de ese color.
  const tones = (
    <span className="connection-tones">
      {entry.colors.slice(0, 8).map((color) =>
        editable ? (
          <ColorSwatch key={color} color={color} label={entry.label} onPick={(next) => onRecolor(color, next)} />
        ) : (
          <i key={color} className="connection-swatch" style={{ background: color }} />
        ),
      )}
      {entry.colors.length > 8 && <small>+{entry.colors.length - 8}</small>}
    </span>
  );
  const shown = entry.label || "Sin nombre";
  const count = entry.count ? <small className="legend-count">×{entry.count}</small> : null;
  const title = `${entry.colors.join(", ")} · ${entry.count ?? 0} cables${entry.names?.length ? `
Redes: ${entry.names.slice(0, 12).join(", ")}${entry.names.length > 12 ? "…" : ""}` : ""}`;
  if (editing)
    return (
      <span className="legend-item is-editing">
        {tones}
        <input
          autoFocus
          className="legend-input"
          aria-label={`Nombre del color ${entry.color} en la leyenda`}
          defaultValue={entry.label}
          placeholder="Nombre de este color"
          maxLength={80}
          size={Math.max(14, entry.label.length + 1)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { e.currentTarget.value = entry.label; e.currentTarget.blur(); }
            e.stopPropagation();
          }}
          onBlur={(e) => {
            setEditing(false);
            const next = e.currentTarget.value.trim();
            if (next !== entry.label) onRename(next);
          }}
        />
      </span>
    );
  if (!editable)
    return (
      <span className="legend-item" title={title}>
        {tones}
        <span className={entry.label ? undefined : "legend-unnamed"}>{shown}</span>
        {count}
      </span>
    );
  return (
    <span className="legend-item is-editable-row">
      {tones}
      <button type="button" className={`legend-name ${entry.label ? "" : "legend-unnamed"}`} title={`${title}
Clic para ponerle nombre`} onClick={() => setEditing(true)}>
        {shown}
      </button>
      {count}
    </span>
  );
}

/** Muestra de color: abre la paleta de 12 colores de Tinkercad y recolorea sus cables al elegir. */
function ColorSwatch({ color, label, onPick }: { color: string; label: string; onPick: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const name = WIRE_COLORS.find((c) => c.value.toLowerCase() === color.toLowerCase())?.label ?? color;
  return (
    <span ref={box} className="swatch-anchor">
      <button type="button" className="connection-swatch is-picker" style={{ background: color }} aria-label={`Cambiar el color ${name} de «${label}»`} aria-expanded={open} title={`${name} · clic para cambiar el color de sus cables`} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
      {open && (
        <span className="swatch-palette" role="listbox" aria-label="Colores de cable">
          {WIRE_COLORS.map((c) => (
            <button key={c.value} type="button" role="option" aria-selected={c.value.toLowerCase() === color.toLowerCase()} title={c.label} style={{ background: c.value }} onClick={(e) => { e.stopPropagation(); setOpen(false); if (c.value.toLowerCase() !== color.toLowerCase()) onPick(c.value); }} />
          ))}
        </span>
      )}
    </span>
  );
}
