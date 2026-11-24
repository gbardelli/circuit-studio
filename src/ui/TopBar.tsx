import { SpiceChip } from './SpiceStatus';
import { HintButton, PopoverPanel } from './Overlays';
import { useEffect, useState } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD } from '../cloud';
import { AlertTriangle, Code2, Cpu, Eye, HardDrive, Keyboard, Link2, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Redo2, Square, Undo2, Users, Wifi, WifiOff } from 'lucide-react';
import { compileSketch } from '../sim/compile';
import { useConnection, useEditor, usePeers, useSimStatus, useSnapshot } from './context';
import { Logo, Wordmark } from './Logo';
import { PARTS } from '../parts';
import { useUi } from './store';
import { HistoryIcon, HistoryPanel } from './History';
import { ProjectFileMenu } from './ProjectFiles';
import { SharePopover } from './SharePopover';

export function TopBar() {
  const { project, engine, detail } = useEditor();
  const guest = Boolean(detail?.guest);
  const guiding=useUi(s=>s.labPanel==='assembly'&&s.assemblyTab==='steps');
  const snapshot = useSnapshot();
  const peers = usePeers();
  useConnection();
  const simRunning = useUi((s) => s.simRunning);
  const setSim = useUi((s) => s.setSim);
  const openCode = useUi((s) => s.openCode);
  const showToast = useUi((s) => s.showToast);
  const status = useSimStatus();
  const [starting, setStarting] = useState(false);
  // `?share=1` (desde el menú de la portada) abre directamente el panel de miembros y acceso.
  const [shareOpen, setShareOpen] = useState(() => CLOUD && new URLSearchParams(location.search).has('share'));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [, force] = useState(0);

  useEffect(() => setName(project.name), [project.name]);

  // Compila en segundo plano en cuanto el código deja de cambiar: al pulsar Simular, el .hex ya
  // está listo (o en camino) y no se espera al servidor.
  const boardIds = snapshot.parts.filter((p) => PARTS[p.type].mcu).map((p) => `${p.id}:${p.type}`).join(',');
  useEffect(() => {
    if (!boardIds || guest) return;
    const boards = boardIds.split(',').map((s) => s.split(':') as [string, string]);
    let timer = 0;
    const warm = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const [id, type] of boards) void compileSketch(project.sketch(id).toString(), PARTS[type].mcu!.fqbn);
      }, 1200);
    };
    const texts = boards.map(([id]) => project.sketch(id));
    texts.forEach((t) => t.observe(warm));
    warm();
    return () => {
      clearTimeout(timer);
      texts.forEach((t) => t.unobserve(warm));
    };
  }, [boardIds, project, guest]);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 400);
    return () => clearInterval(t);
  }, []);

  const toggleSim = async () => {
    if (simRunning) {
      engine.stop();
      project.clearSimulationProps();
      setSim(false);
      return;
    }
    if (starting || !project.synced) return;
    setStarting(true);
    try {
      const boards = snapshot.parts.filter((p) => PARTS[p.type].mcu);
      let noToolchain = false;
      for (const b of boards) {
        const r = await compileSketch(project.sketch(b.id).toString(), PARTS[b.type].mcu!.fqbn, { projectId: project.room, boardId: b.id });
        if (r.ok && r.hex) {
          engine.setProgram(b.id, r.hex);
        } else if (r.missingToolchain) {
          if (guest) { showToast('El compilador no está disponible. Inténtalo de nuevo; la simulación no se ha iniciado.'); return; }
          noToolchain = true;
          engine.setProgram(b.id, null);
        } else {
          setStarting(false);
          openCode(b.id, 'code');
          showToast(r.stderr.trim() || 'No se pudo compilar el programa. Revisa el panel de código.');
          return;
        }
      }
      engine.update(project.snapshot());
      engine.start();
      setSim(true);
      setStarting(false);
      if (noToolchain) showToast('Sin compilador en el servidor: el Arduino alimenta, pero no ejecuta código.');
    } catch {
      showToast('No se pudo iniciar la simulación. Inténtalo de nuevo.');
    } finally { setStarting(false); }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('Enlace copiado.', 'ok');
    } catch {
      showToast(location.href);
    }
  };

  const t = status.simTime;
  const board = snapshot.parts.find((p) => PARTS[p.type].mcu);
  const codeOpen = useUi((s) => s.codeFor !== null);

  return (
    <header className="topbar">
      <div className="tb-left">
        <a href="/" className="brand" aria-label="Volver al inicio">
          <Logo size={26} />
          <Wordmark size={15} />
        </a>
        {!guiding && !project.readOnly && <PanelToggle panel="library" />}
        <span className="crumb-sep">/</span>
        <ProjectFileMenu />
        <input
          className="project-name"
          value={name}
          size={Math.max(8, name.length)}
          onChange={(e) => setName(e.target.value)}
          readOnly={project.readOnly}
          onBlur={() => name.trim() && name !== project.name && project.setName(name.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Nombre del circuito"
        />
        <SyncBadge state={project.connection} synced={project.synced} />
        <span className="tb-divider" />
        <HintButton className="icon-btn" disabled={guiding || project.readOnly || !project.undo.canUndo()} onClick={() => project.undo.undo()} aria-label="Deshacer" title="Deshacer · Ctrl Z">
          <Undo2 size={16} />
        </HintButton>
        <HintButton className="icon-btn" disabled={guiding || project.readOnly || !project.undo.canRedo()} onClick={() => project.undo.redo()} aria-label="Rehacer" title="Rehacer · Ctrl ⇧ Z">
          <Redo2 size={16} />
        </HintButton>
      </div>

      <div className="sim-controls">
        {board && (
          <HintButton className={`btn ghost sm ${codeOpen ? 'is-on' : ''}`} onClick={() => openCode(codeOpen ? null : board.id, 'code')} aria-pressed={codeOpen} title="Código del Arduino">
            <Code2 size={14} /> <span className="btn-label">Código</span>
          </HintButton>
        )}
        {/* Transporte: el botón no se mueve al arrancar y el estado en vivo vive en la misma pieza. */}
        <div className={`sim-transport ${simRunning ? 'is-live' : ''}`}>
          <HintButton className={`sim-btn ${simRunning ? 'running' : ''}`} onClick={toggleSim} disabled={starting || (!simRunning && !project.synced) || guiding} title={guiding ? 'Cierra la guía de montaje para simular' : !simRunning && !project.synced ? 'Cargando el circuito' : guest ? 'Simula en tu navegador sin modificar el original' : undefined}>
            {starting ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : simRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {starting ? 'Compilando' : simRunning ? 'Detener' : 'Simular'}
          </HintButton>
          {simRunning && (
            <span className="sim-readout" title="Tiempo simulado · velocidad respecto al tiempo real">
              <span className="live-dot" aria-hidden />
              <span className="mono">{t.toFixed(t < 10 ? 2 : 1)} s</span>
              <span className={`speed mono ${status.speed < 0.9 ? 'slow' : ''}`}>{status.speed.toFixed(2)}×</span>
            </span>
          )}
        </div>
      </div>

      <div className="tb-right">
        {project.readOnly && (
          <span className="pill readonly-pill" title="Ver y simular: puedes simular y accionar los controles. Los cambios quedan solo en tu sesión.">
            <Eye size={12} aria-hidden /> <span className="readonly-pill-label">Ver y simular</span>
          </span>
        )}
        {!guiding && <PanelToggle panel="inspector" />}
        <div className="avatars" aria-label={`${peers.length + 1} personas en el circuito`}>
          {peers.slice(0, 5).map((p) => (
            <Avatar key={p.clientId} name={p.user.name} color={p.user.color} image={p.user.image} />
          ))}
          <Avatar name={`${project.user.name} (tú)`} color={project.user.color} image={project.user.image} me />
        </div>
        <PopoverPanel label="Historial de versiones" className="ui-history" open={historyOpen} onOpenChange={value=>{setHistoryOpen(value);if(value)setShareOpen(false);}} trigger={<HintButton className="btn sm" disabled={guest} title={guest?'Inicia sesión para consultar versiones':'Historial de versiones'}><HistoryIcon size={14}/>Historial</HintButton>}>
          <HistoryPanel/>
        </PopoverPanel>
        {CLOUD&&!guest ? <PopoverPanel label="Compartir circuito" className="ui-sharing" open={shareOpen} onOpenChange={value=>{setShareOpen(value);if(value)setHistoryOpen(false);}} trigger={<button className="btn primary sm"><Link2 size={14}/>Compartir</button>}><SharePopover/></PopoverPanel> : <HintButton className="btn primary sm" onClick={()=>void share()}><Link2 size={14}/>Compartir</HintButton>}
        {CLOUD && (guest ? <a className="btn sm" href={`?p=${project.room}&signin=1`}>Iniciar sesión</a> : <UserButton />)}
      </div>
    </header>
  );
}

/** Recoge o despliega un panel lateral (Ctrl+[ y Ctrl+]). */
function PanelToggle({ panel }: { panel: 'library' | 'inspector' }) {
  const closed = useUi((s) => s.collapsed[panel]);
  const toggle = useUi((s) => s.togglePanel);
  const left = panel === 'library';
  const Icon = left ? (closed ? PanelLeftOpen : PanelLeftClose) : closed ? PanelRightOpen : PanelRightClose;
  const what = left ? 'componentes' : 'propiedades';
  return (
    <HintButton className="icon-btn panel-toggle" onClick={() => toggle(panel)} aria-pressed={!closed} aria-label={`${closed ? 'Mostrar' : 'Ocultar'} el panel de ${what}`} title={`${closed ? 'Mostrar' : 'Ocultar'} ${what} · Ctrl+${left ? '[' : ']'}`}>
      <Icon size={16} />
    </HintButton>
  );
}

function SyncBadge({ state, synced }: { state: string; synced: boolean }) {
  if (state === 'local') {
    return (
      <span className="sync connected" title="Sin servidor de colaboración: el circuito se guarda en este navegador.">
        <HardDrive size={13} />
        <span>Este equipo</span>
      </span>
    );
  }
  const label = state === 'connected' ? (synced ? 'En línea' : 'Sincronizando') : state === 'connecting' ? 'Conectando' : 'Sin conexión';
  return (
    <span className={`sync ${state}`} title={state === 'disconnected' ? 'Los cambios se guardan en este equipo y se enviarán al reconectar.' : label}>
      {state === 'disconnected' ? <WifiOff size={13} /> : <span className="dot" />}
      <span>{label}</span>
    </span>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ['Cable desde un pin', ['Clic']],
  ['Doblar el cable', ['Clic', 'lienzo']],
  ['Cable recto', ['⇧']],
  ['Selección por rectángulo', ['Arrastrar']],
  ['Rotar', ['R']],
  ['Voltear', ['F']],
  ['Cambiar nombre', ['F2']],
  ['Copiar · Pegar', ['Ctrl', 'C', 'V']],
  ['Duplicar', ['Ctrl', 'D']],
  ['Seleccionar todo', ['Ctrl', 'A']],
  ['Eliminar', ['Supr']],
  ['Deseleccionar', ['Esc']],
  ['Deshacer lo tuyo', ['Ctrl', 'Z']],
  ['Rehacer', ['Ctrl', 'Y']],
  ['Mover la vista', ['Espacio']],
  ['Zoom', ['Rueda']],
  ['Ajustar a la vista', ['⇧', '1']],
  ['Menú de acciones', ['Clic derecho']],
  ['Buscar componente', ['/']],
];

/** Paso de los orificios de la protoboard: 10 unidades del lienzo = 2,54 mm (0,1"). */
const MM_PER_UNIT = 0.254;

/** Coordenadas del cursor, zoom y selección: la barra de estado de cualquier CAD. */
function CanvasReadout() {
  const pointer = useUi((s) => s.pointer);
  const zoom = useUi((s) => s.viewport.zoom);
  const parts = useUi((s) => s.selection.length);
  const wires = useUi((s) => s.wireSelection.length);
  const view = useUi((s) => s.view);
  if (view === 'design') return null;
  const sel = parts + wires;
  const fmt = (v: number) => (v * MM_PER_UNIT).toFixed(2).replace('.', ',');
  return (
    <>
      {sel > 0 && (
        <span className="item">
          {[
            parts > 0 && (parts === 1 ? '1 pieza seleccionada' : `${parts} piezas seleccionadas`),
            wires > 0 && (wires === 1 ? '1 cable seleccionado' : `${wires} cables seleccionados`),
          ].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className="item mono coords" title="Posición del cursor (rejilla de 2,54 mm)">
        X {pointer ? fmt(pointer.x) : '—'} · Y {pointer ? fmt(pointer.y) : '—'} mm
      </span>
      <span className="item mono" title="Rejilla">Rejilla 2,54 mm</span>
      <span className="item mono" title="Zoom">{Math.round(zoom * 50)} %</span>
    </>
  );
}

export function StatusBar() {
  const snapshot = useSnapshot();
  const peers = usePeers();
  const status = useSimStatus();
  const simRunning = useUi((s) => s.simRunning);
  const { project } = useEditor();
  const [keys, setKeys] = useState(false);

  return (
    <footer className="statusbar">
      <span className="item">
        {project.connection === 'connected' || project.connection === 'local' ? <Wifi size={12} /> : <WifiOff size={12} />}
        {peers.length === 0 ? 'Solo tú' : `${peers.length + 1} conectados`}
        <Users size={12} style={{ display: peers.length ? 'inline' : 'none' }} />
      </span>
      <span className="item">
        {snapshot.parts.length} componentes · {snapshot.wires.length} cables
      </span>
      {simRunning && (
        <span className={`item ${status.converged ? 'ok' : 'warn'}`}>
          {status.converged ? <Cpu size={12} /> : <AlertTriangle size={12} />}
          {status.message ?? `${status.nodes} nodos · estable`}
        </span>
      )}
      {simRunning && <SpiceChip />}
      <span className="grow" />
      <CanvasReadout />
      <PopoverPanel label="Atajos de teclado" className="ui-shortcuts" side="top" open={keys} onOpenChange={setKeys} trigger={<button className="btn ghost sm"><Keyboard size={13}/>Atajos</button>}>
        <div className="shortcuts">{SHORTCUTS.map(([label,combo])=><FragmentRow key={label} label={label} combo={combo}/>)}</div>
      </PopoverPanel>
    </footer>
  );
}

function FragmentRow({ label, combo }: { label: string; combo: string[] }) {
  return (
    <>
      <span>{label}</span>
      <span>
        {combo.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
      </span>
    </>
  );
}

function Avatar({ name, color, image, me = false }: { name: string; color: string; image?: string | null; me?: boolean }) {
  return (
    <span className={`avatar ${me ? 'me' : ''}`} style={{ background: color }} title={name}>
      {image ? <img src={image} alt="" /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}
