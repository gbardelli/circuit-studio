import { pinKey } from '../core/netlist';
import type { CircuitSnapshot } from '../core/types';
import { PARTS } from '../parts';

export interface ElectricalMeasurement {
  part: string;
  pin?: string;
  label: string;
  quantity: 'current' | 'power' | 'voltage';
  value: number;
  limit?: number;
  basis: string;
  state: 'measured' | 'warning' | 'error';
}

/** DC operating-point checks. Limits described as design budgets are not device ratings. */
export function electricalReview(snapshot: CircuitSnapshot, volts: Record<string, number>, currents: Map<string, number>) {
  const rows: ElectricalMeasurement[] = [];
  const pending = new Set<string>();
  if (snapshot.parts.some(part => PARTS[part.type]?.logic) && !snapshot.parts.some(part => part.type === 'capacitor-ceramic'))
    pending.add('No se detecta desacoplo cerámico. El modelo no verifica ruido ni transitorios de alimentación; revisa el desacoplo recomendado por los fabricantes para el montaje real.');
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  for (const part of snapshot.parts) {
    const def = PARTS[part.type];
    if (!def) continue;
    const props = { ...def.defaults, ...part.props };
    const label = String(props.label || def.partNumber || def.name);
    const v = (pin: string) => volts[pinKey(part.id, pin)];
    const i = (pin: string) => currents.get(pinKey(part.id, pin));
    const add = (row: Omit<ElectricalMeasurement, 'part' | 'label'>) => rows.push({ part: part.id, label, ...row });
    if (part.type === '74hc48') pending.add('74HC48: referencia y fabricante por confirmar. El modelo de 3,3 V no certifica un 74LS48 real.');
    if (part.type === 'ne555' && props.partNumber === 'TLC555') pending.add('Confirmar TLC555 CMOS en los dos relojes. Un NE555 bipolar no queda validado para 3,3 V por cambiar su etiqueta.');
    if (part.type === 'pushbutton') pending.add('El rebote mecánico y los retardos reales de propagación no están modelados. Verificar antirrebote y captura de llamadas con el hardware real.');
    if (def.mcu) pending.add('El consumo interno de la placa y de sus shields, los picos de arranque y la temperatura no están modelados.');
    if (part.type === 'resistor' && finite(v('1')) && finite(v('2'))) {
      const r = Number(props.resistance), limit = Number(props.power);
      if (r > 0 && limit > 0) {
        const value = (v('1') - v('2')) ** 2 / r;
        add({ quantity: 'power', value, limit, basis: 'Potencia nominal configurada; aviso desde el 50 % para reservar margen térmico.', state: value > limit ? 'error' : value > limit * .5 ? 'warning' : 'measured' });
      }
    }
    const ceramic = part.type === 'capacitor-ceramic';
    if ((part.type === 'capacitor' || ceramic) && finite(v(ceramic ? '1' : '+')) && finite(v(ceramic ? '2' : '-'))) {
      const signed = v(ceramic ? '1' : '+') - v(ceramic ? '2' : '-');
      const value = ceramic ? Math.abs(signed) : signed, limit = Number(props.voltage);
      add({ quantity: 'voltage', value, limit: limit > 0 ? limit : undefined, basis: ceramic ? 'Condensador sin polaridad. Aviso desde el 80 % de la tensión nominal.' : 'Tensión entre + y −. Inversión desde −0,3 V; aviso desde el 80 % de la tensión nominal.', state: value < -.3 || (limit > 0 && value > limit) ? 'error' : limit > 0 && value > .8 * limit ? 'warning' : 'measured' });
    }
    if (part.type === 'led' || part.type === 'seven-segment') {
      for (const pin of part.type === 'led' ? ['A'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']) {
        const measured = i(pin);
        if (!finite(measured)) continue;
        const configured = Number(props.maxCurrent), limit = configured > 0 ? configured : .02;
        add({ pin, quantity: 'current', value: Math.abs(measured), limit, basis: configured > 0 ? 'Corriente nominal configurada.' : 'Referencia orientativa de 20 mA por LED. Confirmar el datasheet del componente real.', state: Math.abs(measured) > limit ? 'error' : Math.abs(measured) > limit * .75 ? 'warning' : 'measured' });
      }
    }
    if (def.logic) {
      for (const pin of def.logic.outputs) {
        const measured = i(pin);
        if (!finite(measured)) continue;
        // Deliberately a conservative design target, never presented as an absolute maximum.
        const limit = .002;
        add({ pin, quantity: 'current', value: Math.abs(measured), limit, basis: 'Objetivo de diseño de 2 mA por salida; confirmar corriente garantizada y suma por encapsulado en su datasheet.', state: Math.abs(measured) > limit ? 'warning' : 'measured' });
      }
    }
    if (def.mcu) {
      for (const pin of def.mcu.pinIds) {
        const measured = i(pin);
        if (!finite(measured)) continue;
        add({ pin, quantity: 'current', value: Math.abs(measured), limit: .002, basis: 'Objetivo de carga externa de 2 mA por GPIO. No equivale al consumo total ni al máximo del microcontrolador.', state: Math.abs(measured) > .002 ? 'warning' : 'measured' });
      }
    }
  }
  rows.sort((a, b) => ({ error: 2, warning: 1, measured: 0 }[b.state] - { error: 2, warning: 1, measured: 0 }[a.state]) || b.value / (b.limit || 1) - a.value / (a.limit || 1));
  return { rows, pending: [...pending] };
}
