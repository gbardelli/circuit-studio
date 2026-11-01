import { Activity, ScanLine, X } from "lucide-react";
import { useEditor, useDisplaySnapshot, useSimStatus } from "./context";
import { useUi } from "./store";
import { PARTS } from "../parts";
import { HintButton } from "./Overlays";
import { TerminalLocation } from "./TerminalLocation";
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
    <section
      className="probe-readout"
      aria-label="Sonda fijada"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="probe-heading">
        <strong
          title={String(
            part.props.label ||
              PARTS[part.type].partNumber ||
              PARTS[part.type].name,
          )}
        >
          {String(
            part.props.label ||
              PARTS[part.type].partNumber ||
              PARTS[part.type].name,
          )}
        </strong>
        <HintButton
          className="icon-btn panel-control"
          aria-label="Quitar sonda fijada"
          onClick={() => useUi.getState().pinSignal(null)}
        >
          <X size={16} />
        </HintButton>
      </header>
      <div className="probe-measurement">
        <TerminalLocation
          pin={pin}
          breadboard={part.type.startsWith("breadboard")}
        />
        <div className="probe-voltage">
          <span>Tensión</span>
          <span
            className={`probe-state ${status.running && v !== null ? (state === "HIGH" ? "is-high" : state === "LOW" ? "is-low" : "is-uncertain") : ""}`}
          >
            {state}
          </span>
          <strong>
            {!status.running || v === null ? (
              "—"
            ) : (
              <>
                {v.toFixed(3)}
                <small>V</small>
              </>
            )}
          </strong>
        </div>
      </div>
      <footer>
        <HintButton
          className="btn probe-action"
          aria-label="Analizar esta señal"
          title="Seguir las entradas"
          onClick={() => useUi.getState().setLabPanel("diagnostics")}
        >
          <ScanLine size={16} />
          Diagnóstico
        </HintButton>
        <HintButton
          className="btn probe-action"
          aria-label="Ver esta señal en el analizador"
          onClick={() => useUi.getState().setLabPanel("signals")}
        >
          <Activity size={16} />
          Señales
        </HintButton>
      </footer>
    </section>
  );
}
