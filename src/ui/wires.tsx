import type { Vec } from '../core/types';

/** Polilínea con esquinas redondeadas (radio limitado por la longitud de cada tramo). */
export function roundedPath(points: Vec[], radius = 7) {
  if (points.length === 0) return '';
  if (points.length < 3) return `M${points[0].x} ${points[0].y}` + points.slice(1).map((p) => `L${p.x} ${p.y}`).join('');
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) {
      d += `L${p1.x} ${p1.y}`;
      continue;
    }
    const a = { x: p1.x + ((p0.x - p1.x) / l1) * r, y: p1.y + ((p0.y - p1.y) / l1) * r };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * r, y: p1.y + ((p2.y - p1.y) / l2) * r };
    d += `L${a.x} ${a.y}Q${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return d + `L${last.x} ${last.y}`;
}

export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Cable de puente: núcleo mate, borde más oscuro y un reflejo apenas perceptible. */
export function WireShape({ points, color, selected = false, hovered = false }: { points: Vec[]; color: string; selected?: boolean; hovered?: boolean }) {
  const d = roundedPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const edge = shade(color, -0.45);
  const dark = parseInt(color.slice(1), 16) < 0x404040;
  return (
    <g pointerEvents="none">
      {(selected || hovered) && <path d={d} stroke="var(--accent)" strokeOpacity={selected ? 0.5 : 0.25} strokeWidth={6.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      <path d={d} stroke={dark ? '#000' : edge} strokeWidth={3.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={color} strokeWidth={2.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke="#fff" strokeOpacity={dark ? 0.12 : 0.16} strokeWidth={0.7} fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.35 -0.45)" />
      {[first, last].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.5} fill={dark ? '#111' : edge} />
          <circle cx={p.x} cy={p.y} r={1} fill="#c7cbd1" />
        </g>
      ))}
    </g>
  );
}
