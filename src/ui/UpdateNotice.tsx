import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Aviso de versión nueva. Una app de una sola página no se recarga sola tras un despliegue: la
 * pestaña abierta seguiría con el código viejo (y un módulo diferido podría ni existir ya).
 * Se compara el script principal servido ahora con el que cargó la página, al volver a la
 * pestaña y cada pocos minutos. Si cambió, una tarjeta discreta ofrece recargar; nunca recarga sola.
 */
const ENTRY = /\/assets\/index-[\w-]+\.js/;
let outdated = false;
const listeners = new Set<() => void>();

/** Lo llama también la carga diferida del 3D si su módulo ya no existe en el servidor. */
export function markOutdated() {
  if (outdated) return;
  outdated = true;
  listeners.forEach((f) => f());
}

function currentEntry() {
  const s = [...document.scripts].find((x) => ENTRY.test(x.src));
  return s ? s.src.match(ENTRY)![0] : null;
}

async function check(entry: string) {
  try {
    const html = await fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
    const served = html.match(ENTRY)?.[0];
    if (served && served !== entry) markOutdated();
  } catch {
    /* sin red: se vuelve a intentar más tarde */
  }
}

export function UpdateNotice() {
  const [show, setShow] = useState(outdated);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    listeners.add(on);
    const entry = currentEntry();
    if (!entry) return () => void listeners.delete(on); // desarrollo: sin hash
    const onVisible = () => document.visibilityState === 'visible' && void check(entry);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void check(entry), 5 * 60_000);
    return () => {
      listeners.delete(on);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  if (!show || dismissed) return null;
  return (
    <div className="update-notice" role="status" aria-live="polite">
      <span className="update-dot" aria-hidden />
      <span className="update-text">
        <strong>Hay una versión nueva</strong>
        <span>Recarga para usar las últimas mejoras. Tu trabajo está guardado.</span>
      </span>
      <button className="btn sm primary" onClick={() => location.reload()}>
        <RefreshCw size={13} /> Recargar
      </button>
      <button className="icon-btn" aria-label="Ahora no" title="Ahora no" onClick={() => setDismissed(true)}>
        <X size={14} />
      </button>
    </div>
  );
}
