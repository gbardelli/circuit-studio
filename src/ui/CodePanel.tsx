import { useEffect, useId, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { AlertCircle, Check, CheckCircle2, Code2, Eraser, Hash, Loader2, Maximize2, Minimize2, Minus, Plus, SendHorizontal, Settings2, Terminal, Users, WrapText, X } from 'lucide-react';
import { compileSketch } from '../sim/compile';
import { useEditor } from './context';
import { useUi, type CodeTheme, type CodeView } from './store';

const themeSlot = new Compartment();
const metricsSlot = new Compartment();
const wrapSlot = new Compartment();
const tabSlot = new Compartment();

const THEMES: { id: CodeTheme; name: string; swatch: string }[] = [
  { id: 'grafito', name: 'Grafito', swatch: '#1c1f24' },
  { id: 'claro', name: 'Claro', swatch: '#f4f6f8' },
  { id: 'papel', name: 'Papel', swatch: '#efe8da' },
  { id: 'contraste', name: 'Contraste', swatch: '#111' },
];

const SIZES = [12, 13, 14, 15, 16, 18];
const LEADING = [
  { id: 1.45, name: 'Compacto' },
  { id: 1.6, name: 'Normal' },
  { id: 1.85, name: 'Amplio' },
] as const;

export function BottomPanel() {
  const codeFor = useUi((s) => s.codeFor);
  const tab = useUi((s) => s.bottomTab);
  const openCode = useUi((s) => s.openCode);
  const view = useUi((s) => s.codeView);
  const setView = useUi((s) => s.setCodeView);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const menuOpen = useRef(false);
  menuOpen.current = menu !== null;
  const resize = useRef<{ y: number; height: number; last: number } | null>(null);
  const menuId = useId();
  const full = view.mode === 'full';
  const height = dragHeight ?? view.height;

  useEffect(() => {
    if (!full || !root.current) return;
    const background = Array.from(document.querySelectorAll<HTMLElement>(
      '.app > header,.app > aside,.app > footer,.app > .compact-panels,.workspace > .workbench-rail,.workspace > .editor-canvas-slot,.workspace > .workbench-panel',
    ));
    const previous = background.map((el) => ({ el, inert: el.inert }));
    previous.forEach(({ el }) => { el.inert = true; });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menuOpen.current || useUi.getState().commandOpen) return;
      e.preventDefault();
      setView({ mode: 'dock' });
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous.forEach(({ el, inert }) => { el.inert = inert; });
    };
  }, [full, setView]);

  if (!codeFor || !tab) return null;
  return (
    <section
      ref={root}
      className={`bottom-panel ${full ? 'is-full' : ''} ${resize.current ? 'is-resizing' : ''}`}
      style={full ? undefined : { height }}
      aria-label="Programa del Arduino"
      role={full ? 'dialog' : 'region'}
      aria-modal={full || undefined}
    >
      {!full && (
        <div
          className="code-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Ajustar altura del código"
          aria-valuenow={Math.round(height)}
          aria-valuemin={200}
          aria-valuemax={900}
          tabIndex={0}
          title="Arrastra para ajustar. Doble clic restablece."
          onDoubleClick={() => setView({ height: 340 })}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 80 : 24;
            if (e.key === 'ArrowUp') setView({ height: height + step });
            if (e.key === 'ArrowDown') setView({ height: height - step });
            if (e.key === 'Home') setView({ height: 200 });
            if (e.key === 'End') setView({ height: 720 });
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            resize.current = { y: e.clientY, height, last: height };
            setDragHeight(height);
          }}
          onPointerMove={(e) => {
            const r = resize.current;
            if (!r) return;
            r.last = Math.max(200, Math.min(900, r.height + r.y - e.clientY));
            setDragHeight(r.last);
          }}
          onPointerUp={(e) => {
            if (!resize.current) return;
            setView({ height: resize.current.last });
            resize.current = null;
            setDragHeight(null);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { resize.current = null; setDragHeight(null); }}
        >
          <span />
        </div>
      )}
      <div className="panel-tabs">
        <div className="segmented" role="tablist">
          <button role="tab" aria-pressed={tab === 'code'} aria-selected={tab === 'code'} onClick={() => openCode(codeFor, 'code')}>
            <Code2 size={12} />
            sketch.ino
          </button>
          <button role="tab" aria-pressed={tab === 'serial'} aria-selected={tab === 'serial'} onClick={() => openCode(codeFor, 'serial')}>
            <Terminal size={12} />
            Monitor serie
          </button>
        </div>
        {tab === 'serial' && <span className="code-meta">9600 baud</span>}
        <span className="grow" />
        <span className="code-meta"><Users size={12} /> Compartido</span>
        <button
          className={`icon-btn ${menu ? 'on' : ''}`}
          data-code-view-toggle=""
          aria-expanded={Boolean(menu)}
          aria-controls={menuId}
          aria-label="Vista del editor"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu((open) => open ? null : { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
          }}
        >
          <Settings2 size={15} />
        </button>
        <button
          className="btn sm panel-expand"
          onClick={() => setView({ mode: full ? 'dock' : 'full' })}
          aria-label={full ? 'Volver al panel inferior' : 'Código a pantalla completa'}
        >
          {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span>{full ? 'Reducir' : 'Ampliar'}</span>
        </button>
        <button className="icon-btn" onClick={() => openCode(null)} aria-label="Cerrar panel">
          <X size={15} />
        </button>
        {menu && <CodeViewMenu id={menuId} view={view} anchor={menu} onChange={setView} onClose={() => setMenu(null)} />}
      </div>
      <div className="panel-body">
        <div style={{ display: tab === 'code' ? 'contents' : 'none' }}>
          <CodeEditor partId={codeFor} prefs={view} />
        </div>
        {tab === 'serial' && <SerialMonitor partId={codeFor} />}
      </div>
    </section>
  );
}

function CodeViewMenu({ id, view, anchor, onChange, onClose }: { id: string; view: CodeView; anchor: { top: number; right: number }; onChange: (patch: Partial<CodeView>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (ref.current?.contains(target) || target?.closest('[data-code-view-toggle]')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const sizeAt = SIZES.reduce((best, size, index) => Math.abs(size - view.fontSize) < Math.abs(SIZES[best] - view.fontSize) ? index : best, 0);
  return (
    <div ref={ref} id={id} className="code-menu" role="dialog" aria-label="Vista del editor" style={{ top: anchor.top, right: anchor.right }}>
      <p>Tema</p>
      <div className="code-swatches" role="radiogroup" aria-label="Tema">
        {THEMES.map((theme) => (
          <button key={theme.id} role="radio" aria-checked={view.theme === theme.id} className={view.theme === theme.id ? 'on' : ''} onClick={() => onChange({ theme: theme.id })}>
            <i style={{ background: theme.swatch }} />
            {theme.name}
          </button>
        ))}
      </div>
      <p>Texto</p>
      <div className="code-stepper">
        <button className="icon-btn" aria-label="Texto más pequeño" disabled={sizeAt <= 0} onClick={() => onChange({ fontSize: SIZES[Math.max(0, sizeAt - 1)] })}><Minus size={13} /></button>
        <strong>{view.fontSize} px</strong>
        <button className="icon-btn" aria-label="Texto más grande" disabled={sizeAt >= SIZES.length - 1} onClick={() => onChange({ fontSize: SIZES[Math.min(SIZES.length - 1, sizeAt + 1)] })}><Plus size={13} /></button>
      </div>
      <div className="code-choice" role="radiogroup" aria-label="Interlineado">
        {LEADING.map((item) => (
          <button key={item.id} role="radio" aria-checked={view.lineHeight === item.id} className={view.lineHeight === item.id ? 'on' : ''} onClick={() => onChange({ lineHeight: item.id })}>{item.name}</button>
        ))}
      </div>
      <p>Editor</p>
      <button className={`code-toggle ${view.wrap ? 'on' : ''}`} aria-pressed={view.wrap} onClick={() => onChange({ wrap: !view.wrap })}>
        <WrapText size={14} /> Ajuste de línea
      </button>
      <button className={`code-toggle ${view.lineNumbers ? 'on' : ''}`} aria-pressed={view.lineNumbers} onClick={() => onChange({ lineNumbers: !view.lineNumbers })}>
        <Hash size={14} /> Números de línea
      </button>
      <div className="code-choice" role="radiogroup" aria-label="Tabulación">
        <button role="radio" aria-checked={view.tabSize === 2} className={view.tabSize === 2 ? 'on' : ''} onClick={() => onChange({ tabSize: 2 })}>Tab 2</button>
        <button role="radio" aria-checked={view.tabSize === 4} className={view.tabSize === 4 ? 'on' : ''} onClick={() => onChange({ tabSize: 4 })}>Tab 4</button>
      </div>
    </div>
  );
}

function themeExtension(theme: CodeTheme) {
  if (theme === 'grafito') return [oneDark, chrome(theme)];
  return [syntaxHighlighting(lightSyntax(theme)), chrome(theme)];
}

function metricsExtension(prefs: CodeView) {
  return [
    EditorView.theme({
      '&': { height: '100%', fontSize: `${prefs.fontSize}px` },
      '.cm-scroller': { fontFamily: "'Geist Mono', ui-monospace, monospace", lineHeight: String(prefs.lineHeight) },
      '&.cm-focused': { outline: 'none' },
      '&.cm-no-gutter .cm-gutters': { display: 'none' },
    }),
    EditorView.editorAttributes.of({ class: prefs.lineNumbers ? '' : 'cm-no-gutter' }),
  ];
}

function applyPrefs(view: EditorView, prefs: CodeView) {
  view.dispatch({
    effects: [
      themeSlot.reconfigure(themeExtension(prefs.theme)),
      metricsSlot.reconfigure(metricsExtension(prefs)),
      wrapSlot.reconfigure(prefs.wrap ? EditorView.lineWrapping : []),
      tabSlot.reconfigure([EditorState.tabSize.of(prefs.tabSize), indentUnit.of(' '.repeat(prefs.tabSize))]),
    ],
  });
}

function CodeEditor({ partId, prefs }: { partId: string; prefs: CodeView }) {
  const { project, detail } = useEditor();
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<Y.Text | null>(null);

  useEffect(() => {
    const ytext = project.sketch(partId);
    textRef.current = ytext;
    const undo = new Y.UndoManager(ytext);
    const current = prefsRef.current;
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, indentWithTab]),
          basicSetup,
          EditorState.readOnly.of(project.readOnly),
          EditorView.editable.of(!project.readOnly),
          cpp(),
          themeSlot.of(themeExtension(current.theme)),
          metricsSlot.of(metricsExtension(current)),
          wrapSlot.of(current.wrap ? EditorView.lineWrapping : []),
          tabSlot.of([EditorState.tabSize.of(current.tabSize), indentUnit.of(' '.repeat(current.tabSize))]),
          yCollab(ytext, project.awareness, { undoManager: undo }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      undo.destroy();
    };
  }, [project, partId]);

  useEffect(() => {
    if (viewRef.current) applyPrefs(viewRef.current, prefs);
  }, [prefs]);

  const verify = async () => {
    if (!textRef.current) return;
    setBusy(true);
    const r = await compileSketch(textRef.current.toString());
    setBusy(false);
    if (r.ok) {
      const size = r.stdout.match(/(\d+) bytes/)?.[1];
      setOutput({ ok: true, text: size ? `Compila sin errores. ${Number(size).toLocaleString('es')} de 32 256 bytes.` : 'Compila sin errores.' });
    } else {
      setOutput({ ok: false, text: r.stderr.trim() });
    }
  };

  return (
    <div className="code-layout">
      <div className="code-toolbar">
        <button className="btn sm" onClick={verify} disabled={busy || detail?.guest}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={13} />}
          {busy ? 'Compilando' : 'Verificar'}
        </button>
      </div>
      <div className="code-host" ref={host} />
      {output && (
        <pre className={`compile-out ${output.ok ? 'ok' : 'err'}`}>
          {output.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {output.text}
        </pre>
      )}
    </div>
  );
}

function SerialMonitor({ partId }: { partId: string }) {
  const { engine } = useEditor();
  const [log, setLog] = useState('');
  const [input, setInput] = useState('');
  const [auto, setAuto] = useState(true);
  const box = useRef<HTMLPreElement>(null);
  const simRunning = useUi((s) => s.simRunning);

  useEffect(() => {
    let pending = '';
    let raf = 0;
    const off = engine.subscribeSerial((id, text) => {
      if (id !== partId) return;
      pending += text;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          const chunk = pending;
          pending = '';
          setLog((l) => (l + chunk).slice(-20000));
        });
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [engine, partId]);

  useEffect(() => {
    if (auto && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log, auto]);

  return (
    <div className="serial">
      <pre ref={box} className="serial-log" aria-live="polite">
        {log || <span className="placeholder">{simRunning ? 'Esperando datos' : 'Pulsa Simular para ver la salida.'}</span>}
      </pre>
      <form
        className="serial-input"
        onSubmit={(e) => {
          e.preventDefault();
          engine.serialWrite(partId, `${input}\n`);
          setInput('');
        }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enviar al Arduino" aria-label="Enviar por serie" disabled={!simRunning} />
        <button type="submit" className="btn sm" disabled={!simRunning} aria-label="Enviar">
          <SendHorizontal size={13} />
        </button>
        <span className="faint">Seguir</span>
        <button type="button" className="switch" role="switch" aria-checked={auto} aria-label="Seguir la salida" onClick={() => setAuto((a) => !a)} />
        <button type="button" className="icon-btn" onClick={() => setLog('')} aria-label="Limpiar" title="Limpiar">
          <Eraser size={14} />
        </button>
      </form>
    </div>
  );
}

function lightSyntax(theme: CodeTheme) {
  const paper = theme === 'papel';
  const contrast = theme === 'contraste';
  const c = contrast
    ? { keyword: '#ffe14a', name: '#f4f4f4', fn: '#ffe14a', type: '#9ecbff', op: '#f4f4f4', comment: '#bdbdbd', atom: '#ffb0b0', string: '#9dffb0', invalid: '#ff8080' }
    : paper
      ? { keyword: '#8a4b12', name: '#2a261f', fn: '#8a4b12', type: '#6b4a1f', op: '#5c5346', comment: '#8a7d6a', atom: '#8a3030', string: '#2f6b45', invalid: '#9d1c1c' }
      : { keyword: '#6d28d9', name: '#1c1f24', fn: '#1d4ed8', type: '#9a3412', op: '#3f4650', comment: '#6d7480', atom: '#9f1239', string: '#047857', invalid: '#b91c1c' };
  return HighlightStyle.define([
    { tag: t.keyword, color: c.keyword },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: c.name },
    { tag: [t.function(t.variableName), t.labelName], color: c.fn },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.type },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.op },
    { tag: [t.meta, t.comment], color: c.comment, fontStyle: 'italic' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.atom },
    { tag: [t.processingInstruction, t.string, t.inserted], color: c.string },
    { tag: t.invalid, color: c.invalid },
  ]);
}

function chrome(theme: CodeTheme) {
  const pal = {
    grafito: { bg: '#0e0f11', fg: '#e7eaee', muted: '#8b919a', caret: '#6cb6ff', active: 'rgba(255,255,255,0.035)', selection: 'rgba(59,158,255,0.28)', dark: true },
    claro: { bg: '#f7f8fa', fg: '#1c1f24', muted: '#6d7480', caret: '#1d4ed8', active: 'rgba(20,24,32,0.04)', selection: 'rgba(29,78,216,0.16)', dark: false },
    papel: { bg: '#f6f1e7', fg: '#2c2822', muted: '#7d7468', caret: '#8a4b12', active: 'rgba(70,40,10,0.05)', selection: 'rgba(138,75,18,0.16)', dark: false },
    contraste: { bg: '#000000', fg: '#f5f5f5', muted: '#d0d0d0', caret: '#ffe14a', active: '#161616', selection: 'rgba(255,225,74,0.28)', dark: true },
  }[theme];
  return EditorView.theme({
    '&': { background: pal.bg, color: pal.fg },
    '.cm-content': { caretColor: pal.caret },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: pal.caret },
    '.cm-gutters': { background: pal.bg, color: pal.muted, border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { background: pal.active },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': { background: pal.selection },
  }, { dark: pal.dark });
}
