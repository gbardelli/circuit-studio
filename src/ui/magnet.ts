import type { PartData, Vec } from "../core/types";
import { toWorld, snap } from "../core/types";
import { PARTS } from "../parts";
export function occupiedHoles(part: PartData, at: Vec, others: PartData[]) {
  if (PARTS[part.type].category === "Protoboards") return [];
  const socketAt = new Set<string>(),
    occupied = new Set<string>();
  for (const other of others) {
    if (other.id === part.id) continue;
    for (const pin of PARTS[other.type].pins(other.props)) {
      const p = toWorld(other, pin),
        key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (pin.kind === "socket") socketAt.add(key);
      else occupied.add(key);
    }
  }
  return PARTS[part.type]
    .pins(part.props)
    .filter((pin) => pin.kind === "leg")
    .map((pin) => toWorld({ ...part, ...at }, pin))
    .filter((p) => {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      return socketAt.has(key) && occupied.has(key);
    });
}
export function magneticPosition(
  part: PartData,
  raw: Vec,
  others: PartData[],
  zoom: number,
  held: Vec | null = null,
): { at: Vec; held: Vec | null } {
  const fallback = { x: snap(raw.x), y: snap(raw.y) };
  if (PARTS[part.type].category === "Protoboards")
    return { at: fallback, held: null };
  const legs = PARTS[part.type]
    .pins(part.props)
    .filter((p) => p.kind === "leg");
  if (!legs.length) return { at: fallback, held: null };
  if (held && Math.hypot(raw.x - held.x, raw.y - held.y) * zoom < 11)
    return { at: held, held };
  const sockets: Vec[] = [],
    occupied = new Set<string>();
  for (const other of others) {
    if (other.id === part.id) continue;
    for (const pin of PARTS[other.type].pins(other.props)) {
      const at = toWorld(other, pin);
      if (pin.kind === "socket") sockets.push(at);
      else occupied.add(`${Math.round(at.x)},${Math.round(at.y)}`);
    }
  }
  const available = new Set(
    sockets
      .filter((p) => !occupied.has(`${Math.round(p.x)},${Math.round(p.y)}`))
      .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
  );
  let best: Vec | null = null,
    score = Infinity;
  for (const leg of legs.slice(0, 2)) {
    const pos = toWorld({ ...part, ...raw }, leg);
    for (const socket of sockets) {
      const distance = Math.hypot(pos.x - socket.x, pos.y - socket.y) * zoom;
      if (distance > 6 || distance >= score) continue;
      const at = { x: raw.x + socket.x - pos.x, y: raw.y + socket.y - pos.y };
      if (
        !legs.every((pin) => {
          const p = toWorld({ ...part, ...at }, pin);
          return available.has(`${Math.round(p.x)},${Math.round(p.y)}`);
        })
      )
        continue;
      best = at;
      score = distance;
    }
  }
  return { at: best ?? fallback, held: best };
}
