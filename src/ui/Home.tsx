import { useMemo, useState } from 'react';
import { CircuitBoard, Clock, FolderClosed, House, LayoutTemplate, Plus, Search, X } from 'lucide-react';
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
  const [recent] = useState(readRecent);
  const [view, setView] = useState<View>('home');
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
          <span className="avatar" style={{ background: user.color, marginLeft: 0, boxShadow: 'none' }}>
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 500 }}>{user.name}</div>
            <div className="faint" style={{ fontSize: 11.5 }}>
              Sin cuenta · este equipo
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
            <button className="btn primary" onClick={() => open(`?p=${newRoom()}`)}>
              <Plus size={15} strokeWidth={2.2} /> Nuevo circuito
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
                  <button className="tpl blank" onClick={() => open(`?p=${newRoom()}`)}>
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
                  <button key={t.id} className="tpl" onClick={() => open(`?p=${newRoom()}&template=${t.id}`)}>
                    <div className="tpl-art">
                      <CircuitPreview snapshot={previews.get(t.id)!} />
                      <span className="pill">
                        <CircuitBoard size={11} /> {t.level}
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
                  {q ? 'Ningún circuito coincide con la búsqueda.' : 'Aquí aparecerán los circuitos que abras.'}
                </div>
              ) : (
                <div className="tpl-grid">
                  {projects.map((r) => (
                    <a key={r.room} className="tpl" href={`?p=${r.room}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="tpl-art">{r.snapshot && r.snapshot.parts.length > 0 ? <CircuitPreview snapshot={r.snapshot} /> : null}</div>
                      <div className="tpl-body">
                        <strong>{r.name}</strong>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} /> {ago(r.at)}
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
