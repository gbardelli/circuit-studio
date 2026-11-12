import { HintButton } from "./Overlays";
import { useMemo, useState } from "react";
import { Check, ChevronRight, Crosshair, Search, TriangleAlert } from "lucide-react";
import { useEditor, useSimStatus, useSnapshot } from "./context";
import {
  electricalChecks,
  explainSignal,
  diagnosticQuery,
  pinLabel,
  type Evidence,
} from "../sim/diagnostics";
import { useUi } from "./store";
import { PARTS } from "../parts";
import { pinKey } from "../core/netlist";
import { ElectricalMeasurements } from "./ElectricalMeasurements";

function stateName(state: string) {
  if (state === "HIGH") return "Alto";
  if (state === "LOW") return "Bajo";
  return state;
}

function EvidenceNode({ node, depth = 0 }: { node: Evidence; depth?: number }) {
  const pin = useUi((s) => s.pinSignal);
  const volts = node.voltage === null ? "Sin lectura" : `${node.voltage.toFixed(2)} V`;
  return (
    <li className="diag-node">
      <button type="button" className="diag-node-main" onClick={() => pin(node.key)}>
        <span className={`diag-mark is-${node.state.toLowerCase().replace(/\s+/g, "-")}`} />
        <span className="diag-node-copy">
          <strong>{node.label}</strong>
          <span>{node.explanation}</span>
        </span>
        <span className="diag-node-read">
          <b>{volts}</b>
          <small>{stateName(node.state)}</small>
        </span>
      </button>
      {node.children.length > 0 && (
        <details className="diag-origin" open={depth < 1}>
          <summary>
            {node.children.length} {node.children.length === 1 ? "origen" : "orígenes"}
          </summary>
          <ul>
            {node.children.map((child) => (
              <EvidenceNode key={child.key} node={child} depth={depth + 1} />
            ))}
          </ul>
        </details>
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
    () => electricalChecks(snapshot, engine.readings(), engine.pinCurrents(), engine.pinModes()),
    [snapshot, status, engine],
  );
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const candidates = snapshot.parts
    .filter((p) => PARTS[p.type].category !== "Protoboards")
    .flatMap((p) =>
      PARTS[p.type].pins(p.props).map((pin) => ({
        key: pinKey(p.id, pin.id),
        label: pinLabel(p, pin.id),
        part: p.id,
      })),
    )
    .filter((o) => !normalized || diagnosticQuery(o.label).includes(normalized));
  const selected = snapshot.parts.find((p) => selection.includes(p.id)),
    preferred = selected
      ? (PARTS[selected.type].logic?.outputs[0] ??
        (selected.type === "led" ? "A" : PARTS[selected.type].mcu ? "D13" : null))
      : null;
  const signal =
    pinned ??
    (selected && preferred
      ? pinKey(selected.id, preferred)
      : candidates.find((c) => selection.includes(c.part))?.key);
  const evidence = signal
    ? explainSignal(snapshot, engine.readings(), signal, 0, new Set(), undefined, engine.pinModes())
    : null;

  return (
    <div className="diagnostics-frame">
      <div className="diagnostics-layout">
        <section className="diag-col" aria-label="Comprobación eléctrica">
          <header className="diag-head">
            <div>
              <h2>Estado</h2>
              <span>{status.running ? "En vivo" : "Simulación detenida"}</span>
            </div>
            <div className="diag-stats">
              <span className={errors ? "is-bad" : "is-ok"}><strong>{errors}</strong> errores</span>
              <span className={warnings ? "is-warn" : ""}><strong>{warnings}</strong> avisos</span>
            </div>
          </header>
          {!findings.length ? (
            <div className="lab-empty diag-empty">
              <Check size={18} />
              <strong>Sin avisos</strong>
              <p>{status.running ? "Conexiones, niveles y corriente dentro de lo esperado." : "Simula para incluir tensión y corriente."}</p>
            </div>
          ) : (
            <div className="diag-findings">
              {findings.map((f) => (
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
              ))}
            </div>
          )}
        </section>

        <section className="diag-col diag-signal" aria-label="Seguir una señal">
          <header className="diag-head">
            <div>
              <h2>Señal</h2>
              <span>{evidence ? evidence.label : "Ninguna fijada"}</span>
            </div>
          </header>
          <div className="diag-search">
            <Search size={14} />
            <input
              aria-label="Buscar una señal para explicar"
              placeholder="Buscar pin"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query && (
            <div className="diag-results">
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
              {!candidates.length && <p>Ningún pin coincide.</p>}
            </div>
          )}
          {evidence ? (
            <>
              <div className="diag-hero">
                <div>
                  <span>{stateName(evidence.state)}</span>
                  <strong>{evidence.voltage === null ? "Sin lectura" : `${evidence.voltage.toFixed(2)} V`}</strong>
                </div>
                <p>{evidence.explanation}</p>
              </div>
              {evidence.children.length > 0 && (
                <ul className="diag-chain">
                  {evidence.children.map((child) => (
                    <EvidenceNode key={child.key} node={child} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="lab-empty diag-empty">
              <strong>Elige una señal</strong>
              <p>Busca un pin o selecciónalo en el lienzo.</p>
            </div>
          )}
        </section>

        <ElectricalMeasurements />
      </div>
    </div>
  );
}
