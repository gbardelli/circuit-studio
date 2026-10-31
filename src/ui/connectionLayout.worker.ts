import type { CircuitSnapshot } from '../core/types';
import { readableConnections } from './readableConnections';

self.onmessage = (event: MessageEvent<CircuitSnapshot>) => {
  try { self.postMessage({ layout: readableConnections(event.data) }); }
  catch (e) { self.postMessage({ error: (e as Error).message }); }
};
