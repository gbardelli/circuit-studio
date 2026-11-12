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

export type LabPanel = 'signals'|'diagnostics'|'assembly'|'notes';
export type CodeTheme = 'grafito' | 'claro' | 'papel' | 'contraste';
export interface CodeView {
  mode: 'dock' | 'full';
  height: number;
  theme: CodeTheme;
  fontSize: number;
  lineHeight: number;
  wrap: boolean;
  lineNumbers: boolean;
  tabSize: 2 | 4;
}
export type AssemblyTab = 'steps'|'materials'|'photo';
export type Tool = 'select' | 'hand';
export type View = 'board' | 'schematic' | 'design';

/** Pieza que se arrastra desde la biblioteca: posición del puntero en pantalla. */
export interface LibDrag {
  type: string;
  x: number;
  y: number;
  over: boolean;
}

export interface UiState {
  performanceVisible:boolean;
  setPerformanceVisible(on:boolean):void;
  labPanel:LabPanel|null;
  labFullscreen:boolean;
  setLabFullscreen(on:boolean):void;
  labSizes:Record<LabPanel,number>;
  setLabSize(panel:LabPanel,height:number):void;
  assemblyTab:AssemblyTab;
  setAssemblyTab(tab:AssemblyTab):void;
  assemblyCursor:string|null;
  setAssemblyCursor(key:string|null):void;
  assemblyLocalDone:Record<string,string>;
  assemblyLocalPurchased:Record<string,number>;
  setAssemblyLocalDone(key:string,signature:string):void;
  resetAssembly():void;
  setLabPanel(panel:UiState['labPanel']):void;
  commandOpen:boolean;
  setCommandOpen(open:boolean):void;
  pinnedSignal:string|null;
  pinSignal(key:string|null):void;
  assemblyWire:string|null;
  setAssemblyWire(id:string|null):void;
  signalOverlay:boolean;
  setSignalOverlay(on:boolean):void;
  selection: string[];
  wireSelection: string[];
  placing: string | null;
  viewport: Viewport;
  simRunning: boolean;
  codeFor: string | null;
  bottomTab: 'code' | 'serial' | null;
  toast: Toast | null;
  tool: Tool;
  /** Puntos que recorren los cables durante la simulación. */
  showFlow: boolean;
  setShowFlow(on: boolean): void;
  view: View;
  compactPanel: 'library' | 'inspector' | null;
  setCompactPanel(panel: 'library' | 'inspector' | null): void;
  /** Paneles laterales recogidos en pantallas anchas (se recuerda en este navegador). */
  collapsed: { library: boolean; inspector: boolean };
  togglePanel(panel: 'library' | 'inspector'): void;
  setView(view: View): void;
  libDrag: LibDrag | null;
  setLibDrag(d: LibDrag | null): void;
  select(parts: string[], wires?: string[]): void;
  setViewport(v: Viewport): void;
  setPlacing(type: string | null): void;
  setSim(running: boolean): void;
  openCode(partId: string | null, tab?: 'code' | 'serial' | null): void;
  codeView: CodeView;
  setCodeView(patch: Partial<CodeView>): void;
  showToast(text: string | null, tone?: Toast['tone']): void;
  setTool(tool: Tool): void;
  /** Piezas copiadas con Ctrl C (ids del circuito). */
  clipboard: string[];
  setClipboard(ids: string[]): void;
  /** Posición del cursor en el lienzo (unidades del mundo) para la barra de estado. */
  pointer: { x: number; y: number } | null;
  setPointer(p: { x: number; y: number } | null): void;
}

/** Selecciona una pieza y lleva el foco a su campo «Nombre» del inspector, como F2 en los CAD. */
export function focusPartName(id: string) {
  useUi.getState().select([id], []);
  const tryFocus = (left: number) => {
    const input = document.getElementById(`part-name-${id}`) as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
    else if (left > 0) setTimeout(() => tryFocus(left - 1), 40);
  };
  setTimeout(() => tryFocus(8), 30);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const PANELS_KEY = 'cs-panels';
function readPanels(): UiState['collapsed'] {
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as Partial<UiState['collapsed']>;
    return { library: Boolean(saved.library), inspector: Boolean(saved.inspector) };
  } catch {
    return { library: false, inspector: false };
  }
}

const CODE_KEY = 'cs-code-view';
const CODE_DEFAULT: CodeView = {
  mode: 'dock', height: 340, theme: 'grafito', fontSize: 13, lineHeight: 1.6, wrap: false, lineNumbers: true, tabSize: 2,
};
function readCodeView(): CodeView {
  try {
    const saved = JSON.parse(localStorage.getItem(CODE_KEY) ?? '{}') as Partial<CodeView>;
    const theme: CodeTheme = saved.theme === 'claro' || saved.theme === 'papel' || saved.theme === 'contraste' ? saved.theme : 'grafito';
    const fontSize = Number(saved.fontSize);
    const lineHeight = Number(saved.lineHeight);
    const height = Number(saved.height);
    return {
      mode: saved.mode === 'full' ? 'full' : 'dock',
      height: Number.isFinite(height) ? Math.max(200, Math.min(900, height)) : CODE_DEFAULT.height,
      theme,
      fontSize: Number.isFinite(fontSize) ? Math.max(12, Math.min(18, Math.round(fontSize))) : CODE_DEFAULT.fontSize,
      lineHeight: lineHeight === 1.45 || lineHeight === 1.85 ? lineHeight : 1.6,
      wrap: Boolean(saved.wrap),
      lineNumbers: saved.lineNumbers !== false,
      tabSize: saved.tabSize === 4 ? 4 : 2,
    };
  } catch {
    return CODE_DEFAULT;
  }
}

const LAB_SIZES_KEY='cs-workbench-sizes';
function readLabSizes():Record<LabPanel,number> {
  const defaults={signals:320,diagnostics:290,assembly:320,notes:300};
  try {const saved=JSON.parse(localStorage.getItem(LAB_SIZES_KEY)??'{}');for(const key of Object.keys(defaults) as LabPanel[]) if(Number.isFinite(saved[key]))defaults[key]=Math.max(180,Math.min(1600,saved[key]));}catch{/* optional local preference */}
  return defaults;
}

export const useUi = create<UiState>((set) => ({
  performanceVisible:false,setPerformanceVisible:(performanceVisible)=>set({performanceVisible}),
  labPanel:null,setLabPanel:(labPanel)=>set(labPanel?{labPanel,codeFor:null,bottomTab:null}:{labPanel,labFullscreen:false}),
  labFullscreen:false,setLabFullscreen:(labFullscreen)=>set({labFullscreen}),
  labSizes:readLabSizes(),setLabSize:(panel,height)=>set(s=>{const labSizes={...s.labSizes,[panel]:Math.max(180,Math.min(1600,height))};try{localStorage.setItem(LAB_SIZES_KEY,JSON.stringify(labSizes));}catch{/* optional local preference */}return{labSizes};}),
  assemblyTab:'steps',setAssemblyTab:(assemblyTab)=>set({assemblyTab}),
  assemblyCursor:null,setAssemblyCursor:(assemblyCursor)=>set({assemblyCursor}),
  assemblyLocalDone:{},setAssemblyLocalDone:(key,signature)=>set(s=>({assemblyLocalDone:{...s.assemblyLocalDone,[key]:signature}})),
  assemblyLocalPurchased:{},
  resetAssembly:()=>set({assemblyTab:'steps',assemblyCursor:null,assemblyLocalDone:{},assemblyLocalPurchased:{},labFullscreen:false}),
  commandOpen:false,setCommandOpen:(commandOpen)=>set({commandOpen}),
  pinnedSignal:null,pinSignal:(pinnedSignal)=>set({pinnedSignal}),
  assemblyWire:null,setAssemblyWire:(assemblyWire)=>set({assemblyWire}),
  signalOverlay:false,setSignalOverlay:(signalOverlay)=>set({signalOverlay}),
  selection: [],
  wireSelection: [],
  placing: null,
  viewport: { x: 80, y: 80, zoom: 2 },
  simRunning: false,
  codeFor: null,
  bottomTab: null,
  toast: null,
  tool: 'select',
  clipboard: [],
  setClipboard: (clipboard) => set({ clipboard }),
  pointer: null,
  setPointer: (pointer) => set({ pointer }),
  showFlow: true,
  setShowFlow: (showFlow) => set({ showFlow }),
  view: 'board',
  compactPanel: null,
  setCompactPanel: (compactPanel) => set({ compactPanel }),
  collapsed: readPanels(),
  togglePanel: (panel) =>
    set((s) => {
      const collapsed = { ...s.collapsed, [panel]: !s.collapsed[panel] };
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(collapsed));
      } catch {
        /* sin persistencia */
      }
      return { collapsed };
    }),
  setView: (view) => set({ view }),
  libDrag: null,
  setLibDrag: (libDrag) => set({ libDrag }),
  select: (parts, wires = []) => set({ selection: parts, wireSelection: wires }),
  setViewport: (viewport) => set({ viewport }),
  setPlacing: (placing) => set({ placing }),
  setSim: (simRunning) => set({ simRunning }),
  openCode: (codeFor, tab = 'code') => set({ codeFor, bottomTab: codeFor ? tab : null,...(codeFor?{labPanel:null,labFullscreen:false}:{}) }),
  codeView: readCodeView(),
  setCodeView: (patch) => set((s) => {
    const codeView = readCodeView();
    const next = { ...s.codeView, ...patch };
    const safe: CodeView = {
      ...next,
      mode: next.mode === 'full' ? 'full' : 'dock',
      height: Math.max(200, Math.min(900, next.height || codeView.height)),
      fontSize: Math.max(12, Math.min(18, Math.round(next.fontSize))),
      lineHeight: next.lineHeight === 1.45 || next.lineHeight === 1.85 ? next.lineHeight : 1.6,
      tabSize: next.tabSize === 4 ? 4 : 2,
      theme: next.theme === 'claro' || next.theme === 'papel' || next.theme === 'contraste' ? next.theme : 'grafito',
    };
    try { localStorage.setItem(CODE_KEY, JSON.stringify(safe)); } catch { /* sin persistencia */ }
    return { codeView: safe };
  }),
  showToast: (text, tone = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: text ? { text, tone } : null });
    if (text) toastTimer = setTimeout(() => set({ toast: null }), 3600);
  },
  setTool: (tool) => set({ tool }),
}));
