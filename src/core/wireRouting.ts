import type { Vec } from './types';

export interface RouteObstacle { x: number; y: number; w: number; h: number }
const length = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const segments = (route: readonly Vec[]) => route.slice(1).map((b, n) => ({ a: route[n], b }));
function overlap(a: Vec, b: Vec, c: Vec, d: Vec, spacing: number) {
  if (a.x === b.x && c.x === d.x && Math.abs(a.x - c.x) < spacing)
    return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) - 2);
  if (a.y === b.y && c.y === d.y && Math.abs(a.y - c.y) < spacing)
    return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) - 2);
  return 0;
}
export function sharedTrackLength(routes: readonly Vec[][], spacing = .01) {
  let total = 0;
  const prior: { a: Vec; b: Vec }[] = [];
  for (const route of routes) { for (const { a, b } of segments(route)) for (const p of prior) total += overlap(a, b, p.a, p.b, spacing); prior.push(...segments(route)); }
  return total;
}
function simplify(route: Vec[]) {
  const result: Vec[] = [];
  for (const p of route) {
    if (result.length && length(result[result.length - 1], p) === 0) continue;
    while (result.length > 1) {
      const a = result[result.length - 2], b = result[result.length - 1];
      if ((a.x === b.x && b.x === p.x || a.y === b.y && b.y === p.y) && length(a, b) + length(b, p) === length(a, p)) result.pop(); else break;
    }
    result.push(p);
  }
  return result;
}
/** Separate shared runs without moving a terminal or introducing diagonal segments. */
export function separateWireRoutes(routes: readonly Vec[][], obstacles: readonly RouteObstacle[], spacing = 5): Vec[][] {
  const prior: { a: Vec; b: Vec }[] = [];
  const inside = (p: Vec, r: RouteObstacle) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  const clear = (route: Vec[], before: Vec[]) => segments(route).every(({ a, b }, index, all) => segments(before).some(s =>
    (a.x === b.x && s.a.x === s.b.x && a.x === s.a.x || a.y === b.y && s.a.y === s.b.y && a.y === s.a.y) &&
    Math.min(a.x, b.x) >= Math.min(s.a.x, s.b.x) && Math.max(a.x, b.x) <= Math.max(s.a.x, s.b.x) &&
    Math.min(a.y, b.y) >= Math.min(s.a.y, s.b.y) && Math.max(a.y, b.y) <= Math.max(s.a.y, s.b.y)) || obstacles.every(r => {
    if (index === 0 && inside(a, r) && !inside(b, r) || index === all.length - 1 && inside(b, r) && !inside(a, r)) return true;
    if (a.x === b.x) return !(a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h);
    if (a.y === b.y) return !(a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w);
    return false;
  }));
  const score = (route: Vec[]) => segments(route).reduce((sum, { a, b }) => sum + prior.reduce((n, p) => n + overlap(a, b, p.a, p.b, spacing - .1) + 4 * overlap(a, b, p.a, p.b, .01), 0), 0);
  return routes.map(original => {
    let route = simplify(original);
    for (let pass = 0; pass < 5; pass++) {
      const before = score(route);
      if (before < .01) break;
      let best = route, bestScore = before;
      for (let n = 0; n < route.length - 1; n++) {
        const a = route[n], b = route[n + 1];
        if (!prior.some(p => overlap(a, b, p.a, p.b, spacing - .1) > 0)) continue;
        const vertical = a.x === b.x;
        for (let distance = spacing; distance <= spacing * 8; distance += spacing) for (const direction of [1, -1]) {
          const offset = distance * direction;
          const shiftedA = { x: a.x + (vertical ? offset : 0), y: a.y + (vertical ? 0 : offset) };
          const shiftedB = { x: b.x + (vertical ? offset : 0), y: b.y + (vertical ? 0 : offset) };
          const candidate = simplify([...route.slice(0, n), ...(n === 0 ? [a] : []), shiftedA, shiftedB, ...(n === route.length - 2 ? [b] : []), ...route.slice(n + 2)]);
          const cost = score(candidate);
          if (cost >= bestScore - .01 || !clear(candidate, route)) continue;
          best = candidate; bestScore = cost;
        }
      }
      if (best === route) break;
      route = best;
    }
    prior.push(...segments(route));
    return route;
  });
}
