import { memo, useMemo, useState } from 'react';
import { type LucideIcon, BatteryMedium, Clock, Component, Cpu, Gauge, Grid3x3, LayoutGrid, Lightbulb, Search, Star, ToggleLeft, Triangle, X } from 'lucide-react';
import { CATEGORIES, PART_LIST } from '../parts';
import type { Category, PartDef } from '../parts/types';
import { useUi } from './store';

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  Placas: Cpu,
  Protoboards: Grid3x3,
  Básicos: Component,
  Entradas: ToggleLeft,
  Salidas: Lightbulb,
  Semiconductores: Triangle,
  Energía: BatteryMedium,
  Instrumentos: Gauge,
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Puntuación tolerante: palabra completa > prefijo > subcadena > subsecuencia. */
function score(def: PartDef, query: string) {
  const q = norm(query.trim());
  if (!q) return 1;
  const hay = norm([def.name, ...def.keywords, def.category].join(' '));
  let total = 0;
  for (const token of q.split(/\s+/)) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\b`).test(hay)) total += 4;
    else if (new RegExp(`\\b${esc}`).test(hay)) total += 3;
    else if (hay.includes(token)) total += 2;
    else if (subsequence(token, hay)) total += 0.5;
    else return 0;
  }
  return total;
}

function subsequence(needle: string, hay: string) {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

function readList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
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
  const [category, setCategory] = useState<Category | null>(null);
  const [favs, setFavs] = useState(() => readList('cs-favs'));
  const [recent, setRecent] = useState(() => readList('cs-recent'));
  const setPlacing = useUi((s) => s.setPlacing);
  const placing = useUi((s) => s.placing);

  const results = useMemo(
    () =>
      PART_LIST.map((d) => ({ d, s: score(d, query) }))
        .filter(({ d, s }) => s > 0 && (!category || d.category === category))
        .sort((a, b) => b.s - a.s)
        .map(({ d }) => d),
    [query, category],
  );

  const use = (type: string) => {
    const next = [type, ...recent.filter((t) => t !== type)].slice(0, 4);
    setRecent(next);
    writeList('cs-recent', next);
  };

  const toggleFav = (type: string) => {
    const next = favs.includes(type) ? favs.filter((t) => t !== type) : [...favs, type];
    setFavs(next);
    writeList('cs-favs', next);
  };

  const groups = query || category ? [{ title: query ? 'Resultados' : category!, icon: category ? CATEGORY_ICON[category] : Search, items: results }] : buildGroups(favs, recent);

  return (
    <aside className="library" aria-label="Componentes">
      <div className="lib-head">
        <div className="search">
          <Search size={14} />
          <input id="lib-search" className="input" placeholder="Buscar componentes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar componentes" />
          {query ? (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
              <X size={13} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="cat-rail" role="toolbar" aria-label="Categorías">
          <button className="cat" aria-pressed={category === null} onClick={() => setCategory(null)}>
            <LayoutGrid size={13} /> Todo
          </button>
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <button key={c} className="cat" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
                <Icon size={13} /> {c}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lib-body">
        {groups.map((g) =>
          g.items.length ? (
            <section key={g.title} className="lib-section">
              <h3>
                <g.icon size={12} /> {g.title}
              </h3>
              <div className="cards">
                {g.items.map((d) => (
                  <PartCard
                    key={`${g.title}-${d.type}`}
                    def={d}
                    armed={placing === d.type}
                    fav={favs.includes(d.type)}
                    onFav={() => toggleFav(d.type)}
                    onPick={() => {
                      use(d.type);
                      setPlacing(placing === d.type ? null : d.type);
                    }}
                    onDragStart={() => use(d.type)}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
        {groups.every((g) => g.items.length === 0) && (
          <div className="empty">
            <Search size={18} />
            Nada con «{query}»
          </div>
        )}
      </div>
    </aside>
  );
}

function buildGroups(favs: string[], recent: string[]) {
  const byType = new Map(PART_LIST.map((d) => [d.type, d]));
  const groups: { title: string; icon: LucideIcon; items: PartDef[] }[] = [];
  if (favs.length) groups.push({ title: 'Favoritos', icon: Star, items: favs.flatMap((t) => byType.get(t) ?? []) });
  if (recent.length) groups.push({ title: 'Recientes', icon: Clock, items: recent.flatMap((t) => byType.get(t) ?? []) });
  for (const c of CATEGORIES) groups.push({ title: c, icon: CATEGORY_ICON[c], items: PART_LIST.filter((d) => d.category === c) });
  return groups;
}

/** Etiqueta solo cuando dice algo útil antes de colocar la pieza. */
export function partTag(def: PartDef): { text: string; tone: 'accent' | 'green' | 'neutral' } | null {
  if (def.type === 'arduino-uno') return { text: 'Programable', tone: 'accent' };
  if (['potentiometer', 'pushbutton', 'slide-switch', 'ldr'].includes(def.type)) return { text: 'Se toca al simular', tone: 'green' };
  if (def.type === 'battery-9v') return { text: '9 V', tone: 'neutral' };
  if (def.type === 'aa-pack') return { text: '3 V · 6 V', tone: 'neutral' };
  if (def.category === 'Protoboards') return { text: `${Number(def.defaults.cols)} columnas`, tone: 'neutral' };
  return null;
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
  const tag = partTag(def);
  return (
    <div
      className={`card ${armed ? 'armed' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-part', def.type);
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart();
      }}
      title={def.description}
    >
      <button className="card-main" onClick={onPick} aria-pressed={armed}>
        <Thumb def={def} />
        <span className="card-meta">
          <span className="card-name">{def.name}</span>
          {tag && <span className={`pill ${tag.tone}`}>{tag.text}</span>}
        </span>
      </button>
      <button className={`fav ${fav ? 'on' : ''}`} onClick={onFav} aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} aria-pressed={fav}>
        <Star size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
});

export const Thumb = memo(function Thumb({ def }: { def: PartDef }) {
  const b = def.bounds(def.defaults);
  const pad = Math.max(b.w, b.h) * 0.1 + 2;
  return (
    <svg className="thumb" viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <def.Render part={{ id: `thumb-${def.type}`, type: def.type, x: 0, y: 0, rot: 0, props: def.defaults }} visual={null} preview />
    </svg>
  );
});
