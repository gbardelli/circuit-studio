import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const INTRO_KEY = "cs-brand-seen-v2";
const INTRO_MS = 520;
type Task = "session" | "project";
const LoadingContext = createContext<(task: Task, loading: boolean) => void>(
  () => {},
);

export function shouldPlayIntro(
  storage: Pick<Storage, "getItem"> | null,
  reducedMotion: boolean,
) {
  if (reducedMotion) return false;
  try {
    return storage?.getItem(INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

function initialIntro() {
  try {
    return shouldPlayIntro(
      window.sessionStorage,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  } catch {
    return false;
  }
}

/** Ready signals come from real authentication and project requests. No fake progress. */
export function Startup({
  children,
  cloud,
}: {
  children: ReactNode;
  cloud: boolean;
}) {
  const [tasks, setTasks] = useState<Partial<Record<Task, boolean>>>({
    session: cloud,
  });
  const [intro, setIntro] = useState(initialIntro);
  const [visible, setVisible] = useState(() => intro || cloud);
  // Continue the boot document's entrance rather than replaying it when React mounts.
  const [arrivalDelay] = useState(() => `${-performance.now()}ms`);
  const loading = Object.values(tasks).some(Boolean);
  const leaving = !loading && !intro;
  const setLoading = useCallback((task: Task, pending: boolean) => {
    setTasks((previous) =>
      previous[task] === pending ? previous : { ...previous, [task]: pending },
    );
  }, []);

  useEffect(() => {
    if (!intro) return;
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* Animation still works without storage. */
    }
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (media.matches) setIntro(false);
    };
    media.addEventListener("change", reduce);
    return () => {
      clearTimeout(timer);
      media.removeEventListener("change", reduce);
    };
  }, [intro]);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      return;
    }
    const skip = () => setIntro(false);
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [loading]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setVisible(false), 140);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <LoadingContext.Provider value={setLoading}>
      {children}
      {(visible || loading) && (
        <div
          className={`brand-screen${leaving ? " brand-screen-leaving" : ""}`}
          style={{ "--brand-arrival-delay": arrivalDelay } as CSSProperties}
          role="status"
          aria-label={loading ? "Cargando CircuitStudio" : "CircuitStudio"}
        >
          <BrandScene loading={loading} />
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useStartupTask(task: Task, loading: boolean) {
  const setLoading = useContext(LoadingContext);
  useLayoutEffect(() => {
    setLoading(task, loading);
    return () => setLoading(task, false);
  }, [task, loading, setLoading]);
}

export function BrandScene({ loading }: { loading: boolean }) {
  return (
    <>
      <div className="brand-grain" aria-hidden="true" />
      <div className="brand-content" aria-hidden="true">
        <div className="brand-lockup">
          <svg className="brand-signal" viewBox="2 8 38 24" fill="none">
            <path
              d="M5 27h8V13h8v14h8V13h6"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="brand-name">
            circuit<b>studio</b>
          </span>
        </div>
        <div className="brand-loading" data-loading={loading || undefined}>
          <span className="brand-indicator" />
          <span>Cargando</span>
        </div>
      </div>
    </>
  );
}
