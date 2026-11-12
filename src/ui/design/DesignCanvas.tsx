// Lienzo del modo diseño. Arrastra desde una patilla hasta otra para unirlas; clic en una entrada
// para cambiarla; los relojes corren solos. Rueda: zoom; Mayús + rueda o espacio + arrastre: mover.
import { AlertTriangle, Maximize, Minus, Pause, Play, Plus, RotateCcw, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Vec } from '../../core/types';
import { buttonIdle, elementDef } from '../../logic/elements';
import { icDependencies } from '../../logic/sim';
import { IC_PREFIX, MAIN_SHEET, X, type Bit, type LogicPinRef, type LogicSheet } from '../../logic/types';
import { distToSegment } from '../geometry';
import { useEditor } from '../context';
import { useUi } from '../store';
import { ViewTabs } from '../ViewTabs';
import { GRID, pathOf, place, route, type Placed, type PlacedPin } from './geometry';
import { useDesignUi } from './store';
import { LogicSymbol, VALUE_COLOR, type SymbolState } from './symbols';
import { SheetTabs } from './SheetTabs';
import { useLogicSim, useSheet } from './useLogic';
import './design.css';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const DEFAULT_VIEW = { x: 160, y: 120, zoom: 1.6 };
const snap = (v: number) => Math.round(v / GRID) * GRID;

type Drag =
  | { kind: 'move'; start: Vec; ids: string[]; moved: boolean; dx: number; dy: number; node: string | null }
  | { kind: 'wire'; from: PlacedPin & { node: string }; to: Vec; target: (PlacedPin & { node: string }) | null; moved: boolean }
  | { kind: 'marquee'; start: Vec; end: Vec; add: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'press'; node: string };

export function DesignCanvas() {
  const { project } = useEditor();
  const sheetId = useDesignUi((s) => s.sheet);
  const selNodes = useDesignUi((s) => s.nodes);
  const selWires = useDesignUi((s) => s.wires);
  const placing = useDesignUi((s) => s.placing);
  const running = useDesignUi((s) => s.running);
  const viewport = useDesignUi((s) => s.viewports[s.sheet]) ?? DEFAULT_VIEW;
  const sheet = useSheet(sheetId);
  const { sim, version, refresh, lookup } = useLogicSim(sheet);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [hoverPin, setHoverPin] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const pending = useRef<(PlacedPin & { node: string }) | null>(null);
  const ro = project.readOnly;

  const placed = useMemo(() => sheet.nodes.map((n) => place(n, lookup)).filter((p): p is Placed => p !== null), [sheet, lookup]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const allPins = useMemo(() => placed.flatMap((p) => p.pins.map((pin) => ({ ...pin, node: p.node.id }))), [placed]);
  const wired = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of sheet.wires) for (const e of [w.a, w.b]) count.set(`${e.node}:${e.pin}`, (count.get(`${e.node}:${e.pin}`) ?? 0) + 1);
    return count;
  }, [sheet.wires]);

  const setViewport = useCallback((v: typeof viewport) => useDesignUi.getState().setViewport(sheetId, v), [sheetId]);
  const world = useCallback(
    (clientX: number, clientY: number): Vec => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
    },
    [viewport],
  );

  // ── Zoom ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = useDesignUi.getState().viewports[sheetId] ?? DEFAULT_VIEW;
      if (e.shiftKey && !e.ctrlKey) return setViewport({ ...vp, x: vp.x - e.deltaY, y: vp.y - e.deltaX });
      const r = svg.getBoundingClientRect();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setViewport({ zoom, x: mx - ((mx - vp.x) * zoom) / vp.zoom, y: my - ((my - vp.y) * zoom) / vp.zoom });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [sheetId, setViewport]);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !placed.length) return setViewport(DEFAULT_VIEW);
    const xs = placed.flatMap((p) => [p.box.x, p.box.x + p.box.w]);
    const ys = placed.flatMap((p) => [p.box.y, p.box.y + p.box.h]);
    const r = svg.getBoundingClientRect();
    const [x0, x1, y0, y1] = [Math.min(...xs) - 60, Math.max(...xs) + 60, Math.min(...ys) - 60, Math.max(...ys) + 60];
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(r.width / (x1 - x0), (r.height - 80) / (y1 - y0))));
    setViewport({ zoom, x: (r.width - (x1 - x0) * zoom) / 2 - x0 * zoom, y: (r.height - (y1 - y0) * zoom) / 2 - y0 * zoom + 20 });
  }, [placed, setViewport]);
  const fitTick = useDesignUi((s) => s.fitTick);
  const initiallyFitted = useRef(new Set<string>());
  useEffect(() => {
    const key = `${project.room}:${sheetId}`;
    if (!placed.length || initiallyFitted.current.has(key)) return;
    initiallyFitted.current.add(key);
    if (!useDesignUi.getState().viewports[sheetId]) fit();
  }, [project.room, sheetId, placed.length, fit]);
  useEffect(() => {
    if (fitTick) fit();
    // Solo cuando se pide; no al mover elementos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  // ── Edición ──────────────────────────────────────────────────────────────────────
  const select = useDesignUi.getState().select;
  const nearestPin = useCallback(
    (p: Vec, exclude?: string) => {
      let best: (typeof allPins)[number] | null = null;
      let dist = 9;
      for (const pin of allPins) {
        if (exclude && `${pin.node}:${pin.id}` === exclude) continue;
        const d = Math.hypot(pin.at.x - p.x, pin.at.y - p.y);
        if (d < dist) {
          dist = d;
          best = pin;
        }
      }
      return best;
    },
    [allPins],
  );

  const placeAt = useCallback(
    (kind: string, at: Vec) => {
      const def = elementDef(kind, lookup);
      if (!def || ro) return;
      if (kind.startsWith(IC_PREFIX) && icDependencies(kind.slice(IC_PREFIX.length), lookup).has(sheetId)) {
        useUi.getState().showToast('Un integrado no puede usarse dentro de sí mismo.');
        return;
      }
      const { w, h } = def.size(def.defaults, { sheet: lookup, instantiate: () => null });
      const props = { ...def.defaults };
      if ((kind === 'in' || kind === 'out') && sheet.kind === 'ic') {
        const used = new Set(sheet.nodes.filter((n) => n.kind === kind).map((n) => String(n.props.label)));
        const base = kind === 'in' ? 'ABCDEFGH' : 'YZWVUTSR';
        props.label = [...base].find((c) => !used.has(c)) ?? `${kind === 'in' ? 'I' : 'O'}${used.size + 1}`;
      }
      const id = project.design.addNode(sheetId, kind, snap(at.x - w / 2), snap(at.y - h / 2), props);
      select([id]);
    },
    [lookup, project, ro, select, sheet, sheetId],
  );

  const finishWire = useCallback(
    (from: LogicPinRef, to: LogicPinRef) => {
      const id = project.design.addWire(sheetId, from, to);
      if (id) select([], [id]);
    },
    [project, select, sheetId],
  );

  const pinRef = (p: { node: string; id: string }): LogicPinRef => ({ node: p.node, pin: p.id });

  /** Puntos de un cable tal como se dibuja. */
  const wireVertices = (w: LogicSheet['wires'][number]): Vec[] | null => {
    const a = pinWorld(w.a);
    const b = pinWorld(w.b);
    if (!a || !b) return null;
    return w.points?.length ? [a.at, ...w.points, b.at] : route(a.at, a.out, b.at, b.out);
  };
  /**
   * Qué cable se elige al hacer clic en `p`. Gana el que pasa más cerca; los cables cuyo recorrido coincide en ese punto
   * (varios tramos sobre una misma línea) quedan empatados y cada clic elige el siguiente, así se llega a todos.
   */
  const pickWire = (p: Vec, fallback: string): string => {
    const reach = 7 / z;
    const near = sheet.wires.flatMap((w) => {
      const pts = wireVertices(w);
      if (!pts) return [];
      let d = Infinity;
      for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]));
      return d <= reach ? [{ id: w.id, d }] : [];
    });
    if (!near.length) return fallback;
    const best = Math.min(...near.map((x) => x.d));
    const tied = near.filter((x) => x.d <= best + 1.5 / z).map((x) => x.id);
    if (tied.length < 2) return tied[0];
    const current = tied.findIndex((id) => selWires.includes(id));
    return tied[(current + 1) % tied.length];
  };

  // ── Puntero ──────────────────────────────────────────────────────────────────────
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && space)) {
      e.preventDefault();
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y });
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = world(e.clientX, e.clientY);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (placing) return; // se coloca al soltar
    const target = e.target as Element;
    // Un cable pendiente (clic en una patilla y clic en otra).
    if (pending.current) {
      const pin = nearestPin(p, `${pending.current.node}:${pending.current.id}`);
      if (pin) finishWire(pinRef(pending.current), pinRef(pin));
      pending.current = null;
      setDrag(null);
      return;
    }
    const pinEl = target.closest('[data-pin]');
    if (pinEl && !ro) {
      const [node, id] = pinEl.getAttribute('data-pin')!.split('|');
      const pin = allPins.find((q) => q.node === node && q.id === id);
      if (pin) {
        setDrag({ kind: 'wire', from: pin, to: p, target: null, moved: false });
        return;
      }
    }
    const wireEl = target.closest('[data-wire]');
    if (wireEl) {
      const id = pickWire(p, wireEl.getAttribute('data-wire')!);
      select(e.shiftKey ? selNodes : [], e.shiftKey ? [...new Set([...selWires, id])] : [id]);
      setDrag(null);
      return;
    }
    const nodeEl = target.closest('[data-node]');
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node')!;
      const node = byId.get(id)?.node;
      if (node?.kind === 'button') {
        sim.setSource(id, buttonIdle(node.props) ? 0 : 1);
        refresh();
        setDrag({ kind: 'press', node: id });
        return;
      }
      let ids = selNodes;
      if (e.shiftKey) ids = selNodes.includes(id) ? selNodes.filter((n) => n !== id) : [...selNodes, id];
      else if (!selNodes.includes(id)) ids = [id];
      select(ids, e.shiftKey ? selWires : []);
      setDrag({ kind: 'move', start: p, ids: ro ? [] : ids, moved: false, dx: 0, dy: 0, node: id });
      return;
    }
    setDrag({ kind: 'marquee', start: p, end: p, add: e.shiftKey });
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = world(e.clientX, e.clientY);
    setCursor(p);
    if (!drag) return;
    if (drag.kind === 'pan') setViewport({ ...viewport, x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy });
    else if (drag.kind === 'move') {
      const dx = snap(p.x - drag.start.x);
      const dy = snap(p.y - drag.start.y);
      if (dx !== drag.dx || dy !== drag.dy) setDrag({ ...drag, dx, dy, moved: drag.moved || dx !== 0 || dy !== 0 });
    } else if (drag.kind === 'wire') {
      const target = nearestPin(p, `${drag.from.node}:${drag.from.id}`);
      setDrag({ ...drag, to: p, target, moved: drag.moved || Math.hypot(p.x - drag.from.at.x, p.y - drag.from.at.y) > 4 });
    } else if (drag.kind === 'marquee') setDrag({ ...drag, end: p });
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const p = world(e.clientX, e.clientY);
    if (placing && !drag) {
      placeAt(placing, p);
      if (!e.shiftKey) useDesignUi.getState().setPlacing(null);
      return;
    }
    if (!drag) return;
    if (drag.kind === 'press') {
      const btn = byId.get(drag.node)?.node;
      sim.setSource(drag.node, btn ? buttonIdle(btn.props) : 0);
      refresh();
    } else if (drag.kind === 'move') {
      if (drag.moved && drag.ids.length) {
        project.design.moveNodes(
          sheetId,
          drag.ids.flatMap((id) => {
            const n = byId.get(id)?.node;
            return n ? [{ id, x: n.x + drag.dx, y: n.y + drag.dy }] : [];
          }),
        );
      } else if (!drag.moved && drag.node) {
        // Clic sin mover sobre una entrada: la cambia.
        const n = byId.get(drag.node)?.node;
        if (n?.kind === 'in') {
          const v: Bit = sim.source(n.id) === 1 ? 0 : 1;
          // Entradas del mismo grupo (p. ej. los sensores de piso) son excluyentes: al encender una se apagan las demás.
          const group = String(n.props.group ?? '');
          if (v === 1 && group) {
            for (const o of sheet?.nodes ?? []) {
              if (o.id === n.id || o.kind !== 'in' || o.props.group !== group || sim.source(o.id) !== 1) continue;
              sim.setSource(o.id, 0);
              if (!ro) project.design.setProp(sheetId, o.id, 'value', 0);
            }
          }
          sim.setSource(n.id, v);
          refresh();
          if (!ro) project.design.setProp(sheetId, n.id, 'value', v);
        }
      }
    } else if (drag.kind === 'wire') {
      if (drag.target) finishWire(pinRef(drag.from), pinRef(drag.target));
      else if (!drag.moved) pending.current = drag.from;
    } else if (drag.kind === 'marquee') {
      const [x0, x1] = [Math.min(drag.start.x, drag.end.x), Math.max(drag.start.x, drag.end.x)];
      const [y0, y1] = [Math.min(drag.start.y, drag.end.y), Math.max(drag.start.y, drag.end.y)];
      if (x1 - x0 < 3 && y1 - y0 < 3) {
        if (!drag.add) select([], []);
      } else {
        const inside = placed.filter((q) => q.box.x >= x0 && q.box.y >= y0 && q.box.x + q.box.w <= x1 && q.box.y + q.box.h <= y1).map((q) => q.node.id);
        const set = new Set(inside);
        const wires = sheet.wires.filter((w) => set.has(w.a.node) && set.has(w.b.node)).map((w) => w.id);
        select(drag.add ? [...new Set([...selNodes, ...inside])] : inside, drag.add ? [...new Set([...selWires, ...wires])] : wires);
      }
    }
    setDrag(null);
  };

  // ── Teclado ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e)) {
        if (!e.repeat) setSpace(true);
        e.preventDefault();
        return;
      }
      if (typing(e) || e.defaultPrevented || useUi.getState().commandOpen) return;
      const s = useDesignUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const current = project.design.sheet(s.sheet);
      if (key === 'escape') {
        pending.current = null;
        setDrag(null);
        if (s.placing) s.setPlacing(null);
        else s.select([], []);
        return;
      }
      if (key === '/' && !mod) {
        e.preventDefault();
        document.getElementById('lib-search')?.focus();
        return;
      }
      if (mod && key === 'a' && current) {
        e.preventDefault();
        s.select(current.nodes.map((n) => n.id), current.wires.map((w) => w.id));
        return;
      }
      if (ro) return;
      if ((key === 'delete' || key === 'backspace') && (s.nodes.length || s.wires.length)) {
        e.preventDefault();
        project.design.delete(s.sheet, s.nodes, s.wires);
        s.select([], []);
      } else if (key === 'r' && !mod && s.nodes.length) {
        e.preventDefault();
        project.design.rotateNodes(s.sheet, s.nodes);
      } else if (mod && (key === 'c' || key === 'x') && s.nodes.length && current) {
        e.preventDefault();
        const ids = new Set(s.nodes);
        s.setClipboard({ nodes: current.nodes.filter((n) => ids.has(n.id)), wires: current.wires.filter((w) => ids.has(w.a.node) && ids.has(w.b.node)) });
        if (key === 'x') {
          project.design.delete(s.sheet, s.nodes, []);
          s.select([], []);
        }
      } else if (mod && key === 'v' && s.clipboard) {
        e.preventDefault();
        const blocked = s.clipboard.nodes.some((n) => n.kind.startsWith(IC_PREFIX) && icDependencies(n.kind.slice(IC_PREFIX.length), project.design.sheet.bind(project.design)).has(s.sheet));
        if (blocked) return useUi.getState().showToast('Un integrado no puede usarse dentro de sí mismo.');
        s.select(project.design.paste(s.sheet, s.clipboard.nodes, s.clipboard.wires, 40, 40));
      } else if (mod && key === 'd' && s.nodes.length && current) {
        e.preventDefault();
        const ids = new Set(s.nodes);
        s.select(project.design.paste(s.sheet, current.nodes.filter((n) => ids.has(n.id)), current.wires.filter((w) => ids.has(w.a.node) && ids.has(w.b.node)), 40, 40));
      } else if (key.startsWith('arrow') && s.nodes.length && current) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : GRID;
        const [dx, dy] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key]!;
        project.design.moveNodes(s.sheet, current.nodes.filter((n) => s.nodes.includes(n.id)).map((n) => ({ id: n.id, x: n.x + dx, y: n.y + dy })));
      } else if (!mod && !e.altKey && key.length === 1) {
        const kind = { i: 'in', o: 'out', k: 'clock', a: 'and', n: 'nand', x: 'xor', v: 'not', d: 'dff' }[key];
        if (kind) {
          e.preventDefault();
          s.setPlacing(kind);
        }
      }
    };
    const up = (e: KeyboardEvent) => e.key === ' ' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [project, ro]);

  // ── Dibujo ───────────────────────────────────────────────────────────────────────
  void version;
  const offset = (id: string) => (drag?.kind === 'move' && drag.ids.includes(id) ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 });
  const pinWorld = (ref: LogicPinRef) => {
    const p = byId.get(ref.node);
    const pin = p?.pins.find((q) => q.id === ref.pin);
    if (!pin) return null;
    const o = offset(ref.node);
    return { at: { x: pin.at.x + o.x, y: pin.at.y + o.y }, out: pin.out };
  };
  const netColor = (ref: LogicPinRef) => {
    const n = sim.net(ref.node, ref.pin);
    if (n === undefined) return VALUE_COLOR[X];
    return sim.conflicts.has(n) ? VALUE_COLOR.err : VALUE_COLOR[sim.nets[n]];
  };
  const stateFor = (p: Placed): SymbolState => ({
    pin: (id) => sim.value(p.node.id, id),
    source: sim.source(p.node.id),
    hex: p.node.kind === 'hex' ? sim.hexValue(p.node.id) : undefined,
  });
  const ghost = useMemo(() => {
    if (!placing || !cursor) return null;
    const def = elementDef(placing, lookup);
    if (!def) return null;
    const { w, h } = def.size(def.defaults, { sheet: lookup, instantiate: () => null });
    return place({ id: '__ghost', kind: placing, x: snap(cursor.x - w / 2), y: snap(cursor.y - h / 2), rot: 0, props: def.defaults }, lookup);
  }, [placing, cursor, lookup]);
  const ghostState: SymbolState = { pin: () => X };
  const z = viewport.zoom;
  const empty = placed.length === 0;
  const problem = sim.problem?.message ?? (sim.conflicts.size ? `${sim.conflicts.size === 1 ? 'Una red tiene' : `${sim.conflicts.size} redes tienen`} dos salidas que se contradicen (en rojo).` : null);
  const pendingFrom = pending.current;

  return (
    <div className={`design-wrap ${space || drag?.kind === 'pan' ? 'panning' : ''} ${placing ? 'placing' : ''}`}>
      <svg
        ref={svgRef}
        className="design-canvas"
        role="application"
        aria-label={`Lienzo del modo diseño · ${sheet.name || 'Principal'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="d-grid" width={GRID * z} height={GRID * z} patternUnits="userSpaceOnUse" x={viewport.x % (GRID * z)} y={viewport.y % (GRID * z)}>
            <circle cx={0.5} cy={0.5} r={z > 0.8 ? 0.9 : 0.6} fill="var(--d-grid)" />
          </pattern>
          <pattern id="d-grid-major" width={GRID * 5 * z} height={GRID * 5 * z} patternUnits="userSpaceOnUse" x={viewport.x % (GRID * 5 * z)} y={viewport.y % (GRID * 5 * z)}>
            <circle cx={0.75} cy={0.75} r={1.25} fill="var(--d-grid-major)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#d-grid)" />
        <rect width="100%" height="100%" fill="url(#d-grid-major)" />
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${z})`}>
          {[...sheet.wires.filter((w) => !selWires.includes(w.id)), ...sheet.wires.filter((w) => selWires.includes(w.id))].map((w) => {
            const a = pinWorld(w.a);
            const b = pinWorld(w.b);
            if (!a || !b) return null;
            const d = pathOf(w.points?.length ? [a.at, ...w.points, b.at] : route(a.at, a.out, b.at, b.out));
            const liveColor = netColor(w.a);
            const on = selWires.includes(w.id);
            return (
              <g key={w.id} data-wire={w.id} className="d-wire">
                <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
                {on && <path d={d} stroke="var(--accent)" strokeOpacity={0.45} strokeWidth={7} fill="none" strokeLinejoin="round" />}
                <path d={d} stroke={liveColor === VALUE_COLOR.err ? liveColor : w.color ?? liveColor} strokeOpacity={w.color && liveColor !== VALUE_COLOR.err && sim.value(w.a.node, w.a.pin) !== 1 ? 0.65 : 1} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round"><title>{w.label ?? ''}</title></path>
              </g>
            );
          })}
          {placed.map((p) => {
            const o = offset(p.node.id);
            const on = selNodes.includes(p.node.id);
            return (
              <g key={p.node.id} data-node={p.node.id} className={`d-node ${p.def.interactive ? 'interactive' : ''}`} transform={`translate(${p.node.x + o.x} ${p.node.y + o.y}) rotate(${p.node.rot})`}>
                {on && <rect x={-6} y={-6} width={p.w + 12} height={p.h + 12} rx={5} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.2} />}
                <rect x={0} y={0} width={p.w} height={p.h} fill="transparent" />
                <LogicSymbol placed={p} st={stateFor(p)} />
              </g>
            );
          })}
          {/* Patillas: puntos de conexión, encima de todo para poder tirar de ellas. */}
          {allPins.map((pin) => {
            const o = offset(pin.node);
            const key = `${pin.node}:${pin.id}`;
            const hot = hoverPin === key || (drag?.kind === 'wire' && drag.target && `${drag.target.node}:${drag.target.id}` === key);
            const loose = !wired.has(key);
            return (
              <g key={key} data-pin={`${pin.node}|${pin.id}`} className="d-pin" onPointerEnter={() => setHoverPin(key)} onPointerLeave={() => setHoverPin((h) => (h === key ? null : h))}>
                <circle cx={pin.at.x + o.x} cy={pin.at.y + o.y} r={7} fill="transparent" />
                {hot ? (
                  <circle cx={pin.at.x + o.x} cy={pin.at.y + o.y} r={4.5} fill="var(--accent)" stroke="#fff" strokeWidth={1.2} />
                ) : loose ? (
                  <circle cx={pin.at.x + o.x} cy={pin.at.y + o.y} r={2.2} fill={pin.dir === 'out' ? 'var(--d-pin-out)' : 'var(--d-pin-in)'} />
                ) : (wired.get(key) ?? 0) > 1 ? (
                  <circle cx={pin.at.x + o.x} cy={pin.at.y + o.y} r={3} fill={netColor({ node: pin.node, pin: pin.id })} />
                ) : null}
              </g>
            );
          })}
          {drag?.kind === 'wire' && drag.moved && (
            <path
              d={pathOf(drag.target ? route(drag.from.at, drag.from.out, drag.target.at, drag.target.out) : [drag.from.at, { x: snap(drag.to.x), y: drag.from.at.y }, { x: snap(drag.to.x), y: snap(drag.to.y) }])}
              stroke="var(--accent-hi)"
              strokeWidth={2}
              strokeDasharray={drag.target ? undefined : '5 4'}
              fill="none"
              pointerEvents="none"
            />
          )}
          {pendingFrom && cursor && (
            <path d={pathOf([pendingFrom.at, { x: snap(cursor.x), y: pendingFrom.at.y }, { x: snap(cursor.x), y: snap(cursor.y) }])} stroke="var(--accent-hi)" strokeWidth={2} strokeDasharray="5 4" fill="none" pointerEvents="none" />
          )}
          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.start.x, drag.end.x)}
              y={Math.min(drag.start.y, drag.end.y)}
              width={Math.abs(drag.end.x - drag.start.x)}
              height={Math.abs(drag.end.y - drag.start.y)}
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth={1 / z}
              strokeDasharray={`${4 / z} ${3 / z}`}
              pointerEvents="none"
            />
          )}
          {ghost && (
            <g transform={`translate(${ghost.node.x} ${ghost.node.y})`} opacity={0.55} pointerEvents="none">
              <LogicSymbol placed={ghost} st={ghostState} />
            </g>
          )}
        </g>
      </svg>

      <ViewTabs />
      <SheetTabs />

      <div className="float d-sim" role="toolbar" aria-label="Simulación lógica">
        <button className="icon-btn" onClick={() => useDesignUi.getState().setRunning(!running)} aria-label={running ? 'Pausar relojes' : 'Reanudar relojes'} title={running ? 'Pausar relojes' : 'Reanudar relojes'} disabled={!sim.hasClock}>
          {running ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            sim.stepClocks();
            refresh();
          }}
          aria-label="Medio ciclo de reloj"
          title="Medio ciclo de reloj"
          disabled={!sim.hasClock}
        >
          <SkipForward size={15} />
        </button>
        <button className="icon-btn" onClick={() => useDesignUi.getState().reset()} aria-label="Reiniciar la simulación" title="Reiniciar: biestables a 0 y relojes en bajo">
          <RotateCcw size={15} />
        </button>
        <span className={`d-live ${sim.hasClock && running ? 'on' : ''}`}>{sim.hasClock ? (running ? 'En marcha' : 'En pausa') : 'En vivo'}</span>
      </div>

      <div className="float zoom-float" role="toolbar" aria-label="Zoom">
        <button className="icon-btn" onClick={() => setViewport({ ...viewport, zoom: Math.max(MIN_ZOOM, z / 1.25) })} aria-label="Alejar">
          <Minus size={15} />
        </button>
        <button className="zoom-val" onClick={() => setViewport({ ...viewport, zoom: 1.6 })} title="Restablecer">
          {Math.round((z / 1.6) * 100)}%
        </button>
        <button className="icon-btn" onClick={() => setViewport({ ...viewport, zoom: Math.min(MAX_ZOOM, z * 1.25) })} aria-label="Acercar">
          <Plus size={15} />
        </button>
        <button className="icon-btn" onClick={fit} aria-label="Ver todo" title="Ver todo">
          <Maximize size={14} />
        </button>
      </div>

      {problem && (
        <div className="float d-problem" role="status">
          <AlertTriangle size={14} /> {problem}
        </div>
      )}
      {empty && !placing && (
        <div className="d-empty">
          <h2>{sheet.kind === 'ic' ? `Diseña ${sheet.name || 'tu integrado'}` : 'Diseña con lógica ideal'}</h2>
          <p>
            {sheet.kind === 'ic'
              ? 'Cada Entrada y Salida que coloques será una patilla del encapsulado. Luego úsalo aquí o en la protoboard.'
              : 'Arrastra puertas desde la izquierda y une sus patillas arrastrando de una a otra. Haz clic en una entrada para cambiarla.'}
          </p>
          <div className="d-keys">
            <span><kbd>I</kbd> entrada</span>
            <span><kbd>O</kbd> salida</span>
            <span><kbd>A</kbd> AND</span>
            <span><kbd>V</kbd> NOT</span>
            <span><kbd>K</kbd> reloj</span>
            <span><kbd>R</kbd> girar</span>
          </div>
        </div>
      )}
      {placing && <div className="float d-hint">Clic para colocar · Mayús mantiene la herramienta · Esc cancela</div>}
      {sheetId !== MAIN_SHEET && !project.design.sheet(sheetId) && <div className="float d-hint">Este integrado ya no existe.</div>}
    </div>
  );
}
