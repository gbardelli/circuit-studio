import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD, api, colorFor, type ProjectSummary } from '../cloud';
import { Copy, ExternalLink, FolderClosed, House, LayoutTemplate, Link2, Loader2, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X, Clock, CopyPlus, CircuitBoard } from 'lucide-react';
import { TEMPLATES, type Template } from '../collab/templates';
import { templateSnapshot } from '../collab/applyTemplate';
import { localUser } from '../collab/project';
import type { CircuitSnapshot } from '../core/types';
import { Logo, Wordmark } from './Logo';
import { CircuitPreview } from './Preview';

interface Person {
  id: string;
  name: string | null;
  image: string | null;
}

interface Recent {
  room: string;
  name: string;
  at: number;
  snapshot?: CircuitSnapshot;
  role?: ProjectSummary['role'];
  members?: number;
  people?: Person[];
}

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem('cs-projects') ?? '[]') as Recent[];
  } catch {
    return [];
  }
}

function writeRecent(list: Recent[]) {
  try {
    localStorage.setItem('cs-projects', JSON.stringify(list.slice(0, 24)));
  } catch {
    /* sin persistencia */
  }
}

export function rememberProject(room: string, name: string, snapshot?: CircuitSnapshot) {
  const list = readRecent().filter((r) => r.room !== room);
  const json = snapshot ? JSON.stringify(snapshot) : '';
  list.unshift({ room, name, at: Date.now(), snapshot: json.length < 150_000 ? snapshot : undefined });
  writeRecent(list);
}

const newRoom = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(at: number) {
  const s = (at - Date.now()) / 1000;
  if (s > -60) return 'ahora';
  if (s > -3600) return rtf.format(Math.round(s / 60), 'minute');
  if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

type View = 'home' | 'templates' | 'projects';
type Level = Template['level'] | 'all';
type Scope = 'all' | 'mine' | 'shared';
type Sort = 'recent' | 'name';

const CATEGORIES: { id: Template['category']; title: string; blurb: string }[] = [
  { id: 'Lógica secuencial', title: 'Lógica secuencial', blurb: 'Contadores, divisores de frecuencia y luces, repartidos en varias protoboards encadenadas.' },
  { id: 'Arduino', title: 'Con Arduino', blurb: 'Placas programables y circuitos con el código listo para simular.' },
  { id: 'Fundamentos', title: 'Fundamentos', blurb: 'Circuitos sin código para medir y entender qué pasa.' },
];

const LEVELS: Level[] = ['all', 'Básico', 'Intermedio', 'Avanzado'];
const LEVEL_CLASS: Record<Template['level'], string> = { Básico: 'basic', Intermedio: 'mid', Avanzado: 'adv' };
const ROLE_LABEL = { owner: 'Propietario', editor: 'Editor', viewer: 'Solo lectura' } as const;

/** Nivel: etiqueta sobria con un punto de color (verde, ámbar, rojo) como única señal. */
function LevelPill({ level }: { level: Template['level'] }) {
  return (
    <span className={`level ${LEVEL_CLASS[level]}`}>
      <i aria-hidden="true" />
      {level}
    </span>
  );
}

/** Caras de los miembros: su foto, o su inicial sobre el color que los identifica en el lienzo. */
function Faces({ people, total }: { people: Person[]; total: number }) {
  const shown = people.slice(0, 4);
  const more = total - shown.length;
  return (
    <span className="faces" title={people.map((p) => p.name ?? 'Sin nombre').join(', ')}>
      {shown.map((p) => (
        <span key={p.id} className="face" style={{ background: colorFor(p.id) }}>
          {p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" /> : (p.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
      ))}
      {more > 0 && <span className="face more">+{more}</span>}
    </span>
  );
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
}

/** Menú de tres puntos de una tarjeta. Se cierra con clic fuera o Esc. */
function CardMenu({ items, label, onToggle }: { items: (MenuItem | null)[]; label: string; onToggle: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const set = (v: boolean) => {
    setOpen(v);
    onToggle(v);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) set(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <div className="card-menu" ref={ref}>
      <button className={`icon-btn tpl-action ${open ? 'on' : ''}`} aria-label={`Más acciones de ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => set(!open)}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((it, i) =>
            it === null ? (
              <hr key={i} />
            ) : it.href ? (
              <a key={it.label} role="menuitem" className="menu-item" href={it.href} target="_blank" rel="noreferrer" onClick={() => set(false)}>
                {it.icon} {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className={it.danger ? 'danger' : undefined}
                onClick={() => {
                  set(false);
                  it.onSelect?.();
                }}
              >
                {it.icon} {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Home() {
  const [recent, setRecent] = useState<Recent[]>(() => (CLOUD ? [] : readRecent()));
  const [loading, setLoading] = useState(CLOUD);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [level, setLevel] = useState<Level>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!CLOUD) return;
    api<{ projects: ProjectSummary[] }>('/api/projects')
      .then(({ projects }) => setRecent(projects.map((p) => ({ room: p.id, name: p.name, at: Date.parse(p.updated_at), snapshot: p.preview ?? undefined, role: p.role, members: p.members, people: p.people }))))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  // Atajo: «/» enfoca la búsqueda (si no se está escribiendo).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  };

  const open = (url: string) => (location.href = url);

  /** En la nube el circuito se crea en el servidor antes de abrirlo (así tiene propietario). */
  const create = async (template?: string, name?: string) => {
    if (!CLOUD) return open(`?p=${newRoom()}${template ? `&template=${template}` : ''}`);
    setBusy(template ?? 'blank');
    try {
      const { id } = await api<{ id: string }>('/api/projects', { method: 'POST', body: JSON.stringify({ name: name ?? 'Circuito sin título' }) });
      open(`?p=${id}${template ? `&template=${template}` : ''}`);
    } catch {
      setBusy(null);
    }
  };

  const duplicate = async (r: Recent) => {
    setBusy(r.room);
    try {
      const { id } = await api<{ id: string }>('/api/projects', { method: 'POST', body: JSON.stringify({ name: `${r.name} (copia)`, duplicateOf: r.room }) });
      open(`?p=${id}`);
    } catch {
      setBusy(null);
      flash('No se pudo duplicar el circuito');
    }
  };

  const remove = async (r: Recent) => {
    if (!CLOUD) {
      const list = readRecent().filter((x) => x.room !== r.room);
      writeRecent(list);
      setRecent(list);
      return;
    }
    const text = r.role === 'owner' ? `¿Eliminar «${r.name}» para todos?` : `¿Salir de «${r.name}»? Seguirá existiendo para los demás.`;
    if (!confirm(text)) return;
    await api(`/api/projects/${r.room}`, { method: 'DELETE' });
    setRecent((list) => list.filter((x) => x.room !== r.room));
  };

  const rename = async (r: Recent, raw: string) => {
    setRenaming(null);
    const name = raw.trim().slice(0, 120);
    if (!name || name === r.name) return;
    const before = r.name;
    setRecent((list) => list.map((x) => (x.room === r.room ? { ...x, name } : x)));
    try {
      await api(`/api/projects/${r.room}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    } catch {
      setRecent((list) => list.map((x) => (x.room === r.room ? { ...x, name: before } : x)));
      flash('No se pudo cambiar el nombre');
    }
  };

  const copyLink = async (r: Recent) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?p=${r.room}`);
      flash('Enlace copiado');
    } catch {
      flash('No se pudo copiar el enlace');
    }
  };

  const user = useMemo(localUser, []);
  const previews = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, templateSnapshot(t)])), []);
  const boards = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, t.parts.filter((p) => p.type.startsWith('breadboard')).length])), []);

  const q = query.trim().toLowerCase();
  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: TEMPLATES.filter((t) => t.category === c.id && (level === 'all' || t.level === level) && (!q || `${t.name} ${t.summary} ${t.category}`.toLowerCase().includes(q))),
  })).filter((g) => g.items.length > 0);
  const projects = recent
    .filter((r) => (!q || r.name.toLowerCase().includes(q)) && (scope === 'all' || (scope === 'mine' ? r.role !== 'editor' && r.role !== 'viewer' : r.role === 'editor' || r.role === 'viewer')))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'es') : b.at - a.at));
  const shared = recent.filter((r) => r.role === 'editor' || r.role === 'viewer').length;

  const heading = view === 'projects' ? 'Mis circuitos' : view === 'templates' ? 'Plantillas' : 'Circuitos';
  const lede =
    view === 'projects' ? 'Los abiertos en este equipo. Comparte el enlace para editar en equipo.' : view === 'templates' ? 'Montajes que ya funcionan: ábrelos, míralos correr y cámbialos.' : 'Empieza en blanco o parte de un montaje que ya funciona.';

  const projectCard = (r: Recent) => {
    const canEdit = r.role === 'owner' || r.role === 'editor';
    const href = `?p=${r.room}`;
    const items: (MenuItem | null)[] = [
      { label: 'Abrir en pestaña nueva', icon: <ExternalLink size={14} />, href },
      { label: 'Copiar enlace', icon: <Link2 size={14} />, onSelect: () => void copyLink(r) },
      ...(CLOUD ? [{ label: 'Miembros y acceso', icon: <Users size={14} />, onSelect: () => open(`${href}&share=1`) }] : []),
      null,
      ...(CLOUD && canEdit ? [{ label: 'Cambiar nombre', icon: <Pencil size={14} />, onSelect: () => setRenaming(r.room) }] : []),
      ...(CLOUD ? [{ label: 'Duplicar', icon: <CopyPlus size={14} />, onSelect: () => void duplicate(r) }] : []),
      null,
      {
        label: !CLOUD ? 'Quitar de la lista' : r.role === 'owner' ? 'Eliminar' : 'Salir del circuito',
        icon: !CLOUD ? <X size={14} /> : r.role === 'owner' ? <Trash2 size={14} /> : <LogOut size={14} />,
        danger: true,
        onSelect: () => void remove(r),
      },
    ];
    return (
      <div key={r.room} className={`tpl project ${menuOpen === r.room ? 'raised' : ''} ${busy === r.room ? 'busy' : ''}`}>
        <a className="tpl-art" href={href} tabIndex={-1} aria-hidden="true">
          {r.snapshot && r.snapshot.parts.length > 0 ? <CircuitPreview snapshot={r.snapshot} /> : <span className="art-empty">Circuito vacío</span>}
          {busy === r.room && (
            <span className="art-busy">
              <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
            </span>
          )}
        </a>
        <CardMenu items={items} label={r.name} onToggle={(o) => setMenuOpen(o ? r.room : menuOpen === r.room ? null : menuOpen)} />
        <div className="tpl-body">
          {renaming === r.room ? (
            <input
              className="input rename"
              autoFocus
              defaultValue={r.name}
              aria-label="Nombre del circuito"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => void rename(r, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <a className="title-link" href={href}>
              <strong>{r.name}</strong>
            </a>
          )}
          <div className="proj-meta">
            <span className="when">
              <Clock size={12} /> {ago(r.at)}
            </span>
            {r.role && r.role !== 'owner' && <span className={`role ${r.role}`}>{ROLE_LABEL[r.role]}</span>}
            <span className="grow" />
            {r.people && r.people.length > 0 && (r.members ?? 0) > 1 && <Faces people={r.people} total={r.members ?? r.people.length} />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="home">
      <nav className="home-side" aria-label="Navegación">
        <a className="brand" href="/">
          <Logo size={32} />
          <Wordmark size={20} />
        </a>
        <button className="nav-item" aria-current={view === 'home' ? 'page' : undefined} onClick={() => setView('home')}>
          <House size={16} /> Inicio
        </button>
        <button className="nav-item" aria-current={view === 'templates' ? 'page' : undefined} onClick={() => setView('templates')}>
          <LayoutTemplate size={16} /> Plantillas <span className="count">{TEMPLATES.length}</span>
        </button>
        <button className="nav-item" aria-current={view === 'projects' ? 'page' : undefined} onClick={() => setView('projects')}>
          <FolderClosed size={16} /> Mis circuitos <span className="count">{recent.length}</span>
        </button>
        <div className="me-card">
          {CLOUD ? (
            <UserButton />
          ) : (
            <span className="avatar" style={{ background: user.color, marginLeft: 0, boxShadow: 'none' }}>
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <div style={{ fontWeight: 500 }}>{user.name}</div>
            <div className="faint" style={{ fontSize: 11.5 }}>
              {CLOUD ? 'Tu cuenta' : 'Sin cuenta · este equipo'}
            </div>
          </div>
        </div>
      </nav>

      <main className="home-main">
        <div className="home-inner">
          <div className="home-top">
            <div className="search">
              <Search size={15} />
              <input ref={searchRef} className="input" placeholder="Buscar circuitos y plantillas" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
              {query ? (
                <button className="icon-btn" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                  <X size={14} />
                </button>
              ) : (
                <kbd className="search-key">/</kbd>
              )}
            </div>
            <span className="grow" />
            <button className="btn primary" onClick={() => create()} disabled={busy !== null}>
              {busy === 'blank' ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={15} strokeWidth={2.2} />} Nuevo circuito
            </button>
          </div>

          <h1>{heading}</h1>
          <p className="lede">{lede}</p>

          {view !== 'projects' && !q && (
            <button className="blank-row" onClick={() => create()} disabled={busy !== null}>
              <span className="blank-plus">{busy === 'blank' ? <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={22} />}</span>
              <span className="blank-text">
                <strong>Lienzo en blanco</strong>
                <span>Una protoboard vacía y todo el catálogo de componentes a tu gusto.</span>
              </span>
            </button>
          )}

          {view !== 'templates' && (
            <section className="home-section">
              <div className="section-head">
                <h2>{view === 'home' ? 'Recientes' : 'Todos tus circuitos'}</h2>
                {view === 'home' && projects.length > 4 ? (
                  <button className="link-btn" onClick={() => setView('projects')}>
                    Ver los {projects.length}
                  </button>
                ) : (
                  view === 'home' && projects.length > 0 && <span className="eyebrow">{projects.length} circuitos</span>
                )}
              </div>
              {view === 'projects' && recent.length > 0 && (
                <div className="filter-row tight" role="group" aria-label="Filtrar circuitos">
                  {(
                    [
                      ['all', 'Todos', recent.length],
                      ['mine', 'Míos', recent.length - shared],
                      ['shared', 'Compartidos conmigo', shared],
                    ] as const
                  )
                    .filter(([id, , n]) => id === 'all' || (CLOUD && n > 0) || scope === id)
                    .map(([id, label, n]) => (
                      <button key={id} className="filter" aria-pressed={scope === id} onClick={() => setScope(id)}>
                        {label} <span className="n">{n}</span>
                      </button>
                    ))}
                  <span className="grow" />
                  <label className="sort">
                    Ordenar
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar circuitos">
                      <option value="recent">Más recientes</option>
                      <option value="name">Nombre</option>
                    </select>
                  </label>
                </div>
              )}
              {projects.length === 0 ? (
                <div className="empty-projects">
                  <FolderClosed size={18} />
                  {loading ? 'Cargando tus circuitos' : q || scope !== 'all' ? 'Ningún circuito coincide con la búsqueda.' : CLOUD ? 'Aún no tienes circuitos. Crea uno o abre un enlace compartido.' : 'Aquí aparecerán los circuitos que abras.'}
                </div>
              ) : (
                <div className="tpl-grid">{(view === 'home' ? projects.slice(0, 4) : projects).map(projectCard)}</div>
              )}
            </section>
          )}

          {view !== 'projects' && (
            <>
              {view === 'templates' && (
                <div className="filter-row" role="group" aria-label="Nivel">
                  {LEVELS.map((l) => (
                    <button key={l} className="filter" aria-pressed={level === l} onClick={() => setLevel(l)}>
                      {l === 'all' ? 'Todos los niveles' : l}
                    </button>
                  ))}
                </div>
              )}
              {groups.map((g) => (
                <section key={g.id} className="home-section">
                  <div className="section-head">
                    <div>
                      <h2>{g.title}</h2>
                      <p className="section-blurb">{g.blurb}</p>
                    </div>
                    <span className="eyebrow">
                      {g.items.length} {g.items.length === 1 ? 'plantilla' : 'plantillas'}
                    </span>
                  </div>
                  <div className="tpl-grid">
                    {g.items.map((t) => (
                      <button key={t.id} className="tpl" onClick={() => create(t.id, t.name)} disabled={busy !== null}>
                        <div className="tpl-art">
                          <CircuitPreview snapshot={previews.get(t.id)!} />
                          <LevelPill level={t.level} />
                          {busy === t.id && (
                            <span className="art-busy">
                              <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
                            </span>
                          )}
                        </div>
                        <div className="tpl-body">
                          <strong>{t.name}</strong>
                          <span>{t.summary}</span>
                          {boards.get(t.id)! > 1 && (
                            <em className="tpl-meta">
                              <CircuitBoard size={12} /> {boards.get(t.id)} protoboards en serie
                            </em>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {groups.length === 0 && (
                <div className="empty-projects" style={{ marginTop: 32 }}>
                  <LayoutTemplate size={18} /> Ninguna plantilla coincide con la búsqueda.
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {toast && (
        <div className="home-toast" role="status">
          <Copy size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
