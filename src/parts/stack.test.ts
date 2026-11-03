import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from '../collab/project';
import { stackHost, withStacks } from './stack';

vi.mock('../cloud', () => ({ CLOUD: false, sessionUser: () => null, sessionToken: async () => null, colorFor: () => '#888' }));
const opened: Project[] = [];
beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_COLLAB_URL', '');
});
afterEach(() => {
  opened.splice(0).forEach((p) => p.destroy());
  vi.unstubAllEnvs();
});
const open = () => {
  const p = new Project(crypto.randomUUID(), 'owner');
  opened.push(p);
  return p;
};
const part = (p: Project, id: string) => p.snapshot().parts.find((q) => q.id === id)!;

describe('GIGA Display Shield apilada sobre el GIGA', () => {
  it('encaja centrada al soltarla encima y se mueve con la placa', () => {
    const p = open();
    const giga = p.addPart('arduino-giga', 0, 0);
    const shield = p.addPart('giga-display-shield', 40, 30);
    const at = part(p, shield);
    expect(stackHost(at, p.snapshot().parts)?.id).toBe(giga);
    expect([at.x, at.y]).toEqual([9, -11]);
    expect(withStacks([giga], p.snapshot().parts)).toEqual([giga, shield]);

    p.moveParts([{ id: giga, x: 100, y: 50 }]);
    expect([part(p, shield).x, part(p, shield).y]).toEqual([109, 39]);
  });

  it('se separa al arrastrar solo la shield y gira con su placa', () => {
    const p = open();
    const giga = p.addPart('arduino-giga', 0, 0);
    const shield = p.addPart('giga-display-shield', 9, -11);
    p.rotateParts([giga]);
    expect(part(p, shield).rot).toBe(90);
    expect(stackHost(part(p, shield), p.snapshot().parts)?.id).toBe(giga);

    p.moveParts([{ id: shield, x: 900, y: 900 }]);
    expect(stackHost(part(p, shield), p.snapshot().parts)).toBeUndefined();
    expect([part(p, giga).x, part(p, giga).y]).toEqual([0, 0]);
  });
});
