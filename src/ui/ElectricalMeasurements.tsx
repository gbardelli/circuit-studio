import { useMemo } from 'react';
import { electricalReview, type ElectricalMeasurement } from '../sim/electricalReview';
import { formatSI } from '../core/units';
import { useEditor, useSimStatus, useSnapshot } from './context';
import { useUi } from './store';

const unit = (q: ElectricalMeasurement['quantity']) => (q === 'power' ? 'W' : q === 'voltage' ? 'V' : 'A');
/** Fugas numéricas (pA en un pin apagado) se leen como cero, no como «0.000002 pA». */
const reading = (row: ElectricalMeasurement) => {
  const floor = row.quantity === 'current' ? 1e-9 : row.quantity === 'power' ? 1e-9 : 1e-6;
  return Math.abs(row.value) < floor ? `0 ${unit(row.quantity)}` : formatSI(row.value, unit(row.quantity));
};

/**
 * Medidas agrupadas por pieza. Cada lectura lleva un medidor contra su referencia (cuánto margen
 * queda de un vistazo) y el criterio de la referencia aparece una vez por pieza, no en cada fila.
 */
export function ElectricalMeasurements() {
  const { engine } = useEditor();
  const snapshot = useSnapshot(), status = useSimStatus();
  const select = useUi(s => s.select);
  const review = useMemo(() => electricalReview(snapshot, status.running ? engine.readings() : {}, status.running ? engine.pinCurrents() : new Map()), [snapshot, status, engine]);
  const groups = useMemo(() => {
    const map = new Map<string, { part: string; label: string; rows: ElectricalMeasurement[]; bases: string[] }>();
    for (const row of review.rows) {
      const g = map.get(row.part) ?? { part: row.part, label: row.label, rows: [], bases: [] };
      g.rows.push(row);
      if (!g.bases.includes(row.basis)) g.bases.push(row.basis);
      map.set(row.part, g);
    }
    return [...map.values()];
  }, [review]);
  const worst = review.rows.some(r => r.state === 'error') ? 'error' : review.rows.some(r => r.state === 'warning') ? 'warning' : 'measured';
  return <section className="electrical-measurements" aria-label="Corrientes y potencia">
    <header className="diag-head">
      <div><h2>Medidas</h2><span>{status.running ? `${review.rows.length} lecturas en vivo` : 'Sin lecturas'}</span></div>
      {status.running && review.rows.length > 0 && <span className={`diag-pill is-${worst}`}>{worst === 'error' ? 'Fuera de límite' : worst === 'warning' ? 'Cerca del límite' : 'Con margen'}</span>}
    </header>
    {groups.length > 0 ? <ul className="meas-list">
      {groups.map(g => <li key={g.part} className="meas-group">
        <button type="button" className="meas-part" onClick={() => select([g.part])} title="Localizar en el lienzo">{g.label}</button>
        {g.rows.map(row => {
          const ratio = row.limit ? Math.min(1, Math.abs(row.value) / row.limit) : 0;
          return <div key={`${row.pin ?? row.quantity}`} className="meas-row" data-state={row.state}>
            <span className="meas-name">{row.pin ? `Pin ${row.pin}` : row.quantity === 'power' ? 'Potencia' : row.quantity === 'voltage' ? 'Tensión' : 'Corriente'}</span>
            <span className="meas-meter" aria-hidden><i style={{ transform: `scaleX(${ratio})` }} /></span>
            <span className="meas-value"><b>{reading(row)}</b>{row.limit !== undefined ? <small> / {formatSI(row.limit, unit(row.quantity))}</small> : <small> · por confirmar</small>}</span>
          </div>;
        })}
        {g.bases.map(b => <p key={b} className="meas-basis">{b}</p>)}
      </li>)}
    </ul> : <p className="diag-quiet">Simula para ver corrientes y potencias. Cada pieza se localiza en el lienzo con un clic.</p>}
    {review.pending.length > 0 && <details className="electrical-pending"><summary>Pendiente de hardware · {review.pending.length}</summary><ul>{review.pending.map(text => <li key={text}>{text}</li>)}</ul></details>}
  </section>;
}
