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
export type AssemblyTab = 'steps'|'materials'|'photo';
export type Tool = 'select' | 'hand';
export type View = 'board' | 'schematic';

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
  showToast(text: string | null, tone?: Toast['tone']): void;
  setTool(tool: Tool): void;
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

const LAB_SIZES_KEY='cs-workbench-sizes';
function readLabSizes():Record<LabPanel,number> {
  const defaults={signals:320,diagnostics:290,assembly:280,notes:260};
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
  resetAssembly:()=>set({assemblyTab:'steps',assemblyCursor:null,assemblyLocalDone:{},labFullscreen:false}),
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
  showToast: (text, tone = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: text ? { text, tone } : null });
    if (text) toastTimer = setTimeout(() => set({ toast: null }), 3600);
  },
  setTool: (tool) => set({ tool }),
}));
