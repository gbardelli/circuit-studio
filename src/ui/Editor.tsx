import { HintProvider } from './Overlays';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, Component, SlidersHorizontal, X } from 'lucide-react';
import { Project } from '../collab/project';
import { withStacks } from '../parts/stack';
import { PARTS } from '../parts';
import { schematicPlacement, withFrozenPlacement } from './schematic';
import { applyTemplate, findTemplate, templateUpdate } from '../collab/applyTemplate';
import { SimClient } from '../sim/client';
import { Canvas, isTyping } from './Canvas';
import { EditorContext, useEditor, useSnapshot, type EditorCtx } from './context';
import { Inspector } from './Inspector';
import { Library, LibDragFloat } from './Library';
import { StatusBar, TopBar } from './TopBar';
import { focusPartName, useUi } from './store';
import { DesignCanvas } from './design/DesignCanvas';
import { rememberProject } from './Home';
import { CLOUD, api, type ProjectDetail } from '../cloud';
import { Logo } from './Logo';
import { useStartupTask } from './Startup';
import { useAutoVersions } from './History';
import { AssemblyStage } from './AssemblyStage';
import { WorkbenchPanel, WorkbenchRail } from './Workbench';

// CodeMirror pesa: se descarga al abrir el panel de código por primera vez.
const BottomPanel = lazy(() => import('./CodePanel').then((m) => ({ default: m.BottomPanel })));

export function Editor({ room, template }: { room: string; template: string | null }) {
  const [ctx, setCtx] = useState<EditorCtx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<{ name: string; readOnly: boolean; run: () => void } | null>(null);
  const [update, setUpdate] = useState<{ name: string; run: () => void } | null>(null);
  useStartupTask('project', !ctx && !error);
  // El proyecto (WebSocket + IndexedDB) nace y muere con el efecto: seguro ante StrictMode y recarga en caliente.
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    (async () => {
      let detail: ProjectDetail | null = null;
      if (CLOUD) {
        try {
          detail = await api<ProjectDetail>(`/api/projects/${room}${new URLSearchParams(location.search).has('view') ? '?view=1' : ''}`);
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
          return;
        }
      }
      if (cancelled) return;
      dispose = open(detail);
    })();
    return () => {
      cancelled = true;
      dispose();
    };
  }, [room, template]);

  function open(detail: ProjectDetail | null) {
    const project = new Project(room, detail?.role ?? 'owner');
    const engine = new SimClient(room);
    setCtx({ project, engine, detail });
    let seeded = false;
    const seed = (synced: boolean) => {
      const t = findTemplate(template);
      if (!synced || seeded) return;
      seeded = true;
      // «&replace=1» cambia el contenido de un circuito existente por la plantilla; queda en el
      // historial de versiones y Ctrl+Z lo deshace. Es destructivo y llega por un enlace: se pide
      // confirmación en un diálogo de la app, y solo quien puede editar.
      // Dentro de un iframe ajeno no se ofrece (evita que otra página haga pulsar «Reemplazar»).
      const wantsReplace = new URLSearchParams(location.search).get('replace') === '1' && !!t && project.parts.size > 0 && window.top === window.self;
      if (wantsReplace) setReplacing({ name: t!.name, readOnly: project.readOnly, run: () => replaceWith(project, t!) });
      if (t && !project.readOnly && project.parts.size === 0) {
        applyTemplate(project, t);
        project.undo.clear();
      }
      if (template) history.replaceState(null, '', `?p=${room}`);
      if (!wantsReplace) setTimeout(checkUpdate, 600);
    };
    // Circuito hecho con una plantilla que luego cambió: se ofrece actualizarlo (sin enlaces).
    // Se comprueba cuando ya llegaron las piezas (del servidor o de la copia local).
    let offered = false;
    const checkUpdate = () => {
      if (offered || project.readOnly || project.parts.size === 0 || window.top !== window.self) return;
      const newer = templateUpdate(project.meta, project.name);
      offered = true;
      if (newer) setUpdate({ name: newer.name, run: () => replaceWith(project, newer) });
    };
    project.persistence.once('synced', () => setTimeout(checkUpdate, 600));
    if (project.provider) {
      project.provider.on('sync', seed);
      // Servidor caído: se siembra igualmente tras cargar la copia local.
      project.persistence.once('synced', () => setTimeout(() => !project.synced && seed(true), 1500));
    } else {
      project.persistence.once('synced', () => seed(true));
    }
    return () => {
      engine.dispose();
      project.destroy();
      setCtx(null);
      useUi.getState().setSim(false);useUi.getState().resetAssembly();
      useUi.getState().pinSignal(null);useUi.getState().setAssemblyWire(null);useUi.getState().setLabPanel(null);useUi.getState().setCommandOpen(false);useUi.getState().select([]);
    };
  }

  if (error) {
    return (
      <div className="splash">
        <div className="gate">
          <Logo size={36} />
          <h1>No puedes abrir este circuito</h1>
          <p>{error}. Pide a quien lo creó que comparta el enlace con acceso.</p>
          <a className="btn primary" href={`?p=${encodeURIComponent(room)}&signin=1`}>
            Iniciar sesión
          </a>
        </div>
      </div>
    );
  }
  if (!ctx) return null;
  return (
    <EditorContext.Provider value={ctx}>
      <EditorShell />
      {update && (
        <div role="status" className="template-update">
          <strong>Hay una versión nueva de «{update.name}».</strong>
          <span>Actualizar cambia todo el montaje por el nuevo; la versión actual queda en Historial.</span>
          <button className="btn primary" onClick={() => { update.run(); setUpdate(null); }}>Actualizar</button>
          <button className="btn" onClick={() => setUpdate(null)}>Ahora no</button>
        </div>
      )}
      {replacing && (
        <div className="splash" role="dialog" aria-modal="true" aria-label="Reemplazar circuito" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)' }}>
          <div className="gate">
            <h1>{replacing.readOnly ? 'No se puede reemplazar' : 'Reemplazar el circuito'}</h1>
            <p>
              {replacing.readOnly
                ? 'Con esta cuenta el circuito es solo de lectura. Inicia sesión con la cuenta propietaria o una con permiso de edición.'
                : `Todo el contenido de este circuito se cambiará por «${replacing.name}». Podrás recuperar la versión actual desde Historial.`}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn" onClick={() => setReplacing(null)}>{replacing.readOnly ? 'Cerrar' : 'Cancelar'}</button>
              {!replacing.readOnly && (
                <button className="btn primary" onClick={() => { replacing.run(); setReplacing(null); }}>Reemplazar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </EditorContext.Provider>
  );
}

function replaceWith(project: Project, t: NonNullable<ReturnType<typeof findTemplate>>) {
  const snap = project.snapshot();
  project.deleteItems(snap.parts.map((q) => q.id), snap.wires.map((w) => w.id));
  applyTemplate(project, t);
}

export function EditorShell() {
  const { project, engine } = useEditor();
  const snapshot = useSnapshot();
  const toast = useUi((s) => s.toast);
  const compactPanel = useUi((s) => s.compactPanel);
  const guiding=useUi(s=>s.labPanel==='assembly'&&s.assemblyTab==='steps');
  const view = useUi((s) => s.view);
  const labFullscreen=useUi(s=>s.labFullscreen);
  const collapsed = useUi((s) => s.collapsed);
  const setCompactPanel = useUi((s) => s.setCompactPanel);

  useEffect(() => {
    if (project.readOnly && new URLSearchParams(location.search).has('view')) {
      useUi.setState({ collapsed: { library: true, inspector: true }, compactPanel: null });
    }
  }, [project]);

  useAutoVersions(project, snapshot);

  // El motor sigue al documento: cambios de topología reconstruyen, cambios de valores no.
  useEffect(() => engine.update(snapshot), [engine, snapshot]);

  useEffect(() => {
    const t = setTimeout(() => {
      rememberProject(project.room, project.name, snapshot);
      // Miniatura y nombre para el panel de circuitos (solo quien puede editar).
      if (CLOUD && !project.readOnly && project.synced) {
        void api(`/api/projects/${project.room}`, { method: 'PATCH', body: JSON.stringify({ name: project.name, preview: snapshot }) }).catch(() => {});
      }
    }, CLOUD ? 2500 : 600);
    return () => clearTimeout(t);
  }, [project, snapshot]);

  const shortcuts = useMemo(
    () => (e: KeyboardEvent) => {
      if(e.defaultPrevented)return;
      const ui = useUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if(mod && key==='k'){e.preventDefault();e.stopPropagation();ui.setCommandOpen(!ui.commandOpen);return;}
      if (isTyping(e) || (e.target as Element)?.closest?.('.workbench-panel,[data-menu-popup]')) return;
      // El lienzo del modo diseño atiende sus propios atajos.
      if (ui.view === 'design' && !(mod && (e.key === '[' || e.key === ']' || key === 'z' || key === 'y'))) return;
      if(ui.labFullscreen || (ui.labPanel==='assembly'&&ui.assemblyTab==='steps')) return;
      if (mod && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        ui.togglePanel(e.key === '[' ? 'library' : 'inspector');
        return;
      }
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (!project.readOnly) project.undo.undo();
      } else if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) {
        e.preventDefault();
        if (!project.readOnly) project.undo.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        if (ui.selection.length) ui.select(project.duplicate(ui.selection, 20, 20), []);
      } else if (mod && key === 'c' && ui.selection.length) {
        e.preventDefault();
        ui.setClipboard([...ui.selection]);
        ui.showToast(ui.selection.length === 1 ? 'Pieza copiada. Ctrl V para pegarla.' : `${ui.selection.length} piezas copiadas. Ctrl V para pegarlas.`, 'ok');
      } else if (mod && key === 'v' && ui.clipboard.length) {
        e.preventDefault();
        if (project.readOnly) return;
        const all = project.snapshot().parts;
        const ids = ui.clipboard.filter((id) => all.some((p) => p.id === id));
        if (!ids.length) { ui.showToast('Las piezas copiadas ya no están en el circuito.'); return; }
        // Pegar bajo el cursor (protoboard) o desplazado, como en Figma o KiCad.
        let dx = 20, dy = 20;
        const at = ui.pointer;
        if (at && ui.view === 'board') {
          const copied = all.filter((p) => ids.includes(p.id));
          const cx = copied.reduce((s, p) => s + p.x, 0) / copied.length;
          const cy = copied.reduce((s, p) => s + p.y, 0) / copied.length;
          dx = Math.round((at.x - cx) / 10) * 10;
          dy = Math.round((at.y - cy) / 10) * 10;
          if (dx === 0 && dy === 0) { dx = 20; dy = 20; }
        }
        ui.select(project.duplicate(ids, dx, dy), []);
      } else if (key === 'f2' && ui.selection.length === 1) {
        e.preventDefault();
        focusPartName(ui.selection[0]);
      } else if (key === 'escape' && (ui.selection.length || ui.wireSelection.length) && !ui.placing) {
        ui.select([], []);
      } else if (mod && key === 'a') {
        e.preventDefault();
        const snap = project.snapshot();
        ui.select(
          snap.parts.map((p) => p.id),
          snap.wires.map((w) => w.id),
        );
      } else if (key === 'delete' || key === 'backspace') {
        if (ui.selection.length || ui.wireSelection.length) {
          e.preventDefault();
          project.deleteItems(ui.selection, ui.wireSelection);
          ui.select([], []);
        }
      } else if (key === 'f' && !mod && ui.selection.length) {
        // Voltear: solo piezas que lo admiten (LED…), cada una sobre su propio eje. Una placa con
        // shield voltea la pila entera: pantalla arriba o placa arriba.
        const parts = project.snapshot().parts;
        const ids = new Set(withStacks(ui.selection, parts));
        for (const p of parts)
          if (ids.has(p.id) && PARTS[p.type]?.fields?.some((f) => f.key === 'flip')) project.setProp(p.id, 'flip', !p.props.flip);
      } else if (key === 'r' && !mod && ui.selection.length) {
        if (ui.view === 'schematic') project.rotateSchematic(ui.selection, schematicPlacement(project.snapshot().parts));
        else project.rotateParts(ui.selection);
      } else if (key === '/' && !mod) {
        e.preventDefault();
        document.getElementById('lib-search')?.focus();
      } else if (key.startsWith('arrow') && ui.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key]!;
        const all = project.snapshot().parts;
        const parts = all.filter((p) => ui.selection.includes(p.id));
        if (ui.view === 'schematic') {
          const pos = schematicPlacement(all);
          project.moveSchematic(withFrozenPlacement(all, parts.map((p) => ({ id: p.id, x: pos.get(p.id)!.x + d[0], y: pos.get(p.id)!.y + d[1] }))));
        } else project.moveParts(parts.map((p) => ({ id: p.id, x: p.x + d[0], y: p.y + d[1] })));
      }
    },
    [project],
  );

  useEffect(() => {
    window.addEventListener('keydown', shortcuts,true);
    return () => window.removeEventListener('keydown', shortcuts,true);
  }, [shortcuts]);

  return (
    <HintProvider><div className="app" data-panel={compactPanel ?? ''} data-lib={guiding || project.readOnly || collapsed.library ? 'closed' : 'open'} data-insp={guiding || collapsed.inspector ? 'closed' : 'open'}>
      <TopBar />
      <div className="compact-panels float" style={guiding?{display:'none'}:undefined} role="toolbar" aria-label="Paneles">
        <button className={`icon-btn ${compactPanel === 'library' ? 'on' : ''}`} aria-label="Componentes" aria-pressed={compactPanel === 'library'} title="Componentes" onClick={() => setCompactPanel(compactPanel === 'library' ? null : 'library')}>
          {compactPanel === 'library' ? <X size={16} /> : <Component size={16} />}
        </button>
        <button className={`icon-btn ${compactPanel === 'inspector' ? 'on' : ''}`} aria-label="Propiedades" aria-pressed={compactPanel === 'inspector'} title="Propiedades" onClick={() => setCompactPanel(compactPanel === 'inspector' ? null : 'inspector')}>
          {compactPanel === 'inspector' ? <X size={16} /> : <SlidersHorizontal size={16} />}
        </button>
      </div>
      {!project.readOnly && <Library />}
      <LibDragFloat />
      <main className="workspace">
        <WorkbenchRail />
        <div className={`editor-canvas-slot ${guiding?'is-hidden':''}`}>{view === 'design' ? <DesignCanvas /> : <Canvas/>}</div>
        {guiding&&!labFullscreen&&<AssemblyStage/>}
        <WorkbenchPanel />
        <Suspense fallback={null}>
          <BottomPanel />
        </Suspense>
      </main>
      <Inspector />
      <StatusBar />
      {toast && (
        <div className="toast" role="status">
          {toast.tone === 'ok' ? <CheckCircle2 size={16} color="var(--green)" /> : <Info size={16} color="var(--accent-hi)" />}
          {toast.text}
        </div>
      )}
    </div></HintProvider>
  );
}
