import { useMemo } from "react";
import { useEditor, useSimStatus } from "./context";
import { useUi } from "./store";
import { pinKey, type Netlist } from "../core/netlist";
import type { CircuitSnapshot, Vec } from "../core/types";
import { PARTS } from "../parts";
import { wirePoints, partBounds } from "./geometry";
import { roundedPath } from "./wires";
import { electricalChecks } from "../sim/diagnostics";
import { circuitNotes } from "./Notes";
export function CircuitOverlays({
  snapshot,
  netlist,
  schematicPins,
}: {
  snapshot: CircuitSnapshot;
  netlist: Netlist;
  schematicPins?: Map<string, Vec>;
}) {
  const { engine, project } = useEditor(),
    status = useSimStatus();
  const pinned = useUi((s) => s.pinnedSignal),
    overlay = useUi((s) => s.signalOverlay),
    assembly = useUi((s) => s.assemblyWire),
    setPanel = useUi((s) => s.setLabPanel),
    select = useUi((s) => s.select);
  const panel = useUi((s) => s.labPanel),
    checksActive = status.running || panel === "diagnostics";
  const parts = useMemo(
    () => new Map(snapshot.parts.map((p) => [p.id, p])),
    [snapshot],
  );
  const readings = engine.readings();
  const findings = useMemo(
    () =>
      checksActive
        ? electricalChecks(snapshot, readings, engine.pinCurrents(),engine.pinModes())
        : [],
    [
      snapshot,
      Math.floor(status.simTime * 4),
      engine.lab.seeking,
      checksActive,
    ],
  );
  const pinnedNet = pinned ? netlist.netOf.get(pinned) : undefined;
  const pins = schematicPins ?? netlist.pinWorld;
  const wire = snapshot.wires.find((w) => w.id === assembly);
  const notes = circuitNotes(project.meta.entries()).filter(
    (n) => !n.parent && !n.resolved,
  );
  return (
    <g className="circuit-overlays">
      {!schematicPins &&
        snapshot.wires.map((w) => {
          const key = w.a.part && w.a.pin ? pinKey(w.a.part, w.a.pin) : null,
            net = key ? netlist.netOf.get(key) : undefined;
          const highlighted = pinnedNet !== undefined && net === pinnedNet;
          if (!highlighted && (!overlay || !status.running)) return null;
      const v = w.a.part&&w.a.pin ? engine.voltageAt(w.a.part,w.a.pin)??undefined : undefined,
            color = highlighted
              ? "#b5edff"
              : v === undefined
                ? "#747b86"
                : v > 3
                  ? "#70dfb0"
                  : v < 1.5
                    ? "#626c78"
                    : "#e5bf7a";
          return (
            <path
              key={w.id}
              d={roundedPath(wirePoints(w, parts))}
              className="signal-wire"
              stroke={color}
              strokeWidth={highlighted ? 5 : 3.2}
              strokeOpacity={highlighted ? 0.9 : 0.7}
              fill="none"
              pointerEvents="none"
            />
          );
        })}
      {pinnedNet !== undefined &&
        [...pins]
          .filter(([key]) => netlist.netOf.get(key) === pinnedNet)
          .slice(0, 300)
          .map(([key, p]) => (
            <circle
              key={key}
              cx={p.x}
              cy={p.y}
              r={3.8}
              fill="#b5edff"
              fillOpacity={0.3}
              stroke="#b5edff"
              strokeWidth={0.8}
              pointerEvents="none"
            />
          ))}
      {wire &&
        [wire.a, wire.b].map((end, i) => {
          const p =
            end.part && end.pin ? pins.get(pinKey(end.part, end.pin)) : null;
          return p ? (
            <g key={i} pointerEvents="none">
              <circle
                cx={p.x}
                cy={p.y}
                r={8}
                fill="#70dfb0"
                fillOpacity={0.2}
                stroke="#70dfb0"
                strokeWidth={1.5}
              />
              <text x={p.x + 10} y={p.y - 9} fontSize={9} fill="#b8f5db">
                {i ? "HASTA" : "DESDE"} · {end.pin}
              </text>
            </g>
          ) : null;
        })}
      {snapshot.parts
        .filter((p) => PARTS[p.type].category !== "Protoboards")
        .map((part) => {
          const issues = findings.filter((f) => f.part === part.id),
            comments = notes.filter((n) => n.part === part.id);
          if (!issues.length && !comments.length) return null;
          const b = partBounds(part),
            pos = schematicPins
              ? [...schematicPins.entries()].find(([key]) =>
                  key.startsWith(`${part.id}:`),
                )?.[1]
              : { x: b.x + b.w, y: b.y };
          if (!pos) return null;
          return (
            <g
              key={part.id}
              transform={`translate(${pos.x + 5} ${pos.y - 10})`}
              data-interactive="true"
              className="component-indicator"
              role="button"
              tabIndex={0}
              aria-label={`${PARTS[part.type].name}: ${issues.length} avisos, ${comments.length} comentarios`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                select([part.id]);
                setPanel(issues.length ? "diagnostics" : "notes");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  select([part.id]);
                  setPanel(issues.length ? "diagnostics" : "notes");
                }
              }}
            >
              <circle
                r={7}
                fill={issues.length ? "#30271a" : "#182b25"}
                stroke={issues.length ? "#e5bf7a" : "#70dfb0"}
                strokeWidth={0.8}
              />
              <text
                textAnchor="middle"
                y={3}
                fontSize={9}
                fontWeight={600}
                fill={issues.length ? "#e5bf7a" : "#70dfb0"}
              >
                {issues.length ? "!" : comments.length}
              </text>
            </g>
          );
        })}
    </g>
  );
}
