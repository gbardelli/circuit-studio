import { HintButton, PopoverPanel } from './Overlays';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, MoreHorizontal, Printer, X } from 'lucide-react';
import { useEditor, useSnapshot } from './context';
import { useUi } from './store';
import { csvCell, download, materials } from './lab-utils';
import { AssemblySteps } from './AssemblySteps';
import { assemblyEndLabel, buildAssemblyPlan, orientationText } from './assembly-plan';
import { CircuitPreview } from './Preview';
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function Assembly() {
  const { project, engine } = useEditor(),
    snapshot = useSnapshot();
  const tab=useUi(s=>s.assemblyTab),setTab=useUi(s=>s.setAssemblyTab);
  const [photo,setPhoto]=useState<string|null>(null),[marks,setMarks]=useState<{x:number;y:number}[]>([]);
  const [menuOpen,setMenuOpen]=useState(false);
  const file=useRef<HTMLInputElement>(null);
  const done=(project.meta.get('assembly.done')??{}) as Record<string,string>,
    prices = (project.meta.get("assembly.prices") ?? {}) as Record<
      string,
      number
    >;
  const currency = String(project.meta.get("assembly.currency") ?? "PEN");
  const plan=buildAssemblyPlan(snapshot),wires=plan.steps.flatMap(step=>step.kind==='wire'?[step.wire]:[]),rows=materials(snapshot);
  const label=(end:Parameters<typeof assemblyEndLabel>[0])=>assemblyEndLabel(end,snapshot);
  useEffect(()=>{
    useUi.getState().setAssemblyWire(null);
    const resume=useUi.getState().simRunning&&!engine.lab.paused;
    if(resume)engine.pause(true);
    return()=>{if(resume&&useUi.getState().simRunning&&engine.lab.paused)engine.pause(false);};
  },[engine]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  const print = async () => {
    const {renderToStaticMarkup}=await import('react-dom/server');
    const diagram=renderToStaticMarkup(<CircuitPreview snapshot={snapshot} labels/>);
    const defs=document.querySelector('#g-metal')?.parentElement?.outerHTML??'';
    const svg=diagram.replace(/(<svg[^>]*>)/,'$1'+defs);
    const placed=(project.meta.get('assembly.parts')??{}) as Record<string,string>;
    const steps=plan.steps.map((step,i)=>{
      const checked=step.kind==='part'?placed[step.part.id]===step.signature:done[step.wire.id]===step.signature;
      const instruction=step.kind==='part'
        ? `${orientationText(step.part)} ${step.placements.map(p=>`${p.pin}: ${label({part:p.board,pin:p.hole,x:0,y:0})}`).join('; ')}`
        : `${label(step.wire.a)} → ${label(step.wire.b)} · ${step.wire.color}`;
      return `<tr><td>${i+1}</td><td>${step.kind==='part'?'Colocar pieza':'Conectar cable'}</td><td>${escape(step.title)}</td><td>${escape(instruction)}</td><td>${checked?'✓':''}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><title>${escape(project.name)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#111}h1{font-size:24px;margin:0 0 8px}header{border-bottom:2px solid;padding:0 0 12px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{text-align:left;border-bottom:1px solid #ddd;padding:6px}svg{width:100%;height:440px;background:#101216;--accent:#499dff;--canvas:#101216;--grid-dot:#222;--text:#fff;--sch-ink:#c9d1dc;--sch-wire:#6fb4ff;--sch-soft:#7b8594;--sch-supply:#ff8f6b;--sch-frame:#999;--sch-frame-ink:#aaa;--sch-flag-fill:#162232;--sch-flag-ink:#eee}footer{border-top:1px solid;padding-top:8px}.break{break-before:page}img{max-width:90%;max-height:450px}</style></head><body><header><h1>${escape(project.name)}</h1>Circuit Studio · Plano de montaje · ${new Date().toLocaleDateString("es-PE")}<br>${snapshot.parts.length} componentes · ${wires.length} conexiones · Importes introducidos por el usuario, ${escape(currency)}</header>${svg}<footer>Revisión: ${escape(project.name)} · Verifica el patillaje y los valores antes del montaje físico.</footer><h2 class="break">Materiales</h2><table><tr><th>Componente</th><th>Referencia / valor</th><th>Cantidad</th><th>Precio unitario</th></tr>${rows.map((r) => `<tr><td>${escape(r.name)}</td><td>${escape(r.reference)}</td><td>${r.quantity}</td><td>${prices[r.key] === undefined ? "—" : escape(prices[r.key])}</td></tr>`).join("")}</table><h2 class="break">Montaje paso a paso</h2><table><tr><th>Paso</th><th>Acción</th><th>Elemento</th><th>Indicaciones</th><th>Hecho</th></tr>${steps}</table></body></html>`;
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
      <div className="assembly-toolbar">
        {tab!=='steps'&&<HintButton className="btn ghost sm" onClick={()=>setTab('steps')}><ArrowLeft size={13}/>Guía de montaje</HintButton>}
        {tab==='steps'?<HintButton className="btn ghost sm" onClick={()=>setTab('materials')}>Materiales<span className="assembly-material-count">{rows.length}</span></HintButton>:<strong>{tab==='materials'?'Materiales':'Comparar foto'}</strong>}
        <span className="grow"/>
        <HintButton className="btn ghost sm" onClick={()=>void print()}><Printer size={13}/><span>Imprimir / PDF</span></HintButton>
        <PopoverPanel label="Opciones de montaje" className="ui-action-menu" open={menuOpen} onOpenChange={setMenuOpen} trigger={<HintButton className="icon-btn" aria-label="Más opciones de montaje"><MoreHorizontal size={17}/></HintButton>}>
          <button onClick={()=>{setTab('photo');setMenuOpen(false);}}><ImagePlus size={14}/>Comparar foto</button>
          <div className="ui-menu-separator"/>
          <button onClick={()=>{useUi.getState().setAssemblyCursor(null);setTab('steps');setMenuOpen(false);}}><ArrowLeft size={14}/>Volver al inicio de la guía</button>
        </PopoverPanel>
      </div>
      {tab==='steps'&&<AssemblySteps/>}
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
            <HintButton
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
            </HintButton>
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
            <HintButton className="btn sm" onClick={() => file.current?.click()}>
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
                  <X size={9} />
                </HintButton>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
