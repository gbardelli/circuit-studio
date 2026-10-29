import { create } from 'zustand';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Toast {
  text: string;
  tone: 'ok' | 'info';
}

export type Tool = 'select' | 'hand';
export type View = 'board' | 'schematic';

export interface UiState {
  selection: string[];
  wireSelection: string[];
  placing: string | null;
  viewport: Viewport;
  simRunning: boolean;
  codeFor: string | null;
  bottomTab: 'code' | 'serial' | null;
  toast: Toast | null;
  tool: Tool;
  view: View;
  setView(view: View): void;
  select(parts: string[], wires?: string[]): void;
  setViewport(v: Viewport): void;
  setPlacing(type: string | null): void;
  setSim(running: boolean): void;
  openCode(partId: string | null, tab?: 'code' | 'serial' | null): void;
  showToast(text: string | null, tone?: Toast['tone']): void;
  setTool(tool: Tool): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set) => ({
  selection: [],
  wireSelection: [],
  placing: null,
  viewport: { x: 80, y: 80, zoom: 2 },
  simRunning: false,
  codeFor: null,
  bottomTab: null,
  toast: null,
  tool: 'select',
  view: 'board',
  setView: (view) => set({ view }),
  select: (parts, wires = []) => set({ selection: parts, wireSelection: wires }),
  setViewport: (viewport) => set({ viewport }),
  setPlacing: (placing) => set({ placing }),
  setSim: (simRunning) => set({ simRunning }),
  openCode: (codeFor, tab = 'code') => set({ codeFor, bottomTab: codeFor ? tab : null }),
  showToast: (text, tone = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: text ? { text, tone } : null });
    if (text) toastTimer = setTimeout(() => set({ toast: null }), 3600);
  },
  setTool: (tool) => set({ tool }),
}));
