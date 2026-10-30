import {
  Activity,
  Command,
  Hammer,
  MessageSquare,
  ScanLine,
  X,
} from "lucide-react";
import { useUi } from "./store";
import { useSimStatus } from "./context";
import { Signals } from "./Signals";
import { Diagnostics } from "./Diagnostics";
import { Assembly } from "./Assembly";
import { Notes } from "./Notes";
import { CommandPalette } from "./CommandPalette";
const TABS = [
  { id: "signals", name: "Señales", icon: Activity },
  { id: "diagnostics", name: "Diagnóstico", icon: ScanLine },
  { id: "assembly", name: "Montaje", icon: Hammer },
  { id: "notes", name: "Comentarios", icon: MessageSquare },
] as const;
export function WorkbenchRail() {
  const panel = useUi((s) => s.labPanel),
    set = useUi((s) => s.setLabPanel),
    status = useSimStatus();
  return (
    <div className="workbench-rail">
      <div className="workbench-label">
        <span className={`workbench-led ${status.running ? "live" : ""}`} />
        <strong>Workbench</strong>
        <span>
          {status.running ? "Simulación activa" : "Diseña · conecta · verifica"}
        </span>
      </div>
      <div
        className="workbench-tools"
        role="toolbar"
        aria-label="Herramientas de laboratorio"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className={panel === t.id ? "active" : ""}
            aria-pressed={panel === t.id}
            onClick={() => set(panel === t.id ? null : t.id)}
          >
            <t.icon size={14} />
            <span>{t.name}</span>
          </button>
        ))}
        <button
          className="command-trigger"
          onClick={() => useUi.getState().setCommandOpen(true)}
          aria-label="Abrir comandos"
        >
          <Command size={14} />
          <kbd> K</kbd>
        </button>
      </div>
    </div>
  );
}
export function WorkbenchPanel() {
  const panel = useUi((s) => s.labPanel),
    set = useUi((s) => s.setLabPanel);
  return (
    <>
      <CommandPalette />
      {panel && (
        <section
          className="workbench-panel"
          aria-label={`Panel de ${TABS.find((t) => t.id === panel)?.name}`}
        >
          <div className="workbench-heading">
            <span className="signal-dot" />
            <strong>{TABS.find((t) => t.id === panel)?.name}</strong>
            <span>
              {panel === "signals"
                ? "Captura y navegación temporal"
                : panel === "diagnostics"
                  ? "Evidencia sobre el circuito"
                  : panel === "assembly"
                    ? "Del diseño al laboratorio"
                    : "Revisión compartida"}
            </span>
            <button
              className="icon-btn"
              onClick={() => set(null)}
              aria-label="Cerrar laboratorio"
            >
              <X size={15} />
            </button>
          </div>
          {panel === "signals" ? (
            <Signals />
          ) : panel === "diagnostics" ? (
            <Diagnostics />
          ) : panel === "assembly" ? (
            <Assembly />
          ) : (
            <Notes />
          )}
        </section>
      )}
    </>
  );
}
