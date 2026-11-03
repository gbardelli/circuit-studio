import { Binary, CircuitBoard, Workflow } from 'lucide-react';
import { useUi, type View } from './store';

const TABS: { view: View; label: string; Icon: typeof Binary; hint: string }[] = [
  { view: 'board', label: 'Protoboard', Icon: CircuitBoard, hint: 'Montaje físico con piezas reales' },
  { view: 'schematic', label: 'Esquema', Icon: Workflow, hint: 'El mismo circuito como plano' },
  { view: 'design', label: 'Diseño', Icon: Binary, hint: 'Lógica ideal e integrados propios' },
];

/** Vista del lienzo: protoboard y esquema comparten el circuito; diseño tiene sus propias hojas. */
export function ViewTabs() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <div className="float view-float" role="tablist" aria-label="Vista">
      {TABS.map(({ view: v, label, Icon, hint }) => (
        <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)} title={hint}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
