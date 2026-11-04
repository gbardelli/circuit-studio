// Paleta del modo diseño: ocupa el panel de la biblioteca. Clic para armar la herramienta o
// arrastrar hasta el lienzo; la búsqueda cubre también los 74HC y CD4000 como bloques.
import { ChevronDown, Cpu, LayoutTemplate, Plus, Search, X as Close } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { DESIGN_EXAMPLES } from '../../collab/designExamples';
import { baseElements, chipElements, elementDef, LOGIC_GROUPS, type ElementDef } from '../../logic/elements';
import { icDependencies } from '../../logic/sim';
import { IC_PREFIX, MAIN_SHEET, type LogicSheet } from '../../logic/types';
import { useEditor } from '../context';
import { place } from './geometry';
import { useCreateIc } from './SheetTabs';
import { useDesignUi } from './store';
import { Thumb } from './symbols';
import { useLookup, useSheets } from './useLogic';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function DesignPalette() {
  const { project } = useEditor();
  const sheets = useSheets();
  const lookup = useLookup();
  const sheet = useDesignUi((s) => s.sheet);
  const placing = useDesignUi((s) => s.placing);
  const [query, setQuery] = useState('');
  const [chipsOpen, setChipsOpen] = useState(false);
  const create = useCreateIc();

  const ics = useMemo(
    () => sheets.filter((s): s is LogicSheet => s.kind === 'ic' && s.id !== sheet && !icDependencies(s.id, lookup).has(sheet)).map((s) => elementDef(`${IC_PREFIX}${s.id}`, lookup)!).filter(Boolean),
    [sheets, sheet, lookup],
  );
  const all = useMemo(() => [...baseElements(), ...ics, ...chipElements().values()], [ics]);
  const q = fold(query.trim());
  const match = (d: ElementDef) => !q || fold([d.name, d.description, ...d.keywords].join(' ')).includes(q);

  return (
    <aside className="library d-palette" aria-label="Elementos del diseño">
      <div className="lib-head">
        <div className="search">
          <Search size={14} />
          <input id="lib-search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Puertas, biestables, 74HC…" aria-label="Buscar elementos" />
          {query ? (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
              <Close size={13} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
      </div>
      <div className="lib-body">
        {LOGIC_GROUPS.map((group) => {
          const items = all.filter((d) => d.group === group && match(d));
          const isChips = group === 'Integrados 74HC y CD4000';
          if (group === 'Mis integrados') {
            return (
              <section key={group} className="lib-section">
                <h3>{group}</h3>
                <div className="d-cards">
                  {items.map((d) => (
                    <Card key={d.kind} def={d} armed={placing === d.kind} />
                  ))}
                  {!project.readOnly && !q && (
                    <button className="d-card d-add" onClick={create}>
                      <span className="d-thumb">
                        <Plus size={18} />
                      </span>
                      <span className="d-meta">
                        <strong>Nuevo integrado</strong>
                        <small>Diséñalo y úsalo en la protoboard</small>
                      </span>
                    </button>
                  )}
                </div>
              </section>
            );
          }
          if (!items.length) return null;
          const open = !isChips || chipsOpen || Boolean(q);
          return (
            <section key={group} className="lib-section">
              {isChips && !q ? (
                <button className="d-fold" onClick={() => setChipsOpen(!chipsOpen)} aria-expanded={open}>
                  <Cpu size={13} /> {group} <span>{items.length}</span>
                  <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
                </button>
              ) : (
                <h3>{group}</h3>
              )}
              {open && (
                <div className="d-cards">
                  {items.map((d) => (
                    <Card key={d.kind} def={d} armed={placing === d.kind} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!project.readOnly && !q && sheet === MAIN_SHEET && (
          <section className="lib-section">
            <h3>Ejemplos</h3>
            <div className="d-cards">
              {DESIGN_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  className="d-card"
                  title={ex.description}
                  onClick={() => {
                    const ids = ex.insert(project.design, sheet);
                    const ui = useDesignUi.getState();
                    ui.select(ids);
                    ui.requestFit();
                  }}
                >
                  <span className="d-thumb">
                    <LayoutTemplate size={18} />
                  </span>
                  <span className="d-meta">
                    <strong>{ex.name}</strong>
                    <small>{ex.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {q && !all.some(match) && (
          <div className="empty">
            <Search size={18} />
            No hay elementos con «{query.trim()}»
          </div>
        )}
      </div>
    </aside>
  );
}

const Card = memo(function Card({ def, armed }: { def: ElementDef; armed: boolean }) {
  const lookup = useLookup();
  const placed = useMemo(() => place({ id: 'thumb', kind: def.kind, x: 0, y: 0, rot: 0, props: def.defaults }, lookup), [def, lookup]);
  const wasArmed = useRef(false);
  return (
    <button
      className={`d-card ${armed ? 'armed' : ''}`}
      onPointerDown={(e) => {
        // Arrastrar hasta el lienzo: se coloca al soltar (el lienzo atiende el pointerup).
        wasArmed.current = armed;
        if (e.button === 0) useDesignUi.getState().setPlacing(def.kind);
      }}
      onClick={() => useDesignUi.getState().setPlacing(wasArmed.current ? null : def.kind)}
      title={`${def.description}${def.key ? ` · Tecla ${def.key.toUpperCase()}` : ''}`}
      aria-pressed={armed}
    >
      <span className="d-thumb">{placed && <Thumb placed={placed} />}</span>
      <span className="d-meta">
        <strong>{def.name}</strong>
        <small>{def.description}</small>
      </span>
      {def.key && <kbd>{def.key.toUpperCase()}</kbd>}
    </button>
  );
});
