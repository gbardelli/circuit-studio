import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { Project } from '../collab/project';
import { applyTemplate, findTemplate } from '../collab/applyTemplate';
import { SimEngine } from '../sim/engine';
import { Canvas, isTyping } from './Canvas';
import { EditorContext, useEditor, useSnapshot, type EditorCtx } from './context';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { StatusBar, TopBar } from './TopBar';
import { useUi } from './store';
import { rememberProject } from './Home';

// CodeMirror pesa: se descarga al abrir el panel de código por primera vez.
const BottomPanel = lazy(() => import('./CodePanel').then((m) => ({ default: m.BottomPanel })));

export function Editor({ room, template }: { room: string; template: string | null }) {
  const [ctx, setCtx] = useState<EditorCtx | null>(null);
  // El proyecto (WebSocket + IndexedDB) nace y muere con el efecto: seguro ante StrictMode y recarga en caliente.
  useEffect(() => {
    const project = new Project(room);
    const engine = new SimEngine();
    setCtx({ project, engine });
    let seeded = false;
    const seed = (synced: boolean) => {
      const t = findTemplate(template);
      if (!synced || seeded) return;
      seeded = true;
      if (t && project.parts.size === 0) {
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
      engine.stop();
      project.destroy();
      setCtx(null);
      useUi.getState().setSim(false);
    };
  }, [room, template]);

  if (!ctx) return null;
  return (
    <EditorContext.Provider value={ctx}>
      <EditorShell />
    </EditorContext.Provider>
  );
}

function EditorShell() {
  const { project, engine } = useEditor();
  const snapshot = useSnapshot();
  const toast = useUi((s) => s.toast);

  // El motor sigue al documento: cambios de topología reconstruyen, cambios de valores no.
  useEffect(() => engine.update(snapshot), [engine, snapshot]);

  useEffect(() => {
    const t = setTimeout(() => rememberProject(project.room, project.name, snapshot), 600);
    return () => clearTimeout(t);
  }, [project, snapshot]);

  const shortcuts = useMemo(
    () => (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ui = useUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        project.undo.undo();
      } else if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) {
        e.preventDefault();
        project.undo.redo();
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
      } else if (key === 'r' && !mod && ui.selection.length) {
        project.rotateParts(ui.selection);
      } else if (key === '/' && !mod) {
        e.preventDefault();
        document.getElementById('lib-search')?.focus();
      } else if (key.startsWith('arrow') && ui.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key]!;
        const snap = project.snapshot();
        project.moveParts(snap.parts.filter((p) => ui.selection.includes(p.id)).map((p) => ({ id: p.id, x: p.x + d[0], y: p.y + d[1] })));
      }
    },
    [project],
  );

  useEffect(() => {
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [shortcuts]);

  return (
    <div className="app">
      <TopBar />
      <Library />
      <main className="workspace">
        <Canvas />
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
    </div>
  );
}
