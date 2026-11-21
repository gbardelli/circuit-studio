import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as THREE from 'three';
import type { PartData } from '../../core/types';
import type { Bounds, PartDef } from '../../parts/types';

/**
 * «Piel» de una pieza: su propio dibujo 2D rasterizado como textura de la cara superior.
 * Así cada placa o módulo del catálogo conserva sus rótulos, colores y detalles exactos del
 * documento, y el 3D añade encima solo el relieve (cabezales, conectores, chips).
 */
const cache = new Map<string, { tex: THREE.CanvasTexture; ready: Promise<void> }>();
let listeners: (() => void)[] = [];
/** Avisa al visor cuando termina de cargar alguna piel (para volver a dibujar). */
export function onSkinReady(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

function defsMarkup() {
  const defs = document.getElementById('g-chip')?.closest('defs');
  return defs ? defs.outerHTML : '';
}

/** Rasteriza el Render 2D de la pieza dentro de `area` (local). Devuelve una textura que se rellena en diferido. */
export function partSkin(def: PartDef, part: PartData, area: Bounds = def.bounds(part.props), opts: { omitPins?: boolean } = {}) {
  const key = `${def.type}|${JSON.stringify(part.props)}|${area.x},${area.y},${area.w},${area.h}|${opts.omitPins ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit.tex;
  const k = Math.min(8, 2048 / Math.max(area.w, area.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(4, Math.round(area.w * k));
  canvas.height = Math.max(4, Math.round(area.h * k));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.flipY = true;
  tex.userData.shared = true;
  const ready = (async () => {
    // Fuera del ciclo de React: flushSync no vacía si se llama desde un efecto.
    await new Promise((r) => setTimeout(r, 0));
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      const Render = def.Render;
      flushSync(() =>
        root.render(
          <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`} width={canvas.width} height={canvas.height}>
            <Render part={{ ...part, x: 0, y: 0, rot: 0 }} visual={null} preview />
          </svg>,
        ),
      );
      let svg = host.innerHTML;
      svg = svg.replace(/^<svg([^>]*)>/, `<svg$1>${defsMarkup()}`);
      // Los filtros de sombra del lienzo no tienen sentido en la cara de una pieza.
      svg = svg.replace(/filter="url\(#f-shadow\)"/g, '');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const g = canvas.getContext('2d')!;
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      tex.needsUpdate = true;
      listeners.forEach((f) => f());
    } catch {
      /* sin piel: el modelo queda con su color base */
    } finally {
      root.unmount();
    }
  })();
  cache.set(key, { tex, ready });
  return tex;
}

/** Cara superior con la piel: plano en (area) a la altura y, con UV 0..1. */
export function skinPlane(tex: THREE.Texture, area: Bounds, y: number, mat: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(area.w, area.h).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...mat }),
  );
  m.position.set(area.x + area.w / 2, y + 0.03, area.y + area.h / 2);
  m.receiveShadow = true;
  return m;
}
