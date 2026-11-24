// Comparación nodo a nodo: motor propio frente a ngspice en el punto de operación.
import { spiceNode, type SpiceDeck } from './netlist';
import type { OpResult } from './ngspice';

/** Tolerancia: 1 mV absoluto o 0,5 % relativo (lo que sea mayor). */
export const ABS_TOL = 1e-3;
export const REL_TOL = 5e-3;

export interface SpiceCheck {
  id: number;
  state: 'ok' | 'warn' | 'error';
  nodes: number;
  devices: number;
  behavioral: number;
  /** Mayor diferencia absoluta (V) y dónde. */
  maxDiff: number;
  worst: { label: string; ours: number; spice: number } | null;
  /** Nodos fuera de tolerancia. */
  off: { label: string; ours: number; spice: number }[];
  ms: number;
  error: string | null;
}

export function compare(deck: SpiceDeck, op: OpResult): SpiceCheck {
  const base = { id: deck.id, nodes: deck.ours.length, devices: deck.devices, behavioral: deck.behavioral, ms: op.ms };
  if (op.error) return { ...base, state: 'error', maxDiff: NaN, worst: null, off: [], error: op.error };
  let maxDiff = 0;
  let worst: SpiceCheck['worst'] = null;
  const off: SpiceCheck['off'] = [];
  deck.ours.forEach((ours, k) => {
    const spice = op.volts[spiceNode(k)];
    if (spice === undefined) return;
    const diff = Math.abs(ours - spice);
    const row = { label: deck.labels[k] ?? `nodo ${k}`, ours, spice };
    if (diff > maxDiff) {
      maxDiff = diff;
      worst = row;
    }
    if (diff > Math.max(ABS_TOL, REL_TOL * Math.abs(spice))) off.push(row);
  });
  return { ...base, state: off.length ? 'warn' : 'ok', maxDiff, worst, off, error: null };
}
