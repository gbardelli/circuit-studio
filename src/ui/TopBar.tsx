import { useEffect, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD, api, type LinkAccess } from '../cloud';
import { AlertTriangle, Check, Code2, Copy, Cpu, Eye, Globe, HardDrive, Lock, Keyboard, Link2, Loader2, Play, Redo2, Square, Undo2, Users, Wifi, WifiOff } from 'lucide-react';
import { compileSketch } from '../sim/compile';
import { useConnection, useEditor, usePeers, useSimStatus, useSnapshot } from './context';
import { Logo, Wordmark } from './Logo';
import { PARTS } from '../parts';
import { useUi } from './store';

export function TopBar() {
  const { project, engine } = useEditor();
  const snapshot = useSnapshot();
  const peers = usePeers();
  useConnection();
  const simRunning = useUi((s) => s.simRunning);
  const setSim = useUi((s) => s.setSim);
  const openCode = useUi((s) => s.openCode);
  const showToast = useUi((s) => s.showToast);
  const status = useSimStatus();
  const [starting, setStarting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [, force] = useState(0);

  useEffect(() => setName(project.name), [project.name]);
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
      showToast('Enlace copiado. Quien lo abra podrá editar contigo.', 'ok');
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
        <button className="icon-btn" disabled={!project.undo.canUndo()} onClick={() => project.undo.undo()} aria-label="Deshacer" title="Deshacer · Ctrl Z">
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" disabled={!project.undo.canRedo()} onClick={() => project.undo.redo()} aria-label="Rehacer" title="Rehacer · Ctrl ⇧ Z">
          <Redo2 size={16} />
        </button>
      </div>

      <div className="sim-controls">
        {board && (
          <button className={`btn ghost sm ${codeOpen ? 'is-on' : ''}`} onClick={() => openCode(codeOpen ? null : board.id, 'code')} aria-pressed={codeOpen} title="Código del Arduino">
            <Code2 size={14} /> Código
          </button>
        )}
        <button className={`sim-btn ${simRunning ? 'running' : ''}`} onClick={toggleSim} disabled={starting}>
          {starting ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : simRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          {starting ? 'Compilando' : simRunning ? 'Detener' : 'Simular'}
        </button>
        {simRunning && (
          <span className="sim-readout">
            <span className="mono">{t.toFixed(t < 10 ? 2 : 1)} s</span>
            <span className={`speed mono ${status.speed < 0.9 ? 'slow' : ''}`}>{status.speed.toFixed(2)}×</span>
          </span>
        )}
      </div>

      <div className="tb-right">
        {project.readOnly && (
          <span className="pill" title="Puedes mirar y simular, pero no modificar el circuito">
            <Eye size={12} /> Solo lectura
          </span>
        )}
        <div className="avatars" aria-label={`${peers.length + 1} personas en el circuito`}>
          {peers.slice(0, 5).map((p) => (
            <Avatar key={p.clientId} name={p.user.name} color={p.user.color} image={p.user.image} />
          ))}
          <Avatar name={`${project.user.name} (tú)`} color={project.user.color} image={project.user.image} me />
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn primary sm" onClick={() => (CLOUD ? setShareOpen((o) => !o) : share())} aria-expanded={shareOpen}>
            <Link2 size={14} /> Compartir
          </button>
          {shareOpen && <SharePopover onClose={() => setShareOpen(false)} onCopy={share} />}
        </div>
        {CLOUD && <UserButton />}
      </div>
    </header>
  );
}

function SyncBadge({ state, synced }: { state: string; synced: boolean }) {
  if (state === 'local') {
    return (
      <span className="sync connected" title="Sin servidor de colaboración: el circuito se guarda en este navegador.">
        <HardDrive size={13} />
        <span>Guardado en este equipo</span>
      </span>
    );
  }
  const label = state === 'connected' ? (synced ? 'Guardado' : 'Sincronizando') : state === 'connecting' ? 'Conectando' : 'Sin conexión';
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!keys) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setKeys(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [keys]);

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
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="btn ghost sm" onClick={() => setKeys((k) => !k)} aria-expanded={keys}>
          <Keyboard size={13} /> Atajos
        </button>
        {keys && (
          <div className="popover" role="dialog" aria-label="Atajos de teclado">
            <div className="shortcuts">
              {SHORTCUTS.map(([label, combo]) => (
                <FragmentRow key={label} label={label} combo={combo} />
              ))}
            </div>
          </div>
        )}
      </div>
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
  { value: 'view', label: 'Pueden ver', hint: 'Con el enlace se mira y se simula, sin cambiar nada.' },
  { value: 'none', label: 'Restringido', hint: 'Solo quienes ya son miembros.' },
];

function SharePopover({ onClose, onCopy }: { onClose: () => void; onCopy: () => void }) {
  const { project, detail } = useEditor();
  const [access, setAccess] = useState<LinkAccess>(detail?.link_access ?? 'edit');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const owner = detail?.role === 'owner';

  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);

  const change = (value: LinkAccess) => {
    setAccess(value);
    void api(`/api/projects/${project.room}`, { method: 'PATCH', body: JSON.stringify({ linkAccess: value }) });
  };

  return (
    <div ref={ref} className="share-pop" role="dialog" aria-label="Compartir circuito">
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
            <button key={a.value} aria-pressed={access === a.value} onClick={() => change(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <ul className="share-members">
        {detail?.members.map((m) => (
          <li key={m.id}>
            <span className="avatar">{m.image ? <img src={m.image} alt="" /> : m.name.slice(0, 2).toUpperCase()}</span>
            <span className="name">{m.name}</span>
            <span className="faint">{m.role === 'owner' ? 'Propietario' : m.role === 'editor' ? 'Editor' : 'Lector'}</span>
          </li>
        ))}
      </ul>
      <button
        className="btn accent"
        style={{ width: '100%' }}
        onClick={() => {
          onCopy();
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar enlace'}
      </button>
    </div>
  );
}
