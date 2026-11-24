// Verificación contra ngspice real: el punto de operación del motor propio debe coincidir con
// el que calcula SPICE nodo a nodo (1 mV o 0,5 %). Si un modelo se desvía, el despliegue falla.
import { describe, expect, it } from 'vitest';
import type { CircuitSnapshot, PartData, WireData } from '../core/types';
import { SimEngine } from '../sim/engine';
import { TEMPLATES } from '../collab/templates';
import { templateSnapshot } from '../collab/applyTemplate';
import { runOp } from './ngspice';
import { compare } from './verify';

function circuit(parts: PartData[], links: [string, string, string, string][]): CircuitSnapshot {
  const wires: WireData[] = links.map(([pa, a, pb, b], i) => ({ id: `w${i}`, a: { part: pa, pin: a, x: 0, y: 0 }, b: { part: pb, pin: b, x: 0, y: 0 }, points: [], color: '#000' }));
  return { parts, wires };
}
const part = (id: string, type: string, props: PartData['props'] = {}): PartData => ({ id, type, x: 0, y: 0, rot: 0, props });

async function check(snap: CircuitSnapshot) {
  const engine = new SimEngine();
  engine.update(snap);
  engine.start({ manual: true });
  const deck = engine.spice;
  expect(deck, 'el motor exporta el punto de operación').toBeTruthy();
  const result = compare(deck!, await runOp(deck!.netlist));
  engine.stop();
  return result;
}

describe('motor propio frente a ngspice (punto de operación)', () => {
  it('divisor de tensión con pila', async () => {
    const r = await check(circuit(
      [part('bat', 'battery-9v'), part('r1', 'resistor', { resistance: 1000 }), part('r2', 'resistor', { resistance: 2200 })],
      [['bat', '+', 'r1', '1'], ['r1', '2', 'r2', '1'], ['r2', '2', 'bat', '-']],
    ));
    expect(r.error).toBeNull();
    expect(r.state, JSON.stringify(r.off)).toBe('ok');
  }, 60_000);

  it('LED rojo con 470 Ω (diodo de Shockley)', async () => {
    const r = await check(circuit(
      [part('bat', 'battery-9v'), part('r1', 'resistor', { resistance: 470 }), part('d1', 'led', { color: 'red' })],
      [['bat', '+', 'r1', '1'], ['r1', '2', 'd1', 'A'], ['d1', 'K', 'bat', '-']],
    ));
    expect(r.state, JSON.stringify(r.off)).toBe('ok');
    expect(r.devices).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('transistor NPN como interruptor (Ebers-Moll)', async () => {
    const r = await check(circuit(
      [part('bat', 'battery-9v'), part('rb', 'resistor', { resistance: 10000 }), part('rc', 'resistor', { resistance: 1000 }), part('q', 'npn')],
      [['bat', '+', 'rb', '1'], ['rb', '2', 'q', 'B'], ['bat', '+', 'rc', '1'], ['rc', '2', 'q', 'C'], ['q', 'E', 'bat', '-']],
    ));
    expect(r.state, JSON.stringify(r.off)).toBe('ok');
  }, 60_000);

  it('MOSFET N encendido con su diodo de cuerpo (nivel 1)', async () => {
    const r = await check(circuit(
      [part('bat', 'battery-9v'), part('rd', 'resistor', { resistance: 220 }), part('m', 'mosfet-n')],
      [['bat', '+', 'rd', '1'], ['rd', '2', 'm', 'D'], ['bat', '+', 'm', 'G'], ['m', 'S', 'bat', '-']],
    ));
    expect(r.state, JSON.stringify(r.off)).toBe('ok');
  }, 60_000);

  // Todas las plantillas del catálogo: incluyen integrados lógicos (comportamiento exportado
  // como equivalente eléctrico), placas Arduino y fuentes.
  for (const t of TEMPLATES) {
    it(`plantilla «${t.name}»`, async () => {
      const r = await check(templateSnapshot(t));
      expect(r.error).toBeNull();
      expect(r.state, JSON.stringify(r.off.slice(0, 5))).toBe('ok');
    }, 60_000);
  }
});
