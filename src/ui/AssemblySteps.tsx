import { useState, type ReactNode } from "react";
import { HintButton, PopoverPanel } from "./Overlays";
import { Check, CheckCheck, ListOrdered, RotateCcw } from "lucide-react";
import { ConnectionEndpoint } from "./ConnectionEndpoint";
import { ASSEMBLY_PHASES } from "./assembly-plan";
import { StepCard } from "./AssemblyStepCard";
import { useAssemblyGuide } from "./useAssemblyGuide";
import { useUi } from "./store";

export function AssemblySteps() {
  const {
    project,
    snapshot,
    plan,
    frame,
    cursor,
    completed,
    firstPending,
    isDone,
    navigate,
    confirm,
    unconfirm,
  } = useAssemblyGuide();
  const [indexOpen, setIndexOpen] = useState(false);
  const step = frame.current,
    byId = new Map(snapshot.parts.map((p) => [p.id, p]));
  const phase = step && ASSEMBLY_PHASES.find((p) => p.id === step.phase);
  const progress = plan.steps.length ? completed / plan.steps.length : 0;
  if (!plan.steps.length)
    return (
      <div className="assembly-guide assembly-welcome">
        <h2>Primero crea tu circuito</h2>
        <p>
          La guía se genera a partir de sus piezas y sus conexiones físicas.
        </p>
        <HintButton
          className="btn"
          onClick={() => useUi.getState().setLabPanel(null)}
        >
          Volver al lienzo
        </HintButton>
      </div>
    );
  const stepIndex = (className: string, label: ReactNode) => (
    <PopoverPanel
      label="Pasos del montaje"
      className="ui-step-index"
      open={indexOpen}
      onOpenChange={setIndexOpen}
      trigger={<button className={className}>{label}</button>}
    >
      <div className="ui-menu-heading">
        Pasos del montaje<span>{plan.steps.length} pasos</span>
      </div>
      <div className="ui-step-list">
        {ASSEMBLY_PHASES.map((p) => (
          <div key={p.id}>
            <strong>{p.label}</strong>
            {plan.steps
              .filter((s) => s.phase === p.id)
              .map((s) => (
                <div className="assembly-index-row" key={s.key}>
                  <button
                    aria-label={s.title}
                    aria-current={s.key === cursor ? "step" : undefined}
                    className={s.key === cursor ? "current" : ""}
                    onClick={() => {
                      navigate(plan.steps.indexOf(s));
                      setIndexOpen(false);
                    }}
                  >
                    {isDone(s) ? (
                      <Check size={13} />
                    ) : (
                      <span
                        className="assembly-step-number"
                        aria-hidden="true"
                      >
                        {plan.steps.indexOf(s) + 1}
                      </span>
                    )}
                    {s.kind === "wire" ? (
                      <span className="assembly-index-endpoints">
                        <ConnectionEndpoint
                          label="Origen"
                          end={s.wire.a}
                          part={byId.get(s.wire.a.part ?? "")}
                        />
                        <ConnectionEndpoint
                          label="Destino"
                          end={s.wire.b}
                          part={byId.get(s.wire.b.part ?? "")}
                        />
                      </span>
                    ) : (
                      <span>{s.title}</span>
                    )}
                  </button>
                  {isDone(s) && (
                    <HintButton
                      className="assembly-index-unmark"
                      aria-label={`Desmarcar ${s.title}`}
                      onClick={() => unconfirm(s)}
                    >
                      Desmarcar
                    </HintButton>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    </PopoverPanel>
  );
  if (step && cursor !== null)
    return (
      <StepCard
        key={step.key}
        step={step}
        index={frame.index}
        total={plan.steps.length}
        completed={completed}
        phase={phase?.label}
        done={isDone(step)}
        readOnly={project.readOnly}
        byId={byId}
        menu={stepIndex("step-icon-btn step-index", <><ListOrdered size={15} /> Pasos</>)}
        onPrevious={() => navigate(frame.index - 1)}
        onNext={() => navigate(frame.index + 1)}
        onConfirm={confirm}
        onUnconfirm={() => unconfirm(step)}
      />
    );
  return (
    <div className="assembly-guide">
      <div className="assembly-guide-progress">
        <progress
          value={completed}
          max={plan.steps.length}
          aria-label={
            project.readOnly ? "Pasos vistos" : "Pasos confirmados"
          }
        />
        <span>
          {completed} de {plan.steps.length} pasos{" "}
          {project.readOnly ? "vistos" : "completados"}
        </span>
        {stepIndex("assembly-index-trigger", "Ver pasos")}
      </div>
      {cursor === null ? (
        <div className="assembly-welcome">
          <div>
            <h2>Montaje paso a paso</h2>
            <p>
              {plan.parts} piezas y {plan.wires} cables, uno a uno. En cada paso
              verás qué colocar, dónde va y cómo orientarlo.
            </p>
            <small>
              {project.readOnly
                ? "Puedes recorrer la guía sin modificar el proyecto."
                : "Confirma cada paso después de realizarlo en tu montaje físico."}
            </small>
          </div>
          <div className="assembly-welcome-actions">
            <HintButton
              className="btn primary"
              onClick={() =>
                navigate(completed > 0 && firstPending >= 0 ? firstPending : 0)
              }
            >
              {completed > 0 && firstPending >= 0
                ? "Continuar montaje"
                : "Empezar montaje"}
            </HintButton>
            {completed > 0 && (
              <HintButton className="btn ghost" onClick={() => navigate(0)}>
                Ver desde el principio
              </HintButton>
            )}
          </div>
        </div>
      ) : (
        <div className="assembly-welcome">
          <div>
            <CheckCheck size={25} />
            <h2>
              {progress === 1 && !project.readOnly
                ? "Montaje completado."
                : "Llegaste al final de la guía."}
            </h2>
            <p>
              {completed} de {plan.steps.length} pasos{" "}
              {project.readOnly ? "vistos" : "confirmados"}. Puedes revisar
              cualquier pieza o volver al circuito.
            </p>
          </div>
          <div className="assembly-welcome-actions">
            <HintButton
              className="btn primary"
              onClick={() => useUi.getState().setLabPanel(null)}
            >
              Volver al circuito
            </HintButton>
            {firstPending >= 0 && (
              <HintButton
                className="btn ghost"
                onClick={() => navigate(firstPending)}
              >
                Primer paso pendiente
              </HintButton>
            )}
            <HintButton className="btn ghost" onClick={() => navigate(0)}>
              <RotateCcw size={14} />
              Revisar desde el inicio
            </HintButton>
          </div>
        </div>
      )}
    </div>
  );
}
