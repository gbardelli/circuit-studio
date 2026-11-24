// Worker de ngspice: el motor WASM (5,7 MB gz) vive aquí, nunca en el hilo principal.
import { runOp } from './ngspice';

self.onmessage = async (event: MessageEvent<{ id: number; netlist: string }>) => {
  const { id, netlist } = event.data;
  const op = await runOp(netlist);
  (self as unknown as Worker).postMessage({ id, op });
};
