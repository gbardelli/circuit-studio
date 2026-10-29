import { memo, useMemo, useRef, useState } from 'react';
import { type LucideIcon, ArrowLeft, Binary, BatteryMedium, ChevronRight, Component, Cpu, Lightbulb, Search, Star, ToggleLeft, X } from 'lucide-react';
import { PARTS, PART_LIST } from '../parts';
import type { PartDef } from '../parts/types';
import { scorePart } from '../parts/search';
import { useUi } from './store';
import { CATALOG_SECTIONS, catalogGroups, partLabel, type CatalogSection } from './catalog';

const SECTION_ICON: Record<CatalogSection, LucideIcon> = {
  boards: Cpu, basic: Component, inputs: ToggleLeft,
  outputs: Lightbulb, logic: Binary, power: BatteryMedium,
};

function readList(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* sin persistencia */
  }
}

export function Library() {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<CatalogSection | null>(null);
  const [family, setFamily] = useState('');
  const [favs, setFavs] = useState(() => readList('cs-favs'));
  const [recent, setRecent] = useState(() => readList('cs-recent'));
  const body = useRef<HTMLDivElement>(null);
  const setPlacing = useUi((s) => s.setPlacing);
  const placing = useUi((s) => s.placing);
  const searching = Boolean(query.trim());
  const selected = CATALOG_SECTIONS.find((item) => item.id === section);
  const families = useMemo(() => section ? catalogGroups(section) : [], [section]);
  const results = useMemo(() => PART_LIST.map((d) => ({ d, score: scorePart(d, query) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ d }) => d), [query]);
  const byIds = (ids: string[]) => [...new Set(ids)].flatMap((id) => PARTS[id] ? [PARTS[id]] : []);
  const groups = searching
    ? [{ title: `Resultados · ${results.length}`, items: results }]
    : section ? families.filter((group) => !family || group.title === family)
    : [
      { title: 'Favoritos', items: byIds(favs) },
      { title: 'Recientes', items: byIds(recent.filter((id) => !favs.includes(id))) },
    ];

  const navigate = (next: CatalogSection | null) => {
    setSection(next);
    setFamily('');
    if (body.current) body.current.scrollTop = 0;
  };
  const remember = (type: string) => {
    const next = [type, ...recent.filter((id) => id !== type)].slice(0, 4);
    setRecent(next);
    writeList('cs-recent', next);
  };
  const toggleFav = (type: string) => {
    const next = favs.includes(type) ? favs.filter((id) => id !== type) : [...favs, type];
    setFavs(next);
    writeList('cs-favs', next);
  };

  return (
    <aside className="library" aria-label="Componentes">
      <div className="lib-head">
        <div className="search">
          <Search size={14} />
          <input id="lib-search" className="input" placeholder="Buscar nombre o referencia" value={query}
            onChange={(e) => { setQuery(e.target.value); if (body.current) body.current.scrollTop = 0; }} aria-label="Buscar componentes" />
          {query ? <button className="icon-btn" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={13} /></button> : <kbd>/</kbd>}
        </div>
        {selected && !searching && <div className="lib-location">
          <button className="lib-back" onClick={() => navigate(null)} aria-label="Todas las categorías"><ArrowLeft size={14} /></button>
          <h2>{selected.name}</h2>
        </div>}
        {section === 'logic' && !searching && <select className="input lib-family" aria-label="Familia de integrados" value={family} onChange={(e) => {
          setFamily(e.target.value); if (body.current) body.current.scrollTop = 0;
        }}>
          <option value="">Todas las familias</option>
          {families.map((group) => <option key={group.title} value={group.title}>{group.title}</option>)}
        </select>}
      </div>
      <div className="lib-body" ref={body}>
        {!section && !searching && <nav className="lib-categories" aria-label="Categorías de componentes">
          {CATALOG_SECTIONS.map((item) => {
            const Icon = SECTION_ICON[item.id];
            return <button key={item.id} className="lib-category" onClick={() => navigate(item.id)}>
              <Icon size={17} strokeWidth={1.6} />
              <span><strong>{item.name}</strong><small>{item.description}</small></span>
              <ChevronRight size={13} />
            </button>;
          })}
        </nav>}
        {groups.filter((group) => group.items.length).map((group) => <section key={group.title} className="lib-section">
          {(!family || searching) && <h3>{group.title}</h3>}
          <div className="cards">{group.items.map((def) => <PartCard key={def.type} def={def}
            armed={placing === def.type} fav={favs.includes(def.type)} onFav={() => toggleFav(def.type)}
            onPick={() => { remember(def.type); setPlacing(placing === def.type ? null : def.type); useUi.getState().setCompactPanel(null); }}
            onDragStart={() => remember(def.type)} />)}</div>
        </section>)}
        {searching && results.length === 0 && <div className="empty"><Search size={18} />No hay componentes con «{query.trim()}»</div>}
      </div>
    </aside>
  );
}

const PartCard = memo(function PartCard({
  def,
  armed,
  fav,
  onFav,
  onPick,
  onDragStart,
}: {
  def: PartDef;
  armed: boolean;
  fav: boolean;
  onFav: () => void;
  onPick: () => void;
  onDragStart: () => void;
}) {
  const label = partLabel(def);
  return (
    <div
      className={`card ${armed ? 'armed' : ''}`}
      onPointerDown={(e) => startLibDrag(e, def.type, onDragStart)}
      title={def.description}
    >
      <button className="card-main" onClick={onPick} aria-pressed={armed} aria-label={def.partNumber ? `${def.partNumber} · ${def.name}` : def.name}>
        <Thumb def={def} />
        <span className="card-meta">
          <span className="card-name">{label.title}</span>
          {label.detail && <span className="card-detail">{label.detail}</span>}
        </span>
      </button>
      <button className={`fav ${fav ? 'on' : ''}`} onClick={onFav} aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} aria-pressed={fav}>
        <Star size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
});

/**
 * Arrastre desde la biblioteca con eventos de puntero (no el arrastre nativo, que solo deja
 * llevar una captura de la tarjeta): la pieza real sigue al cursor y el lienzo reacciona.
 * Al soltar sobre el lienzo, este coloca la pieza; aquí solo se empieza y se limpia.
 */
function startLibDrag(e: React.PointerEvent, type: string, onStart: () => void) {
  if (e.button !== 0 || (e.target as Element).closest('.fav')) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let started = false;
  const ui = useUi.getState;
  const move = (ev: PointerEvent) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if (!started) {
      started = true;
      onStart();
      document.body.classList.add('lib-dragging');
    }
    const over = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.canvas-wrap');
    ui().setLibDrag({ type, x: ev.clientX, y: ev.clientY, over });
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', esc);
    document.body.classList.remove('lib-dragging');
    // El lienzo atiende el pointerup antes de que se borre el arrastre.
    if (started) setTimeout(() => ui().setLibDrag(null), 0);
  };
  const cancel = () => {
    ui().setLibDrag(null);
    stop();
  };
  const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && cancel();
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', esc);
}

/** La pieza flotando fuera del lienzo, al tamaño con el que caerá en él. */
export function LibDragFloat() {
  const drag = useUi((s) => s.libDrag);
  const zoom = useUi((s) => s.viewport.zoom);
  if (!drag || drag.over || !PARTS[drag.type]) return null;
  const def = PARTS[drag.type];
  const b = def.bounds(def.defaults);
  return (
    <svg
      className="lib-drag-float"
      style={{ left: drag.x, top: drag.y, width: b.w * zoom, height: b.h * zoom }}
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      aria-hidden="true"
    >
      <def.Render part={{ id: 'lib-drag', type: def.type, x: 0, y: 0, rot: 0, props: def.defaults }} visual={null} preview />
    </svg>
  );
}

export const Thumb = memo(function Thumb({ def }: { def: PartDef }) {
  const b = def.bounds(def.defaults);
  const pad = Math.max(b.w, b.h) * 0.1 + 2;
  return (
    <svg className="thumb" viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <def.Render part={{ id: `thumb-${def.type}`, type: def.type, x: 0, y: 0, rot: 0, props: def.defaults }} visual={null} preview />
    </svg>
  );
});
