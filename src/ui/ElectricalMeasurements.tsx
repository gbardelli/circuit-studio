import { useMemo, useRef } from 'react';
import { electricalReview, type ElectricalMeasurement } from '../sim/electricalReview';
import { formatSI } from '../core/units';
import { useEditor, useSampleTick, useSimRunning, useSnapshot } from './context';
import { useUi } from './store';

const unit = (q: ElectricalMeasurement['quantity']) => (q === 'power' ? 'W' : q === 'voltage' ? 'V' : 'A');
/** Por debajo de esto es fuga numérica, no una lectura: se muestra 0 y no baila entre nA y pA. */
const FLOOR = { current: 1e-6, power: 1e-6, voltage: 1e-3 } as const;
const reading = (row: ElectricalMeasurement) =>
  Math.abs(row.value) < FLOOR[row.quantity] ? `0 ${unit(row.quantity)}` : formatSI(row.value, unit(row.quantity));
const RANK = { measured: 0, warning: 1, error: 2 } as const;
type Held = ElectricalMeasurement & { peak: number; worst: ElectricalMeasurement['state'] };
const rowName = (row: ElectricalMeasurement) =>
  row.pin ? `Pin ${row.pin}` : row.quantity === 'power' ? 'Potencia' : row.quantity === 'voltage' ? 'Tensión' : 'Corriente';

/**
 * Medidas por pieza. Se leen una vez por segundo y en un orden fijo (pieza, luego pin): nada salta
 * de sitio mientras simula. El color solo aparece cuando una lectura se acerca o pasa su límite.
 */
export function ElectricalMeasurements() {
  const { engine } = useEditor();
  const snapshot = useSnapshot();
  const running = useSimRunning();
  const tick = useSampleTick(running);
  const select = useUi((s) => s.select);
  const review = useMemo(
    () => electricalReview(snapshot, running ? engine.readings() : {}, running ? engine.pinCurrents() : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, running, engine, tick],
  );
  // Retención de pico, como un multímetro: el máximo observado y el peor estado se quedan, así un
  // circuito que cambia (contador, multiplexado) no hace que las barras vayan y vuelvan de cero.
  const peaks = useRef(new Map<string, { peak: number; worst: ElectricalMeasurement['state'] }>());
  const rows = useMemo<Held[]>(() => {
    if (!running) peaks.current.clear();
    return review.rows.map((row) => {
      const key = `${row.part}:${row.pin ?? row.quantity}`;
      const prev = peaks.current.get(key);
      const value = Math.abs(row.value) < FLOOR[row.quantity] ? 0 : Math.abs(row.value);
      const next = {
        peak: Math.max(prev?.peak ?? 0, value),
        worst: prev && RANK[prev.worst] > RANK[row.state] ? prev.worst : row.state,
      };
      peaks.current.set(key, next);
      return { ...row, ...next };
    });
  }, [review, running]);
  const groups = useMemo(() => {
    const order = new Map(snapshot.parts.map((p, i) => [p.id, i]));
    const map = new Map<string, { part: string; label: string; rows: Held[]; bases: string[] }>();
    for (const row of rows) {
      const g = map.get(row.part) ?? { part: row.part, label: row.label, rows: [], bases: [] };
      g.rows.push(row);
      if (!g.bases.includes(row.basis)) g.bases.push(row.basis);
      map.set(row.part, g);
    }
    const byName = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
    for (const g of map.values()) g.rows.sort((a, b) => byName(rowName(a), rowName(b)));
    return [...map.values()].sort((a, b) => (order.get(a.part) ?? 0) - (order.get(b.part) ?? 0));
  }, [rows, snapshot]);
  const errors = rows.filter((r) => r.worst === 'error').length;
  const warnings = rows.filter((r) => r.worst === 'warning').length;
  return (
    <section className="electrical-measurements" aria-label="Corrientes y potencia">
      <header className="diag-head">
        <div>
          <h2>Medidas</h2>
          <span>{running ? `${review.rows.length} lecturas · cada segundo` : 'Sin lecturas'}</span>
        </div>
        {running && review.rows.length > 0 && (
          <span className={`diag-status ${errors ? 'is-error' : warnings ? 'is-warning' : ''}`}>
            {errors ? `${errors} fuera de límite` : warnings ? `${warnings} cerca del límite` : 'Todo con margen'}
          </span>
        )}
      </header>
      {groups.length > 0 ? (
        <ul className="meas-list">
          {groups.map((g) => (
            <li key={g.part} className="meas-group">
              <button type="button" className="meas-part" onClick={() => select([g.part])} title="Localizar en el lienzo">
                {g.label}
              </button>
              {g.rows.map((row) => {
                const ratio = row.limit ? Math.min(1, Math.abs(row.value) / row.limit) : 0;
                const peak = row.limit ? Math.min(1, row.peak / row.limit) : 0;
                const showPeak = row.peak > 0 && row.peak > Math.abs(row.value) * 1.05;
                return (
                  <div key={`${row.pin ?? row.quantity}`} className="meas-row" data-state={row.worst} title={showPeak ? `Máximo observado: ${formatSI(row.peak, unit(row.quantity))}` : undefined}>
                    <span className="meas-name">{rowName(row)}</span>
                    <span className="meas-meter" aria-hidden>
                      <i style={{ transform: `scaleX(${ratio})` }} />
                      {showPeak && <em style={{ left: `${peak * 100}%` }} />}
                    </span>
                    <span className="meas-value" title={showPeak ? `Máximo observado: ${formatSI(row.peak, unit(row.quantity))}` : undefined}>
                      <b>{reading(row)}</b>
                      <small>{row.limit !== undefined ? ` / ${formatSI(row.limit, unit(row.quantity))}` : ' · sin límite'}</small>
                    </span>
                  </div>
                );
              })}
              {g.bases.map((b) => (
                <p key={b} className="meas-basis">{b}</p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="diag-quiet">Simula para ver corrientes y potencias. Cada pieza se localiza en el lienzo con un clic.</p>
      )}
      {review.pending.length > 0 && (
        <details className="electrical-pending">
          <summary>Pendiente de hardware · {review.pending.length}</summary>
          <ul>{review.pending.map((text) => <li key={text}>{text}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
