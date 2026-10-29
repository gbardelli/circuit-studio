// Modelo de circuito independiente del motor y de la interfaz.
// Unidades de mundo: 10 = 0.1" (paso de protoboard). Todo pin cae en la rejilla de 10.

export const PITCH = 10;

export type Rotation = 0 | 90 | 180 | 270;

export interface Vec {
  x: number;
  y: number;
}

export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

export interface PartData {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: Rotation;
  props: Props;
}

export interface PinRef {
  part: string;
  pin: string;
}

export interface WireEnd {
  part?: string;
  pin?: string;
  // Posición de respaldo: si la pieza desaparece (borrado concurrente) el cable queda suelto aquí.
  x: number;
  y: number;
}

export interface WireData {
  id: string;
  a: WireEnd;
  b: WireEnd;
  points: Vec[];
  color: string;
}

export interface CircuitSnapshot {
  parts: PartData[];
  wires: WireData[];
}

/** 'leg' = patilla que se inserta; 'socket' = orificio que la recibe (protoboard, cabezales). */
export type PinKind = 'leg' | 'socket';

export interface PinDef {
  id: string;
  x: number;
  y: number;
  kind: PinKind;
  label?: string;
}

export function rotate(p: Vec, rot: Rotation): Vec {
  switch (rot) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

export function inverseRotate(p: Vec, rot: Rotation): Vec {
  return rotate(p, ((360 - rot) % 360) as Rotation);
}

export function toWorld(part: Pick<PartData, 'x' | 'y' | 'rot'>, local: Vec): Vec {
  const r = rotate(local, part.rot);
  return { x: part.x + r.x, y: part.y + r.y };
}

export function toLocal(part: Pick<PartData, 'x' | 'y' | 'rot'>, world: Vec): Vec {
  return inverseRotate({ x: world.x - part.x, y: world.y - part.y }, part.rot);
}

export const snap = (v: number, step = PITCH) => Math.round(v / step) * step;
