import { useEffect, useRef, useState } from 'react';
import { Bookmark, Clock, History as HistoryIcon, Loader2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { AUTO_EVERY_MS, listVersions, loadVersion, restoreVersion, saveVersion, type VersionInfo } from '../collab/history';
import type { Project } from '../collab/project';
import type { CircuitSnapshot } from '../core/types';
import { CircuitPreview } from './Preview';
import { useEditor } from './context';
import { useUi } from './store';

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s > -60) return 'ahora';
  if (s > -3600) return rtf.format(Math.round(s / 60), 'minute');
  if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour');
  return new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const KIND_LABEL = { auto: 'Guardado automático', manual: 'Versión', restore: 'Antes de restaurar' } as const;

/**
 * Guarda una versión al abrir el circuito (punto de partida de la sesión) y otra cada 10 minutos
 * mientras se edita. El servidor descarta las que no cambian nada.
 */
export function useAutoVersions(project: Project, snapshot: CircuitSnapshot) {
  const dirty = useRef(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
  }, [snapshot]);
  useEffect(() => {
    if (project.readOnly) return;
    const save = () => void saveVersion(project, 'auto').catch(() => {});
    const opening = window.setTimeout(() => project.synced && save(), 8000);
    const every = window.setInterval(() => {
      if (!dirty.current || !project.synced) return;
      dirty.current = false;
      save();
    }, AUTO_EVERY_MS);
    return () => {
      clearTimeout(opening);
      clearInterval(every);
    };
  }, [project]);
}

export function HistoryPanel() {
  const { project } = useEditor();
  const showToast = useUi((s) => s.showToast);
  const ref = useRef<HTMLDivElement>(null);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<CircuitSnapshot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const refresh = () =>
    listVersions(project.room)
      .then((v) => {
        setVersions(v);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.room]);

  const select = (v: VersionInfo) => {
    setConfirming(false);
    if (selected === v.id) {
      setSelected(null);
      return;
    }
    setSelected(v.id);
    setPreview(null);
    loadVersion(project.room, v.id)
      .then((r) => setPreview(r.preview))
      .catch(() => setPreview(null));
  };

  const saveNow = async () => {
    setBusy(true);
    try {
      await saveVersion(project, 'manual', name || 'Versión sin nombre');
      setNaming(false);
      setName('');
      showToast('Versión guardada', 'ok');
      await refresh();
    } catch {
      showToast('No se pudo guardar la versión');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: VersionInfo) => {
    setBusy(true);
    try {
      await restoreVersion(project, v);
      showToast('Versión restaurada. Ctrl+Z la deshace.', 'ok');
      setSelected(null);
      setConfirming(false);
      await refresh();
    } catch {
      showToast('No se pudo restaurar la versión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="history-pop">
      <div className="history-head">
        <div>
          <strong>Historial</strong>
          <div className="faint">Se guarda solo cada 10 minutos mientras editas.</div>
        </div>
        {!project.readOnly && !naming && (
          <button className="btn sm" onClick={() => setNaming(true)}>
            <Save size={13} /> Guardar versión
          </button>
        )}
      </div>
      {naming && (
        <form
          className="history-name"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNow();
          }}
        >
          <input className="input" autoFocus placeholder="Nombre, p. ej. «Entrega del avance»" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary sm" type="submit" disabled={busy}>
            {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Guardar'}
          </button>
        </form>
      )}
      <ol className="history-list">
        {versions === null && !error && (
          <li className="history-empty">
            <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Cargando
          </li>
        )}
        {error && <li className="history-empty">{error}</li>}
        {versions?.length === 0 && <li className="history-empty">Aún no hay versiones. La primera se guarda al poco de abrir el circuito.</li>}
        {versions?.map((v) => (
          <li key={v.id} className={`history-item ${v.kind} ${selected === v.id ? 'open' : ''}`}>
            <button className="history-row" onClick={() => select(v)} aria-expanded={selected === v.id}>
              <span className="history-icon">{v.kind === 'manual' ? <Bookmark size={13} /> : v.kind === 'restore' ? <Undo2 size={13} /> : <Clock size={13} />}</span>
              <span className="history-text">
                <strong>{v.kind === 'manual' ? v.label : KIND_LABEL[v.kind]}</strong>
                <span>
                  {ago(v.created_at)}
                  {v.author_name ? ` · ${v.author_name}` : ''} · {v.parts} piezas, {v.wires} cables
                </span>
              </span>
            </button>
            {selected === v.id && (
              <div className="history-detail">
                <div className="history-preview">{preview ? <CircuitPreview snapshot={preview} /> : <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}</div>
                {!project.readOnly &&
                  (confirming ? (
                    <div className="history-confirm">
                      <span>El circuito actual se guarda antes como versión.</span>
                      <button className="btn sm" onClick={() => setConfirming(false)} disabled={busy}>
                        Cancelar
                      </button>
                      <button className="btn primary sm" onClick={() => void restore(v)} disabled={busy}>
                        {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RotateCcw size={13} />} Restaurar
                      </button>
                    </div>
                  ) : (
                    <button className="btn sm" style={{ width: '100%' }} onClick={() => setConfirming(true)}>
                      <RotateCcw size={13} /> Restaurar esta versión
                    </button>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export { HistoryIcon };
