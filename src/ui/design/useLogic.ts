// Hojas del documento y su simulación en vivo para el lienzo del modo diseño.
import { useCallback, useEffect, useMemo, useReducer, useSyncExternalStore } from 'react';
import { LogicSim, icDependencies } from '../../logic/sim';
import { MAIN_SHEET, type LogicSheet } from '../../logic/types';
import { useEditor } from '../context';
import { useDesignUi } from './store';

const EMPTY: LogicSheet = { id: MAIN_SHEET, kind: 'main', name: 'Principal', part: '', description: '', order: [], package: 0, nodes: [], wires: [] };

export function useSheets() {
  const { project } = useEditor();
  return useSyncExternalStore(
    useCallback((fn) => project.subscribe(fn), [project]),
    () => project.design.sheets(),
  );
}

/** La hoja abierta (la principal existe aunque aún no se haya guardado nada). */
export function useSheet(id: string) {
  const sheets = useSheets();
  return useMemo(() => {
    const sheet = sheets.find((s) => s.id === id);
    return sheet ?? (id === MAIN_SHEET ? EMPTY : sheets.find((s) => s.id === MAIN_SHEET) ?? EMPTY);
  }, [sheets, id]);
}

export function useLookup() {
  const sheets = useSheets();
  return useMemo(() => {
    const map = new Map(sheets.map((s) => [s.id, s]));
    return (id: string) => map.get(id);
  }, [sheets]);
}

/**
 * Simulación de la hoja: se reconstruye si cambia su estructura (o la de un integrado que use),
 * no al pulsar una entrada, para que los biestables conserven su estado.
 */
export function useLogicSim(sheet: LogicSheet) {
  const lookup = useLookup();
  const epoch = useDesignUi((s) => s.epoch);
  const running = useDesignUi((s) => s.running);
  const speed = useDesignUi((s) => s.speed);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const structure = useMemo(() => {
    const strip = (s: LogicSheet) => ({ ...s, name: '', description: '', nodes: s.nodes.map((n) => (n.kind === 'in' ? { ...n, x: 0, y: 0, props: { ...n.props, value: 0 } } : { ...n, x: 0, y: 0 })) });
    const used = [...icDependencies(sheet.id, (id) => (id === sheet.id ? sheet : lookup(id)))].filter((id) => id !== sheet.id);
    return JSON.stringify([strip(sheet), ...used.map((id) => lookup(id)).filter(Boolean).map((s) => strip(s!))]);
  }, [sheet, lookup]);
  const sim = useMemo(() => new LogicSim(sheet, (id) => (id === sheet.id ? sheet : lookup(id))), [structure, epoch]);

  // El valor guardado de cada entrada manda (otro usuario puede haberla cambiado).
  useEffect(() => {
    let changed = false;
    for (const n of sheet.nodes) {
      if (n.kind !== 'in') continue;
      const v = Number(n.props.value) ? 1 : 0;
      if (sim.source(n.id) !== v) {
        sim.setSource(n.id, v, false);
        changed = true;
      }
    }
    if (changed) {
      sim.settle();
      bump();
    }
  }, [sheet, sim]);

  useEffect(() => {
    if (!running || !sim.hasClock) return;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      if (sim.advance(dt)) bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, running, speed]);

  return { sim, version, refresh: bump, lookup };
}
