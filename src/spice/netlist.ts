// Exportador a SPICE: convierte el circuito que resuelve el motor en una netlist de ngspice.
//
// Los dispositivos físicos (R, fuentes, C, diodos, BJT, MOSFET, pines del microcontrolador)
// escriben sus propias tarjetas con sus parámetros reales, así ngspice los resuelve con sus
// modelos, de forma independiente. Lo que es comportamiento (las salidas de un integrado
// lógico, un módulo I²C…) se exporta como su equivalente eléctrico exacto en el punto de
// operación: conductancias (VCCS «G») y fuentes de corriente («I») sacadas de su estampado.
import { Stamper, type Circuit } from '../core/solver';

export interface SpiceDeck {
  /** Cambia con cada reconstrucción del circuito. */
  id: number;
  netlist: string;
  /** Tensiones del motor propio en el punto de operación, por nodo. */
  ours: number[];
  /** Nombre legible de cada nodo (una patilla de la red), para el diagnóstico. */
  labels: string[];
  devices: number;
  behavioral: number;
}

export const spiceNode = (k: number) => (k < 0 ? '0' : `n${k}`);

const fmt = (x: number) => x.toPrecision(9);

export function toSpice(circuit: Circuit, id: number, labels: string[] = []): SpiceDeck {
  // Solo ASCII: ngspice se cuelga con bytes UTF-8 (incluso en el título).
  const lines: string[] = ['* CircuitStudio operating point'];
  let devices = 0, behavioral = 0, k = 0;
  const n = circuit.nodeCount;
  for (const el of circuit.elements) {
    const name = String(++k);
    if (el.spice) {
      lines.push(...el.spice(name, spiceNode));
      devices++;
      continue;
    }
    // Equivalente lineal en el punto de operación: G[r][c] es la corriente que sale de r por
    // voltio en c (VCCS de r a tierra controlada por V(c)); b[r] es corriente inyectada en r.
    const st = new Stamper(n, circuit.v, 0);
    el.stamp(st);
    let used = false;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const g = st.G[r * n + c];
        if (g === 0) continue;
        lines.push(`G${name}_${r}_${c} ${spiceNode(r)} 0 ${spiceNode(c)} 0 ${fmt(g)}`);
        used = true;
      }
      if (st.b[r] !== 0) {
        lines.push(`I${name}_${r} 0 ${spiceNode(r)} DC ${fmt(st.b[r])}`);
        used = true;
      }
    }
    if (used) behavioral++;
  }
  // Nodos que solo tocan condensadores o nada: SPICE exige un camino a tierra en continua.
  for (let i = 0; i < n; i++) lines.push(`RGMIN${i} ${spiceNode(i)} 0 1e12`);
  lines.push('.options gmin=1e-12 abstol=1e-12 reltol=1e-6 vntol=1e-7 itl1=300');
  lines.push('.op', '.end');
  return { id, netlist: lines.join('\n'), ours: Array.from(circuit.v), labels, devices, behavioral };
}
