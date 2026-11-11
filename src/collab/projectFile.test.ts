import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from './project';
import { exportProjectFile, parseProjectFile, projectFileDocument, projectFileName, projectFileSummary } from './projectFile';
import { MAIN_SHEET } from '../logic/types';
import { applyTemplate, findTemplate } from './applyTemplate';

vi.mock('../cloud', () => ({ CLOUD: false, sessionUser: () => null, sessionToken: async () => null, colorFor: () => '#3b9eff' }));
const projects: Project[] = [];
async function open() {
  const p = new Project(crypto.randomUUID()); projects.push(p); await p.persistence.whenSynced; return p;
}
beforeEach(() => { vi.stubEnv('DEV', false); vi.stubEnv('VITE_COLLAB_URL', ''); });
afterEach(() => { projects.splice(0).forEach(p => p.destroy()); vi.unstubAllEnvs(); });

async function fixture() {
  const p = await open();
  p.setName('Ascensor · versión final');
  const board = p.addPart('arduino-giga', -620.25, 500.75);
  const r = p.addPart('resistor', 41.125, -90.5, { resistance: 2200, label: 'R1' }, 270);
  p.moveSchematic([{ id: r, x: -88.125, y: 100.75 }]);
  p.rotateSchematic([r], new Map());
  const wire = p.addWire({ part: board, pin: 'D6', x: 5, y: 10 }, { part: r, pin: '1', x: 20, y: 30 }, [{ x: -9.25, y: 7.125 }, { x: 15, y: 7.125 }], '#3ee08f');
  p.addWire({ x: -20, y: 1 }, { x: 50, y: 7 }, [], '#abc', true);
  p.setSketch(board, '// Unicode π\nvoid setup() {}\nvoid loop() {}\n');
  p.setMeta('wiring.legend', [{ label: 'Tiempo', colors: ['#3ee08f'] }]);
  p.setMeta('assembly.done', { [wire]: 'signature-preserved' });
  p.setMeta('assembly.parts', { [r]: 'placed' });
  p.setMeta('assembly.prices', { resistor: 0.5 });
  p.setMeta('assembly.purchased', { resistor: 2 });
  p.setMeta('assembly.currency', 'PEN');
  p.setMeta('note:test', { part: r, text: 'Comprobar corriente', author: 'Giovanni', resolved: false });
  p.setMeta('future.setting', { nested: [1, true, null, { value: 'kept' }] });
  const ic = p.design.createIc('Inversor propio', 'CS-001');
  const a = p.design.addNode(ic, 'in', 0.125, 4, { label: 'A' });
  const b = p.design.addNode(ic, 'not', 80, 0);
  const c = p.design.addNode(ic, 'out', 160, 0, { label: 'Y' });
  p.design.addWire(ic, { node: a, pin: 'A' }, { node: b, pin: 'A' }, { points: [{ x: 45.125, y: 14 }, { x: 45.125, y: 20 }], color: '#53cbb8', label: 'A' });
  p.design.addWire(ic, { node: b, pin: 'Y' }, { node: c, pin: 'A' });
  p.design.setSheet(ic, { order: [a, c], package: 8 });
  p.design.addNode(MAIN_SHEET, `ic:${ic}`, 123.25, -41.75, {}, 90);
  p.snapshot();
  p.addPart(`ic:${ic}`, 400.5, -30.5);
  return { p, r, board, ic };
}

describe('portable project files', () => {
  it('preserves edited logic wire colors and chip layouts through export', async () => {
    const { p, ic } = await fixture();
    const instance = p.design.sheet(MAIN_SHEET)!.nodes.find(n => n.kind === `ic:${ic}`)!;
    const wire = p.design.sheet(ic)!.wires[0];
    p.design.setProp(MAIN_SHEET, instance.id, 'outputOrder', JSON.stringify(['out-b', 'out-a']));
    p.design.setProp(MAIN_SHEET, instance.id, 'titleSize', 14);
    p.design.setWireColor(ic, [wire.id], '#123456');
    const doc = projectFileDocument(parseProjectFile(exportProjectFile(p)));
    const q = await open();
    try {
      Y.applyUpdate(q.doc, Y.encodeStateAsUpdate(doc));
      expect(q.design.sheet(MAIN_SHEET)!.nodes.find(n => n.id === instance.id)?.props).toMatchObject({ titleSize: 14, outputOrder: '["out-b","out-a"]' });
      expect(q.design.sheet(ic)!.wires.find(w => w.id === wire.id)?.color).toBe('#123456');
      q.design.setWireColor(ic, [wire.id], null);
      expect(q.design.sheet(ic)!.wires.find(w => w.id === wire.id)?.color).toBeUndefined();
    } finally { doc.destroy(); }
  });
  it('round-trips every persisted field, exact geometry, custom ICs, programs and metadata into fresh CRDT identities', async () => {
    const { p, r, board } = await fixture();
    const original = exportProjectFile(p);
    const file = parseProjectFile(original);
    const doc = projectFileDocument(file);
    const q = await open();
    try {
      Y.applyUpdate(q.doc, Y.encodeStateAsUpdate(doc));
      expect(q.doc.clientID).not.toBe(p.doc.clientID);
      expect(q.room).not.toBe(p.room);
      expect(q.parts.toJSON()).toEqual(p.parts.toJSON());
      expect(q.wires.toJSON()).toEqual(p.wires.toJSON());
      expect(q.meta.toJSON()).toEqual(p.meta.toJSON());
      expect(q.design.sheets()).toEqual(p.design.sheets());
      expect(q.snapshot()).toEqual(p.snapshot());
      expect(q.code.get(board)?.toString()).toBe(p.code.get(board)?.toString());
      q.setProp(r, 'resistance', 1000); expect(p.snapshot().parts.find(x => x.id === r)?.props.resistance).toBe(2200);
      expect(parseProjectFile(exportProjectFile(q)).document.parts[r].props).toEqual({ resistance: 1000, label: 'R1' });
      expect(original).not.toContain(p.room);
      expect(original).not.toContain('clientID');
    } finally { doc.destroy(); }
  });
  it('does not export deleted contents or undo history', async () => {
    const p = await open(); const id = p.addPart('resistor', 0, 0, { label: 'SECRET-DELETED' });
    p.deleteItems([id], []);
    const text = exportProjectFile(p); expect(text).not.toContain('SECRET-DELETED');
    expect(projectFileSummary(parseProjectFile(text))).toMatchObject({ parts: 0, wires: 0, sheets: 0 });
  });
  it('round-trips the complete four-board classroom elevator without regenerating its routing', async () => {
    const p = await open(); applyTemplate(p, findTemplate('elevator-class')!);
    const file = parseProjectFile(exportProjectFile(p)); const doc = projectFileDocument(file); const copy = await open();
    try {
      Y.applyUpdate(copy.doc, Y.encodeStateAsUpdate(doc));
      expect(copy.snapshot()).toEqual(p.snapshot());
      expect(copy.snapshot().parts.filter(p => p.type === 'breadboard-full')).toHaveLength(4);
      expect(copy.wires.toJSON()).toEqual(p.wires.toJSON());
      expect(copy.code.toJSON()).toEqual(p.code.toJSON());
    } finally { doc.destroy(); }
  });
  it('restores nested shared maps as editable maps, not plain JSON', async () => {
    const { p, ic } = await fixture(); const doc = projectFileDocument(parseProjectFile(exportProjectFile(p)));
    const q = await open();
    try {
      Y.applyUpdate(q.doc, Y.encodeStateAsUpdate(doc));
      const node = q.design.addNode(ic, 'and', 222.5, 444.25);
      q.design.setProp(ic, node, 'label', 'Editable');
      expect(q.design.sheet(ic)?.nodes.find(n => n.id === node)).toMatchObject({ x: 222.5, props: { label: 'Editable' } });
    } finally { doc.destroy(); }
  });
  it.each([
    ['newer version', (f: any) => { f.version = 2; }],
    ['unknown component', (f: any) => { Object.values<any>(f.document.parts)[0].type = 'missing-part'; }],
    ['missing custom IC definition', (f: any) => { f.document.logic = {}; }],
    ['broken wire reference', (f: any) => { Object.values<any>(f.document.wires)[0].a.part = 'missing'; }],
    ['broken design reference', (f: any) => { const s = Object.values<any>(f.document.logic).find(s => Object.keys(s.wires).length); Object.values<any>(s.wires)[0].a.node = 'missing'; }],
    ['invalid geometry', (f: any) => { Object.values<any>(f.document.parts)[0].x = '100'; }],
    ['invalid rotation', (f: any) => { Object.values<any>(f.document.parts)[0].rot = 45; }],
    ['invalid color', (f: any) => { Object.values<any>(f.document.wires)[0].color = '#12345'; }],
    ['unknown section', (f: any) => { f.document.unknown = {}; }],
  ])('rejects %s before mutating any project', async (_label, mutate) => {
    const { p } = await fixture(); const before = exportProjectFile(p); const file = JSON.parse(before); mutate(file);
    expect(() => parseProjectFile(JSON.stringify(file))).toThrow();
    expect(parseProjectFile(exportProjectFile(p)).document).toEqual(parseProjectFile(before).document);
  });
  it('rejects malformed, unsafe, non-finite and excessive inputs', () => {
    expect(() => parseProjectFile('{')).toThrow();
    expect(() => parseProjectFile('{"__proto__":{"polluted":true}}')).toThrow(/clave/);
    expect(() => parseProjectFile('{"value":1e999}')).toThrow(/inválido/);
    expect(() => parseProjectFile(' '.repeat(10 * 1024 * 1024 + 1))).toThrow(/10 MB/);
    expect(() => parseProjectFile('['.repeat(50) + '0' + ']'.repeat(50))).toThrow(/complejo/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('uses safe portable filenames', () => {
    expect(projectFileName('Circuito / prueba: 1')).toBe('Circuito - prueba- 1.circuitstudio');
    expect(projectFileName('...')).toBe('CircuitStudio.circuitstudio');
  });
});
