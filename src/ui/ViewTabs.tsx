import { Binary, Box, CircuitBoard, Workflow } from 'lucide-react';
import { useUi, type View } from './store';
import { load3d, view3dClock } from './view3d';

const TABS: { view: View; label: string; Icon: typeof Binary; hint: string }[] = [
  { view: 'board', label: 'Protoboard', Icon: CircuitBoard, hint: 'Montaje físico con piezas reales' },
  { view: 'schematic', label: 'Esquema', Icon: Workflow, hint: 'El mismo circuito como plano' },
  { view: 'design', label: 'Diseño', Icon: Binary, hint: 'Lógica ideal e integrados propios' },
];

/** Vista del lienzo: protoboard y esquema comparten el circuito; diseño tiene sus propias hojas. */
export function ViewTabs() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const setBoard3d = useUi((s) => s.setBoard3d);
  return (
    <div className="float view-float" role="tablist" aria-label="Vista">
      {TABS.map(({ view: v, label, Icon, hint }) => (
        <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)} title={hint}>
          <Icon size={14} /> {label}
        </button>
      ))}
      <span className="sep" aria-hidden />
      <button
        className="view-3d-btn"
        title="Ver el montaje en 3D"
        onPointerEnter={() => void load3d()}
        onFocus={() => void load3d()}
        onClick={() => {
          view3dClock.clickedAt = performance.now();
          if (view !== 'board') setView('board');
          setBoard3d(true);
        }}
      >
        <Box size={14} /> 3D
      </button>
    </div>
  );
}
