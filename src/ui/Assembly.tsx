import { HintButton, PopoverPanel } from './Overlays';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, MoreHorizontal, Printer, X, RotateCcw, ChevronDown, ListChecks, Undo2 } from 'lucide-react';
import { useEditor, useSnapshot } from './context';
import { useUi } from './store';
import { csvCell, download, materials } from './lab-utils';
import { AssemblySteps } from './AssemblySteps';
import { assemblyEndLabel, buildAssemblyPlan, orientationText } from './assembly-plan';
import { CircuitPreview } from './Preview';
import { useAssemblyGuide } from './useAssemblyGuide';
import { WorkbenchToolbar } from './WorkbenchToolbar';
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
  const guide=useAssemblyGuide();
  const [progressOpen,setProgressOpen]=useState(false),[resetConfirm,setResetConfirm]=useState(false);
  const [undoReset,setUndoReset]=useState<(()=>void)|null>(null);
  const resetCancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(resetConfirm){const id=requestAnimationFrame(()=>resetCancel.current?.focus());return()=>cancelAnimationFrame(id);}},[resetConfirm]);
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
      <WorkbenchToolbar><div className="assembly-toolbar">
        <div className="assembly-view-switcher" role="group" aria-label="Vistas del montaje"><button aria-pressed={tab==='steps'} onClick={()=>setTab('steps')}>Guía</button><button aria-pressed={tab==='materials'} onClick={()=>setTab('materials')}>Materiales<span>{rows.length}</span></button>{tab==='photo'&&<button aria-pressed="true" onClick={()=>setTab('photo')}>Comparar foto</button>}</div>
        <span className="grow"/>
        <PopoverPanel label="Progreso del montaje" className="assembly-progress-popover" open={progressOpen} onOpenChange={value=>{setProgressOpen(value);if(!value)setResetConfirm(false);}} trigger={<HintButton className="btn ghost sm"><ListChecks size={15}/>Progreso<ChevronDown size={12}/></HintButton>}>
          {resetConfirm?<div className="assembly-reset-confirm"><h3>¿Empezar de cero?</h3><p>Se quitarán todas las marcas de piezas y cables. El circuito, el código y los precios se conservarán.</p><div><HintButton ref={resetCancel} className="btn" onClick={()=>setResetConfirm(false)}>Cancelar</HintButton><HintButton className="btn primary" onClick={()=>{const restore=guide.resetProgress();setUndoReset(()=>restore);setTab('steps');setProgressOpen(false);setResetConfirm(false);}}>Reiniciar progreso</HintButton></div></div>:<>
            <div className="assembly-progress-summary"><h3>Tu progreso</h3><strong>{guide.completed}<span> / {guide.plan.steps.length} pasos {project.readOnly?'vistos':'completados'}</span></strong></div>
            <button className="assembly-progress-option" disabled={guide.firstPending<0} onClick={()=>{guide.navigate(guide.firstPending);setTab('steps');setProgressOpen(false);}}><ListChecks size={17}/><span>Continuar montaje<small>Ir al primer paso pendiente</small></span></button>
            <button className="assembly-progress-option" onClick={()=>{guide.navigate(0);setTab('steps');setProgressOpen(false);}}><ArrowLeft size={17}/><span>Revisar desde el principio<small>Conserva los pasos completados</small></span></button>
            <div className="ui-menu-separator"/>
            <button className="assembly-progress-option" onClick={()=>setResetConfirm(true)}><RotateCcw size={17}/><span>Reiniciar progreso…<small>Quitar todas las marcas y volver a cero</small></span></button>
          </>}
        </PopoverPanel>
        <HintButton className="btn ghost sm" onClick={()=>void print()}><Printer size={13}/><span>Imprimir / PDF</span></HintButton>
        <PopoverPanel label="Opciones de montaje" className="ui-action-menu" open={menuOpen} onOpenChange={setMenuOpen} trigger={<HintButton className="icon-btn" aria-label="Más opciones de montaje"><MoreHorizontal size={17}/></HintButton>}>
          <button onClick={()=>{setTab('photo');setMenuOpen(false);}}><ImagePlus size={14}/>Comparar foto</button>
        </PopoverPanel>
      </div></WorkbenchToolbar>
      {undoReset&&<div className="assembly-reset-notice" role="status"><RotateCcw size={15}/>Progreso reiniciado.<HintButton className="btn ghost" onClick={()=>{undoReset();setUndoReset(null);}}><Undo2 size={14}/>Deshacer reinicio</HintButton></div>}
      {tab==='steps'&&<AssemblySteps/>}
      {tab === "materials" && (
        <div className="materials-panel">
          <div className="materials-summary"><div><h2>Lista de materiales</h2><p>{snapshot.parts.length} piezas · {rows.length} referencias</p></div><span>Introduce los precios de tu proveedor.</span></div>
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
              Los importes se guardan en este proyecto.
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
              <Download size={15} /> Exportar CSV
            </HintButton>
          </div>
          <div className="materials-list"><table aria-label="Lista de materiales">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Referencia / valor</th>
                <th>Cantidad</th>
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
                      aria-label={`Precio unitario de ${row.name}${row.reference?` · ${row.reference}`:''}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="—"
                      disabled={project.readOnly}
                      value={prices[row.key] ?? ""}
                      onChange={(e) => {
                        const next = { ...prices };
                        if (e.target.value === "") delete next[row.key];
                        else {
                          const value=Number(e.target.value);if(!Number.isFinite(value))return;
                          next[row.key] = Math.max(0,value);
                        }
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
                  {rows.some(row=>prices[row.key]!==undefined)?rows
                    .reduce(
                      (total, row) =>
                        total + (prices[row.key] ?? 0) * row.quantity,
                      0,
                    )
                    .toFixed(2):'—'}
                </td>
              </tr>
            </tfoot>
          </table></div>
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
