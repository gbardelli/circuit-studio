// Hojas del modo diseño dentro del documento compartido: la principal y una por integrado propio.
// logic: sheetId → { kind, name, part, description, order, package, nodes, wires }
//   nodes: id → { kind, x, y, rot, props }   ·   wires: id → { a: {node, pin}, b: {node, pin} }
import * as Y from 'yjs';
import type { Props, Rotation } from '../core/types';
import { MAIN_SHEET, type LogicNode, type LogicPinRef, type LogicSheet, type LogicWire } from '../logic/types';

type Tx = (fn: () => void) => void;

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export class DesignDoc {
  private cache: LogicSheet[] = [];
  private stale = true;

  constructor(
    readonly map: Y.Map<Y.Map<unknown>>,
    private readonly tx: Tx,
  ) {
    map.observeDeep(() => (this.stale = true));
  }

  // ── Lectura ──────────────────────────────────────────────────────────────────────
  sheets(): LogicSheet[] {
    if (!this.stale) return this.cache;
    const out: LogicSheet[] = [];
    this.map.forEach((m, id) => {
      const nodes: LogicNode[] = [];
      (m.get('nodes') as Y.Map<Y.Map<unknown>> | undefined)?.forEach((n, nid) =>
        nodes.push({ id: nid, kind: String(n.get('kind')), x: Number(n.get('x')) || 0, y: Number(n.get('y')) || 0, rot: (Number(n.get('rot')) || 0) as Rotation, props: { ...((n.get('props') as Props) ?? {}) } }),
      );
      const wires: LogicWire[] = [];
      (m.get('wires') as Y.Map<{ a: LogicPinRef; b: LogicPinRef }> | undefined)?.forEach((w, wid) => {
        if (w?.a && w?.b) wires.push({ id: wid, a: w.a, b: w.b });
      });
      nodes.sort((a, b) => a.id.localeCompare(b.id));
      wires.sort((a, b) => a.id.localeCompare(b.id));
      out.push({
        id,
        kind: m.get('kind') === 'ic' ? 'ic' : 'main',
        name: String(m.get('name') ?? ''),
        part: String(m.get('part') ?? ''),
        description: String(m.get('description') ?? ''),
        order: Array.isArray(m.get('order')) ? (m.get('order') as string[]) : [],
        package: Number(m.get('package')) || 0,
        nodes,
        wires,
      });
    });
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'main' ? -1 : 1));
    this.cache = out;
    this.stale = false;
    return out;
  }

  sheet(id: string) {
    return this.sheets().find((s) => s.id === id);
  }

  ics() {
    return this.sheets().filter((s) => s.kind === 'ic');
  }

  // ── Hojas ────────────────────────────────────────────────────────────────────────
  private create(id: string, kind: 'main' | 'ic', meta: Partial<Pick<LogicSheet, 'name' | 'part' | 'description'>>) {
    const m = new Y.Map<unknown>();
    m.set('kind', kind);
    m.set('name', meta.name ?? '');
    m.set('part', meta.part ?? '');
    m.set('description', meta.description ?? '');
    m.set('order', []);
    m.set('package', 0);
    m.set('nodes', new Y.Map());
    m.set('wires', new Y.Map());
    this.map.set(id, m);
    return m;
  }

  /** La hoja principal se crea al primer cambio. */
  private ensure(id: string) {
    let m = this.map.get(id);
    if (!m && id === MAIN_SHEET) m = this.create(MAIN_SHEET, 'main', { name: 'Principal' });
    return m;
  }

  createIc(name: string, part: string) {
    const id = shortId();
    this.tx(() => this.create(id, 'ic', { name, part }));
    return id;
  }

  setSheet(id: string, patch: Partial<Pick<LogicSheet, 'name' | 'part' | 'description' | 'order' | 'package'>>) {
    this.tx(() => {
      const m = this.ensure(id);
      if (!m) return;
      for (const [k, v] of Object.entries(patch)) if (m.get(k) !== v) m.set(k, v);
    });
  }

  deleteSheet(id: string) {
    if (id === MAIN_SHEET) return;
    this.tx(() => this.map.delete(id));
  }

  // ── Elementos y cables ──────────────────────────────────────────────────────────
  private nodes(sheet: string) {
    return this.ensure(sheet)?.get('nodes') as Y.Map<Y.Map<unknown>> | undefined;
  }

  private wireMap(sheet: string) {
    return this.ensure(sheet)?.get('wires') as Y.Map<{ a: LogicPinRef; b: LogicPinRef }> | undefined;
  }

  addNode(sheet: string, kind: string, x: number, y: number, props: Props = {}, rot: Rotation = 0) {
    const id = shortId();
    this.tx(() => {
      const n = new Y.Map<unknown>();
      n.set('kind', kind);
      n.set('x', x);
      n.set('y', y);
      n.set('rot', rot);
      n.set('props', props);
      this.nodes(sheet)?.set(id, n);
    });
    return id;
  }

  moveNodes(sheet: string, moves: { id: string; x: number; y: number }[]) {
    this.tx(() => {
      const nodes = this.nodes(sheet);
      for (const mv of moves) {
        const n = nodes?.get(mv.id);
        if (!n) continue;
        if (n.get('x') !== mv.x) n.set('x', mv.x);
        if (n.get('y') !== mv.y) n.set('y', mv.y);
      }
    });
  }

  rotateNodes(sheet: string, ids: string[]) {
    this.tx(() => {
      const nodes = this.nodes(sheet);
      for (const id of ids) {
        const n = nodes?.get(id);
        if (n) n.set('rot', (((Number(n.get('rot')) || 0) + 90) % 360) as Rotation);
      }
    });
  }

  setProp(sheet: string, id: string, key: string, value: string | number | boolean) {
    this.tx(() => {
      const n = this.nodes(sheet)?.get(id);
      const props = { ...((n?.get('props') as Props) ?? {}) };
      if (!n || props[key] === value) return;
      props[key] = value;
      n.set('props', props);
    });
  }

  addWire(sheet: string, a: LogicPinRef, b: LogicPinRef) {
    const same = (p: LogicPinRef, q: LogicPinRef) => p.node === q.node && p.pin === q.pin;
    if (same(a, b)) return null;
    const existing = this.sheet(sheet)?.wires.find((w) => (same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a)));
    if (existing) return existing.id;
    const id = shortId();
    this.tx(() => this.wireMap(sheet)?.set(id, { a, b }));
    return id;
  }

  /** Borra elementos (con sus cables) y cables sueltos. */
  delete(sheet: string, nodeIds: string[], wireIds: string[]) {
    const gone = new Set(nodeIds);
    this.tx(() => {
      const wires = this.wireMap(sheet);
      for (const id of wireIds) wires?.delete(id);
      wires?.forEach((w, id) => {
        if (gone.has(w.a.node) || gone.has(w.b.node)) wires.delete(id);
      });
      const nodes = this.nodes(sheet);
      for (const id of nodeIds) nodes?.delete(id);
    });
  }

  /** Copia elementos y los cables entre ellos, desplazados. Devuelve los ids nuevos. */
  paste(sheet: string, nodes: LogicNode[], wires: LogicWire[], dx: number, dy: number) {
    const ids = new Map<string, string>();
    this.tx(() => {
      const target = this.nodes(sheet);
      for (const node of nodes) {
        const id = shortId();
        ids.set(node.id, id);
        const n = new Y.Map<unknown>();
        n.set('kind', node.kind);
        n.set('x', node.x + dx);
        n.set('y', node.y + dy);
        n.set('rot', node.rot);
        n.set('props', { ...node.props });
        target?.set(id, n);
      }
      const map = this.wireMap(sheet);
      for (const w of wires) {
        const a = ids.get(w.a.node);
        const b = ids.get(w.b.node);
        if (a && b) map?.set(shortId(), { a: { node: a, pin: w.a.pin }, b: { node: b, pin: w.b.pin } });
      }
    });
    return [...ids.values()];
  }
}
