import { toWorld, type PartData, type Vec, type WireData, type WireEnd } from '../core/types';
import { PARTS } from '../parts';

/** Colores de cable: los 12 de Tinkercad. Pocos y con nombre, como en la mesa de trabajo real. */
export const WIRE_COLORS = [
  { value: '#26272b', label: 'Negro' },
  { value: '#e5484d', label: 'Rojo' },
  { value: '#f2862e', label: 'Naranja' },
  { value: '#f5c518', label: 'Amarillo' },
  { value: '#2fbf71', label: 'Verde' },
  { value: '#22b8c4', label: 'Turquesa' },
  { value: '#3e7bfa', label: 'Azul' },
  { value: '#9b6bf2', label: 'Morado' },
  { value: '#e86fb3', label: 'Rosa' },
  { value: '#8b5a2b', label: 'Marrón' },
  { value: '#8a8f98', label: 'Gris' },
  { value: '#f4f4f5', label: 'Blanco' },
];

/** El color de la paleta más parecido a uno cualquiera (para limitar montajes con muchos tonos). */
export function nearestWireColor(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return WIRE_COLORS[6].value;
  const [r, g, b] = rgb(hex);
  let best = WIRE_COLORS[0].value, dist = Infinity;
  for (const c of WIRE_COLORS) {
    const [cr, cg, cb] = rgb(c.value);
    // Distancia ponderada (el ojo distingue más el verde) — suficiente para elegir entre 12 colores.
    const d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < dist) { dist = d; best = c.value; }
  }
  return best;
}

/** Color sugerido según el pin de origen: rojo para positivo, negro para tierra. */
export function suggestWireColor(pinId: string): string {
  if (/^(GND(\.\d)?|-|tn\d+|bn\d+|COM)$/i.test(pinId)) return '#26272b';
  if (/^(5V|3V3|VCC|VDD|VIN|\+|V\+|tp\d+|bp\d+)$/i.test(pinId)) return '#e5484d';
  if (/CLK|CLOCK|CP|OSC/i.test(pinId)) return '#f5c518';
  if (/RESET|RST|CLR/i.test(pinId)) return '#9b6bf2';
  return '#3e7bfa';
}

export function partBounds(p: PartData) {
  const b = PARTS[p.type]?.bounds(p.props) ?? { x: 0, y: 0, w: 80, h: 40 };
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.w, y: b.y + b.h },
  ].map((c) => toWorld(p, c));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function pinWorld(p: PartData, pinId: string): Vec | null {
  const pin = PARTS[p.type]?.pins(p.props).find((q) => q.id === pinId);
  return pin ? toWorld(p, pin) : null;
}

export function endPosition(end: WireEnd, parts: Map<string, PartData>, offsets?: Map<string, Vec>): Vec {
  if (end.part && end.pin) {
    const p = parts.get(end.part);
    if (p) {
      const pos = pinWorld(p, end.pin);
      if (pos) {
        const o = offsets?.get(p.id);
        return o ? { x: pos.x + o.x, y: pos.y + o.y } : pos;
      }
    }
  }
  return { x: end.x, y: end.y };
}

export function wirePath(points: Vec[]) {
  if (points.length === 0) return '';
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += `L${points[i].x} ${points[i].y}`;
  return d;
}

export function wirePoints(w: WireData, parts: Map<string, PartData>, offsets?: Map<string, Vec>): Vec[] {
  return [endPosition(w.a, parts, offsets), ...w.points, endPosition(w.b, parts, offsets)];
}

export function distToSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
