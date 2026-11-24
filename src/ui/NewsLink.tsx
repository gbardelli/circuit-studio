import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const KEY = 'cs:news-seen';

/** «Novedades» en la portada. Un punto discreto cuando hay una versión que aún no has abierto. */
export function NewsLink() {
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    // Fuera del camino crítico: 100 bytes cuando el navegador está libre.
    const ric = 'requestIdleCallback' in window;
    const run = () => {
      fetch('/changelog/latest.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((latest: { version?: string } | null) => {
          if (!latest?.version) return;
          let seen: string | null = null;
          try {
            seen = localStorage.getItem(KEY);
          } catch {
            /* almacenamiento bloqueado: no hay punto */
            return;
          }
          if (seen !== latest.version) setFresh(latest.version);
        })
        .catch(() => {});
    };
    const id = ric ? window.requestIdleCallback(run, { timeout: 3000 }) : window.setTimeout(run, 1200);
    return () => (ric ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, []);
  return (
    <a
      className="nav-item news-link"
      href="/changelog/"
      onClick={() => {
        if (!fresh) return;
        try {
          localStorage.setItem(KEY, fresh);
        } catch {
          /* sin almacenamiento */
        }
      }}
    >
      <Sparkles size={16} /> Novedades
      {fresh && <span className="news-dot" aria-label={`Versión ${fresh} sin leer`} />}
    </a>
  );
}
