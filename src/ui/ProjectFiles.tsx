import { useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Download, FileUp, FolderOpen, Loader2, X } from 'lucide-react';
import { Dialog } from '@base-ui/react/dialog';
import { PopoverPanel } from './Overlays';
import { useEditor } from './context';
import { useUi } from './store';
import { download } from './lab-utils';
import './project-files.css';

/** Read and validate before offering to create a new project. Nothing is replaced. */
export function ImportProjectButton({ disabled = false, inputRef, hideTrigger = false }: { disabled?: boolean; inputRef?: RefObject<HTMLInputElement>; hideTrigger?: boolean }) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const titleId = useId(), descriptionId = useId();
  const [file, setFile] = useState<import('../collab/projectFile').ProjectFile | null>(null);
  const [summary, setSummary] = useState<{ name: string; parts: number; wires: number; sheets: number; programs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]; event.target.value = '';
    if (!selected || inFlight.current) return;
    inFlight.current = true; setOpen(true); setBusy(true); setError(null); setFile(null); setSummary(null);
    try {
      const { MAX_PROJECT_FILE_BYTES, parseProjectFile, projectFileSummary } = await import('../collab/projectFile');
      if (selected.size > MAX_PROJECT_FILE_BYTES) throw new Error('El archivo supera los 10 MB.');
      const parsed = parseProjectFile(await selected.text());
      setFile(parsed); setSummary(projectFileSummary(parsed));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const create = async () => {
    if (!file || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { importProjectCopy } = await import('./importProject');
      const room = await importProjectCopy(file);
      location.assign(`/?p=${encodeURIComponent(room)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el proyecto.');
      inFlight.current = false; setBusy(false);
    }
  };
  return <>
    {!hideTrigger && <button className="btn project-import-button" disabled={disabled || busy} onClick={() => input.current?.click()}><FileUp size={16} /> Importar proyecto</button>}
    <input ref={input} type="file" accept=".circuitstudio,application/json" hidden aria-label="Archivo de proyecto CircuitStudio" onChange={event => void read(event)} />
    <Dialog.Root open={open} onOpenChange={value => { if (!inFlight.current) setOpen(value); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="project-file-backdrop" />
        <Dialog.Popup className="project-file-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
          <div className="project-file-heading"><Dialog.Title id={titleId}>Importar proyecto</Dialog.Title><Dialog.Close className="icon-btn" aria-label="Cerrar importación" disabled={busy}><X size={19} /></Dialog.Close></div>
          <Dialog.Description id={descriptionId}>Se abrirá como un proyecto nuevo. El original se conserva.</Dialog.Description>
          {busy && !summary && <div className="project-file-reading" role="status"><Loader2 size={19} className="project-file-spinner" /> Comprobando archivo…</div>}
          {summary && <section className="project-file-preview" aria-label="Contenido del archivo"><FolderOpen size={25} /><strong title={summary.name}>{summary.name}</strong><dl>{[['Componentes', summary.parts], ['Cables', summary.wires], ['Hojas de diseño', summary.sheets], ['Programas', summary.programs]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
          {error && <p className="project-file-error" role="alert">{error}</p>}
          <div className="project-file-actions"><Dialog.Close className="btn" disabled={busy}>Cancelar</Dialog.Close><button className="btn primary" disabled={!file || busy} onClick={() => void create()}>{busy ? <Loader2 size={16} className="project-file-spinner" /> : <FileUp size={16} />}{busy && summary ? 'Importando…' : 'Importar y abrir'}</button></div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

export function ProjectFileMenu() {
  const { project } = useEditor();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const locked = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const showToast = useUi(s => s.showToast);
  const ready = project.persistence.synced && !(project.connection === 'connected' && !project.synced);
  const exportFile = async () => {
    if (locked.current || !ready) return;
    locked.current = true; setExporting(true);
    try {
      const { exportProjectFile, projectFileName } = await import('../collab/projectFile');
      download(projectFileName(project.name), exportProjectFile(project), 'application/json;charset=utf-8');
      setOpen(false); showToast('Proyecto exportado.', 'ok');
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo exportar el proyecto.'); }
    finally { locked.current = false; setExporting(false); }
  };
  return <><PopoverPanel label="Archivo del proyecto" className="project-file-menu" open={open} onOpenChange={setOpen} align="start" trigger={<button className="btn sm" aria-label="Archivo del proyecto"><FolderOpen size={15} /> Archivo</button>}>
    <button className="btn" disabled={exporting || !ready} title={!ready ? 'Esperando a que cargue el proyecto' : undefined} onClick={() => void exportFile()}>{exporting ? <Loader2 size={16} className="project-file-spinner" /> : <Download size={16} />} {exporting ? 'Exportando…' : 'Exportar proyecto'}</button>
    <button className="btn" onClick={() => { input.current?.click(); setOpen(false); }}><FileUp size={16} /> Importar proyecto</button>
  </PopoverPanel><ImportProjectButton inputRef={input} hideTrigger /></>;
}
