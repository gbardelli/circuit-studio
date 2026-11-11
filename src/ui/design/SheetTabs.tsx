import { Cpu, LayoutGrid, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MAIN_SHEET } from '../../logic/types';
import { useEditor } from '../context';
import { useDesignUi } from './store';
import { useSheets } from './useLogic';

/** Crea un integrado vacío con nombre y referencia libres, y lo abre. */
export function useCreateIc() {
  const { project } = useEditor();
  return () => {
    // Primer número libre, para no repetir «Integrado 3» después de borrar uno.
    const taken = new Set(project.design.ics().map((s) => s.name));
    let n = 1;
    while (taken.has(`Integrado ${n}`)) n++;
    const id = project.design.createIc(`Integrado ${n}`, `CS-${String(n).padStart(3, '0')}`);
    useDesignUi.getState().setSheet(id);
    return id;
  };
}

export function SheetTabs() {
  const { project } = useEditor();
  const sheets = useSheets();
  const current = useDesignUi((s) => s.sheet);
  const setSheet = useDesignUi((s) => s.setSheet);
  const create = useCreateIc();
  const ics = sheets.filter((s) => s.kind === 'ic');
  const list = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  // La hoja abierta siempre queda a la vista, aunque haya muchas.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current, ics.length]);
  // El borde se desvanece solo si quedan pestañas ocultas a la derecha.
  const fade = () => {
    const el = list.current;
    if (el) {
      el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    }
  };
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    fade();
    const ro = new ResizeObserver(fade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ics.length]);
  return (
    <div className="float d-sheets">
      <div
        ref={list}
        className="d-sheet-list"
        role="tablist"
        aria-label="Hojas del diseño"
        onScroll={fade}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        <button role="tab" aria-selected={current === MAIN_SHEET} className={current === MAIN_SHEET ? 'on' : ''} onClick={() => setSheet(MAIN_SHEET)}>
          <LayoutGrid size={13} /> Principal
        </button>
        {ics.map((s) => (
          <button key={s.id} role="tab" aria-selected={current === s.id} className={current === s.id ? 'on' : ''} onClick={() => setSheet(s.id)} title={`${s.part} · ${s.name}`}>
            <Cpu size={13} /> {s.name || s.part || 'Integrado'}
          </button>
        ))}
      </div>
      {overflow && <select className="d-sheet-picker" aria-label="Ir a una hoja" value="" onChange={e => { if (e.target.value) setSheet(e.target.value); }}>
        <option value="">Todas las hojas</option>
        <option value={MAIN_SHEET}>Principal</option>
        {ics.map(s => <option key={s.id} value={s.id}>{s.name || s.part || 'Integrado'}</option>)}
      </select>}
      {!project.readOnly && (
        <button className="d-new" onClick={create} title="Nuevo integrado propio" aria-label="Nuevo integrado propio">
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}
