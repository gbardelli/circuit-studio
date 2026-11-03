// Estado local del modo diseño: hoja abierta, selección, colocación y reloj de la simulación.
import { create } from 'zustand';
import { MAIN_SHEET, type LogicNode, type LogicWire } from '../../logic/types';
import type { Viewport } from '../store';

export interface DesignUi {
  sheet: string;
  setSheet(sheet: string): void;
  nodes: string[];
  wires: string[];
  select(nodes: string[], wires?: string[]): void;
  /** Elemento que se va a colocar (clic en la paleta o arrastre). */
  placing: string | null;
  setPlacing(kind: string | null): void;
  viewports: Record<string, Viewport>;
  setViewport(sheet: string, v: Viewport): void;
  running: boolean;
  setRunning(on: boolean): void;
  speed: number;
  setSpeed(speed: number): void;
  clipboard: { nodes: LogicNode[]; wires: LogicWire[] } | null;
  setClipboard(c: DesignUi['clipboard']): void;
  /** Se incrementa para reiniciar la simulación (biestables y relojes a cero). */
  epoch: number;
  reset(): void;
}

export const useDesignUi = create<DesignUi>((set) => ({
  sheet: MAIN_SHEET,
  setSheet: (sheet) => set({ sheet, nodes: [], wires: [], placing: null }),
  nodes: [],
  wires: [],
  select: (nodes, wires = []) => set({ nodes, wires }),
  placing: null,
  setPlacing: (placing) => set({ placing }),
  viewports: {},
  setViewport: (sheet, v) => set((s) => ({ viewports: { ...s.viewports, [sheet]: v } })),
  running: true,
  setRunning: (running) => set({ running }),
  speed: 1,
  setSpeed: (speed) => set({ speed }),
  clipboard: null,
  setClipboard: (clipboard) => set({ clipboard }),
  epoch: 0,
  reset: () => set((s) => ({ epoch: s.epoch + 1 })),
}));
