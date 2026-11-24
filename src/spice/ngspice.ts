// ngspice real (WebAssembly, vía eecircuit-engine) con una sola instancia por hilo.
// Se carga a demanda: nunca entra en el arranque de la app.
import type { Simulation } from 'eecircuit-engine';

let instance: Promise<Simulation> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function engine() {
  instance ??= import('eecircuit-engine').then(async ({ Simulation }) => {
    const sim = new Simulation();
    await sim.start();
    return sim;
  });
  return instance;
}

export interface OpResult {
  /** Tensiones de nodo por nombre SPICE en minúsculas («n3»). */
  volts: Record<string, number>;
  ms: number;
  error: string | null;
}

/** Punto de operación con ngspice. Las ejecuciones se encolan: ngspice no es reentrante. */
export function runOp(netlist: string): Promise<OpResult> {
  const job = queue.then(async () => {
    const sim = await engine();
    const t0 = performance.now();
    sim.setNetList(netlist);
    try {
      const r = await sim.runSim();
      const volts: Record<string, number> = {};
      if (r.dataType === 'real')
        for (const d of r.data) {
          const m = /^v\((.+)\)$/i.exec(d.name);
          if (m) volts[m[1].toLowerCase()] = d.values[0];
        }
      const errors = sim.getError().filter((e) => !/^warning/i.test(e));
      return { volts, ms: performance.now() - t0, error: Object.keys(volts).length ? null : errors.join('\n') || 'ngspice no devolvió resultados' };
    } catch (e) {
      return { volts: {}, ms: performance.now() - t0, error: String(e) };
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
