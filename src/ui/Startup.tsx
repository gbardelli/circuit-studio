import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

const INTRO_KEY = 'cs-brand-seen';
const INTRO_MS = 1200;
type Task = 'session' | 'project';
const LoadingContext = createContext<(task: Task, loading: boolean) => void>(() => {});

export function shouldPlayIntro(storage: Pick<Storage, 'getItem'> | null, reducedMotion: boolean) {
  if (reducedMotion) return false;
  try {
    return storage?.getItem(INTRO_KEY) !== '1';
  } catch {
    return true;
  }
}

function initialIntro() {
  try {
    return shouldPlayIntro(window.sessionStorage, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Ready signals come from real authentication and project requests. No fake progress. */
export function Startup({ children, cloud }: { children: ReactNode; cloud: boolean }) {
  const [tasks, setTasks] = useState<Partial<Record<Task, boolean>>>({ session: cloud });
  const [intro, setIntro] = useState(initialIntro);
  const [visible, setVisible] = useState(() => intro || cloud);
  const loading = Object.values(tasks).some(Boolean);
  const leaving = !loading && !intro;
  const setLoading = useCallback((task: Task, pending: boolean) => {
    setTasks((previous) => previous[task] === pending ? previous : { ...previous, [task]: pending });
  }, []);

  useEffect(() => {
    if (!intro) return;
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* Animation still works without storage. */ }
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (media.matches) setIntro(false); };
    media.addEventListener('change', reduce);
    return () => { clearTimeout(timer); media.removeEventListener('change', reduce); };
  }, [intro]);

  useEffect(() => {
    if (loading) { setVisible(true); return; }
    const skip = () => setIntro(false);
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => { window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
  }, [loading]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timer);
  }, [leaving]);

  return <LoadingContext.Provider value={setLoading}>
    {children}
    {(visible || loading) && <div className={`brand-screen${leaving ? ' brand-screen-leaving' : ''}`} role="status" aria-label={loading ? 'Cargando CircuitStudio' : 'CircuitStudio'}>
      <BrandScene loading={loading} />
    </div>}
  </LoadingContext.Provider>;
}

export function useStartupTask(task: Task, loading: boolean) {
  const setLoading = useContext(LoadingContext);
  useLayoutEffect(() => {
    setLoading(task, loading);
    return () => setLoading(task, false);
  }, [task, loading, setLoading]);
}

function BrandScene({ loading }: { loading: boolean }) {
  return <>
    <div className="brand-field" aria-hidden="true" />
    <div className="brand-grain" aria-hidden="true" />
    <svg className="brand-traces" viewBox="0 0 1000 400" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="0.7">
        <path d="M0 160h240l40 40h100m620 40H760l-40-40H620" />
        <path d="M0 128h200l40-40h100l64 64h40m556 120H800l-40 40H660l-64-64h-40" />
        <path d="M80 400V288l72-72h100l24 24h64m580-240v112l-72 72H748l-24-24h-64" />
        <circle cx="380" cy="200" r="3" /><circle cx="620" cy="200" r="3" />
        <circle cx="444" cy="152" r="3" /><circle cx="556" cy="248" r="3" />
        <circle cx="340" cy="240" r="3" /><circle cx="660" cy="160" r="3" />
      </g>
    </svg>
    <div className="brand-lockup" aria-hidden="true">
      <svg className="brand-signal" viewBox="0 0 32 32" fill="none">
        <path className="brand-signal-path" d="M6 20h4v-8h5v8h4v-8h3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="brand-signal-node" cx="25" cy="12" r="1.8" fill="currentColor" />
      </svg>
      <div className="brand-name">CircuitStudio<span className="brand-name-period">.</span></div>
      <p className="brand-caption">De la idea al circuito.</p>
    </div>
    {loading && <div className="brand-loading" aria-hidden="true"><span />Preparando tu espacio</div>}
    <span className="brand-signature" aria-hidden="true">CIRCUITSTUDIO / ESTUDIO DE CIRCUITOS</span>
  </>;
}
