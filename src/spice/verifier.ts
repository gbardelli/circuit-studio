// Verificación continua con SPICE: cada punto de operación nuevo del motor propio se resuelve
// también con ngspice (en un worker, fuera del hilo principal) y se compara nodo a nodo.
// El motor se descarga solo la primera vez que hace falta y queda en caché del navegador.
import type { SpiceDeck } from './netlist';
import type { OpResult } from './ngspice';
import { compare, type SpiceCheck } from './verify';

export type SpiceState = { phase: 'idle' } | { phase: 'loading'; id: number } | { phase: 'done'; check: SpiceCheck };

class Verifier {
  state: SpiceState = { phase: 'idle' };
  private worker: Worker | null = null;
  private pending: SpiceDeck | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  lastDeck: SpiceDeck | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(state: SpiceState) {
    this.state = state;
    this.listeners.forEach((f) => f());
  }

  /** Cambios rápidos seguidos (arrastrar una pieza) se agrupan: solo cuenta el último. */
  submit(deck: SpiceDeck) {
    this.lastDeck = deck;
    this.pending = deck;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 300);
  }

  private async flush() {
    if (this.busy || !this.pending) return;
    const deck = this.pending;
    this.pending = null;
    this.busy = true;
    if (this.state.phase !== 'done') this.set({ phase: 'loading', id: deck.id });
    try {
      const op = await this.run(deck);
      this.set({ phase: 'done', check: compare(deck, op) });
    } catch (e) {
      this.set({ phase: 'done', check: compare(deck, { volts: {}, ms: 0, error: String(e) }) });
    } finally {
      this.busy = false;
      if (this.pending) void this.flush();
    }
  }

  private run(deck: SpiceDeck) {
    this.worker ??= new Worker(new URL('./spice.worker.ts', import.meta.url), { type: 'module', name: 'ngspice' });
    const worker = this.worker;
    return new Promise<OpResult>((resolve, reject) => {
      const onMessage = (e: MessageEvent<{ id: number; op: OpResult }>) => {
        if (e.data.id !== deck.id) return;
        worker.removeEventListener('message', onMessage);
        resolve(e.data.op);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', (e) => reject(e.message), { once: true });
      worker.postMessage({ id: deck.id, netlist: deck.netlist });
    });
  }
}

export const spiceVerifier = new Verifier();
