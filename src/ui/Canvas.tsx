import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Copy, Hand, Maximize, Minus, MousePointer2, PackagePlus, Plus, RotateCw, Spline, Trash2, Undo2 } from 'lucide-react';
import { buildNetlist, pinKey } from '../core/netlist';
import { snap, toLocal, toWorld, type PartData, type Vec, type WireData, type WireEnd } from '../core/types';
import { formatSI } from '../core/units';
import { PARTS } from '../parts';
import { useEditor, usePeers, useSnapshot, useVisual } from './context';
import { WIRE_COLORS, distToSegment, partBounds, suggestWireColor, wirePoints } from './geometry';
import { useUi } from './store';
import { WireShape, roundedPath } from './wires';

interface PinHit {
  part: string;
  pin: string;
  pos: Vec;
  label: string;
}

type Drag =
  | { kind: 'parts'; ids: string[]; start: Vec; dx: number; dy: number; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'marquee'; start: Vec; end: Vec; additive: boolean }
  | { kind: 'segment'; wire: string; seg: number; start: Vec }
  | { kind: 'bend'; wire: string; index: number; points: Vec[] }
  | { kind: 'end'; wire: string; which: 'a' | 'b'; pos: Vec };

interface Draft {
  from: WireEnd;
  label: string;
  points: Vec[];
  color: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

export function Canvas() {
  const { project, engine } = useEditor();
  const snapshot = useSnapshot();
  const peers = usePeers();
  const viewport = useUi((s) => s.viewport);
  const setViewport = useUi((s) => s.setViewport);
  const selection = useUi((s) => s.selection);
  const wireSelection = useUi((s) => s.wireSelection);
  const select = useUi((s) => s.select);
  const placing = useUi((s) => s.placing);
  const setPlacing = useUi((s) => s.setPlacing);
  const simRunning = useUi((s) => s.simRunning);
  const openCode = useUi((s) => s.openCode);
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [hoverPin, setHoverPin] = useState<PinHit | null>(null);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; part?: string; wire?: string } | null>(null);
  const [space, setSpace] = useState(false);
  const lastPresence = useRef(0);
  const fitted = useRef(false);

  const partsById = useMemo(() => new Map(snapshot.parts.map((p) => [p.id, p])), [snapshot]);
  const wiresById = useMemo(() => new Map(snapshot.wires.map((w) => [w.id, w])), [snapshot]);
  const netlist = useMemo(() => buildNetlist(snapshot, PARTS), [snapshot]);
  const z = viewport.zoom;

  const toWorldPt = useCallback(
    (clientX: number, clientY: number): Vec => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
    },
    [viewport],
  );

  // ── Encuadre ───────────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || snapshot.parts.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    for (const p of snapshot.parts) {
      const b = partBounds(p);
      grow(b.x, b.y);
      grow(b.x + b.w, b.y + b.h);
    }
    for (const w of snapshot.wires) for (const pt of wirePoints(w, partsById)) grow(pt.x, pt.y);
    const r = svg.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const zoom = Math.min(4, Math.max(MIN_ZOOM, Math.min(r.width / (x1 - x0 + 120), r.height / (y1 - y0 + 140))));
    setViewport({ zoom, x: r.width / 2 - ((x0 + x1) / 2) * zoom, y: r.height / 2 - ((y0 + y1) / 2) * zoom });
  }, [snapshot, partsById, setViewport]);

  useEffect(() => {
    if (!fitted.current && snapshot.parts.length > 0) {
      fitted.current = true;
      requestAnimationFrame(fit);
    }
  }, [snapshot, fit]);

  const zoomBy = (factor: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
    const cx = r.width / 2;
    const cy = r.height / 2;
    setViewport({ zoom, x: cx - ((cx - viewport.x) * zoom) / viewport.zoom, y: cy - ((cy - viewport.y) * zoom) / viewport.zoom });
  };

  // ── Rueda: zoom al cursor; Mayús: desplazamiento ───────────────────────────
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-interactive]')) return;
      e.preventDefault();
      const vp = useUi.getState().viewport;
      const r = svg.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey) {
        setViewport({ ...vp, x: vp.x - e.deltaY, y: vp.y - e.deltaX });
        return;
      }
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor));
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setViewport({ zoom, x: mx - ((mx - vp.x) * zoom) / vp.zoom, y: my - ((my - vp.y) * zoom) / vp.zoom });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === 'Space') {
        setSpace(true);
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setDraft(null);
        setMenu(null);
        setPlacing(null);
        setDrag(null);
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'v' || e.key === 'V') setTool('select');
        if (e.key === 'h' || e.key === 'H') setTool('hand');
        if (e.key === '1' && e.shiftKey) fit();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setPlacing, setTool, fit]);

  // ── Búsqueda de pines ──────────────────────────────────────────────────────
  const pinRadius = Math.min(5, Math.max(3.5, 8 / z));
  const findPin = useCallback(
    (w: Vec, bodyPart: string | null): PinHit | null => {
      let best: PinHit | null = null;
      let bestScore = Infinity;
      snapshot.parts.forEach((p, order) => {
        const b = partBounds(p);
        if (w.x < b.x - 8 || w.x > b.x + b.w + 8 || w.y < b.y - 8 || w.y > b.y + b.h + 8) return;
        const local = toLocal(p, w);
        for (const pin of PARTS[p.type].pins(p.props)) {
          const d = Math.hypot(local.x - pin.x, local.y - pin.y);
          if (d > pinRadius) continue;
          // Las patillas de un componente superior ganan a los orificios de debajo.
          const score = d - order * 0.001 - (pin.kind === 'leg' ? 1 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = { part: p.id, pin: pin.id, pos: toWorld(p, pin), label: pin.label ?? pin.id };
          }
        }
      });
      const hit = best as PinHit | null;
      if (hit && bodyPart && hit.part !== bodyPart) {
        const body = partsById.get(bodyPart);
        if (body && PARTS[body.type].category !== 'Protoboards') return null;
      }
      return hit;
    },
    [snapshot, pinRadius, partsById],
  );

  const publishPresence = useCallback(
    (patch: Parameters<typeof project.setPresence>[0], force = false) => {
      const now = performance.now();
      if (!force && now - lastPresence.current < 33) return;
      lastPresence.current = now;
      project.setPresence(patch);
    },
    [project],
  );

  const offsets = useMemo(() => {
    const map = new Map<string, Vec>();
    for (const peer of peers) if (peer.drag) for (const id of peer.drag.ids) map.set(id, { x: peer.drag.dx, y: peer.drag.dy });
    if (drag?.kind === 'parts') for (const id of drag.ids) map.set(id, { x: drag.dx, y: drag.dy });
    return map;
  }, [peers, drag]);

  /** Puntos de un cable con la edición en curso aplicada (codo o extremo arrastrado). */
  const livePoints = useCallback(
    (w: WireData): Vec[] => {
      if (drag?.kind === 'bend' && drag.wire === w.id) return wirePoints({ ...w, points: drag.points }, partsById, offsets);
      const pts = wirePoints(w, partsById, offsets);
      if (drag?.kind === 'end' && drag.wire === w.id) pts[drag.which === 'a' ? 0 : pts.length - 1] = hoverPin?.pos ?? drag.pos;
      return pts;
    },
    [drag, partsById, offsets, hoverPin],
  );

  // ── Puntero ────────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-interactive]')) return;
    setMenu(null);
    if (e.button === 2) return;
    const w = toWorldPt(e.clientX, e.clientY);
    svgRef.current!.setPointerCapture(e.pointerId);

    if (e.button === 1 || space || tool === 'hand') {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y });
      return;
    }
    if (placing) {
      placePart(placing, w, e.shiftKey);
      return;
    }

    const target = e.target as Element;
    const handle = target.closest('[data-handle]');
    if (handle) {
      const wireId = handle.getAttribute('data-wire')!;
      const wire = wiresById.get(wireId);
      const kind = handle.getAttribute('data-handle');
      const index = Number(handle.getAttribute('data-index'));
      if (wire && kind === 'bend') setDrag({ kind: 'bend', wire: wireId, index, points: [...wire.points] });
      if (wire && kind === 'add') {
        const pts = wirePoints(wire, partsById);
        const mid = { x: snap((pts[index].x + pts[index + 1].x) / 2, 5), y: snap((pts[index].y + pts[index + 1].y) / 2, 5) };
        const points = [...wire.points];
        points.splice(index, 0, mid);
        setDrag({ kind: 'bend', wire: wireId, index, points });
      }
      if (wire && (kind === 'a' || kind === 'b')) setDrag({ kind: 'end', wire: wireId, which: kind, pos: w });
      return;
    }

    const partId = target.closest('[data-part]')?.getAttribute('data-part') ?? null;
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire') ?? null;
    const pin = findPin(w, partId);

    if (draft) {
      if (pin && !(pin.part === draft.from.part && pin.pin === draft.from.pin)) finishWire(pin);
      else setDraft({ ...draft, points: [...draft.points, snapPoint(w, draft, e.shiftKey)] });
      return;
    }

    if (wireId) {
      const wire = wiresById.get(wireId)!;
      const pts = wirePoints(wire, partsById);
      const nearEnd = pin && (Math.hypot(pts[0].x - w.x, pts[0].y - w.y) < pinRadius || Math.hypot(pts[pts.length - 1].x - w.x, pts[pts.length - 1].y - w.y) < pinRadius);
      if (!nearEnd) {
        if (e.shiftKey) select(selection, toggle(wireSelection, wireId));
        else select([], [wireId]);
        let seg = 0;
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = distToSegment(w, pts[i], pts[i + 1]);
          if (d < best) {
            best = d;
            seg = i;
          }
        }
        setDrag({ kind: 'segment', wire: wireId, seg, start: w });
        return;
      }
    }

    if (pin) {
      setDraft({ from: { part: pin.part, pin: pin.pin, x: pin.pos.x, y: pin.pos.y }, label: pin.label, points: [], color: suggestWireColor(pin.pin) });
      return;
    }

    if (partId) {
      let ids = selection;
      if (e.shiftKey) {
        ids = toggle(selection, partId);
        select(ids, wireSelection);
      } else if (!selection.includes(partId)) {
        ids = [partId];
        select(ids, []);
      }
      if (ids.includes(partId)) setDrag({ kind: 'parts', ids, start: w, dx: 0, dy: 0, moved: false });
      return;
    }

    setDrag({ kind: 'marquee', start: w, end: w, additive: e.shiftKey });
    if (!e.shiftKey) select([], []);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorldPt(e.clientX, e.clientY);
    setCursor(w);
    publishPresence({ cursor: w });
    const target = e.target as Element;
    if (!drag || drag.kind === 'end') {
      const partId = target.closest?.('[data-part]')?.getAttribute('data-part') ?? null;
      setHoverPin(drag?.kind === 'end' ? findPin(w, null) : findPin(w, partId));
      setHoverPart(drag ? null : partId);
      setHoverWire(drag ? null : (target.closest?.('[data-wire]')?.getAttribute('data-wire') ?? null));
    }
    if (!drag) return;
    switch (drag.kind) {
      case 'pan':
        setViewport({ ...viewport, x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy });
        break;
      case 'parts': {
        const dx = snap(w.x - drag.start.x);
        const dy = snap(w.y - drag.start.y);
        if (dx !== drag.dx || dy !== drag.dy) {
          setDrag({ ...drag, dx, dy, moved: true });
          publishPresence({ drag: { ids: drag.ids, dx, dy } });
        }
        break;
      }
      case 'marquee':
        setDrag({ ...drag, end: w });
        break;
      case 'segment': {
        // Arrastrar un tramo crea un codo nuevo en ese punto.
        if (Math.hypot(w.x - drag.start.x, w.y - drag.start.y) * z < 4) break;
        const wire = wiresById.get(drag.wire);
        if (!wire) break;
        const points = [...wire.points];
        points.splice(drag.seg, 0, w);
        points[drag.seg] = alignPoint(w, { ...wire, points }, drag.seg, partsById);
        setDrag({ kind: 'bend', wire: drag.wire, index: drag.seg, points });
        break;
      }
      case 'bend': {
        const wire = wiresById.get(drag.wire);
        if (!wire) break;
        const points = [...drag.points];
        points[drag.index] = alignPoint(w, { ...wire, points }, drag.index, partsById);
        setDrag({ ...drag, points });
        break;
      }
      case 'end':
        setDrag({ ...drag, pos: w });
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (!drag) {
      if (draft && draft.points.length === 0) {
        const pin = findPin(toWorldPt(e.clientX, e.clientY), null);
        if (pin && !(pin.part === draft.from.part && pin.pin === draft.from.pin)) finishWire(pin);
      }
      return;
    }
    switch (drag.kind) {
      case 'parts':
        if (drag.moved && (drag.dx || drag.dy)) {
          project.moveParts(
            drag.ids.flatMap((id) => {
              const p = partsById.get(id);
              return p ? [{ id, x: p.x + drag.dx, y: p.y + drag.dy }] : [];
            }),
          );
        }
        publishPresence({ drag: null }, true);
        break;
      case 'marquee': {
        const x0 = Math.min(drag.start.x, drag.end.x);
        const x1 = Math.max(drag.start.x, drag.end.x);
        const y0 = Math.min(drag.start.y, drag.end.y);
        const y1 = Math.max(drag.start.y, drag.end.y);
        if (x1 - x0 > 2 || y1 - y0 > 2) {
          const ids = snapshot.parts
            .filter((p) => {
              const b = partBounds(p);
              return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
            })
            .map((p) => p.id);
          const wids = snapshot.wires.filter((wi) => wirePoints(wi, partsById).every((pt) => pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1)).map((x) => x.id);
          select(drag.additive ? [...new Set([...selection, ...ids])] : ids, drag.additive ? [...new Set([...wireSelection, ...wids])] : wids);
        }
        break;
      }
      case 'bend':
        project.updateWire(drag.wire, { points: drag.points });
        break;
      case 'end': {
        const pin = findPin(drag.pos, null);
        const wire = wiresById.get(drag.wire);
        const other = wire?.[drag.which === 'a' ? 'b' : 'a'];
        if (pin && wire && !(other?.part === pin.part && other?.pin === pin.pin)) {
          project.updateWire(drag.wire, { [drag.which]: { part: pin.part, pin: pin.pin, x: pin.pos.x, y: pin.pos.y } });
        }
        break;
      }
    }
    setDrag(null);
  };

  // Con captura de puntero, dblclick/contextmenu llegan al <svg>: se resuelve el elemento real bajo el cursor.
  const under = (e: React.MouseEvent) => document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);

  const onDoubleClick = (e: React.MouseEvent) => {
    const w = toWorldPt(e.clientX, e.clientY);
    const target = under(e);
    const handle = target.closest('[data-handle="bend"]');
    if (handle) {
      const wire = wiresById.get(handle.getAttribute('data-wire')!);
      if (wire) project.updateWire(wire.id, { points: wire.points.filter((_, i) => i !== Number(handle.getAttribute('data-index'))) });
      return;
    }
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire');
    if (wireId) {
      const wire = wiresById.get(wireId);
      if (!wire) return;
      const pts = wirePoints(wire, partsById);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegment(w, pts[i], pts[i + 1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const points = [...wire.points];
      points.splice(best, 0, { x: snap(w.x, 5), y: snap(w.y, 5) });
      project.updateWire(wire.id, { points });
      return;
    }
    const partId = target.closest('[data-part]')?.getAttribute('data-part');
    if (partId && partsById.get(partId)?.type === 'arduino-uno') openCode(partId, 'code');
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = under(e);
    const r = svgRef.current!.getBoundingClientRect();
    const partId = target.closest('[data-part]')?.getAttribute('data-part');
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire');
    if (wireId) {
      if (!wireSelection.includes(wireId)) select([], [wireId]);
      setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, wire: wireId });
    } else if (partId) {
      if (!selection.includes(partId)) select([partId], []);
      setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, part: partId });
    } else if (draft) {
      setDraft(null);
    }
  };

  // ── Acciones ───────────────────────────────────────────────────────────────
  const placePart = (type: string, w: Vec, keepArmed: boolean) => {
    const def = PARTS[type];
    const b = def.bounds(def.defaults);
    const id = project.addPart(type, snap(w.x - b.x - b.w / 2), snap(w.y - b.y - b.h / 2));
    select([id], []);
    if (!keepArmed) setPlacing(null);
  };

  const finishWire = (pin: PinHit) => {
    if (!draft) return;
    const id = project.addWire(draft.from, { part: pin.part, pin: pin.pin, x: pin.pos.x, y: pin.pos.y }, draft.points, draft.color);
    setDraft(null);
    select([], [id]);
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/x-part');
    if (!type || !PARTS[type]) return;
    e.preventDefault();
    placePart(type, toWorldPt(e.clientX, e.clientY), false);
  };

  const onPartInput = useCallback(
    (part: PartData, key: string, value: number | boolean) => {
      const persistent = PARTS[part.type].fields?.some((f) => f.key === key);
      if (persistent) project.setProp(part.id, key, value);
      else engine.setInput(part.id, key, value);
    },
    [project, engine],
  );

  const deleteSelection = () => {
    project.deleteItems(selection, wireSelection);
    select([], []);
    setMenu(null);
  };

  // ── Resaltados ─────────────────────────────────────────────────────────────
  const netHighlight = useMemo(() => {
    if (!hoverPin || (drag && drag.kind !== 'end')) return [] as Vec[];
    const net = netlist.netOf.get(pinKey(hoverPin.part, hoverPin.pin));
    if (net === undefined) return [];
    const out: Vec[] = [];
    netlist.netOf.forEach((n, key) => {
      if (n === net) {
        const pos = netlist.pinWorld.get(key);
        if (pos) out.push(pos);
      }
    });
    return out.slice(0, 400);
  }, [hoverPin, netlist, drag]);

  const insertionMarks = useMemo(() => {
    const ids = drag?.kind === 'parts' ? drag.ids : [];
    if (ids.length === 0 || drag?.kind !== 'parts') return [] as Vec[];
    const sockets = new Set<string>();
    for (const p of snapshot.parts) {
      if (ids.includes(p.id)) continue;
      for (const pin of PARTS[p.type].pins(p.props))
        if (pin.kind === 'socket') {
          const w = toWorld(p, pin);
          sockets.add(`${w.x},${w.y}`);
        }
    }
    const out: Vec[] = [];
    for (const id of ids) {
      const p = partsById.get(id);
      if (!p) continue;
      for (const pin of PARTS[p.type].pins(p.props)) {
        if (pin.kind !== 'leg') continue;
        const w = toWorld(p, pin);
        const pos = { x: w.x + drag.dx, y: w.y + drag.dy };
        if (sockets.has(`${pos.x},${pos.y}`)) out.push(pos);
      }
    }
    return out;
  }, [drag, snapshot, partsById]);

  const peerSelections = useMemo(() => {
    const out: { id: string; color: string; name: string; key: string }[] = [];
    for (const peer of peers) for (const id of peer.selection ?? []) out.push({ id, color: peer.user.color, name: peer.user.name, key: `${id}-${peer.clientId}` });
    return out;
  }, [peers]);

  useEffect(() => {
    project.setPresence({ selection });
  }, [project, selection]);

  const draftEnd = cursor && draft ? snapPoint(cursor, draft, false) : null;
  const ghost = placing && cursor ? PARTS[placing] : null;
  const hoverVoltage = hoverPin && simRunning ? engine.voltageAt(hoverPin.part, hoverPin.pin) : null;
  const gridStep = z < 0.8 ? 50 : 10;
  const draggingIds = drag?.kind === 'parts' && drag.moved ? drag.ids : [];
  const hasSelection = selection.length + wireSelection.length > 0;

  return (
    <div className="canvas-wrap" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        className={`canvas ${space || tool === 'hand' || drag?.kind === 'pan' ? 'panning' : ''} ${draft ? 'wiring' : ''} ${hoverPin && !hoverWire ? 'on-pin' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          setHoverPart(null);
          project.setPresence({ cursor: null });
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="grid" width={gridStep * z} height={gridStep * z} patternUnits="userSpaceOnUse" x={viewport.x} y={viewport.y}>
            <circle cx={0.75} cy={0.75} r={z > 1.5 ? 0.85 : 0.7} fill="var(--grid-dot)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${z})`}>
          {snapshot.parts.map((p) => (
            <PartView key={p.id} part={p} offset={offsets.get(p.id)} onInput={onPartInput} live={simRunning} dragging={draggingIds.includes(p.id)} />
          ))}

          {hoverPart && !selection.includes(hoverPart) && !drag && !draft && partsById.get(hoverPart) && PARTS[partsById.get(hoverPart)!.type].category !== 'Protoboards' && (
            <SelRect part={partsById.get(hoverPart)!} offset={offsets.get(hoverPart)} z={z} tone="hover" />
          )}

          {insertionMarks.map((m, i) => (
            <circle key={i} cx={m.x} cy={m.y} r={3.4} fill="var(--green)" fillOpacity={0.25} stroke="var(--green)" strokeWidth={1} pointerEvents="none" />
          ))}

          <g className="wires">
            {snapshot.wires.map((w) => (
              <WireView key={w.id} wire={w} points={livePoints(w)} z={z} selected={wireSelection.includes(w.id)} hovered={hoverWire === w.id && !drag} editing={drag?.kind === 'bend' && drag.wire === w.id ? drag.index : null} />
            ))}
          </g>

          {draft && draftEnd && (
            <g pointerEvents="none" opacity={0.9}>
              <path d={roundedPath([{ x: draft.from.x, y: draft.from.y }, ...draft.points, hoverPin ? hoverPin.pos : draftEnd])} stroke={draft.color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d={roundedPath([{ x: draft.from.x, y: draft.from.y }, ...draft.points, hoverPin ? hoverPin.pos : draftEnd])} stroke="#fff" strokeOpacity={0.5} strokeWidth={0.8} strokeDasharray="3 5" className="marching" fill="none" />
              {draft.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.4} fill="#fff" stroke={draft.color} strokeWidth={1.2} />
              ))}
            </g>
          )}

          {netHighlight.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.3} fill="var(--green)" fillOpacity={0.28} stroke="var(--green)" strokeWidth={0.8} pointerEvents="none" />
          ))}
          {hoverPin && (
            <g pointerEvents="none">
              <circle cx={hoverPin.pos.x} cy={hoverPin.pos.y} r={6} fill="var(--accent)" fillOpacity={0.18} />
              <circle cx={hoverPin.pos.x} cy={hoverPin.pos.y} r={3.8} fill="none" stroke="var(--accent-hi)" strokeWidth={1.4} />
            </g>
          )}

          {selection.map((id) => {
            const p = partsById.get(id);
            return p ? <SelRect key={id} part={p} offset={offsets.get(id)} z={z} tone="selected" /> : null;
          })}
          {peerSelections.map(({ id, color, name, key }) => {
            const p = partsById.get(id);
            if (!p) return null;
            const o = offsets.get(id);
            const b = partBounds(p);
            const x = b.x - 7 + (o?.x ?? 0);
            const y = b.y - 7 + (o?.y ?? 0);
            return (
              <g key={key} pointerEvents="none">
                <rect x={x} y={y} width={b.w + 14} height={b.h + 14} rx={6} fill="none" stroke={color} strokeWidth={1.5 / z} />
                <rect x={x} y={y - 16 / z} width={(name.length * 6.6 + 12) / z} height={14 / z} rx={4 / z} fill={color} />
                <text x={x + 6 / z} y={y - 5.5 / z} fontSize={10.5 / z} fill="#0b0c0e" fontWeight={600} fontFamily="Geist, sans-serif">
                  {name}
                </text>
              </g>
            );
          })}

          {ghost &&
            cursor &&
            (() => {
              const b = ghost.bounds(ghost.defaults);
              const x = snap(cursor.x - b.x - b.w / 2);
              const y = snap(cursor.y - b.y - b.h / 2);
              return (
                <g transform={`translate(${x} ${y})`} opacity={0.75} pointerEvents="none" style={{ filter: 'drop-shadow(0 10px 14px rgba(0,0,0,.5))' }}>
                  <ghost.Render part={{ id: 'ghost', type: ghost.type, x, y, rot: 0, props: ghost.defaults }} visual={null} preview />
                </g>
              );
            })()}

          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.start.x, drag.end.x)}
              y={Math.min(drag.start.y, drag.end.y)}
              width={Math.abs(drag.end.x - drag.start.x)}
              height={Math.abs(drag.end.y - drag.start.y)}
              rx={2 / z}
              fill="var(--accent)"
              fillOpacity={0.07}
              stroke="var(--accent)"
              strokeOpacity={0.7}
              strokeWidth={1 / z}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {peers.map((peer) =>
        peer.cursor ? (
          <div key={peer.clientId} className="peer-cursor" style={{ transform: `translate(${peer.cursor.x * z + viewport.x}px, ${peer.cursor.y * z + viewport.y}px)` }}>
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
              <path d="M2 1.5 L2 16 L6 12.4 L8.8 18.4 L11.4 17.2 L8.7 11.4 L14 11.4 Z" fill={peer.user.color} stroke="#0b0c0e" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="tag" style={{ background: peer.user.color }}>
              {peer.user.name}
            </span>
          </div>
        ) : null,
      )}

      {hoverPin && cursor && (!drag || drag.kind === 'end') && (
        <div className="pin-tip" style={{ transform: `translate(${hoverPin.pos.x * z + viewport.x + 14}px, ${hoverPin.pos.y * z + viewport.y - 34}px)` }}>
          <strong style={{ fontWeight: 500 }}>{hoverPin.label}</strong>
          {hoverVoltage !== null && <span className="mono v">{formatSI(hoverVoltage, 'V')}</span>}
        </div>
      )}

      <div className="float toolbar-float" role="toolbar" aria-label="Herramientas">
        <button className={`icon-btn ${tool === 'select' ? 'on' : ''}`} onClick={() => setTool('select')} aria-label="Seleccionar" title="Seleccionar · V">
          <MousePointer2 size={15} />
        </button>
        <button className={`icon-btn ${tool === 'hand' ? 'on' : ''}`} onClick={() => setTool('hand')} aria-label="Mover la vista" title="Mano · H o Espacio">
          <Hand size={15} />
        </button>
        {hasSelection && (
          <>
            <span className="sep" />
            {selection.length > 0 && (
              <>
                <button className="icon-btn" onClick={() => project.rotateParts(selection)} aria-label="Rotar" title="Rotar · R">
                  <RotateCw size={15} />
                </button>
                <button className="icon-btn" onClick={() => select(project.duplicate(selection, 20, 20), [])} aria-label="Duplicar" title="Duplicar · Ctrl D">
                  <Copy size={15} />
                </button>
              </>
            )}
            {selection.length === 0 && wireSelection.length > 0 && (
              <span className="wire-colors" role="group" aria-label="Color del cable">
                {WIRE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="dot"
                    style={{ background: c.value }}
                    aria-label={c.label}
                    title={c.label}
                    aria-pressed={wireSelection.every((id) => wiresById.get(id)?.color === c.value)}
                    onClick={() => wireSelection.forEach((id) => project.updateWire(id, { color: c.value }))}
                  />
                ))}
                <span className="sep" />
              </span>
            )}
            <button className="icon-btn" onClick={deleteSelection} aria-label="Eliminar" title="Eliminar · Supr" style={{ color: 'var(--red)' }}>
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>

      <div className="float zoom-float" role="toolbar" aria-label="Zoom">
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Alejar">
          <Minus size={15} />
        </button>
        <button className="zoom-val" onClick={() => setViewport({ ...viewport, zoom: 2 })} title="Restablecer al 100 %">
          {Math.round(z * 50)}%
        </button>
        <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Acercar">
          <Plus size={15} />
        </button>
        <span className="sep" />
        <button className="icon-btn" onClick={fit} aria-label="Ajustar a la vista" title="Ajustar · ⇧ 1">
          <Maximize size={14} />
        </button>
      </div>

      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} role="menu">
          {menu.part && (
            <>
              <button role="menuitem" onClick={() => (project.rotateParts(selection), setMenu(null))}>
                <RotateCw size={14} /> Rotar <kbd>R</kbd>
              </button>
              <button role="menuitem" onClick={() => (select(project.duplicate(selection, 20, 20), []), setMenu(null))}>
                <Copy size={14} /> Duplicar <kbd>Ctrl D</kbd>
              </button>
              {partsById.get(menu.part)?.type === 'arduino-uno' && (
                <button role="menuitem" onClick={() => (openCode(menu.part!, 'code'), setMenu(null))}>
                  <Code2 size={14} /> Abrir código
                </button>
              )}
            </>
          )}
          {menu.wire && (
            <button role="menuitem" onClick={() => (project.updateWire(menu.wire!, { points: [] }), setMenu(null))}>
              <Undo2 size={14} /> Quitar codos
            </button>
          )}
          <hr />
          <button role="menuitem" className="danger" onClick={deleteSelection}>
            <Trash2 size={14} /> Eliminar <kbd>Supr</kbd>
          </button>
        </div>
      )}

      {placing && (
        <div className="float hint-float" role="status">
          <PackagePlus size={15} />
          <span>
            Coloca <strong>{PARTS[placing].name}</strong>
          </span>
          <span className="keys">
            <kbd>⇧</kbd> repetir <kbd>Esc</kbd>
          </span>
        </div>
      )}
      {draft && (
        <div className="float hint-float" role="status">
          <Spline size={15} style={{ color: draft.color }} />
          <span>
            Cable desde <strong>{draft.label}</strong>
          </span>
          <span className="keys">
            clic dobla <kbd>⇧</kbd> recto <kbd>Esc</kbd>
          </span>
        </div>
      )}
    </div>
  );
}

function snapPoint(w: Vec, draft: Draft, straight: boolean): Vec {
  const p = { x: snap(w.x, 5), y: snap(w.y, 5) };
  if (!straight) return p;
  const last = draft.points.at(-1) ?? { x: draft.from.x, y: draft.from.y };
  return Math.abs(p.x - last.x) > Math.abs(p.y - last.y) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
}

/** Rejilla de 5 y alineación magnética con los vecinos del codo (líneas rectas sin esfuerzo). */
function alignPoint(w: Vec, wire: WireData, index: number, parts: Map<string, PartData>): Vec {
  const p = { x: snap(w.x, 5), y: snap(w.y, 5) };
  const pts = wirePoints(wire, parts);
  const prev = pts[index];
  const next = pts[index + 2];
  for (const n of [prev, next]) {
    if (!n) continue;
    if (Math.abs(n.x - w.x) < 5) p.x = n.x;
    if (Math.abs(n.y - w.y) < 5) p.y = n.y;
  }
  return p;
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
}

// ── Marco de selección ───────────────────────────────────────────────────────
function SelRect({ part, offset, z, tone }: { part: PartData; offset?: Vec; z: number; tone: 'selected' | 'hover' }) {
  const b = partBounds(part);
  const pad = 5;
  const x = b.x - pad + (offset?.x ?? 0);
  const y = b.y - pad + (offset?.y ?? 0);
  const w = b.w + pad * 2;
  const h = b.h + pad * 2;
  if (tone === 'hover') return <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1 / z} pointerEvents="none" />;
  const s = 5.5 / z;
  return (
    <g pointerEvents="none" className="sel-ring">
      <rect x={x} y={y} width={w} height={h} rx={5} fill="var(--accent)" fillOpacity={0.04} stroke="var(--accent)" strokeOpacity={0.25} strokeWidth={5 / z} />
      <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke="var(--accent-hi)" strokeWidth={1.25 / z} />
      {[
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(([cx, cy], i) => (
        <rect key={i} x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={1.2 / z} fill="#fff" stroke="var(--accent)" strokeWidth={1 / z} />
      ))}
    </g>
  );
}

// ── Componente en el lienzo ──────────────────────────────────────────────────
const PartView = memo(function PartView({
  part,
  offset,
  onInput,
  live,
  dragging,
}: {
  part: PartData;
  offset?: Vec;
  onInput: (part: PartData, key: string, value: number | boolean) => void;
  live: boolean;
  dragging: boolean;
}) {
  const def = PARTS[part.type];
  const visual = useVisual(part.id);
  const handle = useCallback((key: string, value: number | boolean) => onInput(part, key, value), [onInput, part]);
  // Rotación acumulada para que 270° → 0° gire 90° hacia delante y no 270° hacia atrás.
  const shown = useRef<number>(part.rot);
  const current = ((shown.current % 360) + 360) % 360;
  if (current !== part.rot) {
    let d = part.rot - current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    shown.current += d;
  }
  const x = part.x + (offset?.x ?? 0);
  const y = part.y + (offset?.y ?? 0);
  return (
    <g
      data-part={part.id}
      className={`part ${dragging ? 'lift dragging' : ''}`}
      style={{ transform: `translate(${x}px, ${y}px) rotate(${shown.current}deg)`, transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)' }}
    >
      <g className="part-body">
        <def.Render part={part} visual={live ? visual : null} onInput={handle} />
      </g>
    </g>
  );
});

// ── Cable ───────────────────────────────────────────────────────────────────
const WireView = memo(function WireView({ wire, points, z, selected, hovered, editing }: { wire: WireData; points: Vec[]; z: number; selected: boolean; hovered: boolean; editing: number | null }) {
  const d = roundedPath(points);
  const r = 4 / z;
  return (
    <g data-wire={wire.id} className="wire">
      <path d={d} stroke="transparent" strokeWidth={Math.max(6, 14 / z)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <WireShape points={points} color={wire.color} selected={selected} hovered={hovered} />
      {selected && (
        <g>
          {points.slice(0, -1).map((p, i) => {
            const q = points[i + 1];
            if (Math.hypot(q.x - p.x, q.y - p.y) * z < 36) return null;
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            return (
              <g key={`add-${i}`} data-handle="add" data-wire={wire.id} data-index={i} className="bend-add">
                <circle cx={mx} cy={my} r={r * 1.6} fill="transparent" />
                <circle cx={mx} cy={my} r={r * 0.95} fill="rgba(11,12,14,0.85)" stroke="var(--accent-hi)" strokeWidth={1 / z} />
                <path d={`M${mx - r * 0.5} ${my}h${r}M${mx} ${my - r * 0.5}v${r}`} stroke="var(--accent-hi)" strokeWidth={1.1 / z} strokeLinecap="round" />
              </g>
            );
          })}
          {wire.points.map((_, i) => {
            const p = points[i + 1];
            return <circle key={`b-${i}`} data-handle="bend" data-wire={wire.id} data-index={i} className="bend" cx={p.x} cy={p.y} r={editing === i ? r * 1.25 : r} fill="#fff" stroke="var(--accent)" strokeWidth={1.4 / z} />;
          })}
          {(['a', 'b'] as const).map((which) => {
            const p = which === 'a' ? points[0] : points[points.length - 1];
            return (
              <g key={which} data-handle={which} data-wire={wire.id} className="wire-end">
                <circle cx={p.x} cy={p.y} r={r * 1.7} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={r * 1.15} fill="var(--accent)" fillOpacity={0.2} stroke="var(--accent-hi)" strokeWidth={1.4 / z} />
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
});
