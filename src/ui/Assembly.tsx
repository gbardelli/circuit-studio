import { HintButton, PopoverPanel } from "./Overlays";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  FileDown,
  ImagePlus,
  MoreHorizontal,
  X,
  RotateCcw,
  ChevronDown,
  ListChecks,
  Undo2,
} from "lucide-react";
import { useEditor, useSnapshot } from "./context";
import { useUi } from "./store";
import { materials } from "./lab-utils";
import { AssemblySteps } from "./AssemblySteps";
import { Materials } from "./Materials";
import { useAssemblyGuide } from "./useAssemblyGuide";
import { WorkbenchToolbar } from "./WorkbenchToolbar";
export function Assembly() {
  const { project, engine } = useEditor(),
    snapshot = useSnapshot();
  const tab = useUi((s) => s.assemblyTab),
    setTab = useUi((s) => s.setAssemblyTab);
  const [photo, setPhoto] = useState<string | null>(null),
    [marks, setMarks] = useState<{ x: number; y: number }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const guide = useAssemblyGuide();
  const [progressOpen, setProgressOpen] = useState(false),
    [resetConfirm, setResetConfirm] = useState(false);
  const [undoReset, setUndoReset] = useState<(() => void) | null>(null);
  const resetCancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (resetConfirm) {
      const id = requestAnimationFrame(() => resetCancel.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [resetConfirm]);
  const file = useRef<HTMLInputElement>(null);
  const rows = materials(snapshot);
  const [exporting, setExporting] = useState(false),
    [pdfError, setPdfError] = useState("");
  const exportLock = useRef(false);
  useEffect(() => {
    useUi.getState().setAssemblyWire(null);
    const resume = useUi.getState().simRunning && !engine.lab.paused;
    if (resume) engine.pause(true);
    return () => {
      if (resume && useUi.getState().simRunning && engine.lab.paused)
        engine.pause(false);
    };
  }, [engine]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  const exportPdf = async (
    scope: "materials" | "guide",
    purchased?: Record<string, number>,
    includePrices = true,
  ) => {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setPdfError("");
    try {
      const { buildAssemblyPdf, renderAssemblyDiagram } =
        await import("./assembly-pdf");
      const diagram =
        scope === "guide" ? await renderAssemblyDiagram(snapshot) : undefined;
      const localDone = useUi.getState().assemblyLocalDone;
      const viewedParts = Object.fromEntries(
        guide.plan.steps.flatMap((step) =>
          step.kind === "part" && localDone[step.key] === step.signature
            ? [[step.part.id, step.signature]]
            : [],
        ),
      );
      const viewedWires = Object.fromEntries(
        guide.plan.steps.flatMap((step) =>
          step.kind === "wire" && localDone[step.key] === step.signature
            ? [[step.wire.id, step.signature]]
            : [],
        ),
      );
      const doc = await buildAssemblyPdf({
        name: project.name,
        snapshot,
        currency: String(project.meta.get("assembly.currency") ?? "PEN"),
        prices: includePrices
          ? ((project.meta.get("assembly.prices") ?? {}) as Record<
              string,
              number
            >)
          : {},
        purchased:
          purchased ??
          (project.readOnly
            ? useUi.getState().assemblyLocalPurchased
            : ((project.meta.get("assembly.purchased") ?? {}) as Record<
                string,
                number
              >)),
        partsDone: project.readOnly
          ? viewedParts
          : ((project.meta.get("assembly.parts") ?? {}) as Record<
              string,
              string
            >),
        wiresDone: project.readOnly
          ? viewedWires
          : ((project.meta.get("assembly.done") ?? {}) as Record<
              string,
              string
            >),
        scope,
        diagram,
      });
      doc.save(
        `${project.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-${scope === "materials" ? "materiales" : "montaje"}.pdf`,
      );
    } catch (error) {
      setPdfError(
        error instanceof Error
          ? error.message
          : "No se pudo crear el PDF. Inténtalo nuevamente.",
      );
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };
  return (
    <div className="assembly-panel">
      <WorkbenchToolbar>
        <div className="assembly-toolbar">
          <div
            className="assembly-view-switcher"
            role="group"
            aria-label="Vistas del montaje"
          >
            <button
              aria-pressed={tab === "steps"}
              onClick={() => setTab("steps")}
            >
              Guía
            </button>
            <button
              aria-pressed={tab === "materials"}
              onClick={() => setTab("materials")}
            >
              Materiales<span>{rows.length}</span>
            </button>
            {tab === "photo" && (
              <button aria-pressed="true" onClick={() => setTab("photo")}>
                Comparar foto
              </button>
            )}
          </div>
          <span className="grow" />
          <PopoverPanel
            label="Progreso del montaje"
            className="assembly-progress-popover"
            open={progressOpen}
            onOpenChange={(value) => {
              setProgressOpen(value);
              if (!value) setResetConfirm(false);
            }}
            trigger={
              <HintButton className="btn ghost sm">
                <ListChecks size={15} />
                Progreso
                <ChevronDown size={12} />
              </HintButton>
            }
          >
            {resetConfirm ? (
              <div className="assembly-reset-confirm">
                <h3>¿Empezar de cero?</h3>
                <p>
                  Se quitarán todas las marcas de piezas y cables. El circuito,
                  el código y los precios se conservarán.
                </p>
                <div>
                  <HintButton
                    ref={resetCancel}
                    className="btn"
                    onClick={() => setResetConfirm(false)}
                  >
                    Cancelar
                  </HintButton>
                  <HintButton
                    className="btn primary"
                    onClick={() => {
                      const restore = guide.resetProgress();
                      setUndoReset(() => restore);
                      setTab("steps");
                      setProgressOpen(false);
                      setResetConfirm(false);
                    }}
                  >
                    Reiniciar progreso
                  </HintButton>
                </div>
              </div>
            ) : (
              <>
                <div className="assembly-progress-summary">
                  <h3>Tu progreso</h3>
                  <strong>
                    {guide.completed}
                    <span>
                      {" "}
                      / {guide.plan.steps.length} pasos{" "}
                      {project.readOnly ? "vistos" : "completados"}
                    </span>
                  </strong>
                </div>
                <button
                  className="assembly-progress-option"
                  disabled={guide.firstPending < 0}
                  onClick={() => {
                    guide.navigate(guide.firstPending);
                    setTab("steps");
                    setProgressOpen(false);
                  }}
                >
                  <ListChecks size={17} />
                  <span>
                    Continuar montaje<small>Ir al primer paso pendiente</small>
                  </span>
                </button>
                <button
                  className="assembly-progress-option"
                  onClick={() => {
                    guide.navigate(0);
                    setTab("steps");
                    setProgressOpen(false);
                  }}
                >
                  <ArrowLeft size={17} />
                  <span>
                    Revisar desde el principio
                    <small>Conserva los pasos completados</small>
                  </span>
                </button>
                <div className="ui-menu-separator" />
                <button
                  className="assembly-progress-option"
                  onClick={() => setResetConfirm(true)}
                >
                  <RotateCcw size={17} />
                  <span>
                    Reiniciar progreso…
                    <small>Quitar todas las marcas y volver a cero</small>
                  </span>
                </button>
              </>
            )}
          </PopoverPanel>
          {tab !== "materials" && (
            <HintButton
              className="btn ghost sm"
              disabled={exporting}
              onClick={() => void exportPdf("guide")}
            >
              <FileDown size={16} />
              <span>{exporting ? "Preparando PDF…" : "Plano y guía PDF"}</span>
            </HintButton>
          )}
          <PopoverPanel
            label="Opciones de montaje"
            className="ui-action-menu"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <HintButton
                className="icon-btn"
                aria-label="Más opciones de montaje"
              >
                <MoreHorizontal size={17} />
              </HintButton>
            }
          >
            <button
              onClick={() => {
                setTab("photo");
                setMenuOpen(false);
              }}
            >
              <ImagePlus size={14} />
              Comparar foto
            </button>
          </PopoverPanel>
        </div>
      </WorkbenchToolbar>
      {undoReset && (
        <div className="assembly-reset-notice" role="status">
          <RotateCcw size={15} />
          Progreso reiniciado.
          <HintButton
            className="btn ghost"
            onClick={() => {
              undoReset();
              setUndoReset(null);
            }}
          >
            <Undo2 size={14} />
            Deshacer reinicio
          </HintButton>
        </div>
      )}
      {tab === "steps" && <AssemblySteps />}
      {pdfError && (
        <div className="assembly-pdf-error" role="alert">
          {pdfError} Puedes volver a intentar la exportación.
        </div>
      )}
      {tab === "materials" && (
        <Materials
          exporting={exporting}
          onPdf={(purchased, includePrices) =>
            void exportPdf("materials", purchased, includePrices)
          }
        />
      )}
      {tab === "photo" && (
        <div className="photo-comparison">
          <input
            ref={file}
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => {
              const image = e.target.files?.[0];
              if (image) {
                if (image.size > 20_000_000) {
                  useUi
                    .getState()
                    .showToast("La imagen debe pesar menos de 20 MB.");
                  return;
                }
                setPhoto(URL.createObjectURL(image));
                setMarks([]);
              }
            }}
          />
          <div>
            <strong>Tu montaje, junto al diseño.</strong>
            <p>
              Comparación visual manual. Haz clic en la foto para marcar
              conexiones que quieras revisar. La imagen permanece en este
              navegador durante la sesión.
            </p>
            <HintButton
              className="btn sm"
              onClick={() => file.current?.click()}
            >
              <ImagePlus size={14} />
              {photo ? "Cambiar foto" : "Añadir foto"}
            </HintButton>
            {marks.length > 0 && (
              <HintButton className="btn ghost sm" onClick={() => setMarks([])}>
                Quitar marcas
              </HintButton>
            )}
          </div>
          {photo && (
            <div
              className="photo-stage"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMarks([
                  ...marks,
                  {
                    x: ((e.clientX - r.left) / r.width) * 100,
                    y: ((e.clientY - r.top) / r.height) * 100,
                  },
                ]);
              }}
            >
              <img
                src={photo}
                alt="Montaje físico para comparar con el circuito"
              />
              {marks.map((m, i) => (
                <HintButton
                  key={i}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  aria-label={`Quitar marca ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMarks(marks.filter((_, j) => j !== i));
                  }}
                >
                  {i + 1}
                  <X size={16} />
                </HintButton>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
