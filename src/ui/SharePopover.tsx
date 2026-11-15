import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Lock } from 'lucide-react';
import { api, type LinkAccess, type ProjectDetail } from '../cloud';
import { useEditor } from './context';

export function projectLink(room: string, access: LinkAccess, preview = false) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ p: room, ...((access === 'view' || preview) ? { view: '1' } : {}) }).toString();
  url.hash = '';
  return url.href;
}

const ACCESS = [
  { value: 'none', label: 'Restringido', hint: 'Solo las personas que ya tienen acceso pueden abrir este circuito.' },
  { value: 'view', label: 'Ver y simular', hint: 'Cualquiera con el enlace puede ver y simular sin cuenta. El original no cambia.' },
  { value: 'edit', label: 'Editar con cuenta', hint: 'Cualquiera con el enlace puede ver y simular. Para editar, debe iniciar sesión.' },
] as const;

export function SharePopover() {
  const { project, detail } = useEditor();
  const [info, setInfo] = useState(detail);
  const [access, setAccess] = useState<LinkAccess>(detail?.link_access ?? 'none');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = info?.role === 'owner';
  const busy = loading || saving;
  const link = projectLink(project.room, access);

  useEffect(() => {
    let active = true;
    void api<ProjectDetail>(`/api/projects/${project.room}`).then(value => {
      if (active) { setInfo(value); setAccess(value.link_access); }
    }).catch(() => { if (active) setError('No se pudo consultar el acceso. Cierra este panel y vuelve a intentarlo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.room]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const change = async (value: LinkAccess) => {
    if (busy || !owner || value === access) return;
    setSaving(true); setError(null); setCopied(false);
    try {
      await api(`/api/projects/${project.room}`, { method: 'PATCH', body: JSON.stringify({ linkAccess: value }) });
      setAccess(value);
    } catch { setError('No se pudo guardar el permiso. Se mantiene el acceso anterior.'); }
    finally { setSaving(false); }
  };

  const copy = async () => {
    setError(null);
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setError('No se pudo copiar. Selecciona y copia el enlace de abajo.'); }
  };

  return <div className="share-pop" aria-busy={busy}>
    <div className="share-head"><strong>Compartir circuito</strong></div>
    {!!info?.members.length && <section aria-label="Personas con acceso">
      <h2 className="share-section-title">Personas con acceso</h2>
      <ul className="share-members">{info.members.map(m => <li key={m.id}>
        <span className="avatar">{m.image ? <img src={m.image} alt="" /> : m.name.slice(0, 2).toUpperCase()}</span>
        <span className="name" title={m.name}>{m.name}</span>
        <span className="faint">{m.role === 'owner' ? 'Propietario' : m.role === 'editor' ? 'Editor' : 'Lector'}</span>
      </li>)}</ul>
    </section>}
    <section className="share-general" aria-labelledby="share-access-label">
      <h2 id="share-access-label" className="share-section-title">Acceso general</h2>
      <div className="share-access">
        {access === 'none' ? <Lock size={15} /> : <Globe size={15} />}
        <div>
          <label className="sr-only" htmlFor="share-access">Permiso del enlace</label>
          <select id="share-access" className="input share-permission" value={access} disabled={!owner || busy} onChange={e => void change(e.target.value as LinkAccess)} aria-describedby="share-access-description">
            {ACCESS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <div className="share-audience">{access === 'none' ? 'Solo personas con acceso' : 'Cualquiera con el enlace'}</div>
        </div>
      </div>
      <p id="share-access-description" className="share-description">{ACCESS.find(a => a.value === access)!.hint}</p>
      {!owner && <p className="share-description">Solo el propietario puede cambiar este permiso.</p>}
    </section>
    <div className="share-link">
      <label className="sr-only" htmlFor="share-url">Enlace para compartir</label>
      <input id="share-url" className="input" value={link} readOnly onFocus={e => e.target.select()} />
      <div className="share-footer">
        {access !== 'none' && !busy ? <a className="share-preview" href={projectLink(project.room, access, true)} target="_blank" rel="noreferrer">Vista de invitado <ExternalLink size={12} /></a> : <span />}
        <button className="btn primary sm" disabled={busy} onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
      </div>
    </div>
    <span className="sr-only" role="status">{saving ? 'Guardando permiso' : copied ? 'Enlace copiado' : ''}</span>
    {error && <p className="share-error" role="alert">{error}</p>}
  </div>;
}
