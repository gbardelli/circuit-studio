import { describe, expect, it } from 'vitest';
import { separateWireRoutes, sharedTrackLength } from './wireRouting';
import type { Vec } from './types';

describe('wire routing', () => {
  const routes: Vec[][] = [
    [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 0 }],
    [{ x: 10, y: 0 }, { x: 10, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 0 }],
  ];
  it('separates shared tracks while preserving terminals and orthogonal geometry', () => {
    const result = separateWireRoutes(routes, []);
    expect(sharedTrackLength(routes)).toBeGreaterThan(50);
    expect(sharedTrackLength(result)).toBe(0);
    result.forEach((route, i) => {
      expect(route[0]).toEqual(routes[i][0]);
      expect(route.at(-1)).toEqual(routes[i].at(-1));
      route.slice(1).forEach((p, n) => expect(p.x === route[n].x || p.y === route[n].y).toBe(true));
    });
    expect(separateWireRoutes(routes, [])).toEqual(result);
  });
  it('chooses the free side of a shared corridor instead of crossing a component body', () => {
    const obstacle = { x: 5, y: 21, w: 70, h: 40 };
    const result = separateWireRoutes(routes, [obstacle]);
    expect(sharedTrackLength(result)).toBe(0);
    expect(result[1].every(p => p.y <= 21)).toBe(true);
  });
  it('keeps an obstructed route rather than relocating terminals or cutting through a body', () => {
    expect(separateWireRoutes(routes, [{ x: -100, y: -100, w: 300, h: 300 }])).toEqual(routes);
  });
});
