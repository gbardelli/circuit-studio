import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Project } from './project';

vi.mock('../cloud', () => ({ CLOUD: false, sessionUser: () => null, sessionToken: async () => null, colorFor: () => '#3b9eff' }));

const opened: Project[] = [];
const open = (role: 'owner' | 'viewer' = 'owner', room = crypto.randomUUID()) => {
  const p = new Project(room, role);
  opened.push(p);
  return p;
};
const synced = (p: Project) => p.persistence.whenSynced;
const exchange = (a: Project, b: Project) => {
  const ua = Y.encodeStateAsUpdate(a.doc);
  const ub = Y.encodeStateAsUpdate(b.doc);
  Y.applyUpdate(a.doc, ub);
  Y.applyUpdate(b.doc, ua);
};

beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_COLLAB_URL', '');
});
afterEach(() => {
  opened.splice(0).forEach((p) => p.destroy());
  vi.unstubAllEnvs();
});

describe('shared project operations', () => {
  it('converges after concurrent movement, property edits and schematic connections', async () => {
    const a = open();
    const b = open();
    await Promise.all([synced(a), synced(b)]);
    const led = a.addPart('led', 100, 100);
    const resistor = a.addPart('resistor', 200, 100);
    exchange(a, b);
    a.moveParts([{ id: led, x: 150, y: 160 }]);
    b.setProp(led, 'flip', true);
    b.addWire({ part: led, pin: 'A', x: 100, y: 100 }, { part: resistor, pin: '1', x: 200, y: 100 }, [], '#3b9eff', true);
    exchange(a, b);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().parts.find((p) => p.id === led)).toMatchObject({ x: 150, y: 160, props: { flip: true } });
    expect(a.snapshot().wires[0].sch).toBe(true);
  });

  it('undo affects the local edit without erasing another editor’s change', async () => {
    const a = open();
    const b = open();
    await Promise.all([synced(a), synced(b)]);
    const led = a.addPart('led', 0, 0);
    exchange(a, b);
    a.undo.clear();
    a.moveParts([{ id: led, x: 100, y: 50 }]);
    b.setProp(led, 'color', 'blue');
    exchange(a, b);
    a.undo.undo();
    exchange(a, b);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().parts[0]).toMatchObject({ x: 0, y: 0, props: { color: 'blue' } });
  });

  it('duplicates schematic placement and connections together', async () => {
    const p = open();
    await synced(p);
    const a = p.addPart('led', 0, 0);
    const b = p.addPart('resistor', 100, 0);
    p.moveSchematic([{ id: a, x: 400, y: 200 }, { id: b, x: 500, y: 200 }]);
    p.rotateSchematic([a], new Map());
    p.addWire({ part: a, pin: 'A', x: 0, y: 0 }, { part: b, pin: '1', x: 0, y: 0 }, [], '#000', true);
    const ids = p.duplicate([a, b], 20, 20);
    const copy = p.snapshot().parts.find((part) => part.id === ids[0]);
    expect(copy).toMatchObject({ sx: 420, sy: 220, srot: 90 });
    expect(p.snapshot().wires.filter((w) => w.sch)).toHaveLength(2);
  });

  it('survives deletion of a component concurrent with creation of its wire', async () => {
    const a = open();
    const b = open();
    await Promise.all([synced(a), synced(b)]);
    const led = a.addPart('led', 0, 0);
    const resistor = a.addPart('resistor', 100, 0);
    exchange(a, b);
    a.deleteItems([led], []);
    b.addWire({ part: led, pin: 'A', x: 10, y: 20 }, { part: resistor, pin: '1', x: 100, y: 0 }, [], '#000', true);
    exchange(a, b);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().wires[0].a).toEqual({ x: 10, y: 20 });
  });

  it('blocks writes from a viewer', async () => {
    const owner = open();
    const viewer = open('viewer');
    await Promise.all([synced(owner), synced(viewer)]);
    const led = owner.addPart('led', 0, 0);
    exchange(owner, viewer);
    const before = viewer.snapshot();
    viewer.setProp(led, 'flip', true);
    viewer.moveSchematic([{ id: led, x: 99, y: 99 }]);
    viewer.deleteItems([led], []);
    viewer.addPart('resistor', 50, 50);
    expect(viewer.snapshot()).toEqual(before);
  });

  it('restores the circuit and schematic links from IndexedDB', async () => {
    const room = crypto.randomUUID();
    const p = open('owner', room);
    await synced(p);
    const a = p.addPart('led', 50, 100, { flip: true });
    const b = p.addPart('resistor', 200, 100);
    p.moveSchematic([{ id: a, x: 300, y: 400 }]);
    p.addWire({ part: a, pin: 'A', x: 50, y: 100 }, { part: b, pin: '1', x: 200, y: 100 }, [], '#000', true);
    const expected = p.snapshot();
    const reloaded = open('owner', room);
    await synced(reloaded);
    expect(reloaded.snapshot()).toEqual(expected);
  });
});

describe('historial', () => {
  it('restaurar una versión devuelve piezas, cables y código, llega al otro editor y se deshace', async () => {
    const a = open();
    const b = open();
    await Promise.all([synced(a), synced(b)]);
    const uno = a.addPart('arduino-uno', 0, 0);
    const led = a.addPart('led', 300, 100, { color: 'green' });
    a.addWire({ part: uno, pin: 'D13', x: 0, y: 0 }, { part: led, pin: 'A', x: 0, y: 0 }, [], '#f2862e');
    a.setSketch(uno, 'void setup(){}\nvoid loop(){}\n');
    const version = a.encodeState();
    // Después de guardar la versión: se borra el LED y se cambia el código.
    a.deleteItems([led], []);
    a.setSketch(uno, '// otro programa\n');
    a.addPart('resistor', 500, 0);
    exchange(a, b);
    expect(b.snapshot().parts.map((p) => p.type).sort()).toEqual(['arduino-uno', 'resistor']);

    a.restore(version);
    exchange(a, b);
    for (const p of [a, b]) {
      const snap = p.snapshot();
      expect(snap.parts.map((q) => q.type).sort()).toEqual(['arduino-uno', 'led']);
      expect(snap.parts.find((q) => q.type === 'led')!.props.color).toBe('green');
      expect(snap.wires).toHaveLength(1);
      expect(p.sketch(uno).toString()).toContain('void loop');
    }
    // Restaurar es una edición más: Ctrl+Z vuelve al circuito de antes.
    a.undo.undo();
    expect(a.snapshot().parts.map((q) => q.type).sort()).toEqual(['arduino-uno', 'resistor']);
    expect(a.sketch(uno).toString()).toBe('// otro programa\n');
  });

  it('un lector no puede restaurar', async () => {
    const viewer = open('viewer');
    await synced(viewer);
    const other = new Y.Doc();
    other.getMap('parts').set('x', new Y.Map());
    viewer.restore(Y.encodeStateAsUpdate(other));
    expect(viewer.snapshot().parts).toHaveLength(0);
  });
});
