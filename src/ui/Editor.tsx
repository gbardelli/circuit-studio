import { HintProvider } from './Overlays';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, Component, SlidersHorizontal, X } from 'lucide-react';
import { Project } from '../collab/project';
import { PARTS } from '../parts';
import { schematicPlacement, withFrozenPlacement } from './schematic';
import { applyTemplate, findTemplate } from '../collab/applyTemplate';
import { SimClient } from '../sim/client';
import { Canvas, isTyping } from './Canvas';
import { EditorContext, useEditor, useSnapshot, type EditorCtx } from './context';
import { Inspector } from './Inspector';
import { Library, LibDragFloat } from './Library';
import { StatusBar, TopBar } from './TopBar';
import { useUi } from './store';
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
      if (t && project.parts.size === 0 && !project.readOnly) {
        applyTemplate(project, t);
        project.undo.clear();
      }
      if (template) history.replaceState(null, '', `?p=${room}`);
    };
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
    </EditorContext.Provider>
  );
}

export function EditorShell() {
  const { project, engine } = useEditor();
  const snapshot = useSnapshot();
  const toast = useUi((s) => s.toast);
  const compactPanel = useUi((s) => s.compactPanel);
  const guiding=useUi(s=>s.labPanel==='assembly'&&s.assemblyTab==='steps');
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
        // Voltear: solo piezas que lo admiten (LED…), cada una sobre su propio eje.
        for (const p of project.snapshot().parts)
          if (ui.selection.includes(p.id) && PARTS[p.type]?.fields?.some((f) => f.key === 'flip')) project.setProp(p.id, 'flip', !p.props.flip);
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
        <div className={`editor-canvas-slot ${guiding?'is-hidden':''}`}><Canvas/></div>
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
