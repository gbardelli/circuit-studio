import { toWorld, type PartData, type Vec, type WireData, type WireEnd } from '../core/types';
import { PARTS } from '../parts';

export const WIRE_COLORS = [
  { value: '#e5484d', label: 'Rojo' },
  { value: '#26272b', label: 'Negro' },
  { value: '#3e7bfa', label: 'Azul' },
  { value: '#2fbf71', label: 'Verde' },
  { value: '#f5c518', label: 'Amarillo' },
  { value: '#f2862e', label: 'Naranja' },
  { value: '#f4f4f5', label: 'Blanco' },
  { value: '#9b6bf2', label: 'Morado' },
];

/** Color sugerido según el pin de origen: rojo para positivo, negro para tierra. */
export function suggestWireColor(pinId: string): string {
  if (/^(GND(\.\d)?|-|tn\d+|bn\d+|COM)$/i.test(pinId)) return '#26272b';
  if (/^(5V|3V3|VCC|VDD|VIN|\+|V\+|tp\d+|bp\d+)$/i.test(pinId)) return '#e5484d';
  if (/CLK|CLOCK|CP|OSC/i.test(pinId)) return '#f5c518';
  if (/RESET|RST|CLR/i.test(pinId)) return '#9b6bf2';
  return '#3e7bfa';
}

export function partBounds(p: PartData) {
  const b = PARTS[p.type].bounds(p.props);
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
  const pin = PARTS[p.type].pins(p.props).find((q) => q.id === pinId);
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
