import { useMemo } from 'react';
import { electricalReview } from '../sim/electricalReview';
import { formatSI } from '../core/units';
import { useEditor, useSimStatus, useSnapshot } from './context';
import { useUi } from './store';

export function ElectricalMeasurements() {
  const { engine } = useEditor();
  const snapshot = useSnapshot(), status = useSimStatus();
  const select = useUi(s => s.select);
  const review = useMemo(() => electricalReview(snapshot, status.running ? engine.readings() : {}, status.running ? engine.pinCurrents() : new Map()), [snapshot, status, engine]);
  return <section className="electrical-measurements" aria-label="Corrientes y potencia">
    <div className="lab-section-head"><strong>Corrientes y potencia</strong><span>{status.running ? 'Punto de operación' : 'Sin lecturas'}</span></div>
    <p className="electrical-scope">Lecturas del modelo, no una certificación del montaje. No incluyen picos entre muestras, temperatura, tolerancias ni corriente transitoria de condensadores.</p>
    {review.pending.length > 0 && <details className="electrical-pending"><summary>Verificaciones pendientes del hardware</summary><ul>{review.pending.map(text => <li key={text}>{text}</li>)}</ul></details>}
    {review.rows.length > 0 ? <div className="electrical-table-scroll"><table>
      <caption className="sr-only">Valores instantáneos y límites de referencia de cada componente</caption>
      <thead><tr><th>Componente</th><th>Lectura</th><th>Referencia</th></tr></thead>
      <tbody>{review.rows.map(row => <tr key={`${row.part}:${row.pin ?? row.quantity}`} data-state={row.state}>
        <th scope="row"><button onClick={() => select([row.part])}>{row.label}{row.pin && <span>Pin {row.pin}</span>}</button></th>
        <td>{formatSI(row.value, row.quantity === 'power' ? 'W' : row.quantity === 'voltage' ? 'V' : 'A')}</td>
        <td><span>{row.limit !== undefined ? formatSI(row.limit, row.quantity === 'power' ? 'W' : row.quantity === 'voltage' ? 'V' : 'A') : 'Por confirmar'}</span><small>{row.basis}</small></td>
      </tr>)}</tbody>
    </table></div> : <p className="electrical-scope">Inicia la simulación para consultar las lecturas. Selecciona una fila para localizar la pieza.</p>}
  </section>;
}
