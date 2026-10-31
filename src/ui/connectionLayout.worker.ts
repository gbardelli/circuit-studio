import type { CircuitSnapshot } from '../core/types';
import { compactConnections } from './connectionLayout';

self.onmessage = (event: MessageEvent<CircuitSnapshot>) => {
  try { self.postMessage({ layout: compactConnections(event.data) }); }
  catch (e) { self.postMessage({ error: (e as Error).message }); }
};
