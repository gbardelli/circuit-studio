import type { ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Info, Undo2 } from "lucide-react";
import { PARTS } from "../parts";
import { formatSI } from "../core/units";
import type { PartData, WireEnd } from "../core/types";
import { HintButton } from "./Overlays";
import { TerminalLocation } from "./TerminalLocation";
import { WIRE_COLORS, partBounds } from "./geometry";
import { orientationText, partTitle, type AssemblyPlacement, type AssemblyStep } from "./assembly-plan";
import "./assembly-step.css";

export function PieceThumbnail({ part }: { part: PartData }) {
  const local = { ...part, id: `assembly-thumb-${part.id}`, x: 0, y: 0 },
    b = partBounds(local),
    def = PARTS[part.type];
  return (
    <svg className="assembly-piece-thumbnail" viewBox={`${b.x - 8} ${b.y - 8} ${b.w + 16} ${b.h + 16}`} aria-hidden="true">
      <g transform={`rotate(${part.rot})`}>
        <def.Render part={local} visual={null} preview />
      </g>
    </svg>
  );
}

const BAND = ["negro", "marrón", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "gris", "blanco"];
const BAND_HEX = ["#1d1d1f", "#8b5a2b", "#e5484d", "#f2862e", "#f5c518", "#2fbf71", "#3e7bfa", "#9b6bf2", "#8e8e93", "#f4f4f5"];

/** Código de colores de 4 bandas (dos cifras, multiplicador y tolerancia dorada del 5 %). */
export function resistorBands(ohms: number) {
  if (!(ohms >= 10)) return null;
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const digits = Math.round(ohms / 10 ** exp);
  const [d1, d2, mult] = digits === 100 ? [1, 0, exp + 1] : [Math.floor(digits / 10), digits % 10, exp];
  if (mult > 9) return null;
  return [d1, d2, mult].map((i) => ({ name: BAND[i], hex: BAND_HEX[i] })).concat({ name: "dorado", hex: "#c9a646" });
}

/** Indicaciones de orientación con contenido real; el texto genérico no aporta en la tarjeta. */
function orientationTip(part: PartData) {
  return /^(74hc|74ls|cd4|ne555|tlc555|attiny|led|capacitor|breadboard)/.test(part.type) ? orientationText(part) : null;
}

/** Con muchas patillas basta la primera y la última para fijar la posición; el resto se despliega. */
function keyPins(part: PartData, pins: AssemblyPlacement[]) {
  const sorted = [...pins].sort((a, b) => (pinNumber(part, a.pin) ?? 0) - (pinNumber(part, b.pin) ?? 0));
  return { sorted, shown: sorted.length > 4 ? [sorted[0], sorted[sorted.length - 1]] : sorted };
}

function ownerName(part?: PartData) {
  return part ? partTitle(part) : "Extremo libre";
}

function EndRow({ label, end, part, color }: { label: string; end: WireEnd; part?: PartData; color: string }) {
  return (
    <li className="step-row step-end">
      <span className="step-end-dot" style={{ background: color }} aria-hidden="true" />
      <div className="step-row-head">
        <span className="step-row-label">{label}</span>
        <strong className="step-row-owner" title={ownerName(part)}>
          {ownerName(part)}
        </strong>
      </div>
      <TerminalLocation pin={end.pin} breadboard={part?.type.startsWith("breadboard")} />
    </li>
  );
}

/** En un integrado DIP importa el número físico; el nombre de la señal acompaña. */
function pinNumber(part: PartData, pin: string) {
  const def = PARTS[part.type];
  if (!def?.chip) return null;
  const i = def.pins(part.props).findIndex((p) => p.id === pin);
  return i < 0 ? null : i + 1;
}

function PinRow({ placement, part, owner, byId }: { placement: AssemblyPlacement; part: PartData; owner?: string; byId: Map<string, PartData> }) {
  const n = pinNumber(part, placement.pin);
  return (
    <li className="step-row">
      <div className="step-row-head">
        <span className="step-row-label">Patilla</span>
        <strong className="step-pin">{n ?? placement.pin}</strong>
        {n !== null && <span className="step-signal">{placement.pin}</span>}
        {placement.board !== owner && <span className="step-row-owner">{ownerName(byId.get(placement.board))}</span>}
      </div>
      <TerminalLocation pin={placement.hole} breadboard={byId.get(placement.board)?.type.startsWith("breadboard")} />
    </li>
  );
}

export function StepCard({
  step,
  index,
  total,
  completed,
  phase,
  done,
  readOnly,
  byId,
  menu,
  onPrevious,
  onNext,
  onConfirm,
  onUnconfirm,
}: {
  step: AssemblyStep;
  index: number;
  total: number;
  completed: number;
  phase?: string;
  done: boolean;
  readOnly: boolean;
  byId: Map<string, PartData>;
  menu: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const isPart = step.kind === "part";
  const isBoard = isPart && step.part.type.startsWith("breadboard");
  const wireColor = step.kind === "wire" ? step.wire.color : "";
  const colorName = WIRE_COLORS.find((c) => c.value.toLowerCase() === wireColor.toLowerCase())?.label.toLowerCase();
  const owner = isPart && step.owner ? byId.get(step.owner) : undefined;
  const tip = isPart ? orientationTip(step.part) : null;
  const ohms = isPart && typeof step.part.props.resistance === "number" ? step.part.props.resistance : null;
  const farads = isPart && typeof step.part.props.capacitance === "number" ? step.part.props.capacitance : null;
  const bands = ohms !== null ? resistorBands(ohms) : null;
  const { sorted, shown } = isPart ? keyPins(step.part, step.placements) : { sorted: [], shown: [] };
  const hidden = sorted.filter((p) => !shown.includes(p));
  const doneLabel = readOnly ? "Visto" : isPart ? "Colocada" : "Conectado";
  const primary = done ? "Siguiente" : readOnly ? (isPart ? "Mostrar pieza" : "Mostrar cable") : isPart ? "Pieza colocada" : "Cable conectado";

  return (
    <section className={`step-view ${done ? "is-done" : ""}`} aria-labelledby="step-title">
      <header className="step-head">
        <p className="step-count">
          <span className="step-phase">{phase}</span>
          <span>
            Paso <b>{index + 1}</b> de {total}
          </span>
        </p>
        {menu}
        <div
          className="step-meter"
          role="progressbar"
          aria-label={readOnly ? "Pasos vistos" : "Pasos confirmados"}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
        >
          <i style={{ width: `${(completed / total) * 100}%` }} />
          <b style={{ left: `${((index + 0.5) / total) * 100}%` }} />
        </div>
      </header>

      <div className="step-body" aria-live="polite" aria-atomic="true">
        <div className="step-hero">
          <div className="step-art">
            {step.kind === "part" ? (
              <PieceThumbnail part={step.part} />
            ) : (
              <svg viewBox="0 0 96 64" aria-hidden="true" className="step-cable">
                <path className="step-cable-edge" d="M14 48 C 34 48, 40 16, 82 16" />
                <path d="M14 48 C 34 48, 40 16, 82 16" stroke={wireColor} />
                <rect x="4" y="44" width="12" height="8" rx="1.5" />
                <rect x="80" y="12" width="12" height="8" rx="1.5" />
              </svg>
            )}
            {done && (
              <span className="step-done" title={doneLabel}>
                <Check size={13} strokeWidth={3} /> {doneLabel}
              </span>
            )}
          </div>
          <div className="step-titles">
            <h2 id="step-title">{isPart ? step.title : `Cable ${colorName ?? ""}`.trim()}</h2>
            <p className="step-sub">
              {isPart
                ? owner
                  ? `En ${partTitle(owner)}`
                  : isBoard
                    ? "Base del montaje"
                    : "Sobre la mesa, junto a las protoboards"
                : "Une los dos extremos indicados"}
            </p>
            {(ohms !== null || farads !== null) && (
              <p className="step-value">
                <strong>{ohms !== null ? formatSI(ohms, "Ω") : formatSI(farads!, "F")}</strong>
                {bands && (
                  <span className="step-bands" role="img" aria-label={`Bandas: ${bands.map((b) => b.name).join(", ")}`} title={bands.map((b) => b.name).join(" · ")}>
                    {bands.map((b, i) => (
                      <i key={i} style={{ background: b.hex }} />
                    ))}
                  </span>
                )}
                {bands && <small>{bands.slice(0, 3).map((b) => b.name).join(" · ")}</small>}
              </p>
            )}
          </div>
          {tip && (
            <p className="step-tip">
              <Info size={15} aria-hidden="true" />
              <span>{tip}</span>
            </p>
          )}
        </div>

        <div className="step-where">
          <h3>{isPart ? "Dónde va" : "Conexión"}</h3>
          <ul className={`step-list ${isPart ? "" : "is-route"}`}>
            {step.kind === "wire" ? (
              <>
                <EndRow label="Origen" end={step.wire.a} part={byId.get(step.wire.a.part ?? "")} color={wireColor} />
                <EndRow label="Destino" end={step.wire.b} part={byId.get(step.wire.b.part ?? "")} color={wireColor} />
              </>
            ) : shown.length ? (
              shown.map((p) => <PinRow key={`${p.pin}-${p.board}`} placement={p} part={step.part} owner={owner?.id} byId={byId} />)
            ) : (
              <li className="step-row step-empty">
                {isBoard
                  ? "Directamente sobre la mesa. Las piezas de los pasos siguientes se insertan en ella."
                  : "No se inserta en una protoboard. Sus cables llegan en los pasos de alimentación y señales."}
              </li>
            )}
          </ul>
          {step.kind === "part" && hidden.length > 0 && (
            <details className="step-more">
              <summary>
                <ChevronRight size={14} aria-hidden="true" /> Ver las otras {hidden.length} patillas
              </summary>
              <ul className="step-list">
                {hidden.map((p) => (
                  <PinRow key={`${p.pin}-${p.board}`} placement={p} part={step.part} owner={owner?.id} byId={byId} />
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <footer className="step-foot">
        <div className="step-nav">
          <HintButton className="step-icon-btn" onClick={onPrevious} disabled={index === 0} aria-label="Paso anterior" title="Paso anterior">
            <ChevronLeft size={17} />
          </HintButton>
          <HintButton className="step-icon-btn" onClick={onNext} aria-label="Ver siguiente sin confirmar" title="Ver el siguiente sin confirmar este">
            <ChevronRight size={17} />
          </HintButton>
        </div>
        {done && (
          <HintButton className="btn ghost step-undo" onClick={onUnconfirm}>
            <Undo2 size={14} /> Desmarcar
          </HintButton>
        )}
        <HintButton className="btn primary" onClick={onConfirm}>
          {primary}
          {done ? <ArrowRight size={16} /> : <Check size={16} />}
        </HintButton>
      </footer>
    </section>
  );
}
