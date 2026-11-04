import type { Vec, WireData } from '../core/types';
import { distToSegment } from './geometry';

/** One physical wire is emphasized. Electrical-network inspection is a separate action. */
export function wireEmphasis(id: string, hovered: string | null, selected: readonly string[], assembly?: string | null) {
  if (assembly) return { hovered: false, opacity: id === assembly ? 1 : .12 };
  const active = hovered ?? selected[0];
  return { hovered: id === hovered, opacity: !active || id === active || selected.includes(id) ? 1 : .48 };
}

/** Prefer the nearest line, rather than whichever transparent SVG hit area was painted last. */
export function nearestWire(point: Vec, wires: readonly WireData[], points: (wire: WireData) => Vec[], zoom: number, fallback: string | null) {
  let best = fallback, distance = 7 / Math.max(zoom, .1);
  const candidates = fallback ? [...wires.filter(w => w.id === fallback), ...wires.filter(w => w.id !== fallback)] : wires;
  for (const wire of candidates) {
    const ps = points(wire);
    for (let n = 1; n < ps.length; n++) {
      const d = distToSegment(point, ps[n - 1], ps[n]);
      if (d < distance - .01) { distance = d; best = wire.id; }
    }
  }
  return best;
}

export const FLOW_PERIOD = 12;
export interface FlowFrame { phase: number; speed: number; opacity: number; voltage: number }
export const emptyFlowFrame = (): FlowFrame => ({ phase: 0, speed: 0, opacity: 0, voltage: 0 });
/** Frame-rate independent damping and a phase wrap equal to one complete dash period. */
export function advanceFlow(previous: FlowFrame, amps: number, volts: number, dt: number, reduced: boolean): FlowFrame {
  const seconds = Math.min(.05, Math.max(0, dt));
  const blend = 1 - Math.exp(-seconds / .16);
  const magnitude = Math.abs(amps);
  const targetSpeed = magnitude < 1e-5 || reduced ? 0 : Math.sign(amps) * Math.min(100, 32 * Math.sqrt(magnitude / .001));
  const speed = previous.speed + (targetSpeed - previous.speed) * blend;
  const opacity = previous.opacity + (Math.min(.8, Math.max(0, (magnitude - 5e-6) / 4e-5) * .8) - previous.opacity) * blend;
  const distance = targetSpeed * seconds + (previous.speed - targetSpeed) * .16 * blend;
  const phase = reduced ? previous.phase : ((previous.phase - distance) % FLOW_PERIOD + FLOW_PERIOD) % FLOW_PERIOD;
  return { phase, speed, opacity, voltage: previous.voltage + (volts - previous.voltage) * blend };
}
