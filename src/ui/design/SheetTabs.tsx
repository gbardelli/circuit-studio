import { Cpu, LayoutGrid, Plus } from 'lucide-react';
import { MAIN_SHEET } from '../../logic/types';
import { useEditor } from '../context';
import { useDesignUi } from './store';
import { useSheets } from './useLogic';

/** Crea un integrado vacío con nombre y referencia libres, y lo abre. */
export function useCreateIc() {
  const { project } = useEditor();
  return () => {
    const n = project.design.ics().length + 1;
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
  return (
    <div className="float d-sheets" role="tablist" aria-label="Hojas del diseño">
      <button role="tab" aria-selected={current === MAIN_SHEET} className={current === MAIN_SHEET ? 'on' : ''} onClick={() => setSheet(MAIN_SHEET)}>
        <LayoutGrid size={13} /> Principal
      </button>
      {ics.map((s) => (
        <button key={s.id} role="tab" aria-selected={current === s.id} className={current === s.id ? 'on' : ''} onClick={() => setSheet(s.id)} title={`${s.part} · ${s.name}`}>
          <Cpu size={13} /> {s.name || s.part || 'Integrado'}
        </button>
      ))}
      {!project.readOnly && (
        <button className="d-new" onClick={create} title="Nuevo integrado propio" aria-label="Nuevo integrado propio">
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}
