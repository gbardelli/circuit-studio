import { useEffect, useMemo, useState } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD, api, type ProjectSummary } from '../cloud';
import { CircuitBoard, Clock, FolderClosed, House, LayoutTemplate, Loader2, LogOut, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { TEMPLATES, type Template } from '../collab/templates';
import { templateSnapshot } from '../collab/applyTemplate';
import { localUser } from '../collab/project';
import type { CircuitSnapshot } from '../core/types';
import { Logo, Wordmark } from './Logo';
import { CircuitPreview } from './Preview';

interface Recent {
  room: string;
  name: string;
  at: number;
  snapshot?: CircuitSnapshot;
  role?: ProjectSummary['role'];
  members?: number;
}

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem('cs-projects') ?? '[]') as Recent[];
  } catch {
    return [];
  }
}

export function rememberProject(room: string, name: string, snapshot?: CircuitSnapshot) {
  try {
    const list = readRecent().filter((r) => r.room !== room);
    const json = snapshot ? JSON.stringify(snapshot) : '';
    list.unshift({ room, name, at: Date.now(), snapshot: json.length < 150_000 ? snapshot : undefined });
    localStorage.setItem('cs-projects', JSON.stringify(list.slice(0, 24)));
  } catch {
    /* sin persistencia */
  }
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

const CATEGORIES: { id: Template['category']; title: string; blurb: string }[] = [
  { id: 'Lógica secuencial', title: 'Lógica secuencial', blurb: 'Contadores, divisores de frecuencia y luces, repartidos en varias protoboards encadenadas.' },
  { id: 'Arduino', title: 'Con Arduino', blurb: 'Una placa Uno sobre la protoboard y el código que la gobierna.' },
  { id: 'Fundamentos', title: 'Fundamentos', blurb: 'Circuitos sin código para medir y entender qué pasa.' },
];

const LEVELS: Level[] = ['all', 'Básico', 'Intermedio', 'Avanzado'];

export function Home() {
  const [recent, setRecent] = useState<Recent[]>(() => (CLOUD ? [] : readRecent()));
  const [loading, setLoading] = useState(CLOUD);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [level, setLevel] = useState<Level>('all');

  useEffect(() => {
    if (!CLOUD) return;
    api<{ projects: ProjectSummary[] }>('/api/projects')
      .then(({ projects }) => setRecent(projects.map((p) => ({ room: p.id, name: p.name, at: Date.parse(p.updated_at), snapshot: p.preview ?? undefined, role: p.role, members: p.members }))))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

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

  const remove = async (r: Recent) => {
    const text = r.role === 'owner' ? `¿Eliminar «${r.name}» para todos?` : `¿Salir de «${r.name}»? Seguirá existiendo para los demás.`;
    if (!confirm(text)) return;
    await api(`/api/projects/${r.room}`, { method: 'DELETE' });
    setRecent((list) => list.filter((x) => x.room !== r.room));
  };
  const [query, setQuery] = useState('');
  const user = useMemo(localUser, []);
  const previews = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, templateSnapshot(t)])), []);
  const boards = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, t.parts.filter((p) => p.type.startsWith('breadboard')).length])), []);

  const q = query.trim().toLowerCase();
  const groups = CATEGORIES.map((c) => ({
    ...c,
    items: TEMPLATES.filter((t) => t.category === c.id && (level === 'all' || t.level === level) && (!q || `${t.name} ${t.summary} ${t.category}`.toLowerCase().includes(q))),
  })).filter((g) => g.items.length > 0);
  const projects = recent.filter((r) => !q || r.name.toLowerCase().includes(q));
  const open = (url: string) => (location.href = url);

  const heading = view === 'projects' ? 'Mis circuitos' : view === 'templates' ? 'Plantillas' : 'Circuitos';
  const lede =
    view === 'projects' ? 'Los abiertos en este equipo. Comparte el enlace para editar en equipo.' : view === 'templates' ? 'Montajes que ya funcionan: ábrelos, míralos correr y cámbialos.' : 'Empieza en blanco o parte de un montaje que ya funciona.';

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
              <input className="input" placeholder="Buscar circuitos y plantillas" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
              {query && (
                <button className="icon-btn" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                  <X size={14} />
                </button>
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
                  projects.length > 0 && <span className="eyebrow">{projects.length} circuitos</span>
                )}
              </div>
              {projects.length === 0 ? (
                <div className="empty-projects">
                  <FolderClosed size={18} />
                  {loading ? 'Cargando tus circuitos' : q ? 'Ningún circuito coincide con la búsqueda.' : CLOUD ? 'Aún no tienes circuitos. Crea uno o abre un enlace compartido.' : 'Aquí aparecerán los circuitos que abras.'}
                </div>
              ) : (
                <div className="tpl-grid">
                  {(view === 'home' ? projects.slice(0, 4) : projects).map((r) => (
                    <a key={r.room} className="tpl" href={`?p=${r.room}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="tpl-art">
                        {r.snapshot && r.snapshot.parts.length > 0 ? <CircuitPreview snapshot={r.snapshot} /> : null}
                        {CLOUD && (
                          <button
                            className="icon-btn tpl-action"
                            aria-label={r.role === 'owner' ? 'Eliminar circuito' : 'Salir del circuito'}
                            title={r.role === 'owner' ? 'Eliminar' : 'Salir'}
                            onClick={(e) => {
                              e.preventDefault();
                              void remove(r);
                            }}
                          >
                            {r.role === 'owner' ? <Trash2 size={14} /> : <LogOut size={14} />}
                          </button>
                        )}
                      </div>
                      <div className="tpl-body">
                        <strong>{r.name}</strong>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} /> {ago(r.at)}
                          {r.members && r.members > 1 ? (
                            <>
                              <span className="faint">·</span> <Users size={12} /> {r.members}
                            </>
                          ) : null}
                          {r.role === 'viewer' && <span className="pill">Solo lectura</span>}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
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
                      <button key={t.id} className={`tpl ${boards.get(t.id)! > 1 ? 'wide' : ''}`} onClick={() => create(t.id, t.name)} disabled={busy !== null}>
                        <div className="tpl-art">
                          <CircuitPreview snapshot={previews.get(t.id)!} />
                          <span className="pill">
                            {busy === t.id ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <CircuitBoard size={11} />} {t.level}
                          </span>
                        </div>
                        <div className="tpl-body">
                          <strong>{t.name}</strong>
                          <span>{t.summary}</span>
                          {boards.get(t.id)! > 1 && <em className="tpl-meta">{boards.get(t.id)} protoboards en serie</em>}
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
    </div>
  );
}
