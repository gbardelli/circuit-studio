// Un integrado propio del modo diseño como pieza DIP virtual de la protoboard y del esquema: su
// función lógica es la simulación de su hoja. Alimentación como un 74HC (2–6 V), VCC en la última
// patilla y GND en la mitad, igual que la serie 74.
import { createElement, memo } from 'react';
import { chipDef, DipBody, type ChipSpec, type IO, type Level } from '../parts/chips';
import { setCustomParts } from '../parts';
import type { PartDef } from '../parts/types';
import { icSignals, pinName } from './elements';
import { LogicSim } from './sim';
import { IC_PREFIX, X, type LogicSheet } from './types';

export const DIP_SIZES = [8, 14, 16, 18, 20, 24, 28, 40];

/** Menor encapsulado DIP estándar con sitio para las señales, VCC y GND. */
export function packageSize(sheet: LogicSheet) {
  const need = icSignals(sheet).length + 2;
  const fit = DIP_SIZES.find((n) => n >= need) ?? Math.ceil(need / 2) * 2;
  return sheet.package >= fit && sheet.package % 2 === 0 ? sheet.package : fit;
}

/** Nombre de cada patilla del encapsulado, de la 1 a la N. */
export function packagePins(sheet: LogicSheet) {
  const signals = icSignals(sheet);
  const n = packageSize(sheet);
  const pins: { name: string; node: string | null }[] = Array.from({ length: n }, () => ({ name: 'NC', node: null }));
  pins[n / 2 - 1] = { name: 'GND', node: null };
  pins[n - 1] = { name: 'VCC', node: null };
  const free = pins.map((_, i) => i).filter((i) => i !== n / 2 - 1 && i !== n - 1);
  const names = uniqueNames(signals.map((s, i) => pinName(s, i)));
  signals.forEach((s, i) => (pins[free[i]] = { name: names[i], node: s.id }));
  return pins;
}

/** Los nombres repetidos no pueden ser patillas distintas: se numeran (A, A_2…). */
function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const name = raw.replace(/[^\wÁÉÍÓÚÑáéíóúñ/+-]/g, '_').toUpperCase() || 'P';
    const k = (seen.get(name) ?? 0) + 1;
    seen.set(name, k);
    return k === 1 && !['VCC', 'GND', 'NC'].includes(name) ? name : `${name}_${k}`;
  });
}

/** Problemas que impiden usar el integrado o que conviene corregir. */
export function icIssues(sheet: LogicSheet) {
  const issues: string[] = [];
  const signals = icSignals(sheet);
  if (!signals.some((n) => n.kind === 'in')) issues.push('Añade al menos una entrada: serán las patillas que lee el integrado.');
  if (!signals.some((n) => n.kind === 'out')) issues.push('Añade al menos una salida: serán las patillas que el integrado controla.');
  const unnamed = signals.filter((n) => !String(n.props.label ?? '').trim()).length;
  if (unnamed) issues.push(`${unnamed === 1 ? 'Una patilla no tiene' : `${unnamed} patillas no tienen`} nombre: se numerarán como P1, P2…`);
  const labels = signals.map((n) => String(n.props.label ?? '').trim().toUpperCase()).filter(Boolean);
  if (new Set(labels).size !== labels.length) issues.push('Hay patillas con el mismo nombre.');
  if (signals.length + 2 > 40) issues.push('Caben como mucho 38 señales en un DIP de 40 patillas.');
  return issues;
}

function spec(sheet: LogicSheet, lookup: (id: string) => LogicSheet | undefined): ChipSpec<{ sim: LogicSim | null }> {
  const pins = packagePins(sheet);
  const signals = icSignals(sheet);
  const kind = new Map(signals.map((s) => [s.id, s.kind]));
  const inputs = pins.filter((p) => p.node && kind.get(p.node) === 'in');
  const outputs = pins.filter((p) => p.node && kind.get(p.node) === 'out');
  return {
    type: `${IC_PREFIX}${sheet.id}`,
    part: sheet.part || 'CI-PROPIO',
    name: sheet.name || 'Integrado propio',
    family: 'Mis integrados',
    description: `${sheet.description ? `${sheet.description} ` : ''}Integrado virtual diseñado en el modo diseño: no existe como pieza comercial.`,
    keywords: ['propio', 'virtual', 'custom', 'diseño', sheet.name.toLowerCase()],
    pins: pins.map((p) => p.name),
    desc: Object.fromEntries(pins.filter((p) => p.node).map((p) => [p.name, `${kind.get(p.node!) === 'in' ? 'Entrada' : 'Salida'} ${p.name} del integrado propio`])),
    vcc: 'VCC',
    gnd: 'GND',
    outputs: outputs.map((p) => p.name),
    init: () => ({ sim: null }),
    evaluate(io: IO, s) {
      if (!s.sim) s.sim = new LogicSim(sheet, lookup);
      const sim = s.sim;
      inputs.forEach((p) => sim.setSource(p.node!, io.v(p.name) ? 1 : 0, false));
      sim.settle();
      return Object.fromEntries(
        outputs.map((p): [string, Level] => {
          const v = sim.value(p.node!, 'A');
          return [p.name, v === X ? null : v === 1];
        }),
      );
    },
  };
}

/** Encapsulado DIP con un contorno violeta discontinuo: se distingue de un integrado comercial. */
function virtualBody(count: number, part: string) {
  const w = (count / 2 - 1) * 10 + 10;
  return memo(function VirtualChip() {
    return createElement(
      'g',
      null,
      createElement(DipBody, { count, part, maker: 'VIRTUAL' }),
      createElement('rect', { x: -5.6, y: 2.4, width: w + 1.2, height: 25.2, rx: 2, fill: 'none', stroke: '#a78bfa', strokeWidth: 0.7, strokeDasharray: '2.4 1.6', opacity: 0.85 }),
    );
  });
}

/** Piezas DIP de los integrados propios de un proyecto. */
export function icParts(sheets: LogicSheet[]): PartDef[] {
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const lookup = (id: string) => byId.get(id);
  return sheets.filter((s) => s.kind === 'ic' && icSignals(s).length > 0).map((s) => {
    const chip = spec(s, lookup);
    return chipDef(chip, 'VIRTUAL', virtualBody(chip.pins.length, chip.part));
  });
}

/** Registra los integrados propios de un proyecto como piezas (no hace nada si no cambiaron). */
export function registerIcs(sheets: LogicSheet[] = []) {
  const ics = sheets.filter((s) => s.kind === 'ic');
  return setCustomParts(icParts(ics), ics.length ? JSON.stringify(ics) : '');
}
