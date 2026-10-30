import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircuitBoard, Zap, Code2, Copy, Workflow, Hand, Maximize, Minus, MousePointer2, PackagePlus, Plus, RotateCw, Spline, Trash2, Undo2 } from 'lucide-react';
import { buildNetlist, pinKey, type Netlist } from '../core/netlist';
import { snap, toLocal, toWorld, type PartData, type PinDef, type Vec, type WireData, type WireEnd } from '../core/types';
import { formatSI } from '../core/units';
import { PARTS } from '../parts';
import { SCH_PREFIX } from '../parts/symbols';
import { useEditor, usePeers, useDisplaySnapshot, useVisual } from './context';
import { CircuitOverlays } from './CircuitOverlays';
import { magneticPosition,occupiedHoles } from './magnet';
import { ProbeReadout } from './ProbeReadout';
import { FrameMeter } from './FrameMeter';
import { WIRE_COLORS, distToSegment, partBounds, suggestWireColor, wirePoints } from './geometry';
import { useUi } from './store';
import { connectionEdges, wireCurrents } from '../sim/flow';
import { assessDamage, clearDamage, damageOf, trackDamage, type Damage } from '../sim/damage';
import { WireShape, roundedPath } from './wires';
import { buildSchematic, flagWidth, withFrozenPlacement, type SchFlag, type SchNet } from './schematic';

interface PinHit {
  part: string;
  pin: string;
  pos: Vec;
  label: string;
  desc?: string;
}

/** Último color de cable usado: el siguiente cable nace con él. Sin uso previo, se sugiere uno por el pin. */
let lastWireColor: string | null = null;
const nextWireColor = (pinId: string) => lastWireColor ?? suggestWireColor(pinId);

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
  const snapshot = useDisplaySnapshot();
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
  // Selector de pin: al soltar un cable del esquema sobre el cuerpo de un símbolo.
  const [picker, setPicker] = useState<{ x: number; y: number; part: string; at: Vec } | null>(null);
  const showToast = useUi((s) => s.showToast);
  const [space, setSpace] = useState(false);
  const lastPresence = useRef(0);
  const fitted = useRef(false);
  const magnet=useRef<Vec|null>(null);
  const [connection,setConnection]=useState<{a:Vec;b:Vec}|null>(null);
  useEffect(()=>{if(!connection)return;const timer=setTimeout(()=>setConnection(null),240);return()=>clearTimeout(timer);},[connection]);
  useEffect(()=>{
    const node=svgRef.current;if(!node)return;
    let previous={w:node.clientWidth,h:node.clientHeight};
    const observer=new ResizeObserver(()=>{const next={w:node.clientWidth,h:node.clientHeight};if(previous.w&&previous.h){const vp=useUi.getState().viewport;setViewport({...vp,x:vp.x+(next.w-previous.w)/2,y:vp.y+(next.h-previous.h)/2});}previous=next;});
    observer.observe(node);return()=>observer.disconnect();
  },[setViewport]);

  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const netlist = useMemo(() => buildNetlist(snapshot, PARTS), [snapshot]);
  // Vista de esquema: símbolos «sch:» con los mismos ids; las conexiones salen de las redes.
  const sch = useMemo(() => (view === 'schematic' ? buildSchematic(snapshot, netlist) : null), [view, snapshot, netlist]);
  // En la protoboard, las conexiones dibujadas en el esquema no son cables físicos.
  const boardScene = useMemo(() => (snapshot.wires.some((w) => w.sch) ? { parts: snapshot.parts, wires: snapshot.wires.filter((w) => !w.sch) } : snapshot), [snapshot]);
  const scene = useMemo(() => (sch ? { parts: sch.parts, wires: [] as WireData[] } : boardScene), [sch, boardScene]);

  /** Conexiones del esquema que la protoboard aún no hace: se muestran discontinuas. */
  const pending = useMemo(() => {
    if (sch) return [];
    const schWires = snapshot.wires.filter((w) => w.sch && w.a.part && w.a.pin && w.b.part && w.b.pin);
    if (schWires.length === 0) return [];
    const physical = buildNetlist(boardScene, PARTS);
    return schWires.flatMap((w) => {
      const ka = pinKey(w.a.part!, w.a.pin!);
      const kb = pinKey(w.b.part!, w.b.pin!);
      const na = physical.netOf.get(ka);
      if (na !== undefined && na === physical.netOf.get(kb)) return [];
      const a = physical.pinWorld.get(ka);
      const b = physical.pinWorld.get(kb);
      return a && b ? [{ id: w.id, a, b }] : [];
    });
  }, [sch, snapshot, boardScene]);

  /** Redes del esquema con algún cable seleccionado. */
  const selectedNets = useMemo(() => {
    const out = new Set<number>();
    if (!sch) return out;
    for (const id of wireSelection) {
      const w = snapshot.wires.find((x) => x.id === id);
      const n = w?.a.part && w.a.pin ? netlist.netOf.get(pinKey(w.a.part, w.a.pin)) : undefined;
      if (n !== undefined) out.add(n);
    }
    return out;
  }, [sch, wireSelection, snapshot, netlist]);
  const partsById = useMemo(() => new Map(scene.parts.map((p) => [p.id, p])), [scene]);
  const wiresById = useMemo(() => new Map(snapshot.wires.map((w) => [w.id, w])), [snapshot]);
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
    if (!svg || scene.parts.length === 0) return;
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
    for (const p of scene.parts) {
      const b = partBounds(p);
      grow(b.x, b.y);
      grow(b.x + b.w, b.y + b.h);
    }
    for (const w of scene.wires) for (const pt of wirePoints(w, partsById)) grow(pt.x, pt.y);
    // En el esquema se encuadra la hoja entera, con su marco y su cajetín.
    if (sch) {
      grow(sch.sheet.x, sch.sheet.y);
      grow(sch.sheet.x + sch.sheet.w, sch.sheet.y + sch.sheet.h);
    }
    const r = svg.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const pad = sch ? 40 : 120;
    const zoom = Math.min(4, Math.max(MIN_ZOOM, Math.min(r.width / (x1 - x0 + pad), r.height / (y1 - y0 + pad + 20))));
    setViewport({ zoom, x: r.width / 2 - ((x0 + x1) / 2) * zoom, y: r.height / 2 - ((y0 + y1) / 2) * zoom });
  }, [scene, sch, partsById, setViewport]);

  useEffect(() => {
    if (!fitted.current && scene.parts.length > 0) {
      fitted.current = true;
      requestAnimationFrame(fit);
    }
  }, [scene, fit]);

  // Al cambiar de vista se encuadra de nuevo; un cable a medias no tiene sentido en la otra.
  useEffect(() => {
    setDraft(null);
    setPicker(null);
    requestAnimationFrame(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
        setPicker(null);
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
      scene.parts.forEach((p, order) => {
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
            best = { part: p.id, pin: pin.id, pos: toWorld(p, pin), label: pin.label ?? pin.id, desc: pin.desc };
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
    [scene, pinRadius, partsById],
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
    for (const peer of peers) if ((peer.view ?? 'board') === view && peer.drag) for (const id of peer.drag.ids) map.set(id, { x: peer.drag.dx, y: peer.drag.dy });
    if (drag?.kind === 'parts') for (const id of drag.ids) map.set(id, { x: drag.dx, y: drag.dy });
    return map;
  }, [peers, drag, view]);

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
    magnet.current=null;
    if ((e.target as Element).closest('[data-interactive]')) return;
    setMenu(null);
    setPicker(null);
    if (e.button === 2) return;
    const w = toWorldPt(e.clientX, e.clientY);
    if(e.altKey){const hit=findPin(w,null);const wireId=(e.target as Element).closest('[data-wire]')?.getAttribute('data-wire');const wire=wireId?wiresById.get(wireId):null;const key=hit?pinKey(hit.part,hit.pin):wire?.a.part&&wire.a.pin?pinKey(wire.a.part,wire.a.pin):null;if(key){useUi.getState().pinSignal(key);useUi.getState().setLabPanel('signals');return;}}
    if(engine.lab.paused && engine.lab.cursor<engine.lab.duration){const id=(e.target as Element).closest('[data-part]')?.getAttribute('data-part');if(id)select([id]);return;}
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
      else if (!openPicker(partId, w, e.clientX, e.clientY)) setDraft({ ...draft, points: [...draft.points, snapPoint(w, draft, e.shiftKey)] });
      return;
    }

    // En el esquema, clic en una conexión selecciona los cables que la forman.
    const netAttr = sch && !pin ? target.closest('[data-net]')?.getAttribute('data-net') : null;
    if (netAttr) {
      selectNet(Number(netAttr), e.shiftKey);
      return;
    }

    if (wireId) {
      const wire = wiresById.get(wireId)!;
      const pts = wirePoints(wire, partsById);
      const nearEnd = pin && (Math.hypot(pts[0].x - w.x, pts[0].y - w.y) < pinRadius || Math.hypot(pts[pts.length - 1].x - w.x, pts[pts.length - 1].y - w.y) < pinRadius);
      if (!nearEnd) {
        if (e.shiftKey) select(selection, toggle(wireSelection, wireId));
        else select([], [wireId]);
        // Si se agarra un codo que ya existe, se mueve ese; arrastrar el tramo crearía otro codo al lado.
        const grab = Math.max(pinRadius, 9 / z);
        const bend = wire.points.findIndex((p) => Math.hypot(p.x - w.x, p.y - w.y) <= grab);
        if (bend >= 0) {
          setDrag({ kind: 'bend', wire: wireId, index: bend, points: [...wire.points] });
          return;
        }
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
      setDraft({ from: { part: pin.part, pin: pin.pin, x: pin.pos.x, y: pin.pos.y }, label: pin.label, points: [], color: nextWireColor(pin.pin) });
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
        let dx = snap(w.x - drag.start.x),dy = snap(w.y - drag.start.y);
        if(!sch&&drag.ids.length===1){const part=partsById.get(drag.ids[0]);if(part){const result=magneticPosition(part,{x:part.x+w.x-drag.start.x,y:part.y+w.y-drag.start.y},scene.parts,z,magnet.current);magnet.current=result.held;dx=result.at.x-part.x;dy=result.at.y-part.y;}}
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
        const w = toWorldPt(e.clientX, e.clientY);
        const pin = findPin(w, null);
        if (pin && !(pin.part === draft.from.part && pin.pin === draft.from.pin)) finishWire(pin);
        else if (!pin) {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          openPicker(el?.closest('[data-part]')?.getAttribute('data-part') ?? null, w, e.clientX, e.clientY, false);
        }
      }
      return;
    }
    switch (drag.kind) {
      case 'parts':
        if(!sch&&drag.ids.length===1){const part=partsById.get(drag.ids[0]);if(part&&occupiedHoles(part,{x:part.x+drag.dx,y:part.y+drag.dy},scene.parts).length){publishPresence({drag:null},true);showToast('Ese orificio ya tiene una patilla. Elige otro lugar.');break;}}
        if (drag.moved && (drag.dx || drag.dy)) {
          const moves = drag.ids.flatMap((id) => {
            const p = partsById.get(id);
            return p ? [{ id, x: p.x + drag.dx, y: p.y + drag.dy }] : [];
          });
          if (sch) project.moveSchematic(withFrozenPlacement(snapshot.parts, moves));
          else project.moveParts(moves);
        }
        publishPresence({ drag: null }, true);
        break;
      case 'marquee': {
        const x0 = Math.min(drag.start.x, drag.end.x);
        const x1 = Math.max(drag.start.x, drag.end.x);
        const y0 = Math.min(drag.start.y, drag.end.y);
        const y1 = Math.max(drag.start.y, drag.end.y);
        if (x1 - x0 > 2 || y1 - y0 > 2) {
          const ids = scene.parts
            .filter((p) => {
              const b = partBounds(p);
              return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
            })
            .map((p) => p.id);
          const wids = scene.wires.filter((wi) => wirePoints(wi, partsById).every((pt) => pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1)).map((x) => x.id);
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
    if (partId && PARTS[partsById.get(partId)?.type ?? '']?.mcu) openCode(partId, 'code');
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
    const symbol = sch ? PARTS[SCH_PREFIX + type] : def;
    const shownBounds = symbol.bounds(symbol.defaults);
    const at = { x: snap(w.x - shownBounds.x - shownBounds.w / 2), y: snap(w.y - shownBounds.y - shownBounds.h / 2) };
    if(!sch){const result=magneticPosition({id:'ghost',type,x:0,y:0,rot:0,props:def.defaults},at,snapshot.parts,z);at.x=result.at.x;at.y=result.at.y;}
    if(!sch&&occupiedHoles({id:'ghost',type,x:0,y:0,rot:0,props:def.defaults},at,snapshot.parts).length){showToast('Ese orificio ya tiene una patilla. Elige otro lugar.');return;}
    // A schematic placement must not silently insert pins into an existing breadboard.
    const edge = sch ? Math.max(0, ...snapshot.parts.map((p) => { const bounds = partBounds(p); return bounds.x + bounds.w; })) : 0;
    const id = project.addPart(type, sch ? snap(edge + 60 - b.x) : at.x, sch ? snap(-b.y) : at.y);
    if (sch) project.moveSchematic([{ id, ...at }]);
    select([id], []);
    if (!keepArmed) setPlacing(null);
  };

  const finishWire = (pin: PinHit) => {
    if (!draft) return;
    // Los quiebros del esquema no son puntos de la protoboard: el cable del esquema va sin ellos.
    const id = project.addWire(draft.from, { part: pin.part, pin: pin.pin, x: pin.pos.x, y: pin.pos.y }, sch ? [] : draft.points, draft.color, !!sch);
    lastWireColor = draft.color;
    setConnection({a:{x:draft.from.x,y:draft.from.y},b:pin.pos});
    setDraft(null);
    setPicker(null);
    select([], [id]);
  };

  // Soltar una pieza arrastrada desde la biblioteca.
  const libDrag = useUi((s) => s.libDrag);
  const libDragActive = !!libDrag;
  const placeRef = useRef(placePart);
  placeRef.current = placePart;
  useEffect(() => {
    if (!libDragActive) return;
    const up = () => {
      const d = useUi.getState().libDrag;
      if (d?.over && PARTS[d.type]) placeRef.current(d.type, toWorldPt(d.x, d.y), false);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [libDragActive, toWorldPt]);

  /** Cable del esquema soltado sobre el cuerpo de un símbolo: elegir a qué pin va. */
  const openPicker = (hit: string | null, w: Vec, clientX: number, clientY: number, allowSelf = true) => {
    if (!sch) return false;
    // Los símbolos son trazos finos: se busca la pieza por su caja, no por el píxel pintado.
    const partId = hit ?? [...scene.parts].reverse().find((p) => {
      const b = partBounds(p);
      return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
    })?.id ?? null;
    if (!partId || (!allowSelf && partId === draft?.from.part) || !snapshot.parts.some((p) => p.id === partId)) return false;
    const r = svgRef.current!.getBoundingClientRect();
    setPicker({ x: Math.max(8, Math.min(clientX - r.left, r.width - 236)), y: Math.max(8, Math.min(clientY - r.top, r.height - 330)), part: partId, at: w });
    return true;
  };

  const selectNet = (net: number, additive: boolean) => {
    const ids = snapshot.wires.filter((w) => w.a.part && w.a.pin && netlist.netOf.get(pinKey(w.a.part, w.a.pin)) === net).map((w) => w.id);
    if (ids.length === 0) {
      select([], []);
      showToast('Esta conexión la hace la protoboard. Cámbiala en la vista Protoboard.');
      return;
    }
    select(additive ? selection : [], additive ? [...new Set([...wireSelection, ...ids])] : ids);
  };

  const onPartInput = useCallback(
    (part: PartData, key: string, value: number | boolean) => {
      if(engine.lab.paused)return;
      const persistent = PARTS[part.type].fields?.some((f) => f.key === key);
      if (persistent) project.setProp(part.id, key, value);
      else engine.setInput(part.id, key, value);
    },
    [project, engine],
  );

  const rotateSelection = () => {
    if (sch) project.rotateSchematic(selection, partsById);
    else project.rotateParts(selection);
  };

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
        const pos = sch ? sch.pinPos.get(key) : netlist.pinWorld.get(key);
        if (pos) out.push(pos);
      }
    });
    return out.slice(0, 400);
  }, [hoverPin, netlist, drag, sch]);

  // Pieza fantasma: la que se arrastra desde la biblioteca o la que se va a colocar con clic.
  const ghostType = libDrag?.over ? libDrag.type : placing;
  const ghostAt = libDrag?.over ? toWorldPt(libDrag.x, libDrag.y) : cursor;
  const ghostDef = ghostType ? (sch ? PARTS[SCH_PREFIX + ghostType] : PARTS[ghostType]) : null;
  const ghostPart = useMemo<PartData | null>(() => {
    if (!ghostDef || !ghostAt) return null;
    const b = ghostDef.bounds(ghostDef.defaults);
    const p:PartData={ id: 'ghost', type: ghostDef.type, x: snap(ghostAt.x - b.x - b.w / 2), y: snap(ghostAt.y - b.y - b.h / 2), rot: 0, props: ghostDef.defaults };
    return sch?p:{...p,...magneticPosition(p,{x:p.x,y:p.y},snapshot.parts,z).at};
  }, [ghostDef, ghostAt?.x, ghostAt?.y,snapshot,z,sch]);

  /** Orificios libres (de protoboards y cabezales) por posición, con su clave de pin. */
  const sockets = useMemo(() => {
    const out = new Map<string, string>();
    if (sch) return out;
    for (const p of scene.parts)
      for (const pin of PARTS[p.type].pins(p.props))
        if (pin.kind === 'socket') {
          const w = toWorld(p, pin);
          out.set(`${w.x},${w.y}`, pinKey(p.id, pin.id));
        }
    return out;
  }, [scene, sch]);

  // Dónde entrarían las patillas de lo que se mueve o se coloca, y qué tiras se conectan.
  const insertion = useMemo(() => {
    const legs: Vec[] = [];
    if (drag?.kind === 'parts' && drag.moved) {
      for (const id of drag.ids) {
        const p = partsById.get(id);
        if (!p) continue;
        for (const pin of PARTS[p.type].pins(p.props))
          if (pin.kind === 'leg') {
            const w = toWorld(p, pin);
            legs.push({ x: w.x + drag.dx, y: w.y + drag.dy });
          }
      }
    } else if (ghostPart && !sch) {
      for (const pin of PARTS[ghostPart.type].pins(ghostPart.props)) if (pin.kind === 'leg') legs.push(toWorld(ghostPart, pin));
    }
    const own = drag?.kind === 'parts' ? new Set(drag.ids) : new Set<string>();
    const marks: Vec[] = [];
    const nets = new Set<number>();
    for (const pos of legs) {
      const key = sockets.get(`${pos.x},${pos.y}`);
      if (!key || own.has(key.slice(0, key.indexOf(':')))) continue;
      marks.push(pos);
      const n = netlist.netOf.get(key);
      if (n !== undefined) nets.add(n);
    }
    const strips: Vec[] = [];
    if (nets.size)
      netlist.netOf.forEach((n, key) => {
        if (!nets.has(n)) return;
        const pos = netlist.pinWorld.get(key);
        if (pos && sockets.get(`${pos.x},${pos.y}`) === key) strips.push(pos);
      });
    return { marks, strips: strips.slice(0, 600), seated: marks.length > 0 };
  }, [drag, ghostPart, partsById, sockets, netlist, sch]);
  const blockedHoles=useMemo(()=>{
    if(sch)return [];
    if(ghostPart)return occupiedHoles(ghostPart,ghostPart,scene.parts);
    if(drag?.kind==='parts'&&drag.ids.length===1){const p=partsById.get(drag.ids[0]);if(p)return occupiedHoles(p,{x:p.x+drag.dx,y:p.y+drag.dy},scene.parts);}
    return [];
  },[sch,ghostPart,drag,scene.parts,partsById]);

  const peerSelections = useMemo(() => {
    const out: { id: string; color: string; name: string; key: string }[] = [];
    for (const peer of peers) for (const id of peer.selection ?? []) out.push({ id, color: peer.user.color, name: peer.user.name, key: `${id}-${peer.clientId}` });
    return out;
  }, [peers]);

  useEffect(() => {
    project.setPresence({ selection, view });
  }, [project, selection, view]);

  const draftEnd = cursor && draft ? snapPoint(cursor, draft, false) : null;
  // ── Corriente animada ──────────────────────────────────────────────────────
  // Cada cable lleva puntos que avanzan en el sentido convencional de la corriente, más
  // rápido cuanto más corriente, y de color según su tensión (azul 0 V → rojo la más alta).
  const showFlow = useUi((s) => s.showFlow);
  const setShowFlow = useUi((s) => s.setShowFlow);
  const flowOn = simRunning && showFlow && !sch;
  const flowPaths = useRef(new Map<string, SVGPathElement>());
  const flowEdges = useMemo(() => connectionEdges(snapshot, PARTS), [snapshot]);
  useEffect(() => {
    if (!flowOn) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const amps = new Map<string, number>();
    const offset = new Map<string, number>();
    let volts = new Map<string, number>();
    let last = performance.now();
    let measured = 0;
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - measured > 70) {
        measured = now;
        const fresh = wireCurrents(flowEdges, engine.pinCurrents());
        volts = new Map();
        for (const w of snapshot.wires) {
          const i = fresh.get(w.id) ?? 0;
          amps.set(w.id, (amps.get(w.id) ?? i) * 0.6 + i * 0.4); // suaviza el PWM
          if (w.a.part && w.a.pin) volts.set(w.id, engine.voltageAt(w.a.part, w.a.pin) ?? 0);
        }
      }
      let top = 1;
      volts.forEach((v) => (top = Math.max(top, Math.abs(v))));
      for (const [id, el] of flowPaths.current) {
        const i = amps.get(id) ?? 0;
        if (Math.abs(i) < 2e-5) {
          el.style.opacity = '0';
          continue;
        }
        const speed = Math.min(320, 60 * Math.sqrt(Math.abs(i) / 1e-3));
        const o = (offset.get(id) ?? 0) - Math.sign(i) * speed * (reduced ? 0 : dt);
        offset.set(id, o % 1000);
        el.style.opacity = '1';
        el.style.strokeDashoffset = String(o % 1000);
        const t = Math.min(1, Math.abs(volts.get(id) ?? 0) / top);
        el.style.stroke = `hsl(${Math.round(215 - 215 * t)} 100% ${Math.round(80 - 6 * t)}%)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flowOn, flowEdges, engine, snapshot]);

  const hoverVoltage = hoverPin && simRunning ? engine.voltageAt(hoverPin.part, hoverPin.pin) : null;
  const gridStep = z < 0.8 ? 50 : 10;
  const draggingIds = drag?.kind === 'parts' && drag.moved ? drag.ids : [];
  const hasSelection = selection.length + wireSelection.length > 0;

  return (
    <div className={`canvas-wrap ${libDrag?.over ? 'lib-target' : ''}`}>
      <svg
        ref={svgRef}
        className={`canvas ${sch ? 'schematic' : ''} ${space || tool === 'hand' || drag?.kind === 'pan' ? 'panning' : ''} ${draft ? 'wiring' : ''} ${hoverPin && !hoverWire ? 'on-pin' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          setHoverPin(null);setHoverWire(null);
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
          {sch && <SheetFrame sheet={sch.sheet} title={project.name} />}
          {sch && <NetLayer nets={sch.nets} selected={selectedNets} />}
          {scene.parts.map((p) => (
            <PartView key={p.id} part={p} offset={offsets.get(p.id)} onInput={onPartInput} live={simRunning} dragging={draggingIds.includes(p.id)} />
          ))}

          {hoverPart && !selection.includes(hoverPart) && !drag && !draft && partsById.get(hoverPart) && PARTS[partsById.get(hoverPart)!.type].category !== 'Protoboards' && (
            <SelRect part={partsById.get(hoverPart)!} offset={offsets.get(hoverPart)} z={z} tone="hover" />
          )}

          <g pointerEvents="none">
            {insertion.strips.map((m, i) => (
              <circle key={`s${i}`} cx={m.x} cy={m.y} r={2.6} fill="var(--green)" fillOpacity={0.22} />
            ))}
            {insertion.marks.map((m, i) => (
              <circle key={i} cx={m.x} cy={m.y} r={3.4} fill="var(--green)" fillOpacity={0.3} stroke="var(--green)" strokeWidth={1} className="insert-mark" />
            ))}
            {blockedHoles.map((p,i)=><circle key={`occupied-${i}`} cx={p.x} cy={p.y} r={4.5} fill="#ff453a" fillOpacity={.4} stroke="#ff7d75" strokeWidth={1.1}/>)}
          </g>

          {pending.length > 0 && (
            <g className="ratsnest" pointerEvents="none">
              {pending.map((r) => (
                <g key={r.id}>
                  <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke="var(--sch-wire)" strokeWidth={1.2 / Math.max(z, 0.6)} strokeDasharray={`${5 / Math.max(z, 0.6)} ${4 / Math.max(z, 0.6)}`} strokeLinecap="round" />
                  <circle cx={r.a.x} cy={r.a.y} r={2.2} fill="none" stroke="var(--sch-wire)" strokeWidth={1} />
                  <circle cx={r.b.x} cy={r.b.y} r={2.2} fill="none" stroke="var(--sch-wire)" strokeWidth={1} />
                </g>
              ))}
            </g>
          )}

          <g className="wires">
            {scene.wires.map((w) => (
              <WireView key={w.id} wire={w} points={livePoints(w)} z={z} selected={wireSelection.includes(w.id)} hovered={hoverWire === w.id && !drag} editing={drag?.kind === 'bend' && drag.wire === w.id ? drag.index : null} />
            ))}
          </g>

          {flowOn && (
            <g className="flow" pointerEvents="none">
              {scene.wires
                .filter((w) => !w.sch)
                .map((w) => (
                  <path
                    key={w.id}
                    ref={(el) => {
                      if (el) flowPaths.current.set(w.id, el);
                      else flowPaths.current.delete(w.id);
                    }}
                    d={roundedPath(livePoints(w))}
                  />
                ))}
            </g>
          )}

          {draft && draftEnd && sch && (
            <path
              d={roundedPath([{ x: draft.from.x, y: draft.from.y }, ...draft.points, hoverPin ? hoverPin.pos : draftEnd], 0)}
              stroke="var(--sch-wire)"
              strokeWidth={1.4}
              strokeDasharray="4 3"
              className="marching"
              fill="none"
              pointerEvents="none"
            />
          )}
          <CircuitOverlays snapshot={snapshot} netlist={netlist} schematicPins={sch?.pinPos}/>
          {connection&&<g className="connection-confirm" pointerEvents="none">{[connection.a,connection.b].map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={5/z} fill="none" stroke="var(--lab-mint)" strokeWidth={1.5/z}/>)}</g>}
          {draft && draftEnd && !sch && (
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

          {ghostPart && ghostDef && (
            <g
              transform={`translate(${ghostPart.x} ${ghostPart.y})`}
              className={`ghost ${insertion.seated ? 'seated' : ''}`}
              pointerEvents="none"
            >
              <ghostDef.Render part={ghostPart} visual={null} preview />
            </g>
          )}

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
        peer.cursor && (peer.view ?? 'board') === view ? (
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

      {!hoverPin && hoverPart && cursor && simRunning && !drag && damageOf(hoverPart) && (
        <DamageTip damage={damageOf(hoverPart)!} left={cursor.x * z + viewport.x + 16} top={cursor.y * z + viewport.y + 18} />
      )}

      {hoverPin && cursor && (!drag || drag.kind === 'end') && (
        <div className="pin-tip" role="tooltip" style={{ left: Math.max(8, Math.min(hoverPin.pos.x * z + viewport.x + 14, (svgRef.current?.clientWidth ?? 320) - 288)), top: Math.max(8, Math.min(hoverPin.pos.y * z + viewport.y + 16, (svgRef.current?.clientHeight ?? 200) - 100)) }}>
          <strong style={{ fontWeight: 500 }}>{hoverPin.label}</strong>
          {hoverPin.desc && <span className="pin-desc">{hoverPin.desc}</span>}
          {hoverVoltage !== null && <span className="mono v">{formatSI(hoverVoltage, 'V')}</span>}
          <span className="pin-probe">Alt + clic para observar esta señal</span>
        </div>
      )}

      <div className="float toolbar-float" role="toolbar" aria-label="Herramientas">
        <button className={`icon-btn ${tool === 'select' ? 'on' : ''}`} onClick={() => setTool('select')} aria-label="Seleccionar" title="Seleccionar · V">
          <MousePointer2 size={15} />
        </button>
        <button className={`icon-btn ${tool === 'hand' ? 'on' : ''}`} onClick={() => setTool('hand')} aria-label="Mover la vista" title="Mano · H o Espacio">
          <Hand size={15} />
        </button>
        {simRunning && !sch && (
          <button
            className={`icon-btn ${showFlow ? 'on' : ''}`}
            onClick={() => setShowFlow(!showFlow)}
            aria-pressed={showFlow}
            aria-label="Ver la corriente en los cables"
            title={showFlow ? 'Ocultar la corriente' : 'Ver la corriente en los cables'}
          >
            <Zap size={15} />
          </button>
        )}
        {hasSelection && (
          <>
            <span className="sep" />
            {selection.length > 0 && (
              <>
                <button className="icon-btn" onClick={() => rotateSelection()} aria-label="Rotar" title="Rotar · R">
                  <RotateCw size={15} />
                </button>
                <button className="icon-btn" onClick={() => select(project.duplicate(selection, 20, 20), [])} aria-label="Duplicar" title="Duplicar · Ctrl D">
                  <Copy size={15} />
                </button>
              </>
            )}
            {!sch && selection.length === 0 && wireSelection.length > 0 && !wireSelection.every((id) => wiresById.get(id)?.sch) && (
              <span className="wire-colors" role="group" aria-label="Color del cable">
                {WIRE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className="dot"
                    style={{ background: c.value }}
                    aria-label={c.label}
                    title={c.label}
                    aria-pressed={wireSelection.every((id) => wiresById.get(id)?.color === c.value)}
                    onClick={() => {
                      lastWireColor = c.value;
                      wireSelection.forEach((id) => project.updateWire(id, { color: c.value }));
                    }}
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

      <div className="float view-float" role="tablist" aria-label="Vista">
        <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
          <CircuitBoard size={14} /> Protoboard
        </button>
        <button role="tab" aria-selected={view === 'schematic'} className={view === 'schematic' ? 'on' : ''} onClick={() => setView('schematic')}>
          <Workflow size={14} /> Esquema
        </button>
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
      <ProbeReadout/>
      <FrameMeter/>

      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} role="menu">
          {menu.part && (
            <>
              {sch && <button role="menuitem" onClick={() => {
                const r = svgRef.current!.getBoundingClientRect();
                openPicker(menu.part!, toWorldPt(r.left + menu.x, r.top + menu.y), r.left + menu.x, r.top + menu.y);
                setMenu(null);
              }}><Spline size={14} /> Conectar pin</button>}
              <button role="menuitem" onClick={() => (rotateSelection(), setMenu(null))}>
                <RotateCw size={14} /> Rotar <kbd>R</kbd>
              </button>
              <button role="menuitem" onClick={() => (select(project.duplicate(selection, 20, 20), []), setMenu(null))}>
                <Copy size={14} /> Duplicar <kbd>Ctrl D</kbd>
              </button>
              {PARTS[partsById.get(menu.part)?.type ?? '']?.mcu && (
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

      {picker && <PinPicker picker={picker} part={snapshot.parts.find((p) => p.id === picker.part)} exclude={draft?.from ?? {}} netlist={netlist} onPick={(pin) => {
        const pos = sch?.pinPos.get(pinKey(picker.part, pin.id)) ?? picker.at;
        if (draft) finishWire({ part: picker.part, pin: pin.id, pos, label: pin.label ?? pin.id });
        else {
          setDraft({ from: { part: picker.part, pin: pin.id, ...pos }, label: pin.label ?? pin.id, points: [], color: nextWireColor(pin.id) });
          setPicker(null);
        }
      }} onClose={() => setPicker(null)} />}

      {!placing && !draft && pending.length > 0 && (
        <button className="float hint-float pending-hint" onClick={() => setView('schematic')} title="Ver en el esquema">
          <Spline size={15} />
          <span>
            {pending.length === 1 ? 'Una conexión del esquema sin cablear' : `${pending.length} conexiones del esquema sin cablear`}
          </span>
        </button>
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
            {sch ? 'Conexión' : 'Cable'} desde <strong>{draft.label}</strong>
          </span>
          <span className="keys">
            {sch ? 'suelta en un pin o en una placa' : <>clic dobla <kbd>⇧</kbd> recto</>} <kbd>Esc</kbd>
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

  // Daños: una vez roto, sigue roto hasta que se detiene la simulación.
  const damage = live ? trackDamage(part.id, assessDamage(part.type, part.props, visual)).damage : null;
  const isBroken = damage?.level === 'broken';
  const showToast = useUi((s) => s.showToast);
  useEffect(() => {
    if (!live) clearDamage(part.id);
  }, [live, part.id]);
  useEffect(() => {
    if (isBroken && damage) showToast(`${def.name}: ${damage.title.toLowerCase()}. ${damage.reason}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroken]);
  const box = damage ? partBounds({ ...part, x, y }) : null;

  return (
    <>
      <g
        data-part={part.id}
        className={`part ${dragging ? 'lift dragging' : ''}`}
        style={{ transform: `translate(${x}px, ${y}px) rotate(${shown.current}deg)`, transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)' }}
      >
        <g className={`part-body ${isBroken ? `damaged ${damage!.effect}` : ''}`}>
          <def.Render part={part} visual={live ? visual : null} onInput={handle} />
        </g>
      </g>
      {damage && box && <DamageMark damage={damage} x={box.x + box.w / 2} y={box.y} />}
    </>
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

// ── Redes en el esquema ──────────────────────────────────────────────────────
const NetLayer = memo(function NetLayer({ nets, selected }: { nets: SchNet[]; selected: Set<number> }) {
  return (
    <g>
      {nets.map((net) => (
        <g key={net.id} className={`sch-net ${selected.has(net.id) ? 'on' : ''}`} data-net={net.id}>
          {net.kind === 'wire' ? (
            <>
              {net.segments.map((seg, i) => {
                const d = seg.map((p, j) => `${j ? 'L' : 'M'}${p.x} ${p.y}`).join('');
                return (
                  <g key={i}>
                    <path d={d} className="hit" stroke="transparent" strokeWidth={8} fill="none" pointerEvents="stroke" />
                    <path d={d} className="seg" stroke="var(--sch-wire)" strokeWidth={1.4} fill="none" strokeLinejoin="round" pointerEvents="none" />
                  </g>
                );
              })}
              {(net.dots ?? junctions(net.segments)).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.1} className="dot" fill="var(--sch-wire)" pointerEvents="none" />
              ))}
            </>
          ) : (
            net.pins.map((p, i) => <RailGlyph key={i} at={p} dir={net.dirs[i]} kind={net.kind} label={net.label} />)
          )}
        </g>
      ))}
      {/* Las etiquetas, encima de todos los cables. */}
      {nets.map(
        (net) =>
          net.flags && (
            <g key={`flags${net.id}`} className={`sch-net ${selected.has(net.id) ? 'on' : ''}`} data-net={net.id}>
              {net.flags.map((f, i) => (
                <NetFlag key={i} flag={f} />
              ))}
            </g>
          ),
      )}
    </g>
  );
});

/**
 * Etiqueta de red: una banderola con el nombre en la punta del pin. Dos banderolas con el mismo
 * nombre están unidas, como en cualquier programa de esquemas.
 */
function NetFlag({ flag }: { flag: SchFlag }) {
  const w = flagWidth(flag.text) - 4;
  const h = 9;
  const right = flag.dir.x >= 0;
  const { x, y } = flag.at;
  // Punta hacia el pin y caja hacia fuera.
  const d = right
    ? `M${x} ${y} l4 ${-h / 2} h${w} v${h} h${-w} z`
    : `M${x} ${y} l-4 ${-h / 2} h${-w} v${h} h${w} z`;
  return (
    <g className="net-flag" pointerEvents="none">
      <path d={d} fill="var(--sch-flag-fill)" stroke="var(--sch-wire)" strokeWidth={0.8} strokeLinejoin="round" className="seg" />
      <text x={right ? x + 4 + w / 2 : x - 4 - w / 2} y={y + 2} textAnchor="middle" fontSize={5.6} fontWeight={600} fill="var(--sch-flag-ink)" fontFamily="Geist, sans-serif">
        {flag.text}
      </text>
    </g>
  );
}

/** Marco de la hoja con zonas y cajetín, como un plano. */
const SheetFrame = memo(function SheetFrame({ sheet, title }: { sheet: { x: number; y: number; w: number; h: number }; title: string }) {
  const { x, y, w, h } = sheet;
  const m = 10;
  const zoneW = 200;
  const cols = Math.max(1, Math.round(w / zoneW));
  const rows = Math.max(1, Math.round(h / zoneW));
  const tbW = 230;
  const tbH = 58;
  const tx = x + w - m - tbW;
  const ty = y + h - m - tbH;
  const date = new Date().toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  const mono = { fontFamily: 'Geist, sans-serif' };
  return (
    <g className="sheet" pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="var(--sch-paper)" stroke="var(--sch-frame)" strokeWidth={1} rx={2} />
      <rect x={x + m} y={y + m} width={w - 2 * m} height={h - 2 * m} fill="none" stroke="var(--sch-frame)" strokeWidth={0.6} />
      {Array.from({ length: cols }, (_, i) => (
        <g key={`c${i}`} fill="var(--sch-frame-ink)" fontSize={5} textAnchor="middle" {...mono}>
          {i > 0 && <path d={`M${x + (w / cols) * i} ${y} v${m} M${x + (w / cols) * i} ${y + h - m} v${m}`} stroke="var(--sch-frame)" strokeWidth={0.6} />}
          <text x={x + (w / cols) * (i + 0.5)} y={y + 7}>{i + 1}</text>
          <text x={x + (w / cols) * (i + 0.5)} y={y + h - 3}>{i + 1}</text>
        </g>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <g key={`r${i}`} fill="var(--sch-frame-ink)" fontSize={5} textAnchor="middle" {...mono}>
          {i > 0 && <path d={`M${x} ${y + (h / rows) * i} h${m} M${x + w - m} ${y + (h / rows) * i} h${m}`} stroke="var(--sch-frame)" strokeWidth={0.6} />}
          <text x={x + 5} y={y + (h / rows) * (i + 0.5) + 2}>{String.fromCharCode(65 + i)}</text>
          <text x={x + w - 5} y={y + (h / rows) * (i + 0.5) + 2}>{String.fromCharCode(65 + i)}</text>
        </g>
      ))}
      <g {...mono}>
        <rect x={tx} y={ty} width={tbW} height={tbH} fill="var(--sch-paper)" stroke="var(--sch-frame)" strokeWidth={0.8} />
        <path d={`M${tx} ${ty + 24} h${tbW} M${tx} ${ty + 41} h${tbW} M${tx + 120} ${ty + 24} v17 M${tx + 165} ${ty + 24} v17`} stroke="var(--sch-frame)" strokeWidth={0.6} />
        <text x={tx + 8} y={ty + 9} fontSize={4.6} fill="var(--sch-frame-ink)">TÍTULO</text>
        <text x={tx + 8} y={ty + 19} fontSize={8.5} fontWeight={600} fill="var(--sch-ink)">{title.length > 40 ? title.slice(0, 39) + '…' : title}</text>
        <text x={tx + 8} y={ty + 30} fontSize={4.6} fill="var(--sch-frame-ink)">DOCUMENTO</text>
        <text x={tx + 8} y={ty + 37.5} fontSize={6} fill="var(--sch-ink)">Esquema eléctrico</text>
        <text x={tx + 126} y={ty + 30} fontSize={4.6} fill="var(--sch-frame-ink)">HOJA</text>
        <text x={tx + 126} y={ty + 37.5} fontSize={6} fill="var(--sch-ink)">1 de 1</text>
        <text x={tx + 171} y={ty + 30} fontSize={4.6} fill="var(--sch-frame-ink)">FECHA</text>
        <text x={tx + 171} y={ty + 37.5} fontSize={6} fill="var(--sch-ink)">{date}</text>
        <text x={tx + 8} y={ty + 51.5} fontSize={4.8} fill="var(--sch-frame-ink)">Alimentación de los CI implícita: VCC/VDD a +V, GND/VSS a masa.</text>
      </g>
    </g>
  );
});

/** Tierra o alimentación: un tramo corto que sale del pin y el símbolo, siempre en vertical. */
function RailGlyph({ at, dir, kind, label }: { at: Vec; dir: Vec; kind: SchNet['kind']; label?: string }) {
  const color = kind === 'ground' ? 'var(--sch-ink)' : 'var(--sch-supply)';
  if (dir.x !== 0) {
    // Pin lateral: el símbolo va tumbado y compacto, cabe en la separación entre patillas.
    const s = Math.sign(dir.x);
    const end = { x: at.x + s * 8, y: at.y };
    return (
      <g stroke={color} strokeWidth={1.1} strokeLinecap="round" fill="none" className="seg-group">
        <rect x={Math.min(at.x, end.x + s * 26) - 2} y={at.y - 5} width={30} height={10} fill="transparent" stroke="none" pointerEvents="all" />
        <path d={`M${at.x} ${at.y} H${end.x}`} />
        {kind === 'ground' ? (
          <path d={`M${end.x} ${at.y - 4} v8 M${end.x + s * 2.4} ${at.y - 2.6} v5.2 M${end.x + s * 4.8} ${at.y - 1.2} v2.4`} />
        ) : (
          <>
            <path d={`M${end.x} ${at.y - 3.5} v7`} strokeWidth={1.4} />
            <text x={end.x + s * 3} y={at.y + 2} textAnchor={s > 0 ? 'start' : 'end'} fontSize={5.4} fontWeight={600} fill={color} stroke="none" fontFamily="Geist, sans-serif">
              {label}
            </text>
          </>
        )}
      </g>
    );
  }
  const end = { x: at.x + dir.x * 10, y: at.y + dir.y * 10 };
  // Tierra hacia abajo salvo que el pin salga hacia arriba; alimentación al revés.
  const down = kind === 'ground' ? dir.y >= 0 : dir.y > 0;
  const s = down ? 1 : -1;
  return (
    <g stroke={color} strokeWidth={1.3} strokeLinecap="round" fill="none" className="seg-group">
      <rect x={Math.min(at.x, end.x) - 8} y={Math.min(at.y, end.y + 16 * s) - 4} width={Math.abs(end.x - at.x) + 16} height={Math.abs(end.y + 16 * s - at.y) + 8} fill="transparent" stroke="none" pointerEvents="all" />
      <path d={`M${at.x} ${at.y} L${end.x} ${end.y} v${6 * s}`} />
      {kind === 'ground' ? (
        <path d={`M${end.x - 7} ${end.y + 6 * s} h14 M${end.x - 4.5} ${end.y + 9.5 * s} h9 M${end.x - 2} ${end.y + 13 * s} h4`} />
      ) : (
        <>
          <path d={`M${end.x - 6} ${end.y + 6 * s} h12`} />
          <text x={end.x} y={end.y + (down ? 15 : -9)} textAnchor="middle" fontSize={6.5} fontWeight={600} fill={color} stroke="none" fontFamily="Geist, sans-serif">
            {label}
          </text>
        </>
      )}
    </g>
  );
}

/** Puntos donde se encuentran tres o más tramos: ahí va el punto de unión. */
function junctions(segments: Vec[][]): Vec[] {
  const count = new Map<string, { p: Vec; n: number }>();
  for (const seg of segments)
    for (const p of [seg[0], seg[seg.length - 1]]) {
      const k = `${p.x},${p.y}`;
      const c = count.get(k);
      if (c) c.n++;
      else count.set(k, { p, n: 1 });
    }
  return [...count.values()].filter((c) => c.n >= 3).map((c) => c.p);
}

/** Lista de pines de una pieza para cerrar una conexión del esquema, con búsqueda. */
function PinPicker({
  picker,
  part,
  exclude,
  netlist,
  onPick,
  onClose,
}: {
  picker: { x: number; y: number; part: string };
  part: PartData | undefined;
  exclude: { part?: string; pin?: string };
  netlist: Netlist;
  onPick: (pin: PinDef) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, query]);
  const def = part ? PARTS[part.type] : null;
  const pins = useMemo(() => {
    if (!def || !part) return [];
    const q = query.trim().toLowerCase();
    return def
      .pins(part.props)
      .filter((p) => !(exclude.part === part.id && exclude.pin === p.id))
      .filter((p) => !q || `${p.id} ${p.label ?? ''} ${p.desc ?? ''}`.toLowerCase().includes(q));
  }, [def, part, query, exclude]);
  if (!def || !part) return null;

  const used = (pin: PinDef) => {
    const n = netlist.netOf.get(pinKey(part.id, pin.id));
    if (n === undefined) return false;
    for (const [key, m] of netlist.netOf) if (m === n && !key.startsWith(`${part.id}:`)) return true;
    return false;
  };

  return (
    <div className="menu pin-picker" style={{ left: picker.x, top: picker.y }} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label={`Pin de ${def.name}`}>
      <div className="pin-picker-head">{def.name}</div>
      <input
        autoFocus
        role="combobox"
        aria-label="Buscar pin"
        aria-expanded="true"
        aria-controls="pin-picker-results"
        aria-activedescendant={pins[active] ? `pin-option-${pins[active].id}` : undefined}
        className="pin-picker-search"
        placeholder="Buscar pin"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.max(0, Math.min(i + 1, pins.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && pins[active]) onPick(pins[active]);
        }}
      />
      <div className="pin-picker-list" id="pin-picker-results" ref={listRef} role="listbox" aria-label="Pines">
        {pins.map((pin, i) => (
          <button key={pin.id} id={`pin-option-${pin.id}`} role="option" aria-selected={i === active} title={pin.desc} className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => onPick(pin)}>
            <span>{pin.label ?? pin.id}</span>
            {used(pin) && <span className="pin-used">en uso</span>}
          </button>
        ))}
        {pins.length === 0 && <p className="pin-picker-empty">Ningún pin se llama así</p>}
      </div>
    </div>
  );
}

/** Explosión con humo si el componente se ha roto; aviso ámbar si va fuera de lo recomendado. */
function DamageMark({ damage, x, y }: { damage: Damage; x: number; y: number }) {
  if (damage.level === 'warn')
    return (
      <g className="damage-mark warn" transform={`translate(${x} ${y - 2})`} pointerEvents="none">
        <circle r={7} className="damage-pulse" />
        <circle r={5.4} fill="#f5b83d" stroke="#3a2a06" strokeWidth={0.8} />
        <text y={2.6} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#3a2a06" fontFamily="Geist, sans-serif">
          !
        </text>
      </g>
    );
  const spikes = 12;
  const star = (outer: number, inner: number) =>
    Array.from({ length: spikes * 2 }, (_, i) => {
      const r = i % 2 ? inner : outer * (i % 4 === 0 ? 1 : 0.82);
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    }).join(' ');
  return (
    <g className={`damage-mark broken ${damage.effect}`} transform={`translate(${x} ${y + 4})`} pointerEvents="none">
      <g className="smoke">
        <circle cx={-3} cy={-6} r={4} />
        <circle cx={3} cy={-8} r={5} />
        <circle cx={0} cy={-10} r={4.5} />
      </g>
      <g className="blast">
        <polygon points={star(13, 6)} fill="#ff7a1a" stroke="#5a1d00" strokeWidth={0.8} strokeLinejoin="round" />
        <polygon points={star(8.5, 4)} fill="#ffd23d" />
        <circle r={2.6} fill="#fff6cf" />
      </g>
    </g>
  );
}

function DamageTip({ damage, left, top }: { damage: Damage; left: number; top: number }) {
  return (
    <div className={`damage-tip ${damage.level}`} role="tooltip" style={{ left, top }}>
      <strong>{damage.title}</strong>
      <span>{damage.reason}</span>
      {damage.fix && <span className="fix">{damage.fix}</span>}
    </div>
  );
}
