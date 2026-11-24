import { useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { spiceVerifier } from '../spice/verifier';
import { useSnapshot } from './context';
import { PARTS } from '../parts';

const useSpice = () => useSyncExternalStore(spiceVerifier.subscribe, spiceVerifier.getState);

const mv = (v: number) => (Math.abs(v) < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 2 : 1)} mV` : `${v.toFixed(3)} V`);

/** «r1:2» → «R1 · patilla 2», con el nombre que el usuario dio a la pieza si lo hay. */
function useLabel() {
  const snapshot = useSnapshot();
  return (key: string) => {
    const i = key.lastIndexOf(':');
    const part = snapshot.parts.find((p) => p.id === key.slice(0, i));
    const name = part ? String(part.props.label || PARTS[part.type]?.name || part.type).split('·')[0].trim() : key.slice(0, i);
    return `${name} · ${key.slice(i + 1)}`;
  };
}

function download(netlist: string) {
  const url = URL.createObjectURL(new Blob([netlist], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'circuito.cir' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tarjeta del diagnóstico: qué verificó SPICE, con qué margen y dónde discrepa si lo hace. */
export function SpiceCard() {
  const state = useSpice();
  const label = useLabel();
  const deck = spiceVerifier.lastDeck;
  if (state.phase === 'idle')
    return (
      <div className="spice-card is-idle">
        <span className="spice-dot" />
        <div>
          <strong>Verificación SPICE</strong>
          <p>Al simular, ngspice resuelve el mismo circuito y se compara nodo a nodo con el motor en vivo.</p>
        </div>
      </div>
    );
  if (state.phase === 'loading')
    return (
      <div className="spice-card is-loading" role="status">
        <Loader2 size={15} className="spin" />
        <div>
          <strong>Verificando con ngspice…</strong>
          <p>Resolviendo el punto de operación en segundo plano.</p>
        </div>
      </div>
    );
  const c = state.check;
  const ok = c.state === 'ok';
  return (
    <div className={`spice-card ${ok ? 'is-ok' : c.state === 'warn' ? 'is-warn' : 'is-error'}`} role="status">
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <div>
        <strong>{ok ? 'Coincide con SPICE' : c.state === 'warn' ? `${c.off.length} ${c.off.length === 1 ? 'nodo difiere' : 'nodos difieren'} de SPICE` : 'ngspice no pudo resolver el circuito'}</strong>
        {c.error ? (
          <p className="spice-error">{c.error.split('\n')[0]}</p>
        ) : (
          <p>
            ngspice · {c.nodes} nodos · {c.devices} dispositivos con modelo SPICE{c.behavioral ? ` · ${c.behavioral} de comportamiento` : ''} · Δ máx {mv(c.maxDiff)} · {c.ms.toFixed(1)} ms
          </p>
        )}
        {!ok && c.off.length > 0 && (
          <ul className="spice-off">
            {c.off.slice(0, 4).map((o) => (
              <li key={o.label}>
                <span>{label(o.label)}</span>
                <span className="mono">{o.ours.toFixed(3)} V</span>
                <span className="mono">SPICE {o.spice.toFixed(3)} V</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {deck && (
        <button className="icon-btn spice-export" title="Exportar la netlist SPICE (.cir) · ábrela en LTspice o ngspice" aria-label="Exportar netlist SPICE" onClick={() => download(deck.netlist)}>
          <Download size={14} />
        </button>
      )}
    </div>
  );
}

/** Indicador compacto para la barra de estado. */
export function SpiceChip() {
  const state = useSpice();
  if (state.phase === 'idle') return null;
  if (state.phase === 'loading')
    return (
      <span className="item spice-chip" title="Verificando con ngspice">
        <Loader2 size={11} className="spin" /> SPICE
      </span>
    );
  const c = state.check;
  return (
    <span className={`item spice-chip ${c.state}`} title={c.state === 'ok' ? `Coincide con ngspice · Δ máx ${mv(c.maxDiff)}` : 'Hay diferencias con ngspice: mira Diagnóstico'}>
      {c.state === 'ok' ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} SPICE
    </span>
  );
}
