import { memo, useMemo } from 'react';
import type { CircuitSnapshot } from '../core/types';
import { PARTS } from '../parts';
import { partBounds, wirePoints } from './geometry';
import { WireShape } from './wires';

/** Miniatura estática de un circuito (plantillas y proyectos recientes). */
export const CircuitPreview = memo(function CircuitPreview({ snapshot, pad = 30 }: { snapshot: CircuitSnapshot; pad?: number }) {
  const { box, parts } = useMemo(() => {
    const parts = new Map(snapshot.parts.map((p) => [p.id, p]));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of snapshot.parts) {
      const b = partBounds(p);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    for (const w of snapshot.wires)
      for (const pt of wirePoints(w, parts)) {
        x0 = Math.min(x0, pt.x);
        y0 = Math.min(y0, pt.y);
        x1 = Math.max(x1, pt.x);
        y1 = Math.max(y1, pt.y);
      }
    if (!Number.isFinite(x0)) return { box: '0 0 100 60', parts };
    return { box: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, parts };
  }, [snapshot, pad]);
  return (
    <svg viewBox={box} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {snapshot.parts.map((p) => {
        const def = PARTS[p.type];
        return (
          <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
            <def.Render part={p} visual={null} preview />
          </g>
        );
      })}
      {snapshot.wires.map((w) => (
        <WireShape key={w.id} points={wirePoints(w, parts)} color={w.color} />
      ))}
    </svg>
  );
});
