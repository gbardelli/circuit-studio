import { lazy } from 'react';

/** Instante del clic en «3D»: el visor mide desde aquí su primer fotograma. */
export const view3dClock = { clickedAt: 0 };

let chunk: Promise<typeof import('./three/Board3D')> | null = null;
/** Carga diferida del visor 3D; se llama también al pasar el cursor por el botón (precarga). */
export const load3d = () => (chunk ??= import('./three/Board3D'));

export const Board3D = lazy(load3d);
