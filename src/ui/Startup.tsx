import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

const INTRO_KEY = 'cs-brand-seen-v2';
const INTRO_MS = 520;
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
    const timer = window.setTimeout(() => setVisible(false), 140);
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
    <div className="brand-grain" aria-hidden="true" />
    <div className="brand-lockup" aria-hidden="true">
      <svg className="brand-signal" viewBox="4 7 26 18" fill="none">
        <path className="brand-signal-base" d="M6 20h4v-8h5v8h4v-8h3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <path className="brand-signal-path" pathLength="1" d="M6 20h4v-8h5v8h4v-8h3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="brand-signal-node" cx="25" cy="12" r="2" />
      </svg>
      <span className="brand-name">CircuitStudio</span>
    </div>
    {loading && <span className="brand-loading" aria-hidden="true">Preparando tu espacio</span>}
  </>;
}
