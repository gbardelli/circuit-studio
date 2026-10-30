import { Activity, ScanLine, X } from "lucide-react";
import { useEditor, useDisplaySnapshot, useSimStatus } from "./context";
import { useUi } from "./store";
import { PARTS } from "../parts";
export function ProbeReadout() {
  const { engine } = useEditor(),
    snapshot = useDisplaySnapshot(),
    status = useSimStatus(),
    key = useUi((s) => s.pinnedSignal);
  if (!key) return null;
  const split = key.lastIndexOf(":"),
    part = snapshot.parts.find((p) => p.id === key.slice(0, split)),
    pin = key.slice(split + 1);
  if (!part) return null;
  const v = engine.voltageAt(part.id, pin),
    logic = PARTS[part.type].logic;
  const supply = logic?.supply ? engine.voltageAt(part.id, logic.supply) : null,
    gnd = logic ? (engine.voltageAt(part.id, logic.ground) ?? 0) : 0;
  const low = logic?.fixedThresholds
    ? logic.low + gnd
    : supply !== null
      ? gnd + (supply - gnd) * 0.35
      : 1.5;
  const high = logic?.fixedThresholds
    ? logic.high + gnd
    : supply !== null
      ? gnd + (supply - gnd) * 0.55
      : 3;
  const state = !status.running
    ? "Sin simular"
    : v === null
      ? "Sin lectura"
      : v >= high
        ? "HIGH"
        : v <= low
          ? "LOW"
          : "Indeterminado";
  return (
    <div className="probe-readout">
      <span className="signal-dot" />
      <div>
        <strong>
          {String(
            part.props.label ||
              PARTS[part.type].partNumber ||
              PARTS[part.type].name,
          )}{" "}
          · {pin}
        </strong>
        <span>
          <b>{v === null ? "—" : `${v.toFixed(3)} V`}</b>
          <small className={state === "HIGH" ? "high" : ""}>{state}</small>
        </span>
      </div>
      <button
        className="icon-btn"
        aria-label="Analizar esta señal"
        title="Seguir las entradas"
        onClick={() => useUi.getState().setLabPanel("diagnostics")}
      >
        <ScanLine size={14} />
      </button>
      <button
        className="icon-btn"
        aria-label="Ver esta señal en el analizador"
        onClick={() => useUi.getState().setLabPanel("signals")}
      >
        <Activity size={14} />
      </button>
      <button
        className="icon-btn"
        aria-label="Quitar sonda fijada"
        onClick={() => useUi.getState().pinSignal(null)}
      >
        <X size={13} />
      </button>
    </div>
  );
}
