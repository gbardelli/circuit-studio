import { HintButton, PopoverPanel } from './Overlays';
import { useEffect, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD, api, type LinkAccess } from '../cloud';
import { AlertTriangle, Check, Code2, Copy, Cpu, Eye, Globe, HardDrive, Lock, Keyboard, Link2, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Redo2, Square, Undo2, Users, Wifi, WifiOff } from 'lucide-react';
import { compileSketch } from '../sim/compile';
import { useConnection, useEditor, usePeers, useSimStatus, useSnapshot } from './context';
import { Logo, Wordmark } from './Logo';
import { PARTS } from '../parts';
import { useUi } from './store';
import { HistoryIcon, HistoryPanel } from './History';

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
      setSim(false);
      return;
    }
    setStarting(true);
    const boards = snapshot.parts.filter((p) => PARTS[p.type].mcu);
    let noToolchain = false;
    for (const b of boards) {
      const r = await compileSketch(project.sketch(b.id).toString(), PARTS[b.type].mcu!.fqbn);
      if (r.ok && r.hex) {
        engine.setProgram(b.id, r.hex);
      } else if (r.missingToolchain) {
        noToolchain = true;
        engine.setProgram(b.id, null);
      } else {
        setStarting(false);
        openCode(b.id, 'code');
        showToast('El código tiene errores. Revísalos en el panel.');
        return;
      }
    }
    engine.update(project.snapshot());
    engine.start();
    setSim(true);
    setStarting(false);
    if (noToolchain) showToast('Sin compilador en el servidor: el Arduino alimenta, pero no ejecuta código.');
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
            <Code2 size={14} /> Código
          </HintButton>
        )}
        <HintButton className={`sim-btn ${simRunning ? 'running' : ''}`} onClick={toggleSim} disabled={starting || guest || guiding} title={guest ? 'Inicia sesión para simular' : undefined}>
          {starting ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : simRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          {starting ? 'Compilando' : simRunning ? 'Detener' : 'Simular'}
        </HintButton>
        {simRunning && (
          <span className="sim-readout">
            <span className="mono">{t.toFixed(t < 10 ? 2 : 1)} s</span>
            <span className={`speed mono ${status.speed < 0.9 ? 'slow' : ''}`}>{status.speed.toFixed(2)}×</span>
          </span>
        )}
      </div>

      <div className="tb-right">
        {project.readOnly && (
          <span className="pill" title="Este enlace permite explorar el circuito sin modificarlo">
            <Eye size={12} /> Solo lectura
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
  ['Rotar', ['R']],
  ['Duplicar', ['Ctrl', 'D']],
  ['Eliminar', ['Supr']],
  ['Deshacer lo tuyo', ['Ctrl', 'Z']],
  ['Mover la vista', ['Espacio']],
  ['Zoom', ['Rueda']],
  ['Buscar componente', ['/']],
];

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
      <span className="grow" />
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

const ACCESS: { value: LinkAccess; label: string; hint: string }[] = [
  { value: 'edit', label: 'Pueden editar', hint: 'Cualquiera con cuenta y el enlace entra como editor.' },
  { value: 'view', label: 'Pueden ver', hint: 'Cualquiera con el enlace puede verlo sin cuenta. Solo lectura.' },
  { value: 'none', label: 'Restringido', hint: 'Solo quienes ya son miembros.' },
];

function SharePopover() {
  const { project, detail } = useEditor();
  const [access, setAccess] = useState<LinkAccess>(detail?.link_access ?? 'edit');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const owner = detail?.role === 'owner';

  const change = async (value: LinkAccess) => {
    setBusy(true); setError(null);
    try {
      await api(`/api/projects/${project.room}`, { method: 'PATCH', body: JSON.stringify({ linkAccess: value }) });
      setAccess(value);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const copyView = async () => {
    setBusy(true); setError(null);
    try {
      if (access !== 'view') {
        if (!owner) throw new Error('El propietario debe activar «Pueden ver» para compartir sin cuenta.');
        await api(`/api/projects/${project.room}`, { method: 'PATCH', body: JSON.stringify({ linkAccess: 'view' }) });
        setAccess('view');
      }
      const url = new URL(location.href); url.search = new URLSearchParams({ p: project.room, view: '1' }).toString(); url.hash = '';
      await navigator.clipboard.writeText(url.href);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="share-pop">
      <div className="share-head">
        <strong>Compartir</strong>
        <span className="faint">{detail?.members.length ?? 1} miembros</span>
      </div>
      <div className="share-access">
        {access === 'none' ? <Lock size={15} /> : <Globe size={15} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>Con el enlace</div>
          <div className="faint" style={{ fontSize: 12 }}>{ACCESS.find((a) => a.value === access)!.hint}</div>
        </div>
      </div>
      {owner && (
        <div className="segmented" role="group" aria-label="Acceso con el enlace">
          {ACCESS.map((a) => (
            <HintButton key={a.value} aria-pressed={access === a.value} disabled={busy} onClick={() => void change(a.value)}>
              {a.label}
            </HintButton>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}
      <ul className="share-members">
        {detail?.members.map((m) => (
          <li key={m.id}>
            <span className="avatar">{m.image ? <img src={m.image} alt="" /> : m.name.slice(0, 2).toUpperCase()}</span>
            <span className="name">{m.name}</span>
            <span className="faint">{m.role === 'owner' ? 'Propietario' : m.role === 'editor' ? 'Editor' : 'Lector'}</span>
          </li>
        ))}
      </ul>
      <HintButton
        className="btn accent"
        style={{ width: '100%' }}
        disabled={busy}
        onClick={() => void copyView()}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : busy ? 'Preparando enlace…' : 'Copiar enlace de visualización'}
      </HintButton>
    </div>
  );
}
