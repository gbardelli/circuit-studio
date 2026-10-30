import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useUi } from "./store";
export function FrameMeter() {
  const active = useUi((s) => s.performanceVisible),
    [measurement, setMeasurement] = useState({ fps: 0, p95: 0, long: 0 });
  useEffect(() => {
    if (!active) return;
    let raf = 0,
      previous = 0,
      reported = 0,
      long = 0;
    const intervals: number[] = [];
    const observer =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
        ? new PerformanceObserver((list) => {
            long += list.getEntries().length;
          })
        : null;
    observer?.observe({ type: "longtask" });
    const frame = (now: number) => {
      if (document.visibilityState === "visible" && previous) {
        const elapsed = now - previous;
        if (elapsed < 200) {
          intervals.push(elapsed);
          if (intervals.length > 180) intervals.shift();
        }
      }
      previous = now;
      if (now - reported > 500 && intervals.length > 8) {
        const sorted = [...intervals].sort((a, b) => a - b),
          average = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
        setMeasurement({
          fps: Math.round(1000 / average),
          p95: sorted[
            Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
          ],
          long,
        });
        reported = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [active]);
  if (!active) return null;
  return (
    <div className="frame-meter" role="status">
      <span className="signal-dot" />
      <strong>{measurement.fps ? `${measurement.fps} fps` : 'Esperando fotogramas'}</strong>
      {measurement.fps>0?<><span>p95 {measurement.p95.toFixed(1)} ms</span><span>{measurement.long} tareas largas</span></>:<span>Activa esta pestaña para medir.</span>}
      <button
        className="icon-btn"
        aria-label="Ocultar medición de fluidez"
        onClick={() => useUi.getState().setPerformanceVisible(false)}
      >
        <X size={11} />
      </button>
    </div>
  );
}
