import { HintButton, PopoverPanel } from './Overlays';
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEditor, useLab, useSnapshot } from "./context";
import { useUi } from "./store";
import { PARTS } from "../parts";
import { pinKey } from "../core/netlist";
import { pinLabel } from "../sim/diagnostics";
import type { Edge } from "../sim/session";
import { download, vcd } from "./lab-utils";
const COLORS = [
  "#70dfb0",
  "#83b8ff",
  "#e5bf7a",
  "#c0a0ed",
  "#f49793",
  "#83d4e8",
  "#eaa0ce",
  "#b8cc7e",
];
export function wavePath(
  edges: Edge[],
  start: number,
  end: number,
  width = 800,
) {
  if (end <= start || !edges.length) return "";
  if (end < edges[0].t) return "";
  let level = edges[0].v > 2.5 ? 1 : 0;
  for (const e of edges) if (e.t <= start) level = e.v > 2.5 ? 1 : 0;
  let path = `M${Math.max(0, ((edges[0].t - start) / (end - start)) * width)} ${level ? 6 : 26}`;
  for (const e of edges) {
    if (e.t <= start || e.t > end) continue;
    const x = ((e.t - start) / (end - start)) * width;
    path += `H${x}V${e.v > 2.5 ? 6 : 26}`;
  }
  return path + `H${width}`;
}
export function Signals() {
  const { engine } = useEditor(),
    snapshot = useSnapshot(),
    lab = useLab();
  const [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false),
    [span, setSpan] = useState(5),
    [offset, setOffset] = useState<number | null>(null);
  const pinned = useUi((s) => s.pinnedSignal),
    pinSignal = useUi((s) => s.pinSignal);
  const options = useMemo(
    () =>
      snapshot.parts
        .filter((p) => PARTS[p.type].category !== "Protoboards")
        .flatMap((p) =>
          PARTS[p.type].pins(p.props).map((pin) => ({
            key: pinKey(p.id, pin.id),
            name: pinLabel(p, pin.id),
            output:
              PARTS[p.type].logic?.outputs.includes(pin.id) || pin.id === "OUT",
          })),
        )
        .sort((a, b) => Number(b.output) - Number(a.output)),
    [snapshot],
  );
  const add = (key: string, name?: string) => {
    if (lab.probes.some((p) => p.key === key) || lab.probes.length >= 12)
      return;
    engine.watch([
      ...lab.probes,
      {
        key,
        name: name ?? options.find((p) => p.key === key)?.name ?? key,
        color: COLORS[lab.probes.length % COLORS.length],
      },
    ]);
  };
  const suggested = [
    ...options.filter((o) => o.key.endsWith(":OUT")),
    ...options.filter((o) => o.output && !o.key.endsWith(":OUT")),
  ].slice(0, 6);
  useEffect(() => {
    if (pinned && !lab.probes.some((p) => p.key === pinned)) add(pinned);
  }, [pinned]);
  const end =
      offset === null
        ? Math.max(span, lab.paused ? lab.cursor : lab.duration)
        : offset + span,
    start = Math.max(0, end - span);
  const edges = lab.probes
    .flatMap((p) => lab.traces[p.key] ?? [])
    .map((e) => e.t)
    .sort((a, b) => a - b);
  const seekEdge = (direction: number) => {
    const t =
      direction < 0
        ? [...edges].reverse().find((t) => t < lab.cursor - 1e-8)
        : edges.find((t) => t > lab.cursor + 1e-8);
    if (t !== undefined) {
      engine.seek(t);
      if (t < start || t > end) setOffset(Math.max(0, t - span / 2));
    }
  };
  return (
    <div className="signals-panel">
      <div className="lab-controls">
        <HintButton
          className="btn sm transport-control"
          disabled={!engine.running || lab.seeking}
          onClick={() => engine.pause(!lab.paused)}
        >
          {lab.paused ? <Play size={13} /> : <Pause size={13} />}{" "}
          {lab.seeking
            ? "Reconstruyendo…"
            : lab.paused
              ? "Reanudar desde aquí"
              : "Pausar"}
        </HintButton>
        <HintButton
          className="icon-btn"
          aria-label="Flanco anterior"
          disabled={!engine.running || !edges.length}
          onClick={() => seekEdge(-1)}
        >
          <SkipBack size={14} />
        </HintButton>
        <HintButton
          className="icon-btn"
          aria-label="Flanco siguiente"
          disabled={!engine.running || !edges.length}
          onClick={() => seekEdge(1)}
        >
          <SkipForward size={14} />
        </HintButton>
        <span className="lab-time">
          {lab.cursor.toFixed(4)} s <span>/ {lab.duration.toFixed(2)} s</span>
        </span>
        {lab.seeking ? (
          <span className="lab-caption" role="status">
            Reconstruyendo estado…
          </span>
        ) : lab.paused && lab.cursor < lab.duration ? (
          <span className="lab-caption">
            Al reanudar se crea una nueva trayectoria.
          </span>
        ) : null}
        <span className="grow" />
        <HintButton
          className="icon-btn"
          aria-label="Ampliar tiempo"
          onClick={() => setSpan((s) => Math.max(0.001, s / 2))}
        >
          <ZoomIn size={14} />
        </HintButton>
        <HintButton
          className="icon-btn"
          aria-label="Reducir tiempo"
          onClick={() => setSpan((s) => Math.min(600, s * 2))}
        >
          <ZoomOut size={14} />
        </HintButton>
        <HintButton
          className={`btn ghost sm ${offset === null ? "is-on" : ""}`}
          onClick={() => setOffset(null)}
        >
          Seguir
        </HintButton>
        <HintButton
          className="btn ghost sm"
          disabled={!lab.probes.length}
          onClick={() => download("circuit-studio.vcd", vcd(lab))}
        >
          <Download size={13} /> VCD
        </HintButton>
        <PopoverPanel label="Añadir señal" className="ui-signal-picker" open={adding} onOpenChange={setAdding} trigger={<button className="btn sm"><Plus size={13}/>Señal</button>}>
        <div className="signal-picker">
          <input
            autoFocus
            placeholder="Buscar componente o pin…"
            aria-label="Buscar señal"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div>
            {!options.some(o=>o.name.toLowerCase().includes(search.toLowerCase())&&!lab.probes.some(p=>p.key===o.key))&&<p className="ui-signal-empty">No hay señales disponibles para esta búsqueda.</p>}
            {options
              .filter(
                (o) =>
                  o.name.toLowerCase().includes(search.toLowerCase()) &&
                  !lab.probes.some((p) => p.key === o.key),
              )
              .slice(0, 30)
              .map((o) => (
                <HintButton
                  key={o.key}
                  onClick={() => {
                    add(o.key, o.name);
                    setAdding(false);
                    setSearch("");
                  }}
                >
                  {o.name}
                  <Plus size={12} />
                </HintButton>
              ))}
          </div>
        </div>
        </PopoverPanel>
      </div>
      <div className="wave-scroll">
        <div className="wave-ruler">
          <span>
            Canal <small>{lab.probes.length}/12</small>
          </span>
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i}>
                {(start + (span * i) / 4).toFixed(span < 0.1 ? 4 : 2)} s
              </span>
            ))}
          </div>
        </div>
        {!lab.probes.length ? (
          <div className="lab-empty">
            <strong>Observa lo que cambia.</strong>
            <p>
              Añade una señal o fija una red desde el lienzo. Selecciona un
              flanco para inspeccionar el circuito en ese instante.
            </p>
            <HintButton className="btn sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> Añadir primera señal
            </HintButton>
            {suggested.length > 0 && (
              <HintButton
                className="btn ghost sm"
                onClick={() =>
                  engine.watch(
                    suggested.map((o, i) => ({
                      key: o.key,
                      name: o.name,
                      color: COLORS[i % COLORS.length],
                    })),
                  )
                }
              >
                Usar salidas del montaje
              </HintButton>
            )}
          </div>
        ) : (
          lab.probes.map((probe) => (
            <div
              className={`wave-row ${pinned === probe.key ? "selected" : ""}`}
              key={probe.key}
            >
              <div className="wave-name">
                <span
                  className="signal-dot"
                  style={{ background: probe.color }}
                />
                <input
                  aria-label={`Nombre de ${probe.name}`}
                  value={probe.name}
                  onFocus={() => pinSignal(probe.key)}
                  onChange={(e) =>
                    engine.watch(
                      lab.probes.map((p) =>
                        p.key === probe.key
                          ? { ...p, name: e.target.value }
                          : p,
                      ),
                    )
                  }
                />
                <HintButton
                  className="icon-btn"
                  aria-label={`Quitar ${probe.name}`}
                  onClick={() =>
                    engine.watch(lab.probes.filter((p) => p.key !== probe.key))
                  }
                >
                  <X size={11} />
                </HintButton>
              </div>
              <svg
                viewBox="0 0 800 32"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Forma de onda de ${probe.name}`}
                onClick={(e) => {
                  if (!engine.running) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const at = start + ((e.clientX - r.left) / r.width) * span;
                  const edge = (lab.traces[probe.key] ?? [])
                    .filter((edge) => edge.t >= start && edge.t <= end)
                    .reduce<Edge | null>(
                      (best, edge) =>
                        !best || Math.abs(edge.t - at) < Math.abs(best.t - at)
                          ? edge
                          : best,
                      null,
                    );
                  engine.seek(
                    edge && (Math.abs(edge.t - at) / span) * r.width < 8
                      ? edge.t
                      : at,
                  );
                  pinSignal(probe.key);
                }}
              >
                {[0, 200, 400, 600, 800].map((x) => (
                  <path key={x} d={`M${x} 0V32`} className="wave-grid" />
                ))}
                <path
                  d={wavePath(lab.traces[probe.key] ?? [], start, end)}
                  fill="none"
                  stroke={probe.color}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {lab.cursor >= start && lab.cursor <= end && (
                  <path
                    d={`M${((lab.cursor - start) / span) * 800} 0V32`}
                    stroke="white"
                    strokeOpacity={0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
            </div>
          ))
        )}
      </div>
      <div className="timeline-scrub">
        <label htmlFor="time-cursor">Instante</label>
        <input
          id="time-cursor"
          type="range"
          min={0}
          max={Math.max(0.001, lab.duration)}
          step="any"
          style={
            {
              "--fill": `${lab.duration ? (lab.cursor / lab.duration) * 100 : 0}%`,
              "--accent": "var(--lab-mint)",
            } as React.CSSProperties
          }
          value={lab.cursor}
          disabled={!engine.running || !lab.duration}
          onChange={(e) => engine.seek(Number(e.target.value))}
        />
        <span>
          {span < 1 ? `${(span * 1000).toFixed(1)} ms` : `${span.toFixed(1)} s`}{" "}
          visibles
        </span>
      </div>
      {lab.error && (
        <div className="lab-error" role="alert">
          {lab.error}
        </div>
      )}
    </div>
  );
}
