import { HintButton } from './Overlays';
import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Crosshair,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEditor, useSimStatus, useSnapshot } from "./context";
import {
  electricalChecks,
  explainSignal,
  diagnosticQuery,
  type Evidence,
} from "../sim/diagnostics";
import { useUi } from "./store";
import { PARTS } from "../parts";
import { pinKey } from "../core/netlist";
function EvidenceNode({ node }: { node: Evidence }) {
  const pin = useUi((s) => s.pinSignal);
  return (
    <li>
      <HintButton onClick={() => pin(node.key)}>
        <span>{node.label}</span>
        <strong className={node.state === "HIGH" ? "state-high" : ""}>
          {node.voltage === null ? "—" : `${node.voltage.toFixed(2)} V`}{" "}
          <small>{node.state}</small>
        </strong>
      </HintButton>
      <p>{node.explanation}</p>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <EvidenceNode key={child.key} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
export function Diagnostics() {
  const { engine } = useEditor(),
    snapshot = useSnapshot(),
    status = useSimStatus();
  const pinned = useUi((s) => s.pinnedSignal),
    selection = useUi((s) => s.selection),
    pinSignal = useUi((s) => s.pinSignal),
    select = useUi((s) => s.select);
  const [query, setQuery] = useState("");
  const normalized = diagnosticQuery(query);
  const findings = useMemo(
    () => electricalChecks(snapshot, engine.readings(), engine.pinCurrents(),engine.pinModes()),
    [snapshot, status],
  );
  const candidates = snapshot.parts
    .filter((p) => PARTS[p.type].category !== "Protoboards")
    .flatMap((p) =>
      PARTS[p.type].pins(p.props).map((pin) => ({
        key: pinKey(p.id, pin.id),
        label: `${p.props.label || PARTS[p.type].partNumber || PARTS[p.type].name} · ${pin.id}`,
        part: p.id,
      })),
    )
    .filter(
      (o) => !normalized || diagnosticQuery(o.label).includes(normalized),
    );
  const selected = snapshot.parts.find((p) => selection.includes(p.id)),
    preferred = selected
      ? (PARTS[selected.type].logic?.outputs[0] ??
        (selected.type === "led"
          ? "A"
          : PARTS[selected.type].mcu
            ? "D13"
            : null))
      : null;
  const signal =
    pinned ??
    (selected && preferred
      ? pinKey(selected.id, preferred)
      : candidates.find((c) => selection.includes(c.part))?.key);
  const evidence = signal
    ? explainSignal(
        snapshot,
        engine.readings(),
        signal,
        0,
        new Set(),
        undefined,
        engine.pinModes(),
      )
    : null;
  return (
    <div className="diagnostics-layout">
      <section className="checks-list">
        <div className="lab-section-head">
          <ShieldCheck size={15} />
          <strong>Comprobación eléctrica</strong>
          <span>{findings.length} avisos</span>
        </div>
        {!findings.length ? (
          <div className="lab-empty">
            <Check size={21} />
            <strong>Sin avisos en las comprobaciones disponibles.</strong>
            <p>
              {status.running
                ? "Se revisan conexiones, umbrales, alimentación y corrientes medidas."
                : "Simula para incluir tensiones y corrientes en la revisión."}
            </p>
          </div>
        ) : (
          findings.map((f) => (
            <HintButton
              className={`finding ${f.severity}`}
              key={f.id}
              onClick={() => {
                select([f.part]);
                if (f.pin) pinSignal(pinKey(f.part, f.pin));
              }}
            >
              <TriangleAlert size={15} />
              <span>
                <strong>{f.title}</strong>
                <small>{f.detail}</small>
              </span>
              <Crosshair size={13} />
            </HintButton>
          ))
        )}
      </section>
      <section className="signal-explanation">
        <div className="lab-section-head">
          <Search size={15} />
          <strong>Seguir una señal</strong>
          <span>Valores y conexiones</span>
        </div>
        <div className="diagnostic-search">
          <input
            aria-label="Buscar una señal para explicar"
            placeholder="Por qué no se activa… busca LS, Q0, OUT…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <div className="diagnostic-results">
              {candidates.slice(0, 12).map((c) => (
                <HintButton
                  key={c.key}
                  onClick={() => {
                    pinSignal(c.key);
                    setQuery("");
                  }}
                >
                  {c.label}
                  <ChevronRight size={13} />
                </HintButton>
              ))}
            </div>
          )}
        </div>
        {evidence ? (
          <ul className="evidence-tree">
            <EvidenceNode node={evidence} />
          </ul>
        ) : (
          <div className="lab-empty">
            <strong>De la salida a sus entradas.</strong>
            <p>
              Selecciona una pieza o fija una red para recorrer las conexiones
              con sus valores medidos. Los estados secuenciales requieren
              revisar también su historia.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
