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

/**
 * Pantalla de arranque. Sin esperas decorativas: se queda exactamente lo que tardan la sesión,
 * el proyecto y el código de la vista, y se va en cuanto están. Continúa la del documento de
 * arranque (index.html) en vez de repetirla, y si la carga es rápida ni siquiera llega a verse:
 * su contenido entra con un pequeño retraso (brand.css).
 */
type Task = "session" | "project" | "code";
const LoadingContext = createContext<(task: Task, loading: boolean) => void>(
  () => {},
);
const LEAVE_MS = 220;

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
  const [visible, setVisible] = useState(true);
  // Continúa la entrada del documento de arranque en vez de repetirla al montar React.
  const [arrivalDelay] = useState(() => `${-performance.now()}ms`);
  const loading = Object.values(tasks).some(Boolean);
  const setLoading = useCallback((task: Task, pending: boolean) => {
    setTasks((previous) =>
      previous[task] === pending ? previous : { ...previous, [task]: pending },
    );
  }, []);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <LoadingContext.Provider value={setLoading}>
      {children}
      {visible && (
        <div
          className={`brand-screen${loading ? "" : " brand-screen-leaving"}`}
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

/** Misma composición que el documento de arranque de index.html: cámbialas juntas. */
export function BrandScene({ loading }: { loading: boolean }) {
  return (
    <div className="brand-content" aria-hidden="true">
      <div className="brand-lockup">
        <span className="brand-mark">
          <svg className="brand-signal" viewBox="2 8 38 24" fill="none">
            <path
              d="M5 27h8V13h8v14h8V13h6"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
            />
          </svg>
        </span>
        <span className="brand-name">
          circuit<b>studio</b>
        </span>
      </div>
      <span className="brand-indicator" data-loading={loading || undefined} />
    </div>
  );
}

/** Fallback de Suspense: mantiene la pantalla de marca mientras llega el código de la vista. */
export function PendingCode() {
  useStartupTask("code", true);
  return null;
}
