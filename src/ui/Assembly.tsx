import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Printer,
  X,
} from "lucide-react";
import { useEditor, useSnapshot } from "./context";
import { useUi } from "./store";
import { PARTS } from "../parts";
import { csvCell, download, materials } from "./lab-utils";
const signature = (wire: { a: unknown; b: unknown; color: string }) =>
  JSON.stringify([wire.a, wire.b, wire.color]);
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function Assembly() {
  const { project } = useEditor(),
    snapshot = useSnapshot();
  const [tab, setTab] = useState<"steps" | "materials" | "photo">("steps"),
    [index, setIndex] = useState(0),
    [photo, setPhoto] = useState<string | null>(null),
    [marks, setMarks] = useState<{ x: number; y: number }[]>([]);
  const file = useRef<HTMLInputElement>(null),
    highlight = useUi((s) => s.setAssemblyWire),
    select = useUi((s) => s.select);
  const done = (project.meta.get("assembly.done") ?? {}) as Record<
      string,
      string
    >,
    prices = (project.meta.get("assembly.prices") ?? {}) as Record<
      string,
      number
    >;
  const currency = String(project.meta.get("assembly.currency") ?? "PEN");
  const wires = [...snapshot.wires]
    .filter((w) => !w.sch)
    .sort(
      (a, b) =>
        Number(
          /VCC|VDD|5V|GND|VSS/.test(b.a.pin ?? "") ||
            /VCC|VDD|5V|GND|VSS/.test(b.b.pin ?? ""),
        ) -
        Number(
          /VCC|VDD|5V|GND|VSS/.test(a.a.pin ?? "") ||
            /VCC|VDD|5V|GND|VSS/.test(a.b.pin ?? ""),
        ),
    );
  const at = Math.min(index, Math.max(0, wires.length - 1)),
    wire = wires[at],
    finished = wires.filter((w) => done[w.id] === signature(w)).length,
    rows = materials(snapshot);
  const label = (end: { part?: string; pin?: string }) => {
    const part = snapshot.parts.find((p) => p.id === end.part);
    return part
      ? `${part.props.label || PARTS[part.type].partNumber || PARTS[part.type].name} · ${end.pin}`
      : "Extremo libre";
  };
  useEffect(() => {
    highlight(wire?.id ?? null);
    return () => highlight(null);
  }, [wire?.id, highlight]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  const print = () => {
    const svgNode = document
      .querySelector(".canvas-wrap svg")
      ?.cloneNode(true) as SVGElement | undefined;
    const defs = document.querySelector("#g-metal")?.parentElement;
    if (svgNode && defs) svgNode.prepend(defs.cloneNode(true));
    const originalRoot = document.querySelector(
      ".canvas-wrap svg > g[transform]",
    ) as SVGGElement | null;
    const root = svgNode?.querySelector(":scope > g[transform]");
    if (originalRoot && root && svgNode) {
      const box = originalRoot.getBBox();
      root.removeAttribute("transform");
      svgNode.setAttribute(
        "viewBox",
        `${box.x - 20} ${box.y - 20} ${box.width + 40} ${box.height + 40}`,
      );
      svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    const svg = svgNode?.outerHTML ?? "";
    const html = `<!doctype html><html><head><title>${escape(project.name)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#111}h1{font-size:24px;margin:0 0 8px}header{border-bottom:2px solid;padding:0 0 12px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{text-align:left;border-bottom:1px solid #ddd;padding:6px}svg{width:100%;height:440px;background:#101216;--accent:#499dff;--canvas:#101216;--grid-dot:#222;--text:#fff;--sch-ink:#c9d1dc;--sch-wire:#6fb4ff;--sch-soft:#7b8594;--sch-supply:#ff8f6b;--sch-frame:#999;--sch-frame-ink:#aaa;--sch-flag-fill:#162232;--sch-flag-ink:#eee}footer{border-top:1px solid;padding-top:8px}.break{break-before:page}img{max-width:90%;max-height:450px}</style></head><body><header><h1>${escape(project.name)}</h1>Circuit Studio · Plano de montaje · ${new Date().toLocaleDateString("es-PE")}<br>${snapshot.parts.length} componentes · ${wires.length} conexiones · Importes introducidos por el usuario, ${escape(currency)}</header>${svg}<footer>Revisión: ${escape(project.name)} · Verifica el patillaje y los valores antes del montaje físico.</footer><h2 class="break">Materiales</h2><table><tr><th>Componente</th><th>Referencia / valor</th><th>Cantidad</th><th>Precio unitario</th></tr>${rows.map((r) => `<tr><td>${escape(r.name)}</td><td>${escape(r.reference)}</td><td>${r.quantity}</td><td>${prices[r.key] === undefined ? "—" : escape(prices[r.key])}</td></tr>`).join("")}</table><h2>Conexiones</h2><table><tr><th>Paso</th><th>Desde</th><th>Hasta</th><th>Color</th><th>Hecho</th></tr>${wires.map((w, i) => `<tr><td>${i + 1}</td><td>${escape(label(w.a))}</td><td>${escape(label(w.b))}</td><td>${escape(w.color)}</td><td>${done[w.id] === signature(w) ? "✓" : ""}</td></tr>`).join("")}</table></body></html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0";
    iframe.srcdoc = html;
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    document.body.append(iframe);
    setTimeout(() => iframe.remove(), 120000);
  };
  return (
    <div className="assembly-panel">
      <div className="lab-controls">
        <div className="segmented">
          {(
            [
              ["steps", "Montaje"],
              ["materials", "Materiales"],
              ["photo", "Comparar foto"],
            ] as const
          ).map(([key, name]) => (
            <button
              key={key}
              className={tab === key ? "on" : ""}
              onClick={() => setTab(key)}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="grow" />
        <button className="btn ghost sm" onClick={print}>
          <Printer size={13} /> Imprimir / PDF
        </button>
      </div>
      {tab === "steps" && (
        <div className="assembly-steps">
          <div className="assembly-progress">
            <span>
              {finished}
              <small> / {wires.length}</small>
            </span>
            <div>
              <strong>Conexiones verificadas</strong>
              <progress value={finished} max={Math.max(1, wires.length)} />
            </div>
          </div>
          {wire ? (
            <>
              <div className="assembly-instruction">
                <small>
                  Paso {at + 1} de {wires.length}
                </small>
                <strong>
                  <i style={{ background: wire.color }} />
                  {label(wire.a)}
                  <ChevronRight size={18} />
                  {label(wire.b)}
                </strong>
                <p>
                  Los dos extremos están resaltados en el lienzo. Comprueba la
                  fila, la columna y la tira interna de la protoboard.
                </p>
              </div>
              <div className="assembly-actions">
                <button
                  className="icon-btn"
                  aria-label="Paso anterior"
                  disabled={!at}
                  onClick={() => setIndex(at - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={`btn ${done[wire.id] === signature(wire) ? "assembly-complete" : ""}`}
                  disabled={project.readOnly}
                  onClick={() => {
                    const next = { ...done };
                    if (next[wire.id] === signature(wire)) delete next[wire.id];
                    else next[wire.id] = signature(wire);
                    project.setMeta("assembly.done", next);
                    if (at < wires.length - 1) setIndex(at + 1);
                  }}
                >
                  <Check size={15} />
                  {done[wire.id] === signature(wire)
                    ? "Verificado"
                    : "Marcar como hecho"}
                </button>
                <button
                  className="icon-btn"
                  aria-label="Paso siguiente"
                  disabled={at >= wires.length - 1}
                  onClick={() => setIndex(at + 1)}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    select([], [wire.id]);
                    useUi.getState().setView("board");
                  }}
                >
                  Seleccionar cable
                </button>
              </div>
            </>
          ) : (
            <div className="lab-empty">
              <strong>Primero conecta el circuito.</strong>
              <p>
                Las conexiones físicas se convierten en pasos de montaje. Los
                enlaces pendientes del esquema se muestran en el lienzo.
              </p>
            </div>
          )}
        </div>
      )}
      {tab === "materials" && (
        <div className="materials-list">
          <div className="material-settings">
            <label>
              Moneda{" "}
              <select
                value={currency}
                disabled={project.readOnly}
                onChange={(e) =>
                  project.setMeta("assembly.currency", e.target.value)
                }
              >
                <option>PEN</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <span>
              Precios de tu proveedor; no son cotizaciones automáticas.
            </span>
            <button
              className="btn ghost sm"
              onClick={() =>
                download(
                  "materiales.csv",
                  [
                    [
                      "Componente",
                      "Referencia",
                      "Cantidad",
                      `Precio unitario ${currency}`,
                    ],
                    ...rows.map((r) => [
                      r.name,
                      r.reference,
                      r.quantity,
                      prices[r.key] ?? "",
                    ]),
                  ]
                    .map((row) => row.map(csvCell).join(","))
                    .join("\n"),
                  "text/csv",
                )
              }
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Componente</th>
                <th>Referencia / valor</th>
                <th>Cant.</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.name}</td>
                  <td>{row.reference || "—"}</td>
                  <td>{row.quantity}</td>
                  <td>
                    <input
                      aria-label={`Precio de ${row.name}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="—"
                      disabled={project.readOnly}
                      value={prices[row.key] ?? ""}
                      onChange={(e) => {
                        const next = { ...prices };
                        if (e.target.value === "") delete next[row.key];
                        else
                          next[row.key] = Math.max(0, Number(e.target.value));
                        project.setMeta("assembly.prices", next);
                      }}
                    />
                  </td>
                  <td>
                    {prices[row.key] === undefined
                      ? "—"
                      : (prices[row.key] * row.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total de partidas con precio · {currency}</td>
                <td>
                  {rows
                    .reduce(
                      (total, row) =>
                        total + (prices[row.key] ?? 0) * row.quantity,
                      0,
                    )
                    .toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
            <button className="btn sm" onClick={() => file.current?.click()}>
              <ImagePlus size={14} />
              {photo ? "Cambiar foto" : "Añadir foto"}
            </button>
            {marks.length > 0 && (
              <button className="btn ghost sm" onClick={() => setMarks([])}>
                Quitar marcas
              </button>
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
                <button
                  key={i}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  aria-label={`Quitar marca ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMarks(marks.filter((_, j) => j !== i));
                  }}
                >
                  {i + 1}
                  <X size={9} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
