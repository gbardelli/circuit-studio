import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Cable, CircuitBoard, Focus, Hand, Moon, Move, Rotate3d, Sun, View, ZoomIn, type LucideIcon } from 'lucide-react';
import { Loading3D } from '../Loading3D';
import { buildNetlist, pinKey } from '../../core/netlist';
import { toLocal, type PartData } from '../../core/types';
import { PartProxy } from './interact';
import { PARTS } from '../../parts';
import { useDisplaySnapshot, useEditor } from '../context';
import { useUi } from '../store';
import { view3dClock } from '../view3d';
import type { Theme3D } from './materials';
import { Viewer3D, webglAvailable, type Preset, type Stats } from './viewer';
import './board3d.css';

const THEME_KEY = 'cs-3d-theme';
const readTheme = (): Theme3D => {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const PRESETS: { id: Preset; label: string; key: string }[] = [
  { id: 'top', label: 'Cenital', key: '1' },
  { id: 'iso', label: 'Isométrica', key: '2' },
  { id: 'free', label: 'Libre', key: '3' },
];

interface Gesture {
  icon: LucideIcon;
  action: string;
  keys: string[];
  /** Alternativa con otra combinación (p. ej. ⇧ + arrastrar para girar). */
  alt?: string[];
}

const MOUSE: Gesture[] = [
  { icon: Move, action: 'Mover', keys: ['Arrastrar'] },
  { icon: Rotate3d, action: 'Girar', keys: ['Clic derecho'], alt: ['⇧', 'Arrastrar'] },
  { icon: ZoomIn, action: 'Zoom', keys: ['Rueda'] },
  { icon: Focus, action: 'Acercar', keys: ['Doble clic'] },
  { icon: View, action: 'Vistas', keys: ['1', '2', '3'] },
];
const TOUCH: Gesture[] = [
  { icon: Hand, action: 'Mover', keys: ['1 dedo'] },
  { icon: Rotate3d, action: 'Girar e inclinar', keys: ['2 dedos'] },
  { icon: ZoomIn, action: 'Zoom', keys: ['Pellizcar'] },
  { icon: Focus, action: 'Acercar', keys: ['Doble toque'] },
];

/** Leyenda de gestos: icono, acción y teclas en chips, como en las herramientas de CAD. */
function Legend({ dim }: { dim: boolean }) {
  const [touch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const items = touch ? TOUCH : MOUSE;
  return (
    <div className={`board3d-legend ${dim ? 'dim' : ''}`} role="note" aria-label="Controles de la vista 3D">
      {items.map(({ icon: Icon, action, keys, alt }) => (
        <div key={action} className="legend-item" title={`${action}: ${keys.join(" ")}${alt ? ` o ${alt.join(" + ")}` : ""}`}>
          <Icon size={13} strokeWidth={1.75} aria-hidden />
          <span className="legend-action">{action}</span>
          <span className="legend-keys">
            {keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            {alt && (
              <>
                <span className="legend-or">o</span>
                {alt.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Vista 3D de la protoboard: mismo documento, misma selección; el lienzo 2D sigue montado debajo. */
export default function Board3D() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const snapshot = useDisplaySnapshot();
  const { engine, project } = useEditor();
  const scene = useMemo(() => (snapshot.wires.some((w) => w.sch) ? { ...snapshot, wires: snapshot.wires.filter((w) => !w.sch) } : snapshot), [snapshot]);
  const simRunning = useUi((s) => s.simRunning);
  const live = useRef({ simRunning, scene });
  live.current = { simRunning, scene };
  const [supported] = useState(webglAvailable);
  const [theme, setTheme] = useState<Theme3D>(readTheme);
  const [preset, setPreset] = useState<Preset>('iso');
  const [leaving, setLeaving] = useState(false);
  const perfVisible = useUi((s) => s.performanceVisible);
  const [stats, setStats] = useState<Stats | null>(null);
  const lastStats = useRef(0);
  const [hover, setHover] = useState<{ part?: string; wire?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const selection = useUi((s) => s.selection);
  const wireSelection = useUi((s) => s.wireSelection);
  const assemblyWire = useUi((s) => s.assemblyWire);
  const pinnedSignal = useUi((s) => s.pinnedSignal);
  const netlist = useMemo(() => buildNetlist(scene, PARTS), [scene]);
  const [vw, setVw] = useState<Viewer3D | null>(null);
  const [ready, setReady] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setLoaderGone(true), 260);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (!supported || !host.current) return;
    // Primero se pinta el aviso de carga; el visor se construye en el fotograma siguiente.
    let cancelled = false;
    let created: { v: Viewer3D; proxy: PartProxy } | null = null;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (cancelled || !host.current) return;
        created = build(host.current);
      });
    });
    const build = (el: HTMLDivElement) => {
    const proxy = new PartProxy();
    const v: Viewer3D = new Viewer3D(
      el,
      {
        onPick(hit, additive) {
          const ui = useUi.getState();
          if (!hit) return ui.select([], []);
          if (hit.part) ui.select(additive ? [...new Set([...ui.selection, hit.part])] : [hit.part], additive ? ui.wireSelection : []);
          else if (hit.wire) ui.select(additive ? ui.selection : [], additive ? [...new Set([...ui.wireSelection, hit.wire])] : [hit.wire]);
        },
        onPartPointerDown(partId, point, e): boolean {
          const part = live.current.scene.parts.find((p) => p.id === partId);
          const def = part && PARTS[part.type];
          if (!part || !def || project.readOnly && !def.fields) return false;
          // Mismo enrutado que el lienzo 2D: un ajuste guardado o una entrada de la simulación.
          const onInput = (key: string, value: number | boolean) => {
            if (engine.lab.paused) return;
            const persistent = def.fields?.some((f) => f.key === key);
            if (persistent && project.readOnly) project.setSimulationProp(part.id, key, value);
            else if (persistent) project.setProp(part.id, key, value);
            else engine.setInput(part.id, key, value);
            viewer.current?.setInputOverride(part.id, key, value);
          };
          const visual = live.current.simRunning ? engine.getVisual(part.id) : null;
          const local = toLocal(part as PartData, { x: point.x, y: point.z });
          return proxy.press(def, part, visual, onInput, local, v.pixelsPerUnit(point), e);
        },
        onHover(hit) {
          if (host.current) host.current.style.cursor = hit ? 'pointer' : '';
          setHover((prev) => (prev?.part === hit?.part && prev?.wire === hit?.wire ? prev : hit));
        },
        onStats(s) {
          if (s.firstFrame) setReady(true);
          const now = performance.now();
          if (now - lastStats.current > 400) {
            lastStats.current = now;
            setStats({ ...s });
          }
        },
      },
      view3dClock.clickedAt || performance.now(),
    );
    viewer.current = v;
    v.setTheme(theme);
    v.setCircuit(live.current.scene);
    v.enter(useUi.getState().viewport);
    (window as unknown as { __cs3d?: Viewer3D }).__cs3d = v;
    setVw(v);
    return { v, proxy };
    };
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (created) {
        created.v.dispose();
        created.proxy.dispose();
      }
      viewer.current = null;
      setVw(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => {
    const v = vw;
    if (!v) return;
    v.setCircuit(scene);
    // LED y segmentos siguen a la simulación: cada pieza escucha solo su propio estado.
    const offs = v.livePartIds().map((id) => {
      v.setVisual(id, engine.getVisual(id));
      return engine.subscribePart(id, () => viewer.current?.setVisual(id, engine.getVisual(id)));
    });
    return () => offs.forEach((off) => off());
  }, [scene, engine, vw]);

  useEffect(() => {
    vw?.setTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* preferencia opcional */
    }
  }, [theme, vw]);

  // Red que se comprueba: la del cable que guía el montaje, la del cable seleccionado o la de la señal fijada.
  const net = useMemo(() => {
    if (!checking) return null;
    const wireId = assemblyWire ?? (wireSelection.length === 1 ? wireSelection[0] : null);
    let key: string | null = null;
    if (wireId) {
      const w = scene.wires.find((q) => q.id === wireId);
      if (w?.a.part && w.a.pin) key = pinKey(w.a.part, w.a.pin);
      else if (w?.b.part && w.b.pin) key = pinKey(w.b.part, w.b.pin);
    } else if (pinnedSignal) key = pinnedSignal;
    const n = key != null ? netlist.netOf.get(key) : undefined;
    if (n === undefined) return null;
    const pins = new Set<string>();
    for (const [k, v] of netlist.netOf) if (v === n) pins.add(k);
    const wires = new Set(scene.wires.filter((w) => (w.a.part && w.a.pin && pins.has(pinKey(w.a.part, w.a.pin))) || (w.b.part && w.b.pin && pins.has(pinKey(w.b.part, w.b.pin)))).map((w) => w.id));
    return { pins, wires };
  }, [checking, assemblyWire, wireSelection, pinnedSignal, scene, netlist]);

  useEffect(() => {
    viewer.current?.setFocus({
      parts: selection,
      wires: assemblyWire ? [...new Set([...wireSelection, assemblyWire])] : wireSelection,
      hoverPart: hover?.part ?? null,
      hoverWire: hover?.wire ?? null,
      net,
    });
  }, [selection, wireSelection, assemblyWire, hover, net, scene, vw]);

  // La guía de montaje y el panel de conexiones llevan la cámara al cable en curso.
  useEffect(() => {
    const v = viewer.current;
    const w = assemblyWire ? scene.wires.find((q) => q.id === assemblyWire) : null;
    const ids = [w?.a.part, w?.b.part].filter((x): x is string => Boolean(x) && !String(scene.parts.find((p) => p.id === x)?.type).startsWith('breadboard-'));
    if (v && ids.length) v.frameParts(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assemblyWire]);

  const leave = () => {
    const v = viewer.current;
    if (!v) return useUi.getState().setBoard3d(false);
    setLeaving(true);
    v.exit(() => {
      useUi.getState().setViewport(v.toViewport());
      useUi.getState().setBoard3d(false);
    });
  };

  const go = (p: Preset) => {
    setPreset(p);
    viewer.current?.preset(p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = PRESETS.find((q) => q.key === e.key);
      if (p) {
        e.preventDefault();
        go(p.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`board3d ${theme} ${leaving ? 'leaving' : ''}`}>
      <div ref={host} className="board3d-host" aria-label="Montaje en 3D" role="img" onPointerDownCapture={() => setTouched(true)} />
      {!supported && (
        <div className="board3d-fallback" role="alert">
          <Box size={28} />
          <strong>Este navegador no puede mostrar 3D</strong>
          <span>WebGL no está disponible. El montaje sigue completo en la vista 2D.</span>
          <button className="btn" onClick={() => useUi.getState().setBoard3d(false)}>Volver a 2D</button>
        </div>
      )}
      <div className="float view-float board3d-bar" role="toolbar" aria-label="Vista 3D">
        <button onClick={leave} title="Volver a la protoboard 2D">
          <CircuitBoard size={14} /> 2D
        </button>
        <button className="on" aria-pressed>
          <Box size={14} /> 3D
        </button>
        <span className="sep" aria-hidden />
        {PRESETS.map((p) => (
          <button key={p.id} className={preset === p.id ? 'on' : ''} aria-pressed={preset === p.id} onClick={() => go(p.id)} title={`${p.label} · ${p.key}`}>
            {p.label} <kbd>{p.key}</kbd>
          </button>
        ))}
        <span className="sep" aria-hidden />
        <button
          className={checking ? 'on' : ''}
          aria-pressed={checking}
          onClick={() => setChecking(!checking)}
          title="Comprobar cable: al seleccionar un cable se resalta su red completa (todos los huecos) y se atenúa el resto"
        >
          <Cable size={14} /> Comprobar
        </button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Escena clara' : 'Escena oscura'} title={theme === 'dark' ? 'Escena clara' : 'Escena oscura'}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
      {supported && !loaderGone && <Loading3D step="scene" leaving={ready} />}
      <Legend dim={touched} />
      {perfVisible && stats && (
        <div className="board3d-stats" role="status">
          <span>1.er fotograma {Math.round(stats.firstFrame)} ms</span>
          <span>escena {stats.build.toFixed(0)} ms</span>
          <span>{stats.calls} llamadas</span>
          <span>{(stats.triangles / 1000).toFixed(0)} k triángulos</span>
          <span>render {stats.frameMs.toFixed(1)} ms</span>
        </div>
      )}
    </div>
  );
}
