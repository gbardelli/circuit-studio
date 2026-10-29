import { useEffect, useMemo, useState } from 'react';
import { UserButton } from '@clerk/react';
import { CLOUD, api, type ProjectSummary } from '../cloud';
import { CircuitBoard, Clock, FolderClosed, House, LayoutTemplate, Loader2, LogOut, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { TEMPLATES } from '../collab/templates';
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

export function Home() {
  const [recent, setRecent] = useState<Recent[]>(() => (CLOUD ? [] : readRecent()));
  const [loading, setLoading] = useState(CLOUD);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');

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

  const q = query.trim().toLowerCase();
  const templates = TEMPLATES.filter((t) => !q || `${t.name} ${t.summary}`.toLowerCase().includes(q));
  const projects = recent.filter((r) => !q || r.name.toLowerCase().includes(q));
  const open = (url: string) => (location.href = url);

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

          <h1>{view === 'projects' ? 'Mis circuitos' : view === 'templates' ? 'Plantillas' : 'Circuitos'}</h1>
          <p className="lede">{view === 'projects' ? 'Los abiertos en este equipo. Comparte el enlace para editar en equipo.' : 'Empieza en blanco o parte de un montaje que ya funciona.'}</p>

          {view !== 'projects' && (
            <section className="home-section">
              <div className="section-head">
                <h2>Empezar</h2>
                <span className="eyebrow">{templates.length + 1} opciones</span>
              </div>
              <div className="tpl-grid">
                {!q && (
                  <button className="tpl blank" onClick={() => create()} disabled={busy !== null}>
                    <div className="tpl-art">
                      <span className="blank-plus">
                        <Plus size={22} />
                      </span>
                    </div>
                    <div className="tpl-body">
                      <strong>Lienzo en blanco</strong>
                      <span>Protoboard y componentes a tu gusto.</span>
                    </div>
                  </button>
                )}
                {templates.map((t) => (
                  <button key={t.id} className="tpl" onClick={() => create(t.id, t.name)} disabled={busy !== null}>
                    <div className="tpl-art">
                      <CircuitPreview snapshot={previews.get(t.id)!} />
                      <span className="pill">
                        {busy === t.id ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <CircuitBoard size={11} />} {t.level}
                      </span>
                    </div>
                    <div className="tpl-body">
                      <strong>{t.name}</strong>
                      <span>{t.summary}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {view !== 'templates' && (
            <section className="home-section">
              <div className="section-head">
                <h2>Recientes</h2>
                {projects.length > 0 && <span className="eyebrow">{projects.length} circuitos</span>}
              </div>
              {projects.length === 0 ? (
                <div className="empty-projects">
                  <FolderClosed size={18} />
                  {loading ? 'Cargando tus circuitos' : q ? 'Ningún circuito coincide con la búsqueda.' : CLOUD ? 'Aún no tienes circuitos. Crea uno o abre un enlace compartido.' : 'Aquí aparecerán los circuitos que abras.'}
                </div>
              ) : (
                <div className="tpl-grid">
                  {projects.map((r) => (
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
        </div>
      </main>
    </div>
  );
}
