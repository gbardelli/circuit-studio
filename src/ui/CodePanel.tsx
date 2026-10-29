import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { AlertCircle, Check, CheckCircle2, Code2, Eraser, Loader2, SendHorizontal, Terminal, Users, X } from 'lucide-react';
import { compileSketch } from '../sim/compile';
import { useEditor } from './context';
import { useUi } from './store';

export function BottomPanel() {
  const codeFor = useUi((s) => s.codeFor);
  const tab = useUi((s) => s.bottomTab);
  const openCode = useUi((s) => s.openCode);
  if (!codeFor || !tab) return null;
  return (
    <section className="bottom-panel" aria-label="Programa del Arduino">
      <div className="panel-tabs">
        <div className="segmented" role="tablist">
          <button role="tab" aria-pressed={tab === 'code'} aria-selected={tab === 'code'} onClick={() => openCode(codeFor, 'code')}>
            <Code2 size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
            sketch.ino
          </button>
          <button role="tab" aria-pressed={tab === 'serial'} aria-selected={tab === 'serial'} onClick={() => openCode(codeFor, 'serial')}>
            <Terminal size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
            Monitor serie
          </button>
        </div>
        <span className="grow" />
        <span className="faint" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={12} /> Edición compartida
        </span>
        <button className="icon-btn" onClick={() => openCode(null)} aria-label="Cerrar panel">
          <X size={15} />
        </button>
      </div>
      <div className="panel-body">
        <div style={{ display: tab === 'code' ? 'contents' : 'none' }}>
          <CodeEditor partId={codeFor} />
        </div>
        {tab === 'serial' && <SerialMonitor partId={codeFor} />}
      </div>
    </section>
  );
}

function CodeEditor({ partId }: { partId: string }) {
  const { project } = useEditor();
  const host = useRef<HTMLDivElement>(null);
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<Y.Text | null>(null);

  useEffect(() => {
    const ytext = project.sketch(partId);
    textRef.current = ytext;
    const undo = new Y.UndoManager(ytext);
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, indentWithTab]),
          basicSetup,
          cpp(),
          oneDark,
          EditorView.theme({
            '&': { height: '100%', fontSize: '12.5px' },
            '&.cm-editor': { background: 'var(--panel)' },
            // Única excepción a la regla de no usar monoespaciadas: el código necesita columnas alineadas.
            '.cm-scroller': { fontFamily: "'Geist Mono', ui-monospace, monospace", lineHeight: '1.6' },
            '.cm-gutters': { background: 'var(--panel)', border: 'none', color: 'var(--text-3)' },
            '.cm-activeLine, .cm-activeLineGutter': { background: 'rgba(255,255,255,0.03)' },
            '&.cm-focused': { outline: 'none' },
          }),
          yCollab(ytext, project.awareness, { undoManager: undo }),
        ],
      }),
    });
    return () => {
      view.destroy();
      undo.destroy();
    };
  }, [project, partId]);

  const verify = async () => {
    if (!textRef.current) return;
    setBusy(true);
    const r = await compileSketch(textRef.current.toString());
    setBusy(false);
    if (r.ok) {
      // arduino-cli responde en el idioma del sistema: se toma el primer "<n> bytes".
      const size = r.stdout.match(/(\d+) bytes/)?.[1];
      setOutput({ ok: true, text: `Compila sin errores${size ? ` · ${size} de 32 256 bytes` : ''}` });
    } else {
      setOutput({ ok: false, text: r.stderr.trim() });
    }
  };

  return (
    <div className="code-layout" style={{ position: 'relative' }}>
      <div className="code-host" ref={host} />
      <button className="btn sm" onClick={verify} disabled={busy} style={{ position: 'absolute', top: 8, right: 14, zIndex: 2 }}>
        {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={13} />}
        {busy ? 'Compilando' : 'Verificar'}
      </button>
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
        {log || <span className="placeholder">{simRunning ? 'Esperando datos a 9600 baudios' : 'Pulsa Simular para ver lo que imprime Serial.'}</span>}
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
        <span className="faint" style={{ fontSize: 12 }}>
          Seguir
        </span>
        <button type="button" className="switch" role="switch" aria-checked={auto} aria-label="Seguir la salida" onClick={() => setAuto((a) => !a)} />
        <button type="button" className="icon-btn" onClick={() => setLog('')} aria-label="Limpiar" title="Limpiar">
          <Eraser size={14} />
        </button>
      </form>
    </div>
  );
}
