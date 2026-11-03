// Posición de patillas y cajas del modo diseño en coordenadas del lienzo (rejilla de 10).
import { rotate, type Rotation, type Vec } from '../../core/types';
import { elementDef, type ElementCtx, type ElementDef, type LogicPinDef } from '../../logic/elements';
import type { LogicNode, LogicSheet } from '../../logic/types';

export const GRID = 10;

export interface PlacedPin extends LogicPinDef {
  /** Posición en el lienzo y sentido hacia fuera del elemento. */
  at: Vec;
  out: Vec;
}

export interface Placed {
  node: LogicNode;
  def: ElementDef;
  w: number;
  h: number;
  pins: PlacedPin[];
  box: { x: number; y: number; w: number; h: number };
}

/** Sin simulación: los integrados anidados no hacen falta para dibujar. */
export const drawCtx = (lookup: (id: string) => LogicSheet | undefined): ElementCtx => ({ sheet: lookup, instantiate: () => null });

const toWorld = (node: LogicNode, p: Vec) => {
  const r = rotate(p, node.rot as Rotation);
  return { x: node.x + r.x, y: node.y + r.y };
};

export function place(node: LogicNode, lookup: (id: string) => LogicSheet | undefined): Placed | null {
  const def = elementDef(node.kind, lookup);
  if (!def) return null;
  const ctx = drawCtx(lookup);
  const { w, h } = def.size(node.props, ctx);
  const pins = def.pins(node.props, ctx).map((p) => {
    const local = p.x <= 0 ? { x: -1, y: 0 } : p.x >= w ? { x: 1, y: 0 } : p.y <= 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
    return { ...p, at: toWorld(node, p), out: rotate(local, node.rot as Rotation) };
  });
  const corners = [toWorld(node, { x: 0, y: 0 }), toWorld(node, { x: w, y: h })];
  const box = {
    x: Math.min(corners[0].x, corners[1].x),
    y: Math.min(corners[0].y, corners[1].y),
    w: Math.abs(corners[1].x - corners[0].x),
    h: Math.abs(corners[1].y - corners[0].y),
  };
  return { node, def, w, h, pins, box };
}

/**
 * Recorrido ortogonal entre dos patillas: sale y entra 10 unidades en el sentido de cada una
 * y cambia de dirección a mitad de camino.
 */
export function route(a: Vec, aOut: Vec, b: Vec, bOut: Vec): Vec[] {
  const a1 = { x: a.x + aOut.x * GRID, y: a.y + aOut.y * GRID };
  const b1 = { x: b.x + bOut.x * GRID, y: b.y + bOut.y * GRID };
  const pts: Vec[] = [a, a1];
  if (a1.x === b1.x || a1.y === b1.y) pts.push(b1);
  else if (aOut.y === 0 && bOut.y === 0) {
    const mx = Math.round((a1.x + b1.x) / 2 / GRID) * GRID;
    if ((aOut.x > 0 && b1.x >= a1.x) || (aOut.x < 0 && b1.x <= a1.x)) pts.push({ x: mx, y: a1.y }, { x: mx, y: b1.y });
    else {
      // Hacia atrás: rodea por la mitad vertical.
      const my = Math.round((a1.y + b1.y) / 2 / GRID) * GRID;
      pts.push({ x: a1.x, y: my }, { x: b1.x, y: my });
    }
    pts.push(b1);
  } else if (aOut.x === 0 && bOut.x === 0) {
    const my = Math.round((a1.y + b1.y) / 2 / GRID) * GRID;
    pts.push({ x: a1.x, y: my }, { x: b1.x, y: my }, b1);
  } else pts.push(aOut.x !== 0 ? { x: b1.x, y: a1.y } : { x: a1.x, y: b1.y }, b1);
  pts.push(b);
  // Quita los puntos alineados.
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const q = pts[i - 1];
    const r = pts[i + 1];
    return !((q.x === p.x && p.x === r.x) || (q.y === p.y && p.y === r.y)) && !(q.x === p.x && q.y === p.y);
  });
}

export const pathOf = (pts: Vec[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
