// Shields que se apilan sobre una placa, como la GIGA Display Shield sobre el GIGA R1. Igual que
// las patillas en la protoboard, el montaje se deduce del dibujo: una shield está montada cuando
// su centro cae dentro de una placa de su tipo con el mismo giro. Nada se guarda aparte.
import { toLocal, toWorld, type PartData, type Vec } from '../core/types';
import { PARTS } from '.';

function center(p: PartData): Vec {
  const b = PARTS[p.type].bounds(p.props);
  return toWorld(p, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
}

function contains(host: PartData, point: Vec) {
  const b = PARTS[host.type].bounds(host.props);
  const l = toLocal(host, point);
  return l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h;
}

/** Placa sobre la que está montada la shield, si lo está. */
export function stackHost(shield: PartData, parts: PartData[]): PartData | undefined {
  const type = PARTS[shield.type]?.stacksOn;
  if (!type) return undefined;
  const c = center(shield);
  return parts.find((p) => p.type === type && p.rot === shield.rot && contains(p, c));
}

/** Shields montadas sobre una placa. */
export function stackedOn(host: PartData, parts: PartData[]): PartData[] {
  return parts.filter((p) => PARTS[p.type]?.stacksOn === host.type && stackHost(p, parts)?.id === host.id);
}

/** Posición que centra la shield sobre la placa, con su mismo giro. */
export function mountedPosition(shield: PartData, host: PartData): Vec {
  const b = PARTS[shield.type].bounds(shield.props);
  const offset = toWorld({ x: 0, y: 0, rot: host.rot }, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const c = center(host);
  return { x: c.x - offset.x, y: c.y - offset.y };
}

/** Lo que se mueve al arrastrar: cada placa lleva consigo sus shields. */
export function withStacks(ids: string[], parts: PartData[]): string[] {
  const out = new Set(ids);
  for (const p of parts) if (out.has(p.id)) for (const s of stackedOn(p, parts)) out.add(s.id);
  return [...out];
}
